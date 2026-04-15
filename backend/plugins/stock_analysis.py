"""
股票分析插件

通过内部 API 获取股票分析数据。
支持 A股、港股、美股市场。
"""

from __future__ import annotations

import json
import re
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
            "description": "股票查询输入。必须提供 symbol 或 symbols，market 可选；未提供时会自动识别 A股 / 港股 / 美股。",
            "oneOf": [
                {
                    "type": "object",
                    "description": "单个股票查询",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "股票代码。支持 601398 / 600519.SH / 00700 / 700.HK / AAPL / AAPL.US"
                        },
                        "market": {
                            "type": "string",
                            "enum": ["A", "HK", "US"],
                            "description": "市场类型：A=A股, HK=港股, US=美股。可选，留空时自动识别。"
                        }
                    },
                    "required": ["symbol"],
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
                            "description": "市场类型：A=A股, HK=港股, US=美股。可选，留空时自动识别。"
                        }
                    },
                    "required": ["symbols"],
                    "additionalProperties": False
                }
            ],
            "examples": [
                {"symbol": "AAPL"},
                {"symbol": "600519"},
                {"symbol": "00700"},
                {"symbols": ["600519", "000001"]},
                {"symbol": "AAPL", "market": "US"}
            ],
            "notes": "market 不是必填。插件会自动识别 A股 / 港股 / 美股，也兼容 stock_code / code 字段名。"
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

        输入格式（JSON，symbol/symbols 必填，market 可选）：
        1. 单个查询: {"symbol": "AAPL"}
        2. 单个查询: {"symbol": "600519"}
        3. 批量查询: {"symbols": ["601398", "000001"]}

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

        # 解析输入（必须是 JSON，symbol/symbols 必填，market 可选）
        input_data = input_data.strip()

        try:
            data = json.loads(input_data)
        except (json.JSONDecodeError, ValueError):
            raise ValueError(
                f"输入必须是 JSON 格式。\n"
                f"收到: {input_data[:200]}\n\n"
                f"支持的格式:\n"
                f'1. 单个查询: {{"symbol": "AAPL"}}\n'
                f'2. 单个查询: {{"symbol": "600519"}}\n'
                f'3. 批量查询: {{"symbols": ["601398", "000001"]}}'
            )

        if not isinstance(data, dict):
            raise ValueError("输入必须是 JSON 对象")

        symbol = data.get("symbol") or data.get("stock_code") or data.get("code")
        symbols = data.get("symbols")
        market = data.get("market")

        logger.info(f"解析 JSON 输入 - symbol: {symbol}, symbols: {symbols}, market: {market}")

        market = self._normalize_market(market)

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
                f'1. 单个查询: {{"symbol": "AAPL"}}\n'
                f'2. 单个查询: {{"symbol": "600519"}}\n'
                f'3. 批量查询: {{"symbols": ["601398", "000001"]}}'
            )

        normalized_symbol, normalized_market = self._normalize_symbol_and_market(symbol, market)
        logger.info(
            "执行单个查询 - 原始Symbol: %s, 原始Market: %s, 规范后Symbol: %s, 规范后Market: %s",
            symbol,
            market,
            normalized_symbol,
            normalized_market,
        )
        return await self._single_query(normalized_symbol, normalized_market, api_token, api_base)

    def _normalize_market(self, market: Any) -> str | None:
        if market is None:
            return None
        value = str(market).strip().upper()
        aliases = {
            "A": "A",
            "CN": "A",
            "SH": "A",
            "SZ": "A",
            "ASHARE": "A",
            "A_SHARE": "A",
            "HK": "HK",
            "H": "HK",
            "HKEX": "HK",
            "US": "US",
            "NASDAQ": "US",
            "NYSE": "US",
        }
        return aliases.get(value, value or None)

    def _normalize_symbol_and_market(self, symbol: Any, market: str | None) -> tuple[str, str]:
        if symbol is None:
            raise ValueError("symbol 不能为空")

        raw = str(symbol).strip().upper()
        if not raw:
            raise ValueError("symbol 不能为空")

        cleaned = raw.replace(" ", "")
        inferred_market: str | None = None
        normalized_symbol = cleaned

        if match := re.fullmatch(r"(\d{6})\.(SH|SZ|SS)", cleaned):
            normalized_symbol = match.group(1)
            inferred_market = "A"
        elif match := re.fullmatch(r"(SH|SZ)(\d{6})", cleaned):
            normalized_symbol = match.group(2)
            inferred_market = "A"
        elif re.fullmatch(r"\d{6}", cleaned):
            normalized_symbol = cleaned
            inferred_market = "A"
        elif match := re.fullmatch(r"(\d{1,5})\.HK", cleaned):
            normalized_symbol = match.group(1).zfill(5)
            inferred_market = "HK"
        elif match := re.fullmatch(r"HK(\d{1,5})", cleaned):
            normalized_symbol = match.group(1).zfill(5)
            inferred_market = "HK"
        elif re.fullmatch(r"\d{1,5}", cleaned):
            normalized_symbol = cleaned.zfill(5)
            inferred_market = "HK"
        elif match := re.fullmatch(r"([A-Z][A-Z0-9.\-]*)\.US", cleaned):
            normalized_symbol = match.group(1)
            inferred_market = "US"
        elif match := re.fullmatch(r"US[.:]?([A-Z][A-Z0-9.\-]*)", cleaned):
            normalized_symbol = match.group(1)
            inferred_market = "US"
        elif re.fullmatch(r"[A-Z][A-Z0-9.\-]*", cleaned):
            normalized_symbol = cleaned
            inferred_market = "US"

        final_market = inferred_market or market
        if final_market not in ("A", "HK", "US"):
            raise ValueError(
                f"无法识别股票市场。请提供 market 字段，或使用可识别的代码格式。\n"
                f"支持示例: 600519 / 600519.SH / 00700 / 700.HK / AAPL / AAPL.US"
            )

        return normalized_symbol, final_market

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
        self, symbols: list[str], market: str | None, token: str, api_base: str
    ) -> dict[str, Any]:
        """批量股票查询"""
        import asyncio

        normalized_pairs = [self._normalize_symbol_and_market(symbol, market) for symbol in symbols]
        tasks = [
            self._single_query(normalized_symbol, normalized_market, token, api_base)
            for normalized_symbol, normalized_market in normalized_pairs
        ]
        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        # 构建结果字典
        results_dict = {}
        for original_symbol, result in zip(symbols, results_list):
            if isinstance(result, Exception):
                results_dict[str(original_symbol)] = {"error": str(result)}
            else:
                results_dict[str(original_symbol)] = result

        return results_dict
