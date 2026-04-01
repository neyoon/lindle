"""
工作流 CRUD API + 描述导出 + AI 编辑
"""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from miniflow.models import BlockType, Workflow
from storage.file_store import delete_workflow, list_workflows, load_workflow, save_workflow

logger = logging.getLogger(__name__)

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
                BlockType.INPUT: "输入",
                BlockType.AI: "AI",
                BlockType.OUTPUT: "输出",
                BlockType.PLUGIN: "插件",
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


# ===== AI 编辑 =====

_AI_EDIT_SYSTEM_PROMPT = """\
你是一个工作流编辑助手。用户会给你一个 MiniFlow 工作流的 JSON 和一条修改指令。
你需要根据指令修改工作流 JSON，并返回修改后的**完整** JSON。

## 核心概念

MiniFlow 是一个**多步骤流水线**：
- **Column**（栏）= 一个执行步骤。Column 按 order 字段从小到大依次执行。
- **Block**（块）= 最小执行单元。同一个 Column 内的多个 Block **并行**执行。
- 因此：**需要顺序执行的块必须放在不同的 Column 中**，只有需要并行执行的块才放在同一个 Column。

典型的工作流结构示例：
  Column 0 (输入) → Column 1 (AI 处理) → Column 2 (AI 处理) → Column 3 (输出)
  每个 Column 里放 1~2 个 Block，当然可以更多，视情况而定。

## 数据流规则

- **默认自动流通**：后一个 Column 中的 Block 会自动接收前一个 Column 所有 Block 的输出，无需手动连线。
- **手动连线（connections）**：只有当需要跳过某些步骤、或精确指定数据来源时才使用。大多数情况 connections 应为空数组 []。
- connections 格式: [{ "from_block_id": "blk_xxx", "from_key": null }]，from_key 可用于指定源块 output_schema 中的某个 key。

## JSON 结构

- workflow: { id, name, description, columns: [...] }
- column: { id, order, blocks: [...], repeat }
- block: { id, type, name, config, output_schema, connections }
  - type: "input" | "ai" | "output" | "plugin"
  - config:
    - AI 块: { prompt: "提示词内容", model: null }（model 为 null 使用默认 Provider）
    - 输入块: { fields: [{ name, label, field_type, required, default }] }
    - 输出块: { prompt: null }（通常配置为空）
    - 插件块: { plugin_id: "xxx" }
  - output_schema: { keys: ["key1", "key2"], descriptions: {} } 或 null

## 规则

1. 保持 workflow 的 id 不变
2. 新增 block/column 时，用 "col_<13位时间戳>_<4位随机>" 和 "blk_<13位时间戳>_<4位随机>" 格式生成唯一 id
3. 保持 column 的 order 字段连续（0, 1, 2, ...）
4. **每个 Column 通常只放 1 个 Block**，除非用户明确要求并行
5. **不要把所有块堆在同一个 Column**，按逻辑步骤分到不同 Column
6. connections 大多数情况留空 []，依赖自动数据流即可
7. AI 块的 config.prompt 应写清楚具体的指令内容
8. 只输出修改后的完整 workflow JSON，不要输出任何解释或 markdown 代码块"""


class AIEditRequest(BaseModel):
    instruction: str


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/{workflow_id}/ai-edit")
async def ai_edit_workflow(workflow_id: str, body: AIEditRequest):
    """用自然语言指令修改工作流（SSE 流式返回）"""
    from api.routes.settings import get_ai_edit_provider
    from miniflow.llm import _config

    workflow = load_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="工作流不存在")

    provider = get_ai_edit_provider()
    if provider and provider.get("api_key"):
        api_key = provider["api_key"]
        base_url = provider.get("base_url", "https://api.openai.com/v1")
        model = provider.get("model", "gpt-4o-mini")
    elif _config.api_key:
        api_key, base_url, model = _config.api_key, _config.base_url, _config.default_model
    else:
        raise HTTPException(status_code=400, detail="未配置 AI 编辑 Provider")

    workflow_json = workflow.model_dump_json(indent=2)
    messages = [
        {"role": "system", "content": _AI_EDIT_SYSTEM_PROMPT},
        {"role": "user", "content": f"当前工作流 JSON：\n{workflow_json}\n\n修改指令：{body.instruction}"},
    ]

    async def event_stream():
        full_text = ""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/chat/completions",
                    json={"model": model, "messages": messages, "temperature": 0.3, "stream": True},
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: ") or line == "data: [DONE]":
                            continue
                        try:
                            chunk = json.loads(line[6:])
                            delta = chunk["choices"][0].get("delta", {})
                            if reasoning := delta.get("reasoning_content"):
                                yield _sse("thinking", {"text": reasoning})
                            if content := delta.get("content"):
                                full_text += content
                                yield _sse("delta", {"text": content})
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

            # 解析 JSON
            text = full_text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                text = "\n".join(lines)

            start = text.find("{")
            end = text.rfind("}") + 1
            if start == -1 or end <= start:
                yield _sse("error", {"message": "LLM 输出中未找到有效 JSON"})
                return

            parsed = json.loads(text[start:end])
            parsed["id"] = workflow_id
            updated = Workflow.model_validate(parsed)
            save_workflow(updated)
            yield _sse("done", json.loads(updated.model_dump_json()))

        except httpx.HTTPStatusError as e:
            yield _sse("error", {"message": f"LLM API 错误: {e.response.status_code}"})
        except json.JSONDecodeError as e:
            logger.error("AI 编辑 JSON 解析失败: %s", e)
            yield _sse("error", {"message": f"LLM 返回内容无法解析为 JSON: {e}"})
        except Exception as e:
            logger.error("AI 编辑失败: %s", e)
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
