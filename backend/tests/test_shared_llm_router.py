import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import shared_llm


@pytest.mark.asyncio
async def test_openai_text_call_uses_proxy(monkeypatch):
    calls = []

    async def fake_proxy_chat(messages, model, temperature, **kwargs):
        calls.append({"messages": messages, "model": model, "temperature": temperature, **kwargs})
        return {"content": "ok"}

    monkeypatch.setattr(shared_llm, "_call_proxy_chat", fake_proxy_chat)

    result = await shared_llm.call_llm(
        "Say hi",
        model="gpt-test",
        api_key="sk-test",
        base_url="https://example.com/v1",
        protocol="openai",
    )

    assert result == "ok"
    assert calls[0]["protocol"] == "openai"
    assert calls[0]["base_url"] == "https://example.com/v1"


@pytest.mark.asyncio
async def test_openai_tool_call_uses_proxy(monkeypatch):
    calls = []

    async def fake_proxy_chat(messages, model, temperature, **kwargs):
        calls.append({"messages": messages, "model": model, "temperature": temperature, **kwargs})
        return {
            "content": None,
            "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "lookup", "arguments": "{}"}}],
            "reasoning": "thinking",
        }

    monkeypatch.setattr(shared_llm, "_call_proxy_chat", fake_proxy_chat)

    result = await shared_llm.call_llm_with_messages(
        [{"role": "user", "content": "lookup"}],
        model="gpt-test",
        api_key="sk-test",
        base_url="https://example.com/v1",
        protocol="openai",
        tools=[{"type": "function", "function": {"name": "lookup", "parameters": {}}}],
    )

    assert result["tool_calls"][0]["function"]["name"] == "lookup"
    assert calls[0]["protocol"] == "openai"
    assert calls[0]["tools"][0]["function"]["name"] == "lookup"


@pytest.mark.asyncio
async def test_openai_stream_call_uses_proxy(monkeypatch):
    calls = []

    async def fake_proxy_stream(messages, model, temperature, **kwargs):
        calls.append({"messages": messages, "model": model, "temperature": temperature, **kwargs})
        yield {"type": "content", "data": "hi"}
        yield {"type": "done", "data": {"content": "hi", "reasoning": None, "tool_calls": None}}

    monkeypatch.setattr(shared_llm, "_call_proxy_stream", fake_proxy_stream)

    chunks = [
        chunk
        async for chunk in shared_llm.call_llm_with_messages_stream(
            [{"role": "user", "content": "Hi"}],
            model="gpt-test",
            api_key="sk-test",
            base_url="https://example.com/v1",
            protocol="openai",
        )
    ]

    assert chunks[-1]["type"] == "done"
    assert calls[0]["protocol"] == "openai"
