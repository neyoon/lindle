"""
工作流 CRUD API + 描述导出
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from miniflow.models import BlockType, Workflow
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


# ===== 描述导出（LLM 友好格式）=====


@router.get("/{workflow_id}/describe")
async def describe_workflow(workflow_id: str):
    """导出工作流的 LLM 友好文本描述

    将工作流转换为结构化的自然语言描述，
    方便直接复制粘贴给大模型理解整个流程。
    """
    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")

    description = _generate_description(workflow)
    return {"description": description}


def _generate_description(workflow: Workflow) -> str:
    """将工作流转换为 LLM 友好的文本描述"""
    lines: list[str] = []
    columns = workflow.get_sorted_columns()

    # 标题
    lines.append(f"## 工作流：{workflow.name}")
    if workflow.description:
        lines.append(f"\n{workflow.description}")

    # 概览
    total_blocks = sum(len(c.blocks) for c in columns)
    lines.append(f"\n执行流程（共 {len(columns)} 步，{total_blocks} 个块，按顺序执行）：")
    lines.append("")

    # 逐步描述
    for i, col in enumerate(columns):
        step_num = i + 1
        repeat_hint = f"（重复 {col.repeat} 次）" if col.repeat > 1 else ""
        parallel_hint = "（栏内并行执行）" if len(col.blocks) > 1 else ""

        lines.append(f"### 步骤 {step_num}{repeat_hint}{parallel_hint}")
        lines.append("")

        for block in col.blocks:
            type_label = {
                BlockType.INPUT: "📥 输入",
                BlockType.AI: "🤖 AI",
                BlockType.OUTPUT: "📤 输出",
                BlockType.PLUGIN: "🔌 插件",
            }.get(block.type, str(block.type))

            lines.append(f"**[{type_label}] {block.name}**")

            # 输入块
            if block.type == BlockType.INPUT and block.config.fields:
                for f in block.config.fields:
                    req = "必填" if f.required else "选填"
                    lines.append(f"  - 字段: `{f.name}` ({f.field_type}, {req})")

            # AI 块
            if block.type == BlockType.AI:
                if block.config.prompt:
                    prompt_preview = block.config.prompt
                    lines.append(f"  - 提示词:\n    ```\n    {prompt_preview}\n    ```")
                if block.config.model:
                    lines.append(f"  - 模型: `{block.config.model}`")
                else:
                    lines.append("  - 模型: 默认")
                if block.output_schema and block.output_schema.keys:
                    keys = ", ".join(f"`{k}`" for k in block.output_schema.keys)
                    lines.append(f"  - JSON 输出 key: {keys}")

            # 插件块
            if block.type == BlockType.PLUGIN:
                lines.append(f"  - 插件 ID: `{block.config.plugin_id or '未配置'}`")

            # 连接信息
            if block.connections:
                sources = []
                for conn in block.connections:
                    src = conn.from_block_id
                    # 尝试找到源块名称
                    src_block = workflow.get_block_by_id(src)
                    src_name = src_block.name if src_block else src
                    if conn.from_key:
                        sources.append(f"`{src_name}.{conn.from_key}`")
                    else:
                        sources.append(f"`{src_name}`")
                lines.append(f"  - 数据来源（手动连线）: {', '.join(sources)}")
            else:
                if i > 0:
                    lines.append("  - 数据来源: 自动接收上一步全部输出")

            lines.append("")

    # 数据流说明
    lines.append("---")
    lines.append("")
    lines.append("**数据流规则：**")
    lines.append("- 默认：每步自动接收上一步所有块的全部输出")
    lines.append("- 手动连线：仅接收指定来源块的输出（可精确到某个 JSON key）")
    lines.append("- 同一步内的多个块并行执行")

    return "\n".join(lines)
