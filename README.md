# Lindle

Lindle 是一个面向 AI 能力编排的工作台，提供可视化 Flow、对话式 Agent、Skill 和 Plugin 机制。

## 名称

Lindle 取自 `Loom` 和 `Spindle` 这两个方向。

这个命名强调的不是单个模型，而是把多个能力组织、编织并收敛成可运行结构的过程。

## 核心能力

- 可视化编排 Flow
- 用 Agent 调度 Skill
- 让 Flow 作为 Agent 能力被调用
- 支持 OpenAI 兼容模型接口
- 支持导出独立运行的工作流项目

## 快速开始

前置要求：

- Python 3.11+
- Node.js 20+
- uv

环境约束：

- Python 环境和依赖管理统一使用 `uv`
- 后端开发依赖使用 `uv sync --project backend --extra dev` 安装
- 后端命令统一使用 `uv run --project backend ...` 执行

启动：

- 使用项目根目录中的启动脚本进入开发模式
- 需要热更新时使用热更新模式
- 需要接入真实认证服务时使用真实认证模式

启动后访问本地前端入口。

## 文档

完整文档见 docs 目录。

- docs/README.md：文档入口
- docs/architecture：架构文档
- docs/development：开发规范
- docs/versioning：版本文档

## 版权与许可

- 版权所有 `Copyright (C) 2026 guanxingjian`
- 许可模式：`PolyForm-Noncommercial-1.0.0 + 商业授权`
- 默认仅授权非商业用途，商业使用、商业部署、商业分发或其他超出默认许可范围的用途，必须另行获得 `guanxingjian` 的书面商业授权
- 本项目为源码可见软件，不属于 OSI 定义的开源软件
- 完整默认许可文本见项目根目录 [LICENSE](/Users/xingjian/miniflow/LICENSE)
- 商业授权说明见 [COMMERCIAL-LICENSE.md](/Users/xingjian/miniflow/COMMERCIAL-LICENSE.md)
