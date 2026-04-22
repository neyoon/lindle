"""
Lindle 启动入口

启动方式: python main.py
默认端口: 6011

LLM 配置加载优先级:
1. data/settings.json 中的默认 Provider
2. 环境变量（OPENAI_API_KEY / OPENAI_BASE_URL / DEFAULT_MODEL）作为兜底
"""

import os
import logging
import sys

import uvicorn

from api.routes.settings import init_settings, get_default_provider
from shared_llm import configure as configure_llm

# 配置日志输出到标准输出
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)


def main():
    # 从 settings.json 加载默认 Provider
    init_settings()

    # 如果 settings.json 没有配置，用环境变量兜底
    default = get_default_provider()
    if not default or not default.get("api_key"):
        env_key = os.getenv("OPENAI_API_KEY", "")
        if env_key:
            configure_llm(
                api_key=env_key,
                base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
                default_model=os.getenv("DEFAULT_MODEL", "gpt-4o-mini"),
            )

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "6011"))
    dev = os.getenv("DEV", "").lower() in ("1", "true", "yes")

    uvicorn.run(
        "api.app:app",
        host=host,
        port=port,
        reload=dev,
        log_level="info",  # 默认使用较低噪音日志级别
        access_log=True,
    )


if __name__ == "__main__":
    main()
