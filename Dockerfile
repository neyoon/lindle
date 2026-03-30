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

# 安装 Python 依赖（先装依赖再复制代码，利用 Docker 缓存）
RUN pip install --no-cache-dir \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.30.0" \
    "httpx>=0.27.0" \
    "pydantic>=2.0.0" \
    "pyyaml>=6.0"

# 复制后端代码
COPY backend/ ./

# 复制前端构建产物到 /app/static
COPY --from=frontend-builder /build/dist ./static

# 确保 data 目录存在（运行时通过 volume 持久化）
RUN mkdir -p data/workflows data/workspace

EXPOSE 8000

CMD ["python", "main.py"]
