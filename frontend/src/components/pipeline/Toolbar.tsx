/**
 * 顶部工具栏
 */
import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Play, Save, Factory, ArrowLeft, Download, FileText, Sparkles, X, Loader2, Square, Undo2, Check } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { saveWorkflow, updateWorkflow, runWorkflowStream, downloadCode, downloadWorkflowManifest } from '@/api/client'
import type { Workflow, Block, StepEvent } from '@/types/workflow'
const API_BASE = '/api'

interface ToolbarProps {
  onOpenManufacture?: () => void
  onBackToList?: () => void
  onManualSave?: () => void
  headerActions?: ReactNode
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

export function Toolbar({ onOpenManufacture, onBackToList, onManualSave, headerActions }: ToolbarProps) {
  const {
    workflow,
    setWorkflow,
    setRunResult,
    setIsRunning,
    isRunning,
    setBlockDiffMap,
    resetRunState,
    appendRunEvent,
    setLiveOutput,
    setBlockRunState,
  } = useWorkflowStore()
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
    resetRunState()
    setIsRunning(true)
    try {
      const steps: StepEvent[] = []

      for await (const event of runWorkflowStream(workflow.id, userInputs)) {
        steps.push(event)
        appendRunEvent(event)

        if (event.event_type === 'block_start' && event.block_id) {
          setBlockRunState(event.block_id, 'running')
        } else if (event.event_type === 'block_done' && event.block_id) {
          setBlockRunState(event.block_id, 'done')
          setLiveOutput(event.data ?? null)
        } else if (event.event_type === 'error') {
          setRunResult({
            success: false,
            output: {},
            steps,
            total_elapsed: event.elapsed,
            error: event.error || '运行失败',
          })
        } else if (event.event_type === 'flow_done') {
          setLiveOutput(event.data ?? null)
          setRunResult({
            success: true,
            output: (event.data as Record<string, unknown>) || {},
            steps,
            total_elapsed: event.elapsed,
            error: '',
          })
        }
      }
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

  const handleExportManifest = async () => {
    if (!workflow.id) {
      alert('请先保存工作流')
      return
    }
    setShowExportMenu(false)
    try {
      await downloadWorkflowManifest(workflow.id)
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
    <div className="editor-toolbar px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {/* 返回列表 */}
        {onBackToList && (
          <>
            <button
              onClick={onBackToList}
              className="app-button app-button-ghost"
            >
              <ArrowLeft size={16} />
              返回
            </button>
            <span className="text-[var(--app-border-strong)]">|</span>
          </>
        )}
        <input
          className="w-56 border-none bg-transparent text-sm font-medium text-[var(--app-text)] outline-none"
          value={workflow.name}
          onChange={(e) =>
            useWorkflowStore.getState().updateWorkflowMeta(e.target.value, workflow.description)
          }
          placeholder="工作流名称"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* AI 编辑 */}
        <div className="relative flex items-center">
          {showAIEdit ? (
            <div className="flex items-center gap-1.5 rounded-sm border border-[var(--app-border-strong)] bg-[var(--app-accent-soft)] px-2 py-1">
              <Sparkles size={14} className="shrink-0 text-[var(--app-accent-strong)]" />
              <input
                ref={aiInputRef}
                className="w-64 border-none bg-transparent text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-muted)]"
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
                    className="rounded-sm bg-[var(--app-accent)] px-2 py-0.5 text-xs font-medium text-[var(--paper)] transition disabled:opacity-40 shrink-0 hover:bg-[var(--app-accent-strong)]"
                  >
                    执行
                  </button>
                  <button
                    onClick={() => { setShowAIEdit(false); setAIInstruction('') }}
                    className="shrink-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
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
              className="app-button app-button-secondary"
            >
              <Sparkles size={16} />
              AI 编辑
            </button>
          )}
        </div>
        <span className="text-[var(--app-border-strong)]">|</span>
        <button
          onClick={onOpenManufacture}
          className="app-button app-button-ghost"
        >
          <Factory size={16} />
          制造
        </button>
        <span className="text-[var(--app-border-strong)]">|</span>

        {/* 导出菜单 */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="app-button app-button-ghost"
          >
            <Download size={16} />
            导出
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-sm border border-[var(--app-border)] bg-[var(--app-panel-solid)] shadow-[var(--app-shadow)]" style={{ animation: 'panel-slide-in 0.35s var(--ease-ink)' }}>
                <button
                  onClick={handleExportManifest}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
                >
                  <FileText size={15} className="text-[var(--app-accent)]" />
                  <div>
                    <span className="font-medium text-[var(--app-text)]">导出结构化 Flow</span>
                    <p className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">JSON 清单，便于复用和模型理解</p>
                  </div>
                </button>
                <button
                  onClick={handleExportCode}
                  className="flex w-full items-center gap-2.5 border-t border-[var(--app-border)] px-4 py-3 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
                >
                  <Download size={15} className="text-[var(--app-accent)]" />
                  <div>
                    <span className="font-medium text-[var(--app-text)]">下载代码项目</span>
                    <p className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">ZIP 结构化 Python 项目</p>
                  </div>
                </button>
                <button
                  onClick={handleExportDescribe}
                  className="flex w-full items-center gap-2.5 border-t border-[var(--app-border)] px-4 py-3 text-left text-sm transition hover:bg-[var(--app-accent-soft)]"
                >
                  <FileText size={15} className="text-[var(--app-accent)]" />
                  <div>
                    <span className="font-medium text-[var(--app-text)]">导出流程描述</span>
                    <p className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">LLM 可读的文本格式</p>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        <span className="text-[var(--app-border-strong)]">|</span>
        <button
          onClick={handleSave}
          className="app-button app-button-ghost"
        >
          <Save size={16} />
          保存
        </button>
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="app-button app-button-primary disabled:opacity-50"
        >
          <Play size={16} />
          {isRunning ? '运行中...' : '运行'}
        </button>
        {headerActions}
      </div>
      </div>
    </div>

    {/* AI 编辑流式面板 */}
    {showStreamPanel && (
      <div className="border-b border-[var(--app-border)] bg-[var(--app-accent-soft)] px-4 py-3" style={{ animation: 'panel-slide-in 0.4s var(--ease-ink)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--app-accent-strong)]">
              {aiLoading ? (
                <><Loader2 size={12} className="animate-spin" /> AI 正在修改工作流...</>
              ) : aiError ? (
                <span className="text-[var(--app-danger)]">{aiError}</span>
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
                  className="flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium text-[var(--app-danger)] transition hover:bg-[var(--bruise-soft)]"
                >
                  <Square size={10} fill="currentColor" />
                  打断
                </button>
              ) : aiDone && prevWorkflowRef.current ? (
                <>
                  <button
                    onClick={handleUndo}
                    className="flex items-center gap-1 rounded-sm border border-[var(--app-warm)] px-2.5 py-1 text-xs font-medium text-[var(--app-warning)] transition hover:bg-[var(--rust-soft)]"
                  >
                    <Undo2 size={12} />
                    撤销
                  </button>
                  <button
                    onClick={handleConfirmEdit}
                    className="flex items-center gap-1 rounded-sm border border-[var(--moss-soft)] px-2.5 py-1 text-xs font-medium text-[var(--app-success)] transition hover:bg-[var(--moss-soft)]"
                  >
                    <Check size={12} />
                    确认
                  </button>
                </>
              ) : (
                <button
                  onClick={closeStreamPanel}
                  className="rounded-full px-2 py-0.5 text-xs text-[var(--app-text-muted)] transition hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--app-text)]"
                >
                  关闭
                </button>
              )}
            </div>
          </div>
          {aiThinking && (
            <div className="mb-2">
              <span className="text-[10px] font-medium text-[var(--app-text-soft)]">思考过程</span>
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-2 text-xs italic leading-relaxed text-[var(--app-text-soft)]" style={{ fontFamily: 'Fraunces, serif' }}>
                {aiThinking}
              </pre>
            </div>
          )}
          {aiDelta && (
            <div>
              <span className="text-[10px] font-medium text-[var(--app-text-soft)]">生成内容</span>
              <pre
                ref={streamPanelRef}
                className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-sm border border-[var(--line)] bg-[var(--card)] p-2 font-mono text-xs leading-relaxed text-[var(--app-text)]"
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
