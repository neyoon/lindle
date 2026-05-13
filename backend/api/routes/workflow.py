"""
工作流 CRUD API + 视图导出 + 编辑入口。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.routes.workflow_edit import (
    EditRequest,
    parse_generated_workflow as _parse_generated_workflow,
    stream_edit_workflow,
)
from exporters import build_workflow_description, build_workflow_export
from flow.canonical import canonicalize_workflow
from flow.execution_plan import compile_execution_plan
from flow.flowspec import workflow_to_flowspec
from flow.models import Workflow
from flow.validation import WorkflowValidationError, ensure_valid_workflow
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


@router.get("/{workflow_id}/flowspec")
async def get_workflow_flowspec(workflow_id: str):
    """获取工作流的 FlowSpec 视图。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return workflow_to_flowspec(workflow)


@router.get("/{workflow_id}/canonical")
async def get_workflow_canonical(workflow_id: str):
    """获取工作流的 CanonicalFlow 视图。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return canonicalize_workflow(workflow)


@router.get("/{workflow_id}/execution-plan")
async def get_workflow_execution_plan(workflow_id: str):
    """获取工作流的 ExecutionPlan 视图。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    canonical = canonicalize_workflow(workflow)
    return compile_execution_plan(canonical)


@router.post("/", response_model=Workflow)
async def create_workflow(workflow: Workflow):
    """创建工作流"""
    _raise_if_invalid(workflow)
    save_workflow(workflow)
    return workflow


@router.put("/{workflow_id}", response_model=Workflow)
async def update_workflow(workflow_id: str, workflow: Workflow):
    """更新工作流"""
    existing = load_workflow(workflow_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    workflow.id = workflow_id
    _raise_if_invalid(workflow)
    save_workflow(workflow)
    return workflow


@router.delete("/{workflow_id}")
async def remove_workflow(workflow_id: str):
    """删除工作流"""
    if not delete_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="工作流不存在")
    return {"message": "已删除"}


@router.get("/{workflow_id}/describe")
async def describe_workflow(workflow_id: str):
    """导出工作流的 LLM 友好文本描述。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")

    description = build_workflow_description(workflow)
    return {"description": description}


@router.get("/{workflow_id}/export")
async def export_workflow(workflow_id: str):
    """导出工作流结构化清单。"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
    return build_workflow_export(workflow)


@router.post("/{workflow_id}/edit")
async def edit_workflow(workflow_id: str, body: EditRequest):
    """用自然语言指令修改工作流（SSE 流式返回）"""
    return await stream_edit_workflow(workflow_id, body)


def _raise_if_invalid(workflow: Workflow) -> None:
    try:
        ensure_valid_workflow(workflow)
    except WorkflowValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "工作流校验未通过",
                "issues": [
                    {"code": issue.code, "message": issue.message, "path": issue.path}
                    for issue in exc.issues
                ],
            },
        ) from exc
