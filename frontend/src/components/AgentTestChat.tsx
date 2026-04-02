/**
 * Agent 测试对话框
 *
 * 浮动在右下角的小对话框，用于测试 Agent
 */
import { useState } from 'react'
import { Send, X, MessageCircle, Minimize2, Maximize2 } from 'lucide-react'
import { chatWithAgent } from '@/api/client'
import type { ChatMessage } from '@/types/agent'

interface Props {
  agentId: string
  agentName: string
}

export function AgentTestChat({ agentId, agentName }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // 调用真实的 Agent API
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const response = await chatWithAgent(agentId, userMessage.content, history)

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message.content,
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (e) {
      console.error('发送失败:', e)
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `发送失败：${e}`,
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
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
        ⚠️ 这是测试环境，用于验证 Agent 配置
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            开始对话测试你的 Agent
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-3 py-2 rounded-lg text-sm text-gray-500">
              <span className="inline-block animate-pulse">思考中...</span>
            </div>
          </div>
        )}
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
