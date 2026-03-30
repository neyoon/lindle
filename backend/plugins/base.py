"""
插件基类

所有插件继承 BasePlugin，实现 execute 方法即可。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PluginParam:
    """插件需要的配置参数"""

    name: str
    label: str
    param_type: str = "text"  # text, password, number
    required: bool = True
    description: str = ""
    default: str = ""


@dataclass
class PluginMeta:
    """插件元信息（静态描述）"""

    id: str
    name: str
    description: str
    icon: str = ""
    params: list[PluginParam] = field(default_factory=list)


class BasePlugin(ABC):
    """插件基类"""

    meta: PluginMeta

    @abstractmethod
    async def execute(self, input_data: str, config: dict[str, Any]) -> Any:
        """执行插件

        Args:
            input_data: 上游数据（已格式化为文本）
            config: 用户在插件页面配置的参数（如 token）

        Returns:
            执行结果
        """
        ...
