-- =====================================================================
-- WMPSES 工业废气治理工实操模拟仿真考试系统 - SQLite 8 表关系型数据库结构
-- 与 FileMaker 8 表结构 1:1 严格对齐，涵盖题库、考务、设计方案规范与表驱动否定项规则
-- =====================================================================

PRAGMA foreign_keys = ON;

-- 1. 试卷与装置场景表
CREATE TABLE IF NOT EXISTS "WMPSES_试卷场景" (
    "pk_ExamID"       TEXT PRIMARY KEY NOT NULL,
    "Title"           TEXT NOT NULL,
    "Subtitle"        TEXT NOT NULL DEFAULT '',
    "ExamCode"        TEXT NOT NULL DEFAULT '6-28-02-05 / 1.1.1',
    "VariantCode"     TEXT NOT NULL DEFAULT 'V1',
    "TotalScore"      INTEGER NOT NULL DEFAULT 50,
    "PassScore"       INTEGER NOT NULL DEFAULT 30,
    "DurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "Status"          TEXT NOT NULL DEFAULT '已启用',
    "Version"         TEXT NOT NULL DEFAULT '1.0.0',
    "UpdatedAt"       TEXT NOT NULL DEFAULT (date('now', 'localtime'))
);

-- 2. 全景图设备热点部位表
CREATE TABLE IF NOT EXISTS "WMPSES_设备热点" (
    "pk_HotspotID"  TEXT PRIMARY KEY NOT NULL,
    "fk_ExamID"     TEXT NOT NULL,
    "SortOrder"     INTEGER NOT NULL DEFAULT 1,
    "DeviceCode"    TEXT NOT NULL DEFAULT '',
    "DeviceName"    TEXT NOT NULL,
    "Category"      TEXT NOT NULL DEFAULT '现场设备核查',
    "CoordX"        REAL NOT NULL DEFAULT 50.0,
    "CoordY"        REAL NOT NULL DEFAULT 50.0,
    "WidgetType"    TEXT NOT NULL DEFAULT 'generic',
    "SceneSummary"  TEXT NOT NULL DEFAULT '',
    FOREIGN KEY ("fk_ExamID") REFERENCES "WMPSES_试卷场景"("pk_ExamID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_hotspots_exam_order"
    ON "WMPSES_设备热点" ("fk_ExamID", "SortOrder");

-- 3. 设备热点关联习题库表
CREATE TABLE IF NOT EXISTS "WMPSES_习题库" (
    "pk_QuestionID"        TEXT PRIMARY KEY NOT NULL,
    "fk_HotspotID"         TEXT NOT NULL,
    "fk_ExamID"            TEXT NOT NULL,
    "SortOrder"            INTEGER NOT NULL DEFAULT 1,
    "DefectCode"           TEXT NOT NULL DEFAULT '',
    "DefectLevel"          TEXT NOT NULL DEFAULT 'general',
    "IsMajorDefect"        INTEGER NOT NULL DEFAULT 0,
    "IsCriticalConclusion" INTEGER NOT NULL DEFAULT 0,
    "QuestionType"         TEXT NOT NULL DEFAULT 'single',
    "Score"                INTEGER NOT NULL DEFAULT 2,
    "QuestionTitle"        TEXT NOT NULL,
    "OptionA"              TEXT NOT NULL DEFAULT '',
    "OptionB"              TEXT NOT NULL DEFAULT '',
    "OptionC"              TEXT NOT NULL DEFAULT '',
    "OptionD"              TEXT NOT NULL DEFAULT '',
    "OptionE"              TEXT NOT NULL DEFAULT '',
    "AnswerKeys"           TEXT NOT NULL DEFAULT 'A',
    "ReferenceStandard"    TEXT NOT NULL DEFAULT '',
    "Explanation"          TEXT NOT NULL DEFAULT '',
    FOREIGN KEY ("fk_HotspotID") REFERENCES "WMPSES_设备热点"("pk_HotspotID") ON DELETE CASCADE,
    FOREIGN KEY ("fk_ExamID") REFERENCES "WMPSES_试卷场景"("pk_ExamID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_questions_hotspot_order"
    ON "WMPSES_习题库" ("fk_HotspotID", "SortOrder");

CREATE INDEX IF NOT EXISTS "idx_questions_exam"
    ON "WMPSES_习题库" ("fk_ExamID");

-- 4. 考试交卷主记录表
CREATE TABLE IF NOT EXISTS "WMPSES_考试记录" (
    "pk_ResultID"      TEXT PRIMARY KEY NOT NULL,
    "fk_ExamID"        TEXT NOT NULL,
    "ExamineeName"     TEXT NOT NULL DEFAULT '现场考生',
    "ExamineeID"       TEXT NOT NULL DEFAULT '',
    "ExamMode"         TEXT NOT NULL DEFAULT 'exam',
    "Score"            INTEGER NOT NULL DEFAULT 0,
    "TotalScore"       INTEGER NOT NULL DEFAULT 50,
    "Accuracy"         INTEGER NOT NULL DEFAULT 0,
    "PassStatus"       TEXT NOT NULL DEFAULT '不合格',
    "VetoTriggered"    INTEGER NOT NULL DEFAULT 0,
    "VetoReason"       TEXT NOT NULL DEFAULT '',
    "DurationSeconds"  INTEGER NOT NULL DEFAULT 0,
    "SubmittedAt"      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    "ResultDetailJSON" TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY ("fk_ExamID") REFERENCES "WMPSES_试卷场景"("pk_ExamID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_results_submitted"
    ON "WMPSES_考试记录" ("SubmittedAt" DESC);

-- 5. 逐题作答明细子表
CREATE TABLE IF NOT EXISTS "WMPSES_作答明细" (
    "pk_DetailID"   TEXT PRIMARY KEY NOT NULL,
    "fk_ResultID"   TEXT NOT NULL,
    "fk_QuestionID" TEXT NOT NULL,
    "HotspotCode"   TEXT NOT NULL DEFAULT '',
    "DefectCode"    TEXT NOT NULL DEFAULT '',
    "UserAnswer"    TEXT NOT NULL DEFAULT '',
    "CorrectAnswer" TEXT NOT NULL DEFAULT '',
    "IsCorrect"     INTEGER NOT NULL DEFAULT 0,
    "EarnedScore"   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY ("fk_ResultID") REFERENCES "WMPSES_考试记录"("pk_ResultID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_details_result"
    ON "WMPSES_作答明细" ("fk_ResultID");

-- 6. 否定项规则表（表驱动的一票否决逻辑配置）
CREATE TABLE IF NOT EXISTS "WMPSES_否定项规则" (
    "pk_RuleID"      TEXT PRIMARY KEY NOT NULL,
    "fk_ExamID"      TEXT NOT NULL,
    "SortOrder"      INTEGER NOT NULL DEFAULT 1,
    "RuleCode"       TEXT NOT NULL,
    "RuleName"       TEXT NOT NULL,
    "ConditionType"  TEXT NOT NULL,
    "ThresholdValue" REAL NOT NULL DEFAULT 1,
    "TargetRef"      TEXT NOT NULL DEFAULT '',
    "PenaltyAction"  TEXT NOT NULL DEFAULT 'ZERO_SCORE',
    "IsEnabled"      INTEGER NOT NULL DEFAULT 1,
    "AlertMessage"   TEXT NOT NULL DEFAULT '',
    FOREIGN KEY ("fk_ExamID") REFERENCES "WMPSES_试卷场景"("pk_ExamID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_veto_rules_exam"
    ON "WMPSES_否定项规则" ("fk_ExamID", "SortOrder");

-- 7. 验收规范与24项确认单表（对应《设计方案》表3与附录A）
CREATE TABLE IF NOT EXISTS "WMPSES_验收规范与确认单" (
    "pk_CheckItemID"     TEXT PRIMARY KEY NOT NULL,
    "fk_ExamID"          TEXT NOT NULL,
    "fk_HotspotID"       TEXT NOT NULL DEFAULT '',
    "ItemNo"             INTEGER NOT NULL DEFAULT 1,
    "AspectName"         TEXT NOT NULL,
    "CheckItemName"      TEXT NOT NULL,
    "InteractionWay"     TEXT NOT NULL DEFAULT '',
    "StandardBasis"      TEXT NOT NULL DEFAULT '',
    "SceneStatus"        TEXT NOT NULL DEFAULT '',
    "StandardConclusion" TEXT NOT NULL DEFAULT '合格',
    "RelatedDefectCode"  TEXT NOT NULL DEFAULT '',
    FOREIGN KEY ("fk_ExamID") REFERENCES "WMPSES_试卷场景"("pk_ExamID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_checklist_exam_no"
    ON "WMPSES_验收规范与确认单" ("fk_ExamID", "ItemNo");

-- 8. 工况资料与引用标准表（对应《设计方案》4份电子台账与附录C标准规范）
CREATE TABLE IF NOT EXISTS "WMPSES_工况资料与引用标准" (
    "pk_DocID"           TEXT PRIMARY KEY NOT NULL,
    "fk_ExamID"          TEXT NOT NULL,
    "DocCategory"        TEXT NOT NULL,
    "SortOrder"          INTEGER NOT NULL DEFAULT 1,
    "DocCode"            TEXT NOT NULL DEFAULT '',
    "DocTitle"           TEXT NOT NULL,
    "DeptOrCategory"     TEXT NOT NULL DEFAULT '',
    "ContentSummary"     TEXT NOT NULL DEFAULT '',
    "RelatedHotspotCode" TEXT NOT NULL DEFAULT '',
    FOREIGN KEY ("fk_ExamID") REFERENCES "WMPSES_试卷场景"("pk_ExamID") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_docs_exam_cat"
    ON "WMPSES_工况资料与引用标准" ("fk_ExamID", "DocCategory", "SortOrder");
