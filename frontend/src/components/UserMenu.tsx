import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleUserRound, LogOut, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AuthUser } from '@/types/auth'

interface Props {
  user: AuthUser
  onLogout: () => Promise<void> | void
  onOpenSettings?: () => void
  extraActions?: ReactNode
}

export function UserMenu({ user, onLogout, onOpenSettings, extraActions }: Props) {
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
        className="app-button app-button-ghost gap-2 rounded-full px-3"
      >
        <CircleUserRound size={16} />
        <span className="max-w-24 truncate text-sm">{user.username}</span>
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-solid)] shadow-[var(--app-shadow)]">
          <div className="border-b border-[var(--app-border)] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-3 text-[var(--app-accent)]">
                <CircleUserRound size={18} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-[var(--app-text)]">{user.username}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--app-text-muted)]">{user.role}</div>
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
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-[var(--app-text)] transition hover:bg-[rgba(109,204,255,0.08)]"
              >
                <SlidersHorizontal size={16} />
                <div>
                  <div className="font-medium">Provider 设置</div>
                  <div className="mt-1 text-xs text-[var(--app-text-soft)]">管理模型源、默认 Provider 和 AI 编辑模型</div>
                </div>
              </button>
            )}

            {extraActions}

            <button
              onClick={() => {
                setOpen(false)
                void onLogout()
              }}
              className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-[var(--app-danger)] transition hover:bg-[rgba(244,107,122,0.08)]"
            >
              <LogOut size={16} />
              <div>
                <div className="font-medium">退出登陆</div>
                <div className="mt-1 text-xs text-[var(--app-text-soft)]">清除未保存的当前账号会话，返回登陆页</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
