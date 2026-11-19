#!/bin/zsh
cd "$(dirname "$0")"
echo "正在启动 WMPSES SQLite 数据库与考试系统服务..."
echo "数据库路径: $(pwd)/db/wmpses.db"
echo "浏览器访问: http://127.0.0.1:8765"
echo "按 Ctrl+C 可停止服务"
(sleep 1 && open "http://127.0.0.1:8765") &
python3 server.py --port 8765
