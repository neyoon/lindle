import { useState, useRef, useEffect } from 'react'
import { Send, X, MessageCircle, Minimize2, Maximize2, Wrench, CheckCircle, ChevronDown, ChevronUp, StopCircle } from 'lucide-react'
import { chatWithAgentStream, getAgentConversation } from '@/api/client'
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
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveReasoning, liveStatus, loading])

  useEffect(() => {
    if (!isOpen) return
    getAgentConversation(agentId)
      .then((conversation) => setMessages(conversation.messages || []))
      .catch(() => {})
  }, [agentId, isOpen])

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
      const controller = new AbortController()
      abortRef.current = controller
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

      for await (const event of chatWithAgentStream(agentId, userMessage.content, history, controller.signal)) {
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
      setStreamPhase('idle')
      setLiveReasoning('')
      setLiveStatus('')

      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }

      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `发送失败：${e}`,
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreamPhase('idle')
    setLiveReasoning('')
    setLiveStatus('')
    setLoading(false)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--ink)] text-[var(--paper)] rounded-full shadow-[var(--app-shadow)] hover:bg-[var(--rust-ink)] transition flex items-center justify-center"
        title="测试对话"
        style={{ animation: 'stamp-land 0.5s var(--ease-ink)' }}
      >
        <MessageCircle size={24} />
      </button>
    )
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 rounded-sm bg-[var(--card)] shadow-[var(--app-shadow)] border border-[var(--line)]">
        <div className="flex items-center gap-2 px-4 py-3">
          <MessageCircle size={16} className="text-[var(--rust)]" />
          <span className="text-sm font-medium" style={{ fontFamily: '"Noto Serif SC", serif' }}>测试对话</span>
          <button
            onClick={() => setIsMinimized(false)}
            className="ml-2 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-[var(--card)] rounded-sm shadow-[var(--app-shadow)] border border-[var(--line)] flex flex-col"
         style={{ animation: 'panel-slide-in 0.4s var(--ease-ink)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] bg-[var(--paper-warm)]">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-[var(--rust)]" />
          <div>
            <div className="text-sm font-medium" style={{ fontFamily: '"Noto Serif SC", serif' }}>测试对话</div>
            <div className="text-xs text-[var(--app-text-muted)]">{agentName}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] p-1"
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] p-1"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 bg-[var(--rust-soft)] border-b border-[var(--line)] text-xs text-[var(--app-warning)]">
        测试对话
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-[var(--app-text-muted)] text-sm py-8" style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>
            暂无消息
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageItem key={i} message={msg} />
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--paper-warm)] border border-[var(--line)] px-3 py-2 rounded-sm text-sm text-[var(--app-text)] max-w-[80%]">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block animate-pulse">
                  {liveStatus || (streamPhase === 'responding' ? '正在生成回复...' : '处理中...')}
                </span>
                <button
                  onClick={handleStop}
                  className="text-[var(--app-danger)] hover:opacity-80"
                  title="停止"
                >
                  <StopCircle size={14} />
                </button>
              </div>
              {liveReasoning && (
                <div className="text-xs text-[var(--app-text-soft)] whitespace-pre-wrap border-t border-[var(--line)] pt-2 mt-2">
                  {liveReasoning}
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[var(--line)] p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className="app-input flex-1 text-sm"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="app-button app-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="max-w-[80%] px-3 py-2 rounded-sm text-sm bg-[var(--ink)] text-[var(--paper)]">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] px-3 py-2 rounded-sm text-sm border border-[var(--line)] bg-[var(--paper-warm)] text-[var(--app-text)] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool_call') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] border border-[var(--line)] bg-[var(--rust-soft)] rounded-sm p-3 text-sm">
          <div className="flex items-center gap-2 text-[var(--app-warning)] font-medium mb-2">
            <Wrench size={14} />
            工具调用
          </div>
          {message.tool_calls?.map((tc, i) => (
            <div key={i} className="text-xs text-[var(--app-text)] space-y-1">
              <div className="font-medium">{tc.name}</div>
              <div className="text-[var(--app-text-soft)]">
                参数: <code className="bg-[var(--card)] border border-[var(--line)] px-1 rounded-sm font-mono">{tc.arguments?.slice(0, 50)}...</code>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (message.role === 'tool_result') {
    const content = message.content || ''

    let jsonContent: any = null
    try {
      jsonContent = JSON.parse(content)
    } catch {}

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
    const lineCount = displayStr.split('\n').length
    const isLong = lineCount > 3 || displayStr.length > 220
    const bodyClass = expanded || !isLong ? '' : 'line-clamp-3'

    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] border border-[var(--line)] bg-[var(--moss-soft)] rounded-sm p-3 text-sm">
          <div className="flex items-center gap-2 text-[var(--app-success)] font-medium mb-1">
            <CheckCircle size={14} />
            工具结果: {message.tool_name}
          </div>
          {metaLine && (
            <div className="text-xs text-[var(--app-text-soft)] mb-2">{metaLine}</div>
          )}
          <div className="text-xs">
            <div
              className={`bg-[var(--card)] border border-[var(--line)] p-2 rounded-sm whitespace-pre-wrap ${typeof displayData === 'string' ? 'text-[var(--app-text)]' : 'font-mono text-[var(--app-text)]'} ${bodyClass}`}
            >
              {displayStr}
            </div>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 text-[var(--app-success)] hover:opacity-80 flex items-center gap-1"
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
