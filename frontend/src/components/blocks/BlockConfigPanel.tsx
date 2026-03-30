/**
 * 块配置面板 - 右侧边栏
 *
 * 根据块类型显示不同配置项:
 * - Input: 输入字段定义
 * - AI: 提示词 + 模型选择 + JSON输出key（高级选项）
 * - Output: 无需配置
 * - 连接通过端口管理，此处仅只读展示
 */
import { X, ChevronDown, ChevronUp, Link } from 'lucide-react'
import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow'
import type { Block, Column, OutputSchema } from '@/types/workflow'

export function BlockConfigPanel() {
  const { workflow, selectedBlockId, selectBlock, updateBlock, removeConnection } = useWorkflowStore()

  // 找到选中的块及其所在栏
  let block: Block | null = null
  let blockColumn: Column | null = null
  for (const col of workflow.columns) {
    for (const b of col.blocks) {
      if (b.id === selectedBlockId) {
        block = b
        blockColumn = col
      }
    }
  }

  if (!block || !blockColumn) return null

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-sky-100 flex items-center justify-between bg-sky-50/30">
        <h3 className="text-sm font-semibold text-sky-700">配置: {block.name}</h3>
        <button onClick={() => selectBlock(null)} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      {/* 配置内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 块名称 */}
        <Field label="名称">
          <input
            className="input-field"
            value={block.name}
            onChange={(e) => updateBlock(block!.id, { name: e.target.value })}
          />
        </Field>

        {/* 连接信息（只读展示 + 可删除） */}
        {block.connections.length > 0 && (
          <ConnectionDisplay block={block} workflow={workflow} onRemove={removeConnection} />
        )}

        {/* 按类型渲染不同配置 */}
        {block.type === 'ai' && <AIConfig block={block} />}
        {block.type === 'input' && <InputConfig block={block} />}
        {block.type === 'plugin' && <PluginBlockConfig block={block} />}
        {block.type === 'output' && (
          <p className="text-sm text-gray-400">输出块自动展示上一栏的结果，无需额外配置。</p>
        )}
      </div>
    </div>
  )
}

// ===== 连接只读展示 =====

function ConnectionDisplay({
  block,
  workflow,
  onRemove,
}: {
  block: Block
  workflow: { columns: Column[] }
  onRemove: (blockId: string, fromBlockId: string) => void
}) {
  // 查找源块名称
  const findBlockName = (id: string): string => {
    for (const col of workflow.columns) {
      for (const b of col.blocks) {
        if (b.id === id) return b.name
      }
    }
    return id
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        <span className="flex items-center gap-1">
          <Link size={12} />
          已连接的上游块
        </span>
      </label>
      <div className="space-y-1.5">
        {block.connections.map((conn) => (
          <div
            key={conn.from_block_id}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-700"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-sky-400">←</span>
              <span className="font-medium">{findBlockName(conn.from_block_id)}</span>
            </span>
            <button
              onClick={() => onRemove(block.id, conn.from_block_id)}
              className="text-sky-400 hover:text-red-500 transition"
              title="断开连接"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">
        💡 通过端口连接：点击源块右侧圆点 → 目标块左侧圆点
      </p>
    </div>
  )
}

// ===== AI 块配置 =====

function AIConfig({ block }: { block: Block }) {
  const { updateBlock } = useWorkflowStore()
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <>
      <Field label="提示词">
        <textarea
          className="input-field min-h-[120px] resize-y"
          value={block.config.prompt || ''}
          onChange={(e) =>
            updateBlock(block.id, { config: { ...block.config, prompt: e.target.value } })
          }
          placeholder="告诉 AI 你想让它做什么..."
        />
      </Field>

      <Field label="模型（可选）">
        <input
          className="input-field"
          value={block.config.model || ''}
          onChange={(e) =>
            updateBlock(block.id, {
              config: { ...block.config, model: e.target.value || null },
            })
          }
          placeholder="默认: gpt-4o-mini"
        />
      </Field>

      {/* 高级选项: JSON 输出 key */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          高级选项
        </button>

        {showAdvanced && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
            <p className="text-xs text-gray-500">
              定义输出的 JSON key，让下游块可以精确引用。
            </p>
            <OutputSchemaEditor
              schema={block.output_schema || null}
              onChange={(schema) => updateBlock(block.id, { output_schema: schema })}
            />
          </div>
        )}
      </div>
    </>
  )
}

// ===== JSON 输出 Key 编辑器 =====

function OutputSchemaEditor({
  schema,
  onChange,
}: {
  schema: OutputSchema | null
  onChange: (schema: OutputSchema | null) => void
}) {
  const keys = schema?.keys || []

  const addKey = () => {
    const key = prompt('输入 JSON key 名称:')
    if (key) {
      onChange({
        keys: [...keys, key],
        descriptions: schema?.descriptions || {},
      })
    }
  }

  const removeKey = (index: number) => {
    const newKeys = keys.filter((_, i) => i !== index)
    if (newKeys.length === 0) {
      onChange(null)
    } else {
      onChange({ keys: newKeys, descriptions: schema?.descriptions || {} })
    }
  }

  return (
    <div className="space-y-1">
      {keys.map((key, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-mono bg-white px-2 py-1 rounded border flex-1">{key}</span>
          <button onClick={() => removeKey(i)} className="text-red-400 text-xs hover:text-red-600">
            删除
          </button>
        </div>
      ))}
      <button onClick={addKey} className="text-xs text-sky-500 hover:text-sky-700">
        + 添加 Key
      </button>
    </div>
  )
}

// ===== Plugin 块配置 =====

function PluginBlockConfig({ block }: { block: Block }) {
  return (
    <>
      <div className="p-3 bg-teal-50 rounded-lg">
        <p className="text-xs text-teal-700 font-medium mb-1">🔌 插件块</p>
        <p className="text-xs text-teal-600">
          插件 ID: <span className="font-mono">{block.config.plugin_id || '未配置'}</span>
        </p>
        <p className="text-xs text-gray-500 mt-2">
          插件的参数（如 Token）在「插件管理」页面中配置。
          此处无需额外设置，运行时会自动使用已配置的参数。
        </p>
      </div>
    </>
  )
}

// ===== Input 块配置 =====

function InputConfig({ block }: { block: Block }) {
  const { updateBlock } = useWorkflowStore()
  const fields = block.config.fields || []

  const addField = () => {
    const name = prompt('字段名称:')
    if (name) {
      updateBlock(block.id, {
        config: {
          ...block.config,
          fields: [...fields, { name, label: name, field_type: 'text' as const, required: true }],
        },
      })
    }
  }

  return (
    <>
      <p className="text-xs text-gray-500">定义用户需要填写的输入字段</p>
      {fields.map((field, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm text-gray-600 flex-1">{field.label || field.name}</span>
          <span className="text-xs text-gray-400">{field.field_type}</span>
        </div>
      ))}
      <button onClick={addField} className="text-xs text-sky-500 hover:text-sky-700">
        + 添加字段
      </button>
    </>
  )
}

// ===== 通用组件 =====

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
