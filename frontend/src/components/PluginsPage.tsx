/**
 * 插件管理页面
 *
 * 独立页面，展示所有可用插件，支持:
 * - 查看插件列表
 * - 启用/禁用插件
 * - 配置插件参数（如 token）
 */
import { useEffect, useState } from 'react'
import { Power, Settings, Check, X, ArrowLeft } from 'lucide-react'
import type { PluginInfo } from '@/types/workflow'
import { listPlugins, togglePlugin, updatePluginConfig } from '@/api/client'

interface Props {
  onBack: () => void
}

export function PluginsPage({ onBack }: Props) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState<string | null>(null)

  const loadPlugins = async () => {
    try {
      const data = await listPlugins()
      setPlugins(data)
    } catch (e) {
      console.error('加载插件失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlugins()
  }, [])

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    try {
      await togglePlugin(pluginId, enabled)
      setPlugins((prev) =>
        prev.map((p) => (p.meta.id === pluginId ? { ...p, enabled } : p)),
      )
    } catch (e) {
      alert(`操作失败: ${e}`)
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
        <h1 className="text-lg font-bold text-sky-600">插件管理</h1>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm text-gray-500 mb-6">
            启用插件后，它会作为可选的块类型出现在工作流编辑器中。
          </p>

          {loading ? (
            <p className="text-gray-400 text-center py-12">加载中...</p>
          ) : plugins.length === 0 ? (
            <p className="text-gray-400 text-center py-12">暂无可用插件</p>
          ) : (
            <div className="space-y-4">
              {plugins.map((plugin) => (
                <PluginCard
                  key={plugin.meta.id}
                  plugin={plugin}
                  isConfiguring={configuring === plugin.meta.id}
                  onToggle={(enabled) => handleToggle(plugin.meta.id, enabled)}
                  onStartConfig={() => setConfiguring(plugin.meta.id)}
                  onCloseConfig={() => setConfiguring(null)}
                  onSaveConfig={async (config) => {
                    await updatePluginConfig(plugin.meta.id, config)
                    setPlugins((prev) =>
                      prev.map((p) =>
                        p.meta.id === plugin.meta.id ? { ...p, config } : p,
                      ),
                    )
                    setConfiguring(null)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== 插件卡片 =====

function PluginCard({
  plugin,
  isConfiguring,
  onToggle,
  onStartConfig,
  onCloseConfig,
  onSaveConfig,
}: {
  plugin: PluginInfo
  isConfiguring: boolean
  onToggle: (enabled: boolean) => void
  onStartConfig: () => void
  onCloseConfig: () => void
  onSaveConfig: (config: Record<string, string>) => Promise<void>
}) {
  const { meta, enabled, config } = plugin

  return (
    <div
      className={`
        bg-white rounded-xl border-2 p-5 transition
        ${enabled ? 'border-sky-200 shadow-sm' : 'border-gray-100'}
      `}
    >
      <div className="flex items-start justify-between">
        {/* 左侧信息 */}
        <div className="flex items-start gap-3 flex-1">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-800">{meta.name}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{meta.description}</p>
            {enabled && (
              <span className="inline-flex items-center gap-1 mt-2 text-xs text-sky-600 bg-sky-50 rounded-full px-2 py-0.5">
                <Check size={12} />
                已启用
              </span>
            )}

            {/* Schema 信息 */}
            {(meta.input_schema || meta.output_schema) && (
              <div className="mt-3 space-y-2">
                {meta.input_schema && (
                  <details className="text-xs">
                    <summary className="Claude Code-pointer text-gray-600 hover:text-sky-600 font-medium">
                      输入格式
                    </summary>
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] overflow-x-auto text-gray-700 leading-relaxed">
                      {JSON.stringify(meta.input_schema, null, 2)}
                    </pre>
                  </details>
                )}
                {meta.output_schema && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 hover:text-sky-600 font-medium">
                      输出格式
                    </summary>
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-[10px] overflow-x-auto text-gray-700 leading-relaxed">
                      {JSON.stringify(meta.output_schema, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右侧操作 */}
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {meta.params.length > 0 && (
            <button
              onClick={onStartConfig}
              className="p-2 text-gray-400 hover:text-sky-600 rounded-lg hover:bg-sky-50 transition"
              title="配置"
            >
              <Settings size={18} />
            </button>
          )}
          <button
            onClick={() => onToggle(!enabled)}
            className={`
              p-2 rounded-lg transition
              ${enabled
                ? 'text-sky-600 bg-sky-50 hover:bg-sky-100'
                : 'text-gray-400 hover:text-sky-600 hover:bg-sky-50'
              }
            `}
            title={enabled ? '禁用' : '启用'}
          >
            <Power size={18} />
          </button>
        </div>
      </div>

      {/* 配置面板 */}
      {isConfiguring && (
        <ConfigPanel
          params={meta.params}
          currentConfig={config}
          onSave={onSaveConfig}
          onClose={onCloseConfig}
        />
      )}
    </div>
  )
}

// ===== 配置面板 =====

function ConfigPanel({
  params,
  currentConfig,
  onSave,
  onClose,
}: {
  params: PluginInfo['meta']['params']
  currentConfig: Record<string, string>
  onSave: (config: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const param of params) {
      initial[param.name] = currentConfig[param.name] || param.default || ''
    }
    return initial
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(values)
    } catch (e) {
      alert(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-600">插件配置</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        {params.map((param) => (
          <div key={param.name}>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {param.label}
              {param.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {param.description && (
              <p className="text-xs text-gray-400 mb-1">{param.description}</p>
            )}
            <input
              type={param.param_type === 'password' ? 'password' : 'text'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
              value={values[param.name] || ''}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [param.name]: e.target.value }))
              }
              placeholder={`输入 ${param.label}...`}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-lg transition font-medium"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}
