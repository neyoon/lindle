# MiniFlow

极简 AI 工作流引擎 —— 分栏式可视化编排 + 可导出独立 Python 项目。

## 特性

- **分栏式流水线**：工作流由多个栏（Column）按顺序从左到右执行，同一栏内的块并行运行
- **多种块类型**：输入（input）、AI 对话（ai）、输出（output）、插件（plugin）
- **灵活的数据流**：支持 `{{变量}}` 模板语法，可通过 Connection 精确指定数据来源
- **多 LLM Provider**：兼容 OpenAI API 格式，支持配置多个 Provider（API Key / Base URL / Model）
- **代码生成**：一键将工作流导出为独立可运行的 Python 项目
- **插件系统**：可扩展的插件机制，内置示例插件
- **栏重复执行**：每栏可设置 `repeat` 次数，实现循环逻辑

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.11+、FastAPI、Uvicorn、Pydantic v2、httpx |
| 前端 | React 18、TypeScript、Vite 5、Tailwind CSS、Zustand |
| 部署 | Docker、docker-compose |

## 快速开始

### 前置要求

- Python 3.11+
- Node.js 20+
- [uv](https://github.com/astral-sh/uv)（Python 包管理器）

### 一键启动（开发模式）

```bash
chmod +x start.sh
./start.sh
```

启动后访问：

- 前端：http://localhost:3000
- 后端 API：http://localhost:8000
- API 文档：http://localhost:8000/docs

管理服务：

```bash
./start.sh stop      # 停止
./start.sh restart   # 重启
```

### 手动启动

后端：

```bash
cd backend
uv sync
DEV=1 uv run python main.py
```

前端：

```bash
cd frontend
npm install
npm run dev
```

### Docker 部署

```bash
docker compose up
```

单端口 `8000` 对外提供服务，数据通过 volume 持久化至 `/app/data`。

## 项目结构

```
miniflow/
├── backend/
│   ├── main.py              # 入口
│   ├── api/
│   │   ├── app.py           # FastAPI 应用
│   │   └── routes/          # 路由（workflow / execution / codegen / plugins / settings）
│   ├── miniflow/
│   │   ├── models.py        # 数据模型
│   │   ├── engine.py        # 执行引擎（栏间串行、栏内并行）
│   │   ├── blocks.py        # 块类型分发
│   │   ├── context.py       # 上下文与模板解析
│   │   └── llm.py           # LLM 调用
│   ├── codegen/             # 代码生成器
│   ├── plugins/             # 插件系统
│   └── storage/             # 文件存储
├── frontend/
│   └── src/
│       ├── App.tsx           # 路由与页面
│       ├── components/       # UI 组件（pipeline / blocks）
│       ├── stores/           # Zustand 状态管理
│       └── api/              # API 客户端
├── Dockerfile
├── docker-compose.yml
└── start.sh
```

## 使用说明

1. 首次使用需在 **设置页** 配置至少一个 LLM Provider（或通过环境变量 `OPENAI_API_KEY` 等配置）
2. 在工作流列表页创建新的工作流
3. 通过分栏式编辑器添加和编排块
4. 点击运行，支持实时 SSE 流式输出
5. 可将完成的工作流导出为独立 Python 项目

## License

MIT
