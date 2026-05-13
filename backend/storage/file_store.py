"""
文件存储

本地单机模式下用 JSON 文件保存工作流和块模板。
"""

from __future__ import annotations

import json
import os
from typing import Any

from flow.models import BlockTemplate, Workflow
from storage.local_paths import ensure_parent, get_local_file

_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "workflows")
_WORKSPACE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "workspace")


def set_storage_dir(path: str) -> None:
    global _STORAGE_DIR
    _STORAGE_DIR = path
    os.makedirs(_STORAGE_DIR, exist_ok=True)


def _load_and_repair_workflow_file(file_path) -> Workflow:
    """加载并修复历史脏数据。"""
    with open(file_path, encoding="utf-8") as f:
        raw_data = json.load(f)

    workflow = Workflow.model_validate(raw_data)
    normalized = workflow.model_dump()

    if raw_data != normalized:
        ensure_parent(file_path)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(normalized, f, ensure_ascii=False, indent=2)

    return workflow


def save_workflow(workflow: Workflow) -> str:
    """保存工作流到文件"""
    file_path = get_local_file("workflows", f"{workflow.id}.json")
    ensure_parent(file_path)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(workflow.model_dump(), f, ensure_ascii=False, indent=2)
    return str(file_path)


def load_workflow(workflow_id: str) -> Workflow | None:
    """从文件加载工作流"""
    file_path = get_local_file("workflows", f"{workflow_id}.json")
    if not file_path.exists():
        return None
    return _load_and_repair_workflow_file(file_path)


def list_workflows() -> list[dict[str, Any]]:
    """列出所有工作流（摘要信息）"""
    workflow_dir = get_local_file("workflows")
    workflow_dir.mkdir(parents=True, exist_ok=True)
    workflows = []
    for filename in os.listdir(workflow_dir):
        if not filename.endswith(".json"):
            continue
        file_path = workflow_dir / filename
        workflow = _load_and_repair_workflow_file(file_path)
        workflows.append({
            "id": workflow.id,
            "name": workflow.name,
            "description": workflow.description,
            "column_count": len(workflow.columns),
        })
    return workflows


def delete_workflow(workflow_id: str) -> bool:
    """删除工作流"""
    file_path = get_local_file("workflows", f"{workflow_id}.json")
    if file_path.exists():
        os.remove(file_path)
        return True
    return False


def save_template(template: BlockTemplate) -> str:
    """保存块模板到 workspace"""
    file_path = get_local_file("workspace", f"{template.id}.json")
    ensure_parent(file_path)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(template.model_dump(), f, ensure_ascii=False, indent=2)
    return str(file_path)


def load_template(template_id: str) -> BlockTemplate | None:
    """从 workspace 加载块模板"""
    file_path = get_local_file("workspace", f"{template_id}.json")
    if not file_path.exists():
        return None
    with open(file_path, encoding="utf-8") as f:
        data = json.load(f)
    return BlockTemplate.model_validate(data)


def list_templates() -> list[dict[str, Any]]:
    """列出所有块模板"""
    workspace_dir = get_local_file("workspace")
    workspace_dir.mkdir(parents=True, exist_ok=True)
    templates = []
    for filename in os.listdir(workspace_dir):
        if not filename.endswith(".json"):
            continue
        file_path = workspace_dir / filename
        with open(file_path, encoding="utf-8") as f:
            templates.append(json.load(f))
    return templates


def delete_template(template_id: str) -> bool:
    """删除块模板"""
    file_path = get_local_file("workspace", f"{template_id}.json")
    if file_path.exists():
        os.remove(file_path)
        return True
    return False
