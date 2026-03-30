/**
 * 顶部工具栏
 */
import { Play, Save, Puzzle, Factory } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { saveWorkflow, updateWorkflow, runWorkflow } from '@/api/client'

interface ToolbarProps {
  onOpenPlugins?: () => void
  onOpenManufacture?: () => void
}

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function Toolbar({ onOpenPlugins, onOpenManufacture }: ToolbarProps) {
  const { workflow, setWorkflow, setRunResult, setIsRunning, isRunning } = useWorkflowStore()

  const handleSave = async () => {
    try {
      let saved: typeof workflow
      if (!workflow.id) {
        const toSave = { ...workflow, id: generateId() }
        saved = await saveWorkflow(toSave)
      } else {
        saved = await updateWorkflow(workflow.id, workflow)
      }
      setWorkflow(saved)
      alert('保存成功')
    } catch (e) {
      alert(`保存失败: ${e}`)
    }
  }

  const handleRun = async () => {
    if (!workflow.id) {
      alert('请先保存工作流')
      return
    }
    setIsRunning(true)
    try {
      const result = await runWorkflow(workflow.id, {})
      setRunResult(result)
    } catch (e) {
      alert(`运行失败: ${e}`)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="h-14 bg-white border-b px-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-sky-600">MiniFlow</h1>
        <span className="text-sm text-gray-300">|</span>
        <input
          className="text-sm font-medium bg-transparent border-none outline-none text-gray-700 w-48"
          value={workflow.name}
          onChange={(e) =>
            useWorkflowStore.getState().updateWorkflowMeta(e.target.value, workflow.description)
          }
          placeholder="工作流名称"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenPlugins}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-sky-50 hover:text-sky-600 rounded-lg transition"
        >
          <Puzzle size={16} />
          插件
        </button>
        <button
          onClick={onOpenManufacture}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-sky-50 hover:text-sky-600 rounded-lg transition"
        >
          <Factory size={16} />
          制造
        </button>
        <span className="text-gray-200">|</span>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          <Save size={16} />
          保存
        </button>
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-lg transition font-medium"
        >
          <Play size={16} />
          {isRunning ? '运行中...' : '运行'}
        </button>
      </div>
    </div>
  )
}
