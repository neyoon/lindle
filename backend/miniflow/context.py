"""
上下文传递

核心规则:
1. 默认: 下一栏所有块自动接收上一栏所有块的全部输出
2. 手动连线: 块只接收指定来源块的输出（可精确到某个 JSON key）
3. 数据格式自动适配: JSON 自动序列化，纯文本直接传递
"""

from __future__ import annotations

import json
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

    def get_final_output(self) -> dict[str, Any]:
        """获取最终输出（最后一栏的结果）"""
        if not self._column_order:
            return {}

        last_column_id = self._column_order[-1]
        results = self._column_results.get(last_column_id, [])

        if len(results) == 1:
            return {"result": results[0].data}

        return {r.block_name: r.data for r in results}
