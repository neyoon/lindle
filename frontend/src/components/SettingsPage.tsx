import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
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
import { getAppPreferences, saveAppPreferences, type AppPreferences } from '@/utils/preferences'
import {
  addProvider,
  deleteProvider,
  getEditProvider,
  listProxyProtocols,
  listProviders,
  setEditProvider,
  setDefaultProvider,
  testConnection,
  updateProvider,
  type ProxyProtocol,
  type ProviderResponse,
} from '@/api/client'

export type SettingsSection = 'general' | 'provider'

interface Props {
  section: SettingsSection
  onBack: () => void
  headerActions?: ReactNode
}

const FALLBACK_PROTOCOLS: ProxyProtocol[] = [
  { id: 'openai', name: 'OpenAI 兼容', status: 'active', description: '' },
  { id: 'anthropic', name: 'Anthropic', status: 'active', description: '' },
  { id: 'gemini', name: 'Google Gemini', status: 'active', description: '' },
  { id: 'azure', name: 'Azure OpenAI', status: 'active', description: '' },
]

const PRESETS = [
  { name: 'OpenAI', protocol: 'openai', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', api_version: '' },
  { name: 'DeepSeek', protocol: 'openai', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', api_version: '' },
  { name: '通义千问', protocol: 'openai', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', api_version: '' },
  { name: 'Claude', protocol: 'anthropic', base_url: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest', api_version: '' },
  { name: 'Gemini', protocol: 'gemini', base_url: 'https://generativelanguage.googleapis.com', model: 'gemini-1.5-pro', api_version: '' },
  { name: 'Azure OpenAI', protocol: 'azure', base_url: 'https://YOUR-RESOURCE.openai.azure.com', model: 'deployment-name', api_version: '2024-10-21' },
  { name: 'Ollama (本地)', protocol: 'openai', base_url: 'http://localhost:11434/v1', model: 'llama3', api_version: '' },
]

function protocolLabel(protocols: ProxyProtocol[], protocol: string) {
  return protocols.find((option) => option.id === protocol)?.name || protocol || 'OpenAI 兼容'
}

export function SettingsPage({ section, onBack, headerActions }: Props) {
  const [providers, setProviders] = useState<ProviderResponse[]>([])
  const [proxyProtocols, setProxyProtocols] = useState<ProxyProtocol[]>(FALLBACK_PROTOCOLS)
  const [preferences, setPreferences] = useState<AppPreferences>(() => getAppPreferences())
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null)
  const [editProviderId, setEditProviderId] = useState('')
  const [formName, setFormName] = useState('')
  const [formProtocol, setFormProtocol] = useState('openai')
  const [formKey, setFormKey] = useState('')
  const [formUrl, setFormUrl] = useState('https://api.openai.com/v1')
  const [formModel, setFormModel] = useState('gpt-4o-mini')
  const [formApiVersion, setFormApiVersion] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (section !== 'provider') {
      setLoading(false)
      return
    }
    loadProviders()
    getEditProvider().then((result) => setEditProviderId(result.provider_id)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  useEffect(() => {
    saveAppPreferences(preferences)
  }, [preferences])

  const loadProviders = async () => {
    try {
      const [data, protocols] = await Promise.all([
        listProviders(),
        listProxyProtocols().catch(() => FALLBACK_PROTOCOLS),
      ])
      setProviders(data)
      setProxyProtocols(protocols.length ? protocols : FALLBACK_PROTOCOLS)
    } catch (e) {
      console.error('加载 Provider 列表失败:', e)
    } finally {
      setLoading(false)
    }
  }

  const startAdd = () => {
    setEditingId('new')
    setFormName('')
    setFormProtocol('openai')
    setFormKey('')
    setFormUrl('https://api.openai.com/v1')
    setFormModel('gpt-4o-mini')
    setFormApiVersion('')
    setShowKey(false)
    setTestResult(null)
  }

  const startEdit = (provider: ProviderResponse) => {
    setEditingId(provider.id)
    setFormName(provider.name)
    setFormProtocol(provider.protocol || 'openai')
    setFormKey('')
    setFormUrl(provider.base_url)
    setFormModel(provider.model)
    setFormApiVersion(provider.api_version || '')
    setShowKey(false)
    setTestResult(null)
  }

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setFormName(preset.name)
    setFormProtocol(preset.protocol)
    setFormUrl(preset.base_url)
    setFormModel(preset.model)
    setFormApiVersion(preset.api_version)
  }

  const updatePreference = <K extends keyof AppPreferences,>(key: K, value: AppPreferences[K]) => {
    setPreferences((prev) => ({ ...prev, [key]: value }))
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
        await addProvider({ name: formName, protocol: formProtocol, api_key: formKey, base_url: formUrl, model: formModel, api_version: formApiVersion })
      } else {
        await updateProvider(editingId!, { name: formName, protocol: formProtocol, api_key: formKey, base_url: formUrl, model: formModel, api_version: formApiVersion })
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
          ? { protocol: formProtocol, api_key: formKey || '', base_url: formUrl, model: formModel, provider_id: providerId === 'new' ? '' : providerId, api_version: formApiVersion }
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

  const headerKicker = section === 'general' ? 'Settings / general preferences' : 'Settings / model providers'
  const headerTitle = section === 'general' ? '设置' : 'Provider'

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
              <div className="app-kicker">{headerKicker}</div>
              <h1 className="app-section-title text-2xl">{headerTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {section === 'provider' && (
              <button onClick={startAdd} disabled={editingId === 'new'} className="app-button app-button-primary disabled:opacity-50">
                <Plus size={16} />
                添加 Provider
              </button>
            )}
            {headerActions}
          </div>
        </div>
      </header>

      <main className="app-page py-8">
        {section === 'general' ? (
          <GeneralSettingsSection preferences={preferences} updatePreference={updatePreference} />
        ) : (
          <ProviderSettingsSection
            providers={providers}
            proxyProtocols={proxyProtocols}
            editProviderId={editProviderId}
            setEditProviderId={setEditProviderId}
            editingId={editingId}
            setEditingId={setEditingId}
            formName={formName}
            formProtocol={formProtocol}
            formKey={formKey}
            formUrl={formUrl}
            formModel={formModel}
            formApiVersion={formApiVersion}
            showKey={showKey}
            saving={saving}
            testingId={testingId}
            testResult={testResult}
            setFormName={setFormName}
            setFormProtocol={setFormProtocol}
            setFormKey={setFormKey}
            setFormUrl={setFormUrl}
            setFormModel={setFormModel}
            setFormApiVersion={setFormApiVersion}
            setShowKey={setShowKey}
            handleSave={handleSave}
            handleDelete={handleDelete}
            handleSetDefault={handleSetDefault}
            handleTest={handleTest}
            startEdit={startEdit}
            applyPreset={applyPreset}
          />
        )}
      </main>
    </div>
  )
}

function GeneralSettingsSection({
  preferences,
  updatePreference,
}: {
  preferences: AppPreferences
  updatePreference: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => void
}) {
  return (
    <section className="app-card p-6 md:p-8">
      <div className="app-kicker mb-3">General settings</div>
      <h2 className="app-section-title text-3xl md:text-4xl">总体设置</h2>
      <p className="app-muted mt-4 text-sm leading-8">
        管理当前工作区的基础体验与默认执行策略。
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ReadonlyPreference label="界面语言" value="简体中文" />
        <ReadonlyPreference label="视觉风格" value="纸墨默认" />
      </div>

      <div className="mt-6 space-y-3">
        <PreferenceToggle
          title="默认失败即停"
          description="新建 Flow 默认在任一步骤报错时停止执行。当前默认开启。"
          checked={preferences.defaultStopOnError}
          onChange={(checked) => updatePreference('defaultStopOnError', checked)}
        />
      </div>
    </section>
  )
}

function ReadonlyPreference({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">{label}</label>
      <div className="app-input flex items-center justify-between bg-[var(--app-panel-soft)] text-[var(--app-text-soft)]">
        <span>{value}</span>
        <span className="app-pill text-[0.65rem]">固定</span>
      </div>
    </div>
  )
}

function ProviderSettingsSection({
  providers,
  proxyProtocols,
  editProviderId,
  setEditProviderId,
  editingId,
  setEditingId,
  formName,
  formProtocol,
  formKey,
  formUrl,
  formModel,
  formApiVersion,
  showKey,
  saving,
  testingId,
  testResult,
  setFormName,
  setFormProtocol,
  setFormKey,
  setFormUrl,
  setFormModel,
  setFormApiVersion,
  setShowKey,
  handleSave,
  handleDelete,
  handleSetDefault,
  handleTest,
  startEdit,
  applyPreset,
}: {
  providers: ProviderResponse[]
  proxyProtocols: ProxyProtocol[]
  editProviderId: string
  setEditProviderId: (value: string) => void
  editingId: string | null
  setEditingId: (value: string | null) => void
  formName: string
  formProtocol: string
  formKey: string
  formUrl: string
  formModel: string
  formApiVersion: string
  showKey: boolean
  saving: boolean
  testingId: string | null
  testResult: { id: string; success: boolean; message: string } | null
  setFormName: (value: string) => void
  setFormProtocol: (value: string) => void
  setFormKey: (value: string) => void
  setFormUrl: (value: string) => void
  setFormModel: (value: string) => void
  setFormApiVersion: (value: string) => void
  setShowKey: (fn: (prev: boolean) => boolean) => void
  handleSave: () => Promise<void>
  handleDelete: (id: string, name: string) => Promise<void>
  handleSetDefault: (id: string) => Promise<void>
  handleTest: (providerId: string) => Promise<void>
  startEdit: (provider: ProviderResponse) => void
  applyPreset: (preset: (typeof PRESETS)[0]) => void
}) {
  return (
    <>
      <section className="app-card p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="app-kicker mb-3">Provider</div>
            <h2 className="app-section-title text-3xl md:text-4xl">管理所有模型 Provider</h2>
            <p className="app-muted mt-4 max-w-2xl text-sm leading-8">
              Lindle 的 Flow、Agent 和编辑能力都依赖这里的 Provider。
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="app-stat">
              <div className="app-kicker mb-2">Providers</div>
              <div className="text-3xl font-semibold text-[var(--app-text)]">{providers.length}</div>
              <p className="app-muted mt-2 text-sm">已接入模型源</p>
            </div>
            <div className="app-stat">
              <div className="app-kicker mb-2">Edit</div>
              <div className="text-lg font-semibold text-[var(--app-text)]">{editProviderId ? '独立指定' : '跟随默认'}</div>
              <p className="app-muted mt-2 text-sm">编辑可使用单独 Provider</p>
            </div>
          </div>
        </div>
      </section>

      {editingId === 'new' && (
        <section className="mt-6">
          <ProviderForm
            title="添加新 Provider"
            proxyProtocols={proxyProtocols}
            formName={formName}
            formProtocol={formProtocol}
            formKey={formKey}
            formUrl={formUrl}
            formModel={formModel}
            formApiVersion={formApiVersion}
            showKey={showKey}
            saving={saving}
            isNew
            testingId={testingId}
            testResult={testResult?.id === 'new' ? testResult : null}
            onNameChange={setFormName}
            onProtocolChange={setFormProtocol}
            onKeyChange={setFormKey}
            onUrlChange={setFormUrl}
            onModelChange={setFormModel}
            onApiVersionChange={setFormApiVersion}
            onToggleKey={() => setShowKey((prev) => !prev)}
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
                proxyProtocols={proxyProtocols}
                formName={formName}
                formProtocol={formProtocol}
                formKey={formKey}
                formUrl={formUrl}
                formModel={formModel}
                formApiVersion={formApiVersion}
                showKey={showKey}
                saving={saving}
                isNew={false}
                testingId={testingId}
                testResult={testResult?.id === provider.id ? testResult : null}
                onNameChange={setFormName}
                onProtocolChange={setFormProtocol}
                onKeyChange={setFormKey}
                onUrlChange={setFormUrl}
                onModelChange={setFormModel}
                onApiVersionChange={setFormApiVersion}
                onToggleKey={() => setShowKey((prev) => !prev)}
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
                proxyProtocols={proxyProtocols}
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
          <div className="app-kicker mb-2">Edit provider</div>
          <h3 className="text-xl font-semibold text-[var(--app-text)]">给编辑单独指定模型</h3>
          <p className="app-muted mt-3 text-sm leading-7">建议给编辑分配能力更强的模型，避免和日常运行模型混用。</p>
          <select
            className="app-input mt-4"
            value={editProviderId}
            onChange={async (e) => {
              const newId = e.target.value
              setEditProviderId(newId)
              try {
                await setEditProvider(newId)
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
          Lindle 支持 OpenAI 兼容、Anthropic、Gemini 与 Azure OpenAI 协议。你可以同时添加多个不同来源的 Provider，
          在工作流 AI 块和 Agent 中分别选择。
        </p>
      </section>
    </>
  )
}

function PreferenceToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="app-card-soft flex cursor-pointer items-start justify-between gap-4 p-4">
      <div>
        <div className="text-base font-medium text-[var(--app-text)]">{title}</div>
        <p className="app-muted mt-2 text-sm leading-7">{description}</p>
      </div>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--app-accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

function ProviderCard({
  provider,
  proxyProtocols,
  testingId,
  testResult,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
}: {
  provider: ProviderResponse
  proxyProtocols: ProxyProtocol[]
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
          <p className="app-muted mt-2 text-sm leading-7">
            {protocolLabel(proxyProtocols, provider.protocol)} · {provider.model} · {provider.base_url}
            {provider.api_version ? ` · ${provider.api_version}` : ''}
          </p>
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
        <div className={`mt-4 rounded-sm border px-4 py-3 text-sm ${
          testResult.success
            ? 'border-[var(--moss-soft)] bg-[var(--moss-soft)] text-[var(--app-success)]'
            : 'border-[var(--bruise-soft)] bg-[var(--bruise-soft)] text-[var(--app-danger)]'
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
  proxyProtocols,
  formName,
  formProtocol,
  formKey,
  formUrl,
  formModel,
  formApiVersion,
  showKey,
  saving,
  isNew,
  testingId,
  testResult,
  existingKeyHint,
  onNameChange,
  onProtocolChange,
  onKeyChange,
  onUrlChange,
  onModelChange,
  onApiVersionChange,
  onToggleKey,
  onSave,
  onCancel,
  onTest,
  onPreset,
}: {
  title: string
  proxyProtocols: ProxyProtocol[]
  formName: string
  formProtocol: string
  formKey: string
  formUrl: string
  formModel: string
  formApiVersion: string
  showKey: boolean
  saving: boolean
  isNew: boolean
  testingId: string | null
  testResult: { success: boolean; message: string } | null
  existingKeyHint?: boolean
  onNameChange: (value: string) => void
  onProtocolChange: (value: string) => void
  onKeyChange: (value: string) => void
  onUrlChange: (value: string) => void
  onModelChange: (value: string) => void
  onApiVersionChange: (value: string) => void
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
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">协议</label>
          <select className="app-input" value={formProtocol} onChange={(e) => onProtocolChange(e.target.value)}>
            {proxyProtocols.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">模型名称</label>
          <input className="app-input" value={formModel} onChange={(e) => onModelChange(e.target.value)} placeholder="gpt-4o-mini" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">API Version</label>
          <input className="app-input" value={formApiVersion} onChange={(e) => onApiVersionChange(e.target.value)} placeholder={formProtocol === 'azure' ? '2024-10-21' : '可留空'} />
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
        <div className={`mt-4 rounded-sm border px-4 py-3 text-sm ${
          testResult.success
            ? 'border-[var(--moss-soft)] bg-[var(--moss-soft)] text-[var(--app-success)]'
            : 'border-[var(--bruise-soft)] bg-[var(--bruise-soft)] text-[var(--app-danger)]'
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
