import { useEffect, useRef, useState } from 'react'
import { Settings2, SlidersHorizontal, Cable } from 'lucide-react'

interface Props {
  onOpenGeneral: () => void
  onOpenProvider: () => void
}

export function SettingsEntry({ onOpenGeneral, onOpenProvider }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const pick = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`settings-entry app-button app-button-ghost gap-2 rounded-sm px-3 ${open ? 'is-open' : ''}`}
        title="设置"
        aria-label="打开设置菜单"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="settings-seal">
          <Settings2 size={16} className="settings-gear" />
        </span>
        <span className="text-sm">设置</span>
      </button>

      {open && (
        <div
          role="menu"
          className="settings-menu absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-sm border border-[var(--app-border)] bg-[var(--app-panel-solid)] shadow-[var(--app-shadow)]"
        >
          <button
            role="menuitem"
            onClick={() => pick(onOpenGeneral)}
            className="settings-menu-item flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
          >
            <SlidersHorizontal size={15} className="text-[var(--app-accent)]" />
            <div>
              <span className="font-medium text-[var(--app-text)]">设置</span>
              <p className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">界面、显示、默认执行策略</p>
            </div>
          </button>
          <button
            role="menuitem"
            onClick={() => pick(onOpenProvider)}
            className="settings-menu-item flex w-full items-center gap-2.5 border-t border-[var(--app-border)] px-4 py-3 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
          >
            <Cable size={15} className="text-[var(--app-accent)]" />
            <div>
              <span className="font-medium text-[var(--app-text)]">Provider</span>
              <p className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">模型来源、默认 Provider、编辑</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
