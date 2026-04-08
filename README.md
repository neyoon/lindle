# Tweak

可视化 AI 工作流编排平台 —— 让 AI 能力像搭积木一样简单。

## 核心特性

**工作流（Flow）**
- 分栏式可视化编排：从左到右顺序执行，栏内并行
- 四种核心块：输入、AI、输出、插件
- 灵活的数据流：自动传递 + 手动连线 + 模板变量
- 一键导出为独立 Python 项目

**智能体（Agent）**
- 对话式 AI 助手，支持动态调用 Skills
- 可绑定工作流作为工具，实现复杂任务自动化
- 支持多轮工具调用和推理

**插件系统**
- 可扩展的能力模块
- 内置工作流执行、数据分析等 Skills
- 支持自定义插件开发

**多模型支持**
- 兼容 OpenAI API 格式
- 支持配置多个 LLM Provider
- 灵活切换不同模型

## 快速开始

### 前置要求

- Python 3.11+
- Node.js 20+
- [uv](https://github.com/astral-sh/uv)（Python 包管理器）

### 一键启动

```bash
chmod +x start.sh
./start.sh
```

访问 http://localhost:3000 开始使用。

### 多用户认证

当前版本已接入外部账号中心，`miniflow` 本身不再维护独立用户密码。

- 默认模式：`TWEAK_AUTH_MODE=coxie`
- 本地开发模式：`TWEAK_AUTH_MODE=dev`

现在也可以直接用脚本模式启动，不必手动管理环境变量：

```bash
./start.sh dev
./start.sh dev-hot
./start.sh real
./start.sh real http://localhost:8000
./start.sh real-hot http://localhost:8000
```

如果你仍然需要手动控制，也可以使用以下环境变量：

```bash
# 接入现有 coxie 账号系统
export TWEAK_AUTH_MODE=coxie
export TWEAK_COXIE_BASE_URL=http://localhost:8000

# 或使用本地假用户开发
export TWEAK_AUTH_MODE=dev
export TWEAK_DEV_USER_ID=test-user-1
export TWEAK_DEV_USERNAME=Test User
export TWEAK_DEV_USER_ROLE=admin
```

在 `dev` 模式下，前端仍会显示登录页，但任意非空用户名/密码都可进入，后端会固定注入本地测试用户。

### 本地联调

推荐两种方式：

1. 纯本地开发

```bash
./start.sh dev
```

2. 接入真实账号系统联调

```bash
./start.sh real http://localhost:8000
```

### 数据隔离

当前第一阶段仍保留文件存储，但已按用户隔离到不同目录：

```text
backend/data/users/<user_id>/
```

其中会分别保存该用户的 `workflows`、`agents`、`workspace`、`settings`、`custom_skills` 和插件配置。

### Docker 部署

```bash
docker compose up
```

单端口 `8000` 对外提供服务。

## 技术栈

- 后端：Python 3.11+、FastAPI、Pydantic v2
- 前端：React 18、TypeScript、Vite、Tailwind CSS
- 状态管理：Zustand

## 文档

详细的架构设计和使用说明请查看 [docs/](./docs/) 目录。

## License

MIT
