"""
执行引擎

负责按照「栏」的顺序执行工作流:
1. 按 order 排列所有栏
2. 逐栏执行（栏内并行，栏间串行）
3. 处理重复栏（repeat）
4. 收集结果并返回

这是整个 Lindle 的"心脏"。
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

from flow.blocks import BlockExecutor
from flow.canonical import CanonicalWorkflow, canonicalize_flowspec, canonicalize_workflow
from flow.context import BlockResult, Context
from flow.flowspec import FlowSpec, workflow_to_flowspec
from flow.models import BlockType, Column, Workflow
from flow.execution_plan import ExecutableColumn, ExecutionPlan, compile_execution_plan

logger = logging.getLogger(__name__)


@dataclass
class StepEvent:
    """执行事件 - 用于实时推送执行状态"""

    event_type: str  # "column_start" | "block_start" | "block_done" | "column_done" | "flow_done" | "error"
    column_id: str = ""
    column_order: int = 0
    block_id: str = ""
    block_name: str = ""
    data: Any = None
    elapsed: float = 0.0
    error: str = ""


@dataclass
class ExecutionResult:
    """工作流执行结果"""

    success: bool
    output: dict[str, Any] = field(default_factory=dict)
    steps: list[StepEvent] = field(default_factory=list)
    total_elapsed: float = 0.0
    error: str = ""


class Engine:
    """工作流执行引擎

    使用方式:
        engine = Engine(workflow)
        result = await engine.run(user_inputs={"url": "https://..."})
    """

    def __init__(self, workflow: Workflow | FlowSpec | CanonicalWorkflow | ExecutionPlan):
        self.plan = self._coerce_execution_plan(workflow)

    async def run(self, user_inputs: dict[str, Any] | None = None) -> ExecutionResult:
        """执行工作流（一次性返回结果）"""
        events: list[StepEvent] = []
        async for event in self.run_stream(user_inputs):
            events.append(event)

        # 找到最终结果
        last_event = events[-1] if events else None
        if last_event and last_event.event_type == "flow_done":
            return ExecutionResult(
                success=True,
                output=last_event.data or {},
                steps=events,
                total_elapsed=last_event.elapsed,
            )
        elif last_event and last_event.event_type == "error":
            return ExecutionResult(
                success=False,
                error=last_event.error,
                steps=events,
                total_elapsed=last_event.elapsed,
            )

        return ExecutionResult(success=False, error="未知错误", steps=events)

    async def run_stream(
        self,
        user_inputs: dict[str, Any] | None = None,
    ) -> AsyncGenerator[StepEvent, None]:
        """流式执行工作流（逐步推送事件）

        这是核心执行逻辑:
        - 栏间串行（按 order 顺序）
        - 栏内并行（asyncio.gather）
        - 支持栏重复（repeat）
        """
        context = Context(user_inputs=user_inputs or {})
        columns = self.plan.columns
        start_time = time.time()

        try:
            for col_idx, column in enumerate(columns):
                repeat = max(column.repeat, 1)

                # 检查下一栏是否有插件块，设置下游格式提示
                context.downstream_plugin_hints = self._collect_downstream_plugin_hints(
                    columns, col_idx
                )

                for iteration in range(repeat):
                    column_iter_id = f"{column.column_id}" if repeat == 1 else f"{column.column_id}@iter{iteration}"

                    yield StepEvent(
                        event_type="column_start",
                        column_id=column_iter_id,
                        column_order=column.order,
                        data={"repeat_index": iteration, "repeat_total": repeat},
                    )

                    for executable in column.blocks:
                        block = executable.block
                        yield StepEvent(
                            event_type="block_start",
                            column_id=column_iter_id,
                            column_order=column.order,
                            block_id=block.id,
                            block_name=block.name,
                            elapsed=time.time() - start_time,
                        )

                    # 栏内所有块并行执行
                    results = await self._execute_column(column, context)

                    # 将结果存入上下文
                    context.add_column_results(column_iter_id, results)

                    # 逐个推送块完成事件
                    for result in results:
                        yield StepEvent(
                            event_type="block_done",
                            column_id=column_iter_id,
                            column_order=column.order,
                            block_id=result.block_id,
                            block_name=result.block_name,
                            data=result.data,
                            elapsed=time.time() - start_time,
                        )

                    yield StepEvent(
                        event_type="column_done",
                        column_id=column_iter_id,
                        column_order=column.order,
                        elapsed=time.time() - start_time,
                    )

            # 完成
            yield StepEvent(
                event_type="flow_done",
                data=context.get_final_output(),
                elapsed=time.time() - start_time,
            )

        except Exception as e:
            logger.exception("工作流执行失败")
            yield StepEvent(
                event_type="error",
                error=str(e),
                elapsed=time.time() - start_time,
            )

    @staticmethod
    def _collect_downstream_plugin_hints(
        columns: list[ExecutableColumn], current_idx: int
    ) -> list[dict]:
        """检查下一栏是否包含工具步骤，收集其 input_schema 作为格式提示"""
        from plugins.registry import get_plugin

        next_idx = current_idx + 1
        if next_idx >= len(columns):
            return []

        hints = []
        next_column = columns[next_idx]
        for executable in next_column.blocks:
            block = executable.block
            if block.type != BlockType.TOOL or not block.config.plugin_id:
                continue
            # 如果工具步骤已经配置了 prompt 模板，说明用户手动处理了格式转换
            if block.config.prompt:
                continue
            plugin = get_plugin(block.config.plugin_id)
            if plugin and plugin.meta.input_schema:
                hints.append({
                    "plugin_name": plugin.meta.name,
                    "plugin_id": plugin.meta.id,
                    "input_schema": plugin.meta.input_schema,
                })
        return hints

    async def _execute_column(self, column: ExecutableColumn, context: Context) -> list[BlockResult]:
        """并行执行一栏内的所有块"""
        if not column.blocks:
            return []

        if len(column.blocks) == 1:
            # 单块，直接执行
            result = await BlockExecutor.execute(column.blocks[0].block, context)
            return [result]

        # 多块并行
        tasks = [BlockExecutor.execute(executable.block, context) for executable in column.blocks]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        final_results: list[BlockResult] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("块 [%s] 执行失败: %s", column.blocks[i].block.name, result)
                # 如果启用了 stop_on_error，立即抛出异常
                if self.plan.stop_on_error:
                    raise result
                # 否则将错误包装为 BlockResult
                final_results.append(
                    BlockResult(
                        block_id=column.blocks[i].block.id,
                        block_ref=column.blocks[i].block.ref,
                        block_name=column.blocks[i].block.name,
                        data=f"错误: {result}",
                    )
                )
            else:
                final_results.append(result)

        return final_results

    @staticmethod
    def _coerce_execution_plan(workflow: Workflow | FlowSpec | CanonicalWorkflow | ExecutionPlan) -> ExecutionPlan:
        if isinstance(workflow, ExecutionPlan):
            return workflow
        if isinstance(workflow, CanonicalWorkflow):
            return compile_execution_plan(workflow)
        if isinstance(workflow, FlowSpec):
            return compile_execution_plan(canonicalize_flowspec(workflow))
        return compile_execution_plan(canonicalize_flowspec(workflow_to_flowspec(workflow)))
