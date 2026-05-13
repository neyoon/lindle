import type { Block, Workflow } from '@/types/workflow'

export type FlowHealthSeverity = 'ok' | 'warning' | 'error'

export interface FlowHealthIssue {
  id: string
  severity: Exclude<FlowHealthSeverity, 'ok'>
  blockId?: string
  message: string
  action?: string
}

export interface FlowHealthSummary {
  severity: FlowHealthSeverity
  label: string
  issues: FlowHealthIssue[]
  byBlockId: Record<string, FlowHealthIssue[]>
  blockingCount: number
  warningCount: number
}

export function evaluateFlowHealth(workflow: Workflow): FlowHealthSummary {
  const issues: FlowHealthIssue[] = []
  const blockIds = new Set<string>()
  const blockRefs = new Map<string, string>()
  const inputNames = new Map<string, string>()

  for (const column of workflow.columns) {
    if (column.repeat < 1) {
      issues.push({
        id: `column-repeat-${column.id}`,
        severity: 'error',
        message: `第 ${column.order + 1} 步的重复次数需要大于 0`,
        action: '把重复次数改为 1 或更高',
      })
    }

    for (const block of column.blocks) {
      blockIds.add(block.id)
      collectBlockIssues(block, issues, blockRefs, inputNames)
    }
  }

  for (const column of workflow.columns) {
    for (const block of column.blocks) {
      for (const [index, connection] of block.connections.entries()) {
        if (!blockIds.has(connection.from_block_id)) {
          issues.push({
            id: `missing-connection-${block.id}-${index}`,
            severity: 'error',
            blockId: block.id,
            message: `${block.name} 连接了不存在的上游步骤`,
            action: '重新连接这个步骤',
          })
        }
      }
    }
  }

  const byBlockId: Record<string, FlowHealthIssue[]> = {}
  for (const issue of issues) {
    if (!issue.blockId) continue
    byBlockId[issue.blockId] = [...(byBlockId[issue.blockId] || []), issue]
  }

  const blockingCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const severity: FlowHealthSeverity = blockingCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok'

  return {
    severity,
    label: severity === 'ok' ? '可运行' : severity === 'warning' ? '可优化' : '需处理',
    issues,
    byBlockId,
    blockingCount,
    warningCount,
  }
}

function collectBlockIssues(
  block: Block,
  issues: FlowHealthIssue[],
  blockRefs: Map<string, string>,
  inputNames: Map<string, string>,
) {
  if (!block.name.trim()) {
    issues.push({
      id: `empty-name-${block.id}`,
      severity: 'error',
      blockId: block.id,
      message: '步骤名称不能为空',
      action: '给这个步骤起一个清楚的名字',
    })
  }

  const ref = block.ref.trim()
  if (!ref) {
    issues.push({
      id: `empty-ref-${block.id}`,
      severity: 'error',
      blockId: block.id,
      message: `${block.name || '步骤'} 缺少稳定引用`,
      action: '补一个英文或数字引用',
    })
  } else if (ref.includes('.')) {
    issues.push({
      id: `invalid-ref-${block.id}`,
      severity: 'error',
      blockId: block.id,
      message: `${block.name} 的引用不能包含英文句号`,
      action: '用下划线替代句号',
    })
  } else if (blockRefs.has(ref)) {
    issues.push({
      id: `duplicate-ref-${block.id}`,
      severity: 'error',
      blockId: block.id,
      message: `步骤引用重复：${ref}`,
      action: '改成唯一引用',
    })
  }
  if (ref) blockRefs.set(ref, block.id)

  if (block.type === 'process' && !(block.config.prompt || '').trim()) {
    issues.push({
      id: `missing-prompt-${block.id}`,
      severity: 'error',
      blockId: block.id,
      message: `${block.name} 还没有步骤说明`,
      action: '写一句这一步要做什么',
    })
  }

  if (block.type === 'tool' && !(block.config.plugin_id || '').trim()) {
    issues.push({
      id: `missing-plugin-${block.id}`,
      severity: 'error',
      blockId: block.id,
      message: `${block.name} 还没有选择工具`,
      action: '选择一个要执行的工具',
    })
  }

  if (block.type === 'collect' && block.config.fields) {
    for (const field of block.config.fields) {
      if (!field.name.trim()) {
        issues.push({
          id: `empty-input-${block.id}`,
          severity: 'error',
          blockId: block.id,
          message: `${block.name} 有未命名的输入字段`,
          action: '填写字段名，或删除这个字段',
        })
        continue
      }
      if (inputNames.has(field.name)) {
        issues.push({
          id: `duplicate-input-${block.id}-${field.name}`,
          severity: 'error',
          blockId: block.id,
          message: `输入字段重复：${field.name}`,
          action: '高级字段里改成唯一字段名',
        })
      }
      inputNames.set(field.name, block.id)
    }
  }
}
