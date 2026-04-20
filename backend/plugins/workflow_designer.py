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
        """创建 Flow（同步版本）

        Args:
            input_data: JSON 格式的输入数据，包含 instruction 和可选的 name
            config: 配置参数（本 Skill 不需要）

        Returns:
            包含创建结果的字典
        """
        # 使用流式版本，但只返回最终结果
        result = None
        async for event in self.execute_stream(input_data, config):
            if event["type"] == "result":
                result = event["data"]
        return result

    async def execute_stream(self, input_data: str, config: dict[str, Any]):
        """创建 Flow（流式版本，支持进度回调）

        Yields:
            {"type": "progress", "data": str}  # 进度消息
            {"type": "result", "data": dict}   # 最终结果
        """
        try:
            data = json.loads(input_data)
            instruction = data.get("instruction")
            name = data.get("name", "新建工作流")

            if not instruction:
                yield {
                    "type": "result",
                    "data": {
                        "success": False,
                        "workflow_id": "",
                        "workflow_name": "",
                        "error": "缺少 instruction 参数",
                    }
                }
                return

            yield {"type": "progress", "data": "正在创建工作流..."}
            print(f"[workflow_designer] 正在创建工作流...")

            # 导入工作流相关模块
            from datetime import datetime
            from storage.file_store import save_workflow
            from flow.flowspec import FlowSpec

            # 创建空白工作流
            workflow_id = f"wf_{int(datetime.now().timestamp() * 1000)}_{id(self) % 1000000}"
            spec = FlowSpec(
                workflow_id=workflow_id,
                name=name,
                description=f"由 Agent 创建：{instruction[:100]}",
                goal=instruction,
                inputs=[],
                outputs=[],
                steps=[],
                meta={"source": "workflow_designer"},
            )

            yield {"type": "progress", "data": "正在调用 AI 生成工作流内容..."}
            print(f"[workflow_designer] 正在调用 AI 生成工作流内容...")

            # 使用 AI 编辑功能生成工作流内容
            # 导入 AI 编辑相关模块
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
                yield {
                    "type": "result",
                    "data": {
                        "success": False,
                        "workflow_id": "",
                        "workflow_name": "",
                        "error": "未配置 AI 编辑 Provider",
                    }
                }
                return

            # 构建 AI 编辑的 prompt
            from api.routes.workflow import _AI_EDIT_SYSTEM_PROMPT, _build_plugins_info

            plugins_info = _build_plugins_info()
            flowspec_json = spec.model_dump_json(indent=2)

            # 强制要求 JSON 输出
            system_prompt = _AI_EDIT_SYSTEM_PROMPT + plugins_info + "\n\n**重要：你必须只返回有效的 JSON 对象，不要包含任何其他内容。**"

            messages = [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"当前 FlowSpec JSON：\n{flowspec_json}\n\n修改指令：{instruction}",
                },
            ]

            # 调用 LLM 生成工作流（使用流式调用，显示进度）
            from shared_llm import call_llm_with_messages_stream

            full_text = ""
            last_progress_length = 0
            try:
                # 使用流式调用，每 1000 字符显示一次进度
                async for chunk in call_llm_with_messages_stream(
                    messages=messages,
                    model=model,
                    temperature=0.3,
                    api_key=api_key,
                    base_url=base_url,
                ):
                    if chunk["type"] == "content":
                        content = chunk["data"]
                        full_text += content

                        # 每 1000 字符发送一次进度
                        if len(full_text) - last_progress_length >= 1000:
                            progress_msg = f"AI 正在生成工作流... ({len(full_text)} 字符)"
                            print(f"[workflow_designer] {progress_msg}")
                            yield {"type": "progress", "data": progress_msg}
                            last_progress_length = len(full_text)
                    elif chunk["type"] == "done":
                        # 流式完成
                        print(f"[workflow_designer] LLM 流式调用完成，共生成 {len(full_text)} 字符")
                        break
            except Exception as e:
                print(f"[workflow_designer] LLM 调用失败 - {type(e).__name__}: {str(e)}")
                yield {
                    "type": "result",
                    "data": {
                        "success": False,
                        "workflow_id": "",
                        "workflow_name": "",
                        "error": f"LLM 调用失败: {type(e).__name__} - {str(e)}",
                    }
                }
                return

            yield {"type": "progress", "data": "正在解析生成的工作流..."}

            from api.routes.workflow import _parse_generated_workflow

            updated = _parse_generated_workflow(full_text, workflow_id)
            save_workflow(updated)

            yield {"type": "progress", "data": "工作流创建完成！"}

            yield {
                "type": "result",
                "data": {
                    "success": True,
                    "workflow_id": workflow_id,
                    "workflow_name": updated.name,
                    "error": None,
                }
            }

        except ValueError as e:
            yield {
                "type": "result",
                "data": {
                    "success": False,
                    "workflow_id": "",
                    "workflow_name": "",
                    "error": str(e),
                }
            }
        except json.JSONDecodeError as e:
            yield {
                "type": "result",
                "data": {
                    "success": False,
                    "workflow_id": "",
                    "workflow_name": "",
                    "error": f"JSON 解析失败：{str(e)}",
                }
            }
        except Exception as e:
            yield {
                "type": "result",
                "data": {
                    "success": False,
                    "workflow_id": "",
                    "workflow_name": "",
                    "error": f"创建失败：{str(e)}",
                }
            }
