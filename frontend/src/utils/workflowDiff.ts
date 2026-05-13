import type { Block, Workflow } from '@/types/workflow'

export function computeBlockDiff(
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
