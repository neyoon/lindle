#!/usr/bin/env bash
#
# Lindle 一键启动脚本
#
# 用法:
#   ./start.sh          启动前端 + 后端（默认稳定模式，后端不热重载）
#   ./start.sh stop     停止所有服务
#   ./start.sh restart  重启所有服务
#   ./start.sh hot      本地模式 + 后端热重载
#   BACKEND_DEV=1 ./start.sh   启动后端热重载（开发调试）
#
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
PID_DIR="$ROOT_DIR/.pids"
BACKEND_PORT="${BACKEND_PORT:-6011}"
FRONTEND_PORT="${FRONTEND_PORT:-1106}"

export UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"

mkdir -p "$PID_DIR"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG="$ROOT_DIR/.pids/backend.log"
FRONTEND_LOG="$ROOT_DIR/.pids/frontend.log"
BACKEND_DEV="${BACKEND_DEV:-0}"

print_runtime_mode() {
  local backend_mode="稳定模式（热重载关闭）"
  if [ "$BACKEND_DEV" = "1" ]; then
    backend_mode="开发模式（热重载开启）"
  fi

  echo "[启动模式] 后端: $backend_mode"
  echo "[启动模式] 工作区: 本地单机模式"
}

# ---------- 工具函数 ----------

stop_service() {
  local name="$1"
  local pid_file="$2"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "[$name] 正在停止 (PID: $pid)..."
      kill "$pid" 2>/dev/null || true
      # 等待进程退出
      for i in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      # 强制杀掉
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
      echo "[$name] 已停止"
    else
      echo "[$name] 进程已不存在"
    fi
    rm -f "$pid_file"
  else
    echo "[$name] 未在运行"
  fi
}

stop_all() {
  stop_service "后端" "$BACKEND_PID_FILE"
  stop_service "前端" "$FRONTEND_PID_FILE"
}

start_backend() {
  echo "[后端] 安装依赖..."
  cd "$BACKEND_DIR"
  uv sync --quiet 2>/dev/null || true

  echo "[后端] 启动 (http://localhost:$BACKEND_PORT)..."
  print_runtime_mode
  FRONTEND_PORT="$FRONTEND_PORT" PORT="$BACKEND_PORT" DEV="$BACKEND_DEV" uv run python main.py > "$BACKEND_LOG" 2>&1 &
  local pid=$!
  echo "$pid" > "$BACKEND_PID_FILE"
  echo "[后端] 已启动 (PID: $pid, 日志: .pids/backend.log)"
}

start_frontend() {
  cd "$FRONTEND_DIR"

  # 检查 node_modules
  if [ ! -d "node_modules" ]; then
    echo "[前端] 安装依赖..."
    npm install --silent
  fi

  echo "[前端] 启动 (http://localhost:$FRONTEND_PORT)..."
  FRONTEND_PORT="$FRONTEND_PORT" BACKEND_PORT="$BACKEND_PORT" VITE_API_TARGET="http://localhost:$BACKEND_PORT" \
    npx vite --port "$FRONTEND_PORT" --strictPort > "$FRONTEND_LOG" 2>&1 &
  local pid=$!
  echo "$pid" > "$FRONTEND_PID_FILE"
  echo "[前端] 已启动 (PID: $pid, 日志: .pids/frontend.log)"
}

wait_for_service() {
  local name="$1"
  local url="$2"
  local max_wait=15
  for i in $(seq 1 $max_wait); do
    if curl -s "$url" > /dev/null 2>&1; then
      echo "[$name] 就绪"
      return 0
    fi
    sleep 1
  done
  echo "[$name] 启动超时，请检查日志"
  return 1
}

# ---------- 主逻辑 ----------

if [ "${1:-start}" = "hot" ]; then
  BACKEND_DEV="1"
  set -- start
fi

case "${1:-start}" in
  stop)
    echo "=== 停止 Lindle ==="
    stop_all
    ;;
  restart)
    echo "=== 重启 Lindle ==="
    stop_all
    sleep 1
    start_backend
    start_frontend
    echo ""
    wait_for_service "后端" "http://localhost:$BACKEND_PORT/api/health"
    wait_for_service "前端" "http://localhost:$FRONTEND_PORT"
    echo ""
    echo "=== Lindle 已重启 ==="
    echo "  前端: http://localhost:$FRONTEND_PORT"
    echo "  后端: http://localhost:$BACKEND_PORT"
    echo "  API 文档: http://localhost:$BACKEND_PORT/docs"
    ;;
  start|"")
    echo "=== 启动 Lindle ==="

    # 如果已经在运行，先停掉
    if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
      echo "检测到已有服务运行，先停止..."
      stop_all
      sleep 1
    fi

    start_backend
    start_frontend

    echo ""
    wait_for_service "后端" "http://localhost:$BACKEND_PORT/api/health"
    wait_for_service "前端" "http://localhost:$FRONTEND_PORT"

    echo ""
    echo "========================================="
    echo "  Lindle 启动完成"
    echo "  前端: http://localhost:$FRONTEND_PORT"
    echo "  后端: http://localhost:$BACKEND_PORT"
    echo "  API 文档: http://localhost:$BACKEND_PORT/docs"
    echo "  模式: 本地单机"
    echo ""
    echo "  停止: ./start.sh stop"
    echo "  重启: ./start.sh restart"
    echo "  热重载: ./start.sh hot"
    echo "========================================="
    ;;
  *)
    echo "用法: $0 {start|stop|restart|hot}"
    exit 1
    ;;
esac
