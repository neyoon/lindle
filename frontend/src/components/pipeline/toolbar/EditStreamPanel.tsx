import type { RefObject } from 'react'
import { Check, Loader2, Square, Undo2 } from 'lucide-react'

export function EditStreamPanel({
  editLoading,
  editThinking,
  editDelta,
  editError,
  editDone,
  canUndo,
  streamPanelRef,
  onAbort,
  onUndo,
  onConfirmEdit,
  onClose,
}: {
  editLoading: boolean
  editThinking: string
  editDelta: string
  editError: string
  editDone: boolean
  canUndo: boolean
  streamPanelRef: RefObject<HTMLPreElement>
  onAbort: () => void
  onUndo: () => void
  onConfirmEdit: () => void
  onClose: () => void
}) {
  return (
    <div className="border-b border-[var(--app-border)] bg-[var(--app-accent-soft)] px-4 py-3" style={{ animation: 'panel-slide-in 0.4s var(--ease-ink)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--app-accent-strong)]">
            {editLoading ? (
              <><Loader2 size={12} className="animate-spin" /> 正在修改工作流...</>
            ) : editError ? (
              <span className="text-[var(--app-danger)]">{editError}</span>
            ) : editDone ? (
              '编辑完成 — 画布中高亮显示了变更'
            ) : (
              '完成'
            )}
          </span>
          <div className="flex items-center gap-1.5">
            {editLoading ? (
              <button
                onClick={onAbort}
                className="flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium text-[var(--app-danger)] transition hover:bg-[var(--bruise-soft)]"
              >
                <Square size={10} fill="currentColor" />
                打断
              </button>
            ) : editDone && canUndo ? (
              <>
                <button
                  onClick={onUndo}
                  className="flex items-center gap-1 rounded-sm border border-[var(--app-warm)] px-2.5 py-1 text-xs font-medium text-[var(--app-warning)] transition hover:bg-[var(--rust-soft)]"
                >
                  <Undo2 size={12} />
                  撤销
                </button>
                <button
                  onClick={onConfirmEdit}
                  className="flex items-center gap-1 rounded-sm border border-[var(--moss-soft)] px-2.5 py-1 text-xs font-medium text-[var(--app-success)] transition hover:bg-[var(--moss-soft)]"
                >
                  <Check size={12} />
                  确认
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="rounded-full px-2 py-0.5 text-xs text-[var(--app-text-muted)] transition hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--app-text)]"
              >
                关闭
              </button>
            )}
          </div>
        </div>
        {editThinking && (
          <div className="mb-2">
            <span className="text-[10px] font-medium text-[var(--app-text-soft)]">思考过程</span>
            <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-2 text-xs italic leading-relaxed text-[var(--app-text-soft)]" style={{ fontFamily: 'Fraunces, serif' }}>
              {editThinking}
            </pre>
          </div>
        )}
        {editDelta && (
          <div>
            <span className="text-[10px] font-medium text-[var(--app-text-soft)]">生成内容</span>
            <pre
              ref={streamPanelRef}
              className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-sm border border-[var(--line)] bg-[var(--card)] p-2 font-mono text-xs leading-relaxed text-[var(--app-text)]"
            >
              {editDelta}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
