"""
Flow 设计器 Skill

允许 Agent 通过自然语言创建 Flow。
复用现有的 AI 编辑功能。
"""

from __future__ import annotations

import json
from typing import Any

from plugins.base import BasePlugin, PluginMeta


class WorkflowDesignerSkill(BasePlugin):
    """Flow 设计器 - 通过自然语言创建 Flow"""

    meta = PluginMeta(
        id="workflow_designer",
        name="Flow 设计器",
        icon="",
        description="通过自然语言描述创建 Flow",
        category="skill",
        params=[],
        input_schema={
            "type": "object",
            "description": "创建 Flow 所需的参数",
            "properties": {
                "instruction": {
                    "type": "string",
                    "description": "Flow 的自然语言描述",
                },
                "name": {
                    "type": "string",
                    "description": "Flow 名称（可选）",
                },
            },
            "required": ["instruction"],
            "examples": [
                '{"instruction": "创建一个流程：输入文本，翻译成英文，然后总结", "name": "文本翻译总结"}',
                '{"instruction": "做一个数据清洗流程：输入 CSV，去除空值和重复项"}',
            ],
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean", "description": "创建是否成功"},
                "workflow_id": {"type": "string", "description": "创建的 Flow ID"},
                "workflow_name": {"type": "string", "description": "Flow 名称"},
                "error": {"type": "string", "description": "错误信息（如果失败）"},
            },
        },
    )

    async def execute(self, input_data: str, config: dict[str, Any]) -> dict:
        """创建 Flow

        Args:
            input_data: JSON 格式的输入数据，包含 instruction 和可选的 name
            config: 配置参数（本 Skill 不需要）

        Returns:
            包含创建结果的字典
        """
        try:
            data = json.loads(input_data)
            instruction = data.get("instruction")
            name = data.get("name", "新建工作流")

            if not instruction:
                return {
                    "success": False,
                    "workflow_id": "",
                    "workflow_name": "",
                    "error": "缺少 instruction 参数",
                }

            # 导入工作流相关模块
            from datetime import datetime
            from storage.file_store import save_workflow
            from flow.models import Workflow

            # 创建空白工作流
            workflow_id = f"wf_{int(datetime.now().timestamp() * 1000)}_{id(self) % 1000000}"
            workflow = Workflow(
                id=workflow_id,
                name=name,
                description=f"由 Agent 创建：{instruction[:100]}",
                columns=[],
            )

            # 保存空白工作流
            save_workflow(workflow)

            # 使用 AI 编辑功能生成工作流内容
            # 导入 AI 编辑相关模块
            import httpx
            from api.routes.settings import get_ai_edit_provider
            from shared_llm import _config

            # 获取 LLM 配置
            provider = get_ai_edit_provider()
            if provider and provider.get("api_key"):
                api_key = provider["api_key"]
                base_url = provider.get("base_url", "https://api.openai.com/v1")
                model = provider.get("model", "gpt-4o-mini")
            elif _config.api_key:
                api_key = _config.api_key
                base_url = _config.base_url
                model = _config.default_model
            else:
                return {
                    "success": False,
                    "workflow_id": "",
                    "workflow_name": "",
                    "error": "未配置 AI 编辑 Provider",
                }

            # 构建 AI 编辑的 prompt
            from api.routes.workflow import _AI_EDIT_SYSTEM_PROMPT, _build_plugins_info

            plugins_info = _build_plugins_info()
            workflow_json = workflow.model_dump_json(indent=2)

            messages = [
                {"role": "system", "content": _AI_EDIT_SYSTEM_PROMPT + plugins_info},
                {
                    "role": "user",
                    "content": f"当前工作流 JSON：\n{workflow_json}\n\n修改指令：{instruction}",
                },
            ]

            # 调用 LLM 生成工作流
            full_text = ""
            async with httpx.AsyncClient(timeout=120.0) as client:
                is_reasoning_model = "o1" in model.lower() or "o3" in model.lower()
                request_body = {
                    "model": model,
                    "messages": messages,
                    "temperature": 0.3,
                    "stream": True,
                }
                if not is_reasoning_model:
                    request_body["response_format"] = {"type": "json_object"}

                async with client.stream(
                    "POST",
                    f"{base_url}/chat/completions",
                    json=request_body,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: ") or line == "data: [DONE]":
                            continue
                        try:
                            chunk = json.loads(line[6:])
                            delta = chunk["choices"][0].get("delta", {})
                            if content := delta.get("content"):
                                full_text += content
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
                return {
                    "success": False,
                    "workflow_id": "",
                    "workflow_name": "",
                    "error": "LLM 输出中未找到有效 JSON",
                }

            parsed = json.loads(text[start:end])
            parsed["id"] = workflow_id
            updated = Workflow.model_validate(parsed)
            save_workflow(updated)

            return {
                "success": True,
                "workflow_id": workflow_id,
                "workflow_name": updated.name,
                "error": None,
            }

        except json.JSONDecodeError as e:
            return {
                "success": False,
                "workflow_id": "",
                "workflow_name": "",
                "error": f"JSON 解析失败：{str(e)}",
            }
        except Exception as e:
            return {
                "success": False,
                "workflow_id": "",
                "workflow_name": "",
                "error": f"创建失败：{str(e)}",
            }

