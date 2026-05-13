"""
插件管理 API
"""

from __future__ import annotations

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
