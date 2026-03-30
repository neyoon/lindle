"""
工作流 CRUD API
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from miniflow.models import Workflow
from storage.file_store import delete_workflow, list_workflows, load_workflow, save_workflow

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class WorkflowSummary(BaseModel):
    id: str
    name: str
    description: str
    column_count: int


@router.get("/", response_model=list[WorkflowSummary])
async def get_workflows():
    """获取所有工作流列表"""
    return list_workflows()


@router.get("/{workflow_id}", response_model=Workflow)
async def get_workflow(workflow_id: str):
    """获取单个工作流详情"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return workflow


@router.post("/", response_model=Workflow)
async def create_workflow(workflow: Workflow):
    """创建工作流"""
    save_workflow(workflow)
    return workflow


@router.put("/{workflow_id}", response_model=Workflow)
async def update_workflow(workflow_id: str, workflow: Workflow):
    """更新工作流"""
    existing = load_workflow(workflow_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    workflow.id = workflow_id
    save_workflow(workflow)
    return workflow


@router.delete("/{workflow_id}")
async def remove_workflow(workflow_id: str):
    """删除工作流"""
    if not delete_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="工作流不存在")
    return {"message": "已删除"}
