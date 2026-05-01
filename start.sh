#!/bin/bash
# 自动重启 wrapper — 进程退出后 2 秒自动重启
APP_DIR="/home/agentuser/reminder-app"
PORT="${PORT:-63456}"
KEY_TOOL_DIR="/home/agentuser/HRB-CLient/src/HRB.Payment.KeyTool.WebApi"
KEY_TOOL_PORT="${KEY_TOOL_PORT:-63457}"
DOTNET_BIN="${DOTNET_BIN:-/home/agentuser/.dotnet/dotnet}"
export DOTNET_ROOT="${DOTNET_ROOT:-/home/agentuser/.dotnet}"
export PATH="/home/agentuser/.dotnet:$PATH"
export HRB_LICENSE_API_BASE_URL="${HRB_LICENSE_API_BASE_URL:-http://127.0.0.1:${KEY_TOOL_PORT}}"

ensure_key_tool() {
  if [ ! -d "$KEY_TOOL_DIR" ]; then
    echo "[wrapper] 授权生成服务目录不存在，跳过: $KEY_TOOL_DIR"
    return
  fi

  if ss -ltn 2>/dev/null | grep -q "127.0.0.1:${KEY_TOOL_PORT}"; then
    return
  fi

  echo "[wrapper] 启动授权生成服务 (127.0.0.1:${KEY_TOOL_PORT})..."
  cd "$KEY_TOOL_DIR" && nohup "$DOTNET_BIN" run --urls "http://127.0.0.1:${KEY_TOOL_PORT}" > /tmp/hrb-license-key-tool.log 2>&1 &
}

while true; do
  ensure_key_tool
  echo "[wrapper] 启动服务 (port=$PORT)..."
  cd "$APP_DIR" && PORT="$PORT" npm run start -- --hostname 0.0.0.0 --port "$PORT"
  EXIT_CODE=$?
  echo "[wrapper] 进程退出 (exit=$EXIT_CODE)，2 秒后重启..."
  sleep 2
done
