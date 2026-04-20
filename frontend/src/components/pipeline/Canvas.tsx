/**
 * 分栏画布 - Lindle 的核心 UI
 *
 * 布局：水平排列的全屏高度栏（Column），每栏内垂直排列块（Block）。
 * 连接线通过 SVG 覆盖层绘制在块的端口之间。
 * 点击画布空白区域可取消连接模式。
 */
import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { ColumnView } from './Column'
import { ConnectionLines } from './ConnectionLines'

export function Canvas() {
  const { workflow, addColumn, cancelConnecting, connectingFrom } = useWorkflowStore()
  const columns = [...workflow.columns].sort((a, b) => a.order - b.order)
  const containerRef = useRef<HTMLDivElement>(null)

  // ESC 键取消连接模式
  useEffect(() => {
    if (!connectingFrom) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelConnecting()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [connectingFrom, cancelConnecting])

  return (
    <div
      ref={containerRef}
      className="relative flex h-full"
      onClick={() => {
        if (connectingFrom) cancelConnecting()
      }}
      onContextMenu={(e) => {
        if (connectingFrom) {
          e.preventDefault()
          cancelConnecting()
        }
      }}
    >
      {/* SVG 连接线覆盖层 */}
      <ConnectionLines containerRef={containerRef} />

      {columns.map((column, i) => (
        <div key={column.id} className="flex h-full">
          {/* 列间插入按钮 */}
          {i > 0 && (
            <button
              onClick={() => addColumn(columns[i - 1].order)}
              className="group/insert flex h-full w-5 shrink-0 items-center justify-center text-[var(--app-text-muted)] transition hover:bg-[var(--app-accent-soft)] hover:text-[var(--app-accent-strong)]"
              title="在此插入栏"
            >
              <Plus size={14} className="opacity-0 group-hover/insert:opacity-100 transition" />
            </button>
          )}
          <ColumnView
            column={column}
            isFirstColumn={i === 0}
            isLastColumn={i === columns.length - 1}
          />
        </div>
      ))}

      {/* 添加新栏按钮 */}
      <button
        onClick={() => addColumn()}
        className="flex h-full min-w-[56px] cursor-pointer flex-col items-center justify-center gap-2 border-l border-dashed border-[var(--app-border-strong)] text-[var(--app-text-muted)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)] hover:text-[var(--app-accent-strong)]"
      >
        <Plus size={20} />
        <span className="text-xs [writing-mode:vertical-lr]">添加栏</span>
      </button>
    </div>
  )
}
