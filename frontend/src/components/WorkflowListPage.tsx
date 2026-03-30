/**
 * 工作流列表页 - 首页
 *
 * 展示所有已保存的工作流，支持:
 * - 查看工作流列表
 * - 新建工作流
 * - 打开已有工作流进入编辑器
 * - 删除工作流
 */
import { useEffect, useState } from 'react'
import { Plus, Trash2, Clock, Layers, FileCode, Settings } from 'lucide-react'
import { listWorkflows, deleteWorkflow } from '@/api/client'

interface WorkflowSummary {
  id: string
  name: string
  description: string
  column_count: number
}

interface Props {
  onOpen: (workflowId: string) => void
  onCreateNew: () => void
  onOpenSettings?: () => void
}

export function WorkflowListPage({ onOpen, onCreateNew, onOpenSettings }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [loading, setLoading] = useState(true)

  const loadWorkflows = async () => {
    try {
      const data = await listWorkflows()
      setWorkflows(data)
    } catch (e) {
      console.error('加载工作流失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkflows()
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (!confirm(`确定删除工作流「${name}」？删除后不可恢复。`)) return
    try {
      await deleteWorkflow(id)
      setWorkflows((prev) => prev.filter((w) => w.id !== id))
    } catch (e) {
      alert(`删除失败: ${e}`)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* 顶栏 */}
      <div className="h-14 bg-white border-b px-6 flex items-center justify-between shadow-sm">
        <h1 className="text-lg font-bold text-sky-600 flex items-center gap-2">
          <Layers size={20} />
          MiniFlow
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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* 标题 + 新建按钮 */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">我的工作流</h2>
              <p className="text-sm text-gray-500 mt-1">选择一个工作流进入编辑，或创建新的工作流</p>
            </div>
            {workflows.length > 0 && (
              <button
                onClick={onCreateNew}
                className="flex items-center gap-2 px-5 py-2.5 text-sm text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition font-medium shadow-sm"
              >
                <Plus size={16} />
                新建工作流
              </button>
            )}
          </div>

          {/* 工作流列表 */}
          {loading ? (
            <div className="text-center py-20">
              <p className="text-gray-400">加载中...</p>
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-lg text-gray-400 mb-4">开始使用</div>
              <p className="text-gray-500 text-lg mb-2">还没有工作流</p>
              <p className="text-gray-400 text-sm mb-6">点击「新建工作流」开始创建你的第一个 AI 工作流</p>
              <button
                onClick={onCreateNew}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition font-medium"
              >
                <Plus size={16} />
                新建工作流
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => onOpen(wf.id)}
                  className="group bg-white rounded-xl border-2 border-gray-100 hover:border-sky-300 p-5 cursor-pointer transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center">
                        <FileCode size={20} className="text-sky-500" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-800 truncate">{wf.name}</h3>
                        {wf.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{wf.description}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, wf.id, wf.name)}
                      className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Layers size={12} />
                      {wf.column_count} 个步骤
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {wf.id.split('_')[1] ? formatTime(parseInt(wf.id.split('_')[1])) : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return ''
  const d = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}
