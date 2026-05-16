import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Download, Loader2, Pencil, Plus, Trash2, Wrench, X } from 'lucide-react'
import { createCustomSkill, deleteCustomSkill, getAgent, importGitHubSkill, listAgents, listCustomSkills, previewGitHubSkill } from '@/api/client'
import { SkillEditor } from './SkillEditor'

interface CustomSkill {
  id: string
  name: string
  description: string
  icon: string
  code: string
  input_schema: Record<string, any>
  output_schema: Record<string, any>
  source?: string
  source_url?: string
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
  const [showGitHubImport, setShowGitHubImport] = useState(false)

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
            <button onClick={() => setShowGitHubImport(true)} className="app-button app-button-secondary">
              <Download size={16} />
              从 GitHub 导入
            </button>
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
                  <div className="app-kicker no-rule mt-2 text-[0.62rem]">{skill.source === 'github' ? 'GitHub' : 'Local'}</div>
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

      {showGitHubImport && (
        <GitHubSkillImportDialog
          existingSkills={skills}
          onClose={() => setShowGitHubImport(false)}
          onImported={async () => {
            await loadSkills()
            setShowGitHubImport(false)
          }}
        />
      )}
    </div>
  )
}

function GitHubSkillImportDialog({
  existingSkills,
  onClose,
  onImported,
}: {
  existingSkills: CustomSkill[]
  onClose: () => void
  onImported: () => void | Promise<void>
}) {
  const [source, setSource] = useState('')
  const [preview, setPreview] = useState<CustomSkill | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const handlePreview = async () => {
    if (!source.trim()) {
      setError('请输入 GitHub 地址')
      return
    }
    setLoadingPreview(true)
    setError('')
    try {
      const result = await previewGitHubSkill(source.trim())
      setPreview(result.skill)
    } catch (e) {
      setPreview(null)
      setError(`预览失败: ${e}`)
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleImport = async () => {
    if (!preview) return
    const duplicate = existingSkills.find((item) => item.id === preview.id || item.name.trim() === preview.name.trim())
    if (duplicate && !confirm(`已存在 Skill「${duplicate.name}」，确定继续导入？`)) {
      return
    }

    setImporting(true)
    setError('')
    try {
      await importGitHubSkill(source.trim(), preview.name, preview.description)
      await onImported()
    } catch (e) {
      setError(`导入失败: ${e}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(30,20,15,0.5)] p-4">
      <div className="app-card flex max-h-[90vh] w-full max-w-2xl flex-col" style={{ animation: 'panel-slide-in 0.4s var(--ease-ink)' }}>
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-6 py-4">
          <div>
            <div className="app-kicker no-rule text-[0.6rem]">GitHub import</div>
            <h2 className="text-lg font-medium text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>从 GitHub 导入 Skill</h2>
          </div>
          <button onClick={onClose} className="text-[var(--app-text-muted)] transition hover:text-[var(--app-text)]">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">GitHub 地址</label>
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                className="app-input flex-1"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value)
                  setPreview(null)
                  setError('')
                }}
                placeholder="owner/repo/path 或 GitHub URL"
              />
              <button onClick={handlePreview} disabled={loadingPreview} className="app-button app-button-secondary disabled:opacity-50">
                {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : null}
                预览
              </button>
            </div>
          </div>

          {preview && (
            <div className="rounded-sm border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
              <div className="app-kicker no-rule mb-2">Preview</div>
              <h3 className="text-xl font-medium text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>{preview.name}</h3>
              <p className="app-muted mt-2 text-sm leading-7">{preview.description || '无描述'}</p>
              <div className="mt-4 grid gap-2 text-xs md:grid-cols-2">
                <PreviewField label="ID" value={preview.id} />
                <PreviewField label="Source" value={preview.source_url || source} />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-sm border border-[var(--bruise-soft)] bg-[var(--bruise-soft)] px-4 py-3 text-sm text-[var(--app-danger)]">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--app-border)] bg-[var(--paper-warm)] px-6 py-4">
          <button onClick={onClose} className="app-button app-button-ghost">取消</button>
          <button onClick={handleImport} disabled={!preview || importing} className="app-button app-button-primary disabled:opacity-50">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            导入
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">{label}</div>
      <div className="break-all rounded-sm border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 font-mono text-[var(--app-text)]">{value}</div>
    </div>
  )
}
