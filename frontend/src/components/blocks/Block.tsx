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
import { evaluateFlowHealth } from '@/utils/flowHealth'

const TYPE_STYLES: Record<string, { tag: string; tagColor: string }> = {
  collect: { tag: 'COL', tagColor: 'block-tag is-in' },
  process: { tag: 'PROC', tagColor: 'block-tag is-ai' },
  result: { tag: 'RES', tagColor: 'block-tag is-out' },
  tool: { tag: 'TOOL', tagColor: 'block-tag is-plugin' },
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
  const workflow = useWorkflowStore((s) => s.workflow)

  const blockDiffMap = useWorkflowStore((s) => s.blockDiffMap)
  const runStatus = useWorkflowStore((s) => s.blockRunState[block.id] ?? null)
  const healthIssues = evaluateFlowHealth(workflow).byBlockId[block.id] || []
  const hasHealthError = healthIssues.some((issue) => issue.severity === 'error')
  const hasHealthWarning = healthIssues.some((issue) => issue.severity === 'warning')

  const style = TYPE_STYLES[block.type] || TYPE_STYLES.collect
  const isSelected = selectedBlockId === block.id
  const isConnectingSource = connectingFrom?.blockId === block.id
  const diffStatus = blockDiffMap?.[block.id] ?? null

  // 是否为有效连接目标（连接模式下，当前块在源块之后的列）
  const isValidTarget = connectingFrom
    ? columnOrder > connectingFrom.columnOrder && connectingFrom.blockId !== block.id
    : false

  // 配置预览
  let preview = ''
  if (block.type === 'process' && block.config.prompt) {
    preview = block.config.prompt.slice(0, 40) + (block.config.prompt.length > 40 ? '...' : '')
  } else if (block.type === 'collect' && block.config.fields) {
    preview = block.config.fields.map((f) => f.label || f.name).join(', ')
  } else if (block.type === 'tool' && block.config.plugin_id) {
    preview = block.config.plugin_input_bindings
      ? `${block.config.plugin_id} · ${Object.keys(block.config.plugin_input_bindings).length} 项映射`
      : block.config.plugin_id
  } else if (block.type === 'result') {
    preview = '透传结构化结果'
  }

  return (
    <div
      data-block-id={block.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/lindle-block', JSON.stringify({ blockId: block.id, columnId }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => selectBlock(block.id)}
      className={`
        editor-block group relative flex h-[140px] w-[140px] cursor-grab flex-col items-center justify-center gap-1.5 rounded-sm border p-3 active:cursor-grabbing
        ${block.type === 'tool' ? 'is-plugin' : ''}
        ${isSelected ? 'is-selected' : ''}
        ${isConnectingSource ? 'ring-2 ring-[var(--app-warning)] ring-offset-2 ring-offset-[var(--paper)]' : ''}
        ${diffStatus === 'added' ? 'is-done' : ''}
        ${diffStatus === 'modified' ? 'is-selected' : ''}
        ${runStatus === 'running' ? 'is-running' : ''}
        ${runStatus === 'done' ? 'is-done' : ''}
        ${runStatus === 'error' || hasHealthError ? 'is-error' : ''}
        ${hasHealthWarning && !hasHealthError ? 'ring-1 ring-[var(--app-warning)]' : ''}
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
          className={`editor-port in ${
            connectingFrom && isValidTarget
              ? 'is-target-ok'
              : connectingFrom
                ? 'is-target-disabled'
                : ''
          }`}
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
          className={`editor-port out ${isConnectingSource ? 'is-source-active' : ''}`}
          title="输出端口 - 点击开始连接"
        />
      )}

      {/* 顶部工具 */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        {block.output_schema && (
          <span className="rounded-sm px-1 font-mono text-[9px] tracking-[0.1em] text-[var(--gold)] border border-[var(--line)] bg-[var(--paper-warm)]" title="JSON 输出">
            JSON
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            selectBlock(block.id)
          }}
          className="rounded-sm p-0.5 text-[var(--app-text-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--app-accent)]"
          title="在右侧面板中重命名"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeBlock(columnId, block.id)
          }}
          className="rounded-sm p-0.5 text-[var(--app-text-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--app-danger)]"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 连接数量提示 */}
      {block.connections.length > 0 && (
        <div className="absolute top-1.5 left-1.5">
          <span className="font-mono rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] px-1 text-[9px] tracking-[0.1em] text-[var(--app-accent-strong)]">
            ←{block.connections.length}
          </span>
        </div>
      )}

      {/* AI diff 印章 */}
      {diffStatus && (
        <span className={`block-stamp ${diffStatus === 'added' ? 'is-added' : 'is-modified'}`}>
          {diffStatus === 'added' ? '新增' : '修改'}
        </span>
      )}

      {runStatus && (
        <span
          className={`block-stamp ${
            runStatus === 'running' ? 'is-running' : runStatus === 'done' ? 'is-done' : 'is-error'
          }`}
        >
          {runStatus === 'running' ? '运行中' : runStatus === 'done' ? '已完成' : '失败'}
        </span>
      )}

      {!runStatus && (hasHealthError || hasHealthWarning) && (
        <span className={`block-stamp ${hasHealthError ? 'is-error' : 'is-running'}`}>
          {hasHealthError ? '需处理' : '可优化'}
        </span>
      )}

      {/* 类型标签 */}
      <span className={style.tagColor}>{style.tag}</span>

      {/* 名称 */}
      <span className="w-full truncate text-center text-[0.85rem] font-medium leading-tight text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>
        {block.name}
      </span>

      <span className="w-full truncate text-center font-mono text-[9px] leading-tight text-[var(--app-text-muted)]">
        {block.ref}
      </span>

      {/* 预览 */}
      {preview && (
        <p className="w-full truncate text-center font-mono text-[10px] leading-tight text-[var(--app-text-soft)]">{preview}</p>
      )}
    </div>
  )
}
