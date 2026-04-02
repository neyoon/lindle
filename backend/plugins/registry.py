"""
插件注册表

管理所有可用插件、启用状态和配置。
状态持久化到 JSON 文件。
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from typing import Any

from plugins.base import BasePlugin, PluginMeta
from plugins.analyst_soul import AnalystSoulSkill
from plugins.mock_tool import MockToolPlugin
from plugins.stock_analysis import StockAnalysisPlugin

# 存储目录
_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_CONFIG_FILE = os.path.join(_STORAGE_DIR, "plugins.json")


def _ensure_dir() -> None:
    os.makedirs(_STORAGE_DIR, exist_ok=True)


# ===== 插件注册 =====

_PLUGINS: dict[str, BasePlugin] = {}


def register_plugin(plugin: BasePlugin) -> None:
    """注册插件"""
    _PLUGINS[plugin.meta.id] = plugin


def get_plugin(plugin_id: str) -> BasePlugin | None:
    """获取插件实例"""
    return _PLUGINS.get(plugin_id)


# ===== 插件状态持久化 =====


def _load_state() -> dict[str, Any]:
    """加载插件状态"""
    if os.path.exists(_CONFIG_FILE):
        with open(_CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_state(state: dict[str, Any]) -> None:
    """保存插件状态"""
    _ensure_dir()
    with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


# ===== 公开 API =====


def list_plugins() -> list[dict[str, Any]]:
    """列出所有插件及其状态（只返回 category='plugin' 的）"""
    state = _load_state()
    result = []
    for plugin_id, plugin in _PLUGINS.items():
        # 只返回 plugin 类型，不返回 skill 类型
        if plugin.meta.category != "plugin":
            continue
        plugin_state = state.get(plugin_id, {})
        result.append({
            "meta": asdict(plugin.meta),
            "enabled": plugin_state.get("enabled", False),
            "config": plugin_state.get("config", {}),
        })
    return result


def list_skills() -> list[dict[str, Any]]:
    """列出所有 Skills（只返回 category='skill' 的）"""
    state = _load_state()
    result = []
    for plugin_id, plugin in _PLUGINS.items():
        # 只返回 skill 类型
        if plugin.meta.category != "skill":
            continue
        plugin_state = state.get(plugin_id, {})
        result.append({
            "meta": asdict(plugin.meta),
            "enabled": plugin_state.get("enabled", False),
            "config": plugin_state.get("config", {}),
        })
    return result


def get_plugin_detail(plugin_id: str) -> dict[str, Any] | None:
    """获取单个插件详情"""
    plugin = _PLUGINS.get(plugin_id)
    if not plugin:
        return None
    state = _load_state()
    plugin_state = state.get(plugin_id, {})
    return {
        "meta": asdict(plugin.meta),
        "enabled": plugin_state.get("enabled", False),
        "config": plugin_state.get("config", {}),
    }


def set_plugin_enabled(plugin_id: str, enabled: bool) -> bool:
    """启用/禁用插件"""
    if plugin_id not in _PLUGINS:
        return False
    state = _load_state()
    if plugin_id not in state:
        state[plugin_id] = {}
    state[plugin_id]["enabled"] = enabled
    _save_state(state)
    return True


def update_plugin_config(plugin_id: str, config: dict[str, str]) -> bool:
    """更新插件配置（如 token）"""
    if plugin_id not in _PLUGINS:
        return False
    state = _load_state()
    if plugin_id not in state:
        state[plugin_id] = {"enabled": False}
    state[plugin_id]["config"] = config
    _save_state(state)
    return True


def get_enabled_plugins() -> list[dict[str, Any]]:
    """获取已启用的插件列表（供工作流使用）"""
    state = _load_state()
    result = []
    for plugin_id, plugin in _PLUGINS.items():
        plugin_state = state.get(plugin_id, {})
        if plugin_state.get("enabled", False):
            result.append({
                "id": plugin.meta.id,
                "name": plugin.meta.name,
                "icon": plugin.meta.icon,
                "description": plugin.meta.description,
                "input_schema": plugin.meta.input_schema or None,
                "output_schema": plugin.meta.output_schema or None,
            })
    return result


async def execute_plugin(plugin_id: str, input_data: str) -> Any:
    """执行插件"""
    plugin = _PLUGINS.get(plugin_id)
    if not plugin:
        raise ValueError(f"插件不存在: {plugin_id}")

    state = _load_state()
    plugin_state = state.get(plugin_id, {})
    if not plugin_state.get("enabled", False):
        raise ValueError(f"插件未启用: {plugin.meta.name}")

    config = plugin_state.get("config", {})
    return await plugin.execute(input_data, config)


# ===== 注册内置插件 =====

def _register_builtin_plugins() -> None:
    register_plugin(AnalystSoulSkill())
    register_plugin(MockToolPlugin())
    register_plugin(StockAnalysisPlugin())


_register_builtin_plugins()
