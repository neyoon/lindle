import { ChevronDown, ChevronUp, Variable } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { listProviders, type ProviderResponse } from '@/api/client'
import { useWorkflowStore } from '@/stores/workflow'
import type { Block } from '@/types/workflow'
import { Field } from './Field'
import { OutputSchemaEditor } from './OutputSchemaEditor'
import { useAvailableVars } from './useAvailableVars'

export function AIConfig({ block }: { block: Block }) {
  const { updateBlock } = useWorkflowStore()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showVarPicker, setShowVarPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [providers, setProviders] = useState<ProviderResponse[]>([])

  useEffect(() => {
    listProviders().then(setProviders).catch(() => {})
  }, [])

  const availableVars = useAvailableVars(block)

  const insertVar = (template: string) => {
    const ta = textareaRef.current
    if (!ta) return

    const start = ta.selectionStart
    const end = ta.selectionEnd
    const current = block.config.prompt || ''
    const newValue = current.slice(0, start) + template + current.slice(end)

    updateBlock(block.id, { config: { ...block.config, prompt: newValue } })
    setShowVarPicker(false)

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
