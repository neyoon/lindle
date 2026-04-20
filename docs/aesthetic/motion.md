# 动效语法

Paper & Ink 的动效不是视觉润色，是**语义动词**。
一个动效代表一件事，同一件事永远只用同一个动效。

## 基本规则

- **动效只标记"发生"。** 元素稳态之后不得自带持续动画（持续脉冲是状态表达的例外，见 §5、§6）。
- **动效必须保留终态。** 所有一次性入场动画使用 `animation-fill-mode: forwards`，且关键帧的 100% 必须显式写明最终视觉属性（opacity、transform、filter），否则会被浏览器合成回初始值，元素在动画结束后"消失"。
- **动效时长稳定。** 基础时长 0.6–1.1s，缓动全部使用 `--ease-ink` 或 `--ease`，禁止自定义 cubic-bezier。
- **遵守 `prefers-reduced-motion`。** 全局 media query 已在 `index.css` 末尾把所有动画与过渡置为 `none`；新增动效不得绕过这条规则。

## 六种基础动效

六个关键帧 + 六个工具类，全部在 `frontend/src/index.css`。

### 1. 墨渗（ink-bleed） — `.anim-ink`

**语义**：一段静态内容"渗进"视野。类似墨滴落到纸上逐渐扩散收清。
**视觉**：opacity 0 → 1，模糊 8px → 0，letter-spacing 0.06em → normal，微微上移 6px → 0。
**用途**：kicker、副标题、正文段落的首次出现。
**不要用于**：会频繁刷新的动态内容；标题（改用活字）。

### 2. 织线绘制（thread-draw） — SVG `stroke-dashoffset`

**语义**：一根线被"绘出来"。
**视觉**：SVG path 的 stroke 从一端滑开，终点通常伴随一个 `knot-in` 旋转小结。
**用途**：卡片顶部的装饰横线、block 之间的连接线首次出现、"编织" timeline 中的主线。
**实现要点**：在 path 上预设 `stroke-dasharray` 与等值的 `stroke-dashoffset`，动画把 offset 推到 0。

### 3. 活字排印（letterpress） — `.anim-press > span`

**语义**：标题被"压印"到纸上。逐字落位，最能表达 Loom & Spindle 的节奏。
**视觉**：每个字 `translateY(-18px) rotate(-3deg) blur(3px)` 起手，55% 先过冲到轻微下沉，100% 回正。
**用途**：大标题（hero、section 主标题）。单字之间的 delay 建议 0.05–0.08s。
**注意**：因为基础样式 `opacity: 0`，**100% 关键帧必须显式写 `opacity: 1`**，否则 `forwards` 会把元素合成回透明。

### 4. 印章盖下（stamp-land） — `.anim-stamp` / `.anim-stamp-tilted`

**语义**：一件事"被盖章确认"。
**视觉**：从 1.8 倍放大 + 10° 倾斜 + 4px 模糊"砸"下来，55% 过冲到 0.94 倍 + 2° 微斜，100% 回正。
**用途**：品牌印（`brand-seal`）、用户印（`user-seal`）、运行状态徽章（`block-stamp`）、AI diff 标签（新增 / 修改）。
**带倾斜变体**：`stamp-land-tilted` 终态保留 2° 斜角，用在需要"手盖"感觉的地方。

### 5. 滚动揭示（scroll-reveal） — `.reveal` / `.reveal.stagger`

**语义**："这一节刚刚被看到"。
**视觉**：`opacity: 0; translateY(24px)` 在 `IntersectionObserver` 触发后加 `.in` 类，transition 到稳态。
**用途**：每一个 section 的入场、卡片列表的错位入场（`stagger` 里的子元素自动按 nth-child 递延 0.12s）。
**实现**：见 `HomePage.tsx` 里的 `useReveal` hook；触发后立刻 `unobserve`，不做反向。

### 6. 流织（running-thread） — `.running-thread`

**语义**：纸本身在"织"，永恒的、低频的、背景级的。
**视觉**：`background-position` 从 0 移到 14px 无限循环（周期 2.4s 或更慢）。
**用途**：topbar 底线、editor-toolbar 下缘、editor-runbar 上缘。**绝不**用于内容卡片边缘或按钮 hover。

## 状态脉冲（ink-pulse / ink-pulse-card）

严格意义上不算"动效"而是"状态表达"：它会一直跑直到状态改变。

- `ink-pulse` —— 用在小元素（接口端口、`.block-stamp.is-running`），以 `box-shadow` 环形扩散。
- `ink-pulse-card` —— 用在运行中的 block 卡片外缘，节奏和 `ink-pulse` 相同但保留了 `0 2px 0 --rust-soft` 的"厚度"阴影。

只在 `is-running` 状态上出现。`is-done / is-error` 立刻停。

## 面板进入（panel-slide-in）

右侧抽屉、下拉菜单、临时面板的入场。`translateX(24px) → 0` + fade-in。
**不用于**正文卡片。正文卡片的入场走 [5] 或 `loom-land`。

## 落卷（loom-land）

列表项（workflow、agent、skill 卡片）的逐一入场。`translateY(18px) rotate(1.5deg) scale(0.97) → 0/0/1`。
在 JSX 里通过 `animation-delay: Math.min(0.08 * index, 0.6)s` 实现错位。

## 编织演示（weave-demo）

首页 Chapter III 的 `WeaveDemo` 是一个**复合动效的教学实例**，它不是新增语法，而是把已有六种动效按"编排 → 织线 → 运行 → 收敛"的语义次序组合起来：

| 时刻 | 动效 | 对应的产品动作 |
| ---- | ---- | ---- |
| 0.2s | ink-bleed | 三个 Stage 表头渗出 |
| 1.0 / 1.5 / 2.0s | stamp-land | 三个 block 被盖下 |
| 2.5 / 3.0s | thread-draw | 两段连线被织出 |
| 3.9 / 4.5 / 5.1s | border 过渡 + stamp-land-tilted + ink-pulse | block 依次 running |
| 5.7s | border 过渡（moss） | 全部 done |
| 5.9s | ink-bleed | "重播" 按钮出现 |

实现要点：
- 进入视口才开始（`IntersectionObserver(threshold=0.25)`），不抢注意力；
- "重播"通过 React `key` 强制重挂，所有 CSS 动画从头播；
- block 状态切换**不重写 animation**，只切换 border / shadow，借助 transition 平滑过渡；因此状态徽章（`weave-block-stamp`）用 `key={state}` 使其在 running → done 之间重挂，重新触发 `stamp-land-tilted`。

## 动效的"不要"

- 不要给按钮做入场动画。按钮是随时可点击的工具，动画让它看起来不稳定。
- 不要给 hover 做 Y 轴弹跳。卡片 hover 允许 `translateY(-2–3px)`，但不要超过 4px、不要叠加旋转。
- 不要让持续性动画（running-thread / ink-pulse）在内容视觉中心出现。它们永远是"边上的、底层的"。
- 不要连续使用 6 种动效在同一屏。一屏最多 3 种并存。
