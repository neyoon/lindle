/**
 * 分栏画布 - MiniFlow 的核心 UI
 *
 * 布局：水平排列的全屏高度栏（Column），每栏内垂直排列块（Block）。
 * 栏之间用竖线分隔，最右侧有 "+" 按钮添加新栏。
 */
import { Plus } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { ColumnView } from './Column'

export function Canvas() {
  const { workflow, addColumn } = useWorkflowStore()
  const columns = [...workflow.columns].sort((a, b) => a.order - b.order)

  return (
    <div className="flex h-full">
      {columns.map((column) => (
        <ColumnView key={column.id} column={column} />
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
