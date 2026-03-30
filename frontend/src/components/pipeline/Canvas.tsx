/**
 * 分栏画布 - MiniFlow 的核心 UI
 *
 * 布局：水平排列的全屏高度栏（Column），每栏内垂直排列块（Block）。
 * 连接线通过 SVG 覆盖层绘制在块的端口之间。
 * 点击画布空白区域可取消连接模式。
 */
import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { ColumnView } from './Column'
import { ConnectionLines } from './ConnectionLines'

export function Canvas() {
  const { workflow, addColumn, cancelConnecting, connectingFrom } = useWorkflowStore()
  const columns = [...workflow.columns].sort((a, b) => a.order - b.order)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="relative flex h-full"
      onClick={(e) => {
        // 点击画布空白处时取消连接模式
        if (connectingFrom && e.target === e.currentTarget) {
          cancelConnecting()
        }
      }}
    >
      {/* SVG 连接线覆盖层 */}
      <ConnectionLines containerRef={containerRef} />

      {columns.map((column, i) => (
        <ColumnView
          key={column.id}
          column={column}
          isFirstColumn={i === 0}
          isLastColumn={i === columns.length - 1}
        />
      ))}

      {/* 添加新栏按钮 */}
      <button
        onClick={() => addColumn()}
        className="min-w-[56px] h-full border-l border-dashed border-sky-200 flex flex-col items-center justify-center gap-2 text-sky-300 hover:border-sky-400 hover:text-sky-500 hover:bg-sky-50/30 transition cursor-pointer"
      >
        <Plus size={20} />
        <span className="text-xs [writing-mode:vertical-lr]">添加栏</span>
      </button>
    </div>
  )
}
