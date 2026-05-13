"""
工作流编辑支持逻辑。

这一层负责 FlowSpec prompt、LLM 流式调用、生成结果解析和校验。
路由文件只保留 HTTP 入口，避免 workflow.py 同时承担 CRUD 和 AI 编排。
"""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from flow.flowspec import FlowSpec, workflow_to_flowspec
from flow.materialize import materialize_flowspec
from flow.models import BlockType, Workflow
from flow.validation import WorkflowValidationError, ensure_valid_workflow
from plugins.base import describe_json_schema
from storage.file_store import load_workflow, save_workflow

logger = logging.getLogger(__name__)


_EDIT_SYSTEM_PROMPT = """\
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
- `type`: `"collect" | "process" | "result" | "tool"`
- `purpose`: 这一步要完成什么
- `depends_on`: 依赖的上游 `step_ref` 列表
- `plugin_id`: tool 步骤必填
- `model`: process 步骤使用的模型/provider ID，已有值必须保留
- `plugin_input_bindings`: tool 步骤的字段映射配置，已有值必须保留
- `input_bindings`: 精确输入来源列表，形如 `{ "step_ref": "analysis", "from_key": "summary" }`，用于保留“只接收某个输出字段”的配置
- `output_contract`: 输出结构摘要，可为 `{}`，例如 `{ "keys": ["summary", "score"], "descriptions": { "summary": "摘要" } }`
- `prompt`: process / tool 步骤可用
- `input_refs`: collect 步骤引用的输入字段
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
- 如果步骤 B 的 prompt 中使用了 `{{steps.A}}` 或 `{{steps.A.xxx}}` 引用 A 的结果，则 B 必须依赖 A
- 多个互不依赖、只共享同一输入来源的步骤，应并行存在，不要无脑串行展开

## 数据流与模板变量

支持的变量格式：
- `{{inputs.字段名}}` → 引用 collect 步骤中用户输入的某个字段（字段名 = fields 中的 name 值）
- `{{steps.step_ref}}` → 引用某个上游步骤的完整输出
- `{{steps.step_ref.key}}` → 引用某个上游步骤 output_contract 中的特定 key

示例：
- 假设有一个 collect 步骤提供字段 { name: "topic", label: "主题" }，则后续 process 步骤可写：
  prompt: "请围绕 {{inputs.topic}} 写一篇文章"
- 假设有一个 step_ref 为 "draft_en" 的 process 步骤，则后续步骤可写：
  prompt: "请总结以下内容：{{steps.draft_en}}"
- 假设有一个 step_ref 为 "analysis" 的 process 步骤设置了 output_contract keys: ["summary", "score"]，则可写：
  prompt: "评分为 {{steps.analysis.score}}，摘要为 {{steps.analysis.summary}}"

**重要**：
- 引用输入时，必须使用 `{{inputs.字段name}}`
- 引用步骤结果时，必须使用 `{{steps.step_ref}}` 或 `{{steps.step_ref.xxx}}`
- 如果步骤 B 的 prompt 中使用了 `{{steps.A}}` 或 `{{steps.A.xxx}}`，则 B 必须依赖 A

## Plugin 步骤

- `type` 必须是 `"tool"`
- `plugin_id` 必填
- `plugin_input_bindings` 优先作为字段映射式配置
- 如果已有 `input_bindings` 指定了 `from_key`，必须保留这个精确字段选择，除非用户明确要求改数据来源
- 如果单个上游结果已经与插件输入格式完全匹配，`prompt` 可以为 null
- 如果需要字段改名、补常量、合并多个来源或重组结构，必须在 `prompt` 中用模板变量做转换
- plugin 的 `output_contract` 应反映插件输出结构，便于后续引用

## 编辑原则（最重要）

- **增量修改**：只修改用户指令涉及的部分，保留其余所有内容不变
- **保留已有步骤引用**：已存在的 `step_ref` / `source_block_id` / `source_column_id` 必须保持原样
- **保留已有配置**：已存在步骤的 `prompt` / `model` / `plugin_id` / `plugin_input_bindings` / `depends_on` / `input_bindings` / `output_contract` 不要随意改动
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


class EditRequest(BaseModel):
    instruction: str


def parse_generated_workflow(text: str, workflow_id: str) -> Workflow:
    text = _strip_json_wrapper(text)

    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end <= start:
        raise ValueError("编辑生成失败：返回内容中未找到有效 JSON")

    try:
        parsed = json.loads(text[start:end])
    except json.JSONDecodeError as e:
        raise ValueError(f"编辑生成失败：返回的工作流 JSON 不合法（{e.msg}，位置 {e.pos}）") from e

    _validate_generated_flowspec_payload(parsed)
    parsed["workflow_id"] = workflow_id
    try:
        spec = FlowSpec.model_validate(parsed)
    except Exception as e:
        raise ValueError(f"编辑生成失败：FlowSpec 结构校验未通过（{e}）") from e
    workflow = materialize_flowspec(spec)
    try:
        ensure_valid_workflow(workflow)
    except WorkflowValidationError as e:
        raise ValueError(f"编辑生成失败：工作流业务校验未通过（{'; '.join(issue.message for issue in e.issues)}）") from e
    return workflow


async def stream_edit_workflow(workflow_id: str, body: EditRequest) -> StreamingResponse:
    from api.routes.settings import get_edit_provider
    from shared_llm import _config

    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")

    provider = get_edit_provider()
    if provider and provider.get("api_key"):
        api_key = provider["api_key"]
        base_url = provider.get("base_url", "https://api.openai.com/v1")
        model = provider.get("model", "gpt-4o-mini")
    elif _config.api_key:
        api_key, base_url, model = _config.api_key, _config.base_url, _config.default_model
    else:
        raise HTTPException(status_code=400, detail="未配置编辑 Provider")

    plugins_info = _build_plugins_info()
    flowspec_json = workflow_to_flowspec(workflow).model_dump_json(indent=2)
    var_hint = _build_available_variables(workflow)

    logger.info("编辑 - 插件信息长度: %s 字符", len(plugins_info))
    logger.info("编辑 - 插件信息预览: %s...", plugins_info[:500])

    messages = [
        {"role": "system", "content": _EDIT_SYSTEM_PROMPT + plugins_info},
        {
            "role": "user",
            "content": f"当前 FlowSpec JSON：\n{flowspec_json}\n{var_hint}\n修改指令：{body.instruction}",
        },
    ]

    async def event_stream():
        full_text = ""
        reasoning_text = ""
        try:
            from shared_llm import _get_client

            client = _get_client()
            is_reasoning_model = "o1" in model.lower() or "o3" in model.lower()

            request_body = {
                "model": model,
                "messages": messages,
                "temperature": 0.3,
                "stream": True,
            }

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

                        if reasoning := delta.get("reasoning_content"):
                            reasoning_text += reasoning
                            yield _sse("thinking", {"text": reasoning})

                        if content := delta.get("content"):
                            full_text += content
                            yield _sse("delta", {"text": content})
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

            updated = parse_generated_workflow(full_text, workflow_id)
            save_workflow(updated)
            yield _sse("done", json.loads(updated.model_dump_json()))

        except httpx.HTTPStatusError as e:
            yield _sse("error", {"message": f"LLM API 错误: {e.response.status_code}"})
        except ValueError as e:
            logger.error("编辑结果校验失败: %s", e)
            yield _sse("error", {"message": str(e)})
        except Exception as e:
            logger.error("编辑失败: %s", e)
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _strip_json_wrapper(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [line for line in lines if not line.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return text


def _validate_generated_flowspec_payload(data: object) -> None:
    if not isinstance(data, dict):
        raise ValueError("编辑生成失败：顶层必须是 JSON 对象")

    steps = data.get("steps")
    if steps is None:
        raise ValueError("编辑生成失败：FlowSpec.steps 不能为空")
    if not isinstance(steps, list):
        raise ValueError("编辑生成失败：FlowSpec.steps 必须是数组")

    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            raise ValueError(f"编辑生成失败：steps[{index}] 必须是对象")
        for key in ("depends_on", "input_refs", "input_bindings"):
            if key in step and step[key] is None:
                raise ValueError(f"编辑生成失败：steps[{index}].{key} 不能为 null")
            if key in step and not isinstance(step[key], list):
                raise ValueError(f"编辑生成失败：steps[{index}].{key} 必须是数组")
        if "plugin_input_bindings" in step and step["plugin_input_bindings"] is not None:
            if not isinstance(step["plugin_input_bindings"], dict):
                raise ValueError(f"编辑生成失败：steps[{index}].plugin_input_bindings 必须是对象")
        for binding_index, binding in enumerate(step.get("input_bindings") or []):
            if not isinstance(binding, dict):
                raise ValueError(f"编辑生成失败：steps[{index}].input_bindings[{binding_index}] 必须是对象")
            if not isinstance(binding.get("step_ref"), str):
                raise ValueError(f"编辑生成失败：steps[{index}].input_bindings[{binding_index}].step_ref 必须是字符串")
            if "from_key" in binding and binding["from_key"] is not None and not isinstance(binding["from_key"], str):
                raise ValueError(f"编辑生成失败：steps[{index}].input_bindings[{binding_index}].from_key 必须是字符串或 null")
        if "repeat" in step and step["repeat"] is None:
            raise ValueError(f"编辑生成失败：steps[{index}].repeat 不能为 null")
        if "repeat" in step and not isinstance(step["repeat"], int):
            raise ValueError(f"编辑生成失败：steps[{index}].repeat 必须是整数")

    for field_name in ("inputs", "outputs"):
        if field_name in data and data[field_name] is None:
            raise ValueError(f"编辑生成失败：FlowSpec.{field_name} 不能为 null")
        if field_name in data and not isinstance(data[field_name], list):
            raise ValueError(f"编辑生成失败：FlowSpec.{field_name} 必须是数组")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _build_available_variables(workflow: Workflow) -> str:
    variables: list[str] = []
    columns = sorted(workflow.columns, key=lambda column: column.order)
    for column in columns:
        for block in column.blocks:
            if block.type == BlockType.COLLECT and block.config.fields:
                for field in block.config.fields:
                    ref = "{{inputs." + field.name + "}}"
                    label = field.label or field.name
                    variables.append(f"  - `{ref}`  ← 用户输入「{label}」")
            else:
                ref = "{{steps." + block.ref + "}}"
                variables.append(f"  - `{ref}`  ← 步骤「{block.name}」({block.ref}) 的完整输出")
                if block.output_schema and block.output_schema.keys:
                    for key in block.output_schema.keys:
                        key_ref = "{{steps." + block.ref + "." + key + "}}"
                        variables.append(f"  - `{key_ref}`  ← 步骤「{block.name}」({block.ref}) 的 {key}")
    if not variables:
        return ""
    return "\n当前工作流中可用的模板变量：\n" + "\n".join(variables) + "\n"


def _build_plugins_info() -> str:
    from plugins.registry import get_enabled_plugins, get_plugin

    enabled = get_enabled_plugins()
    if not enabled:
        return ""

    lines = ["\n\n## 可用插件\n"]
    lines.append("以下工具已启用，可以在工作流中使用（type: \"tool\"）：\n")

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

        if meta.input_schema:
            lines.append("\n**输入格式:**")
            lines.append("```json")
            lines.append(json.dumps(meta.input_schema, ensure_ascii=False, indent=2))
            lines.append("```")

        if meta.output_schema:
            output_summary = describe_json_schema(meta.output_schema)
            if output_summary:
                lines.append("\n**输出摘要：**")
                lines.append(output_summary)
            lines.append("\n**输出格式:**")
            lines.append("```json")
            lines.append(json.dumps(meta.output_schema, ensure_ascii=False, indent=2))
            lines.append("```")

        output_keys = (
            list(meta.output_schema.get("properties", {}).keys())
            if meta.output_schema and "properties" in meta.output_schema
            else ["result"]
        )
        lines.append("\n**在 FlowSpec 中的使用方式:**")
        lines.append(f"1. 新增一个 step，设置: type: \"tool\", plugin_id: \"{meta.id}\"")
        lines.append("2. 系统默认会把上游结构化结果直接传给插件，不会附带步骤名包装文本")
        lines.append("3. 优先使用字段映射（plugin_input_bindings）表达插件输入来源")
        lines.append("   - 例如：plugin_input_bindings: {\"query\": {\"kind\": \"variable\", \"value\": \"inputs.keyword\"}}")
        lines.append("4. 只有在字段映射不足以表达复杂重组时，才使用 step.prompt")
        lines.append("   - 例如：如果需要把多个来源组合成复杂 JSON，才设置 step.prompt")
        lines.append(f"     step.prompt = '{{\"query\": \"{{{{inputs.keyword}}}}\"}}'")
        lines.append("5. 插件步骤的 output_contract 应根据插件输出格式设置 keys 列表，以便下游步骤引用")
        lines.append(f"   - 例如：output_contract: {{ keys: {output_keys} }}")
        lines.append("")

    return "\n".join(lines)
