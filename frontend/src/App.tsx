/**
 * Lindle 主应用
 *
 * 页面:
 * 0. 首页（选择 Flow 或 Agent）
 * 1. 工作流列表
 * 2. 工作流编辑器
 * 3. 插件管理页面
 * 4. 制造工坊（块模板管理）
 * 5. 设置页面（总体设置）
 * 6. Provider 页面（模型来源管理）
 * 7. Agent 列表页面
 * 8. Agent 编辑器
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
import { SettingsEntry } from './components/SettingsEntry'
import { useWorkflowStore } from './stores/workflow'
import { getAppPreferences } from './utils/preferences'
import { getWorkflow, getSettings, saveWorkflow, deleteWorkflow, createAgent, deleteAgent } from './api/client'

type Page =
  | 'home-overview'
  | 'home-entry'
  | 'flow-list'
  | 'flow-editor'
  | 'plugins'
  | 'manufacture'
  | 'settings-general'
  | 'settings-provider'
  | 'agent-list'
  | 'agent-editor'
  | 'skill-library'

export default function App() {
  const [page, setPage] = useState<Page>('home-overview')
  const [checkedSettings, setCheckedSettings] = useState(false)
  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>(undefined)
  const autoSavedWorkflowRef = useRef(false)
  const autoSavedAgentRef = useRef(false)
  const settingsFrom = useRef<Page>('home-entry')
  const manufactureFrom = useRef<Page>('flow-editor')
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow)

  const rememberOrigin = (from: Page) => {
    settingsFrom.current = from === 'home-overview' ? 'home-entry' : from
  }

  const openGeneralSettings = (from: Page) => {
    rememberOrigin(from)
    setPage('settings-general')
  }

  const openProviderSettings = (from: Page) => {
    rememberOrigin(from)
    setPage('settings-provider')
  }

  // 本地模式下检查是否已配置 API Key，未配置则引导到 Provider 页
  useEffect(() => {
    getSettings()
      .then((s) => {
        if (!s.api_key_set) {
          settingsFrom.current = 'home-entry'
          setPage('settings-provider')
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
      autoSavedWorkflowRef.current = false
      setPage('flow-editor')
    } catch (e) {
      alert(`打开工作流失败: ${e}`)
    }
  }

  // 新建空白工作流 — 自动保存到后端，便于 编辑等功能直接使用
  const handleCreateNew = async () => {
    const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const preferences = getAppPreferences()
    const wf = {
      id,
      name: '新建工作流',
      description: '',
      columns: [],
      stop_on_error: preferences.defaultStopOnError,
    }
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

  // 初始检查中不渲染
  if (!checkedSettings) return null

  const headerActions = (
    <SettingsEntry
      onOpenGeneral={() => openGeneralSettings(page)}
      onOpenProvider={() => openProviderSettings(page)}
    />
  )

  let content: ReactNode

  if (page === 'home-overview' || page === 'home-entry') {
    content = (
      <HomePage
        stage={page === 'home-overview' ? 'overview' : 'entry'}
        onShowOverview={() => setPage('home-overview')}
        onShowEntry={() => setPage('home-entry')}
        onSelectFlow={() => setPage('flow-list')}
        onSelectAgent={() => setPage('agent-list')}
        headerActions={page === 'home-entry' ? headerActions : undefined}
      />
    )
  } else if (page === 'settings-general') {
    content = (
      <SettingsPage
        section="general"
        onBack={() => setPage(settingsFrom.current)}
        headerActions={headerActions}
      />
    )
  } else if (page === 'settings-provider') {
    content = (
      <SettingsPage
        section="provider"
        onBack={() => setPage(settingsFrom.current)}
        headerActions={headerActions}
      />
    )
  } else if (page === 'flow-list') {
    content = (
      <WorkflowListPage
        onOpen={handleOpenWorkflow}
        onCreateNew={handleCreateNew}
        onOpenPlugins={() => setPage('plugins')}
        onOpenManufacture={() => { manufactureFrom.current = 'flow-list'; setPage('manufacture') }}
        onBack={() => setPage('home-entry')}
        headerActions={headerActions}
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
        headerActions={headerActions}
      />
    )
  } else if (page === 'skill-library') {
    content = (
      <SkillLibraryPage
        onBack={() => setPage('agent-list')}
        headerActions={headerActions}
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
        headerActions={headerActions}
      />
    )
  } else if (page === 'plugins') {
    content = <PluginsPage onBack={() => setPage('flow-list')} headerActions={headerActions} />
  } else if (page === 'manufacture') {
    content = <ManufacturePage onBack={() => setPage(manufactureFrom.current)} headerActions={headerActions} />
  } else {
    content = (
      <div className="editor-shell">
        <Toolbar
          onOpenManufacture={() => { manufactureFrom.current = 'flow-editor'; setPage('manufacture') }}
          onBackToList={handleBackToFlowList}
          onManualSave={() => {
            autoSavedWorkflowRef.current = false
          }}
          headerActions={headerActions}
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
    <>{content}</>
  )
}
