"""
Agent 执行引擎

负责处理 Agent 的对话和 Skill 调用。
使用 LLM 的 function calling 功能实现多轮工具调用。

核心流程:
  用户消息 → LLM(带 tools) → tool_calls?
    ├─ 是 → 执行工具 → 注入结果 → 继续调用 LLM → 循环
    └─ 否 → 返回最终回复
"""

from __future__ import annotations

import json
import logging
from typing import Any

from agent.models import Agent, ChatMessage
from plugins.registry import execute_plugin, get_plugin
from shared_llm import call_llm_with_messages, call_llm_with_messages_stream

logger = logging.getLogger(__name__)

# 最大工具调用轮数
MAX_TOOL_ROUNDS = 5


class AgentEngine:
    """Agent 执行引擎"""

    def __init__(self, agent: Agent):
        self.agent = agent

    async def chat_stream(
        self, user_message: str, history: list[ChatMessage] | None = None
    ):
        """流式处理用户消息，实时返回 reasoning 和消息

        Yields:
            {"type": "reasoning", "data": str}  # 思考过程
            {"type": "message", "data": ChatMessage}  # 消息（tool_call/tool_result/assistant）
            {"type": "done", "data": None}  # 完成
        """
        history = history or []

        # 构建初始消息列表
        api_messages = self._build_messages(user_message, history)

        # 构建可用的 tools
        tools = self._build_tools() if self.agent.skills else None

        # 解析 Provider 配置
        provider_config = self._resolve_provider()

        try:
            for round_num in range(MAX_TOOL_ROUNDS + 1):
                # 流式调用 LLM
                full_content = ""
                full_reasoning = ""
                tool_calls = None

                async for chunk in call_llm_with_messages_stream(
                    messages=api_messages,
                    tools=tools,
                    **provider_config,
                ):
                    print(f"[Agent] 收到 chunk: type={chunk['type']}")
                    if chunk["type"] == "reasoning":
                        # 实时发送 reasoning
                        full_reasoning += chunk["data"]
                        yield {
                            "type": "reasoning",
                            "data": chunk["data"],
                        }
                    elif chunk["type"] == "content":
                        # 实时发送 content
                        full_content += chunk["data"]
                        print(f"[Agent] 收到 content: {len(chunk['data'])} 字符, 累计: {len(full_content)}")
                        yield {
                            "type": "content",
                            "data": chunk["data"],
                        }
                    elif chunk["type"] == "tool_calls":
                        tool_calls = chunk["data"]
                    elif chunk["type"] == "done":
                        # 获取完整结果
                        result = chunk["data"]
                        tool_calls = result.get("tool_calls")

                if not tool_calls:
                    # 没有工具调用 → 最终回复（已经通过 content 流式发送）
                    # 发送完整的 assistant 消息
                    print(f"[Agent] 最终回复，content 长度: {len(full_content)}")
                    msg = ChatMessage(role="assistant", content=full_content)
                    yield {
                        "type": "message",
                        "data": msg.model_dump(),
                    }
                    break

                # 有工具调用
                assistant_content = full_content or ""
                tool_call_infos = []
                for tc in tool_calls:
                    func = tc.get("function", {})
                    tool_call_infos.append({
                        "id": tc.get("id", ""),
                        "name": func.get("name", ""),
                        "arguments": func.get("arguments", "{}"),
                    })

                msg = ChatMessage(
                    role="tool_call",
                    content=assistant_content,
                    tool_calls=tool_call_infos,
                )
                yield {
                    "type": "message",
                    "data": msg.model_dump(),
                }

                # 将 assistant 消息添加到 api_messages
                api_messages.append({
                    "role": "assistant",
                    "content": assistant_content or None,
                    "tool_calls": tool_calls,
                })

                # 执行工具
                for tc in tool_calls:
                    tc_id = tc.get("id", "")
                    func = tc.get("function", {})
                    tool_name = func.get("name", "")
                    arguments_str = func.get("arguments", "{}")

                    logger.info(
                        "Agent [%s] 调用工具: %s, 参数: %s",
                        self.agent.name, tool_name, arguments_str[:200],
                    )

                    # 发送工具执行开始的提示
                    yield {
                        "type": "tool_status",
                        "data": {
                            "tool_name": tool_name,
                            "status": "executing",
                            "message": f"正在执行 {tool_name}..."
                        }
                    }

                    # 执行工具（支持流式进度）
                    tool_result = None
                    async for event in self._execute_tool_stream(
                        tool_name, arguments_str
                    ):
                        if event["type"] == "progress":
                            # 转发工具的进度事件
                            yield {
                                "type": "tool_status",
                                "data": {
                                    "tool_name": tool_name,
                                    "status": "executing",
                                    "message": event["data"]
                                }
                            }
                        elif event["type"] == "result":
                            print(f"[Agent] 收到工具结果")
                            tool_result = event["data"]

                    tool_result_str = (
                        json.dumps(tool_result, ensure_ascii=False, indent=2)
                        if isinstance(tool_result, dict | list)
                        else str(tool_result)
                    )

                    # 发送 tool_result
                    msg = ChatMessage(
                        role="tool_result",
                        content=tool_result_str,
                        tool_call_id=tc_id,
                        tool_name=tool_name,
                    )
                    yield {
                        "type": "message",
                        "data": msg.model_dump(),
                    }

                    # 添加到 api_messages
                    api_messages.append({
                        "role": "tool",
                        "tool_call_id": tc_id,
                        "content": tool_result_str,
                    })

                logger.info(
                    "Agent [%s] 完成第 %d 轮工具调用",
                    self.agent.name, round_num + 1,
                )

            else:
                # 超过最大轮数
                msg = ChatMessage(
                    role="assistant",
                    content="工具调用次数已达上限，我将基于已有结果进行回复。"
                )
                yield {
                    "type": "message",
                    "data": msg.model_dump(),
                }

            yield {"type": "done", "data": None}

        except Exception as e:
            logger.exception("Agent 执行失败")
            msg = ChatMessage(
                role="assistant",
                content=f"抱歉，处理消息时出错：{str(e)}",
            )
            yield {
                "type": "message",
                "data": msg.model_dump(),
            }
            yield {"type": "done", "data": None}

    async def chat(
        self, user_message: str, history: list[ChatMessage] | None = None
    ) -> dict[str, Any]:
        """处理用户消息并返回 Agent 响应

        返回完整的消息列表，包含 tool_call 和 tool_result 消息，
        前端可以展示完整的调用链路。

        Returns:
            {
                "messages": [ChatMessage, ...],
                "reasoning": str,  # 思考过程（如果模型支持）
            }
        """
        history = history or []

        # 构建初始消息列表
        api_messages = self._build_messages(user_message, history)

        # 构建可用的 tools
        tools = self._build_tools() if self.agent.skills else None

        # 解析 Provider 配置
        provider_config = self._resolve_provider()

        # 存储要返回给前端的消息
        output_messages: list[ChatMessage] = []
        reasoning = ""

        try:
            for round_num in range(MAX_TOOL_ROUNDS + 1):
                # 调用 LLM
                llm_response = await call_llm_with_messages(
                    messages=api_messages,
                    tools=tools,
                    **provider_config,
                )

                # 收集 reasoning
                if llm_response.get("reasoning"):
                    if reasoning:
                        reasoning += "\n\n"
                    reasoning += llm_response["reasoning"]

                tool_calls = llm_response.get("tool_calls")

                if not tool_calls:
                    # 没有工具调用 → 最终回复
                    content = llm_response.get("content") or ""
                    output_messages.append(
                        ChatMessage(role="assistant", content=content)
                    )
                    break

                # 有工具调用
                # 1) 添加 assistant 消息（包含 tool_calls 信息）
                assistant_content = llm_response.get("content") or ""
                tool_call_infos = []
                for tc in tool_calls:
                    func = tc.get("function", {})
                    tool_call_infos.append({
                        "id": tc.get("id", ""),
                        "name": func.get("name", ""),
                        "arguments": func.get("arguments", "{}"),
                    })

                output_messages.append(
                    ChatMessage(
                        role="tool_call",
                        content=assistant_content,
                        tool_calls=tool_call_infos,
                    )
                )

                # 2) 将 assistant 消息添加到 api_messages（OpenAI 格式）
                api_messages.append({
                    "role": "assistant",
                    "content": assistant_content or None,
                    "tool_calls": tool_calls,
                })

                # 3) 逐个执行工具
                for tc in tool_calls:
                    tc_id = tc.get("id", "")
                    func = tc.get("function", {})
                    tool_name = func.get("name", "")
                    arguments_str = func.get("arguments", "{}")

                    logger.info(
                        "Agent [%s] 调用工具: %s, 参数: %s",
                        self.agent.name, tool_name, arguments_str[:200],
                    )

                    # 执行工具
                    tool_result = await self._execute_tool(
                        tool_name, arguments_str
                    )
                    tool_result_str = (
                        json.dumps(tool_result, ensure_ascii=False, indent=2)
                        if isinstance(tool_result, dict | list)
                        else str(tool_result)
                    )

                    # 添加 tool_result 消息给前端
                    output_messages.append(
                        ChatMessage(
                            role="tool_result",
                            content=tool_result_str,
                            tool_call_id=tc_id,
                            tool_name=tool_name,
                        )
                    )

                    # 添加 tool result 到 api_messages（OpenAI 格式）
                    api_messages.append({
                        "role": "tool",
                        "tool_call_id": tc_id,
                        "content": tool_result_str,
                    })

                logger.info(
                    "Agent [%s] 完成第 %d 轮工具调用",
                    self.agent.name, round_num + 1,
                )

            else:
                # 超过最大轮数
                output_messages.append(
                    ChatMessage(
                        role="assistant",
                        content="工具调用次数已达上限，我将基于已有结果进行回复。"
                    )
                )

            return {
                "messages": output_messages,
                "reasoning": reasoning,
            }

        except Exception as e:
            logger.exception("Agent 执行失败")
            output_messages.append(
                ChatMessage(
                    role="assistant",
                    content=f"抱歉，处理消息时出错：{str(e)}",
                )
            )
            return {
                "messages": output_messages,
                "reasoning": reasoning,
            }

    def _resolve_provider(self) -> dict[str, Any]:
        """解析 Agent 的 Provider 配置"""
        from api.routes.settings import get_default_provider, get_provider_by_id

        provider = None
        if self.agent.model_provider_id:
            provider = get_provider_by_id(self.agent.model_provider_id)

        if provider is None:
            provider = get_default_provider()

        if provider is None:
            return {}

        return {
            "model": provider.get("model"),
            "api_key": provider.get("api_key"),
            "base_url": provider.get("base_url"),
        }

    def _build_messages(
        self, user_message: str, history: list[ChatMessage]
    ) -> list[dict]:
        """构建消息列表"""
        messages = []

        # 系统提示词
        system_content = self.agent.system_prompt or ""

        # 自动注入绑定的 Flows 信息
        system_content += self._build_flow_info()

        if system_content:
            messages.append({"role": "system", "content": system_content})

        # 历史消息 — 将 tool_call/tool_result 转换为 OpenAI 格式
        for msg in history:
            if msg.role == "tool_call":
                # 还原 assistant + tool_calls 消息
                api_msg: dict[str, Any] = {
                    "role": "assistant",
                    "content": msg.content or None,
                }
                if msg.tool_calls:
                    api_msg["tool_calls"] = [
                        {
                            "id": tc.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": tc.get("name", ""),
                                "arguments": tc.get("arguments", "{}"),
                            },
                        }
                        for tc in msg.tool_calls
                    ]
                messages.append(api_msg)

            elif msg.role == "tool_result":
                messages.append({
                    "role": "tool",
                    "tool_call_id": msg.tool_call_id or "",
                    "content": msg.content,
                })

            elif msg.role in ("user", "assistant"):
                messages.append({
                    "role": msg.role,
                    "content": msg.content,
                })

        # 当前用户消息
        messages.append({"role": "user", "content": user_message})

        return messages

    def _build_flow_info(self) -> str:
        """自动注入绑定的 Flows 信息到 system prompt"""
        executor_skill = next(
            (s for s in self.agent.skills if s.skill_id == "workflow_executor"),
            None,
        )
        if not executor_skill or not executor_skill.config.get("flows"):
            return ""

        flow_ids = executor_skill.config["flows"].split(",")
        if not flow_ids:
            return ""

        from flow.models import BlockType
        from storage.file_store import load_workflow

        parts = ["\n\n## 可用的 Flow\n"]
        parts.append("你可以使用 workflow_executor 工具执行以下 Flow。")
        parts.append("调用时需要传入 workflow_id 和对应的 inputs 参数。\n")

        for flow_id in flow_ids:
            flow_id = flow_id.strip()
            if not flow_id:
                continue
            workflow = load_workflow(flow_id)
            if not workflow:
                continue

            # 提取输入字段
            input_fields = []
            for col in workflow.columns:
                for block in col.blocks:
                    if block.type == BlockType.INPUT and block.config.fields:
                        for field in block.config.fields:
                            label = field.label or field.name
                            required = "必填" if field.required else "可选"
                            default_str = f"，默认: {field.default}" if field.default else ""
                            input_fields.append(
                                f"  - `{field.name}` ({required}): {label}{default_str}"
                            )

            # 提取输出信息
            output_info = []
            sorted_cols = workflow.get_sorted_columns()
            if sorted_cols:
                last_col = sorted_cols[-1]
                for block in last_col.blocks:
                    if block.type == BlockType.OUTPUT:
                        output_info.append(f"  - [{block.name}]: 透传上游结果")
                    elif block.type == BlockType.AI:
                        if block.output_schema and block.output_schema.keys:
                            keys_str = ", ".join(block.output_schema.keys)
                            output_info.append(
                                f"  - [{block.name}]: JSON 输出, keys: {keys_str}"
                            )
                        else:
                            output_info.append(f"  - [{block.name}]: 文本输出")

            parts.append(f"### {workflow.name}")
            parts.append(f"- workflow_id: `{workflow.id}`")
            if workflow.description:
                parts.append(f"- 描述: {workflow.description}")
            if input_fields:
                parts.append("- 输入参数:")
                parts.extend(input_fields)
            else:
                parts.append("- 输入参数: 无（传空对象 `{}` 即可）")
            if output_info:
                parts.append("- 输出:")
                parts.extend(output_info)
            parts.append("")

        return "\n".join(parts)

    def _build_tools(self) -> list[dict] | None:
        """构建 tools 定义（OpenAI function calling 格式）"""
        tools = []

        for agent_skill in self.agent.skills:
            plugin = get_plugin(agent_skill.skill_id)
            if not plugin:
                continue

            function_def = {
                "type": "function",
                "function": {
                    "name": plugin.meta.id,
                    "description": plugin.meta.description,
                    "parameters": plugin.meta.input_schema or {
                        "type": "object",
                        "properties": {},
                    },
                },
            }
            tools.append(function_def)

        return tools if tools else None

    async def _execute_tool(
        self, tool_name: str, arguments_str: str
    ) -> Any:
        """执行工具调用（同步版本，用于非流式场景）

        Args:
            tool_name: 工具名称（plugin_id）
            arguments_str: JSON 格式的参数字符串

        Returns:
            工具执行结果
        """
        try:
            result = await execute_plugin(tool_name, arguments_str)
            return result
        except Exception as e:
            logger.error("工具 [%s] 执行失败: %s", tool_name, e)
            return {"error": f"工具执行失败: {str(e)}"}

    async def _execute_tool_stream(
        self, tool_name: str, arguments_str: str
    ):
        """执行工具调用（流式版本，支持进度回调）

        Yields:
            {"type": "progress", "data": str}  # 进度消息
            {"type": "result", "data": Any}    # 最终结果
        """
        try:
            # 检查工具是否支持流式执行
            from plugins.registry import get_plugin
            plugin = get_plugin(tool_name)

            # 如果工具有 execute_stream 方法，使用流式执行
            if plugin and hasattr(plugin, 'execute_stream'):
                async for event in plugin.execute_stream(arguments_str, {}):
                    yield event
            else:
                # 否则使用普通执行
                result = await execute_plugin(tool_name, arguments_str)
                yield {"type": "result", "data": result}
        except Exception as e:
            logger.error("工具 [%s] 执行失败: %s", tool_name, e)
            yield {"type": "result", "data": {"error": f"工具执行失败: {str(e)}"}}
