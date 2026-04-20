/**
 * 栏组件 - 全屏高度的竖条
 *
 * 每栏从上到下占满整个屏幕高度，
 * 栏内垂直居中排列正方形块（Block），底部有添加块按钮。
 * 添加块菜单包含: 核心块 + 制造的模板 + 启用的插件。
 */
import { Plus, Trash2, Repeat } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BlockTemplate, BlockType, Column, EnabledPlugin } from '@/types/workflow'
import { useWorkflowStore } from '@/stores/workflow'
import { getEnabledPlugins, listTemplates } from '@/api/client'
import { BlockView } from '../blocks/Block'

const CORE_BLOCK_OPTIONS: { type: BlockType; label: string }[] = [
  { type: 'input', label: '输入' },
  { type: 'ai', label: 'AI' },
  { type: 'output', label: '输出' },
]

interface Props {
  column: Column
  isFirstColumn: boolean
  isLastColumn: boolean
}

export function ColumnView({ column, isFirstColumn, isLastColumn }: Props) {
  const { removeColumn, addBlock, addBlockFromTemplate, moveBlock, setColumnRepeat } = useWorkflowStore()
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [editingRepeat, setEditingRepeat] = useState(false)
  const [repeatDraft, setRepeatDraft] = useState(String(column.repeat))
  const [enabledPlugins, setEnabledPlugins] = useState<EnabledPlugin[]>([])
  const [templates, setTemplates] = useState<BlockTemplate[]>([])
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // 每次打开菜单时加载已启用插件和制造模板
  useEffect(() => {
    if (showAddMenu) {
      getEnabledPlugins().then(setEnabledPlugins).catch(() => {})
      listTemplates().then(setTemplates).catch(() => {})
    }
  }, [showAddMenu])

  useEffect(() => {
    setRepeatDraft(String(column.repeat))
  }, [column.repeat])

  const handleAddBlock = (type: BlockType, label: string, pluginId?: string) => {
    addBlock(column.id, type, `${label}块`, pluginId)
    setShowAddMenu(false)
  }

  const handleAddFromTemplate = (template: BlockTemplate) => {
    addBlockFromTemplate(column.id, template)
    setShowAddMenu(false)
  }

  const calcDropIndex = (e: React.DragEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const blockEls = Array.from(container.querySelectorAll('[data-block-id]')) as HTMLElement[]
    const y = e.clientY
    for (let i = 0; i < blockEls.length; i++) {
      const rect = blockEls[i].getBoundingClientRect()
      if (y < rect.top + rect.height / 2) return i
    }
    return blockEls.length
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/lindle-block')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(calcDropIndex(e))
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDropIndex(null)
    const raw = e.dataTransfer.getData('application/lindle-block')
    if (!raw) return
    try {
      const { blockId, columnId: fromColumnId } = JSON.parse(raw)
      const idx = calcDropIndex(e)
      moveBlock(blockId, fromColumnId, column.id, idx)
    } catch {}
  }

  return (
    <div className="editor-column flex h-full w-52 shrink-0 flex-col">
      {/* 栏头 */}
      <div className="editor-column-header flex items-center justify-between px-3 py-2.5">
        <span className="app-kicker no-rule text-[0.68rem] text-[var(--app-accent-strong)]">
          Stage {String(column.order + 1).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-1">
          {column.repeat > 1 && (
            <span className="flex items-center gap-0.5 font-mono text-[0.7rem] font-medium text-[var(--app-accent-strong)]">
              <Repeat size={12} />
              x{column.repeat}
            </span>
          )}
          {editingRepeat ? (
            <div className="flex items-center gap-1 rounded-sm border border-[var(--line)] bg-[var(--card)] px-1 py-0.5">
              <input
                type="number"
                min={1}
                value={repeatDraft}
                onChange={(e) => setRepeatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setColumnRepeat(column.id, Math.max(1, parseInt(repeatDraft || '1', 10) || 1))
                    setEditingRepeat(false)
                  }
                  if (e.key === 'Escape') {
                    setRepeatDraft(String(column.repeat))
                    setEditingRepeat(false)
                  }
                }}
                className="w-12 border-0 bg-transparent text-center text-[11px] text-[var(--app-text)] outline-none"
                autoFocus
              />
              <button
                onClick={() => {
                  setColumnRepeat(column.id, Math.max(1, parseInt(repeatDraft || '1', 10) || 1))
                  setEditingRepeat(false)
                }}
                className="text-[10px] text-[var(--app-accent-strong)]"
                title="确认"
              >
                保存
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingRepeat(true)}
              className="rounded-sm p-1 text-[var(--app-text-muted)] hover:text-[var(--app-accent)]"
              title="设置重复次数"
            >
              <Repeat size={13} />
            </button>
          )}
          <button
            onClick={() => removeColumn(column.id)}
            className="rounded-sm p-1 text-[var(--app-text-muted)] hover:text-[var(--app-danger)]"
            title="删除栏"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* 块列表 - 居中排列正方形块，支持拖放 */}
      <div
        className="flex-1 overflow-y-auto p-3 flex flex-col items-center gap-3 column-scroll-container"
        onDragOver={handleDragOver}
        onDragLeave={() => setDropIndex(null)}
        onDrop={handleDrop}
      >
        {column.blocks.map((block, i) => (
          <div key={block.id} className="flex flex-col items-center">
            {dropIndex === i && (
              <div className="mb-2 h-[2px] w-[140px] bg-[var(--app-accent)]" style={{ animation: 'ink-pulse 1s ease-in-out infinite' }} />
            )}
            <BlockView
              block={block}
              columnId={column.id}
              columnOrder={column.order}
              isFirstColumn={isFirstColumn}
              isLastColumn={isLastColumn}
            />
          </div>
        ))}
        {dropIndex === column.blocks.length && (
          <div className="h-[2px] w-[140px] bg-[var(--app-accent)]" style={{ animation: 'ink-pulse 1s ease-in-out infinite' }} />
        )}
      </div>

      {/* 添加块 - 固定在底部 */}
      <div className="relative border-t border-[var(--app-border)] p-3">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="flex w-full items-center justify-center gap-1 rounded-sm border border-dashed border-[var(--app-border-strong)] py-2 text-xs text-[var(--app-text-soft)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)] hover:text-[var(--app-accent-strong)]"
        >
          <Plus size={14} />
          添加块
        </button>

        {showAddMenu && (
          <div className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-80 overflow-y-auto overflow-hidden rounded-sm border border-[var(--app-border)] bg-[var(--app-panel-solid)] shadow-[var(--app-shadow)]" style={{ animation: 'panel-slide-in 0.35s var(--ease-ink)' }}>
            {/* 核心块 */}
            {CORE_BLOCK_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                onClick={() => handleAddBlock(opt.type, opt.label)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
              >
                <span className="font-medium text-[var(--app-text)]">{opt.label}</span>
              </button>
            ))}

            {/* 制造的模板 */}
            {templates.length > 0 && (
              <>
                <div className="border-t border-[var(--app-border)] px-3 py-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">制造模板</span>
                </div>
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleAddFromTemplate(tpl)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-[var(--app-text)]">{tpl.name}</span>
                      {tpl.description && (
                        <p className="truncate text-[10px] text-[var(--app-text-muted)]">{tpl.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* 已启用的插件 */}
            {enabledPlugins.length > 0 && (
              <>
                <div className="border-t border-[var(--app-border)] px-3 py-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">插件</span>
                </div>
                {enabledPlugins.map((plugin) => (
                  <button
                    key={plugin.id}
                    onClick={() => handleAddBlock('plugin', plugin.name, plugin.id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
                  >
                    <span className="font-medium text-[var(--app-text)]">{plugin.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
