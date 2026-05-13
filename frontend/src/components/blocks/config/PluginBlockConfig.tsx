import { ChevronDown, ChevronUp, Variable } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getEnabledPlugins } from '@/api/client'
import { useWorkflowStore } from '@/stores/workflow'
import type { Block, PluginInputBinding } from '@/types/workflow'
import { Field } from './Field'

export function PluginBlockConfig({ block }: { block: Block }) {
  const { updateBlock, workflow } = useWorkflowStore()
  const [showVariables, setShowVariables] = useState(false)
  const [showAdvancedTemplate, setShowAdvancedTemplate] = useState(false)
  const [pluginSchema, setPluginSchema] = useState<{
    input_schema?: Record<string, unknown> | null
    output_schema?: Record<string, unknown> | null
  } | null>(null)

  useEffect(() => {
    if (!block.config.plugin_id) return
    getEnabledPlugins().then((plugins) => {
      const found = plugins.find((p) => p.id === block.config.plugin_id)
      if (found) {
        setPluginSchema({
          input_schema: found.input_schema,
          output_schema: found.output_schema,
        })
      }
    }).catch(() => {})
  }, [block.config.plugin_id])

  const availableVariables = useMemo(() => {
    const vars: Array<{ ref: string; desc: string }> = []
    const columns = [...workflow.columns].sort((a, b) => a.order - b.order)

    let currentColumnOrder = -1
    for (const col of columns) {
      if (col.blocks.some((b) => b.id === block.id)) {
        currentColumnOrder = col.order
        break
      }
    }

    for (const col of columns) {
      if (col.order >= currentColumnOrder) break
      for (const b of col.blocks) {
        if (b.type === 'collect' && b.config.fields) {
          for (const field of b.config.fields) {
            vars.push({
              ref: `{{inputs.${field.name}}}`,
              desc: `用户输入「${field.label || field.name}」`,
            })
          }
        } else {
          vars.push({ ref: `{{steps.${b.ref}}}`, desc: `步骤「${b.name}」(${b.ref}) 的完整输出` })
          if (b.output_schema?.keys) {
            for (const key of b.output_schema.keys) {
              vars.push({ ref: `{{steps.${b.ref}.${key}}}`, desc: `步骤「${b.name}」(${b.ref}) 的 ${key}` })
            }
          }
        }
      }
    }
    return vars
  }, [workflow, block.id])

  const prompt = block.config.prompt || ''
  const inputProperties = (pluginSchema?.input_schema?.properties as Record<string, Record<string, unknown>> | undefined) || {}
  const inputPropertyKeys = Object.keys(inputProperties)
  const bindings = block.config.plugin_input_bindings || {}

  const setPluginBinding = (key: string, binding: PluginInputBinding | null) => {
    const next = { ...(block.config.plugin_input_bindings || {}) }
    if (!binding) {
      delete next[key]
    } else {
      next[key] = binding
    }
    updateBlock(block.id, {
      config: {
        ...block.config,
        plugin_input_bindings: Object.keys(next).length ? next : null,
      },
    })
  }

  return (
    <>
      <div className="p-3 bg-[var(--moss-soft)] border border-[var(--line)] rounded-sm">
        <p className="app-kicker no-rule text-[0.6rem] mb-1.5" style={{ color: 'var(--moss)' }}>Tool Step</p>
        <p className="text-xs text-[var(--app-text)]">
          工具 ID: <span className="font-mono">{block.config.plugin_id || '未配置'}</span>
        </p>
        <p className="text-xs text-[var(--app-text-soft)] mt-2">
          工具的参数（如 Token）在「插件管理」页面中配置。
        </p>
      </div>

      {inputPropertyKeys.length > 0 && (
        <Field label="字段映射">
          <div className="space-y-2">
            {inputPropertyKeys.map((key) => {
              const schema = inputProperties[key] || {}
              const binding = bindings[key] || { kind: 'variable', value: '' as const }
              return (
                <div key={key} className="rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-[var(--app-text)]">{key}</div>
                      {typeof schema.description === 'string' && schema.description && (
                        <div className="text-[10px] text-[var(--app-text-muted)]">{schema.description}</div>
                      )}
                    </div>
                    <select
                      className="input-field w-24 py-1 text-xs"
                      value={binding.kind}
                      onChange={(e) =>
                        setPluginBinding(key, {
                          kind: e.target.value as PluginInputBinding['kind'],
                          value: e.target.value === 'literal' ? '' : String(binding.value || ''),
                        })
                      }
                    >
                      <option value="variable">变量</option>
                      <option value="literal">常量</option>
                    </select>
                  </div>

                  {binding.kind === 'variable' ? (
                    <select
                      className="input-field py-1 text-xs"
                      value={String(binding.value || '')}
                      onChange={(e) =>
                        setPluginBinding(key, {
                          kind: 'variable',
                          value: e.target.value,
                        })
                      }
                    >
                      <option value="">选择来源变量</option>
                      {availableVariables.map((v) => (
                        <option key={v.ref} value={v.ref.replace(/^\{\{|\}\}$/g, '')}>
                          {v.ref} ← {v.desc}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input-field py-1 text-xs"
                      value={binding.value == null ? '' : String(binding.value)}
                      onChange={(e) =>
                        setPluginBinding(key, {
                          kind: 'literal',
                          value: e.target.value,
                        })
                      }
                      placeholder="输入固定值"
                    />
                  )}
                </div>
              )
            })}
            <p className="text-[10px] text-[var(--app-text-muted)]">
              优先使用字段映射完成工具输入配置；只有需要复杂结构重组时再使用模板。
            </p>
          </div>
        </Field>
      )}

      <Field label="高级模板（可选）">
        <div className="space-y-2">
          <button
            onClick={() => setShowAdvancedTemplate(!showAdvancedTemplate)}
            className="flex items-center gap-1 text-xs text-[var(--app-accent-strong)] hover:text-[var(--rust-ink)]"
          >
            {showAdvancedTemplate ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showAdvancedTemplate ? '收起高级模板' : '展开高级模板'}
          </button>
          {showAdvancedTemplate && (
            <>
              <textarea
                className="input-field font-mono text-xs"
                rows={6}
                value={prompt}
                onChange={(e) => updateBlock(block.id, { config: { ...block.config, prompt: e.target.value } })}
                placeholder="仅在字段映射不足以表达复杂输入时使用，例如：&#10;{&#10;  &quot;query&quot;: &quot;{{inputs.keyword}}&quot;&#10;}"
              />
              <button
                onClick={() => setShowVariables(!showVariables)}
                className="text-xs text-[var(--app-accent-strong)] hover:text-[var(--rust-ink)] flex items-center gap-1"
              >
                <Variable size={12} />
                {showVariables ? '隐藏' : '显示'}可用变量
              </button>
            </>
          )}
          {showAdvancedTemplate && showVariables && availableVariables.length > 0 && (
            <div className="p-2 bg-[var(--paper-warm)] border border-[var(--line)] rounded-sm text-xs space-y-1 max-h-40 overflow-y-auto">
              {availableVariables.map((v, i) => (
                <div key={i} className="flex items-start gap-2">
                  <code className="text-[var(--app-accent-strong)] font-mono shrink-0">{v.ref}</code>
                  <span className="text-[var(--app-text-soft)]">← {v.desc}</span>
                </div>
              ))}
            </div>
          )}
          {showAdvancedTemplate && showVariables && availableVariables.length === 0 && (
            <p className="text-xs text-[var(--app-text-muted)] p-2 bg-[var(--paper-warm)] border border-[var(--line)] rounded-sm">
              当前没有可用的上游变量（需要在前面的阶段中添加收集步骤或其他步骤）
            </p>
          )}
        </div>
      </Field>

      <div className="text-xs text-[var(--app-text-soft)] p-2 bg-[var(--paper-warm)] border border-[var(--line)] rounded-sm">
        <p className="font-medium mb-1">说明：</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>优先：使用字段映射选择变量来源或常量值</li>
          <li>留空：工具自动接收上游数据（JSON 或文本格式）</li>
          <li>高级模板：只有在需要复杂 JSON 重组时才使用</li>
        </ul>
      </div>

      {pluginSchema && (pluginSchema.input_schema || pluginSchema.output_schema) && (
        <div className="space-y-3">
          {pluginSchema.input_schema && (
            <div className="p-3 bg-[var(--rust-soft)] rounded-sm border border-[var(--line)]">
              <p className="app-kicker no-rule text-[0.6rem] mb-1.5" style={{ color: 'var(--rust-ink)' }}>工具期望的输入格式</p>
              <PluginSchemaDisplay schema={pluginSchema.input_schema} />
            </div>
          )}
          {pluginSchema.output_schema && (
            <div className="p-3 bg-[var(--moss-soft)] rounded-sm border border-[var(--line)]">
              <p className="app-kicker no-rule text-[0.6rem] mb-1.5" style={{ color: 'var(--moss)' }}>工具输出格式</p>
              <PluginSchemaDisplay schema={pluginSchema.output_schema} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

function PluginSchemaDisplay({ schema }: { schema: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)

  const description = schema.description as string | undefined
  const examples = schema.examples as unknown[] | undefined
  const notes = schema.notes as string | undefined

  return (
    <div className="space-y-1.5">
      {description && <p className="text-[11px] text-[var(--app-text-soft)]">{description}</p>}
      {notes && <p className="text-[11px] text-[var(--app-accent-strong)] font-medium">{notes}</p>}
      {examples && examples.length > 0 && (
        <div>
          <p className="text-[10px] text-[var(--app-text-muted)] mb-0.5">示例：</p>
          <div className="space-y-1">
            {examples.map((ex, i) => (
              <code key={i} className="block text-[10px] bg-[var(--card)] px-2 py-1 rounded-sm border border-[var(--line)] font-mono text-[var(--app-text-soft)] break-all">
                {typeof ex === 'string' ? ex : JSON.stringify(ex)}
              </code>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-[var(--app-accent-strong)] hover:text-[var(--rust-ink)]"
      >
        {expanded ? '收起' : '查看完整 Schema'}
      </button>
      {expanded && (
        <pre className="text-[10px] bg-[var(--card)] p-2 rounded-sm border border-[var(--line)] font-mono text-[var(--app-text-soft)] overflow-x-auto max-h-48 overflow-y-auto">
          {JSON.stringify(schema, null, 2)}
        </pre>
      )}
    </div>
  )
}
