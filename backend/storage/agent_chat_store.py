"""
Agent 对话存储

保存每个 Agent 的最近一段对话历史。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from agent.models import AgentConversation
from storage.local_paths import ensure_parent, get_local_file


def _conversation_path(agent_id: str):
    return get_local_file("agent_conversations", f"{agent_id}.json")


def load_agent_conversation(agent_id: str) -> AgentConversation | None:
    path = _conversation_path(agent_id)
    if not path.exists():
        return None

    try:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
        return AgentConversation.model_validate(payload)
    except Exception:
        return None


def save_agent_conversation(agent_id: str, messages: list[dict] | list) -> AgentConversation:
    conversation = AgentConversation(
        agent_id=agent_id,
        messages=messages,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    path = _conversation_path(agent_id)
    ensure_parent(path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(conversation.model_dump(), f, ensure_ascii=False, indent=2)
    return conversation


def delete_agent_conversation(agent_id: str) -> bool:
    path = _conversation_path(agent_id)
    if not path.exists():
        return False
    path.unlink()
    return True
