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
    """

    user_inputs: dict[str, Any] = field(default_factory=dict)

    # column_id -> list of BlockResult
    _column_results: dict[str, list[BlockResult]] = field(default_factory=dict)

    # block_id -> BlockResult (快速查找)
    _block_results: dict[str, BlockResult] = field(default_factory=dict)

    # 记录栏的执行顺序
    _column_order: list[str] = field(default_factory=list)

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


def render_prompt_template(prompt: str, context: Context) -> tuple[str, bool]:
    """渲染 prompt 中的 {{变量}} 模板

    支持的变量格式:
    - {{input.字段名}}  → 用户输入的某个字段
    - {{块名称}}        → 某个上游块的完整输出
    - {{块名称.key}}    → 某个上游块输出中的特定 JSON key

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

        # {{input.xxx}} — 用户输入字段
        if var.startswith("input."):
            field_name = var[6:]
            value = context.user_inputs.get(field_name)
            if value is not None:
                return str(value)
            return f"[未找到输入字段: {field_name}]"

        # {{块名.key}} — 特定 JSON key
        if "." in var:
            block_name, key = var.rsplit(".", 1)
            block_name = block_name.strip()
            key = key.strip()
            result = context.get_block_result_by_name(block_name)
            if result is None:
                return f"[未找到块: {block_name}]"
            value = result.get_key(key)
            if value is None:
                return f"[块 {block_name} 无 key: {key}]"
            if isinstance(value, dict | list):
                return json.dumps(value, ensure_ascii=False, indent=2)
            return str(value)

        # {{块名}} — 整个块的输出
        result = context.get_block_result_by_name(var)
        if result is not None:
            return result.format_as_text()

        # 兜底: 也许是不带 input. 前缀的用户输入
        if var in context.user_inputs:
            return str(context.user_inputs[var])

        return f"[未找到变量: {var}]"

    rendered = re.sub(pattern, _replace, prompt)
    return rendered, True
