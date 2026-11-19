"""
WMPSES SQLite 关系型数据库管理模块
与 FileMaker 8 表结构（试卷场景 / 设备热点 / 习题库 / 考试记录 / 作答明细 / 否定项规则 / 验收规范与确认单 / 工况资料与引用标准）1:1 对齐
"""

from __future__ import annotations

import argparse
import base64
import csv
import datetime
import hashlib
import json
import re
import shutil
import sqlite3
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

DEFAULT_PASSWORD_PLAIN = "123456"
DEFAULT_PASSWORD_HASH = hashlib.sha256(DEFAULT_PASSWORD_PLAIN.encode("utf-8")).hexdigest()
_SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")


def hash_password(raw_or_hashed: Optional[str]) -> str:
    """将明文密码加密为 64 位小写 SHA-256 十六进制串（若已是合法 SHA-256 摘要则规范化为小写）。"""
    val = str(raw_or_hashed or "").strip()
    if not val:
        return DEFAULT_PASSWORD_HASH
    if _SHA256_RE.match(val):
        return val.lower()
    return hashlib.sha256(val.encode("utf-8")).hexdigest()

DB_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DB_DIR.parent
DB_PATH = DB_DIR / "wmpses.db"
SCHEMA_PATH = DB_DIR / "schema.sql"
SEED_DIR = PROJECT_ROOT / "filemaker_script" / "seed_data"
QUESTION_BANK_JS = PROJECT_ROOT / "js" / "question-bank.js"
DEFAULT_IMAGE_PATH = PROJECT_ROOT / "assets" / "plant-panorama.jpg"

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
]


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    """获取开启外键约束的 SQLite 数据库连接。"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _read_csv_rows(csv_path: Path) -> List[Dict[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _write_csv_rows(csv_path: Path, headers: List[str], rows: List[List[Any]]) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
        writer.writerow(headers)
        writer.writerows(rows)


def _get_default_exam_picture_data_uri() -> str:
    """读取默认全景装置图 assets/plant-panorama.jpg 并编码为 Base64 Data URI。"""
    if DEFAULT_IMAGE_PATH.exists():
        b64 = base64.b64encode(DEFAULT_IMAGE_PATH.read_bytes()).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"
    return ""


def _ensure_schema_migrations(conn: sqlite3.Connection) -> None:
    """平滑迁移：自动补全既有数据库可能缺失的新增列。"""
    exam_cols = {r["name"] for r in conn.execute('PRAGMA table_info("WMPSES_试卷场景")').fetchall()}
    if "ExamPicture" not in exam_cols:
        conn.execute('ALTER TABLE "WMPSES_试卷场景" ADD COLUMN "ExamPicture" TEXT NOT NULL DEFAULT \'\'')
    hs_cols = {r["name"] for r in conn.execute('PRAGMA table_info("WMPSES_设备热点")').fetchall()}
    if "WidgetParamsJSON" not in hs_cols:
        conn.execute('ALTER TABLE "WMPSES_设备热点" ADD COLUMN "WidgetParamsJSON" TEXT NOT NULL DEFAULT \'{}\'')
    res_cols = {r["name"] for r in conn.execute('PRAGMA table_info("WMPSES_考试记录")').fetchall()}
    if "fk_UserID" not in res_cols:
        conn.execute('ALTER TABLE "WMPSES_考试记录" ADD COLUMN "fk_UserID" TEXT NOT NULL DEFAULT \'\'')
    user_cols = {r["name"] for r in conn.execute('PRAGMA table_info("WMPSES_用户人员")').fetchall()}
    if "Password" not in user_cols:
        conn.execute(
            f'ALTER TABLE "WMPSES_用户人员" ADD COLUMN "Password" TEXT NOT NULL DEFAULT \'{DEFAULT_PASSWORD_HASH}\''
        )
    conn.execute(
        'UPDATE "WMPSES_用户人员" SET "Password" = ? WHERE "Password" = \'\' OR "Password" IS NULL',
        (DEFAULT_PASSWORD_HASH,),
    )


def _import_seed_csv(conn: sqlite3.Connection) -> None:
    """从 filemaker_script/seed_data/*.csv 导入初始示范数据到核心表、规范表与人员日志表。"""
    exam_csv = SEED_DIR / "1_WMPSES_试卷场景.csv"
    hotspot_csv = SEED_DIR / "2_WMPSES_设备热点.csv"
    question_csv = SEED_DIR / "3_WMPSES_习题库.csv"
    veto_csv = SEED_DIR / "4_WMPSES_否定项规则.csv"
    checklist_csv = SEED_DIR / "5_WMPSES_验收规范与确认单.csv"
    docs_csv = SEED_DIR / "6_WMPSES_工况资料与引用标准.csv"
    users_csv = SEED_DIR / "7_WMPSES_用户人员.csv"
    logs_csv = SEED_DIR / "8_WMPSES_题库变更日志.csv"
    tpl_csv = SEED_DIR / "9_WMPSES_工况卡片模板.csv"

    default_pic = _get_default_exam_picture_data_uri()
    if exam_csv.exists():
        for row in _read_csv_rows(exam_csv):
            pic_val = row.get("ExamPicture") or (default_pic if row["pk_ExamID"] == "WMPSES-1.1.1-V1" else "")
            conn.execute(
                """
                INSERT INTO "WMPSES_试卷场景" (
                    "pk_ExamID", "Title", "Subtitle", "ExamCode", "VariantCode",
                    "TotalScore", "PassScore", "DurationMinutes", "Status", "Version", "UpdatedAt", "ExamPicture"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_ExamID") DO UPDATE SET
                    "Title"=excluded."Title",
                    "Subtitle"=excluded."Subtitle",
                    "ExamCode"=excluded."ExamCode",
                    "VariantCode"=excluded."VariantCode",
                    "TotalScore"=excluded."TotalScore",
                    "PassScore"=excluded."PassScore",
                    "DurationMinutes"=excluded."DurationMinutes",
                    "Status"=excluded."Status",
                    "Version"=excluded."Version",
                    "UpdatedAt"=excluded."UpdatedAt",
                    "ExamPicture"=CASE WHEN excluded."ExamPicture" != '' THEN excluded."ExamPicture" ELSE "WMPSES_试卷场景"."ExamPicture" END
                """,
                (
                    row["pk_ExamID"],
                    row["Title"],
                    row["Subtitle"],
                    row["ExamCode"],
                    row["VariantCode"],
                    int(row["TotalScore"] or 50),
                    int(row["PassScore"] or 30),
                    int(row["DurationMinutes"] or 30),
                    row["Status"] or "已启用",
                    row["Version"] or "1.0.0",
                    row["UpdatedAt"] or datetime.date.today().isoformat(),
                    pic_val,
                ),
            )

    if hotspot_csv.exists():
        for row in _read_csv_rows(hotspot_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_设备热点" (
                    "pk_HotspotID", "fk_ExamID", "SortOrder", "DeviceCode", "DeviceName",
                    "Category", "CoordX", "CoordY", "WidgetType", "SceneSummary", "WidgetParamsJSON"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_HotspotID") DO UPDATE SET
                    "fk_ExamID"=excluded."fk_ExamID",
                    "SortOrder"=excluded."SortOrder",
                    "DeviceCode"=excluded."DeviceCode",
                    "DeviceName"=excluded."DeviceName",
                    "Category"=excluded."Category",
                    "CoordX"=excluded."CoordX",
                    "CoordY"=excluded."CoordY",
                    "WidgetType"=excluded."WidgetType",
                    "SceneSummary"=excluded."SceneSummary",
                    "WidgetParamsJSON"=excluded."WidgetParamsJSON"
                """,
                (
                    row["pk_HotspotID"],
                    row["fk_ExamID"],
                    int(row["SortOrder"] or 1),
                    row["DeviceCode"],
                    row["DeviceName"],
                    row["Category"],
                    float(row["CoordX"] or 50.0),
                    float(row["CoordY"] or 50.0),
                    row["WidgetType"] or "generic",
                    row["SceneSummary"],
                    row.get("WidgetParamsJSON") or "{}",
                ),
            )

    if question_csv.exists():
        for row in _read_csv_rows(question_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_习题库" (
                    "pk_QuestionID", "fk_HotspotID", "fk_ExamID", "SortOrder",
                    "DefectCode", "DefectLevel", "IsMajorDefect", "IsCriticalConclusion",
                    "QuestionType", "Score", "QuestionTitle",
                    "OptionA", "OptionB", "OptionC", "OptionD", "OptionE",
                    "AnswerKeys", "ReferenceStandard", "Explanation"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_QuestionID") DO UPDATE SET
                    "fk_HotspotID"=excluded."fk_HotspotID",
                    "fk_ExamID"=excluded."fk_ExamID",
                    "SortOrder"=excluded."SortOrder",
                    "DefectCode"=excluded."DefectCode",
                    "DefectLevel"=excluded."DefectLevel",
                    "IsMajorDefect"=excluded."IsMajorDefect",
                    "IsCriticalConclusion"=excluded."IsCriticalConclusion",
                    "QuestionType"=excluded."QuestionType",
                    "Score"=excluded."Score",
                    "QuestionTitle"=excluded."QuestionTitle",
                    "OptionA"=excluded."OptionA",
                    "OptionB"=excluded."OptionB",
                    "OptionC"=excluded."OptionC",
                    "OptionD"=excluded."OptionD",
                    "OptionE"=excluded."OptionE",
                    "AnswerKeys"=excluded."AnswerKeys",
                    "ReferenceStandard"=excluded."ReferenceStandard",
                    "Explanation"=excluded."Explanation"
                """,
                (
                    row["pk_QuestionID"],
                    row["fk_HotspotID"],
                    row["fk_ExamID"],
                    int(row["SortOrder"] or 1),
                    row["DefectCode"],
                    row["DefectLevel"],
                    int(row["IsMajorDefect"] or 0),
                    int(row["IsCriticalConclusion"] or 0),
                    row["QuestionType"] or "single",
                    int(row["Score"] or 2),
                    row["QuestionTitle"],
                    row["OptionA"],
                    row["OptionB"],
                    row["OptionC"],
                    row["OptionD"],
                    row["OptionE"],
                    row["AnswerKeys"] or "A",
                    row["ReferenceStandard"],
                    row["Explanation"],
                ),
            )

    if veto_csv.exists():
        for row in _read_csv_rows(veto_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_否定项规则" (
                    "pk_RuleID", "fk_ExamID", "SortOrder", "RuleCode", "RuleName",
                    "ConditionType", "ThresholdValue", "TargetRef", "PenaltyAction", "IsEnabled", "AlertMessage"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_RuleID") DO UPDATE SET
                    "fk_ExamID"=excluded."fk_ExamID",
                    "SortOrder"=excluded."SortOrder",
                    "RuleCode"=excluded."RuleCode",
                    "RuleName"=excluded."RuleName",
                    "ConditionType"=excluded."ConditionType",
                    "ThresholdValue"=excluded."ThresholdValue",
                    "TargetRef"=excluded."TargetRef",
                    "PenaltyAction"=excluded."PenaltyAction",
                    "IsEnabled"=excluded."IsEnabled",
                    "AlertMessage"=excluded."AlertMessage"
                """,
                (
                    row["pk_RuleID"],
                    row["fk_ExamID"],
                    int(row["SortOrder"] or 1),
                    row["RuleCode"],
                    row["RuleName"],
                    row["ConditionType"],
                    float(row["ThresholdValue"] or 1),
                    row["TargetRef"],
                    row["PenaltyAction"] or "ZERO_SCORE",
                    int(row["IsEnabled"] or 1),
                    row["AlertMessage"],
                ),
            )

    if checklist_csv.exists():
        for row in _read_csv_rows(checklist_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_验收规范与确认单" (
                    "pk_CheckItemID", "fk_ExamID", "fk_HotspotID", "ItemNo", "AspectName",
                    "CheckItemName", "InteractionWay", "StandardBasis", "SceneStatus", "StandardConclusion", "RelatedDefectCode"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_CheckItemID") DO UPDATE SET
                    "fk_ExamID"=excluded."fk_ExamID",
                    "fk_HotspotID"=excluded."fk_HotspotID",
                    "ItemNo"=excluded."ItemNo",
                    "AspectName"=excluded."AspectName",
                    "CheckItemName"=excluded."CheckItemName",
                    "InteractionWay"=excluded."InteractionWay",
                    "StandardBasis"=excluded."StandardBasis",
                    "SceneStatus"=excluded."SceneStatus",
                    "StandardConclusion"=excluded."StandardConclusion",
                    "RelatedDefectCode"=excluded."RelatedDefectCode"
                """,
                (
                    row["pk_CheckItemID"],
                    row["fk_ExamID"],
                    row["fk_HotspotID"],
                    int(row["ItemNo"] or 1),
                    row["AspectName"],
                    row["CheckItemName"],
                    row["InteractionWay"],
                    row["StandardBasis"],
                    row["SceneStatus"],
                    row["StandardConclusion"],
                    row["RelatedDefectCode"],
                ),
            )

    if docs_csv.exists():
        for row in _read_csv_rows(docs_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_工况资料与引用标准" (
                    "pk_DocID", "fk_ExamID", "DocCategory", "SortOrder", "DocCode",
                    "DocTitle", "DeptOrCategory", "ContentSummary", "RelatedHotspotCode"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_DocID") DO UPDATE SET
                    "fk_ExamID"=excluded."fk_ExamID",
                    "DocCategory"=excluded."DocCategory",
                    "SortOrder"=excluded."SortOrder",
                    "DocCode"=excluded."DocCode",
                    "DocTitle"=excluded."DocTitle",
                    "DeptOrCategory"=excluded."DeptOrCategory",
                    "ContentSummary"=excluded."ContentSummary",
                    "RelatedHotspotCode"=excluded."RelatedHotspotCode"
                """,
                (
                    row["pk_DocID"],
                    row["fk_ExamID"],
                    row["DocCategory"],
                    int(row["SortOrder"] or 1),
                    row["DocCode"],
                    row["DocTitle"],
                    row["DeptOrCategory"],
                    row["ContentSummary"],
                    row["RelatedHotspotCode"],
                ),
            )

    if users_csv.exists():
        for row in _read_csv_rows(users_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_用户人员" (
                    "pk_UserID", "UserCode", "FullName", "RoleType", "Password", "Department",
                    "SkillLevel", "Specialty", "CertificateNo", "BatchNo", "Phone", "Status", "CreatedAt"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_UserID") DO UPDATE SET
                    "UserCode"=excluded."UserCode",
                    "FullName"=excluded."FullName",
                    "RoleType"=excluded."RoleType",
                    "Password"=excluded."Password",
                    "Department"=excluded."Department",
                    "SkillLevel"=excluded."SkillLevel",
                    "Specialty"=excluded."Specialty",
                    "CertificateNo"=excluded."CertificateNo",
                    "BatchNo"=excluded."BatchNo",
                    "Phone"=excluded."Phone",
                    "Status"=excluded."Status"
                """,
                (
                    row["pk_UserID"],
                    row["UserCode"],
                    row["FullName"],
                    row["RoleType"] or "考生",
                    hash_password(row.get("Password")),
                    row["Department"],
                    row["SkillLevel"],
                    row["Specialty"],
                    row["CertificateNo"],
                    row["BatchNo"],
                    row["Phone"],
                    row["Status"] or "正常",
                    row.get("CreatedAt") or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )

    if logs_csv.exists():
        for row in _read_csv_rows(logs_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_题库变更日志" (
                    "pk_LogID", "fk_ExamID", "fk_UserID", "OperatorName", "ActionType",
                    "VersionAfter", "HotspotCount", "QuestionCount", "TotalScore", "ChangeSummary", "ChangedAt"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_LogID") DO NOTHING
                """,
                (
                    row["pk_LogID"],
                    row["fk_ExamID"],
                    row["fk_UserID"],
                    row["OperatorName"],
                    row["ActionType"],
                    row["VersionAfter"],
                    int(row["HotspotCount"] or 8),
                    int(row["QuestionCount"] or 15),
                    int(row["TotalScore"] or 50),
                    row["ChangeSummary"],
                    row["ChangedAt"],
                ),
            )

    if tpl_csv.exists():
        for row in _read_csv_rows(tpl_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_工况卡片模板" (
                    "pk_TemplateID", "TemplateCode", "TemplateName", "IsBuiltin",
                    "LeftPanelType", "LeftPanelTitle", "LeftPanelCode",
                    "RightPanelType", "RightPanelTitle", "RightPanelCode",
                    "ParamSchemaJSON", "CustomImageBase64", "SortOrder", "UpdatedAt"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_TemplateID") DO UPDATE SET
                    "TemplateCode"=excluded."TemplateCode",
                    "TemplateName"=excluded."TemplateName",
                    "IsBuiltin"=excluded."IsBuiltin",
                    "LeftPanelType"=excluded."LeftPanelType",
                    "LeftPanelTitle"=excluded."LeftPanelTitle",
                    "LeftPanelCode"=excluded."LeftPanelCode",
                    "RightPanelType"=excluded."RightPanelType",
                    "RightPanelTitle"=excluded."RightPanelTitle",
                    "RightPanelCode"=excluded."RightPanelCode",
                    "ParamSchemaJSON"=excluded."ParamSchemaJSON",
                    "CustomImageBase64"=excluded."CustomImageBase64",
                    "SortOrder"=excluded."SortOrder",
                    "UpdatedAt"=excluded."UpdatedAt"
                """,
                (
                    row["pk_TemplateID"],
                    row["TemplateCode"],
                    row["TemplateName"],
                    int(row.get("IsBuiltin") or 0),
                    row.get("LeftPanelType") or "gauge_dial",
                    row.get("LeftPanelTitle") or "",
                    row.get("LeftPanelCode") or "",
                    row.get("RightPanelType") or "dcs_interlock",
                    row.get("RightPanelTitle") or "",
                    row.get("RightPanelCode") or "",
                    row.get("ParamSchemaJSON") or "[]",
                    row.get("CustomImageBase64") or "",
                    int(row.get("SortOrder") or 10),
                    row.get("UpdatedAt") or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )


def _load_factory_bank_from_js() -> Optional[Dict[str, Any]]:
    """通过 Node 从 js/question-bank.js 提取出厂默认题库及规范数据。"""
    node_bin = shutil.which("node")
    if not node_bin or not QUESTION_BANK_JS.exists():
        return None
    script = (
        "const vm=require('vm'),fs=require('fs');"
        "const ctx={window:{}};ctx.window=ctx;"
        f"vm.runInNewContext(fs.readFileSync({json.dumps(str(QUESTION_BANK_JS))},'utf8'),ctx);"
        "console.log(JSON.stringify(ctx.DEFAULT_QUESTION_BANK));"
    )
    proc = subprocess.run([node_bin, "-e", script], capture_output=True, text=True)
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    return json.loads(proc.stdout.strip())


def export_tables_to_seed_csv(conn: sqlite3.Connection) -> None:
    """将当前 SQLite 6 张配置/规范表的数据同步导出回 filemaker_script/seed_data/*.csv。"""
    exam_headers = [
        "pk_ExamID", "Title", "Subtitle", "ExamCode", "VariantCode",
        "TotalScore", "PassScore", "DurationMinutes", "Status", "Version", "UpdatedAt",
    ]
    exam_rows = [
        [r[col] for col in exam_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_试卷场景" ORDER BY rowid ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "1_WMPSES_试卷场景.csv", exam_headers, exam_rows)

    hs_headers = [
        "pk_HotspotID", "fk_ExamID", "SortOrder", "DeviceCode", "DeviceName",
        "Category", "CoordX", "CoordY", "WidgetType", "SceneSummary", "WidgetParamsJSON",
    ]
    hs_rows = [
        [r[col] for col in hs_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_设备热点" ORDER BY "fk_ExamID", "SortOrder" ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "2_WMPSES_设备热点.csv", hs_headers, hs_rows)

    q_headers = [
        "pk_QuestionID", "fk_HotspotID", "fk_ExamID", "SortOrder",
        "DefectCode", "DefectLevel", "IsMajorDefect", "IsCriticalConclusion",
        "QuestionType", "Score", "QuestionTitle",
        "OptionA", "OptionB", "OptionC", "OptionD", "OptionE",
        "AnswerKeys", "ReferenceStandard", "Explanation",
    ]
    q_rows = [
        [r[col] for col in q_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_习题库" ORDER BY "fk_ExamID", "fk_HotspotID", "SortOrder" ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "3_WMPSES_习题库.csv", q_headers, q_rows)

    veto_headers = [
        "pk_RuleID", "fk_ExamID", "SortOrder", "RuleCode", "RuleName",
        "ConditionType", "ThresholdValue", "TargetRef", "PenaltyAction", "IsEnabled", "AlertMessage",
    ]
    veto_rows = [
        [r[col] for col in veto_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_否定项规则" ORDER BY "fk_ExamID", "SortOrder" ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "4_WMPSES_否定项规则.csv", veto_headers, veto_rows)

    chk_headers = [
        "pk_CheckItemID", "fk_ExamID", "fk_HotspotID", "ItemNo", "AspectName",
        "CheckItemName", "InteractionWay", "StandardBasis", "SceneStatus", "StandardConclusion", "RelatedDefectCode",
    ]
    chk_rows = [
        [r[col] for col in chk_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_验收规范与确认单" ORDER BY "fk_ExamID", "ItemNo" ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "5_WMPSES_验收规范与确认单.csv", chk_headers, chk_rows)

    doc_headers = [
        "pk_DocID", "fk_ExamID", "DocCategory", "SortOrder", "DocCode",
        "DocTitle", "DeptOrCategory", "ContentSummary", "RelatedHotspotCode",
    ]
    doc_rows = [
        [r[col] for col in doc_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_工况资料与引用标准" ORDER BY "fk_ExamID", "DocCategory", "SortOrder" ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "6_WMPSES_工况资料与引用标准.csv", doc_headers, doc_rows)

    user_headers = [
        "pk_UserID", "UserCode", "FullName", "RoleType", "Password", "Department",
        "SkillLevel", "Specialty", "CertificateNo", "BatchNo", "Phone", "Status", "CreatedAt",
    ]
    user_rows = [
        [r[col] for col in user_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_用户人员" ORDER BY "RoleType", "UserCode", rowid ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "7_WMPSES_用户人员.csv", user_headers, user_rows)

    log_headers = [
        "pk_LogID", "fk_ExamID", "fk_UserID", "OperatorName", "ActionType",
        "VersionAfter", "HotspotCount", "QuestionCount", "TotalScore", "ChangeSummary", "ChangedAt",
    ]
    log_rows = [
        [r[col] for col in log_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_题库变更日志" ORDER BY "ChangedAt" ASC, rowid ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "8_WMPSES_题库变更日志.csv", log_headers, log_rows)

    tpl_headers = [
        "pk_TemplateID", "TemplateCode", "TemplateName", "IsBuiltin",
        "LeftPanelType", "LeftPanelTitle", "LeftPanelCode",
        "RightPanelType", "RightPanelTitle", "RightPanelCode",
        "ParamSchemaJSON", "CustomImageBase64", "SortOrder", "UpdatedAt",
    ]
    tpl_rows = [
        [r[col] for col in tpl_headers]
        for r in conn.execute('SELECT * FROM "WMPSES_工况卡片模板" ORDER BY "SortOrder" ASC, rowid ASC').fetchall()
    ]
    _write_csv_rows(SEED_DIR / "9_WMPSES_工况卡片模板.csv", tpl_headers, tpl_rows)


def _upsert_design_tables_in_tx(conn: sqlite3.Connection, exam_id: str, bank: Dict[str, Any]) -> None:
    """将否定项规则、24项确认单与工况资料写入对应关系表。"""
    veto_rules = bank.get("vetoRules")
    if isinstance(veto_rules, list):
        keep_rule_ids = [str(r.get("id")) for r in veto_rules if r.get("id")]
        if keep_rule_ids:
            ph = ",".join("?" for _ in keep_rule_ids)
            conn.execute(
                f'DELETE FROM "WMPSES_否定项规则" WHERE "fk_ExamID" = ? AND "pk_RuleID" NOT IN ({ph})',
                [exam_id, *keep_rule_ids],
            )
        for idx, rule in enumerate(veto_rules):
            rid = str(rule.get("id") or f"N-{idx + 1}")
            conn.execute(
                """
                INSERT INTO "WMPSES_否定项规则" (
                    "pk_RuleID", "fk_ExamID", "SortOrder", "RuleCode", "RuleName",
                    "ConditionType", "ThresholdValue", "TargetRef", "PenaltyAction", "IsEnabled", "AlertMessage"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_RuleID") DO UPDATE SET
                    "fk_ExamID"=excluded."fk_ExamID",
                    "SortOrder"=excluded."SortOrder",
                    "RuleCode"=excluded."RuleCode",
                    "RuleName"=excluded."RuleName",
                    "ConditionType"=excluded."ConditionType",
                    "ThresholdValue"=excluded."ThresholdValue",
                    "TargetRef"=excluded."TargetRef",
                    "PenaltyAction"=excluded."PenaltyAction",
                    "IsEnabled"=excluded."IsEnabled",
                    "AlertMessage"=excluded."AlertMessage"
                """,
                (
                    rid,
                    exam_id,
                    int(rule.get("order") or (idx + 1)),
                    rule.get("code") or rid,
                    rule.get("name") or "未命名否定项",
                    rule.get("conditionType") or "QUESTION_WRONG",
                    float(rule.get("thresholdValue") if rule.get("thresholdValue") is not None else 1),
                    rule.get("targetRef") or "",
                    rule.get("penaltyAction") or "ZERO_SCORE",
                    1 if rule.get("isEnabled", True) else 0,
                    rule.get("alertMessage") or "",
                ),
            )

    checklist_items = bank.get("checklistItems")
    if isinstance(checklist_items, list):
        keep_chk_ids = [str(c.get("id")) for c in checklist_items if c.get("id")]
        if keep_chk_ids:
            ph = ",".join("?" for _ in keep_chk_ids)
            conn.execute(
                f'DELETE FROM "WMPSES_验收规范与确认单" WHERE "fk_ExamID" = ? AND "pk_CheckItemID" NOT IN ({ph})',
                [exam_id, *keep_chk_ids],
            )
        for idx, item in enumerate(checklist_items):
            cid = str(item.get("id") or f"CHK-{idx + 1:02d}")
            conn.execute(
                """
                INSERT INTO "WMPSES_验收规范与确认单" (
                    "pk_CheckItemID", "fk_ExamID", "fk_HotspotID", "ItemNo", "AspectName",
                    "CheckItemName", "InteractionWay", "StandardBasis", "SceneStatus", "StandardConclusion", "RelatedDefectCode"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_CheckItemID") DO UPDATE SET
                    "fk_ExamID"=excluded."fk_ExamID",
                    "fk_HotspotID"=excluded."fk_HotspotID",
                    "ItemNo"=excluded."ItemNo",
                    "AspectName"=excluded."AspectName",
                    "CheckItemName"=excluded."CheckItemName",
                    "InteractionWay"=excluded."InteractionWay",
                    "StandardBasis"=excluded."StandardBasis",
                    "SceneStatus"=excluded."SceneStatus",
                    "StandardConclusion"=excluded."StandardConclusion",
                    "RelatedDefectCode"=excluded."RelatedDefectCode"
                """,
                (
                    cid,
                    exam_id,
                    item.get("hotspotId") or "",
                    int(item.get("itemNo") or (idx + 1)),
                    item.get("aspectName") or "",
                    item.get("checkItemName") or "",
                    item.get("interactionWay") or "",
                    item.get("standardBasis") or "",
                    item.get("sceneStatus") or "",
                    item.get("standardConclusion") or "合格",
                    item.get("relatedDefectCode") or "",
                ),
            )

    scenario_docs = bank.get("scenarioDocs")
    if isinstance(scenario_docs, list):
        keep_doc_ids = [str(d.get("id")) for d in scenario_docs if d.get("id")]
        if keep_doc_ids:
            ph = ",".join("?" for _ in keep_doc_ids)
            conn.execute(
                f'DELETE FROM "WMPSES_工况资料与引用标准" WHERE "fk_ExamID" = ? AND "pk_DocID" NOT IN ({ph})',
                [exam_id, *keep_doc_ids],
            )
        for idx, doc in enumerate(scenario_docs):
            did = str(doc.get("id") or f"DOC-{idx + 1:02d}")
            conn.execute(
                """
                INSERT INTO "WMPSES_工况资料与引用标准" (
                    "pk_DocID", "fk_ExamID", "DocCategory", "SortOrder", "DocCode",
                    "DocTitle", "DeptOrCategory", "ContentSummary", "RelatedHotspotCode"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_DocID") DO UPDATE SET
                    "fk_ExamID"=excluded."fk_ExamID",
                    "DocCategory"=excluded."DocCategory",
                    "SortOrder"=excluded."SortOrder",
                    "DocCode"=excluded."DocCode",
                    "DocTitle"=excluded."DocTitle",
                    "DeptOrCategory"=excluded."DeptOrCategory",
                    "ContentSummary"=excluded."ContentSummary",
                    "RelatedHotspotCode"=excluded."RelatedHotspotCode"
                """,
                (
                    did,
                    exam_id,
                    doc.get("docCategory") or "工况台账",
                    int(doc.get("sortOrder") or (idx + 1)),
                    doc.get("docCode") or "",
                    doc.get("docTitle") or "",
                    doc.get("deptOrCategory") or "",
                    doc.get("contentSummary") or "",
                    doc.get("relatedHotspotCode") or "",
                ),
            )


def _upsert_users_and_logs_in_tx(conn: sqlite3.Connection, bank: Dict[str, Any]) -> None:
    """将默认/导入的用户人员与题库审计日志写入 SQLite。"""
    users = bank.get("users")
    if isinstance(users, list):
        now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for u in users:
            uid = str(u.get("id") or f"USR-{uuid.uuid4().hex[:8].upper()}")
            conn.execute(
                """
                INSERT INTO "WMPSES_用户人员" (
                    "pk_UserID", "UserCode", "FullName", "RoleType", "Password", "Department",
                    "SkillLevel", "Specialty", "CertificateNo", "BatchNo", "Phone", "Status", "CreatedAt"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_UserID") DO UPDATE SET
                    "UserCode"=excluded."UserCode",
                    "FullName"=excluded."FullName",
                    "RoleType"=excluded."RoleType",
                    "Password"=excluded."Password",
                    "Department"=excluded."Department",
                    "SkillLevel"=excluded."SkillLevel",
                    "Specialty"=excluded."Specialty",
                    "CertificateNo"=excluded."CertificateNo",
                    "BatchNo"=excluded."BatchNo",
                    "Phone"=excluded."Phone",
                    "Status"=excluded."Status"
                """,
                (
                    uid,
                    u.get("userCode") or "",
                    u.get("fullName") or "未命名人员",
                    u.get("roleType") or "考生",
                    hash_password(u.get("password") or u.get("Password")),
                    u.get("department") or "",
                    u.get("skillLevel") or "",
                    u.get("specialty") or "",
                    u.get("certificateNo") or "",
                    u.get("batchNo") or "",
                    u.get("phone") or "",
                    u.get("status") or "正常",
                    u.get("createdAt") or now_ts,
                ),
            )

    logs = bank.get("changeLogs")
    if isinstance(logs, list):
        for lg in logs:
            lid = str(lg.get("id") or f"LOG-{uuid.uuid4().hex[:8].upper()}")
            conn.execute(
                """
                INSERT INTO "WMPSES_题库变更日志" (
                    "pk_LogID", "fk_ExamID", "fk_UserID", "OperatorName", "ActionType",
                    "VersionAfter", "HotspotCount", "QuestionCount", "TotalScore", "ChangeSummary", "ChangedAt"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_LogID") DO NOTHING
                """,
                (
                    lid,
                    str(lg.get("examId") or "WMPSES-1.1.1-V1"),
                    str(lg.get("userId") or ""),
                    str(lg.get("operatorName") or "系统"),
                    str(lg.get("actionType") or "初始化入库"),
                    str(lg.get("versionAfter") or "1.0.0"),
                    int(lg.get("hotspotCount") or 8),
                    int(lg.get("questionCount") or 15),
                    int(lg.get("totalScore") or 50),
                    str(lg.get("changeSummary") or ""),
                    str(lg.get("changedAt") or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                ),
            )


def _upsert_templates_in_tx(conn: sqlite3.Connection, bank: Dict[str, Any]) -> None:
    """将内置或导入的工况卡片模板列表写入 WMPSES_工况卡片模板。"""
    templates = bank.get("widgetTemplates")
    if not isinstance(templates, list):
        return
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for idx, t in enumerate(templates):
        tid = str(t.get("id") or f"TPL-{idx + 1:02d}")
        code = str(t.get("code") or f"tpl_{idx + 1}")
        schema_raw = t.get("paramSchema")
        if isinstance(schema_raw, str):
            schema_json = schema_raw or "[]"
        elif isinstance(schema_raw, list):
            schema_json = json.dumps(schema_raw, ensure_ascii=False)
        else:
            schema_json = "[]"
        conn.execute(
            """
            INSERT INTO "WMPSES_工况卡片模板" (
                "pk_TemplateID", "TemplateCode", "TemplateName", "IsBuiltin",
                "LeftPanelType", "LeftPanelTitle", "LeftPanelCode",
                "RightPanelType", "RightPanelTitle", "RightPanelCode",
                "ParamSchemaJSON", "CustomImageBase64", "SortOrder", "UpdatedAt"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT("pk_TemplateID") DO UPDATE SET
                "TemplateCode"=excluded."TemplateCode",
                "TemplateName"=excluded."TemplateName",
                "IsBuiltin"=excluded."IsBuiltin",
                "LeftPanelType"=excluded."LeftPanelType",
                "LeftPanelTitle"=excluded."LeftPanelTitle",
                "LeftPanelCode"=excluded."LeftPanelCode",
                "RightPanelType"=excluded."RightPanelType",
                "RightPanelTitle"=excluded."RightPanelTitle",
                "RightPanelCode"=excluded."RightPanelCode",
                "ParamSchemaJSON"=excluded."ParamSchemaJSON",
                "CustomImageBase64"=excluded."CustomImageBase64",
                "SortOrder"=excluded."SortOrder",
                "UpdatedAt"=excluded."UpdatedAt"
            """,
            (
                tid,
                code,
                str(t.get("name") or code),
                1 if t.get("isBuiltin", True) else 0,
                str(t.get("leftPanelType") or "gauge_dial"),
                str(t.get("leftPanelTitle") or ""),
                str(t.get("leftPanelCode") or ""),
                str(t.get("rightPanelType") or "dcs_interlock"),
                str(t.get("rightPanelTitle") or ""),
                str(t.get("rightPanelCode") or ""),
                schema_json,
                str(t.get("customImageBase64") or ""),
                int(t.get("sortOrder") or (idx + 1)),
                str(t.get("updatedAt") or now_ts),
            ),
        )


def _row_to_template_dict(r: sqlite3.Row) -> Dict[str, Any]:
    raw_schema = r["ParamSchemaJSON"] if "ParamSchemaJSON" in r.keys() else "[]"
    try:
        parsed_schema = json.loads(raw_schema) if raw_schema else []
        if not isinstance(parsed_schema, list):
            parsed_schema = []
    except Exception:
        parsed_schema = []
    return {
        "id": r["pk_TemplateID"],
        "code": r["TemplateCode"],
        "name": r["TemplateName"],
        "isBuiltin": bool(r["IsBuiltin"]),
        "leftPanelType": r["LeftPanelType"],
        "leftPanelTitle": r["LeftPanelTitle"],
        "leftPanelCode": r["LeftPanelCode"],
        "rightPanelType": r["RightPanelType"],
        "rightPanelTitle": r["RightPanelTitle"],
        "rightPanelCode": r["RightPanelCode"],
        "paramSchema": parsed_schema,
        "customImageBase64": r["CustomImageBase64"] or "",
        "sortOrder": int(r["SortOrder"] or 10),
        "updatedAt": r["UpdatedAt"] or "",
    }


def init_db(reset: bool = False, db_path: Path = DB_PATH) -> Dict[str, int]:
    """初始化 SQLite 11 张表结构，并在空表或 reset=True 时写入示范数据。"""
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with get_connection(db_path) as conn:
        conn.executescript(schema_sql)
        conn.execute("PRAGMA foreign_keys = ON;")
        _ensure_schema_migrations(conn)

        exam_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_试卷场景"').fetchone()[0]
        veto_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_否定项规则"').fetchone()[0]
        chk_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_验收规范与确认单"').fetchone()[0]
        doc_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_工况资料与引用标准"').fetchone()[0]
        user_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_用户人员"').fetchone()[0]
        log_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_题库变更日志"').fetchone()[0]
        tpl_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_工况卡片模板"').fetchone()[0]

        if reset:
            factory_bank = _load_factory_bank_from_js()
            if factory_bank:
                exam_id = factory_bank.get("meta", {}).get("id", "WMPSES-1.1.1-V1")
                factory_bank.setdefault("meta", {})["examPicture"] = _get_default_exam_picture_data_uri()
                conn.execute('DELETE FROM "WMPSES_习题库" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_设备热点" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_否定项规则" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_验收规范与确认单" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_工况资料与引用标准" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_题库变更日志" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_用户人员"')
                conn.execute('DELETE FROM "WMPSES_工况卡片模板"')
                _upsert_bank_in_tx(conn, factory_bank)
                _upsert_users_and_logs_in_tx(conn, factory_bank)
                _upsert_templates_in_tx(conn, factory_bank)
                export_tables_to_seed_csv(conn)
            else:
                conn.execute('DELETE FROM "WMPSES_习题库"')
                conn.execute('DELETE FROM "WMPSES_设备热点"')
                conn.execute('DELETE FROM "WMPSES_否定项规则"')
                conn.execute('DELETE FROM "WMPSES_验收规范与确认单"')
                conn.execute('DELETE FROM "WMPSES_工况资料与引用标准"')
                conn.execute('DELETE FROM "WMPSES_题库变更日志"')
                conn.execute('DELETE FROM "WMPSES_用户人员"')
                conn.execute('DELETE FROM "WMPSES_工况卡片模板"')
                _import_seed_csv(conn)
        elif exam_count == 0:
            factory_bank = _load_factory_bank_from_js()
            _import_seed_csv(conn)
            if factory_bank:
                _upsert_design_tables_in_tx(conn, factory_bank.get("meta", {}).get("id", "WMPSES-1.1.1-V1"), factory_bank)
                _upsert_users_and_logs_in_tx(conn, factory_bank)
                _upsert_templates_in_tx(conn, factory_bank)
                export_tables_to_seed_csv(conn)
        elif veto_count == 0 or chk_count == 0 or doc_count == 0 or user_count == 0 or log_count == 0 or tpl_count == 0:
            # 旧库自动平滑升级补全新增表初始数据
            factory_bank = _load_factory_bank_from_js()
            if factory_bank:
                _upsert_design_tables_in_tx(conn, factory_bank.get("meta", {}).get("id", "WMPSES-1.1.1-V1"), factory_bank)
                _upsert_users_and_logs_in_tx(conn, factory_bank)
                _upsert_templates_in_tx(conn, factory_bank)
                export_tables_to_seed_csv(conn)
            else:
                _import_seed_csv(conn)

        # 确保主基准卷 WMPSES-1.1.1-V1 始终有默认底图
        v1_row = conn.execute('SELECT "ExamPicture" FROM "WMPSES_试卷场景" WHERE "pk_ExamID" = ?', ("WMPSES-1.1.1-V1",)).fetchone()
        if v1_row and not v1_row["ExamPicture"]:
            default_pic = _get_default_exam_picture_data_uri()
            if default_pic:
                conn.execute('UPDATE "WMPSES_试卷场景" SET "ExamPicture" = ? WHERE "pk_ExamID" = ?', (default_pic, "WMPSES-1.1.1-V1"))

        return get_table_counts(conn)


def get_table_counts(conn: sqlite3.Connection) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for tbl in TABLE_NAMES:
        counts[tbl] = conn.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0]
    return counts


def get_question_bank(exam_id: str = "WMPSES-1.1.1-V1", db_path: Path = DB_PATH) -> Dict[str, Any]:
    """从 SQLite 关系表读取题库、否定项规则、24项确认单与工况资料。"""
    init_db(reset=False, db_path=db_path)
    with get_connection(db_path) as conn:
        exam_row = conn.execute(
            'SELECT * FROM "WMPSES_试卷场景" WHERE "pk_ExamID" = ?', (exam_id,)
        ).fetchone()
        if exam_row is None:
            exam_row = conn.execute(
                'SELECT * FROM "WMPSES_试卷场景" ORDER BY rowid ASC LIMIT 1'
            ).fetchone()
        if exam_row is None:
            raise RuntimeError("SQLite 数据库中未找到任何试卷场景记录")

        actual_exam_id = exam_row["pk_ExamID"]
        hotspot_rows = conn.execute(
            'SELECT * FROM "WMPSES_设备热点" WHERE "fk_ExamID" = ? ORDER BY "SortOrder" ASC, rowid ASC',
            (actual_exam_id,),
        ).fetchall()
        question_rows = conn.execute(
            'SELECT * FROM "WMPSES_习题库" WHERE "fk_ExamID" = ? ORDER BY "SortOrder" ASC, rowid ASC',
            (actual_exam_id,),
        ).fetchall()
        veto_rows = conn.execute(
            'SELECT * FROM "WMPSES_否定项规则" WHERE "fk_ExamID" = ? ORDER BY "SortOrder" ASC, rowid ASC',
            (actual_exam_id,),
        ).fetchall()
        chk_rows = conn.execute(
            'SELECT * FROM "WMPSES_验收规范与确认单" WHERE "fk_ExamID" = ? ORDER BY "ItemNo" ASC, rowid ASC',
            (actual_exam_id,),
        ).fetchall()
        doc_rows = conn.execute(
            'SELECT * FROM "WMPSES_工况资料与引用标准" WHERE "fk_ExamID" = ? ORDER BY "DocCategory", "SortOrder" ASC, rowid ASC',
            (actual_exam_id,),
        ).fetchall()

        q_by_hs: Dict[str, List[Dict[str, Any]]] = {}
        for qr in question_rows:
            options = []
            for key_letter in ("A", "B", "C", "D", "E"):
                opt_text = qr[f"Option{key_letter}"]
                if opt_text is not None and str(opt_text) != "":
                    options.append({"key": key_letter, "text": opt_text})
            answers = [
                ans.strip()
                for ans in str(qr["AnswerKeys"] or "").replace("，", ",").split(",")
                if ans.strip()
            ]
            q_obj = {
                "id": qr["pk_QuestionID"],
                "defectCode": qr["DefectCode"] or "",
                "defectLevel": qr["DefectLevel"] or "general",
                "isMajorDefect": bool(qr["IsMajorDefect"]),
                "isCriticalConclusion": bool(qr["IsCriticalConclusion"]),
                "type": qr["QuestionType"] or "single",
                "score": int(qr["Score"] or 2),
                "title": qr["QuestionTitle"],
                "options": options,
                "answer": answers or ["A"],
                "referenceStandard": qr["ReferenceStandard"] or "",
                "explanation": qr["Explanation"] or "",
            }
            q_by_hs.setdefault(qr["fk_HotspotID"], []).append(q_obj)

        hotspots = []
        for hr in hotspot_rows:
            hs_id = hr["pk_HotspotID"]
            raw_wp = hr["WidgetParamsJSON"] if "WidgetParamsJSON" in hr.keys() else "{}"
            try:
                widget_params = json.loads(raw_wp) if raw_wp else {}
                if not isinstance(widget_params, dict):
                    widget_params = {}
            except Exception:
                widget_params = {}
            hotspots.append({
                "id": hs_id,
                "order": int(hr["SortOrder"] or 1),
                "code": hr["DeviceCode"],
                "name": hr["DeviceName"],
                "category": hr["Category"],
                "x": float(hr["CoordX"]),
                "y": float(hr["CoordY"]),
                "widgetType": hr["WidgetType"] or "generic",
                "widgetParams": widget_params,
                "sceneSummary": hr["SceneSummary"] or "",
                "questions": q_by_hs.get(hs_id, []),
            })

        veto_rules = [
            {
                "id": vr["pk_RuleID"],
                "order": int(vr["SortOrder"] or 1),
                "code": vr["RuleCode"],
                "name": vr["RuleName"],
                "conditionType": vr["ConditionType"],
                "thresholdValue": float(vr["ThresholdValue"]),
                "targetRef": vr["TargetRef"] or "",
                "penaltyAction": vr["PenaltyAction"] or "ZERO_SCORE",
                "isEnabled": bool(vr["IsEnabled"]),
                "alertMessage": vr["AlertMessage"] or "",
            }
            for vr in veto_rows
        ]

        checklist_items = [
            {
                "id": cr["pk_CheckItemID"],
                "hotspotId": cr["fk_HotspotID"] or "",
                "itemNo": int(cr["ItemNo"] or 1),
                "aspectName": cr["AspectName"],
                "checkItemName": cr["CheckItemName"],
                "interactionWay": cr["InteractionWay"] or "",
                "standardBasis": cr["StandardBasis"] or "",
                "sceneStatus": cr["SceneStatus"] or "",
                "standardConclusion": cr["StandardConclusion"] or "",
                "relatedDefectCode": cr["RelatedDefectCode"] or "",
            }
            for cr in chk_rows
        ]

        scenario_docs = [
            {
                "id": dr["pk_DocID"],
                "docCategory": dr["DocCategory"],
                "sortOrder": int(dr["SortOrder"] or 1),
                "docCode": dr["DocCode"] or "",
                "docTitle": dr["DocTitle"],
                "deptOrCategory": dr["DeptOrCategory"] or "",
                "contentSummary": dr["ContentSummary"] or "",
                "relatedHotspotCode": dr["RelatedHotspotCode"] or "",
            }
            for dr in doc_rows
        ]

        tpl_rows = conn.execute(
            'SELECT * FROM "WMPSES_工况卡片模板" ORDER BY "IsBuiltin" DESC, "SortOrder" ASC, rowid ASC'
        ).fetchall()
        widget_templates = [_row_to_template_dict(tr) for tr in tpl_rows]

        total_score = sum(q["score"] for hs in hotspots for q in hs["questions"])
        exam_picture = exam_row["ExamPicture"] if "ExamPicture" in exam_row.keys() else ""
        if not exam_picture:
            exam_picture = _get_default_exam_picture_data_uri()
        return {
            "meta": {
                "id": actual_exam_id,
                "title": exam_row["Title"],
                "subtitle": exam_row["Subtitle"],
                "examCode": exam_row["ExamCode"],
                "totalScore": total_score if total_score > 0 else int(exam_row["TotalScore"] or 50),
                "passScore": int(exam_row["PassScore"] or 30),
                "durationMinutes": int(exam_row["DurationMinutes"] or 30),
                "version": exam_row["Version"] or "1.0.0",
                "updatedAt": exam_row["UpdatedAt"] or datetime.date.today().isoformat(),
                "examPicture": exam_picture,
            },
            "hotspots": hotspots,
            "vetoRules": veto_rules,
            "checklistItems": checklist_items,
            "scenarioDocs": scenario_docs,
            "widgetTemplates": widget_templates,
        }


def _upsert_bank_in_tx(conn: sqlite3.Connection, bank: Dict[str, Any]) -> str:
    meta = bank.get("meta") or {}
    exam_id = str(meta.get("id") or "WMPSES-1.1.1-V1")
    hotspots = bank.get("hotspots") or []
    today_str = datetime.date.today().isoformat()
    calc_total = sum(int(q.get("score") or 2) for hs in hotspots for q in (hs.get("questions") or []))

    exam_picture = str(meta.get("examPicture") or "")

    conn.execute(
        """
        INSERT INTO "WMPSES_试卷场景" (
            "pk_ExamID", "Title", "Subtitle", "ExamCode", "VariantCode",
            "TotalScore", "PassScore", "DurationMinutes", "Status", "Version", "UpdatedAt", "ExamPicture"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT("pk_ExamID") DO UPDATE SET
            "Title"=excluded."Title",
            "Subtitle"=excluded."Subtitle",
            "ExamCode"=excluded."ExamCode",
            "TotalScore"=excluded."TotalScore",
            "PassScore"=excluded."PassScore",
            "DurationMinutes"=excluded."DurationMinutes",
            "Version"=excluded."Version",
            "UpdatedAt"=excluded."UpdatedAt",
            "ExamPicture"=CASE WHEN excluded."ExamPicture" != '' THEN excluded."ExamPicture" ELSE "WMPSES_试卷场景"."ExamPicture" END
        """,
        (
            exam_id,
            meta.get("title") or "工业废气治理工（二级/技师）实操模拟仿真考试系统",
            meta.get("subtitle") or "1.1.1 系统启动前设备验收",
            meta.get("examCode") or "6-28-02-05 / 1.1.1",
            "V1",
            calc_total if calc_total > 0 else int(meta.get("totalScore") or 50),
            int(meta.get("passScore") or 30),
            int(meta.get("durationMinutes") or 30),
            "已启用",
            meta.get("version") or "1.0.0",
            today_str,
            exam_picture,
        ),
    )

    keep_hs_ids = [str(hs.get("id")) for hs in hotspots if hs.get("id")]
    if keep_hs_ids:
        placeholders = ",".join("?" for _ in keep_hs_ids)
        conn.execute(
            f'DELETE FROM "WMPSES_设备热点" WHERE "fk_ExamID" = ? AND "pk_HotspotID" NOT IN ({placeholders})',
            [exam_id, *keep_hs_ids],
        )
    else:
        conn.execute('DELETE FROM "WMPSES_设备热点" WHERE "fk_ExamID" = ?', (exam_id,))

    keep_q_ids: List[str] = []
    for hs in hotspots:
        for q in hs.get("questions") or []:
            if q.get("id"):
                keep_q_ids.append(str(q["id"]))

    if keep_q_ids:
        q_placeholders = ",".join("?" for _ in keep_q_ids)
        conn.execute(
            f'DELETE FROM "WMPSES_习题库" WHERE "fk_ExamID" = ? AND "pk_QuestionID" NOT IN ({q_placeholders})',
            [exam_id, *keep_q_ids],
        )
    else:
        conn.execute('DELETE FROM "WMPSES_习题库" WHERE "fk_ExamID" = ?', (exam_id,))

    for idx, hs in enumerate(hotspots):
        hs_id = str(hs.get("id") or f"hs-{idx + 1}")
        raw_wp = hs.get("widgetParams")
        if isinstance(raw_wp, str):
            wp_json = raw_wp or "{}"
        elif isinstance(raw_wp, dict):
            wp_json = json.dumps(raw_wp, ensure_ascii=False)
        else:
            wp_json = "{}"
        conn.execute(
            """
            INSERT INTO "WMPSES_设备热点" (
                "pk_HotspotID", "fk_ExamID", "SortOrder", "DeviceCode", "DeviceName",
                "Category", "CoordX", "CoordY", "WidgetType", "SceneSummary", "WidgetParamsJSON"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT("pk_HotspotID") DO UPDATE SET
                "fk_ExamID"=excluded."fk_ExamID",
                "SortOrder"=excluded."SortOrder",
                "DeviceCode"=excluded."DeviceCode",
                "DeviceName"=excluded."DeviceName",
                "Category"=excluded."Category",
                "CoordX"=excluded."CoordX",
                "CoordY"=excluded."CoordY",
                "WidgetType"=excluded."WidgetType",
                "SceneSummary"=excluded."SceneSummary",
                "WidgetParamsJSON"=excluded."WidgetParamsJSON"
            """,
            (
                hs_id,
                exam_id,
                int(hs.get("order") or (idx + 1)),
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
            q_id = str(q.get("id") or f"{hs_id}-q{q_idx + 1}")
            opt_map = {str(o.get("key") or ""): str(o.get("text") or "") for o in (q.get("options") or [])}
            ans_str = ",".join(str(a) for a in (q.get("answer") or ["A"]))
            defect_level = str(q.get("defectLevel") or "general")
            conn.execute(
                """
                INSERT INTO "WMPSES_习题库" (
                    "pk_QuestionID", "fk_HotspotID", "fk_ExamID", "SortOrder",
                    "DefectCode", "DefectLevel", "IsMajorDefect", "IsCriticalConclusion",
                    "QuestionType", "Score", "QuestionTitle",
                    "OptionA", "OptionB", "OptionC", "OptionD", "OptionE",
                    "AnswerKeys", "ReferenceStandard", "Explanation"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_QuestionID") DO UPDATE SET
                    "fk_HotspotID"=excluded."fk_HotspotID",
                    "fk_ExamID"=excluded."fk_ExamID",
                    "SortOrder"=excluded."SortOrder",
                    "DefectCode"=excluded."DefectCode",
                    "DefectLevel"=excluded."DefectLevel",
                    "IsMajorDefect"=excluded."IsMajorDefect",
                    "IsCriticalConclusion"=excluded."IsCriticalConclusion",
                    "QuestionType"=excluded."QuestionType",
                    "Score"=excluded."Score",
                    "QuestionTitle"=excluded."QuestionTitle",
                    "OptionA"=excluded."OptionA",
                    "OptionB"=excluded."OptionB",
                    "OptionC"=excluded."OptionC",
                    "OptionD"=excluded."OptionD",
                    "OptionE"=excluded."OptionE",
                    "AnswerKeys"=excluded."AnswerKeys",
                    "ReferenceStandard"=excluded."ReferenceStandard",
                    "Explanation"=excluded."Explanation"
                """,
                (
                    q_id,
                    hs_id,
                    exam_id,
                    q_idx + 1,
                    q.get("defectCode") or "",
                    defect_level,
                    1 if (q.get("isMajorDefect") or defect_level == "major") else 0,
                    1 if (q.get("isCriticalConclusion") or defect_level == "critical") else 0,
                    q.get("type") or "single",
                    int(q.get("score") or 2),
                    q.get("title") or "请输入题目内容",
                    opt_map.get("A", ""),
                    opt_map.get("B", ""),
                    opt_map.get("C", ""),
                    opt_map.get("D", ""),
                    opt_map.get("E", ""),
                    ans_str,
                    q.get("referenceStandard") or "",
                    q.get("explanation") or "",
                ),
            )

    _upsert_design_tables_in_tx(conn, exam_id, bank)
    return exam_id


def save_question_bank(
    bank: Dict[str, Any],
    change_meta: Optional[Dict[str, Any]] = None,
    db_path: Path = DB_PATH,
) -> Dict[str, Any]:
    """将教师编辑模式修改/新增的热点、题目与否定项规则同步写入 SQLite 关系表，记录审计日志并更新 CSV。"""
    init_db(reset=False, db_path=db_path)
    cm = change_meta or {}
    with get_connection(db_path) as conn:
        exam_id = _upsert_bank_in_tx(conn, bank)
        hotspots = bank.get("hotspots") or []
        q_count = sum(len(hs.get("questions") or []) for hs in hotspots)
        total_score = sum(int(q.get("score") or 2) for hs in hotspots for q in (hs.get("questions") or []))
        version_after = str((bank.get("meta") or {}).get("version") or "1.0.0")
        conn.execute(
            """
            INSERT INTO "WMPSES_题库变更日志" (
                "pk_LogID", "fk_ExamID", "fk_UserID", "OperatorName", "ActionType",
                "VersionAfter", "HotspotCount", "QuestionCount", "TotalScore", "ChangeSummary", "ChangedAt"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"LOG-{uuid.uuid4().hex[:10].upper()}",
                exam_id,
                str(cm.get("userId") or ""),
                str(cm.get("operatorName") or "教师/管理员"),
                str(cm.get("actionType") or "编辑更新题库"),
                version_after,
                len(hotspots),
                q_count,
                total_score,
                str(cm.get("changeSummary") or f"同步题库（{len(hotspots)} 个热点，{q_count} 道题，总分 {total_score} 分）"),
                datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )
        export_tables_to_seed_csv(conn)
        counts = get_table_counts(conn)
    saved_bank = get_question_bank(exam_id=exam_id, db_path=db_path)
    logs = get_change_logs(exam_id=exam_id, db_path=db_path)
    return {"bank": saved_bank, "counts": counts, "changeLogs": logs}


def get_users(role_type: Optional[str] = None, db_path: Path = DB_PATH) -> List[Dict[str, Any]]:
    """查询 WMPSES_用户人员 表全部或指定角色人员列表。"""
    init_db(reset=False, db_path=db_path)
    with get_connection(db_path) as conn:
        if role_type:
            rows = conn.execute(
                'SELECT * FROM "WMPSES_用户人员" WHERE "RoleType" = ? ORDER BY "UserCode" ASC, rowid ASC',
                (role_type,),
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT * FROM "WMPSES_用户人员" ORDER BY "RoleType", "UserCode" ASC, rowid ASC'
            ).fetchall()
        return [dict(r) for r in rows]


def save_user(user: Dict[str, Any], db_path: Path = DB_PATH) -> Dict[str, Any]:
    """新增或更新 WMPSES_用户人员 记录并同步导出 CSV（密码统一采用 SHA-256 加密存储，默认 123456）。"""
    init_db(reset=False, db_path=db_path)
    uid = str(user.get("pk_UserID") or user.get("id") or f"USR-{uuid.uuid4().hex[:8].upper()}")
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    raw_pwd = user.get("password") if "password" in user else user.get("Password")
    has_explicit_pwd = bool(str(raw_pwd or "").strip())
    with get_connection(db_path) as conn:
        existing = conn.execute('SELECT "Password" FROM "WMPSES_用户人员" WHERE "pk_UserID" = ?', (uid,)).fetchone()
        if has_explicit_pwd:
            pwd_hash = hash_password(str(raw_pwd))
        elif existing and existing["Password"]:
            pwd_hash = existing["Password"]
        else:
            pwd_hash = DEFAULT_PASSWORD_HASH
        conn.execute(
            """
            INSERT INTO "WMPSES_用户人员" (
                "pk_UserID", "UserCode", "FullName", "RoleType", "Password", "Department",
                "SkillLevel", "Specialty", "CertificateNo", "BatchNo", "Phone", "Status", "CreatedAt"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT("pk_UserID") DO UPDATE SET
                "UserCode"=excluded."UserCode",
                "FullName"=excluded."FullName",
                "RoleType"=excluded."RoleType",
                "Password"=excluded."Password",
                "Department"=excluded."Department",
                "SkillLevel"=excluded."SkillLevel",
                "Specialty"=excluded."Specialty",
                "CertificateNo"=excluded."CertificateNo",
                "BatchNo"=excluded."BatchNo",
                "Phone"=excluded."Phone",
                "Status"=excluded."Status"
            """,
            (
                uid,
                str(user.get("userCode") or user.get("UserCode") or ""),
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
        export_tables_to_seed_csv(conn)
        row = dict(conn.execute('SELECT * FROM "WMPSES_用户人员" WHERE "pk_UserID" = ?', (uid,)).fetchone())
        counts = get_table_counts(conn)
    return {"user": row, "counts": counts}


def delete_user(user_id: str, db_path: Path = DB_PATH) -> Dict[str, Any]:
    """从 WMPSES_用户人员 表删除指定人员并同步 CSV。"""
    init_db(reset=False, db_path=db_path)
    with get_connection(db_path) as conn:
        conn.execute('DELETE FROM "WMPSES_用户人员" WHERE "pk_UserID" = ?', (user_id,))
        export_tables_to_seed_csv(conn)
        counts = get_table_counts(conn)
    return {"ok": True, "counts": counts}


def authenticate_user(identifier: str, password: str, db_path: Path = DB_PATH) -> Dict[str, Any]:
    """校验用户登录（支持考号/工号 UserCode、姓名 FullName 或 pk_UserID + SHA-256 密码校验）。"""
    init_db(reset=False, db_path=db_path)
    ident = str(identifier or "").strip()
    if not ident:
        return {"ok": False, "error": "请输入考号/工号或姓名"}
    if password is None or str(password) == "":
        return {"ok": False, "error": "请输入登录密码"}
    with get_connection(db_path) as conn:
        row = conn.execute(
            'SELECT * FROM "WMPSES_用户人员" WHERE LOWER("UserCode") = LOWER(?) OR "FullName" = ? OR "pk_UserID" = ? LIMIT 1',
            (ident, ident, ident),
        ).fetchone()
        if row is None:
            return {"ok": False, "error": f"未找到账号「{ident}」"}
        status = str(row["Status"] or "正常")
        if status != "正常":
            return {"ok": False, "error": f"账号状态异常（{status}），无法登录"}
        if hash_password(str(password)) != row["Password"]:
            return {"ok": False, "error": "密码错误，请核对后重试（初始默认密码为 123456）"}
        return {"ok": True, "user": dict(row)}


def change_user_password(
    user_id: str,
    old_password: str,
    new_password: str,
    db_path: Path = DB_PATH,
) -> Dict[str, Any]:
    """用户修改个人登录密码：校验原密码后，将新密码以 SHA-256 加密存入 WMPSES_用户人员 并同步 CSV。"""
    init_db(reset=False, db_path=db_path)
    ident = str(user_id or "").strip()
    if not ident:
        return {"ok": False, "error": "缺少用户标识，请先登录"}
    new_pwd_str = str(new_password or "")
    if len(new_pwd_str.strip()) < 4:
        return {"ok": False, "error": "新密码长度不能少于 4 位"}
    with get_connection(db_path) as conn:
        row = conn.execute(
            'SELECT * FROM "WMPSES_用户人员" WHERE "pk_UserID" = ? OR LOWER("UserCode") = LOWER(?) LIMIT 1',
            (ident, ident),
        ).fetchone()
        if row is None:
            return {"ok": False, "error": "未找到对应人员账号"}
        if not old_password or hash_password(str(old_password)) != row["Password"]:
            return {"ok": False, "error": "原密码不正确"}
        new_hash = hash_password(new_pwd_str)
        conn.execute(
            'UPDATE "WMPSES_用户人员" SET "Password" = ? WHERE "pk_UserID" = ?',
            (new_hash, row["pk_UserID"]),
        )
        export_tables_to_seed_csv(conn)
        updated = dict(
            conn.execute('SELECT * FROM "WMPSES_用户人员" WHERE "pk_UserID" = ?', (row["pk_UserID"],)).fetchone()
        )
    return {
        "ok": True,
        "message": "密码修改成功（已采用 SHA-256 加密存储）",
        "user": updated,
    }


def get_change_logs(exam_id: str = "WMPSES-1.1.1-V1", db_path: Path = DB_PATH) -> List[Dict[str, Any]]:
    """查询指定试卷的题库变更审计日志（最新在前）。"""
    init_db(reset=False, db_path=db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            'SELECT * FROM "WMPSES_题库变更日志" WHERE "fk_ExamID" = ? ORDER BY "ChangedAt" DESC, rowid DESC LIMIT 100',
            (exam_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_widget_templates(db_path: Path = DB_PATH) -> List[Dict[str, Any]]:
    """查询 WMPSES_工况卡片模板 全部内置与自定义专业仪表模板。"""
    init_db(reset=False, db_path=db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            'SELECT * FROM "WMPSES_工况卡片模板" ORDER BY "IsBuiltin" DESC, "SortOrder" ASC, rowid ASC'
        ).fetchall()
        return [_row_to_template_dict(r) for r in rows]


def save_widget_template(tpl: Dict[str, Any], db_path: Path = DB_PATH) -> Dict[str, Any]:
    """新增或更新专业仪表模板并同步导出 9_WMPSES_工况卡片模板.csv。"""
    init_db(reset=False, db_path=db_path)
    raw_code = str(tpl.get("code") or tpl.get("TemplateCode") or "").strip()
    clean_code = re.sub(r"[^a-zA-Z0-9_-]+", "_", raw_code).strip("_").lower()
    if not clean_code:
        clean_code = f"tpl_{uuid.uuid4().hex[:6]}"
    name = str(tpl.get("name") or tpl.get("TemplateName") or "").strip()
    if not name:
        return {"ok": False, "error": "模板显示名称不能为空"}

    req_id = str(tpl.get("id") or tpl.get("pk_TemplateID") or "").strip()
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    schema_raw = tpl.get("paramSchema") if "paramSchema" in tpl else tpl.get("ParamSchemaJSON")
    if isinstance(schema_raw, str):
        schema_json = schema_raw or "[]"
    elif isinstance(schema_raw, list):
        schema_json = json.dumps(schema_raw, ensure_ascii=False)
    else:
        schema_json = "[]"

    with get_connection(db_path) as conn:
        existing = conn.execute(
            'SELECT * FROM "WMPSES_工况卡片模板" WHERE "pk_TemplateID" = ? OR "TemplateCode" = ? LIMIT 1',
            (req_id or "__none__", clean_code),
        ).fetchone()
        tid = existing["pk_TemplateID"] if existing else (req_id or f"TPL-{uuid.uuid4().hex[:8].upper()}")
        is_builtin = int(existing["IsBuiltin"]) if existing else (1 if tpl.get("isBuiltin") else 0)
        sort_order = int(tpl.get("sortOrder") or (existing["SortOrder"] if existing else 20))
        custom_img = tpl.get("customImageBase64") if "customImageBase64" in tpl else (existing["CustomImageBase64"] if existing else "")

        conn.execute(
            """
            INSERT INTO "WMPSES_工况卡片模板" (
                "pk_TemplateID", "TemplateCode", "TemplateName", "IsBuiltin",
                "LeftPanelType", "LeftPanelTitle", "LeftPanelCode",
                "RightPanelType", "RightPanelTitle", "RightPanelCode",
                "ParamSchemaJSON", "CustomImageBase64", "SortOrder", "UpdatedAt"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT("pk_TemplateID") DO UPDATE SET
                "TemplateCode"=excluded."TemplateCode",
                "TemplateName"=excluded."TemplateName",
                "LeftPanelType"=excluded."LeftPanelType",
                "LeftPanelTitle"=excluded."LeftPanelTitle",
                "LeftPanelCode"=excluded."LeftPanelCode",
                "RightPanelType"=excluded."RightPanelType",
                "RightPanelTitle"=excluded."RightPanelTitle",
                "RightPanelCode"=excluded."RightPanelCode",
                "ParamSchemaJSON"=excluded."ParamSchemaJSON",
                "CustomImageBase64"=excluded."CustomImageBase64",
                "SortOrder"=excluded."SortOrder",
                "UpdatedAt"=excluded."UpdatedAt"
            """,
            (
                tid,
                clean_code,
                name,
                is_builtin,
                str(tpl.get("leftPanelType") or tpl.get("LeftPanelType") or "gauge_dial"),
                str(tpl.get("leftPanelTitle") or tpl.get("LeftPanelTitle") or ""),
                str(tpl.get("leftPanelCode") or tpl.get("LeftPanelCode") or ""),
                str(tpl.get("rightPanelType") or tpl.get("RightPanelType") or "dcs_interlock"),
                str(tpl.get("rightPanelTitle") or tpl.get("RightPanelTitle") or ""),
                str(tpl.get("rightPanelCode") or tpl.get("RightPanelCode") or ""),
                schema_json,
                str(custom_img or ""),
                sort_order,
                now_ts,
            ),
        )
        export_tables_to_seed_csv(conn)
        saved_row = conn.execute('SELECT * FROM "WMPSES_工况卡片模板" WHERE "pk_TemplateID" = ?', (tid,)).fetchone()
        all_rows = conn.execute('SELECT * FROM "WMPSES_工况卡片模板" ORDER BY "IsBuiltin" DESC, "SortOrder" ASC, rowid ASC').fetchall()
        counts = get_table_counts(conn)
    return {
        "ok": True,
        "template": _row_to_template_dict(saved_row),
        "templates": [_row_to_template_dict(r) for r in all_rows],
        "counts": counts,
    }


def delete_widget_template(tpl_id_or_code: str, db_path: Path = DB_PATH) -> Dict[str, Any]:
    """删除教师自定义专业仪表模板（系统内置模板不可删除）并同步 CSV。"""
    init_db(reset=False, db_path=db_path)
    key = str(tpl_id_or_code or "").strip()
    if not key:
        return {"ok": False, "error": "缺少模板标识"}
    with get_connection(db_path) as conn:
        row = conn.execute(
            'SELECT * FROM "WMPSES_工况卡片模板" WHERE "pk_TemplateID" = ? OR "TemplateCode" = ? LIMIT 1',
            (key, key),
        ).fetchone()
        if row is None:
            return {"ok": False, "error": "未找到对应的工况卡片模板"}
        if int(row["IsBuiltin"] or 0) == 1:
            return {"ok": False, "error": "系统内置专业仪表模板不可删除"}
        conn.execute('DELETE FROM "WMPSES_工况卡片模板" WHERE "pk_TemplateID" = ?', (row["pk_TemplateID"],))
        export_tables_to_seed_csv(conn)
        all_rows = conn.execute('SELECT * FROM "WMPSES_工况卡片模板" ORDER BY "IsBuiltin" DESC, "SortOrder" ASC, rowid ASC').fetchall()
        counts = get_table_counts(conn)
    return {
        "ok": True,
        "templates": [_row_to_template_dict(r) for r in all_rows],
        "counts": counts,
    }


def save_exam_result(result: Dict[str, Any], db_path: Path = DB_PATH) -> Dict[str, Any]:
    """将交卷主记录与逐题明细写入 SQLite WMPSES_考试记录 与 WMPSES_作答明细。"""
    init_db(reset=False, db_path=db_path)
    result_id = str(uuid.uuid4())
    with get_connection(db_path) as conn:
        candidate_exam_id = str(result.get("examId") or "WMPSES-1.1.1-V1")
        row = conn.execute(
            'SELECT "pk_ExamID" FROM "WMPSES_试卷场景" WHERE "pk_ExamID" = ?',
            (candidate_exam_id,),
        ).fetchone()
        if row is None:
            row = conn.execute(
                'SELECT "pk_ExamID" FROM "WMPSES_试卷场景" ORDER BY rowid ASC LIMIT 1'
            ).fetchone()
        fk_exam_id = row["pk_ExamID"] if row else "WMPSES-1.1.1-V1"

        conn.execute(
            """
            INSERT INTO "WMPSES_考试记录" (
                "pk_ResultID", "fk_ExamID", "fk_UserID", "ExamineeName", "ExamineeID", "ExamMode",
                "Score", "TotalScore", "Accuracy", "PassStatus",
                "VetoTriggered", "VetoReason", "DurationSeconds", "SubmittedAt", "ResultDetailJSON"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result_id,
                fk_exam_id,
                str(result.get("userId") or ""),
                result.get("studentName") or "现场考生",
                result.get("examineeId") or "",
                result.get("mode") or "exam",
                int(result.get("effectiveScore") if result.get("effectiveScore") is not None else (result.get("earnedScore") or 0)),
                int(result.get("totalScore") or 50),
                int(result.get("accuracy") or 0),
                "合格" if result.get("passed") else "不合格",
                1 if result.get("vetoTriggered") else 0,
                result.get("vetoReason") or "",
                int(result.get("durationSeconds") or 0),
                result.get("submittedAt") or datetime.datetime.now().isoformat(),
                json.dumps(result, ensure_ascii=False),
            ),
        )

        for d in result.get("details") or []:
            user_ans = ",".join(str(x) for x in (d.get("userAnswer") or []))
            corr_ans = ",".join(str(x) for x in (d.get("correctAnswer") or []))
            conn.execute(
                """
                INSERT INTO "WMPSES_作答明细" (
                    "pk_DetailID", "fk_ResultID", "fk_QuestionID", "HotspotCode", "DefectCode",
                    "UserAnswer", "CorrectAnswer", "IsCorrect", "EarnedScore"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    result_id,
                    str(d.get("questionId") or ""),
                    str(d.get("hotspotCode") or ""),
                    str(d.get("defectCode") or ""),
                    user_ans,
                    corr_ans,
                    1 if d.get("isCorrect") else 0,
                    int(d.get("earned") or 0),
                ),
            )
        counts = get_table_counts(conn)
    return {"ok": True, "resultId": result_id, "counts": counts}


def get_tables_summary(db_path: Path = DB_PATH) -> Dict[str, Any]:
    """返回 SQLite 全部 8 张表的记录数量与实际行内容，供前端表数据查看器展示。"""
    init_db(reset=False, db_path=db_path)
    with get_connection(db_path) as conn:
        tables: Dict[str, List[Dict[str, Any]]] = {}
        counts = get_table_counts(conn)
        exam_list = []
        for r in conn.execute('SELECT * FROM "WMPSES_试卷场景" ORDER BY rowid ASC').fetchall():
            d = dict(r)
            pic = str(d.get("ExamPicture") or "")
            if len(pic) > 80:
                d["ExamPicture"] = f"{pic[:40]}... ({len(pic)} chars)"
            elif not pic:
                d["ExamPicture"] = "(空)"
            exam_list.append(d)
        tables["WMPSES_试卷场景"] = exam_list
        tables["WMPSES_设备热点"] = [
            dict(r) for r in conn.execute('SELECT * FROM "WMPSES_设备热点" ORDER BY "SortOrder" ASC, rowid ASC').fetchall()
        ]
        tables["WMPSES_习题库"] = [
            dict(r) for r in conn.execute('SELECT * FROM "WMPSES_习题库" ORDER BY "fk_HotspotID", "SortOrder" ASC').fetchall()
        ]
        tables["WMPSES_否定项规则"] = [
            dict(r) for r in conn.execute('SELECT * FROM "WMPSES_否定项规则" ORDER BY "SortOrder" ASC, rowid ASC').fetchall()
        ]
        tables["WMPSES_验收规范与确认单"] = [
            dict(r) for r in conn.execute('SELECT * FROM "WMPSES_验收规范与确认单" ORDER BY "ItemNo" ASC, rowid ASC').fetchall()
        ]
        tables["WMPSES_工况资料与引用标准"] = [
            dict(r) for r in conn.execute('SELECT * FROM "WMPSES_工况资料与引用标准" ORDER BY "DocCategory", "SortOrder" ASC').fetchall()
        ]
        tables["WMPSES_用户人员"] = [
            dict(r) for r in conn.execute('SELECT * FROM "WMPSES_用户人员" ORDER BY "RoleType", "UserCode" ASC').fetchall()
        ]
        tables["WMPSES_题库变更日志"] = [
            dict(r) for r in conn.execute('SELECT * FROM "WMPSES_题库变更日志" ORDER BY "ChangedAt" DESC, rowid DESC LIMIT 100').fetchall()
        ]
        tables["WMPSES_考试记录"] = [
            dict(r) for r in conn.execute(
                'SELECT "pk_ResultID","fk_ExamID","fk_UserID","ExamineeName","ExamineeID","ExamMode","Score","TotalScore","Accuracy","PassStatus","VetoTriggered","VetoReason","DurationSeconds","SubmittedAt" FROM "WMPSES_考试记录" ORDER BY "SubmittedAt" DESC LIMIT 50'
            ).fetchall()
        ]
        tables["WMPSES_作答明细"] = [
            dict(r) for r in conn.execute(
                'SELECT * FROM "WMPSES_作答明细" ORDER BY rowid DESC LIMIT 100'
            ).fetchall()
        ]
        tpl_rows = []
        for r in conn.execute('SELECT * FROM "WMPSES_工况卡片模板" ORDER BY "IsBuiltin" DESC, "SortOrder" ASC, rowid ASC').fetchall():
            d = dict(r)
            img = str(d.get("CustomImageBase64") or "")
            if len(img) > 80:
                d["CustomImageBase64"] = f"{img[:40]}... ({len(img)} chars)"
            elif not img:
                d["CustomImageBase64"] = "(空)"
            tpl_rows.append(d)
        tables["WMPSES_工况卡片模板"] = tpl_rows
    return {
        "dbPath": str(db_path),
        "counts": counts,
        "tables": tables,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="WMPSES SQLite 8表数据库初始化与管理工具")
    parser.add_argument("--init", action="store_true", help="初始化建表并导入示范数据")
    parser.add_argument("--reset", action="store_true", help="重置题库与设计方案规范表为出厂示范数据")
    parser.add_argument("--summary", action="store_true", help="输出 8 张表的当前记录数")
    args = parser.parse_args()

    if args.reset:
        counts = init_db(reset=True)
        print("RESET_OK:", json.dumps(counts, ensure_ascii=False))
    elif args.init:
        counts = init_db(reset=False)
        print("INIT_OK:", json.dumps(counts, ensure_ascii=False))
    elif args.summary:
        init_db(reset=False)
        print("SUMMARY:", json.dumps(get_table_counts(get_connection()), ensure_ascii=False))
    else:
        counts = init_db(reset=False)
        print("DB_READY:", json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    main()
