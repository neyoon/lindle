"""
上下文传递

核心规则:
1. 默认: 下一栏所有块自动接收上一栏所有块的全部输出
2. 手动连线: 块只接收指定来源块的输出（可精确到某个 JSON key）
3. 数据格式自动适配: JSON 自动序列化，纯文本直接传递
4. 模板变量: prompt 中 {{变量}} 会被渲染为实际数据
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class BlockResult:
    """单个块的执行结果"""

    block_id: str
    block_name: str
    data: Any
    output_keys: list[str] | None = None  # 如果定义了 OutputSchema

    def get_key(self, key: str) -> Any:
        """获取特定 JSON key 的值"""
        if isinstance(self.data, dict):
            return self.data.get(key)
        return self.data

    def format_as_text(self) -> str:
        """将结果格式化为文本（用于注入 AI prompt）"""
        if isinstance(self.data, dict):
            return json.dumps(self.data, ensure_ascii=False, indent=2)
        return str(self.data)


@dataclass
class Context:
    """执行上下文 - 管理块之间的数据流动

    核心职责:
    - 存储每一栏的执行结果
    - 根据连接规则提供上游数据
    - 自动格式化数据给下游块
    - 传递下游插件的输入格式提示给 AI 块
    """

    user_inputs: dict[str, Any] = field(default_factory=dict)

    # column_id -> list of BlockResult
    _column_results: dict[str, list[BlockResult]] = field(default_factory=dict)

    # block_id -> BlockResult (快速查找)
    _block_results: dict[str, BlockResult] = field(default_factory=dict)

    # 记录栏的执行顺序
    _column_order: list[str] = field(default_factory=list)

    # 下游插件格式提示：当下一栏有插件块时，存储其 input_schema 信息
    # 格式: [{"plugin_name": "xxx", "plugin_id": "xxx", "input_schema": {...}}]
    downstream_plugin_hints: list[dict[str, Any]] = field(default_factory=list)

    def add_column_results(self, column_id: str, results: list[BlockResult]) -> None:
        """添加一栏的执行结果"""
        self._column_results[column_id] = results
        self._column_order.append(column_id)
        for result in results:
            self._block_results[result.block_id] = result

    def get_block_result(self, block_id: str) -> BlockResult | None:
        """获取特定块的结果"""
        return self._block_results.get(block_id)

    def get_upstream_data(
        self,
        connections: list[dict[str, Any]] | None = None,
    ) -> str:
        """获取上游数据，格式化为文本

        Args:
            connections: 手动指定的连接列表。
                        如果为空/None，返回上一栏的所有输出。

        Returns:
            格式化后的文本，可直接注入到 AI prompt 中。
        """
        if connections:
            return self._get_connected_data(connections)
        return self._get_previous_column_data()

    def get_upstream_value(
        self,
        connections: list[dict[str, Any]] | None = None,
    ) -> Any:
        """获取上游数据的结构化值

        这条路径用于程序化节点，例如插件块。
        默认返回原始结果值，而不是给 AI 使用的说明性文本。
        """
        if connections:
            return self._get_connected_value(connections)
        return self._get_previous_column_value()

    def _get_connected_data(self, connections: list[dict[str, Any]]) -> str:
        """获取手动连线指定的数据"""
        parts: list[str] = []
        for conn in connections:
            block_id = conn["from_block_id"]
            from_key = conn.get("from_key")

            result = self._block_results.get(block_id)
            if result is None:
                continue

            if from_key:
                # 精确到某个 JSON key
                value = result.get_key(from_key)
                if isinstance(value, dict | list):
                    parts.append(f"[{result.block_name}.{from_key}]:\n{json.dumps(value, ensure_ascii=False, indent=2)}")
                else:
                    parts.append(f"[{result.block_name}.{from_key}]:\n{value}")
            else:
                parts.append(f"[{result.block_name}]:\n{result.format_as_text()}")

        return "\n\n".join(parts)

    def _get_previous_column_data(self) -> str:
        """获取上一栏所有块的输出"""
        if not self._column_order:
            # 没有上一栏，返回用户输入
            return self._format_user_inputs()

        last_column_id = self._column_order[-1]
        results = self._column_results.get(last_column_id, [])

        if not results:
            return self._format_user_inputs()

        parts: list[str] = []
        for result in results:
            parts.append(f"[{result.block_name}]:\n{result.format_as_text()}")

        return "\n\n".join(parts)

    def _get_connected_value(self, connections: list[dict[str, Any]]) -> Any:
        """获取手动连线指定的结构化值"""
        collected: list[tuple[str, Any]] = []
        for conn in connections:
            block_id = conn["from_block_id"]
            from_key = conn.get("from_key")

            result = self._block_results.get(block_id)
            if result is None:
                continue

            value = result.get_key(from_key) if from_key else result.data
            label = f"{result.block_name}.{from_key}" if from_key else result.block_name
            collected.append((label, value))

        if not collected:
            return self.user_inputs
        if len(collected) == 1:
            return collected[0][1]
        return {label: value for label, value in collected}

    def _get_previous_column_value(self) -> Any:
        """获取上一栏所有块的结构化结果"""
        if not self._column_order:
            return self.user_inputs

        last_column_id = self._column_order[-1]
        results = self._column_results.get(last_column_id, [])

        if not results:
            return self.user_inputs
        if len(results) == 1:
            return results[0].data

        return {result.block_name: result.data for result in results}

    def _format_user_inputs(self) -> str:
        """格式化用户输入"""
        if not self.user_inputs:
            return ""
        parts = [f"{k}: {v}" for k, v in self.user_inputs.items()]
        return "\n".join(parts)

    def get_block_result_by_name(self, name: str) -> BlockResult | None:
        """按块名称查找结果（用于模板变量渲染）"""
        for result in self._block_results.values():
            if result.block_name == name:
                return result
        return None

    def get_final_output(self) -> dict[str, Any]:
        """获取最终输出（最后一栏的结果）"""
        if not self._column_order:
            return {}

        last_column_id = self._column_order[-1]
        results = self._column_results.get(last_column_id, [])

        if len(results) == 1:
            return {"result": results[0].data}

        return {r.block_name: r.data for r in results}


def _resolve_nested(data: Any, key_path: list[str]) -> Any:
    """沿 key 路径逐层取值，支持 dict 嵌套访问"""
    value = data
    for k in key_path:
        if isinstance(value, dict):
            value = value.get(k)
        else:
            return None
    return value


def _format_value(value: Any) -> str:
    """将值格式化为字符串"""
    if isinstance(value, dict | list):
        return json.dumps(value, ensure_ascii=False, indent=2)
    return str(value)


def extract_template_variables(prompt: str) -> list[str]:
    pattern = r"\{\{(.+?)\}\}"
    return [match.strip() for match in re.findall(pattern, prompt or "")]


def resolve_context_expression(expr: str, context: Context) -> Any | None:
    expr = (expr or "").strip()
    if not expr:
        return None

    if expr.startswith("input."):
        field_name = expr[6:]
        return context.user_inputs.get(field_name)

    if "." in expr:
        block_name, _, key_str = expr.partition(".")
        block_name = block_name.strip()
        result = context.get_block_result_by_name(block_name)
        if result is None:
            return None
        key_path = [p.strip() for p in key_str.split(".")]
        return _resolve_nested(result.data, key_path)

    result = context.get_block_result_by_name(expr)
    if result is not None:
        return result.data

    return context.user_inputs.get(expr)


def render_prompt_template(prompt: str, context: Context) -> tuple[str, bool]:
    """渲染 prompt 中的 {{变量}} 模板

    支持的变量格式:
    - {{input.字段名}}       → 用户输入的某个字段
    - {{块名称}}             → 某个上游块的完整输出
    - {{块名称.key}}         → 某个上游块输出中的特定 JSON key
    - {{块名称.key1.key2}}   → 嵌套 key 访问（如 {{分析.report.score}}）

    Args:
        prompt: 包含 {{变量}} 的原始 prompt
        context: 当前执行上下文

    Returns:
        (渲染后的 prompt, 是否包含了模板变量)
    """
    pattern = r"\{\{(.+?)\}\}"
    matches = list(re.finditer(pattern, prompt))

    if not matches:
        return prompt, False

    def _replace(match: re.Match) -> str:
        var = match.group(1).strip()
        value = resolve_context_expression(var, context)
        if value is not None:
            return _format_value(value)
        if var.startswith("input."):
            return f"[未找到输入字段: {var[6:]}]"
        if "." in var:
            block_name, _, key_str = var.partition(".")
            result = context.get_block_result_by_name(block_name.strip())
            if result is None:
                return f"[未找到块: {block_name.strip()}]"
            return f"[块 {block_name.strip()} 无 key: {key_str}]"
        return f"[未找到变量: {var}]"

    rendered = re.sub(pattern, _replace, prompt)
    return rendered, True
