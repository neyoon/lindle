"""
Flow 物化

将 CanonicalFlow / FlowSpec 收敛回当前外部兼容的 Workflow 结构，
用于持久化、前端回显和渐进式迁移。
"""

from __future__ import annotations

from flow.canonical import CanonicalWorkflow, canonicalize_flowspec
from flow.flowspec import FlowSpec
from flow.models import Block, Column, Workflow


def materialize_canonical_workflow(workflow: CanonicalWorkflow) -> Workflow:
    columns: list[Column] = []

    for column in workflow.get_sorted_columns():
        blocks: list[Block] = []
        for block in column.blocks:
            blocks.append(
                Block.model_validate({
                    "id": block.block_id,
                    "ref": block.block_ref,
                    "type": block.type,
                    "name": block.name,
                    "config": block.config.model_dump(),
                    "output_schema": block.output_schema.model_dump() if block.output_schema else None,
                    "connections": [connection.model_dump() for connection in block.connections],
                })
            )

        columns.append(
            Column(
                id=column.column_id,
                order=column.order,
                repeat=max(column.repeat, 1),
                blocks=blocks,
            )
        )

    return Workflow(
        id=workflow.workflow_id,
        name=workflow.name,
        description=workflow.description,
        columns=columns,
        stop_on_error=workflow.stop_on_error,
    )


def materialize_flowspec(spec: FlowSpec) -> Workflow:
    return materialize_canonical_workflow(canonicalize_flowspec(spec))
