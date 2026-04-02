/**
 * Agent 类型定义
 *
 * Agent 是一个可以动态调用 Skills 的智能助手
 * Skills 复用现有的 Plugin 系统
 */

export interface AgentSkill {
  skill_id: string
  order: number
  config: Record<string, string>
}

export interface Agent {
  id: string
  name: string
  description: string
  system_prompt: string
  model_provider_id?: string | null
  skills: AgentSkill[]
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls?: ToolCall[]
  reasoning?: string  // 思考过程
}

export interface ToolCall {
  skill_id: string
  skill_name: string
  input: string
  output: string
}

export interface ChatResponse {
  message: ChatMessage
  finish_reason: string
}
