/**
 * 工作流状态管理 (Zustand)
 *
 * 管理:
 * - 当前工作流数据
 * - 选中的块
 * - 端口连接交互状态
 * - 执行状态
 */
import { create } from 'zustand'
import type {
  Block,
  BlockRunStatus,
  BlockTemplate,
  BlockType,
  Column,
  RunResult,
  StepEvent,
  Workflow,
} from '@/types/workflow'

let blockCounter = 0
let columnCounter = 0

function genBlockId(): string {
  return `blk_${++blockCounter}_${Date.now()}`
}

function genColumnId(): string {
  return `col_${++columnCounter}_${Date.now()}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceBlockReferenceInText(text: string | null | undefined, oldName: string, newName: string): string | null | undefined {
  if (!text || !oldName || oldName === newName) return text
  const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(oldName)}((?:\\.[^}]+)?)\\s*\\}\\}`, 'g')
  return text.replace(pattern, (_match, suffix) => `{{${newName}${suffix || ''}}}`)
}

function replaceInputReferenceInText(text: string | null | undefined, oldName: string, newName: string): string | null | undefined {
  if (!text || !oldName || oldName === newName) return text
  const pattern = new RegExp(`\\{\\{\\s*input\\.${escapeRegExp(oldName)}\\s*\\}\\}`, 'g')
  return text.replace(pattern, `{{input.${newName}}}`)
}

function migrateBlockReferences(block: Block, oldName: string, newName: string): Block {
  return {
    ...block,
    config: {
      ...block.config,
      prompt: replaceBlockReferenceInText(block.config.prompt, oldName, newName) ?? block.config.prompt,
      plugin_input_bindings: block.config.plugin_input_bindings
        ? Object.fromEntries(
            Object.entries(block.config.plugin_input_bindings).map(([key, binding]) => [
              key,
              binding.kind === 'variable'
                ? { ...binding, value: replaceBlockReferenceInText(String(binding.value || ''), oldName, newName)?.replace(/^\{\{|\}\}$/g, '') ?? binding.value }
                : binding,
            ]),
          )
        : block.config.plugin_input_bindings,
    },
  }
}

function migrateInputReferences(block: Block, oldName: string, newName: string): Block {
  return {
    ...block,
    config: {
      ...block.config,
      prompt: replaceInputReferenceInText(block.config.prompt, oldName, newName) ?? block.config.prompt,
      plugin_input_bindings: block.config.plugin_input_bindings
        ? Object.fromEntries(
            Object.entries(block.config.plugin_input_bindings).map(([key, binding]) => [
              key,
              binding.kind === 'variable'
                ? { ...binding, value: replaceInputReferenceInText(String(binding.value || ''), oldName, newName)?.replace(/^\{\{|\}\}$/g, '') ?? binding.value }
                : binding,
            ]),
          )
        : block.config.plugin_input_bindings,
    },
  }
}

interface ConnectingState {
  blockId: string
  columnOrder: number
}

interface WorkflowState {
  // 数据
  workflow: Workflow
  selectedBlockId: string | null
  runResult: RunResult | null
  runEvents: StepEvent[]
  liveOutput: unknown | null
  blockRunState: Record<string, BlockRunStatus>
  isRunning: boolean
  userInputs: Record<string, string>

  // 端口连接交互
  connectingFrom: ConnectingState | null

  // AI 编辑 diff 高亮
  blockDiffMap: Record<string, 'added' | 'modified'> | null
  setBlockDiffMap: (map: Record<string, 'added' | 'modified'> | null) => void

  // 工作流操作
  setWorkflow: (workflow: Workflow) => void
  updateWorkflowMeta: (name: string, description: string) => void
  setStopOnError: (stop: boolean) => void

  // 栏操作
  addColumn: (afterOrder?: number) => void
  removeColumn: (columnId: string) => void
  setColumnRepeat: (columnId: string, repeat: number) => void

  // 块操作
  addBlock: (columnId: string, type: BlockType, name: string, pluginId?: string) => void
  addBlockFromTemplate: (columnId: string, template: BlockTemplate) => void
  moveBlock: (blockId: string, fromColumnId: string, toColumnId: string, insertIndex: number) => void
  removeBlock: (columnId: string, blockId: string) => void
  updateBlock: (blockId: string, updates: Partial<Block>) => void
  renameInputReference: (oldName: string, newName: string) => void
  selectBlock: (blockId: string | null) => void

  // 连接操作
  addConnection: (blockId: string, fromBlockId: string, fromKey?: string) => void
  removeConnection: (blockId: string, fromBlockId: string) => void
  updateConnectionKey: (blockId: string, fromBlockId: string, fromKey: string | null) => void
  startConnecting: (blockId: string, columnOrder: number) => void
  finishConnecting: (targetBlockId: string) => void
  cancelConnecting: () => void

  // 执行 & 用户输入
  resetRunState: () => void
  appendRunEvent: (event: StepEvent) => void
  setLiveOutput: (output: unknown | null) => void
  setBlockRunState: (blockId: string, status: BlockRunStatus) => void
  setRunResult: (result: RunResult | null) => void
  setIsRunning: (running: boolean) => void
  setUserInput: (key: string, value: string) => void
  clearUserInputs: () => void
}

const defaultWorkflow: Workflow = {
  id: '',
  name: '新建工作流',
  description: '',
  columns: [],
  stop_on_error: true,
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: defaultWorkflow,
  selectedBlockId: null,
  runResult: null,
  runEvents: [],
  liveOutput: null,
  blockRunState: {},
  isRunning: false,
  userInputs: {},
  connectingFrom: null,
  blockDiffMap: null,

  setBlockDiffMap: (map) => set({ blockDiffMap: map }),

  setWorkflow: (workflow) => set({ workflow }),

  updateWorkflowMeta: (name, description) =>
    set((state) => ({
      workflow: { ...state.workflow, name, description },
      blockDiffMap: null,
    })),

  setStopOnError: (stop) =>
    set((state) => ({
      workflow: { ...state.workflow, stop_on_error: stop },
    })),

  addColumn: (afterOrder) => {
    const state = get()
    const columns = [...state.workflow.columns]
    const newOrder = afterOrder !== undefined ? afterOrder + 1 : columns.length
    columns.forEach((col) => {
      if (col.order >= newOrder) col.order += 1
    })
    columns.push({
      id: genColumnId(),
      order: newOrder,
      blocks: [],
      repeat: 1,
    })
    columns.sort((a, b) => a.order - b.order)
    set({ workflow: { ...state.workflow, columns }, blockDiffMap: null })
  },

  removeColumn: (columnId) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns
          .filter((c) => c.id !== columnId)
          .map((c, i) => ({ ...c, order: i })),
      },
      blockDiffMap: null,
    })),

  setColumnRepeat: (columnId, repeat) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) =>
          c.id === columnId ? { ...c, repeat: Math.max(1, repeat) } : c,
        ),
      },
    })),

  addBlock: (columnId, type, name, pluginId) => {
    const newBlock: Block = {
      id: genBlockId(),
      type,
      name,
      config: {},
      connections: [],
    }
    if (type === 'input') {
      newBlock.config.fields = []
    } else if (type === 'ai') {
      newBlock.config.prompt = ''
      newBlock.config.model = null
    } else if (type === 'plugin' && pluginId) {
      newBlock.config.plugin_id = pluginId
    }

    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) =>
          c.id === columnId ? { ...c, blocks: [...c.blocks, newBlock] } : c,
        ),
      },
      blockDiffMap: null,
    }))
  },

  addBlockFromTemplate: (columnId, template) => {
    const newBlock: Block = {
      id: genBlockId(),
      type: template.type,
      name: template.name,
      config: JSON.parse(JSON.stringify(template.config)),
      output_schema: template.output_schema
        ? JSON.parse(JSON.stringify(template.output_schema))
        : undefined,
      connections: [],
    }
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) =>
          c.id === columnId ? { ...c, blocks: [...c.blocks, newBlock] } : c,
        ),
      },
      blockDiffMap: null,
    }))
  },

  moveBlock: (blockId, fromColumnId, toColumnId, insertIndex) =>
    set((state) => {
      const columns = state.workflow.columns.map((c) => ({
        ...c,
        blocks: [...c.blocks],
      }))
      const srcCol = columns.find((c) => c.id === fromColumnId)
      const dstCol = columns.find((c) => c.id === toColumnId)
      if (!srcCol || !dstCol) return state

      const blockIdx = srcCol.blocks.findIndex((b) => b.id === blockId)
      if (blockIdx === -1) return state

      const [block] = srcCol.blocks.splice(blockIdx, 1)

      if (fromColumnId !== toColumnId) {
        // 清空自身入连线 + 清除所有其他块中引用此块的出连线
        block.connections = []
        for (const col of columns) {
          col.blocks = col.blocks.map((b) => ({
            ...b,
            connections: b.connections.filter((c) => c.from_block_id !== blockId),
          }))
        }
      }

      const clampedIndex = Math.min(insertIndex, dstCol.blocks.length)
      dstCol.blocks.splice(clampedIndex, 0, block)

      return { workflow: { ...state.workflow, columns }, blockDiffMap: null }
    }),

  removeBlock: (columnId, blockId) => {
    const { connectingFrom } = get()
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) => ({
          ...c,
          blocks: (c.id === columnId ? c.blocks.filter((b) => b.id !== blockId) : c.blocks)
            .map((b) => ({
              ...b,
              connections: b.connections.filter((conn) => conn.from_block_id !== blockId),
            })),
        })),
      },
      connectingFrom: connectingFrom?.blockId === blockId ? null : connectingFrom,
      selectedBlockId: get().selectedBlockId === blockId ? null : get().selectedBlockId,
      blockDiffMap: null,
    }))
  },

  updateBlock: (blockId, updates) =>
    set((state) => {
      let oldName: string | null = null
      for (const column of state.workflow.columns) {
        const block = column.blocks.find((item) => item.id === blockId)
        if (block) {
          oldName = block.name
          break
        }
      }

      let columns = state.workflow.columns.map((c) => ({
        ...c,
        blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)),
      }))

      const nextName = typeof updates.name === 'string' ? updates.name : null
      if (oldName && nextName && oldName !== nextName) {
        columns = columns.map((column) => ({
          ...column,
          blocks: column.blocks.map((block) => migrateBlockReferences(block, oldName as string, nextName)),
        }))
      }

      return {
        workflow: {
          ...state.workflow,
          columns,
        },
        blockDiffMap: null,
      }
    }),

  renameInputReference: (oldName, newName) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((column) => ({
          ...column,
          blocks: column.blocks.map((block) => migrateInputReferences(block, oldName, newName)),
        })),
      },
      blockDiffMap: null,
    })),

  selectBlock: (blockId) => set({ selectedBlockId: blockId }),

  addConnection: (blockId, fromBlockId, fromKey) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) => ({
          ...c,
          blocks: c.blocks.map((b) => {
            if (b.id !== blockId) return b
            const exists = b.connections.some((conn) => conn.from_block_id === fromBlockId)
            if (exists) return b
            return {
              ...b,
              connections: [...b.connections, { from_block_id: fromBlockId, from_key: fromKey }],
            }
          }),
        })),
      },
    })),

  removeConnection: (blockId, fromBlockId) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) => ({
          ...c,
          blocks: c.blocks.map((b) =>
            b.id === blockId
              ? { ...b, connections: b.connections.filter((conn) => conn.from_block_id !== fromBlockId) }
              : b,
          ),
        })),
      },
    })),

  updateConnectionKey: (blockId, fromBlockId, fromKey) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) => ({
          ...c,
          blocks: c.blocks.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  connections: b.connections.map((conn) =>
                    conn.from_block_id === fromBlockId
                      ? { ...conn, from_key: fromKey }
                      : conn,
                  ),
                }
              : b,
          ),
        })),
      },
    })),

  // ===== 端口连接交互 =====

  startConnecting: (blockId, columnOrder) =>
    set({ connectingFrom: { blockId, columnOrder } }),

  finishConnecting: (targetBlockId) => {
    const { connectingFrom } = get()
    if (!connectingFrom || connectingFrom.blockId === targetBlockId) {
      set({ connectingFrom: null })
      return
    }
    // 验证: 只允许从前列连接到后列（由 Block 组件的端口可见性保证）
    get().addConnection(targetBlockId, connectingFrom.blockId)
    set({ connectingFrom: null })
  },

  cancelConnecting: () => set({ connectingFrom: null }),

  resetRunState: () => set({ runResult: null, runEvents: [], liveOutput: null, blockRunState: {} }),
  appendRunEvent: (event) => set((state) => ({ runEvents: [...state.runEvents, event] })),
  setLiveOutput: (output) => set({ liveOutput: output }),
  setBlockRunState: (blockId, status) =>
    set((state) => ({
      blockRunState: { ...state.blockRunState, [blockId]: status },
    })),
  setRunResult: (result) => set({ runResult: result }),
  setIsRunning: (running) => set({ isRunning: running }),
  setUserInput: (key, value) =>
    set((state) => ({ userInputs: { ...state.userInputs, [key]: value } })),
  clearUserInputs: () => set({ userInputs: {} }),
}))
