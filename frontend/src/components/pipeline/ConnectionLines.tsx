import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  isOverlapping: boolean
  routeY?: number
}

interface BlockRect {
  id: string
  left: number
  top: number
  right: number
  bottom: number
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
}

function cubicBezierPoint(
  t: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
): [number, number] {
  const u = 1 - t
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ]
}

function getSamplePoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  skipDistance: number,
  routeY?: number,
): [number, number][] {
  const points: [number, number][] = []

  if (skipDistance <= 1 || routeY === undefined) {
    const dx = toX - fromX
    const cp = Math.max(dx * 0.4, 40)
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      points.push(
        cubicBezierPoint(t, [fromX, fromY], [fromX + cp, fromY], [toX - cp, toY], [toX, toY]),
      )
    }
  } else {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      points.push(
        cubicBezierPoint(
          t,
          [fromX, fromY],
          [fromX + 25, fromY],
          [fromX + 25, routeY],
          [fromX + 50, routeY],
        ),
      )
    }
    for (let i = 1; i <= 4; i++) {
      const t = i / 5
      points.push([(fromX + 50) + t * (toX - 50 - (fromX + 50)), routeY])
    }
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      points.push(
        cubicBezierPoint(
          t,
          [toX - 50, routeY],
          [toX - 25, routeY],
          [toX - 25, toY],
          [toX, toY],
        ),
      )
    }
  }

  return points
}

function checkOverlap(
  samplePoints: [number, number][],
  blockRects: BlockRect[],
  fromBlockId: string,
  toBlockId: string,
): boolean {
  return samplePoints.some(([px, py]) =>
    blockRects.some(
      (br) =>
        br.id !== fromBlockId &&
        br.id !== toBlockId &&
        px >= br.left &&
        px <= br.right &&
        py >= br.top &&
        py <= br.bottom,
    ),
  )
}

export function ConnectionLines({ containerRef }: Props) {
  const workflow = useWorkflowStore((s) => s.workflow)
  const selectedBlockId = useWorkflowStore((s) => s.selectedBlockId)
  const connectingFrom = useWorkflowStore((s) => s.connectingFrom)
  const removeConnection = useWorkflowStore((s) => s.removeConnection)
  const [lines, setLines] = useState<LineData[]>([])
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [sourcePortPos, setSourcePortPos] = useState<{ x: number; y: number } | null>(null)
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null)
  const hoverTimeoutRef = useRef<number | null>(null)

  const blockColumnMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const col of workflow.columns) {
      for (const block of col.blocks) {
        map.set(block.id, col.order)
      }
    }
    return map
  }, [workflow])

  useEffect(() => {
    if (!connectingFrom || !containerRef.current) {
      setMousePos(null)
      setSourcePortPos(null)
      return
    }

    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()

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

  const computeLines = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()

    const blockElements = container.querySelectorAll<HTMLElement>('[data-block-id]')
    const blockRects: BlockRect[] = []
    let maxBlockBottom = 0

    blockElements.forEach((el) => {
      const id = el.getAttribute('data-block-id') || ''
      const rect = el.getBoundingClientRect()
      const relRect: BlockRect = {
        id,
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        right: rect.right - containerRect.left,
        bottom: rect.bottom - containerRect.top,
      }
      blockRects.push(relRect)
      if (relRect.bottom > maxBlockBottom) maxBlockBottom = relRect.bottom
    })

    const newLines: LineData[] = []
    let skipCounter = 0

    for (const col of workflow.columns) {
      for (const block of col.blocks) {
        if (block.connections.length === 0) continue

        const toEl = container.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`)
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
          const skipIdx = skipDistance > 1 ? skipCounter++ : 0

          const fromX = fromRect.right - containerRect.left
          const fromY = fromRect.top + fromRect.height / 2 - containerRect.top
          const toX = toRect.left - containerRect.left
          const toY = toRect.top + toRect.height / 2 - containerRect.top

          const routeY = skipDistance > 1 ? maxBlockBottom + 25 + skipIdx * 14 : undefined

          const samplePoints = getSamplePoints(fromX, fromY, toX, toY, skipDistance, routeY)
          const isOverlapping = checkOverlap(samplePoints, blockRects, conn.from_block_id, block.id)

          newLines.push({
            id: `${conn.from_block_id}->${block.id}`,
            fromX,
            fromY,
            toX,
            toY,
            fromBlockId: conn.from_block_id,
            toBlockId: block.id,
            skipDistance,
            skipIndex: skipIdx,
            isOverlapping,
            routeY,
          })
        }
      }
    }

    setLines(newLines)
  }, [workflow, containerRef, blockColumnMap])

  useEffect(() => {
    computeLines()

    const container = containerRef.current
    if (!container) return

    const handleResize = () => computeLines()

    window.addEventListener('resize', handleResize)
    container.addEventListener('scroll', handleResize)

    const scrollParent = container.parentElement
    if (scrollParent) {
      scrollParent.addEventListener('scroll', handleResize)
    }

    const columnScrollContainers = Array.from(
      container.querySelectorAll('.column-scroll-container')
    )
    columnScrollContainers.forEach((col) => {
      col.addEventListener('scroll', handleResize)
    })

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    return () => {
      window.removeEventListener('resize', handleResize)
      container.removeEventListener('scroll', handleResize)
      if (scrollParent) {
        scrollParent.removeEventListener('scroll', handleResize)
      }
      columnScrollContainers.forEach((col) => {
        col.removeEventListener('scroll', handleResize)
      })
      resizeObserver.disconnect()
    }
  }, [computeLines, containerRef])

  useEffect(() => {
    const frame = requestAnimationFrame(computeLines)
    return () => cancelAnimationFrame(frame)
  }, [workflow, computeLines])

  const getPath = (line: LineData): string => {
    const { fromX, fromY, toX, toY, skipDistance, routeY } = line

    if (skipDistance <= 1 || routeY === undefined) {
      const dx = toX - fromX
      const cp = Math.max(dx * 0.4, 40)
      return `M ${fromX},${fromY} C ${fromX + cp},${fromY} ${toX - cp},${toY} ${toX},${toY}`
    } else {
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

  const handleLineClick = (line: LineData, e: React.MouseEvent) => {
    e.stopPropagation()
    if (connectingFrom) return
    removeConnection(line.toBlockId, line.fromBlockId)
    setHoveredLineId(null)
  }

  const handleLineMouseEnter = (lineId: string) => {
    if (connectingFrom) return
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setHoveredLineId(lineId)
  }

  const handleLineMouseLeave = () => {
    hoverTimeoutRef.current = window.setTimeout(() => setHoveredLineId(null), 50)
  }

  return (
    <svg
      className="absolute inset-0"
      style={{ width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
    >
      {lines.map((line) => {
        const isHighlighted =
          selectedBlockId === line.fromBlockId || selectedBlockId === line.toBlockId
        const isHovered = hoveredLineId === line.id
        const path = getPath(line)

        const strokeColor = isHovered ? '#8b3a3a' : isHighlighted ? '#b0603e' : '#7c6f5d'

        return (
          <g key={line.id}>
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              strokeLinecap="round"
              style={{ pointerEvents: 'stroke', cursor: connectingFrom ? 'default' : 'pointer' }}
              onClick={(e) => handleLineClick(line, e)}
              onMouseEnter={() => handleLineMouseEnter(line.id)}
              onMouseLeave={handleLineMouseLeave}
            />
            {(isHighlighted || isHovered) && (
              <path
                d={path}
                fill="none"
                stroke={isHovered ? '#ebc8c8' : '#e8cdb9'}
                strokeWidth={6}
                strokeLinecap="round"
                opacity={0.55}
              />
            )}
            <path
              d={path}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isHighlighted || isHovered ? 2.5 : 1.8}
              strokeLinecap="round"
              strokeDasharray={line.isOverlapping ? '6 4' : 'none'}
              style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
            />
            <circle
              cx={line.fromX}
              cy={line.fromY}
              r={isHighlighted || isHovered ? 4 : 3}
              fill={strokeColor}
              style={{ transition: 'r 0.2s, fill 0.2s' }}
            />
            <circle
              cx={line.toX}
              cy={line.toY}
              r={isHighlighted || isHovered ? 4 : 3}
              fill={strokeColor}
              style={{ transition: 'r 0.2s, fill 0.2s' }}
            />
            {isHovered && !connectingFrom && (
              <g>
                <rect
                  x={(line.fromX + line.toX) / 2 - 8}
                  y={(line.fromY + line.toY) / 2 - 8}
                  width={16}
                  height={16}
                  rx={1.5}
                  fill="#8b3a3a"
                  transform={`rotate(-3 ${(line.fromX + line.toX) / 2} ${(line.fromY + line.toY) / 2})`}
                  style={{ pointerEvents: 'none' }}
                />
                <text
                  x={(line.fromX + line.toX) / 2}
                  y={(line.fromY + line.toY) / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#f7f3ed"
                  fontSize={11}
                  fontWeight="bold"
                  transform={`rotate(-3 ${(line.fromX + line.toX) / 2} ${(line.fromY + line.toY) / 2})`}
                  style={{ pointerEvents: 'none' }}
                >
                  ×
                </text>
              </g>
            )}
          </g>
        )
      })}

      {connectingFrom && sourcePortPos && mousePos && (
        <g>
          <path
            d={`M ${sourcePortPos.x},${sourcePortPos.y} C ${sourcePortPos.x + 40},${sourcePortPos.y} ${mousePos.x - 40},${mousePos.y} ${mousePos.x},${mousePos.y}`}
            fill="none"
            stroke="#b0603e"
            strokeWidth={1.8}
            strokeDasharray="6 4"
            strokeLinecap="round"
            opacity={0.85}
          />
          <circle cx={sourcePortPos.x} cy={sourcePortPos.y} r={4} fill="#b0603e" />
        </g>
      )}
    </svg>
  )
}
