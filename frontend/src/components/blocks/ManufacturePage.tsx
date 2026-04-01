/**
 * 制造工坊 - 块模板管理页面
 *
 * 创建可复用的自定义块模板（如 "翻译AI"、"数据分析" 等）。
 * 制造完成后，模板会像内置块一样出现在工作流编辑器的添加菜单中。
 */
import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import type { BlockConfig, BlockTemplate, BlockType } from '@/types/workflow'
import type { ProviderResponse } from '@/api/client'
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, listProviders } from '@/api/client'

interface Props {
  onBack: () => void
}

const TYPE_OPTIONS: { value: BlockType; label: string }[] = [
  { value: 'ai', label: 'AI' },
  { value: 'input', label: '输入' },
  { value: 'output', label: '输出' },
]

function generateTemplateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function ManufacturePage({ onBack }: Props) {
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
    } catch (e) {
      alert(`保存失败: ${e}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此模板？删除后不可恢复。')) return
    try {
      await deleteTemplate(id)
      await loadAll()
    } catch (e) {
      alert(`删除失败: ${e}`)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* 顶栏 */}
      <div className="h-14 bg-white border-b px-4 flex items-center gap-3 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-sky-600 transition"
        >
          <ArrowLeft size={16} />
          返回编辑器
        </button>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-bold text-sky-600">制造工坊</h1>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-gray-500 mb-4">
            制造可复用的自定义块模板。制造完成后，它们会像内置块一样出现在工作流编辑器的「添加块」菜单中。
          </p>

          {/* 新建按钮 */}
          {!isCreating && !editing && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition font-medium mb-6"
            >
              <Plus size={16} />
              新建模板
            </button>
          )}

          {/* 编辑/创建表单 */}
          {(isCreating || editing) && (
            <TemplateForm
              initial={editing}
              onSave={handleSave}
              onCancel={() => {
                setIsCreating(false)
                setEditing(null)
              }}
            />
          )}

          {/* 模板列表 */}
          {loading ? (
            <p className="text-gray-400 text-center py-12">加载中...</p>
          ) : templates.length === 0 && !isCreating ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-400 mb-3">暂无模板</p>
              <p className="text-gray-500 text-sm">还没有制造任何模板</p>
              <p className="text-gray-400 text-xs mt-1">点击「新建模板」开始制造你的第一个自定义块</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={() => {
                    setEditing(t)
                    setIsCreating(false)
                  }}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== 模板卡片 =====

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: BlockTemplate
  onEdit: () => void
  onDelete: () => void
}) {
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === template.type)?.label || template.type

  return (
    <div className="bg-white rounded-xl border-2 border-gray-100 hover:border-sky-200 p-4 transition group">
      <div className="text-3xl mb-2">{template.icon}</div>
      <h3 className="font-semibold text-gray-800 text-sm">{template.name}</h3>
      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{template.description || '无描述'}</p>
      <span className="text-[10px] bg-sky-100 text-sky-600 rounded-full px-2 py-0.5 mt-2 inline-block font-medium">
        {typeLabel}
      </span>

      {/* 操作按钮 */}
      <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-sky-600 hover:bg-sky-50 rounded transition"
        >
          <Pencil size={12} />
          编辑
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
        >
          <Trash2 size={12} />
          删除
        </button>
      </div>
    </div>
  )
}

// ===== 模板编辑表单 =====

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
  const [type, setType] = useState<BlockType>(initial?.type || 'ai')
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
    if (type === 'ai') {
      config.prompt = prompt || null
      config.model = model || null
    } else if (type === 'input') {
      config.fields = [{ name: 'input', label: '输入', field_type: 'text', required: true }]
    }

    const template: BlockTemplate = {
      id: initial?.id || generateTemplateId(),
      type,
      name: name.trim(),
      description: description.trim(),
      icon,
      config,
      created_at: initial?.created_at || new Date().toISOString(),
    }
    onSave(template)
  }

  return (
    <div className="bg-white rounded-xl border-2 border-sky-200 p-6 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-sky-700">
          {initial ? '编辑模板' : '制造新模板'}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 名称 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">名称 *</label>
          <input
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: 翻译AI"
          />
        </div>

        {/* 类型 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">类型</label>
          <select
            className="input-field"
            value={type}
            onChange={(e) => setType(e.target.value as BlockType)}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 描述 */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">描述</label>
          <input
            className="input-field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="这个模板做什么..."
          />
        </div>

        {/* 图标 */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">图标</label>
          <input
            className="input-field"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="可选，输入图标文本"
          />
        </div>

        {/* AI 类型特有配置 */}
        {type === 'ai' && (
          <>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">预设提示词</label>
              <textarea
                className="input-field min-h-[100px] resize-y"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="告诉 AI 你想让它做什么..."
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">LLM Provider（可选）</label>
              <select
                className="input-field"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="">默认 Provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model}){p.is_default ? ' (默认)' : ''}
                  </option>
                ))}
              </select>
              {model && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  已选择: {providers.find((p) => p.id === model)?.name || model}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          className="flex items-center gap-1.5 px-5 py-2 text-sm text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition font-medium"
        >
          <Save size={14} />
          {initial ? '保存修改' : '制造完成'}
        </button>
      </div>
    </div>
  )
}
