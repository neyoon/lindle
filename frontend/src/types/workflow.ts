/**
 * MiniFlow 类型定义
 *
 * 核心概念:
 * - Workflow: 工作流，由有序的 Column 组成
 * - Column: 栏（竖条），代表一个执行步骤，内含并行执行的 Block
 * - Block: 块，最小执行单元（输入/AI/输出/插件）
 * - Connection: 连接，可选的精确数据流指定
 * - BlockTemplate: 可复用块模板，制造工坊的产物
 */

export type BlockType = 'input' | 'ai' | 'output' | 'plugin'

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
  fields?: InputField[] | null
  plugin_id?: string | null
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

// ===== 块模板 (制造工坊) =====

export interface BlockTemplate {
  id: string
  type: BlockType
  name: string
  description: string
  icon: string
  config: BlockConfig
  output_schema?: OutputSchema | null
  created_at?: string
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

// ===== 插件 =====

export interface PluginParam {
  name: string
  label: string
  param_type: 'text' | 'password' | 'number'
  required: boolean
  description: string
  default: string
}

export interface PluginMeta {
  id: string
  name: string
  description: string
  icon: string
  params: PluginParam[]
}

export interface PluginInfo {
  meta: PluginMeta
  enabled: boolean
  config: Record<string, string>
}

export interface EnabledPlugin {
  id: string
  name: string
  icon: string
  description: string
}
