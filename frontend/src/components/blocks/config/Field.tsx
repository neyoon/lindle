import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--app-text-soft)] mb-1">{label}</label>
      {children}
    </div>
  )
}
