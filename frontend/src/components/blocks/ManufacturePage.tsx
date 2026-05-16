import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import type { BlockConfig, BlockTemplate, BlockType } from '@/types/workflow'
import type { ProviderResponse } from '@/api/client'
import { createTemplate, deleteTemplate, listProviders, listTemplates, updateTemplate } from '@/api/client'

interface Props {
  onBack: () => void
  headerActions?: ReactNode
}

const TYPE_OPTIONS: { value: BlockType; label: string }[] = [
  { value: 'process', label: '处理' },
  { value: 'collect', label: '收集' },
  { value: 'result', label: '结果' },
]

function generateTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function ManufacturePage({ onBack, headerActions }: Props) {
  const [templates, setTemplates] = useState<BlockTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BlockTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const loadAll = async () => {
    try {
      const data = await listTemplates()
      setTemplates(data)
    } catch (e) {
      console.error('加载模板失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const handleSave = async (template: BlockTemplate) => {
    try {
      if (editing) {
        await updateTemplate(template.id, template)
      } else {
        await createTemplate(template)
      }
      await loadAll()
      setEditing(null)
      setIsCreating(false)
    } catch (error) {
      alert(`保存失败: ${error}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此模板？删除后不可恢复。')) return
    try {
      await deleteTemplate(id)
      await loadAll()
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
              <div className="app-kicker">Manufacture / reusable blocks</div>
              <h1 className="app-section-title text-2xl">制造工坊</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isCreating && !editing && (
              <button onClick={() => setIsCreating(true)} className="app-button app-button-primary">
                <Plus size={16} />
                新建模板
              </button>
            )}
            {headerActions}
          </div>
        </div>
      </header>

      <main className="app-page py-8">
        <section className="app-card p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="app-kicker mb-3">Step manufacture</div>
              <h2 className="app-section-title text-3xl md:text-4xl">步骤模板</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="app-stat">
                <div className="app-kicker mb-2">Templates</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">{templates.length}</div>
                <p className="app-muted mt-2 text-sm">模板数量</p>
              </div>
              <div className="app-stat">
                <div className="app-kicker mb-2">Type</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">Step</div>
                <p className="app-muted mt-2 text-sm">步骤</p>
              </div>
            </div>
          </div>
        </section>

        {(isCreating || editing) && (
          <section className="mt-6">
            <TemplateForm
              initial={editing}
              onSave={handleSave}
              onCancel={() => {
                setIsCreating(false)
                setEditing(null)
              }}
            />
          </section>
        )}

        <section className="mt-6">
          {loading ? (
            <div className="app-card p-12 text-center text-[var(--app-text-soft)]">加载中...</div>
          ) : templates.length === 0 && !isCreating ? (
            <div className="app-card p-12 text-center">
              <div className="app-kicker mb-3">No templates yet</div>
              <h3 className="app-section-title text-3xl">暂无模板</h3>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={() => {
                    setEditing(template)
                    setIsCreating(false)
                  }}
                  onDelete={() => handleDelete(template.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: BlockTemplate
  onEdit: () => void
  onDelete: () => void
}) {
  const typeLabel = TYPE_OPTIONS.find((option) => option.value === template.type)?.label || template.type

  return (
    <article className="app-card-soft group p-5">
      <div className="text-3xl" style={{ fontFamily: 'Fraunces, serif' }}>{template.icon || '[]'}</div>
      <h3 className="mt-4 text-lg font-medium text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>{template.name}</h3>
      <p className="app-muted mt-2 min-h-[3rem] text-sm leading-7">{template.description || '无描述'}</p>
      <span className="app-pill mt-4">{typeLabel}</span>
      <div className="mt-5 flex gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
        <button onClick={onEdit} className="app-button app-button-ghost">
          <Pencil size={14} />
          编辑
        </button>
        <button onClick={onDelete} className="app-button app-button-danger">
          <Trash2 size={14} />
          删除
        </button>
      </div>
    </article>
  )
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: BlockTemplate | null
  onSave: (template: BlockTemplate) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [icon, setIcon] = useState(initial?.icon || '')
  const [type, setType] = useState<BlockType>(initial?.type || 'process')
  const [prompt, setPrompt] = useState(initial?.config.prompt || '')
  const [model, setModel] = useState(initial?.config.model || '')
  const [providers, setProviders] = useState<ProviderResponse[]>([])

  useEffect(() => {
    listProviders().then(setProviders).catch(() => {})
  }, [])

  const handleSubmit = () => {
    if (!name.trim()) {
      alert('请输入模板名称')
      return
    }

    const config: BlockConfig = {}
    if (type === 'process') {
      config.prompt = prompt || null
      config.model = model || null
    } else if (type === 'collect') {
      config.fields = [{ name: 'field_1', label: '输入', field_type: 'text', required: true }]
    }

    onSave({
      id: initial?.id || generateTemplateId(),
      ref: initial?.ref || `${type}_${name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')}`,
      type,
      name: name.trim(),
      description: description.trim(),
      icon,
      config,
      created_at: initial?.created_at || new Date().toISOString(),
    })
  }

  return (
    <div className="app-card p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="app-kicker mb-2">Template editor</div>
          <h3 className="app-section-title text-2xl">{initial ? '编辑模板' : '制造新模板'}</h3>
        </div>
        <button onClick={onCancel} className="app-button app-button-ghost">
          <X size={16} />
          关闭
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">名称 *</label>
          <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如: 生成摘要" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">类型</label>
          <select className="app-input" value={type} onChange={(e) => setType(e.target.value as BlockType)}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">描述</label>
          <input className="app-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述这个模板做什么" />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">图标</label>
          <input className="app-input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="可选，输入图标文本" />
        </div>

        {type === 'process' && (
          <>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">预设提示词</label>
              <textarea className="app-input min-h-[140px] resize-y" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="描述这个处理步骤默认怎么工作" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">LLM Provider</label>
              <select className="app-input" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">默认 Provider</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.protocol || 'openai'} / {provider.model}){provider.is_default ? ' (默认)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--app-border)] pt-5">
        <button onClick={onCancel} className="app-button app-button-ghost">取消</button>
        <button onClick={handleSubmit} className="app-button app-button-primary">
          <Save size={14} />
          {initial ? '保存修改' : '制造完成'}
        </button>
      </div>
    </div>
  )
}
