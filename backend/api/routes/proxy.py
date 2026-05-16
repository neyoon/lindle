"""
统一协议接入代理

这个路由层负责把不同模型协议收敛到 Lindle 内部统一入口。
参考 Open Design 的 daemon proxy 结构：协议路由、版本路径补齐、
统一 SSE 事件、禁止 redirect，以及 DNS-aware 的 Base URL 安全检查。
"""

from __future__ import annotations

import ipaddress
import json
import socket
from typing import Any
from urllib.parse import quote, urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.routes.settings import get_default_provider, get_provider_by_id

router = APIRouter(prefix="/api/proxy", tags=["proxy"])


class ProtocolInfo(BaseModel):
    id: str
    name: str
    status: str
    description: str


class ProxyChatRequest(BaseModel):
    messages: list[dict[str, Any]] = Field(default_factory=list)
    provider_id: str = ""
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    system_prompt: str = ""
    temperature: float = 0.7
    max_tokens: int | None = None
    api_version: str = ""
    tools: list[dict[str, Any]] | None = None
    tool_choice: str = "auto"
    extra_body: dict[str, Any] = Field(default_factory=dict)


class ResolvedProxyConfig(BaseModel):
    protocol: str
    api_key: str
    base_url: str
    model: str
    provider_id: str = ""


_PROTOCOLS: dict[str, ProtocolInfo] = {
    "openai": ProtocolInfo(
        id="openai",
        name="OpenAI-compatible",
        status="active",
        description="OpenAI Chat Completions 兼容协议，覆盖 OpenAI、OpenRouter、Ollama、LM Studio 等兼容入口。",
    ),
    "anthropic": ProtocolInfo(
        id="anthropic",
        name="Anthropic",
        status="active",
        description="Claude Messages 协议。",
    ),
    "gemini": ProtocolInfo(
        id="gemini",
        name="Google Gemini",
        status="active",
        description="Gemini streamGenerateContent 协议。",
    ),
    "azure": ProtocolInfo(
        id="azure",
        name="Azure OpenAI",
        status="active",
        description="Azure OpenAI deployment + api-version 协议。",
    ),
}

_PROTOCOL_ALIASES = {
    "openai-compatible": "openai",
    "openai_compatible": "openai",
    "google": "gemini",
}


@router.get("/protocols", response_model=list[ProtocolInfo])
async def list_protocols() -> list[ProtocolInfo]:
    """列出当前协议接入状态。"""
    return list(_PROTOCOLS.values())


@router.post("/{protocol}/resolve", response_model=ResolvedProxyConfig)
async def resolve_protocol(protocol: str, body: ProxyChatRequest) -> ResolvedProxyConfig:
    """只解析路由配置，不发起上游请求，用于前端预检。"""
    config = _resolve_proxy_config(protocol, body)
    return config.model_copy(update={"api_key": "***"})


@router.post("/{protocol}/chat")
async def proxy_chat(protocol: str, body: ProxyChatRequest) -> dict[str, Any]:
    """非流式统一模型调用。"""
    config = _resolve_proxy_config(protocol, body)
    payload = _build_payload(config, body, stream=False)

    async with httpx.AsyncClient(timeout=600.0, follow_redirects=False) as client:
        response = await client.post(
            _build_endpoint(config, body, stream=False),
            json=payload,
            headers=_headers(config.protocol, config.api_key),
        )
        if response.status_code >= 400:
            raise HTTPException(response.status_code, response.text[:500])
        data = response.json()

    return _normalize_chat_response(config, data)


@router.post("/{protocol}/stream")
async def proxy_stream(protocol: str, body: ProxyChatRequest) -> StreamingResponse:
    """流式统一模型调用，输出 Lindle 统一 SSE 事件。"""
    config = _resolve_proxy_config(protocol, body)
    payload = _build_payload(config, body, stream=True)

    async def event_stream():
        yield _sse("start", {"model": config.model, "protocol": config.protocol})

        async with httpx.AsyncClient(timeout=600.0, follow_redirects=False) as client:
            async with client.stream(
                "POST",
                _build_endpoint(config, body, stream=True),
                json=payload,
                headers=_headers(config.protocol, config.api_key),
            ) as response:
                if response.status_code >= 400:
                    text = await response.aread()
                    yield _sse("error", _proxy_error(response.status_code, text.decode("utf-8", errors="ignore")))
                    yield _sse("end", {"code": response.status_code})
                    return

                ended = False
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload_text = line[5:].strip()
                    if not payload_text:
                        continue
                    if payload_text == "[DONE]":
                        yield _sse("end", {})
                        ended = True
                        break

                    try:
                        chunk = json.loads(payload_text)
                    except json.JSONDecodeError:
                        yield _sse("raw", {"data": payload_text})
                        continue

                    error = _extract_stream_error(chunk, config.protocol)
                    if error:
                        yield _sse("error", {"message": error, "details": chunk})
                        yield _sse("end", {})
                        ended = True
                        break

                    delta = _extract_delta(chunk, config.protocol)
                    if delta.get("content") or delta.get("tool_calls") or delta.get("reasoning"):
                        yield _sse("delta", delta)
                    if delta.get("finished"):
                        yield _sse("end", {})
                        ended = True
                        break

                if not ended:
                    yield _sse("end", {})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _resolve_proxy_config(protocol: str, body: ProxyChatRequest) -> ResolvedProxyConfig:
    normalized_protocol = _PROTOCOL_ALIASES.get(protocol, protocol)
    protocol_info = _PROTOCOLS.get(normalized_protocol)
    if protocol_info is None:
        raise HTTPException(status_code=404, detail=f"不支持的协议: {protocol}")
    if protocol_info.status != "active":
        raise HTTPException(status_code=400, detail=f"{protocol_info.name} 协议接入尚未启用")

    provider = get_provider_by_id(body.provider_id) if body.provider_id else get_default_provider()
    api_key = body.api_key or (provider or {}).get("api_key", "")
    base_url = body.base_url or (provider or {}).get("base_url", _default_base_url(normalized_protocol))
    model = body.model or (provider or {}).get("model", "")

    if not api_key:
        raise HTTPException(status_code=400, detail="未提供 API Key")
    if not model:
        raise HTTPException(status_code=400, detail="未提供模型名称")

    base_url = base_url.rstrip("/")
    _validate_base_url_resolved(base_url)

    return ResolvedProxyConfig(
        protocol=normalized_protocol,
        api_key=api_key,
        base_url=base_url,
        model=model,
        provider_id=body.provider_id or (provider or {}).get("id", ""),
    )


def _build_payload(config: ResolvedProxyConfig, body: ProxyChatRequest, *, stream: bool) -> dict[str, Any]:
    protocol = config.protocol
    if protocol == "anthropic":
        payload: dict[str, Any] = {
            "model": config.model,
            "messages": _messages_without_system(body.messages),
            "max_tokens": body.max_tokens or 8192,
            "stream": stream,
        }
        system_prompt = body.system_prompt or _first_system_message(body.messages)
        if system_prompt:
            payload["system"] = system_prompt
        payload.update(body.extra_body)
        return payload

    if protocol == "gemini":
        contents = [
            {
                "role": "model" if message.get("role") == "assistant" else "user",
                "parts": [{"text": str(message.get("content", ""))}],
            }
            for message in _messages_without_system(body.messages)
        ]
        payload = {
            "contents": contents,
            "generationConfig": {"maxOutputTokens": body.max_tokens or 8192},
        }
        system_prompt = body.system_prompt or _first_system_message(body.messages)
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
        payload.update(body.extra_body)
        return payload

    messages = list(body.messages)
    if body.system_prompt:
        messages.insert(0, {"role": "system", "content": body.system_prompt})

    payload: dict[str, Any] = {
        "model": config.model,
        "messages": messages,
        "temperature": body.temperature,
        "max_tokens": body.max_tokens or 8192,
        "stream": stream,
    }
    if body.tools:
        payload["tools"] = body.tools
        if body.tool_choice != "auto":
            payload["tool_choice"] = body.tool_choice
    payload.update(body.extra_body)
    return payload


def _build_endpoint(config: ResolvedProxyConfig, body: ProxyChatRequest, *, stream: bool) -> str:
    if config.protocol == "azure":
        parsed = httpx.URL(config.base_url)
        base_path = parsed.path.rstrip("/")
        uses_versioned_openai_path = _contains_openai_versioned_path(base_path)
        if uses_versioned_openai_path:
            url = parsed.copy_with(path=f"{base_path}/chat/completions")
            if body.api_version:
                url = url.copy_set_param("api-version", body.api_version)
            return str(url)
        url = parsed.copy_with(
            path=f"{base_path}/openai/deployments/{quote(config.model)}/chat/completions"
        )
        return str(url.copy_set_param("api-version", body.api_version or "2024-10-21"))

    if config.protocol == "anthropic":
        return _append_versioned_api_path(config.base_url, "/messages")
    if config.protocol == "gemini":
        base = config.base_url.rstrip("/")
        endpoint = "streamGenerateContent" if stream else "generateContent"
        suffix = "?alt=sse" if stream else ""
        return f"{base}/v1beta/models/{quote(config.model)}:{endpoint}{suffix}"
    return _append_versioned_api_path(config.base_url, "/chat/completions")


def _headers(protocol: str, api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if protocol == "anthropic":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
    elif protocol == "azure":
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _append_versioned_api_path(base_url: str, path: str) -> str:
    url = httpx.URL(base_url)
    trimmed = url.path.rstrip("/")
    next_path = f"{trimmed}{path}" if _has_versioned_segment(trimmed) else f"{trimmed}/v1{path}"
    return str(url.copy_with(path=next_path))


def _has_versioned_segment(path: str) -> bool:
    return any(segment.startswith("v") and segment[1:].isdigit() for segment in path.split("/") if segment)


def _contains_openai_versioned_path(path: str) -> bool:
    segments = [segment for segment in path.split("/") if segment]
    return len(segments) >= 2 and segments[-2] == "openai" and segments[-1].startswith("v")


def _normalize_chat_response(config: ResolvedProxyConfig, data: dict[str, Any]) -> dict[str, Any]:
    if config.protocol in {"openai", "azure"}:
        message = data.get("choices", [{}])[0].get("message", {})
        return {
            "type": "message",
            "protocol": config.protocol,
            "model": config.model,
            "content": message.get("content"),
            "tool_calls": message.get("tool_calls"),
            "reasoning": message.get("reasoning_content"),
            "raw": data,
        }
    if config.protocol == "anthropic":
        content = "".join(part.get("text", "") for part in data.get("content", []) if isinstance(part, dict))
        return {"type": "message", "protocol": config.protocol, "model": config.model, "content": content, "raw": data}
    if config.protocol == "gemini":
        content = ""
        for candidate in data.get("candidates") or []:
            for part in ((candidate.get("content") or {}).get("parts") or []):
                if isinstance(part.get("text"), str):
                    content += part["text"]
        return {"type": "message", "protocol": config.protocol, "model": config.model, "content": content, "raw": data}
    return {"type": "message", "protocol": config.protocol, "model": config.model, "raw": data}


def _sse(event: str, data: dict[str, Any]) -> str:
    payload = {"type": event, **data}
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _proxy_error(status_code: int, details: str) -> dict[str, Any]:
    code = "UPSTREAM_UNAVAILABLE"
    if status_code == 401:
        code = "UNAUTHORIZED"
    elif status_code == 403:
        code = "FORBIDDEN"
    elif status_code == 404:
        code = "NOT_FOUND"
    elif status_code == 429:
        code = "RATE_LIMITED"
    return {
        "message": f"Upstream error: {status_code}",
        "error": {
            "code": code,
            "message": f"Upstream error: {status_code}",
            "details": details[:1000],
            "retryable": status_code == 429 or status_code >= 500,
        },
    }


def _extract_stream_error(data: dict[str, Any], protocol: str) -> str:
    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error)
    if isinstance(error, str):
        return error
    if protocol == "gemini":
        feedback = data.get("promptFeedback") or {}
        if feedback.get("blockReason"):
            return f"Gemini blocked the prompt: {feedback['blockReason']}"
    return ""


def _extract_delta(data: dict[str, Any], protocol: str) -> dict[str, Any]:
    if protocol in {"openai", "azure"}:
        choice = (data.get("choices") or [{}])[0]
        delta = choice.get("delta") or {}
        return {
            "content": delta.get("content"),
            "tool_calls": delta.get("tool_calls"),
            "reasoning": delta.get("reasoning_content"),
            "finish_reason": choice.get("finish_reason"),
            "finished": bool(choice.get("finish_reason")),
        }

    if protocol == "anthropic":
        if data.get("type") == "content_block_delta":
            return {
                "content": (data.get("delta") or {}).get("text"),
                "tool_calls": None,
                "reasoning": None,
                "finished": False,
            }
        return {"content": None, "tool_calls": None, "reasoning": None, "finished": data.get("type") == "message_stop"}

    if protocol == "gemini":
        content = ""
        finished = False
        for candidate in data.get("candidates") or []:
            for part in ((candidate.get("content") or {}).get("parts") or []):
                if isinstance(part.get("text"), str):
                    content += part["text"]
            if candidate.get("finishReason"):
                finished = True
        return {"content": content or None, "tool_calls": None, "reasoning": None, "finished": finished}

    return {"content": None, "tool_calls": None, "reasoning": None, "finished": False}


def _messages_without_system(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [message for message in messages if message.get("role") != "system"]


def _first_system_message(messages: list[dict[str, Any]]) -> str:
    for message in messages:
        if message.get("role") == "system":
            return str(message.get("content", ""))
    return ""


def _default_base_url(protocol: str) -> str:
    if protocol == "anthropic":
        return "https://api.anthropic.com"
    if protocol == "gemini":
        return "https://generativelanguage.googleapis.com"
    return "https://api.openai.com/v1"


def _validate_base_url(base_url: str) -> None:
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Base URL 必须是 http(s) URL")

    host = parsed.hostname.lower()
    if host == "localhost" or host.endswith(".localhost"):
        return

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return

    if ip.is_loopback:
        return
    if _is_blocked_ip(ip):
        raise HTTPException(status_code=400, detail="Base URL 不允许指向非 loopback 的内网或保留地址")


def _validate_base_url_resolved(base_url: str) -> None:
    _validate_base_url(base_url)
    host = urlparse(base_url).hostname
    if not host:
        return
    host = host.lower()
    if host == "localhost" or host.endswith(".localhost") or _is_ip_literal(host):
        return

    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return

    for info in infos:
        address = info[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            continue
        if ip.is_loopback:
            continue
        if _is_blocked_ip(ip):
            raise HTTPException(status_code=400, detail="Base URL 域名解析到非 loopback 的内网或保留地址")


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return ip.is_private or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified
