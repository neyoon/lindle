import { useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { ThemeToggle } from './ui/ThemeToggle'

interface Props {
  loading?: boolean
  onLogin: (username: string, password: string) => Promise<void>
  onBack?: () => void
}

export function LoginPage({ loading = false, onLogin, onBack }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await onLogin(username.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : `登录失败: ${err}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="app-card w-full max-w-md p-8 md:p-10">
        <div className="mb-8">
          <div className="app-kicker mb-3">Tweak access / authenticated workspace</div>
          <h1 className="app-section-title text-4xl">登录 Tweak</h1>
          <p className="app-muted mt-4 text-sm leading-7">
            注册或使用LAT账号登陆以使用Tweak的完整功能。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入 LAT 账号"
              className="app-input w-full px-4 py-3"
              autoComplete="username"
              disabled={loading || submitting}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              className="app-input w-full px-4 py-3"
              autoComplete="current-password"
              disabled={loading || submitting}
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-[rgba(244,107,122,0.24)] bg-[rgba(244,107,122,0.08)] px-4 py-3 text-sm text-[var(--app-danger)]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || submitting}
            className="app-button app-button-primary w-full disabled:opacity-60"
          >
            {loading || submitting ? <KeyRound size={16} /> : <LogIn size={16} />}
            登录
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="app-button app-button-ghost w-full"
              disabled={loading || submitting}
            >
              返回首页
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
