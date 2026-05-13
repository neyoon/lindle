import { useState } from 'react'
import type { OutputSchema } from '@/types/workflow'

export function OutputSchemaEditor({
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
