/**
 * Agent 列表页
 *
 * 展示所有已创建的 Agent，支持:
 * - 查看 Agent 列表
 * - 新建 Agent
 * - 编辑已有 Agent
 * - 删除 Agent
 */
import { useEffect, useState } from 'react'
import { Plus, Trash2, Sparkles, Wrench } from 'lucide-react'
import { listAgents, deleteAgent } from '@/api/client'

interface AgentSummary {
  id: string
  name: string
  description: string
  skill_count: number
  created_at: string
  updated_at: string
}

interface Props {
  onOpen: (agentId: string) => void
  onCreateNew: () => void
  onBack: () => void
  onOpenSkillLibrary?: () => void
}

export function AgentListPage({ onOpen, onCreateNew, onBack, onOpenSkillLibrary }: Props) {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)

  const loadAgents = async () => {
    try {
      const data = await listAgents()
      setAgents(data)
    } catch (e) {
      console.error('加载 Agent 失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (!confirm(`确定删除 Agent「${name}」？删除后不可恢复。`)) return
    try {
      await deleteAgent(id)
      setAgents((prev) => prev.filter((a) => a.id !== id))
    } catch (e) {
      alert(`删除失败: ${e}`)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* 顶栏 */}
      <div className="h-14 bg-white border-b px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-bold text-purple-600 flex items-center gap-2">
            <Sparkles size={20} />
            我的 Agent
            <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">Beta</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {onOpenSkillLibrary && (
            <button
              onClick={onOpenSkillLibrary}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
            >
              <Wrench size={16} />
              Skill 库
            </button>
          )}
          {agents.length > 0 && (
            <button
              onClick={onCreateNew}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition shadow-sm"
            >
              创建 Agent
            </button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-center text-gray-400 py-12">加载中...</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles size={64} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-400 mb-6">还没有创建任何 Agent</p>
            <button
              onClick={onCreateNew}
              className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
            >
              创建第一个 Agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => onOpen(agent.id)}
                className="bg-white rounded-lg p-5 border border-gray-200 hover:border-purple-300 hover:shadow-md transition Claude Code-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={20} className="text-purple-500" />
                    <h3 className="font-semibold text-gray-800 group-hover:text-purple-600 transition">
                      {agent.name}
                    </h3>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, agent.id, agent.name)}
                    className="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <p className="text-sm text-gray-500 mb-4 line-clamp-2 min-h-[2.5rem]">
                  {agent.description || '暂无描述'}
                </p>

                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div className="flex items-center gap-1">
                    <Wrench size={14} />
                    <span>{agent.skill_count} 个 Skills</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
