/**
 * 块配置面板 - 右侧边栏
 *
 * 根据块类型显示不同配置项:
 * - Input: 输入字段定义
 * - AI: 提示词 + 模型选择 + JSON输出key（高级选项）
 * - Output: 无需配置
 * - 连接通过端口管理，此处仅只读展示
 */
import { X, ChevronDown, ChevronUp, Link, Variable, Save } from 'lucide-react'
import { useState, useRef, useMemo, useEffect } from 'react'
import { useWorkflowStore } from '@/stores/workflow'
import { listProviders, type ProviderResponse, createTemplate } from '@/api/client'
import type { Block, Column, InputField, OutputSchema } from '@/types/workflow'

export function BlockConfigPanel() {
  const { workflow, selectedBlockId, selectBlock, updateBlock, removeConnection } = useWorkflowStore()
  const [saving, setSaving] = useState(false)

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

  // 只有 input、ai、output 类型的块可以保存为模板
  const canSaveAsTemplate = block.type !== 'plugin'

  const handleSaveAsTemplate = async () => {
    if (!block) return

    const name = prompt('模板名称:', block.name)
    if (!name) return

    const description = prompt('模板描述（可选）:', '') || ''
    const icon = prompt('图标（可选）:', '') || ''

    setSaving(true)
    try {
      await createTemplate({
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: block.type,
        name,
        description,
        icon,
        config: block.config,
        output_schema: block.output_schema || null,
        created_at: new Date().toISOString(),
      })
      alert('模板保存成功！可在制造工坊中查看。')
    } catch (e) {
      alert(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[rgba(109,204,255,0.06)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--app-accent)]">配置: {block.name}</h3>
        <div className="flex items-center gap-2">
          {canSaveAsTemplate && (
            <button
              onClick={handleSaveAsTemplate}
              disabled={saving}
              className="rounded p-1.5 text-[var(--app-accent)] transition hover:bg-[var(--app-accent-soft)] disabled:opacity-50"
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
        {/* 块名称 */}
        <Field label="名称">
          <input
            className={`input-field ${block.name.includes('.') ? 'border-red-400 focus:ring-red-200 focus:border-red-400' : ''}`}
            value={block.name}
            onChange={(e) => updateBlock(block!.id, { name: e.target.value })}
          />
          {block.name.includes('.') && (
            <p className="text-[10px] text-red-500 mt-0.5">名称不能包含「.」，请修改</p>
          )}
        </Field>

        {/* 连接信息（只读展示 + 可删除） */}
        {block.connections.length > 0 && (
          <ConnectionDisplay block={block} workflow={workflow} onRemove={removeConnection} />
        )}

        {/* 按类型渲染不同配置 */}
        {block.type === 'ai' && <AIConfig block={block} />}
        {block.type === 'input' && <InputConfig block={block} />}
        {block.type === 'plugin' && <PluginBlockConfig block={block} />}
        {block.type === 'output' && (
          <p className="text-sm text-[var(--app-text-soft)]">输出块自动展示上一栏的结果，无需额外配置。</p>
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
          已连接的上游块
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
              className="rounded-2xl border border-[var(--app-border)] bg-[rgba(109,204,255,0.08)] px-2.5 py-2 text-xs"
            >
              {/* 连接头: 名称 + 删除 */}
              <div className="flex items-center justify-between text-[var(--app-accent)]">
                <span className="flex items-center gap-1.5">
                  <span className="text-sky-400">←</span>
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
                <p className="mt-1 text-[10px] text-[var(--app-accent)]">
                  仅接收: <span className="font-mono font-medium">{conn.from_key}</span>
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--app-text-muted)]">
        通过端口连接：点击源块右侧圆点 → 目标块左侧圆点
      </p>
    </div>
  )
}

// ===== 动态变量计算 =====

interface AvailableVar {
  /** 插入到 prompt 中的模板文本，如 {{块名}} 或 {{input.url}} */
  template: string
  /** 显示给用户的标签 */
  label: string
  /** 分组: input / block */
  group: 'input' | 'block'
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
        // Input 块: 列出每个字段
        if (b.type === 'input' && b.config.fields) {
          for (const f of b.config.fields) {
            vars.push({
              template: `{{input.${f.name}}}`,
              label: `${f.label || f.name}`,
              group: 'input',
            })
          }
        }

        // 所有非 input 块: 块整体输出
        if (b.type !== 'input') {
          vars.push({
            template: `{{${b.name}}}`,
            label: b.name,
            group: 'block',
          })

          // 如果块定义了 output_schema，额外列出每个 key
          if (b.output_schema?.keys) {
            for (const key of b.output_schema.keys) {
              vars.push({
                template: `{{${b.name}.${key}}}`,
                label: `${b.name} → ${key}`,
                group: 'block',
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
  const blockVars = availableVars.filter((v) => v.group === 'block')

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-500">提示词</label>
          <div className="relative">
            <button
              onClick={() => setShowVarPicker(!showVarPicker)}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-sky-600 hover:bg-sky-50 rounded transition"
              title="插入上游变量"
            >
              <Variable size={12} />
              插入变量
            </button>

            {/* 变量选择面板 */}
            {showVarPicker && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-30 max-h-64 overflow-y-auto">
                {availableVars.length === 0 ? (
                  <p className="p-3 text-xs text-gray-400 text-center">
                    暂无可用变量<br />
                    <span className="text-[10px]">请先在前面的栏中添加块</span>
                  </p>
                ) : (
                  <>
                    {inputVars.length > 0 && (
                      <div className="px-2 pt-2 pb-1">
                        <p className="text-[10px] text-gray-400 font-medium mb-1">用户输入</p>
                        {inputVars.map((v) => (
                          <button
                            key={v.template}
                            onClick={() => insertVar(v.template)}
                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-sky-50 rounded flex items-center justify-between group"
                          >
                            <span className="text-gray-700">{v.label}</span>
                            <code className="text-[10px] text-sky-500 font-mono opacity-0 group-hover:opacity-100 transition">
                              {v.template}
                            </code>
                          </button>
                        ))}
                      </div>
                    )}
                    {blockVars.length > 0 && (
                      <div className="px-2 pt-2 pb-1 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400 font-medium mb-1">上游块输出</p>
                        {blockVars.map((v) => (
                          <button
                            key={v.template}
                            onClick={() => insertVar(v.template)}
                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-sky-50 rounded flex items-center justify-between group"
                          >
                            <span className="text-gray-700">{v.label}</span>
                            <code className="text-[10px] text-sky-500 font-mono opacity-0 group-hover:opacity-100 transition">
                              {v.template}
                            </code>
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
          placeholder="告诉 AI 你想让它做什么...&#10;&#10;使用 {{变量}} 引用上游数据，例如:&#10;{{input.url}} — 引用用户输入&#10;{{块名称}} — 引用上游块输出"
        />
        {availableVars.length > 0 && (
          <p className="text-[10px] text-gray-400 mt-1">
            使用 <code className="bg-gray-100 px-1 rounded">{'{{'}</code>变量名<code className="bg-gray-100 px-1 rounded">{'}}'}</code> 精确引用上游数据；不用变量则自动传入全部上游数据
          </p>
        )}
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
          <p className="text-[10px] text-gray-400 mt-0.5">
            已选择: {providers.find((p) => p.id === block.config.model)?.name || block.config.model}
          </p>
        )}
      </Field>

      {/* 高级选项: JSON 输出 key */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          高级选项
        </button>

        {showAdvanced && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
            <p className="text-xs text-gray-500">
              定义输出的 JSON key，让下游块可以精确引用。
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

  const addKey = () => {
    const key = prompt('输入 JSON key 名称:')
    if (key) {
      onChange({
        keys: [...keys, key],
        descriptions: schema?.descriptions || {},
      })
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
          <span className="text-xs font-mono bg-white px-2 py-1 rounded border flex-1">{key}</span>
          <button onClick={() => removeKey(i)} className="text-red-400 text-xs hover:text-red-600">
            删除
          </button>
        </div>
      ))}
      <button onClick={addKey} className="text-xs text-sky-500 hover:text-sky-700">
        + 添加 Key
      </button>
    </div>
  )
}

// ===== Plugin 块配置 =====

function PluginBlockConfig({ block }: { block: Block }) {
  const { updateBlock, workflow } = useWorkflowStore()
  const [showVariables, setShowVariables] = useState(false)
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
        if (b.type === 'input' && b.config.fields) {
          for (const field of b.config.fields) {
            vars.push({
              ref: `{{input.${field.name}}}`,
              desc: `用户输入「${field.label || field.name}」`,
            })
          }
        } else {
          vars.push({ ref: `{{${b.name}}}`, desc: `块「${b.name}」的完整输出` })
          if (b.output_schema?.keys) {
            for (const key of b.output_schema.keys) {
              vars.push({ ref: `{{${b.name}.${key}}}`, desc: `块「${b.name}」的 ${key}` })
            }
          }
        }
      }
    }
    return vars
  }, [workflow, block.id])

  const prompt = block.config.prompt || ''

  return (
    <>
      <div className="p-3 bg-teal-50 rounded-lg">
        <p className="text-xs text-teal-700 font-medium mb-1">插件块</p>
        <p className="text-xs text-teal-600">
          插件 ID: <span className="font-mono">{block.config.plugin_id || '未配置'}</span>
        </p>
        <p className="text-xs text-gray-500 mt-2">
          插件的参数（如 Token）在「插件管理」页面中配置。
        </p>
      </div>

      {/* 输入模板配置 */}
      <Field label="输入模板（可选）">
        <div className="space-y-2">
          <textarea
            className="input-field font-mono text-xs"
            rows={6}
            value={prompt}
            onChange={(e) => updateBlock(block.id, { config: { ...block.config, prompt: e.target.value } })}
            placeholder="留空则自动传递上游数据。可使用 {{变量}} 语法自定义输入格式，如：&#10;{&#10;  &quot;query&quot;: &quot;{{input.keyword}}&quot;&#10;}"
          />
          <button
            onClick={() => setShowVariables(!showVariables)}
            className="text-xs text-sky-500 hover:text-sky-700 flex items-center gap-1"
          >
            <Variable size={12} />
            {showVariables ? '隐藏' : '显示'}可用变量
          </button>
          {showVariables && availableVariables.length > 0 && (
            <div className="p-2 bg-sky-50 rounded text-xs space-y-1 max-h-40 overflow-y-auto">
              {availableVariables.map((v, i) => (
                <div key={i} className="flex items-start gap-2">
                  <code className="text-sky-700 font-mono shrink-0">{v.ref}</code>
                  <span className="text-gray-500">← {v.desc}</span>
                </div>
              ))}
            </div>
          )}
          {showVariables && availableVariables.length === 0 && (
            <p className="text-xs text-gray-400 p-2 bg-gray-50 rounded">
              当前没有可用的上游变量（需要在前面的栏中添加输入块或其他块）
            </p>
          )}
        </div>
      </Field>

      <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
        <p className="font-medium mb-1">说明：</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>留空：插件自动接收上游数据（JSON 或文本格式）</li>
          <li>填写模板：使用 {`{{变量}}`} 语法自定义输入格式</li>
          <li>支持 JSON 格式：可精确控制传递给插件的数据结构</li>
        </ul>
      </div>

      {/* 插件输入/输出格式参考 */}
      {pluginSchema && (pluginSchema.input_schema || pluginSchema.output_schema) && (
        <div className="space-y-3">
          {pluginSchema.input_schema && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs font-medium text-amber-700 mb-1.5">插件期望的输入格式</p>
              <PluginSchemaDisplay schema={pluginSchema.input_schema} />
            </div>
          )}
          {pluginSchema.output_schema && (
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-xs font-medium text-emerald-700 mb-1.5">插件输出格式</p>
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
      {description && <p className="text-[11px] text-gray-600">{description}</p>}
      {notes && <p className="text-[11px] text-amber-600 font-medium">{notes}</p>}
      {examples && examples.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">示例：</p>
          <div className="space-y-1">
            {examples.map((ex, i) => (
              <code key={i} className="block text-[10px] bg-white/80 px-2 py-1 rounded border border-gray-200 font-mono text-gray-700 break-all">
                {typeof ex === 'string' ? ex : JSON.stringify(ex)}
              </code>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-sky-500 hover:text-sky-700"
      >
        {expanded ? '收起' : '查看完整 Schema'}
      </button>
      {expanded && (
        <pre className="text-[10px] bg-white/80 p-2 rounded border border-gray-200 font-mono text-gray-600 overflow-x-auto max-h-48 overflow-y-auto">
          {JSON.stringify(schema, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ===== Input 块配置 =====

const FIELD_TYPE_OPTIONS: { value: InputField['field_type']; label: string }[] = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'file', label: '文件' },
]

function InputConfig({ block }: { block: Block }) {
  const { updateBlock } = useWorkflowStore()
  const workflow = useWorkflowStore((s) => s.workflow)
  const fields: InputField[] = block.config.fields || []

  const otherFieldNames = useMemo(() => {
    const names = new Set<string>()
    for (const col of workflow.columns) {
      for (const b of col.blocks) {
        if (b.type === 'input' && b.id !== block.id && b.config.fields) {
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
    const newFields = fields.map((f, i) => (i === index ? { ...f, ...updates } : f))
    // name 跟 label 同步（保持简洁，用户改 label 自动同步 name）
    if (updates.label !== undefined) {
      newFields[index].name = updates.label.replace(/\s+/g, '_').toLowerCase() || `field_${index + 1}`
    }
    setFields(newFields)
  }

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index))
  }

  return (
    <>
      <p className="text-xs text-gray-500">
        定义运行时用户需要填写的输入字段。
        AI 块的提示词中可以用 <code className="bg-gray-100 px-1 rounded">{'{{input.字段名}}'}</code> 引用。
      </p>

      {fields.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm text-gray-400 mb-3">暂无字段，点击下方添加</p>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
              {/* 第一行: 标签 + 删除 */}
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-300 focus:border-sky-400"
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="字段标签"
                />
                <button
                  onClick={() => removeField(i)}
                  className="p-1 text-gray-400 hover:text-red-500 transition"
                  title="删除字段"
                >
                  <X size={14} />
                </button>
              </div>

              {/* 第二行: 类型 + 必填 */}
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-sky-300"
                  value={field.field_type}
                  onChange={(e) => updateField(i, { field_type: e.target.value as InputField['field_type'] })}
                >
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                    className="rounded border-gray-300 text-sky-500 focus:ring-sky-300"
                  />
                  必填
                </label>
              </div>

              {/* 变量名提示 */}
              <p className="text-[10px] text-gray-400 font-mono">
                变量名: {'{{'}<span className="text-sky-500">input.{field.name}</span>{'}}'}
              </p>
              {otherFieldNames.has(field.name) && (
                <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                  字段名「{field.name}」与其他 Input 块中的字段重复，运行时会互相覆盖
                </p>
              )}
              {fields.filter((f) => f.name === field.name).length > 1 && (
                <p className="text-[10px] text-red-500 font-medium mt-0.5">
                  当前块内存在同名字段，请修改
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addField}
        className="w-full py-2 text-xs text-sky-500 hover:text-sky-700 hover:bg-sky-50 border border-dashed border-sky-200 rounded-lg transition"
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
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
