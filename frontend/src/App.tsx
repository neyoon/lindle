/**
 * MiniFlow 主应用
 *
 * 页面:
 * 0. 首页（选择 Flow 或 Agent）
 * 1. 工作流列表
 * 2. 工作流编辑器
 * 3. 插件管理页面
 * 4. 制造工坊（块模板管理）
 * 5. 设置页面（LLM 配置）
 * 6. Agent 列表页面
 * 7. Agent 编辑器
 */
import { useEffect, useRef, useState } from 'react'
import { HomePage } from './components/HomePage'
import { Canvas } from './components/pipeline/Canvas'
import { Toolbar } from './components/pipeline/Toolbar'
import { RunPanel } from './components/pipeline/RunPanel'
import { BlockConfigPanel } from './components/blocks/BlockConfigPanel'
import { PluginsPage } from './components/PluginsPage'
import { ManufacturePage } from './components/blocks/ManufacturePage'
import { WorkflowListPage } from './components/WorkflowListPage'
import { AgentListPage } from './components/AgentListPage'
import { AgentEditorPage } from './components/AgentEditorPage'
import { SettingsPage } from './components/SettingsPage'
import { useWorkflowStore } from './stores/workflow'
import { getWorkflow, getSettings, saveWorkflow, deleteWorkflow } from './api/client'

type Page = 'home' | 'flow-list' | 'flow-editor' | 'plugins' | 'manufacture' | 'settings' | 'agent-list' | 'agent-editor'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [checkedSettings, setCheckedSettings] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>(undefined)
  const settingsFrom = useRef<Page>('home')
  const manufactureFrom = useRef<Page>('flow-editor')
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow)

  // 启动时检查是否已配置 API Key，未配置则引导到设置页
  useEffect(() => {
    getSettings()
      .then((s) => {
        if (!s.api_key_set) {
          setPage('settings')
        }
      })
      .catch(() => {})
      .finally(() => setCheckedSettings(true))
  }, [])

  // 打开已有工作流
  const handleOpenWorkflow = async (workflowId: string) => {
    try {
      const wf = await getWorkflow(workflowId)
      setWorkflow(wf)
      setAutoSaved(false)
      setPage('flow-editor')
    } catch (e) {
      alert(`打开工作流失败: ${e}`)
    }
  }

  // 新建空白工作流 — 自动保存到后端，便于 AI 编辑等功能直接使用
  const handleCreateNew = async () => {
    const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const wf = { id, name: '新建工作流', description: '', columns: [] }
    try {
      await saveWorkflow(wf)
      setWorkflow(wf)
      setAutoSaved(true)
      setPage('flow-editor')
    } catch (e) {
      alert(`创建失败: ${e}`)
    }
  }

  // 返回列表 — 如未手动保存则自动删除
  const handleBackToFlowList = async () => {
    if (autoSaved) {
      const wfId = useWorkflowStore.getState().workflow.id
      if (wfId) {
        try { await deleteWorkflow(wfId) } catch {}
      }
    }
    setAutoSaved(false)
    setPage('flow-list')
  }

  // 初始检查中不渲染
  if (!checkedSettings) return null

  if (page === 'home') {
    return (
      <HomePage
        onSelectFlow={() => setPage('flow-list')}
        onSelectAgent={() => setPage('agent-list')}
      />
    )
  }

  if (page === 'settings') {
    return <SettingsPage onBack={() => setPage(settingsFrom.current)} />
  }

  if (page === 'flow-list') {
    return (
      <WorkflowListPage
        onOpen={handleOpenWorkflow}
        onCreateNew={handleCreateNew}
        onOpenPlugins={() => setPage('plugins')}
        onOpenManufacture={() => { manufactureFrom.current = 'flow-list'; setPage('manufacture') }}
        onOpenSettings={() => { settingsFrom.current = 'flow-list'; setPage('settings') }}
        onBack={() => setPage('home')}
      />
    )
  }

  if (page === 'agent-list') {
    return (
      <AgentListPage
        onOpen={(agentId) => {
          setCurrentAgentId(agentId)
          setPage('agent-editor')
        }}
        onCreateNew={() => {
          setCurrentAgentId(undefined)
          setPage('agent-editor')
        }}
        onBack={() => setPage('home')}
      />
    )
  }

  if (page === 'agent-editor') {
    return (
      <AgentEditorPage
        agentId={currentAgentId}
        onBack={() => setPage('agent-list')}
      />
    )
  }

  if (page === 'plugins') {
    return <PluginsPage onBack={() => setPage('flow-list')} />
  }

  if (page === 'manufacture') {
    return <ManufacturePage onBack={() => setPage(manufactureFrom.current)} />
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Toolbar
        onOpenManufacture={() => { manufactureFrom.current = 'flow-editor'; setPage('manufacture') }}
        onBackToList={handleBackToFlowList}
        onOpenSettings={() => { settingsFrom.current = 'flow-editor'; setPage('settings') }}
        onManualSave={() => setAutoSaved(false)}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-x-auto">
          <Canvas />
        </div>
        {selectedBlockId && (
          <div className="w-80 border-l bg-white overflow-y-auto">
            <BlockConfigPanel />
          </div>
        )}
      </div>
      <RunPanel />
    </div>
  )
}
