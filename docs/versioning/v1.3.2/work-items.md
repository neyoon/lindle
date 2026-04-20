# 版本 1.3.2 工作项

## 背景

1.3.1 末尾完成了：

- 顶栏 UserMenu 下线，改为"设置 / Provider"下拉入口
- 齿轮动效（stamp-land + 悬浮自转 + 展开持续自转）
- SettingsPage 按 `section: 'general' | 'provider'` 拆页
- 新增本地偏好 `AppPreferences`（localStorage）
- Flow 工具栏移除"失败即停"即时切换，store 去掉 `setStopOnError`
- 首页叙事从"纺织"改为"搭积木"，替换了所有用户可见文案
- v1.4 work-items 补第 7 条"总体设置与本地偏好"

下面这些是当时没有一次做完、留到 1.3.2 收的事情。

## 本次范围

- 叙事代码层清理
- 首页章节编号与 kicker 风格统一
- 本地偏好接入与占位边界明确
- 设置入口的路径 / 动效回归
- 残留 user 概念清理

## 本次原则

- 仍然不扩大产品边界
- 不做破坏性重命名（类名 / 动画名尽量向后兼容或一次性收干净，不留半桶水）
- 先让默认路径看起来一致，再考虑资产层的彻底重做

## 准备修改

### 1. 搭积木叙事 — 代码层清理

目前用户可见文案已经全部统一，但代码层还在用纺织命名。读代码的人会看到类名、组件名、文件名还是 `weave / loom / thread / knot`，和界面文案不对齐。

待收尾：

- CSS 类名批量改名
  - `.weave-demo` / `.weave-stage` / `.weave-row` / `.weave-headers` / `.weave-col-header` / `.weave-kicker` / `.weave-spacer` / `.weave-bodies` / `.weave-block` / `.weave-block-name` / `.weave-block-stamp` / `.weave-thread` / `.weave-footer` / `.weave-status` / `.weave-replay`
  - 统一改为 `.stack-*` 前缀
- 连接线相关类名
  - `.loom-thread` → `.connector-line`
  - `.loom-knot` → `.joint-mark`
  - `.running-thread` → `.running-line`
- 动画 keyframes
  - `@keyframes thread-draw` → `@keyframes line-draw`（或保留，只在注释里说明语义）
  - `@keyframes knot-in` → `@keyframes joint-in`
  - `@keyframes loom-land` → `@keyframes piece-land`
  - `@keyframes running-thread` → `@keyframes running-line`
  - 动画类 `.anim-loom` → `.anim-piece`
- 组件与文件
  - `frontend/src/components/home/WeaveDemo.tsx` → `StackDemo.tsx`
  - `export function WeaveDemo` → `export function StackDemo`
  - HomePage.tsx 里的 `import { WeaveDemo }` 同步更新
- 品牌资产
  - 游离 SVG `frontend/src/assets/logos/lindle-mark-spindle.svg` 目前没被引用，决定是否删除或重命名
  - `BrandMark.tsx` 的 SVG 本体是纺锤造型，如果要彻底对齐叙事，需要设计侧重画为"两块咬合件 + 一道连接线"；这一项需要产品/设计确认后再执行
- 涉及文件需要一起改
  - `HomePage.tsx`
  - `home/WeaveDemo.tsx`
  - `AgentListPage.tsx`（用到 `loom-land`）
  - `WorkflowListPage.tsx`（用到 `loom-land`）
  - `index.css`（集中定义这些类名）

建议分两步走：

1. 类名 / 动画名一次性批量改，同时更新所有使用点
2. 品牌资产是否重做单独决定，不强行在 1.3.2 内完成

### 2. 首页章节编号与 kicker 风格统一

目前 OverviewView 已经有：

- Chapter I · Blocks & Joints
- Chapter II · Two Ends
- Chapter III · One Stack
- Chapter IV · Continuous Loop

而 EntryView 里 kicker 仍然是 `Chapter IV · Entry`，和 Overview 的 Chapter IV 撞号。

待修正：

- EntryView 的 kicker 改为 `Chapter V · Entry`，或干脆改为非章节体（例如 `Workbench · Entry`），和其他功能页的 kicker 口吻一致
- 顺便检查各功能页 kicker 的英文副标，保持 `Domain / short phrase` 的统一格式
  - 目前：
    - `Flow center / factory-ready workflows`（WorkflowListPage）
    - `Plugins / extend the block system`（PluginsPage）
    - `Manufacture / reusable blocks`（ManufacturePage）
    - `Skill library / agent capability layer`（SkillLibraryPage）
    - `Settings / general preferences`（SettingsPage, general）
    - `Settings / model providers`（SettingsPage, provider）
  - 保持一致的小写、slash 分隔、对仗短语结构

### 3. 本地偏好接入与占位边界

`AppPreferences` 目前有 5 个字段，其中只有 `defaultStopOnError` 真正被引用（新建 Flow 时），其它 4 个只是 UI 开关。

待决定与执行：

- `language: 'zh-CN' | 'en-US'`
  - 本版本不做真正的 i18n 渲染（推到 1.4+）
  - 但要在设置页明确标记"暂未生效，先记录偏好"
- `displayMode: 'paper' | 'compact' | 'focus'`
  - 决定是否在 1.3.2 至少接通 `compact`（例如影响列表页的密度）
  - 如果不接通，则同样在 UI 上标注为"占位"
- `showAdvancedOptions`
  - 决定 1.3.2 里哪些地方优先接入（候选：Block 配置面板里的"绑定 / 模板 / 诊断"分组；Flow 工具栏里的某些次级按钮）
  - 接入后要保证默认值（false）下界面更轻
- `customMode`
  - 短期内不会有具体能力挂进去，明确为占位
  - 考虑是否在 1.3.2 直接从 UI 移除（保留 storage 字段即可，等真的有能力再显示）

目标：偏好要么真影响界面，要么在界面上不让用户误以为它起作用。

### 4. 设置入口路径与动效回归

1.3.1 做了下拉 + 齿轮动效 + section 路由，需要系统走一轮：

- 首次启动（API Key 未配置）→ 自动跳到 Provider 页的路径是否顺畅
  - 当前行为：直接进入 settings-provider，顶栏仍能切回 general
  - 确认回退目标是 `home-entry`，而不是 `home-overview`
- 在 Flow 编辑器里打开设置（general / provider），再返回，是否能正确回到 Flow 编辑器
- 齿轮动效
  - 桌面端 hover 离开后是否完全回位
  - 移动端点击打开时，没有 hover 的设备上动效表现是否合理
  - `prefers-reduced-motion: reduce` 下齿轮和下拉面板是否确实安静下来（目前有全局 `animation: none !important`，要确认没有被内联 style 覆盖）
- 下拉菜单的 a11y
  - `aria-haspopup / aria-expanded / role="menu"` 已经加了
  - 补充 ESC 关闭与键盘焦点回到触发按钮的行为

### 5. 残留 user 概念清理

1.3.1 删除了 `frontend/src/components/UserMenu.tsx` 和 `frontend/src/types/user.ts`，并替换 `LOCAL_USER` 常量。但需要再扫一遍：

- 前端
  - 是否还有 import `./types/user` 或 `UserMenu` 的残留
  - 是否还有 `user_id / username / role` 字段被 props 传递但已经不再使用
- 后端
  - API 响应里是否还带 user 相关字段（grep `user_id` / `username` / `role` / `User` 类）
  - 如果有，决定：要么保留但不用，要么直接从响应中移除
- 文档
  - 排除早期版本文档里的设计决策，不需要改；但如果 README 或主目录文档还在说"本地工作区用户"，需要更新

### 6. 回归 smoke test

1.3.2 结束前跑一遍主路径：

- 首次启动 → 进入 Provider → 配置 Key → 返回首页
- 从首页 → 进入 Flow 列表 → 新建 Flow（验证 `defaultStopOnError` 生效）
- 从 Flow 编辑器 → 打开设置（general / provider） → 返回
- 从 Agent 列表 → 打开设置 → 返回
- 切换 `showAdvancedOptions` → 界面变化符合预期（接入之后）
- `prefers-reduced-motion` 打开 → 齿轮 / 下拉 / stamp-land 全部停止
- `npm run build` 通过，无 lint 错误

## 建议验收清单

1. 全仓搜 `weave / loom / spindle / thread / knot`（排除品牌资产），只剩下有注释说明"历史命名，语义为搭积木"的存量，或干脆全部改完
2. 首页 Overview 与 Entry 的章节编号不再撞车
3. 功能页 kicker 英文副标保持 `Domain / short phrase` 的对仗结构
4. 设置页里每一项开关都对应真实生效的行为，否则标注为占位
5. 前后端都不再出现未使用的 user 相关字段
6. smoke test 单走一遍后，重点 3-5 条路径全部通过

## 与 1.4 的边界

不放进 1.3.2 的事项：

- 真正的 i18n 渲染（`language` 字段接入）
- `displayMode` 的完整三档实现
- Flow 测试计划 / 测试用例 / AI 裁决（属于 1.4）
- 品牌 logo 的视觉重做（需要设计侧决策）

这些会回到 1.4 或 deferred-work.md。

## 备注 — 1.3.1 已经落地的部分（作为上下文）

- 顶栏设置入口：`frontend/src/components/SettingsEntry.tsx`
- 拆页后的设置页：`frontend/src/components/SettingsPage.tsx`（`section: 'general' | 'provider'`）
- 本地偏好存储：`frontend/src/utils/preferences.ts`
- Flow 工具栏去掉失败即停：`frontend/src/components/pipeline/Toolbar.tsx`
- store 移除 `setStopOnError`：`frontend/src/stores/workflow.ts`
- 齿轮 / 下拉动效：`frontend/src/index.css` 末尾 Settings entry 区块
- 叙事文案统一："搭积木"相关替换集中在 `HomePage.tsx` / `home/WeaveDemo.tsx` / `ConnectionLines.tsx` / `BrandMark.tsx` / `index.css` 头注释
