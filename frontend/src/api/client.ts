/**
 * API 客户端
 */
import type { BlockTemplate, EnabledPlugin, PluginInfo, RunResult, Workflow, WorkflowSummary } from '@/types/workflow'
import type { Agent, ChatMessage } from '@/types/agent'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API Error: ${response.status} - ${error}`)
  }
  return response.json()
}

// ===== Workflow (Pipeline) =====

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

export async function aiEditWorkflow(id: string, instruction: string) {
  return request<Workflow>(`/workflows/${id}/ai-edit`, {
    method: 'POST',
    body: JSON.stringify({ instruction }),
  })
}

// ===== Execution =====

export async function runWorkflow(id: string, inputs: Record<string, unknown>) {
  return request<RunResult>(`/run/${id}`, {
    method: 'POST',
    body: JSON.stringify({ inputs }),
  })
}

// ===== Code Generation =====

export async function previewCode(id: string) {
  return request<{ project_name: string; files: Record<string, string> }>(`/codegen/${id}/preview`, {
    method: 'POST',
  })
}

export async function downloadCode(id: string) {
  const response = await fetch(`${BASE}/codegen/${id}/download`, { method: 'POST' })
  if (!response.ok) throw new Error('下载失败')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workflow.zip`
  a.click()
  URL.revokeObjectURL(url)
}

// ===== Plugins =====

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

// ===== Settings (LLM Provider 管理) =====

/** 启动检查用：是否有已配置的 Provider */
export interface SettingsSummary {
  api_key_set: boolean
  api_key_masked: string
  base_url: string
  default_model: string
}

export interface ProviderResponse {
  id: string
  name: string
  api_key_masked: string
  api_key_set: boolean
  base_url: string
  model: string
  is_default: boolean
}

export interface ProviderInput {
  name: string
  api_key: string
  base_url: string
  model: string
}

export async function getSettings() {
  return request<SettingsSummary>('/settings/')
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

export async function getAIEditProvider() {
  return request<{ provider_id: string }>('/settings/ai-edit-provider')
}

export async function setAIEditProvider(providerId: string) {
  return request<{ provider_id: string }>('/settings/ai-edit-provider', {
    method: 'POST',
    body: JSON.stringify({ provider_id: providerId }),
  })
}

export async function testConnection(params: { api_key?: string; base_url: string; model: string; provider_id?: string }) {
  return request<{ success: boolean; message: string }>('/settings/test', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ===== Workspace (块模板) =====

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

// ===== Agents =====

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

export async function generateSystemPrompt(agentName: string, skills: { skill_id: string; name: string; description: string }[]) {
  return request<{ system_prompt: string }>('/agents/generate-prompt', {
    method: 'POST',
    body: JSON.stringify({ agent_name: agentName, skills }),
  })
}

export async function chatWithAgent(agentId: string, message: string, history: { role: string; content: string }[]) {
  return request<{ message: { role: string; content: string }; tool_calls: any[]; reasoning?: string }>(`/agents/${agentId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  })
}

// ===== Custom Skills =====

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

