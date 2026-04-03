/**
 * 首页 - 选择进入 Flow 还是 Agent
 */
import { Workflow, Sparkles, ArrowRight, Settings } from 'lucide-react'

interface Props {
  onSelectFlow: () => void
  onSelectAgent: () => void
  onOpenSettings?: () => void
}

export function HomePage({ onSelectFlow, onSelectAgent, onOpenSettings }: Props) {
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-sky-50 to-blue-50">
      {/* 顶栏 */}
      <div className="h-16 bg-white/80 backdrop-blur-sm border-b px-8 flex items-center justify-between shadow-sm">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
          Tweak
        </h1>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
          >
            <Settings size={16} />
            设置
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Flow 卡片 */}
          <button
            onClick={onSelectFlow}
            className="group relative bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border-2 border-transparent hover:border-sky-300 text-left"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
                <Workflow size={32} className="text-white" />
              </div>
              <ArrowRight
                size={24}
                className="text-gray-300 group-hover:text-sky-500 group-hover:translate-x-1 transition-all"
              />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-3">工作流 (Flow)</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              可视化编排 AI 工作流，通过拖拽式界面构建数据处理流水线。
              适合固定流程的自动化任务。
            </p>

            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-sky-50 text-sky-600 text-sm rounded-full">
                可视化编排
              </span>
              <span className="px-3 py-1 bg-sky-50 text-sky-600 text-sm rounded-full">
                流程自动化
              </span>
              <span className="px-3 py-1 bg-sky-50 text-sky-600 text-sm rounded-full">
                插件扩展
              </span>
            </div>
          </button>

          {/* Agent 卡片 */}
          <button
            onClick={onSelectAgent}
            className="group relative bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border-2 border-transparent hover:border-purple-300 text-left"
          >
            {/* Beta 标签 */}
            <div className="absolute top-4 right-4">
              <span className="px-2 py-1 bg-red-500 text-white text-xs font-semibold rounded">
                Beta
              </span>
            </div>

            <div className="flex items-start justify-between mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Sparkles size={32} className="text-white" />
              </div>
              <ArrowRight
                size={24}
                className="text-gray-300 group-hover:text-purple-500 group-hover:translate-x-1 transition-all"
              />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-3">智能助手 (Agent)</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              创建可以动态调用工具的智能助手，通过对话式交互完成复杂任务。
              适合需要灵活决策的场景。
            </p>

            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-purple-50 text-purple-600 text-sm rounded-full">
                对话交互
              </span>
              <span className="px-3 py-1 bg-purple-50 text-purple-600 text-sm rounded-full">
                动态决策
              </span>
              <span className="px-3 py-1 bg-purple-50 text-purple-600 text-sm rounded-full">
                Skills 扩展
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="pb-8 text-center text-gray-400 text-sm">
        选择一个模式开始使用 Tweak
      </div>
    </div>
  )
}
