"""
Agent 执行引擎

负责处理 Agent 的对话和 Skill 调用
使用 LLM 的 function calling 功能
"""

from __future__ import annotations

import json
import logging
from typing import Any

from agent.models import Agent, ChatMessage
from plugins.registry import execute_plugin, get_plugin
from shared_llm import call_llm

logger = logging.getLogger(__name__)


class AgentEngine:
    """Agent 执行引擎"""

    def __init__(self, agent: Agent):
        self.agent = agent

    async def chat(self, user_message: str, history: list[ChatMessage] | None = None) -> dict[str, Any]:
        """处理用户消息并返回 Agent 响应

        Args:
            user_message: 用户消息
            history: 对话历史

        Returns:
            {
                "message": ChatMessage,
                "tool_calls": [ToolCall, ...],  # 如果调用了工具
                "reasoning": str,  # 思考过程（如果有）
            }
        """
        history = history or []

        # 构建消息列表
        messages = self._build_messages(user_message, history)

        # 构建可用的 tools（如果有 skills）
        tools = self._build_tools() if self.agent.skills else None

        try:
            # 调用 LLM
            if tools:
                # 有 tools，使用 function calling
                response = await self._call_with_tools(messages, tools)
            else:
                # 没有 tools，普通对话
                response = await self._call_simple(messages)

            return response

        except Exception as e:
            logger.exception("Agent 执行失败")
            return {
                "message": ChatMessage(
                    role="assistant",
                    content=f"抱歉，处理消息时出错：{str(e)}",
                ),
                "tool_calls": [],
                "reasoning": "",
            }

    def _build_messages(self, user_message: str, history: list[ChatMessage]) -> list[dict]:
        """构建消息列表"""
        messages = []

        # 系统提示词（包含自动注入的 flows 信息）
        if self.agent.system_prompt:
            system_content = self.agent.system_prompt

            # 自动注入绑定的 Flows 信息（从 workflow_executor Skill 的 config 中读取）
            executor_skill = next(
                (s for s in self.agent.skills if s.skill_id == "workflow_executor"), None
            )
            if executor_skill and executor_skill.config.get("flows"):
                flow_ids = executor_skill.config["flows"].split(",")
                if flow_ids:
                    system_content += "\n\n## 可用的 Flow\n\n"
                    system_content += "你可以使用 workflow_executor Skill 执行以下 Flow：\n\n"

                    from api.routes.workflow import load_workflow

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
                                if block.type == "input" and block.config.get("fields"):
                                    for field in block.config["fields"]:
                                        input_fields.append(
                                            f"  - {field['name']}: {field.get('label', field['name'])}"
                                        )

                        system_content += f"### {workflow.name}\n"
                        system_content += f"- workflow_id: `{workflow.id}`\n"
                        system_content += f"- 描述: {workflow.description}\n"
                        if input_fields:
                            system_content += "- 输入参数:\n" + "\n".join(input_fields) + "\n"
                        system_content += "\n"

            messages.append({
                "role": "system",
                "content": system_content,
            })

        # 历史消息
        for msg in history:
            messages.append({
                "role": msg.role,
                "content": msg.content,
            })

        # 当前用户消息
        messages.append({
            "role": "user",
            "content": user_message,
        })

        return messages

    def _build_tools(self) -> list[dict]:
        """构建 tools 定义（OpenAI function calling 格式）"""
        tools = []

        for agent_skill in self.agent.skills:
            plugin = get_plugin(agent_skill.skill_id)
            if not plugin:
                continue

            # 构建 function 定义
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

        return tools

    async def _call_simple(self, messages: list[dict]) -> dict[str, Any]:
        """简单对话（无 tools）"""
        # 将消息转换为 prompt + context 格式
        system_msg = next((m["content"] for m in messages if m["role"] == "system"), "")
        user_messages = [m["content"] for m in messages if m["role"] == "user"]
        assistant_messages = [m["content"] for m in messages if m["role"] == "assistant"]

        # 构建 context（历史对话）
        context_parts = []
        for i in range(min(len(user_messages) - 1, len(assistant_messages))):
            context_parts.append(f"用户: {user_messages[i]}")
            context_parts.append(f"助手: {assistant_messages[i]}")
        context = "\n".join(context_parts)

        # 当前用户消息
        current_message = user_messages[-1] if user_messages else ""

        # 调用 LLM
        result = await call_llm(
            prompt=system_msg,
            context=context + f"\n用户: {current_message}" if context else current_message,
        )

        # 检查是否是 reasoning 模型（如 o1, o3）
        # 这些模型会在响应中包含思考过程
        reasoning = ""
        content = result

        # 简单检测：如果响应很长且包含"思考"、"分析"等关键词，可能是 reasoning
        if len(result) > 500 and any(keyword in result for keyword in ["思考", "分析", "推理", "考虑"]):
            # 尝试分离 reasoning 和最终回复
            # 这里简化处理，实际应该根据模型的具体格式来解析
            parts = result.split("\n\n", 1)
            if len(parts) == 2:
                reasoning = parts[0]
                content = parts[1]

        return {
            "message": ChatMessage(
                role="assistant",
                content=content,
            ),
            "tool_calls": [],
            "reasoning": reasoning,
        }

    async def _call_with_tools(self, messages: list[dict], tools: list[dict]) -> dict[str, Any]:
        """使用 function calling 的对话"""
        # TODO: 这里需要使用支持 function calling 的 LLM API
        # 目前先简化实现，直接调用普通 LLM

        # 在 system prompt 中添加 tools 信息
        tools_desc = "\n\n你可以使用以下工具：\n"
        for tool in tools:
            func = tool["function"]
            tools_desc += f"- {func['name']}: {func['description']}\n"

        tools_desc += "\n如果需要使用工具，请在回复中明确说明要使用哪个工具以及参数。"

        # 修改 system message
        for msg in messages:
            if msg["role"] == "system":
                msg["content"] += tools_desc
                break
        else:
            messages.insert(0, {"role": "system", "content": tools_desc})

        # 调用简单对话
        return await self._call_simple(messages)
