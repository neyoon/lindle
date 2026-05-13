import type { FlowHealthIssue } from '@/utils/flowHealth'

export function HealthIssuePanel({ issues }: { issues: FlowHealthIssue[] }) {
  const hasError = issues.some((issue) => issue.severity === 'error')
  return (
    <div
      className={`rounded-sm border p-3 text-xs ${
        hasError
          ? 'border-[var(--app-danger)] bg-[var(--bruise-soft)] text-[var(--app-danger)]'
          : 'border-[var(--app-warning)] bg-[var(--rust-soft)] text-[var(--app-warning)]'
      }`}
    >
      <div className="mb-1 font-medium">{hasError ? '这个步骤需要处理' : '这个步骤可以优化'}</div>
      <div className="space-y-1">
        {issues.map((issue) => (
          <p key={issue.id}>
            {issue.message}
            {issue.action ? <span className="ml-1 opacity-80">{issue.action}</span> : null}
          </p>
        ))}
      </div>
    </div>
  )
}
