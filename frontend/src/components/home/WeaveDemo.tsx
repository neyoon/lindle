import { Fragment, useEffect, useRef, useState } from 'react'

/**
 * WeaveDemo — 首页 Chapter III 的"一次搭建"
 *
 * 类名沿用旧的 weave-* 命名属于历史遗留，语义上已统一为"搭积木"叙事：
 * 三个方块依次落位，中间的连接线把它们咬合成一条 Flow。
 *
 * 设计目的：
 *   用 Paper & Ink 已有的动效（stamp-land / thread-draw / ink-pulse / stamp-land-tilted / ink-bleed），
 *   在六秒内演示一次工作流的「编排 → 连接 → 运行 → 收敛」。
 *   进入视口才开始，不抢注意力；结束后可以"重播"。
 *
 * 时间线（t 以 started 为 0 计算）：
 *   0.00 ─ 三列表头（kicker）依次 ink-bleed
 *   1.00 ─ 方块 1 stamp-land
 *   1.50 ─ 方块 2 stamp-land
 *   2.00 ─ 方块 3 stamp-land
 *   2.50 ─ 连接线 1 thread-draw
 *   3.00 ─ 连接线 2 thread-draw
 *   3.40 ─ 底部状态：编排完成
 *   3.90 ─ block 0 running（rust 脉冲）
 *   4.50 ─ block 0 done，block 1 running
 *   5.10 ─ block 1 done，block 2 running
 *   5.70 ─ block 2 done
 *   5.90 ─ 底部状态：已搭成；重播按钮 ink-bleed
 */

type RunState = 'idle' | 'running' | 'done'
type StatusState = 'hidden' | 'ready' | 'done'

type StageDef = {
  stage: string
  label: string
  tagCode: string
  tagClass: string
  name: string
}

const STAGES: StageDef[] = [
  { stage: '01', label: 'Orchestrate', tagCode: 'IN', tagClass: 'is-in', name: '用户输入' },
  { stage: '02', label: 'Transform', tagCode: 'AI', tagClass: 'is-ai', name: 'AI 归纳' },
  { stage: '03', label: 'Converge', tagCode: 'OUT', tagClass: 'is-out', name: '结构化输出' },
]

export function WeaveDemo() {
  const [started, setStarted] = useState(false)
  const [playKey, setPlayKey] = useState(0)
  const [runStates, setRunStates] = useState<RunState[]>(['idle', 'idle', 'idle'])
  const [status, setStatus] = useState<StatusState>('hidden')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started) {
            setStarted(true)
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [started])

  useEffect(() => {
    if (!started) return
    setRunStates(['idle', 'idle', 'idle'])
    setStatus('hidden')
    const timers: number[] = []
    timers.push(window.setTimeout(() => setStatus('ready'), 3400))
    timers.push(window.setTimeout(() => setRunStates(['running', 'idle', 'idle']), 3900))
    timers.push(window.setTimeout(() => setRunStates(['done', 'running', 'idle']), 4500))
    timers.push(window.setTimeout(() => setRunStates(['done', 'done', 'running']), 5100))
    timers.push(window.setTimeout(() => setRunStates(['done', 'done', 'done']), 5700))
    timers.push(window.setTimeout(() => setStatus('done'), 5900))
    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [started, playKey])

  const replay = () => setPlayKey((k) => k + 1)

  return (
    <div ref={rootRef} className="weave-demo">
      {started ? (
        <div key={playKey} className="weave-stage">
          {/* ─── Headers row ─── */}
          <div className="weave-row weave-headers">
            {STAGES.map((s, i) => (
              <Fragment key={s.stage}>
                <div className="weave-col-header">
                  <span
                    className="weave-kicker anim-ink"
                    style={{ animationDelay: `${0.2 + i * 0.18}s` }}
                  >
                    Stage {s.stage} · {s.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && <div className="weave-spacer" aria-hidden="true" />}
              </Fragment>
            ))}
          </div>

          {/* ─── Bodies row ─── */}
          <div className="weave-row weave-bodies">
            {STAGES.map((s, i) => {
              const state = runStates[i]
              return (
                <Fragment key={s.stage}>
                  <div
                    className={`weave-block${state === 'idle' ? '' : ` is-${state}`}`}
                    style={{ animationDelay: `${1.0 + i * 0.5}s` }}
                  >
                    <span className={`block-tag ${s.tagClass}`}>{s.tagCode}</span>
                    <div className="weave-block-name">{s.name}</div>
                    {state !== 'idle' && (
                      <span
                        key={state}
                        className={`weave-block-stamp is-${state}`}
                        aria-label={state === 'running' ? 'running' : 'done'}
                      >
                        {state === 'running' ? 'run' : 'done'}
                      </span>
                    )}
                  </div>

                  {i < STAGES.length - 1 && (
                    <div className={`weave-thread${state === 'done' ? ' is-done' : ''}`}>
                      <svg viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true">
                        <line
                          x1="0"
                          y1="0.5"
                          x2="100"
                          y2="0.5"
                          pathLength={100}
                          style={{ animationDelay: `${2.5 + i * 0.5}s` }}
                        />
                      </svg>
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>

          {/* ─── Footer ─── */}
          <div className="weave-footer">
            <span className={`weave-status is-${status}`}>
              {status === 'ready' && '编排完成 · 开始运行'}
              {status === 'done' && '已搭成 · 一条可复用的 Flow'}
              {status === 'hidden' && '\u00A0'}
            </span>
            {status === 'done' && (
              <button onClick={replay} className="weave-replay" type="button">
                重播 ↻
              </button>
            )}
          </div>
        </div>
      ) : (
        // 未进入视口时只保留骨架高度，避免 layout shift
        <div className="weave-stage is-placeholder" aria-hidden="true">
          <div className="weave-row weave-headers">
            {STAGES.map((s, i) => (
              <Fragment key={s.stage}>
                <div className="weave-col-header" />
                {i < STAGES.length - 1 && <div className="weave-spacer" />}
              </Fragment>
            ))}
          </div>
          <div className="weave-row weave-bodies">
            {STAGES.map((s, i) => (
              <Fragment key={s.stage}>
                <div className="weave-block is-placeholder" />
                {i < STAGES.length - 1 && <div className="weave-thread" />}
              </Fragment>
            ))}
          </div>
          <div className="weave-footer" />
        </div>
      )}
    </div>
  )
}
