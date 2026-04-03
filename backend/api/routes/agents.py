"""
Agent API

提供 Agent 的 CRUD 操作和自动生成系统提示词的功能
"""

from __future__ import annotations

import time
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.models import Agent, AgentSkill, ChatMessage
from agent.engine import AgentEngine
from shared_llm import call_llm
from plugins.registry import get_plugin
from storage.agent_store import delete_agent, list_agents, load_agent, save_agent

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
    """生成系统提示词请求"""

    agent_name: str
    skills: list[dict]  # [{"skill_id": "...", "name": "...", "description": "..."}]


class GeneratePromptResponse(BaseModel):
    """生成系统提示词响应"""

    system_prompt: str


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
    # 设置时间戳
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

    # 更新时间戳
    agent.updated_at = datetime.now().isoformat()

    if not save_agent(agent):
        raise HTTPException(status_code=500, detail="保存 Agent 失败")
    return agent


@router.delete("/{agent_id}")
async def remove_agent(agent_id: str):
    """删除 Agent"""
    if not delete_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return {"success": True}


@router.post("/generate-prompt", response_model=GeneratePromptResponse)
async def generate_system_prompt(req: GeneratePromptRequest):
    """根据 Agent 名称和 Skills 自动生成系统提示词"""
    if not req.skills:
        # 没有 Skills，返回默认提示词
        return GeneratePromptResponse(
            system_prompt=f"你是 {req.agent_name}，一个智能助手。请根据用户需求提供帮助。"
        )

    # 构建 Skills 描述
    skill_descriptions = []
    for skill_info in req.skills:
        skill_id = skill_info.get("skill_id")
        plugin = get_plugin(skill_id)
        if plugin:
            skill_descriptions.append(
                f"- {plugin.meta.name}: {plugin.meta.description}"
            )

    skills_text = "\n".join(skill_descriptions)

    # 调用 LLM 生成系统提示词
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
        result = await call_llm(prompt=prompt, context="")
        return GeneratePromptResponse(system_prompt=result.strip())
    except Exception as e:
        # 如果生成失败，返回默认提示词
        return GeneratePromptResponse(
            system_prompt=f"你是 {req.agent_name}，一个智能助手。你可以使用以下工具帮助用户：{', '.join([s.get('name', '') for s in req.skills])}。"
        )


class ChatRequest(BaseModel):
    """对话请求"""

    message: str
    history: list[dict] = []  # [{"role": "user", "content": "..."}, ...]


class ChatResponse(BaseModel):
    """对话响应"""

    messages: list[dict]  # 完整的消息列表（包含 tool_call/tool_result）
    reasoning: str = ""  # 思考过程


@router.post("/{agent_id}/chat", response_model=ChatResponse)
async def chat_with_agent(agent_id: str, req: ChatRequest):
    """与 Agent 对话（非流式）"""
    agent = load_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")

    # 转换历史消息
    history = [ChatMessage(**msg) for msg in req.history]

    # 创建引擎并执行
    engine = AgentEngine(agent)
    result = await engine.chat(req.message, history)

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

    # 转换历史消息
    history = [ChatMessage(**msg) for msg in req.history]

    # 创建引擎并执行
    engine = AgentEngine(agent)

    async def event_generator():
        """生成 SSE 事件流"""
        import json
        import logging

        log = logging.getLogger(__name__)

        try:
            async for event in engine.chat_stream(req.message, history):
                # event 格式: {"type": "reasoning"|"message"|"done", "data": ...}
                event_json = json.dumps(event, ensure_ascii=False)
                log.debug(f"SSE event: {event_json[:200]}")
                yield f"data: {event_json}\n\n"
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
        },
    )

