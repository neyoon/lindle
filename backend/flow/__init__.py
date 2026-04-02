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
