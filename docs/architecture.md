# Tweak 架构设计

## 概述

Tweak 是一个可视化 AI 工作流编排平台，核心目标是让 AI 能力的组合和调用变得简单直观。

## 核心概念

### Tool

Tool 是 Tweak 中一切可执行能力的统一抽象。不论来源，所有能力最终都以 Tool 的形式被 Agent 调用。

**Tool 的来源：**
- **Flow**：通过可视化编辑器构建的工作流。保存后自动生成 Tool 定义（name、description、input_schema、output_schema）。Flow 本质上就是一种 Tool，只不过它有独立的可视化编辑器和独立执行入口。
- **内置 Skill**：代码实现的独立能力模块（如 `workflow_designer`）。

### Flow

Flow 是可视化编排的工作流，由分栏式的 Block 组成。

**双重身份：**
1. **作为独立流程**：用户可以在 Flow 编辑器中直接运行它
2. **作为 Tool**：被 Agent 通过 Skill 调用

Flow 保存时，系统根据其 Input Block 和 Output Block 自动提取 input_schema / output_schema，形成完整的 Tool 定义。

### Skill

Skill 是 Agent 的能力单元，有两种模式：

#### 1. 管理型 Skill（示例：`workflow_executor`）

管理多个 Tool/Flow 的容器。用户在 Agent 编辑器中添加该 Skill 后，还需要配置它管理哪些 Flow。每个被管理的 Flow 会被注册为一个独立的 function calling tool。

```
workflow_executor (管理型 Skill)
  ├── 翻译 Flow      → tool: workflow_executor(workflow_id="wf_1", inputs={...})
  ├── 数据分析 Flow   → tool: workflow_executor(workflow_id="wf_2", inputs={...})
  └── 摘要 Flow       → tool: workflow_executor(workflow_id="wf_3", inputs={...})
```

适用场景：需要统一管理和调度多个 Flow 的场景。

#### 2. 独立型 Skill（示例：`workflow_designer`）

本身就是一个完整的 Tool，不管理其他东西。有自己的 input_schema / output_schema，添加到 Agent 后直接可用。

```
workflow_designer (独立型 Skill)
  → tool: workflow_designer(instruction="创建一个翻译流程")
```

适用场景：单一功能、自包含的能力模块。

### Plugin

Plugin 是 Flow 内部的一种 Block 类型（PluginBlock），在 Flow 编辑器中使用。Plugin 需要在插件管理页面手动启用。Plugin 和 Skill 的区别：

| | Plugin | Skill |
|---|---|---|
| 使用场景 | Flow 内部的 Block | Agent 的 Tool |
| 启用方式 | 插件管理页面手动启用 | 添加到 Agent 即可用 |
| 执行者 | Flow Engine | Agent Engine |

### Agent

Agent 是面向对话的智能助手，通过 function calling 调用 Skill 完成任务。

```
Agent
  ├── system_prompt: 系统提示词
  ├── model_provider_id: LLM Provider
  └── skills: [Skill, ...]
        ├── workflow_executor (管理型) → 管理多个 Flow
        ├── workflow_designer (独立型) → 直接可用
        └── ... 其他 Skill
```

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                               │
│  React + TypeScript + Zustand                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Flow 编辑器   │  │ Agent 编辑器  │  │ 设置/插件    │     │
│  │ (可视化画布)  │  │ (对话+Skill) │  │ (Provider)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP/SSE
┌─────────────────────────────────────────────────────────────┐
│                         API 层                               │
│  FastAPI                                                     │
│  /api/workflows    Flow CRUD                                │
│  /api/run          Flow 执行（同步/SSE）                    │
│  /api/agents       Agent CRUD + 对话                        │
│  /api/plugins      Plugin 管理                               │
│  /api/settings     LLM Provider                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                       引擎层                                 │
│                                                              │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │  Flow Engine     │        │  Agent Engine     │          │
│  │                  │◄───────│                   │          │
│  │  栏间串行        │  调用   │  对话管理         │          │
│  │  栏内并行        │  Flow   │  Function Calling │          │
│  │  数据流管理      │  执行   │  多轮工具调用     │          │
│  │  错误处理        │        │  Skill 调度       │          │
│  └──────────────────┘        └──────────────────┘          │
│           │                           │                      │
│           ▼                           ▼                      │
│  ┌──────────────────────────────────────────────┐          │
│  │              统一 Tool 层                      │          │
│  │                                                │          │
│  │  ┌─────────┐  ┌───────────────┐  ┌────────┐ │          │
│  │  │ Flow    │  │ 管理型 Skill  │  │独立型  │ │          │
│  │  │ (可视化 │  │ (executor)    │  │ Skill  │ │          │
│  │  │  编排)  │  │ 管理多个 Flow │  │(直接用)│ │          │
│  │  └─────────┘  └───────────────┘  └────────┘ │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                       基础设施层                             │
│                                                              │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │   LLM 调用层     │        │   文件存储        │          │
│  │  OpenAI 兼容 API │        │  JSON 文件        │          │
│  │  多 Provider     │        │  单用户场景       │          │
│  │  Function Call   │        │                   │          │
│  └──────────────────┘        └──────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## 核心流程

### Flow 执行流程

```
用户输入 → InputBlock
  ↓
Column 1: [Block A, Block B] (并行)
  ↓ 数据自动流向下一栏
Column 2: [AIBlock] (调用 LLM)
  ↓
Column 3: [OutputBlock]
  ↓
输出结果
```

**数据流规则：**
- 默认自动传递：下一栏自动接收上一栏全部输出
- 手动连线：通过 `connections` 精确指定来源
- 模板变量：`{{块名}}` `{{块名.key}}` `{{input.字段}}` 语法

### Agent 对话流程（Function Calling）

```
用户消息
  ↓
构建消息 + 可用 tools 列表
  ↓
调用 LLM ──→ 普通回复 → 返回给用户
  │
  └─ tool_calls → 执行 Tool
                    ↓
                  注入结果到对话
                    ↓
                  再次调用 LLM（最多 5 轮）
                    ↓
                  最终回复 → 返回给用户
```

**工具调用过程对用户可见：**
- tool_call 消息（调用了什么、参数是什么）
- tool_result 消息（返回了什么结果）
- JSON 格式化展示，超长内容可折叠/展开
- 用户可随时打断

### Flow 保存 → Tool 注册

```
用户在 Flow 编辑器中保存
  ↓
系统提取 Input Block 的 fields → input_schema
系统提取 Output Block / 最后一栏的信息 → output_schema
  ↓
生成 Tool 定义:
  name: Flow 名称
  description: Flow 描述
  input_schema: { text: "要翻译的文本", target_language: "目标语言" }
  output_schema: { result: "翻译结果" }
  ↓
Agent 的 workflow_executor Skill 可以选择管理该 Flow
  ↓
Agent 对话时，LLM 看到该 Flow 的 Tool 定义，可以调用
```

## 数据模型

### Flow

```
Workflow
  ├── id, name, description
  ├── stop_on_error: bool
  └── columns: Column[]
        ├── order: 执行顺序
        ├── repeat: 重复次数
        └── blocks: Block[]
              ├── type: input | ai | output | plugin
              ├── config: { prompt, model, fields, plugin_id }
              ├── connections: Connection[]
              └── output_schema: OutputSchema
```

### Agent

```
Agent
  ├── id, name, description
  ├── system_prompt: str
  ├── model_provider_id: str
  └── skills: AgentSkill[]
        ├── skill_id: str (对应 Plugin ID)
        ├── order: int
        └── config: dict (Skill 配置，如管理的 Flow IDs)
```

### Skill / Plugin

```
BasePlugin
  ├── meta: PluginMeta
  │     ├── id, name, description, icon
  │     ├── category: "plugin" | "skill"
  │     ├── input_schema: dict (JSON Schema)
  │     └── output_schema: dict
  └── execute(input_data, config) → result
```

## 设计原则

1. **Flow 即 Tool**：Flow 不是特殊的存在，它只是一种有可视化编辑器的 Tool
2. **简单优先**：默认自动配置，高级选项可选
3. **透明执行**：工具调用过程对用户可见，可随时打断
4. **两种 Skill 模式**：管理型（管理多个 Tool）和独立型（自身即 Tool），覆盖不同场景
5. **Plugin ≠ Skill**：Plugin 是 Flow 内部的 Block，Skill 是 Agent 的 Tool，概念分离

## 技术栈

- 后端：Python 3.11+、FastAPI、Pydantic v2、httpx
- 前端：React 18、TypeScript、Vite、Tailwind CSS、Zustand
- 存储：JSON 文件（单用户场景）
- LLM：OpenAI 兼容 API、支持 Function Calling
