"""
MiniFlow 启动入口

启动方式: python main.py
默认端口: 8000
"""

import os

import uvicorn

from miniflow.llm import configure as configure_llm


def main():
    # 从环境变量加载 LLM 配置
    configure_llm(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        default_model=os.getenv("DEFAULT_MODEL", "gpt-4o-mini"),
    )

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    uvicorn.run(
        "api.app:app",
        host=host,
        port=port,
        reload=True,
    )


if __name__ == "__main__":
    main()
