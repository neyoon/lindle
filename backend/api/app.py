"""
FastAPI 应用入口

极简配置:
- 注册所有 API 路由
- CORS 支持开发环境
- Tool 已移除，将以插件方式引入
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import codegen, execution, plugins, workflow

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
