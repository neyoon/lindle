import { useEffect, useState } from 'react'
import { Clock, Factory, FileCode, Plus, Puzzle, Settings, Trash2, Workflow } from 'lucide-react'
import { listWorkflows, deleteWorkflow, exportFlowsToSkill } from '@/api/client'
import { ThemeToggle } from './ui/ThemeToggle'

interface WorkflowSummary {
  id: string
  name: string
  description: string
  column_count: number
}

interface Props {
  onOpen: (workflowId: string) => void
  onCreateNew: () => void
  onOpenPlugins?: () => void
  onOpenManufacture?: () => void
  onOpenSettings?: () => void
  onBack?: () => void
}

export function WorkflowListPage({ onOpen, onCreateNew, onOpenPlugins, onOpenManufacture, onOpenSettings, onBack }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)

  const loadWorkflows = async () => {
    try {
      const data = await listWorkflows()
      setWorkflows(data)
    } catch (e) {
      console.error('加载工作流失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkflows()
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (!confirm(`确定删除工作流「${name}」？删除后不可恢复。`)) return
    try {
      await deleteWorkflow(id)
      setWorkflows((prev) => prev.filter((w) => w.id !== id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (error) {
      alert(`删除失败: ${error}`)
    }
  }

  const handleToggleSelect = (id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleExportToSkill = async () => {
    const skillName = prompt('请输入 Skill 名称（留空使用默认名称）:')
    if (skillName === null) return

    setIsExporting(true)
    try {
      await exportFlowsToSkill(Array.from(selectedIds), skillName || undefined)
      alert('Skill 创建成功！可在 Agent 编辑页中使用。')
      setSelectedIds(new Set())
    } catch (error) {
      alert(`创建失败: ${error}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex min-w-0 items-center gap-4">
            {onBack && (
              <button onClick={onBack} className="app-button app-button-ghost">
                返回
              </button>
            )}
            <div className="min-w-0">
              <div className="app-kicker">Flow center / factory-ready workflows</div>
              <h1 className="app-section-title text-2xl">我的工作流</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ThemeToggle />
            {onOpenPlugins && (
              <button onClick={onOpenPlugins} className="app-button app-button-ghost">
                <Puzzle size={16} />
                插件
              </button>
            )}
            {onOpenManufacture && (
              <button onClick={onOpenManufacture} className="app-button app-button-ghost">
                <Factory size={16} />
                制造
              </button>
            )}
            {onOpenSettings && (
              <button onClick={onOpenSettings} className="app-button app-button-ghost">
                <Settings size={16} />
                设置
              </button>
            )}
            <button onClick={onCreateNew} className="app-button app-button-primary">
              <Plus size={16} />
              新建工作流
            </button>
          </div>
        </div>
      </header>

      <main className="app-page py-8">
        <section className="app-card p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="app-kicker mb-3">Workflow inventory</div>
              <h2 className="app-section-title text-3xl md:text-4xl">从这里进入流程工厂</h2>
              <p className="app-muted mt-4 max-w-2xl text-sm leading-8">
                Flow 页负责管理可重复执行的结构化流程。它们既可以被人工打开继续编辑，也可以被导出为 Skill，进入 Agent 侧继续被调用。
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="app-stat">
                <div className="app-kicker mb-2">Count</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">{workflows.length}</div>
                <p className="app-muted mt-2 text-sm">已保存流程</p>
              </div>
              <div className="app-stat">
                <div className="app-kicker mb-2">Selection</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">{selectedIds.size}</div>
                <p className="app-muted mt-2 text-sm">当前选中，可导出为 Skill</p>
              </div>
            </div>
          </div>
        </section>

        {selectedIds.size > 0 && (
          <section className="app-card-soft mt-6 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="app-kicker mb-1">Selection batch</div>
              <p className="text-base font-medium text-[var(--app-text)]">已选择 {selectedIds.size} 个工作流</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedIds(new Set())} className="app-button app-button-ghost">
                取消选择
              </button>
              <button onClick={handleExportToSkill} disabled={isExporting} className="app-button app-button-primary disabled:opacity-50">
                <FileCode size={16} />
                {isExporting ? '导出中...' : '导出为 Skill'}
              </button>
            </div>
          </section>
        )}

        <section className="mt-6">
          {loading ? (
            <div className="app-card p-12 text-center text-[var(--app-text-soft)]">加载中...</div>
          ) : workflows.length === 0 ? (
            <div className="app-card p-12 text-center">
              <div className="app-kicker mb-3">No workflows yet</div>
              <h3 className="app-section-title text-3xl">还没有工作流</h3>
              <p className="app-muted mx-auto mt-4 max-w-xl text-sm leading-8">
                从一个空白 Flow 开始，或先进入制造页沉淀可复用模板。这里最终会成为 Agent 可以消费的能力资产库。
              </p>
              <button onClick={onCreateNew} className="app-button app-button-primary mt-6">
                <Plus size={16} />
                新建工作流
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workflows.map((wf) => (
                <article
                  key={wf.id}
                  onClick={() => onOpen(wf.id)}
                  className="app-card-soft group cursor-pointer p-5 transition hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(wf.id)}
                        onChange={(e) => handleToggleSelect(wf.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 rounded border-[var(--app-border-strong)] bg-transparent text-[var(--app-accent-strong)] focus:ring-[var(--app-accent)]"
                      />
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-3 text-[var(--app-accent)]">
                        <Workflow size={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-[var(--app-text)]">{wf.name}</h3>
                        <p className="app-muted mt-2 line-clamp-2 min-h-[3rem] text-sm leading-6">
                          {wf.description || '暂无描述'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, wf.id, wf.name)}
                      className="rounded-full p-2 text-[var(--app-text-muted)] transition hover:bg-[rgba(244,107,122,0.08)] hover:text-[var(--app-danger)]"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 text-xs text-[var(--app-text-soft)]">
                    <span className="app-pill">
                      <Workflow size={12} />
                      {wf.column_count} 个步骤
                    </span>
                    <span className="app-pill">
                      <Clock size={12} />
                      {wf.id.split('_')[1] ? formatTime(parseInt(wf.id.split('_')[1], 10)) : ''}
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

function formatTime(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return ''
  const d = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}
