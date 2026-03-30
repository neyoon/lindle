/**
 * 块组件 - 最小执行单元
 *
 * 显示:
 * - 类型标签 + 名称
 * - 简要配置预览
 * - 连接指示 / JSON 输出标记
 */
import { Trash2, Link } from 'lucide-react'
import type { Block } from '@/types/workflow'
import { useWorkflowStore } from '@/stores/workflow'

const TYPE_STYLES: Record<string, { bg: string; border: string; tag: string; tagColor: string }> = {
  input:  { bg: 'bg-blue-50',   border: 'border-blue-200',   tag: 'IN',  tagColor: 'text-blue-500 bg-blue-100' },
  ai:     { bg: 'bg-purple-50', border: 'border-purple-200', tag: 'AI',  tagColor: 'text-purple-500 bg-purple-100' },
  tool:   { bg: 'bg-amber-50',  border: 'border-amber-200',  tag: 'TL',  tagColor: 'text-amber-600 bg-amber-100' },
  output: { bg: 'bg-green-50',  border: 'border-green-200',  tag: 'OUT', tagColor: 'text-green-600 bg-green-100' },
}

interface Props {
  block: Block
  columnId: string
}

export function BlockView({ block, columnId }: Props) {
  const { selectBlock, removeBlock, selectedBlockId } = useWorkflowStore()
  const style = TYPE_STYLES[block.type] || TYPE_STYLES.input
  const isSelected = selectedBlockId === block.id

  // 配置预览文本
  let preview = ''
  if (block.type === 'ai' && block.config.prompt) {
    preview = block.config.prompt.slice(0, 50) + (block.config.prompt.length > 50 ? '...' : '')
  } else if (block.type === 'tool' && block.config.tool_id) {
    preview = block.config.tool_id
  } else if (block.type === 'input' && block.config.fields) {
    preview = block.config.fields.map((f) => f.label || f.name).join(', ')
  }

  return (
    <div
      onClick={() => selectBlock(block.id)}
      className={`
        p-2.5 rounded-lg border cursor-pointer transition
        ${style.bg} ${style.border}
        ${isSelected ? 'ring-2 ring-indigo-400 shadow-md' : 'hover:shadow-sm'}
      `}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${style.tagColor}`}>
            {style.tag}
          </span>
          <span className="text-sm font-medium text-gray-700">{block.name}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {block.connections.length > 0 && (
            <span className="text-indigo-400" title="有手动连接">
              <Link size={12} />
            </span>
          )}
          {block.output_schema && (
            <span className="text-[10px] font-mono text-orange-500 bg-orange-50 rounded px-1" title="JSON 输出">
              JSON
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeBlock(columnId, block.id)
            }}
            className="p-0.5 text-gray-400 hover:text-red-500 rounded ml-1"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {preview && <p className="text-xs text-gray-500 truncate">{preview}</p>}
    </div>
  )
}
