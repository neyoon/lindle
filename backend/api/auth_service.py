"""
认证服务

支持两种模式:
1. coxie: 通过 Bearer Token 调用 Coxie 的 /api/user/profile 校验用户
2. dev: 本地开发模式，直接注入固定测试用户
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Any

import httpx
from fastapi import HTTPException, Request, status

from api.user_context import CurrentUser


@dataclass(slots=True)
class AuthSettings:
    mode: str
    coxie_base_url: str
    dev_user_id: str
    dev_username: str
    dev_role: str
    timeout_seconds: float


def get_auth_settings() -> AuthSettings:
    return AuthSettings(
        mode=os.getenv("TWEAK_AUTH_MODE", "coxie").strip().lower() or "coxie",
        coxie_base_url=os.getenv("TWEAK_COXIE_BASE_URL", "http://localhost:8000").rstrip("/"),
        dev_user_id=os.getenv("TWEAK_DEV_USER_ID", "dev-admin"),
        dev_username=os.getenv("TWEAK_DEV_USERNAME", "Dev Admin"),
        dev_role=os.getenv("TWEAK_DEV_USER_ROLE", "admin"),
        timeout_seconds=float(os.getenv("TWEAK_AUTH_TIMEOUT", "10")),
    )


def is_auth_exempt_path(path: str) -> bool:
    if not path.startswith("/api"):
        return True
    return path in {
        "/api/health",
        "/api/auth/login",
    }


def _extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少有效的 Bearer Token",
        )
    return auth_header[7:].strip()


def _normalize_profile(data: dict[str, Any], token: str = "") -> CurrentUser:
    user_id = str(data.get("id") or "")
    username = str(data.get("username") or data.get("user_name") or "")
    role = str(data.get("role") or "user")
    if not user_id or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="认证服务返回了不完整的用户信息",
        )
    return CurrentUser(
        user_id=user_id,
        username=username,
        role=role,
        token=token,
    )


async def fetch_coxie_profile(token: str, settings: AuthSettings | None = None) -> CurrentUser:
    config = settings or get_auth_settings()
    try:
        async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
            response = await client.get(
                f"{config.coxie_base_url}/api/user/profile",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Coxie 认证服务不可用: {exc}",
        ) from exc

    payload: dict[str, Any]
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Coxie 认证服务返回了无效响应",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=payload.get("message") or payload.get("msg") or "认证失败",
        )

    if not payload.get("success", False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=payload.get("message") or payload.get("msg") or "认证失败",
        )

    return _normalize_profile(payload.get("data") or {}, token=token)


async def authenticate_request(request: Request) -> CurrentUser:
    settings = get_auth_settings()
    if settings.mode == "dev":
        return CurrentUser(
            user_id=settings.dev_user_id,
            username=settings.dev_username,
            role=settings.dev_role,
            token="dev-mode",
        )

    if settings.mode != "coxie":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"未知的认证模式: {settings.mode}",
        )

    token = _extract_bearer_token(request)
    return await fetch_coxie_profile(token, settings=settings)


async def proxy_login(username: str, password: str) -> dict[str, Any]:
    settings = get_auth_settings()
    if settings.mode == "dev":
        user = CurrentUser(
            user_id=settings.dev_user_id,
            username=username or settings.dev_username,
            role=settings.dev_role,
            token="dev-mode",
        )
        return {
            "access_token": "dev-mode",
            "token_type": "bearer",
            "user_info": {
                "id": user.user_id,
                "username": user.username,
                "role": user.role,
                "is_active": True,
            },
        }

    try:
        async with httpx.AsyncClient(timeout=settings.timeout_seconds) as client:
            response = await client.post(
                f"{settings.coxie_base_url}/api/user/login",
                json={"username": username, "password": password},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Coxie 登录服务不可用: {exc}",
        ) from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Coxie 登录服务返回了无效响应",
        ) from exc

    if response.status_code >= 400 or not payload.get("success", False):
        message = payload.get("message") or payload.get("msg") or "登录失败"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)

    data = payload.get("data") or {}
    if not data.get("access_token"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Coxie 登录响应缺少 access_token",
        )
    return data


async def proxy_logout(token: str | None) -> None:
    settings = get_auth_settings()
    if settings.mode == "dev" or not token:
        return

    try:
        async with httpx.AsyncClient(timeout=settings.timeout_seconds) as client:
            await client.post(
                f"{settings.coxie_base_url}/api/user/logout",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError:
        # 登出失败不影响前端本地清 token
        return
