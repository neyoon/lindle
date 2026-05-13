/**
 * 运行面板 - 底部常驻
 *
 * 两个区域:
 * 1. 输入表单: 根据工作流中 Collect 步骤的字段定义，让用户填写值（始终可见，方便反复测试）
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
  const { workflow, runResult, runEvents, liveOutput, isRunning, userInputs, setUserInput } = useWorkflowStore()
  const [showResult, setShowResult] = useState(true)

  // 收集所有 Collect 步骤定义的字段
  const { inputFields, hasCollectBlock } = useMemo(() => {
    const fields: InputField[] = []
    let hasCollect = false
    const sorted = [...workflow.columns].sort((a, b) => a.order - b.order)
    for (const col of sorted) {
      for (const block of col.blocks) {
        if (block.type === 'collect') hasCollect = true
        if (block.type === 'collect' && block.config.fields) {
          fields.push(...block.config.fields)
        }
      }
    }
    return { inputFields: fields, hasCollectBlock: hasCollect }
  }, [workflow.columns])

  const hasInputs = inputFields.length > 0
  const showSimpleInput = hasCollectBlock && !hasInputs
  const visibleSteps = useMemo(
    () => (isRunning ? runEvents : (runResult?.steps || [])).filter(
      (step) => step.event_type === 'block_start' || step.event_type === 'block_done' || step.event_type === 'error',
    ),
    [isRunning, runEvents, runResult?.steps],
  )
  const currentBlock = useMemo(
    () => [...visibleSteps].reverse().find((step) => step.event_type === 'block_start'),
    [visibleSteps],
  )
  const displayedOutput = isRunning ? liveOutput : runResult?.output
  const displayError = runResult?.error || visibleSteps.find((step) => step.event_type === 'error')?.error

  return (
    <div className="editor-runbar">
      {/* 输入区 */}
      {(hasInputs || showSimpleInput) && (
        <div className="flex flex-wrap gap-3 border-b border-[var(--app-border)] px-4 py-3">
          {showSimpleInput ? (
            <div className="flex-1 min-w-[260px] max-w-2xl">
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-soft)]">
                本次输入
              </label>
              <textarea
                className="app-input min-h-[48px] max-h-[120px] resize-y py-1.5"
                value={userInputs.input || ''}
                onChange={(e) => setUserInput('input', e.target.value)}
                placeholder="输入这次要处理的内容..."
              />
            </div>
          ) : (
            inputFields.map((field) => (
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
            ))
          )}
        </div>
      )}

      {/* 运行结果 */}
      {(runResult || isRunning || runEvents.length > 0) && (
        <>
          <button
            onClick={() => setShowResult(!showResult)}
            className="flex w-full items-center justify-between px-4 py-2 hover:bg-[var(--paper-warm)] transition"
          >
            <div className="flex items-center gap-2">
              {isRunning ? (
                <span className="flex items-center gap-2 text-sm text-[var(--app-accent-strong)]">
                  <span className="block w-1.5 h-1.5 rounded-full bg-[var(--rust)]" style={{ animation: 'ink-pulse 1.4s ease-in-out infinite' }} />
                  运行中
                  {currentBlock?.block_name ? <span className="font-mono text-xs text-[var(--ink-soft)]">· {currentBlock.block_name}</span> : null}
                </span>
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

          {showResult && (
            <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2 mb-3">
                {visibleSteps.map((step, i) => {
                  const text = step.event_type === 'block_done' ? formatData(step.data) : ''
                  return (
                    <div key={`${step.event_type}-${step.block_id || i}-${i}`} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            step.event_type === 'block_done'
                              ? 'text-[var(--app-success)]'
                              : step.event_type === 'error'
                                ? 'text-[var(--app-danger)]'
                                : 'text-[var(--app-accent)]'
                          }
                        >
                          {step.event_type === 'block_done' ? '完成' : step.event_type === 'error' ? '失败' : '运行中'}
                        </span>
                        <span className="font-medium text-[var(--app-text)]">[{step.block_name || '工作流'}]</span>
                        <span className="text-[var(--app-text-muted)]">{step.elapsed.toFixed(1)}s</span>
                      </div>
                      {text && (
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-2 text-xs text-[var(--app-text-soft)]">
                          {text}
                        </pre>
                      )}
                      {step.event_type === 'error' && step.error && (
                        <div className="mt-1 rounded-sm border border-[var(--bruise-soft)] bg-[var(--bruise-soft)] p-2 text-[var(--app-danger)]">
                          {step.error}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {(displayedOutput != null || isRunning) && (
                <div className="border-t border-[var(--app-border)] pt-3">
                <h4 className="app-kicker no-rule mb-2 text-[0.65rem]">
                  {isRunning ? '实时输出' : '最终输出'}
                </h4>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-[var(--line)] bg-[var(--card-soft)] p-3 text-sm text-[var(--app-text)]">
                  {displayedOutput == null ? '等待输出...' : formatData(displayedOutput)}
                </pre>
                </div>
              )}

              {displayError && (
                <div className="mt-2 rounded-sm border border-[var(--bruise-soft)] bg-[var(--bruise-soft)] p-3 text-sm text-[var(--app-danger)]">
                  {displayError}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
