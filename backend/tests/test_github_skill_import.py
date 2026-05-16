import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.routes import plugins
from api.routes.plugins import GitHubSkillImportRequest, _build_github_skill, _parse_github_source


def test_parse_github_tree_source():
    ref = _parse_github_source("https://github.com/openai/skills/tree/main/writing/editor")

    assert ref["owner"] == "openai"
    assert ref["repo"] == "skills"
    assert ref["branch"] == "main"
    assert ref["path"] == "writing/editor"
    assert ref["url"] == "https://github.com/openai/skills/tree/main/writing/editor"


def test_parse_owner_repo_path_source():
    ref = _parse_github_source("openai/skills/writing/editor/SKILL.md")

    assert ref["owner"] == "openai"
    assert ref["repo"] == "skills"
    assert ref["path"] == "writing/editor"


@pytest.mark.asyncio
async def test_build_github_skill_uses_skill_py(monkeypatch):
    async def fake_fetch_text(ref, filename):
        assert filename == "SKILL.md"
        return "# Editor\n\nRefine drafts."

    async def fake_fetch_code(ref):
        return "result = {'success': True}"

    monkeypatch.setattr(plugins, "_fetch_github_text", fake_fetch_text)
    monkeypatch.setattr(plugins, "_fetch_optional_code", fake_fetch_code)

    skill = await _build_github_skill(GitHubSkillImportRequest(source="openai/skills/writing/editor"))

    assert skill["id"].startswith("github_openai_skills_")
    assert skill["name"] == "Editor"
    assert skill["description"] == "Refine drafts."
    assert skill["code"] == "result = {'success': True}"
    assert skill["source"] == "github"


@pytest.mark.asyncio
async def test_build_github_skill_without_code_returns_instruction_skill(monkeypatch):
    async def fake_fetch_text(ref, filename):
        return "# Research\n\nUse these instructions."

    async def fake_fetch_code(ref):
        return ""

    monkeypatch.setattr(plugins, "_fetch_github_text", fake_fetch_text)
    monkeypatch.setattr(plugins, "_fetch_optional_code", fake_fetch_code)

    skill = await _build_github_skill(GitHubSkillImportRequest(source="openai/skills/research"))

    assert "instructions" in skill["code"]
    assert "Use these instructions." in skill["code"]
