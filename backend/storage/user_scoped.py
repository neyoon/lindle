"""
用户作用域文件路径

当前阶段保留文件存储实现，但把数据按 user_id 隔离到不同目录。
"""

from __future__ import annotations

from pathlib import Path

from api.user_context import get_current_user_id, sanitize_namespace

DATA_ROOT = Path(__file__).resolve().parent.parent / "data"


def get_data_root() -> Path:
    return DATA_ROOT


def get_user_root(user_id: str | None = None) -> Path:
    namespace = sanitize_namespace(user_id or get_current_user_id())
    return DATA_ROOT / "users" / namespace


def get_user_file(*parts: str, user_id: str | None = None) -> Path:
    return get_user_root(user_id=user_id).joinpath(*parts)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
