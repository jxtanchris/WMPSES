"""
WMPSES 统一数据库后端路由门面：
通过环境变量 WMPSES_DB_BACKEND=mysql|sqlite 自动切换 MySQL 8.0（生产并发）或 SQLite（本机兜底）。
"""

from __future__ import annotations

import os
from typing import Any

BACKEND_NAME = os.environ.get("WMPSES_DB_BACKEND", "sqlite").strip().lower()

if BACKEND_NAME == "mysql":
    from db import mysql_manager as active_db
else:
    from db import db_manager as active_db


def get_backend_name() -> str:
    return "mysql" if BACKEND_NAME == "mysql" else "sqlite"


def __getattr__(name: str) -> Any:
    return getattr(active_db, name)
