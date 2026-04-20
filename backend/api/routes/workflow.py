"""
工作流 CRUD API + 描述导出 + AI 编辑
"""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from exporters import build_workflow_description, build_workflow_export
from flow.canonical import canonicalize_workflow
from flow.execution_plan import compile_execution_plan
from flow.flowspec import FlowSpec, workflow_to_flowspec
from flow.materialize import materialize_flowspec
from flow.models import BlockType, Workflow
from flow.validation import WorkflowValidationError, ensure_valid_workflow
from plugins.base import describe_json_schema
from storage.file_store import delete_workflow, list_workflows, load_workflow, save_workflow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class WorkflowSummary(BaseModel):
    id: str
    name: str
    description: str
    column_count: int


@router.get("/", response_model=list[WorkflowSummary])
async def get_workflows():
    """获取所有工作流列表"""
    return list_workflows()


@router.get("/{workflow_id}", response_model=Workflow)
async def get_workflow(workflow_id: str):
    """获取单个工作流详情"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return workflow


@router.get("/{workflow_id}/flowspec")
async def get_workflow_flowspec(workflow_id: str):
    """获取工作流的 FlowSpec 视图。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return workflow_to_flowspec(workflow)


@router.get("/{workflow_id}/canonical")
async def get_workflow_canonical(workflow_id: str):
    """获取工作流的 CanonicalFlow 视图。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return canonicalize_workflow(workflow)


@router.get("/{workflow_id}/execution-plan")
async def get_workflow_execution_plan(workflow_id: str):
    """获取工作流的 ExecutionPlan 视图。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    canonical = canonicalize_workflow(workflow)
    return compile_execution_plan(canonical)


@router.post("/", response_model=Workflow)
async def create_workflow(workflow: Workflow):
    """创建工作流"""
    _raise_if_invalid(workflow)
    save_workflow(workflow)
    return workflow


@router.put("/{workflow_id}", response_model=Workflow)
async def update_workflow(workflow_id: str, workflow: Workflow):
    """更新工作流"""
    existing = load_workflow(workflow_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    workflow.id = workflow_id
    _raise_if_invalid(workflow)
    save_workflow(workflow)
    return workflow


@router.delete("/{workflow_id}")
async def remove_workflow(workflow_id: str):
    """删除工作流"""
    if not delete_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="工作流不存在")
    return {"message": "已删除"}


# ===== 描述导出（LLM 友好格式）=====


@router.get("/{workflow_id}/describe")
async def describe_workflow(workflow_id: str):
    """导出工作流的 LLM 友好文本描述

    将工作流转换为结构化的自然语言描述，
    方便直接复制粘贴给大模型理解整个流程。
    """
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")

    description = build_workflow_description(workflow)
    return {"description": description}


@router.get("/{workflow_id}/export")
async def export_workflow(workflow_id: str):
    """导出工作流结构化清单。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return build_workflow_export(workflow)


# ===== AI 编辑 =====

_AI_EDIT_SYSTEM_PROMPT = """\
你是一个工作流编辑助手。用户会给你一个 Lindle FlowSpec JSON 和一条修改指令。
你需要根据指令修改 FlowSpec JSON，并返回修改后的**完整** JSON。

**重要：你必须只返回有效的 JSON 对象，不要包含任何解释、思考过程或 markdown 代码块。**

## 核心概念

Lindle 的 AI 创建链路先产生 **FlowSpec**，它表达“主步骤、依赖和意图”，不是最终执行 JSON。
系统之后会把 FlowSpec 收敛成可编辑、可执行的结构。

## FlowSpec 结构

顶层结构：
- `workflow_id`: 工作流 ID，必须保持不变
- `name`: 工作流名称
- `description`: 工作流描述
- `goal`: 整体目标
- `inputs`: 输入字段列表
- `outputs`: 输出定义列表
- `steps`: 主步骤列表
- `stop_on_error`: 布尔值
- `meta`: 对象，可保留已有内容

输入项结构：
- `{ "input_ref", "name", "label", "field_type", "required", "default" }`

输出项结构：
- `{ "output_ref", "name", "source_step_refs": [] }`

步骤结构：
- `step_ref`: 稳定步骤引用，已有步骤必须保持不变
- `title`: 步骤显示名称
- `type`: `"input" | "ai" | "output" | "plugin"`
- `purpose`: 这一步要完成什么
- `depends_on`: 依赖的上游 `step_ref` 列表
- `plugin_id`: plugin 步骤必填
- `output_contract`: 输出结构摘要，可为 `{}`，例如 `{ "keys": ["summary", "score"], "descriptions": { "summary": "摘要" } }`
- `prompt`: AI / plugin 步骤可用
- `input_refs`: input 步骤引用的输入字段
- `source_block_id`: 旧结构来源块 ID，已有步骤必须保持不变
- `source_column_id`: 旧结构来源列 ID，已有步骤必须保持不变
- `repeat`: 当前步骤所在阶段的 repeat
- `order_hint`: 当前步骤所在阶段的大致顺序

## 并行 vs 串行判断标准

问自己一句话：
“如果 A 还没执行完，B 能不能开始？”

- 能开始：并行，不要写依赖
- 不能开始：串行，B 必须把 A 写进 `depends_on`

特别注意：
- 如果步骤 B 的 prompt 中使用了 `{{A}}` 或 `{{A.xxx}}` 引用 A 的结果，则 B 必须依赖 A
- 多个互不依赖、只共享同一输入来源的步骤，应并行存在，不要无脑串行展开

## 数据流与模板变量

支持的变量格式：
- `{{input.字段名}}` → 引用 input 块中用户输入的某个字段（字段名 = fields 中的 name 值）
- `{{步骤名称}}` → 引用某个上游步骤的完整输出
- `{{步骤名称.key}}` → 引用某个上游步骤 output_contract 中的特定 key

示例：
- 假设有一个 input 步骤，fields 包含 { name: "topic", label: "主题" }，则后续 AI 步骤可写：
  prompt: "请围绕 {{input.topic}} 写一篇文章"
- 假设有一个名为 "翻译" 的 AI 步骤，则后续步骤可写：
  prompt: "请总结以下内容：{{翻译}}"
- 假设有一个名为 "分析" 的 AI 步骤设置了 output_contract keys: ["summary", "score"]，则可写：
  prompt: "评分为 {{分析.score}}，摘要为 {{分析.summary}}"

**重要**：
- 引用 input 用户输入时，必须使用 `{{input.字段name}}`
- 如果步骤 B 的 prompt 中使用了 `{{A}}` 或 `{{A.xxx}}`，则 B 必须依赖 A

## Plugin 步骤

- `type` 必须是 `"plugin"`
- `plugin_id` 必填
- `plugin_input_bindings` 优先作为字段映射式配置
- 如果单个上游结果已经与插件输入格式完全匹配，`prompt` 可以为 null
- 如果需要字段改名、补常量、合并多个来源或重组结构，必须在 `prompt` 中用模板变量做转换
- plugin 的 `output_contract` 应反映插件输出结构，便于后续引用

## 编辑原则（最重要）

- **增量修改**：只修改用户指令涉及的部分，保留其余所有内容不变
- **保留已有步骤引用**：已存在的 `step_ref` / `source_block_id` / `source_column_id` 必须保持原样
- **保留已有配置**：已存在步骤的 `prompt` / `plugin_id` / `depends_on` / `output_contract` 不要随意改动
- **优先表达主步骤**：不要输出引擎细节，不要人为拆出“只是格式适配”的隐式步骤
- **只有改变用户可理解语义的工作才应成为独立步骤**

## 格式规则

1. 保持 `workflow_id` 不变
2. 仅在新增步骤时生成新的 `step_ref` / `source_block_id` / `source_column_id`
3. 新增 ID 格式：
   - `step_<语义化名称>`
   - `blk_<13位时间戳>_<4位随机>`
   - `col_<13位时间戳>_<4位随机>`
4. `field_type` 只能是 `"text" | "number" | "textarea" | "file"`
5. 步骤 `title` 不得包含英文句号 `.`
6. 所有列表字段必须输出为数组，不能是 null
7. `repeat` 未指定时返回 `1`
8. `order_hint` 要能反映大致顺序，从 0 开始
9. 只输出完整 FlowSpec JSON，不要输出任何解释、思考过程或 markdown 代码块
10. 输出必须是有效 JSON，可直接被 JSON.parse() 解析"""


class AIEditRequest(BaseModel):
    instruction: str


def _strip_json_wrapper(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return text


def _validate_generated_workflow_payload(data: object) -> None:
    if not isinstance(data, dict):
        raise ValueError("AI 生成失败：顶层必须是 JSON 对象")

    columns = data.get("columns")
    if columns is None:
        raise ValueError("AI 生成失败：workflow.columns 不能为空")
    if not isinstance(columns, list):
        raise ValueError("AI 生成失败：workflow.columns 必须是数组")

    for index, column in enumerate(columns):
        if not isinstance(column, dict):
            raise ValueError(f"AI 生成失败：columns[{index}] 必须是对象")

        if "blocks" not in column:
            raise ValueError(f"AI 生成失败：columns[{index}].blocks 缺失")
        if column["blocks"] is None:
            raise ValueError(f"AI 生成失败：columns[{index}].blocks 不能为 null")
        if not isinstance(column["blocks"], list):
            raise ValueError(f"AI 生成失败：columns[{index}].blocks 必须是数组")

        if "repeat" not in column:
            raise ValueError(f"AI 生成失败：columns[{index}].repeat 缺失")
        if column["repeat"] is None:
            raise ValueError(f"AI 生成失败：columns[{index}].repeat 不能为 null")
        if not isinstance(column["repeat"], int):
            raise ValueError(f"AI 生成失败：columns[{index}].repeat 必须是整数")

        for block_index, block in enumerate(column["blocks"]):
            if not isinstance(block, dict):
                raise ValueError(f"AI 生成失败：columns[{index}].blocks[{block_index}] 必须是对象")
            if "connections" in block and block["connections"] is None:
                raise ValueError(f"AI 生成失败：columns[{index}].blocks[{block_index}].connections 不能为 null")
            if "connections" in block and not isinstance(block["connections"], list):
                raise ValueError(f"AI 生成失败：columns[{index}].blocks[{block_index}].connections 必须是数组")


def _validate_generated_flowspec_payload(data: object) -> None:
    if not isinstance(data, dict):
        raise ValueError("AI 生成失败：顶层必须是 JSON 对象")

    steps = data.get("steps")
    if steps is None:
        raise ValueError("AI 生成失败：FlowSpec.steps 不能为空")
    if not isinstance(steps, list):
        raise ValueError("AI 生成失败：FlowSpec.steps 必须是数组")

    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            raise ValueError(f"AI 生成失败：steps[{index}] 必须是对象")
        for key in ("depends_on", "input_refs"):
            if key in step and step[key] is None:
                raise ValueError(f"AI 生成失败：steps[{index}].{key} 不能为 null")
            if key in step and not isinstance(step[key], list):
                raise ValueError(f"AI 生成失败：steps[{index}].{key} 必须是数组")
        if "repeat" in step and step["repeat"] is None:
            raise ValueError(f"AI 生成失败：steps[{index}].repeat 不能为 null")
        if "repeat" in step and not isinstance(step["repeat"], int):
            raise ValueError(f"AI 生成失败：steps[{index}].repeat 必须是整数")

    for field_name in ("inputs", "outputs"):
        if field_name in data and data[field_name] is None:
            raise ValueError(f"AI 生成失败：FlowSpec.{field_name} 不能为 null")
        if field_name in data and not isinstance(data[field_name], list):
            raise ValueError(f"AI 生成失败：FlowSpec.{field_name} 必须是数组")


def _parse_generated_workflow(text: str, workflow_id: str) -> Workflow:
    text = _strip_json_wrapper(text)

    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end <= start:
        raise ValueError("AI 生成失败：返回内容中未找到有效 JSON")

    try:
        parsed = json.loads(text[start:end])
    except json.JSONDecodeError as e:
        raise ValueError(f"AI 生成失败：返回的工作流 JSON 不合法（{e.msg}，位置 {e.pos}）") from e

    if "steps" in parsed:
        _validate_generated_flowspec_payload(parsed)
        parsed["workflow_id"] = workflow_id
        try:
            spec = FlowSpec.model_validate(parsed)
        except Exception as e:
            raise ValueError(f"AI 生成失败：FlowSpec 结构校验未通过（{e}）") from e
        workflow = materialize_flowspec(spec)
    else:
        _validate_generated_workflow_payload(parsed)
        parsed["id"] = workflow_id
        try:
            workflow = Workflow.model_validate(parsed)
        except Exception as e:
            raise ValueError(f"AI 生成失败：工作流结构校验未通过（{e}）") from e
    try:
        ensure_valid_workflow(workflow)
    except WorkflowValidationError as e:
        raise ValueError(f"AI 生成失败：工作流业务校验未通过（{'; '.join(issue.message for issue in e.issues)}）") from e
    return workflow


def _raise_if_invalid(workflow: Workflow) -> None:
    try:
        ensure_valid_workflow(workflow)
    except WorkflowValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "工作流校验未通过",
                "issues": [
                    {"code": issue.code, "message": issue.message, "path": issue.path}
                    for issue in exc.issues
                ],
            },
        ) from exc


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _build_available_variables(workflow: Workflow) -> str:
    """从当前 workflow 中提取所有可在 AI 块 prompt 中引用的模板变量"""
    variables: list[str] = []
    columns = sorted(workflow.columns, key=lambda c: c.order)
    for col in columns:
        for block in col.blocks:
            if block.type == BlockType.INPUT and block.config.fields:
                for field in block.config.fields:
                    ref = "{{input." + field.name + "}}"
                    label = field.label or field.name
                    variables.append(f"  - `{ref}`  ← 用户输入「{label}」")
            else:
                ref = "{{" + block.name + "}}"
                variables.append(f"  - `{ref}`  ← 块「{block.name}」的完整输出")
                if block.output_schema and block.output_schema.keys:
                    for key in block.output_schema.keys:
                        key_ref = "{{" + block.name + "." + key + "}}"
                        variables.append(f"  - `{key_ref}`  ← 块「{block.name}」的 {key}")
    if not variables:
        return ""
    return "\n当前工作流中可用的模板变量：\n" + "\n".join(variables) + "\n"


def _build_plugins_info() -> str:
    """构建已启用插件的信息，供 AI 编辑时参考"""
    from plugins.registry import get_enabled_plugins, get_plugin

    enabled = get_enabled_plugins()
    if not enabled:
        return ""

    lines = ["\n\n## 可用插件\n"]
    lines.append("以下插件已启用，可以在工作流中使用（type: \"plugin\"）：\n")

    for plugin_info in enabled:
        plugin_id = plugin_info["id"]
        plugin = get_plugin(plugin_id)
        if not plugin:
            continue

        meta = plugin.meta
        lines.append(f"\n### {meta.name} (plugin_id: \"{meta.id}\")")
        lines.append(f"描述: {meta.description}")

        input_summary = describe_json_schema(meta.input_schema)
        if input_summary:
            lines.append("\n**输入要求摘要：**")
            lines.append(input_summary)

        # 输入格式
        if meta.input_schema:
            lines.append("\n**输入格式:**")
            lines.append("```json")
            lines.append(json.dumps(meta.input_schema, ensure_ascii=False, indent=2))
            lines.append("```")

        # 输出格式
        if meta.output_schema:
            output_summary = describe_json_schema(meta.output_schema)
            if output_summary:
                lines.append("\n**输出摘要：**")
                lines.append(output_summary)
            lines.append("\n**输出格式:**")
            lines.append("```json")
            lines.append(json.dumps(meta.output_schema, ensure_ascii=False, indent=2))
            lines.append("```")

        lines.append("\n**在 FlowSpec 中的使用方式:**")
        lines.append(f"1. 新增一个 step，设置: type: \"plugin\", plugin_id: \"{meta.id}\"")
        lines.append("2. 系统默认会把上游结构化结果直接传给插件，不会附带步骤名包装文本")
        lines.append("3. 优先使用字段映射（plugin_input_bindings）表达插件输入来源")
        lines.append("   - 例如：plugin_input_bindings: {\"query\": {\"kind\": \"variable\", \"value\": \"input.keyword\"}}")
        lines.append("4. 只有在字段映射不足以表达复杂重组时，才使用 step.prompt")
        lines.append("   - 例如：如果需要把多个来源组合成复杂 JSON，才设置 step.prompt")
        lines.append(f"     step.prompt = '{{\"query\": \"{{{{input.keyword}}}}\"}}'")
        lines.append("5. 插件步骤的 output_contract 应根据插件输出格式设置 keys 列表，以便下游步骤引用")
        lines.append(f"   - 例如：output_contract: {{ keys: {list(meta.output_schema.get('properties', {}).keys()) if meta.output_schema and 'properties' in meta.output_schema else ['result']} }}")
        lines.append("")

    return "\n".join(lines)


@router.post("/{workflow_id}/ai-edit")
async def ai_edit_workflow(workflow_id: str, body: AIEditRequest):
    """用自然语言指令修改工作流（SSE 流式返回）"""
    from api.routes.settings import get_ai_edit_provider
    from shared_llm import _config
    from plugins.registry import get_enabled_plugins, get_plugin

    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")

    provider = get_ai_edit_provider()
    if provider and provider.get("api_key"):
        api_key = provider["api_key"]
        base_url = provider.get("base_url", "https://api.openai.com/v1")
        model = provider.get("model", "gpt-4o-mini")
    elif _config.api_key:
        api_key, base_url, model = _config.api_key, _config.base_url, _config.default_model
    else:
        raise HTTPException(status_code=400, detail="未配置 AI 编辑 Provider")

    # 构建插件信息
    plugins_info = _build_plugins_info()

    flowspec_json = workflow_to_flowspec(workflow).model_dump_json(indent=2)
    var_hint = _build_available_variables(workflow)

    logger.info(f"AI 编辑 - 插件信息长度: {len(plugins_info)} 字符")
    logger.info(f"AI 编辑 - 插件信息预览: {plugins_info[:500]}...")

    messages = [
        {"role": "system", "content": _AI_EDIT_SYSTEM_PROMPT + plugins_info},
        {
            "role": "user",
            "content": f"当前 FlowSpec JSON：\n{flowspec_json}\n{var_hint}\n修改指令：{body.instruction}",
        },
    ]

    async def event_stream():
        full_text = ""
        reasoning_text = ""
        try:
            # 使用 shared_llm 的全局客户端，避免创建新的 httpx 客户端
            from shared_llm import _get_client

            client = _get_client()

            # 检查是否是支持 reasoning 的模型（如 o1 系列）
            is_reasoning_model = "o1" in model.lower() or "o3" in model.lower()

            request_body = {
                "model": model,
                "messages": messages,
                "temperature": 0.3,
                "stream": True,
            }

            # 非 reasoning 模型使用 response_format 强制 JSON
            if not is_reasoning_model:
                request_body["response_format"] = {"type": "json_object"}

            async with client.stream(
                "POST",
                f"{base_url}/chat/completions",
                json=request_body,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    try:
                        chunk = json.loads(line[6:])
                        delta = chunk["choices"][0].get("delta", {})

                        # 处理 reasoning 内容（思考过程）
                        if reasoning := delta.get("reasoning_content"):
                            reasoning_text += reasoning
                            yield _sse("thinking", {"text": reasoning})

                        # 处理实际内容（JSON 结果）
                        if content := delta.get("content"):
                            full_text += content
                            yield _sse("delta", {"text": content})
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

            updated = _parse_generated_workflow(full_text, workflow_id)
            save_workflow(updated)
            yield _sse("done", json.loads(updated.model_dump_json()))

        except httpx.HTTPStatusError as e:
            yield _sse("error", {"message": f"LLM API 错误: {e.response.status_code}"})
        except ValueError as e:
            logger.error("AI 编辑结果校验失败: %s", e)
            yield _sse("error", {"message": str(e)})
        except Exception as e:
            logger.error("AI 编辑失败: %s", e)
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
