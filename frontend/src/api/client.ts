/**
 * API 客户端
 */
import type { BlockTemplate, EnabledPlugin, PluginInfo, RunResult, Workflow } from '@/types/workflow'

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
  return request<{ id: string; name: string; description: string }[]>('/workflows/')
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
