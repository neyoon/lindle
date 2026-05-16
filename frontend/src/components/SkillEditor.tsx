import { useState } from 'react'
import { X, Save, Code, Sparkles } from 'lucide-react'

interface Props {
  onClose: () => void
  onSave: (skill: CustomSkill) => void
  initialSkill?: CustomSkill
}

interface CustomSkill {
  id: string
  name: string
  description: string
  icon: string
  code: string
  input_schema: Record<string, any>
  output_schema: Record<string, any>
}

export function SkillEditor({ onClose, onSave, initialSkill }: Props) {
  const [skill, setSkill] = useState<CustomSkill>(
    initialSkill || {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: '',
      description: '',
      icon: '',
          code: `# 处理输入数据并返回结果
# input_data: 输入的字符串
# config: 配置参数（字典）

import json

data = json.loads(input_data)

result = {
    "output": "处理结果",
    "success": True
}`,
      input_schema: {},
      output_schema: {},
    }
  )

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!skill.name.trim()) {
      alert('请输入 Skill 名称')
      return
    }

    if (!skill.code.trim()) {
      alert('请输入 Python 代码')
      return
    }

    setSaving(true)
    try {
      await onSave(skill)
      onClose()
    } catch (e) {
      alert(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-[rgba(30,20,15,0.5)] flex items-center justify-center z-50 p-4">
      <div className="app-card w-full max-w-4xl max-h-[90vh] flex flex-col" style={{ animation: 'panel-slide-in 0.4s var(--ease-ink)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--app-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-[1.5px] border-[var(--rust)] inline-flex items-center justify-center text-[var(--rust)]">
              <Code size={18} />
            </div>
            <div>
              <div className="app-kicker no-rule text-[0.6rem] mb-0.5">Custom skill</div>
              <h2 className="text-lg font-medium text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>
                {initialSkill ? '编辑 Skill' : '创建自定义 Skill'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--app-text-soft)] mb-1">
                名称 *
              </label>
              <input
                type="text"
                value={skill.name}
                onChange={(e) => setSkill({ ...skill, name: e.target.value })}
                className="app-input"
                placeholder="例如：文本处理"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--app-text-soft)] mb-1">
                图标
              </label>
              <input
                type="text"
                value={skill.icon}
                onChange={(e) => setSkill({ ...skill, icon: e.target.value })}
                className="app-input"
                placeholder="图标"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--app-text-soft)] mb-1">
              描述
            </label>
            <textarea
              value={skill.description}
              onChange={(e) => setSkill({ ...skill, description: e.target.value })}
              className="app-input resize-y"
              rows={2}
              placeholder="简单描述这个 Skill 的功能..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--app-text-soft)] mb-1">
              Python 代码 *
            </label>
            <div className="text-xs text-[var(--app-text-muted)] mb-2">
              输入 <code className="bg-[var(--paper-warm)] border border-[var(--line)] px-1 rounded-sm font-mono">input_data</code>
              ，输出 <code className="bg-[var(--paper-warm)] border border-[var(--line)] px-1 rounded-sm font-mono">result</code>
            </div>
            <textarea
              value={skill.code}
              onChange={(e) => setSkill({ ...skill, code: e.target.value })}
              className="app-input font-mono text-sm resize-y"
              rows={15}
              placeholder="输入 Python 代码..."
            />
          </div>

          <div className="bg-[var(--rust-soft)] border border-[var(--line)] rounded-sm p-4">
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="text-[var(--app-warning)] mt-0.5 shrink-0" />
              <div className="text-sm text-[var(--app-text)]">
                <p className="font-medium mb-1">安全提示</p>
                <p className="text-[var(--app-text-soft)]">自定义 Skill 会执行你提供的 Python 代码。请确保代码安全可靠，避免执行危险操作。</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--app-border)] bg-[var(--paper-warm)]">
          <button
            onClick={onClose}
            className="app-button app-button-ghost"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="app-button app-button-primary disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
