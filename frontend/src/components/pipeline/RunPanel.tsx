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
function formatData(data: unknown, maxLen = 500): string {
  if (data == null) return ''
  if (typeof data === 'string') return data.slice(0, maxLen)
  try {
    const text = JSON.stringify(data, null, 2)
    return text.slice(0, maxLen)
  } catch {
    return String(data).slice(0, maxLen)
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
    <div className="border-t bg-white">
      {/* 输入区 */}
      {hasInputs && (
        <div className="px-4 py-3 flex flex-wrap gap-3 border-b border-gray-50">
          {inputFields.map((field) => (
            <div key={field.name} className="flex-1 min-w-[200px] max-w-md">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {field.label || field.name}
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              {field.field_type === 'textarea' ? (
                <textarea
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 resize-y min-h-[36px] max-h-[100px]"
                  value={userInputs[field.name] || ''}
                  onChange={(e) => setUserInput(field.name, e.target.value)}
                  placeholder={`输入${field.label || field.name}...`}
                />
              ) : (
                <input
                  type={field.field_type === 'number' ? 'number' : 'text'}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
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
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              {isRunning ? (
                <span className="text-sm text-blue-500">运行中...</span>
              ) : runResult?.success ? (
                <>
                  <CheckCircle size={16} className="text-green-500" />
                  <span className="text-sm text-green-600">
                    运行成功 ({runResult.total_elapsed}s)
                  </span>
                </>
              ) : (
                <>
                  <XCircle size={16} className="text-red-500" />
                  <span className="text-sm text-red-600">运行失败</span>
                </>
              )}
            </div>
            {showResult ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>

          {showResult && runResult && (
            <div className="px-4 pb-4 max-h-64 overflow-y-auto">
              <div className="space-y-2 mb-3">
                {runResult.steps
                  .filter((s) => s.event_type === 'block_done')
                  .map((step, i) => {
                    const text = formatData(step.data)
                    return (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-gray-600">[{step.block_name}]</span>
                        <span className="text-gray-400 ml-2">{step.elapsed}s</span>
                        {text && (
                          <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                            {text}
                          </pre>
                        )}
                      </div>
                    )
                  })}
              </div>

              <div className="border-t pt-3">
                <h4 className="text-xs font-semibold text-gray-500 mb-1">最终输出</h4>
                <pre className="p-3 bg-sky-50 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap break-words">
                  {formatData(runResult.output, 2000)}
                </pre>
              </div>

              {runResult.error && (
                <div className="mt-2 p-3 bg-red-50 rounded-lg text-sm text-red-600">
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
