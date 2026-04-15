"""
Flow 执行器 Skill

允许 Agent 执行预先绑定的 Flow。
Agent 可以通过此 Skill 调用 Flow 能力。
"""

from __future__ import annotations

import json
from typing import Any

from plugins.base import BasePlugin, PluginMeta


def _preview_text(data: Any, max_lines: int = 3, max_chars: int = 240) -> str:
    if data is None:
        return ""
    if isinstance(data, str):
        text = data
    else:
        try:
            text = json.dumps(data, ensure_ascii=False, indent=2)
        except Exception:
            text = str(data)

    lines = [line for line in text.splitlines() if line.strip()]
    preview = "\n".join(lines[:max_lines]) if lines else text[:max_chars]
    if len(preview) > max_chars:
        preview = preview[:max_chars].rstrip() + "..."
    elif len(lines) > max_lines or len(text) > len(preview):
        preview = preview.rstrip() + "..."
    return preview


class WorkflowExecutorSkill(BasePlugin):
    """Flow 执行器 - 执行指定的 Flow"""

    meta = PluginMeta(
        id="workflow_executor",
        name="Flow 执行器",
        icon="",
        description="执行预先配置的 Flow",
        category="skill",
        params=[],
        input_schema={
            "type": "object",
            "description": "执行 Flow 所需的参数",
            "properties": {
                "workflow_id": {
                    "type": "string",
                    "description": "要执行的 Flow ID",
                },
                "inputs": {
                    "type": "object",
                    "description": "传给 Flow 的输入参数（键值对）",
                },
            },
            "required": ["workflow_id", "inputs"],
            "examples": [
                '{"workflow_id": "wf_abc123", "inputs": {"text": "Hello World"}}',
                '{"workflow_id": "wf_def456", "inputs": {"csv_data": "name,age\\nAlice,30"}}',
            ],
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean", "description": "执行是否成功"},
                "output": {"type": "object", "description": "Flow 的输出结果"},
                "error": {"type": "string", "description": "错误信息（如果失败）"},
                "elapsed": {"type": "number", "description": "执行耗时（秒）"},
            },
        },
    )

    async def execute(self, input_data: str, config: dict[str, Any]) -> dict:
        """执行 Flow

        Args:
            input_data: JSON 格式的输入数据，包含 workflow_id 和 inputs
            config: 配置参数（本 Skill 不需要）

        Returns:
            包含执行结果的字典
        """
        try:
            data = json.loads(input_data)
            workflow_id = data.get("workflow_id")
            inputs = data.get("inputs", {})

            if not workflow_id:
                return {
                    "success": False,
                    "output": {},
                    "error": "缺少 workflow_id 参数",
                    "elapsed": 0,
                }

            # 导入工作流相关模块
            from storage.file_store import load_workflow
            from flow.engine import Engine

            # 加载工作流
            workflow = load_workflow(workflow_id)
            if workflow is None:
                return {
                    "success": False,
                    "output": {},
                    "error": f"Flow {workflow_id} 不存在",
                    "elapsed": 0,
                }

            # 执行工作流
            engine = Engine(workflow)
            result = await engine.run(user_inputs=inputs)

            return {
                "success": result.success,
                "output": result.output,
                "error": result.error if not result.success else None,
                "elapsed": result.total_elapsed,
            }

        except json.JSONDecodeError:
            return {
                "success": False,
                "output": {},
                "error": "输入数据不是有效的 JSON",
                "elapsed": 0,
            }
        except Exception as e:
            return {
                "success": False,
                "output": {},
                "error": f"执行失败：{str(e)}",
                "elapsed": 0,
            }

    async def execute_stream(self, input_data: str, config: dict[str, Any]):
        """流式执行 Flow，向 Agent 透出列/块进度。"""
        try:
            data = json.loads(input_data)
            workflow_id = data.get("workflow_id")
            inputs = data.get("inputs", {})

            if not workflow_id:
                yield {
                    "type": "result",
                    "data": {
                        "success": False,
                        "output": {},
                        "error": "缺少 workflow_id 参数",
                        "elapsed": 0,
                    },
                }
                return

            from storage.file_store import load_workflow
            from flow.engine import Engine

            workflow = load_workflow(workflow_id)
            if workflow is None:
                yield {
                    "type": "result",
                    "data": {
                        "success": False,
                        "output": {},
                        "error": f"Flow {workflow_id} 不存在",
                        "elapsed": 0,
                    },
                }
                return

            engine = Engine(workflow)
            output: dict[str, Any] = {}
            total_elapsed = 0.0

            async for event in engine.run_stream(user_inputs=inputs):
                if event.event_type == "column_start":
                    yield {
                        "type": "progress",
                        "data": f"开始执行第 {event.column_order + 1} 步",
                    }
                elif event.event_type == "block_start":
                    yield {
                        "type": "progress",
                        "data": f"正在执行块「{event.block_name}」",
                    }
                elif event.event_type == "block_done":
                    preview = _preview_text(event.data)
                    message = f"块「{event.block_name}」执行完成"
                    if preview:
                        message = f"{message}\n{preview}"
                    yield {
                        "type": "progress",
                        "data": message,
                    }
                elif event.event_type == "flow_done":
                    output = event.data or {}
                    total_elapsed = event.elapsed
                elif event.event_type == "error":
                    yield {
                        "type": "result",
                        "data": {
                            "success": False,
                            "output": {},
                            "error": event.error or "执行失败",
                            "elapsed": event.elapsed,
                        },
                    }
                    return

            yield {
                "type": "result",
                "data": {
                    "success": True,
                    "output": output,
                    "error": None,
                    "elapsed": total_elapsed,
                },
            }
        except json.JSONDecodeError:
            yield {
                "type": "result",
                "data": {
                    "success": False,
                    "output": {},
                    "error": "输入数据不是有效的 JSON",
                    "elapsed": 0,
                },
            }
        except Exception as e:
            yield {
                "type": "result",
                "data": {
                    "success": False,
                    "output": {},
                    "error": f"执行失败：{str(e)}",
                    "elapsed": 0,
                },
            }
