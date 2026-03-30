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
    set_plugin_enabled,
    update_plugin_config,
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
    """获取所有插件列表（含状态）"""
    return list_plugins()


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
