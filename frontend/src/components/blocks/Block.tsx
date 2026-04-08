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

const TYPE_STYLES: Record<string, { tag: string; tagColor: string }> = {
  input:  { tag: 'IN', tagColor: 'bg-[rgba(109,204,255,0.12)] text-[var(--app-accent)]' },
  ai:     { tag: 'AI', tagColor: 'bg-[rgba(109,204,255,0.18)] text-[var(--app-accent)]' },
  output: { tag: 'OUT', tagColor: 'bg-[rgba(109,204,255,0.12)] text-[var(--app-accent)]' },
  plugin: { tag: 'PLUGIN', tagColor: 'bg-[rgba(45,135,219,0.18)] text-[var(--app-accent)]' },
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
        editor-block group relative flex h-[140px] w-[140px] cursor-grab flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-3 transition active:cursor-grabbing
        ${block.type === 'plugin' ? 'is-plugin' : ''}
        ${isSelected ? 'is-selected scale-[1.03]' : 'hover:scale-[1.01] hover:shadow-md'}
        ${isConnectingSource ? 'ring-2 ring-[var(--app-warning)]' : ''}
        ${diffStatus === 'added' ? 'ring-2 ring-[var(--app-success)] shadow-lg' : ''}
        ${diffStatus === 'modified' ? 'ring-2 ring-[var(--app-warning)] shadow-lg' : ''}
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
              ? 'cursor-pointer scale-125 animate-pulse border-[var(--app-warning)] bg-[rgba(255,180,77,0.2)] hover:bg-[var(--app-warning)]'
              : connectingFrom
                ? 'cursor-not-allowed border-[var(--app-border)] bg-[rgba(255,255,255,0.05)] opacity-40'
                : 'cursor-pointer border-[var(--app-border-strong)] bg-[var(--app-panel-solid)] hover:border-[var(--app-accent)] hover:bg-[var(--app-accent)]'
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
              ? 'scale-125 border-[var(--app-warning)] bg-[var(--app-warning)]'
              : 'cursor-pointer border-[var(--app-border-strong)] bg-[var(--app-panel-solid)] hover:border-[var(--app-accent)] hover:bg-[var(--app-accent)]'
            }
          `}
          title="输出端口 - 点击开始连接"
        />
      )}

      {/* 顶部工具 */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        {block.output_schema && (
          <span className="rounded px-1 font-mono text-[9px] text-[var(--app-accent)] bg-[rgba(109,204,255,0.12)]" title="JSON 输出">
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
          className="rounded p-0.5 text-[var(--app-text-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--app-accent)]"
          title="重命名"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeBlock(columnId, block.id)
          }}
          className="rounded p-0.5 text-[var(--app-text-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--app-danger)]"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 连接数量提示 */}
      {block.connections.length > 0 && (
        <div className="absolute top-1.5 left-1.5">
          <span className="rounded border border-[var(--app-border)] bg-[rgba(109,204,255,0.12)] px-1 text-[9px] text-[var(--app-accent)]">
            ←{block.connections.length}
          </span>
        </div>
      )}

      {/* AI diff 标签 */}
      {diffStatus && (
        <span
          className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold rounded-full px-2 py-0.5 shadow-sm z-20 ${
            diffStatus === 'added'
              ? 'bg-[var(--app-success)] text-white'
              : 'bg-[var(--app-warning)] text-white'
          }`}
        >
          {diffStatus === 'added' ? '新增' : '修改'}
        </span>
      )}

      {/* 类型标签 */}
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.tagColor}`}>
        {style.tag}
      </span>

      {/* 名称 */}
      <span className="w-full truncate text-center text-xs font-semibold leading-tight text-[var(--app-text)]">
        {block.name}
      </span>

      {/* 预览 */}
      {preview && (
        <p className="w-full truncate text-center text-[10px] leading-tight text-[var(--app-text-soft)]">{preview}</p>
      )}
    </div>
  )
}
