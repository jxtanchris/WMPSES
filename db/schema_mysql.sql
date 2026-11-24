-- =====================================================================
-- WMPSES 工业废气治理工实操模拟仿真考试系统 - MySQL 8.0 关系型数据库结构
-- 支持 70~200+ 人并发考试（InnoDB 行级锁 + utf8mb4 + 交卷幂等键 + 答题草稿防丢）
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. 试卷与装置场景表
CREATE TABLE IF NOT EXISTS `WMPSES_试卷场景` (
    `pk_ExamID`        VARCHAR(64)  NOT NULL,
    `Title`            VARCHAR(255) NOT NULL,
    `Subtitle`         VARCHAR(512) NOT NULL DEFAULT '',
    `ExamCode`         VARCHAR(128) NOT NULL DEFAULT '6-28-02-05 / 1.1.1',
    `VariantCode`      VARCHAR(32)  NOT NULL DEFAULT 'V1',
    `TotalScore`       INT          NOT NULL DEFAULT 50,
    `PassScore`        INT          NOT NULL DEFAULT 30,
    `DurationMinutes`  INT          NOT NULL DEFAULT 30,
    `Status`           VARCHAR(32)  NOT NULL DEFAULT '已启用',
    `Version`          VARCHAR(32)  NOT NULL DEFAULT '1.0.0',
    `UpdatedAt`        VARCHAR(32)  NOT NULL DEFAULT '',
    `ExamPicture`      LONGTEXT     NOT NULL,
    `ExamPicture3D`    LONGTEXT     NOT NULL,
    `Scene3DModelName` VARCHAR(255) NOT NULL DEFAULT '',
    `Scene3DModelBLOB` LONGBLOB     NULL,
    PRIMARY KEY (`pk_ExamID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 全景图设备热点部位表
CREATE TABLE IF NOT EXISTS `WMPSES_设备热点` (
    `pk_HotspotID`     VARCHAR(64)  NOT NULL,
    `fk_ExamID`        VARCHAR(64)  NOT NULL,
    `SortOrder`        INT          NOT NULL DEFAULT 1,
    `DeviceCode`       VARCHAR(64)  NOT NULL DEFAULT '',
    `DeviceName`       VARCHAR(255) NOT NULL,
    `Category`         VARCHAR(128) NOT NULL DEFAULT '现场设备核查',
    `CoordX`           DOUBLE       NOT NULL DEFAULT 50.0,
    `CoordY`           DOUBLE       NOT NULL DEFAULT 50.0,
    `WidgetType`       VARCHAR(64)  NOT NULL DEFAULT 'generic',
    `SceneSummary`     TEXT         NOT NULL,
    `WidgetParamsJSON` MEDIUMTEXT   NOT NULL,
    PRIMARY KEY (`pk_HotspotID`),
    KEY `idx_hotspots_exam_order` (`fk_ExamID`, `SortOrder`),
    CONSTRAINT `fk_hs_exam` FOREIGN KEY (`fk_ExamID`) REFERENCES `WMPSES_试卷场景` (`pk_ExamID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 设备热点关联习题库表（fk_HotspotID 允许为 NULL，支持独立题库池）
CREATE TABLE IF NOT EXISTS `WMPSES_习题库` (
    `pk_QuestionID`        VARCHAR(64)  NOT NULL,
    `fk_HotspotID`         VARCHAR(64)  NULL DEFAULT NULL,
    `fk_ExamID`            VARCHAR(64)  NOT NULL,
    `SortOrder`            INT          NOT NULL DEFAULT 1,
    `DefectCode`           VARCHAR(64)  NOT NULL DEFAULT '',
    `DefectLevel`          VARCHAR(32)  NOT NULL DEFAULT 'general',
    `IsMajorDefect`        TINYINT(1)   NOT NULL DEFAULT 0,
    `IsCriticalConclusion` TINYINT(1)   NOT NULL DEFAULT 0,
    `QuestionType`         VARCHAR(32)  NOT NULL DEFAULT 'single',
    `Score`                INT          NOT NULL DEFAULT 2,
    `QuestionTitle`        TEXT         NOT NULL,
    `OptionA`              TEXT         NOT NULL,
    `OptionB`              TEXT         NOT NULL,
    `OptionC`              TEXT         NOT NULL,
    `OptionD`              TEXT         NOT NULL,
    `OptionE`              TEXT         NOT NULL,
    `AnswerKeys`           VARCHAR(64)  NOT NULL DEFAULT 'A',
    `ReferenceStandard`    VARCHAR(255) NOT NULL DEFAULT '',
    `Explanation`          TEXT         NOT NULL,
    PRIMARY KEY (`pk_QuestionID`),
    KEY `idx_questions_hotspot_order` (`fk_HotspotID`, `SortOrder`),
    KEY `idx_questions_exam` (`fk_ExamID`),
    CONSTRAINT `fk_q_hotspot` FOREIGN KEY (`fk_HotspotID`) REFERENCES `WMPSES_设备热点` (`pk_HotspotID`) ON DELETE SET NULL,
    CONSTRAINT `fk_q_exam` FOREIGN KEY (`fk_ExamID`) REFERENCES `WMPSES_试卷场景` (`pk_ExamID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 考试交卷主记录表（新增 ClientSubmissionID 唯一幂等键防止并发重复交卷）
CREATE TABLE IF NOT EXISTS `WMPSES_考试记录` (
    `pk_ResultID`        VARCHAR(64)  NOT NULL,
    `ClientSubmissionID` VARCHAR(64)  NULL DEFAULT NULL,
    `fk_ExamID`          VARCHAR(64)  NOT NULL,
    `fk_UserID`          VARCHAR(64)  NOT NULL DEFAULT '',
    `ExamineeName`       VARCHAR(128) NOT NULL DEFAULT '现场考生',
    `ExamineeID`         VARCHAR(64)  NOT NULL DEFAULT '',
    `ExamMode`           VARCHAR(32)  NOT NULL DEFAULT 'exam',
    `Score`              INT          NOT NULL DEFAULT 0,
    `ObjectiveScore`     INT          NOT NULL DEFAULT 0,
    `SubjectiveScore`    INT          NOT NULL DEFAULT 0,
    `TotalScore`         INT          NOT NULL DEFAULT 50,
    `Accuracy`           INT          NOT NULL DEFAULT 0,
    `PassStatus`         VARCHAR(32)  NOT NULL DEFAULT '不合格',
    `ReviewStatus`       VARCHAR(32)  NOT NULL DEFAULT '自动已评',
    `ReviewerID`         VARCHAR(64)  NOT NULL DEFAULT '',
    `ReviewerName`       VARCHAR(128) NOT NULL DEFAULT '',
    `ReviewedAt`         VARCHAR(32)  NOT NULL DEFAULT '',
    `VetoTriggered`      TINYINT(1)   NOT NULL DEFAULT 0,
    `VetoReason`         TEXT         NOT NULL,
    `DurationSeconds`    INT          NOT NULL DEFAULT 0,
    `SubmittedAt`        VARCHAR(32)  NOT NULL DEFAULT '',
    `ResultDetailJSON`   LONGTEXT     NOT NULL,
    PRIMARY KEY (`pk_ResultID`),
    UNIQUE KEY `uk_client_submission_id` (`ClientSubmissionID`),
    KEY `idx_results_submitted` (`SubmittedAt`),
    KEY `idx_results_user_exam` (`fk_UserID`, `fk_ExamID`),
    CONSTRAINT `fk_res_exam` FOREIGN KEY (`fk_ExamID`) REFERENCES `WMPSES_试卷场景` (`pk_ExamID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 逐题作答明细子表
CREATE TABLE IF NOT EXISTS `WMPSES_作答明细` (
    `pk_DetailID`   VARCHAR(64)  NOT NULL,
    `fk_ResultID`   VARCHAR(64)  NOT NULL,
    `fk_QuestionID` VARCHAR(64)  NOT NULL,
    `QuestionType`  VARCHAR(32)  NOT NULL DEFAULT 'single',
    `MaxScore`      INT          NOT NULL DEFAULT 0,
    `HotspotCode`   VARCHAR(64)  NOT NULL DEFAULT '',
    `DefectCode`    VARCHAR(64)  NOT NULL DEFAULT '',
    `UserAnswer`    TEXT         NOT NULL,
    `CorrectAnswer` VARCHAR(128) NOT NULL DEFAULT '',
    `IsCorrect`     TINYINT(1)   NOT NULL DEFAULT 0,
    `EarnedScore`   INT          NOT NULL DEFAULT 0,
    `ReviewComment` TEXT         NOT NULL,
    PRIMARY KEY (`pk_DetailID`),
    KEY `idx_details_result` (`fk_ResultID`),
    KEY `idx_details_qtype` (`fk_ResultID`, `QuestionType`),
    CONSTRAINT `fk_det_res` FOREIGN KEY (`fk_ResultID`) REFERENCES `WMPSES_考试记录` (`pk_ResultID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. 否定项规则表
CREATE TABLE IF NOT EXISTS `WMPSES_否定项规则` (
    `pk_RuleID`      VARCHAR(64)  NOT NULL,
    `fk_ExamID`      VARCHAR(64)  NOT NULL,
    `SortOrder`      INT          NOT NULL DEFAULT 1,
    `RuleCode`       VARCHAR(64)  NOT NULL,
    `RuleName`       VARCHAR(255) NOT NULL,
    `ConditionType`  VARCHAR(64)  NOT NULL,
    `ThresholdValue` DOUBLE       NOT NULL DEFAULT 1,
    `TargetRef`      VARCHAR(128) NOT NULL DEFAULT '',
    `PenaltyAction`  VARCHAR(32)  NOT NULL DEFAULT 'ZERO_SCORE',
    `IsEnabled`      TINYINT(1)   NOT NULL DEFAULT 1,
    `AlertMessage`   TEXT         NOT NULL,
    PRIMARY KEY (`pk_RuleID`),
    KEY `idx_veto_rules_exam` (`fk_ExamID`, `SortOrder`),
    CONSTRAINT `fk_veto_exam` FOREIGN KEY (`fk_ExamID`) REFERENCES `WMPSES_试卷场景` (`pk_ExamID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. 验收规范与确认单表
CREATE TABLE IF NOT EXISTS `WMPSES_验收规范与确认单` (
    `pk_CheckItemID`     VARCHAR(64)  NOT NULL,
    `fk_ExamID`          VARCHAR(64)  NOT NULL,
    `fk_HotspotID`       VARCHAR(64)  NOT NULL DEFAULT '',
    `ItemNo`             INT          NOT NULL DEFAULT 1,
    `AspectName`         VARCHAR(128) NOT NULL,
    `CheckItemName`      VARCHAR(255) NOT NULL,
    `InteractionWay`     VARCHAR(128) NOT NULL DEFAULT '',
    `StandardBasis`      VARCHAR(255) NOT NULL DEFAULT '',
    `SceneStatus`        TEXT         NOT NULL,
    `StandardConclusion` VARCHAR(64)  NOT NULL DEFAULT '合格',
    `RelatedDefectCode`  VARCHAR(64)  NOT NULL DEFAULT '',
    PRIMARY KEY (`pk_CheckItemID`),
    KEY `idx_checklist_exam_no` (`fk_ExamID`, `ItemNo`),
    CONSTRAINT `fk_chk_exam` FOREIGN KEY (`fk_ExamID`) REFERENCES `WMPSES_试卷场景` (`pk_ExamID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. 工况资料与引用标准表
CREATE TABLE IF NOT EXISTS `WMPSES_工况资料与引用标准` (
    `pk_DocID`           VARCHAR(64)  NOT NULL,
    `fk_ExamID`          VARCHAR(64)  NOT NULL,
    `DocCategory`        VARCHAR(64)  NOT NULL,
    `SortOrder`          INT          NOT NULL DEFAULT 1,
    `DocCode`            VARCHAR(128) NOT NULL DEFAULT '',
    `DocTitle`           VARCHAR(255) NOT NULL,
    `DeptOrCategory`     VARCHAR(128) NOT NULL DEFAULT '',
    `ContentSummary`     TEXT         NOT NULL,
    `RelatedHotspotCode` VARCHAR(128) NOT NULL DEFAULT '',
    PRIMARY KEY (`pk_DocID`),
    KEY `idx_docs_exam_cat` (`fk_ExamID`, `DocCategory`, `SortOrder`),
    CONSTRAINT `fk_doc_exam` FOREIGN KEY (`fk_ExamID`) REFERENCES `WMPSES_试卷场景` (`pk_ExamID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. 用户人员统一管理表
CREATE TABLE IF NOT EXISTS `WMPSES_用户人员` (
    `pk_UserID`     VARCHAR(64)  NOT NULL,
    `UserCode`      VARCHAR(64)  NOT NULL DEFAULT '',
    `FullName`      VARCHAR(128) NOT NULL,
    `RoleType`      VARCHAR(32)  NOT NULL DEFAULT '考生',
    `Password`      VARCHAR(128) NOT NULL DEFAULT '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
    `Department`    VARCHAR(255) NOT NULL DEFAULT '',
    `SkillLevel`    VARCHAR(128) NOT NULL DEFAULT '',
    `Specialty`     VARCHAR(255) NOT NULL DEFAULT '',
    `CertificateNo` VARCHAR(128) NOT NULL DEFAULT '',
    `BatchNo`       VARCHAR(128) NOT NULL DEFAULT '',
    `Phone`         VARCHAR(64)  NOT NULL DEFAULT '',
    `Status`        VARCHAR(32)  NOT NULL DEFAULT '正常',
    `CreatedAt`     VARCHAR(32)  NOT NULL DEFAULT '',
    PRIMARY KEY (`pk_UserID`),
    KEY `idx_users_role_code` (`RoleType`, `UserCode`),
    KEY `idx_users_code` (`UserCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. 题库变更审计日志表
CREATE TABLE IF NOT EXISTS `WMPSES_题库变更日志` (
    `pk_LogID`      VARCHAR(64)  NOT NULL,
    `fk_ExamID`     VARCHAR(64)  NOT NULL,
    `fk_UserID`     VARCHAR(64)  NOT NULL DEFAULT '',
    `OperatorName`  VARCHAR(128) NOT NULL DEFAULT '',
    `ActionType`    VARCHAR(64)  NOT NULL DEFAULT '更新题库',
    `VersionAfter`  VARCHAR(32)  NOT NULL DEFAULT '1.0.0',
    `HotspotCount`  INT          NOT NULL DEFAULT 8,
    `QuestionCount` INT          NOT NULL DEFAULT 15,
    `TotalScore`    INT          NOT NULL DEFAULT 50,
    `ChangeSummary` TEXT         NOT NULL,
    `ChangedAt`     VARCHAR(32)  NOT NULL DEFAULT '',
    PRIMARY KEY (`pk_LogID`),
    KEY `idx_changelog_exam_time` (`fk_ExamID`, `ChangedAt`),
    CONSTRAINT `fk_log_exam` FOREIGN KEY (`fk_ExamID`) REFERENCES `WMPSES_试卷场景` (`pk_ExamID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. 工况可视化卡片模板库
CREATE TABLE IF NOT EXISTS `WMPSES_工况卡片模板` (
    `pk_TemplateID`     VARCHAR(64)  NOT NULL,
    `TemplateCode`      VARCHAR(64)  NOT NULL,
    `TemplateName`      VARCHAR(255) NOT NULL,
    `IsBuiltin`         TINYINT(1)   NOT NULL DEFAULT 0,
    `LeftPanelType`     VARCHAR(64)  NOT NULL DEFAULT 'gauge_dial',
    `LeftPanelTitle`    VARCHAR(255) NOT NULL DEFAULT '',
    `LeftPanelCode`     VARCHAR(128) NOT NULL DEFAULT '',
    `RightPanelType`    VARCHAR(64)  NOT NULL DEFAULT 'dcs_interlock',
    `RightPanelTitle`   VARCHAR(255) NOT NULL DEFAULT '',
    `RightPanelCode`    VARCHAR(128) NOT NULL DEFAULT '',
    `ParamSchemaJSON`   MEDIUMTEXT   NOT NULL,
    `CustomImageBase64` LONGTEXT     NOT NULL,
    `SortOrder`         INT          NOT NULL DEFAULT 10,
    `UpdatedAt`         VARCHAR(32)  NOT NULL DEFAULT '',
    PRIMARY KEY (`pk_TemplateID`),
    UNIQUE KEY `uk_template_code` (`TemplateCode`),
    KEY `idx_widget_templates_order` (`IsBuiltin`, `SortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. 考生答题草稿表（高并发防丢卷与断线续考）
CREATE TABLE IF NOT EXISTS `WMPSES_答题草稿` (
    `fk_UserID`        VARCHAR(64) NOT NULL,
    `fk_ExamID`        VARCHAR(64) NOT NULL,
    `AnswersJSON`      LONGTEXT    NOT NULL,
    `RemainingSeconds` INT         NOT NULL DEFAULT 1800,
    `StartedAt`        VARCHAR(32) NOT NULL DEFAULT '',
    `UpdatedAt`        VARCHAR(32) NOT NULL DEFAULT '',
    PRIMARY KEY (`fk_UserID`, `fk_ExamID`),
    CONSTRAINT `fk_draft_exam` FOREIGN KEY (`fk_ExamID`) REFERENCES `WMPSES_试卷场景` (`pk_ExamID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
