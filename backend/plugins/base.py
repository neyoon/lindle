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
    category: str = "plugin"  # "plugin" 或 "skill"，skill 只在 Agent 中显示
    params: list[PluginParam] = field(default_factory=list)
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] = field(default_factory=dict)


def describe_json_schema(schema: dict[str, Any] | None) -> str:
    """把 JSON Schema 转成更适合 LLM 理解的简明文本。"""
    if not schema:
        return ""

    parts: list[str] = []
    description = schema.get("description")
    if description:
        parts.append(str(description))

    def _describe_object(obj_schema: dict[str, Any], label: str | None = None) -> str:
        required = set(obj_schema.get("required", []))
        properties = obj_schema.get("properties", {})
        if not properties:
            return f"{label + ': ' if label else ''}对象"

        fields: list[str] = []
        for name, prop in properties.items():
            prop = prop or {}
            prop_type = prop.get("type", "any")
            req = "必填" if name in required else "可选"
            enum = prop.get("enum")
            enum_hint = f"，可选值: {', '.join(map(str, enum))}" if enum else ""
            desc = prop.get("description", "")
            desc_hint = f"，说明: {desc}" if desc else ""
            fields.append(f"`{name}` ({prop_type}, {req}{enum_hint}{desc_hint})")
        prefix = f"{label}: " if label else ""
        return prefix + "；".join(fields)

    if schema.get("type") == "object":
        parts.append(_describe_object(schema))

    variants = schema.get("oneOf")
    if isinstance(variants, list) and variants:
        variant_lines: list[str] = []
        for idx, option in enumerate(variants, start=1):
            if option.get("type") == "object":
                variant_desc = option.get("description") or f"形式 {idx}"
                variant_lines.append(_describe_object(option, variant_desc))
        if variant_lines:
            parts.append("支持的输入形式：")
            parts.extend(f"- {line}" for line in variant_lines)

    examples = schema.get("examples")
    if isinstance(examples, list) and examples:
        example_lines = [str(example) for example in examples[:3]]
        parts.append("示例：")
        parts.extend(f"- {line}" for line in example_lines)

    notes = schema.get("notes")
    if notes:
        parts.append(f"注意：{notes}")

    return "\n".join(parts)


class BasePlugin(ABC):
    """插件基类"""

    meta: PluginMeta

    @abstractmethod
    async def execute(self, input_data: str, config: dict[str, Any]) -> Any:
        """执行插件

        Args:
            input_data: 上游数据，通常为纯文本或 JSON 字符串
            config: 用户在插件页面配置的参数（如 token）

        Returns:
            执行结果
        """
        ...
