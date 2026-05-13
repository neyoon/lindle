"""
FastAPI 应用入口

注册所有 API 路由:
- workflow: 工作流 CRUD
- execution: 工作流执行
- codegen: 代码生成
- plugins: 插件管理
- workspace: 块模板（制造工坊）
- settings: LLM 配置管理

当前运行在本地单机模式。
生产模式下可托管前端静态构建产物。
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.routes import agents, codegen, execution, plugins, settings, workflow, workspace
from api.routes.settings import init_settings

app = FastAPI(
    title="Lindle",
    description="AI 能力编排工作台",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(workflow.router)
app.include_router(execution.router)
app.include_router(codegen.router)
app.include_router(plugins.router)
app.include_router(workspace.router)
app.include_router(settings.router)
app.include_router(agents.router)


@app.on_event("startup")
async def startup():
    """启动时从 settings.json 加载 LLM 配置"""
    init_settings()


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


STATIC_DIR = Path(__file__).parent.parent / "static"

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(request: Request, full_path: str):
        """所有非 /api 的请求返回 index.html（SPA 路由）"""
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
else:
    @app.get("/")
    async def root():
        backend_port = os.getenv("PORT", "6011")
        frontend_port = os.getenv("FRONTEND_PORT", "1106")
        return {
            "message": "Lindle API 运行中",
            "docs": f"http://localhost:{backend_port}/docs",
            "frontend": f"http://localhost:{frontend_port}",
        }
