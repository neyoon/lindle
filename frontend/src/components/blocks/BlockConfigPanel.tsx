/**
 * 块配置面板 - 右侧边栏
 *
 * 根据块类型显示不同配置项:
 * - Input: 输入字段定义
 * - AI: 提示词 + 模型选择 + JSON输出key（高级选项）
 * - Output: 无需配置
 * - 连接通过端口管理，此处仅只读展示
 */
import { X, ChevronDown, ChevronUp, Link, Variable } from 'lucide-react'
import { useState, useRef, useMemo, useEffect } from 'react'
import { useWorkflowStore } from '@/stores/workflow'
import { listProviders, type ProviderResponse } from '@/api/client'
import type { Block, Column, OutputSchema } from '@/types/workflow'

export function BlockConfigPanel() {
  const { workflow, selectedBlockId, selectBlock, updateBlock, removeConnection } = useWorkflowStore()

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

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-sky-100 flex items-center justify-between bg-sky-50/30">
        <h3 className="text-sm font-semibold text-sky-700">配置: {block.name}</h3>
        <button onClick={() => selectBlock(null)} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      {/* 配置内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 块名称 */}
        <Field label="名称">
          <input
            className="input-field"
            value={block.name}
            onChange={(e) => updateBlock(block!.id, { name: e.target.value })}
          />
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
          <p className="text-sm text-gray-400">输出块自动展示上一栏的结果，无需额外配置。</p>
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
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
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
              className="px-2.5 py-2 rounded-lg bg-sky-50 border border-sky-200 text-xs"
            >
              {/* 连接头: 名称 + 删除 */}
              <div className="flex items-center justify-between text-sky-700">
                <span className="flex items-center gap-1.5">
                  <span className="text-sky-400">←</span>
                  <span className="font-medium">{sourceBlock?.name || conn.from_block_id}</span>
                </span>
                <button
                  onClick={() => onRemove(block.id, conn.from_block_id)}
                  className="text-sky-400 hover:text-red-500 transition"
                  title="断开连接"
                >
                  <X size={12} />
                </button>
              </div>

              {/* 输出 Key 选择器 — 仅当源块定义了 output_schema 时显示 */}
              {hasKeys && (
                <div className="mt-1.5">
                  <label className="block text-[10px] text-gray-400 mb-0.5">选择接收的输出字段</label>
                  <select
                    className="w-full px-2 py-1 text-xs border border-sky-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-sky-300"
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
                <p className="mt-1 text-[10px] text-sky-500">
                  📌 仅接收: <span className="font-mono font-medium">{conn.from_key}</span>
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">
        💡 通过端口连接：点击源块右侧圆点 → 目标块左侧圆点
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
                        <p className="text-[10px] text-gray-400 font-medium mb-1">📥 用户输入</p>
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
                        <p className="text-[10px] text-gray-400 font-medium mb-1">🧩 上游块输出</p>
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
            💡 使用 <code className="bg-gray-100 px-1 rounded">{'{{'}</code>变量名<code className="bg-gray-100 px-1 rounded">{'}}'}</code> 精确引用上游数据；不用变量则自动传入全部上游数据
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
              {p.name} ({p.model}){p.is_default ? ' ⭐' : ''}
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
  return (
    <>
      <div className="p-3 bg-teal-50 rounded-lg">
        <p className="text-xs text-teal-700 font-medium mb-1">🔌 插件块</p>
        <p className="text-xs text-teal-600">
          插件 ID: <span className="font-mono">{block.config.plugin_id || '未配置'}</span>
        </p>
        <p className="text-xs text-gray-500 mt-2">
          插件的参数（如 Token）在「插件管理」页面中配置。
          此处无需额外设置，运行时会自动使用已配置的参数。
        </p>
      </div>
    </>
  )
}

// ===== Input 块配置 =====

function InputConfig({ block }: { block: Block }) {
  const { updateBlock } = useWorkflowStore()
  const fields = block.config.fields || []

  const addField = () => {
    const name = prompt('字段名称:')
    if (name) {
      updateBlock(block.id, {
        config: {
          ...block.config,
          fields: [...fields, { name, label: name, field_type: 'text' as const, required: true }],
        },
      })
    }
  }

  return (
    <>
      <p className="text-xs text-gray-500">定义用户需要填写的输入字段</p>
      {fields.map((field, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm text-gray-600 flex-1">{field.label || field.name}</span>
          <span className="text-xs text-gray-400">{field.field_type}</span>
        </div>
      ))}
      <button onClick={addField} className="text-xs text-sky-500 hover:text-sky-700">
        + 添加字段
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
