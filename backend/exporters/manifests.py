"""
Flow / Agent 结构化导出

导出结果既保留原始配置，也补充更适合人和模型理解的语义信息。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from agent.models import Agent
from flow.models import BlockType, Workflow
from plugins.registry import get_plugin
from storage.file_store import load_workflow


def _exported_at() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_workflow_inputs(workflow: Workflow) -> list[dict[str, Any]]:
    inputs: list[dict[str, Any]] = []
    for column in workflow.get_sorted_columns():
        for block in column.blocks:
            if block.type != BlockType.INPUT or not block.config.fields:
                continue
            for field in block.config.fields:
                inputs.append({
                    "block_id": block.id,
                    "block_name": block.name,
                    "name": field.name,
                    "label": field.label,
                    "field_type": field.field_type,
                    "required": field.required,
                    "default": field.default,
                })
    return inputs


def _resolve_workflow_outputs(workflow: Workflow) -> list[dict[str, Any]]:
    columns = workflow.get_sorted_columns()
    if not columns:
        return []

    outputs: list[dict[str, Any]] = []
    for block in columns[-1].blocks:
        item: dict[str, Any] = {
            "block_id": block.id,
            "block_name": block.name,
            "type": block.type.value,
        }
        if block.type == BlockType.OUTPUT:
            item["output_mode"] = "passthrough_text"
        elif block.type == BlockType.AI:
            item["output_mode"] = "json" if block.output_schema and block.output_schema.keys else "text"
            if block.output_schema and block.output_schema.keys:
                item["keys"] = list(block.output_schema.keys)
        elif block.type == BlockType.PLUGIN:
            item["output_mode"] = "plugin_result"
            item["plugin_id"] = block.config.plugin_id
        outputs.append(item)
    return outputs


def build_workflow_description(workflow: Workflow) -> str:
    """将工作流转换为 LLM 友好的文本描述。"""
    lines: list[str] = []
    columns = workflow.get_sorted_columns()

    lines.append(f"## 工作流：{workflow.name}")
    if workflow.description:
        lines.append(f"\n{workflow.description}")

    total_blocks = sum(len(c.blocks) for c in columns)
    lines.append(f"\n执行流程（共 {len(columns)} 步，{total_blocks} 个块，按顺序执行）：")
    lines.append("")

    for i, col in enumerate(columns):
        repeat_hint = f"（重复 {col.repeat} 次）" if col.repeat > 1 else ""
        parallel_hint = "（栏内并行执行）" if len(col.blocks) > 1 else ""
        lines.append(f"### 步骤 {i + 1}{repeat_hint}{parallel_hint}")
        lines.append("")

        for block in col.blocks:
            type_label = {
                BlockType.INPUT: "输入",
                BlockType.AI: "AI",
                BlockType.OUTPUT: "输出",
                BlockType.PLUGIN: "插件",
            }.get(block.type, str(block.type))
            lines.append(f"**[{type_label}] {block.name}**")

            if block.type == BlockType.INPUT and block.config.fields:
                for field in block.config.fields:
                    required = "必填" if field.required else "选填"
                    lines.append(f"  - 字段: `{field.name}` ({field.field_type}, {required})")

            if block.type == BlockType.AI:
                if block.config.prompt:
                    lines.append(f"  - 提示词: {block.config.prompt}")
                lines.append(f"  - 模型: `{block.config.model or '默认'}`")
                if block.output_schema and block.output_schema.keys:
                    keys = ", ".join(f"`{key}`" for key in block.output_schema.keys)
                    lines.append(f"  - JSON 输出 key: {keys}")
                lines.append("  - 默认输入语义: 文本化上游结果")

            if block.type == BlockType.PLUGIN:
                lines.append(f"  - 插件 ID: `{block.config.plugin_id or '未配置'}`")
                lines.append("  - 默认输入语义: 结构化上游结果")
                if block.config.prompt:
                    lines.append(f"  - 输入模板: {block.config.prompt}")

            if block.connections:
                sources: list[str] = []
                for conn in block.connections:
                    src_block = workflow.get_block_by_id(conn.from_block_id)
                    src_name = src_block.name if src_block else conn.from_block_id
                    sources.append(f"`{src_name}.{conn.from_key}`" if conn.from_key else f"`{src_name}`")
                lines.append(f"  - 数据来源（手动连线）: {', '.join(sources)}")
            elif i > 0:
                lines.append("  - 数据来源: 自动接收上一步全部输出")

            lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("**数据流规则：**")
    lines.append("- 默认：每步自动接收上一步所有块的全部输出")
    lines.append("- AI 块默认接收适合模型理解的文本格式")
    lines.append("- Plugin 块默认接收适合程序执行的结构化格式")
    lines.append("- 手动连线：仅接收指定来源块的输出（可精确到某个 JSON key）")
    lines.append("- 同一步内的多个块并行执行")
    return "\n".join(lines)


def build_workflow_export(workflow: Workflow) -> dict[str, Any]:
    columns = workflow.get_sorted_columns()
    steps: list[dict[str, Any]] = []

    for index, column in enumerate(columns, start=1):
        blocks: list[dict[str, Any]] = []
        for block in column.blocks:
            item: dict[str, Any] = {
                "block_id": block.id,
                "name": block.name,
                "type": block.type.value,
                "receives": [],
            }

            if block.connections:
                receives = []
                for conn in block.connections:
                    src_block = workflow.get_block_by_id(conn.from_block_id)
                    receives.append({
                        "from_block_id": conn.from_block_id,
                        "from_block_name": src_block.name if src_block else conn.from_block_id,
                        "from_key": conn.from_key,
                    })
                item["receives"] = receives
            elif index > 1:
                item["receives"] = ["previous_step_all_outputs"]

            if block.type == BlockType.INPUT:
                item["fields"] = [
                    {
                        "name": field.name,
                        "label": field.label,
                        "field_type": field.field_type,
                        "required": field.required,
                        "default": field.default,
                    }
                    for field in (block.config.fields or [])
                ]
            elif block.type == BlockType.AI:
                item["default_input_mode"] = "formatted_text"
                item["model_provider_id"] = block.config.model
                item["prompt"] = block.config.prompt
                item["output_schema"] = block.output_schema.model_dump() if block.output_schema else None
            elif block.type == BlockType.PLUGIN:
                plugin = get_plugin(block.config.plugin_id or "")
                item["default_input_mode"] = "structured_upstream_value"
                item["plugin_id"] = block.config.plugin_id
                item["input_template"] = block.config.prompt
                item["plugin_meta"] = (
                    {
                        "name": plugin.meta.name,
                        "description": plugin.meta.description,
                        "input_schema": plugin.meta.input_schema or None,
                        "output_schema": plugin.meta.output_schema or None,
                    }
                    if plugin
                    else None
                )
            elif block.type == BlockType.OUTPUT:
                item["default_input_mode"] = "formatted_text"

            blocks.append(item)

        steps.append({
            "step_number": index,
            "column_id": column.id,
            "order": column.order,
            "repeat": column.repeat,
            "execution_mode": "parallel" if len(column.blocks) > 1 else "single",
            "blocks": blocks,
        })

    return {
        "manifest_type": "tweak_flow",
        "manifest_version": "1.2",
        "exported_at": _exported_at(),
        "summary": {
            "id": workflow.id,
            "name": workflow.name,
            "description": workflow.description,
            "step_count": len(columns),
            "block_count": sum(len(column.blocks) for column in columns),
            "stop_on_error": workflow.stop_on_error,
        },
        "execution_semantics": {
            "columns": "sequential",
            "blocks_within_column": "parallel",
            "default_ai_input": "formatted_text",
            "default_plugin_input": "structured_upstream_value",
        },
        "inputs": _resolve_workflow_inputs(workflow),
        "outputs": _resolve_workflow_outputs(workflow),
        "steps": steps,
        "llm_description": build_workflow_description(workflow),
        "raw_workflow": workflow.model_dump(),
    }


def build_agent_export(agent: Agent) -> dict[str, Any]:
    skills: list[dict[str, Any]] = []

    for skill in sorted(agent.skills, key=lambda item: item.order):
        plugin = get_plugin(skill.skill_id)
        skill_item: dict[str, Any] = {
            "skill_id": skill.skill_id,
            "order": skill.order,
            "config": dict(skill.config),
        }

        if plugin:
            skill_item.update({
                "name": plugin.meta.name,
                "description": plugin.meta.description,
                "input_schema": plugin.meta.input_schema or None,
                "output_schema": plugin.meta.output_schema or None,
            })

        if skill.skill_id == "workflow_executor":
            bound_flows = []
            flow_ids = [
                flow_id.strip()
                for flow_id in skill.config.get("flows", "").split(",")
                if flow_id.strip()
            ]
            for flow_id in flow_ids:
                workflow = load_workflow(flow_id)
                if not workflow:
                    bound_flows.append({"workflow_id": flow_id, "missing": True})
                    continue
                bound_flows.append({
                    "workflow_id": workflow.id,
                    "name": workflow.name,
                    "description": workflow.description,
                    "inputs": _resolve_workflow_inputs(workflow),
                    "outputs": _resolve_workflow_outputs(workflow),
                })
            skill_item["bound_flows"] = bound_flows

        skills.append(skill_item)

    return {
        "manifest_type": "tweak_agent",
        "manifest_version": "1.2",
        "exported_at": _exported_at(),
        "summary": {
            "id": agent.id,
            "name": agent.name,
            "description": agent.description,
            "skill_count": len(agent.skills),
            "model_provider_id": agent.model_provider_id,
        },
        "system_context": {
            "system_prompt": agent.system_prompt,
            "model_provider_id": agent.model_provider_id,
        },
        "skills": skills,
        "raw_agent": agent.model_dump(),
    }
