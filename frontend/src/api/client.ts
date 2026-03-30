/**
 * API 客户端
 */
import type { RunResult, ToolInfo, Workflow } from '@/types/workflow'

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

// ===== Workflow =====

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

// ===== Tools =====

export async function listTools() {
  return request<ToolInfo[]>('/tools')
}
