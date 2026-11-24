/**
 * FileMaker WebViewer / FileMaker Data API / 本地离线存储 三合一数据适配层
 */
(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    BANK: 'wmpses_question_bank_v1',
    CONFIG: 'wmpses_fm_config_v1',
    HISTORY: 'wmpses_exam_history_v1',
    AUTH_USER: 'wmpses_auth_user_v1',
    AUTH_TOKEN: 'wmpses_auth_token_v1',
    LOCAL_USERS: 'wmpses_local_users_v1',
    TEMPLATES: 'wmpses_widget_templates_v1'
  };

  const DEFAULT_CONFIG = {
    sourceMode: 'auto', // 'auto' | 'sqlite' | 'local' | 'webviewer' | 'dataapi' | 'rest'
    sqliteApiUrl: 'http://127.0.0.1:8765',
    fmScripts: {
      loadBank: '加载仿真题库到WebViewer',
      submitResult: '接收仿真考试交卷成绩',
      saveBank: '保存题库热点配置'
    },
    dataApi: {
      serverUrl: '', // e.g. https://fm.example.com
      database: '',  // e.g. WMPSES_Exam
      apiVersion: 'vLatest',
      username: '',
      password: '',
      token: '',
      bankLayout: 'QuestionBank_API',
      bankField: 'QuestionBankJSON',
      resultLayout: 'ExamResults_API'
    },
    restApi: {
      getBankUrl: '',
      postResultUrl: '',
      saveBankUrl: '',
      authHeader: ''
    },
    student: {
      userId: 'USR-EX-001',
      name: '张建国',
      examineeId: 'ZK202611001',
      department: '涂装一车间RTO运行班',
      skillLevel: '二级/技师',
      teacherId: 'USR-TC-001',
      teacherName: '陈明远 (命题教师)'
    }
  };

  function deepClone(obj) {
    return structuredClone(obj);
  }

  function safeParseJson(input, fallback) {
    if (input == null) return fallback;
    if (typeof input === 'object') return input;
    try {
      return JSON.parse(String(input));
    } catch (e) {
      return fallback;
    }
  }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(String(str == null ? '' : str)));
    }
    const s = unescape(encodeURIComponent(String(str == null ? '' : str)));
    const arr = [];
    for (let i = 0; i < s.length; i++) arr.push(s.charCodeAt(i));
    return arr;
  }

  function sha256Hex(input) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const rotr = (n, x) => (x >>> n) | (x << (32 - n));
    const bytes = utf8Bytes(input);
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
    bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

    let H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const W = new Array(64);
    for (let i = 0; i < bytes.length; i += 64) {
      for (let t = 0; t < 16; t++) {
        W[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
      }
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
        const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        const ch = (e & f) ^ ((~e) & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H = [
        (H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0,
        (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0
      ];
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function mapDefaultUsers() {
    const fb = global.DEFAULT_QUESTION_BANK || {};
    const defaultHash = sha256Hex('123456');
    return (fb.users || []).map((u) => ({
      pk_UserID: u.id,
      UserCode: u.userCode,
      FullName: u.fullName,
      RoleType: u.roleType,
      Password: u.password || defaultHash,
      Department: u.department,
      SkillLevel: u.skillLevel,
      Specialty: u.specialty,
      CertificateNo: u.certificateNo,
      BatchNo: u.batchNo,
      Phone: u.phone,
      Status: u.status || '正常'
    }));
  }

  function loadLocalUsers() {
    const defaults = mapDefaultUsers();
    try {
      const raw = global.localStorage.getItem(STORAGE_KEYS.LOCAL_USERS);
      const cached = safeParseJson(raw, null);
      if (Array.isArray(cached) && cached.length) {
        const defaultHash = sha256Hex('123456');
        const map = new Map();
        defaults.forEach((d) => map.set(d.pk_UserID, d));
        cached.forEach((u) => {
          if (u && u.pk_UserID) {
            map.set(u.pk_UserID, Object.assign({ Password: defaultHash, Status: '正常' }, map.get(u.pk_UserID) || {}, u));
          }
        });
        return Array.from(map.values());
      }
    } catch (e) {
      // ignore
    }
    return defaults;
  }

  function saveLocalUsers(users) {
    try {
      if (Array.isArray(users)) {
        global.localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));
      }
    } catch (e) {
      // ignore
    }
  }

  function loadLocalTemplates() {
    const fb = global.DEFAULT_QUESTION_BANK || {};
    const defaults = deepClone(fb.widgetTemplates || []);
    try {
      const raw = global.localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      const cached = safeParseJson(raw, null);
      if (Array.isArray(cached) && cached.length) {
        const map = new Map();
        defaults.forEach((d) => map.set(d.code, d));
        cached.forEach((t) => {
          if (t && t.code) map.set(t.code, t);
        });
        return Array.from(map.values());
      }
    } catch (e) {
      // ignore
    }
    return defaults;
  }

  function saveLocalTemplates(templates) {
    try {
      if (Array.isArray(templates)) {
        global.localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
      }
    } catch (e) {
      // ignore
    }
  }

  function normalizeQuestionBank(bank) {
    const fallback = deepClone(global.DEFAULT_QUESTION_BANK);
    if (!bank || typeof bank !== 'object') return fallback;

    const hotspots = Array.isArray(bank.hotspots) ? bank.hotspots : fallback.hotspots;
    const normalizedHotspots = hotspots.map((hs, idx) => {
      const wType = hs.widgetType || 'generic';
      const fbHs = (fallback.hotspots || []).find((f) => f.id === hs.id || f.widgetType === wType);
      const baseParams = (fbHs && fbHs.widgetType === wType && fbHs.widgetParams) ? deepClone(fbHs.widgetParams) : {};
      let customParams = {};
      if (hs.widgetParams && typeof hs.widgetParams === 'object') {
        customParams = hs.widgetParams;
      } else if (typeof hs.widgetParams === 'string' && hs.widgetParams.trim()) {
        customParams = safeParseJson(hs.widgetParams, {});
      }
      const mergedParams = Object.assign(baseParams, customParams);
      const normX = Math.min(98, Math.max(2, Number(hs.x) || 50));
      const normY = Math.min(96, Math.max(4, Number(hs.y) || 50));
      const p3src = (hs.pos3d && Number.isFinite(Number(hs.pos3d.x)))
        ? hs.pos3d
        : (mergedParams._pos3d && Number.isFinite(Number(mergedParams._pos3d.x)))
          ? mergedParams._pos3d
          : (fbHs && fbHs.pos3d)
            ? fbHs.pos3d
            : {
                x: Math.round(((normX - 50) * 0.36) * 10) / 10,
                y: Math.round(((normY - 50) * -0.04 - 2.0) * 10) / 10,
                z: Math.round(Math.min(12.0, Math.max(1.0, (95 - normY) * 0.12)) * 10) / 10
              };
      const resolvedPos3d = {
        x: Math.round(Number(p3src.x) * 100) / 100,
        y: Math.round((Number.isFinite(Number(p3src.y)) ? Number(p3src.y) : -2.0) * 100) / 100,
        z: Math.round((Number.isFinite(Number(p3src.z)) ? Number(p3src.z) : 3.0) * 100) / 100
      };
      mergedParams._pos3d = deepClone(resolvedPos3d);
      const panoSrc = (hs.panoPos && Number.isFinite(Number(hs.panoPos.yaw))) ? hs.panoPos : mergedParams._pano;
      const resolvedPano = (panoSrc && Number.isFinite(Number(panoSrc.yaw)) && Number.isFinite(Number(panoSrc.pitch)))
        ? { yaw: Number(panoSrc.yaw), pitch: Number(panoSrc.pitch) }
        : null;
      if (resolvedPano) mergedParams._pano = deepClone(resolvedPano);

      return {
        id: hs.id || 'hs-' + (idx + 1),
        order: Number.isFinite(Number(hs.order)) ? Number(hs.order) : idx + 1,
        code: hs.code || 'DEV-' + String(idx + 1).padStart(2, '0'),
        name: hs.name || '未命名设备部位',
        category: hs.category || '现场设备核查',
        x: normX,
        y: normY,
        pos3d: resolvedPos3d,
        panoPos: resolvedPano,
        presetKey: hs.presetKey || (fbHs && fbHs.presetKey) || 'overview',
        widgetType: wType,
        widgetParams: mergedParams,
        sceneSummary: hs.sceneSummary || '',
      questions: Array.isArray(hs.questions)
        ? hs.questions.map((q, qIdx) => {
            const qType = ['multiple', 'judge', 'short_answer'].includes(q.type) ? q.type : 'single';
            return {
              id: q.id || (hs.id || 'hs') + '-q' + (qIdx + 1),
              defectCode: q.defectCode || '',
              defectLevel: q.defectLevel || 'general',
              isMajorDefect: Boolean(q.isMajorDefect),
              isCriticalConclusion: Boolean(q.isCriticalConclusion),
              type: qType,
              score: Number(q.score) > 0 ? Number(q.score) : 2,
              title: q.title || '请输入题目内容',
              options: qType === 'short_answer'
                ? []
                : (Array.isArray(q.options) && q.options.length > 0
                  ? q.options.map((opt, oIdx) => ({
                      key: opt.key || String.fromCharCode(65 + oIdx),
                      text: opt.text || ''
                    }))
                  : [
                      { key: 'A', text: '选项 A' },
                      { key: 'B', text: '选项 B' }
                    ]),
              answer: qType === 'short_answer' ? [] : (Array.isArray(q.answer) ? q.answer.slice() : ['A']),
              referenceStandard: q.referenceStandard || '',
              explanation: q.explanation || ''
            };
          })
        : []
      };
    });

    const unassignedQuestions = Array.isArray(bank.unassignedQuestions)
      ? bank.unassignedQuestions.map((q, qIdx) => {
          const qType = ['multiple', 'judge', 'short_answer'].includes(q.type) ? q.type : 'single';
          return {
            id: q.id || 'pool-q' + (qIdx + 1),
            defectCode: q.defectCode || '',
            defectLevel: q.defectLevel || 'general',
            isMajorDefect: Boolean(q.isMajorDefect),
            isCriticalConclusion: Boolean(q.isCriticalConclusion),
            type: qType,
            score: Number(q.score) > 0 ? Number(q.score) : 2,
            title: q.title || '请输入题目内容',
            options: qType === 'short_answer'
              ? []
              : (Array.isArray(q.options) && q.options.length > 0
                ? q.options.map((opt, oIdx) => ({
                    key: opt.key || String.fromCharCode(65 + oIdx),
                    text: opt.text || ''
                  }))
                : [
                    { key: 'A', text: '选项 A' },
                    { key: 'B', text: '选项 B' }
                  ]),
            answer: qType === 'short_answer' ? [] : (Array.isArray(q.answer) ? q.answer.slice() : ['A']),
            referenceStandard: q.referenceStandard || '',
            explanation: q.explanation || ''
          };
        })
      : [];

    const vetoRules = Array.isArray(bank.vetoRules) && bank.vetoRules.length
      ? bank.vetoRules.map((r, idx) => ({
          id: r.id || 'N-' + (idx + 1),
          order: Number(r.order) || (idx + 1),
          code: r.code || r.id || 'N-' + (idx + 1),
          name: r.name || '未命名否定项规则',
          conditionType: r.conditionType || 'QUESTION_WRONG',
          thresholdValue: Number(r.thresholdValue != null ? r.thresholdValue : 1),
          targetRef: r.targetRef || '',
          penaltyAction: r.penaltyAction || 'ZERO_SCORE',
          isEnabled: r.isEnabled !== undefined ? Boolean(r.isEnabled) : true,
          alertMessage: r.alertMessage || ''
        }))
      : (fallback.vetoRules || []);

    const checklistItems = Array.isArray(bank.checklistItems) && bank.checklistItems.length
      ? bank.checklistItems
      : (fallback.checklistItems || []);

    const scenarioDocs = Array.isArray(bank.scenarioDocs) && bank.scenarioDocs.length
      ? bank.scenarioDocs
      : (fallback.scenarioDocs || []);

    const mergedMeta = Object.assign({}, fallback.meta, bank.meta || {});
    if (!mergedMeta.examPicture) {
      mergedMeta.examPicture = fallback.meta.examPicture || global.PLANT_IMAGE_BASE64 || '';
    }

    const widgetTemplates = Array.isArray(bank.widgetTemplates) && bank.widgetTemplates.length
      ? bank.widgetTemplates
      : loadLocalTemplates();

    return {
      meta: mergedMeta,
      hotspots: normalizedHotspots,
      unassignedQuestions: unassignedQuestions,
      vetoRules: vetoRules,
      checklistItems: checklistItems,
      scenarioDocs: scenarioDocs,
      widgetTemplates: widgetTemplates
    };
  }

  function resolveDefaultSqliteUrl() {
    try {
      const loc = global.location;
      if (loc && (loc.protocol === 'http:' || loc.protocol === 'https:') && loc.origin && loc.origin !== 'null') {
        return String(loc.origin).replace(/\/+$/, '');
      }
    } catch (e) {
      // ignore
    }
    return DEFAULT_CONFIG.sqliteApiUrl;
  }

  function loadConfig() {
    const defaultSqlite = resolveDefaultSqliteUrl();
    try {
      const raw = global.localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (!raw) {
        const fresh = deepClone(DEFAULT_CONFIG);
        fresh.sqliteApiUrl = defaultSqlite;
        return fresh;
      }
      const parsed = safeParseJson(raw, {});
      return {
        sourceMode: parsed.sourceMode || DEFAULT_CONFIG.sourceMode,
        sqliteApiUrl: getSqliteBase({ sqliteApiUrl: parsed.sqliteApiUrl || defaultSqlite }),
        fmScripts: Object.assign({}, DEFAULT_CONFIG.fmScripts, parsed.fmScripts || {}),
        dataApi: Object.assign({}, DEFAULT_CONFIG.dataApi, parsed.dataApi || {}),
        restApi: Object.assign({}, DEFAULT_CONFIG.restApi, parsed.restApi || {}),
        student: Object.assign({}, DEFAULT_CONFIG.student, parsed.student || {})
      };
    } catch (e) {
      const fb = deepClone(DEFAULT_CONFIG);
      fb.sqliteApiUrl = defaultSqlite;
      return fb;
    }
  }

  function saveConfig(cfg) {
    try {
      global.localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(cfg));
    } catch (e) {
      // 某些无痕或受限 WebViewer 环境可能禁用 localStorage
    }
  }

  function isFileMakerWebViewer() {
    return typeof global.FileMaker !== 'undefined' &&
      global.FileMaker !== null &&
      (typeof global.FileMaker.PerformScript === 'function' ||
       typeof global.FileMaker.PerformScriptWithOption === 'function');
  }

  function callFMScript(scriptName, payload, option) {
    if (!isFileMakerWebViewer() || !scriptName) {
      return { sent: false, reason: '当前不在 FileMaker WebViewer 环境中' };
    }
    const paramStr = typeof payload === 'string' ? payload : JSON.stringify(payload == null ? {} : payload);
    try {
      if (typeof global.FileMaker.PerformScriptWithOption === 'function') {
        global.FileMaker.PerformScriptWithOption(scriptName, paramStr, option != null ? String(option) : '0');
      } else {
        global.FileMaker.PerformScript(scriptName, paramStr);
      }
      return { sent: true, scriptName: scriptName };
    } catch (err) {
      return { sent: false, reason: err && err.message ? err.message : String(err) };
    }
  }

  function getDataApiBase(cfg) {
    const server = String(cfg.dataApi.serverUrl || '').replace(/\/+$/, '');
    const db = encodeURIComponent(cfg.dataApi.database || '');
    const ver = encodeURIComponent(cfg.dataApi.apiVersion || 'vLatest');
    if (!server || !db) return '';
    return `${server}/fmi/data/${ver}/databases/${db}`;
  }

  async function ensureDataApiToken(cfg) {
    if (cfg.dataApi.token) return cfg.dataApi.token;
    const base = getDataApiBase(cfg);
    if (!base || !cfg.dataApi.username) {
      throw new Error('请填写完整的 FileMaker Server 地址、数据库名与 Token（或账号密码）');
    }
    const basic = btoa(unescape(encodeURIComponent(`${cfg.dataApi.username}:${cfg.dataApi.password || ''}`)));
    const resp = await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basic}`
      },
      body: '{}'
    });
    const json = await resp.json();
    if (!resp.ok || !json.response || !json.response.token) {
      const msg = (json.messages && json.messages[0] && json.messages[0].message) || resp.statusText;
      throw new Error('FileMaker Data API 登录失败：' + msg);
    }
    cfg.dataApi.token = json.response.token;
    saveConfig(cfg);
    return cfg.dataApi.token;
  }

  async function fetchBankFromDataApi(cfg) {
    const base = getDataApiBase(cfg);
    const layout = encodeURIComponent(cfg.dataApi.bankLayout || 'QuestionBank_API');
    if (!base) throw new Error('FileMaker Data API 服务器或数据库未配置');
    const token = await ensureDataApiToken(cfg);
    const resp = await fetch(`${base}/layouts/${layout}/records?_limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const json = await resp.json();
    if (!resp.ok || !json.response || !Array.isArray(json.response.data) || !json.response.data.length) {
      const msg = (json.messages && json.messages[0] && json.messages[0].message) || '未查询到题库记录';
      throw new Error('Data API 获取题库失败：' + msg);
    }
    const fieldName = cfg.dataApi.bankField || 'QuestionBankJSON';
    const rawBank = json.response.data[0].fieldData[fieldName];
    const parsed = safeParseJson(rawBank, null);
    if (!parsed) {
      throw new Error(`字段 "${fieldName}" 中的内容不是有效的 JSON 题库格式`);
    }
    return normalizeQuestionBank(parsed);
  }

  async function postResultToDataApi(cfg, resultPayload) {
    const base = getDataApiBase(cfg);
    const layout = encodeURIComponent(cfg.dataApi.resultLayout || 'ExamResults_API');
    if (!base) throw new Error('FileMaker Data API 服务器或数据库未配置');
    const token = await ensureDataApiToken(cfg);
    const fieldData = {
      ExamineeName: resultPayload.studentName || '现场考生',
      ExamineeID: resultPayload.examineeId || '',
      ExamCode: resultPayload.examCode || '1.1.1',
      ExamMode: resultPayload.mode || 'exam',
      Score: Number(resultPayload.earnedScore) || 0,
      TotalScore: Number(resultPayload.totalScore) || 50,
      PassStatus: resultPayload.passed ? '合格' : '不合格',
      VetoTriggered: resultPayload.vetoTriggered ? '1' : '0',
      VetoReason: resultPayload.vetoReason || '',
      DurationSeconds: Number(resultPayload.durationSeconds) || 0,
      SubmittedAt: resultPayload.submittedAt || new Date().toISOString(),
      ResultDetailJSON: JSON.stringify(resultPayload)
    };

    const resp = await fetch(`${base}/layouts/${layout}/records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fieldData: fieldData })
    });
    const json = await resp.json();
    if (!resp.ok || !json.response || !json.response.recordId) {
      const msg = (json.messages && json.messages[0] && json.messages[0].message) || resp.statusText;
      throw new Error('Data API 写入成绩失败：' + msg);
    }
    return { ok: true, recordId: json.response.recordId };
  }

  async function fetchBankFromRest(cfg) {
    const url = cfg.restApi.getBankUrl;
    if (!url) throw new Error('未配置 REST GET 题库接口地址');
    const headers = { 'Accept': 'application/json' };
    if (cfg.restApi.authHeader) headers['Authorization'] = cfg.restApi.authHeader;
    const resp = await fetch(url, { method: 'GET', headers: headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    return normalizeQuestionBank(data);
  }

  async function postJsonToRest(url, authHeader, payload) {
    if (!url) throw new Error('未配置目标 REST 接口地址');
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;
    const resp = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    try {
      return await resp.json();
    } catch (e) {
      return { ok: true };
    }
  }

  function getSqliteBase(cfg) {
    const fallbackUrl = resolveDefaultSqliteUrl();
    const raw = (cfg && cfg.sqliteApiUrl) || '';
    const trimmed = String(raw).trim().replace(/\/+$/, '');
    if (!trimmed) return fallbackUrl;
    try {
      const loc = global.location;
      const isHttpOrigin = loc && (loc.protocol === 'http:' || loc.protocol === 'https:') && loc.origin && loc.origin !== 'null';
      if (isHttpOrigin && (trimmed === 'http://127.0.0.1:8765' || trimmed === 'http://localhost:8765')) {
        return fallbackUrl;
      }
    } catch (e) {
      // ignore
    }
    return trimmed;
  }

  function getStoredAuthToken() {
    try {
      const s = global.sessionStorage && global.sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (s) return String(s).trim();
    } catch (e) {
      // ignore
    }
    try {
      const l = global.localStorage && global.localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (l) return String(l).trim();
    } catch (e) {
      // ignore
    }
    return '';
  }

  function saveStoredAuthToken(token) {
    const val = String(token || '').trim();
    try {
      if (val) {
        global.localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, val);
        if (global.sessionStorage) global.sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, val);
      } else {
        global.localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        if (global.sessionStorage) global.sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      }
    } catch (e) {
      // ignore
    }
  }

  async function requestSqlite(cfg, path, options) {
    const base = getSqliteBase(cfg);
    const opts = options || {};
    const isWrite = String(opts.method || 'GET').toUpperCase() !== 'GET';
    const timeoutMs = opts.timeoutMs || (isWrite ? 30000 : 8000);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(new Error(`请求超时 (${timeoutMs / 1000}s)`)), timeoutMs) : null;
    const reqHeaders = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getStoredAuthToken();
    if (token && !reqHeaders.Authorization) {
      reqHeaders.Authorization = `Bearer ${token}`;
    }
    try {
      const resp = await fetch(`${base}${path}`, Object.assign({}, opts, {
        headers: reqHeaders,
        signal: controller ? controller.signal : undefined
      }));
      const data = await resp.json();
      if (!resp.ok || data.ok === false) {
        const err = new Error(data.error || `HTTP ${resp.status}`);
        err.status = resp.status;
        if ((resp.ok && data.ok === false) || resp.status === 401 || resp.status === 403) {
          err.isBusinessError = true;
        }
        throw err;
      }
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let detectedDbBackend = 'sqlite';

  function updateDetectedBackend(name) {
    const n = String(name || '').trim().toLowerCase();
    if (n === 'mysql' || n === 'sqlite') {
      detectedDbBackend = n;
    }
  }

  function formatBackendLabel() {
    return detectedDbBackend === 'mysql' ? 'MySQL 8.0 数据库' : 'SQLite 数据库 (db/wmpses.db)';
  }

  const FMDataAdapter = {
    getBackendType: function () {
      return detectedDbBackend;
    },

    getBackendLabel: function () {
      return formatBackendLabel();
    },

    getConfig: function () {
      return loadConfig();
    },

    updateConfig: function (partial) {
      const current = loadConfig();
      const next = {
        sourceMode: partial.sourceMode || current.sourceMode,
        sqliteApiUrl: partial.sqliteApiUrl !== undefined ? (partial.sqliteApiUrl || DEFAULT_CONFIG.sqliteApiUrl) : current.sqliteApiUrl,
        fmScripts: Object.assign({}, current.fmScripts, partial.fmScripts || {}),
        dataApi: Object.assign({}, current.dataApi, partial.dataApi || {}),
        restApi: Object.assign({}, current.restApi, partial.restApi || {}),
        student: Object.assign({}, current.student, partial.student || {})
      };
      saveConfig(next);
      return next;
    },

    isWebViewer: isFileMakerWebViewer,
    callFMScript: callFMScript,
    normalizeQuestionBank: normalizeQuestionBank,

    loadLocalBank: function () {
      try {
        const raw = global.localStorage.getItem(STORAGE_KEYS.BANK);
        if (raw) {
          const parsed = safeParseJson(raw, null);
          if (parsed) return normalizeQuestionBank(parsed);
        }
      } catch (e) {
        // ignore
      }
      return deepClone(global.DEFAULT_QUESTION_BANK);
    },

    saveLocalBank: function (bank) {
      const normalized = normalizeQuestionBank(bank);
      normalized.meta.updatedAt = new Date().toISOString().slice(0, 10);
      try {
        global.localStorage.setItem(STORAGE_KEYS.BANK, JSON.stringify(normalized));
      } catch (e) {
        // ignore
      }
      return normalized;
    },

    resetDefaultBank: function () {
      try {
        global.localStorage.removeItem(STORAGE_KEYS.BANK);
        global.localStorage.removeItem(STORAGE_KEYS.LOCAL_USERS);
        global.localStorage.removeItem(STORAGE_KEYS.TEMPLATES);
      } catch (e) {
        // ignore
      }
      return deepClone(global.DEFAULT_QUESTION_BANK);
    },

    resetBankWithBackend: async function () {
      const cfg = loadConfig();
      if (cfg.sourceMode === 'auto' || cfg.sourceMode === 'sqlite') {
        try {
          const res = await requestSqlite(cfg, '/api/bank/reset', { method: 'POST', body: '{}' });
          try {
            global.localStorage.removeItem(STORAGE_KEYS.LOCAL_USERS);
            global.localStorage.removeItem(STORAGE_KEYS.TEMPLATES);
          } catch (e) {}
          const bank = this.saveLocalBank(res.bank);
          return {
            bank: bank,
            message: '已将 SQLite 数据库恢复为出厂示范数据（8热点 / 15题 / 默认密码123456）'
          };
        } catch (err) {
          // 降级本地重置
        }
      }
      return {
        bank: this.resetDefaultBank(),
        message: '已恢复出厂默认题库（本地缓存）'
      };
    },

    fetchServerHealth: async function () {
      const cfg = loadConfig();
      const base = getSqliteBase(cfg);
      try {
        const res = await requestSqlite(cfg, '/api/health', { method: 'GET' });
        return Object.assign({ sqliteBase: base }, res);
      } catch (err) {
        return { ok: false, sqliteBase: base, error: err.message };
      }
    },

    fetchSqliteTables: async function () {
      const cfg = loadConfig();
      return await requestSqlite(cfg, '/api/tables', { method: 'GET' });
    },

    fetchWidgetTemplates: async function () {
      const cfg = loadConfig();
      if (cfg.sourceMode !== 'local') {
        try {
          const res = await requestSqlite(cfg, '/api/templates', { method: 'GET' });
          if (Array.isArray(res.templates)) {
            saveLocalTemplates(res.templates);
            return { ok: true, templates: res.templates };
          }
        } catch (err) {
          // 离线兜底
        }
      }
      return { ok: false, templates: loadLocalTemplates(), offlineFallback: true };
    },

    saveWidgetTemplate: async function (tplObj) {
      const cfg = loadConfig();
      if (cfg.sourceMode !== 'local') {
        try {
          const res = await requestSqlite(cfg, '/api/templates', {
            method: 'POST',
            body: JSON.stringify(tplObj)
          });
          if (Array.isArray(res.templates)) {
            saveLocalTemplates(res.templates);
          }
          return res;
        } catch (err) {
          if (err && err.isBusinessError) {
            return { ok: false, error: err.message };
          }
        }
      }
      const list = loadLocalTemplates();
      const rawCode = String(tplObj.code || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || ('tpl_' + Date.now());
      const name = String(tplObj.name || '').trim();
      if (!name) return { ok: false, error: '模板显示名称不能为空' };
      const idx = list.findIndex((x) => (tplObj.id && x.id === tplObj.id) || x.code === rawCode);
      const nextItem = Object.assign({
        id: idx >= 0 ? list[idx].id : ('TPL-' + Date.now().toString().slice(-6)),
        isBuiltin: idx >= 0 ? Boolean(list[idx].isBuiltin) : false,
        sortOrder: idx >= 0 ? list[idx].sortOrder : (list.length + 10)
      }, tplObj, { code: rawCode, name: name });
      if (idx >= 0) list[idx] = nextItem;
      else list.push(nextItem);
      saveLocalTemplates(list);
      return { ok: true, template: nextItem, templates: list, offlineFallback: true };
    },

    deleteWidgetTemplate: async function (idOrCode) {
      const cfg = loadConfig();
      if (cfg.sourceMode !== 'local') {
        try {
          const res = await requestSqlite(cfg, '/api/templates/delete', {
            method: 'POST',
            body: JSON.stringify({ id: idOrCode, code: idOrCode })
          });
          if (Array.isArray(res.templates)) {
            saveLocalTemplates(res.templates);
          }
          return res;
        } catch (err) {
          if (err && err.isBusinessError) {
            return { ok: false, error: err.message };
          }
        }
      }
      const list = loadLocalTemplates();
      const target = list.find((x) => x.id === idOrCode || x.code === idOrCode);
      if (!target) return { ok: false, error: '未找到对应模板' };
      if (target.isBuiltin) return { ok: false, error: '系统内置模板不可删除' };
      const next = list.filter((x) => x.id !== target.id);
      saveLocalTemplates(next);
      return { ok: true, templates: next, offlineFallback: true };
    },

    sha256Hex: sha256Hex,

    getCurrentUser: function () {
      try {
        const raw = global.localStorage.getItem(STORAGE_KEYS.AUTH_USER);
        const parsed = safeParseJson(raw, null);
        return parsed && parsed.pk_UserID ? parsed : null;
      } catch (e) {
        return null;
      }
    },

    getStoredSession: function () {
      try {
        const sessionRaw = global.sessionStorage && global.sessionStorage.getItem(STORAGE_KEYS.AUTH_USER);
        const parsedSession = safeParseJson(sessionRaw, null);
        if (parsedSession && parsedSession.pk_UserID) return parsedSession;
      } catch (e) {
        // ignore
      }
      return this.getCurrentUser();
    },

    setCurrentUser: function (userObj) {
      if (!userObj || !userObj.pk_UserID) return null;
      const sanitized = Object.assign({}, userObj, {
        loginAt: userObj.loginAt || new Date().toISOString()
      });
      try {
        const serialized = JSON.stringify(sanitized);
        global.localStorage.setItem(STORAGE_KEYS.AUTH_USER, serialized);
        if (global.sessionStorage) {
          global.sessionStorage.setItem(STORAGE_KEYS.AUTH_USER, serialized);
        }
      } catch (e) {
        // ignore
      }
      if (sanitized.RoleType === '考生') {
        this.updateConfig({
          student: {
            userId: sanitized.pk_UserID,
            name: sanitized.FullName,
            examineeId: sanitized.UserCode,
            department: sanitized.Department || '',
            skillLevel: sanitized.SkillLevel || ''
          }
        });
      } else {
        this.updateConfig({
          student: {
            teacherId: sanitized.pk_UserID,
            teacherName: `${sanitized.FullName} (${sanitized.RoleType || '管理员'})`
          }
        });
      }
      return sanitized;
    },

    logoutUser: function () {
      const oldToken = getStoredAuthToken();
      if (oldToken) {
        try {
          const cfg = loadConfig();
          const base = getSqliteBase(cfg);
          fetch(`${base}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${oldToken}`
            },
            body: '{}'
          }).catch(() => {});
        } catch (e) {
          // ignore
        }
      }
      saveStoredAuthToken('');
      try {
        global.localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
        if (global.sessionStorage) {
          global.sessionStorage.removeItem(STORAGE_KEYS.AUTH_USER);
        }
      } catch (e) {
        // ignore
      }
      this.updateConfig({
        student: {
          userId: '',
          name: '',
          examineeId: '',
          department: '',
          skillLevel: '',
          teacherId: '',
          teacherName: ''
        }
      });
    },

    fetchUsersAndLogs: async function (role) {
      const cfg = loadConfig();
      const query = role ? `?role=${encodeURIComponent(role)}` : '';
      try {
        const res = await requestSqlite(cfg, `/api/users${query}`, { method: 'GET' });
        if (!role && Array.isArray(res.users)) {
          saveLocalUsers(res.users);
        }
        return res;
      } catch (err) {
        const fb = global.DEFAULT_QUESTION_BANK || {};
        const users = loadLocalUsers().filter((u) => !role || u.RoleType === role);
        const logs = (fb.changeLogs || []).map((l) => ({
          pk_LogID: l.id,
          fk_ExamID: l.examId,
          fk_UserID: l.userId,
          OperatorName: l.operatorName,
          ActionType: l.actionType,
          VersionAfter: l.versionAfter,
          HotspotCount: l.hotspotCount,
          QuestionCount: l.questionCount,
          TotalScore: l.totalScore,
          ChangeSummary: l.changeSummary,
          ChangedAt: l.changedAt
        }));
        return { ok: false, users: users, changeLogs: logs, offlineFallback: true, error: err.message };
      }
    },

    saveUser: async function (userObj) {
      const cfg = loadConfig();
      const res = await requestSqlite(cfg, '/api/users', {
        method: 'POST',
        body: JSON.stringify(userObj)
      });
      if (res && res.user) {
        const list = loadLocalUsers();
        const idx = list.findIndex((x) => x.pk_UserID === res.user.pk_UserID);
        if (idx >= 0) list[idx] = res.user;
        else list.push(res.user);
        saveLocalUsers(list);
      }
      return res;
    },

    deleteUser: async function (userId) {
      const cfg = loadConfig();
      const res = await requestSqlite(cfg, '/api/users/delete', {
        method: 'POST',
        body: JSON.stringify({ id: userId })
      });
      saveLocalUsers(loadLocalUsers().filter((x) => x.pk_UserID !== userId));
      return res;
    },

    loginUser: async function (username, password) {
      const cfg = loadConfig();
      const ident = String(username || '').trim();
      const pwd = String(password == null ? '' : password);
      if (!ident) return { ok: false, error: '请输入考号/工号或姓名' };
      if (!pwd) return { ok: false, error: '请输入登录密码' };

      if (cfg.sourceMode !== 'local') {
        try {
          const res = await requestSqlite(cfg, '/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: ident, password: pwd })
          });
          if (res && res.user) {
            saveStoredAuthToken(res.token || '');
            const cur = this.setCurrentUser(res.user);
            return { ok: true, user: cur, source: 'sqlite' };
          }
        } catch (err) {
          if (err && err.isBusinessError) {
            return { ok: false, error: err.message };
          }
        }
      }

      const users = loadLocalUsers();
      const identLower = ident.toLowerCase();
      const target = users.find((u) =>
        String(u.UserCode || '').toLowerCase() === identLower ||
        String(u.FullName || '') === ident ||
        String(u.pk_UserID || '') === ident
      );
      if (!target) {
        return { ok: false, error: `未找到账号「${ident}」` };
      }
      if ((target.Status || '正常') !== '正常') {
        return { ok: false, error: `账号状态异常（${target.Status}），无法登录` };
      }
      const inputHash = sha256Hex(pwd);
      const expectedHash = target.Password || sha256Hex('123456');
      if (inputHash !== expectedHash) {
        return { ok: false, error: '密码错误，请核对后重试（初始默认密码为 123456）' };
      }
      const cur = this.setCurrentUser(target);
      return { ok: true, user: cur, source: 'local' };
    },

    changeUserPassword: async function (userId, oldPassword, newPassword) {
      const cfg = loadConfig();
      const uid = String(userId || '').trim();
      const oldPwd = String(oldPassword == null ? '' : oldPassword);
      const newPwd = String(newPassword == null ? '' : newPassword);
      if (!uid) return { ok: false, error: '请先登录账号' };
      if (newPwd.trim().length < 4) return { ok: false, error: '新密码长度不能少于 4 位' };

      if (cfg.sourceMode !== 'local') {
        try {
          const res = await requestSqlite(cfg, '/api/auth/password', {
            method: 'POST',
            body: JSON.stringify({ userId: uid, oldPassword: oldPwd, newPassword: newPwd })
          });
          if (res && res.user) {
            const list = loadLocalUsers();
            const idx = list.findIndex((x) => x.pk_UserID === res.user.pk_UserID);
            if (idx >= 0) list[idx] = res.user;
            else list.push(res.user);
            saveLocalUsers(list);
            const cur = this.getCurrentUser();
            if (cur && cur.pk_UserID === res.user.pk_UserID) {
              this.setCurrentUser(res.user);
            }
          }
          return res;
        } catch (err) {
          if (err && err.isBusinessError) {
            return { ok: false, error: err.message };
          }
        }
      }

      const list = loadLocalUsers();
      const idx = list.findIndex((u) => u.pk_UserID === uid || String(u.UserCode || '').toLowerCase() === uid.toLowerCase());
      if (idx === -1) return { ok: false, error: '未找到对应人员账号' };
      const target = list[idx];
      if (!oldPwd || sha256Hex(oldPwd) !== (target.Password || sha256Hex('123456'))) {
        return { ok: false, error: '原密码不正确' };
      }
      const updated = Object.assign({}, target, { Password: sha256Hex(newPwd) });
      list[idx] = updated;
      saveLocalUsers(list);
      const cur = this.getCurrentUser();
      if (cur && cur.pk_UserID === updated.pk_UserID) {
        this.setCurrentUser(updated);
      }
      return { ok: true, message: '密码修改成功（已采用 SHA-256 加密并保存至本地缓存）', user: updated };
    },

    loadQuestionBank: async function (examId) {
      const cfg = loadConfig();
      const mode = cfg.sourceMode;
      const targetExamId = examId || this.getActiveExamId() || 'WMPSES-1.1.1-V1';

      if (mode === 'dataapi' || (mode === 'auto' && getDataApiBase(cfg))) {
        try {
          const bank = await fetchBankFromDataApi(cfg);
          this.saveLocalBank(bank);
          return { bank: bank, source: 'FileMaker Data API' };
        } catch (err) {
          return { bank: this.loadLocalBank(), source: '本地缓存兜底（Data API 拉取失败：' + err.message + '）', error: err.message };
        }
      }

      if (mode === 'rest' || (mode === 'auto' && cfg.restApi.getBankUrl)) {
        try {
          const bank = await fetchBankFromRest(cfg);
          this.saveLocalBank(bank);
          return { bank: bank, source: '自定义 REST API' };
        } catch (err) {
          return { bank: this.loadLocalBank(), source: '本地缓存兜底（REST 拉取失败：' + err.message + '）', error: err.message };
        }
      }

      if (isFileMakerWebViewer() && (mode === 'auto' || mode === 'webviewer')) {
        // 主动请求 FileMaker 宿主推入最新题库（宿主若未配置对应脚本也不影响本地先呈现）
        callFMScript(cfg.fmScripts.loadBank, { action: 'requestQuestionBank', examCode: '1.1.1' });
        return { bank: this.loadLocalBank(), source: 'FileMaker WebViewer（已就绪）' };
      }

      if (mode === 'sqlite' || mode === 'auto') {
        try {
          const res = await requestSqlite(cfg, `/api/bank?examId=${encodeURIComponent(targetExamId)}`, { method: 'GET' });
          if (res && res.backend) {
            updateDetectedBackend(res.backend);
          } else if (res && res.bank && res.bank.meta && String(res.bank.meta.examPicture || '').startsWith('/api/exam-media')) {
            updateDetectedBackend('mysql');
          } else {
            try {
              const h = await requestSqlite(cfg, '/api/health', { method: 'GET', timeoutMs: 3000 });
              if (h && h.backend) updateDetectedBackend(h.backend);
            } catch (e) {
              // ignore
            }
          }
          const bank = this.saveLocalBank(res.bank);
          if (bank && bank.meta && bank.meta.id) {
            this.setActiveExamId(bank.meta.id);
          }
          return { bank: bank, source: formatBackendLabel(), sqliteConnected: true };
        } catch (err) {
          if (mode === 'sqlite') {
            return {
              bank: this.loadLocalBank(),
              source: 'SQLite 服务未连接，已使用本地兜底（' + err.message + '）',
              error: err.message
            };
          }
        }
      }

      return { bank: this.loadLocalBank(), source: '本地离线模式（未检测到 SQLite 服务）' };
    },

    saveQuestionBank: async function (bank, changeMeta) {
      let saved = this.saveLocalBank(bank);
      const cfg = loadConfig();
      const syncStatus = [];
      let sqliteSaved = false;
      let changeLogs = null;
      const resolvedMeta = Object.assign({
        userId: (cfg.student && cfg.student.teacherId) || 'USR-TC-001',
        operatorName: (cfg.student && cfg.student.teacherName) || '教师/管理员',
        actionType: '编辑更新题库'
      }, changeMeta || {});

      if (cfg.sourceMode === 'auto' || cfg.sourceMode === 'sqlite') {
        try {
          const res = await requestSqlite(cfg, '/api/bank', {
            method: 'POST',
            body: JSON.stringify({ bank: saved, changeMeta: resolvedMeta })
          });
          saved = this.saveLocalBank(res.bank);
          sqliteSaved = true;
          changeLogs = res.changeLogs || null;
          const cnt = res.counts || {};
          syncStatus.push(`已实时存入 SQLite（热点 ${cnt['WMPSES_设备热点'] || saved.hotspots.length} 条 / 习题 ${cnt['WMPSES_习题库'] || 0} 条）并写入变更日志`);
        } catch (err) {
          if (cfg.sourceMode === 'sqlite') {
            syncStatus.push('SQLite 保存失败：' + err.message);
          }
        }
      }

      if (isFileMakerWebViewer()) {
        const res = callFMScript(cfg.fmScripts.saveBank, {
          action: 'saveQuestionBank',
          updatedAt: new Date().toISOString(),
          questionBank: saved
        });
        syncStatus.push(res.sent ? `已调用 FileMaker 脚本「${cfg.fmScripts.saveBank}」` : res.reason);
      }

      if (cfg.sourceMode === 'rest' && cfg.restApi.saveBankUrl) {
        try {
          await postJsonToRest(cfg.restApi.saveBankUrl, cfg.restApi.authHeader, saved);
          syncStatus.push('已同步推送至 REST 题库接口');
        } catch (err) {
          syncStatus.push('REST 同步失败：' + err.message);
        }
      }

      return {
        bank: saved,
        sqliteSaved: sqliteSaved,
        changeLogs: changeLogs,
        syncMessage: syncStatus.length ? syncStatus.join('；') : '已保存到浏览器本地缓存（启动 server.py 后可写入 SQLite 数据库）'
      };
    },

    submitExamResult: async function (resultPayload) {
      const cfg = loadConfig();
      const syncResults = [];

      // 1. 保存本地最近考评记录
      try {
        const raw = global.localStorage.getItem(STORAGE_KEYS.HISTORY);
        const list = safeParseJson(raw, []);
        list.unshift(resultPayload);
        global.localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list.slice(0, 20)));
      } catch (e) {
        // ignore
      }

      // 2. 写入后端关系表（支持 ClientSubmissionID 幂等键 + 3 次指数退避自动重试，防 80 人并发交卷失败）
      if (cfg.sourceMode === 'auto' || cfg.sourceMode === 'sqlite') {
        const subId = resultPayload.clientSubmissionId
          || `sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const payloadWithId = Object.assign({}, resultPayload, { clientSubmissionId: subId });
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await requestSqlite(cfg, '/api/results', {
              method: 'POST',
              body: JSON.stringify(payloadWithId)
            });
            syncResults.push(`成绩及明细已写入数据库 (记录ID: ${String(res.resultId || '').slice(0, 8)}…)`);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            if (err && (err.status === 401 || err.status === 403 || err.status === 400)) break;
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 800 + Math.floor(Math.random() * 400)));
            }
          }
        }
        if (lastErr && cfg.sourceMode === 'sqlite') {
          syncResults.push(`数据库写入失败：${lastErr.message}`);
        }
      }

      // 2. WebViewer 脚本回传
      if (isFileMakerWebViewer()) {
        const res = callFMScript(cfg.fmScripts.submitResult, resultPayload);
        syncResults.push(res.sent
          ? `已回传 FileMaker 脚本「${cfg.fmScripts.submitResult}」`
          : `FileMaker 回传失败：${res.reason}`);
      }

      // 3. FileMaker Data API 写入
      if (cfg.sourceMode === 'dataapi' || (cfg.sourceMode === 'auto' && getDataApiBase(cfg))) {
        try {
          const res = await postResultToDataApi(cfg, resultPayload);
          syncResults.push(`已写入 FileMaker Data API（RecordID: ${res.recordId}）`);
        } catch (err) {
          syncResults.push(`Data API 提交失败：${err.message}`);
        }
      }

      // 4. 通用 REST API 写入
      if (cfg.sourceMode === 'rest' && cfg.restApi.postResultUrl) {
        try {
          await postJsonToRest(cfg.restApi.postResultUrl, cfg.restApi.authHeader, resultPayload);
          syncResults.push('已推送至自定义 REST 成绩接口');
        } catch (err) {
          syncResults.push(`REST 提交失败：${err.message}`);
        }
      }

      return {
        ok: true,
        syncMessage: syncResults.length ? syncResults.join('；') : '成绩已记录到本地档案'
      };
    },

    getExamHistory: function () {
      try {
        const raw = global.localStorage.getItem(STORAGE_KEYS.HISTORY);
        return safeParseJson(raw, []);
      } catch (e) {
        return [];
      }
    },

    fetchExamResults: async function (opts) {
      const cfg = loadConfig();
      const params = new URLSearchParams();
      if (opts && opts.userId) params.set('userId', opts.userId);
      if (opts && opts.examId) params.set('examId', opts.examId);
      if (opts && opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';

      if (cfg.sourceMode !== 'local') {
        try {
          const res = await requestSqlite(cfg, `/api/results${qs}`);
          if (res && Array.isArray(res.results)) {
            return { ok: true, source: 'sqlite', results: res.results };
          }
        } catch (err) {
          if (cfg.sourceMode === 'sqlite') {
            return { ok: false, source: 'sqlite', error: err.message, results: [] };
          }
        }
      }

      const localList = this.getExamHistory().map((h, idx) => ({
        pk_ResultID: h.resultId || `local-${idx}`,
        fk_ExamID: h.examId || 'WMPSES-1.1.1-V1',
        fk_UserID: h.userId || '',
        ExamineeName: h.studentName || '现场考生',
        ExamineeID: h.examineeId || '',
        ExamMode: h.mode || 'exam',
        Score: h.effectiveScore != null ? h.effectiveScore : (h.earnedScore || 0),
        TotalScore: h.totalScore || 50,
        Accuracy: h.accuracy || 0,
        PassStatus: h.passed ? '合格' : '不合格',
        VetoTriggered: h.vetoTriggered ? 1 : 0,
        VetoReason: h.vetoReason || '',
        DurationSeconds: h.durationSeconds || 0,
        SubmittedAt: h.submittedAt || '',
        Department: '',
        RoleType: '考生',
        ExamTitle: h.examCode || h.examId || '1.1.1'
      }));
      return { ok: true, source: 'local', results: localList };
    },

    fetchExamResultDetail: async function (resultId) {
      const cfg = loadConfig();
      const rid = String(resultId || '').trim();
      if (!rid) return { ok: false, error: '缺少答卷 ID' };
      return await requestSqlite(cfg, `/api/results/detail?resultId=${encodeURIComponent(rid)}`, { method: 'GET' });
    },

    gradeExamResult: async function (resultId, grades) {
      const cfg = loadConfig();
      return await requestSqlite(cfg, '/api/results/grade', {
        method: 'POST',
        body: JSON.stringify({ resultId: resultId, grades: grades })
      });
    },

    saveExamDraft: async function (examId, answers, remainingSeconds) {
      const cfg = loadConfig();
      const curUser = this.getCurrentUser();
      const uid = (curUser && curUser.pk_UserID) || '';
      if (!uid) return { ok: false };
      const key = `wmpses_draft_${uid}_${examId}`;
      const draftObj = { examId: examId, answers: answers || {}, remainingSeconds: Number(remainingSeconds) || 0, updatedAt: new Date().toISOString() };
      try {
        global.localStorage.setItem(key, JSON.stringify(draftObj));
      } catch (e) {
        // ignore
      }
      if (cfg.sourceMode !== 'local') {
        try {
          return await requestSqlite(cfg, '/api/exam/draft', {
            method: 'POST',
            body: JSON.stringify(draftObj)
          });
        } catch (e) {
          // 离线或旧版 server.py 不支持草稿接口时静默降级为本地草稿
        }
      }
      return { ok: true, localOnly: true };
    },

    fetchExamDraft: async function (examId) {
      const cfg = loadConfig();
      const curUser = this.getCurrentUser();
      const uid = (curUser && curUser.pk_UserID) || '';
      if (!uid) return null;
      if (cfg.sourceMode !== 'local') {
        try {
          const res = await requestSqlite(cfg, `/api/exam/draft?examId=${encodeURIComponent(examId)}`, { method: 'GET' });
          if (res && res.draft && res.draft.answers && Object.keys(res.draft.answers).length) {
            return res.draft;
          }
        } catch (e) {
          // fallback local
        }
      }
      try {
        const raw = global.localStorage.getItem(`wmpses_draft_${uid}_${examId}`);
        const parsed = safeParseJson(raw, null);
        if (parsed && parsed.answers && Object.keys(parsed.answers).length) return parsed;
      } catch (e) {
        // ignore
      }
      return null;
    },

    clearExamDraft: async function (examId) {
      const cfg = loadConfig();
      const curUser = this.getCurrentUser();
      const uid = (curUser && curUser.pk_UserID) || '';
      if (uid) {
        try {
          global.localStorage.removeItem(`wmpses_draft_${uid}_${examId}`);
        } catch (e) {
          // ignore
        }
      }
      if (cfg.sourceMode !== 'local') {
        try {
          await requestSqlite(cfg, '/api/exam/draft/clear', {
            method: 'POST',
            body: JSON.stringify({ examId: examId })
          });
        } catch (e) {
          // ignore
        }
      }
    },

    // ==========================================
    // 真 3D 场景模型 (.glb) 持久化：SQLite BLOB + IndexedDB 离线兜底 + FileMaker 容器桥接
    // ==========================================
    _openGlbIdb: function () {
      return new Promise((resolve, reject) => {
        if (!global.indexedDB) {
          resolve(null);
          return;
        }
        try {
          const req = global.indexedDB.open('WMPSES_Scene3D_DB', 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('models')) {
              db.createObjectStore('models', { keyPath: 'examId' });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    },

    saveLocalGlb: async function (examId, name, arrayBuffer) {
      const db = await this._openGlbIdb();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction('models', 'readwrite');
          tx.objectStore('models').put({
            examId: examId || 'WMPSES-1.1.1-V1',
            name: name || 'scene.glb',
            buffer: arrayBuffer,
            updatedAt: new Date().toISOString()
          });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    },

    loadLocalGlb: async function (examId) {
      const db = await this._openGlbIdb();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction('models', 'readonly');
          const req = tx.objectStore('models').get(examId || 'WMPSES-1.1.1-V1');
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    },

    clearLocalGlb: async function (examId) {
      const db = await this._openGlbIdb();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction('models', 'readwrite');
          tx.objectStore('models').delete(examId || 'WMPSES-1.1.1-V1');
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    },

    uploadScene3dModel: async function (fileName, arrayBuffer, examId) {
      const eid = examId || 'WMPSES-1.1.1-V1';
      await this.saveLocalGlb(eid, fileName, arrayBuffer);
      const cfg = loadConfig();
      const status = [];
      let sqliteSaved = false;
      let changeLogs = null;

      if (cfg.sourceMode === 'auto' || cfg.sourceMode === 'sqlite') {
        try {
          const base = getSqliteBase(cfg);
          const url = `${base}/api/scene-model?examId=${encodeURIComponent(eid)}&name=${encodeURIComponent(fileName || 'scene.glb')}`;
          const curUser = this.getCurrentUser();
          const uploadHeaders = {
            'Content-Type': 'application/octet-stream',
            'X-Model-Name': encodeURIComponent(fileName || 'scene.glb'),
            'X-User-Id': encodeURIComponent((curUser && curUser.pk_UserID) || 'USR-TC-001'),
            'X-Operator-Name': encodeURIComponent((curUser && (curUser.FullName || curUser.UserName)) || '教师/管理员')
          };
          const authToken = getStoredAuthToken();
          if (authToken) uploadHeaders.Authorization = `Bearer ${authToken}`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: uploadHeaders,
            body: arrayBuffer
          });
          const data = await resp.json();
          if (resp.ok && data && data.ok) {
            sqliteSaved = true;
            changeLogs = data.changeLogs || null;
            status.push(`已存入 SQLite BLOB (${(arrayBuffer.byteLength / 1024).toFixed(0)} KB)`);
          } else {
            status.push('SQLite 保存失败: ' + ((data && data.error) || resp.status));
          }
        } catch (err) {
          status.push('已缓存至本地离线 IndexedDB（未连接 SQLite 服务）');
        }
      }

      if (isFileMakerWebViewer()) {
        try {
          const bytes = new Uint8Array(arrayBuffer);
          let bin = '';
          const step = 0x8000;
          for (let i = 0; i < bytes.length; i += step) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
          }
          callFMScript('保存3D模型到FileMaker', {
            examId: eid,
            fileName: fileName || 'scene.glb',
            base64: btoa(bin)
          });
          status.push('已推送至 FileMaker 容器字段');
        } catch (e) {
          // ignore
        }
      }

      return {
        ok: true,
        sqliteSaved: sqliteSaved,
        changeLogs: changeLogs,
        message: status.length ? status.join('；') : '已存入本地离线缓存'
      };
    },

    loadScene3dModel: async function (examId, meta) {
      const eid = examId || 'WMPSES-1.1.1-V1';
      const cfg = loadConfig();
      if ((cfg.sourceMode === 'auto' || cfg.sourceMode === 'sqlite') && (!meta || meta.hasScene3dModel !== false)) {
        try {
          const base = getSqliteBase(cfg);
          const resp = await fetch(`${base}/api/scene-model?examId=${encodeURIComponent(eid)}`);
          if (resp.ok) {
            const ab = await resp.arrayBuffer();
            const rawName = resp.headers.get('X-Model-Name') || (meta && meta.scene3dModelName) || 'scene.glb';
            const name = decodeURIComponent(rawName);
            await this.saveLocalGlb(eid, name, ab);
            return { name: name, buffer: ab, source: 'sqlite' };
          }
          if (resp.status === 404) {
            // 数据库确认无模型，同步清理旧离线缓存
            await this.clearLocalGlb(eid);
            return null;
          }
        } catch (e) {
          // 离线模式回退 IndexedDB
        }
      }
      const local = await this.loadLocalGlb(eid);
      if (local && local.buffer) {
        return { name: local.name || 'scene.glb', buffer: local.buffer, source: 'indexeddb' };
      }
      return null;
    },

    clearScene3dModel: async function (examId) {
      const eid = examId || 'WMPSES-1.1.1-V1';
      await this.clearLocalGlb(eid);
      const cfg = loadConfig();
      let changeLogs = null;
      if (cfg.sourceMode === 'auto' || cfg.sourceMode === 'sqlite') {
        try {
          const curUser = this.getCurrentUser();
          const res = await requestSqlite(cfg, '/api/scene-model/clear', {
            method: 'POST',
            body: JSON.stringify({
              examId: eid,
              changeMeta: {
                userId: (curUser && curUser.pk_UserID) || 'USR-TC-001',
                operatorName: (curUser && (curUser.FullName || curUser.UserName)) || '教师/管理员'
              }
            })
          });
          changeLogs = res.changeLogs || null;
        } catch (e) {
          // ignore offline
        }
      }
      return { ok: true, changeLogs: changeLogs };
    },

    // ==========================================
    // 试卷场景浏览与自定义管理 (WMPSES_试卷场景)
    // ==========================================
    getActiveExamId: function () {
      try {
        return global.localStorage.getItem('wmpses_active_exam_id_v1') || 'WMPSES-1.1.1-V1';
      } catch (e) {
        return 'WMPSES-1.1.1-V1';
      }
    },

    setActiveExamId: function (examId) {
      try {
        if (examId) global.localStorage.setItem('wmpses_active_exam_id_v1', String(examId));
      } catch (e) {
        // ignore
      }
    },

    fetchExamScenes: async function () {
      const cfg = loadConfig();
      if (cfg.sourceMode === 'auto' || cfg.sourceMode === 'sqlite') {
        try {
          const res = await requestSqlite(cfg, '/api/scenes', { method: 'GET' });
          if (res && Array.isArray(res.scenes)) {
            return { scenes: res.scenes, source: 'sqlite' };
          }
        } catch (e) {
          // 离线兜底
        }
      }
      const bank = this.loadLocalBank();
      const m = (bank && bank.meta) || {};
      return {
        scenes: [
          {
            id: m.id || 'WMPSES-1.1.1-V1',
            title: m.title || '工业废气治理工实操模拟仿真考试系统',
            subtitle: m.subtitle || '',
            examCode: m.examCode || '6-28-02-05 / 1.1.1',
            variantCode: 'V1',
            totalScore: m.totalScore || 50,
            passScore: m.passScore || 30,
            durationMinutes: m.durationMinutes || 30,
            status: '已启用',
            version: m.version || '1.0.0',
            updatedAt: m.updatedAt || '',
            hotspotCount: (bank && bank.hotspots ? bank.hotspots.length : 0),
            questionCount: (bank && bank.hotspots ? bank.hotspots.reduce((s, h) => s + (h.questions ? h.questions.length : 0), 0) : 0),
            actualTotalScore: m.totalScore || 50,
            hasExamPicture: Boolean(m.examPicture),
            examPicture: m.examPicture || '',
            hasExamPicture3d: Boolean(m.examPicture3d),
            examPicture3d: m.examPicture3d || '',
            hasScene3dModel: Boolean(m.hasScene3dModel),
            scene3dModelName: m.scene3dModelName || '',
            scene3dModelSize: m.scene3dModelSize || 0,
            isBuiltin: true
          }
        ],
        source: 'local'
      };
    },

    saveExamScene: async function (sceneData, changeMeta) {
      const cfg = loadConfig();
      const curUser = this.getCurrentUser();
      const resolvedMeta = Object.assign({
        userId: (curUser && curUser.pk_UserID) || 'USR-TC-001',
        operatorName: (curUser && (curUser.FullName || curUser.UserName)) || '教师/管理员'
      }, changeMeta || {});
      if (cfg.sourceMode === 'auto' || cfg.sourceMode === 'sqlite') {
        const res = await requestSqlite(cfg, '/api/scenes', {
          method: 'POST',
          body: JSON.stringify({ scene: sceneData, changeMeta: resolvedMeta })
        });
        return { ok: true, scene: res.scene, scenes: res.scenes || [], changeLogs: res.changeLogs || null };
      }
      throw new Error('自定义多试卷场景需要连接 SQLite 后台服务');
    },

    deleteExamScene: async function (examId) {
      const cfg = loadConfig();
      const res = await requestSqlite(cfg, '/api/scenes/delete', {
        method: 'POST',
        body: JSON.stringify({ examId: examId })
      });
      return { ok: true, scenes: res.scenes || [] };
    }
  };

  global.FMDataAdapter = FMDataAdapter;

  // 预留给 FileMaker 脚本步骤「在 Web 查看器中执行 JavaScript」直接调用的全局桥接对象
  global.FMExam = {
    loadQuestionBank: function (jsonOrObj) {
      const parsed = safeParseJson(jsonOrObj, null);
      if (!parsed) return JSON.stringify({ ok: false, error: '无效的题库 JSON 格式' });
      const normalized = FMDataAdapter.saveLocalBank(parsed);
      if (typeof global.__wmpsesOnExternalBankLoaded === 'function') {
        global.__wmpsesOnExternalBankLoaded(normalized);
      }
      return JSON.stringify({ ok: true, hotspotCount: normalized.hotspots.length });
    },
    setStudentInfo: function (jsonOrObj) {
      const info = safeParseJson(jsonOrObj, {});
      const next = FMDataAdapter.updateConfig({
        student: {
          name: info.name || info.studentName || '现场考生',
          examineeId: info.examineeId || info.id || ''
        }
      });
      if (typeof global.__wmpsesOnStudentUpdated === 'function') {
        global.__wmpsesOnStudentUpdated(next.student);
      }
      return JSON.stringify({ ok: true, student: next.student });
    },
    getQuestionBankJSON: function () {
      if (typeof global.__wmpsesGetBank === 'function') {
        return JSON.stringify(global.__wmpsesGetBank());
      }
      return JSON.stringify(FMDataAdapter.loadLocalBank());
    },
    getExamResultJSON: function () {
      if (typeof global.__wmpsesGetResult === 'function') {
        return JSON.stringify(global.__wmpsesGetResult());
      }
      return JSON.stringify({ ok: false, error: '考试控制器尚未就绪' });
    },
    setMode: function (mode) {
      if (typeof global.__wmpsesSetMode === 'function') {
        global.__wmpsesSetMode(mode);
        return JSON.stringify({ ok: true, mode: mode });
      }
      return JSON.stringify({ ok: false });
    },
    resetExam: function () {
      if (typeof global.__wmpsesResetExam === 'function') {
        global.__wmpsesResetExam();
        return JSON.stringify({ ok: true });
      }
      return JSON.stringify({ ok: false });
    },
    loadGlbBase64: function (base64Str, fileName) {
      if (typeof global.__wmpsesLoadGLBBase64 === 'function') {
        return JSON.stringify(global.__wmpsesLoadGLBBase64(base64Str, fileName));
      }
      return JSON.stringify({ ok: false, error: '3D 控制器尚未就绪' });
    }
  };
})(window);
