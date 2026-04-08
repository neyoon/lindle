/**
 * Tweak 主应用
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
import type { ReactNode } from 'react'
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
import { SkillLibraryPage } from './components/SkillLibraryPage'
import { SettingsPage } from './components/SettingsPage'
import { LoginPage } from './components/LoginPage'
import { useWorkflowStore } from './stores/workflow'
import { getWorkflow, getSettings, saveWorkflow, deleteWorkflow, createAgent, deleteAgent, login, setAuthToken, getCurrentUser, clearAuthToken, logout } from './api/client'
import type { AuthUser } from './types/auth'

type Page = 'home-overview' | 'home-entry' | 'flow-list' | 'flow-editor' | 'plugins' | 'manufacture' | 'settings' | 'agent-list' | 'agent-editor' | 'skill-library'

export default function App() {
  const [page, setPage] = useState<Page>('home-overview')
  const [authChecked, setAuthChecked] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [checkedSettings, setCheckedSettings] = useState(false)
  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>(undefined)
  const autoSavedWorkflowRef = useRef(false)
  const autoSavedAgentRef = useRef(false)
  const settingsFrom = useRef<Page>('home-overview')
  const manufactureFrom = useRef<Page>('flow-editor')
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow)

  useEffect(() => {
    getCurrentUser()
      .then((user) => setAuthUser(user))
      .catch(() => {
        clearAuthToken()
        setAuthUser(null)
      })
      .finally(() => setAuthChecked(true))
  }, [])

  // 登录后检查是否已配置 API Key，未配置则引导到设置页
  useEffect(() => {
    if (!authUser) {
      setCheckedSettings(false)
      return
    }

    getSettings()
      .then((s) => {
        if (!s.api_key_set) {
          setPage('settings')
        }
      })
      .catch(() => {})
      .finally(() => setCheckedSettings(true))
  }, [authUser])

  const handleLogin = async (username: string, password: string) => {
    const result = await login(username, password)
    setAuthToken(result.token)
    const currentUser = await getCurrentUser()
    setAuthUser(currentUser)
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch {}
    clearAuthToken()
    setAuthUser(null)
    setCheckedSettings(false)
    setCurrentAgentId(undefined)
    autoSavedWorkflowRef.current = false
    autoSavedAgentRef.current = false
    setPage('home-overview')
  }

  // 打开已有工作流
  const handleOpenWorkflow = async (workflowId: string) => {
    try {
      const wf = await getWorkflow(workflowId)
      setWorkflow(wf)
      autoSavedWorkflowRef.current = false
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
      autoSavedWorkflowRef.current = true
      setPage('flow-editor')
    } catch (e) {
      alert(`创建失败: ${e}`)
    }
  }

  // 返回列表 — 如未手动保存则自动删除
  const handleBackToFlowList = async () => {
    if (autoSavedWorkflowRef.current) {
      const wfId = useWorkflowStore.getState().workflow.id
      if (wfId) {
        try { await deleteWorkflow(wfId) } catch {}
      }
    }
    autoSavedWorkflowRef.current = false
    setPage('flow-list')
  }

  if (!authChecked) return null
  if (!authUser) return <LoginPage onLogin={handleLogin} />

  // 初始检查中不渲染
  if (!checkedSettings) return null

  let content: ReactNode

  if (page === 'home-overview' || page === 'home-entry') {
    content = (
      <HomePage
        stage={page === 'home-entry' ? 'entry' : 'overview'}
        onShowOverview={() => setPage('home-overview')}
        onShowEntry={() => setPage('home-entry')}
        onSelectFlow={() => setPage('flow-list')}
        onSelectAgent={() => setPage('agent-list')}
        onOpenSettings={() => { settingsFrom.current = page; setPage('settings') }}
      />
    )
  } else if (page === 'settings') {
    content = <SettingsPage onBack={() => setPage(settingsFrom.current)} />
  } else if (page === 'flow-list') {
    content = (
      <WorkflowListPage
        onOpen={handleOpenWorkflow}
        onCreateNew={handleCreateNew}
        onOpenPlugins={() => setPage('plugins')}
        onOpenManufacture={() => { manufactureFrom.current = 'flow-list'; setPage('manufacture') }}
        onOpenSettings={() => { settingsFrom.current = 'flow-list'; setPage('settings') }}
        onBack={() => setPage('home-entry')}
      />
    )
  } else if (page === 'agent-list') {
    content = (
      <AgentListPage
        onOpen={(agentId) => {
          setCurrentAgentId(agentId)
          autoSavedAgentRef.current = false
          setPage('agent-editor')
        }}
        onCreateNew={async () => {
          // 自动保存新 Agent（与 Flow 一致）
          const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          const agent = {
            id,
            name: '新建 Agent',
            description: '',
            system_prompt: '',
            model_provider_id: null,
            skills: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          try {
            await createAgent(agent)
            setCurrentAgentId(id)
            autoSavedAgentRef.current = true
            setPage('agent-editor')
          } catch (e) {
            alert(`创建失败: ${e}`)
          }
        }}
        onBack={() => setPage('home-entry')}
        onOpenSkillLibrary={() => setPage('skill-library')}
        onOpenSettings={() => { settingsFrom.current = 'agent-list'; setPage('settings') }}
      />
    )
  } else if (page === 'skill-library') {
    content = (
      <SkillLibraryPage
        onBack={() => setPage('agent-list')}
      />
    )
  } else if (page === 'agent-editor') {
    content = (
      <AgentEditorPage
        agentId={currentAgentId}
        onBack={async () => {
          // 如果是自动保存的且未手动保存，则删除
          if (autoSavedAgentRef.current && currentAgentId) {
            try {
              await deleteAgent(currentAgentId)
            } catch {}
          }
          autoSavedAgentRef.current = false
          setPage('agent-list')
        }}
        onManualSave={() => {
          autoSavedAgentRef.current = false
        }}
      />
    )
  } else if (page === 'plugins') {
    content = <PluginsPage onBack={() => setPage('flow-list')} />
  } else if (page === 'manufacture') {
    content = <ManufacturePage onBack={() => setPage(manufactureFrom.current)} />
  } else {
    content = (
      <div className="editor-shell">
        <Toolbar
          onOpenManufacture={() => { manufactureFrom.current = 'flow-editor'; setPage('manufacture') }}
          onBackToList={handleBackToFlowList}
          onOpenSettings={() => { settingsFrom.current = 'flow-editor'; setPage('settings') }}
          onManualSave={() => {
            autoSavedWorkflowRef.current = false
          }}
        />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-x-auto">
            <Canvas />
          </div>
          {selectedBlockId && (
            <div className="editor-panel w-80 overflow-y-auto border-l">
              <BlockConfigPanel />
            </div>
          )}
        </div>
        <RunPanel />
      </div>
    )
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-[60] flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 shadow-[var(--app-shadow)]">
        <div className="text-right">
          <div className="text-sm font-medium text-[var(--app-text)]">{authUser.username}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">{authUser.role}</div>
        </div>
        <button onClick={handleLogout} className="app-button app-button-ghost px-3 py-2 text-xs">
          退出
        </button>
      </div>
      {content}
    </>
  )
}
