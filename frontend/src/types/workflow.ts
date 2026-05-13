export type BlockType = 'collect' | 'process' | 'result' | 'tool'

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
  plugin_input_bindings?: Record<string, PluginInputBinding> | null
}

export interface PluginInputBinding {
  kind: 'variable' | 'literal'
  value: string | number | null
}

export interface Block {
  id: string
  ref: string
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
  stop_on_error?: boolean
}

export interface WorkflowSummary {
  id: string
  name: string
  description: string
  column_count: number
}

export interface BlockTemplate {
  id: string
  ref: string
  type: BlockType
  name: string
  description: string
  icon: string
  config: BlockConfig
  output_schema?: OutputSchema | null
  created_at?: string
}

export interface StepEvent {
  event_type: 'column_start' | 'block_start' | 'block_done' | 'column_done' | 'flow_done' | 'error'
  column_id: string
  column_order?: number
  block_id: string
  block_name: string
  data?: unknown
  elapsed: number
  error?: string
}

export type BlockRunStatus = 'running' | 'done' | 'error'

export interface RunResult {
  success: boolean
  output: Record<string, unknown>
  steps: StepEvent[]
  total_elapsed: number
  error?: string
}

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
  input_schema?: Record<string, unknown>
  output_schema?: Record<string, unknown>
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
  input_schema?: Record<string, unknown> | null
  output_schema?: Record<string, unknown> | null
}
