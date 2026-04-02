"""
Workspace API - 块模板 CRUD

制造工坊的后端接口:
- 列出所有块模板
- 创建 / 更新 / 删除块模板
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from flow.models import BlockTemplate
from storage.file_store import (
    delete_template,
    list_templates,
    load_template,
    save_template,
)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


@router.get("/")
async def list_workspace_templates():
    """列出所有块模板"""
    return list_templates()


@router.post("/")
async def create_workspace_template(template: BlockTemplate):
    """创建新的块模板"""
    save_template(template)
    return template.model_dump()


@router.get("/{template_id}")
async def get_workspace_template(template_id: str):
    """获取单个块模板"""
    template = load_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template.model_dump()


@router.put("/{template_id}")
async def update_workspace_template(template_id: str, template: BlockTemplate):
    """更新块模板"""
    save_template(template)
    return template.model_dump()


@router.delete("/{template_id}")
async def delete_workspace_template(template_id: str):
    """删除块模板"""
    if delete_template(template_id):
        return {"ok": True}
    raise HTTPException(status_code=404, detail="模板不存在")
