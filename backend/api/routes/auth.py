"""
认证桥接 API

前端通过本服务登录/获取当前用户，
实际认证逻辑由 Coxie 负责。
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from api.auth_service import proxy_login, proxy_logout
from api.user_context import require_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginRequest):
    data = await proxy_login(body.username, body.password)
    return {
        "token": data.get("access_token"),
        "token_type": data.get("token_type", "bearer"),
        "user": data.get("user_info") or {},
    }


@router.get("/me")
async def get_me():
    user = require_current_user()
    return {
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
    }


@router.post("/logout")
async def logout(request: Request):
    user = require_current_user()
    await proxy_logout(user.token or request.headers.get("authorization", ""))
    return {"ok": True}
