import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { FlowHealthIssue, FlowHealthSummary } from '@/utils/flowHealth'

export function FlowHealthButton({
  health,
  firstBlockIssue,
  onSelectFirstIssue,
}: {
  health: FlowHealthSummary
  firstBlockIssue?: FlowHealthIssue
  onSelectFirstIssue: () => void
}) {
  return (
    <button
      onClick={onSelectFirstIssue}
      className={`app-button app-button-ghost ${
        health.severity === 'error'
          ? 'text-[var(--app-danger)]'
          : health.severity === 'warning'
            ? 'text-[var(--app-warning)]'
            : 'text-[var(--app-success)]'
      }`}
      title={firstBlockIssue?.message || 'Flow 当前可以运行'}
    >
      {health.severity === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {health.label}
    </button>
  )
}
