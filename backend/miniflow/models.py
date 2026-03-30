"""
核心数据模型

设计原则:
- Workflow 由有序的 Column（栏）组成
- Column 内的多个 Block 并行执行
- Column 之间顺序执行（从左到右）
- Block 之间的数据传递默认自动流通，可通过 Connection 精确指定
- Block 可选定义 OutputSchema（JSON key），作为高级选项
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class BlockType(StrEnum):
    """块类型 - 只有 4 种，保持极简"""

    INPUT = "input"
    AI = "ai"
    TOOL = "tool"
    OUTPUT = "output"


class OutputSchema(BaseModel):
    """输出结构定义（高级选项）

    用户可以选择性地定义输出的 JSON key，
    让下游块可以精确引用特定字段。
    """

    keys: list[str] = Field(default_factory=list, description="JSON 输出的 key 列表")
    descriptions: dict[str, str] = Field(
        default_factory=dict,
        description="每个 key 的描述（可选）",
    )


class Connection(BaseModel):
    """连接定义

    默认情况下，下一栏的所有块自动接收上一栏所有块的输出。
    只有当用户手动连线时，才创建 Connection 来精确指定数据来源。
    """

    from_block_id: str = Field(description="来源块 ID")
    from_key: str | None = Field(default=None, description="来源块输出的特定 JSON key（可选）")


class BlockConfig(BaseModel):
    """块的配置"""

    # AI 块的配置
    prompt: str | None = Field(default=None, description="AI 块的提示词")
    model: str | None = Field(default=None, description="AI 块使用的模型")

    # Tool 块的配置
    tool_id: str | None = Field(default=None, description="工具 ID")
    tool_params: dict[str, Any] = Field(default_factory=dict, description="工具参数")

    # Input 块的配置
    fields: list[InputField] | None = Field(default=None, description="输入字段定义")


class InputField(BaseModel):
    """输入字段"""

    name: str
    label: str = ""
    field_type: str = "text"  # text, number, file, textarea
    required: bool = True
    default: Any = None


# 重建 BlockConfig 使其能引用 InputField
BlockConfig.model_rebuild()


class Block(BaseModel):
    """块 - 工作流的最小单元

    每个块只有一个入口和一个出口。
    数据自动从上一栏流入，处理后自动流向下一栏。
    """

    id: str = Field(description="块唯一 ID")
    type: BlockType = Field(description="块类型")
    name: str = Field(description="块名称（用户可读）")
    config: BlockConfig = Field(default_factory=BlockConfig, description="块配置")
    output_schema: OutputSchema | None = Field(
        default=None,
        description="输出结构定义（高级选项，可选）",
    )
    connections: list[Connection] = Field(
        default_factory=list,
        description="手动指定的连接（为空则自动接收上一栏全部输出）",
    )


class Column(BaseModel):
    """栏 - 代表一个执行步骤

    - 栏内的多个块并行执行
    - 栏与栏之间顺序执行（从左到右）
    - 可设置 repeat 来重复执行（代码生成时优化为循环）
    """

    id: str = Field(description="栏唯一 ID")
    order: int = Field(description="栏的顺序（从 0 开始）")
    blocks: list[Block] = Field(default_factory=list, description="栏内的块列表")
    repeat: int = Field(default=1, description="重复执行次数（默认 1）")


class Workflow(BaseModel):
    """工作流 - 顶层数据结构

    一个工作流就是一个有序的栏列表。
    数据从第一栏流向最后一栏。
    """

    id: str = Field(description="工作流唯一 ID")
    name: str = Field(description="工作流名称")
    description: str = Field(default="", description="工作流描述")
    columns: list[Column] = Field(default_factory=list, description="栏列表（有序）")

    def get_block_by_id(self, block_id: str) -> Block | None:
        """通过 ID 查找块"""
        for column in self.columns:
            for block in column.blocks:
                if block.id == block_id:
                    return block
        return None

    def get_sorted_columns(self) -> list[Column]:
        """获取按 order 排序的栏列表"""
        return sorted(self.columns, key=lambda c: c.order)
