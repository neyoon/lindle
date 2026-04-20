"""
工作流执行 API

支持两种执行方式:
1. 同步执行: POST /api/run/{workflow_id} → 等待完成后返回结果
2. 流式执行: GET  /api/run/{workflow_id}/stream → SSE 推送执行事件
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from flow.engine import Engine
from flow.validation import WorkflowValidationError, ensure_valid_workflow
from storage.file_store import load_workflow

router = APIRouter(prefix="/api/run", tags=["execution"])


class RunRequest(BaseModel):
    inputs: dict[str, Any] = {}


class RunResponse(BaseModel):
    success: bool
    output: dict[str, Any] = {}
    steps: list[dict[str, Any]] = []
    total_elapsed: float = 0.0
    error: str = ""


@router.post("/{workflow_id}", response_model=RunResponse)
async def run_workflow(workflow_id: str, request: RunRequest):
    """同步执行工作流"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
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

    engine = Engine(workflow)
    result = await engine.run(user_inputs=request.inputs)

    return RunResponse(
        success=result.success,
        output=result.output,
        steps=[
            {
                "event_type": s.event_type,
                "column_id": s.column_id,
                "column_order": s.column_order,
                "block_id": s.block_id,
                "block_name": s.block_name,
                "data": s.data,
                "elapsed": round(s.elapsed, 3),
                "error": s.error,
            }
            for s in result.steps
        ],
        total_elapsed=round(result.total_elapsed, 3),
        error=result.error,
    )


@router.post("/{workflow_id}/stream")
async def run_workflow_stream(workflow_id: str, request: RunRequest):
    """流式执行工作流（SSE）

    前端可以实时看到每一步的执行状态和结果。
    """
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")
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

    engine = Engine(workflow)

    async def event_generator():
        async for event in engine.run_stream(user_inputs=request.inputs):
            data = {
                "event_type": event.event_type,
                "column_id": event.column_id,
                "column_order": event.column_order,
                "block_id": event.block_id,
                "block_name": event.block_name,
                "elapsed": round(event.elapsed, 3),
            }

            if event.data is not None:
                data["data"] = event.data
            if event.error:
                data["error"] = event.error

            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
