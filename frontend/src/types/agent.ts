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
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  tool_calls?: ToolCallInfo[]      // role=tool_call 时包含工具调用信息
  tool_call_id?: string | null     // role=tool_result 时关联的调用 ID
  tool_name?: string | null        // role=tool_result 时的工具名称
}

export interface ToolCallInfo {
  id: string
  name: string
  arguments: string
}
