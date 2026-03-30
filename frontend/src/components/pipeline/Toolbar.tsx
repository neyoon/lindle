/**
 * 顶部工具栏
 */
import { useState } from 'react'
import { Play, Save, Puzzle, Factory, ArrowLeft, Download, FileText, Settings } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { saveWorkflow, updateWorkflow, runWorkflow, downloadCode, previewCode } from '@/api/client'

const API_BASE = '/api'

interface ToolbarProps {
  onOpenPlugins?: () => void
  onOpenManufacture?: () => void
  onBackToList?: () => void
  onOpenSettings?: () => void
}

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function Toolbar({ onOpenPlugins, onOpenManufacture, onBackToList, onOpenSettings }: ToolbarProps) {
  const { workflow, setWorkflow, setRunResult, setIsRunning, isRunning } = useWorkflowStore()
  const [showExportMenu, setShowExportMenu] = useState(false)

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

  const handleExportCode = async () => {
    if (!workflow.id) {
      alert('请先保存工作流')
      return
    }
    setShowExportMenu(false)
    try {
      await downloadCode(workflow.id)
    } catch (e) {
      alert(`导出失败: ${e}`)
    }
  }

  const handleExportDescribe = async () => {
    if (!workflow.id) {
      alert('请先保存工作流')
      return
    }
    setShowExportMenu(false)
    try {
      const resp = await fetch(`${API_BASE}/workflows/${workflow.id}/describe`)
      if (!resp.ok) throw new Error('获取描述失败')
      const data = await resp.json()
      // 打开新窗口显示描述文本
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(`<pre style="font-family:monospace;white-space:pre-wrap;padding:20px;max-width:800px;margin:0 auto;line-height:1.6">${escapeHtml(data.description)}</pre>`)
        win.document.title = `${workflow.name} - 工作流描述`
      }
    } catch (e) {
      alert(`导出描述失败: ${e}`)
    }
  }

  return (
    <div className="h-14 bg-white border-b px-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        {/* 返回列表 */}
        {onBackToList && (
          <>
            <button
              onClick={onBackToList}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-sky-600 transition"
            >
              <ArrowLeft size={16} />
              返回
            </button>
            <span className="text-gray-200">|</span>
          </>
        )}
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
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-sky-50 hover:text-sky-600 rounded-lg transition"
        >
          <Settings size={16} />
          设置
        </button>
        <span className="text-gray-200">|</span>

        {/* 导出菜单 */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-sky-50 hover:text-sky-600 rounded-lg transition"
          >
            <Download size={16} />
            导出
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-20 w-52 overflow-hidden">
                <button
                  onClick={handleExportCode}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-sky-50 flex items-center gap-2.5 transition"
                >
                  <Download size={15} className="text-sky-500" />
                  <div>
                    <span className="text-gray-700 font-medium">下载代码项目</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">ZIP 结构化 Python 项目</p>
                  </div>
                </button>
                <button
                  onClick={handleExportDescribe}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-sky-50 flex items-center gap-2.5 transition border-t border-gray-50"
                >
                  <FileText size={15} className="text-sky-500" />
                  <div>
                    <span className="text-gray-700 font-medium">导出流程描述</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">LLM 可读的文本格式</p>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
