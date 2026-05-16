"""
Agent API

提供 Agent 的 CRUD 操作和自动生成系统提示词的功能
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent.models import Agent, AgentConversation, ChatMessage
from agent.engine import AgentEngine
from exporters import build_agent_export
from plugins.base import describe_json_schema
from shared_llm import call_llm
from plugins.registry import get_plugin
from storage.agent_store import delete_agent, list_agents, load_agent, save_agent
from storage.agent_chat_store import (
    delete_agent_conversation,
    load_agent_conversation,
    save_agent_conversation,
)
from api.routes.settings import get_default_provider

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentSummary(BaseModel):
    """Agent 摘要信息"""

    id: str
    name: str
    description: str
    skill_count: int
    created_at: str
    updated_at: str


class GeneratePromptRequest(BaseModel):
    agent_name: str
    skills: list[dict]


class GeneratePromptResponse(BaseModel):
    system_prompt: str


class ConversationResponse(BaseModel):
    agent_id: str
    messages: list[dict] = Field(default_factory=list)
    updated_at: str | None = None


@router.get("/", response_model=list[AgentSummary])
async def get_agents():
    """获取所有 Agent 列表"""
    agents = list_agents()
    return [AgentSummary(**agent) for agent in agents]


@router.get("/{agent_id}", response_model=Agent)
async def get_agent(agent_id: str):
    """获取单个 Agent 详情"""
    agent = load_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return agent


@router.post("/", response_model=Agent)
async def create_agent(agent: Agent):
    """创建新 Agent"""
    now = datetime.now().isoformat()
    agent.created_at = now
    agent.updated_at = now

    if not save_agent(agent):
        raise HTTPException(status_code=500, detail="保存 Agent 失败")
    return agent


@router.put("/{agent_id}", response_model=Agent)
async def update_agent(agent_id: str, agent: Agent):
    """更新 Agent"""
    if agent.id != agent_id:
        raise HTTPException(status_code=400, detail="Agent ID 不匹配")

    existing = load_agent(agent_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    agent.updated_at = datetime.now().isoformat()

    if not save_agent(agent):
        raise HTTPException(status_code=500, detail="保存 Agent 失败")
    return agent


@router.delete("/{agent_id}")
async def remove_agent(agent_id: str):
    """删除 Agent"""
    if not delete_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent 不存在")
    delete_agent_conversation(agent_id)
    return {"success": True}


@router.get("/{agent_id}/export")
async def export_agent(agent_id: str):
    """导出 Agent 结构化清单。"""
    agent = load_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return build_agent_export(agent)


@router.get("/{agent_id}/conversation", response_model=ConversationResponse)
async def get_agent_conversation(agent_id: str):
    """获取 Agent 已保存的对话。"""
    agent = load_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    conversation = load_agent_conversation(agent_id)
    if not conversation:
        return ConversationResponse(agent_id=agent_id, messages=[], updated_at=None)

    return ConversationResponse(
        agent_id=agent_id,
        messages=[message.model_dump() for message in conversation.messages],
        updated_at=conversation.updated_at,
    )


@router.delete("/{agent_id}/conversation")
async def clear_agent_conversation(agent_id: str):
    """清空 Agent 已保存的对话。"""
    agent = load_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    delete_agent_conversation(agent_id)
    return {"success": True}


@router.post("/generate-prompt", response_model=GeneratePromptResponse)
async def generate_system_prompt(req: GeneratePromptRequest):
    """根据 Agent 名称和 Skills 自动生成系统提示词"""
    if not req.skills:
        return GeneratePromptResponse(
            system_prompt=f"你是 {req.agent_name}，一个智能助手。请根据用户需求提供帮助。"
        )

    skill_descriptions = []
    for skill_info in req.skills:
        skill_id = skill_info.get("skill_id")
        plugin = get_plugin(skill_id)
        if plugin:
            input_summary = describe_json_schema(plugin.meta.input_schema)
            output_summary = describe_json_schema(plugin.meta.output_schema)
            skill_descriptions.append(
                "\n".join([
                    f"- {plugin.meta.name}: {plugin.meta.description}",
                    f"  输入要求: {input_summary or '无特别要求'}",
                    f"  输出形式: {output_summary or '无固定结构'}",
                ])
            )

    skills_text = "\n".join(skill_descriptions)

    prompt = f"""请为一个 AI Agent 生成系统提示词。

Agent 名称：{req.agent_name}
可用工具：
{skills_text}

要求：
1. 简洁明了，150-200字
2. 说明 Agent 的角色和能力
3. 强调可以使用这些工具来帮助用户
4. 语气专业友好
5. 直接输出提示词内容，不要有"系统提示词："等前缀

示例格式：
你是一个专业的XXX助手，擅长...。你可以使用以下工具：...。请根据用户需求，灵活运用这些工具提供帮助。
"""

    try:
        provider = get_default_provider()
        provider_config = {}
        if provider:
            provider_config = {
                "model": provider.get("model"),
                "api_key": provider.get("api_key"),
                "base_url": provider.get("base_url"),
                "protocol": provider.get("protocol") or "openai",
                "api_version": provider.get("api_version") or "",
            }
        result = await call_llm(prompt=prompt, context="", **provider_config)
        return GeneratePromptResponse(system_prompt=result.strip())
    except Exception:
        return GeneratePromptResponse(
            system_prompt=f"你是 {req.agent_name}，一个智能助手。你可以使用以下工具帮助用户：{', '.join([s.get('name', '') for s in req.skills])}。"
        )


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)


class ChatResponse(BaseModel):
    messages: list[dict]
    reasoning: str = ""


def _build_saved_conversation(
    agent_id: str,
    history: list[ChatMessage],
    user_message: str,
    output_messages: list[ChatMessage],
) -> AgentConversation:
    messages = [*history, ChatMessage(role="user", content=user_message), *output_messages]
    return save_agent_conversation(
        agent_id,
        [message.model_dump() for message in messages],
    )


@router.post("/{agent_id}/chat", response_model=ChatResponse)
async def chat_with_agent(agent_id: str, req: ChatRequest):
    """与 Agent 对话（非流式）"""
    agent = load_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    if req.history:
        history = [ChatMessage(**msg) for msg in req.history]
    else:
        conversation = load_agent_conversation(agent_id)
        history = conversation.messages if conversation else []

    engine = AgentEngine(agent)
    result = await engine.chat(req.message, history)
    _build_saved_conversation(agent_id, history, req.message, result["messages"])

    return ChatResponse(
        messages=[msg.model_dump() for msg in result["messages"]],
        reasoning=result.get("reasoning", ""),
    )


@router.post("/{agent_id}/chat-stream")
async def chat_with_agent_stream(agent_id: str, req: ChatRequest):
    """与 Agent 对话（流式响应）"""
    agent = load_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    if req.history:
        history = [ChatMessage(**msg) for msg in req.history]
    else:
        conversation = load_agent_conversation(agent_id)
        history = conversation.messages if conversation else []

    engine = AgentEngine(agent)

    async def event_generator():
        """生成 SSE 事件流"""
        import json
        import logging

        log = logging.getLogger(__name__)
        output_messages: list[ChatMessage] = []

        try:
            async for event in engine.chat_stream(req.message, history):
                if event["type"] == "tool_call":
                    output_messages.append(ChatMessage(
                        role="tool_call",
                        content=event["data"].get("content", ""),
                        tool_calls=event["data"].get("tool_calls"),
                    ))
                elif event["type"] == "tool_result":
                    output_messages.append(ChatMessage(
                        role="tool_result",
                        content=event["data"].get("content", ""),
                        tool_call_id=event["data"].get("tool_call_id"),
                        tool_name=event["data"].get("tool_name"),
                    ))
                elif event["type"] == "assistant_message":
                    output_messages.append(ChatMessage(
                        role="assistant",
                        content=event["data"].get("content", ""),
                    ))

                event_json = json.dumps(event, ensure_ascii=False)
                yield f"data: {event_json}\n\n"

            if output_messages:
                _build_saved_conversation(agent_id, history, req.message, output_messages)
        except Exception as e:
            log.exception("Agent 流式对话失败")
            error_event = {
                "type": "error",
                "data": {"message": str(e)}
            }
            yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
