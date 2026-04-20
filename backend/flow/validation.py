"""
Flow 校验

当前先提供保存前 / 运行前的统一后端校验入口。
后续可以继续扩展为更细的错误分类和前端逐项提示。
"""

from __future__ import annotations

from dataclasses import dataclass

from flow.canonical import CanonicalWorkflow, canonicalize_workflow
from flow.context import extract_template_variables
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
    block_refs_seen: set[str] = set()

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

            if block.block_ref in block_refs_seen:
                issues.append(
                    ValidationIssue(
                        code="duplicate_block_ref",
                        message=f"步骤稳定引用重复：{block.block_ref}",
                        path=f"{path}.ref",
                    )
                )
            block_refs_seen.add(block.block_ref)

            if "." in block.block_ref:
                issues.append(
                    ValidationIssue(
                        code="invalid_block_ref",
                        message=f"步骤稳定引用不能包含英文句号：{block.block_ref}",
                        path=f"{path}.ref",
                    )
                )

            if block.type == BlockType.PROCESS and not (block.config.prompt or "").strip():
                issues.append(
                    ValidationIssue(
                        code="missing_process_prompt",
                        message=f"处理步骤缺少提示词：{block.name}",
                        path=f"{path}.config.prompt",
                    )
                )

            if block.type == BlockType.TOOL and not (block.config.plugin_id or "").strip():
                issues.append(
                    ValidationIssue(
                        code="missing_tool_id",
                        message=f"工具步骤缺少 plugin_id：{block.name}",
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
    sorted_columns = workflow.get_sorted_columns()
    block_ids = {block.id for column in sorted_columns for block in column.blocks}
    field_names_seen: set[str] = set()
    available_input_names: set[str] = set()
    available_steps: dict[str, set[str] | None] = {}
    block_refs_seen: set[str] = set()

    for column_index, column in enumerate(sorted_columns):
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

            if block.ref in block_refs_seen:
                issues.append(
                    ValidationIssue(
                        code="duplicate_block_ref",
                        message=f"步骤稳定引用重复：{block.ref}",
                        path=f"{path}.ref",
                    )
                )
            block_refs_seen.add(block.ref)

            if "." in block.ref:
                issues.append(
                    ValidationIssue(
                        code="invalid_block_ref",
                        message=f"步骤稳定引用不能包含英文句号：{block.ref}",
                        path=f"{path}.ref",
                    )
                )

            if block.type == BlockType.PROCESS and not (block.config.prompt or "").strip():
                issues.append(
                    ValidationIssue(
                        code="missing_process_prompt",
                        message=f"处理步骤缺少提示词：{block.name}",
                        path=f"{path}.config.prompt",
                    )
                )

            if block.type == BlockType.TOOL and not (block.config.plugin_id or "").strip():
                issues.append(
                    ValidationIssue(
                        code="missing_tool_id",
                        message=f"工具步骤缺少 plugin_id：{block.name}",
                        path=f"{path}.config.plugin_id",
                    )
                )

            if block.type == BlockType.COLLECT and block.config.fields:
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
                    available_input_names.add(field.name)

            prompt_to_validate = block.config.prompt if block.type in {BlockType.PROCESS, BlockType.TOOL} else None
            if prompt_to_validate:
                issues.extend(
                    _validate_template_variables(
                        prompt_to_validate,
                        path=f"{path}.config.prompt",
                        available_input_names=available_input_names,
                        available_steps=available_steps,
                    )
                )

            if block.type == BlockType.TOOL and block.config.plugin_input_bindings:
                for binding_key, binding in block.config.plugin_input_bindings.items():
                    if binding.kind != "variable":
                        continue
                    issues.extend(
                        _validate_expression(
                            str(binding.value),
                            path=f"{path}.config.plugin_input_bindings.{binding_key}",
                            available_input_names=available_input_names,
                            available_steps=available_steps,
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

            available_steps[block.ref] = set(block.output_schema.keys) if block.output_schema else None

    return issues


def _validate_template_variables(
    prompt: str,
    *,
    path: str,
    available_input_names: set[str],
    available_steps: dict[str, set[str] | None],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for variable in extract_template_variables(prompt):
        issues.extend(
            _validate_expression(
                variable,
                path=path,
                available_input_names=available_input_names,
                available_steps=available_steps,
            )
        )
    return issues


def _validate_expression(
    expr: str,
    *,
    path: str,
    available_input_names: set[str],
    available_steps: dict[str, set[str] | None],
) -> list[ValidationIssue]:
    expr = expr.strip()
    if not expr:
        return []

    if expr.startswith("inputs."):
        field_name = expr[7:]
        if field_name in available_input_names:
            return []
        return [
            ValidationIssue(
                code="invalid_variable_reference",
                message=f"引用了不存在的输入字段：{expr}",
                path=path,
            )
        ]

    if expr.startswith("steps."):
        ref_expr = expr[6:]
        step_ref, _, key_path = ref_expr.partition(".")
        if step_ref not in available_steps:
            return [
                ValidationIssue(
                    code="invalid_variable_reference",
                    message=f"引用了不存在的上游步骤：{step_ref}",
                    path=path,
                )
            ]
        allowed_keys = available_steps[step_ref]
        if not key_path:
            return []
        if allowed_keys is None:
            return [
                ValidationIssue(
                    code="invalid_variable_reference",
                    message=f"步骤 {step_ref} 未定义可引用的输出字段：{key_path}",
                    path=path,
                )
            ]
        first_key = key_path.split(".")[0]
        if first_key not in allowed_keys:
            return [
                ValidationIssue(
                    code="invalid_variable_reference",
                    message=f"步骤 {step_ref} 不存在输出字段：{first_key}",
                    path=path,
                )
            ]
        return []

    return [
        ValidationIssue(
            code="invalid_variable_reference",
            message=f"引用了不存在的变量：{expr}",
            path=path,
        )
    ]


def ensure_valid_workflow(workflow: Workflow | CanonicalWorkflow) -> None:
    issues = validate_workflow(workflow)
    if issues:
        raise WorkflowValidationError(issues)
