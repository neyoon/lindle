/**
 * 栏组件 - 全屏高度的竖条
 *
 * 每栏从上到下占满整个屏幕高度，
 * 栏内垂直排列块（Block），底部有添加块按钮。
 */
import { Plus, Trash2, Repeat } from 'lucide-react'
import { useState } from 'react'
import type { Column, BlockType } from '@/types/workflow'
import { useWorkflowStore } from '@/stores/workflow'
import { BlockView } from './Block'

const BLOCK_OPTIONS: { type: BlockType; label: string; tag: string }[] = [
  { type: 'input', label: '输入', tag: 'IN' },
  { type: 'ai', label: 'AI', tag: 'AI' },
  { type: 'tool', label: '工具', tag: 'TL' },
  { type: 'output', label: '输出', tag: 'OUT' },
]

interface Props {
  column: Column
}

export function ColumnView({ column }: Props) {
  const { removeColumn, addBlock, setColumnRepeat } = useWorkflowStore()
  const [showAddMenu, setShowAddMenu] = useState(false)

  const handleAddBlock = (type: BlockType, label: string) => {
    const name = prompt(`输入${label}块的名称:`, `${label}块`)
    if (name) {
      addBlock(column.id, type, name)
    }
    setShowAddMenu(false)
  }

  return (
    <div className="w-60 shrink-0 h-full border-r border-gray-200 bg-white flex flex-col">
      {/* 栏头 */}
      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
        <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">
          Step {column.order + 1}
        </span>
        <div className="flex items-center gap-1">
          {column.repeat > 1 && (
            <span className="text-xs text-indigo-500 flex items-center gap-0.5 font-medium">
              <Repeat size={12} />
              x{column.repeat}
            </span>
          )}
          <button
            onClick={() => {
              const n = prompt('重复次数:', String(column.repeat))
              if (n) setColumnRepeat(column.id, parseInt(n))
            }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="设置重复次数"
          >
            <Repeat size={13} />
          </button>
          <button
            onClick={() => removeColumn(column.id)}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            title="删除栏"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* 块列表 - 可滚动 */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {column.blocks.map((block) => (
          <BlockView key={block.id} block={block} columnId={column.id} />
        ))}
      </div>

      {/* 添加块 - 固定在底部 */}
      <div className="p-3 border-t border-gray-100 relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-gray-400 text-xs hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition flex items-center justify-center gap-1"
        >
          <Plus size={14} />
          添加块
        </button>

        {showAddMenu && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white rounded-lg shadow-lg border z-10">
            {BLOCK_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                onClick={() => handleAddBlock(opt.type, opt.label)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 flex items-center gap-2"
              >
                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 w-8 text-center">
                  {opt.tag}
                </span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
