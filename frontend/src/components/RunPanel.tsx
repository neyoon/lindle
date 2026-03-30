/**
 * 运行结果面板 - 底部可折叠
 */
import { ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow'

/** 将任意数据安全转为可显示字符串，限制最大长度 */
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
  const { runResult, isRunning } = useWorkflowStore()
  const [expanded, setExpanded] = useState(true)

  if (!runResult && !isRunning) return null

  return (
    <div className="border-t bg-white">
      {/* 折叠头 */}
      <button
        onClick={() => setExpanded(!expanded)}
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
        {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {/* 结果内容 */}
      {expanded && runResult && (
        <div className="px-4 pb-4 max-h-64 overflow-y-auto">
          {/* 步骤列表 */}
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

          {/* 最终输出 */}
          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold text-gray-500 mb-1">最终输出</h4>
            <pre className="p-3 bg-indigo-50 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap break-words">
              {formatData(runResult.output, 2000)}
            </pre>
          </div>

          {/* 错误信息 */}
          {runResult.error && (
            <div className="mt-2 p-3 bg-red-50 rounded-lg text-sm text-red-600">
              {runResult.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
