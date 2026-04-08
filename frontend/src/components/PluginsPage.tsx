import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Power, Settings, X } from 'lucide-react'
import type { PluginInfo } from '@/types/workflow'
import { listPlugins, togglePlugin, updatePluginConfig } from '@/api/client'
import { ThemeToggle } from './ui/ThemeToggle'

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
      setPlugins((prev) => prev.map((plugin) => (
        plugin.meta.id === pluginId ? { ...plugin, enabled } : plugin
      )))
    } catch (error) {
      alert(`操作失败: ${error}`)
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
              <div className="app-kicker">Plugins / extend the block system</div>
              <h1 className="app-section-title text-2xl">插件管理</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="app-page py-8">
        <section className="app-card p-6 md:p-8">
          <div className="app-kicker mb-3">Extension surface</div>
          <h2 className="app-section-title text-3xl md:text-4xl">启用插件，让工作流获得新的块类型</h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-8">
            插件页决定 Flow 编辑器里能出现哪些扩展块。它们和制造模板不同，模板沉淀的是结构，插件引入的是新能力。
          </p>
        </section>

        <section className="mt-6">
          {loading ? (
            <div className="app-card p-12 text-center text-[var(--app-text-soft)]">加载中...</div>
          ) : plugins.length === 0 ? (
            <div className="app-card p-12 text-center text-[var(--app-text-soft)]">暂无可用插件</div>
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
                    setPlugins((prev) => prev.map((item) => (
                      item.meta.id === plugin.meta.id ? { ...item, config } : item
                    )))
                    setConfiguring(null)
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

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
    <article className="app-card-soft p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-[var(--app-text)]">{meta.name}</h3>
            {enabled && (
              <span className="app-pill">
                <Check size={12} />
                已启用
              </span>
            )}
          </div>
          <p className="app-muted mt-2 text-sm leading-7">{meta.description}</p>

          {(meta.input_schema || meta.output_schema) && (
            <div className="mt-4 space-y-3">
              {meta.input_schema && (
                <details className="rounded-2xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.03)] p-4">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--app-text)]">输入格式</summary>
                  <pre className="app-muted mt-3 overflow-x-auto text-xs leading-6">{JSON.stringify(meta.input_schema, null, 2)}</pre>
                </details>
              )}
              {meta.output_schema && (
                <details className="rounded-2xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.03)] p-4">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--app-text)]">输出格式</summary>
                  <pre className="app-muted mt-3 overflow-x-auto text-xs leading-6">{JSON.stringify(meta.output_schema, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {meta.params.length > 0 && (
            <button onClick={onStartConfig} className="app-button app-button-ghost" title="配置">
              <Settings size={16} />
              配置
            </button>
          )}
          <button onClick={() => onToggle(!enabled)} className="app-button app-button-secondary" title={enabled ? '禁用' : '启用'}>
            <Power size={16} />
            {enabled ? '禁用' : '启用'}
          </button>
        </div>
      </div>

      {isConfiguring && (
        <ConfigPanel
          params={meta.params}
          currentConfig={config}
          onSave={onSaveConfig}
          onClose={onCloseConfig}
        />
      )}
    </article>
  )
}

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
    } catch (error) {
      alert(`保存失败: ${error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-5 border-t border-[var(--app-border)] pt-5">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--app-text)]">插件配置</h4>
        <button onClick={onClose} className="app-button app-button-ghost">
          <X size={14} />
          关闭
        </button>
      </div>

      <div className="space-y-4">
        {params.map((param) => (
          <div key={param.name}>
            <label className="mb-2 block text-sm font-medium text-[var(--app-text-soft)]">
              {param.label}
              {param.required && <span className="ml-1 text-[var(--app-danger)]">*</span>}
            </label>
            {param.description && (
              <p className="app-muted mb-2 text-xs leading-6">{param.description}</p>
            )}
            <input
              type={param.param_type === 'password' ? 'password' : 'text'}
              className="app-input"
              value={values[param.name] || ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [param.name]: e.target.value }))}
              placeholder={`输入 ${param.label}`}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={onClose} className="app-button app-button-ghost">取消</button>
        <button onClick={handleSave} disabled={saving} className="app-button app-button-primary disabled:opacity-50">
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}
