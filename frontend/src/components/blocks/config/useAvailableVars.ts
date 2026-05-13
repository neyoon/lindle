import { useMemo } from 'react'
import { useWorkflowStore } from '@/stores/workflow'
import type { Block } from '@/types/workflow'

export interface AvailableVar {
  template: string
  label: string
  group: 'input' | 'step'
}

export function useAvailableVars(block: Block): AvailableVar[] {
  const workflow = useWorkflowStore((s) => s.workflow)

  return useMemo(() => {
    let currentColOrder = -1
    for (const col of workflow.columns) {
      if (col.blocks.some((b) => b.id === block.id)) {
        currentColOrder = col.order
        break
      }
    }
    if (currentColOrder < 0) return []

    const vars: AvailableVar[] = []
    const sortedCols = [...workflow.columns].sort((a, b) => a.order - b.order)
    for (const col of sortedCols) {
      if (col.order >= currentColOrder) break

      for (const b of col.blocks) {
        if (b.type === 'collect' && b.config.fields) {
          for (const f of b.config.fields) {
            vars.push({
              template: `{{inputs.${f.name}}}`,
              label: `${f.label || f.name}`,
              group: 'input',
            })
          }
        }

        if (b.type !== 'collect') {
          vars.push({
            template: `{{steps.${b.ref}}}`,
            label: `${b.name} (${b.ref})`,
            group: 'step',
          })

          if (b.output_schema?.keys) {
            for (const key of b.output_schema.keys) {
              vars.push({
                template: `{{steps.${b.ref}.${key}}}`,
                label: `${b.name} (${b.ref}) → ${key}`,
                group: 'step',
              })
            }
          }
        }
      }
    }

    return vars
  }, [workflow.columns, block.id])
}
