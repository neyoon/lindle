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

import logging
from typing import Any

from miniflow.context import BlockResult, Context
from miniflow.llm import call_llm
from miniflow.models import Block, BlockType

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


async def _execute_ai(block: Block, context: Context) -> BlockResult:
    """执行 AI 块

    1. 从上游获取数据（根据连接规则）
    2. 将上游数据自动注入 prompt
    3. 如果定义了 output_schema，要求 LLM 输出 JSON
    4. 返回结果
    """
    # 获取上游数据
    connections = [c.model_dump() for c in block.connections] if block.connections else None
    upstream_data = context.get_upstream_data(connections)

    # 获取配置
    prompt = block.config.prompt or ""
    model = block.config.model
    output_keys = block.output_schema.keys if block.output_schema else None

    # 调用 LLM
    result = await call_llm(
        prompt=prompt,
        context=upstream_data,
        model=model,
        output_keys=output_keys,
    )

    return BlockResult(
        block_id=block.id,
        block_name=block.name,
        data=result,
        output_keys=output_keys,
    )


async def _execute_plugin(block: Block, context: Context) -> BlockResult:
    """执行插件块

    1. 从上游获取数据
    2. 调用已启用的插件
    3. 返回结果
    """
    from plugins.registry import execute_plugin

    connections = [c.model_dump() for c in block.connections] if block.connections else None
    upstream_data = context.get_upstream_data(connections)

    plugin_id = block.config.plugin_id
    if not plugin_id:
        raise ValueError(f"插件块 [{block.name}] 未配置 plugin_id")

    result = await execute_plugin(plugin_id, upstream_data)

    return BlockResult(
        block_id=block.id,
        block_name=block.name,
        data=result,
    )


async def _execute_output(block: Block, context: Context) -> BlockResult:
    """执行输出块

    输出块直接透传上游数据作为最终结果。
    """
    connections = [c.model_dump() for c in block.connections] if block.connections else None
    upstream_data = context.get_upstream_data(connections)

    return BlockResult(
        block_id=block.id,
        block_name=block.name,
        data=upstream_data,
    )
