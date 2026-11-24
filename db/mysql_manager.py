"""
WMPSES MySQL 8.0 数据持久化层（基于 PyMySQL + 线程安全轻量连接池）
接口签名与 db/db_manager.py 保持 1:1 一致，支持 70~200+ 人并发考试、交卷幂等与答题草稿防丢。
"""

from __future__ import annotations

import base64
import contextlib
import datetime
import hashlib
import json
import os
import queue
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import pymysql
from pymysql.cursors import DictCursor

DB_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DB_DIR.parent
SCHEMA_MYSQL_PATH = DB_DIR / "schema_mysql.sql"
DEFAULT_IMAGE_PATH = PROJECT_ROOT / "assets" / "plant-panorama.jpg"

DEFAULT_PASSWORD_PLAIN = "123456"
DEFAULT_PASSWORD_HASH = hashlib.sha256(DEFAULT_PASSWORD_PLAIN.encode("utf-8")).hexdigest()

TABLE_NAMES = [
    "WMPSES_试卷场景",
    "WMPSES_设备热点",
    "WMPSES_习题库",
    "WMPSES_考试记录",
    "WMPSES_作答明细",
    "WMPSES_否定项规则",
    "WMPSES_验收规范与确认单",
    "WMPSES_工况资料与引用标准",
    "WMPSES_用户人员",
    "WMPSES_题库变更日志",
    "WMPSES_工况卡片模板",
    "WMPSES_答题草稿",
]

_POOL_LOCK = threading.Lock()
_POOL: Optional[queue.LifoQueue] = None
_POOL_MAX = int(os.environ.get("WMPSES_MYSQL_POOL_SIZE", "24"))


def hash_password(raw_password: str) -> str:
    s = str(raw_password or "").strip()
    if len(s) == 64 and all(c in "0123456789abcdefABCDEF" for c in s):
        return s.lower()
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _mysql_connect_kwargs() -> Dict[str, Any]:
    return {
        "host": os.environ.get("WMPSES_MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("WMPSES_MYSQL_PORT", "3306")),
        "user": os.environ.get("WMPSES_MYSQL_USER", "wmpses"),
        "password": os.environ.get("WMPSES_MYSQL_PASSWORD", "wmpses123456"),
        "database": os.environ.get("WMPSES_MYSQL_DATABASE", "wmpses"),
        "charset": "utf8mb4",
        "cursorclass": DictCursor,
        "autocommit": False,
        "connect_timeout": 10,
        "read_timeout": 30,
        "write_timeout": 30,
    }


def _get_pool() -> queue.LifoQueue:
    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                _POOL = queue.LifoQueue(maxsize=_POOL_MAX)
    return _POOL


@contextlib.contextmanager
def get_connection() -> Iterator[pymysql.connections.Connection]:
    pool = _get_pool()
    conn = None
    try:
        conn = pool.get_nowait()
        conn.ping(reconnect=True)
    except queue.Empty:
        conn = pymysql.connect(**_mysql_connect_kwargs())
    except Exception:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        conn = pymysql.connect(**_mysql_connect_kwargs())

    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            pool.put_nowait(conn)
        except queue.Full:
            try:
                conn.close()
            except Exception:
                pass


def _get_default_exam_picture_data_uri() -> str:
    if DEFAULT_IMAGE_PATH.exists():
        b64 = base64.b64encode(DEFAULT_IMAGE_PATH.read_bytes()).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"
    return ""


def get_table_counts(conn: pymysql.connections.Connection) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    with conn.cursor() as cur:
        for tbl in TABLE_NAMES:
            cur.execute(f"SELECT COUNT(1) AS cnt FROM `{tbl}`")
            row = cur.fetchone()
            counts[tbl] = int(row["cnt"]) if row else 0
    return counts


def init_db(reset: bool = False) -> Dict[str, int]:
    """初始化 MySQL 表结构；若表为空且本地存在 SQLite/CSV 种子，可通过迁移脚本导入。"""
    sql_text = SCHEMA_MYSQL_PATH.read_text(encoding="utf-8")
    statements = [s.strip() for s in sql_text.split(";") if s.strip() and not s.strip().startswith("--")]
    with get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        counts = get_table_counts(conn)
    if reset:
        from db import migrate_sqlite_to_mysql
        migrate_sqlite_to_mysql.migrate(truncate_target=True)
        with get_connection() as conn:
            counts = get_table_counts(conn)
    return counts


def _row_to_template_dict(tr: Dict[str, Any]) -> Dict[str, Any]:
    raw_schema = tr.get("ParamSchemaJSON") or "[]"
    try:
        schema = json.loads(raw_schema)
        if not isinstance(schema, list):
            schema = []
    except Exception:
        schema = []
    return {
        "id": tr["pk_TemplateID"],
        "code": tr["TemplateCode"],
        "name": tr["TemplateName"],
        "isBuiltin": bool(tr["IsBuiltin"]),
        "leftPanelType": tr["LeftPanelType"] or "gauge_dial",
        "leftPanelTitle": tr["LeftPanelTitle"] or "",
        "leftPanelCode": tr["LeftPanelCode"] or "",
        "rightPanelType": tr["RightPanelType"] or "dcs_interlock",
        "rightPanelTitle": tr["RightPanelTitle"] or "",
        "rightPanelCode": tr["RightPanelCode"] or "",
        "paramSchema": schema,
        "customImageBase64": tr["CustomImageBase64"] or "",
        "sortOrder": int(tr["SortOrder"] or 10),
        "updatedAt": tr["UpdatedAt"] or "",
    }


def list_exam_scenes() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    e.`pk_ExamID`, e.`Title`, e.`Subtitle`, e.`ExamCode`, e.`VariantCode`,
                    e.`TotalScore`, e.`PassScore`, e.`DurationMinutes`, e.`Status`, e.`Version`, e.`UpdatedAt`,
                    CHAR_LENGTH(e.`ExamPicture`) AS `ExamPictureLen`,
                    CHAR_LENGTH(e.`ExamPicture3D`) AS `ExamPicture3DLen`,
                    e.`Scene3DModelName`,
                    OCTET_LENGTH(e.`Scene3DModelBLOB`) AS `Scene3DModelSize`,
                    (SELECT COUNT(1) FROM `WMPSES_设备热点` h WHERE h.`fk_ExamID` = e.`pk_ExamID`) AS `HotspotCount`,
                    (SELECT COUNT(1) FROM `WMPSES_习题库` q WHERE q.`fk_ExamID` = e.`pk_ExamID` AND q.`fk_HotspotID` IS NOT NULL) AS `QuestionCount`
                FROM `WMPSES_试卷场景` e
                ORDER BY CASE WHEN e.`pk_ExamID` = 'WMPSES-1.1.1-V1' THEN 0 ELSE 1 END, e.`pk_ExamID` ASC
                """
            )
            rows = cur.fetchall()
    return [
        {
            "id": r["pk_ExamID"],
            "title": r["Title"],
            "subtitle": r["Subtitle"],
            "examCode": r["ExamCode"],
            "variantCode": r["VariantCode"],
            "totalScore": int(r["TotalScore"] or 50),
            "passScore": int(r["PassScore"] or 30),
            "durationMinutes": int(r["DurationMinutes"] or 30),
            "status": r["Status"] or "已启用",
            "version": r["Version"] or "1.0.0",
            "updatedAt": r["UpdatedAt"] or "",
            "hasExamPicture": bool(r["ExamPictureLen"]),
            "hasExamPicture3d": bool(r["ExamPicture3DLen"]),
            "hasScene3dModel": bool(r["Scene3DModelSize"]),
            "scene3dModelName": r["Scene3DModelName"] or "",
            "scene3dModelSize": int(r["Scene3DModelSize"] or 0),
            "hotspotCount": int(r["HotspotCount"] or 0),
            "questionCount": int(r["QuestionCount"] or 0),
        }
        for r in rows
    ]


def get_exam_media(exam_id: str, kind: str = "2d") -> Optional[Dict[str, Any]]:
    """返回指定试卷的 2D 或 3D 底图原始二进制字节与 MIME 类型（供浏览器与 Nginx 强缓存）。"""
    col = "ExamPicture3D" if kind == "3d" else "ExamPicture"
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT `{col}` AS img FROM `WMPSES_试卷场景` WHERE `pk_ExamID` = %s", (exam_id,))
            row = cur.fetchone()
    raw_uri = (row["img"] if row else "") or ""
    if not raw_uri and kind == "2d" and DEFAULT_IMAGE_PATH.exists():
        data = DEFAULT_IMAGE_PATH.read_bytes()
        return {"mime": "image/jpeg", "data": data, "etag": hashlib.md5(data).hexdigest()}
    if not raw_uri or not raw_uri.startswith("data:image/"):
        return None
    header, _, b64_part = raw_uri.partition(",")
    mime = header[5:].split(";")[0] if ";" in header else "image/jpeg"
    data = base64.b64decode(b64_part)
    return {"mime": mime, "data": data, "etag": hashlib.md5(data).hexdigest()}


def get_question_bank(exam_id: str = "WMPSES-1.1.1-V1", omit_images: bool = False) -> Dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM `WMPSES_试卷场景` WHERE `pk_ExamID` = %s", (exam_id,))
            exam_row = cur.fetchone()
            if exam_row is None:
                cur.execute("SELECT * FROM `WMPSES_试卷场景` ORDER BY `pk_ExamID` ASC LIMIT 1")
                exam_row = cur.fetchone()
            if exam_row is None:
                raise ValueError("MySQL 数据库中尚无试卷场景，请先执行迁移脚本导入初始数据")
            actual_exam_id = exam_row["pk_ExamID"]

            cur.execute(
                "SELECT * FROM `WMPSES_设备热点` WHERE `fk_ExamID` = %s ORDER BY `SortOrder` ASC, `pk_HotspotID` ASC",
                (actual_exam_id,),
            )
            hotspot_rows = cur.fetchall()
            cur.execute(
                "SELECT * FROM `WMPSES_习题库` WHERE `fk_ExamID` = %s ORDER BY `SortOrder` ASC, `pk_QuestionID` ASC",
                (actual_exam_id,),
            )
            question_rows = cur.fetchall()
            cur.execute(
                "SELECT * FROM `WMPSES_否定项规则` WHERE `fk_ExamID` = %s ORDER BY `SortOrder` ASC",
                (actual_exam_id,),
            )
            veto_rows = cur.fetchall()
            cur.execute(
                "SELECT * FROM `WMPSES_验收规范与确认单` WHERE `fk_ExamID` = %s ORDER BY `ItemNo` ASC",
                (actual_exam_id,),
            )
            chk_rows = cur.fetchall()
            cur.execute(
                "SELECT * FROM `WMPSES_工况资料与引用标准` WHERE `fk_ExamID` = %s ORDER BY `DocCategory`, `SortOrder` ASC",
                (actual_exam_id,),
            )
            doc_rows = cur.fetchall()
            cur.execute("SELECT * FROM `WMPSES_工况卡片模板` ORDER BY `IsBuiltin` DESC, `SortOrder` ASC")
            tpl_rows = cur.fetchall()

    q_by_hs: Dict[str, List[Dict[str, Any]]] = {}
    unassigned_questions: List[Dict[str, Any]] = []
    valid_hs_ids = {hr["pk_HotspotID"] for hr in hotspot_rows}

    for qr in question_rows:
        options = []
        for k in ("A", "B", "C", "D", "E"):
            val = qr.get(f"Option{k}")
            if val is not None and str(val) != "":
                options.append({"key": k, "text": val})
        answers = [a.strip() for a in str(qr.get("AnswerKeys") or "").replace("，", ",").split(",") if a.strip()]
        q_type = qr.get("QuestionType") or "single"
        q_obj = {
            "id": qr["pk_QuestionID"],
            "defectCode": qr.get("DefectCode") or "",
            "defectLevel": qr.get("DefectLevel") or "general",
            "isMajorDefect": bool(qr.get("IsMajorDefect")),
            "isCriticalConclusion": bool(qr.get("IsCriticalConclusion")),
            "type": q_type,
            "score": int(qr.get("Score") or 2),
            "title": qr["QuestionTitle"],
            "options": options,
            "answer": [] if q_type == "short_answer" else (answers or ["A"]),
            "referenceStandard": qr.get("ReferenceStandard") or "",
            "explanation": qr.get("Explanation") or "",
        }
        fk_hs = qr.get("fk_HotspotID")
        if fk_hs and fk_hs in valid_hs_ids:
            q_by_hs.setdefault(fk_hs, []).append(q_obj)
        else:
            unassigned_questions.append(q_obj)

    hotspots = []
    for hr in hotspot_rows:
        hs_id = hr["pk_HotspotID"]
        try:
            wp = json.loads(hr.get("WidgetParamsJSON") or "{}")
            if not isinstance(wp, dict):
                wp = {}
        except Exception:
            wp = {}
        hotspots.append({
            "id": hs_id,
            "order": int(hr.get("SortOrder") or 1),
            "code": hr.get("DeviceCode") or "",
            "name": hr["DeviceName"],
            "category": hr.get("Category") or "现场设备核查",
            "x": float(hr.get("CoordX") or 50.0),
            "y": float(hr.get("CoordY") or 50.0),
            "widgetType": hr.get("WidgetType") or "generic",
            "widgetParams": wp,
            "sceneSummary": hr.get("SceneSummary") or "",
            "questions": q_by_hs.get(hs_id, []),
        })

    veto_rules = [
        {
            "id": vr["pk_RuleID"],
            "order": int(vr.get("SortOrder") or 1),
            "code": vr["RuleCode"],
            "name": vr["RuleName"],
            "conditionType": vr["ConditionType"],
            "thresholdValue": float(vr.get("ThresholdValue") or 1),
            "targetRef": vr.get("TargetRef") or "",
            "penaltyAction": vr.get("PenaltyAction") or "ZERO_SCORE",
            "isEnabled": bool(vr.get("IsEnabled")),
            "alertMessage": vr.get("AlertMessage") or "",
        }
        for vr in veto_rows
    ]
    checklist_items = [
        {
            "id": cr["pk_CheckItemID"],
            "hotspotId": cr.get("fk_HotspotID") or "",
            "itemNo": int(cr.get("ItemNo") or 1),
            "aspectName": cr["AspectName"],
            "checkItemName": cr["CheckItemName"],
            "interactionWay": cr.get("InteractionWay") or "",
            "standardBasis": cr.get("StandardBasis") or "",
            "sceneStatus": cr.get("SceneStatus") or "",
            "standardConclusion": cr.get("StandardConclusion") or "合格",
            "relatedDefectCode": cr.get("RelatedDefectCode") or "",
        }
        for cr in chk_rows
    ]
    scenario_docs = [
        {
            "id": dr["pk_DocID"],
            "docCategory": dr["DocCategory"],
            "sortOrder": int(dr.get("SortOrder") or 1),
            "docCode": dr.get("DocCode") or "",
            "docTitle": dr["DocTitle"],
            "deptOrCategory": dr.get("DeptOrCategory") or "",
            "contentSummary": dr.get("ContentSummary") or "",
            "relatedHotspotCode": dr.get("RelatedHotspotCode") or "",
        }
        for dr in doc_rows
    ]
    widget_templates = [_row_to_template_dict(tr) for tr in tpl_rows]

    total_score = sum(q["score"] for hs in hotspots for q in hs["questions"])
    has_pic_2d = bool(exam_row.get("ExamPicture"))
    has_pic_3d = bool(exam_row.get("ExamPicture3D"))
    if omit_images:
        exam_picture = f"/api/exam-media?examId={actual_exam_id}&kind=2d"
        exam_picture_3d = f"/api/exam-media?examId={actual_exam_id}&kind=3d" if has_pic_3d else ""
    else:
        exam_picture = exam_row.get("ExamPicture") or _get_default_exam_picture_data_uri()
        exam_picture_3d = exam_row.get("ExamPicture3D") or ""

    model_blob = exam_row.get("Scene3DModelBLOB")
    model_size = len(model_blob) if model_blob else 0

    return {
        "meta": {
            "id": actual_exam_id,
            "title": exam_row["Title"],
            "subtitle": exam_row["Subtitle"],
            "examCode": exam_row["ExamCode"],
            "totalScore": total_score if total_score > 0 else int(exam_row.get("TotalScore") or 50),
            "passScore": int(exam_row.get("PassScore") or 30),
            "durationMinutes": int(exam_row.get("DurationMinutes") or 30),
            "version": exam_row.get("Version") or "1.0.0",
            "updatedAt": exam_row.get("UpdatedAt") or datetime.date.today().isoformat(),
            "examPicture": exam_picture,
            "examPicture3d": exam_picture_3d,
            "hasScene3dModel": model_size > 0,
            "scene3dModelName": exam_row.get("Scene3DModelName") or "",
            "scene3dModelSize": model_size,
        },
        "hotspots": hotspots,
        "unassignedQuestions": unassigned_questions,
        "vetoRules": veto_rules,
        "checklistItems": checklist_items,
        "scenarioDocs": scenario_docs,
        "widgetTemplates": widget_templates,
    }


def save_question_bank(bank: Dict[str, Any], change_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cm = change_meta or {}
    meta = bank.get("meta") or {}
    exam_id = str(meta.get("id") or "WMPSES-1.1.1-V1")
    hotspots = bank.get("hotspots") or []
    unassigned = bank.get("unassignedQuestions") or []
    today_str = datetime.date.today().isoformat()
    calc_total = sum(int(q.get("score") or 2) for hs in hotspots for q in (hs.get("questions") or []))

    raw_pic_2d = str(meta.get("examPicture") or "")
    raw_pic_3d = str(meta.get("examPicture3d") or meta.get("examPicture3D") or "")
    pic_2d_to_save = raw_pic_2d if raw_pic_2d.startswith("data:image/") else ""
    pic_3d_to_save = raw_pic_3d if raw_pic_3d.startswith("data:image/") else ""
    clear_3d = bool(meta.get("clearExamPicture3d"))

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO `WMPSES_试卷场景` (
                    `pk_ExamID`, `Title`, `Subtitle`, `ExamCode`, `VariantCode`,
                    `TotalScore`, `PassScore`, `DurationMinutes`, `Status`, `Version`, `UpdatedAt`, `ExamPicture`, `ExamPicture3D`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    `Title`=VALUES(`Title`),
                    `Subtitle`=VALUES(`Subtitle`),
                    `ExamCode`=VALUES(`ExamCode`),
                    `TotalScore`=VALUES(`TotalScore`),
                    `PassScore`=VALUES(`PassScore`),
                    `DurationMinutes`=VALUES(`DurationMinutes`),
                    `Version`=VALUES(`Version`),
                    `UpdatedAt`=VALUES(`UpdatedAt`),
                    `ExamPicture`=IF(VALUES(`ExamPicture`) != '', VALUES(`ExamPicture`), `ExamPicture`),
                    `ExamPicture3D`=IF(%s = 1, '', IF(VALUES(`ExamPicture3D`) != '', VALUES(`ExamPicture3D`), `ExamPicture3D`))
                """,
                (
                    exam_id,
                    meta.get("title") or "工业废气治理工（二级/技师）实操模拟仿真考试系统",
                    meta.get("subtitle") or "1.1.1 系统启动前设备验收",
                    meta.get("examCode") or "6-28-02-05 / 1.1.1",
                    meta.get("variantCode") or ("V2" if exam_id.endswith("V2") else "V1"),
                    calc_total if calc_total > 0 else int(meta.get("totalScore") or 50),
                    int(meta.get("passScore") or 30),
                    int(meta.get("durationMinutes") or 30),
                    meta.get("status") or "已启用",
                    meta.get("version") or "1.0.0",
                    today_str,
                    pic_2d_to_save,
                    pic_3d_to_save,
                    1 if clear_3d else 0,
                ),
            )

            keep_hs_ids = [str(hs.get("id")) for hs in hotspots if hs.get("id")]
            if keep_hs_ids:
                ph = ",".join("%s" for _ in keep_hs_ids)
                cur.execute(
                    f"DELETE FROM `WMPSES_设备热点` WHERE `fk_ExamID` = %s AND `pk_HotspotID` NOT IN ({ph})",
                    [exam_id, *keep_hs_ids],
                )
            else:
                cur.execute("DELETE FROM `WMPSES_设备热点` WHERE `fk_ExamID` = %s", (exam_id,))

            keep_q_ids = [str(q.get("id")) for hs in hotspots for q in (hs.get("questions") or []) if q.get("id")]
            keep_q_ids.extend(str(q.get("id")) for q in unassigned if q.get("id"))
            if keep_q_ids:
                ph = ",".join("%s" for _ in keep_q_ids)
                cur.execute(
                    f"DELETE FROM `WMPSES_习题库` WHERE `fk_ExamID` = %s AND `pk_QuestionID` NOT IN ({ph})",
                    [exam_id, *keep_q_ids],
                )
            else:
                cur.execute("DELETE FROM `WMPSES_习题库` WHERE `fk_ExamID` = %s", (exam_id,))

            for idx, hs in enumerate(hotspots):
                hs_id = str(hs.get("id") or f"hs-{idx + 1}")
                wp_raw = hs.get("widgetParams")
                wp_json = json.dumps(wp_raw, ensure_ascii=False) if isinstance(wp_raw, dict) else (str(wp_raw) if wp_raw else "{}")
                cur.execute(
                    """
                    INSERT INTO `WMPSES_设备热点` (
                        `pk_HotspotID`, `fk_ExamID`, `SortOrder`, `DeviceCode`, `DeviceName`,
                        `Category`, `CoordX`, `CoordY`, `WidgetType`, `SceneSummary`, `WidgetParamsJSON`
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        `fk_ExamID`=VALUES(`fk_ExamID`), `SortOrder`=VALUES(`SortOrder`),
                        `DeviceCode`=VALUES(`DeviceCode`), `DeviceName`=VALUES(`DeviceName`),
                        `Category`=VALUES(`Category`), `CoordX`=VALUES(`CoordX`), `CoordY`=VALUES(`CoordY`),
                        `WidgetType`=VALUES(`WidgetType`), `SceneSummary`=VALUES(`SceneSummary`),
                        `WidgetParamsJSON`=VALUES(`WidgetParamsJSON`)
                    """,
                    (
                        hs_id, exam_id, int(hs.get("order") or (idx + 1)),
                        hs.get("code") or f"DEV-{idx + 1:02d}",
                        hs.get("name") or f"设备部位 {idx + 1}",
                        hs.get("category") or "现场设备核查",
                        round(float(hs.get("x") or 50.0), 1),
                        round(float(hs.get("y") or 50.0), 1),
                        hs.get("widgetType") or "generic",
                        hs.get("sceneSummary") or "",
                        wp_json,
                    ),
                )
                for q_idx, q in enumerate(hs.get("questions") or []):
                    _upsert_question_row(cur, exam_id, hs_id, q_idx + 1, q)

            for u_idx, q in enumerate(unassigned):
                _upsert_question_row(cur, exam_id, None, u_idx + 1, q)

            _upsert_design_tables(cur, exam_id, bank)

            q_count = sum(len(hs.get("questions") or []) for hs in hotspots)
            cur.execute(
                """
                INSERT INTO `WMPSES_题库变更日志` (
                    `pk_LogID`, `fk_ExamID`, `fk_UserID`, `OperatorName`, `ActionType`,
                    `VersionAfter`, `HotspotCount`, `QuestionCount`, `TotalScore`, `ChangeSummary`, `ChangedAt`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    f"LOG-{uuid.uuid4().hex[:8].upper()}",
                    exam_id,
                    str(cm.get("userId") or "USR-TC-001"),
                    str(cm.get("operatorName") or "命题教师"),
                    str(cm.get("actionType") or "编辑更新题库"),
                    str(meta.get("version") or "1.0.0"),
                    len(hotspots),
                    q_count,
                    calc_total,
                    str(cm.get("changeSummary") or f"更新热点 {len(hotspots)} 项、习题 {q_count} 道"),
                    datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
            counts = get_table_counts(conn)

    return {
        "bank": get_question_bank(exam_id=exam_id, omit_images=True),
        "counts": counts,
        "changeLogs": get_change_logs(exam_id=exam_id),
    }


def _upsert_question_row(cur: Any, exam_id: str, hs_id: Optional[str], sort_order: int, q: Dict[str, Any]) -> None:
    q_id = str(q.get("id") or f"q-{uuid.uuid4().hex[:8]}")
    q_type = str(q.get("type") or "single")
    opt_map = {str(o.get("key") or ""): str(o.get("text") or "") for o in (q.get("options") or [])}
    ans_str = "" if q_type == "short_answer" else ",".join(str(a) for a in (q.get("answer") or ["A"]))
    defect_level = str(q.get("defectLevel") or "general")
    cur.execute(
        """
        INSERT INTO `WMPSES_习题库` (
            `pk_QuestionID`, `fk_HotspotID`, `fk_ExamID`, `SortOrder`,
            `DefectCode`, `DefectLevel`, `IsMajorDefect`, `IsCriticalConclusion`,
            `QuestionType`, `Score`, `QuestionTitle`,
            `OptionA`, `OptionB`, `OptionC`, `OptionD`, `OptionE`,
            `AnswerKeys`, `ReferenceStandard`, `Explanation`
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            `fk_HotspotID`=VALUES(`fk_HotspotID`), `fk_ExamID`=VALUES(`fk_ExamID`),
            `SortOrder`=VALUES(`SortOrder`), `DefectCode`=VALUES(`DefectCode`),
            `DefectLevel`=VALUES(`DefectLevel`), `IsMajorDefect`=VALUES(`IsMajorDefect`),
            `IsCriticalConclusion`=VALUES(`IsCriticalConclusion`), `QuestionType`=VALUES(`QuestionType`),
            `Score`=VALUES(`Score`), `QuestionTitle`=VALUES(`QuestionTitle`),
            `OptionA`=VALUES(`OptionA`), `OptionB`=VALUES(`OptionB`), `OptionC`=VALUES(`OptionC`),
            `OptionD`=VALUES(`OptionD`), `OptionE`=VALUES(`OptionE`),
            `AnswerKeys`=VALUES(`AnswerKeys`), `ReferenceStandard`=VALUES(`ReferenceStandard`),
            `Explanation`=VALUES(`Explanation`)
        """,
        (
            q_id, hs_id, exam_id, sort_order,
            q.get("defectCode") or "", defect_level,
            1 if (q.get("isMajorDefect") or defect_level == "major") else 0,
            1 if (q.get("isCriticalConclusion") or defect_level == "critical") else 0,
            q_type, int(q.get("score") or 2), q.get("title") or "",
            opt_map.get("A", ""), opt_map.get("B", ""), opt_map.get("C", ""), opt_map.get("D", ""), opt_map.get("E", ""),
            ans_str, q.get("referenceStandard") or "", q.get("explanation") or "",
        ),
    )


def _upsert_design_tables(cur: Any, exam_id: str, bank: Dict[str, Any]) -> None:
    veto_rules = bank.get("vetoRules")
    if isinstance(veto_rules, list):
        keep_ids = [str(r.get("id")) for r in veto_rules if r.get("id")]
        if keep_ids:
            ph = ",".join("%s" for _ in keep_ids)
            cur.execute(f"DELETE FROM `WMPSES_否定项规则` WHERE `fk_ExamID` = %s AND `pk_RuleID` NOT IN ({ph})", [exam_id, *keep_ids])
        else:
            cur.execute("DELETE FROM `WMPSES_否定项规则` WHERE `fk_ExamID` = %s", (exam_id,))
        for idx, r in enumerate(veto_rules):
            rid = str(r.get("id") or f"N-{idx + 1}")
            cur.execute(
                """
                INSERT INTO `WMPSES_否定项规则` (
                    `pk_RuleID`, `fk_ExamID`, `SortOrder`, `RuleCode`, `RuleName`,
                    `ConditionType`, `ThresholdValue`, `TargetRef`, `PenaltyAction`, `IsEnabled`, `AlertMessage`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    `SortOrder`=VALUES(`SortOrder`), `RuleCode`=VALUES(`RuleCode`), `RuleName`=VALUES(`RuleName`),
                    `ConditionType`=VALUES(`ConditionType`), `ThresholdValue`=VALUES(`ThresholdValue`),
                    `TargetRef`=VALUES(`TargetRef`), `PenaltyAction`=VALUES(`PenaltyAction`),
                    `IsEnabled`=VALUES(`IsEnabled`), `AlertMessage`=VALUES(`AlertMessage`)
                """,
                (
                    rid, exam_id, int(r.get("order") or (idx + 1)),
                    r.get("code") or rid, r.get("name") or "未命名否定项",
                    r.get("conditionType") or "QUESTION_WRONG",
                    float(r.get("thresholdValue") if r.get("thresholdValue") is not None else 1),
                    r.get("targetRef") or "", r.get("penaltyAction") or "ZERO_SCORE",
                    1 if r.get("isEnabled", True) else 0, r.get("alertMessage") or "",
                ),
            )

    checklist = bank.get("checklistItems")
    if isinstance(checklist, list):
        keep_ids = [str(c.get("id")) for c in checklist if c.get("id")]
        if keep_ids:
            ph = ",".join("%s" for _ in keep_ids)
            cur.execute(f"DELETE FROM `WMPSES_验收规范与确认单` WHERE `fk_ExamID` = %s AND `pk_CheckItemID` NOT IN ({ph})", [exam_id, *keep_ids])
        else:
            cur.execute("DELETE FROM `WMPSES_验收规范与确认单` WHERE `fk_ExamID` = %s", (exam_id,))
        for idx, c in enumerate(checklist):
            cid = str(c.get("id") or f"CHK-{idx + 1:02d}")
            cur.execute(
                """
                INSERT INTO `WMPSES_验收规范与确认单` (
                    `pk_CheckItemID`, `fk_ExamID`, `fk_HotspotID`, `ItemNo`, `AspectName`,
                    `CheckItemName`, `InteractionWay`, `StandardBasis`, `SceneStatus`, `StandardConclusion`, `RelatedDefectCode`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    `fk_HotspotID`=VALUES(`fk_HotspotID`), `ItemNo`=VALUES(`ItemNo`),
                    `AspectName`=VALUES(`AspectName`), `CheckItemName`=VALUES(`CheckItemName`),
                    `InteractionWay`=VALUES(`InteractionWay`), `StandardBasis`=VALUES(`StandardBasis`),
                    `SceneStatus`=VALUES(`SceneStatus`), `StandardConclusion`=VALUES(`StandardConclusion`),
                    `RelatedDefectCode`=VALUES(`RelatedDefectCode`)
                """,
                (
                    cid, exam_id, c.get("hotspotId") or "", int(c.get("itemNo") or (idx + 1)),
                    c.get("aspectName") or "", c.get("checkItemName") or "",
                    c.get("interactionWay") or "", c.get("standardBasis") or "",
                    c.get("sceneStatus") or "", c.get("standardConclusion") or "合格",
                    c.get("relatedDefectCode") or "",
                ),
            )

    docs = bank.get("scenarioDocs")
    if isinstance(docs, list):
        keep_ids = [str(d.get("id")) for d in docs if d.get("id")]
        if keep_ids:
            ph = ",".join("%s" for _ in keep_ids)
            cur.execute(f"DELETE FROM `WMPSES_工况资料与引用标准` WHERE `fk_ExamID` = %s AND `pk_DocID` NOT IN ({ph})", [exam_id, *keep_ids])
        else:
            cur.execute("DELETE FROM `WMPSES_工况资料与引用标准` WHERE `fk_ExamID` = %s", (exam_id,))
        for idx, d in enumerate(docs):
            did = str(d.get("id") or f"DOC-{idx + 1:02d}")
            cur.execute(
                """
                INSERT INTO `WMPSES_工况资料与引用标准` (
                    `pk_DocID`, `fk_ExamID`, `DocCategory`, `SortOrder`, `DocCode`,
                    `DocTitle`, `DeptOrCategory`, `ContentSummary`, `RelatedHotspotCode`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    `DocCategory`=VALUES(`DocCategory`), `SortOrder`=VALUES(`SortOrder`),
                    `DocCode`=VALUES(`DocCode`), `DocTitle`=VALUES(`DocTitle`),
                    `DeptOrCategory`=VALUES(`DeptOrCategory`), `ContentSummary`=VALUES(`ContentSummary`),
                    `RelatedHotspotCode`=VALUES(`RelatedHotspotCode`)
                """,
                (
                    did, exam_id, d.get("docCategory") or "工况台账", int(d.get("sortOrder") or (idx + 1)),
                    d.get("docCode") or "", d.get("docTitle") or "", d.get("deptOrCategory") or "",
                    d.get("contentSummary") or "", d.get("relatedHotspotCode") or "",
                ),
            )


def save_exam_scene(scene: Dict[str, Any], change_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    exam_id = str(scene.get("id") or scene.get("pk_ExamID") or "").strip()
    if not exam_id:
        raise ValueError("试卷场景 ID (pk_ExamID) 不能为空")
    today_str = datetime.date.today().isoformat()
    pic_2d = str(scene.get("examPicture") or "")
    pic_3d = str(scene.get("examPicture3d") or "")
    clear_2d = 1 if scene.get("clearExamPicture") else 0
    clear_3d = 1 if scene.get("clearExamPicture3d") else 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO `WMPSES_试卷场景` (
                    `pk_ExamID`, `Title`, `Subtitle`, `ExamCode`, `VariantCode`,
                    `TotalScore`, `PassScore`, `DurationMinutes`, `Status`, `Version`, `UpdatedAt`, `ExamPicture`, `ExamPicture3D`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    `Title`=VALUES(`Title`), `Subtitle`=VALUES(`Subtitle`), `ExamCode`=VALUES(`ExamCode`),
                    `VariantCode`=VALUES(`VariantCode`), `TotalScore`=VALUES(`TotalScore`),
                    `PassScore`=VALUES(`PassScore`), `DurationMinutes`=VALUES(`DurationMinutes`),
                    `Status`=VALUES(`Status`), `Version`=VALUES(`Version`), `UpdatedAt`=VALUES(`UpdatedAt`),
                    `ExamPicture`=IF(%s = 1, '', IF(VALUES(`ExamPicture`) != '', VALUES(`ExamPicture`), `ExamPicture`)),
                    `ExamPicture3D`=IF(%s = 1, '', IF(VALUES(`ExamPicture3D`) != '', VALUES(`ExamPicture3D`), `ExamPicture3D`))
                """,
                (
                    exam_id,
                    scene.get("title") or "自定义考核场景",
                    scene.get("subtitle") or "",
                    scene.get("examCode") or "6-28-02-05 / 1.1.1",
                    scene.get("variantCode") or "V1",
                    int(scene.get("totalScore") or 50),
                    int(scene.get("passScore") or 30),
                    int(scene.get("durationMinutes") or 30),
                    scene.get("status") or "已启用",
                    scene.get("version") or "1.0.0",
                    today_str,
                    pic_2d if pic_2d.startswith("data:image/") else "",
                    pic_3d if pic_3d.startswith("data:image/") else "",
                    clear_2d,
                    clear_3d,
                ),
            )
    scenes = list_exam_scenes()
    saved = next((s for s in scenes if s["id"] == exam_id), None)
    return {"scene": saved, "scenes": scenes}


def delete_exam_scene(exam_id: str) -> Dict[str, Any]:
    eid = str(exam_id or "").strip()
    if not eid or eid == "WMPSES-1.1.1-V1":
        raise ValueError("主基准试卷场景 WMPSES-1.1.1-V1 受保护，不可删除")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM `WMPSES_试卷场景` WHERE `pk_ExamID` = %s", (eid,))
    return {"scenes": list_exam_scenes()}


def get_scene_3d_model(exam_id: str = "WMPSES-1.1.1-V1") -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT `Scene3DModelName`, `Scene3DModelBLOB` FROM `WMPSES_试卷场景` WHERE `pk_ExamID` = %s",
                (exam_id,),
            )
            row = cur.fetchone()
    if not row or not row.get("Scene3DModelBLOB"):
        return None
    raw = bytes(row["Scene3DModelBLOB"])
    return {"name": row.get("Scene3DModelName") or "scene.glb", "data": raw, "etag": hashlib.md5(raw).hexdigest()}


def save_scene_3d_model(exam_id: str, file_name: str, data_bytes: bytes, change_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not data_bytes or data_bytes[:4] != b"glTF":
        raise ValueError("无效的 GLB 模型文件（缺少 glTF 二进制头）")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE `WMPSES_试卷场景` SET `Scene3DModelName` = %s, `Scene3DModelBLOB` = %s, `UpdatedAt` = %s WHERE `pk_ExamID` = %s",
                (file_name, data_bytes, datetime.date.today().isoformat(), exam_id),
            )
    return {"examId": exam_id, "modelName": file_name, "size": len(data_bytes), "changeLogs": get_change_logs(exam_id)}


def clear_scene_3d_model(exam_id: str = "WMPSES-1.1.1-V1", change_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE `WMPSES_试卷场景` SET `Scene3DModelName` = '', `Scene3DModelBLOB` = NULL WHERE `pk_ExamID` = %s",
                (exam_id,),
            )
    return {"examId": exam_id, "changeLogs": get_change_logs(exam_id)}


def get_users(role_type: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            if role_type:
                cur.execute("SELECT * FROM `WMPSES_用户人员` WHERE `RoleType` = %s ORDER BY `UserCode` ASC", (role_type,))
            else:
                cur.execute("SELECT * FROM `WMPSES_用户人员` ORDER BY `RoleType`, `UserCode` ASC")
            return list(cur.fetchall())


def save_user(user: Dict[str, Any]) -> Dict[str, Any]:
    uid = str(user.get("pk_UserID") or user.get("id") or f"USR-{uuid.uuid4().hex[:8].upper()}")
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    raw_pwd = user.get("password") if "password" in user else user.get("Password")
    has_explicit_pwd = bool(str(raw_pwd or "").strip())
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT `Password` FROM `WMPSES_用户人员` WHERE `pk_UserID` = %s", (uid,))
            existing = cur.fetchone()
            if has_explicit_pwd:
                pwd_hash = hash_password(str(raw_pwd))
            elif existing and existing.get("Password"):
                pwd_hash = existing["Password"]
            else:
                pwd_hash = DEFAULT_PASSWORD_HASH
            cur.execute(
                """
                INSERT INTO `WMPSES_用户人员` (
                    `pk_UserID`, `UserCode`, `FullName`, `RoleType`, `Password`, `Department`,
                    `SkillLevel`, `Specialty`, `CertificateNo`, `BatchNo`, `Phone`, `Status`, `CreatedAt`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    `UserCode`=VALUES(`UserCode`), `FullName`=VALUES(`FullName`), `RoleType`=VALUES(`RoleType`),
                    `Password`=VALUES(`Password`), `Department`=VALUES(`Department`), `SkillLevel`=VALUES(`SkillLevel`),
                    `Specialty`=VALUES(`Specialty`), `CertificateNo`=VALUES(`CertificateNo`),
                    `BatchNo`=VALUES(`BatchNo`), `Phone`=VALUES(`Phone`), `Status`=VALUES(`Status`)
                """,
                (
                    uid, str(user.get("userCode") or user.get("UserCode") or ""),
                    str(user.get("fullName") or user.get("FullName") or "未命名人员"),
                    str(user.get("roleType") or user.get("RoleType") or "考生"),
                    pwd_hash,
                    str(user.get("department") or user.get("Department") or ""),
                    str(user.get("skillLevel") or user.get("SkillLevel") or ""),
                    str(user.get("specialty") or user.get("Specialty") or ""),
                    str(user.get("certificateNo") or user.get("CertificateNo") or ""),
                    str(user.get("batchNo") or user.get("BatchNo") or ""),
                    str(user.get("phone") or user.get("Phone") or ""),
                    str(user.get("status") or user.get("Status") or "正常"),
                    str(user.get("createdAt") or user.get("CreatedAt") or now_ts),
                ),
            )
            cur.execute("SELECT * FROM `WMPSES_用户人员` WHERE `pk_UserID` = %s", (uid,))
            row = cur.fetchone()
            counts = get_table_counts(conn)
    return {"user": row, "counts": counts}


def delete_user(user_id: str) -> Dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM `WMPSES_用户人员` WHERE `pk_UserID` = %s", (user_id,))
        counts = get_table_counts(conn)
    return {"ok": True, "counts": counts}


def authenticate_user(identifier: str, password: str) -> Dict[str, Any]:
    ident = str(identifier or "").strip()
    if not ident:
        return {"ok": False, "error": "请输入考号/工号或姓名"}
    if password is None or str(password) == "":
        return {"ok": False, "error": "请输入登录密码"}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM `WMPSES_用户人员` WHERE LOWER(`UserCode`) = LOWER(%s) OR `FullName` = %s OR `pk_UserID` = %s LIMIT 1",
                (ident, ident, ident),
            )
            row = cur.fetchone()
    if row is None:
        return {"ok": False, "error": f"未找到账号「{ident}」"}
    if str(row.get("Status") or "正常") != "正常":
        return {"ok": False, "error": f"账号状态异常（{row.get('Status')}），无法登录"}
    if hash_password(str(password)) != row["Password"]:
        return {"ok": False, "error": "密码错误，请核对后重试（初始默认密码为 123456）"}
    return {"ok": True, "user": row}


def change_user_password(user_id: str, old_password: str, new_password: str) -> Dict[str, Any]:
    ident = str(user_id or "").strip()
    if not ident:
        return {"ok": False, "error": "缺少用户标识"}
    if len(str(new_password or "").strip()) < 4:
        return {"ok": False, "error": "新密码长度不能少于 4 位"}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM `WMPSES_用户人员` WHERE `pk_UserID` = %s OR LOWER(`UserCode`) = LOWER(%s) LIMIT 1",
                (ident, ident),
            )
            row = cur.fetchone()
            if row is None:
                return {"ok": False, "error": "未找到对应人员账号"}
            if not old_password or hash_password(str(old_password)) != row["Password"]:
                return {"ok": False, "error": "原密码不正确"}
            new_hash = hash_password(str(new_password))
            cur.execute("UPDATE `WMPSES_用户人员` SET `Password` = %s WHERE `pk_UserID` = %s", (new_hash, row["pk_UserID"]))
            cur.execute("SELECT * FROM `WMPSES_用户人员` WHERE `pk_UserID` = %s", (row["pk_UserID"],))
            updated = cur.fetchone()
    return {"ok": True, "message": "密码修改成功", "user": updated}


def get_change_logs(exam_id: str = "WMPSES-1.1.1-V1", limit: int = 30) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM `WMPSES_题库变更日志` WHERE `fk_ExamID` = %s ORDER BY `ChangedAt` DESC LIMIT %s",
                (exam_id, int(limit)),
            )
            return list(cur.fetchall())


def get_widget_templates() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM `WMPSES_工况卡片模板` ORDER BY `IsBuiltin` DESC, `SortOrder` ASC")
            return [_row_to_template_dict(r) for r in cur.fetchall()]


def save_widget_template(tpl: Dict[str, Any]) -> Dict[str, Any]:
    code = str(tpl.get("code") or tpl.get("TemplateCode") or "").strip()
    name = str(tpl.get("name") or tpl.get("TemplateName") or "").strip()
    if not code or not name:
        return {"ok": False, "error": "模板编码与名称不能为空"}
    tid = str(tpl.get("id") or tpl.get("pk_TemplateID") or f"TPL-{uuid.uuid4().hex[:6].upper()}")
    schema_json = json.dumps(tpl.get("paramSchema") or [], ensure_ascii=False)
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO `WMPSES_工况卡片模板` (
                    `pk_TemplateID`, `TemplateCode`, `TemplateName`, `IsBuiltin`,
                    `LeftPanelType`, `LeftPanelTitle`, `LeftPanelCode`,
                    `RightPanelType`, `RightPanelTitle`, `RightPanelCode`,
                    `ParamSchemaJSON`, `CustomImageBase64`, `SortOrder`, `UpdatedAt`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    `TemplateName`=VALUES(`TemplateName`), `LeftPanelType`=VALUES(`LeftPanelType`),
                    `LeftPanelTitle`=VALUES(`LeftPanelTitle`), `LeftPanelCode`=VALUES(`LeftPanelCode`),
                    `RightPanelType`=VALUES(`RightPanelType`), `RightPanelTitle`=VALUES(`RightPanelTitle`),
                    `RightPanelCode`=VALUES(`RightPanelCode`), `ParamSchemaJSON`=VALUES(`ParamSchemaJSON`),
                    `CustomImageBase64`=VALUES(`CustomImageBase64`), `SortOrder`=VALUES(`SortOrder`), `UpdatedAt`=VALUES(`UpdatedAt`)
                """,
                (
                    tid, code, name, 1 if tpl.get("isBuiltin") else 0,
                    tpl.get("leftPanelType") or "gauge_dial", tpl.get("leftPanelTitle") or "", tpl.get("leftPanelCode") or "",
                    tpl.get("rightPanelType") or "dcs_interlock", tpl.get("rightPanelTitle") or "", tpl.get("rightPanelCode") or "",
                    schema_json, tpl.get("customImageBase64") or "", int(tpl.get("sortOrder") or 20), now_ts,
                ),
            )
    templates = get_widget_templates()
    saved = next((t for t in templates if t["code"] == code), None)
    return {"ok": True, "template": saved, "templates": templates}


def delete_widget_template(key: str) -> Dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT `pk_TemplateID`, `IsBuiltin` FROM `WMPSES_工况卡片模板` WHERE `pk_TemplateID` = %s OR `TemplateCode` = %s LIMIT 1",
                (key, key),
            )
            row = cur.fetchone()
            if not row:
                return {"ok": False, "error": "未找到对应模板"}
            if row["IsBuiltin"]:
                return {"ok": False, "error": "系统内置模板受保护不可删除"}
            cur.execute("DELETE FROM `WMPSES_工况卡片模板` WHERE `pk_TemplateID` = %s", (row["pk_TemplateID"],))
    return {"ok": True, "templates": get_widget_templates()}


def save_exam_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """写入交卷成绩主从表，支持 ClientSubmissionID 幂等防重复交卷，并自动清理该考生的答题草稿。"""
    client_sub_id = str(result.get("clientSubmissionId") or "").strip() or None
    result_id = str(uuid.uuid4())
    with get_connection() as conn:
        with conn.cursor() as cur:
            if client_sub_id:
                cur.execute(
                    "SELECT `pk_ResultID`, `ReviewStatus` FROM `WMPSES_考试记录` WHERE `ClientSubmissionID` = %s LIMIT 1",
                    (client_sub_id,),
                )
                dup = cur.fetchone()
                if dup:
                    return {
                        "ok": True,
                        "resultId": dup["pk_ResultID"],
                        "reviewStatus": dup["ReviewStatus"],
                        "deduplicated": True,
                    }

            candidate_exam_id = str(result.get("examId") or "WMPSES-1.1.1-V1")
            cur.execute("SELECT `pk_ExamID` FROM `WMPSES_试卷场景` WHERE `pk_ExamID` = %s", (candidate_exam_id,))
            row = cur.fetchone()
            fk_exam_id = row["pk_ExamID"] if row else "WMPSES-1.1.1-V1"

            fk_user_id = str(result.get("userId") or "").strip()
            examinee_name = str(result.get("studentName") or "现场考生").strip()
            examinee_id = str(result.get("examineeId") or "").strip()

            details_list = list(result.get("details") or [])
            has_subjective = any(str(d.get("questionType") or d.get("type") or "single") == "short_answer" for d in details_list)
            objective_score = sum(
                int(d.get("earned") or 0)
                for d in details_list
                if str(d.get("questionType") or d.get("type") or "single") != "short_answer"
            )
            subjective_score = sum(
                int(d.get("earned") or 0)
                for d in details_list
                if str(d.get("questionType") or d.get("type") or "single") == "short_answer"
            )
            review_status = str(result.get("reviewStatus") or ("待阅卷" if has_subjective else "自动已评"))
            pass_status = "待阅卷" if review_status == "待阅卷" else ("合格" if result.get("passed") else "不合格")

            cur.execute(
                """
                INSERT INTO `WMPSES_考试记录` (
                    `pk_ResultID`, `ClientSubmissionID`, `fk_ExamID`, `fk_UserID`, `ExamineeName`, `ExamineeID`, `ExamMode`,
                    `Score`, `ObjectiveScore`, `SubjectiveScore`, `TotalScore`, `Accuracy`, `PassStatus`,
                    `ReviewStatus`, `ReviewerID`, `ReviewerName`, `ReviewedAt`,
                    `VetoTriggered`, `VetoReason`, `DurationSeconds`, `SubmittedAt`, `ResultDetailJSON`
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '', '', '', %s, %s, %s, %s, %s)
                """,
                (
                    result_id, client_sub_id, fk_exam_id, fk_user_id, examinee_name, examinee_id,
                    result.get("mode") or "exam",
                    int(result.get("effectiveScore") if result.get("effectiveScore") is not None else (result.get("earnedScore") or 0)),
                    int(objective_score), int(subjective_score),
                    int(result.get("totalScore") or 50), int(result.get("accuracy") or 0),
                    pass_status, review_status,
                    1 if result.get("vetoTriggered") else 0, result.get("vetoReason") or "",
                    int(result.get("durationSeconds") or 0),
                    result.get("submittedAt") or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    json.dumps(result, ensure_ascii=False),
                ),
            )

            if details_list:
                detail_params = []
                for d in details_list:
                    q_type = str(d.get("questionType") or d.get("type") or "single")
                    raw_ans = d.get("userAnswer")
                    if q_type == "short_answer":
                        user_ans = str(raw_ans[0] if isinstance(raw_ans, list) and raw_ans else (raw_ans or ""))
                    else:
                        user_ans = ",".join(str(x) for x in (raw_ans or []))
                    corr_ans = ",".join(str(x) for x in (d.get("correctAnswer") or []))
                    detail_params.append((
                        str(uuid.uuid4()), result_id, str(d.get("questionId") or ""), q_type,
                        int(d.get("score") or 0), str(d.get("hotspotCode") or ""), str(d.get("defectCode") or ""),
                        user_ans, corr_ans, 1 if d.get("isCorrect") else 0, int(d.get("earned") or 0),
                        str(d.get("reviewComment") or ""),
                    ))
                cur.executemany(
                    """
                    INSERT INTO `WMPSES_作答明细` (
                        `pk_DetailID`, `fk_ResultID`, `fk_QuestionID`, `QuestionType`, `MaxScore`,
                        `HotspotCode`, `DefectCode`, `UserAnswer`, `CorrectAnswer`, `IsCorrect`, `EarnedScore`, `ReviewComment`
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    detail_params,
                )

            if fk_user_id:
                cur.execute(
                    "DELETE FROM `WMPSES_答题草稿` WHERE `fk_UserID` = %s AND `fk_ExamID` = %s",
                    (fk_user_id, fk_exam_id),
                )
    return {"ok": True, "resultId": result_id, "reviewStatus": review_status}


def get_exam_results(user_id: Optional[str] = None, exam_id: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    clauses: List[str] = []
    params: List[Any] = []
    if user_id:
        clauses.append("r.`fk_UserID` = %s")
        params.append(str(user_id).strip())
    if exam_id:
        clauses.append("r.`fk_ExamID` = %s")
        params.append(str(exam_id).strip())
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(max(1, min(int(limit or 200), 1000)))
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    r.`pk_ResultID`, r.`fk_ExamID`, r.`fk_UserID`, r.`ExamineeName`, r.`ExamineeID`, r.`ExamMode`,
                    r.`Score`, r.`ObjectiveScore`, r.`SubjectiveScore`, r.`TotalScore`, r.`Accuracy`,
                    r.`PassStatus`, r.`ReviewStatus`, r.`ReviewerID`, r.`ReviewerName`, r.`ReviewedAt`,
                    r.`VetoTriggered`, r.`VetoReason`, r.`DurationSeconds`, r.`SubmittedAt`,
                    COALESCE(u.`Department`, '') AS `Department`,
                    COALESCE(u.`RoleType`, '考生') AS `RoleType`,
                    COALESCE(u.`BatchNo`, '') AS `BatchNo`,
                    COALESCE(e.`Title`, r.`fk_ExamID`) AS `ExamTitle`,
                    (SELECT COUNT(1) FROM `WMPSES_作答明细` d WHERE d.`fk_ResultID` = r.`pk_ResultID` AND d.`QuestionType` = 'short_answer') AS `SubjectiveCount`
                FROM `WMPSES_考试记录` r
                LEFT JOIN `WMPSES_用户人员` u ON u.`pk_UserID` = r.`fk_UserID`
                LEFT JOIN `WMPSES_试卷场景` e ON e.`pk_ExamID` = r.`fk_ExamID`
                {where_sql}
                ORDER BY r.`SubmittedAt` DESC
                LIMIT %s
                """,
                params,
            )
            return list(cur.fetchall())


def get_exam_result_detail(result_id: str) -> Optional[Dict[str, Any]]:
    rid = str(result_id or "").strip()
    if not rid:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.*, COALESCE(u.`Department`, '') AS `Department`,
                       COALESCE(e.`Title`, r.`fk_ExamID`) AS `ExamTitle`,
                       COALESCE(e.`PassScore`, 30) AS `PassScore`
                FROM `WMPSES_考试记录` r
                LEFT JOIN `WMPSES_用户人员` u ON u.`pk_UserID` = r.`fk_UserID`
                LEFT JOIN `WMPSES_试卷场景` e ON e.`pk_ExamID` = r.`fk_ExamID`
                WHERE r.`pk_ResultID` = %s
                """,
                (rid,),
            )
            record = cur.fetchone()
            if not record:
                return None
            raw_json = {}
            try:
                raw_json = json.loads(record.get("ResultDetailJSON") or "{}")
            except Exception:
                raw_json = {}
            snap_map = {str(x.get("questionId") or ""): x for x in (raw_json.get("details") or []) if isinstance(x, dict)}
            cur.execute(
                """
                SELECT d.*, COALESCE(q.`QuestionTitle`, '') AS `QuestionTitle`,
                       COALESCE(q.`Explanation`, '') AS `Explanation`,
                       COALESCE(q.`ReferenceStandard`, '') AS `ReferenceStandard`,
                       COALESCE(q.`Score`, d.`MaxScore`) AS `QuestionScore`,
                       COALESCE(h.`DeviceName`, '') AS `HotspotName`
                FROM `WMPSES_作答明细` d
                LEFT JOIN `WMPSES_习题库` q ON q.`pk_QuestionID` = d.`fk_QuestionID`
                LEFT JOIN `WMPSES_设备热点` h ON h.`pk_HotspotID` = q.`fk_HotspotID`
                WHERE d.`fk_ResultID` = %s
                """,
                (rid,),
            )
            details = list(cur.fetchall())
    for item in details:
        snap = snap_map.get(str(item.get("fk_QuestionID") or "")) or {}
        item["QuestionTitle"] = item.get("QuestionTitle") or snap.get("title", "")
        item["Explanation"] = item.get("Explanation") or snap.get("explanation", "")
        item["ReferenceStandard"] = item.get("ReferenceStandard") or snap.get("referenceStandard", "")
        item["HotspotName"] = item.get("HotspotName") or snap.get("hotspotName", "")
        if not item.get("MaxScore"):
            item["MaxScore"] = int(item.get("QuestionScore") or snap.get("score") or 0)
    record.pop("ResultDetailJSON", None)
    return {"result": record, "details": details}


def grade_exam_result(result_id: str, grades: List[Dict[str, Any]], reviewer_info: Dict[str, Any]) -> Dict[str, Any]:
    rid = str(result_id or "").strip()
    if not rid or not isinstance(grades, list) or not grades:
        raise ValueError("缺少答卷 ID 或主观题评分数据")
    grade_map = {
        str(g.get("detailId") or g.get("questionId") or "").strip(): g
        for g in grades
        if isinstance(g, dict) and (g.get("detailId") or g.get("questionId"))
    }
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    reviewer_id = str(reviewer_info.get("userId") or "")
    reviewer_name = str(reviewer_info.get("reviewerName") or reviewer_info.get("fullName") or "考评员")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.*, COALESCE(e.`PassScore`, 30) AS `PassScore`
                FROM `WMPSES_考试记录` r
                LEFT JOIN `WMPSES_试卷场景` e ON e.`pk_ExamID` = r.`fk_ExamID`
                WHERE r.`pk_ResultID` = %s
                FOR UPDATE
                """,
                (rid,),
            )
            rec = cur.fetchone()
            if not rec:
                raise ValueError(f"未找到答卷记录 {rid}")
            cur.execute("SELECT * FROM `WMPSES_作答明细` WHERE `fk_ResultID` = %s", (rid,))
            detail_rows = list(cur.fetchall())
            if not any(d["QuestionType"] == "short_answer" for d in detail_rows):
                raise ValueError("该答卷不含文字简答题，无需手工阅卷")

            for d in detail_rows:
                did = str(d["pk_DetailID"])
                qid = str(d["fk_QuestionID"])
                incoming = grade_map.get(did) or grade_map.get(qid)
                if not incoming:
                    continue
                if d["QuestionType"] != "short_answer":
                    raise ValueError(f"禁止人工修改客观题「{qid}」的自动判分结果")
                max_score = int(d.get("MaxScore") or 10)
                score_val = int(round(float(incoming.get("score", 0))))
                if score_val < 0 or score_val > max_score:
                    raise ValueError(f"题目「{qid}」得分必须在 0 ~ {max_score} 之间")
                comment = str(incoming.get("comment") or "").strip()
                is_correct = 1 if (max_score > 0 and score_val >= max_score * 0.6) else 0
                cur.execute(
                    "UPDATE `WMPSES_作答明细` SET `EarnedScore` = %s, `IsCorrect` = %s, `ReviewComment` = %s WHERE `pk_DetailID` = %s",
                    (score_val, is_correct, comment, did),
                )

            cur.execute("SELECT * FROM `WMPSES_作答明细` WHERE `fk_ResultID` = %s", (rid,))
            updated_details = list(cur.fetchall())
            obj_score = sum(int(d["EarnedScore"] or 0) for d in updated_details if d["QuestionType"] != "short_answer")
            subj_score = sum(int(d["EarnedScore"] or 0) for d in updated_details if d["QuestionType"] == "short_answer")
            total_cnt = len(updated_details)
            correct_cnt = sum(1 for d in updated_details if int(d["IsCorrect"] or 0) == 1)
            accuracy = int(round((correct_cnt / total_cnt) * 100)) if total_cnt > 0 else 0

            raw_json = {}
            try:
                raw_json = json.loads(rec.get("ResultDetailJSON") or "{}")
            except Exception:
                raw_json = {}
            has_zero_penalty = bool(raw_json.get("hasZeroPenalty")) or (
                int(rec.get("VetoTriggered") or 0) == 1 and int(rec.get("Score") or 0) == 0 and obj_score > 0
            )
            effective_score = 0 if has_zero_penalty else (obj_score + subj_score)
            pass_score = int(rec.get("PassScore") or 30)
            passed = (effective_score >= pass_score) and (not has_zero_penalty)
            pass_status = "合格" if passed else "不合格"

            raw_json.update({
                "objectiveScore": obj_score,
                "subjectiveScore": subj_score,
                "earnedScore": obj_score + subj_score,
                "effectiveScore": effective_score,
                "accuracy": accuracy,
                "passed": passed,
                "reviewStatus": "已阅卷",
                "reviewerId": reviewer_id,
                "reviewerName": reviewer_name,
                "reviewedAt": now_ts,
            })
            cur.execute(
                """
                UPDATE `WMPSES_考试记录`
                SET `Score` = %s, `ObjectiveScore` = %s, `SubjectiveScore` = %s,
                    `Accuracy` = %s, `PassStatus` = %s, `ReviewStatus` = '已阅卷',
                    `ReviewerID` = %s, `ReviewerName` = %s, `ReviewedAt` = %s,
                    `ResultDetailJSON` = %s
                WHERE `pk_ResultID` = %s
                """,
                (
                    effective_score, obj_score, subj_score, accuracy, pass_status,
                    reviewer_id, reviewer_name, now_ts, json.dumps(raw_json, ensure_ascii=False), rid,
                ),
            )
    detail_bundle = get_exam_result_detail(rid)
    return {"ok": True, "message": "手工阅卷打分已保存并重新核算总分", **(detail_bundle or {})}


def save_exam_draft(user_id: str, exam_id: str, answers: Dict[str, Any], remaining_seconds: int, started_at: str = "") -> Dict[str, Any]:
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO `WMPSES_答题草稿` (`fk_UserID`, `fk_ExamID`, `AnswersJSON`, `RemainingSeconds`, `StartedAt`, `UpdatedAt`)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    `AnswersJSON`=VALUES(`AnswersJSON`),
                    `RemainingSeconds`=VALUES(`RemainingSeconds`),
                    `UpdatedAt`=VALUES(`UpdatedAt`)
                """,
                (user_id, exam_id, json.dumps(answers or {}, ensure_ascii=False), int(remaining_seconds or 0), started_at or now_ts, now_ts),
            )
    return {"ok": True, "updatedAt": now_ts}


def get_exam_draft(user_id: str, exam_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM `WMPSES_答题草稿` WHERE `fk_UserID` = %s AND `fk_ExamID` = %s",
                (user_id, exam_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    try:
        answers = json.loads(row.get("AnswersJSON") or "{}")
    except Exception:
        answers = {}
    return {
        "userId": row["fk_UserID"],
        "examId": row["fk_ExamID"],
        "answers": answers if isinstance(answers, dict) else {},
        "remainingSeconds": int(row.get("RemainingSeconds") or 0),
        "startedAt": row.get("StartedAt") or "",
        "updatedAt": row.get("UpdatedAt") or "",
    }


def clear_exam_draft(user_id: str, exam_id: str) -> Dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM `WMPSES_答题草稿` WHERE `fk_UserID` = %s AND `fk_ExamID` = %s", (user_id, exam_id))
    return {"ok": True}


def get_tables_summary() -> Dict[str, Any]:
    with get_connection() as conn:
        counts = get_table_counts(conn)
        tables: Dict[str, List[Dict[str, Any]]] = {}
        with conn.cursor() as cur:
            for tbl in TABLE_NAMES:
                cur.execute(f"SELECT * FROM `{tbl}` LIMIT 200")
                rows = []
                for r in cur.fetchall():
                    d = dict(r)
                    for k in ("ExamPicture", "ExamPicture3D", "CustomImageBase64", "ResultDetailJSON"):
                        if k in d and isinstance(d[k], str) and len(d[k]) > 80:
                            d[k] = f"{d[k][:40]}... ({len(d[k])} chars)"
                    if "Scene3DModelBLOB" in d:
                        blob = d["Scene3DModelBLOB"]
                        d["Scene3DModelBLOB"] = f"<GLB BLOB {len(blob) / 1024:.0f} KB>" if blob else "(空)"
                    if tbl == "WMPSES_用户人员" and "Password" in d:
                        d["Password"] = "****** (SHA-256已加密)"
                    rows.append(d)
                tables[tbl] = rows
    return {"dbPath": f"mysql://{os.environ.get('WMPSES_MYSQL_HOST', '127.0.0.1')}/{os.environ.get('WMPSES_MYSQL_DATABASE', 'wmpses')}", "counts": counts, "tables": tables}
