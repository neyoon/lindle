"""
股票分析插件

通过内部 API 获取股票分析数据。
支持 A股、港股、美股市场。
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from plugins.base import BasePlugin, PluginMeta, PluginParam


class StockAnalysisPlugin(BasePlugin):
    """股票分析插件"""

    meta = PluginMeta(
        id="stock_analysis",
        name="股票分析",
        description="获取股票分析数据，支持 A股、港股、美股",
        icon="",
        params=[
            PluginParam(
                name="api_token",
                label="API Token",
                param_type="password",
                required=True,
                description="股票分析 API 的认证 Token",
            ),
            PluginParam(
                name="api_base",
                label="API Base URL",
                param_type="text",
                required=False,
                description="API 基础地址（可选，默认为内部地址）",
                default="https://server2.lightaitech.com/api/analysis/stock",
            ),
        ],
        input_schema={
            "type": "object",
            "description": "股票查询输入，必须同时提供 symbol 和 market。",
            "oneOf": [
                {
                    "type": "object",
                    "description": "单个股票查询",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "股票代码。A股示例: 601398, 港股示例: 00700, 美股示例: AAPL"
                        },
                        "market": {
                            "type": "string",
                            "enum": ["A", "HK", "US"],
                            "description": "市场类型：A=A股, HK=港股, US=美股"
                        }
                    },
                    "required": ["symbol", "market"],
                    "additionalProperties": False
                },
                {
                    "type": "object",
                    "description": "批量股票查询",
                    "properties": {
                        "symbols": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "股票代码列表"
                        },
                        "market": {
                            "type": "string",
                            "enum": ["A", "HK", "US"],
                            "description": "市场类型：A=A股, HK=港股, US=美股"
                        }
                    },
                    "required": ["symbols", "market"],
                    "additionalProperties": False
                }
            ],
            "examples": [
                {"symbol": "AAPL", "market": "US"},
                {"symbol": "601398", "market": "A"},
                {"symbol": "00700", "market": "HK"},
                {"symbols": ["601398", "000001"], "market": "A"}
            ],
            "notes": "symbol 和 market 都是必填字段。JSON 中必须使用 'symbol' 字段名（不是 stock_code 或 code）。"
        },
        output_schema={
            "type": "object",
            "description": "股票分析数据",
            "properties": {
                "technical_summary": {
                    "type": "object",
                    "description": "技术面摘要",
                    "properties": {
                        "trend": {"type": "string", "description": "趋势方向（上涨/下跌/震荡）"},
                        "momentum": {"type": "string", "description": "动量强弱（强势/弱势）"},
                        "volatility": {"type": "string", "description": "波动率"},
                        "volume": {"type": "string", "description": "成交量状态（放量/缩量）"},
                        "support_level": {"type": "number", "description": "支撑位"},
                        "resistance_level": {"type": "number", "description": "阻力位"},
                    },
                },
                "recent_data": {
                    "type": "array",
                    "description": "近期交易数据列表",
                    "items": {
                        "type": "object",
                        "properties": {
                            "date": {"type": "string", "description": "日期"},
                            "open": {"type": "number", "description": "开盘价"},
                            "close": {"type": "number", "description": "收盘价"},
                            "high": {"type": "number", "description": "最高价"},
                            "low": {"type": "number", "description": "最低价"},
                            "volume": {"type": "number", "description": "成交量"},
                            "RSI": {"type": "number", "description": "RSI 指标"},
                        },
                    },
                },
                "analysis_report": {
                    "type": "object",
                    "description": "分析报告",
                    "properties": {
                        "symbol": {"type": "string", "description": "股票代码"},
                        "market": {"type": "string", "description": "市场"},
                        "analysis_date": {"type": "string", "description": "分析日期"},
                        "current_price": {"type": "number", "description": "当前价格"},
                        "price_change": {"type": "number", "description": "价格变动(%)"},
                        "score_breakdown": {
                            "type": "object",
                            "description": "评分明细（trend/momentum/volume/volatility）",
                        },
                        "total_score": {"type": "number", "description": "综合评分"},
                        "recommendation": {"type": "string", "description": "投资建议"},
                        "key_indicators": {
                            "type": "object",
                            "description": "关键指标（rsi/macd_signal/bollinger_position）",
                        },
                    },
                },
            },
        }
    )

    async def execute(self, input_data: str, config: dict[str, Any]) -> Any:
        """执行股票分析查询

        输入格式（JSON，symbol 和 market 必填）：
        1. 单个查询: {"symbol": "AAPL", "market": "US"}
        2. 批量查询: {"symbols": ["601398", "000001"], "market": "A"}

        Args:
            input_data: 股票代码或 JSON 格式的查询参数
            config: 插件配置（api_token, api_base）

        Returns:
            股票分析数据
        """
        import logging
        logger = logging.getLogger(__name__)

        logger.info(f"股票分析插件执行 - 原始输入: {input_data[:500]}")

        # 获取配置
        api_token = config.get("api_token", "")
        if not api_token:
            raise ValueError("股票分析插件需要配置 API Token")

        api_base = config.get(
            "api_base", "https://server2.lightaitech.com/api/analysis/stock"
        )

        # 解析输入（必须是 JSON，必须同时包含 symbol/symbols 和 market）
        input_data = input_data.strip()

        try:
            data = json.loads(input_data)
        except (json.JSONDecodeError, ValueError):
            raise ValueError(
                f"输入必须是 JSON 格式。\n"
                f"收到: {input_data[:200]}\n\n"
                f"支持的格式:\n"
                f'1. 单个查询: {{"symbol": "AAPL", "market": "US"}}\n'
                f'2. 批量查询: {{"symbols": ["601398", "000001"], "market": "A"}}'
            )

        if not isinstance(data, dict):
            raise ValueError("输入必须是 JSON 对象")

        symbol = data.get("symbol")
        symbols = data.get("symbols")
        market = data.get("market")

        logger.info(f"解析 JSON 输入 - symbol: {symbol}, symbols: {symbols}, market: {market}")

        # 验证 market 必填
        if not market or market not in ("A", "HK", "US"):
            raise ValueError(
                f"market 是必填字段，必须是 'A'、'HK' 或 'US'。当前值: {market!r}"
            )

        # 批量查询
        if symbols and isinstance(symbols, list):
            logger.info(f"执行批量查询: {symbols}, market: {market}")
            return await self._batch_query(symbols, market, api_token, api_base)

        # 单个查询
        if not symbol:
            raise ValueError(
                f"symbol 是必填字段。\n"
                f"收到: {json.dumps(data, ensure_ascii=False)}\n\n"
                f"支持的格式:\n"
                f'1. 单个查询: {{"symbol": "AAPL", "market": "US"}}\n'
                f'2. 批量查询: {{"symbols": ["601398", "000001"], "market": "A"}}'
            )

        logger.info(f"执行单个查询 - Symbol: {symbol}, Market: {market}")
        return await self._single_query(symbol, market, api_token, api_base)

    async def _single_query(
        self, symbol: str, market: str, token: str, api_base: str
    ) -> dict[str, Any]:
        """单个股票查询"""
        import logging
        logger = logging.getLogger(__name__)

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "miniflow-stock-plugin/1.0.0",
            "Accept": "*/*",
            "Connection": "keep-alive",
        }

        payload = {"symbol": symbol, "market": market}

        logger.info(f"股票查询请求 - URL: {api_base}")
        logger.info(f"请求参数 - Symbol: {symbol}, Market: {market}")
        logger.info(f"Token 前20字符: {token[:20]}...")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(api_base, headers=headers, json=payload)
                logger.info(f"API 响应状态码: {response.status_code}")

                if response.status_code != 200:
                    logger.error(f"API 响应内容: {response.text}")

                response.raise_for_status()
                body = response.json()
                # API 返回 {"code": "200", "data": {...}} 格式，提取 data
                if isinstance(body, dict) and "data" in body:
                    return body["data"]
                return body
        except httpx.HTTPStatusError as e:
            error_msg = f"API 请求失败: {e.response.status_code} - {e.response.text}"
            logger.error(error_msg)
            logger.error(f"请求详情 - Symbol: {symbol}, Market: {market}, Token前缀: {token[:20]}")
            raise ValueError(error_msg)
        except httpx.RequestError as e:
            err_type = type(e).__name__
            logger.error(f"请求错误 ({err_type}): {e} - URL: {api_base}")
            raise ValueError(f"网络请求失败 ({err_type}): 无法连接到 {api_base}")

    async def _batch_query(
        self, symbols: list[str], market: str, token: str, api_base: str
    ) -> dict[str, Any]:
        """批量股票查询"""
        import asyncio

        tasks = [
            self._single_query(symbol, market, token, api_base) for symbol in symbols
        ]
        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        # 构建结果字典
        results_dict = {}
        for symbol, result in zip(symbols, results_list):
            if isinstance(result, Exception):
                results_dict[symbol] = {"error": str(result)}
            else:
                results_dict[symbol] = result

        return results_dict
