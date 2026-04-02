"""
核心数据模型

设计原则:
- Workflow 由有序的 Column（栏）组成
- Column 内的多个 Block 并行执行
- Column 之间顺序执行（从左到右）
- Block 之间的数据传递默认自动流通，可通过 Connection 精确指定
- Block 可选定义 OutputSchema（JSON key），作为高级选项
- BlockTemplate 是可复用的块模板（制造工坊的产物）
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class BlockType(str, Enum):
    """块类型 - 3 种核心 + 插件"""

    INPUT = "input"
    AI = "ai"
    OUTPUT = "output"
    PLUGIN = "plugin"


class OutputSchema(BaseModel):
    """输出结构定义（高级选项）"""

    keys: list[str] = Field(default_factory=list, description="JSON 输出的 key 列表")
    descriptions: dict[str, str] = Field(
        default_factory=dict,
        description="每个 key 的描述（可选）",
    )


class Connection(BaseModel):
    """连接定义"""

    from_block_id: str = Field(description="来源块 ID")
    from_key: str | None = Field(default=None, description="来源块输出的特定 JSON key（可选）")


class BlockConfig(BaseModel):
    """块的配置"""

    prompt: str | None = Field(default=None, description="AI 块的提示词")
    model: str | None = Field(default=None, description="AI 块使用的模型")
    fields: list[InputField] | None = Field(default=None, description="输入字段定义")
    plugin_id: str | None = Field(default=None, description="插件 ID")


class InputField(BaseModel):
    """输入字段"""

    name: str
    label: str = ""
    field_type: str = "text"
    required: bool = True
    default: Any = None


# 重建 BlockConfig 使其能引用 InputField
BlockConfig.model_rebuild()


class Block(BaseModel):
    """块 - 工作流的最小单元"""

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
    """栏 - 代表一个执行步骤"""

    id: str = Field(description="栏唯一 ID")
    order: int = Field(description="栏的顺序（从 0 开始）")
    blocks: list[Block] = Field(default_factory=list, description="栏内的块列表")
    repeat: int = Field(default=1, description="重复执行次数（默认 1）")


class Workflow(BaseModel):
    """工作流 - 顶层数据结构"""

    id: str = Field(description="工作流唯一 ID")
    name: str = Field(description="工作流名称")
    description: str = Field(default="", description="工作流描述")
    columns: list[Column] = Field(default_factory=list, description="栏列表（有序）")

    def get_block_by_id(self, block_id: str) -> Block | None:
        for column in self.columns:
            for block in column.blocks:
                if block.id == block_id:
                    return block
        return None

    def get_sorted_columns(self) -> list[Column]:
        return sorted(self.columns, key=lambda c: c.order)


class BlockTemplate(BaseModel):
    """可复用块模板 - 制造工坊的产物

    制造完成后，模板会像内置块一样出现在工作流编辑器的添加菜单中。
    存储在 workspace 目录下。
    """

    id: str = Field(description="模板唯一 ID")
    type: BlockType = Field(description="块类型")
    name: str = Field(description="模板名称")
    description: str = Field(default="", description="描述")
    icon: str = Field(default="", description="图标")
    config: BlockConfig = Field(default_factory=BlockConfig, description="预设配置")
    output_schema: OutputSchema | None = Field(default=None, description="输出结构")
    created_at: str = Field(default="", description="创建时间")
