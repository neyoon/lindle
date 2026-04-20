import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent.models import Agent
from exporters.manifests import build_agent_export, build_workflow_export
from flow.models import Workflow


def test_build_workflow_export_keeps_default_input_semantics():
    workflow = Workflow.model_validate({
        "id": "wf_export",
        "name": "导出测试流程",
        "description": "测试结构化导出",
        "columns": [
            {
                "id": "col_1",
                "order": 0,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_input",
                        "type": "input",
                        "name": "输入块",
                        "config": {
                            "fields": [
                                {
                                    "name": "topic",
                                    "label": "主题",
                                    "field_type": "text",
                                    "required": True,
                                    "default": None,
                                }
                            ]
                        },
                        "connections": [],
                    }
                ],
            },
            {
                "id": "col_2",
                "order": 1,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_ai",
                        "type": "ai",
                        "name": "总结",
                        "config": {"prompt": "请总结输入内容", "model": None},
                        "output_schema": {"keys": ["summary"], "descriptions": {}},
                        "connections": [],
                    },
                    {
                        "id": "blk_plugin",
                        "type": "plugin",
                        "name": "执行器",
                        "config": {
                            "plugin_id": "workflow_executor",
                            "prompt": None,
                            "plugin_input_bindings": {
                                "workflow_id": {"kind": "literal", "value": "wf_export"}
                            },
                        },
                        "connections": [],
                    },
                ],
            },
        ],
        "stop_on_error": True,
    })

    exported = build_workflow_export(workflow)

    assert exported["manifest_type"] == "lindle_flow"
    assert exported["execution_semantics"]["default_ai_input"] == "formatted_text"
    assert exported["execution_semantics"]["default_plugin_input"] == "structured_upstream_value"
    assert exported["inputs"][0]["name"] == "topic"
    assert exported["steps"][1]["execution_mode"] == "parallel"
    assert exported["steps"][1]["blocks"][0]["default_input_mode"] == "formatted_text"
    assert exported["steps"][1]["blocks"][1]["default_input_mode"] == "structured_upstream_value"
    assert exported["steps"][1]["blocks"][1]["plugin_input_bindings"]["workflow_id"]["kind"] == "literal"
    assert exported["execution_semantics"]["default_output_behavior"] == "structured_passthrough"
    assert exported["llm_description"]


def test_build_agent_export_keeps_skill_config_and_bound_flows(monkeypatch):
    workflow = Workflow.model_validate({
        "id": "wf_bound",
        "name": "已绑定流程",
        "description": "供 Agent 使用",
        "columns": [],
        "stop_on_error": True,
    })

    monkeypatch.setattr("exporters.manifests.load_workflow", lambda workflow_id: workflow if workflow_id == "wf_bound" else None)

    agent = Agent.model_validate({
        "id": "agent_export",
        "name": "导出测试 Agent",
        "description": "测试 Agent 导出",
        "system_prompt": "你是一个测试助手",
        "model_provider_id": "provider_default",
        "skills": [
            {
                "skill_id": "workflow_executor",
                "order": 0,
                "config": {"flows": "wf_bound,missing_flow"},
            }
        ],
        "created_at": "2026-04-20T00:00:00",
        "updated_at": "2026-04-20T00:00:00",
    })

    exported = build_agent_export(agent)

    assert exported["manifest_type"] == "lindle_agent"
    assert exported["summary"]["model_provider_id"] == "provider_default"
    assert exported["skills"][0]["config"]["flows"] == "wf_bound,missing_flow"
    assert exported["skills"][0]["bound_flows"][0]["workflow_id"] == "wf_bound"
    assert exported["skills"][0]["bound_flows"][0]["name"] == "已绑定流程"
    assert exported["skills"][0]["bound_flows"][1]["missing"] is True
