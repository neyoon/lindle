import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from storage import agent_chat_store


def test_agent_conversation_store_roundtrip(tmp_path, monkeypatch):
    def fake_get_local_file(*parts: str):
        return tmp_path.joinpath(*parts)

    monkeypatch.setattr(agent_chat_store, "get_local_file", fake_get_local_file)

    saved = agent_chat_store.save_agent_conversation(
        "agent_test",
        [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "world"},
        ],
    )

    assert saved.agent_id == "agent_test"
    assert len(saved.messages) == 2

    loaded = agent_chat_store.load_agent_conversation("agent_test")
    assert loaded is not None
    assert [message.role for message in loaded.messages] == ["user", "assistant"]
    assert [message.content for message in loaded.messages] == ["hello", "world"]

    assert agent_chat_store.delete_agent_conversation("agent_test") is True
    assert agent_chat_store.load_agent_conversation("agent_test") is None
