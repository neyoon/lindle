"""
设置管理 API — 多 LLM Provider 管理

每个 Provider 包含完整的连接信息 (API Key / Base URL / Model)。
用户可以配置多个 Provider，在 AI 块中选择使用哪一个。

路由:
- GET    /api/settings/providers       → 获取所有 Provider（API Key 脱敏）
- POST   /api/settings/providers       → 新增 Provider
- PUT    /api/settings/providers/{id}  → 更新 Provider
- DELETE /api/settings/providers/{id}  → 删除 Provider
- POST   /api/settings/providers/{id}/default → 设为默认
- POST   /api/settings/test            → 测试连接
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from shared_llm import configure as configure_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

# 配置文件路径
SETTINGS_FILE = Path(__file__).parent.parent.parent / "data" / "settings.json"


# ===== 数据模型 =====


class ProviderInput(BaseModel):
    """前端提交的 Provider 数据"""

    name: str = ""
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"


class ProviderResponse(BaseModel):
    """返回给前端的 Provider（API Key 脱敏）"""

    id: str
    name: str
    api_key_masked: str
    api_key_set: bool
    base_url: str
    model: str
    is_default: bool


class TestInput(BaseModel):
    """测试连接的参数"""

    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"
    provider_id: str = ""  # 可选: 用已保存 provider 的 key


# ===== 文件读写 =====


def _load_raw() -> dict[str, Any]:
    """从文件加载原始数据"""
    if not SETTINGS_FILE.exists():
        return {"providers": []}
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        # 兼容旧格式: 如果是单 provider 格式，自动迁移
        if "providers" not in data and "api_key" in data:
            old = data
            providers = []
            if old.get("api_key"):
                providers.append(
                    {
                        "id": f"p_{int(time.time())}",
                        "name": f"{old.get('default_model', 'gpt-4o-mini')}",
                        "api_key": old["api_key"],
                        "base_url": old.get("base_url", "https://api.openai.com/v1"),
                        "model": old.get("default_model", "gpt-4o-mini"),
                        "is_default": True,
                    }
                )
            data = {"providers": providers}
            _save_raw(data)
            logger.info("已将旧格式 settings.json 迁移到多 Provider 格式")
        return data
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("读取配置文件失败: %s", e)
        return {"providers": []}


def _save_raw(data: dict[str, Any]) -> None:
    """保存数据到文件"""
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_providers() -> list[dict[str, Any]]:
    """获取所有 Provider"""
    return _load_raw().get("providers", [])


def get_provider_by_id(provider_id: str) -> dict[str, Any] | None:
    """按 ID 查找 Provider"""
    for p in get_providers():
        if p["id"] == provider_id:
            return p
    return None


def get_default_provider() -> dict[str, Any] | None:
    """获取默认 Provider"""
    providers = get_providers()
    for p in providers:
        if p.get("is_default"):
            return p
    # 没有标记默认的，返回第一个
    return providers[0] if providers else None


def _mask_key(key: str) -> str:
    """脱敏 API Key"""
    if not key or len(key) < 8:
        return "***" if key else ""
    return f"{key[:6]}...{key[-4:]}"


# ===== 启动时加载 =====


def init_settings() -> None:
    """启动时调用: 从 settings.json 加载默认 Provider 配置到 LLM 模块"""
    default = get_default_provider()
    if default and default.get("api_key"):
        configure_llm(
            api_key=default["api_key"],
            base_url=default.get("base_url", "https://api.openai.com/v1"),
            default_model=default.get("model", "gpt-4o-mini"),
        )
        logger.info("已加载默认 Provider [%s] 到 LLM 模块", default.get("name"))
    else:
        logger.info("未配置 Provider，请通过前端设置页面配置")


# ===== API 路由 =====


@router.get("/providers")
async def list_providers() -> list[ProviderResponse]:
    """获取所有 Provider（API Key 脱敏）"""
    providers = get_providers()
    return [
        ProviderResponse(
            id=p["id"],
            name=p.get("name", ""),
            api_key_masked=_mask_key(p.get("api_key", "")),
            api_key_set=bool(p.get("api_key")),
            base_url=p.get("base_url", ""),
            model=p.get("model", ""),
            is_default=p.get("is_default", False),
        )
        for p in providers
    ]


@router.post("/providers")
async def add_provider(body: ProviderInput) -> ProviderResponse:
    """新增 Provider"""
    data = _load_raw()
    providers = data.get("providers", [])

    new_id = f"p_{int(time.time())}_{len(providers)}"
    is_default = len(providers) == 0  # 第一个自动设为默认

    new_provider = {
        "id": new_id,
        "name": body.name or body.model,
        "api_key": body.api_key,
        "base_url": body.base_url,
        "model": body.model,
        "is_default": is_default,
    }
    providers.append(new_provider)
    data["providers"] = providers
    _save_raw(data)

    # 如果是默认，立即应用
    if is_default:
        _apply_provider(new_provider)

    return ProviderResponse(
        id=new_id,
        name=new_provider["name"],
        api_key_masked=_mask_key(body.api_key),
        api_key_set=bool(body.api_key),
        base_url=body.base_url,
        model=body.model,
        is_default=is_default,
    )


@router.put("/providers/{provider_id}")
async def update_provider(provider_id: str, body: ProviderInput) -> ProviderResponse:
    """更新 Provider"""
    data = _load_raw()
    providers = data.get("providers", [])

    target = None
    for p in providers:
        if p["id"] == provider_id:
            target = p
            break

    if target is None:
        raise HTTPException(status_code=404, detail="Provider 不存在")

    target["name"] = body.name or body.model
    # 空 api_key 表示不修改
    if body.api_key:
        target["api_key"] = body.api_key
    target["base_url"] = body.base_url
    target["model"] = body.model

    data["providers"] = providers
    _save_raw(data)

    # 如果是默认 provider，立即应用
    if target.get("is_default"):
        _apply_provider(target)

    return ProviderResponse(
        id=provider_id,
        name=target["name"],
        api_key_masked=_mask_key(target.get("api_key", "")),
        api_key_set=bool(target.get("api_key")),
        base_url=target["base_url"],
        model=target["model"],
        is_default=target.get("is_default", False),
    )


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str) -> dict[str, str]:
    """删除 Provider"""
    data = _load_raw()
    providers = data.get("providers", [])

    new_providers = [p for p in providers if p["id"] != provider_id]
    if len(new_providers) == len(providers):
        raise HTTPException(status_code=404, detail="Provider 不存在")

    # 如果删掉了默认的，把第一个设为默认
    if new_providers and not any(p.get("is_default") for p in new_providers):
        new_providers[0]["is_default"] = True
        _apply_provider(new_providers[0])

    data["providers"] = new_providers
    _save_raw(data)

    return {"message": "已删除"}


@router.post("/providers/{provider_id}/default")
async def set_default_provider(provider_id: str) -> dict[str, str]:
    """设为默认 Provider"""
    data = _load_raw()
    providers = data.get("providers", [])

    found = False
    for p in providers:
        if p["id"] == provider_id:
            p["is_default"] = True
            found = True
            _apply_provider(p)
        else:
            p["is_default"] = False

    if not found:
        raise HTTPException(status_code=404, detail="Provider 不存在")

    data["providers"] = providers
    _save_raw(data)

    return {"message": "已设为默认"}


@router.post("/test")
async def test_connection(body: TestInput) -> dict[str, Any]:
    """测试 LLM 连接

    会发送一条 "Hi" 消息并限制返回 max_tokens=5，
    消耗约 5 个 token（几乎无成本），用于验证 API Key + Base URL + 模型 三者是否正确。
    """
    api_key = body.api_key
    base_url = body.base_url
    model = body.model

    # 如果指定了 provider_id，用已保存 provider 的 api_key
    if not api_key and body.provider_id:
        p = get_provider_by_id(body.provider_id)
        if p:
            api_key = p.get("api_key", "")
            if not base_url:
                base_url = p.get("base_url", "")
            if not model:
                model = p.get("model", "")

    if not api_key:
        return {"success": False, "message": "未提供 API Key"}

    base_url = base_url or "https://api.openai.com/v1"
    model = model or "gpt-4o-mini"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 5,
                },
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code == 200:
                return {"success": True, "message": f"连接成功！模型: {model}"}
            else:
                error_text = resp.text[:200]
                return {
                    "success": False,
                    "message": f"API 返回 {resp.status_code}: {error_text}",
                }
    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时，请检查 Base URL 是否正确"}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


# ===== 兼容旧接口 =====
# 前端初始化检查用：返回是否有任何已配置的 provider


@router.get("/")
async def get_settings_summary() -> dict[str, Any]:
    """获取配置概要（兼容旧版 + 前端启动检查）"""
    default = get_default_provider()
    if default:
        return {
            "api_key_masked": _mask_key(default.get("api_key", "")),
            "api_key_set": bool(default.get("api_key")),
            "base_url": default.get("base_url", ""),
            "default_model": default.get("model", ""),
        }
    return {
        "api_key_masked": "",
        "api_key_set": False,
        "base_url": "",
        "default_model": "",
    }


def _apply_provider(provider: dict[str, Any]) -> None:
    """将 Provider 配置应用到 LLM 模块"""
    configure_llm(
        api_key=provider.get("api_key", ""),
        base_url=provider.get("base_url", "https://api.openai.com/v1"),
        default_model=provider.get("model", "gpt-4o-mini"),
    )


# ===== AI 编辑专用 Provider =====


def get_ai_edit_provider_id() -> str:
    """获取 AI 编辑专用 Provider ID（空字符串表示使用默认）"""
    return _load_raw().get("ai_edit_provider_id", "")


def get_ai_edit_provider() -> dict[str, Any] | None:
    """获取 AI 编辑专用 Provider，未设置则回退到默认"""
    pid = get_ai_edit_provider_id()
    if pid:
        p = get_provider_by_id(pid)
        if p:
            return p
    return get_default_provider()


@router.get("/ai-edit-provider")
async def get_ai_edit_provider_setting() -> dict[str, str]:
    """获取 AI 编辑专用 Provider ID"""
    return {"provider_id": get_ai_edit_provider_id()}


@router.post("/ai-edit-provider")
async def set_ai_edit_provider_setting(body: dict[str, str]) -> dict[str, str]:
    """设置 AI 编辑专用 Provider"""
    provider_id = body.get("provider_id", "")
    if provider_id:
        if get_provider_by_id(provider_id) is None:
            raise HTTPException(status_code=404, detail="Provider 不存在")

    data = _load_raw()
    data["ai_edit_provider_id"] = provider_id
    _save_raw(data)
    return {"provider_id": provider_id}
