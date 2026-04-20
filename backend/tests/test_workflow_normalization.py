import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from flow.models import Workflow
from flow.flowspec import workflow_to_flowspec
from flow.canonical import canonicalize_workflow
from flow.execution_plan import compile_execution_plan
from flow.validation import validate_workflow
from storage import file_store


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
                        "type": "input",
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
    assert canonical.columns[0].blocks[0].block_ref == "block_blk_input"
    assert canonical.inputs[0].field_ref == "input_blk_input_topic"


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
                        "type": "input",
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
                        "type": "ai",
                        "name": "分析",
                        "config": {"prompt": "分析"},
                        "connections": [],
                    },
                    {
                        "id": "blk_ai_2",
                        "type": "ai",
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
                        "type": "output",
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
    assert step_map["blk_ai_1"].depends_on == ["step_blk_input"]
    assert step_map["blk_ai_2"].depends_on == ["step_blk_input"]
    assert step_map["blk_output"].depends_on == ["step_blk_ai_1"]


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
                        "type": "input",
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
                        "type": "ai",
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
                        "type": "input",
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
                        "type": "ai",
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
    assert "invalid_block_name" in codes
    assert "missing_ai_prompt" in codes
    assert "invalid_connection_source" in codes
