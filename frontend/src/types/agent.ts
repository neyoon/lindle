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
  reasoning?: string | null
  tool_calls?: ToolCallInfo[]
  tool_call_id?: string | null
  tool_name?: string | null
}

export interface ToolCallInfo {
  id: string
  name: string
  arguments: string
}
