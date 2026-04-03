"""
LLM 调用层

简洁的 LLM 调用接口，支持:
- OpenAI 兼容 API（覆盖 90% 的模型服务）
- 自动处理 JSON 输出格式化
- 流式/非流式输出
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)


@dataclass
class LLMConfig:
    """LLM 配置"""

    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    default_model: str = "gpt-4o-mini"
    timeout: float = 600.0


# 全局配置（通过 configure() 设置）
_config = LLMConfig()

# 全局 httpx 客户端（复用连接，避免嵌套创建）
_global_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """获取全局 httpx 客户端（懒加载）"""
    global _global_client
    if _global_client is None:
        _global_client = httpx.AsyncClient(
            timeout=_config.timeout,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100)
        )
    return _global_client


def configure(
    api_key: str = "",
    base_url: str = "https://api.openai.com/v1",
    default_model: str = "gpt-4o-mini",
) -> None:
    """配置 LLM 连接"""
    global _config
    _config = LLMConfig(api_key=api_key, base_url=base_url, default_model=default_model)


async def call_llm(
    prompt: str,
    context: str = "",
    model: str | None = None,
    output_keys: list[str] | None = None,
    temperature: float = 0.7,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
) -> Any:
    """调用 LLM

    Args:
        prompt: 用户定义的提示词（块配置中的内容）
        context: 上游数据（自动注入）
        model: 模型名称，默认使用全局配置
        output_keys: 如果指定，要求 LLM 输出 JSON 格式
        temperature: 温度参数
        api_key: 可选，覆盖全局 API Key
        base_url: 可选，覆盖全局 Base URL
        tools: 可选，function calling 工具列表
        tool_choice: 工具选择策略（auto/required/none）

    Returns:
        如果没有 tools：指定了 output_keys 返回 dict，否则返回 str
        如果有 tools：返回 dict {"content", "tool_calls", "reasoning"}
    """
    effective_model = model or _config.default_model
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url

    # 构建系统提示词
    system_parts = ["你是一个专业的 AI 助手。请根据用户的指令完成任务。"]

    if output_keys:
        keys_desc = ", ".join(f'"{k}"' for k in output_keys)
        system_parts.append(
            f"\n请严格以 JSON 格式输出，包含以下 key: {keys_desc}。"
            "\n只输出 JSON，不要输出其他内容。"
        )

    system_prompt = "\n".join(system_parts)

    # 构建用户消息
    user_parts = [prompt]
    if context:
        user_parts.append(f"\n---以下是上游数据---\n{context}")

    user_message = "\n".join(user_parts)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    if tools:
        result = await _call_api_with_tools(
            messages, effective_model, temperature, tools, tool_choice,
            api_key=effective_key, base_url=effective_url
        )
        return result

    result_text = await _call_api(
        messages, effective_model, temperature, api_key=effective_key, base_url=effective_url
    )

    if output_keys:
        return _parse_json_output(result_text)

    return result_text

async def _call_api(
    messages: list[dict[str, str]],
    model: str,
    temperature: float,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
) -> str:
    """调用 OpenAI 兼容 API"""
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url

    client = _get_client()
    response = await client.post(
        f"{effective_url}/chat/completions",
        json={
            "model": model,
            "messages": messages,
            "temperature": temperature,
        },
        headers={
            "Authorization": f"Bearer {effective_key}",
            "Content-Type": "application/json",
        },
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


async def _call_api_with_tools(
    messages: list[dict],
    model: str,
    temperature: float,
    tools: list[dict],
    tool_choice: str,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict:
    """调用 OpenAI 兼容 API（带 function calling）"""
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url

    client = _get_client()
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "tools": tools,
    }

    if tool_choice != "auto":
        payload["tool_choice"] = tool_choice

    # 阿里云 Qwen 模型支持思考模式
    if "qwen" in model.lower() and "dashscope.aliyuncs.com" in effective_url:
        payload["enable_thinking"] = True

    response = await client.post(
        f"{effective_url}/chat/completions",
        json=payload,
        headers={
            "Authorization": f"Bearer {effective_key}",
            "Content-Type": "application/json",
        },
    )
    response.raise_for_status()
    data = response.json()

    message = data["choices"][0]["message"]

    result = {
        "content": message.get("content"),
        "tool_calls": message.get("tool_calls"),
        "reasoning": message.get("reasoning_content"),
    }

    return result


async def call_llm_with_messages_stream(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
    *,
    api_key: str | None = None,
    base_url: str | None = None,
):
    """流式调用 LLM（用于 Agent 多轮对话）

    Yields:
        {"type": "reasoning", "data": str}  # 思考内容
        {"type": "content", "data": str}    # 回复内容（逐字）
        {"type": "tool_calls", "data": list}  # 工具调用
        {"type": "done", "data": dict}      # 完成，返回完整结果
    """
    effective_model = model or _config.default_model
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url

    print(f"[shared_llm] call_llm_with_messages_stream: model={effective_model}, base_url={effective_url}")
    logger.info(f"call_llm_with_messages_stream: model={effective_model}, base_url={effective_url}")

    try:
        client = _get_client()
        payload = {
            "model": effective_model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }

        if tools:
            payload["tools"] = tools
            if tool_choice != "auto":
                payload["tool_choice"] = tool_choice

        # 阿里云 Qwen 模型支持思考模式
        if "qwen" in effective_model.lower() and "dashscope.aliyuncs.com" in effective_url:
            payload["enable_thinking"] = True

        async with client.stream(
            "POST",
            f"{effective_url}/chat/completions",
            json=payload,
            headers={
                "Authorization": f"Bearer {effective_key}",
                "Content-Type": "application/json",
            },
        ) as response:
            response.raise_for_status()

            full_content = ""
            full_reasoning = ""
            tool_calls_accumulator = {}  # 用字典累积 tool_calls，key 是 index

            async for line in response.aiter_lines():
            if not line.startswith("data: "):
                continue
            if line == "data: [DONE]":
                break

            try:
                data = json.loads(line[6:])
                delta = data["choices"][0].get("delta", {})

                # 处理 reasoning
                if reasoning := delta.get("reasoning_content"):
                    full_reasoning += reasoning
                    yield {"type": "reasoning", "data": reasoning}

                # 处理 content
                if content := delta.get("content"):
                    full_content += content
                    yield {"type": "content", "data": content}

                # 处理 tool_calls（增量累积）
                if tool_calls_delta := delta.get("tool_calls"):
                    for tc_delta in tool_calls_delta:
                        index = tc_delta.get("index", 0)
                        if index not in tool_calls_accumulator:
                            tool_calls_accumulator[index] = {
                                "id": "",
                                "type": "function",
                                "function": {"name": "", "arguments": ""}
                            }

                        # 累积各个字段
                        if "id" in tc_delta:
                            tool_calls_accumulator[index]["id"] += tc_delta["id"]
                        if "type" in tc_delta:
                            tool_calls_accumulator[index]["type"] = tc_delta["type"]
                        if "function" in tc_delta:
                            func_delta = tc_delta["function"]
                            if "name" in func_delta:
                                tool_calls_accumulator[index]["function"]["name"] += func_delta["name"]
                            if "arguments" in func_delta:
                                tool_calls_accumulator[index]["function"]["arguments"] += func_delta["arguments"]

            except (json.JSONDecodeError, KeyError, IndexError):
                continue

        # 转换累积的 tool_calls 为列表
        tool_calls_data = [tool_calls_accumulator[i] for i in sorted(tool_calls_accumulator.keys())] if tool_calls_accumulator else None

        # 返回完整结果
        yield {
            "type": "done",
            "data": {
                "content": full_content,
                "reasoning": full_reasoning or None,
                "tool_calls": tool_calls_data or None,
            },
        }
    except httpx.HTTPError as e:
        print(f"[shared_llm] HTTP error: {type(e).__name__}: {str(e)}")
        logger.error(f"call_llm_with_messages_stream HTTP error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise
    except Exception as e:
        print(f"[shared_llm] Error: {type(e).__name__}: {str(e)}")
        logger.error(f"call_llm_with_messages_stream error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise


async def call_llm_with_messages(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
    *,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict:
    """直接使用消息列表调用 LLM（用于 Agent 多轮对话）"""
    effective_model = model or _config.default_model
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url

    if tools:
        return await _call_api_with_tools(
            messages, effective_model, temperature, tools, tool_choice,
            api_key=effective_key, base_url=effective_url
        )

    result_text = await _call_api(
        messages, effective_model, temperature,
        api_key=effective_key, base_url=effective_url
    )
    return {
        "content": result_text,
        "tool_calls": None,
        "reasoning": None,
    }


def _parse_json_output(text: str) -> dict[str, Any]:
    """尝试从 LLM 输出中解析 JSON"""
    text = text.strip()

    # 处理 markdown 代码块包裹的情况
    if text.startswith("```"):
        lines = text.split("\n")
        # 去掉首尾的 ``` 行
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 尝试找到 JSON 部分
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass

        # 解析失败，返回原始文本
        logger.warning("Failed to parse JSON output, returning raw text: %s", text[:200])
        return {"raw_output": text}
