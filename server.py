#!/usr/bin/env python3
"""
WMPSES 本地 SQLite 后台服务 & 静态 Web 服务器
运行方式：python3 server.py [--port 8765]
同时支持直接访问 http://127.0.0.1:8765 或由本地双击打开的 index.html 跨域调用 /api/*
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict

from db import db_manager

PROJECT_ROOT = Path(__file__).resolve().parent


class WMPSESRequestHandler(SimpleHTTPRequestHandler):
    """处理 REST API 与项目静态文件的 HTTP 请求处理器。"""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            counts = db_manager.init_db(reset=False)
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "WMPSES SQLite Backend",
                    "dbPath": str(db_manager.DB_PATH),
                    "counts": counts,
                },
            )
            return

        if path == "/api/bank":
            qs = urllib.parse.parse_qs(parsed.query)
            exam_id = (qs.get("examId") or ["WMPSES-1.1.1-V1"])[0]
            try:
                bank = db_manager.get_question_bank(exam_id=exam_id)
                self._send_json(HTTPStatus.OK, {"ok": True, "bank": bank})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/tables":
            try:
                summary = db_manager.get_tables_summary()
                self._send_json(HTTPStatus.OK, {"ok": True, **summary})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/users":
            qs = urllib.parse.parse_qs(parsed.query)
            role = (qs.get("role") or [None])[0]
            exam_id = (qs.get("examId") or ["WMPSES-1.1.1-V1"])[0]
            try:
                users = db_manager.get_users(role_type=role)
                logs = db_manager.get_change_logs(exam_id=exam_id)
                self._send_json(HTTPStatus.OK, {"ok": True, "users": users, "changeLogs": logs})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/templates":
            try:
                templates = db_manager.get_widget_templates()
                self._send_json(HTTPStatus.OK, {"ok": True, "templates": templates})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        # 禁止直接下载敏感文件
        if path.startswith("/.git") or path.endswith(".db"):
            self._send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "Forbidden"})
            return

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()
        except Exception as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": f"无效 JSON: {exc}"})
            return

        if path == "/api/bank":
            try:
                bank_payload = body.get("bank") if isinstance(body, dict) and "bank" in body else body
                change_meta = body.get("changeMeta") if isinstance(body, dict) else None
                res = db_manager.save_question_bank(bank_payload, change_meta=change_meta)
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "message": "已同步写入 SQLite 关系表并记录变更日志",
                        "bank": res["bank"],
                        "counts": res["counts"],
                        "changeLogs": res.get("changeLogs", []),
                    },
                )
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/users":
            try:
                res = db_manager.save_user(body)
                self._send_json(HTTPStatus.OK, {"ok": True, **res})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/users/delete":
            try:
                uid = str(body.get("id") or body.get("pk_UserID") or "")
                res = db_manager.delete_user(uid)
                self._send_json(HTTPStatus.OK, res)
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/templates":
            try:
                res = db_manager.save_widget_template(body)
                self._send_json(HTTPStatus.OK, res)
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/templates/delete":
            try:
                key = str(body.get("id") or body.get("code") or "")
                res = db_manager.delete_widget_template(key)
                self._send_json(HTTPStatus.OK, res)
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/auth/login":
            try:
                identifier = str(body.get("username") or body.get("userCode") or body.get("id") or "").strip()
                password = str(body.get("password") or "")
                res = db_manager.authenticate_user(identifier, password)
                self._send_json(HTTPStatus.OK, res)
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/auth/password":
            try:
                user_id = str(body.get("userId") or body.get("id") or "").strip()
                old_pwd = str(body.get("oldPassword") or "")
                new_pwd = str(body.get("newPassword") or "")
                res = db_manager.change_user_password(user_id, old_pwd, new_pwd)
                self._send_json(HTTPStatus.OK, res)
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/bank/reset":
            try:
                counts = db_manager.init_db(reset=True)
                bank = db_manager.get_question_bank()
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "message": "SQLite 题库已恢复出厂示范数据",
                        "bank": bank,
                        "counts": counts,
                    },
                )
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        if path == "/api/results":
            try:
                res = db_manager.save_exam_result(body)
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "message": "成绩及逐题明细已写入 SQLite 关系表",
                        **res,
                    },
                )
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": str(exc)})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": f"Unknown API endpoint: {path}"})


def run_server(host: str = "127.0.0.1", port: int = 8765) -> None:
    counts = db_manager.init_db(reset=False)
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((host, port), WMPSESRequestHandler)
    print(f"WMPSES SQLite 后台服务已启动: http://{host}:{port}")
    print(f"数据库文件: {db_manager.DB_PATH}")
    print(f"初始数据统计: {json.dumps(counts, ensure_ascii=False)}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WMPSES SQLite 后台服务")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("WMPSES_PORT", "8765")))
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
