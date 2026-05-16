import { Download, FileText } from 'lucide-react'

export function ExportMenu({
  open,
  onToggle,
  onClose,
  onExportManifest,
  onExportCode,
  onExportDescribe,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  onExportManifest: () => void
  onExportCode: () => void
  onExportDescribe: () => void
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="app-button app-button-ghost"
      >
        <Download size={16} />
        导出
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-sm border border-[var(--app-border)] bg-[var(--app-panel-solid)] shadow-[var(--app-shadow)]" style={{ animation: 'panel-slide-in 0.35s var(--ease-ink)' }}>
            <button
              onClick={onExportManifest}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
            >
              <FileText size={15} className="text-[var(--app-accent)]" />
              <div>
                <span className="font-medium text-[var(--app-text)]">导出结构化 Flow</span>
              </div>
            </button>
            <button
              onClick={onExportCode}
              className="flex w-full items-center gap-2.5 border-t border-[var(--app-border)] px-4 py-3 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
            >
              <Download size={15} className="text-[var(--app-accent)]" />
              <div>
                <span className="font-medium text-[var(--app-text)]">下载代码项目</span>
                <p className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">ZIP 结构化 Python 项目</p>
              </div>
            </button>
            <button
              onClick={onExportDescribe}
              className="flex w-full items-center gap-2.5 border-t border-[var(--app-border)] px-4 py-3 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
            >
              <FileText size={15} className="text-[var(--app-accent)]" />
              <div>
                <span className="font-medium text-[var(--app-text)]">导出流程描述</span>
                <p className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">LLM 可读的文本格式</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
