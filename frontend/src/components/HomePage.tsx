import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Factory, Settings, Sparkles, Wrench, Workflow } from 'lucide-react'
import { ThemeToggle } from './ui/ThemeToggle'

interface Props {
  onSelectFlow: () => void
  onSelectAgent: () => void
  onOpenSettings?: () => void
}

const flowHighlights = [
  {
    title: '可视化流程编排',
    description: '流程结构直接可见，阶段顺序、节点关系与执行路径更容易理解和调整。',
  },
  {
    title: '自然语言参与构建',
    description: '除了手动编排，也可以通过自然语言生成或修改流程，不必从头逐项手写。',
  },
  {
    title: 'Flow 与 Agent 打通',
    description: '流程不仅用于执行，还可以继续沉淀为模板、Skill，并进入 Agent 的调用链路；Agent 也可以反向帮助生成和调整 Flow。',
  },
]

const capabilityPanels = {
  flow: {
    kicker: 'Flow',
    title: '可视化流程编排',
    description: '将复杂任务拆成清晰阶段，通过节点连接与阶段组织定义输入、处理与输出。整个执行结构可见、可调、可复用，也可以由自然语言继续辅助生成与修改。',
    points: [
      '可视化组织阶段与节点',
      '支持拖拽调整执行关系',
      '支持自然语言生成与修改',
    ],
  },
  agent: {
    kicker: 'Agent',
    title: '动态能力调用',
    description: '面向需要动态判断、对话交互和多能力组合的场景。Agent 可以根据上下文调用 Skills、执行已有 Flow，也可以帮助用户生成和修改新的 Flow。',
    points: [
      '根据上下文动态调用能力',
      '可执行已有 Flow 与 Skills',
      '可协助生成与修正新的 Flow',
    ],
  },
  relation: {
    kicker: 'Flow x Agent',
    title: '结构化执行与动态调用',
    description: 'Flow 负责把任务结构化、可视化、可执行；Agent 负责在运行时理解任务、选择能力并组织调用，同时也能继续协助生产新的 Flow。两者是一条连续链路。',
    points: [
      'Flow 提炼任务工作流',
      'Agent 进行能力调度',
      '根据调用结果优化逻辑',
    ],
  },
} as const

const loopSteps = [
  {
    icon: Workflow,
    title: 'Flow 编排',
    code: '01',
    description: '将复杂任务组织为清晰、可见、可调整的流程结构。',
  },
  {
    icon: Factory,
    title: '模板制造',
    code: '02',
    description: '把高频节点沉淀为可复用模板，减少重复搭建。',
  },
  {
    icon: Wrench,
    title: '导出 Skill',
    code: '03',
    description: '将流程能力进一步封装，进入可调用的能力层。',
  },
  {
    icon: Sparkles,
    title: 'Agent 调用',
    code: '04',
    description: '在对话与任务中按上下文动态调用这些能力，并协助生成或修改下一轮 Flow。',
  },
]

export function HomePage({ onSelectFlow, onSelectAgent, onOpenSettings }: Props) {
  const [stage, setStage] = useState<'overview' | 'entry'>('overview')
  const [capabilityView, setCapabilityView] = useState<keyof typeof capabilityPanels>('flow')

  if (stage === 'entry') {
    return (
      <div className="app-shell">
        <header className="app-topbar">
          <div className="app-topbar-inner">
            <div className="flex items-center gap-3">
              <button onClick={() => setStage('overview')} className="app-button app-button-ghost">
                <ArrowLeft size={16} />
                返回展示
              </button>
              <div>
                <div className="app-kicker">Workbench entry</div>
                <div className="app-brand-mark">进入工作台</div>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="app-page py-10 md:py-14">
          <section className="app-card p-8 md:p-12">
            <div className="max-w-3xl">
              <div className="app-kicker mb-3">Operation entry</div>
              <h1 className="app-section-title text-4xl leading-tight md:text-5xl">选择你的起点</h1>
              <p className="app-muted mt-4 text-sm leading-8 md:text-base">
                从基础配置开始，或直接进入 Flow 与 Agent 工作台。展示层和操作层在这里正式分开。
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-[0.65fr_1fr_1fr]">
              {onOpenSettings && (
                <button onClick={onOpenSettings} className="app-card-soft flex flex-col items-start gap-4 p-6 text-left transition hover:-translate-y-1">
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-4 text-[var(--app-accent)]">
                    <Settings size={22} />
                  </div>
                  <div>
                    <div className="app-kicker mb-2">System setup</div>
                    <h2 className="app-section-title text-2xl">设置</h2>
                    <p className="app-muted mt-2 text-sm leading-7">
                      配置模型源、默认 Provider 与 AI 编辑能力。
                    </p>
                  </div>
                </button>
              )}

              <button onClick={onSelectFlow} className="app-card-soft group flex flex-col items-start gap-5 p-6 text-left transition hover:-translate-y-1">
                <div className="flex w-full items-start justify-between">
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-4 text-[var(--app-accent)]">
                    <Workflow size={26} />
                  </div>
                </div>
                <div>
                  <div className="app-kicker mb-2">Deterministic systems</div>
                  <h2 className="app-section-title text-3xl">进入 Flow</h2>
                  <p className="app-muted mt-3 text-sm leading-7">
                    开始可视化流程编排，组织结构、执行路径与复用方式。
                  </p>
                </div>
              </button>

              <button onClick={onSelectAgent} className="app-card-soft group flex flex-col items-start gap-5 p-6 text-left transition hover:-translate-y-1">
                <div className="flex w-full items-start justify-between">
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-4 text-[var(--app-accent)]">
                    <Sparkles size={26} />
                  </div>
                </div>
                <div>
                  <div className="app-kicker mb-2">Dynamic orchestration</div>
                  <h2 className="app-section-title flex items-center gap-2 text-3xl">
                    进入 Agent
                    <span className="app-pill border-0 bg-[rgba(244,107,122,0.12)] text-[var(--app-danger)]">Beta</span>
                  </h2>
                  <p className="app-muted mt-3 text-sm leading-7">
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

  const activeCapability = capabilityPanels[capabilityView]

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div>
            <div className="app-kicker">Visual Systems for Structured Flows</div>
            <div className="app-brand-mark">Tweak</div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="app-page py-8 md:py-12">
        <section className="app-card overflow-hidden p-7 md:p-12">
          <div className="grid gap-10 xl:grid-cols-[1.35fr_0.85fr] xl:gap-12">
            <div className="space-y-6">
              <div className="app-kicker">Visual flow orchestration</div>
              <h1 className="app-section-title max-w-5xl text-4xl leading-tight md:text-6xl md:leading-[1.06]">
                可视化流程编排，
                <br />
                让复杂任务一目了然
              </h1>
              <p className="app-muted max-w-4xl text-base leading-8 md:text-lg">
                将复杂任务组织为清晰、可见、可调整的流程结构，使执行路径、阶段关系与能力边界一目了然。同时支持自然语言处理，不必逐项手写配置。
              </p>

              <div className="app-card-soft relative overflow-hidden p-5 md:p-6">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-80"
                >
                  <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[rgba(109,204,255,0.08)] to-transparent" />
                  <div className="absolute inset-0 bg-[linear-gradient(var(--app-grid)_1px,transparent_1px),linear-gradient(90deg,var(--app-grid)_1px,transparent_1px)] bg-[size:22px_22px]" />
                </div>

                <div className="relative">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="app-kicker mb-2">Micro orchestration preview</div>
                      <h2 className="app-section-title text-2xl">可视化编排示意</h2>
                    </div>
                    <div className="rounded-full border border-[var(--app-border)] bg-[rgba(109,204,255,0.08)] px-3 py-1 text-xs text-[var(--app-text-soft)]">
                      Input {'->'} Flow
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-[var(--app-border)] bg-[rgba(255,255,255,0.06)] p-4 md:p-5">
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.04)] px-4 py-3">
                      <div className="app-kicker mb-2">Input</div>
                      <div className="font-mono text-sm leading-7 text-[var(--app-text)]">
                        &gt; 将需求整理为结构清楚、可复用、可继续扩展的流程
                        <span className="hero-cursor ml-1 inline-block h-[1.05em] w-2 align-[-0.18em]" />
                      </div>
                    </div>

                    <div className="relative mt-5 overflow-hidden rounded-[22px] border border-[var(--app-border)] bg-[rgba(109,204,255,0.05)] p-4 md:p-5">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 hidden md:block"
                      >
                        <div className="absolute inset-0 bg-[linear-gradient(var(--app-grid)_1px,transparent_1px),linear-gradient(90deg,var(--app-grid)_1px,transparent_1px)] bg-[size:20px_20px] opacity-45" />
                        <div className="micro-flow-sweep absolute inset-y-4 left-[18%] w-[18%] rounded-full bg-[linear-gradient(90deg,transparent,rgba(109,204,255,0.2),transparent)] blur-md" />
                      </div>

                      <div className="relative z-10">
                        <div className="app-kicker mb-4">Flow</div>
                        <div className="grid gap-3 md:grid-cols-[0.9fr_1fr_1fr_0.9fr]">
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.36)] p-4 backdrop-blur-sm">
                            <div className="app-kicker mb-2">01 Stage</div>
                            <div className="app-section-title text-base">目标理解</div>
                            <p className="app-muted mt-2 text-xs leading-6">识别任务边界与关键约束</p>
                            <div className="mt-4 h-1.5 w-14 rounded-full bg-[rgba(109,204,255,0.22)]" />
                          </div>
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.28)] p-4 backdrop-blur-sm md:translate-y-5">
                            <div className="app-kicker mb-2">02 Stage</div>
                            <div className="app-section-title text-base">阶段组织</div>
                            <p className="app-muted mt-2 text-xs leading-6">拆分执行阶段与依赖关系</p>
                            <div className="mt-4 flex gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-[var(--app-accent)]" />
                              <span className="h-2.5 w-8 rounded-full bg-[rgba(109,204,255,0.18)]" />
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.28)] p-4 backdrop-blur-sm">
                            <div className="app-kicker mb-2">03 Stage</div>
                            <div className="app-section-title text-base">节点连接</div>
                            <p className="app-muted mt-2 text-xs leading-6">组织处理单元与数据路径</p>
                            <div className="mt-4 flex items-center gap-2">
                              <span className="h-px flex-1 bg-[rgba(109,204,255,0.28)]" />
                              <span className="h-2.5 w-2.5 rounded-full border border-[var(--app-border-strong)]" />
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.38)] p-4 backdrop-blur-sm md:translate-y-5">
                            <div className="app-kicker mb-2">04 Result</div>
                            <div className="app-section-title text-base">Flow</div>
                            <p className="app-muted mt-2 text-xs leading-6">得到抽象、可执行、可复用的结构</p>
                            <div className="mt-4 h-1.5 w-16 rounded-full bg-[rgba(109,204,255,0.24)]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="app-card-soft flex flex-col gap-5 p-6 md:p-7">
              <div>
                <div className="app-kicker mb-2">Flow traits</div>
                <h2 className="app-section-title text-3xl">特点</h2>
              </div>
              <div className="space-y-4">
                {flowHighlights.map((item, index) => (
                  <div key={item.title} className="rounded-3xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="app-kicker mb-2">{String(index + 1).padStart(2, '0')}</div>
                    <h3 className="app-section-title text-lg">{item.title}</h3>
                    <p className="app-muted mt-2 text-sm leading-7">{item.description}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="app-card mt-8 p-7 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <div className="app-kicker mb-3">Capability views</div>
              <h2 className="app-section-title text-3xl md:text-4xl">Flow / Agent / 串联</h2>
              <div className="mt-6 flex flex-wrap gap-2">
                {(['flow', 'agent', 'relation'] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setCapabilityView(key)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      capabilityView === key
                        ? 'border-[var(--app-border-strong)] bg-[var(--app-accent-soft)] text-[var(--app-text)]'
                        : 'border-[var(--app-border)] text-[var(--app-text-soft)] hover:bg-[rgba(255,255,255,0.04)]'
                    }`}
                  >
                    <span className="app-section-title text-lg">
                      {key === 'flow' ? 'Flow' : key === 'agent' ? 'Agent' : 'Flow x Agent'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="app-card-soft p-6 md:p-7">
                <div key={capabilityView} className="capability-fade">
                  <div className="app-kicker mb-3">{activeCapability.kicker}</div>
                  <h3 className="app-section-title text-3xl md:text-4xl">{activeCapability.title}</h3>
                  <p className="app-muted mt-4 text-sm leading-8 md:text-base">
                    {activeCapability.description}
                  </p>
                </div>
              </div>
              <div key={`${capabilityView}-points`} className="capability-fade mt-5 grid gap-3 md:grid-cols-3">
                {activeCapability.points.map((item, index) => (
                  <div key={item} className="rounded-2xl border border-[var(--app-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="app-kicker mb-2">{String(index + 1).padStart(2, '0')}</div>
                    <p className="text-sm leading-7 text-[var(--app-text)]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="app-card mt-8 p-7 md:p-12">
          <div className="max-w-3xl">
            <div className="app-kicker mb-3">System diagram</div>
            <h2 className="app-section-title text-3xl md:text-5xl">流程示意图</h2>
            <p className="app-muted mt-4 text-sm leading-8 md:text-base">
              从流程编排到能力调用，结构并不会中断，而是持续沉淀、封装并进入新的执行场景。
            </p>
          </div>

          <div className="relative mt-10 rounded-[32px] border border-[var(--app-border)] bg-[rgba(255,255,255,0.03)] p-6 md:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 hidden lg:block"
            >
              <div className="absolute left-[12%] top-[38%] h-px w-[17%] bg-gradient-to-r from-transparent via-[var(--app-accent)] to-transparent opacity-75" />
              <div className="absolute left-[35%] top-[38%] h-px w-[17%] bg-gradient-to-r from-transparent via-[var(--app-accent)] to-transparent opacity-75" />
              <div className="absolute left-[58%] top-[38%] h-px w-[16%] bg-gradient-to-r from-transparent via-[var(--app-accent)] to-transparent opacity-75" />
              <div className="absolute left-[75%] top-[38%] text-[var(--app-accent)]">
                <ArrowRight size={14} />
              </div>
              <div className="absolute left-[52%] top-[38%] text-[var(--app-accent)]">
                <ArrowRight size={14} />
              </div>
              <div className="absolute left-[29%] top-[38%] text-[var(--app-accent)]">
                <ArrowRight size={14} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-4 lg:items-start">
              {loopSteps.map((step, index) => {
                const Icon = step.icon

                return (
                  <div key={step.title} className="relative">
                    <div className="app-card-soft relative h-full p-5 md:p-6">
                      <div className="mb-5 flex items-center justify-between">
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-3 text-[var(--app-accent)]">
                          <Icon size={20} />
                        </div>
                        <span className="app-kicker">{step.code}</span>
                      </div>
                      <h3 className="app-section-title text-xl">{step.title}</h3>
                      <p className="app-muted mt-3 text-sm leading-7">{step.description}</p>
                    </div>
                    {index < loopSteps.length - 1 && (
                      <div className="mt-3 flex items-center justify-center gap-2 text-[var(--app-text-soft)] lg:hidden">
                        <span className="text-xs">{index === 2 ? '进入调用' : '进入下一阶段'}</span>
                        <ArrowRight size={14} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

          </div>
        </section>

        <section className="mt-10 pb-10 text-center">
          <button
            onClick={() => setStage('entry')}
            className="group inline-flex flex-col items-center gap-3 rounded-full border border-[var(--app-border-strong)] bg-[rgba(255,255,255,0.03)] px-8 py-6 transition hover:-translate-y-1 hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
          >
            <span className="app-kicker">Start trial</span>
            <span className="app-section-title text-2xl">开始试用</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--app-border)] bg-[rgba(109,204,255,0.1)] text-[var(--app-accent)] transition group-hover:translate-y-1">
              <ArrowDown size={18} />
            </span>
          </button>
        </section>
      </main>
    </div>
  )
}
