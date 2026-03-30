/**
 * 顶部工具栏
 */
import { Play, Download, Code, Save } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { saveWorkflow, runWorkflow, previewCode, downloadCode } from '@/api/client'

export function Toolbar() {
  const { workflow, setRunResult, setIsRunning, isRunning } = useWorkflowStore()

  const handleSave = async () => {
    try {
      await saveWorkflow(workflow)
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

  const handlePreview = async () => {
    if (!workflow.id) {
      alert('请先保存工作流')
      return
    }
    try {
      const result = await previewCode(workflow.id)
      console.log('Generated code:', result)
      alert(`代码生成成功! 包含 ${Object.keys(result.files).length} 个文件`)
    } catch (e) {
      alert(`生成失败: ${e}`)
    }
  }

  const handleDownload = async () => {
    if (!workflow.id) {
      alert('请先保存工作流')
      return
    }
    try {
      await downloadCode(workflow.id)
    } catch (e) {
      alert(`下载失败: ${e}`)
    }
  }

  return (
    <div className="h-14 bg-white border-b px-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-indigo-600">MiniFlow</h1>
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
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          <Save size={16} />
          保存
        </button>
        <button
          onClick={handlePreview}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          <Code size={16} />
          预览代码
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          <Download size={16} />
          导出
        </button>
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-lg transition font-medium"
        >
          <Play size={16} />
          {isRunning ? '运行中...' : '运行'}
        </button>
      </div>
    </div>
  )
}
