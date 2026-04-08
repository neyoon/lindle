"""
当前请求用户上下文

用于在一次请求内把认证后的用户信息传递给存储层和业务层，
避免在每个函数签名里重复传递 user_id。
"""

from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass
import re


@dataclass(slots=True)
class CurrentUser:
    user_id: str
    username: str
    role: str = "user"
    token: str = ""

    @property
    def is_admin(self) -> bool:
        return self.role in {"admin", "superadmin"}


_current_user: ContextVar[CurrentUser | None] = ContextVar("tweak_current_user", default=None)


def set_current_user(user: CurrentUser | None) -> Token:
    return _current_user.set(user)


def reset_current_user(token: Token) -> None:
    _current_user.reset(token)


def get_current_user() -> CurrentUser | None:
    return _current_user.get()


def require_current_user() -> CurrentUser:
    user = get_current_user()
    if user is None:
        raise RuntimeError("当前请求缺少用户上下文")
    return user


def get_current_user_id() -> str | None:
    user = get_current_user()
    return user.user_id if user else None


def get_current_user_role(default: str = "user") -> str:
    user = get_current_user()
    return user.role if user else default


def sanitize_namespace(value: str | None) -> str:
    if not value:
        return "global"
    sanitized = re.sub(r"[^a-zA-Z0-9._-]+", "_", value).strip("._-")
    return sanitized or "global"
