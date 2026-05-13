"""本地工作区文件路径。"""

from __future__ import annotations

from pathlib import Path

DATA_ROOT = Path(__file__).resolve().parent.parent / "data"
LOCAL_NAMESPACE = "local-user"


def get_data_root() -> Path:
    return DATA_ROOT


def get_local_root() -> Path:
    return DATA_ROOT / "users" / LOCAL_NAMESPACE


def get_local_file(*parts: str) -> Path:
    return get_local_root().joinpath(*parts)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
