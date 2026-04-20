"""
Flow 模块

工作流相关的数据模型、执行引擎、块执行器等
"""

# 先导入 models（没有依赖）
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
from flow.validation import (
    ValidationIssue,
    WorkflowValidationError,
    ensure_valid_workflow,
    validate_workflow,
)

# 再导入其他模块
from flow.context import BlockResult, Context
from flow.blocks import BlockExecutor
from flow.engine import Engine, ExecutionResult, StepEvent

__all__ = [
    # Models
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
    "ValidationIssue",
    "WorkflowValidationError",
    "validate_workflow",
    "ensure_valid_workflow",
    # Engine
    "Engine",
    "ExecutionResult",
    "StepEvent",
    # Blocks
    "BlockExecutor",
    # Context
    "BlockResult",
    "Context",
]
