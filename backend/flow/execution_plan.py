"""
ExecutionPlan

将 CanonicalFlow 编译成执行引擎消费的运行时结构。
当前阶段先保留与现有引擎兼容的列/块结构，后续逐步承接更细的运行时决策。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from flow.canonical import CanonicalWorkflow
from flow.models import Block


@dataclass(slots=True)
class ExecutableBlock:
    block: Block
    block_ref: str
    resolved_inputs: list[dict[str, Any]] = field(default_factory=list)
    system_adapters: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class ExecutableColumn:
    column_id: str
    order: int
    repeat: int
    blocks: list[ExecutableBlock] = field(default_factory=list)


@dataclass(slots=True)
class ExecutionPlan:
    plan_id: str
    workflow_id: str
    name: str
    columns: list[ExecutableColumn] = field(default_factory=list)
    edges: list[dict[str, Any]] = field(default_factory=list)
    compiled_at: str = ""
    stop_on_error: bool = True


def compile_execution_plan(workflow: CanonicalWorkflow) -> ExecutionPlan:
    columns: list[ExecutableColumn] = []
    edges: list[dict[str, Any]] = []

    for column in workflow.get_sorted_columns():
        executable_blocks: list[ExecutableBlock] = []
        for block in column.blocks:
            executable_blocks.append(
                ExecutableBlock(
                    block=Block.model_validate({
                        "id": block.block_id,
                        "ref": block.block_ref,
                        "type": block.type,
                        "name": block.name,
                        "config": block.config.model_dump(),
                        "output_schema": block.output_schema.model_dump() if block.output_schema else None,
                        "connections": [connection.model_dump() for connection in block.connections],
                    }),
                    block_ref=block.block_ref,
                    resolved_inputs=[connection.model_dump() for connection in block.input_bindings],
                )
            )
            for connection in block.connections:
                edges.append({
                    "from_block_id": connection.from_block_id,
                    "to_block_id": block.block_id,
                    "from_key": connection.from_key,
                })

        columns.append(
            ExecutableColumn(
                column_id=column.column_id,
                order=column.order,
                repeat=max(column.repeat, 1),
                blocks=executable_blocks,
            )
        )

    return ExecutionPlan(
        plan_id=f"plan:{workflow.workflow_id}",
        workflow_id=workflow.workflow_id,
        name=workflow.name,
        columns=columns,
        edges=edges,
        compiled_at=datetime.now(timezone.utc).isoformat(),
        stop_on_error=workflow.stop_on_error,
    )
