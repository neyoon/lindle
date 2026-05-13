import { Link, X } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import type { Block, Column } from '@/types/workflow'

export function ConnectionDisplay({
  block,
  workflow,
  onRemove,
}: {
  block: Block
  workflow: { columns: Column[] }
  onRemove: (blockId: string, fromBlockId: string) => void
}) {
  const { updateConnectionKey } = useWorkflowStore()

  const findBlock = (id: string): Block | null => {
    for (const col of workflow.columns) {
      for (const b of col.blocks) {
        if (b.id === id) return b
      }
    }
    return null
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--app-text-soft)]">
        <span className="flex items-center gap-1">
          <Link size={12} />
          已连接的上游步骤
        </span>
      </label>
      <div className="space-y-2">
        {block.connections.map((conn) => {
          const sourceBlock = findBlock(conn.from_block_id)
          const outputKeys = sourceBlock?.output_schema?.keys
          const hasKeys = outputKeys && outputKeys.length > 0

          return (
            <div
              key={conn.from_block_id}
              className="rounded-sm border border-[var(--app-border)] bg-[var(--paper-warm)] px-2.5 py-2 text-xs"
            >
              <div className="flex items-center justify-between text-[var(--app-accent-strong)]">
                <span className="flex items-center gap-1.5">
                  <span className="text-[var(--app-accent)]">←</span>
                  <span className="font-medium">{sourceBlock?.name || conn.from_block_id}</span>
                </span>
                <button
                  onClick={() => onRemove(block.id, conn.from_block_id)}
                  className="text-[var(--app-text-muted)] transition hover:text-[var(--app-danger)]"
                  title="断开连接"
                >
                  <X size={12} />
                </button>
              </div>

              {hasKeys && (
                <div className="mt-1.5">
                  <label className="mb-0.5 block text-[10px] text-[var(--app-text-muted)]">选择接收的输出字段</label>
                  <select
                    className="app-input py-1 text-xs"
                    value={conn.from_key || ''}
                    onChange={(e) => {
                      updateConnectionKey(block.id, conn.from_block_id, e.target.value || null)
                    }}
                  >
                    <option value="">全部输出</option>
                    {outputKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {conn.from_key && (
                <p className="mt-1 text-[10px] text-[var(--app-accent-strong)]">
                  仅接收: <span className="font-mono font-medium">{conn.from_key}</span>
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--app-text-muted)]">
        通过端口连接：点击源步骤右侧圆点 → 目标步骤左侧圆点
      </p>
    </div>
  )
}
