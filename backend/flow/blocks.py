"""
块实现

核心块类型:
- InputBlock:   接收用户输入
- AIBlock:      调用大模型处理
- OutputBlock:  输出最终结果
- PluginBlock:  调用已启用的插件

设计原则:
- 每个块只有一个入口和一个出口
- 数据传递自动完成，用户无需关心格式转换
- AI 块的 prompt 自动注入上游数据
- 插件以独立模块方式引入工具能力
"""

from __future__ import annotations

import json
import logging
from typing import Any

from flow.context import BlockResult, Context, render_prompt_template, resolve_context_expression
from shared_llm import call_llm
from flow.models import Block, BlockType

logger = logging.getLogger(__name__)


class BlockExecutor:
    """块执行器 - 根据块类型分发执行"""

    @staticmethod
    async def execute(block: Block, context: Context) -> BlockResult:
        """执行一个块"""
        executors = {
            BlockType.INPUT: _execute_input,
            BlockType.AI: _execute_ai,
            BlockType.OUTPUT: _execute_output,
            BlockType.PLUGIN: _execute_plugin,
        }

        executor = executors.get(block.type)
        if executor is None:
            raise ValueError(f"未知的块类型: {block.type}")

        logger.info("执行块: [%s] %s", block.type, block.name)
        return await executor(block, context)


async def _execute_input(block: Block, context: Context) -> BlockResult:
    """执行输入块

    输入块从 context.user_inputs 中获取数据。
    """
    data = context.user_inputs
    return BlockResult(
        block_id=block.id,
        block_name=block.name,
        data=data,
    )


def _resolve_provider(provider_id: str | None) -> dict[str, Any]:
    """根据 provider_id 解析 LLM 调用参数

    返回 dict 包含 model, api_key, base_url（可直接 ** 展开传给 call_llm）。
    如果 provider_id 为空或找不到，则使用默认 Provider。
    """
    from api.routes.settings import get_default_provider, get_provider_by_id

    provider = None
    if provider_id:
        provider = get_provider_by_id(provider_id)

    if provider is None:
        provider = get_default_provider()

    if provider is None:
        return {}  # 全部回退到 llm.py 的全局 _config

    return {
        "model": provider.get("model"),
        "api_key": provider.get("api_key"),
        "base_url": provider.get("base_url"),
    }


def _build_downstream_plugin_hint(context: Context) -> str:
    """根据下游插件的 input_schema 构建格式提示，追加到 AI 块的 prompt 中"""
    if not context.downstream_plugin_hints:
        return ""

    parts = [
        "\n\n---\n"
        "【重要】你的输出将直接作为下游插件的输入，请严格按照以下格式输出："
    ]
    for hint in context.downstream_plugin_hints:
        schema = hint["input_schema"]
        parts.append(f"\n插件「{hint['plugin_name']}」期望的输入格式：")
        parts.append(json.dumps(schema, ensure_ascii=False, indent=2))

        examples = schema.get("examples")
        if examples:
            parts.append("示例：")
            for ex in examples:
                if isinstance(ex, str):
                    parts.append(f"  {ex}")
                else:
                    parts.append(f"  {json.dumps(ex, ensure_ascii=False)}")

        notes = schema.get("notes")
        if notes:
            parts.append(f"注意：{notes}")

    parts.append(
        "\n请直接输出符合上述格式的内容（纯文本或 JSON），不要包含额外的解释或 markdown 格式。"
    )
    return "\n".join(parts)


async def _execute_ai(block: Block, context: Context) -> BlockResult:
    """执行 AI 块

    两种模式:
    - 模板模式: prompt 中含 {{变量}}，渲染后直接发送，不自动追加上游数据
    - 默认模式: prompt 无模板变量，自动把上游数据追加到 context 参数

    block.config.model 存储的是 provider_id（如 "p_1234"），
    执行时自动查找对应 Provider 的完整配置。

    如果下一栏有插件块且未配置输入模板，会自动追加插件期望的输入格式提示。
    """
    # 获取配置
    prompt = block.config.prompt or ""
    output_keys = block.output_schema.keys if block.output_schema else None

    # 解析 Provider 配置
    provider_config = _resolve_provider(block.config.model)

    # 构建下游插件格式提示
    plugin_hint = _build_downstream_plugin_hint(context)

    # 尝试渲染模板变量
    rendered_prompt, has_template = render_prompt_template(prompt, context)

    if has_template:
        logger.info("块 [%s] 使用模板模式，已渲染 {{变量}}", block.name)
        result = await call_llm(
            prompt=rendered_prompt + plugin_hint,
            context="",
            output_keys=output_keys,
            **provider_config,
        )
    else:
        connections = [c.model_dump() for c in block.connections] if block.connections else None
        upstream_data = context.get_upstream_data(connections)
        result = await call_llm(
            prompt=prompt + plugin_hint,
            context=upstream_data,
            output_keys=output_keys,
            **provider_config,
        )

    return BlockResult(
        block_id=block.id,
        block_name=block.name,
        data=result,
        output_keys=output_keys,
    )


async def _execute_plugin(block: Block, context: Context) -> BlockResult:
    """执行插件块

    1. 从上游获取数据（或使用 prompt 模板）
    2. 调用已启用的插件
    3. 返回结果
    """
    from plugins.registry import execute_plugin

    plugin_id = block.config.plugin_id
    if not plugin_id:
        raise ValueError(f"插件块 [{block.name}] 未配置 plugin_id")

    if block.config.plugin_input_bindings:
        payload: dict[str, Any] = {}
        for key, binding in block.config.plugin_input_bindings.items():
            if binding.kind == "literal":
                payload[key] = binding.value
                continue
            payload[key] = resolve_context_expression(str(binding.value), context)
        input_data = json.dumps(payload, ensure_ascii=False)
    elif block.config.prompt:
        # 如果配置了 prompt 模板，使用模板渲染
        from flow.context import render_prompt_template
        input_data, _ = render_prompt_template(block.config.prompt, context)
    else:
        # 否则使用默认的结构化上游数据
        connections = [c.model_dump() for c in block.connections] if block.connections else None
        input_value = context.get_upstream_value(connections)
        input_data = _serialize_plugin_input(input_value)

    result = await execute_plugin(plugin_id, input_data)

    return BlockResult(
        block_id=block.id,
        block_name=block.name,
        data=result,
    )


def _serialize_plugin_input(value: Any) -> str:
    """将结构化值转换为插件可消费的字符串输入"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict | list | int | float | bool):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


async def _execute_output(block: Block, context: Context) -> BlockResult:
    """执行输出块

    输出块直接透传上游数据作为最终结果。
    """
    connections = [c.model_dump() for c in block.connections] if block.connections else None
    upstream_data = context.get_upstream_value(connections)

    return BlockResult(
        block_id=block.id,
        block_name=block.name,
        data=upstream_data,
    )
