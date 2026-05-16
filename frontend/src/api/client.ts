import type {
  BlockTemplate,
  EnabledPlugin,
  PluginInfo,
  RunResult,
  StepEvent,
  Workflow,
  WorkflowSummary,
} from '@/types/workflow'
import type { Agent, ChatMessage } from '@/types/agent'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 600000) // 10分钟超时

  try {
    const headers = new Headers(options?.headers || {})
    if (!headers.has('Content-Type') && options?.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`${BASE}${path}`, {
      headers,
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.text()
      let message = `API Error: ${response.status} - ${error}`
      try {
        const parsed = JSON.parse(error) as { detail?: string; message?: string }
        message = parsed.detail || parsed.message || message
      } catch {}
      throw new Error(message)
    }
    return response.json()
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时（10分钟）')
    }
    throw error
  }
}

export async function listWorkflows() {
  return request<WorkflowSummary[]>('/workflows/')
}

export async function getWorkflow(id: string) {
  return request<Workflow>(`/workflows/${id}`)
}

export async function saveWorkflow(workflow: Workflow) {
  return request<Workflow>('/workflows/', {
    method: 'POST',
    body: JSON.stringify(workflow),
  })
}

export async function updateWorkflow(id: string, workflow: Workflow) {
  return request<Workflow>(`/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(workflow),
  })
}

export async function deleteWorkflow(id: string) {
  return request(`/workflows/${id}`, { method: 'DELETE' })
}

export async function runWorkflow(id: string, inputs: Record<string, unknown>) {
  return request<RunResult>(`/run/${id}`, {
    method: 'POST',
    body: JSON.stringify({ inputs }),
  })
}

export async function* runWorkflowStream(id: string, inputs: Record<string, unknown>): AsyncGenerator<StepEvent, void, void> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 600000)

  try {
    const response = await fetch(`${BASE}/run/${id}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs }),
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      const error = await response.text()
      throw new Error(error || `API Error: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() || ''

      for (const chunk of chunks) {
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') return
          yield JSON.parse(payload) as StepEvent
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时（10分钟）')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function downloadCode(id: string) {
  const response = await fetch(`${BASE}/codegen/${id}/download`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('下载失败')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workflow.zip`
  a.click()
  URL.revokeObjectURL(url)
}

async function downloadJsonFile(path: string, filename: string) {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) throw new Error('导出失败')
  const data = await response.json()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadWorkflowManifest(id: string) {
  return downloadJsonFile(`/workflows/${id}/export`, `workflow_${id}.json`)
}

export async function listPlugins() {
  return request<PluginInfo[]>('/plugins/')
}

export async function listSkills() {
  return request<PluginInfo[]>('/plugins/skills')
}

export async function getEnabledPlugins() {
  return request<EnabledPlugin[]>('/plugins/enabled')
}

export async function togglePlugin(pluginId: string, enabled: boolean) {
  return request<{ ok: boolean }>(`/plugins/${pluginId}/enabled`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export async function updatePluginConfig(pluginId: string, config: Record<string, string>) {
  return request<{ ok: boolean }>(`/plugins/${pluginId}/config`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

export interface SettingsSummary {
  api_key_set: boolean
  api_key_masked: string
  protocol: string
  base_url: string
  default_model: string
}

export interface ProviderResponse {
  id: string
  name: string
  protocol: string
  api_key_masked: string
  api_key_set: boolean
  base_url: string
  model: string
  api_version: string
  is_default: boolean
}

export interface ProviderInput {
  name: string
  protocol: string
  api_key: string
  base_url: string
  model: string
  api_version: string
}

export interface ProxyProtocol {
  id: string
  name: string
  status: string
  description: string
}

export interface ProxyChatRequest {
  messages: Record<string, any>[]
  provider_id?: string
  api_key?: string
  base_url?: string
  model?: string
  system_prompt?: string
  temperature?: number
  max_tokens?: number | null
  api_version?: string
  tools?: Record<string, any>[] | null
  tool_choice?: string
  extra_body?: Record<string, any>
}

export interface ResolvedProxyConfig {
  protocol: string
  api_key: string
  base_url: string
  model: string
  provider_id: string
  endpoint: string
}

export async function getSettings() {
  return request<SettingsSummary>('/settings/')
}

export async function listProxyProtocols() {
  return request<ProxyProtocol[]>('/proxy/protocols')
}

export async function resolveProxyProtocol(protocol: string, body: ProxyChatRequest) {
  return request<ResolvedProxyConfig>(`/proxy/${protocol}/resolve`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function proxyChat(protocol: string, body: ProxyChatRequest) {
  return request<Record<string, any>>(`/proxy/${protocol}/chat`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listProviders() {
  return request<ProviderResponse[]>('/settings/providers')
}

export async function addProvider(provider: ProviderInput) {
  return request<ProviderResponse>('/settings/providers', {
    method: 'POST',
    body: JSON.stringify(provider),
  })
}

export async function updateProvider(id: string, provider: ProviderInput) {
  return request<ProviderResponse>(`/settings/providers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(provider),
  })
}

export async function deleteProvider(id: string) {
  return request<{ message: string }>(`/settings/providers/${id}`, { method: 'DELETE' })
}

export async function setDefaultProvider(id: string) {
  return request<{ message: string }>(`/settings/providers/${id}/default`, { method: 'POST' })
}

export async function getEditProvider() {
  return request<{ provider_id: string }>('/settings/edit-provider')
}

export async function setEditProvider(providerId: string) {
  return request<{ provider_id: string }>('/settings/edit-provider', {
    method: 'POST',
    body: JSON.stringify({ provider_id: providerId }),
  })
}

export async function testConnection(params: {
  protocol?: string
  api_key?: string
  base_url: string
  model: string
  provider_id?: string
  api_version?: string
}) {
  return request<{ success: boolean; message: string }>('/settings/test', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function listTemplates() {
  return request<BlockTemplate[]>('/workspace/')
}

export async function createTemplate(template: BlockTemplate) {
  return request<BlockTemplate>('/workspace/', {
    method: 'POST',
    body: JSON.stringify(template),
  })
}

export async function updateTemplate(id: string, template: BlockTemplate) {
  return request<BlockTemplate>(`/workspace/${id}`, {
    method: 'PUT',
    body: JSON.stringify(template),
  })
}

export async function deleteTemplate(id: string) {
  return request<{ ok: boolean }>(`/workspace/${id}`, { method: 'DELETE' })
}

export async function listAgents() {
  return request<{ id: string; name: string; description: string; skill_count: number; created_at: string; updated_at: string }[]>('/agents/')
}

export async function getAgent(id: string) {
  return request<Agent>(`/agents/${id}`)
}

export async function createAgent(agent: Agent) {
  return request<Agent>('/agents/', {
    method: 'POST',
    body: JSON.stringify(agent),
  })
}

export async function updateAgent(id: string, agent: Agent) {
  return request<Agent>(`/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(agent),
  })
}

export async function deleteAgent(id: string) {
  return request<{ success: boolean }>(`/agents/${id}`, { method: 'DELETE' })
}

export async function downloadAgentManifest(id: string) {
  return downloadJsonFile(`/agents/${id}/export`, `agent_${id}.json`)
}

export async function getAgentConversation(agentId: string) {
  return request<{ agent_id: string; messages: ChatMessage[]; updated_at?: string | null }>(`/agents/${agentId}/conversation`)
}

export async function clearAgentConversation(agentId: string) {
  return request<{ success: boolean }>(`/agents/${agentId}/conversation`, {
    method: 'DELETE',
  })
}

export async function generateSystemPrompt(agentName: string, skills: { skill_id: string; name: string; description: string }[]) {
  return request<{ system_prompt: string }>('/agents/generate-prompt', {
    method: 'POST',
    body: JSON.stringify({ agent_name: agentName, skills }),
  })
}

export async function chatWithAgent(agentId: string, message: string, history: Record<string, any>[]) {
  return request<{ messages: Record<string, any>[]; reasoning: string }>(`/agents/${agentId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  })
}

export async function* chatWithAgentStream(
  agentId: string,
  message: string,
  history: Record<string, any>[],
  signal?: AbortSignal
): AsyncGenerator<{ type: string; data: any }> {
  const response = await fetch(`${BASE}/agents/${agentId}/chat-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
    signal,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API Error: ${response.status} - ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (!data) continue

          try {
            const event = JSON.parse(data)
            yield event
          } catch (e) {
            console.error('Failed to parse SSE data:', data, e)
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function listCustomSkills() {
  return request<any[]>('/plugins/custom-skills')
}

export async function createCustomSkill(skill: any) {
  return request<{ ok: boolean; skill: any }>('/plugins/custom-skills', {
    method: 'POST',
    body: JSON.stringify(skill),
  })
}

export async function getCustomSkill(skillId: string) {
  return request<any>(`/plugins/custom-skills/${skillId}`)
}

export async function deleteCustomSkill(skillId: string) {
  return request<{ ok: boolean }>(`/plugins/custom-skills/${skillId}`, {
    method: 'DELETE',
  })
}

export async function exportFlowsToSkill(
  flowIds: string[],
  skillName?: string,
  skillDescription?: string
) {
  return request<{ ok: boolean; skill: any }>('/plugins/generate-flow-skill', {
    method: 'POST',
    body: JSON.stringify({
      flow_ids: flowIds,
      skill_name: skillName,
      skill_description: skillDescription,
    }),
  })
}
