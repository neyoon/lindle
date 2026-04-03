/**
 * 设置页面 - 多 LLM Provider 管理
 *
 * 功能:
 * - 添加 / 编辑 / 删除多个 LLM Provider
 * - 设置默认 Provider
 * - 测试连接
 * - 快速选择预设 (OpenAI / DeepSeek / 通义千问 / Ollama)
 */
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Star,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Pencil,
  Zap,
} from 'lucide-react'
import {
  listProviders,
  addProvider,
  updateProvider,
  deleteProvider,
  setDefaultProvider,
  testConnection,
  getAIEditProvider,
  setAIEditProvider,
  type ProviderResponse,
} from '@/api/client'

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
  const [editingId, setEditingId] = useState<string | null>(null) // null = 不编辑, 'new' = 新增
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null)

  // AI 编辑 Provider
  const [aiEditProviderId, setAiEditProviderId] = useState('')

  // 表单状态
  const [formName, setFormName] = useState('')
  const [formKey, setFormKey] = useState('')
  const [formUrl, setFormUrl] = useState('https://api.openai.com/v1')
  const [formModel, setFormModel] = useState('gpt-4o-mini')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProviders()
    getAIEditProvider()
      .then((r) => setAiEditProviderId(r.provider_id))
      .catch(() => {})
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

  // 打开新增表单
  const startAdd = () => {
    setEditingId('new')
    setFormName('')
    setFormKey('')
    setFormUrl('https://api.openai.com/v1')
    setFormModel('gpt-4o-mini')
    setShowKey(false)
    setTestResult(null)
  }

  // 打开编辑表单
  const startEdit = (p: ProviderResponse) => {
    setEditingId(p.id)
    setFormName(p.name)
    setFormKey('') // 不回显真实 key
    setFormUrl(p.base_url)
    setFormModel(p.model)
    setShowKey(false)
    setTestResult(null)
  }

  // 应用预设
  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setFormName(preset.name)
    setFormUrl(preset.base_url)
    setFormModel(preset.model)
  }

  // 保存
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
    } catch (e) {
      alert(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  // 删除
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除「${name}」？`)) return
    try {
      await deleteProvider(id)
      await loadProviders()
      if (editingId === id) setEditingId(null)
    } catch (e) {
      alert(`删除失败: ${e}`)
    }
  }

  // 设为默认
  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultProvider(id)
      await loadProviders()
    } catch (e) {
      alert(`操作失败: ${e}`)
    }
  }

  // 测试连接
  const handleTest = async (providerId: string) => {
    setTestingId(providerId)
    setTestResult(null)

    // 如果在编辑模式，用表单数据测试
    const isEditingThis = editingId === providerId || (editingId === 'new' && providerId === 'new')
    try {
      const result = await testConnection(
        isEditingThis
          ? { api_key: formKey || '', base_url: formUrl, model: formModel, provider_id: providerId === 'new' ? '' : providerId }
          : { base_url: '', model: '', provider_id: providerId }
      )
      setTestResult({ id: providerId, success: result.success, message: result.message })
    } catch (e) {
      setTestResult({ id: providerId, success: false, message: `请求失败: ${e}` })
    } finally {
      setTestingId(null)
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={24} className="animate-spin text-sky-500" />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* 顶栏 */}
      <div className="h-14 bg-white border-b px-6 flex items-center gap-3 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-sky-600 transition"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <span className="text-gray-200">|</span>
        <h1 className="text-lg font-bold text-sky-600">设置</h1>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* 标题 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">LLM Provider</h2>
              <p className="text-sm text-gray-500 mt-1">
                管理你的大语言模型接口，支持所有 OpenAI 兼容 API
              </p>
            </div>
            {providers.length > 0 && (
              <button
                onClick={startAdd}
                disabled={editingId === 'new'}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-lg transition"
              >
                <Plus size={16} />
                添加 Provider
              </button>
            )}
          </div>

          {/* 新增表单 */}
          {editingId === 'new' && (
            <ProviderForm
              title="添加新 Provider"
              formName={formName}
              formKey={formKey}
              formUrl={formUrl}
              formModel={formModel}
              showKey={showKey}
              saving={saving}
              isNew={true}
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
          )}

          {/* Provider 列表 */}
          {providers.length === 0 && editingId !== 'new' ? (
            <div className="text-center py-16">
              <div className="text-lg text-gray-400 mb-4">尚未配置</div>
              <p className="text-gray-500 text-lg mb-2">还没有配置 Provider</p>
              <p className="text-gray-400 text-sm mb-6">添加一个 LLM Provider 以开始使用 AI 功能</p>
              <button
                onClick={startAdd}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition font-medium"
              >
                <Plus size={16} />
                添加 Provider
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((p) =>
                editingId === p.id ? (
                  <ProviderForm
                    key={p.id}
                    title={`编辑: ${p.name}`}
                    formName={formName}
                    formKey={formKey}
                    formUrl={formUrl}
                    formModel={formModel}
                    showKey={showKey}
                    saving={saving}
                    isNew={false}
                    testingId={testingId}
                    testResult={testResult?.id === p.id ? testResult : null}
                    onNameChange={setFormName}
                    onKeyChange={setFormKey}
                    onUrlChange={setFormUrl}
                    onModelChange={setFormModel}
                    onToggleKey={() => setShowKey(!showKey)}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                    onTest={() => handleTest(p.id)}
                    onPreset={applyPreset}
                    existingKeyHint={p.api_key_set}
                  />
                ) : (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    testingId={testingId}
                    testResult={testResult?.id === p.id ? testResult : null}
                    onEdit={() => startEdit(p)}
                    onDelete={() => handleDelete(p.id, p.name)}
                    onSetDefault={() => handleSetDefault(p.id)}
                    onTest={() => handleTest(p.id)}
                  />
                ),
              )}
            </div>
          )}

          {/* AI 编辑专用 Provider */}
          {providers.length > 0 && (
            <div className="mt-8 bg-white rounded-xl border-2 border-violet-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-sm">
                  AI
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-violet-700">AI 编辑 Provider</h3>
                  <p className="text-xs text-gray-400">用于「AI 编辑」功能的大模型，建议选择能力较强的模型</p>
                </div>
              </div>
              <select
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                value={aiEditProviderId}
                onChange={async (e) => {
                  const newId = e.target.value
                  setAiEditProviderId(newId)
                  try {
                    await setAIEditProvider(newId)
                  } catch (err) {
                    alert(`设置失败: ${err}`)
                  }
                }}
              >
                <option value="">跟随默认 Provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model}){p.is_default ? ' (默认)' : ''}
                  </option>
                ))}
              </select>
              {aiEditProviderId && (
                <p className="text-[10px] text-gray-400 mt-1.5">
                  已选择: {providers.find((p) => p.id === aiEditProviderId)?.name || aiEditProviderId}
                </p>
              )}
            </div>
          )}

          {/* 提示 */}
          <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm text-amber-800 font-medium mb-1">兼容提示</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Tweak 支持所有兼容 OpenAI API 格式的服务商，包括 DeepSeek、通义千问、智谱、月之暗面、Ollama 本地部署等。
              你可以添加多个 Provider，在创建 AI 块时选择使用哪一个。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== Provider 卡片 =====

function ProviderCard({
  provider: p,
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
  const isTesting = testingId === p.id

  return (
    <div
      className={`bg-white rounded-xl border-2 p-4 transition ${
        p.is_default ? 'border-sky-300 shadow-sm' : 'border-gray-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
              p.is_default ? 'bg-sky-100' : 'bg-gray-100'
            }`}
          >
            LLM
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-800">{p.name}</h3>
              {p.is_default && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium text-sky-600 bg-sky-100 rounded">
                  默认
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {p.model} · {p.base_url}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onTest}
            disabled={isTesting}
            className="p-2 text-gray-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition"
            title="测试连接"
          >
            {isTesting ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
          </button>
          {!p.is_default && (
            <button
              onClick={onSetDefault}
              className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
              title="设为默认"
            >
              <Star size={15} />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-2 text-gray-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition"
            title="编辑"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
            title="删除"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div
          className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
            testResult.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {testResult.success ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}
    </div>
  )
}

// ===== Provider 编辑表单 =====

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
  onNameChange: (v: string) => void
  onKeyChange: (v: string) => void
  onUrlChange: (v: string) => void
  onModelChange: (v: string) => void
  onToggleKey: () => void
  onSave: () => void
  onCancel: () => void
  onTest: () => void
  onPreset: (p: (typeof PRESETS)[0]) => void
}) {
  return (
    <div className="bg-white rounded-xl border-2 border-sky-300 p-5 mb-3 shadow-sm">
      <h3 className="text-sm font-semibold text-sky-700 mb-4">{title}</h3>

      {/* 快速选择 */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1.5">快速填充</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => onPreset(p)}
              className={`px-2.5 py-1 text-xs rounded-md border transition ${
                formUrl === p.base_url && formModel === p.model
                  ? 'border-sky-400 bg-sky-50 text-sky-700'
                  : 'border-gray-200 text-gray-500 hover:border-sky-300'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 名称 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">名称</label>
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            value={formName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="例: GPT-4o-mini"
          />
        </div>

        {/* 模型 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 font-mono"
            value={formModel}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </div>

        {/* API Key */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 font-mono"
              value={formKey}
              onChange={(e) => onKeyChange(e.target.value)}
              placeholder={existingKeyHint ? '已配置（留空保持不变）' : '输入 API Key'}
            />
            <button
              onClick={onToggleKey}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">API Base URL</label>
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 font-mono"
            value={formUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </div>
      </div>

      {/* 按钮 */}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-lg transition"
        >
          {saving ? '保存中...' : isNew ? '添加' : '保存修改'}
        </button>
        <button
          onClick={onTest}
          disabled={testingId !== null}
          className="px-4 py-2 text-sm font-medium text-sky-600 border border-sky-300 hover:bg-sky-50 disabled:opacity-50 rounded-lg transition flex items-center gap-1.5"
        >
          {testingId !== null ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              测试中...
            </>
          ) : (
            <>
              <Zap size={14} />
              测试连接
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
        >
          取消
        </button>
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div
          className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
            testResult.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {testResult.success ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}
    </div>
  )
}
