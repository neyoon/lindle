import { useEffect, useState } from 'react'
import { Plus, Settings, Sparkles, Trash2, Wrench } from 'lucide-react'
import { listAgents, deleteAgent } from '@/api/client'
import { ThemeToggle } from './ui/ThemeToggle'

interface AgentSummary {
  id: string
  name: string
  description: string
  skill_count: number
  created_at: string
  updated_at: string
}

interface Props {
  onOpen: (agentId: string) => void
  onCreateNew: () => void
  onBack: () => void
  onOpenSkillLibrary?: () => void
  onOpenSettings?: () => void
}

export function AgentListPage({ onOpen, onCreateNew, onBack, onOpenSkillLibrary, onOpenSettings }: Props) {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)

  const loadAgents = async () => {
    try {
      const data = await listAgents()
      setAgents(data)
    } catch (e) {
      console.error('加载 Agent 失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (!confirm(`确定删除 Agent「${name}」？删除后不可恢复。`)) return
    try {
      await deleteAgent(id)
      setAgents((prev) => prev.filter((a) => a.id !== id))
    } catch (error) {
      alert(`删除失败: ${error}`)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex min-w-0 items-center gap-4">
            <button onClick={onBack} className="app-button app-button-ghost">
              返回
            </button>
            <div className="min-w-0">
              <div className="app-kicker">Agent center / dynamic execution</div>
              <h1 className="app-section-title flex items-center gap-3 text-2xl">
                我的 Agent
                <span className="app-pill border-0 bg-[rgba(244,107,122,0.12)] text-[var(--app-danger)]">Beta</span>
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ThemeToggle />
            {onOpenSettings && (
              <button onClick={onOpenSettings} className="app-button app-button-ghost">
                <Settings size={16} />
                设置
              </button>
            )}
            {onOpenSkillLibrary && (
              <button onClick={onOpenSkillLibrary} className="app-button app-button-ghost">
                <Wrench size={16} />
                Skill 库
              </button>
            )}
            <button onClick={onCreateNew} className="app-button app-button-primary">
              <Plus size={16} />
              创建 Agent
            </button>
          </div>
        </div>
      </header>

      <main className="app-page py-8">
        <section className="app-card p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="app-kicker mb-3">Agent runtime</div>
              <h2 className="app-section-title text-3xl md:text-4xl">让对话端去消费你制造出来的能力</h2>
              <p className="app-muted mt-4 max-w-2xl text-sm leading-8">
                Agent 侧的特殊性不在聊天本身，而在它能把 Skill、Flow 执行器和系统提示词组合成运行时决策层。
                首页展示的是闭环，这里负责真正消费那条闭环。
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="app-stat">
                <div className="app-kicker mb-2">Count</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">{agents.length}</div>
                <p className="app-muted mt-2 text-sm">当前 Agent 数量</p>
              </div>
              <div className="app-stat">
                <div className="app-kicker mb-2">Focus</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">Skills</div>
                <p className="app-muted mt-2 text-sm">Agent 的能力来自 Skill 和 Flow 绑定</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6">
          {loading ? (
            <div className="app-card p-12 text-center text-[var(--app-text-soft)]">加载中...</div>
          ) : agents.length === 0 ? (
            <div className="app-card p-12 text-center">
              <Sparkles size={52} className="mx-auto text-[var(--app-text-muted)]" />
              <h3 className="app-section-title mt-5 text-3xl">还没有创建任何 Agent</h3>
              <p className="app-muted mx-auto mt-4 max-w-xl text-sm leading-8">
                先创建一个 Agent，然后给它绑定工作流执行器、设计器或自定义 Skill。这里是 Flow 能力真正被动态消费的地方。
              </p>
              <button onClick={onCreateNew} className="app-button app-button-primary mt-6">
                <Plus size={16} />
                创建第一个 Agent
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <article
                  key={agent.id}
                  onClick={() => onOpen(agent.id)}
                  className="app-card-soft group cursor-pointer p-5 transition hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-3 inline-flex rounded-2xl border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-3 text-[var(--app-accent)]">
                        <Sparkles size={18} />
                      </div>
                      <h3 className="truncate text-lg font-semibold text-[var(--app-text)]">{agent.name}</h3>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, agent.id, agent.name)}
                      className="rounded-full p-2 text-[var(--app-text-muted)] transition hover:bg-[rgba(244,107,122,0.08)] hover:text-[var(--app-danger)]"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <p className="app-muted mt-3 min-h-[3rem] text-sm leading-7">
                    {agent.description || '暂无描述'}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="app-pill">
                      <Wrench size={12} />
                      {agent.skill_count} 个 Skills
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
