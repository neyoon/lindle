"""
Flow 模块

工作流相关的数据模型、执行引擎、块执行器等
"""

from flow.models import (
    Block,
    BlockConfig,
    BlockTemplate,
    BlockType,
    Column,
    Connection,
    InputField,
    OutputSchema,
    Workflow,
)
from flow.flowspec import (
    FlowSpec,
    FlowSpecInput,
    FlowSpecOutput,
    FlowStep,
    sanitize_ref,
    workflow_to_flowspec,
)
from flow.canonical import (
    CanonicalBlock,
    CanonicalColumn,
    CanonicalInputField,
    CanonicalWorkflow,
    canonicalize_flowspec,
    canonicalize_workflow,
)
from flow.execution_plan import (
    ExecutableBlock,
    ExecutableColumn,
    ExecutionPlan,
    compile_execution_plan,
)
from flow.materialize import (
    materialize_canonical_workflow,
    materialize_flowspec,
)
from flow.validation import (
    ValidationIssue,
    WorkflowValidationError,
    ensure_valid_workflow,
    validate_workflow,
)

from flow.context import BlockResult, Context
from flow.blocks import BlockExecutor
from flow.engine import Engine, ExecutionResult, StepEvent

__all__ = [
    "Block",
    "BlockConfig",
    "BlockTemplate",
    "BlockType",
    "Column",
    "Connection",
    "InputField",
    "OutputSchema",
    "Workflow",
    "FlowSpec",
    "FlowSpecInput",
    "FlowSpecOutput",
    "FlowStep",
    "sanitize_ref",
    "workflow_to_flowspec",
    "CanonicalInputField",
    "CanonicalBlock",
    "CanonicalColumn",
    "CanonicalWorkflow",
    "canonicalize_flowspec",
    "canonicalize_workflow",
    "ExecutableBlock",
    "ExecutableColumn",
    "ExecutionPlan",
    "compile_execution_plan",
    "materialize_canonical_workflow",
    "materialize_flowspec",
    "ValidationIssue",
    "WorkflowValidationError",
    "validate_workflow",
    "ensure_valid_workflow",
    "Engine",
    "ExecutionResult",
    "StepEvent",
    "BlockExecutor",
    "BlockResult",
    "Context",
]
