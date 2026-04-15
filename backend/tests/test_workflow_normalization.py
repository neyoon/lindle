import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from flow.models import Workflow
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
