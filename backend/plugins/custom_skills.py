"""
自定义 Skill 管理

支持用户创建自定义的 Skill（基于 Python 代码）
"""

from __future__ import annotations

import json
import os
from typing import Any

from plugins.base import BasePlugin, PluginMeta

# 存储目录
_CUSTOM_SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "custom_skills")


def _ensure_dir() -> None:
    """确保存储目录存在"""
    os.makedirs(_CUSTOM_SKILLS_DIR, exist_ok=True)


def save_custom_skill(skill_data: dict[str, Any]) -> bool:
    """保存自定义 Skill

    Args:
        skill_data: {
            "id": "custom_skill_xxx",
            "name": "我的 Skill",
            "description": "描述",
            "icon": "",
            "code": "Python 代码",
            "input_schema": {...},
            "output_schema": {...},
        }
    """
    _ensure_dir()
    try:
        skill_id = skill_data["id"]
        file_path = os.path.join(_CUSTOM_SKILLS_DIR, f"{skill_id}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(skill_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def load_custom_skill(skill_id: str) -> dict[str, Any] | None:
    """加载自定义 Skill"""
    file_path = os.path.join(_CUSTOM_SKILLS_DIR, f"{skill_id}.json")
    if not os.path.exists(file_path):
        return None
    try:
        with open(file_path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def list_custom_skills() -> list[dict[str, Any]]:
    """列出所有自定义 Skills"""
    _ensure_dir()
    skills = []
    for filename in os.listdir(_CUSTOM_SKILLS_DIR):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(_CUSTOM_SKILLS_DIR, filename), encoding="utf-8") as f:
                    skill_data = json.load(f)
                    skills.append(skill_data)
            except Exception:
                continue
    return skills


def delete_custom_skill(skill_id: str) -> bool:
    """删除自定义 Skill"""
    file_path = os.path.join(_CUSTOM_SKILLS_DIR, f"{skill_id}.json")
    if not os.path.exists(file_path):
        return False
    try:
        os.remove(file_path)
        return True
    except Exception:
        return False


class CustomSkill(BasePlugin):
    """动态加载的自定义 Skill"""

    def __init__(self, skill_data: dict[str, Any]):
        self.skill_data = skill_data
        self.meta = PluginMeta(
            id=skill_data["id"],
            name=skill_data["name"],
            description=skill_data["description"],
            icon=skill_data.get("icon", ""),
            category="skill",
            params=[],
            input_schema=skill_data.get("input_schema", {}),
            output_schema=skill_data.get("output_schema", {}),
        )

    async def execute(self, input_data: str, config: dict[str, Any]) -> dict:
        """执行自定义 Skill

        使用 exec 执行用户提供的 Python 代码
        """
        try:
            # 准备执行环境
            local_vars = {
                "input_data": input_data,
                "config": config,
                "json": json,
                "result": None,
            }

            # 执行用户代码
            code = self.skill_data.get("code", "")
            exec(code, {"__builtins__": __builtins__}, local_vars)

            # 获取结果
            result = local_vars.get("result")
            if result is None:
                return {"error": "代码未返回结果（请设置 result 变量）"}

            return result

        except Exception as e:
            return {"error": f"执行失败: {str(e)}"}
