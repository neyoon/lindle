# ===== 阶段 1: 构建前端 =====
FROM node:20-slim AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ===== 阶段 2: 运行后端 + 托管前端 =====
FROM python:3.12-slim

WORKDIR /app

# 安装 uv 并通过 pyproject.toml 安装依赖
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY backend/pyproject.toml ./
RUN uv pip install --system --no-cache .

# 复制后端代码
COPY backend/ ./

# 复制前端构建产物到 /app/static
COPY --from=frontend-builder /build/dist ./static

# 确保 data 目录存在（运行时通过 volume 持久化）
RUN mkdir -p data/workflows data/workspace

EXPOSE 8000

CMD ["python", "main.py"]
