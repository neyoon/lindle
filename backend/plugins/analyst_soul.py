"""
分析师的灵魂 - 数据计算和分析工具

这是一个官方示例 Skill，展示如何创建自定义 Skill。
提供基础的数据计算能力，包括：
- 基础运算
- 统计计算（平均值、中位数、标准差）
- 增长率计算
- 百分比计算
"""

from __future__ import annotations

import json
import statistics
from typing import Any

from plugins.base import BasePlugin, PluginMeta


class AnalystSoulSkill(BasePlugin):
    """分析师的灵魂 - 数据计算和分析工具"""

    meta = PluginMeta(
        id="analyst_soul",
        name="分析师的灵魂",
        icon="",
        description="提供数据计算、统计分析等能力，是分析师的得力助手",
        category="skill",
        params=[],
        input_schema={
            "type": "object",
            "description": "支持的计算类型",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["calculate", "average", "median", "std_dev", "growth_rate", "percentage"],
                    "description": "计算类型",
                },
                "values": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "数值列表",
                },
                "expression": {
                    "type": "string",
                    "description": "数学表达式（用于 calculate）",
                },
            },
            "examples": [
                '{"operation": "average", "values": [10, 20, 30]}',
                '{"operation": "calculate", "expression": "(100 - 80) / 80 * 100"}',
                '{"operation": "growth_rate", "values": [100, 120]}',
                '{"operation": "percentage", "values": [25, 100]}',
            ],
            "notes": "请确保 values 是数字数组，expression 是有效的数学表达式",
        },
        output_schema={
            "type": "object",
            "properties": {
                "result": {"type": "number", "description": "计算结果"},
                "explanation": {"type": "string", "description": "计算说明"},
            },
        },
    )

    async def execute(self, input_data: str, config: dict[str, Any]) -> dict:
        """执行计算

        Args:
            input_data: JSON 格式的输入数据
            config: 配置参数（本 Skill 不需要）

        Returns:
            包含 result 和 explanation 的字典
        """
        try:
            data = json.loads(input_data)
            operation = data.get("operation")

            if operation == "average":
                values = data.get("values", [])
                if not values:
                    return {"result": 0, "explanation": "错误：values 不能为空"}
                result = statistics.mean(values)
                return {
                    "result": round(result, 4),
                    "explanation": f"计算 {len(values)} 个数值的平均值：{result:.4f}",
                }

            elif operation == "median":
                values = data.get("values", [])
                if not values:
                    return {"result": 0, "explanation": "错误：values 不能为空"}
                result = statistics.median(values)
                return {
                    "result": round(result, 4),
                    "explanation": f"计算 {len(values)} 个数值的中位数：{result:.4f}",
                }

            elif operation == "std_dev":
                values = data.get("values", [])
                if len(values) < 2:
                    return {"result": 0, "explanation": "错误：至少需要 2 个数值"}
                result = statistics.stdev(values)
                return {
                    "result": round(result, 4),
                    "explanation": f"计算 {len(values)} 个数值的标准差：{result:.4f}",
                }

            elif operation == "calculate":
                expression = data.get("expression", "")
                if not expression:
                    return {"result": 0, "explanation": "错误：expression 不能为空"}
                # 安全的数学表达式计算（只允许基本运算）
                allowed_names = {"__builtins__": {}}
                result = eval(expression, allowed_names, {})
                return {
                    "result": round(float(result), 4),
                    "explanation": f"计算表达式 {expression} = {result}",
                }

            elif operation == "growth_rate":
                values = data.get("values", [])
                if len(values) < 2:
                    return {"result": 0, "explanation": "错误：需要至少 2 个数值（旧值和新值）"}
                old, new = values[0], values[1]
                if old == 0:
                    return {"result": 0, "explanation": "错误：旧值不能为 0"}
                rate = (new - old) / old * 100
                return {
                    "result": round(rate, 2),
                    "explanation": f"增长率：({new} - {old}) / {old} × 100% = {rate:.2f}%",
                }

            elif operation == "percentage":
                values = data.get("values", [])
                if len(values) < 2:
                    return {"result": 0, "explanation": "错误：需要至少 2 个数值（部分和总数）"}
                part, total = values[0], values[1]
                if total == 0:
                    return {"result": 0, "explanation": "错误：总数不能为 0"}
                pct = part / total * 100
                return {
                    "result": round(pct, 2),
                    "explanation": f"占比：{part} / {total} × 100% = {pct:.2f}%",
                }

            else:
                return {
                    "result": 0,
                    "explanation": f"错误：不支持的操作类型 '{operation}'",
                }

        except json.JSONDecodeError:
            return {"result": 0, "explanation": "错误：输入数据不是有效的 JSON"}
        except (ValueError, TypeError, ZeroDivisionError) as e:
            return {"result": 0, "explanation": f"计算错误：{str(e)}"}
        except Exception as e:
            return {"result": 0, "explanation": f"未知错误：{str(e)}"}
