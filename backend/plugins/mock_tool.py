"""
Mock 工具插件 - 用于测试插件系统

需要配置一个 token（mock），执行后输出 "123, tool test"。
"""

from __future__ import annotations

from typing import Any

from plugins.base import BasePlugin, PluginMeta, PluginParam


class MockToolPlugin(BasePlugin):
    """Mock 工具插件"""

    meta = PluginMeta(
        id="mock_tool",
        name="Mock 工具",
        description="一个用于测试的模拟插件，需要配置 Token，输出固定结果 '123, tool test'",
        icon="",
        params=[
            PluginParam(
                name="token",
                label="API Token",
                param_type="password",
                required=True,
                description="模拟的 API Token（输入任意值即可）",
            ),
        ],
    )

    async def execute(self, input_data: str, config: dict[str, Any]) -> Any:
        """执行 mock 工具"""
        token = config.get("token", "")
        if not token:
            raise ValueError("Mock 工具需要配置 Token")

        # mock 输出
        return {
            "result": "123, tool test",
            "input_received": input_data[:100] if input_data else "(无输入)",
            "token_valid": True,
        }
