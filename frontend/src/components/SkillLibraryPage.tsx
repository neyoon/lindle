import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { createCustomSkill, deleteCustomSkill, getAgent, listAgents, listCustomSkills } from '@/api/client'
import { SkillEditor } from './SkillEditor'

interface CustomSkill {
  id: string
  name: string
  description: string
  icon: string
  code: string
  input_schema: Record<string, any>
  output_schema: Record<string, any>
}

interface Props {
  onBack: () => void
  headerActions?: ReactNode
}

export function SkillLibraryPage({ onBack, headerActions }: Props) {
  const [skills, setSkills] = useState<CustomSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CustomSkill | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  const loadSkills = async () => {
    try {
      const data = await listCustomSkills()
      setSkills(data)
    } catch (e) {
      console.error('加载 Skills 失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSkills()
  }, [])

  const handleSave = async (skill: CustomSkill) => {
    const duplicate = skills.find((item) => item.name.trim() === skill.name.trim() && item.id !== skill.id)
    if (duplicate) {
      throw new Error(`已存在同名 Skill「${skill.name}」，请使用其他名称`)
    }

    await createCustomSkill(skill)
    await loadSkills()
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      const agents = await listAgents()
      const usingAgents: string[] = []

      for (const agentSummary of agents) {
        const agent = await getAgent(agentSummary.id)
        if (agent.skills?.some((skill: any) => skill.skill_id === id)) {
          usingAgents.push(agent.name)
        }
      }

      if (usingAgents.length > 0) {
        const agentNames = usingAgents.join('、')
        if (!confirm(`Skill「${name}」正在被以下 Agent 使用：${agentNames}\n\n删除后这些 Agent 将无法调用此 Skill。确定删除？`)) {
          return
        }
      } else if (!confirm(`确定删除 Skill「${name}」？删除后不可恢复。`)) {
        return
      }
    } catch {
      if (!confirm(`确定删除 Skill「${name}」？删除后不可恢复。`)) return
    }

    try {
      await deleteCustomSkill(id)
      await loadSkills()
    } catch (error) {
      alert(`删除失败: ${error}`)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="app-button app-button-ghost">
              <ArrowLeft size={16} />
              返回
            </button>
            <div>
              <div className="app-kicker">Skill library / agent capability layer</div>
              <h1 className="app-section-title text-2xl">Skill 库</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(null); setShowEditor(true) }} className="app-button app-button-primary">
              <Plus size={16} />
              新建 Skill
            </button>
            {headerActions}
          </div>
        </div>
      </header>

      <main className="app-page py-8">
        <section className="app-card p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="app-kicker mb-3">Custom skills</div>
              <h2 className="app-section-title text-3xl md:text-4xl">自定义 Skill</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="app-stat">
                <div className="app-kicker mb-2">Skills</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">{skills.length}</div>
                <p className="app-muted mt-2 text-sm">自定义 Skill 数量</p>
              </div>
              <div className="app-stat">
                <div className="app-kicker mb-2">Role</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">Agents</div>
                <p className="app-muted mt-2 text-sm">Agent 可用</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6">
          {loading ? (
            <div className="app-card p-12 text-center text-[var(--app-text-soft)]">加载中...</div>
          ) : skills.length === 0 ? (
            <div className="app-card p-12 text-center">
              <Wrench size={54} className="mx-auto text-[var(--app-text-muted)]" />
              <h3 className="app-section-title mt-5 text-3xl">暂无自定义 Skill</h3>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {skills.map((skill) => (
                <article key={skill.id} className="app-card-soft group p-5">
                  <div className="text-3xl" style={{ fontFamily: 'Fraunces, serif' }}>{skill.icon || '[]'}</div>
                  <h3 className="mt-4 text-lg font-medium text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>{skill.name}</h3>
                  <p className="app-muted mt-2 min-h-[3rem] text-sm leading-7">{skill.description || '无描述'}</p>
                  <div className="mt-5 flex gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                    <button onClick={() => { setEditing(skill); setShowEditor(true) }} className="app-button app-button-ghost">
                      <Pencil size={14} />
                      编辑
                    </button>
                    <button onClick={() => handleDelete(skill.id, skill.name)} className="app-button app-button-danger">
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {showEditor && (
        <SkillEditor
          initialSkill={editing || undefined}
          onSave={handleSave}
          onClose={() => { setShowEditor(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
