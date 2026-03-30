"""
代码生成 API
"""

from __future__ import annotations

import io
import os
import tempfile
import zipfile
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from codegen.generator import CodeGenerator
from storage.file_store import load_workflow

router = APIRouter(prefix="/api/codegen", tags=["codegen"])


@router.post("/{workflow_id}/download")
async def download_code(workflow_id: str):
    """下载生成的代码项目（ZIP）"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")

    generator = CodeGenerator()

    with tempfile.TemporaryDirectory() as tmp_dir:
        project_dir = generator.generate(workflow, tmp_dir)

        # 打包为 ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(project_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arc_name = os.path.relpath(file_path, tmp_dir)
                    zf.write(file_path, arc_name)

        zip_buffer.seek(0)

    # 文件名用 URL 编码处理中文字符
    encoded_name = quote(f"{workflow.name}.zip")
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}"},
    )


@router.post("/{workflow_id}/preview")
async def preview_code(workflow_id: str):
    """预览生成的代码（返回文件列表和内容）"""
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")

    generator = CodeGenerator()

    with tempfile.TemporaryDirectory() as tmp_dir:
        project_dir = generator.generate(workflow, tmp_dir)

        files = {}
        for root, _dirs, filenames in os.walk(project_dir):
            for filename in filenames:
                file_path = os.path.join(root, filename)
                rel_path = os.path.relpath(file_path, project_dir)
                with open(file_path, encoding="utf-8") as f:
                    files[rel_path] = f.read()

    return {"project_name": workflow.name, "files": files}
