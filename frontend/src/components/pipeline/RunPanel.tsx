/**
 * 运行面板 - 底部常驻
 *
 * 两个区域:
 * 1. 输入表单: 根据工作流中 Input 块的字段定义，让用户填写值（始终可见，方便反复测试）
 * 2. 结果展示: 步骤详情 + 最终输出
 */
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import type { InputField } from '@/types/workflow'

/** 将任意数据安全转为可显示字符串 */
function formatData(data: unknown): string {
  if (data == null) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

export function RunPanel() {
  const { workflow, runResult, isRunning, userInputs, setUserInput } = useWorkflowStore()
  const [showResult, setShowResult] = useState(true)

  // 收集所有 Input 块定义的字段
  const inputFields = useMemo(() => {
    const fields: InputField[] = []
    const sorted = [...workflow.columns].sort((a, b) => a.order - b.order)
    for (const col of sorted) {
      for (const block of col.blocks) {
        if (block.type === 'input' && block.config.fields) {
          fields.push(...block.config.fields)
        }
      }
    }
    return fields
  }, [workflow.columns])

  const hasInputs = inputFields.length > 0

  return (
    <div className="editor-runbar">
      {/* 输入区 */}
      {hasInputs && (
        <div className="flex flex-wrap gap-3 border-b border-[var(--app-border)] px-4 py-3">
          {inputFields.map((field) => (
            <div key={field.name} className="flex-1 min-w-[200px] max-w-md">
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-soft)]">
                {field.label || field.name}
                {field.required && <span className="ml-0.5 text-[var(--app-danger)]">*</span>}
              </label>
              {field.field_type === 'textarea' ? (
                <textarea
                  className="app-input min-h-[36px] max-h-[100px] resize-y py-1.5"
                  value={userInputs[field.name] || ''}
                  onChange={(e) => setUserInput(field.name, e.target.value)}
                  placeholder={`输入${field.label || field.name}...`}
                />
              ) : (
                <input
                  type={field.field_type === 'number' ? 'number' : 'text'}
                  className="app-input py-1.5"
                  value={userInputs[field.name] || ''}
                  onChange={(e) => setUserInput(field.name, e.target.value)}
                  placeholder={`输入${field.label || field.name}...`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 运行结果 */}
      {(runResult || isRunning) && (
        <>
          <button
            onClick={() => setShowResult(!showResult)}
            className="flex w-full items-center justify-between px-4 py-2 hover:bg-[rgba(255,255,255,0.04)]"
          >
            <div className="flex items-center gap-2">
              {isRunning ? (
                <span className="text-sm text-[var(--app-accent)]">运行中...</span>
              ) : runResult?.success ? (
                <>
                  <CheckCircle size={16} className="text-[var(--app-success)]" />
                  <span className="text-sm text-[var(--app-success)]">
                    运行成功 ({runResult.total_elapsed}s)
                  </span>
                </>
              ) : (
                <>
                  <XCircle size={16} className="text-[var(--app-danger)]" />
                  <span className="text-sm text-[var(--app-danger)]">运行失败</span>
                </>
              )}
            </div>
            {showResult ? <ChevronDown size={16} className="text-[var(--app-text-soft)]" /> : <ChevronUp size={16} className="text-[var(--app-text-soft)]" />}
          </button>

          {showResult && runResult && (
            <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2 mb-3">
                {runResult.steps
                  .filter((s) => s.event_type === 'block_done')
                  .map((step, i) => {
                    const text = formatData(step.data)
                    return (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-[var(--app-text)]">[{step.block_name}]</span>
                        <span className="ml-2 text-[var(--app-text-muted)]">{step.elapsed.toFixed(1)}s</span>
                        {text && (
                          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[rgba(255,255,255,0.05)] p-2 text-xs text-[var(--app-text-soft)]">
                            {text}
                          </pre>
                        )}
                      </div>
                    )
                  })}
              </div>

              <div className="border-t border-[var(--app-border)] pt-3">
                <h4 className="mb-1 text-xs font-semibold text-[var(--app-text-soft)]">最终输出</h4>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[rgba(109,204,255,0.1)] p-3 text-sm text-[var(--app-text)]">
                  {formatData(runResult.output)}
                </pre>
              </div>

              {runResult.error && (
                <div className="mt-2 rounded-2xl bg-[rgba(244,107,122,0.08)] p-3 text-sm text-[var(--app-danger)]">
                  {runResult.error}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
