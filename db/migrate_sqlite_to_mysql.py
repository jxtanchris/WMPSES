#!/usr/bin/env python3
"""
WMPSES 一键数据迁移脚本：将现有 SQLite (db/wmpses.db) 全量数据无损迁入 MySQL 8.0。
支持幂等重复执行（默认仅在 MySQL 试卷场景表为空时导入，传入 --force 可强制清空重建）。
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path
from typing import List, Tuple

from db import db_manager, mysql_manager

ORDERED_TABLES: List[str] = [
    "WMPSES_试卷场景",
    "WMPSES_设备热点",
    "WMPSES_习题库",
    "WMPSES_否定项规则",
    "WMPSES_验收规范与确认单",
    "WMPSES_工况资料与引用标准",
    "WMPSES_用户人员",
    "WMPSES_题库变更日志",
    "WMPSES_工况卡片模板",
    "WMPSES_考试记录",
    "WMPSES_作答明细",
]


def _read_sqlite_table(sconn: sqlite3.Connection, table: str) -> Tuple[List[str], List[tuple]]:
    cur = sconn.execute(f'SELECT * FROM "{table}"')
    cols = [d[0] for d in cur.description]
    rows = [tuple(r) for r in cur.fetchall()]
    return cols, rows


def migrate(sqlite_path: Path = db_manager.DB_PATH, truncate_target: bool = False) -> None:
    db_manager.init_db(reset=False, db_path=sqlite_path)
    counts = mysql_manager.init_db(reset=False)
    if not truncate_target and counts.get("WMPSES_试卷场景", 0) > 0:
        print(f"[migrate] MySQL 已有 {counts['WMPSES_试卷场景']} 个试卷场景，跳过初始化导入（如需覆盖请加 --force）。")
        return

    sconn = sqlite3.connect(str(sqlite_path))
    try:
        with mysql_manager.get_connection() as mconn:
            with mconn.cursor() as cur:
                cur.execute("SET FOREIGN_KEY_CHECKS = 0")
                if truncate_target:
                    for tbl in reversed(ORDERED_TABLES):
                        cur.execute(f"TRUNCATE TABLE `{tbl}`")
                    cur.execute("TRUNCATE TABLE `WMPSES_答题草稿`")

                for tbl in ORDERED_TABLES:
                    cols, rows = _read_sqlite_table(sconn, tbl)
                    if not rows:
                        print(f"[migrate] {tbl}: 0 行（跳过）")
                        continue
                    col_list = ", ".join(f"`{c}`" for c in cols)
                    placeholders = ", ".join("%s" for _ in cols)
                    updates = ", ".join(f"`{c}`=VALUES(`{c}`)" for c in cols[1:])
                    sql = f"INSERT INTO `{tbl}` ({col_list}) VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {updates}"
                    cur.executemany(sql, rows)
                    print(f"[migrate] {tbl}: 已迁移 {len(rows)} 行")

                cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    finally:
        sconn.close()

    with mysql_manager.get_connection() as mconn:
        final_counts = mysql_manager.get_table_counts(mconn)
    print(f"[migrate] 迁移完成！MySQL 各表统计: {final_counts}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="将 WMPSES SQLite 数据全量迁移到 MySQL 8.0")
    parser.add_argument("--sqlite", default=str(db_manager.DB_PATH), help="源 SQLite 文件路径")
    parser.add_argument("--force", action="store_true", help="强制清空 MySQL 目标表后全量重导")
    args = parser.parse_args()
    migrate(sqlite_path=Path(args.sqlite), truncate_target=args.force)
