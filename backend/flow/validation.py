"""
Flow 校验

当前先提供保存前 / 运行前的统一后端校验入口。
后续可以继续扩展为更细的错误分类和前端逐项提示。
"""

from __future__ import annotations

from dataclasses import dataclass

from flow.canonical import CanonicalWorkflow, canonicalize_workflow
from flow.models import BlockType, Workflow


@dataclass(slots=True)
class ValidationIssue:
    code: str
    message: str
    path: str


class WorkflowValidationError(ValueError):
    def __init__(self, issues: list[ValidationIssue]):
        self.issues = issues
        super().__init__("\n".join(issue.message for issue in issues))


def validate_workflow(workflow: Workflow | CanonicalWorkflow) -> list[ValidationIssue]:
    if isinstance(workflow, Workflow):
        return _validate_raw_workflow(workflow)

    canonical = workflow
    issues: list[ValidationIssue] = []

    block_ids = {
        block.block_id
        for column in canonical.columns
        for block in column.blocks
    }

    field_names_seen: set[str] = set()

    for field in canonical.inputs:
        if field.name in field_names_seen:
            issues.append(
                ValidationIssue(
                    code="duplicate_input_name",
                    message=f"输入字段重复：{field.name}",
                    path=f"inputs.{field.field_id}",
                )
            )
        field_names_seen.add(field.name)

    for column_index, column in enumerate(canonical.columns):
        if column.repeat < 1:
            issues.append(
                ValidationIssue(
                    code="invalid_repeat",
                    message=f"第 {column_index + 1} 步的 repeat 必须大于等于 1",
                    path=f"columns.{column.column_id}.repeat",
                )
            )

        for block_index, block in enumerate(column.blocks):
            path = f"columns.{column.column_id}.blocks.{block.block_id}"

            if not block.name.strip():
                issues.append(
                    ValidationIssue(
                        code="empty_block_name",
                        message=f"第 {column_index + 1} 步第 {block_index + 1} 个块名称不能为空",
                        path=path,
                    )
                )

            if "." in block.name:
                issues.append(
                    ValidationIssue(
                        code="invalid_block_name",
                        message=f"块名称不能包含英文句号：{block.name}",
                        path=f"{path}.name",
                    )
                )

            if block.type == BlockType.AI and not (block.config.prompt or "").strip():
                issues.append(
                    ValidationIssue(
                        code="missing_ai_prompt",
                        message=f"AI 块缺少提示词：{block.name}",
                        path=f"{path}.config.prompt",
                    )
                )

            if block.type == BlockType.PLUGIN and not (block.config.plugin_id or "").strip():
                issues.append(
                    ValidationIssue(
                        code="missing_plugin_id",
                        message=f"插件块缺少 plugin_id：{block.name}",
                        path=f"{path}.config.plugin_id",
                    )
                )

            for connection_index, connection in enumerate(block.connections):
                if connection.from_block_id not in block_ids:
                    issues.append(
                        ValidationIssue(
                            code="invalid_connection_source",
                            message=f"块 {block.name} 引用了不存在的来源块：{connection.from_block_id}",
                            path=f"{path}.connections.{connection_index}",
                        )
                    )

    return issues


def _validate_raw_workflow(workflow: Workflow) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    block_ids = {
        block.id
        for column in workflow.columns
        for block in column.blocks
    }
    field_names_seen: set[str] = set()

    for column_index, column in enumerate(workflow.columns):
        if column.repeat < 1:
            issues.append(
                ValidationIssue(
                    code="invalid_repeat",
                    message=f"第 {column_index + 1} 步的 repeat 必须大于等于 1",
                    path=f"columns.{column.id}.repeat",
                )
            )

        for block_index, block in enumerate(column.blocks):
            path = f"columns.{column.id}.blocks.{block.id}"

            if not block.name.strip():
                issues.append(
                    ValidationIssue(
                        code="empty_block_name",
                        message=f"第 {column_index + 1} 步第 {block_index + 1} 个块名称不能为空",
                        path=path,
                    )
                )

            if "." in block.name:
                issues.append(
                    ValidationIssue(
                        code="invalid_block_name",
                        message=f"块名称不能包含英文句号：{block.name}",
                        path=f"{path}.name",
                    )
                )

            if block.type == BlockType.AI and not (block.config.prompt or "").strip():
                issues.append(
                    ValidationIssue(
                        code="missing_ai_prompt",
                        message=f"AI 块缺少提示词：{block.name}",
                        path=f"{path}.config.prompt",
                    )
                )

            if block.type == BlockType.PLUGIN and not (block.config.plugin_id or "").strip():
                issues.append(
                    ValidationIssue(
                        code="missing_plugin_id",
                        message=f"插件块缺少 plugin_id：{block.name}",
                        path=f"{path}.config.plugin_id",
                    )
                )

            if block.type == BlockType.INPUT and block.config.fields:
                for field in block.config.fields:
                    if field.name in field_names_seen:
                        issues.append(
                            ValidationIssue(
                                code="duplicate_input_name",
                                message=f"输入字段重复：{field.name}",
                                path=f"{path}.config.fields.{field.name}",
                            )
                        )
                    field_names_seen.add(field.name)

            for connection_index, connection in enumerate(block.connections):
                if connection.from_block_id not in block_ids:
                    issues.append(
                        ValidationIssue(
                            code="invalid_connection_source",
                            message=f"块 {block.name} 引用了不存在的来源块：{connection.from_block_id}",
                            path=f"{path}.connections.{connection_index}",
                        )
                    )

    return issues


def ensure_valid_workflow(workflow: Workflow | CanonicalWorkflow) -> None:
    issues = validate_workflow(workflow)
    if issues:
        raise WorkflowValidationError(issues)
