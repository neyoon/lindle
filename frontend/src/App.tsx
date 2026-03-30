/**
 * MiniFlow 主应用
 *
 * 两个页面:
 * 1. 工作流编辑器（默认）
 * 2. 插件管理页面
 *
 * 通过简单的 state 切换页面，无需路由库。
 */
import { useState } from 'react'
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'
import { RunPanel } from './components/RunPanel'
import { BlockConfigPanel } from './components/BlockConfigPanel'
import { PluginsPage } from './components/PluginsPage'
import { useWorkflowStore } from './stores/workflow'

type Page = 'editor' | 'plugins'

export default function App() {
  const [page, setPage] = useState<Page>('editor')
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)

  if (page === 'plugins') {
    return <PluginsPage onBack={() => setPage('editor')} />
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Toolbar onOpenPlugins={() => setPage('plugins')} />
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
