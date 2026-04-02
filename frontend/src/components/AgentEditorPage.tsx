/**
 * Agent 编辑器页面 - 左中右三栏布局（改进版）
 *
 * 改进：
 * 1. 默认折叠高级选项（系统提示词、模型选择）
 * 2. 快速创建功能
 * 3. Skills 推荐标签
 * 4. 保持拖拽交互
 * 5. 导出功能
 */
import { useEffect, useState } from 'react'
import { Save, ArrowLeft, Sparkles, Plus, Trash2, GripVertical, Send, ChevronDown, ChevronUp, Download, Zap } from 'lucide-react'
import { getAgent, createAgent, updateAgent, listSkills, generateSystemPrompt, chatWithAgent, listProviders, createCustomSkill, listCustomSkills } from '@/api/client'
import { AgentTestChat } from './AgentTestChat'
import { SkillEditor } from './SkillEditor'
import type { Agent, AgentSkill, ChatMessage } from '@/types/agent'
import type { PluginInfo } from '@/types/workflow'

interface Provider {
  id: string
  name: string
  model: string
  is_default: boolean
}

interface Props {
  agentId?: string
  onBack: () => void
}

export function AgentEditorPage({ agentId, onBack }: Props) {
  const [agent, setAgent] = useState<Agent>({
    id: agentId || `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '新建 Agent',
    description: '',
    system_prompt: '',
    model_provider_id: null,
    skills: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  const [availableSkills, setAvailableSkills] = useState<PluginInfo[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [draggedSkillId, setDraggedSkillId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false) // 默认折叠高级选项
  const [showSkillEditor, setShowSkillEditor] = useState(false) // Skill 编辑器

  // 对话相关状态
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // 推荐的 Skills（标记为推荐）
  const recommendedSkillIds = ['analyst_soul'] // 可以根据需要添加更多

  // 加载数据
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [skills, providersList, customSkills] = await Promise.all([
          listSkills(),
          listProviders(),
          listCustomSkills(),
        ])

        // 合并内置 Skills 和自定义 Skills
        const allSkills = [
          ...skills,
          ...customSkills.map((cs: any) => ({
            meta: {
              id: cs.id,
              name: cs.name,
              description: cs.description,
              icon: cs.icon,
              category: 'skill',
              params: [],
              input_schema: cs.input_schema,
              output_schema: cs.output_schema,
            },
            enabled: false,
            config: {},
          })),
        ]

        setAvailableSkills(allSkills)
        setProviders(providersList)

        if (agentId) {
          const data = await getAgent(agentId)
          setAgent(data)
        }
      } catch (e) {
        console.error('加载失败:', e)
        alert(`加载失败: ${e}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [agentId])

  // 快速创建 Agent
  const handleQuickCreate = async () => {
    // 自动添加推荐的 Skill
    const recommendedSkill = availableSkills.find(s => s.meta.id === 'analyst_soul')
    if (!recommendedSkill) return

    const newAgent = {
      ...agent,
      name: '数据分析助手',
      description: '帮你进行数据计算和分析',
      skills: [{
        skill_id: recommendedSkill.meta.id,
        order: 0,
        config: {},
      }],
    }

    setAgent(newAgent)
    await autoGeneratePrompt(newAgent)
    alert('已快速创建数据分析助手！你可以继续添加更多 Skills 或直接保存。')
  }

  // 保存 Agent
  const handleSave = async () => {
    if (!agent.name.trim()) {
      alert('请输入 Agent 名称')
      return
    }

    try {
      if (agentId) {
        await updateAgent(agentId, agent)
      } else {
        await createAgent(agent)
      }
      alert('保存成功')
      onBack()
    } catch (e) {
      alert(`保存失败: ${e}`)
    }
  }

  // 导出 Agent
  const handleExport = () => {
    const exportData = {
      agent: {
        name: agent.name,
        description: agent.description,
        system_prompt: agent.system_prompt,
        skills: agent.skills.map(s => {
          const skill = availableSkills.find(sk => sk.meta.id === s.skill_id)
          return {
            id: s.skill_id,
            name: skill?.meta.name || '',
            description: skill?.meta.description || '',
            order: s.order,
          }
        }),
      },
      usage: {
        description: '这是一个 MiniFlow Agent 配置文件',
        how_to_use: [
          '1. 在 MiniFlow 中创建新 Agent',
          '2. 按照 skills 列表添加对应的 Skills',
          '3. 复制 system_prompt 到系统提示词',
          '4. 保存并开始使用',
        ],
      },
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agent.name.replace(/\s+/g, '_')}_agent.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 添加 Skill
  const handleAddSkill = (skillId: string) => {
    if (agent.skills.some(s => s.skill_id === skillId)) {
      return
    }

    const newSkill: AgentSkill = {
      skill_id: skillId,
      order: agent.skills.length,
      config: {},
    }

    const newAgent = {
      ...agent,
      skills: [...agent.skills, newSkill],
    }
    setAgent(newAgent)
    autoGeneratePrompt(newAgent)
  }

  // 删除 Skill
  const handleRemoveSkill = (skillId: string) => {
    const newAgent = {
      ...agent,
      skills: agent.skills.filter(s => s.skill_id !== skillId).map((s, i) => ({ ...s, order: i })),
    }
    setAgent(newAgent)

    if (newAgent.skills.length > 0) {
      autoGeneratePrompt(newAgent)
    }
  }

  // 自动生成系统提示词
  const autoGeneratePrompt = async (currentAgent: Agent) => {
    if (currentAgent.skills.length === 0) return

    setGenerating(true)
    try {
      const skillsInfo = currentAgent.skills.map(s => {
        const skill = availableSkills.find(sk => sk.meta.id === s.skill_id)
        return {
          skill_id: s.skill_id,
          name: skill?.meta.name || '',
          description: skill?.meta.description || '',
        }
      })

      const result = await generateSystemPrompt(currentAgent.name, skillsInfo)
      setAgent(prev => ({ ...prev, system_prompt: result.system_prompt }))
    } catch (e) {
      console.error('生成提示词失败:', e)
    } finally {
      setGenerating(false)
    }
  }

  // 拖拽处理
  const handleDragStart = (skillId: string) => {
    setDraggedSkillId(skillId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedSkillId) {
      handleAddSkill(draggedSkillId)
      setDraggedSkillId(null)
    }
  }

  // 保存自定义 Skill
  const handleSaveCustomSkill = async (skillData: any) => {
    try {
      await createCustomSkill(skillData)

      // 重新加载 Skills 列表
      const [skills, customSkills] = await Promise.all([
        listSkills(),
        listCustomSkills(),
      ])

      const allSkills = [
        ...skills,
        ...customSkills.map((cs: any) => ({
          meta: {
            id: cs.id,
            name: cs.name,
            description: cs.description,
            icon: cs.icon,
            category: 'skill',
            params: [],
            input_schema: cs.input_schema,
            output_schema: cs.output_schema,
          },
          enabled: false,
          config: {},
        })),
      ]

      setAvailableSkills(allSkills)
      alert('Skill 创建成功！')
    } catch (e) {
      throw e
    }
  }

  // 发送消息
  const handleSendMessage = async () => {
    if (!input.trim() || chatLoading) return

    if (!agentId) {
      alert('请先保存 Agent 后再进行对话')
      return
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setChatLoading(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const response = await chatWithAgent(agentId, userMessage.content, history)

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message.content,
        reasoning: response.reasoning,
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (e) {
      console.error('发送失败:', e)
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `抱歉，发送失败：${e}`,
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setChatLoading(false)
    }
  }

  // 获取 Skill 信息
  const getSkillInfo = (skillId: string) => {
    return availableSkills.find(s => s.meta.id === skillId)
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
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
            <ArrowLeft size={20} />
          </button>
          <Sparkles size={20} className="text-purple-500" />
          <input
            type="text"
            value={agent.name}
            onChange={(e) => setAgent({ ...agent, name: e.target.value })}
            className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-0"
            placeholder="Agent 名称"
          />
          <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">Beta</span>
        </div>
        <div className="flex items-center gap-2">
          {!agentId && (
            <button
              onClick={handleQuickCreate}
              className="flex items-center gap-2 px-3 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition text-sm"
              title="快速创建一个预配置的 Agent"
            >
              <Zap size={14} />
              快速创建
            </button>
          )}
          {agentId && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
            >
              <Download size={14} />
              导出
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
          >
            <Save size={16} />
            保存
          </button>
        </div>
      </div>

      {/* 主内容区 - 左中右三栏 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左栏：Agent 配置 + 已激活 Skills */}
        <div className="w-80 border-r bg-white overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Agent 基本信息 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                描述
              </label>
              <textarea
                value={agent.description}
                onChange={(e) => setAgent({ ...agent, description: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                rows={2}
                placeholder="简单描述这个 Agent 的用途..."
              />
            </div>

            {/* 高级选项（可折叠） */}
            <div className="border rounded-lg">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                <span>高级设置</span>
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showAdvanced && (
                <div className="p-3 space-y-3 border-t">
                  {/* 模型选择 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      模型
                    </label>
                    <select
                      value={agent.model_provider_id || ''}
                      onChange={(e) => setAgent({ ...agent, model_provider_id: e.target.value || null })}
                      className="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">使用默认模型</option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name} ({provider.model})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 系统提示词 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-700">
                        系统提示词
                      </label>
                      {generating && (
                        <span className="text-xs text-purple-500 flex items-center gap-1">
                          <Sparkles size={10} className="animate-pulse" />
                          生成中...
                        </span>
                      )}
                    </div>
                    <textarea
                      value={agent.system_prompt}
                      onChange={(e) => setAgent({ ...agent, system_prompt: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                      rows={6}
                      placeholder="添加 Skills 后自动生成..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 已激活的 Skills */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                已激活的 Skills
                <span className="text-xs text-gray-400 ml-1">(可排序)</span>
              </label>
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="min-h-[150px] border-2 border-dashed border-gray-200 rounded p-2 space-y-1.5"
              >
                {agent.skills.length === 0 ? (
                  <div className="text-center text-gray-400 text-xs py-6">
                    拖拽右侧 Skill 到这里
                  </div>
                ) : (
                  agent.skills.map((skill, index) => {
                    const skillInfo = getSkillInfo(skill.skill_id)
                    return (
                      <div
                        key={skill.skill_id}
                        className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded p-2 group text-xs"
                      >
                        <GripVertical size={12} className="text-gray-400 cursor-move" />
                        <span className="font-medium">{index + 1}</span>
                        <span className="text-lg">{skillInfo?.meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 truncate">{skillInfo?.meta.name}</div>
                        </div>
                        <button
                          onClick={() => handleRemoveSkill(skill.skill_id)}
                          className="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 中栏：对话界面 */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <Sparkles size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">开始与 Agent 对话</p>
                  <p className="text-xs mt-1">测试你配置的 Skills 和系统提示词</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] ${
                        msg.role === 'user'
                          ? 'bg-purple-500 text-white rounded-lg px-4 py-3'
                          : ''
                      }`}
                    >
                      {msg.role === 'assistant' && msg.reasoning && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-2">
                          <div className="flex items-center gap-2 text-xs text-blue-600 font-medium mb-2">
                            <Sparkles size={12} />
                            思考过程
                          </div>
                          <div className="text-xs text-blue-800 whitespace-pre-wrap">{msg.reasoning}</div>
                        </div>
                      )}
                      <div className={msg.role === 'assistant' ? 'bg-gray-100 text-gray-800 rounded-lg px-4 py-3' : ''}>
                        <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 px-4 py-3 rounded-lg">
                      <span className="text-sm text-gray-500 animate-pulse">思考中...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t p-4 bg-gray-50">
            <div className="max-w-3xl mx-auto flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="输入消息..."
                className="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={chatLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || chatLoading}
                className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50 disabled:Claude Code-not-allowed flex items-center gap-2"
              >
                <Send size={18} />
                发送
              </button>
            </div>
          </div>
        </div>

        {/* 右栏：可用 Skills */}
        <div className="w-80 bg-slate-50 border-l overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">可用 Skills</h3>
              <button
                onClick={() => setShowSkillEditor(true)}
                className="text-xs text-purple-500 hover:text-purple-600 flex items-center gap-1"
              >
                <Plus size={12} />
                新建
              </button>
            </div>

            <div className="space-y-2">
              {availableSkills.map((skill) => {
                const isActive = agent.skills.some(s => s.skill_id === skill.meta.id)
                const isRecommended = recommendedSkillIds.includes(skill.meta.id)
                return (
                  <div
                    key={skill.meta.id}
                    draggable
                    onDragStart={() => handleDragStart(skill.meta.id)}
                    onClick={() => !isActive && handleAddSkill(skill.meta.id)}
                    className={`
                      p-3 rounded-lg border transition cursor-pointer text-sm relative
                      ${isActive
                        ? 'bg-purple-50 border-purple-300 opacity-50 cursor-not-allowed'
                        : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-sm'
                      }
                    `}
                  >
                    {isRecommended && !isActive && (
                      <div className="absolute top-2 right-2">
                        <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded font-medium">
                          推荐
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-2xl">{skill.meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 flex items-center gap-1.5">
                          <span className="truncate">{skill.meta.name}</span>
                          {isActive && (
                            <span className="text-xs bg-purple-500 text-white px-1.5 py-0.5 rounded shrink-0">
                              已激活
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {skill.meta.description}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 测试对话框 */}
      {agentId && <AgentTestChat agentId={agentId} agentName={agent.name} />}

      {/* Skill 编辑器 */}
      {showSkillEditor && (
        <SkillEditor
          onClose={() => setShowSkillEditor(false)}
          onSave={handleSaveCustomSkill}
        />
      )}
    </div>
  )
}
