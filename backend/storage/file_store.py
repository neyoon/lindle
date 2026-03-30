"""
文件存储

极简的文件存储:
- 工作流(pipeline)保存为 JSON 文件 → data/workflows/
- 块模板(workspace)保存为 JSON 文件 → data/workspace/
不需要数据库，降低部署复杂度。
"""

from __future__ import annotations

import json
import os
from typing import Any

from miniflow.models import BlockTemplate, Workflow

# 默认存储目录
_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "workflows")
_WORKSPACE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "workspace")


def set_storage_dir(path: str) -> None:
    global _STORAGE_DIR
    _STORAGE_DIR = path
    os.makedirs(_STORAGE_DIR, exist_ok=True)


# ===== Workflow (Pipeline) 存储 =====


def save_workflow(workflow: Workflow) -> str:
    """保存工作流到文件"""
    os.makedirs(_STORAGE_DIR, exist_ok=True)
    file_path = os.path.join(_STORAGE_DIR, f"{workflow.id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(workflow.model_dump(), f, ensure_ascii=False, indent=2)
    return file_path


def load_workflow(workflow_id: str) -> Workflow | None:
    """从文件加载工作流"""
    file_path = os.path.join(_STORAGE_DIR, f"{workflow_id}.json")
    if not os.path.exists(file_path):
        return None
    with open(file_path, encoding="utf-8") as f:
        data = json.load(f)
    return Workflow.model_validate(data)


def list_workflows() -> list[dict[str, Any]]:
    """列出所有工作流（摘要信息）"""
    os.makedirs(_STORAGE_DIR, exist_ok=True)
    workflows = []
    for filename in os.listdir(_STORAGE_DIR):
        if not filename.endswith(".json"):
            continue
        file_path = os.path.join(_STORAGE_DIR, filename)
        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)
        workflows.append({
            "id": data.get("id", ""),
            "name": data.get("name", ""),
            "description": data.get("description", ""),
            "column_count": len(data.get("columns", [])),
        })
    return workflows


def delete_workflow(workflow_id: str) -> bool:
    """删除工作流"""
    file_path = os.path.join(_STORAGE_DIR, f"{workflow_id}.json")
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
    return False


# ===== Workspace (块模板) 存储 =====


def save_template(template: BlockTemplate) -> str:
    """保存块模板到 workspace"""
    os.makedirs(_WORKSPACE_DIR, exist_ok=True)
    file_path = os.path.join(_WORKSPACE_DIR, f"{template.id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(template.model_dump(), f, ensure_ascii=False, indent=2)
    return file_path


def load_template(template_id: str) -> BlockTemplate | None:
    """从 workspace 加载块模板"""
    file_path = os.path.join(_WORKSPACE_DIR, f"{template_id}.json")
    if not os.path.exists(file_path):
        return None
    with open(file_path, encoding="utf-8") as f:
        data = json.load(f)
    return BlockTemplate.model_validate(data)


def list_templates() -> list[dict[str, Any]]:
    """列出所有块模板"""
    os.makedirs(_WORKSPACE_DIR, exist_ok=True)
    templates = []
    for filename in os.listdir(_WORKSPACE_DIR):
        if not filename.endswith(".json"):
            continue
        file_path = os.path.join(_WORKSPACE_DIR, filename)
        with open(file_path, encoding="utf-8") as f:
            templates.append(json.load(f))
    return templates


def delete_template(template_id: str) -> bool:
    """删除块模板"""
    file_path = os.path.join(_WORKSPACE_DIR, f"{template_id}.json")
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
    return False
