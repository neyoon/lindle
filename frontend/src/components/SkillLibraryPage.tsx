/**
 * Skill 库 - 自定义 Skill 管理页面
 *
 * 管理所有自定义 Skills，支持创建、编辑、删除。
 * 创建的 Skills 会出现在 Agent 编辑页的可用 Skills 列表中。
 */
import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Pencil, Trash2, Wrench } from 'lucide-react'
import { listCustomSkills, createCustomSkill, deleteCustomSkill, listAgents, getAgent } from '@/api/client'
import { SkillEditor } from './SkillEditor'

interface CustomSkill {
  id: string
  name: string
  description: string
  icon: string
  code: string
  input_schema: Record<string, any>
  output_schema: Record<string, any>
}

interface Props {
  onBack: () => void
}

export function SkillLibraryPage({ onBack }: Props) {
  const [skills, setSkills] = useState<CustomSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CustomSkill | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  const loadSkills = async () => {
    try {
      const data = await listCustomSkills()
      setSkills(data)
    } catch (e) {
      console.error('加载 Skills 失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSkills()
  }, [])

  const handleSave = async (skill: CustomSkill) => {
    // 名称去重检查
    const duplicate = skills.find(
      (s) => s.name.trim() === skill.name.trim() && s.id !== skill.id
    )
    if (duplicate) {
      throw new Error(`已存在同名 Skill「${skill.name}」，请使用其他名称`)
    }

    await createCustomSkill(skill)
    await loadSkills()
  }

  const handleDelete = async (id: string, name: string) => {
    // 检查是否有 Agent 正在使用此 Skill
    try {
      const agents = await listAgents()
      const usingAgents: string[] = []

      for (const agentSummary of agents) {
        const agent = await getAgent(agentSummary.id)
        if (agent.skills?.some((s: any) => s.skill_id === id)) {
          usingAgents.push(agent.name)
        }
      }

      if (usingAgents.length > 0) {
        const agentNames = usingAgents.join('、')
        if (!confirm(`Skill「${name}」正在被以下 Agent 使用：${agentNames}\n\n删除后这些 Agent 将无法调用此 Skill。确定删除？`)) {
          return
        }
      } else {
        if (!confirm(`确定删除 Skill「${name}」？删除后不可恢复。`)) return
      }
    } catch {
      // 如果检查失败，仍允许删除但给出基本确认
      if (!confirm(`确定删除 Skill「${name}」？删除后不可恢复。`)) return
    }

    try {
      await deleteCustomSkill(id)
      await loadSkills()
    } catch (e) {
      alert(`删除失败: ${e}`)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* 顶栏 */}
      <div className="h-14 bg-white border-b px-4 flex items-center gap-3 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-purple-600 transition"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-bold text-purple-600 flex items-center gap-2">
          <Wrench size={18} />
          Skill 库
        </h1>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-gray-500 mb-4">
            管理你的自定义 Skills。创建的 Skills 会出现在 Agent 编辑页的可用 Skills 列表中。
          </p>

          {/* 新建按钮 */}
          <button
            onClick={() => { setEditing(null); setShowEditor(true) }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition font-medium mb-6"
          >
            <Plus size={16} />
            新建 Skill
          </button>

          {/* Skills 列表 */}
          {loading ? (
            <p className="text-gray-400 text-center py-12">加载中...</p>
          ) : skills.length === 0 ? (
            <div className="text-center py-16">
              <Wrench size={64} className="mx-auto text-gray-300 mb-4" />
              <p className="text-sm text-gray-400 mb-3">暂无自定义 Skill</p>
              <p className="text-gray-500 text-sm">还没有创建任何自定义 Skill</p>
              <p className="text-gray-400 text-xs mt-1">点击「新建 Skill」开始创建，或在工作流列表页将 Flow 导出为 Skill</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onEdit={() => { setEditing(skill); setShowEditor(true) }}
                  onDelete={() => handleDelete(skill.id, skill.name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Skill 编辑器模态框 */}
      {showEditor && (
        <SkillEditor
          initialSkill={editing || undefined}
          onSave={handleSave}
          onClose={() => { setShowEditor(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

// ===== Skill 卡片 =====

function SkillCard({
  skill,
  onEdit,
  onDelete,
}: {
  skill: CustomSkill
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white rounded-xl border-2 border-gray-100 hover:border-purple-200 p-4 transition group">
      <div className="text-3xl mb-2">{skill.icon || '⚡'}</div>
      <h3 className="font-semibold text-gray-800 text-sm">{skill.name}</h3>
      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{skill.description || '无描述'}</p>

      {/* 操作按钮 */}
      <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded transition"
        >
          <Pencil size={12} />
          编辑
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
        >
          <Trash2 size={12} />
          删除
        </button>
      </div>
    </div>
  )
}
