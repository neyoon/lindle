import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from flow.models import Workflow
from flow.blocks import BlockExecutor
from flow.context import BlockResult, Context
from flow.flowspec import workflow_to_flowspec
from flow.canonical import canonicalize_workflow
from flow.execution_plan import compile_execution_plan
from flow.materialize import materialize_flowspec
from flow.validation import validate_workflow
from storage import file_store
from api.routes.workflow import _parse_generated_workflow


def test_workflow_model_coerces_nullable_collections():
    workflow = Workflow.model_validate({
        "id": "wf_test",
        "name": "test",
        "description": "",
        "columns": [
            {
                "id": "col_1",
                "order": 0,
                "blocks": None,
                "repeat": None,
            },
        ],
        "stop_on_error": None,
    })

    assert workflow.stop_on_error is True
    assert len(workflow.columns) == 1
    assert workflow.columns[0].blocks == []
    assert workflow.columns[0].repeat == 1


def test_load_workflow_repairs_legacy_null_fields(tmp_path, monkeypatch):
    workflow_path = tmp_path / "workflows" / "wf_test.json"
    workflow_path.parent.mkdir(parents=True, exist_ok=True)
    workflow_path.write_text(json.dumps({
        "id": "wf_test",
        "name": "legacy",
        "description": "",
        "columns": [
            {
                "id": "col_1",
                "order": 0,
                "blocks": None,
                "repeat": None,
            },
            {
                "id": "col_2",
                "order": 1,
                "blocks": None,
                "repeat": None,
            },
        ],
        "stop_on_error": True,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    def fake_get_user_file(*parts: str, user_id: str | None = None):
        return tmp_path.joinpath(*parts)

    monkeypatch.setattr(file_store, "get_user_file", fake_get_user_file)

    workflow = file_store.load_workflow("wf_test")
    assert workflow is not None
    assert [column.blocks for column in workflow.columns] == [[], []]
    assert [column.repeat for column in workflow.columns] == [1, 1]

    repaired = json.loads(workflow_path.read_text(encoding="utf-8"))
    assert repaired["columns"][0]["blocks"] == []
    assert repaired["columns"][0]["repeat"] == 1
    assert repaired["columns"][1]["blocks"] == []
    assert repaired["columns"][1]["repeat"] == 1


def test_canonicalize_workflow_builds_stable_refs():
    workflow = Workflow.model_validate({
        "id": "wf_test",
        "name": "测试流程",
        "description": "",
        "columns": [
            {
                "id": "col_1",
                "order": 0,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_input",
                        "ref": "blk_input",
                        "type": "collect",
                        "name": "输入",
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
            }
        ],
    })

    canonical = canonicalize_workflow(workflow)

    assert canonical.workflow_id == "wf_test"
    assert canonical.columns[0].blocks[0].block_ref == "blk_input"
    assert canonical.inputs[0].field_ref == "topic"


def test_workflow_to_flowspec_preserves_step_dependencies():
    workflow = Workflow.model_validate({
        "id": "wf_test",
        "name": "测试流程",
        "description": "测试依赖",
        "columns": [
            {
                "id": "col_1",
                "order": 0,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_input",
                        "ref": "blk_input",
                        "type": "collect",
                        "name": "输入",
                        "config": {"fields": [{"name": "topic", "label": "主题", "field_type": "text", "required": True, "default": None}]},
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
                        "id": "blk_ai_1",
                        "ref": "blk_ai_1",
                        "type": "process",
                        "name": "分析",
                        "config": {"prompt": "分析"},
                        "connections": [],
                    },
                    {
                        "id": "blk_ai_2",
                        "ref": "blk_ai_2",
                        "type": "process",
                        "name": "总结",
                        "config": {"prompt": "总结"},
                        "connections": [],
                    },
                ],
            },
            {
                "id": "col_3",
                "order": 2,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_output",
                        "ref": "blk_output",
                        "type": "result",
                        "name": "输出",
                        "config": {},
                        "connections": [{"from_block_id": "blk_ai_1", "from_key": None}],
                    }
                ],
            },
        ],
    })

    spec = workflow_to_flowspec(workflow)

    step_map = {step.source_block_id: step for step in spec.steps}
    assert step_map["blk_ai_1"].depends_on == ["blk_input"]
    assert step_map["blk_ai_2"].depends_on == ["blk_input"]
    assert step_map["blk_output"].depends_on == ["blk_ai_1"]


def test_compile_execution_plan_preserves_columns_and_connections():
    workflow = Workflow.model_validate({
        "id": "wf_test",
        "name": "测试流程",
        "description": "",
        "columns": [
            {
                "id": "col_1",
                "order": 0,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_input",
                        "ref": "blk_input",
                        "type": "collect",
                        "name": "输入",
                        "config": {"fields": []},
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
                        "ref": "blk_ai",
                        "type": "process",
                        "name": "总结",
                        "config": {"prompt": "总结"},
                        "connections": [{"from_block_id": "blk_input", "from_key": None}],
                    }
                ],
            },
        ],
    })

    canonical = canonicalize_workflow(workflow)
    plan = compile_execution_plan(canonical)

    assert plan.workflow_id == "wf_test"
    assert len(plan.columns) == 2
    assert plan.columns[1].blocks[0].block.id == "blk_ai"
    assert plan.columns[1].blocks[0].resolved_inputs == [
        {"from_block_id": "blk_input", "from_key": None}
    ]
    assert plan.edges == [
        {"from_block_id": "blk_input", "to_block_id": "blk_ai", "from_key": None}
    ]


def test_materialize_flowspec_preserves_workflow_shape():
    workflow = Workflow.model_validate({
        "id": "wf_test",
        "name": "测试流程",
        "description": "物化测试",
        "columns": [
            {
                "id": "col_input",
                "order": 0,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_input",
                        "ref": "blk_input",
                        "type": "collect",
                        "name": "输入",
                        "config": {
                            "fields": [{"name": "topic", "label": "主题", "field_type": "text", "required": True, "default": None}]
                        },
                        "connections": [],
                    }
                ],
            },
            {
                "id": "col_ai",
                "order": 1,
                "repeat": 2,
                "blocks": [
                    {
                        "id": "blk_ai",
                        "ref": "blk_ai",
                        "type": "process",
                        "name": "写作",
                        "config": {"prompt": "围绕 {{inputs.topic}} 写一段文字"},
                        "connections": [{"from_block_id": "blk_input", "from_key": None}],
                    }
                ],
            },
        ],
    })

    spec = workflow_to_flowspec(workflow)
    materialized = materialize_flowspec(spec)

    assert materialized.id == workflow.id
    assert materialized.name == workflow.name
    assert len(materialized.columns) == 2
    assert materialized.columns[1].id == "col_ai"
    assert materialized.columns[1].repeat == 2
    assert materialized.columns[1].blocks[0].id == "blk_ai"
    assert materialized.columns[1].blocks[0].connections[0].from_block_id == "blk_input"


def test_parse_generated_workflow_accepts_flowspec_payload():
    generated = """
    {
      "workflow_id": "wf_will_be_overridden",
      "name": "AI 生成流程",
      "description": "测试 FlowSpec 解析",
      "goal": "输入主题后生成摘要",
      "inputs": [
        {
          "input_ref": "topic",
          "name": "topic",
          "label": "主题",
          "field_type": "text",
          "required": true,
          "default": null
        }
      ],
      "outputs": [
        {
          "output_ref": "output_blk_output",
          "name": "输出",
          "source_step_refs": ["blk_output"]
        }
      ],
      "steps": [
        {
          "step_ref": "blk_input",
          "title": "输入",
          "type": "collect",
          "purpose": "接收用户输入",
          "depends_on": [],
          "output_contract": {},
          "prompt": null,
          "input_refs": ["topic"],
          "source_block_id": "blk_input",
          "source_column_id": "col_input",
          "repeat": 1,
          "order_hint": 0
        },
        {
          "step_ref": "blk_ai",
          "title": "总结",
          "type": "process",
          "purpose": "总结输入主题",
          "depends_on": ["blk_input"],
          "output_contract": {},
          "prompt": "请总结 {{inputs.topic}}",
          "input_refs": [],
          "source_block_id": "blk_ai",
          "source_column_id": "col_ai",
          "repeat": 1,
          "order_hint": 1
        },
        {
          "step_ref": "blk_output",
          "title": "输出",
          "type": "result",
          "purpose": "输出最终结果",
          "depends_on": ["blk_ai"],
          "output_contract": {},
          "prompt": null,
          "input_refs": [],
          "source_block_id": "blk_output",
          "source_column_id": "col_output",
          "repeat": 1,
          "order_hint": 2
        }
      ],
      "stop_on_error": true,
      "meta": { "source": "test" }
    }
    """

    workflow = _parse_generated_workflow(generated, "wf_test")

    assert workflow.id == "wf_test"
    assert workflow.name == "AI 生成流程"
    assert [column.id for column in workflow.get_sorted_columns()] == ["col_input", "col_ai", "col_output"]
    assert workflow.get_block_by_id("blk_ai") is not None


def test_validate_workflow_reports_duplicate_inputs_and_invalid_connections():
    workflow = Workflow.model_validate({
        "id": "wf_invalid",
        "name": "测试流程",
        "description": "",
        "columns": [
            {
                "id": "col_1",
                "order": 0,
                "repeat": 0,
                "blocks": [
                    {
                        "id": "blk_input",
                        "ref": "blk_input",
                        "type": "collect",
                        "name": "输入",
                        "config": {
                            "fields": [
                                {"name": "topic", "label": "主题", "field_type": "text", "required": True, "default": None},
                                {"name": "topic", "label": "重复主题", "field_type": "text", "required": True, "default": None},
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
                        "ref": "blk_ai",
                        "type": "process",
                        "name": "坏.名字",
                        "config": {"prompt": ""},
                        "connections": [{"from_block_id": "missing_block", "from_key": None}],
                    }
                ],
            },
        ],
    })

    issues = validate_workflow(workflow)
    codes = {issue.code for issue in issues}

    assert "duplicate_input_name" in codes
    assert "invalid_repeat" in codes
    assert "missing_process_prompt" in codes
    assert "invalid_connection_source" in codes


def test_validate_workflow_reports_invalid_variable_references():
    workflow = Workflow.model_validate({
        "id": "wf_invalid_vars",
        "name": "变量错误",
        "description": "",
        "columns": [
            {
                "id": "col_1",
                "order": 0,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_input",
                        "ref": "blk_input",
                        "type": "collect",
                        "name": "输入",
                        "config": {
                            "fields": [
                                {"name": "topic", "label": "主题", "field_type": "text", "required": True, "default": None},
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
                        "ref": "blk_ai",
                        "type": "process",
                        "name": "总结",
                        "config": {"prompt": "请处理 {{inputs.missing}} 和 {{steps.missing.score}}"},
                        "connections": [],
                    }
                ],
            },
        ],
    })

    issues = validate_workflow(workflow)
    codes = [issue.code for issue in issues]
    assert "invalid_variable_reference" in codes


@pytest.mark.asyncio
async def test_output_block_keeps_structured_upstream_value():
    block = Workflow.model_validate({
        "id": "wf_output_test",
        "name": "输出测试",
        "description": "",
        "columns": [
            {
                "id": "col_output",
                "order": 0,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_output",
                        "ref": "blk_output",
                        "type": "result",
                        "name": "输出",
                        "config": {},
                        "connections": [],
                    }
                ],
            }
        ],
    }).columns[0].blocks[0]

    context = Context()
    context.add_column_results("col_ai", [
        BlockResult(block_id="blk_ai", block_ref="blk_ai", block_name="分析", data={"summary": "ok", "score": 8})
    ])

    result = await BlockExecutor.execute(block, context)
    assert result.data == {"summary": "ok", "score": 8}


@pytest.mark.asyncio
async def test_plugin_block_supports_input_bindings(monkeypatch):
    block = Workflow.model_validate({
        "id": "wf_plugin_binding",
        "name": "插件映射测试",
        "description": "",
        "columns": [
            {
                "id": "col_plugin",
                "order": 0,
                "repeat": 1,
                "blocks": [
                    {
                        "id": "blk_plugin",
                        "ref": "blk_plugin",
                        "type": "tool",
                        "name": "搜索插件",
                        "config": {
                            "plugin_id": "mock_tool",
                            "plugin_input_bindings": {
                                "query": {"kind": "variable", "value": "inputs.keyword"},
                                "limit": {"kind": "literal", "value": 5}
                            }
                        },
                        "connections": [],
                    }
                ],
            }
        ],
    }).columns[0].blocks[0]

    captured: dict[str, str] = {}

    async def fake_execute_plugin(plugin_id: str, input_data: str):
        captured["plugin_id"] = plugin_id
        captured["input_data"] = input_data
        return {"ok": True}

    import plugins.registry as plugin_registry

    monkeypatch.setattr(plugin_registry, "execute_plugin", fake_execute_plugin)

    context = Context(user_inputs={"keyword": "lindle"})
    result = await BlockExecutor.execute(block, context)

    assert result.data == {"ok": True}
    assert captured["plugin_id"] == "mock_tool"
    assert json.loads(captured["input_data"]) == {"query": "lindle", "limit": 5}
