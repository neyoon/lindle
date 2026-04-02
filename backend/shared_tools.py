"""
预置工具系统

工具是预先构建好的能力，用户通过"工具块"来调用。
用户不需要写代码，只需要从列表中选择工具。

设计原则:
- 每个工具有统一的接口: execute(input_data, params) -> result
- 工具通过注册机制管理
- 新增工具只需要实现 BaseTool 接口
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class BaseTool(ABC):
    """工具基类"""

    name: str = ""
    description: str = ""

    @abstractmethod
    async def execute(self, input_data: str, params: dict[str, Any]) -> Any:
        """执行工具

        Args:
            input_data: 上游块传递过来的数据（已格式化为文本）
            params: 工具参数（在块配置中设置）

        Returns:
            工具执行结果
        """
        ...


# ========== 预置工具 ==========


class WebFetchTool(BaseTool):
    """获取网页内容"""

    name = "web_fetch"
    description = "获取指定 URL 的网页内容"

    async def execute(self, input_data: str, params: dict[str, Any]) -> Any:
        url = params.get("url") or input_data.strip()
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text[:10000]  # 限制长度


class WebSearchTool(BaseTool):
    """网页搜索（占位实现）"""

    name = "web_search"
    description = "搜索网页内容"

    async def execute(self, input_data: str, params: dict[str, Any]) -> Any:
        query = params.get("query") or input_data.strip()
        # 占位实现 - 实际项目中接入搜索 API
        return f"[搜索结果] 关键词: {query}\n（此为占位结果，请接入实际搜索 API）"


class HttpRequestTool(BaseTool):
    """发送 HTTP 请求"""

    name = "http_request"
    description = "发送 HTTP 请求到指定 API"

    async def execute(self, input_data: str, params: dict[str, Any]) -> Any:
        url = params.get("url", "")
        method = params.get("method", "GET").upper()
        headers = params.get("headers", {})
        body = params.get("body") or input_data

        async with httpx.AsyncClient(timeout=30) as client:
            if method == "GET":
                response = await client.get(url, headers=headers)
            elif method == "POST":
                response = await client.post(url, headers=headers, content=body)
            else:
                response = await client.request(method, url, headers=headers, content=body)

            response.raise_for_status()
            try:
                return response.json()
            except Exception:
                return response.text


class TextProcessTool(BaseTool):
    """文本处理工具"""

    name = "text_process"
    description = "对文本进行基础处理（截取、替换、分割等）"

    async def execute(self, input_data: str, params: dict[str, Any]) -> Any:
        action = params.get("action", "trim")

        if action == "trim":
            return input_data.strip()
        elif action == "split":
            delimiter = params.get("delimiter", "\n")
            return input_data.split(delimiter)
        elif action == "truncate":
            max_length = params.get("max_length", 1000)
            return input_data[:max_length]
        elif action == "replace":
            old = params.get("old", "")
            new = params.get("new", "")
            return input_data.replace(old, new)
        else:
            return input_data


# ========== 工具注册 ==========

_TOOL_REGISTRY: dict[str, BaseTool] = {}


def register_tool(tool: BaseTool) -> None:
    """注册工具"""
    _TOOL_REGISTRY[tool.name] = tool


def get_tool(tool_id: str) -> BaseTool:
    """获取工具实例"""
    tool = _TOOL_REGISTRY.get(tool_id)
    if tool is None:
        raise ValueError(f"未知的工具: {tool_id}。可用工具: {list(_TOOL_REGISTRY.keys())}")
    return tool


def list_tools() -> list[dict[str, str]]:
    """列出所有可用工具"""
    return [{"id": t.name, "name": t.name, "description": t.description} for t in _TOOL_REGISTRY.values()]


def _register_builtin_tools() -> None:
    """注册所有内置工具"""
    for tool_class in [WebFetchTool, WebSearchTool, HttpRequestTool, TextProcessTool]:
        register_tool(tool_class())


# 启动时自动注册
_register_builtin_tools()
