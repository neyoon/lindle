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
    protocol: str = "openai"
    api_version: str = ""
    timeout: float = 600.0


_config = LLMConfig()

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
    protocol: str = "openai",
    api_version: str = "",
) -> None:
    """配置 LLM 连接"""
    global _config
    _config = LLMConfig(
        api_key=api_key,
        base_url=base_url,
        default_model=default_model,
        protocol=protocol or "openai",
        api_version=api_version,
    )


async def call_llm(
    prompt: str,
    context: str = "",
    model: str | None = None,
    output_keys: list[str] | None = None,
    temperature: float = 0.7,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    protocol: str | None = None,
    api_version: str | None = None,
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
    effective_protocol = protocol or _config.protocol
    effective_api_version = api_version if api_version is not None else _config.api_version

    system_parts = ["你是一个专业的 AI 助手。请根据用户的指令完成任务。"]

    if output_keys:
        keys_desc = ", ".join(f'"{k}"' for k in output_keys)
        system_parts.append(
            f"\n请严格以 JSON 格式输出，包含以下 key: {keys_desc}。"
            "\n只输出 JSON，不要输出其他内容。"
        )

    system_prompt = "\n".join(system_parts)

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
            api_key=effective_key,
            base_url=effective_url,
            protocol=effective_protocol,
            api_version=effective_api_version,
        )
        return result

    result_text = await _call_api(
        messages,
        effective_model,
        temperature,
        api_key=effective_key,
        base_url=effective_url,
        protocol=effective_protocol,
        api_version=effective_api_version,
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
    protocol: str | None = None,
    api_version: str | None = None,
) -> str:
    """调用 OpenAI 兼容 API"""
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url
    effective_protocol = protocol or _config.protocol

    if _should_use_proxy(effective_protocol):
        result = await _call_proxy_chat(
            messages,
            model,
            temperature,
            api_key=effective_key,
            base_url=effective_url,
            protocol=effective_protocol,
            api_version=api_version if api_version is not None else _config.api_version,
        )
        return str(result.get("content") or "")

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
    protocol: str | None = None,
    api_version: str | None = None,
) -> dict:
    """调用 OpenAI 兼容 API（带 function calling）"""
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url
    effective_protocol = protocol or _config.protocol

    if _should_use_proxy(effective_protocol):
        result = await _call_proxy_chat(
            messages,
            model,
            temperature,
            api_key=effective_key,
            base_url=effective_url,
            protocol=effective_protocol,
            api_version=api_version if api_version is not None else _config.api_version,
            tools=tools,
            tool_choice=tool_choice,
        )
        return {
            "content": result.get("content"),
            "tool_calls": result.get("tool_calls"),
            "reasoning": result.get("reasoning"),
        }

    client = _get_client()
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "tools": tools,
    }

    if tool_choice != "auto":
        payload["tool_choice"] = tool_choice

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
    protocol: str | None = None,
    api_version: str | None = None,
):
    """流式调用 LLM（用于 Agent 多轮对话）

    Yields:
        {"type": "reasoning", "data": str}
        {"type": "content", "data": str}
        {"type": "tool_calls", "data": list}
        {"type": "done", "data": dict}
    """
    effective_model = model or _config.default_model
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url
    effective_protocol = protocol or _config.protocol
    effective_api_version = api_version if api_version is not None else _config.api_version

    try:
        if _should_use_proxy(effective_protocol):
            async for chunk in _call_proxy_stream(
                messages,
                effective_model,
                temperature,
                api_key=effective_key,
                base_url=effective_url,
                protocol=effective_protocol,
                api_version=effective_api_version,
                tools=tools,
                tool_choice=tool_choice,
            ):
                yield chunk
            return

        client = httpx.AsyncClient(timeout=_config.timeout)
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

        async with client:
            stream_context = client.stream(
                "POST",
                f"{effective_url}/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {effective_key}",
                    "Content-Type": "application/json",
                },
            )

            async with stream_context as response:
                response.raise_for_status()

                full_content = ""
                full_reasoning = ""
                tool_calls_accumulator = {}
                done_emitted = False
                got_done_signal = False

                line_count = 0
                async for line in response.aiter_lines():
                    line_count += 1

                    if not line.startswith("data: "):
                        continue
                    if line == "data: [DONE]":
                        got_done_signal = True
                        break

                    try:
                        data = json.loads(line[6:])

                        # Provider 流式错误帧（例如 DashScope 会返回 {"error": {...}}）
                        if isinstance(data, dict) and data.get("error"):
                            err = data["error"] or {}
                            code = err.get("code", "provider_error")
                            msg = err.get("message", "未知错误")
                            raise RuntimeError(f"LLM provider error ({code}): {msg}")

                        choices = data.get("choices") if isinstance(data, dict) else None
                        if not choices or not isinstance(choices, list):
                            logger.debug("忽略非标准流式帧: %s", line[:120])
                            continue

                        delta = choices[0].get("delta", {})

                        if line_count <= 5:
                            logger.debug("stream delta #%d: %s", line_count, delta)

                        if reasoning := delta.get("reasoning_content"):
                            full_reasoning += reasoning
                            yield {"type": "reasoning", "data": reasoning}

                        if content := delta.get("content"):
                            full_content += content
                            yield {"type": "content", "data": content}

                        if tool_calls_delta := delta.get("tool_calls"):
                            for tc_delta in tool_calls_delta:
                                index = tc_delta.get("index", 0)
                                if index not in tool_calls_accumulator:
                                    tool_calls_accumulator[index] = {
                                        "id": "",
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""}
                                    }

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

                    except json.JSONDecodeError as e:
                        logger.debug("解析流式行失败: %s, line=%s", e, line[:100])
                        continue

                tool_calls_data = [tool_calls_accumulator[i] for i in sorted(tool_calls_accumulator.keys())] if tool_calls_accumulator else None

                # 防止把空响应误当成功，导致前端表现为“无回复”
                if (
                    not got_done_signal
                    and not full_content
                    and not full_reasoning
                    and not tool_calls_data
                ):
                    raise RuntimeError("LLM 流式响应提前结束且无有效内容")

                if not done_emitted:
                    done_emitted = True
                    yield {
                        "type": "done",
                        "data": {
                            "content": full_content,
                            "reasoning": full_reasoning or None,
                            "tool_calls": tool_calls_data or None,
                        },
                    }

    except httpx.HTTPError as e:
        logger.exception("shared_llm HTTP error: %s", e)
        raise
    except Exception as e:
        logger.exception("shared_llm error: %s", e)
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
    protocol: str | None = None,
    api_version: str | None = None,
) -> dict:
    """直接使用消息列表调用 LLM（用于 Agent 多轮对话）"""
    effective_model = model or _config.default_model
    effective_key = api_key or _config.api_key
    effective_url = base_url or _config.base_url
    effective_protocol = protocol or _config.protocol
    effective_api_version = api_version if api_version is not None else _config.api_version

    if tools:
        return await _call_api_with_tools(
            messages, effective_model, temperature, tools, tool_choice,
            api_key=effective_key,
            base_url=effective_url,
            protocol=effective_protocol,
            api_version=effective_api_version,
        )

    result_text = await _call_api(
        messages, effective_model, temperature,
        api_key=effective_key,
        base_url=effective_url,
        protocol=effective_protocol,
        api_version=effective_api_version,
    )
    return {
        "content": result_text,
        "tool_calls": None,
        "reasoning": None,
    }


def _normalize_protocol(protocol: str | None) -> str:
    normalized = (protocol or "openai").strip().lower()
    aliases = {
        "openai-compatible": "openai",
        "openai_compatible": "openai",
        "google": "gemini",
    }
    return aliases.get(normalized, normalized)


def _should_use_proxy(protocol: str | None) -> bool:
    return _normalize_protocol(protocol) != "openai"


async def _call_proxy_chat(
    messages: list[dict],
    model: str,
    temperature: float,
    *,
    api_key: str,
    base_url: str,
    protocol: str,
    api_version: str = "",
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
) -> dict[str, Any]:
    from api.routes.proxy import ProxyChatRequest, proxy_chat

    return await proxy_chat(
        protocol,
        ProxyChatRequest(
            messages=messages,
            api_key=api_key,
            base_url=base_url,
            model=model,
            temperature=temperature,
            api_version=api_version,
            tools=tools,
            tool_choice=tool_choice,
        ),
    )


async def _call_proxy_stream(
    messages: list[dict],
    model: str,
    temperature: float,
    *,
    api_key: str,
    base_url: str,
    protocol: str,
    api_version: str = "",
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
):
    from api.routes.proxy import (
        ProxyChatRequest,
        _build_endpoint,
        _build_payload,
        _extract_delta,
        _extract_stream_error,
        _headers,
        _resolve_proxy_config,
    )

    body = ProxyChatRequest(
        messages=messages,
        api_key=api_key,
        base_url=base_url,
        model=model,
        temperature=temperature,
        api_version=api_version,
        tools=tools,
        tool_choice=tool_choice,
    )
    config = _resolve_proxy_config(protocol, body)
    payload = _build_payload(config, body, stream=True)

    full_content = ""
    full_reasoning = ""
    tool_calls_accumulator: dict[int, dict[str, Any]] = {}
    finished = False

    async with httpx.AsyncClient(timeout=_config.timeout, follow_redirects=False) as client:
        async with client.stream(
            "POST",
            _build_endpoint(config, body, stream=True),
            json=payload,
            headers=_headers(config.protocol, config.api_key),
        ) as response:
            if response.status_code >= 400:
                text = await response.aread()
                raise RuntimeError(f"LLM provider error ({response.status_code}): {text.decode('utf-8', errors='ignore')[:500]}")

            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload_text = line[5:].strip()
                if not payload_text:
                    continue
                if payload_text == "[DONE]":
                    finished = True
                    break

                try:
                    data = json.loads(payload_text)
                except json.JSONDecodeError:
                    logger.debug("解析 proxy 流式行失败: %s", payload_text[:100])
                    continue

                error = _extract_stream_error(data, config.protocol)
                if error:
                    raise RuntimeError(error)

                delta = _extract_delta(data, config.protocol)

                if reasoning := delta.get("reasoning"):
                    full_reasoning += reasoning
                    yield {"type": "reasoning", "data": reasoning}

                if content := delta.get("content"):
                    full_content += content
                    yield {"type": "content", "data": content}

                if tool_calls_delta := delta.get("tool_calls"):
                    for tc_delta in tool_calls_delta:
                        index = tc_delta.get("index", 0)
                        if index not in tool_calls_accumulator:
                            tool_calls_accumulator[index] = {
                                "id": "",
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            }
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

                if delta.get("finished"):
                    finished = True
                    break

    tool_calls_data = (
        [tool_calls_accumulator[i] for i in sorted(tool_calls_accumulator.keys())]
        if tool_calls_accumulator
        else None
    )
    if not finished and not full_content and not full_reasoning and not tool_calls_data:
        raise RuntimeError("LLM 流式响应提前结束且无有效内容")

    yield {
        "type": "done",
        "data": {
            "content": full_content,
            "reasoning": full_reasoning or None,
            "tool_calls": tool_calls_data,
        },
    }


def _parse_json_output(text: str) -> dict[str, Any]:
    """尝试从 LLM 输出中解析 JSON"""
    text = text.strip()

    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass

        logger.warning("Failed to parse JSON output, returning raw text: %s", text[:200])
        return {"raw_output": text}
