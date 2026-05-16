import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.routes.proxy import (
    ProxyChatRequest,
    _append_versioned_api_path,
    _build_endpoint,
    _build_payload,
    _extract_delta,
    _resolve_proxy_config,
    _sse,
    _validate_base_url,
    _validate_base_url_resolved,
    resolve_protocol,
)


def test_resolve_proxy_config_uses_default_provider(monkeypatch):
    monkeypatch.setattr(
        "api.routes.proxy.get_default_provider",
        lambda: {
            "id": "p_default",
            "api_key": "sk-test",
            "base_url": "https://example.com/v1/",
            "model": "gpt-test",
        },
    )

    req = ProxyChatRequest(messages=[{"role": "user", "content": "Hi"}])
    resolved = _resolve_proxy_config("openai-compatible", req)

    assert resolved.protocol == "openai"
    assert resolved.provider_id == "p_default"
    assert resolved.api_key == "sk-test"
    assert resolved.base_url == "https://example.com/v1"
    assert resolved.model == "gpt-test"


def test_build_payload_uses_resolved_provider_model(monkeypatch):
    monkeypatch.setattr(
        "api.routes.proxy.get_default_provider",
        lambda: {
            "id": "p_default",
            "api_key": "sk-test",
            "base_url": "https://example.com/v1/",
            "model": "gpt-test",
        },
    )

    req = ProxyChatRequest(messages=[{"role": "user", "content": "Hi"}])
    resolved = _resolve_proxy_config("openai", req)
    payload = _build_payload(resolved, req, stream=False)

    assert payload["model"] == "gpt-test"


def test_build_payload_preserves_dashscope_qwen_thinking(monkeypatch):
    monkeypatch.setattr("api.routes.proxy.get_default_provider", lambda: None)

    req = ProxyChatRequest(
        messages=[{"role": "user", "content": "Hi"}],
        api_key="sk-test",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
    )
    resolved = _resolve_proxy_config("openai", req)
    payload = _build_payload(resolved, req, stream=False)

    assert payload["enable_thinking"] is True


def test_resolve_proxy_config_accepts_anthropic_protocol(monkeypatch):
    monkeypatch.setattr("api.routes.proxy.get_default_provider", lambda: None)

    req = ProxyChatRequest(
        messages=[{"role": "user", "content": "Hi"}],
        api_key="sk-test",
        base_url="https://api.anthropic.com",
        model="claude-test",
    )

    resolved = _resolve_proxy_config("anthropic", req)

    assert resolved.protocol == "anthropic"
    assert resolved.base_url == "https://api.anthropic.com"


def test_append_versioned_api_path_preserves_existing_version_segment():
    assert (
        _append_versioned_api_path("https://openrouter.ai/api/v1", "/chat/completions")
        == "https://openrouter.ai/api/v1/chat/completions"
    )
    assert (
        _append_versioned_api_path("https://api.example.com/anthropic", "/messages")
        == "https://api.example.com/anthropic/v1/messages"
    )


def test_build_endpoint_handles_azure_deployment_shape(monkeypatch):
    monkeypatch.setattr("api.routes.proxy.get_default_provider", lambda: None)
    req = ProxyChatRequest(
        api_key="sk-test",
        base_url="https://example.openai.azure.com",
        model="deployment-a",
    )
    config = _resolve_proxy_config("azure", req)

    endpoint = _build_endpoint(config, req, stream=True)

    assert endpoint == (
        "https://example.openai.azure.com/openai/deployments/deployment-a/"
        "chat/completions?api-version=2024-10-21"
    )


def test_sse_emits_event_name_and_typed_payload():
    frame = _sse("delta", {"content": "hi"})

    assert frame.startswith("event: delta\n")
    assert '"type": "delta"' in frame
    assert '"content": "hi"' in frame


@pytest.mark.asyncio
async def test_resolve_protocol_returns_masked_endpoint_preview(monkeypatch):
    monkeypatch.setattr("api.routes.proxy.get_default_provider", lambda: None)

    resolved = await resolve_protocol(
        "openai-compatible",
        ProxyChatRequest(
            messages=[{"role": "user", "content": "Hi"}],
            api_key="sk-test",
            base_url="https://example.com/v1",
            model="gpt-test",
        ),
    )

    assert resolved.api_key == "***"
    assert resolved.protocol == "openai"
    assert resolved.endpoint == "https://example.com/v1/chat/completions"


def test_extract_delta_supports_gemini_chunks():
    delta = _extract_delta(
        {
            "candidates": [
                {
                    "content": {"parts": [{"text": "hello"}]},
                    "finishReason": "STOP",
                }
            ]
        },
        "gemini",
    )

    assert delta["content"] == "hello"
    assert delta["finished"] is True


def test_validate_base_url_allows_loopback_and_blocks_reserved_ip():
    _validate_base_url("http://127.0.0.1:11434/v1")

    with pytest.raises(HTTPException) as exc:
        _validate_base_url("http://169.254.169.254/latest")

    assert exc.value.status_code == 400


def test_validate_base_url_resolved_blocks_dns_to_private_ip(monkeypatch):
    monkeypatch.setattr(
        "api.routes.proxy.socket.getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("10.0.0.5", 0))],
    )

    with pytest.raises(HTTPException) as exc:
        _validate_base_url_resolved("https://internal.example.com/v1")

    assert exc.value.status_code == 400
