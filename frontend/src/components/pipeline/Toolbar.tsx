/**
 * 顶部工具栏
 */
import { useState, useRef, useEffect } from 'react'
import { Play, Save, Factory, ArrowLeft, Download, FileText, Settings, Sparkles, X, Loader2, Square, Undo2, Check, ShieldAlert } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { saveWorkflow, updateWorkflow, runWorkflow, downloadCode, previewCode } from '@/api/client'
import type { Workflow, Block } from '@/types/workflow'

const API_BASE = '/api'

interface ToolbarProps {
  onOpenManufacture?: () => void
  onBackToList?: () => void
  onOpenSettings?: () => void
  onManualSave?: () => void
}

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function computeBlockDiff(
  oldWf: Workflow,
  newWf: Workflow,
): Record<string, 'added' | 'modified'> {
  const oldBlocks = new Map<string, Block>()
  for (const col of oldWf.columns) {
    for (const b of col.blocks) oldBlocks.set(b.id, b)
  }
  const diff: Record<string, 'added' | 'modified'> = {}
  for (const col of newWf.columns) {
    for (const b of col.blocks) {
      const old = oldBlocks.get(b.id)
      if (!old) {
        diff[b.id] = 'added'
      } else if (JSON.stringify(old) !== JSON.stringify(b)) {
        diff[b.id] = 'modified'
      }
    }
  }
  return diff
}

export function Toolbar({ onOpenManufacture, onBackToList, onOpenSettings, onManualSave }: ToolbarProps) {
  const { workflow, setWorkflow, setRunResult, setIsRunning, isRunning, setBlockDiffMap, setStopOnError } = useWorkflowStore()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showAIEdit, setShowAIEdit] = useState(false)
  const [aiInstruction, setAIInstruction] = useState('')
  const [aiLoading, setAILoading] = useState(false)
  const [aiThinking, setAIThinking] = useState('')
  const [aiDelta, setAIDelta] = useState('')
  const [aiError, setAIError] = useState('')
  const [aiDone, setAIDone] = useState(false)
  const aiInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const streamPanelRef = useRef<HTMLPreElement>(null)
  const prevWorkflowRef = useRef<Workflow | null>(null)

  useEffect(() => {
    if (streamPanelRef.current) {
      streamPanelRef.current.scrollTop = streamPanelRef.current.scrollHeight
    }
  }, [aiDelta, aiThinking])

  const handleAIEdit = async () => {
    if (!aiInstruction.trim() || aiLoading) return
    if (!workflow.id) {
      alert('请先保存工作流')
      return
    }

    prevWorkflowRef.current = JSON.parse(JSON.stringify(workflow))

    const controller = new AbortController()
    abortRef.current = controller
    setAILoading(true)
    setAIThinking('')
    setAIDelta('')
    setAIError('')
    setAIDone(false)
    setBlockDiffMap(null)

    try {
      const resp = await fetch(`${API_BASE}/workflows/${workflow.id}/ai-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: aiInstruction.trim() }),
        signal: controller.signal,
      })

      if (!resp.ok || !resp.body) {
        const text = await resp.text()
        throw new Error(text || `HTTP ${resp.status}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7)
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (currentEvent === 'thinking') {
                setAIThinking((prev) => prev + data.text)
              } else if (currentEvent === 'delta') {
                setAIDelta((prev) => prev + data.text)
              } else if (currentEvent === 'done') {
                const newWf = data as Workflow
                const diff = prevWorkflowRef.current
                  ? computeBlockDiff(prevWorkflowRef.current, newWf)
                  : {}
                setWorkflow(newWf)
                setBlockDiffMap(Object.keys(diff).length > 0 ? diff : null)
                setAIInstruction('')
                setShowAIEdit(false)
                setAILoading(false)
                setAIDone(true)
                return
              } else if (currentEvent === 'error') {
                setAIError(data.message)
              }
            } catch {}
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setAIError('已打断')
      } else {
        setAIError(`${e}`)
      }
    } finally {
      setAILoading(false)
      abortRef.current = null
    }
  }

  const handleAbort = () => {
    abortRef.current?.abort()
  }

  const handleUndo = async () => {
    const prev = prevWorkflowRef.current
    if (!prev) return
    setWorkflow(prev)
    setBlockDiffMap(null)
    prevWorkflowRef.current = null
    setAIDone(false)
    setAIThinking('')
    setAIDelta('')
    try {
      await updateWorkflow(prev.id, prev)
    } catch {}
  }

  const handleConfirmEdit = () => {
    setBlockDiffMap(null)
    prevWorkflowRef.current = null
    setAIDone(false)
    setAIThinking('')
    setAIDelta('')
  }

  const closeStreamPanel = () => {
    setAIThinking('')
    setAIDelta('')
    setAIError('')
    setAIDone(false)
  }

  const showStreamPanel = aiLoading || aiThinking || aiDelta || aiError || aiDone

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
      onManualSave?.()
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
    const userInputs = useWorkflowStore.getState().userInputs
    setIsRunning(true)
    try {
      const result = await runWorkflow(workflow.id, userInputs)
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
    <>
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
        {/* AI 编辑 */}
        <div className="relative flex items-center">
          {showAIEdit ? (
            <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1">
              <Sparkles size={14} className="text-violet-500 shrink-0" />
              <input
                ref={aiInputRef}
                className="text-sm bg-transparent border-none outline-none text-gray-700 w-64 placeholder:text-gray-400"
                value={aiInstruction}
                onChange={(e) => setAIInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAIEdit()
                  if (e.key === 'Escape') { setShowAIEdit(false); setAIInstruction('') }
                }}
                placeholder="输入修改指令，如：添加一个翻译AI块..."
                disabled={aiLoading}
                autoFocus
              />
              {aiLoading ? (
                <Loader2 size={14} className="text-violet-500 animate-spin shrink-0" />
              ) : (
                <>
                  <button
                    onClick={handleAIEdit}
                    disabled={!aiInstruction.trim()}
                    className="text-xs text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-40 px-2 py-0.5 rounded transition font-medium shrink-0"
                  >
                    执行
                  </button>
                  <button
                    onClick={() => { setShowAIEdit(false); setAIInstruction('') }}
                    className="text-gray-400 hover:text-gray-600 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                setShowAIEdit(true)
                requestAnimationFrame(() => aiInputRef.current?.focus())
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-600 hover:bg-violet-50 rounded-lg transition font-medium"
            >
              <Sparkles size={16} />
              AI 编辑
            </button>
          )}
        </div>
        <span className="text-gray-200">|</span>
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

        {/* 失败即停止开关 */}
        <button
          onClick={() => setStopOnError(!workflow.stop_on_error)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition ${
            workflow.stop_on_error
              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
          title={workflow.stop_on_error ? '遇到错误时停止执行' : '遇到错误时继续执行'}
        >
          <ShieldAlert size={16} />
          {workflow.stop_on_error ? '失败即停' : '忽略错误'}
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

    {/* AI 编辑流式面板 */}
    {showStreamPanel && (
      <div className="border-b border-violet-200 bg-gradient-to-r from-violet-50 to-white px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-violet-600 flex items-center gap-1.5">
              {aiLoading ? (
                <><Loader2 size={12} className="animate-spin" /> AI 正在修改工作流...</>
              ) : aiError ? (
                <span className="text-red-500">{aiError}</span>
              ) : aiDone ? (
                '编辑完成 — 画布中高亮显示了变更'
              ) : (
                '完成'
              )}
            </span>
            <div className="flex items-center gap-1.5">
              {aiLoading ? (
                <button
                  onClick={handleAbort}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 transition font-medium"
                >
                  <Square size={10} fill="currentColor" />
                  打断
                </button>
              ) : aiDone && prevWorkflowRef.current ? (
                <>
                  <button
                    onClick={handleUndo}
                    className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 px-2.5 py-1 rounded-md hover:bg-orange-50 border border-orange-200 transition font-medium"
                  >
                    <Undo2 size={12} />
                    撤销
                  </button>
                  <button
                    onClick={handleConfirmEdit}
                    className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 px-2.5 py-1 rounded-md hover:bg-emerald-50 border border-emerald-200 transition font-medium"
                  >
                    <Check size={12} />
                    确认
                  </button>
                </>
              ) : (
                <button
                  onClick={closeStreamPanel}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100 transition"
                >
                  关闭
                </button>
              )}
            </div>
          </div>
          {aiThinking && (
            <div className="mb-2">
              <span className="text-[10px] text-violet-400 font-medium">思考过程</span>
              <pre className="text-xs text-gray-500 italic bg-white/50 rounded p-2 mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {aiThinking}
              </pre>
            </div>
          )}
          {aiDelta && (
            <div>
              <span className="text-[10px] text-violet-400 font-medium">生成内容</span>
              <pre
                ref={streamPanelRef}
                className="text-xs text-gray-600 bg-white/60 rounded p-2 mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed"
              >
                {aiDelta}
              </pre>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  )
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
