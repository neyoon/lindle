/**
 * 连接线可视化 - SVG 覆盖层
 *
 * 特性:
 * - 相邻栏连接: 平滑贝塞尔曲线
 * - 跨栏连接 (如 1→3): 通过顶部路由，避开中间栏的块
 * - 无箭头: 顺序由左到右自然表达
 * - 连接模式: 拖拽时显示临时虚线
 * - 端口圆点: 连接线两端显示小圆点
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow'

interface LineData {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  fromBlockId: string
  toBlockId: string
  skipDistance: number
  skipIndex: number
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function ConnectionLines({ containerRef }: Props) {
  const workflow = useWorkflowStore((s) => s.workflow)
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)
  const connectingFrom = useWorkflowStore((s) => s.connectingFrom)
  const [lines, setLines] = useState<LineData[]>([])
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [sourcePortPos, setSourcePortPos] = useState<{ x: number; y: number } | null>(null)

  // blockId → columnOrder 映射
  const blockColumnMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const col of workflow.columns) {
      for (const block of col.blocks) {
        map.set(block.id, col.order)
      }
    }
    return map
  }, [workflow])

  // 连接模式下跟踪鼠标位置
  useEffect(() => {
    if (!connectingFrom || !containerRef.current) {
      setMousePos(null)
      setSourcePortPos(null)
      return
    }

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()

    // 找到源块的右侧端口位置
    const sourceEl = container.querySelector<HTMLElement>(
      `[data-block-id="${connectingFrom.blockId}"]`,
    )
    if (sourceEl) {
      const sourceRect = sourceEl.getBoundingClientRect()
      setSourcePortPos({
        x: sourceRect.right - containerRect.left,
        y: sourceRect.top + sourceRect.height / 2 - containerRect.top,
      })
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [connectingFrom, containerRef])

  // 计算所有连接线位置
  const computeLines = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const newLines: LineData[] = []
    let skipCounter = 0

    for (const col of workflow.columns) {
      for (const block of col.blocks) {
        if (block.connections.length === 0) continue

        const toEl = container.querySelector<HTMLElement>(
          `[data-block-id="${block.id}"]`,
        )
        if (!toEl) continue
        const toRect = toEl.getBoundingClientRect()

        for (const conn of block.connections) {
          const fromEl = container.querySelector<HTMLElement>(
            `[data-block-id="${conn.from_block_id}"]`,
          )
          if (!fromEl) continue
          const fromRect = fromEl.getBoundingClientRect()

          const sourceColOrder = blockColumnMap.get(conn.from_block_id) ?? 0
          const targetColOrder = blockColumnMap.get(block.id) ?? 0
          const skipDistance = targetColOrder - sourceColOrder

          newLines.push({
            id: `${conn.from_block_id}->${block.id}`,
            fromX: fromRect.right - containerRect.left,
            fromY: fromRect.top + fromRect.height / 2 - containerRect.top,
            toX: toRect.left - containerRect.left,
            toY: toRect.top + toRect.height / 2 - containerRect.top,
            fromBlockId: conn.from_block_id,
            toBlockId: block.id,
            skipDistance,
            skipIndex: skipDistance > 1 ? skipCounter++ : 0,
          })
        }
      }
    }

    setLines(newLines)
  }, [workflow, containerRef, blockColumnMap])

  // 监听变化重算连线
  useEffect(() => {
    computeLines()

    const container = containerRef.current
    const handleResize = () => computeLines()

    window.addEventListener('resize', handleResize)
    container?.addEventListener('scroll', handleResize)

    const resizeObserver = new ResizeObserver(handleResize)
    if (container) resizeObserver.observe(container)

    return () => {
      window.removeEventListener('resize', handleResize)
      container?.removeEventListener('scroll', handleResize)
      resizeObserver.disconnect()
    }
  }, [computeLines, containerRef])

  // workflow 变化后延迟一帧重算
  useEffect(() => {
    const frame = requestAnimationFrame(computeLines)
    return () => cancelAnimationFrame(frame)
  }, [workflow, computeLines])

  // 生成连接线路径
  const getPath = (line: LineData): string => {
    const { fromX, fromY, toX, toY, skipDistance, skipIndex } = line

    if (skipDistance <= 1) {
      // 相邻栏: 简单贝塞尔曲线
      const dx = toX - fromX
      const cp = Math.max(dx * 0.4, 40)
      return `M ${fromX},${fromY} C ${fromX + cp},${fromY} ${toX - cp},${toY} ${toX},${toY}`
    } else {
      // 跨栏: 通过顶部路由，避开中间栏的块
      const routeY = 18 + skipIndex * 14
      return [
        `M ${fromX},${fromY}`,
        `C ${fromX + 25},${fromY}, ${fromX + 25},${routeY}, ${fromX + 50},${routeY}`,
        `L ${toX - 50},${routeY}`,
        `C ${toX - 25},${routeY}, ${toX - 25},${toY}, ${toX},${toY}`,
      ].join(' ')
    }
  }

  const hasContent = lines.length > 0 || (connectingFrom && sourcePortPos && mousePos)

  if (!hasContent) return null

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      {/* 已有连接线 */}
      {lines.map((line) => {
        const isHighlighted =
          selectedBlockId === line.fromBlockId || selectedBlockId === line.toBlockId
        const path = getPath(line)

        return (
          <g key={line.id}>
            {/* 底层光晕 */}
            {isHighlighted && (
              <path
                d={path}
                fill="none"
                stroke="#bae6fd"
                strokeWidth={6}
                strokeLinecap="round"
                opacity={0.5}
              />
            )}
            {/* 主线 */}
            <path
              d={path}
              fill="none"
              stroke={isHighlighted ? '#38bdf8' : '#7dd3fc'}
              strokeWidth={isHighlighted ? 2.5 : 1.8}
              strokeLinecap="round"
              style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
            />
            {/* 源端点 */}
            <circle
              cx={line.fromX}
              cy={line.fromY}
              r={isHighlighted ? 4 : 3}
              fill={isHighlighted ? '#38bdf8' : '#7dd3fc'}
              style={{ transition: 'r 0.2s, fill 0.2s' }}
            />
            {/* 目标端点 */}
            <circle
              cx={line.toX}
              cy={line.toY}
              r={isHighlighted ? 4 : 3}
              fill={isHighlighted ? '#38bdf8' : '#7dd3fc'}
              style={{ transition: 'r 0.2s, fill 0.2s' }}
            />
          </g>
        )
      })}

      {/* 连接模式: 临时虚线 */}
      {connectingFrom && sourcePortPos && mousePos && (
        <g>
          <path
            d={`M ${sourcePortPos.x},${sourcePortPos.y} C ${sourcePortPos.x + 40},${sourcePortPos.y} ${mousePos.x - 40},${mousePos.y} ${mousePos.x},${mousePos.y}`}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
            opacity={0.8}
          />
          <circle cx={sourcePortPos.x} cy={sourcePortPos.y} r={4} fill="#f59e0b" />
        </g>
      )}
    </svg>
  )
}
