import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleUserRound, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import type { WorkspaceUser } from '@/types/user'

interface Props {
  user: WorkspaceUser
  onOpenSettings?: () => void
  extraActions?: ReactNode
}

export function UserMenu({ user, onOpenSettings, extraActions }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="app-button app-button-ghost gap-2 rounded-sm px-3"
      >
        <span className="user-seal">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-24 truncate text-sm">{user.username}</span>
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-sm border border-[var(--app-border)] bg-[var(--app-panel-solid)] shadow-[var(--app-shadow)]"
             style={{ animation: 'panel-slide-in 0.35s var(--ease-ink)' }}>
          <div className="border-b border-[var(--app-border)] px-5 py-4 bg-[var(--paper-warm)] relative">
            <span className="absolute top-2 right-3 app-kicker no-rule text-[0.6rem]">Local workspace</span>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full border-[1.5px] border-[var(--ink)] inline-flex items-center justify-center text-[var(--ink)] shrink-0">
                <CircleUserRound size={20} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-medium text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>{user.username}</div>
                <div className="mt-1 app-kicker no-rule text-[0.6rem]">{user.role}</div>
                <div className="mt-2 text-xs text-[var(--app-text-soft)] italic" style={{ fontFamily: 'Fraunces, serif' }}>当前以本地模式运行，不需要登录。</div>
              </div>
            </div>
          </div>

          <div className="p-3">
            {onOpenSettings && (
              <button
                onClick={() => {
                  setOpen(false)
                  onOpenSettings()
                }}
                className="flex w-full items-center gap-3 rounded-sm px-4 py-3 text-left text-sm text-[var(--app-text)] transition hover:bg-[var(--app-accent-soft)]"
              >
                <SlidersHorizontal size={16} className="text-[var(--app-accent-strong)]" />
                <div>
                  <div className="font-medium">Provider 设置</div>
                  <div className="mt-1 text-xs text-[var(--app-text-soft)]">管理模型源、默认 Provider 和 AI 编辑模型</div>
                </div>
              </button>
            )}

            {extraActions}
          </div>
        </div>
      )}
    </div>
  )
}
