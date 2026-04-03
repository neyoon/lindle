"""
Agent 数据模型

Agent 是一个可以动态调用 Skills 的智能助手
Skills 复用现有的 Plugin 系统
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class AgentSkill(BaseModel):
    """Agent 中的 Skill 配置"""

    skill_id: str = Field(description="对应的 Plugin ID")
    order: int = Field(description="顺序（影响 Agent 的决策优先级）")
    config: dict[str, str] = Field(
        default_factory=dict,
        description="这个 Skill 实例的配置（如 API Key）",
    )


class Agent(BaseModel):
    """Agent 定义"""

    id: str = Field(description="Agent 唯一 ID")
    name: str = Field(description="Agent 名称")
    description: str = Field(default="", description="Agent 描述")
    system_prompt: str = Field(description="系统提示词")
    model_provider_id: str | None = Field(
        default=None,
        description="使用的 LLM Provider ID",
    )
    skills: list[AgentSkill] = Field(
        default_factory=list,
        description="已激活的 Skills",
    )
    created_at: str = Field(description="创建时间")
    updated_at: str = Field(description="更新时间")


class ChatMessage(BaseModel):
    """对话消息"""

    role: str = Field(description="角色: user, assistant, tool_call, tool_result")
    content: str = Field(description="消息内容")
    tool_calls: list[dict] | None = Field(
        default=None,
        description="工具调用列表（role=tool_call 时使用）",
    )
    tool_call_id: str | None = Field(
        default=None,
        description="关联的工具调用 ID（role=tool_result 时使用）",
    )
    tool_name: str | None = Field(
        default=None,
        description="工具名称（role=tool_result 时使用）",
    )


class ToolCall(BaseModel):
    """工具调用记录"""

    skill_id: str = Field(description="Skill ID")
    skill_name: str = Field(description="Skill 名称")
    input: str = Field(description="输入数据")
    output: str = Field(description="输出结果")
