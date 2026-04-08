import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import {
  addProvider,
  deleteProvider,
  getAIEditProvider,
  listProviders,
  setAIEditProvider,
  setDefaultProvider,
  testConnection,
  updateProvider,
  type ProviderResponse,
} from '@/api/client'
import { ThemeToggle } from './ui/ThemeToggle'

interface Props {
  onBack: () => void
}

const PRESETS = [
  { name: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '通义千问', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: 'Ollama (本地)', base_url: 'http://localhost:11434/v1', model: 'llama3' },
]

export function SettingsPage({ onBack }: Props) {
  const [providers, setProviders] = useState<ProviderResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null)
  const [aiEditProviderId, setAiEditProviderId] = useState('')
  const [formName, setFormName] = useState('')
  const [formKey, setFormKey] = useState('')
  const [formUrl, setFormUrl] = useState('https://api.openai.com/v1')
  const [formModel, setFormModel] = useState('gpt-4o-mini')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProviders()
    getAIEditProvider().then((result) => setAiEditProviderId(result.provider_id)).catch(() => {})
  }, [])

  const loadProviders = async () => {
    try {
      const data = await listProviders()
      setProviders(data)
    } catch (e) {
      console.error('加载 Provider 列表失败:', e)
    } finally {
      setLoading(false)
    }
  }

  const startAdd = () => {
    setEditingId('new')
    setFormName('')
    setFormKey('')
    setFormUrl('https://api.openai.com/v1')
    setFormModel('gpt-4o-mini')
    setShowKey(false)
    setTestResult(null)
  }

  const startEdit = (provider: ProviderResponse) => {
    setEditingId(provider.id)
    setFormName(provider.name)
    setFormKey('')
    setFormUrl(provider.base_url)
    setFormModel(provider.model)
    setShowKey(false)
    setTestResult(null)
  }

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setFormName(preset.name)
    setFormUrl(preset.base_url)
    setFormModel(preset.model)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      alert('请输入名称')
      return
    }
    setSaving(true)
    try {
      if (editingId === 'new') {
        if (!formKey) {
          alert('新增 Provider 必须填写 API Key')
          setSaving(false)
          return
        }
        await addProvider({ name: formName, api_key: formKey, base_url: formUrl, model: formModel })
      } else {
        await updateProvider(editingId!, { name: formName, api_key: formKey, base_url: formUrl, model: formModel })
      }
      setEditingId(null)
      await loadProviders()
    } catch (error) {
      alert(`保存失败: ${error}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除「${name}」？`)) return
    try {
      await deleteProvider(id)
      await loadProviders()
      if (editingId === id) setEditingId(null)
    } catch (error) {
      alert(`删除失败: ${error}`)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultProvider(id)
      await loadProviders()
    } catch (error) {
      alert(`操作失败: ${error}`)
    }
  }

  const handleTest = async (providerId: string) => {
    setTestingId(providerId)
    setTestResult(null)
    const isEditingThis = editingId === providerId || (editingId === 'new' && providerId === 'new')
    try {
      const result = await testConnection(
        isEditingThis
          ? { api_key: formKey || '', base_url: formUrl, model: formModel, provider_id: providerId === 'new' ? '' : providerId }
          : { base_url: '', model: '', provider_id: providerId },
      )
      setTestResult({ id: providerId, success: result.success, message: result.message })
    } catch (error) {
      setTestResult({ id: providerId, success: false, message: `请求失败: ${error}` })
    } finally {
      setTestingId(null)
    }
  }

  if (loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <Loader2 size={26} className="animate-spin text-[var(--app-accent)]" />
      </div>
    )
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
              <div className="app-kicker">Settings / model providers</div>
              <h1 className="app-section-title text-2xl">设置</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={startAdd} disabled={editingId === 'new'} className="app-button app-button-primary disabled:opacity-50">
              <Plus size={16} />
              添加 Provider
            </button>
          </div>
        </div>
      </header>

      <main className="app-page py-8">
        <section className="app-card p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="app-kicker mb-3">Model registry</div>
              <h2 className="app-section-title text-3xl md:text-4xl">管理所有 OpenAI 兼容 Provider</h2>
              <p className="app-muted mt-4 max-w-2xl text-sm leading-8">
                Flow、Agent 和 AI 编辑能力都依赖这里的 Provider。这里不是普通配置页，而是整套系统的模型入口层。
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="app-stat">
                <div className="app-kicker mb-2">Providers</div>
                <div className="text-3xl font-semibold text-[var(--app-text)]">{providers.length}</div>
                <p className="app-muted mt-2 text-sm">已接入模型源</p>
              </div>
              <div className="app-stat">
                <div className="app-kicker mb-2">AI Edit</div>
                <div className="text-lg font-semibold text-[var(--app-text)]">{aiEditProviderId ? '独立指定' : '跟随默认'}</div>
                <p className="app-muted mt-2 text-sm">AI 编辑可使用单独 Provider</p>
              </div>
            </div>
          </div>
        </section>

        {editingId === 'new' && (
          <section className="mt-6">
            <ProviderForm
              title="添加新 Provider"
              formName={formName}
              formKey={formKey}
              formUrl={formUrl}
              formModel={formModel}
              showKey={showKey}
              saving={saving}
              isNew
              testingId={testingId}
              testResult={testResult?.id === 'new' ? testResult : null}
              onNameChange={setFormName}
              onKeyChange={setFormKey}
              onUrlChange={setFormUrl}
              onModelChange={setFormModel}
              onToggleKey={() => setShowKey(!showKey)}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
              onTest={() => handleTest('new')}
              onPreset={applyPreset}
            />
          </section>
        )}

        <section className="mt-6 space-y-4">
          {providers.length === 0 && editingId !== 'new' ? (
            <div className="app-card p-12 text-center">
              <div className="app-kicker mb-3">No providers yet</div>
              <h3 className="app-section-title text-3xl">还没有配置 Provider</h3>
              <p className="app-muted mt-4 text-sm leading-8">先接入一个模型服务，整套 Flow / Agent 系统才能开始工作。</p>
            </div>
          ) : (
            providers.map((provider) => (
              editingId === provider.id ? (
                <ProviderForm
                  key={provider.id}
                  title={`编辑: ${provider.name}`}
                  formName={formName}
                  formKey={formKey}
                  formUrl={formUrl}
                  formModel={formModel}
                  showKey={showKey}
                  saving={saving}
                  isNew={false}
                  testingId={testingId}
                  testResult={testResult?.id === provider.id ? testResult : null}
                  onNameChange={setFormName}
                  onKeyChange={setFormKey}
                  onUrlChange={setFormUrl}
                  onModelChange={setFormModel}
                  onToggleKey={() => setShowKey(!showKey)}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                  onTest={() => handleTest(provider.id)}
                  onPreset={applyPreset}
                  existingKeyHint={provider.api_key_set}
                />
              ) : (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  testingId={testingId}
                  testResult={testResult?.id === provider.id ? testResult : null}
                  onEdit={() => startEdit(provider)}
                  onDelete={() => handleDelete(provider.id, provider.name)}
                  onSetDefault={() => handleSetDefault(provider.id)}
                  onTest={() => handleTest(provider.id)}
                />
              )
            ))
          )}
        </section>

        {providers.length > 0 && (
          <section className="app-card-soft mt-6 p-5">
            <div className="app-kicker mb-2">AI edit provider</div>
            <h3 className="text-xl font-semibold text-[var(--app-text)]">给 AI 编辑单独指定模型</h3>
            <p className="app-muted mt-3 text-sm leading-7">建议给 AI 编辑分配能力更强的模型，避免和日常运行模型混用。</p>
            <select
              className="app-input mt-4"
              value={aiEditProviderId}
              onChange={async (e) => {
                const newId = e.target.value
                setAiEditProviderId(newId)
                try {
                  await setAIEditProvider(newId)
                } catch (error) {
                  alert(`设置失败: ${error}`)
                }
              }}
            >
              <option value="">跟随默认 Provider</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.model}){provider.is_default ? ' (默认)' : ''}
                </option>
              ))}
            </select>
          </section>
        )}

        <section className="app-card-soft mt-6 p-5">
          <div className="app-kicker mb-2">Compatibility note</div>
          <p className="app-muted text-sm leading-7">
            Tweak 支持所有兼容 OpenAI API 格式的服务商，包括 DeepSeek、通义千问、智谱、月之暗面和 Ollama 本地部署。
            你可以同时添加多个 Provider，在工作流 AI 块和 Agent 中分别选择。
          </p>
        </section>
      </main>
    </div>
  )
}

function ProviderCard({
  provider,
  testingId,
  testResult,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
}: {
  provider: ProviderResponse
  testingId: string | null
  testResult: { success: boolean; message: string } | null
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  onTest: () => void
}) {
  const isTesting = testingId === provider.id

  return (
    <article className="app-card-soft p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-[var(--app-text)]">{provider.name}</h3>
            {provider.is_default && (
              <span className="app-pill">
                <Star size={12} />
                默认
              </span>
            )}
          </div>
          <p className="app-muted mt-2 text-sm leading-7">{provider.model} · {provider.base_url}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={onTest} disabled={isTesting} className="app-button app-button-ghost">
            {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            测试
          </button>
          {!provider.is_default && (
            <button onClick={onSetDefault} className="app-button app-button-secondary">
              <Star size={14} />
              设为默认
            </button>
          )}
          <button onClick={onEdit} className="app-button app-button-ghost">
            <Pencil size={14} />
            编辑
          </button>
          <button onClick={onDelete} className="app-button app-button-danger">
            <Trash2 size={14} />
            删除
          </button>
        </div>
      </div>

      {testResult && (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
          testResult.success
            ? 'border-[rgba(62,207,142,0.25)] bg-[rgba(62,207,142,0.08)] text-[var(--app-success)]'
            : 'border-[rgba(244,107,122,0.25)] bg-[rgba(244,107,122,0.08)] text-[var(--app-danger)]'
        }`}>
          <div className="flex items-start gap-2">
            {testResult.success ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        </div>
      )}
    </article>
  )
}

function ProviderForm({
  title,
  formName,
  formKey,
  formUrl,
  formModel,
  showKey,
  saving,
  isNew,
  testingId,
  testResult,
  existingKeyHint,
  onNameChange,
  onKeyChange,
  onUrlChange,
  onModelChange,
  onToggleKey,
  onSave,
  onCancel,
  onTest,
  onPreset,
}: {
  title: string
  formName: string
  formKey: string
  formUrl: string
  formModel: string
  showKey: boolean
  saving: boolean
  isNew: boolean
  testingId: string | null
  testResult: { success: boolean; message: string } | null
  existingKeyHint?: boolean
  onNameChange: (value: string) => void
  onKeyChange: (value: string) => void
  onUrlChange: (value: string) => void
  onModelChange: (value: string) => void
  onToggleKey: () => void
  onSave: () => void
  onCancel: () => void
  onTest: () => void
  onPreset: (preset: (typeof PRESETS)[0]) => void
}) {
  return (
    <div className="app-card p-6 md:p-8">
      <div className="mb-6">
        <div className="app-kicker mb-2">Provider editor</div>
        <h3 className="app-section-title text-2xl">{title}</h3>
      </div>

      <div className="mb-5">
        <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">快速填充</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => onPreset(preset)}
              className="app-button app-button-ghost"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">名称</label>
          <input className="app-input" value={formName} onChange={(e) => onNameChange(e.target.value)} placeholder="例如 GPT-4o-mini" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">模型名称</label>
          <input className="app-input" value={formModel} onChange={(e) => onModelChange(e.target.value)} placeholder="gpt-4o-mini" />
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              className="app-input pr-12"
              value={formKey}
              onChange={(e) => onKeyChange(e.target.value)}
              placeholder={existingKeyHint ? '已配置，留空保持不变' : '输入 API Key'}
            />
            <button onClick={onToggleKey} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]">
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">API Base URL</label>
          <input className="app-input" value={formUrl} onChange={(e) => onUrlChange(e.target.value)} placeholder="https://api.openai.com/v1" />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--app-border)] pt-5">
        <button onClick={onSave} disabled={saving} className="app-button app-button-primary disabled:opacity-50">
          {saving ? '保存中...' : isNew ? '添加' : '保存修改'}
        </button>
        <button onClick={onTest} disabled={testingId !== null} className="app-button app-button-secondary disabled:opacity-50">
          {testingId !== null ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          测试连接
        </button>
        <button onClick={onCancel} className="app-button app-button-ghost">取消</button>
      </div>

      {testResult && (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
          testResult.success
            ? 'border-[rgba(62,207,142,0.25)] bg-[rgba(62,207,142,0.08)] text-[var(--app-success)]'
            : 'border-[rgba(244,107,122,0.25)] bg-[rgba(244,107,122,0.08)] text-[var(--app-danger)]'
        }`}>
          <div className="flex items-start gap-2">
            {testResult.success ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}
