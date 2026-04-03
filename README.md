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
