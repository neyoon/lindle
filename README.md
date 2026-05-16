# Lindle

Lindle 是一个面向 AI 能力编排的工作台，提供可视化 Flow、对话式 Agent、Skill 和 Plugin 机制。

## 注意

这个项目是完全基于vibecoding完成，因此部分代码会存在重复，意义不明，另外还会有奇怪的冗余注释。另外，对于项目的任何非商业化的利用都是完全欢迎的。当然如果你愿意留下你宝贵的comment，PR，那是更好的，感谢你可能的付出：）

## 核心能力

- 自然语言 / 可视化编排工作流
- Agent 调度 Skill，也可以编写并调用自己的工作流
- 结构化导出 Agent / 工作流架构
- 透明的 Tool / Skill / Agent 运行过程

## 快速开始

本地开发前置要求：

- Python 3.11+
- Node.js 20+
- uv

环境约束：

- Python 环境和依赖管理统一使用 `uv`
- 后端开发依赖使用 `uv sync --project backend --extra dev` 安装
- 后端命令统一使用 `uv run --project backend ...` 执行

本地启动：

```bash
./start.sh
```

启动后访问：

- 前端：http://localhost:1106
- 后端：http://localhost:6011
- API 文档：http://localhost:6011/docs

后端热更新：

```bash
./start.sh hot
```

停止服务：

```bash
./start.sh stop
```

## 安全边界

Lindle 当前默认面向本地可信环境。自定义 Skill 会执行用户编写的 Python 代码，只应运行来自可信来源的 Skill，不建议把未加固的服务直接暴露到公网。

## 版权与许可

- 版权所有 `Copyright (C) 2026 guanxingjian`
- 本项目为 source-available 软件，源码可见但不按 OSI 开源许可授权
- 许可模式：`PolyForm-Noncommercial-1.0.0 + 商业授权`
- 默认仅授权非商业用途，商业使用、商业部署、商业分发或其他超出默认许可范围的用途，必须另行获得 `guanxingjian` 的书面商业授权
- 完整默认许可文本见项目根目录 [LICENSE](./LICENSE)
- 商业授权说明见 [COMMERCIAL-LICENSE.md](./COMMERCIAL-LICENSE.md)
