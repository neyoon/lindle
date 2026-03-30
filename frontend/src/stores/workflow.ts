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
import type { Block, BlockTemplate, BlockType, Column, RunResult, Workflow } from '@/types/workflow'

let blockCounter = 0
let columnCounter = 0

function genBlockId(): string {
  return `blk_${++blockCounter}_${Date.now()}`
}

function genColumnId(): string {
  return `col_${++columnCounter}_${Date.now()}`
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
  isRunning: boolean

  // 端口连接交互
  connectingFrom: ConnectingState | null

  // 工作流操作
  setWorkflow: (workflow: Workflow) => void
  updateWorkflowMeta: (name: string, description: string) => void

  // 栏操作
  addColumn: (afterOrder?: number) => void
  removeColumn: (columnId: string) => void
  setColumnRepeat: (columnId: string, repeat: number) => void

  // 块操作
  addBlock: (columnId: string, type: BlockType, name: string, pluginId?: string) => void
  addBlockFromTemplate: (columnId: string, template: BlockTemplate) => void
  removeBlock: (columnId: string, blockId: string) => void
  updateBlock: (blockId: string, updates: Partial<Block>) => void
  selectBlock: (blockId: string | null) => void

  // 连接操作
  addConnection: (blockId: string, fromBlockId: string, fromKey?: string) => void
  removeConnection: (blockId: string, fromBlockId: string) => void
  startConnecting: (blockId: string, columnOrder: number) => void
  finishConnecting: (targetBlockId: string) => void
  cancelConnecting: () => void

  // 执行
  setRunResult: (result: RunResult | null) => void
  setIsRunning: (running: boolean) => void
}

const defaultWorkflow: Workflow = {
  id: '',
  name: '新建工作流',
  description: '',
  columns: [],
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: defaultWorkflow,
  selectedBlockId: null,
  runResult: null,
  isRunning: false,
  connectingFrom: null,

  setWorkflow: (workflow) => set({ workflow }),

  updateWorkflowMeta: (name, description) =>
    set((state) => ({
      workflow: { ...state.workflow, name, description },
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
    set({ workflow: { ...state.workflow, columns } })
  },

  removeColumn: (columnId) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns
          .filter((c) => c.id !== columnId)
          .map((c, i) => ({ ...c, order: i })),
      },
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
      newBlock.config.fields = [{ name: 'input', label: '输入', field_type: 'text', required: true }]
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
    }))
  },

  removeBlock: (columnId, blockId) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) =>
          c.id === columnId ? { ...c, blocks: c.blocks.filter((b) => b.id !== blockId) } : c,
        ),
      },
    })),

  updateBlock: (blockId, updates) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        columns: state.workflow.columns.map((c) => ({
          ...c,
          blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)),
        })),
      },
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

  setRunResult: (result) => set({ runResult: result }),
  setIsRunning: (running) => set({ isRunning: running }),
}))
