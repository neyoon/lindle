/**
 * MiniFlow 工作流类型定义
 *
 * 核心概念:
 * - Workflow: 工作流，由有序的 Column 组成
 * - Column: 栏（竖条），代表一个执行步骤，内含并行执行的 Block
 * - Block: 块，最小执行单元（输入/AI/工具/输出）
 * - Connection: 连接，可选的精确数据流指定
 */

export type BlockType = 'input' | 'ai' | 'tool' | 'output'

export interface OutputSchema {
  keys: string[]
  descriptions?: Record<string, string>
}

export interface Connection {
  from_block_id: string
  from_key?: string | null
}

export interface InputField {
  name: string
  label: string
  field_type: 'text' | 'number' | 'textarea' | 'file'
  required: boolean
  default?: string | number | null
}

export interface BlockConfig {
  prompt?: string | null
  model?: string | null
  tool_id?: string | null
  tool_params?: Record<string, unknown>
  fields?: InputField[] | null
}

export interface Block {
  id: string
  type: BlockType
  name: string
  config: BlockConfig
  output_schema?: OutputSchema | null
  connections: Connection[]
}

export interface Column {
  id: string
  order: number
  blocks: Block[]
  repeat: number
}

export interface Workflow {
  id: string
  name: string
  description: string
  columns: Column[]
}

// ===== 执行相关 =====

export interface StepEvent {
  event_type: 'column_start' | 'block_start' | 'block_done' | 'column_done' | 'flow_done' | 'error'
  column_id: string
  block_id: string
  block_name: string
  data?: unknown
  elapsed: number
  error?: string
}

export interface RunResult {
  success: boolean
  output: Record<string, unknown>
  steps: StepEvent[]
  total_elapsed: number
  error?: string
}

// ===== 工具 =====

export interface ToolInfo {
  id: string
  name: string
  description: string
}
