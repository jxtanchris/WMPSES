/**
 * FileMaker WebViewer / FileMaker Data API / 本地离线存储 三合一数据适配层
 */
(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    BANK: 'wmpses_question_bank_v1',
    CONFIG: 'wmpses_fm_config_v1',
    HISTORY: 'wmpses_exam_history_v1'
  };

  const DEFAULT_CONFIG = {
    sourceMode: 'auto', // 'auto' | 'local' | 'webviewer' | 'dataapi' | 'rest'
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
      name: '现场考生',
      examineeId: ''
    }
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
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

  function normalizeQuestionBank(bank) {
    const fallback = deepClone(global.DEFAULT_QUESTION_BANK);
    if (!bank || typeof bank !== 'object') return fallback;

    const hotspots = Array.isArray(bank.hotspots) ? bank.hotspots : fallback.hotspots;
    const normalizedHotspots = hotspots.map((hs, idx) => ({
      id: hs.id || 'hs-' + (idx + 1),
      order: Number.isFinite(Number(hs.order)) ? Number(hs.order) : idx + 1,
      code: hs.code || 'DEV-' + String(idx + 1).padStart(2, '0'),
      name: hs.name || '未命名设备部位',
      category: hs.category || '现场设备核查',
      x: Math.min(98, Math.max(2, Number(hs.x) || 50)),
      y: Math.min(96, Math.max(4, Number(hs.y) || 50)),
      widgetType: hs.widgetType || 'generic',
      sceneSummary: hs.sceneSummary || '',
      questions: Array.isArray(hs.questions)
        ? hs.questions.map((q, qIdx) => ({
            id: q.id || (hs.id || 'hs') + '-q' + (qIdx + 1),
            defectCode: q.defectCode || '',
            defectLevel: q.defectLevel || 'general',
            isMajorDefect: Boolean(q.isMajorDefect),
            isCriticalConclusion: Boolean(q.isCriticalConclusion),
            type: q.type === 'multiple' || q.type === 'judge' ? q.type : 'single',
            score: Number(q.score) > 0 ? Number(q.score) : 2,
            title: q.title || '请输入题目内容',
            options: Array.isArray(q.options) && q.options.length > 0
              ? q.options.map((opt, oIdx) => ({
                  key: opt.key || String.fromCharCode(65 + oIdx),
                  text: opt.text || ''
                }))
              : [
                  { key: 'A', text: '选项 A' },
                  { key: 'B', text: '选项 B' }
                ],
            answer: Array.isArray(q.answer) ? q.answer.slice() : ['A'],
            referenceStandard: q.referenceStandard || '',
            explanation: q.explanation || ''
          }))
        : []
    }));

    return {
      meta: Object.assign({}, fallback.meta, bank.meta || {}),
      hotspots: normalizedHotspots
    };
  }

  function loadConfig() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (!raw) return deepClone(DEFAULT_CONFIG);
      const parsed = safeParseJson(raw, {});
      return {
        sourceMode: parsed.sourceMode || DEFAULT_CONFIG.sourceMode,
        fmScripts: Object.assign({}, DEFAULT_CONFIG.fmScripts, parsed.fmScripts || {}),
        dataApi: Object.assign({}, DEFAULT_CONFIG.dataApi, parsed.dataApi || {}),
        restApi: Object.assign({}, DEFAULT_CONFIG.restApi, parsed.restApi || {}),
        student: Object.assign({}, DEFAULT_CONFIG.student, parsed.student || {})
      };
    } catch (e) {
      return deepClone(DEFAULT_CONFIG);
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

  const FMDataAdapter = {
    getConfig: function () {
      return loadConfig();
    },

    updateConfig: function (partial) {
      const current = loadConfig();
      const next = {
        sourceMode: partial.sourceMode || current.sourceMode,
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
      } catch (e) {
        // ignore
      }
      return deepClone(global.DEFAULT_QUESTION_BANK);
    },

    loadQuestionBank: async function () {
      const cfg = loadConfig();
      const mode = cfg.sourceMode;

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

      return { bank: this.loadLocalBank(), source: '本地题库（离线可用）' };
    },

    saveQuestionBank: async function (bank) {
      const saved = this.saveLocalBank(bank);
      const cfg = loadConfig();
      const syncStatus = [];

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
        syncMessage: syncStatus.length ? syncStatus.join('；') : '已保存到浏览器本地存储（可随时导出 JSON 或同步 FileMaker）'
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
    }
  };
})(window);
