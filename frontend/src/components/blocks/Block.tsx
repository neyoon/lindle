/**
 * 块组件 - 带端口的正方形卡片
 *
 * 端口规则:
 * - 左侧圆圈 = 输入端口（第一栏不显示）
 * - 右侧圆圈 = 输出端口（最后一栏不显示）
 * - 点击右端口 → 进入连接模式
 * - 连接模式下点击左端口 → 完成连接
 */
import { Trash2, Pencil } from 'lucide-react'
import type { Block } from '@/types/workflow'
import { useWorkflowStore } from '@/stores/workflow'

const TYPE_STYLES: Record<string, { bg: string; border: string; tag: string; tagColor: string }> = {
  input:  { bg: 'bg-sky-50',   border: 'border-sky-200',   tag: 'IN',     tagColor: 'text-sky-600 bg-sky-100' },
  ai:     { bg: 'bg-sky-50',   border: 'border-sky-300',   tag: 'AI',     tagColor: 'text-sky-700 bg-sky-100' },
  output: { bg: 'bg-sky-50',   border: 'border-sky-200',   tag: 'OUT',    tagColor: 'text-sky-600 bg-sky-100' },
  plugin: { bg: 'bg-teal-50',  border: 'border-teal-200',  tag: 'PLUGIN', tagColor: 'text-teal-600 bg-teal-100' },
}

interface Props {
  block: Block
  columnId: string
  columnOrder: number
  isFirstColumn: boolean
  isLastColumn: boolean
}

export function BlockView({ block, columnId, columnOrder, isFirstColumn, isLastColumn }: Props) {
  const selectBlock = useWorkflowStore((s) => s.selectBlock)
  const removeBlock = useWorkflowStore((s) => s.removeBlock)
  const updateBlock = useWorkflowStore((s) => s.updateBlock)
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)
  const connectingFrom = useWorkflowStore((s) => s.connectingFrom)
  const startConnecting = useWorkflowStore((s) => s.startConnecting)
  const finishConnecting = useWorkflowStore((s) => s.finishConnecting)

  const blockDiffMap = useWorkflowStore((s) => s.blockDiffMap)

  const style = TYPE_STYLES[block.type] || TYPE_STYLES.input
  const isSelected = selectedBlockId === block.id
  const isConnectingSource = connectingFrom?.blockId === block.id
  const diffStatus = blockDiffMap?.[block.id] ?? null

  // 是否为有效连接目标（连接模式下，当前块在源块之后的列）
  const isValidTarget = connectingFrom
    ? columnOrder > connectingFrom.columnOrder && connectingFrom.blockId !== block.id
    : false

  // 配置预览
  let preview = ''
  if (block.type === 'ai' && block.config.prompt) {
    preview = block.config.prompt.slice(0, 40) + (block.config.prompt.length > 40 ? '...' : '')
  } else if (block.type === 'input' && block.config.fields) {
    preview = block.config.fields.map((f) => f.label || f.name).join(', ')
  } else if (block.type === 'plugin' && block.config.plugin_id) {
    preview = block.config.plugin_id
  }

  return (
    <div
      data-block-id={block.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/miniflow-block', JSON.stringify({ blockId: block.id, columnId }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => selectBlock(block.id)}
      className={`
        group relative w-[140px] h-[140px] rounded-xl border-2 cursor-grab active:cursor-grabbing transition flex flex-col items-center justify-center gap-1.5 p-3
        ${style.bg} ${style.border}
        ${isSelected ? 'ring-2 ring-sky-400 shadow-lg scale-[1.03]' : 'hover:shadow-md hover:scale-[1.01]'}
        ${isConnectingSource ? 'ring-2 ring-amber-400 shadow-amber-100' : ''}
        ${diffStatus === 'added' ? 'ring-2 ring-emerald-400 shadow-emerald-100 shadow-lg' : ''}
        ${diffStatus === 'modified' ? 'ring-2 ring-amber-400 shadow-amber-100 shadow-lg' : ''}
      `}
    >
      {/* ===== 左侧输入端口 ===== */}
      {!isFirstColumn && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            if (connectingFrom && isValidTarget) {
              finishConnecting(block.id)
            }
          }}
          className={`
            absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 z-10 transition-all
            ${connectingFrom && isValidTarget
              ? 'border-amber-400 bg-amber-100 hover:bg-amber-400 hover:border-amber-500 scale-125 cursor-pointer animate-pulse'
              : connectingFrom
                ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-40'
                : 'border-sky-300 bg-white hover:bg-sky-400 hover:border-sky-500 cursor-pointer'
            }
          `}
          title="输入端口"
        />
      )}

      {/* ===== 右侧输出端口 ===== */}
      {!isLastColumn && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            startConnecting(block.id, columnOrder)
          }}
          className={`
            absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 z-10 transition-all
            ${isConnectingSource
              ? 'border-amber-500 bg-amber-400 scale-125'
              : 'border-sky-300 bg-white hover:bg-sky-400 hover:border-sky-500 cursor-pointer'
            }
          `}
          title="输出端口 - 点击开始连接"
        />
      )}

      {/* 顶部工具 */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        {block.output_schema && (
          <span className="text-[9px] font-mono text-sky-600 bg-sky-100 rounded px-1" title="JSON 输出">
            JSON
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            const newName = prompt('重命名:', block.name)
            if (newName?.trim()) {
              updateBlock(block.id, { name: newName.trim() })
            }
          }}
          className="p-0.5 text-gray-300 hover:text-sky-500 rounded opacity-0 group-hover:opacity-100 transition"
          title="重命名"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeBlock(columnId, block.id)
          }}
          className="p-0.5 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 连接数量提示 */}
      {block.connections.length > 0 && (
        <div className="absolute top-1.5 left-1.5">
          <span className="text-[9px] text-sky-500 bg-sky-50 rounded px-1 border border-sky-200">
            ←{block.connections.length}
          </span>
        </div>
      )}

      {/* AI diff 标签 */}
      {diffStatus && (
        <span
          className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold rounded-full px-2 py-0.5 shadow-sm z-20 ${
            diffStatus === 'added'
              ? 'bg-emerald-500 text-white'
              : 'bg-amber-500 text-white'
          }`}
        >
          {diffStatus === 'added' ? '新增' : '修改'}
        </span>
      )}

      {/* 类型标签 */}
      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${style.tagColor}`}>
        {style.tag}
      </span>

      {/* 名称 */}
      <span className="text-xs font-semibold text-gray-700 text-center leading-tight truncate w-full">
        {block.name}
      </span>

      {/* 预览 */}
      {preview && (
        <p className="text-[10px] text-gray-400 text-center truncate w-full leading-tight">{preview}</p>
      )}
    </div>
  )
}
