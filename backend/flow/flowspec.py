"""
FlowSpec

Flow 的高层创建结构。
当前阶段先作为用户主操作层和后端内部收敛入口，
承接主步骤与依赖关系。
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from flow.models import BlockType, Workflow


def sanitize_ref(value: str) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9_]+", "_", value or "").strip("_").lower()
    return sanitized or "item"


class FlowSpecInput(BaseModel):
    input_ref: str
    name: str
    label: str = ""
    field_type: str = "text"
    required: bool = True
    default: Any = None


class FlowSpecOutput(BaseModel):
    output_ref: str
    name: str
    source_step_refs: list[str] = Field(default_factory=list)


class FlowStep(BaseModel):
    step_ref: str
    title: str
    type: BlockType
    purpose: str = ""
    depends_on: list[str] = Field(default_factory=list)
    plugin_id: str | None = None
    output_contract: dict[str, Any] = Field(default_factory=dict)
    prompt: str | None = None
    input_refs: list[str] = Field(default_factory=list)
    source_block_id: str | None = None
    source_column_id: str | None = None
    repeat: int = 1
    order_hint: int = 0


class FlowSpec(BaseModel):
    workflow_id: str
    goal: str = ""
    name: str
    description: str = ""
    inputs: list[FlowSpecInput] = Field(default_factory=list)
    outputs: list[FlowSpecOutput] = Field(default_factory=list)
    steps: list[FlowStep] = Field(default_factory=list)
    stop_on_error: bool = True
    meta: dict[str, Any] = Field(default_factory=dict)


def workflow_to_flowspec(workflow: Workflow) -> FlowSpec:
    steps: list[FlowStep] = []
    inputs: list[FlowSpecInput] = []

    block_to_step_ref: dict[str, str] = {}
    previous_column_step_refs: list[str] = []

    for column in workflow.get_sorted_columns():
        current_column_step_refs: list[str] = []
        for block in column.blocks:
            step_ref = block.ref
            block_to_step_ref[block.id] = step_ref
            current_column_step_refs.append(step_ref)

            depends_on = _resolve_dependencies(
                block_id=block.id,
                workflow=workflow,
                block_to_step_ref=block_to_step_ref,
                previous_column_step_refs=previous_column_step_refs,
            )

            step = FlowStep(
                step_ref=step_ref,
                title=block.name,
                type=block.type,
                purpose=_infer_step_purpose(block),
                depends_on=depends_on,
                plugin_id=block.config.plugin_id,
                output_contract=_build_output_contract(block),
                prompt=block.config.prompt,
                input_refs=[field.name for field in (block.config.fields or [])],
                source_block_id=block.id,
                source_column_id=column.id,
                repeat=column.repeat,
                order_hint=column.order,
            )
            steps.append(step)

            if block.type == BlockType.COLLECT and block.config.fields:
                for field in block.config.fields:
                    inputs.append(
                        FlowSpecInput(
                            input_ref=field.name,
                            name=field.name,
                            label=field.label,
                            field_type=field.field_type,
                            required=field.required,
                            default=field.default,
                        )
                    )

        previous_column_step_refs = current_column_step_refs

    outputs = _build_flowspec_outputs(workflow, block_to_step_ref)

    return FlowSpec(
        workflow_id=workflow.id,
        goal=workflow.description or workflow.name,
        name=workflow.name,
        description=workflow.description,
        inputs=inputs,
        outputs=outputs,
        steps=steps,
        stop_on_error=workflow.stop_on_error,
        meta={"source": "workflow"},
    )


def _resolve_dependencies(
    *,
    block_id: str,
    workflow: Workflow,
    block_to_step_ref: dict[str, str],
    previous_column_step_refs: list[str],
) -> list[str]:
    block = workflow.get_block_by_id(block_id)
    if block is None:
        return []
    if block.connections:
        step_refs: list[str] = []
        for connection in block.connections:
            step_ref = block_to_step_ref.get(connection.from_block_id)
            if step_ref:
                step_refs.append(step_ref)
        return step_refs
    return list(previous_column_step_refs)


def _infer_step_purpose(block) -> str:
    if block.type == BlockType.COLLECT:
        return "接收用户输入"
    if block.type == BlockType.PROCESS:
        return block.config.prompt or "执行处理步骤"
    if block.type == BlockType.TOOL:
        return f"执行工具 {block.config.plugin_id or ''}".strip()
    return "收口最终结果"


def _build_output_contract(block) -> dict[str, Any]:
    if block.output_schema:
        return {
            "keys": list(block.output_schema.keys),
            "descriptions": dict(block.output_schema.descriptions),
        }
    return {}


def _build_flowspec_outputs(
    workflow: Workflow,
    block_to_step_ref: dict[str, str],
) -> list[FlowSpecOutput]:
    columns = workflow.get_sorted_columns()
    if not columns:
        return []

    outputs: list[FlowSpecOutput] = []
    for block in columns[-1].blocks:
        source_step_ref = block_to_step_ref.get(block.id)
        outputs.append(
            FlowSpecOutput(
                output_ref=f"output_{sanitize_ref(block.ref)}",
                name=block.ref,
                source_step_refs=[source_step_ref] if source_step_ref else [],
            )
        )
    return outputs
