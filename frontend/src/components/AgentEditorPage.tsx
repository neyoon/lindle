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
import { useEffect, useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { Save, ArrowLeft, Sparkles, Plus, Trash2, GripVertical, Send, ChevronDown, ChevronUp, Download, Zap, Wrench, CheckCircle } from 'lucide-react'
import { getAgent, createAgent, updateAgent, listSkills, generateSystemPrompt, chatWithAgent, chatWithAgentStream, listProviders, createCustomSkill, listCustomSkills, listWorkflows } from '@/api/client'
import { AgentTestChat } from './AgentTestChat'
import { SkillEditor } from './SkillEditor'
import type { Agent, AgentSkill, ChatMessage } from '@/types/agent'
import type { PluginInfo, WorkflowSummary } from '@/types/workflow'
import { ThemeToggle } from './ui/ThemeToggle'

interface Provider {
  id: string
  name: string
  model: string
  is_default: boolean
}

interface Props {
  agentId?: string
  onBack: () => void
  onManualSave?: () => void
  headerActions?: ReactNode
}

type StreamPhase = 'idle' | 'thinking' | 'tool-running' | 'responding'

function renderChatMessage(msg: ChatMessage, key: number) {
  if (msg.role === 'user') {
    return (
      <div key={key} className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl bg-[var(--app-accent-strong)] px-4 py-3 text-white">
          <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
        </div>
      </div>
    )
  }

  if (msg.role === 'assistant') {
    return (
      <div key={key} className="flex justify-start">
        <div className="max-w-[70%] rounded-2xl bg-[rgba(255,255,255,0.05)] px-4 py-3 text-[var(--app-text)]">
          <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
        </div>
      </div>
    )
  }

  if (msg.role === 'tool_call') {
    return (
      <div key={key} className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl border border-[rgba(255,180,77,0.22)] bg-[rgba(255,180,77,0.08)] p-4 text-sm text-[var(--app-text)]">
          <div className="mb-2 flex items-center gap-2 text-[var(--app-warning)]">
            <Wrench size={14} />
            工具调用
          </div>
          <div className="space-y-2 text-xs text-[var(--app-text-soft)]">
            {msg.tool_calls?.map((tc, i) => (
              <div key={i} className="rounded-xl bg-[rgba(255,255,255,0.05)] px-3 py-2">
                <div className="font-medium text-[var(--app-text)]">{tc.name}</div>
                <div className="mt-1 break-all font-mono">{tc.arguments}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (msg.role === 'tool_result') {
    return <ToolResultBubble key={key} message={msg} />
  }

  return null
}

function ToolResultBubble({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false)
  const content = message.content || ''

  let jsonContent: any = null
  try {
    jsonContent = JSON.parse(content)
  } catch {}

  const isFlowResult = jsonContent && typeof jsonContent === 'object' && 'success' in jsonContent && 'output' in jsonContent

  let displayData: any = null
  let metaLine = ''

  if (isFlowResult) {
    const output = jsonContent.output
    displayData = output && typeof output === 'object' && 'result' in output ? output.result : output
    const status = jsonContent.success ? '成功' : '失败'
    const elapsed = jsonContent.elapsed != null ? `${Number(jsonContent.elapsed).toFixed(1)}s` : ''
    metaLine = `${status}${elapsed ? ` · ${elapsed}` : ''}${jsonContent.error ? ` · ${jsonContent.error}` : ''}`
  } else if (jsonContent) {
    displayData = jsonContent
  }

  const displayStr = displayData != null
    ? (typeof displayData === 'string' ? displayData : JSON.stringify(displayData, null, 2))
    : content
  const lineCount = displayStr.split('\n').length
  const isLong = lineCount > 3 || displayStr.length > 220
  const bodyClass = expanded || !isLong ? '' : 'line-clamp-3'

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl border border-[rgba(62,207,142,0.22)] bg-[rgba(62,207,142,0.08)] p-4 text-sm text-[var(--app-text)]">
        <div className="mb-1 flex items-center gap-2 text-[var(--app-success)]">
          <CheckCircle size={14} />
          工具结果: {message.tool_name}
        </div>
        {metaLine && (
          <div className="mb-2 text-xs text-[var(--app-text-soft)]">{metaLine}</div>
        )}
        <div
          className={`whitespace-pre-wrap rounded-xl bg-[rgba(255,255,255,0.05)] px-3 py-3 ${typeof displayData === 'string' ? 'text-sm leading-7' : 'font-mono text-xs leading-6 text-[var(--app-text-soft)]'} ${bodyClass}`}
        >
          {displayStr}
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-[var(--app-success)] transition hover:opacity-80"
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>
    </div>
  )
}

export function AgentEditorPage({ agentId, onBack, onManualSave, headerActions }: Props) {
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
  const [availableFlows, setAvailableFlows] = useState<WorkflowSummary[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [draggedSkillId, setDraggedSkillId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showSkillEditor, setShowSkillEditor] = useState(false)
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null) // 展开的 Skill ID
  const [skillsDirty, setSkillsDirty] = useState(false) // Skills 是否有变化，需要在发送时刷新 prompt

  // 对话相关状态
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle')
  const [liveReasoning, setLiveReasoning] = useState('')
  const [liveStatus, setLiveStatus] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveReasoning, liveStatus, chatLoading])

  // 推荐的 Skills（标记为推荐）
  const recommendedSkillIds = ['workflow_executor', 'workflow_designer']

  // 加载数据
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [skills, providersList, customSkills, workflows] = await Promise.all([
          listSkills().catch(() => []),
          listProviders().catch(() => []),
          listCustomSkills().catch(() => []),
          listWorkflows().catch(() => []),
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
        setAvailableFlows(workflows)

        if (agentId) {
          const data = await getAgent(agentId)
          setAgent(data)
        }
      } catch (e) {
        console.error('加载失败:', e)
        // 不要 alert，只在控制台记录错误
        // 继续加载，即使部分数据失败
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [agentId])

  // 快速创建 Agent
  const handleQuickCreate = async () => {
    // 自动添加推荐的 Skills
    const skills: { skill_id: string; order: number; config: Record<string, string> }[] = []

    const executor = availableSkills.find(s => s.meta.id === 'workflow_executor')
    if (executor) {
      skills.push({ skill_id: executor.meta.id, order: 0, config: {} })
    }

    const designer = availableSkills.find(s => s.meta.id === 'workflow_designer')
    if (designer) {
      skills.push({ skill_id: designer.meta.id, order: 1, config: {} })
    }

    if (skills.length === 0) return

    const newAgent = {
      ...agent,
      name: '智能助手',
      description: '可以执行和创建工作流的智能助手',
      skills,
    }

    setAgent(newAgent)
    await autoGeneratePrompt(newAgent)
    setSkillsDirty(false)
    alert('已快速创建智能助手！你可以在 Flow 执行器中绑定已有的 Flow，或直接保存。')
  }

  // 保存 Agent
  const handleSave = async () => {
    if (!agent.name.trim()) {
      alert('请输入 Agent 名称')
      return
    }

    try {
      // agentId 始终存在（自动保存时已创建）
      await updateAgent(agentId!, agent)
      onManualSave?.() // 标记为手动保存
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
        description: '这是一个 Tweak Agent 配置文件',
        how_to_use: [
          '1. 在 Tweak 中创建新 Agent',
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
    setSkillsDirty(true) // 标记 skills 有变化
  }

  // 删除 Skill
  const handleRemoveSkill = (skillId: string) => {
    const newAgent = {
      ...agent,
      skills: agent.skills.filter(s => s.skill_id !== skillId).map((s, i) => ({ ...s, order: i })),
    }
    setAgent(newAgent)
    setSkillsDirty(true) // 标记 skills 有变化
  }

  // 添加/移除 Flow 到 workflow_executor Skill 的 config
  const handleToggleFlow = async (skillId: string, flowId: string) => {
    const skill = agent.skills.find(s => s.skill_id === skillId)
    if (!skill) return

    const currentFlows = skill.config.flows ? skill.config.flows.split(',').filter(Boolean) : []
    const newFlows = currentFlows.includes(flowId)
      ? currentFlows.filter(id => id !== flowId)
      : [...currentFlows, flowId]

    const updatedAgent = {
      ...agent,
      skills: agent.skills.map(s =>
        s.skill_id === skillId
          ? { ...s, config: { ...s.config, flows: newFlows.join(',') } }
          : s
      ),
    }

    setAgent(updatedAgent)

    // 自动保存到后端
    if (agentId) {
      try {
        await updateAgent(agentId, updatedAgent)
      } catch (e) {
        console.error('保存失败:', e)
      }
    }

    // 标记 skills 有变化，发送消息时再刷新 prompt
    setSkillsDirty(true)
  }

  // 判断 Skill 是否需要绑定 Flows
  const isFlowSkill = (skillId: string) => {
    return skillId === 'workflow_executor'
  }

  // 获取 Skill 绑定的 Flow IDs
  const getSkillFlows = (skillId: string): string[] => {
    const skill = agent.skills.find(s => s.skill_id === skillId)
    if (!skill || !skill.config.flows) return []
    return skill.config.flows.split(',').filter(Boolean)
  }

  // 自动生成系统提示词，生成完后自动同步到后端
  const autoGeneratePrompt = async (currentAgent: Agent) => {
    // 如果没有 skills，清空 prompt
    if (currentAgent.skills.length === 0) {
      const updated = { ...currentAgent, system_prompt: '' }
      setAgent(updated)
      if (agentId) {
        await updateAgent(agentId, updated)
      }
      return
    }

    setGenerating(true)
    try {
      const skillsInfo = currentAgent.skills.map(s => {
        const skill = availableSkills.find(sk => sk.meta.id === s.skill_id)
        let description = skill?.meta.description || ''

        // 如果是 workflow_executor，附上绑定的 Flow 名称
        if (s.skill_id === 'workflow_executor' && s.config.flows) {
          const flowNames = s.config.flows.split(',').filter(Boolean).map(fid => {
            const flow = availableFlows.find(f => f.id === fid)
            return flow ? flow.name : fid
          })
          if (flowNames.length > 0) {
            description += `（已绑定: ${flowNames.join('、')}）`
          }
        }

        return {
          skill_id: s.skill_id,
          name: skill?.meta.name || '',
          description,
        }
      })

      const result = await generateSystemPrompt(currentAgent.name, skillsInfo)
      const updated = { ...currentAgent, system_prompt: result.system_prompt }
      setAgent(updated)

      // 自动同步到后端，保证对话时使用最新的 prompt
      if (agentId) {
        await updateAgent(agentId, updated)
      }
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
    console.log('handleSendMessage 被调用')
    if (!input.trim() || chatLoading) return

    if (!agentId) {
      alert('请先保存 Agent 后再进行对话')
      return
    }

    console.log('准备发送消息, agentId:', agentId)

    // 如果 skills 有变化，先刷新 prompt 再发送
    if (skillsDirty) {
      await autoGeneratePrompt(agent)
      setSkillsDirty(false)
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setChatLoading(true)
    setStreamPhase('thinking')
    setLiveReasoning('')
    setLiveStatus('正在思考...')

    try {
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
        tool_name: m.tool_name,
      }))

      // 使用流式 API
      console.log('开始流式调用:', agentId)
      let currentReasoningByRound = ''
      let currentContent = ''
      let isStreamingAssistant = false
      const allMessages: ChatMessage[] = []

      for await (const event of chatWithAgentStream(agentId, userMessage.content, history)) {
        console.log('收到事件:', event)
        if (event.type === 'round_start') {
          currentReasoningByRound = ''
          currentContent = ''
          isStreamingAssistant = false
          setStreamPhase('thinking')
          setLiveReasoning('')
          setLiveStatus('正在思考...')
        } else if (event.type === 'reasoning_delta') {
          console.log('Reasoning:', event.data)
          currentReasoningByRound += event.data.delta
          setStreamPhase('thinking')
          setLiveReasoning(currentReasoningByRound)
          setLiveStatus('正在思考...')
        } else if (event.type === 'assistant_delta') {
          console.log('Content chunk:', event.data)
          currentContent += event.data.delta
          setStreamPhase('responding')
          setLiveStatus('正在生成回复...')

          if (!isStreamingAssistant) {
            isStreamingAssistant = true
            const tempMsg: ChatMessage = {
              role: 'assistant',
              content: currentContent,
            }
            setMessages(prev => [...prev, tempMsg])
            allMessages.push(tempMsg)
          } else {
            setMessages(prev => {
              const newMessages = [...prev]
              if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: currentContent,
                }
              }
              return newMessages
            })
            if (allMessages.length > 0 && allMessages[allMessages.length - 1].role === 'assistant') {
              allMessages[allMessages.length - 1].content = currentContent
            }
          }
        } else if (event.type === 'tool_call') {
          console.log('Tool call:', event.data)
          const msg: ChatMessage = {
            role: 'tool_call',
            content: event.data.content,
            tool_calls: event.data.tool_calls,
          }

          setMessages(prev => [...prev, msg])
          allMessages.push(msg)
          currentReasoningByRound = ''
          currentContent = ''
          isStreamingAssistant = false
          setStreamPhase('tool-running')
          setLiveReasoning('')
          setLiveStatus('正在准备工具调用...')
        } else if (event.type === 'tool_status') {
          console.log('Tool status:', event.data)
          setStreamPhase('tool-running')
          setLiveStatus(event.data.message || '正在执行工具...')
        } else if (event.type === 'tool_result') {
          console.log('Tool result:', event.data)
          const msg: ChatMessage = {
            role: 'tool_result',
            content: event.data.content,
            tool_call_id: event.data.tool_call_id,
            tool_name: event.data.tool_name,
          }
          setMessages(prev => [...prev, msg])
          allMessages.push(msg)
          setStreamPhase('thinking')
          setLiveStatus('工具执行完成，继续思考...')
        } else if (event.type === 'assistant_message') {
          console.log('Assistant message:', event.data)
          if (isStreamingAssistant) {
            isStreamingAssistant = false
            currentContent = ''
          } else {
            const msg: ChatMessage = {
              role: 'assistant',
              content: event.data.content,
            }
            setMessages(prev => [...prev, msg])
            allMessages.push(msg)
          }
          setLiveReasoning('')
          setLiveStatus('')
          setStreamPhase('idle')
        } else if (event.type === 'error') {
          console.error('Error event:', event.data)
          const errorMsg: ChatMessage = {
            role: 'assistant',
            content: `错误：${event.data?.message || '未知错误'}`,
          }
          setMessages(prev => [...prev, errorMsg])
          allMessages.push(errorMsg)
          break
        } else if (event.type === 'done') {
          console.log('Done')
          setStreamPhase('idle')
          setLiveReasoning('')
          setLiveStatus('')
          break
        }
      }
      console.log('流式调用结束')

      // 如果 workflow_designer 创建了新 Flow，刷新 Flow 列表
      const hasNewFlow = allMessages.some(
        m => m.role === 'tool_result' && m.tool_name === 'workflow_designer'
          && m.content && m.content.includes('"success": true')
      )
      if (hasNewFlow) {
        console.log('检测到新 Flow，刷新列表')
        listWorkflows().then(setAvailableFlows).catch(() => {})
      }
    } catch (e) {
      console.error('发送失败:', e)
      setStreamPhase('idle')
      setLiveReasoning('')
      setLiveStatus('')
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

  // 获取 Flow 信息
  const getFlowInfo = (flowId: string) => {
    return availableFlows.find(f => f.id === flowId)
  }

  if (loading) {
    return (
      <div className="app-shell flex h-screen items-center justify-center">
        <div className="text-[var(--app-text-soft)]">加载中...</div>
      </div>
    )
  }

  return (
    <div className="editor-shell">
      {/* 顶栏 */}
      <div className="editor-toolbar px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="app-button app-button-ghost"
          >
            <ArrowLeft size={20} />
          </button>
          <Sparkles size={20} className="text-[var(--app-accent)]" />
          <input
            type="text"
            value={agent.name}
            onChange={(e) => setAgent({ ...agent, name: e.target.value })}
            className="border-none bg-transparent text-lg font-semibold text-[var(--app-text)] outline-none"
            placeholder="Agent 名称"
          />
          <span className="app-pill border-0 bg-[rgba(244,107,122,0.12)] text-[var(--app-danger)]">Beta</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ThemeToggle />
          {!agentId && (
            <button
              onClick={handleQuickCreate}
              className="app-button border border-[rgba(255,180,77,0.22)] bg-[rgba(255,180,77,0.1)] text-[var(--app-warning)]"
              title="快速创建一个预配置的 Agent"
            >
              <Zap size={14} />
              快速创建
            </button>
          )}
          {agentId && (
            <button
              onClick={handleExport}
              className="app-button app-button-ghost"
            >
              <Download size={14} />
              导出
            </button>
          )}
          <button
            onClick={handleSave}
            className="app-button app-button-primary"
          >
            <Save size={16} />
            保存
          </button>
          {headerActions}
        </div>
      </div>
      </div>

      {/* 主内容区 - 左中右三栏 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左栏：Agent 配置 + 已激活 Skills */}
        <div className="editor-panel w-80 overflow-y-auto border-r">
          <div className="p-4 space-y-4">
            {/* Agent 基本信息 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-soft)]">
                描述
              </label>
              <textarea
                value={agent.description}
                onChange={(e) => setAgent({ ...agent, description: e.target.value })}
                className="app-input min-h-[84px] resize-y px-2 py-1.5 text-sm"
                rows={2}
                placeholder="简单描述这个 Agent 的用途..."
              />
            </div>

            {/* 高级选项（可折叠） */}
            <div className="rounded-2xl border border-[var(--app-border)]">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-[var(--app-text)] transition hover:bg-[rgba(255,255,255,0.04)]"
              >
                <span>高级设置</span>
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showAdvanced && (
                <div className="space-y-3 border-t border-[var(--app-border)] p-3">
                  {/* 模型选择 */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--app-text-soft)]">
                      模型
                    </label>
                    <select
                      value={agent.model_provider_id || ''}
                      onChange={(e) => setAgent({ ...agent, model_provider_id: e.target.value || null })}
                      className="app-input px-2 py-1.5 text-xs"
                    >
                      <option value="">使用默认模型</option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name} ({provider.model})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--app-text-soft)]">
                      <Zap size={12} className="text-[var(--app-warning)]" />
                      建议使用支持 function calling 的模型（如 GPT-4、Claude 3.5 等）以获得更好的 Skill 调用效果
                    </p>
                  </div>

                  {/* 系统提示词 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-[var(--app-text-soft)]">
                        系统提示词
                      </label>
                      {generating && (
                        <span className="flex items-center gap-1 text-xs text-[var(--app-accent)]">
                          <Sparkles size={10} className="animate-pulse" />
                          生成中...
                        </span>
                      )}
                    </div>
                    <textarea
                      value={agent.system_prompt}
                      onChange={(e) => setAgent({ ...agent, system_prompt: e.target.value })}
                      className="app-input font-mono text-xs"
                      rows={6}
                      placeholder="添加 Skills 后自动生成..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 已激活的 Skills */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--app-text-soft)]">
                已激活的 Skills
                <span className="ml-1 text-xs text-[var(--app-text-muted)]">(可排序)</span>
              </label>
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="min-h-[150px] space-y-1.5 rounded-2xl border-2 border-dashed border-[var(--app-border-strong)] p-2"
              >
                {agent.skills.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--app-text-muted)]">
                    拖拽右侧 Skill 到这里
                  </div>
                ) : (
                  agent.skills.map((skill, index) => {
                    const skillInfo = getSkillInfo(skill.skill_id)
                    const isFlowSkillType = isFlowSkill(skill.skill_id)
                    const isExpanded = expandedSkillId === skill.skill_id
                    const skillFlows = getSkillFlows(skill.skill_id)

                    return (
                      <div key={skill.skill_id} className="space-y-1">
                        <div className="group flex items-center gap-2 rounded-2xl border border-[var(--app-border)] bg-[rgba(109,204,255,0.08)] p-2 text-xs">
                          <GripVertical size={12} className="cursor-move text-[var(--app-text-muted)]" />
                          <span className="font-medium">{index + 1}</span>
                          <span className="text-lg">{skillInfo?.meta.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium text-[var(--app-text)]">{skillInfo?.meta.name}</div>
                          </div>
                          {isFlowSkillType && (
                            <button
                              onClick={() => setExpandedSkillId(isExpanded ? null : skill.skill_id)}
                              className="text-[var(--app-text-soft)] transition hover:text-[var(--app-accent)]"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveSkill(skill.skill_id)}
                            className="text-[var(--app-text-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--app-danger)]"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {/* Flow 选择器（展开时显示） */}
                        {isFlowSkillType && isExpanded && (
                          <div className="ml-6 space-y-1 border-l-2 border-[var(--app-border-strong)] pl-4">
                            <div className="mb-2 text-xs text-[var(--app-text-soft)]">选择可用的 Flows:</div>
                            {availableFlows.map(flow => (
                              <label
                                key={flow.id}
                                className="Claude Code-pointer flex items-center gap-2 rounded p-2 text-xs hover:bg-[rgba(255,255,255,0.04)]"
                              >
                                <input
                                  type="checkbox"
                                  checked={skillFlows.includes(flow.id)}
                                  onChange={() => handleToggleFlow(skill.skill_id, flow.id)}
                                  className="rounded border-[var(--app-border-strong)] text-[var(--app-accent-strong)] focus:ring-[var(--app-accent)]"
                                />
                                <span className="flex-1 truncate">{flow.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 中栏：对话界面 */}
        <div className="editor-panel flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-[var(--app-text-soft)]">
                  <Sparkles size={48} className="mx-auto mb-3 text-[var(--app-text-muted)]" />
                  <p className="text-sm">开始与 Agent 对话</p>
                  <p className="text-xs mt-1">测试你配置的 Skills 和系统提示词</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg, i) => renderChatMessage(msg, i))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl bg-[rgba(255,255,255,0.05)] px-4 py-3">
                      <div className="mb-2 animate-pulse text-sm text-[var(--app-text-soft)]">
                        {liveStatus || (streamPhase === 'responding' ? '正在生成回复...' : '处理中...')}
                      </div>
                      {liveReasoning && (
                        <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap border-t border-[var(--app-border)] pt-2 text-xs text-[var(--app-text-soft)]">
                          {liveReasoning}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="border-t border-[var(--app-border)] bg-[rgba(255,255,255,0.04)] p-4">
            {generating && (
              <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 text-xs text-[var(--app-accent)]">
                <Sparkles size={12} className="animate-pulse" />
                正在为 Agent 加载 Skill，请稍候...
              </div>
            )}
            <div className="max-w-3xl mx-auto flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !generating && handleSendMessage()}
                placeholder={generating ? 'Skill 加载中...' : '输入消息...'}
                className="app-input flex-1 px-4 py-3"
                disabled={chatLoading || generating}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || chatLoading || generating}
                className="app-button app-button-primary px-6 py-3 disabled:opacity-50 disabled:Claude Code-not-allowed"
              >
                <Send size={18} />
                发送
              </button>
            </div>
          </div>
        </div>

        {/* 右栏：可用 Skills */}
        <div className="editor-panel w-80 overflow-y-auto border-l">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[var(--app-text)]">可用 Skills</h3>
              <button
                onClick={() => setShowSkillEditor(true)}
                className="flex items-center gap-1 text-xs text-[var(--app-accent)]"
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
                      relative cursor-pointer rounded-2xl border p-3 text-sm transition
                      ${isActive
                        ? 'cursor-not-allowed border-[var(--app-border-strong)] bg-[rgba(109,204,255,0.08)] opacity-50'
                        : 'border-[var(--app-border)] bg-[rgba(255,255,255,0.04)] hover:border-[var(--app-border-strong)] hover:shadow-sm'
                      }
                    `}
                  >
                    {isRecommended && !isActive && (
                      <div className="absolute top-2 right-2">
                        <span className="rounded-full bg-[rgba(255,180,77,0.16)] px-1.5 py-0.5 text-xs font-medium text-[var(--app-warning)]">
                          推荐
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-2xl">{skill.meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-[var(--app-text)]">
                          <span className="truncate">{skill.meta.name}</span>
                          {isActive && (
                            <span className="shrink-0 rounded-full bg-[var(--app-accent-strong)] px-1.5 py-0.5 text-xs text-white">
                              已激活
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs text-[var(--app-text-soft)]">
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
