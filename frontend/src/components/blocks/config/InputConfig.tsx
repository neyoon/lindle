import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow'
import type { Block, InputField } from '@/types/workflow'

const FIELD_TYPE_OPTIONS: { value: InputField['field_type']; label: string }[] = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'file', label: '文件' },
]

export function InputConfig({ block }: { block: Block }) {
  const { updateBlock, renameInputReference } = useWorkflowStore()
  const workflow = useWorkflowStore((s) => s.workflow)
  const [showAdvancedFields, setShowAdvancedFields] = useState(false)
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
      <div className="rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[var(--app-text)]">运行时输入</div>
            <p className="mt-1 text-xs text-[var(--app-text-soft)]">
              {fields.length > 0
                ? `已配置 ${fields.length} 个字段`
                : '默认使用一个简单输入框；需要多个字段时再展开高级配置。'}
            </p>
          </div>
          <button
            onClick={() => setShowAdvancedFields((value) => !value)}
            className="flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-xs text-[var(--app-accent-strong)] transition hover:bg-[var(--app-accent-soft)]"
            type="button"
          >
            {showAdvancedFields ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            高级字段
          </button>
        </div>
      </div>

      {showAdvancedFields && (
        <>
          {fields.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-[var(--app-text-muted)] mb-3">当前没有自定义字段</p>
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={i} className="p-3 bg-[var(--paper-warm)] rounded-sm border border-[var(--line)] space-y-2">
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

                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[var(--app-text-muted)]">稳定引用名</label>
                    <input
                      className="input-field py-1 text-xs font-mono"
                      value={field.name}
                      onChange={(e) => updateField(i, { name: e.target.value.replace(/\s+/g, '_') })}
                      placeholder="topic"
                    />
                  </div>

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
      )}
    </>
  )
}
