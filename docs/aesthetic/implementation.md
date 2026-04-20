# 实现索引

这套视觉语言在代码里的落点。只列索引，不贴代码。

## 单一来源

- CSS 变量、动画关键帧、组件类 → `frontend/src/index.css`
- 主题控制 → `frontend/src/components/ui/theme.tsx`（单一 `paper` 主题，保留上下文接口以兼容历史调用点）
- 主题切换 UI → `frontend/src/components/ui/ThemeToggle.tsx`（已占位为 `null`）

新视觉规范不在组件内部 inline 定义；先在 `index.css` 的对应区块里落 token 与类，再在组件里引用。

## CSS 变量地图

`index.css` `@layer base :root` 块：

| 类别           | 变量前缀                                   |
| -------------- | ------------------------------------------ |
| 纸系           | `--paper / --paper-warm / --paper-deep`    |
| 卡纸           | `--card / --card-soft`                     |
| 墨系           | `--ink / --ink-mid / --ink-soft / --ink-faint` |
| 纤维线         | `--line / --line-soft / --line-strong`     |
| 情绪色         | `--rust / --moss / --gold / --bruise` + 对应 soft / ink 变体 |
| 兼容别名       | `--app-*`（映射到上面四类，保证历史 Tailwind 类不破）|
| 动效缓动       | `--ease / --ease-ink`                      |

**兼容别名（`--app-*`）只读**——它们把旧代码里的 `--app-accent / --app-panel / --app-shadow` 重定向到新 token。不要再新增 `--app-*` 变量，新增请直接用新 token。

## 关键帧 → 语义 → 工具类

| 关键帧               | 语义                 | 工具类                              |
| -------------------- | -------------------- | ----------------------------------- |
| `ink-bleed`          | 墨渗                 | `.anim-ink`                         |
| `thread-draw`        | 织线绘制             | 直接作用于 SVG 的 `stroke-dashoffset` |
| `letterpress`        | 活字                 | `.anim-press > span`                |
| `stamp-land`         | 印章落位             | `.anim-stamp`                       |
| `stamp-land-tilted`  | 印章（带斜角终态）   | `.anim-stamp-tilted`                |
| `ink-pulse`          | 运行中的光环脉冲     | `.editor-port.is-target-ok` / `.block-stamp.is-running` 等 |
| `ink-pulse-card`     | 运行中的 block 卡片  | `.editor-block.is-running`          |
| `running-thread`     | 纸面低频呼吸         | `.running-thread` / topbar、toolbar 下缘 |
| `panel-slide-in`     | 抽屉 / 下拉入场      | 直接 `animation:` 或组件级复用      |
| `loom-land`          | 列表项落卷           | 通过 JSX `animationDelay` 错位      |

滚动触发（reveal）不走 CSS animation，走 `opacity + transform` 的 `transition` + `IntersectionObserver` 加 `.in`。实现细节见 `HomePage.tsx` 的 `useReveal`。

## 组件级样式索引

一张速查表：需要调整某类元素时，先去 `index.css` 对应段落改 token / 类，再去引用处替换。

| 元素角色           | CSS 类（`index.css` 内）                   | 典型使用位置                                        |
| ------------------ | ------------------------------------------ | --------------------------------------------------- |
| 外层壳             | `.app-shell`                               | `HomePage`、其他主页面的最外层                      |
| 顶栏               | `.app-topbar` / `.app-topbar-inner`        | `App.tsx` 顶部 header                               |
| 品牌字             | `.app-brand-mark` / `.app-brand-link`      | 顶栏 logo 文字                                      |
| 章节前缀           | `.app-kicker` / `.app-kicker.no-rule`      | 所有 section 开头的 mono 小字                       |
| 章节标题           | `.app-section-title`                       | 配合 `<em>` 做笔触压痕                              |
| 一级卡片           | `.app-card` / `.stitched`                  | overview 右侧 aside、弹窗主体                       |
| 二级卡片           | `.app-card-soft`                           | 入口按钮、workflow / agent 列表项                   |
| 面板底             | `.app-panel`                               | RunPanel、配置面板骨架                              |
| 按钮               | `.app-button` + `-primary / -secondary / -ghost / -danger` | 所有 CTA                     |
| 胶囊标签           | `.app-pill`                                | Beta 标、状态标                                     |
| 表单输入           | `.app-input` / `.input-field`              | 所有文本输入                                        |
| 品牌印章           | `.brand-seal`                              | 顶栏 logo 圆章                                      |
| 用户印章           | `.user-seal`                               | UserMenu 顶端                                       |
| 角标印章           | `.stamp-corner`                            | 卡片右上角"NEW / BETA"之类                          |
| 画布壳             | `.editor-shell`                            | 流程编辑器最外层                                    |
| 工具栏 / 运行条    | `.editor-toolbar` / `.editor-runbar`       | 配合 `running-thread` 装饰线                        |
| 列                 | `.editor-column` / `.editor-column-header` | Canvas 内的 stage 列                                |
| 块                 | `.editor-block` + `.is-selected / .is-running / .is-done / .is-error / .is-plugin` | Block.tsx |
| 端口               | `.editor-port` + `.in / .out / .is-target-ok / .is-target-disabled / .is-source-active` | Block.tsx |
| 类型标签           | `.block-tag` + `.is-in / .is-ai / .is-out / .is-plugin` | block 顶端类型标 |
| 状态印             | `.block-stamp` + `.is-running / .is-done / .is-error / .is-added / .is-modified` | block 下缘状态章 |

## 典型场景映射

| 想做的事                               | 该找的文件                                                              |
| -------------------------------------- | ----------------------------------------------------------------------- |
| 新增一种情绪色                         | `index.css` `@layer base :root`，并在 [paper-and-ink.md](./paper-and-ink.md) §1 加一行 |
| 新增一种动效                           | `index.css` 关键帧区 + 工具类区，并在 [motion.md](./motion.md) 补一节   |
| 新建一个列表页（workflow / agent 类）  | 参考 `WorkflowListPage.tsx` / `AgentListPage.tsx`：卡片走 `.app-card-soft`、入场用 `loom-land` 错位 |
| 新建一个配置面板（右侧）               | 参考 `BlockConfigPanel.tsx`：骨架 `.app-panel`、子区块 `.app-card-soft`、入场 `panel-slide-in` |
| 新建一个弹窗                           | 参考 `SkillEditor.tsx`：背景 `rgba(30,20,15,0.5)`、窗体 `.app-card` + `panel-slide-in`、头部圆章 |
| 新增一个需要"被确认"语义的徽章         | 复用 `.block-stamp` 或 `.stamp-corner`；情绪色从 rust / moss / bruise 里选 |

## 检查清单（Code Review 用）

在合入视觉改动前逐条核对：

- [ ] 没有使用 `#000` / `#fff` / `rgb(0,0,0)` / `rgb(255,255,255)`。
- [ ] 没有 `rounded-full`（除 `user-seal` / `brand-seal` / 端口 / 圆形头像）。其余一律 `rounded-sm`。
- [ ] 没有 `rgba(109,204,255,*)` 这类历史蓝色遗留；accent 一律走 `--rust` 系或 `--app-accent` 别名。
- [ ] 没有 `text-gray-*` / `bg-sky-*` / `text-purple-*` 这类 Tailwind 预设色；颜色一律走 CSS 变量或已有语义类。
- [ ] 一次性入场动画使用 `forwards` 且 100% 关键帧显式写明 opacity / transform。
- [ ] 没有在同一视觉层级里并列出现两种以上情绪色。
- [ ] 尊重 `prefers-reduced-motion`。新动画不绕开 `index.css` 末尾的 media query。
