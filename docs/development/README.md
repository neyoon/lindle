# 开发文档

## 目标

这一组文档定义项目的开发约束。

重点不是罗列习惯，而是统一最低标准，减少后续实现、评审和维护中的歧义。

## 内容

- code-style：代码规范
- documentation-style：文档规范
- development-details：本项目的具体开发细节
- test-strategy：测试文档和测试重点

## 使用方式

开始新一轮改动前，先确认开发细节和当前版本文档。

开始编码前，先确保命名、结构、注释和文档写法与这里保持一致。

Python 相关开发统一使用 `uv` 管理环境和依赖。

- 安装后端开发依赖：`uv sync --project backend --extra dev`
- 运行后端脚本或测试：`uv run --project backend ...`
