/**
 * Agent 测试对话框
 *
 * 浮动在右下角的小对话框，用于测试 Agent
 * 支持展示工具调用过程（tool_call/tool_result）
 */
import { useState, useRef, useEffect } from 'react'
import { Send, X, MessageCircle, Minimize2, Maximize2, Wrench, CheckCircle, ChevronDown, ChevronUp, StopCircle } from 'lucide-react'
import { chatWithAgentStream } from '@/api/client'
import type { ChatMessage } from '@/types/agent'

interface Props {
  agentId: string
  agentName: string
}

type StreamPhase = 'idle' | 'thinking' | 'tool-running' | 'responding'

export function AgentTestChat({ agentId, agentName }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle')
  const [liveReasoning, setLiveReasoning] = useState('')
  const [liveStatus, setLiveStatus] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveReasoning, liveStatus, loading])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setStreamPhase('thinking')
    setLiveReasoning('')
    setLiveStatus('正在思考...')

    try {
      // 使用流式 API
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
        tool_name: m.tool_name,
      }))

      let currentReasoningByRound = ''
      let currentContent = ''
      let isStreamingAssistant = false

      for await (const event of chatWithAgentStream(agentId, userMessage.content, history)) {
        if (event.type === 'round_start') {
          currentReasoningByRound = ''
          currentContent = ''
          isStreamingAssistant = false
          setStreamPhase('thinking')
          setLiveReasoning('')
          setLiveStatus('正在思考...')
        } else if (event.type === 'reasoning_delta') {
          currentReasoningByRound += event.data.delta
          setStreamPhase('thinking')
          setLiveReasoning(currentReasoningByRound)
          setLiveStatus('正在思考...')
        } else if (event.type === 'assistant_delta') {
          currentContent += event.data.delta
          setStreamPhase('responding')
          setLiveStatus('正在生成回复...')

          if (!isStreamingAssistant) {
            isStreamingAssistant = true
            const tempMsg: ChatMessage = {
              role: 'assistant',
              content: currentContent,
            }
            setMessages(prev => [...prev, tempMsg])
          } else {
            setMessages(prev => {
              const newMessages = [...prev]
              if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: currentContent,
                }
              }
              return newMessages
            })
          }
        } else if (event.type === 'tool_call') {
          const msg: ChatMessage = {
            role: 'tool_call',
            content: event.data.content,
            tool_calls: event.data.tool_calls,
          }
          setMessages(prev => [...prev, msg])
          currentReasoningByRound = ''
          currentContent = ''
          isStreamingAssistant = false
          setStreamPhase('tool-running')
          setLiveReasoning('')
          setLiveStatus('正在准备工具调用...')
        } else if (event.type === 'tool_status') {
          setStreamPhase('tool-running')
          setLiveStatus(event.data.message || '正在执行工具...')
        } else if (event.type === 'tool_result') {
          const msg: ChatMessage = {
            role: 'tool_result',
            content: event.data.content,
            tool_call_id: event.data.tool_call_id,
            tool_name: event.data.tool_name,
          }
          setMessages(prev => [...prev, msg])
          setStreamPhase('thinking')
          setLiveStatus('工具执行完成，继续思考...')
        } else if (event.type === 'assistant_message') {
          if (isStreamingAssistant) {
            isStreamingAssistant = false
            currentContent = ''
          } else {
            const msg: ChatMessage = {
              role: 'assistant',
              content: event.data.content,
            }
            setMessages(prev => [...prev, msg])
          }
          setStreamPhase('idle')
          setLiveReasoning('')
          setLiveStatus('')
        } else if (event.type === 'error') {
          setStreamPhase('idle')
          setLiveReasoning('')
          setLiveStatus('')
          const errorMsg: ChatMessage = {
            role: 'assistant',
            content: `错误：${event.data?.message || '未知错误'}`,
          }
          setMessages(prev => [...prev, errorMsg])
          break
        } else if (event.type === 'done') {
          setStreamPhase('idle')
          setLiveReasoning('')
          setLiveStatus('')
          break
        }
      }
    } catch (e) {
      console.error('发送失败:', e)
      setStreamPhase('idle')
      setLiveReasoning('')
      setLiveStatus('')
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `发送失败：${e}`,
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleStop = () => {
    // TODO: 实现打断功能（需要后端支持）
    setLoading(false)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-purple-500 text-white rounded-full shadow-lg hover:bg-purple-600 transition flex items-center justify-center"
        title="测试对话"
      >
        <MessageCircle size={24} />
      </button>
    )
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-xl border border-gray-200">
        <div className="flex items-center gap-2 px-4 py-3">
          <MessageCircle size={16} className="text-purple-500" />
          <span className="text-sm font-medium">测试对话</span>
          <button
            onClick={() => setIsMinimized(false)}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-purple-50">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-purple-500" />
          <div>
            <div className="text-sm font-medium">测试对话</div>
            <div className="text-xs text-gray-500">{agentName}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 提示 */}
      <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100 text-xs text-yellow-700">
        这是测试环境，用于验证 Agent 配置
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            开始对话测试你的 Agent
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageItem key={i} message={msg} />
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-3 py-2 rounded-lg text-sm text-gray-700 max-w-[80%]">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block animate-pulse">
                  {liveStatus || (streamPhase === 'responding' ? '正在生成回复...' : '处理中...')}
                </span>
                <button
                  onClick={handleStop}
                  className="text-red-500 hover:text-red-700"
                  title="停止"
                >
                  <StopCircle size={14} />
                </button>
              </div>
              {liveReasoning && (
                <div className="text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200 pt-2 mt-2">
                  {liveReasoning}
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageItem({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false)

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-3 py-2 rounded-lg text-sm bg-purple-500 text-white">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-800 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool_call') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
            <Wrench size={14} />
            工具调用
          </div>
          {message.tool_calls?.map((tc, i) => (
            <div key={i} className="text-xs text-gray-700 space-y-1">
              <div className="font-medium">{tc.name}</div>
              <div className="text-gray-500">
                参数: <code className="bg-white px-1 rounded">{tc.arguments?.slice(0, 50)}...</code>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (message.role === 'tool_result') {
    const content = message.content || ''

    // 尝试解析 JSON
    let jsonContent: any = null
    try {
      jsonContent = JSON.parse(content)
    } catch {}

    // 对 workflow_executor 的结果做友好展示：提取 output，元信息变标签
    const isFlowResult = jsonContent && typeof jsonContent === 'object' && 'success' in jsonContent && 'output' in jsonContent
    let displayData: any = null
    let metaLine = ''

    if (isFlowResult) {
      displayData = jsonContent.output
      const status = jsonContent.success ? '成功' : '失败'
      const elapsed = jsonContent.elapsed != null ? `${jsonContent.elapsed.toFixed(1)}s` : ''
      metaLine = `${status}${elapsed ? ` · ${elapsed}` : ''}${jsonContent.error ? ` · ${jsonContent.error}` : ''}`
    } else if (jsonContent) {
      displayData = jsonContent
    }

    const displayStr = displayData != null
      ? (typeof displayData === 'string' ? displayData : JSON.stringify(displayData, null, 2))
      : content
    const isLong = displayStr.length > 500

    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] border border-green-200 bg-green-50 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
            <CheckCircle size={14} />
            工具结果: {message.tool_name}
          </div>
          {metaLine && (
            <div className="text-xs text-gray-500 mb-2">{metaLine}</div>
          )}
          <div className="text-xs">
            {typeof displayData === 'string' ? (
              <div className="bg-white p-2 rounded text-gray-700 whitespace-pre-wrap">
                {expanded || !isLong ? displayStr : displayStr.slice(0, 500) + '...'}
              </div>
            ) : (
              <pre className="bg-white p-2 rounded overflow-x-auto text-gray-700">
                {expanded || !isLong ? displayStr : displayStr.slice(0, 500) + '...'}
              </pre>
            )}
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 text-green-600 hover:text-green-800 flex items-center gap-1"
              >
                {expanded ? (
                  <>
                    <ChevronUp size={12} /> 收起
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} /> 展开
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
