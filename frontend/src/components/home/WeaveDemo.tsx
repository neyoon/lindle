import { Fragment, useEffect, useRef, useState } from 'react'

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
