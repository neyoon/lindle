"""
插件管理 API
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from plugins.registry import (
    get_enabled_plugins,
    get_plugin_detail,
    list_plugins,
    list_skills,
    set_plugin_enabled,
    update_plugin_config,
)
from plugins.custom_skills import (
    save_custom_skill,
    load_custom_skill,
    list_custom_skills,
    delete_custom_skill,
)

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


# ===== 请求模型 =====


class EnableRequest(BaseModel):
    enabled: bool


class ConfigRequest(BaseModel):
    config: dict[str, str]


# ===== 路由 =====


@router.get("/")
async def get_plugins():
    """获取所有插件列表（含状态，只返回 plugin 类型）"""
    return list_plugins()


@router.get("/skills")
async def get_skills():
    """获取所有 Skills 列表（含状态，只返回 skill 类型）"""
    return list_skills()


@router.get("/enabled")
async def get_enabled():
    """获取已启用的插件列表（供工作流添加块时使用）"""
    return get_enabled_plugins()


@router.get("/{plugin_id}")
async def get_plugin(plugin_id: str):
    """获取单个插件详情"""
    detail = get_plugin_detail(plugin_id)
    if not detail:
        raise HTTPException(404, "插件不存在")
    return detail


@router.put("/{plugin_id}/enabled")
async def toggle_plugin(plugin_id: str, body: EnableRequest):
    """启用/禁用插件"""
    ok = set_plugin_enabled(plugin_id, body.enabled)
    if not ok:
        raise HTTPException(404, "插件不存在")
    return {"ok": True, "enabled": body.enabled}


@router.put("/{plugin_id}/config")
async def set_config(plugin_id: str, body: ConfigRequest):
    """更新插件配置（如 token）"""
    ok = update_plugin_config(plugin_id, body.config)
    if not ok:
        raise HTTPException(404, "插件不存在")
    return {"ok": True}


# ===== 自定义 Skills =====


class CustomSkillRequest(BaseModel):
    id: str
    name: str
    description: str
    icon: str = "🔧"
    code: str
    input_schema: dict = {}
    output_schema: dict = {}


@router.get("/custom-skills")
async def get_custom_skills():
    """获取所有自定义 Skills"""
    return list_custom_skills()


@router.post("/custom-skills")
async def create_custom_skill(body: CustomSkillRequest):
    """创建自定义 Skill"""
    skill_data = body.model_dump()
    ok = save_custom_skill(skill_data)
    if not ok:
        raise HTTPException(500, "保存失败")
    return {"ok": True, "skill": skill_data}


@router.get("/custom-skills/{skill_id}")
async def get_custom_skill(skill_id: str):
    """获取单个自定义 Skill"""
    skill = load_custom_skill(skill_id)
    if not skill:
        raise HTTPException(404, "Skill 不存在")
    return skill


@router.delete("/custom-skills/{skill_id}")
async def remove_custom_skill(skill_id: str):
    """删除自定义 Skill"""
    ok = delete_custom_skill(skill_id)
    if not ok:
        raise HTTPException(404, "Skill 不存在")
    return {"ok": True}

