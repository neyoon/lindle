/**
 * 步骤配置面板 - 右侧边栏
 *
 * 根据步骤类型显示不同配置项:
 * - Collect: 输入字段定义
 * - Process: 提示词 + 模型选择 + JSON输出key（高级选项）
 * - Result: 无需配置
 * - 连接通过端口管理，此处仅只读展示
 */
import { X, ChevronDown, ChevronUp, Link, Variable, Save } from 'lucide-react'
import { useState, useRef, useMemo, useEffect } from 'react'
import { useWorkflowStore } from '@/stores/workflow'
import { listProviders, type ProviderResponse, createTemplate } from '@/api/client'
import type { Block, Column, InputField, OutputSchema, PluginInputBinding } from '@/types/workflow'

export function BlockConfigPanel() {
  const { workflow, selectedBlockId, selectBlock, updateBlock, removeConnection, renameBlockReference } = useWorkflowStore()
  const [saving, setSaving] = useState(false)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateIcon, setTemplateIcon] = useState('')

  // 找到选中的块及其所在栏
  let block: Block | null = null
  let blockColumn: Column | null = null
  for (const col of workflow.columns) {
    for (const b of col.blocks) {
      if (b.id === selectedBlockId) {
        block = b
        blockColumn = col
      }
    }
  }

  if (!block || !blockColumn) return null

  // 只有 collect、process、result 类型的步骤可以保存为模板
  const canSaveAsTemplate = block.type !== 'tool'

  const handleSaveAsTemplate = async () => {
    if (!block) return
    const name = templateName.trim() || block.name
    const description = templateDescription.trim()
    const icon = templateIcon.trim()

    setSaving(true)
    try {
      await createTemplate({
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ref: block.ref,
        type: block.type,
        name,
        description,
        icon,
        config: block.config,
        output_schema: block.output_schema || null,
        created_at: new Date().toISOString(),
      })
      alert('模板保存成功！可在制造工坊中查看。')
      setShowTemplateForm(false)
      setTemplateName('')
      setTemplateDescription('')
      setTemplateIcon('')
    } catch (e) {
      alert(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--paper-warm)] px-4 py-3">
        <div>
          <div className="app-kicker no-rule text-[0.62rem] mb-0.5">Step Config</div>
          <h3 className="text-sm font-medium text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>
            {block.name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {canSaveAsTemplate && (
            <button
              onClick={() => {
                setTemplateName(block.name)
                setTemplateDescription('')
                setTemplateIcon('')
                setShowTemplateForm((v) => !v)
              }}
              disabled={saving}
              className="rounded-sm p-1.5 text-[var(--app-accent-strong)] transition hover:bg-[var(--app-accent-soft)] disabled:opacity-50"
              title="保存为模板"
            >
              <Save size={14} />
            </button>
          )}
          <button onClick={() => selectBlock(null)} className="text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 配置内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 步骤名称 */}
        <Field label="名称">
          <input
            className="input-field"
            value={block.name}
            onChange={(e) => updateBlock(block!.id, { name: e.target.value })}
          />
        </Field>

        <Field label="稳定步骤引用">
          <input
            className="input-field font-mono text-xs"
            value={block.ref}
            onChange={(e) => renameBlockReference(block.id, e.target.value)}
            placeholder="draft_summary"
          />
        </Field>

        {canSaveAsTemplate && showTemplateForm && (
          <div className="rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-3 space-y-3">
            <div className="app-kicker no-rule text-[0.62rem]">Save As Template</div>
            <Field label="模板名称">
              <input
                className="input-field"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={block.name}
              />
            </Field>
            <Field label="模板描述">
              <input
                className="input-field"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="可选"
              />
            </Field>
            <Field label="图标">
              <input
                className="input-field"
                value={templateIcon}
                onChange={(e) => setTemplateIcon(e.target.value)}
                placeholder="可选"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowTemplateForm(false)}
                className="app-button app-button-ghost"
                type="button"
              >
                取消
              </button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={saving}
                className="app-button app-button-primary disabled:opacity-50"
                type="button"
              >
                保存模板
              </button>
            </div>
          </div>
        )}

        {/* 连接信息（只读展示 + 可删除） */}
        {block.connections.length > 0 && (
          <ConnectionDisplay block={block} workflow={workflow} onRemove={removeConnection} />
        )}

        {/* 按类型渲染不同配置 */}
        {block.type === 'process' && <AIConfig block={block} />}
        {block.type === 'collect' && <InputConfig block={block} />}
        {block.type === 'tool' && <PluginBlockConfig block={block} />}
        {block.type === 'result' && (
          <div className="rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-3 text-sm text-[var(--app-text-soft)]">
            结果步骤无需额外配置。
          </div>
        )}
      </div>
    </div>
  )
}

// ===== 连接展示 + 输出 Key 选择 =====

function ConnectionDisplay({
  block,
  workflow,
  onRemove,
}: {
  block: Block
  workflow: { columns: Column[] }
  onRemove: (blockId: string, fromBlockId: string) => void
}) {
  const { updateConnectionKey } = useWorkflowStore()

  // 通过 ID 查找完整的源块对象
  const findBlock = (id: string): Block | null => {
    for (const col of workflow.columns) {
      for (const b of col.blocks) {
        if (b.id === id) return b
      }
    }
    return null
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--app-text-soft)]">
        <span className="flex items-center gap-1">
          <Link size={12} />
          已连接的上游步骤
        </span>
      </label>
      <div className="space-y-2">
        {block.connections.map((conn) => {
          const sourceBlock = findBlock(conn.from_block_id)
          const outputKeys = sourceBlock?.output_schema?.keys
          const hasKeys = outputKeys && outputKeys.length > 0

          return (
            <div
              key={conn.from_block_id}
              className="rounded-sm border border-[var(--app-border)] bg-[var(--paper-warm)] px-2.5 py-2 text-xs"
            >
              {/* 连接头: 名称 + 删除 */}
              <div className="flex items-center justify-between text-[var(--app-accent-strong)]">
                <span className="flex items-center gap-1.5">
                  <span className="text-[var(--app-accent)]">←</span>
                  <span className="font-medium">{sourceBlock?.name || conn.from_block_id}</span>
                </span>
                <button
                  onClick={() => onRemove(block.id, conn.from_block_id)}
                  className="text-[var(--app-text-muted)] transition hover:text-[var(--app-danger)]"
                  title="断开连接"
                >
                  <X size={12} />
                </button>
              </div>

              {/* 输出 Key 选择器 — 仅当源块定义了 output_schema 时显示 */}
              {hasKeys && (
                <div className="mt-1.5">
                  <label className="mb-0.5 block text-[10px] text-[var(--app-text-muted)]">选择接收的输出字段</label>
                  <select
                    className="app-input py-1 text-xs"
                    value={conn.from_key || ''}
                    onChange={(e) => {
                      updateConnectionKey(block.id, conn.from_block_id, e.target.value || null)
                    }}
                  >
                    <option value="">全部输出</option>
                    {outputKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 已选 key 提示 */}
              {conn.from_key && (
                <p className="mt-1 text-[10px] text-[var(--app-accent-strong)]">
                  仅接收: <span className="font-mono font-medium">{conn.from_key}</span>
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--app-text-muted)]">
        通过端口连接：点击源步骤右侧圆点 → 目标步骤左侧圆点
      </p>
    </div>
  )
}

// ===== 动态变量计算 =====

interface AvailableVar {
  /** 插入到 prompt 中的模板文本，如 {{steps.summary}} 或 {{inputs.topic}} */
  template: string
  /** 显示给用户的标签 */
  label: string
  /** 分组: input / step */
  group: 'input' | 'step'
}

/**
 * 根据当前块在工作流中的位置，动态计算它能引用的上游变量列表。
 * 规则：只有 order 更小的栏中的块才算上游。
 */
function useAvailableVars(block: Block): AvailableVar[] {
  const workflow = useWorkflowStore((s) => s.workflow)

  return useMemo(() => {
    // 找到当前块所在的栏
    let currentColOrder = -1
    for (const col of workflow.columns) {
      if (col.blocks.some((b) => b.id === block.id)) {
        currentColOrder = col.order
        break
      }
    }
    if (currentColOrder < 0) return []

    const vars: AvailableVar[] = []

    // 遍历所有 order 更小的栏
    const sortedCols = [...workflow.columns].sort((a, b) => a.order - b.order)
    for (const col of sortedCols) {
      if (col.order >= currentColOrder) break

      for (const b of col.blocks) {
        // Collect 步骤: 列出每个字段
        if (b.type === 'collect' && b.config.fields) {
          for (const f of b.config.fields) {
            vars.push({
              template: `{{inputs.${f.name}}}`,
              label: `${f.label || f.name}`,
              group: 'input',
            })
          }
        }

        // 所有非 collect 步骤: 步骤整体输出
        if (b.type !== 'collect') {
          vars.push({
            template: `{{steps.${b.ref}}}`,
            label: `${b.name} (${b.ref})`,
            group: 'step',
          })

          // 如果步骤定义了 output_schema，额外列出每个 key
          if (b.output_schema?.keys) {
            for (const key of b.output_schema.keys) {
              vars.push({
                template: `{{steps.${b.ref}.${key}}}`,
                label: `${b.name} (${b.ref}) → ${key}`,
                group: 'step',
              })
            }
          }
        }
      }
    }

    return vars
  }, [workflow.columns, block.id])
}

// ===== AI 块配置 =====

function AIConfig({ block }: { block: Block }) {
  const { updateBlock } = useWorkflowStore()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showVarPicker, setShowVarPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [providers, setProviders] = useState<ProviderResponse[]>([])

  useEffect(() => {
    listProviders().then(setProviders).catch(() => {})
  }, [])

  const availableVars = useAvailableVars(block)

  /** 在 textarea 光标位置插入变量模板 */
  const insertVar = (template: string) => {
    const ta = textareaRef.current
    if (!ta) return

    const start = ta.selectionStart
    const end = ta.selectionEnd
    const current = block.config.prompt || ''
    const newValue = current.slice(0, start) + template + current.slice(end)

    updateBlock(block.id, { config: { ...block.config, prompt: newValue } })
    setShowVarPicker(false)

    // 恢复光标位置
    requestAnimationFrame(() => {
      ta.focus()
      const newPos = start + template.length
      ta.setSelectionRange(newPos, newPos)
    })
  }

  const inputVars = availableVars.filter((v) => v.group === 'input')
  const blockVars = availableVars.filter((v) => v.group === 'step')

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-[var(--app-text-soft)]">步骤说明</label>
          <div className="relative">
            <button
              onClick={() => setShowVarPicker(!showVarPicker)}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-[var(--app-accent-strong)] hover:bg-[var(--app-accent-soft)] rounded-sm transition"
              title="选择上游内容"
            >
              <Variable size={12} />
              引用上游
            </button>

            {/* 变量选择面板 */}
            {showVarPicker && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-sm border border-[var(--app-border)] bg-[var(--app-panel-solid)] shadow-[var(--app-shadow)] z-30 max-h-64 overflow-y-auto" style={{ animation: 'panel-slide-in 0.3s var(--ease-ink)' }}>
                {availableVars.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--app-text-muted)] text-center">
                    暂无可引用内容
                  </p>
                ) : (
                  <>
                    {inputVars.length > 0 && (
                      <div className="px-2 pt-2 pb-1">
                        <p className="app-kicker no-rule text-[10px] mb-1">输入</p>
                        {inputVars.map((v) => (
                          <button
                            key={v.template}
                            onClick={() => insertVar(v.template)}
                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--app-accent-soft)] rounded-sm"
                          >
                            <span className="text-[var(--app-text)]">{v.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {blockVars.length > 0 && (
                      <div className="px-2 pt-2 pb-1 border-t border-[var(--app-border)]">
                        <p className="app-kicker no-rule text-[10px] mb-1">上游结果</p>
                        {blockVars.map((v) => (
                          <button
                            key={v.template}
                            onClick={() => insertVar(v.template)}
                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--app-accent-soft)] rounded-sm"
                          >
                            <span className="text-[var(--app-text)]">{v.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          className="input-field min-h-[120px] resize-y font-mono text-sm"
          value={block.config.prompt || ''}
          onChange={(e) =>
            updateBlock(block.id, { config: { ...block.config, prompt: e.target.value } })
          }
          placeholder="描述这一步要做什么"
        />
      </div>

      <Field label="LLM 模型">
        <select
          className="input-field"
          value={block.config.model || ''}
          onChange={(e) =>
            updateBlock(block.id, {
              config: { ...block.config, model: e.target.value || null },
            })
          }
        >
          <option value="">默认 Provider</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.model}){p.is_default ? ' (默认)' : ''}
            </option>
          ))}
        </select>
        {block.config.model && (
          <p className="text-[10px] text-[var(--app-text-muted)] mt-0.5">
            已选择: {providers.find((p) => p.id === block.config.model)?.name || block.config.model}
          </p>
        )}
      </Field>

      {/* 高级选项: JSON 输出 key */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-[var(--app-text-soft)] hover:text-[var(--app-text)]"
        >
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          高级选项
        </button>

        {showAdvanced && (
          <div className="mt-2 p-3 bg-[var(--paper-warm)] border border-[var(--line)] rounded-sm space-y-2">
            <p className="text-xs text-[var(--app-text-soft)]">
              定义输出的 JSON key，让下游步骤可以精确引用。
            </p>
            <OutputSchemaEditor
              schema={block.output_schema || null}
              onChange={(schema) => updateBlock(block.id, { output_schema: schema })}
            />
          </div>
        )}
      </div>
    </>
  )
}

// ===== JSON 输出 Key 编辑器 =====

function OutputSchemaEditor({
  schema,
  onChange,
}: {
  schema: OutputSchema | null
  onChange: (schema: OutputSchema | null) => void
}) {
  const keys = schema?.keys || []
  const [draftKey, setDraftKey] = useState('')

  const addKey = () => {
    const key = draftKey.trim()
    if (key && !keys.includes(key)) {
      onChange({
        keys: [...keys, key],
        descriptions: schema?.descriptions || {},
      })
      setDraftKey('')
    }
  }

  const removeKey = (index: number) => {
    const newKeys = keys.filter((_, i) => i !== index)
    if (newKeys.length === 0) {
      onChange(null)
    } else {
      onChange({ keys: newKeys, descriptions: schema?.descriptions || {} })
    }
  }

  return (
    <div className="space-y-1">
      {keys.map((key, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-mono bg-[var(--card)] px-2 py-1 rounded-sm border border-[var(--line)] flex-1">{key}</span>
          <button onClick={() => removeKey(i)} className="text-[var(--app-danger)] text-xs hover:text-[var(--rust-ink)]">
            删除
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <input
          className="input-field flex-1 py-1 text-xs font-mono"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addKey()
          }}
          placeholder="新增输出 key"
        />
        <button onClick={addKey} className="text-xs text-[var(--app-accent-strong)] hover:text-[var(--rust-ink)]">
          添加
        </button>
      </div>
    </div>
  )
}

// ===== Tool 步骤配置 =====

function PluginBlockConfig({ block }: { block: Block }) {
  const { updateBlock, workflow } = useWorkflowStore()
  const [showVariables, setShowVariables] = useState(false)
  const [showAdvancedTemplate, setShowAdvancedTemplate] = useState(false)
  const [pluginSchema, setPluginSchema] = useState<{
    input_schema?: Record<string, unknown> | null
    output_schema?: Record<string, unknown> | null
  } | null>(null)

  useEffect(() => {
    if (!block.config.plugin_id) return
    import('@/api/client').then(({ getEnabledPlugins }) => {
      getEnabledPlugins().then((plugins) => {
        const found = plugins.find((p) => p.id === block.config.plugin_id)
        if (found) {
          setPluginSchema({
            input_schema: found.input_schema,
            output_schema: found.output_schema,
          })
        }
      })
    })
  }, [block.config.plugin_id])

  // 计算可用变量（与 AI 块相同的逻辑）
  const availableVariables = useMemo(() => {
    const vars: Array<{ ref: string; desc: string }> = []
    const columns = [...workflow.columns].sort((a, b) => a.order - b.order)

    // 找到当前块所在的栏
    let currentColumnOrder = -1
    for (const col of columns) {
      if (col.blocks.some((b) => b.id === block.id)) {
        currentColumnOrder = col.order
        break
      }
    }

    // 只收集当前栏之前的块
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

      {/* 输入模板配置 */}
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

      {/* 工具输入/输出格式参考 */}
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

// ===== Collect 步骤配置 =====

const FIELD_TYPE_OPTIONS: { value: InputField['field_type']; label: string }[] = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'file', label: '文件' },
]

function InputConfig({ block }: { block: Block }) {
  const { updateBlock, renameInputReference } = useWorkflowStore()
  const workflow = useWorkflowStore((s) => s.workflow)
  const fields: InputField[] = block.config.fields || []

  const otherFieldNames = useMemo(() => {
    const names = new Set<string>()
    for (const col of workflow.columns) {
      for (const b of col.blocks) {
        if (b.type === 'collect' && b.id !== block.id && b.config.fields) {
          for (const f of b.config.fields) names.add(f.name)
        }
      }
    }
    return names
  }, [workflow.columns, block.id])

  const setFields = (newFields: InputField[]) => {
    updateBlock(block.id, { config: { ...block.config, fields: newFields } })
  }

  const addField = () => {
    const idx = fields.length + 1
    setFields([...fields, { name: `field_${idx}`, label: `字段${idx}`, field_type: 'text', required: true }])
  }

  const updateField = (index: number, updates: Partial<InputField>) => {
    const oldField = fields[index]
    const newFields = fields.map((f, i) => (i === index ? { ...f, ...updates } : f))
    setFields(newFields)
    if (updates.name && oldField && oldField.name !== updates.name) {
      renameInputReference(oldField.name, updates.name)
    }
  }

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index))
  }

  return (
    <>
      {fields.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm text-[var(--app-text-muted)] mb-3">暂无字段，点击下方添加</p>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={i} className="p-3 bg-[var(--paper-warm)] rounded-sm border border-[var(--line)] space-y-2">
              {/* 第一行: 标签 + 删除 */}
              <div className="flex items-center gap-2">
                <input
                  className="input-field flex-1 py-1 text-sm"
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="字段标签"
                />
                <button
                  onClick={() => removeField(i)}
                  className="p-1 text-[var(--app-text-muted)] hover:text-[var(--app-danger)] transition"
                  title="删除字段"
                >
                  <X size={14} />
                </button>
              </div>

              {/* 第二行: 引用名 */}
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--app-text-muted)]">稳定引用名</label>
                <input
                  className="input-field py-1 text-xs font-mono"
                  value={field.name}
                  onChange={(e) => updateField(i, { name: e.target.value.replace(/\s+/g, '_') })}
                  placeholder="topic"
                />
              </div>

              {/* 第三行: 类型 + 必填 */}
              <div className="flex items-center gap-2">
                <select
                  className="input-field flex-1 py-1 text-xs"
                  value={field.field_type}
                  onChange={(e) => updateField(i, { field_type: e.target.value as InputField['field_type'] })}
                >
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-[var(--app-text-soft)] whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                    className="rounded-sm border-[var(--line-strong)] text-[var(--app-accent)] focus:ring-[var(--app-accent-soft)]"
                  />
                  必填
                </label>
              </div>

              {otherFieldNames.has(field.name) && (
                <p className="text-[10px] text-[var(--app-warning)] font-medium mt-0.5">
                  稳定引用名「{field.name}」与其他收集步骤中的字段重复，运行时会互相覆盖
                </p>
              )}
              {fields.filter((f) => f.name === field.name).length > 1 && (
                <p className="text-[10px] text-[var(--app-danger)] font-medium mt-0.5">
                  当前步骤内存在同名字段，请修改
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addField}
        className="w-full py-2 text-xs text-[var(--app-accent-strong)] hover:text-[var(--rust-ink)] hover:bg-[var(--app-accent-soft)] border border-dashed border-[var(--line-strong)] rounded-sm transition"
      >
        + 添加输入字段
      </button>
    </>
  )
}

// ===== 通用组件 =====

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--app-text-soft)] mb-1">{label}</label>
      {children}
    </div>
  )
}
