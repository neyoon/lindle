/**
 * MiniFlow 主应用
 *
 * 布局:
 * ┌─────────────────────────────────────────────┐
 * │ Toolbar (工具栏: 名称 / 运行 / 导出)          │
 * ├─────────────────────────────────────────────┤
 * │                                             │
 * │  Canvas (分栏画布)                            │
 * │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
 * │  │ 栏1  │  │ 栏2  │  │ 栏3  │  │ +添加 │    │
 * │  │[块]  │  │[块]  │  │[块]  │  │      │    │
 * │  │[块]  │  │[块]  │  │      │  │      │    │
 * │  └──────┘  └──────┘  └──────┘  └──────┘    │
 * │                                             │
 * ├─────────────────────────────────────────────┤
 * │ RunPanel (运行结果面板, 可折叠)                │
 * └─────────────────────────────────────────────┘
 */
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'
import { RunPanel } from './components/RunPanel'
import { BlockConfigPanel } from './components/BlockConfigPanel'
import { useWorkflowStore } from './stores/workflow'

export default function App() {
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Toolbar />
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
