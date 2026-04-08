#!/usr/bin/env bash
#
# MiniFlow 一键启动脚本
#
# 用法:
#   ./start.sh          启动前端 + 后端（默认稳定模式，后端不热重载）
#   ./start.sh stop     停止所有服务
#   ./start.sh restart  重启所有服务
#   ./start.sh dev      本地假用户模式启动
#   ./start.sh dev-hot  本地假用户模式 + 后端热重载
#   ./start.sh real     接入真实 coxie 账号系统
#   ./start.sh real-hot 接入真实 coxie 账号系统 + 后端热重载
#   BACKEND_DEV=1 ./start.sh   启动后端热重载（开发调试）
#
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
PID_DIR="$ROOT_DIR/.pids"

export UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"

mkdir -p "$PID_DIR"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG="$ROOT_DIR/.pids/backend.log"
FRONTEND_LOG="$ROOT_DIR/.pids/frontend.log"
# 后端是否启用热重载：默认关闭，避免流式会话被 StatReload 打断
BACKEND_DEV="${BACKEND_DEV:-0}"
AUTH_PRESET="${AUTH_PRESET:-}"
COXIE_URL_DEFAULT="${TWEAK_COXIE_BASE_URL:-http://localhost:8000}"

configure_auth_preset() {
  case "${AUTH_PRESET:-}" in
    ""|default)
      ;;
    dev)
      export TWEAK_AUTH_MODE="dev"
      export TWEAK_DEV_USER_ID="${TWEAK_DEV_USER_ID:-test-user-1}"
      export TWEAK_DEV_USERNAME="${TWEAK_DEV_USERNAME:-Test User}"
      export TWEAK_DEV_USER_ROLE="${TWEAK_DEV_USER_ROLE:-admin}"
      ;;
    real)
      export TWEAK_AUTH_MODE="coxie"
      export TWEAK_COXIE_BASE_URL="${TWEAK_COXIE_BASE_URL:-$COXIE_URL_DEFAULT}"
      ;;
    *)
      echo "未知认证模式: $AUTH_PRESET"
      exit 1
      ;;
  esac
}

print_runtime_mode() {
  local auth_mode="${TWEAK_AUTH_MODE:-coxie}"
  local backend_mode="稳定模式（热重载关闭）"
  if [ "$BACKEND_DEV" = "1" ]; then
    backend_mode="开发模式（热重载开启）"
  fi

  echo "[启动模式] 后端: $backend_mode"
  if [ "$auth_mode" = "dev" ]; then
    echo "[启动模式] 认证: 本地假用户"
    echo "[启动模式] 测试用户: ${TWEAK_DEV_USERNAME:-Test User} (${TWEAK_DEV_USER_ID:-test-user-1}, ${TWEAK_DEV_USER_ROLE:-admin})"
  else
    echo "[启动模式] 认证: 真实账号系统"
    echo "[启动模式] Coxie 地址: ${TWEAK_COXIE_BASE_URL:-$COXIE_URL_DEFAULT}"
  fi
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

  echo "[后端] 启动 (http://localhost:8000)..."
  print_runtime_mode
  DEV="$BACKEND_DEV" uv run python main.py > "$BACKEND_LOG" 2>&1 &
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

  echo "[前端] 启动 (http://localhost:3000)..."
  npx vite --port 3000 > "$FRONTEND_LOG" 2>&1 &
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

case "${1:-start}" in
  dev)
    AUTH_PRESET="dev"
    BACKEND_DEV="${BACKEND_DEV:-0}"
    set -- start
    ;;
  dev-hot)
    AUTH_PRESET="dev"
    BACKEND_DEV="1"
    set -- start
    ;;
  real)
    AUTH_PRESET="real"
    [ -n "${2:-}" ] && export TWEAK_COXIE_BASE_URL="$2"
    set -- start
    ;;
  real-hot)
    AUTH_PRESET="real"
    BACKEND_DEV="1"
    [ -n "${2:-}" ] && export TWEAK_COXIE_BASE_URL="$2"
    set -- start
    ;;
esac

if [ "${1:-start}" = "restart" ]; then
  case "${2:-}" in
    dev)
      AUTH_PRESET="dev"
      ;;
    dev-hot)
      AUTH_PRESET="dev"
      BACKEND_DEV="1"
      ;;
    real)
      AUTH_PRESET="real"
      [ -n "${3:-}" ] && export TWEAK_COXIE_BASE_URL="$3"
      ;;
    real-hot)
      AUTH_PRESET="real"
      BACKEND_DEV="1"
      [ -n "${3:-}" ] && export TWEAK_COXIE_BASE_URL="$3"
      ;;
  esac
fi

configure_auth_preset

case "${1:-start}" in
  stop)
    echo "=== 停止 MiniFlow ==="
    stop_all
    ;;
  restart)
    echo "=== 重启 MiniFlow ==="
    stop_all
    sleep 1
    start_backend
    start_frontend
    echo ""
    wait_for_service "后端" "http://localhost:8000/api/health"
    wait_for_service "前端" "http://localhost:3000"
    echo ""
    echo "=== MiniFlow 已重启 ==="
    echo "  前端: http://localhost:3000"
    echo "  后端: http://localhost:8000"
    echo "  API 文档: http://localhost:8000/docs"
    ;;
  start|"")
    echo "=== 启动 MiniFlow ==="

    # 如果已经在运行，先停掉
    if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
      echo "检测到已有服务运行，先停止..."
      stop_all
      sleep 1
    fi

    start_backend
    start_frontend

    echo ""
    wait_for_service "后端" "http://localhost:8000/api/health"
    wait_for_service "前端" "http://localhost:3000"

    echo ""
    echo "========================================="
    echo "  MiniFlow 启动完成"
    echo "  前端: http://localhost:3000"
    echo "  后端: http://localhost:8000"
    echo "  API 文档: http://localhost:8000/docs"
    if [ "${TWEAK_AUTH_MODE:-coxie}" = "dev" ]; then
      echo "  认证模式: dev（本地假用户）"
    else
      echo "  认证模式: coxie（${TWEAK_COXIE_BASE_URL:-$COXIE_URL_DEFAULT}）"
    fi
    echo ""
    echo "  停止: ./start.sh stop"
    echo "  重启: ./start.sh restart"
    echo "  快捷模式: ./start.sh dev | ./start.sh dev-hot | ./start.sh real [coxie_url]"
    echo "========================================="
    ;;
  *)
    echo "用法: $0 {start|stop|restart|dev|dev-hot|real|real-hot}"
    exit 1
    ;;
esac
