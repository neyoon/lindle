/**
 * Lindle 首页 —— Paper & Ink 设计语言
 *
 * 叙事类比：把任务组织成结构，像搭积木 — 一块一块落位、咬合成形。
 * 视觉动效沿用纸墨语言（stamp-land / ink-bleed / thread-draw）。
 *
 * stage = 'overview'  : 卷首（介绍 + Flow / Agent 两端 + 连接 timeline）
 * stage = 'entry'     : 入场（Settings / Flow / Agent 三个入口卡）
 */
import { ArrowLeft, ArrowRight, Settings, Sparkles, Workflow } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { BrandMark } from './ui/BrandMark'
import { WeaveDemo } from './home/WeaveDemo'

interface Props {
  stage: 'overview' | 'entry'
  onShowOverview?: () => void
  onShowEntry: () => void
  onSelectFlow: () => void
  onSelectAgent: () => void
  onOpenSettings?: () => void
  headerActions?: ReactNode
}

const HERO_TITLE = '把任务，像搭积木一样落位成结构。'

const LOOP = [
  { num: 'i.',   title: '编排', desc: '把任务组织成可见阶段。' },
  { num: 'ii.',  title: '制造', desc: '高频节点沉淀成模板。' },
  { num: 'iii.', title: '封装', desc: '导出为可调用的 Skill。' },
  { num: 'iv.',  title: '调度', desc: 'Agent 按上下文调用。' },
]

const STRUCTURE_STAGES = [
  { idx: 'i.',   name: '目标理解',     desc: '识别任务边界',     state: 'done' as const },
  { idx: 'ii.',  name: '阶段组织',     desc: '拆分执行阶段',     state: 'done' as const },
  { idx: 'iii.', name: '节点连接',     desc: '组织处理路径',     state: 'now'  as const },
  { idx: 'iv.',  name: 'Canonical Flow', desc: '抽象 · 可复用',  state: 'wait' as const },
]

/** Hook: IntersectionObserver to add `.in` to elements with `.reveal` */
function useReveal(deps: unknown[] = []) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' })
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return containerRef
}

/** 把一段中文逐字包成 span，配合 .anim-press 做活字排印动画 */
function PressTitle({ text, base = 0.18, step = 0.07 }: { text: string; base?: number; step?: number }) {
  return (
    <span className="anim-press">
      {Array.from(text).map((ch, i) => (
        <span key={i} style={{ animationDelay: `${base + i * step}s` }}>
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </span>
  )
}

export function HomePage({
  stage,
  onShowOverview,
  onShowEntry,
  onSelectFlow,
  onSelectAgent,
  onOpenSettings,
  headerActions,
}: Props) {
  if (stage === 'entry') {
    return <EntryView
      onShowOverview={onShowOverview}
      onSelectFlow={onSelectFlow}
      onSelectAgent={onSelectAgent}
      onOpenSettings={onOpenSettings}
      headerActions={headerActions}
    />
  }
  return <OverviewView
    onShowEntry={onShowEntry}
    onSelectAgent={onSelectAgent}
    headerActions={headerActions}
  />
}

/* ============================================================
   Overview — 卷首
   ============================================================ */
function OverviewView({ onShowEntry, onSelectAgent, headerActions }: { onShowEntry: () => void; onSelectAgent: () => void; headerActions?: ReactNode }) {
  const containerRef = useReveal([])

  return (
    <div ref={containerRef} className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex items-center gap-3">
            <span className="brand-seal anim-stamp" aria-label="Lindle"><BrandMark /></span>

            <div className="leading-tight">
              <div className="app-brand-mark">Lindle</div>
              <div className="text-[0.62rem] uppercase tracking-[0.22em] text-[var(--ink-soft)] mt-0.5 font-mono">
                blocks · joints
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">{headerActions}</div>
        </div>
      </header>

      <main className="app-page py-12 md:py-16 lg:py-20">
        {/* ===== HERO ===== */}
        <section className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <span className="app-kicker anim-ink" style={{ animationDelay: '0.1s' }}>
              Chapter I · Blocks &amp; Joints
            </span>
            <h1 className="app-section-title mt-6 text-4xl leading-[1.18] md:text-5xl lg:text-[3.6rem]"
                style={{ fontWeight: 500 }}>
              <PressTitle text="把任务，" base={0.20} />
              <br />
              <PressTitle text="像" base={0.52} />
              <em><PressTitle text="搭积木" base={0.60} /></em>
              <PressTitle text="一样" base={0.81} />
              <br />
              <PressTitle text="落位成结构。" base={0.95} />
            </h1>
            <p className="anim-ink mt-5 italic text-[var(--ink-soft)] text-lg"
               style={{ fontFamily: 'Fraunces, serif', animationDelay: '1.5s' }}>
              To stack capability, to converge intent.
            </p>
            <div className="anim-ink mt-9 flex flex-wrap gap-3" style={{ animationDelay: '1.75s' }}>
              <button onClick={onShowEntry} className="app-button app-button-primary">
                走进工坊
                <ArrowRight size={16} />
              </button>
              <a href="#loop" className="app-button app-button-secondary">读一读原理</a>
            </div>
          </div>

          {/* Structure card — 从需求到结构化工作流的预览 */}
          <aside className="app-card stitched anim-loom relative p-7 pt-8">
            <span className="stamp-corner">Canvas · 01 / 04</span>
            <div className="font-serif italic text-lg" style={{ fontFamily: 'Fraunces, serif' }}>需求 → 结构化工作流</div>
            <div className="mt-1 mb-5 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              workflow preview · 4 stages
            </div>
            <ul className="flex flex-col">
              {STRUCTURE_STAGES.map((s) => (
                <li key={s.idx} className="grid grid-cols-[34px_1fr_auto] gap-3 items-center py-3 border-b border-dashed border-[var(--line)] last:border-b-0">
                  <span className="font-serif italic text-[var(--rust)]" style={{ fontFamily: 'Fraunces, serif' }}>{s.idx}</span>
                  <div>
                    <div className="font-medium text-[0.95rem]" style={{ fontFamily: '"Noto Serif SC", serif' }}>{s.name}</div>
                    <div className="font-mono text-[0.7rem] text-[var(--ink-soft)] mt-0.5">{s.desc}</div>
                  </div>
                  <span className={`font-mono text-[0.66rem] tracking-wider ${
                    s.state === 'done' ? 'text-[var(--moss)]' :
                    s.state === 'now'  ? 'text-[var(--rust)] relative pr-3.5' :
                    'text-[var(--ink-faint)]'
                  }`}>
                    {s.state === 'done' ? 'done' : s.state === 'now' ? 'run' : 'wait'}
                    {s.state === 'now' && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--rust)]"
                            style={{ animation: 'ink-pulse 1.6s ease-in-out infinite' }} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {/* 连接预览 — thread-draw 首次绘出两段连接线，中间一个落位点 */}
            <div className="mt-5 pt-4 border-t border-dashed border-[var(--line)] flex items-center gap-3">
              <span className="italic text-[0.82rem] text-[var(--ink-soft)]" style={{ fontFamily: 'Fraunces, serif' }}>Block</span>
              <svg className="loom-thread" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="0.5" x2="100" y2="0.5" pathLength="100" style={{ animationDelay: '0.9s' }} />
              </svg>
              <span className="loom-knot" style={{ animationDelay: '1.55s' }} />
              <svg className="loom-thread" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="0.5" x2="100" y2="0.5" pathLength="100" style={{ animationDelay: '1.75s' }} />
              </svg>
              <span className="italic text-[0.82rem] text-[var(--ink-soft)]" style={{ fontFamily: 'Fraunces, serif' }}>Slot</span>
            </div>
          </aside>
        </section>

        {/* ===== CAPABILITIES ===== */}
        <section id="cap" className="mt-32">
          <div className="reveal grid gap-8 lg:grid-cols-[1fr_2fr] mb-12">
            <div className="flex flex-col gap-3">
              <span className="app-kicker">Chapter II · Two Ends</span>
              <p className="italic text-[var(--ink-soft)] text-[0.96rem] leading-relaxed" style={{ fontFamily: 'Fraunces, serif' }}>
                Structure, then skill —<br />Flow on one end, Agent on the other.
              </p>
            </div>
            <h2 className="app-section-title text-3xl md:text-[2.4rem] leading-[1.25]">
              一端<em>编排</em>结构，
              <br />另一端<em>调度</em>能力。
            </h2>
          </div>

          <div className="reveal stagger grid gap-3.5 md:grid-cols-2">
            <button onClick={onShowEntry} className="app-card-soft p-9 text-left flex flex-col gap-4 relative overflow-hidden group">
              <span className="absolute -bottom-[55%] -right-[25%] w-4/5 aspect-square rounded-full border border-dashed border-[var(--line)] pointer-events-none transition-transform duration-700 group-hover:[transform:rotate(-10deg)_scale(1.05)]" />
              <div className="flex items-center justify-between">
                <span className="w-[50px] h-[50px] rounded-full border-[1.5px] border-[var(--ink)] inline-flex items-center justify-center text-[var(--ink)] transition-transform duration-500 group-hover:rotate-[18deg]">
                  <Workflow size={20} />
                </span>
                <span className="app-kicker no-rule font-mono">Deterministic</span>
              </div>
              <div className="font-medium text-[1.6rem]" style={{ fontFamily: '"Noto Serif SC", serif' }}>进入 Flow</div>
              <div className="italic text-[var(--ink-soft)] text-[0.92rem]" style={{ fontFamily: 'Fraunces, serif' }}>
                Where each stage is visible.
              </div>
              <p className="text-[var(--ink-mid)] text-[0.92rem] leading-relaxed">
                把任务拆成可见的阶段，定义输入、处理与输出，沉淀为可复用的结构。
              </p>
              <span className="self-start mt-2 inline-flex items-center gap-2 px-4 py-1.5 border border-[var(--ink)] rounded-sm font-mono text-[0.74rem] tracking-[0.14em] uppercase transition-colors duration-300 group-hover:bg-[var(--ink)] group-hover:text-[var(--paper)]">
                workflows / new →
              </span>
            </button>

            <button onClick={onSelectAgent} className="app-card-soft p-9 text-left flex flex-col gap-4 relative overflow-hidden group">
              <span className="absolute -bottom-[55%] -right-[25%] w-4/5 aspect-square rounded-full border border-dashed border-[var(--line)] pointer-events-none transition-transform duration-700 group-hover:[transform:rotate(-10deg)_scale(1.05)]" />
              <div className="flex items-center justify-between">
                <span className="w-[50px] h-[50px] rounded-full border-[1.5px] border-[var(--rust)] inline-flex items-center justify-center text-[var(--rust)] transition-transform duration-500 group-hover:rotate-[18deg]">
                  <Sparkles size={20} />
                </span>
                <span className="app-kicker no-rule font-mono">Dynamic</span>
              </div>
              <div className="font-medium text-[1.6rem] flex items-center gap-2" style={{ fontFamily: '"Noto Serif SC", serif' }}>
                进入 Agent
                <span className="app-pill" style={{ background: 'var(--rust)', color: 'var(--paper)', borderColor: 'var(--rust)' }}>BETA</span>
              </div>
              <div className="italic text-[var(--ink-soft)] text-[0.92rem]" style={{ fontFamily: 'Fraunces, serif' }}>
                A conversation that performs.
              </div>
              <p className="text-[var(--ink-mid)] text-[0.92rem] leading-relaxed">
                在对话里按上下文调度 Skills 与 Flows，把运行时意图组织成一次执行。
              </p>
              <span className="self-start mt-2 inline-flex items-center gap-2 px-4 py-1.5 border border-[var(--ink)] rounded-sm font-mono text-[0.74rem] tracking-[0.14em] uppercase transition-colors duration-300 group-hover:bg-[var(--rust)] group-hover:border-[var(--rust)] group-hover:text-[var(--paper)]">
                agents / new →
              </span>
            </button>
          </div>
        </section>

        {/* ===== ONE STACK — 动效演示 ===== */}
        <section id="loop" className="mt-32">
          <div className="reveal grid gap-8 lg:grid-cols-[1fr_2fr] mb-12">
            <div className="flex flex-col gap-3">
              <span className="app-kicker">Chapter III · One Stack</span>
              <p className="italic text-[var(--ink-soft)] text-[0.96rem] leading-relaxed" style={{ fontFamily: 'Fraunces, serif' }}>
                Watch it stack, once.
              </p>
            </div>
            <h2 className="app-section-title text-3xl md:text-[2.4rem] leading-[1.25]">
              一次<em>编排</em>，
              <br />一次<em>运行</em>，
              <br />一条可复用的 Flow。
            </h2>
          </div>

          <div className="reveal">
            <WeaveDemo />
            <p className="mt-6 text-center italic text-[var(--ink-soft)] text-[0.9rem]" style={{ fontFamily: 'Fraunces, serif' }}>
              一块一块落位，一步一步运行 —— 编排即结构，运行即显影。
            </p>
          </div>
        </section>

        {/* ===== CONTINUOUS LOOP — 四节点循环 ===== */}
        <section className="mt-32">
          <div className="reveal grid gap-8 lg:grid-cols-[1fr_2fr] mb-12">
            <div className="flex flex-col gap-3">
              <span className="app-kicker">Chapter IV · Continuous Loop</span>
              <p className="italic text-[var(--ink-soft)] text-[0.96rem]" style={{ fontFamily: 'Fraunces, serif' }}>
                One loop, stacked continuously.
              </p>
            </div>
            <h2 className="app-section-title text-3xl md:text-[2.4rem] leading-[1.25]">
              搭建不是一次，
              <br />是<em>持续</em>的沉淀。
            </h2>
          </div>

          <div className="reveal stagger relative pt-7 pb-10">
            <div className="absolute left-0 right-0 top-[46px] flex items-center pointer-events-none gap-0">
              <div className="flex-1 running-thread" />
              <div className="flex-1 running-thread rust" />
              <div className="flex-1 running-thread" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
              {LOOP.map((s, i) => (
                <div key={s.title} className="text-center px-2">
                  <span className="block w-3.5 h-3.5 bg-[var(--rust)] mx-auto mb-7 relative"
                        style={{ transform: 'rotate(45deg)', animation: `knot-in 0.7s var(--ease-ink) ${0.05 + i * 0.15}s backwards` }}>
                    <span className="absolute -inset-[5px] border border-dashed border-[var(--rust)] rounded-full opacity-50"
                          style={{ transform: 'rotate(-45deg)' }} />
                  </span>
                  <span className="block italic text-[0.82rem] text-[var(--rust)] mb-1" style={{ fontFamily: 'Fraunces, serif' }}>{s.num}</span>
                  <h4 className="text-[1rem] font-medium mb-1" style={{ fontFamily: '"Noto Serif SC", serif' }}>{s.title}</h4>
                  <p className="font-mono text-[0.68rem] text-[var(--ink-soft)] tracking-wide leading-snug">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Footer signature ===== */}
        <div className="mt-20 pt-10 border-t border-[var(--line)] flex items-center justify-between font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
          <span>Copyright © 2026 guanxingjian · Noncommercial Source Available</span>
          <span className="italic normal-case tracking-normal text-[var(--ink-mid)] inline-flex items-center gap-3 text-[0.86rem]"
                style={{ fontFamily: 'Fraunces, serif' }}>
            <span className="inline-block w-16 align-middle running-thread" />
            Orchestrate, as one stacks
            <span className="inline-block w-16 align-middle running-thread" />
          </span>
          <button onClick={onShowEntry} className="hover:text-[var(--rust)] transition">
            workshop →
          </button>
        </div>
      </main>
    </div>
  )
}

/* ============================================================
   Entry — 三入口卡（Settings · Flow · Agent）
   ============================================================ */
function EntryView({
  onShowOverview, onSelectFlow, onSelectAgent, onOpenSettings, headerActions,
}: {
  onShowOverview?: () => void
  onSelectFlow: () => void
  onSelectAgent: () => void
  onOpenSettings?: () => void
  headerActions?: ReactNode
}) {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex items-center gap-3">
            {onShowOverview && (
              <button onClick={onShowOverview} className="app-button app-button-ghost">
                <ArrowLeft size={15} />
                返回卷首
              </button>
            )}
            <span className="brand-seal" aria-label="Lindle"><BrandMark /></span>
            <div className="leading-tight">
              <div className="app-kicker no-rule">Workbench Entry</div>
              <div className="app-brand-mark">进入工作台</div>
            </div>
          </div>
          <div className="flex items-center gap-2">{headerActions}</div>
        </div>
      </header>

      <main className="app-page py-12 md:py-16">
        <section className="app-card p-9 md:p-12 stitched">
          <div className="max-w-3xl">
            <span className="app-kicker mb-3 inline-flex">Chapter IV · Entry</span>
            <h1 className="app-section-title text-3xl md:text-5xl leading-tight mt-3 anim-press">
              <PressTitle text="选择你的" base={0.05} />
              <em><PressTitle text="起点" base={0.45} /></em>
              <PressTitle text="。" base={0.65} />
            </h1>
            <p className="text-[var(--ink-mid)] mt-4 text-base leading-relaxed anim-ink" style={{ animationDelay: '0.85s' }}>
              进入 Flow 或 Agent；如果是首次使用，先去配置一次 Provider。
            </p>
          </div>

          <div className={`mt-10 grid gap-3.5 ${onOpenSettings ? 'lg:grid-cols-[0.7fr_1fr_1fr]' : 'md:grid-cols-2'}`}>
            {onOpenSettings && (
              <button onClick={onOpenSettings} className="app-card-soft p-7 text-left flex flex-col gap-4 group relative overflow-hidden">
                <span className="absolute -bottom-[55%] -right-[25%] w-4/5 aspect-square rounded-full border border-dashed border-[var(--line)] pointer-events-none transition-transform duration-700 group-hover:[transform:rotate(-10deg)_scale(1.05)]" />
                <span className="w-12 h-12 rounded-full border-[1.5px] border-[var(--ink)] inline-flex items-center justify-center text-[var(--ink)] transition-transform duration-500 group-hover:rotate-[18deg]">
                  <Settings size={18} />
                </span>
                <div>
                  <div className="app-kicker no-rule mb-2">System Setup</div>
                  <h2 className="app-section-title text-2xl">设置</h2>
                  <p className="text-[var(--ink-mid)] mt-2 text-sm leading-relaxed">
                    配置模型源、默认 Provider 与 AI 编辑能力。
                  </p>
                </div>
              </button>
            )}

            <button onClick={onSelectFlow} className="app-card-soft p-7 text-left flex flex-col gap-4 group relative overflow-hidden">
              <span className="absolute -bottom-[55%] -right-[25%] w-4/5 aspect-square rounded-full border border-dashed border-[var(--line)] pointer-events-none transition-transform duration-700 group-hover:[transform:rotate(-10deg)_scale(1.05)]" />
              <div className="flex items-center justify-between">
                <span className="w-12 h-12 rounded-full border-[1.5px] border-[var(--ink)] inline-flex items-center justify-center text-[var(--ink)] transition-transform duration-500 group-hover:rotate-[18deg]">
                  <Workflow size={20} />
                </span>
                <span className="app-kicker no-rule font-mono">Deterministic</span>
              </div>
              <div>
                <h2 className="app-section-title text-3xl">进入 Flow</h2>
                <p className="text-[var(--ink-mid)] mt-3 text-sm leading-relaxed">
                  开始可视化流程编排，组织结构、执行路径与复用方式。
                </p>
              </div>
            </button>

            <button onClick={onSelectAgent} className="app-card-soft p-7 text-left flex flex-col gap-4 group relative overflow-hidden">
              <span className="absolute -bottom-[55%] -right-[25%] w-4/5 aspect-square rounded-full border border-dashed border-[var(--line)] pointer-events-none transition-transform duration-700 group-hover:[transform:rotate(-10deg)_scale(1.05)]" />
              <div className="flex items-center justify-between">
                <span className="w-12 h-12 rounded-full border-[1.5px] border-[var(--rust)] inline-flex items-center justify-center text-[var(--rust)] transition-transform duration-500 group-hover:rotate-[18deg]">
                  <Sparkles size={20} />
                </span>
                <span className="app-kicker no-rule font-mono">Dynamic</span>
              </div>
              <div>
                <h2 className="app-section-title text-3xl flex items-center gap-2">
                  进入 Agent
                  <span className="app-pill" style={{ background: 'var(--rust)', color: 'var(--paper)', borderColor: 'var(--rust)' }}>BETA</span>
                </h2>
                <p className="text-[var(--ink-mid)] mt-3 text-sm leading-relaxed">
                  开始对话式能力调用，组合 Skills 与 Flows 执行任务。
                </p>
              </div>
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
