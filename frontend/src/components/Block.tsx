/**
 * 块组件 - 最小执行单元（正方形卡片）
 *
 * 显示:
 * - 类型标签 + 名称
 * - 简要配置预览
 * - 连接指示 / JSON 输出标记
 */
import { Trash2, Link } from 'lucide-react'
import type { Block } from '@/types/workflow'
import { useWorkflowStore } from '@/stores/workflow'

const TYPE_STYLES: Record<string, { bg: string; border: string; tag: string; tagColor: string; icon: string }> = {
  input:  { bg: 'bg-sky-50',    border: 'border-sky-200',    tag: 'IN',     tagColor: 'text-sky-600 bg-sky-100',    icon: '📥' },
  ai:     { bg: 'bg-sky-50',    border: 'border-sky-300',    tag: 'AI',     tagColor: 'text-sky-700 bg-sky-100',    icon: '🤖' },
  output: { bg: 'bg-sky-50',    border: 'border-sky-200',    tag: 'OUT',    tagColor: 'text-sky-600 bg-sky-100',    icon: '📤' },
  plugin: { bg: 'bg-teal-50',   border: 'border-teal-200',   tag: 'PLUGIN', tagColor: 'text-teal-600 bg-teal-100',  icon: '🔌' },
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
    preview = block.config.prompt.slice(0, 40) + (block.config.prompt.length > 40 ? '...' : '')
  } else if (block.type === 'input' && block.config.fields) {
    preview = block.config.fields.map((f) => f.label || f.name).join(', ')
  } else if (block.type === 'plugin' && block.config.plugin_id) {
    preview = block.config.plugin_id
  }

  return (
    <div
      onClick={() => selectBlock(block.id)}
      className={`
        w-[140px] h-[140px] rounded-xl border-2 cursor-pointer transition flex flex-col items-center justify-center gap-1.5 p-3
        ${style.bg} ${style.border}
        ${isSelected ? 'ring-2 ring-sky-400 shadow-lg scale-[1.03]' : 'hover:shadow-md hover:scale-[1.01]'}
      `}
    >
      {/* 顶部工具条 */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5" style={{ position: 'absolute' }}>
        {block.connections.length > 0 && (
          <span className="text-sky-400" title="有手动连接">
            <Link size={11} />
          </span>
        )}
        {block.output_schema && (
          <span className="text-[9px] font-mono text-sky-600 bg-sky-100 rounded px-1" title="JSON 输出">
            JSON
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeBlock(columnId, block.id)
          }}
          className="p-0.5 text-gray-300 hover:text-red-500 rounded"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 图标 */}
      <span className="text-2xl">{style.icon}</span>

      {/* 类型标签 */}
      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${style.tagColor}`}>
        {style.tag}
      </span>

      {/* 名称 */}
      <span className="text-xs font-semibold text-gray-700 text-center leading-tight truncate w-full">
        {block.name}
      </span>

      {/* 预览 */}
      {preview && (
        <p className="text-[10px] text-gray-400 text-center truncate w-full leading-tight">{preview}</p>
      )}
    </div>
  )
}
