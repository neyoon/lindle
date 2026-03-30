"""
FastAPI 应用入口

注册所有 API 路由:
- workflow: 工作流 CRUD
- execution: 工作流执行
- codegen: 代码生成
- plugins: 插件管理
- workspace: 块模板（制造工坊）
- settings: LLM 配置管理
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import codegen, execution, plugins, settings, workflow, workspace
from api.routes.settings import init_settings

app = FastAPI(
    title="MiniFlow",
    description="极简 AI 工作流引擎",
    version="0.1.0",
)

# CORS - 开发环境允许所有来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(workflow.router)
app.include_router(execution.router)
app.include_router(codegen.router)
app.include_router(plugins.router)
app.include_router(workspace.router)
app.include_router(settings.router)


@app.on_event("startup")
async def startup():
    """启动时从 settings.json 加载 LLM 配置"""
    init_settings()


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/")
async def root():
    return {
        "message": "MiniFlow API 运行中",
        "docs": "http://localhost:8000/docs",
        "frontend": "http://localhost:3000",
    }
