import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Play, Save, Factory, ArrowLeft, Sparkles, X, Loader2 } from 'lucide-react'
import { useWorkflowStore } from '@/stores/workflow'
import { saveWorkflow, updateWorkflow, runWorkflowStream, downloadCode, downloadWorkflowManifest } from '@/api/client'
import type { Workflow, StepEvent } from '@/types/workflow'
import { evaluateFlowHealth } from '@/utils/flowHealth'
import { computeBlockDiff } from '@/utils/workflowDiff'
import { EditStreamPanel } from './toolbar/EditStreamPanel'
import { ExportMenu } from './toolbar/ExportMenu'
import { FlowHealthButton } from './toolbar/FlowHealthButton'
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
    selectBlock,
  } = useWorkflowStore()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editInstruction, setEditInstruction] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editThinking, setEditThinking] = useState('')
  const [editDelta, setEditDelta] = useState('')
  const [editError, setEditError] = useState('')
  const [editDone, setEditDone] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const streamPanelRef = useRef<HTMLPreElement>(null)
  const prevWorkflowRef = useRef<Workflow | null>(null)
  const health = evaluateFlowHealth(workflow)
  const firstBlockIssue = health.issues.find((issue) => issue.blockId)

  useEffect(() => {
    if (streamPanelRef.current) {
      streamPanelRef.current.scrollTop = streamPanelRef.current.scrollHeight
    }
  }, [editDelta, editThinking])

  const handleEdit = async () => {
    if (!editInstruction.trim() || editLoading) return
    if (!workflow.id) {
      alert('请先保存工作流')
      return
    }

    prevWorkflowRef.current = JSON.parse(JSON.stringify(workflow))

    const controller = new AbortController()
    abortRef.current = controller
    setEditLoading(true)
    setEditThinking('')
    setEditDelta('')
    setEditError('')
    setEditDone(false)
    setBlockDiffMap(null)

    try {
      const resp = await fetch(`${API_BASE}/workflows/${workflow.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: editInstruction.trim() }),
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
                setEditThinking((prev) => prev + data.text)
              } else if (currentEvent === 'delta') {
                setEditDelta((prev) => prev + data.text)
              } else if (currentEvent === 'done') {
                const newWf = data as Workflow
                const diff = prevWorkflowRef.current
                  ? computeBlockDiff(prevWorkflowRef.current, newWf)
                  : {}
                setWorkflow(newWf)
                setBlockDiffMap(Object.keys(diff).length > 0 ? diff : null)
                setEditInstruction('')
                setShowEdit(false)
                setEditLoading(false)
                setEditDone(true)
                return
              } else if (currentEvent === 'error') {
                setEditError(data.message)
              }
            } catch {}
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setEditError('已打断')
      } else {
        setEditError(`${e}`)
      }
    } finally {
      setEditLoading(false)
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
    setEditDone(false)
    setEditThinking('')
    setEditDelta('')
    try {
      await updateWorkflow(prev.id, prev)
    } catch {}
  }

  const handleConfirmEdit = () => {
    setBlockDiffMap(null)
    prevWorkflowRef.current = null
    setEditDone(false)
    setEditThinking('')
    setEditDelta('')
  }

  const closeStreamPanel = () => {
    setEditThinking('')
    setEditDelta('')
    setEditError('')
    setEditDone(false)
  }

  const showStreamPanel = editLoading || editThinking || editDelta || editError || editDone

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
    if (health.blockingCount > 0) {
      if (firstBlockIssue?.blockId) selectBlock(firstBlockIssue.blockId)
      alert(firstBlockIssue ? `${firstBlockIssue.message}${firstBlockIssue.action ? `：${firstBlockIssue.action}` : ''}` : '请先处理 Flow 中的红色步骤')
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
        <div className="relative flex items-center">
          {showEdit ? (
            <div className="flex items-center gap-1.5 rounded-sm border border-[var(--app-border-strong)] bg-[var(--app-accent-soft)] px-2 py-1">
              <Sparkles size={14} className="shrink-0 text-[var(--app-accent-strong)]" />
              <input
                ref={editInputRef}
                className="w-64 border-none bg-transparent text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-muted)]"
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEdit()
                  if (e.key === 'Escape') { setShowEdit(false); setEditInstruction('') }
                }}
                placeholder="输入修改指令，如：添加一个翻译步骤..."
                disabled={editLoading}
                autoFocus
              />
              {editLoading ? (
                <Loader2 size={14} className="text-violet-500 animate-spin shrink-0" />
              ) : (
                <>
                  <button
                    onClick={handleEdit}
                    disabled={!editInstruction.trim()}
                    className="rounded-sm bg-[var(--app-accent)] px-2 py-0.5 text-xs font-medium text-[var(--paper)] transition disabled:opacity-40 shrink-0 hover:bg-[var(--app-accent-strong)]"
                  >
                    执行
                  </button>
                  <button
                    onClick={() => { setShowEdit(false); setEditInstruction('') }}
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
                setShowEdit(true)
                requestAnimationFrame(() => editInputRef.current?.focus())
              }}
              className="app-button app-button-secondary"
            >
              <Sparkles size={16} />
              编辑
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

        <ExportMenu
          open={showExportMenu}
          onToggle={() => setShowExportMenu(!showExportMenu)}
          onClose={() => setShowExportMenu(false)}
          onExportManifest={handleExportManifest}
          onExportCode={handleExportCode}
          onExportDescribe={handleExportDescribe}
        />

        <span className="text-[var(--app-border-strong)]">|</span>
        <FlowHealthButton
          health={health}
          firstBlockIssue={firstBlockIssue}
          onSelectFirstIssue={() => {
            if (firstBlockIssue?.blockId) selectBlock(firstBlockIssue.blockId)
          }}
        />
        <button
          onClick={handleSave}
          className="app-button app-button-ghost"
        >
          <Save size={16} />
          保存
        </button>
        <button
          onClick={handleRun}
          disabled={isRunning || health.blockingCount > 0}
          className="app-button app-button-primary disabled:opacity-50"
        >
          <Play size={16} />
          {isRunning ? '运行中...' : '运行'}
        </button>
        {headerActions}
      </div>
      </div>
    </div>

    {showStreamPanel && (
      <EditStreamPanel
        editLoading={editLoading}
        editThinking={editThinking}
        editDelta={editDelta}
        editError={editError}
        editDone={editDone}
        canUndo={Boolean(prevWorkflowRef.current)}
        streamPanelRef={streamPanelRef}
        onAbort={handleAbort}
        onUndo={handleUndo}
        onConfirmEdit={handleConfirmEdit}
        onClose={closeStreamPanel}
      />
    )}
    </>
  )
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
