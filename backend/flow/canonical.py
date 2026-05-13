"""
CanonicalFlow

将当前编辑器使用的 Workflow 收敛成后端内部的稳定编辑结构。
这一层从 FlowSpec 生成稳定编辑结构，并逐步承接稳定引用和统一校验。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from flow.flowspec import FlowSpec, sanitize_ref, workflow_to_flowspec
from flow.models import (
    BlockConfig,
    BlockType,
    Connection,
    OutputSchema,
    Workflow,
)


class CanonicalInputField(BaseModel):
    field_id: str
    field_ref: str
    name: str
    label: str = ""
    field_type: str = "text"
    required: bool = True
    default: Any = None


class CanonicalBlock(BaseModel):
    block_id: str
    block_ref: str
    name: str
    type: BlockType
    config: BlockConfig = Field(default_factory=BlockConfig)
    output_schema: OutputSchema | None = None
    connections: list[Connection] = Field(default_factory=list)
    input_bindings: list[Connection] = Field(default_factory=list)


class CanonicalColumn(BaseModel):
    column_id: str
    order: int
    repeat: int = 1
    blocks: list[CanonicalBlock] = Field(default_factory=list)


class CanonicalWorkflow(BaseModel):
    workflow_id: str
    name: str
    description: str = ""
    inputs: list[CanonicalInputField] = Field(default_factory=list)
    columns: list[CanonicalColumn] = Field(default_factory=list)
    stop_on_error: bool = True
    validation: dict[str, Any] = Field(default_factory=dict)
    meta: dict[str, Any] = Field(default_factory=dict)

    def get_sorted_columns(self) -> list[CanonicalColumn]:
        return sorted(self.columns, key=lambda column: column.order)

    def get_block_by_id(self, block_id: str) -> CanonicalBlock | None:
        for column in self.columns:
            for block in column.blocks:
                if block.block_id == block_id:
                    return block
        return None


def canonicalize_workflow(workflow: Workflow) -> CanonicalWorkflow:
    return canonicalize_flowspec(workflow_to_flowspec(workflow))


def canonicalize_flowspec(spec: FlowSpec) -> CanonicalWorkflow:
    inputs: list[CanonicalInputField] = []
    columns_map: dict[int, CanonicalColumn] = {}
    step_column_order = _resolve_step_column_orders(spec)

    for item in spec.inputs:
        inputs.append(
            CanonicalInputField(
                field_id=item.input_ref,
                field_ref=item.input_ref,
                name=item.name,
                label=item.label,
                field_type=item.field_type,
                required=item.required,
                default=item.default,
            )
        )

    for step in spec.steps:
        order = step_column_order.get(step.step_ref, step.order_hint)
        column = columns_map.setdefault(
            order,
            CanonicalColumn(
                column_id=step.source_column_id or f"col_{sanitize_ref(step.step_ref)}",
                order=order,
                repeat=step.repeat,
                blocks=[],
            ),
        )
        column.repeat = max(column.repeat, step.repeat)

        connections = _step_input_bindings_to_connections(spec, step)

        fields = [
            _canonical_field_to_input_field(spec, input_ref)
            for input_ref in step.input_refs
        ]
        fields = [field for field in fields if field is not None]

        config = BlockConfig(
            prompt=step.prompt,
            model=step.model,
            fields=fields or None,
            plugin_id=step.plugin_id,
            plugin_input_bindings=step.plugin_input_bindings,
        )
        output_schema = _output_contract_to_schema(step.output_contract)
        block_id = step.source_block_id or f"blk_{sanitize_ref(step.step_ref)}"
        block_ref = step.step_ref

        column.blocks.append(
            CanonicalBlock(
                block_id=block_id,
                block_ref=block_ref,
                name=step.title,
                type=step.type,
                config=config,
                output_schema=output_schema,
                connections=connections,
                input_bindings=[connection.model_copy(deep=True) for connection in connections],
            )
        )

    return CanonicalWorkflow(
        workflow_id=spec.workflow_id,
        name=spec.name,
        description=spec.description,
        inputs=inputs,
        columns=sorted(columns_map.values(), key=lambda column: column.order),
        stop_on_error=spec.stop_on_error,
        meta={"source": spec.meta.get("source", "flowspec")},
    )


def _resolve_step_column_orders(spec: FlowSpec) -> dict[str, int]:
    step_map = {step.step_ref: step for step in spec.steps}
    memo: dict[str, int] = {}

    def _resolve(step_ref: str) -> int:
        if step_ref in memo:
            return memo[step_ref]
        step = step_map[step_ref]
        if not step.depends_on:
            memo[step_ref] = max(step.order_hint, 0)
            return memo[step_ref]
        dependency_order = max(_resolve(dep) for dep in step.depends_on)
        memo[step_ref] = max(step.order_hint, dependency_order + 1)
        return memo[step_ref]

    for step in spec.steps:
        _resolve(step.step_ref)
    return memo


def _step_ref_to_block_id(spec: FlowSpec, step_ref: str) -> str | None:
    for step in spec.steps:
        if step.step_ref == step_ref:
            return step.source_block_id or step.step_ref
    return None


def _step_input_bindings_to_connections(spec: FlowSpec, step) -> list[Connection]:
    binding_refs = [binding.step_ref for binding in step.input_bindings]
    bindings_match_dependencies = (
        not step.depends_on
        or sorted(binding_refs) == sorted(step.depends_on)
    )
    if step.input_bindings and bindings_match_dependencies:
        connections: list[Connection] = []
        for binding in step.input_bindings:
            block_id = _step_ref_to_block_id(spec, binding.step_ref)
            if block_id:
                connections.append(
                    Connection(from_block_id=block_id, from_key=binding.from_key)
                )
        return connections

    return [
        Connection(from_block_id=block_id, from_key=None)
        for dependency in step.depends_on
        if (block_id := _step_ref_to_block_id(spec, dependency))
    ]


def _canonical_field_to_input_field(spec: FlowSpec, input_ref: str):
    from flow.models import InputField

    for item in spec.inputs:
        if item.input_ref == input_ref:
            return InputField(
                name=item.name,
                label=item.label,
                field_type=item.field_type,
                required=item.required,
                default=item.default,
            )
    return None


def _output_contract_to_schema(contract: dict[str, Any]) -> OutputSchema | None:
    keys = list(contract.get("keys") or [])
    descriptions = dict(contract.get("descriptions") or {})
    if not keys and not descriptions:
        return None
    return OutputSchema(keys=keys, descriptions=descriptions)
