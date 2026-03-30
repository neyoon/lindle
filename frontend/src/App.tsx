/**
 * MiniFlow 主应用
 *
 * 三个页面:
 * 1. 工作流编辑器（默认）
 * 2. 插件管理页面
 * 3. 制造工坊（块模板管理）
 */
import { useState } from 'react'
import { Canvas } from './components/pipeline/Canvas'
import { Toolbar } from './components/pipeline/Toolbar'
import { RunPanel } from './components/pipeline/RunPanel'
import { BlockConfigPanel } from './components/blocks/BlockConfigPanel'
import { PluginsPage } from './components/PluginsPage'
import { ManufacturePage } from './components/blocks/ManufacturePage'
import { useWorkflowStore } from './stores/workflow'

type Page = 'editor' | 'plugins' | 'manufacture'

export default function App() {
  const [page, setPage] = useState<Page>('editor')
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)

  if (page === 'plugins') {
    return <PluginsPage onBack={() => setPage('editor')} />
  }

  if (page === 'manufacture') {
    return <ManufacturePage onBack={() => setPage('editor')} />
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Toolbar
        onOpenPlugins={() => setPage('plugins')}
        onOpenManufacture={() => setPage('manufacture')}
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
