"""
WMPSES SQLite 关系型数据库管理模块
与 FileMaker 8 表结构（试卷场景 / 设备热点 / 习题库 / 考试记录 / 作答明细 / 否定项规则 / 验收规范与确认单 / 工况资料与引用标准）1:1 对齐
"""

from __future__ import annotations

import argparse
import csv
import datetime
import json
import shutil
import sqlite3
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DB_DIR.parent
DB_PATH = DB_DIR / "wmpses.db"
SCHEMA_PATH = DB_DIR / "schema.sql"
SEED_DIR = PROJECT_ROOT / "filemaker_script" / "seed_data"
QUESTION_BANK_JS = PROJECT_ROOT / "js" / "question-bank.js"

TABLE_NAMES = [
    "WMPSES_试卷场景",
    "WMPSES_设备热点",
    "WMPSES_习题库",
    "WMPSES_考试记录",
    "WMPSES_作答明细",
    "WMPSES_否定项规则",
    "WMPSES_验收规范与确认单",
    "WMPSES_工况资料与引用标准",
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


def _import_seed_csv(conn: sqlite3.Connection) -> None:
    """从 filemaker_script/seed_data/*.csv 导入初始示范数据到核心表与设计方案规范表。"""
    exam_csv = SEED_DIR / "1_WMPSES_试卷场景.csv"
    hotspot_csv = SEED_DIR / "2_WMPSES_设备热点.csv"
    question_csv = SEED_DIR / "3_WMPSES_习题库.csv"
    veto_csv = SEED_DIR / "4_WMPSES_否定项规则.csv"
    checklist_csv = SEED_DIR / "5_WMPSES_验收规范与确认单.csv"
    docs_csv = SEED_DIR / "6_WMPSES_工况资料与引用标准.csv"

    if exam_csv.exists():
        for row in _read_csv_rows(exam_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_试卷场景" (
                    "pk_ExamID", "Title", "Subtitle", "ExamCode", "VariantCode",
                    "TotalScore", "PassScore", "DurationMinutes", "Status", "Version", "UpdatedAt"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    "UpdatedAt"=excluded."UpdatedAt"
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
                ),
            )

    if hotspot_csv.exists():
        for row in _read_csv_rows(hotspot_csv):
            conn.execute(
                """
                INSERT INTO "WMPSES_设备热点" (
                    "pk_HotspotID", "fk_ExamID", "SortOrder", "DeviceCode", "DeviceName",
                    "Category", "CoordX", "CoordY", "WidgetType", "SceneSummary"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT("pk_HotspotID") DO UPDATE SET
                    "fk_ExamID"=excluded."fk_ExamID",
                    "SortOrder"=excluded."SortOrder",
                    "DeviceCode"=excluded."DeviceCode",
                    "DeviceName"=excluded."DeviceName",
                    "Category"=excluded."Category",
                    "CoordX"=excluded."CoordX",
                    "CoordY"=excluded."CoordY",
                    "WidgetType"=excluded."WidgetType",
                    "SceneSummary"=excluded."SceneSummary"
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
        "Category", "CoordX", "CoordY", "WidgetType", "SceneSummary",
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


def init_db(reset: bool = False, db_path: Path = DB_PATH) -> Dict[str, int]:
    """初始化 SQLite 8 张表结构，并在空表或 reset=True 时写入示范数据。"""
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with get_connection(db_path) as conn:
        conn.executescript(schema_sql)
        conn.execute("PRAGMA foreign_keys = ON;")

        exam_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_试卷场景"').fetchone()[0]
        veto_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_否定项规则"').fetchone()[0]
        chk_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_验收规范与确认单"').fetchone()[0]
        doc_count = conn.execute('SELECT COUNT(*) FROM "WMPSES_工况资料与引用标准"').fetchone()[0]

        if reset:
            factory_bank = _load_factory_bank_from_js()
            if factory_bank:
                exam_id = factory_bank.get("meta", {}).get("id", "WMPSES-1.1.1-V1")
                conn.execute('DELETE FROM "WMPSES_习题库" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_设备热点" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_否定项规则" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_验收规范与确认单" WHERE "fk_ExamID" = ?', (exam_id,))
                conn.execute('DELETE FROM "WMPSES_工况资料与引用标准" WHERE "fk_ExamID" = ?', (exam_id,))
                _upsert_bank_in_tx(conn, factory_bank)
                export_tables_to_seed_csv(conn)
            else:
                conn.execute('DELETE FROM "WMPSES_习题库"')
                conn.execute('DELETE FROM "WMPSES_设备热点"')
                conn.execute('DELETE FROM "WMPSES_否定项规则"')
                conn.execute('DELETE FROM "WMPSES_验收规范与确认单"')
                conn.execute('DELETE FROM "WMPSES_工况资料与引用标准"')
                _import_seed_csv(conn)
        elif exam_count == 0:
            factory_bank = _load_factory_bank_from_js()
            _import_seed_csv(conn)
            if factory_bank:
                _upsert_design_tables_in_tx(conn, factory_bank.get("meta", {}).get("id", "WMPSES-1.1.1-V1"), factory_bank)
                export_tables_to_seed_csv(conn)
        elif veto_count == 0 or chk_count == 0 or doc_count == 0:
            # 旧 5 表数据库自动平滑升级补全 3 张新表初始数据
            factory_bank = _load_factory_bank_from_js()
            if factory_bank:
                _upsert_design_tables_in_tx(conn, factory_bank.get("meta", {}).get("id", "WMPSES-1.1.1-V1"), factory_bank)
                export_tables_to_seed_csv(conn)
            else:
                _import_seed_csv(conn)

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
            hotspots.append({
                "id": hs_id,
                "order": int(hr["SortOrder"] or 1),
                "code": hr["DeviceCode"],
                "name": hr["DeviceName"],
                "category": hr["Category"],
                "x": float(hr["CoordX"]),
                "y": float(hr["CoordY"]),
                "widgetType": hr["WidgetType"] or "generic",
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

        total_score = sum(q["score"] for hs in hotspots for q in hs["questions"])
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
            },
            "hotspots": hotspots,
            "vetoRules": veto_rules,
            "checklistItems": checklist_items,
            "scenarioDocs": scenario_docs,
        }


def _upsert_bank_in_tx(conn: sqlite3.Connection, bank: Dict[str, Any]) -> str:
    meta = bank.get("meta") or {}
    exam_id = str(meta.get("id") or "WMPSES-1.1.1-V1")
    hotspots = bank.get("hotspots") or []
    today_str = datetime.date.today().isoformat()
    calc_total = sum(int(q.get("score") or 2) for hs in hotspots for q in (hs.get("questions") or []))

    conn.execute(
        """
        INSERT INTO "WMPSES_试卷场景" (
            "pk_ExamID", "Title", "Subtitle", "ExamCode", "VariantCode",
            "TotalScore", "PassScore", "DurationMinutes", "Status", "Version", "UpdatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT("pk_ExamID") DO UPDATE SET
            "Title"=excluded."Title",
            "Subtitle"=excluded."Subtitle",
            "ExamCode"=excluded."ExamCode",
            "TotalScore"=excluded."TotalScore",
            "PassScore"=excluded."PassScore",
            "DurationMinutes"=excluded."DurationMinutes",
            "Version"=excluded."Version",
            "UpdatedAt"=excluded."UpdatedAt"
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
        conn.execute(
            """
            INSERT INTO "WMPSES_设备热点" (
                "pk_HotspotID", "fk_ExamID", "SortOrder", "DeviceCode", "DeviceName",
                "Category", "CoordX", "CoordY", "WidgetType", "SceneSummary"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT("pk_HotspotID") DO UPDATE SET
                "fk_ExamID"=excluded."fk_ExamID",
                "SortOrder"=excluded."SortOrder",
                "DeviceCode"=excluded."DeviceCode",
                "DeviceName"=excluded."DeviceName",
                "Category"=excluded."Category",
                "CoordX"=excluded."CoordX",
                "CoordY"=excluded."CoordY",
                "WidgetType"=excluded."WidgetType",
                "SceneSummary"=excluded."SceneSummary"
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


def save_question_bank(bank: Dict[str, Any], db_path: Path = DB_PATH) -> Dict[str, Any]:
    """将教师编辑模式修改/新增的热点、题目与否定项规则同步写入 SQLite 关系表，并更新 CSV 种子文件。"""
    init_db(reset=False, db_path=db_path)
    with get_connection(db_path) as conn:
        exam_id = _upsert_bank_in_tx(conn, bank)
        export_tables_to_seed_csv(conn)
        counts = get_table_counts(conn)
    saved_bank = get_question_bank(exam_id=exam_id, db_path=db_path)
    return {"bank": saved_bank, "counts": counts}


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
                "pk_ResultID", "fk_ExamID", "ExamineeName", "ExamineeID", "ExamMode",
                "Score", "TotalScore", "Accuracy", "PassStatus",
                "VetoTriggered", "VetoReason", "DurationSeconds", "SubmittedAt", "ResultDetailJSON"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result_id,
                fk_exam_id,
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
        tables["WMPSES_试卷场景"] = [
            dict(r) for r in conn.execute('SELECT * FROM "WMPSES_试卷场景" ORDER BY rowid ASC').fetchall()
        ]
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
        tables["WMPSES_考试记录"] = [
            dict(r) for r in conn.execute(
                'SELECT "pk_ResultID","fk_ExamID","ExamineeName","ExamineeID","ExamMode","Score","TotalScore","Accuracy","PassStatus","VetoTriggered","VetoReason","DurationSeconds","SubmittedAt" FROM "WMPSES_考试记录" ORDER BY "SubmittedAt" DESC LIMIT 50'
            ).fetchall()
        ]
        tables["WMPSES_作答明细"] = [
            dict(r) for r in conn.execute(
                'SELECT * FROM "WMPSES_作答明细" ORDER BY rowid DESC LIMIT 100'
            ).fetchall()
        ]
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
