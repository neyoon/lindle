"""
FastAPI 应用入口

极简配置:
- 静态文件服务前端
- 注册所有 API 路由
- CORS 支持开发环境
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import codegen, execution, workflow
from miniflow.tools import list_tools

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


@app.get("/api/tools")
async def get_tools():
    """获取可用工具列表"""
    return list_tools()


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
