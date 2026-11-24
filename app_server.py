#!/usr/bin/env python3
"""
WMPSES 生产级高并发后台服务（FastAPI + Uvicorn 多 Worker + 无状态签名 Token + MySQL 8.0 / SQLite 双引擎）
运行方式：
  uvicorn app_server:app --host 0.0.0.0 --port 8765 --workers 4
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Optional, Set

from fastapi import FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db import backend as db_backend

PROJECT_ROOT = Path(__file__).resolve().parent
AUTH_SECRET = os.environ.get("WMPSES_AUTH_SECRET", "wmpses-prod-change-this-secret-2026").encode("utf-8")
TOKEN_TTL_SECONDS = int(os.environ.get("WMPSES_TOKEN_TTL", str(12 * 60 * 60)))

ALL_AUTH_ROLES: Set[str] = {"考生", "监考员", "考评员", "审题专家", "命题教师", "系统管理员"}
EXAM_SUBMIT_ROLES: Set[str] = {"考生", "审题专家", "命题教师", "系统管理员"}
STAFF_VIEW_ROLES: Set[str] = {"监考员", "考评员", "审题专家", "命题教师", "系统管理员"}
GRADING_ROLES: Set[str] = {"考评员", "审题专家", "命题教师", "系统管理员"}
EDITOR_ROLES: Set[str] = {"审题专家", "命题教师", "系统管理员"}
ADMIN_DANGER_ROLES: Set[str] = {"命题教师", "系统管理员"}

app = FastAPI(title="WMPSES 高并发仿真考试后台服务", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Model-Name", "X-Operator-Name", "X-User-Id"],
    expose_headers=["X-Model-Name", "ETag"],
)


def _b64u_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64u_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def create_signed_token(user: Dict[str, Any]) -> str:
    """无状态 HMAC-SHA256 签名 Token：天然支持多 Worker 共享登录态与服务重启不掉线。"""
    payload = {
        "uid": str(user.get("pk_UserID") or ""),
        "code": str(user.get("UserCode") or ""),
        "name": str(user.get("FullName") or ""),
        "role": str(user.get("RoleType") or "考生"),
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    body_b64 = _b64u_encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = hmac.new(AUTH_SECRET, body_b64.encode("ascii"), hashlib.sha256).digest()
    return f"{body_b64}.{_b64u_encode(sig)}"


def verify_signed_token(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    if not authorization:
        return None
    auth = authorization.strip()
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if "." not in token:
        return None
    body_b64, sig_b64 = token.split(".", 1)
    expected_sig = _b64u_encode(hmac.new(AUTH_SECRET, body_b64.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig_b64, expected_sig):
        return None
    try:
        payload = json.loads(_b64u_decode(body_b64).decode("utf-8"))
    except Exception:
        return None
    if int(payload.get("exp") or 0) <= int(time.time()):
        return None
    return {
        "userId": str(payload.get("uid") or ""),
        "userCode": str(payload.get("code") or ""),
        "fullName": str(payload.get("name") or ""),
        "role": str(payload.get("role") or "考生"),
    }


def require_roles(authorization: Optional[str], allowed: Set[str]) -> Dict[str, Any]:
    sess = verify_signed_token(authorization)
    if not sess:
        raise HTTPException(status_code=401, detail="未登录或登录会话已失效，请重新登录")
    if sess["role"] not in allowed:
        raise HTTPException(status_code=403, detail=f"当前角色「{sess['role']}」无权执行此操作")
    return sess


def _sanitize_user(u: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in u.items() if k != "Password"}


def _sanitize_public_user(u: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "pk_UserID": u.get("pk_UserID", ""),
        "UserCode": u.get("UserCode", ""),
        "FullName": u.get("FullName", ""),
        "RoleType": u.get("RoleType", "考生"),
        "Department": u.get("Department", ""),
    }


@app.exception_handler(HTTPException)
async def http_exc_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": str(exc.detail)})


@app.on_event("startup")
def on_startup() -> None:
    db_backend.init_db(reset=False)


# ======================== 公开读取与媒体缓存接口 ========================

@app.get("/api/health")
def api_health() -> Dict[str, Any]:
    counts = db_backend.init_db(reset=False) if db_backend.get_backend_name() == "sqlite" else db_backend.get_tables_summary().get("counts", {})
    return {
        "ok": True,
        "service": f"WMPSES FastAPI Backend ({db_backend.get_backend_name().upper()})",
        "backend": db_backend.get_backend_name(),
        "counts": counts,
    }


@app.get("/api/bank")
def api_get_bank(
    examId: str = Query("WMPSES-1.1.1-V1"),
    omitImages: int = Query(1),
) -> Dict[str, Any]:
    if db_backend.get_backend_name() == "mysql":
        bank = db_backend.get_question_bank(exam_id=examId, omit_images=bool(omitImages))
    else:
        bank = db_backend.get_question_bank(exam_id=examId)
    return {"ok": True, "backend": db_backend.get_backend_name(), "bank": bank}


@app.get("/api/exam-media")
def api_exam_media(
    request: Request,
    examId: str = Query("WMPSES-1.1.1-V1"),
    kind: str = Query("2d"),
) -> Response:
    media = db_backend.get_exam_media(exam_id=examId, kind=kind) if hasattr(db_backend, "get_exam_media") else None
    if not media:
        raise HTTPException(status_code=404, detail="当前试卷未配置对应底图")
    etag = f'"{media["etag"]}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "public, max-age=86400"})
    return Response(
        content=media["data"],
        media_type=media["mime"],
        headers={"ETag": etag, "Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/scenes")
def api_list_scenes() -> Dict[str, Any]:
    return {"ok": True, "scenes": db_backend.list_exam_scenes()}


@app.get("/api/scene-model")
def api_get_scene_model(request: Request, examId: str = Query("WMPSES-1.1.1-V1")) -> Response:
    model = db_backend.get_scene_3d_model(exam_id=examId)
    if not model:
        raise HTTPException(status_code=404, detail="当前试卷尚未上传自定义 GLB 3D 模型")
    etag = f'"{model.get("etag") or hashlib.md5(model["data"]).hexdigest()}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "public, max-age=86400"})
    return Response(
        content=model["data"],
        media_type="model/gltf-binary",
        headers={
            "X-Model-Name": urllib.parse.quote(model["name"]),
            "ETag": etag,
            "Cache-Control": "public, max-age=86400",
        },
    )


@app.get("/api/templates")
def api_get_templates() -> Dict[str, Any]:
    return {"ok": True, "templates": db_backend.get_widget_templates()}


# ======================== 身份认证与会话接口 ========================

@app.post("/api/auth/login")
async def api_auth_login(request: Request) -> Dict[str, Any]:
    body = await request.json()
    ident = str(body.get("username") or body.get("userCode") or body.get("id") or "").strip()
    pwd = str(body.get("password") or "")
    res = db_backend.authenticate_user(ident, pwd)
    if res.get("ok") and isinstance(res.get("user"), dict):
        token = create_signed_token(res["user"])
        res = {**res, "user": _sanitize_user(res["user"]), "token": token}
    return res


@app.post("/api/auth/logout")
def api_auth_logout() -> Dict[str, Any]:
    return {"ok": True, "message": "已注销登录会话"}


@app.post("/api/auth/password")
async def api_auth_password(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, ALL_AUTH_ROLES)
    body = await request.json()
    res = db_backend.change_user_password(sess["userId"], str(body.get("oldPassword") or ""), str(body.get("newPassword") or ""))
    if res.get("ok") and isinstance(res.get("user"), dict):
        res = {**res, "user": _sanitize_user(res["user"])}
    return res


# ======================== 考务查询、交卷与手工阅卷 ========================

@app.get("/api/users")
def api_get_users(
    role: Optional[str] = Query(None),
    examId: str = Query("WMPSES-1.1.1-V1"),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    sess = verify_signed_token(authorization)
    users = db_backend.get_users(role_type=role)
    if sess and sess["role"] in STAFF_VIEW_ROLES:
        logs = db_backend.get_change_logs(exam_id=examId)
        return {"ok": True, "users": [_sanitize_user(u) for u in users], "changeLogs": logs}
    return {"ok": True, "users": [_sanitize_public_user(u) for u in users], "changeLogs": []}


@app.get("/api/tables")
def api_get_tables(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    require_roles(authorization, STAFF_VIEW_ROLES)
    summary = db_backend.get_tables_summary()
    tables = summary.get("tables")
    if isinstance(tables, dict) and isinstance(tables.get("WMPSES_用户人员"), list):
        tables["WMPSES_用户人员"] = [
            {**r, "Password": "****** (SHA-256已加密)"} if isinstance(r, dict) and "Password" in r else r
            for r in tables["WMPSES_用户人员"]
        ]
    return {"ok": True, **summary}


@app.get("/api/results")
def api_get_results(
    userId: Optional[str] = Query(None),
    examId: Optional[str] = Query(None),
    limit: int = Query(200),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    require_roles(authorization, STAFF_VIEW_ROLES)
    return {"ok": True, "results": db_backend.get_exam_results(user_id=userId, exam_id=examId, limit=limit)}


@app.get("/api/results/detail")
def api_get_result_detail(
    resultId: str = Query(""),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    require_roles(authorization, STAFF_VIEW_ROLES)
    detail = db_backend.get_exam_result_detail(resultId)
    if not detail:
        raise HTTPException(status_code=404, detail="未找到对应考卷记录")
    return {"ok": True, **detail}


@app.post("/api/results")
async def api_post_result(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, EXAM_SUBMIT_ROLES)
    body = await request.json()
    payload = dict(body) if isinstance(body, dict) else {}
    if sess["role"] == "考生":
        payload["userId"] = sess["userId"]
        payload["studentName"] = sess["fullName"]
        payload["examineeId"] = sess["userCode"]
    res = db_backend.save_exam_result(payload)
    return {"ok": True, "message": "成绩及逐题明细已写入数据库", **res}


@app.post("/api/results/grade")
async def api_grade_result(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, GRADING_ROLES)
    body = await request.json()
    try:
        return db_backend.grade_exam_result(
            result_id=str(body.get("resultId") or "").strip(),
            grades=body.get("grades") if isinstance(body, dict) else [],
            reviewer_info={
                "userId": sess["userId"],
                "fullName": sess["fullName"],
                "reviewerName": f"{sess['fullName']} ({sess['role']})",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ======================== 考生答题草稿防丢接口 ========================

@app.get("/api/exam/draft")
def api_get_draft(examId: str = Query("WMPSES-1.1.1-V1"), authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, ALL_AUTH_ROLES)
    draft = db_backend.get_exam_draft(sess["userId"], examId) if hasattr(db_backend, "get_exam_draft") else None
    return {"ok": True, "draft": draft}


@app.post("/api/exam/draft")
async def api_save_draft(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, ALL_AUTH_ROLES)
    body = await request.json()
    if not hasattr(db_backend, "save_exam_draft"):
        return {"ok": True, "skipped": True}
    return db_backend.save_exam_draft(
        user_id=sess["userId"],
        exam_id=str(body.get("examId") or "WMPSES-1.1.1-V1"),
        answers=body.get("answers") if isinstance(body.get("answers"), dict) else {},
        remaining_seconds=int(body.get("remainingSeconds") or 0),
        started_at=str(body.get("startedAt") or ""),
    )


@app.post("/api/exam/draft/clear")
async def api_clear_draft(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, ALL_AUTH_ROLES)
    body = await request.json()
    if hasattr(db_backend, "clear_exam_draft"):
        db_backend.clear_exam_draft(sess["userId"], str(body.get("examId") or "WMPSES-1.1.1-V1"))
    return {"ok": True}


# ======================== 题库、场景、模板与人员管理接口 ========================

@app.post("/api/bank")
async def api_save_bank(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, EDITOR_ROLES)
    body = await request.json()
    bank_payload = body.get("bank") if isinstance(body, dict) and "bank" in body else body
    change_meta = dict(body.get("changeMeta") or {}) if isinstance(body, dict) else {}
    change_meta.setdefault("userId", sess["userId"])
    change_meta.setdefault("operatorName", f"{sess['fullName']} ({sess['role']})")
    res = db_backend.save_question_bank(bank_payload, change_meta=change_meta)
    return {
        "ok": True,
        "message": "已同步写入数据库并记录变更日志",
        "bank": res["bank"],
        "counts": res["counts"],
        "changeLogs": res.get("changeLogs", []),
    }


@app.post("/api/bank/reset")
def api_reset_bank(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    require_roles(authorization, ADMIN_DANGER_ROLES)
    counts = db_backend.init_db(reset=True)
    bank = db_backend.get_question_bank()
    return {"ok": True, "message": "题库已恢复出厂示范数据", "bank": bank, "counts": counts}


@app.post("/api/scenes")
async def api_save_scene(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, EDITOR_ROLES)
    body = await request.json()
    scene_payload = body.get("scene") if isinstance(body, dict) and "scene" in body else body
    change_meta = dict(body.get("changeMeta") or {}) if isinstance(body, dict) else {}
    change_meta.setdefault("userId", sess["userId"])
    change_meta.setdefault("operatorName", f"{sess['fullName']} ({sess['role']})")
    res = db_backend.save_exam_scene(scene_payload, change_meta=change_meta)
    return {"ok": True, "message": "试卷场景已保存", **res}


@app.post("/api/scenes/delete")
async def api_delete_scene(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    require_roles(authorization, ADMIN_DANGER_ROLES)
    body = await request.json()
    exam_id = str(body.get("examId") or body.get("id") or "").strip()
    try:
        res = db_backend.delete_exam_scene(exam_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "message": f"已删除试卷场景 {exam_id}", **res}


@app.post("/api/scene-model")
async def api_upload_scene_model(
    request: Request,
    examId: str = Query("WMPSES-1.1.1-V1"),
    name: Optional[str] = Query(None),
    x_model_name: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    sess = require_roles(authorization, EDITOR_ROLES)
    raw_bytes = await request.body()
    if not raw_bytes or len(raw_bytes) > 150 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="GLB 文件大小无效（限制 1B ~ 150MB）")
    file_name = urllib.parse.unquote(name or x_model_name or "scene.glb")
    try:
        res = db_backend.save_scene_3d_model(
            exam_id=examId,
            file_name=file_name,
            data_bytes=raw_bytes,
            change_meta={"userId": sess["userId"], "operatorName": f"{sess['fullName']} ({sess['role']})"},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "message": f"GLB 模型「{res['modelName']}」已存入数据库", **res}


@app.post("/api/scene-model/clear")
async def api_clear_scene_model(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, EDITOR_ROLES)
    body = await request.json()
    exam_id = str(body.get("examId") or "WMPSES-1.1.1-V1")
    res = db_backend.clear_scene_3d_model(
        exam_id=exam_id,
        change_meta={"userId": sess["userId"], "operatorName": f"{sess['fullName']} ({sess['role']})"},
    )
    return {"ok": True, "message": "已清除自定义 GLB 3D 模型", **res}


@app.post("/api/templates")
async def api_save_template(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    require_roles(authorization, EDITOR_ROLES)
    body = await request.json()
    return db_backend.save_widget_template(body)


@app.post("/api/templates/delete")
async def api_delete_template(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    require_roles(authorization, EDITOR_ROLES)
    body = await request.json()
    key = str(body.get("id") or body.get("code") or "")
    return db_backend.delete_widget_template(key)


@app.post("/api/users")
async def api_save_user(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, EDITOR_ROLES)
    body = await request.json()
    target_role = str(body.get("roleType") or body.get("RoleType") or "考生").strip()
    if target_role == "系统管理员" and sess["role"] != "系统管理员":
        raise HTTPException(status_code=403, detail="仅「系统管理员」可创建或授予系统管理员角色")
    target_uid = str(body.get("pk_UserID") or body.get("id") or "").strip()
    if target_uid and sess["role"] != "系统管理员":
        existing = next((u for u in db_backend.get_users() if u.get("pk_UserID") == target_uid), None)
        if existing and existing.get("RoleType") == "系统管理员":
            raise HTTPException(status_code=403, detail="无权修改「系统管理员」账号信息")
    res = db_backend.save_user(body)
    if isinstance(res.get("user"), dict):
        res = {**res, "user": _sanitize_user(res["user"])}
    return {"ok": True, **res}


@app.post("/api/users/delete")
async def api_delete_user(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    sess = require_roles(authorization, ADMIN_DANGER_ROLES)
    body = await request.json()
    uid = str(body.get("id") or body.get("pk_UserID") or "").strip()
    if not uid:
        raise HTTPException(status_code=400, detail="缺少待删除人员 ID")
    if uid == sess["userId"]:
        raise HTTPException(status_code=403, detail="禁止删除当前正在登录的本人账号")
    if sess["role"] != "系统管理员":
        existing = next((u for u in db_backend.get_users() if u.get("pk_UserID") == uid), None)
        if existing and existing.get("RoleType") == "系统管理员":
            raise HTTPException(status_code=403, detail="仅「系统管理员」可删除系统管理员账号")
    return db_backend.delete_user(uid)
