#!/bin/zsh
cd "$(dirname "$0")" || exit 1

PORT="${1:-${WMPSES_PORT:-8765}}"
HOST="${WMPSES_HOST:-0.0.0.0}"

echo "========================================================"
echo "  WMPSES 工业废气治理工实操仿真考试系统 - 启动自检"
echo "========================================================"

# 1. 环境与关键文件自检
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ 错误：未检测到 python3，请先安装 Python 3 后重试。"
  exit 1
fi
PY_VER=$(python3 --version 2>&1)
echo "✅ Python 环境: ${PY_VER}"

if [ ! -f "server.py" ] || [ ! -f "db/schema.sql" ] || [ ! -f "db/db_manager.py" ]; then
  echo "❌ 错误：缺少关键服务文件（server.py / db/schema.sql / db/db_manager.py）。"
  exit 1
fi
echo "✅ 数据库架构: $(pwd)/db/schema.sql"
echo "✅ 数据库文件: $(pwd)/db/wmpses.db"

# 2. 端口占用自检与旧进程清理 / 自动顺延
check_port_pids() {
  local p="$1"
  lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null | sort -u
}

OCCUPIED_PIDS=$(check_port_pids "$PORT")
if [ -n "$OCCUPIED_PIDS" ]; then
  echo "⚠️  端口自检: 端口 ${PORT} 已被进程占用 (PID: $(echo "$OCCUPIED_PIDS" | tr '\n' ' ' | sed 's/ $//'))"
  echo "🔄 正在自动停止旧进程并释放端口 ${PORT}..."
  echo "$OCCUPIED_PIDS" | while IFS= read -r pid; do
    [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null
  done
  sleep 1

  REMAIN_PIDS=$(check_port_pids "$PORT")
  if [ -n "$REMAIN_PIDS" ]; then
    echo "$REMAIN_PIDS" | while IFS= read -r pid; do
      [ -n "$pid" ] && kill -KILL "$pid" 2>/dev/null
    done
    sleep 0.5
  fi

  FINAL_CHECK=$(check_port_pids "$PORT")
  if [ -n "$FINAL_CHECK" ]; then
    echo "⚠️  端口 ${PORT} 仍被系统受保护进程占用，正在自动顺延寻找空闲端口..."
    FOUND_PORT=""
    NEXT_PORT=$((PORT + 1))
    MAX_PORT=$((PORT + 20))
    while [ "$NEXT_PORT" -le "$MAX_PORT" ]; do
      if [ -z "$(check_port_pids "$NEXT_PORT")" ]; then
        FOUND_PORT="$NEXT_PORT"
        break
      fi
      NEXT_PORT=$((NEXT_PORT + 1))
    done
    if [ -n "$FOUND_PORT" ]; then
      PORT="$FOUND_PORT"
      echo "✅ 已自动顺延至空闲端口: ${PORT}"
    else
      echo "❌ 错误：端口 $((PORT))~${MAX_PORT} 均被占用，无法启动服务。"
      exit 1
    fi
  else
    echo "✅ 端口 ${PORT} 已成功释放"
  fi
else
  echo "✅ 端口自检: ${PORT} 空闲可用"
fi

# 3. 探测本机局域网 IPv4 地址（有线 / Wi-Fi）
LAN_IPS=$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" && $2 !~ /^169\.254\./ && $2 !~ /^198\.1[89]\./ {if (!seen[$2]++) print $2}')
if [ -z "$LAN_IPS" ]; then
  for iface in en0 en1 en2 en3; do
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null)
    if [ -n "$ip" ]; then
      LAN_IPS="${LAN_IPS}${LAN_IPS:+$'\n'}${ip}"
    fi
  done
fi

echo "--------------------------------------------------------"
echo "🖥️  教师本机访问地址: http://127.0.0.1:${PORT}"
if [ -n "$LAN_IPS" ]; then
  echo "$LAN_IPS" | while IFS= read -r ip; do
    [ -n "$ip" ] && echo "🌐 局域网考生机访问地址: http://${ip}:${PORT}"
  done
else
  echo "ℹ️  局域网考场提示: 未检测到活跃局域网 IP，当前仅限本机访问"
fi
echo "按 Ctrl+C 可停止后台服务"
echo "========================================================"

# 4. 启动后端服务并自动打开默认浏览器
(sleep 1 && open "http://127.0.0.1:${PORT}") &
exec python3 server.py --host "$HOST" --port "$PORT" --kill-existing --auto-port
