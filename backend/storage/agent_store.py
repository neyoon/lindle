"""
Agent 存储

管理 Agent 的 CRUD 操作，存储为 JSON 文件
"""

from __future__ import annotations

import json
import os
from typing import Any

from agent.models import Agent

# 存储目录
_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "agents")


def _ensure_dir() -> None:
    """确保存储目录存在"""
    os.makedirs(_STORAGE_DIR, exist_ok=True)


def _get_agent_path(agent_id: str) -> str:
    """获取 Agent 文件路径"""
    return os.path.join(_STORAGE_DIR, f"{agent_id}.json")


def list_agents() -> list[dict[str, Any]]:
    """列出所有 Agent（摘要信息）"""
    _ensure_dir()
    agents = []
    for filename in os.listdir(_STORAGE_DIR):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(_STORAGE_DIR, filename), encoding="utf-8") as f:
                    data = json.load(f)
                    agents.append({
                        "id": data["id"],
                        "name": data["name"],
                        "description": data.get("description", ""),
                        "skill_count": len(data.get("skills", [])),
                        "created_at": data.get("created_at", ""),
                        "updated_at": data.get("updated_at", ""),
                    })
            except Exception:
                continue
    return sorted(agents, key=lambda x: x["updated_at"], reverse=True)


def load_agent(agent_id: str) -> Agent | None:
    """加载 Agent"""
    path = _get_agent_path(agent_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
            return Agent(**data)
    except Exception:
        return None


def save_agent(agent: Agent) -> bool:
    """保存 Agent"""
    _ensure_dir()
    try:
        path = _get_agent_path(agent.id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(agent.model_dump(), f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def delete_agent(agent_id: str) -> bool:
    """删除 Agent"""
    path = _get_agent_path(agent_id)
    if not os.path.exists(path):
        return False
    try:
        os.remove(path)
        return True
    except Exception:
        return False
