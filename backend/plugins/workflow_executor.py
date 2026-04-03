"""
Flow 执行器 Skill

允许 Agent 执行预先绑定的 Flow。
Agent 可以通过此 Skill 调用 Flow 能力。
"""

from __future__ import annotations

import json
from typing import Any

from plugins.base import BasePlugin, PluginMeta


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

