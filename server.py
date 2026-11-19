#!/usr/bin/env python3
"""
WMPSES 本地 SQLite 后台服务 & 静态 Web 服务器
运行方式：python3 server.py [--host 0.0.0.0] [--port 8765]
支持本机与局域网（0.0.0.0）多机考试访问、端口自检冲突清理与空闲端口自动顺延
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import signal
import socket
import subprocess
import time
import urllib.parse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple

from db import db_manager

PROJECT_ROOT = Path(__file__).resolve().parent

RUNTIME_INFO: Dict[str, Any] = {
    "host": "0.0.0.0",
    "port": 8765,
    "localUrl": "http://127.0.0.1:8765",
    "lanIps": [],
    "lanUrls": [],
    "cleanedPids": [],
}


def _detect_lan_ips() -> List[str]:
    """探测本机可用于局域网访问的非回环 IPv4 地址，过滤虚拟代理 TUN 段并优先返回物理局域网地址。"""
    candidates: List[str] = []
    tun_net = ipaddress.IPv4Network("198.18.0.0/15")

    def _add_ip(ip_str: str) -> None:
        s = (ip_str or "").strip()
        if not s or s in candidates:
            return
        try:
            addr = ipaddress.IPv4Address(s)
        except ValueError:
            return
        if addr.is_loopback or addr.is_link_local or addr.is_unspecified or addr.is_multicast or addr in tun_net:
            return
        candidates.append(s)

    # 1. 优先尝试主动连接常见私网网关网段或公网探测（不发包）获取默认出站路由 IP
    for probe_target in (("192.168.1.1", 80), ("10.0.0.1", 80), ("172.16.0.1", 80), ("223.5.5.5", 80)):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.settimeout(0.2)
            sock.connect(probe_target)
            _add_ip(sock.getsockname()[0])
        except OSError:
            pass
        finally:
            sock.close()

    # 2. 主机名解析兜底
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            _add_ip(info[4][0])
    except OSError:
        pass

    # 3. 系统网卡命令扫描（macOS/Linux: ifconfig，Windows: ipconfig）
    try:
        cmd = ["ipconfig"] if os.name == "nt" else ["ifconfig"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=2.0, check=False)
        output = proc.stdout or ""
        for m in re.finditer(r"(?:inet\s+|IPv4[^:]*:\s*)(\d+\.\d+\.\d+\.\d+)", output):
            _add_ip(m.group(1))
    except (OSError, subprocess.SubprocessError):
        pass

    return candidates


def _find_port_pids(port: int) -> List[int]:
    """查找正在监听指定 TCP 端口的进程 PID 列表（不含当前进程与父进程）。"""
    if os.name == "nt":
        return []
    excluded = {os.getpid(), os.getppid()}
    pids: List[int] = []
    for cmd in (
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
        ["lsof", "-ti", f"tcp:{port}"],
    ):
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=2.0, check=False)
            for line in (proc.stdout or "").splitlines():
                line = line.strip()
                if line.isdigit():
                    pid = int(line)
                    if pid not in excluded and pid not in pids:
                        pids.append(pid)
            if pids:
                break
        except (OSError, subprocess.SubprocessError):
            continue
    return pids


def _is_port_in_use(port: int, bind_host: str = "0.0.0.0") -> bool:
    """检测指定 TCP 端口是否已被本机监听或绑定。"""
    if _find_port_pids(port):
        return True

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.settimeout(0.3)
        if sock.connect_ex(("127.0.0.1", port)) == 0:
            return True
    except OSError:
        pass
    finally:
        sock.close()

    hosts_to_check = [bind_host] if bind_host == "127.0.0.1" else [bind_host, "127.0.0.1"]
    for h in hosts_to_check:
        test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            test_sock.bind((h, port))
        except OSError:
            return True
        finally:
            test_sock.close()
    return False


def _cleanup_port_processes(port: int, bind_host: str = "0.0.0.0") -> List[int]:
    """向占用目标端口的旧进程发送 SIGTERM/SIGKILL 并等待端口释放，返回已清理 PID 列表。"""
    pids = _find_port_pids(port)
    if not pids:
        return []

    cleaned: List[int] = []
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
            cleaned.append(pid)
        except OSError:
            pass

    for _ in range(15):
        if not _is_port_in_use(port, bind_host=bind_host):
            return cleaned
        time.sleep(0.1)

    for pid in list(cleaned):
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
    time.sleep(0.2)
    return cleaned


def _resolve_available_port(
    preferred_port: int,
    bind_host: str = "0.0.0.0",
    kill_existing: bool = True,
    auto_port: bool = True,
) -> Tuple[int, List[int]]:
    """自检目标端口：优先清理旧进程释放首选端口，若仍被受保护进程占用则顺延扫描空闲端口。"""
    cleaned_pids: List[int] = []
    if _is_port_in_use(preferred_port, bind_host=bind_host) and kill_existing:
        cleaned_pids = _cleanup_port_processes(preferred_port, bind_host=bind_host)

    if not _is_port_in_use(preferred_port, bind_host=bind_host):
        return preferred_port, cleaned_pids

    if not auto_port:
        raise OSError(f"端口 {preferred_port} 已被占用且未开启自动顺延 (--auto-port)")

    for candidate in range(preferred_port + 1, preferred_port + 21):
        if not _is_port_in_use(candidate, bind_host=bind_host):
            return candidate, cleaned_pids

    raise OSError(f"端口 {preferred_port}~{preferred_port + 20} 均不可用，请手动指定空闲端口")


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
            live_ips = _detect_lan_ips() or list(RUNTIME_INFO.get("lanIps") or [])
            port = int(RUNTIME_INFO.get("port") or 8765)
            lan_urls = [f"http://{ip}:{port}" for ip in live_ips]
            RUNTIME_INFO["lanIps"] = live_ips
            RUNTIME_INFO["lanUrls"] = lan_urls
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "WMPSES SQLite Backend",
                    "dbPath": str(db_manager.DB_PATH),
                    "counts": counts,
                    "host": RUNTIME_INFO.get("host", "0.0.0.0"),
                    "port": port,
                    "localUrl": RUNTIME_INFO.get("localUrl", f"http://127.0.0.1:{port}"),
                    "lanIps": live_ips,
                    "lanUrls": lan_urls,
                    "cleanedPids": list(RUNTIME_INFO.get("cleanedPids") or []),
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


def run_server(
    host: str = "0.0.0.0",
    port: int = 8765,
    kill_existing: bool = True,
    auto_port: bool = True,
) -> None:
    counts = db_manager.init_db(reset=False)
    resolved_port, cleaned_pids = _resolve_available_port(
        preferred_port=int(port),
        bind_host=host,
        kill_existing=kill_existing,
        auto_port=auto_port,
    )
    lan_ips = _detect_lan_ips()
    local_url = f"http://127.0.0.1:{resolved_port}"
    lan_urls = [f"http://{ip}:{resolved_port}" for ip in lan_ips]

    RUNTIME_INFO.update(
        {
            "host": host,
            "port": resolved_port,
            "localUrl": local_url,
            "lanIps": lan_ips,
            "lanUrls": lan_urls,
            "cleanedPids": cleaned_pids,
        }
    )

    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((host, resolved_port), WMPSESRequestHandler)
    print("=" * 64)
    print(f"WMPSES SQLite 后台服务已启动 (监听 {host}:{resolved_port})")
    if cleaned_pids:
        print(f"端口自检: 已自动清理占用端口 {port} 的旧进程 PID: {', '.join(str(p) for p in cleaned_pids)}")
    if resolved_port != int(port):
        print(f"端口顺延: 原端口 {port} 仍被占用，已自动切换至空闲端口 {resolved_port}")
    print(f"本机教师访问: {local_url}")
    if host in ("0.0.0.0", "::"):
        if lan_urls:
            for idx, u in enumerate(lan_urls, start=1):
                print(f"局域网考场访问[{idx}]: {u}")
        else:
            print("局域网考场访问: 未检测到活跃的非回环局域网 IPv4 地址（仅支持本机访问）")
    print(f"数据库文件: {db_manager.DB_PATH}")
    print(f"初始数据统计: {json.dumps(counts, ensure_ascii=False)}")
    print("=" * 64)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WMPSES SQLite 后台服务（支持局域网与端口自检）")
    parser.add_argument("--host", default=os.environ.get("WMPSES_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("WMPSES_PORT", "8765")))
    parser.add_argument(
        "--kill-existing",
        dest="kill_existing",
        action="store_true",
        default=True,
        help="端口被旧进程占用时自动清理并接管（默认开启）",
    )
    parser.add_argument(
        "--no-kill-existing",
        dest="kill_existing",
        action="store_false",
        help="不自动清理占用端口的已有进程",
    )
    parser.add_argument(
        "--auto-port",
        dest="auto_port",
        action="store_true",
        default=True,
        help="若目标端口无法释放则自动顺延寻找可用端口（默认开启）",
    )
    parser.add_argument(
        "--no-auto-port",
        dest="auto_port",
        action="store_false",
        help="禁用端口占用时自动顺延",
    )
    args = parser.parse_args()
    run_server(
        host=args.host,
        port=args.port,
        kill_existing=args.kill_existing,
        auto_port=args.auto_port,
    )
