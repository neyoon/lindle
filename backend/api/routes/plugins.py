"""
插件管理 API
"""

from __future__ import annotations

import hashlib
import re
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from plugins.registry import (
    get_enabled_plugins,
    get_plugin_detail,
    list_plugins,
    list_skills,
    set_plugin_enabled,
    update_plugin_config,
)
from plugins.custom_skills import (
    save_custom_skill,
    load_custom_skill,
    list_custom_skills,
    delete_custom_skill,
)

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


class EnableRequest(BaseModel):
    enabled: bool


class ConfigRequest(BaseModel):
    config: dict[str, str]


class CustomSkillRequest(BaseModel):
    id: str
    name: str
    description: str
    icon: str = ""
    code: str
    input_schema: dict = {}
    output_schema: dict = {}
    source: str = "local"
    source_url: str = ""


class GitHubSkillImportRequest(BaseModel):
    source: str
    name: str | None = None
    description: str | None = None


class GenerateFlowSkillRequest(BaseModel):
    flow_ids: list[str]
    skill_name: str | None = None
    skill_description: str | None = None


@router.post("/generate-flow-skill")
async def generate_flow_skill(body: GenerateFlowSkillRequest):
    """从 Flow 自动生成 Custom Skill

    将一个或多个 Flow 包装成 Custom Skill，供 Agent 调用
    """
    import time
    import random
    from storage.file_store import load_workflow

    flow_ids = body.flow_ids
    if not flow_ids:
        raise HTTPException(400, "至少需要一个 Flow ID")

    flows = []
    for fid in flow_ids:
        wf = load_workflow(fid)
        if wf:
            flows.append({
                "id": fid,
                "name": wf.name,
                "description": wf.description or ""
            })

    if not flows:
        raise HTTPException(404, "未找到有效的 Flow")

    skill_name = body.skill_name or f"{flows[0]['name']} Skill"
    skill_desc = body.skill_description or f"执行 {', '.join(f['name'] for f in flows)}"

    default_flow_id = flows[0]['id']

    code = (
        "import json\n"
        "from plugins.registry import execute_plugin\n"
        "\n"
        "data = json.loads(input_data)\n"
        "\n"
        f'workflow_id = data.get("workflow_id", "{default_flow_id}")\n'
        'inputs = data.get("inputs", {})\n'
        "\n"
        "result = await execute_plugin(\"workflow_executor\", json.dumps({\n"
        '    "workflow_id": workflow_id,\n'
        '    "inputs": inputs\n'
        "}))\n"
    )

    flow_id_desc = "要执行的 Flow ID，可选值: " + ", ".join(f["id"] for f in flows)
    input_schema = {
        "type": "object",
        "properties": {
            "workflow_id": {
                "type": "string",
                "description": flow_id_desc,
                "enum": [f["id"] for f in flows],
            },
            "inputs": {
                "type": "object",
                "description": "传给 Flow 的输入参数",
            },
        },
        "required": ["inputs"],
    }

    output_schema = {
        "type": "object",
        "properties": {
            "success": {"type": "boolean", "description": "执行是否成功"},
            "output": {"type": "object", "description": "Flow 的输出结果"},
            "error": {"type": "string", "description": "错误信息（如果失败）"},
            "elapsed": {"type": "number", "description": "执行耗时（秒）"},
        },
    }

    skill_id = f"custom_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
    skill_data = {
        "id": skill_id,
        "name": skill_name,
        "description": skill_desc,
        "icon": "",
        "code": code,
        "input_schema": input_schema,
        "output_schema": output_schema,
    }

    success = save_custom_skill(skill_data)
    if not success:
        raise HTTPException(500, "保存 Skill 失败")

    return {"ok": True, "skill": skill_data}


# 注意：具体路径必须在 /{plugin_id} 通配路径之前定义


@router.get("/")
async def get_plugins():
    """获取所有插件列表（含状态，只返回 plugin 类型）"""
    return list_plugins()


@router.get("/skills")
async def get_skills():
    """获取所有 Skills 列表（含状态，只返回 skill 类型）"""
    return list_skills()


@router.get("/enabled")
async def get_enabled():
    """获取已启用的插件列表（供工作流添加块时使用）"""
    return get_enabled_plugins()


@router.get("/custom-skills")
async def get_custom_skills():
    """获取所有自定义 Skills"""
    return list_custom_skills()


@router.post("/custom-skills")
async def create_custom_skill(body: CustomSkillRequest):
    """创建自定义 Skill"""
    skill_data = body.model_dump()
    ok = save_custom_skill(skill_data)
    if not ok:
        raise HTTPException(500, "保存失败")
    return {"ok": True, "skill": skill_data}


@router.post("/custom-skills/github/preview")
async def preview_github_skill(body: GitHubSkillImportRequest):
    skill_data = await _build_github_skill(body)
    return {"ok": True, "skill": skill_data}


@router.post("/custom-skills/github/import")
async def import_github_skill(body: GitHubSkillImportRequest):
    skill_data = await _build_github_skill(body)
    ok = save_custom_skill(skill_data)
    if not ok:
        raise HTTPException(500, "保存失败")
    return {"ok": True, "skill": skill_data}


@router.get("/custom-skills/{skill_id}")
async def get_custom_skill(skill_id: str):
    """获取单个自定义 Skill"""
    skill = load_custom_skill(skill_id)
    if not skill:
        raise HTTPException(404, "Skill 不存在")
    return skill


@router.delete("/custom-skills/{skill_id}")
async def remove_custom_skill(skill_id: str):
    """删除自定义 Skill"""
    ok = delete_custom_skill(skill_id)
    if not ok:
        raise HTTPException(404, "Skill 不存在")
    return {"ok": True}


async def _build_github_skill(body: GitHubSkillImportRequest) -> dict:
    source = body.source.strip()
    if not source:
        raise HTTPException(400, "请填写 GitHub 仓库地址")

    ref = _parse_github_source(source)
    skill_md = await _fetch_github_text(ref, "SKILL.md")
    code = await _fetch_optional_code(ref)

    name = body.name or _extract_skill_name(skill_md) or ref["name"]
    description = body.description or _extract_skill_description(skill_md)
    if not code:
        code = _instruction_skill_code(skill_md)

    stable_key = f"{ref['owner']}/{ref['repo']}/{ref['branch']}"
    digest = hashlib.sha1(stable_key.encode("utf-8")).hexdigest()[:10]
    skill_id = f"github_{_slug(ref['owner'])}_{_slug(ref['repo'])}_{digest}"

    return {
        "id": skill_id,
        "name": name,
        "description": description,
        "icon": "",
        "code": code,
        "input_schema": {
            "type": "object",
            "properties": {
                "input": {"type": "string", "description": "传给 Skill 的输入"},
            },
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "output": {"type": "object"},
            },
        },
        "source": "github",
        "source_url": ref["url"],
    }


def _parse_github_source(source: str) -> dict[str, str]:
    parsed = urlparse(source)
    owner = repo = ""
    branch = ""

    if parsed.netloc in {"github.com", "www.github.com"}:
        parts = [part for part in parsed.path.strip("/").split("/") if part]
        if len(parts) < 2:
            raise HTTPException(400, "GitHub 地址格式不正确")
        owner, repo = parts[0], parts[1].removesuffix(".git")
        if len(parts) == 4 and parts[2] == "tree":
            branch = parts[3]
        elif len(parts) > 2:
            raise HTTPException(400, "只支持仓库根目录的 Skill")
    elif parsed.netloc == "raw.githubusercontent.com":
        parts = [part for part in parsed.path.strip("/").split("/") if part]
        if len(parts) != 4 or parts[3] != "SKILL.md":
            raise HTTPException(400, "GitHub raw 地址格式不正确")
        owner, repo, branch = parts[0], parts[1], parts[2]
    else:
        parts = [part for part in source.strip("/").split("/") if part]
        if len(parts) != 2:
            raise HTTPException(400, "请使用 GitHub 仓库 URL 或 owner/repo")
        owner, repo = parts[0], parts[1].removesuffix(".git")

    name = repo
    url = f"https://github.com/{owner}/{repo}"
    if branch:
        url = f"{url}/tree/{branch}"
    return {
        "owner": owner,
        "repo": repo,
        "branch": branch,
        "path": "",
        "name": name,
        "url": url,
    }


async def _fetch_github_text(ref: dict[str, str], filename: str) -> str:
    base_path = ref["path"].strip("/")
    raw_path = f"{base_path}/{filename}" if base_path else filename

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
        for branch in await _github_branch_candidates(client, ref):
            url = f"https://raw.githubusercontent.com/{ref['owner']}/{ref['repo']}/{branch}/{raw_path}"
            response = await client.get(url)
            if response.status_code == 200:
                ref["branch"] = branch
                ref["url"] = f"https://github.com/{ref['owner']}/{ref['repo']}/tree/{branch}"
                return response.text
            if response.status_code not in {404, 400}:
                raise HTTPException(response.status_code, response.text[:300])

    raise HTTPException(404, f"未找到 {filename}")


async def _github_branch_candidates(client: httpx.AsyncClient, ref: dict[str, str]) -> list[str]:
    if ref["branch"]:
        return [ref["branch"]]

    candidates: list[str] = []
    response = await client.get(f"https://api.github.com/repos/{ref['owner']}/{ref['repo']}")
    if response.status_code == 200:
        default_branch = response.json().get("default_branch")
        if default_branch:
            candidates.append(default_branch)

    for branch in ("main", "master"):
        if branch not in candidates:
            candidates.append(branch)
    return candidates


async def _fetch_optional_code(ref: dict[str, str]) -> str:
    for filename in ("skill.py", "main.py"):
        try:
            return await _fetch_github_text(ref, filename)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
    return ""


def _extract_skill_name(markdown: str) -> str:
    name = _frontmatter_value(markdown, "name")
    if name:
        return name
    for line in markdown.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def _extract_skill_description(markdown: str) -> str:
    description = _frontmatter_value(markdown, "description")
    if description:
        return description
    seen_title = False
    for line in markdown.splitlines():
        text = line.strip()
        if not text:
            continue
        if text.startswith("#"):
            seen_title = True
            continue
        if seen_title:
            return text[:240]
    return ""


def _frontmatter_value(markdown: str, key: str) -> str:
    frontmatter = _frontmatter(markdown)
    if not frontmatter:
        return ""

    match = re.search(rf"\b{re.escape(key)}:\s*(\"[^\"]*\"|'[^']*'|.*?)(?=\s+[a-zA-Z][\w-]*:\s|$)", frontmatter, re.DOTALL)
    if not match:
        return ""
    value = match.group(1).strip().strip("'\"")
    return re.sub(r"\s+", " ", value).strip()


def _frontmatter(markdown: str) -> str:
    lines = markdown.splitlines()
    if not lines:
        return ""

    first = lines[0].strip()
    if first == "---":
        for index, line in enumerate(lines[1:], start=1):
            if line.strip() == "---":
                return "\n".join(lines[1:index])
    if first.startswith("--- "):
        body = first[4:]
        if body.endswith(" ---"):
            return body[:-4].strip()
    return ""


def _instruction_skill_code(markdown: str) -> str:
    instructions = repr(markdown)
    return (
        "import json\n"
        "\n"
        "data = json.loads(input_data) if input_data else {}\n"
        f"instructions = {instructions}\n"
        "result = {\n"
        '    "success": True,\n'
        '    "output": {\n'
        '        "instructions": instructions,\n'
        '        "input": data,\n'
        "    },\n"
        "}\n"
    )


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_]+", "_", value).strip("_").lower()
    return slug or "skill"


@router.get("/{plugin_id}")
async def get_plugin(plugin_id: str):
    """获取单个插件详情"""
    detail = get_plugin_detail(plugin_id)
    if not detail:
        raise HTTPException(404, "插件不存在")
    return detail


@router.put("/{plugin_id}/enabled")
async def toggle_plugin(plugin_id: str, body: EnableRequest):
    """启用/禁用插件"""
    ok = set_plugin_enabled(plugin_id, body.enabled)
    if not ok:
        raise HTTPException(404, "插件不存在")
    return {"ok": True, "enabled": body.enabled}


@router.put("/{plugin_id}/config")
async def set_config(plugin_id: str, body: ConfigRequest):
    """更新插件配置（如 token）"""
    ok = update_plugin_config(plugin_id, body.config)
    if not ok:
        raise HTTPException(404, "插件不存在")
    return {"ok": True}
