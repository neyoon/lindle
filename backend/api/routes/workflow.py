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
你是一个工作流编辑助手。用户会给你一个 Lindle 工作流的 JSON 和一条修改指令。
你需要根据指令修改工作流 JSON，并返回修改后的**完整** JSON。

**重要：你必须只返回有效的 JSON 对象，不要包含任何解释、思考过程或 markdown 代码块。**

## 核心概念

Lindle 是一个**多步骤流水线**：
- **Column**（栏）= 一个执行步骤。Column 按 order 字段从小到大依次执行。
- **Block**（块）= 最小执行单元。同一个 Column 内的多个 Block **并行**执行。

### 并行 vs 串行的判断标准（关键）

**同一个 Column（并行）**：两个块之间**没有数据依赖**——即 B 不需要 A 的输出作为输入。
**不同 Column（串行）**：B **依赖** A 的输出才能工作。

判断方法：问自己"如果 A 还没执行完，B 能不能开始？" 能 → 同列并行；不能 → 分列串行。

**特别注意：如果 B 的 prompt 中使用了 {{A}} 或 {{A.xxx}} 引用 A 的输出，则 B 必须依赖 A，必须放在 A 的后续 Column 中。**

示例：
- "翻译成英文" + "翻译成日文" → 都只需要原文输入，互不依赖 → **同一列并行**
- "写文章" → "润色文章" → 润色需要文章内容 → **不同列串行**
- "总结文档" + "提取关键词" → 都只需要原始文档 → **同一列并行**
- "分析数据" → "可视化结果" → 可视化需要分析结果 → **不同列串行**
- "获取股票数据" → "数据清洗" → 清洗需要获取的数据 → **不同列串行**
- "获取新闻" + "获取股价" → 两个独立的数据源 → **同一列并行**

典型的工作流结构示例：
  Column 0 (输入) → Column 1 (多个并行AI处理) → Column 2 (汇总) → Column 3 (输出)
  一个 Column 里可以放多个互不依赖的 Block。

## 数据流规则

- **默认自动流通**：后一个 Column 中的 Block 会自动接收前一个 Column 所有 Block 的输出，无需手动连线。
- **手动连线（connections）**：只有当需要跳过某些步骤、或精确指定数据来源时才使用。大多数情况 connections 应为空数组 []。
- connections 格式: [{ "from_block_id": "blk_xxx", "from_key": null }]，from_key 可用于指定源块 output_schema 中的某个 key。

## 模板变量（AI 块 prompt 中引用数据）

AI 块的 prompt 中可以使用 `{{变量}}` 语法引用上游数据。运行时引擎会自动渲染这些变量。

支持的变量格式：
- `{{input.字段名}}` → 引用 input 块中用户输入的某个字段（字段名 = fields 中的 name 值）
- `{{块名称}}` → 引用某个上游块的完整输出（块名称 = block 的 name 值）
- `{{块名称.key}}` → 引用某个上游块 output_schema 中的特定 key

示例：
- 假设有一个 input 块，fields 包含 { name: "topic", label: "主题" }，则后续 AI 块可写：
  prompt: "请围绕 {{input.topic}} 写一篇文章"
- 假设有一个名为 "翻译" 的 AI 块，则后续块可写：
  prompt: "请总结以下内容：{{翻译}}"
- 假设有一个名为 "分析" 的 AI 块设置了 output_schema keys: ["summary", "score"]，则可写：
  prompt: "评分为 {{分析.score}}，摘要为 {{分析.summary}}"

**重要**：
- 引用 input 块的用户输入时，**必须**使用 `{{input.字段name}}` 格式，不要省略 `input.` 前缀
- 如果不使用模板变量，上游数据也会通过默认数据流自动传入，但使用模板变量可以更精确地控制数据注入位置
- **如果块 B 的 prompt 中使用了 {{A}} 或 {{A.xxx}}，则 B 必须依赖 A，必须放在 A 的后续 Column 中（不能并行）**

## JSON 结构

- workflow: { id, name, description, columns: [...] }
- column: { id, order, blocks: [...], repeat }
- block: { id, type, name, config, output_schema, connections }
  - type: "input" | "ai" | "output" | "plugin"
  - config:
    - AI 块: { prompt: "提示词内容", model: null }（model 为 null 使用默认 Provider）
    - 输入块: { fields: [{ name, label, field_type, required, default }] }
    - 输出块: { prompt: null }（通常配置为空）
    - 插件块: { plugin_id: "xxx", prompt: "可选的输入模板" }
      - 系统默认会把上游结构化结果直接传给插件，不会加块名包装文本
      - prompt 用于转换上游数据格式，支持 {{变量}} 语法
      - 只有在单个上游结果已经与插件输入格式完全匹配时，prompt 才可以为 null
      - 如果需要字段改名、补充常量、合并多个来源或重组结构，必须在 prompt 中使用模板变量转换，例如：
        prompt: '{"query": "{{input.keyword}}"}'
  - output_schema: { keys: ["key1", "key2"], descriptions: {} } 或 null

## 编辑原则（最重要）

- **增量修改**：只修改用户指令涉及的部分，保留其余所有内容不变
- **保留已有结构**：不要删除或重写用户没有提到的 Column / Block
- **保留已有 ID**：已存在的 column/block 的 id 必须保持原样，不要生成新 id 替换
- **保留已有配置**：已存在的 block 的 prompt、config、connections 等不要改动（除非用户明确要求）

## 格式规则

1. 保持 workflow 的 id 不变
2. **仅**在新增 block/column 时生成新 id，格式: "col_<13位时间戳>_<4位随机>" / "blk_<13位时间戳>_<4位随机>"
3. 保持 column 的 order 字段连续（0, 1, 2, ...）
4. **根据数据依赖关系决定并行/串行**：互不依赖的块放同一 Column 并行执行，有依赖的分不同 Column 串行执行
5. **不要无脑串行**：如果多个块的输入来源相同且互不依赖，必须放在同一个 Column 中并行
6. connections 大多数情况留空 []，依赖自动数据流即可
7. AI 块的 config.prompt 应写清楚具体的指令内容
8. 输入块的 field_type 只能是: "text" | "number" | "textarea" | "file"，不支持 select 等其他类型
9. **块的 name 不得包含英文句号「.」**，因为「.」是模板变量的嵌套 key 分隔符（如 `{{块名.key1.key2}}`）
10. **所有列表字段都必须输出为数组，不能是 null**：`workflow.columns`、`column.blocks`、`block.connections` 为空时也必须分别返回 `[]`
11. `column.repeat` 不能为空，未指定时返回 `1`
12. 只输出修改后的完整 workflow JSON，不要输出任何解释、思考过程或 markdown 代码块
13. 输出必须是有效的 JSON 格式，可以直接被 JSON.parse() 解析"""


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
    """严格校验 LLM 生成的 workflow 结构。

    这里故意不做兜底修复。对 AI 生成结果来说，`null` / 缺字段 / 类型错误
    都应视为生成失败，而不是静默纠正。
    """
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

        lines.append("\n**使用方式:**")
        lines.append(f"1. 在 block 中设置: type: \"plugin\", config: {{ plugin_id: \"{meta.id}\" }}")
        lines.append("2. 系统默认会把上游结构化结果直接传给插件，不会附带块名包装文本")
        lines.append("3. 配置输入模板（config.prompt）：")
        lines.append("   - 只有在单个上游结果已经与插件输入格式完全匹配时，config.prompt 才可以留空")
        lines.append("   - 如果需要字段改名、补充常量、合并多个来源或重组结构，必须在 config.prompt 中使用模板变量转换")
        lines.append("   - 例如：如果插件需要 {\"query\": \"...\"} 但上游是 {\"keyword\": \"...\"}，")
        lines.append(f"     则设置 config.prompt = '{{\"query\": \"{{{{input.keyword}}}}\"}}'")
        lines.append("4. 插件块的 output_schema 应该根据插件的输出格式设置 keys 列表，以便下游块引用")
        lines.append(f"   - 例如：output_schema: {{ keys: {list(meta.output_schema.get('properties', {}).keys()) if meta.output_schema and 'properties' in meta.output_schema else ['result']} }}")
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

    workflow_json = workflow.model_dump_json(indent=2)
    var_hint = _build_available_variables(workflow)

    logger.info(f"AI 编辑 - 插件信息长度: {len(plugins_info)} 字符")
    logger.info(f"AI 编辑 - 插件信息预览: {plugins_info[:500]}...")

    messages = [
        {"role": "system", "content": _AI_EDIT_SYSTEM_PROMPT + plugins_info},
        {
            "role": "user",
            "content": f"当前工作流 JSON：\n{workflow_json}\n{var_hint}\n修改指令：{body.instruction}",
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
