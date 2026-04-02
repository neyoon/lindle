/**
 * Skill 编辑器 - 创建/编辑自定义 Skill
 *
 * 风格与 Flow 编辑器保持一致
 */
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
      icon: '🔧',
      code: `# 处理输入数据并返回结果
# input_data: 输入的字符串
# config: 配置参数（字典）

import json

# 解析输入
data = json.loads(input_data)

# 你的处理逻辑
# ...

# 设置返回结果
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Code size={20} className="text-purple-500" />
            <h2 className="text-lg font-semibold">
              {initialSkill ? '编辑 Skill' : '创建自定义 Skill'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                名称 *
              </label>
              <input
                type="text"
                value={skill.name}
                onChange={(e) => setSkill({ ...skill, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="例如：文本处理"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                图标
              </label>
              <input
                type="text"
                value={skill.icon}
                onChange={(e) => setSkill({ ...skill, icon: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="🔧"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              描述
            </label>
            <textarea
              value={skill.description}
              onChange={(e) => setSkill({ ...skill, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows={2}
              placeholder="简单描述这个 Skill 的功能..."
            />
          </div>

          {/* Python 代码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Python 代码 *
            </label>
            <div className="text-xs text-gray-500 mb-2">
              提示：使用 <code className="bg-gray-100 px-1 rounded">input_data</code> 获取输入，
              设置 <code className="bg-gray-100 px-1 rounded">result</code> 变量作为输出
            </div>
            <textarea
              value={skill.code}
              onChange={(e) => setSkill({ ...skill, code: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
              rows={15}
              placeholder="输入 Python 代码..."
            />
          </div>

          {/* 提示信息 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">安全提示</p>
                <p>自定义 Skill 会执行你提供的 Python 代码。请确保代码安全可靠，避免执行危险操作。</p>
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
