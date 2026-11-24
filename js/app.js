/**
 * 工业废气治理工实操模拟仿真考试系统 - 核心交互控制器
 */
(function (global) {
  'use strict';

  const adapter = global.FMDataAdapter;
  const widgets = global.VisualWidgets;
  const scene3d = global.PlantScene3D;

  const state = {
    mode: 'practice', // 'practice' | 'exam' | 'edit'
    sceneViewMode: '3d-orbit', // '3d-orbit' | '3d-fps' | '2d'
    sceneShowFlow: true,
    activePresetKey: 'overview',
    bank: null,
    answers: {},
    practiceChecked: {},
    examSubmitted: false,
    examStartTime: null,
    examDurationSeconds: 1800,
    remainingSeconds: 1800,
    timerId: null,
    overtimeTriggered: false,
    activeHotspotId: null,
    placingNewHotspot: false,
    wrongOnlyInReport: false,
    lastReportResult: null,
    editingHotspotDraft: null,
    editingPoolDraft: null,
    editorPickerOpen: false,
    editorPickerKeyword: '',
    simParamsDraft: null,
    widgetTemplates: [],
    templateDraft: null,
    templateOpenedFromEditor: false,
    activeSettingsTab: 'bank',
    activeDocsTab: 'docs',
    docsEditDraft: null,
    activeSqliteTable: 'WMPSES_设备热点',
    activeRoleFilter: '全部',
    usersList: [],
    changeLogs: [],
    examResultsList: [],
    examResultsSource: 'local',
    scoreSearchKeyword: '',
    currentUser: null,
    sqliteSnapshot: null,
    scenesList: [],
    sceneDraft: null,
    sceneGlbPending: null,
    gradingSession: null,
    gradingBlindMode: true,
    questionBankFilters: { hotspotId: 'ALL', type: 'ALL', keyword: '' },
    editingQuestionItem: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type) {
    const container = $('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function openModal(modalId) {
    const el = $(modalId);
    if (!el) return;
    if (el instanceof HTMLDialogElement) {
      if (!el.open) el.showModal();
      return;
    }
    el.classList.add('open');
  }

  function closeModal(modalId) {
    if (modalId === 'login-modal' && !state.currentUser) {
      showToast('请先登录系统账号后再继续操作', 'warn');
      return;
    }
    const el = $(modalId);
    if (!el) return;
    if (el instanceof HTMLDialogElement) {
      if (el.open) el.close();
      return;
    }
    el.classList.remove('open');
  }

  function getRolePermissions(roleType) {
    if (!roleType && !state.currentUser) {
      return {
        role: '未登录',
        isAuthenticated: false,
        modes: [],
        allowSubmit: false,
        allowDocs: false,
        allowVetoEdit: false,
        allowReset: false,
        allowSettings: false,
        settingsTabs: [],
        allowBankImport: false,
        allowBankRestore: false,
        allowUserCreate: false,
        allowUserDelete: false,
        allowGrantAdmin: false,
        allowSceneDelete: false,
        allowPickActiveIdentity: false,
        allowGrading: false
      };
    }
    const role = roleType || (state.currentUser && state.currentUser.RoleType) || '考生';
    if (role === '系统管理员') {
      return {
        role: role,
        isAuthenticated: true,
        modes: ['practice', 'exam', 'edit'],
        allowSubmit: true,
        allowDocs: true,
        allowVetoEdit: true,
        allowReset: true,
        allowSettings: true,
        settingsTabs: ['bank', 'questions', 'scores', 'veto', 'sqlite', 'fm'],
        allowBankImport: true,
        allowBankRestore: true,
        allowUserCreate: true,
        allowUserDelete: true,
        allowGrantAdmin: true,
        allowSceneDelete: true,
        allowPickActiveIdentity: true,
        allowGrading: true
      };
    }
    if (role === '命题教师') {
      return {
        role: role,
        isAuthenticated: true,
        modes: ['practice', 'exam', 'edit'],
        allowSubmit: true,
        allowDocs: true,
        allowVetoEdit: true,
        allowReset: true,
        allowSettings: true,
        settingsTabs: ['bank', 'questions', 'scores', 'veto', 'sqlite', 'fm'],
        allowBankImport: true,
        allowBankRestore: true,
        allowUserCreate: true,
        allowUserDelete: true,
        allowGrantAdmin: false,
        allowSceneDelete: true,
        allowPickActiveIdentity: true,
        allowGrading: true
      };
    }
    if (role === '审题专家') {
      return {
        role: role,
        isAuthenticated: true,
        modes: ['practice', 'edit'],
        allowSubmit: true,
        allowDocs: true,
        allowVetoEdit: true,
        allowReset: false,
        allowSettings: true,
        settingsTabs: ['bank', 'questions', 'scores', 'veto', 'sqlite', 'fm'],
        allowBankImport: true,
        allowBankRestore: false,
        allowUserCreate: true,
        allowUserDelete: false,
        allowGrantAdmin: false,
        allowSceneDelete: false,
        allowPickActiveIdentity: true,
        allowGrading: true
      };
    }
    if (role === '考评员') {
      return {
        role: role,
        isAuthenticated: true,
        modes: [],
        allowSubmit: false,
        allowDocs: true,
        allowVetoEdit: false,
        allowReset: false,
        allowSettings: true,
        settingsTabs: ['scores', 'bank', 'sqlite'],
        allowBankImport: false,
        allowBankRestore: false,
        allowUserCreate: false,
        allowUserDelete: false,
        allowGrantAdmin: false,
        allowSceneDelete: false,
        allowPickActiveIdentity: false,
        allowGrading: true
      };
    }
    if (role === '监考员') {
      return {
        role: role,
        isAuthenticated: true,
        modes: [],
        allowSubmit: false,
        allowDocs: false,
        allowVetoEdit: false,
        allowReset: false,
        allowSettings: true,
        settingsTabs: ['scores', 'bank', 'sqlite'],
        allowBankImport: false,
        allowBankRestore: false,
        allowUserCreate: false,
        allowUserDelete: false,
        allowGrantAdmin: false,
        allowSceneDelete: false,
        allowPickActiveIdentity: false,
        allowGrading: false
      };
    }
    // 默认按「考生」最小权限收口
    return {
      role: role,
      isAuthenticated: true,
      modes: ['practice', 'exam'],
      allowSubmit: true,
      allowDocs: true,
      allowVetoEdit: false,
      allowReset: true,
      allowSettings: false,
      settingsTabs: [],
      allowBankImport: false,
      allowBankRestore: false,
      allowUserCreate: false,
      allowUserDelete: false,
      allowGrantAdmin: false,
      allowSceneDelete: false,
      allowPickActiveIdentity: false,
      allowGrading: false
    };
  }

  function applyRolePermissions() {
    const perms = getRolePermissions();
    const isLoggedIn = Boolean(state.currentUser);
    const setVisible = (id, show) => {
      const el = $(id);
      if (el) el.style.display = show ? '' : 'none';
    };

    const hasAnyMode = isLoggedIn && perms.modes.length > 0;
    const modeSwitcher = document.querySelector('.mode-switcher');
    if (modeSwitcher) modeSwitcher.style.display = hasAnyMode ? '' : 'none';
    const stageLegend = document.querySelector('.stage-legend');
    if (stageLegend) stageLegend.style.display = hasAnyMode ? '' : 'none';

    setVisible('mode-btn-practice', isLoggedIn && perms.modes.includes('practice'));
    setVisible('mode-btn-exam', isLoggedIn && perms.modes.includes('exam'));
    setVisible('mode-btn-edit', isLoggedIn && perms.modes.includes('edit'));

    setVisible('btn-submit-exam', isLoggedIn && perms.allowSubmit);
    setVisible('btn-open-docs', isLoggedIn && perms.allowDocs);
    setVisible('btn-open-scenes', isLoggedIn && perms.modes.includes('edit'));
    setVisible('btn-reset-exam', isLoggedIn && perms.allowReset);
    setVisible('btn-open-settings', isLoggedIn && perms.allowSettings);
    setVisible('btn-restore-default', isLoggedIn && perms.allowBankRestore);
    setVisible('btn-open-password', isLoggedIn);
    setVisible('progress-status-chip', hasAnyMode);
    syncExamineeSceneSelectUi();

    const settingsBtn = $('btn-open-settings');
    if (settingsBtn) {
      settingsBtn.textContent = (isLoggedIn && !hasAnyMode) ? '📊 考生成绩 / 题库数据' : '⚙️ 数据库 / 题库';
    }

    const loginBtn = $('btn-open-login');
    if (loginBtn) {
      loginBtn.textContent = isLoggedIn ? '🚪 切换账号' : '🔐 登录系统';
    }

    const stageEl = $('main-stage-container');
    if (stageEl) {
      stageEl.style.pointerEvents = isLoggedIn ? '' : 'none';
      stageEl.style.opacity = isLoggedIn ? '' : '0.4';
      stageEl.style.userSelect = isLoggedIn ? '' : 'none';
    }

    if (!isLoggedIn) {
      stopExamTimer();
      setVisible('timer-chip', false);
      const editBanner = $('edit-banner');
      if (editBanner) editBanner.classList.remove('visible');
      const hint = $('stage-hint');
      if (hint) {
        hint.innerHTML = '🔒 <strong>未登录状态：</strong>请先在登录窗口验证身份，或点击右上角「登录系统」按钮。';
      }
      return;
    }

    if (!perms.modes.length) {
      stopExamTimer();
      setVisible('timer-chip', false);
      const editBanner = $('edit-banner');
      if (editBanner) editBanner.classList.remove('visible');
      state.mode = 'practice';
      state.examSubmitted = false;
      const hint = $('stage-hint');
      if (hint) {
        hint.innerHTML = `🛡️ <strong>${escapeHtml(perms.role)}工作台：</strong>点击右上角「📊 考生成绩 / 题库数据」可查询全考场成绩表、题库与 SQLite 数据；点击装置热点可预览考试演示内容。`;
      }
    } else if (!perms.modes.includes(state.mode)) {
      const fallbackMode = perms.modes[0] || 'practice';
      switchMode(fallbackMode, true);
    } else if (state.mode === 'practice') {
      const hint = $('stage-hint');
      if (hint) {
        hint.innerHTML = '💡 <strong>练习演示模式：</strong>点击装置图上闪烁的热点圆标（或下方设备导航卡片），即答即评并查看标准解析。';
      }
    }
  }

  function arraysEqual(a, b) {
    const sa = (a || []).toSorted();
    const sb = (b || []).toSorted();
    if (sa.length !== sb.length) return false;
    return sa.every((val, idx) => val === sb[idx]);
  }

  function getTotalScore() {
    if (!state.bank || !Array.isArray(state.bank.hotspots)) return 50;
    return state.bank.hotspots.reduce((sum, hs) => {
      return sum + (hs.questions || []).reduce((qSum, q) => qSum + (Number(q.score) || 0), 0);
    }, 0);
  }

  function getTotalQuestionCount() {
    if (!state.bank || !Array.isArray(state.bank.hotspots)) return 0;
    return state.bank.hotspots.reduce((sum, hs) => sum + (hs.questions || []).length, 0);
  }

  function isQuestionAnswered(q) {
    const ans = state.answers[q.id];
    if (q && q.type === 'short_answer') {
      if (Array.isArray(ans)) return Boolean(String(ans[0] || '').trim());
      return Boolean(String(ans || '').trim());
    }
    return Array.isArray(ans) && ans.length > 0;
  }

  function isExamineeRole() {
    return Boolean(state.currentUser && (state.currentUser.RoleType || '考生') === '考生');
  }

  function isReadOnlyObserverRole() {
    const perms = getRolePermissions();
    return Boolean(state.currentUser && perms.modes.length === 0);
  }

  function isExamineeExamSealed() {
    return isExamineeRole() && state.mode === 'exam' && state.examSubmitted;
  }

  function getHotspotProgress(hs) {
    const questions = hs.questions || [];
    const total = questions.length;
    if (isReadOnlyObserverRole()) {
      return { total, answered: 0, wrongCount: 0, statusClass: 'state-pending' };
    }
    let answered = 0;
    let wrongCount = 0;

    questions.forEach((q) => {
      if (isQuestionAnswered(q)) {
        answered++;
        const showJudge = state.mode === 'practice'
          ? Boolean(state.practiceChecked[q.id])
          : (state.examSubmitted && !isExamineeRole());
        if (showJudge && q.type !== 'short_answer' && !arraysEqual(state.answers[q.id], q.answer)) {
          wrongCount++;
        }
      }
    });

    let statusClass = 'state-pending';
    if (wrongCount > 0) {
      statusClass = 'state-error';
    } else if (total > 0 && answered === total) {
      statusClass = 'state-done';
    } else if (answered > 0) {
      statusClass = 'state-partial';
    }

    return { total, answered, wrongCount, statusClass };
  }

  function formatSeconds(sec) {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function updateHeaderStats() {
    const hotspots = (state.bank && state.bank.hotspots) || [];
    let completedHotspots = 0;
    let answeredQuestions = 0;
    let totalQuestions = 0;

    hotspots.forEach((hs) => {
      const p = getHotspotProgress(hs);
      totalQuestions += p.total;
      answeredQuestions += p.answered;
      if (p.total > 0 && p.answered === p.total) completedHotspots++;
    });

    $('stat-hotspots').textContent = `${completedHotspots}/${hotspots.length}`;
    $('stat-questions').textContent = `${answeredQuestions}/${totalQuestions}`;

    const curUser = state.currentUser;
    if (curUser) {
      const userCode = curUser.UserCode ? ` (${curUser.UserCode})` : '';
      $('student-name-display').textContent = `[${curUser.RoleType || '人员'}] ${curUser.FullName}${userCode}`;
    } else {
      $('student-name-display').textContent = '[未登录] 请先登录';
    }

    if (state.bank && state.bank.meta) {
      $('app-title').textContent = state.bank.meta.title || '工业废气治理工实操模拟仿真考试系统';
      $('app-subtitle').textContent = state.bank.meta.subtitle || '1.1.1 系统启动前设备验收';
    }

    const submitBtn = $('btn-submit-exam');
    if (state.mode === 'exam') {
      submitBtn.textContent = state.examSubmitted ? '📄 查看成绩单' : '📨 提交试卷';
    } else {
      submitBtn.textContent = '📊 查看得分汇总';
    }
  }

  function renderPanoramaImage() {
    const img = $('panorama-img');
    if (!img) return;
    const bankPic = state.bank && state.bank.meta && state.bank.meta.examPicture;
    const targetSrc = bankPic || global.PLANT_IMAGE_BASE64 || 'assets/plant-panorama.jpg';
    if (img.src !== targetSrc) {
      img.src = targetSrc;
    }
    img.onerror = function () {
      if (img.src !== 'assets/plant-panorama.jpg') {
        img.src = 'assets/plant-panorama.jpg';
      }
    };
  }

  function updateFpsHudDisplay(camState) {
    const tip = $('scene-3d-corner-tip');
    if (tip && camState) {
      if (camState.hasGlbModel) {
        const info = camState.glbInfo;
        const tag = info ? `${info.name} · ${(info.triangleCount / 10000).toFixed(1)}万面` : 'GLB 3D模型';
        tip.textContent = `📦 真3D模型 (${tag}) · 左键旋转 · 右键/Shift平移 · 滚轮缩放 · 切第一人称可WASD走动`;
      } else if (camState.panoLocked) {
        tip.textContent = '全景锁定模式 · 左键拖拽转头 · 滚轮变焦 · 热点锚定在底图上 · 编辑模式可拖动热点对准设备';
      } else {
        tip.textContent = '左键拖拽旋转 · 右键/Shift+左键平移 · 滚轮缩放 · 点击热点查看设备';
      }
    }
    const hud = $('fps-hud-coords');
    if (!hud || !camState || !camState.fps) return;
    const f = camState.fps;
    hud.textContent = `🚶 第一人称巡检 · 位置 (${f.x.toFixed(1)}, ${f.y.toFixed(1)}) · 标高 ${f.z.toFixed(1)}m ｜ W/A/S/D 行走 · Q/E 升降 · 拖拽环顾`;
  }

  function update3DProjectionPins(projections) {
    if (state.sceneViewMode === '2d' || !projections) return;
    const layer = $('hotspot-layer');
    if (!layer) return;
    layer.querySelectorAll('.hotspot-pin[data-hotspot-id]').forEach((pin) => {
      const hsId = pin.dataset.hotspotId;
      const proj = projections[hsId];
      if (!proj || !proj.visible) {
        pin.style.display = 'none';
        return;
      }
      pin.style.display = 'flex';
      pin.style.left = `${proj.screenXPct.toFixed(2)}%`;
      pin.style.top = `${proj.screenYPct.toFixed(2)}%`;
      const scale = Number.isFinite(proj.scale) ? proj.scale : 1;
      pin.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      pin.classList.toggle('is-occluded', Boolean(proj.occluded));
    });
  }

  function switchSceneViewMode(viewMode) {
    if (viewMode !== '3d-orbit' && viewMode !== '3d-fps' && viewMode !== '2d') return;
    state.sceneViewMode = viewMode;

    document.querySelectorAll('.scene-view-btn[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewMode);
    });

    const stage = $('panorama-stage');
    const is3d = viewMode !== '2d';
    if (stage) {
      stage.classList.toggle('is-3d', is3d);
    }

    const tpGroup = $('scene-teleport-group');
    const auxGroup = $('scene-3d-aux-group');
    const cornerTip = $('scene-3d-corner-tip');
    const fpsHud = $('fps-hud-overlay');

    if (tpGroup) tpGroup.style.display = is3d ? 'flex' : 'none';
    if (auxGroup) auxGroup.style.display = is3d ? 'flex' : 'none';
    if (cornerTip) {
      cornerTip.style.display = is3d ? 'block' : 'none';
      cornerTip.textContent = viewMode === '3d-fps'
        ? '拖拽环顾视角 · W/A/S/D 移动 · Q/E 升降标高 · 滚轮前后步进'
        : '左键拖拽旋转 · 右键/Shift+左键平移 · 滚轮缩放 · 点击热点查看设备';
    }
    if (fpsHud) {
      fpsHud.classList.toggle('visible', viewMode === '3d-fps');
      fpsHud.setAttribute('aria-hidden', viewMode === '3d-fps' ? 'false' : 'true');
    }

    if (scene3d) {
      scene3d.setViewMode(viewMode);
      if (state.bank && Array.isArray(state.bank.hotspots)) {
        scene3d.setHotspots(state.bank.hotspots);
      }
      if (viewMode === '3d-fps') {
        updateFpsHudDisplay(scene3d.getState());
      }
    }

    updateHeaderStats();
    renderHotspotsAndDock();
  }

  function syncAllSimParamsTo3D() {
    if (!scene3d || !state.bank || !Array.isArray(state.bank.hotspots)) return;
    state.bank.hotspots.forEach((hs) => {
      if (hs && hs.id && hs.widgetParams) {
        scene3d.updateSimParams(hs.id, hs.widgetParams);
      }
    });
  }

  function renderHotspotsAndDock() {
    const layer = $('hotspot-layer');
    const dock = $('device-dock');
    if (!layer || !dock || !state.bank) return;

    layer.replaceChildren();
    dock.replaceChildren();

    const hotspots = state.bank.hotspots || [];
    if (scene3d) {
      scene3d.setHotspots(hotspots);
    }

    if (!state.currentUser) {
      dock.innerHTML = `
        <div style="grid-column:1 / -1;padding:14px 18px;border-radius:10px;background:rgba(15,23,42,0.88);border:1px dashed rgba(248,113,113,0.45);color:#fca5a5;font-size:13px;text-align:center;">
          🔒 当前未登录，请先登录系统后操作
        </div>
      `;
      updateHeaderStats();
      return;
    }

    if (isExamineeExamSealed()) {
      dock.innerHTML = `
        <div style="grid-column:1 / -1;padding:16px 20px;border-radius:10px;background:rgba(15,23,42,0.92);border:1px solid rgba(56,189,248,0.45);color:#e2e8f0;font-size:13px;text-align:center;">
          <strong style="color:#38bdf8;">🔒 本次正式考试答卷已提交并封闭</strong>
          <div style="margin-top:6px;color:#94a3b8;font-size:12.5px;">您的作答记录与成绩已写入成绩表，考场规则禁止查看成绩单、对错与解析，请等待监考老师核验或切换账号。</div>
        </div>
      `;
    }

    const projections = (state.sceneViewMode !== '2d' && scene3d)
      ? scene3d.computeProjections(hotspots)
      : null;

    hotspots.forEach((hs, index) => {
      const displayOrder = index + 1;
      const prog = getHotspotProgress(hs);
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = `hotspot-pin ${prog.statusClass}${state.mode === 'edit' ? ' mode-edit' : ''}`;
      const p3 = hs.pos3d || (scene3d ? scene3d.inferPos3DFrom2D(hs) : { x: 0, y: 0, z: 3 });

      if (projections && projections[hs.id]) {
        const proj = projections[hs.id];
        pin.style.display = proj.visible ? 'flex' : 'none';
        pin.style.left = `${proj.screenXPct.toFixed(2)}%`;
        pin.style.top = `${proj.screenYPct.toFixed(2)}%`;
        pin.style.transform = `translate(-50%, -50%) scale(${(proj.scale || 1).toFixed(3)})`;
        if (proj.occluded) pin.classList.add('is-occluded');
      } else {
        pin.style.display = 'flex';
        pin.style.left = `${hs.x}%`;
        pin.style.top = `${hs.y}%`;
        pin.style.transform = 'translate(-50%, -50%)';
      }

      pin.dataset.hotspotId = hs.id;
      pin.title = `${hs.code} ${hs.name} (${prog.answered}/${prog.total})`;

      const editCoordText = state.sceneViewMode === '2d'
        ? `${hs.x.toFixed(1)}%,${hs.y.toFixed(1)}%`
        : `${p3.x.toFixed(1)},${p3.y.toFixed(1)},${p3.z.toFixed(1)}m`;

      const readOnlyRole = isReadOnlyObserverRole();
      pin.innerHTML = `
        <span class="hotspot-core">
          <span class="hotspot-pulse"></span>
          ${displayOrder}
        </span>
        <span class="hotspot-label">
          <span>${escapeHtml(hs.name)}</span>
          <span class="hotspot-badge">${state.mode === 'edit' ? editCoordText : (readOnlyRole ? `${prog.total}题` : `${prog.answered}/${prog.total}`)}</span>
        </span>
      `;

      bindHotspotPinEvents(pin, hs);
      layer.appendChild(pin);

      // 底部快捷导航卡片
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `dock-card ${prog.statusClass}`;
      card.innerHTML = `
        <span class="dock-num">${displayOrder}</span>
        <div class="dock-info">
          <div class="dock-title">${escapeHtml(hs.code)} · ${escapeHtml(hs.name)}</div>
          <div class="dock-meta">
            <span>${escapeHtml(hs.category)}</span>
            <span>${readOnlyRole ? `共${prog.total}题` : `${prog.answered}/${prog.total}题`}</span>
          </div>
        </div>
      `;
      card.addEventListener('mouseenter', () => {
        pin.classList.add('highlighted');
      });
      card.addEventListener('mouseleave', () => {
        pin.classList.remove('highlighted');
      });
      card.addEventListener('click', () => {
        onHotspotActivated(hs.id);
      });
      dock.appendChild(card);
    });

    updateHeaderStats();
  }

  function bindHotspotPinEvents(pin, hs) {
    let startX = 0;
    let startY = 0;
    let isDragging = false;
    let moved = false;

    pin.addEventListener('pointerdown', (e) => {
      if (state.mode !== 'edit') return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      pin.classList.add('dragging');
      if (pin.setPointerCapture) pin.setPointerCapture(e.pointerId);
    });

    pin.addEventListener('pointermove', (e) => {
      if (!isDragging || state.mode !== 'edit') return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > 5) moved = true;
      if (!moved) return;

      if (state.sceneViewMode !== '2d' && scene3d && scene3d.isPanoLocked()) {
        const pp = scene3d.screenToPano(e.clientX, e.clientY);
        hs.panoPos = pp;
        hs.widgetParams = Object.assign({}, hs.widgetParams || {}, { _pano: pp });
        scene3d.forceProject();
        const badge = pin.querySelector('.hotspot-badge');
        if (badge) badge.textContent = `全景 ${(pp.yaw * 57.2958).toFixed(0)}°/${(pp.pitch * 57.2958).toFixed(0)}°`;
        return;
      }

      if (state.sceneViewMode !== '2d' && scene3d) {
        const refP3 = hs.pos3d || scene3d.inferPos3DFrom2D(hs);
        const nextP3 = scene3d.screenToWorld3D(e.clientX, e.clientY, refP3);
        hs.pos3d = nextP3;
        hs.widgetParams = Object.assign({}, hs.widgetParams || {}, { _pos3d: nextP3 });
        scene3d.forceProject();
        const badge = pin.querySelector('.hotspot-badge');
        if (badge) badge.textContent = `${nextP3.x.toFixed(1)},${nextP3.y.toFixed(1)},${nextP3.z.toFixed(1)}m`;
        return;
      }

      const stage = $('panorama-stage');
      const rect = stage.getBoundingClientRect();
      const pctX = Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100));
      const pctY = Math.min(96, Math.max(4, ((e.clientY - rect.top) / rect.height) * 100));
      hs.x = Math.round(pctX * 10) / 10;
      hs.y = Math.round(pctY * 10) / 10;
      pin.style.left = `${hs.x}%`;
      pin.style.top = `${hs.y}%`;
      const badge = pin.querySelector('.hotspot-badge');
      if (badge) badge.textContent = `${hs.x.toFixed(1)}%,${hs.y.toFixed(1)}%`;
    });

    pin.addEventListener('pointerup', (e) => {
      if (state.mode !== 'edit') return;
      if (!isDragging) return;
      isDragging = false;
      pin.classList.remove('dragging');
      if (pin.releasePointerCapture) {
        try { pin.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      if (moved) {
        if (state.sceneViewMode !== '2d' && hs.pos3d) {
          persistEditToBackend(`已移动 3D 热点「${hs.name}」至 (${hs.pos3d.x}, ${hs.pos3d.y}, ${hs.pos3d.z}m)`, '拖拽3D热点坐标');
        } else {
          persistEditToBackend(`已移动「${hs.name}」至 (${hs.x}%, ${hs.y}%)`, '拖拽热点坐标');
        }
      } else {
        openEditorModal(hs.id);
      }
    });

    pin.addEventListener('click', (e) => {
      if (state.mode === 'edit') {
        e.preventDefault();
        return;
      }
      onHotspotActivated(hs.id);
    });
  }

  function onHotspotActivated(hotspotId) {
    if (!state.currentUser) {
      showToast('请先登录系统账号后再操作设备热点', 'warn');
      openLoginModal();
      return;
    }
    if (isExamineeExamSealed()) {
      showToast('🔒 正式考试答卷已提交并封闭，不可查看或修改题目', 'warn');
      return;
    }
    if (state.sceneViewMode !== '2d' && scene3d) {
      scene3d.flyToHotspot(hotspotId);
    }
    const perms = getRolePermissions();
    if (state.mode === 'edit' && perms.modes.includes('edit')) {
      openEditorModal(hotspotId);
      return;
    }
    openQuestionModal(hotspotId);
  }

  function getTypeLabel(type) {
    if (type === 'multiple') return '多选题';
    if (type === 'judge') return '判断题';
    if (type === 'short_answer') return '文字简答题';
    return '单选题';
  }

  function getDefectTag(q) {
    if (q.defectLevel === 'major') return { cls: 'major', text: `重大缺陷 ${q.defectCode || ''}`.trim() };
    if (q.defectLevel === 'general') return { cls: 'general', text: `一般缺陷 ${q.defectCode || ''}`.trim() };
    if (q.defectLevel === 'interference') return { cls: 'interference', text: `正常干扰项 ${q.defectCode || ''}`.trim() };
    if (q.defectLevel === 'safety') return { cls: 'safety', text: `安全红线 ${q.defectCode || ''}`.trim() };
    if (q.defectLevel === 'critical') return { cls: 'critical', text: '总体验收放行判定' };
    return null;
  }

  function renderSimSimulatorPanel(hs) {
    const panel = $('sim-simulator-panel');
    if (!panel || !hs) return;

    if (state.mode === 'exam') {
      panel.innerHTML = `
        <div style="padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid rgba(148,163,184,0.22);font-size:12px;color:#94a3b8;">
          🔒 正式考试模式已锁定标准考核工况，切换至「练习演示」或「教师编辑」模式可动态模拟调节仪表数值。
        </div>
      `;
      return;
    }

    const wType = hs.widgetType || 'generic';
    const schema = (widgets.WIDGET_PARAM_SCHEMAS && widgets.WIDGET_PARAM_SCHEMAS[wType]) || widgets.WIDGET_PARAM_SCHEMAS.generic;
    const params = state.simParamsDraft || widgets.resolveParams(wType, hs);
    const canSaveToBank = Boolean(state.currentUser && ['命题教师', '审题专家', '系统管理员'].includes(state.currentUser.RoleType));

    const controlsHtml = schema.map((f) => {
      const val = params[f.key];
      if (f.type === 'select') {
        return `
          <div class="form-field" style="margin-bottom:0;">
            <label style="font-size:12px;margin-bottom:4px;">${escapeHtml(f.label)}</label>
            <select class="form-control sim-param-select" data-key="${escapeHtml(f.key)}" style="padding:6px 8px;font-size:12px;">
              ${(f.options || []).map((opt) => `<option value="${escapeHtml(opt)}" ${val === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
            </select>
          </div>
        `;
      }
      if (f.type === 'text') {
        return `
          <div class="form-field" style="margin-bottom:0;">
            <label style="font-size:12px;margin-bottom:4px;">${escapeHtml(f.label)}</label>
            <input type="text" class="form-control sim-param-text" data-key="${escapeHtml(f.key)}" value="${escapeHtml(val)}" style="padding:6px 8px;font-size:12px;">
          </div>
        `;
      }
      return `
        <div class="form-field" style="margin-bottom:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:4px;gap:6px;">
            <span style="color:#cbd5e1;">${escapeHtml(f.label)}</span>
            <strong class="sim-val-readout" data-key="${escapeHtml(f.key)}" data-unit="${escapeHtml(f.unit || '')}" style="color:#38bdf8;white-space:nowrap;">${escapeHtml(val)} ${escapeHtml(f.unit || '')}</strong>
          </div>
          <input type="range" class="sim-param-range" data-key="${escapeHtml(f.key)}" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" style="width:100%;accent-color:#38bdf8;cursor:pointer;">
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div style="padding:12px 14px;border-radius:10px;background:#0f172a;border:1px solid rgba(56,189,248,0.28);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <strong style="font-size:12.5px;color:#7dd3fc;">🎛️ 现场工况仿真调节器（拖动滑块或切换阀门/联锁，实时推演上方仪表图形）</strong>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-sim-reset">↺ 恢复基准值</button>
            ${canSaveToBank ? '<button type="button" class="btn btn-success btn-sm" id="btn-sim-save-bank">💾 将当前模拟数值保存为题库默认值</button>' : ''}
          </div>
        </div>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
          ${controlsHtml}
        </div>
      </div>
    `;

    const redrawSvg = () => {
      $('visual-widget-container').innerHTML = widgets.render(wType, hs, state.simParamsDraft);
      if (scene3d) {
        scene3d.updateSimParams(hs.id, state.simParamsDraft);
      }
    };

    panel.querySelectorAll('.sim-param-range').forEach((el) => {
      el.addEventListener('input', () => {
        const key = el.dataset.key;
        const val = Number(el.value);
        state.simParamsDraft[key] = val;
        const readout = panel.querySelector(`.sim-val-readout[data-key="${key}"]`);
        if (readout) {
          readout.textContent = `${val} ${readout.dataset.unit || ''}`.trim();
        }
        redrawSvg();
      });
    });

    panel.querySelectorAll('.sim-param-select').forEach((el) => {
      el.addEventListener('change', () => {
        state.simParamsDraft[el.dataset.key] = el.value;
        redrawSvg();
      });
    });

    panel.querySelectorAll('.sim-param-text').forEach((el) => {
      el.addEventListener('input', () => {
        state.simParamsDraft[el.dataset.key] = el.value;
        redrawSvg();
      });
    });

    const resetBtn = $('btn-sim-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.simParamsDraft = widgets.resolveParams(wType, hs);
        redrawSvg();
        renderSimSimulatorPanel(hs);
        showToast('已恢复该部位题库基准工况数值', 'info');
      });
    }

    const saveBtn = $('btn-sim-save-bank');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        hs.widgetParams = Object.assign({}, state.simParamsDraft, hs.pos3d ? { _pos3d: hs.pos3d } : {});
        if (wType !== 'generic') {
          hs.sceneSummary = widgets.buildFactsText(wType, hs, state.simParamsDraft);
        }
        await persistEditToBackend(`已保存「${hs.name}」仿真工况仪表参数`, '调整设备仪表参数');
      });
    }
  }

  function openQuestionModal(hotspotId) {
    const hotspots = state.bank.hotspots || [];
    const idx = hotspots.findIndex((h) => h.id === hotspotId);
    if (idx === -1) return;

    state.activeHotspotId = hotspotId;
    const hs = hotspots[idx];
    state.simParamsDraft = widgets.resolveParams(hs.widgetType || 'generic', hs);

    $('qm-code').textContent = hs.code;
    $('qm-title').textContent = `${idx + 1}. ${hs.name}`;
    $('qm-category').textContent = hs.category;

    // 渲染顶部现场仿真工况 SVG 卡片 + 工况模拟调节器
    $('visual-widget-container').innerHTML = widgets.render(hs.widgetType, hs, state.simParamsDraft);
    renderSimSimulatorPanel(hs);

    // 渲染习题列表
    renderQuestionsForHotspot(hs);

    const readOnlyRole = isReadOnlyObserverRole();
    $('btn-prev-hotspot').disabled = idx === 0;
    $('btn-next-hotspot').disabled = readOnlyRole && idx === hotspots.length - 1;
    $('btn-next-hotspot').textContent = idx === hotspots.length - 1
      ? (readOnlyRole ? '已是最后部位' : (state.mode === 'exam' && isExamineeRole() ? '完成并提交封卷 →' : '完成并查看汇总 →'))
      : '下一部位 →';

    const qmBody = $('question-modal') && $('question-modal').querySelector('.modal-body');
    if (qmBody) qmBody.scrollTop = 0;

    openModal('question-modal');
  }

  function renderQuestionsForHotspot(hs) {
    const container = $('question-list-container');
    const questions = hs.questions || [];
    const prog = getHotspotProgress(hs);
    const readOnlyRole = isReadOnlyObserverRole();
    const roleLabel = (state.currentUser && state.currentUser.RoleType) || '当前角色';
    $('qm-progress-text').textContent = readOnlyRole
      ? `🛡️ 只读观摩（共 ${prog.total} 题，${roleLabel}不可作答）`
      : `本部位作答进度：${prog.answered} / ${prog.total}`;

    if (!questions.length) {
      container.innerHTML = `<div class="question-card" style="text-align:center;color:#94a3b8;">当前部位暂未配置习题，可在“教师编辑/标点”模式中添加。</div>`;
      return;
    }

    container.innerHTML = questions.map((q, qIdx) => {
      const isSubjective = q.type === 'short_answer';
      const selected = readOnlyRole ? [] : (state.answers[q.id] || []);
      const textAnswer = readOnlyRole ? '' : (Array.isArray(selected) ? String(selected[0] || '') : String(selected || ''));
      const showFeedback = !readOnlyRole && (state.mode === 'practice'
        ? Boolean(state.practiceChecked[q.id])
        : (state.examSubmitted && !isExamineeRole()));
      const isCorrect = !isSubjective && showFeedback && arraysEqual(selected, q.answer);
      const locked = readOnlyRole || (state.mode === 'exam' && state.examSubmitted);
      const defectTag = showFeedback ? getDefectTag(q) : null;

      let optionsHtml = '';
      if (isSubjective) {
        optionsHtml = `
          <div class="short-answer-box" style="margin-top:8px;">
            <textarea
              class="form-control short-answer-input"
              data-qid="${escapeHtml(q.id)}"
              rows="4"
              placeholder="${readOnlyRole ? '（只读观摩模式，考评员/监考员不可在此作答）' : '请在此输入详细的文字分析、缺陷判定依据及整改措施（正式考试提交后由考评员手工阅卷打分）...'}"
              ${locked ? 'disabled' : ''}
              style="width:100%;resize:vertical;line-height:1.55;font-size:13px;"
            >${escapeHtml(textAnswer)}</textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:11.5px;color:#94a3b8;">
              <span>📝 主观文字题（满分 ${q.score} 分，正式考试交卷后由考评员人工打分）</span>
              <span class="short-answer-len" data-qid="${escapeHtml(q.id)}">已输入 ${textAnswer.trim().length} 字</span>
            </div>
          </div>
        `;
      } else {
        optionsHtml = (q.options || []).map((opt) => {
          const isSel = selected.includes(opt.key);
          const isRightOpt = (q.answer || []).includes(opt.key);
          let cls = 'option-item';
          if (showFeedback) {
            if (isRightOpt) cls += ' correct';
            else if (isSel && !isRightOpt) cls += ' wrong';
          } else if (isSel) {
            cls += ' selected';
          }
          return `
            <button type="button" class="${cls}" data-qid="${escapeHtml(q.id)}" data-key="${escapeHtml(opt.key)}" ${locked ? 'disabled' : ''}>
              <span class="option-key">${escapeHtml(opt.key)}</span>
              <span>${escapeHtml(opt.text)}</span>
            </button>
          `;
        }).join('');
      }

      let actionHtml = '';
      if (!readOnlyRole && state.mode === 'practice') {
        if (!showFeedback && q.type === 'multiple') {
          actionHtml = `
            <div class="q-actions">
              <button type="button" class="btn btn-primary btn-sm btn-check-multi" data-qid="${escapeHtml(q.id)}" ${selected.length ? '' : 'disabled'}>确认本题判定</button>
              <span style="font-size:12px;color:#94a3b8;">请选择所有符合题意的选项后点击确认</span>
            </div>
          `;
        } else if (!showFeedback && isSubjective) {
          actionHtml = `
            <div class="q-actions">
              <button type="button" class="btn btn-primary btn-sm btn-check-multi" data-qid="${escapeHtml(q.id)}" ${textAnswer.trim() ? '' : 'disabled'}>对照参考评分要点</button>
              <span style="font-size:12px;color:#94a3b8;">输入文字作答后可查看参考评分要点（正式考试由考评员人工打分）</span>
            </div>
          `;
        } else if (showFeedback) {
          actionHtml = `
            <div class="q-actions">
              <button type="button" class="btn btn-ghost btn-sm btn-redo-question" data-qid="${escapeHtml(q.id)}">重新作答本题</button>
            </div>
          `;
        }
      }

      let feedbackHtml = '';
      if (showFeedback) {
        if (isSubjective) {
          feedbackHtml = `
            <div class="q-feedback pass">
              <div class="q-feedback-title">📋 主观文字题参考评分要点（满分 ${q.score} 分，正式考试由考评员手工阅卷）</div>
              <div>${escapeHtml(q.explanation || '请参照相关安全与环保验收规程要点作答。')}</div>
              ${q.referenceStandard ? `<div class="q-feedback-ref">依据标准：${escapeHtml(q.referenceStandard)}</div>` : ''}
            </div>
          `;
        } else {
          feedbackHtml = `
            <div class="q-feedback ${isCorrect ? 'pass' : 'fail'}">
              <div class="q-feedback-title">
                ${isCorrect ? `✅ 判定正确（+${q.score} 分）` : `❌ 判定有误（标准答案：${(q.answer || []).join('、')}）`}
              </div>
              <div>${escapeHtml(q.explanation || '请参照相关安全与环保验收规程。')}</div>
              ${q.referenceStandard ? `<div class="q-feedback-ref">依据标准：${escapeHtml(q.referenceStandard)}</div>` : ''}
            </div>
          `;
        }
      }

      return `
        <article class="question-card">
          <div class="question-head">
            <div class="q-badges">
              <span class="q-type-badge">${getTypeLabel(q.type)}</span>
              <span class="q-score-badge">${q.score} 分</span>
              ${defectTag ? `<span class="q-defect-badge ${defectTag.cls}">${escapeHtml(defectTag.text)}</span>` : ''}
            </div>
            <span style="font-size:12px;color:#94a3b8;">第 ${qIdx + 1} 题</span>
          </div>
          <h3 class="q-title">${escapeHtml(q.title)}</h3>
          <div class="options-list">${optionsHtml}</div>
          ${actionHtml}
          ${feedbackHtml}
        </article>
      `;
    }).join('');

    // 绑定选项点击事件（只读考务角色禁止作答）
    container.querySelectorAll('.option-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (isReadOnlyObserverRole()) return;
        const qid = btn.dataset.qid;
        const key = btn.dataset.key;
        handleOptionClick(hs, qid, key);
      });
    });

    // 绑定文字简答题输入事件
    container.querySelectorAll('.short-answer-input').forEach((ta) => {
      ta.addEventListener('input', () => {
        if (isReadOnlyObserverRole() || (state.mode === 'exam' && state.examSubmitted)) return;
        const qid = ta.dataset.qid;
        const val = ta.value;
        if (val.trim()) {
          state.answers[qid] = [val];
        } else {
          delete state.answers[qid];
        }
        const lenEl = container.querySelector(`.short-answer-len[data-qid="${qid}"]`);
        if (lenEl) lenEl.textContent = `已输入 ${val.trim().length} 字`;
        const checkBtn = container.querySelector(`.btn-check-multi[data-qid="${qid}"]`);
        if (checkBtn) checkBtn.disabled = !val.trim();
        updateHeaderStats();
        renderHotspotsAndDock();
      });
    });

    container.querySelectorAll('.btn-check-multi').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.practiceChecked[btn.dataset.qid] = true;
        renderQuestionsForHotspot(hs);
        renderHotspotsAndDock();
      });
    });

    container.querySelectorAll('.btn-redo-question').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.dataset.qid;
        delete state.practiceChecked[qid];
        delete state.answers[qid];
        renderQuestionsForHotspot(hs);
        renderHotspotsAndDock();
      });
    });
  }

  function handleOptionClick(hs, qid, key) {
    if (state.mode === 'exam' && state.examSubmitted) return;
    const q = (hs.questions || []).find((item) => item.id === qid);
    if (!q) return;

    if (q.type === 'multiple') {
      if (state.mode === 'practice' && state.practiceChecked[qid]) {
        delete state.practiceChecked[qid];
      }
      const cur = (state.answers[qid] || []).slice();
      const pos = cur.indexOf(key);
      if (pos === -1) cur.push(key);
      else cur.splice(pos, 1);
      cur.sort();
      state.answers[qid] = cur;
    } else {
      state.answers[qid] = [key];
      if (state.mode === 'practice') {
        state.practiceChecked[qid] = true;
      }
    }

    renderQuestionsForHotspot(hs);
    updateHeaderStats();
    renderHotspotsAndDock();
  }

  function stopExamTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function updateTimerDisplay() {
    const chip = $('timer-chip');
    const text = $('timer-text');
    if (!chip || !text) return;

    if (state.mode !== 'exam') {
      chip.style.display = 'none';
      return;
    }

    chip.style.display = 'inline-flex';
    text.textContent = formatSeconds(state.remainingSeconds);
    chip.classList.remove('warning', 'danger');
    if (state.remainingSeconds <= 60) {
      chip.classList.add('danger');
    } else if (state.remainingSeconds <= 300) {
      chip.classList.add('warning');
    }
  }

  function startExamTimer(overrideRemainingSec) {
    stopExamTimer();
    const mins = (state.bank && state.bank.meta && Number(state.bank.meta.durationMinutes)) || 30;
    state.examDurationSeconds = mins * 60;
    state.remainingSeconds = (Number.isFinite(Number(overrideRemainingSec)) && Number(overrideRemainingSec) > 0)
      ? Math.min(state.examDurationSeconds, Math.floor(Number(overrideRemainingSec)))
      : state.examDurationSeconds;
    state.examStartTime = Date.now() - (state.examDurationSeconds - state.remainingSeconds) * 1000;
    state.overtimeTriggered = false;
    updateTimerDisplay();

    state.timerId = setInterval(() => {
      if (state.examSubmitted || state.mode !== 'exam') {
        stopExamTimer();
        return;
      }
      state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
      updateTimerDisplay();
      // 每 15 秒自动静默保存答题草稿，防止 80 人考场意外刷新/断网丢卷
      if (state.remainingSeconds % 15 === 0 && Object.keys(state.answers).length > 0) {
        const curExamId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
        if (adapter.saveExamDraft) {
          adapter.saveExamDraft(curExamId, state.answers, state.remainingSeconds);
        }
      }
      if (state.remainingSeconds <= 0) {
        stopExamTimer();
        state.overtimeTriggered = true;
        // 0 ~ 2500ms 随机错峰交卷，避免 80 人倒计时归零同一毫秒撞库
        const jitterMs = Math.floor(Math.random() * 2500);
        showToast('考试时间到！正在错峰自动提交试卷（触发超时规则 N1）...', 'warn');
        setTimeout(() => submitExamAndShowReport(true), jitterMs);
      }
    }, 1000);
  }

  function clearPracticeAndExamSessionData() {
    state.answers = {};
    state.practiceChecked = {};
    state.examSubmitted = false;
    state.lastReportResult = null;
    state.overtimeTriggered = false;
    state.activeHotspotId = null;
    state.wrongOnlyInReport = false;
    closeModal('question-modal');
    closeModal('report-modal');
  }

  function switchMode(newMode, force) {
    if (!force && !state.currentUser) {
      showToast('请先登录系统账号后再切换操作模式', 'warn');
      openLoginModal();
      return;
    }
    const perms = getRolePermissions();
    if (!force && !perms.modes.includes(newMode)) {
      showToast(`当前角色「${perms.role}」无权进入该模式，请切换授权账号`, 'warn');
      return;
    }
    if (state.mode === newMode) return;

    if (!force && state.mode === 'exam' && !state.examSubmitted && Object.keys(state.answers).length > 0) {
      const ok = global.confirm('当前处于正式考试模式且尚未交卷，切换模式将重置本次作答与倒计时，确认切换吗？');
      if (!ok) return;
    }

    stopExamTimer();
    state.mode = newMode;
    state.placingNewHotspot = false;
    $('panorama-stage').classList.remove('placing-new');
    $('btn-toggle-place-mode').textContent = '➕ 在图上新增热点';

    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === newMode);
    });

    $('edit-banner').classList.toggle('visible', newMode === 'edit');

    if (newMode === 'exam') {
      // 登录后进入正式考试模式时，彻底清空此前所有练习模式作答与校验数据
      clearPracticeAndExamSessionData();
      startExamTimer();
      $('stage-hint').innerHTML = '📝 <strong>正式考试中：</strong>此前练习记录已清空，请核查装置全部 8 个部位并作答，完成后点击右上角“提交试卷”。';
      showToast('已清空练习模式数据并进入正式考试模式，倒计时开始', 'info');
    } else if (newMode === 'edit') {
      updateTimerDisplay();
      $('stage-hint').innerHTML = '🛠️ <strong>标点与编辑模式：</strong>拖动图上任意圆标可调整位置，点击圆标可修改设备信息与习题。';
    } else {
      state.examSubmitted = false;
      updateTimerDisplay();
      $('stage-hint').innerHTML = '💡 <strong>练习演示模式：</strong>点击装置图上闪烁的热点圆标（或下方设备导航卡片），即答即评并查看标准解析。';
    }

    updateHeaderStats();
    renderHotspotsAndDock();
  }

  function resetCurrentProgress() {
    if (!state.currentUser) {
      showToast('请先登录系统账号', 'warn');
      openLoginModal();
      return;
    }
    if (isExamineeExamSealed()) {
      showToast('🔒 正式考试答卷已提交并封闭，不可重置重考', 'warn');
      return;
    }
    if (Object.keys(state.answers).length > 0) {
      const ok = global.confirm('确定要清空当前所有作答记录并重新开始吗？');
      if (!ok) return;
    }
    state.answers = {};
    state.practiceChecked = {};
    state.examSubmitted = false;
    state.lastReportResult = null;
    if (state.mode === 'exam') {
      startExamTimer();
    }
    renderHotspotsAndDock();
    showToast('已重置当前作答进度', 'info');
  }

  function evaluateExam() {
    const hotspots = (state.bank && state.bank.hotspots) || [];
    const totalScore = getTotalScore();
    let earnedScore = 0;
    let correctCount = 0;
    let totalCount = 0;
    let majorMissedCount = 0;
    let criticalConclusionWrong = false;
    const details = [];

    let hasSubjective = false;

    hotspots.forEach((hs) => {
      (hs.questions || []).forEach((q) => {
        totalCount++;
        const isSubjective = q.type === 'short_answer';
        if (isSubjective) hasSubjective = true;
        const userAns = state.answers[q.id] || [];
        const isCorrect = isSubjective ? false : arraysEqual(userAns, q.answer);
        if (isCorrect) {
          earnedScore += Number(q.score) || 0;
          correctCount++;
        } else if (!isSubjective) {
          if (q.isMajorDefect) majorMissedCount++;
          if (q.isCriticalConclusion) criticalConclusionWrong = true;
        }
        details.push({
          hotspotId: hs.id,
          hotspotCode: hs.code,
          hotspotName: hs.name,
          questionId: q.id,
          questionType: q.type || 'single',
          defectCode: q.defectCode || '',
          defectLevel: q.defectLevel || '',
          title: q.title,
          score: Number(q.score) || 0,
          earned: isCorrect ? (Number(q.score) || 0) : 0,
          isCorrect: isCorrect,
          userAnswer: userAns,
          correctAnswer: isSubjective ? [] : (q.answer || []),
          explanation: q.explanation || '',
          referenceStandard: q.referenceStandard || ''
        });
      });
    });

    const cfg = adapter.getConfig();
    const durationSeconds = state.mode === 'exam' && state.examStartTime
      ? Math.min(state.examDurationSeconds, Math.max(1, Math.round((Date.now() - state.examStartTime) / 1000)))
      : 0;

    // 表驱动否定项规则引擎（读取 WMPSES_否定项规则 表动态判定，不再写死）
    const vetoRules = (state.bank && Array.isArray(state.bank.vetoRules)) ? state.bank.vetoRules : [];
    const triggeredRules = [];
    const vetoReasons = [];
    let hasZeroPenalty = false;

    vetoRules.forEach((rule) => {
      if (!rule.isEnabled) return;
      const cond = String(rule.conditionType || '').toUpperCase();
      const threshold = Number(rule.thresholdValue != null ? rule.thresholdValue : 1);
      const targetRef = String(rule.targetRef || '').trim();
      let hit = false;

      if (cond === 'OVERTIME') {
        hit = Boolean(state.overtimeTriggered) || (state.mode === 'exam' && durationSeconds > threshold * 60);
      } else if (cond === 'CONCLUSION_WRONG') {
        const targetDetail = targetRef
          ? details.find((d) => d.questionId === targetRef)
          : null;
        if (targetDetail) {
          const answered = targetDetail.userAnswer && targetDetail.userAnswer.length > 0;
          hit = state.mode === 'exam' ? !targetDetail.isCorrect : (answered && !targetDetail.isCorrect);
        } else {
          hit = criticalConclusionWrong;
        }
      } else if (cond === 'MAJOR_MISS_COUNT') {
        const missedInPractice = details.filter((d) => {
          const qObj = hotspots.flatMap((h) => h.questions || []).find((qq) => qq.id === d.questionId);
          const isMajor = qObj && qObj.isMajorDefect;
          if (!isMajor) return false;
          return state.mode === 'exam'
            ? !d.isCorrect
            : (d.userAnswer && d.userAnswer.length > 0 && !d.isCorrect);
        }).length;
        hit = missedInPractice >= threshold;
      } else if (cond === 'QUESTION_WRONG') {
        const targetDetail = details.find((d) => d.questionId === targetRef);
        if (targetDetail) {
          const answered = targetDetail.userAnswer && targetDetail.userAnswer.length > 0;
          hit = state.mode === 'exam' ? !targetDetail.isCorrect : (answered && !targetDetail.isCorrect);
        }
      }

      if (hit) {
        const msg = String(rule.alertMessage || `${rule.code}：${rule.name}`).replace('{threshold}', String(threshold));
        triggeredRules.push({
          id: rule.id,
          code: rule.code,
          name: rule.name,
          penaltyAction: rule.penaltyAction || 'ZERO_SCORE',
          message: msg
        });
        vetoReasons.push(msg);
        if ((rule.penaltyAction || 'ZERO_SCORE') === 'ZERO_SCORE') {
          hasZeroPenalty = true;
        }
      }
    });

    const vetoTriggered = vetoReasons.length > 0;
    const effectiveScore = hasZeroPenalty ? 0 : earnedScore;
    const passScore = (state.bank && state.bank.meta && Number(state.bank.meta.passScore)) || 30;
    const passed = effectiveScore >= passScore && !hasZeroPenalty;

    const curUser = state.currentUser;
    const boundUserId = (curUser && curUser.pk_UserID) || cfg.student.userId || '';
    const boundStudentName = (curUser && curUser.FullName) || cfg.student.name || '现场考生';
    const boundExamineeId = (curUser && curUser.UserCode) || cfg.student.examineeId || '';

    return {
      examId: (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1',
      userId: boundUserId,
      studentName: boundStudentName,
      examineeId: boundExamineeId,
      examCode: (state.bank && state.bank.meta && state.bank.meta.examCode) || '1.1.1',
      mode: state.mode,
      earnedScore: earnedScore,
      objectiveScore: earnedScore,
      subjectiveScore: 0,
      effectiveScore: effectiveScore,
      hasSubjective: hasSubjective,
      reviewStatus: hasSubjective ? '待阅卷' : '自动已评',
      hasZeroPenalty: hasZeroPenalty,
      totalScore: totalScore,
      correctCount: correctCount,
      totalCount: totalCount,
      accuracy: totalCount ? Math.round((correctCount / totalCount) * 100) : 0,
      passed: passed,
      vetoTriggered: vetoTriggered,
      vetoReason: vetoReasons.join('；'),
      vetoReasons: vetoReasons,
      triggeredRules: triggeredRules,
      majorMissedCount: majorMissedCount,
      durationSeconds: durationSeconds,
      submittedAt: new Date().toISOString(),
      details: details
    };
  }

  async function submitExamAndShowReport(autoSubmit) {
    if (isExamineeExamSealed()) {
      showToast('🔒 您的正式考试答卷已提交并封闭，不可查看成绩单或对错解析', 'info');
      return;
    }

    if (state.mode === 'exam' && !state.examSubmitted && !autoSubmit) {
      const total = getTotalQuestionCount();
      const answered = Object.keys(state.answers).filter((k) => (state.answers[k] || []).length > 0).length;
      if (answered < total) {
        const confirmSubmit = global.confirm(`您还有 ${total - answered} 道题未作答，确认现在提交试卷吗？`);
        if (!confirmSubmit) return;
      }
    }

    if (state.mode === 'exam' && !state.examSubmitted) {
      state.examSubmitted = true;
      stopExamTimer();
      closeModal('question-modal');
      const result = evaluateExam();
      state.lastReportResult = result;
      const sync = await adapter.submitExamResult(result);
      if (adapter.clearExamDraft) {
        adapter.clearExamDraft(result.examId);
      }

      if (isExamineeRole()) {
        // 考生正式考试交卷后立即封闭答卷，不展示成绩单与任何对错/解析
        $('stage-hint').innerHTML = '🔒 <strong>正式考试答卷已提交并封闭：</strong>成绩与作答记录已归档至成绩表，考场模式下不可查看分数与对错，请等待监考老师核验。';
        syncExamineeSceneSelectUi();
        renderHotspotsAndDock();
        showToast(`✅ 交卷成功！答卷已封闭，「${result.studentName}」成绩已写入成绩表`, 'success');
        return;
      }

      renderReportModal(result, sync.syncMessage);
      renderHotspotsAndDock();
      openModal('report-modal');
      showToast(`已将「${result.studentName}」(${result.examineeId || result.userId || '现场考生'}) 成绩写入成绩表`, 'success');
      return;
    }

    // 练习模式汇总，或非考生角色已交卷再次查看成绩单
    const result = state.lastReportResult && state.examSubmitted
      ? state.lastReportResult
      : evaluateExam();
    renderReportModal(result, state.mode === 'practice' ? '当前为练习演示模式实时统计汇总（未锁定作答）' : '已提交成绩单');
    openModal('report-modal');
  }

  function renderReportModal(result, syncMessage) {
    const body = $('report-modal-body');
    $('rm-sync-status').textContent = syncMessage || '';
    const onlyWrong = state.wrongOnlyInReport;
    $('btn-toggle-wrong-only').textContent = onlyWrong ? '显示全部题目' : '仅看错题';

    const vetoHtml = result.vetoTriggered
      ? `<div class="veto-alert triggered">
           <strong>⚠️ 触发《WMPSES_否定项规则》一票否决条款（${result.hasZeroPenalty ? '最终有效分已判 0 分' : '仅警告不判零'}）：</strong>
           <ul style="margin:6px 0 0 18px;padding:0;">
             ${result.vetoReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
           </ul>
         </div>`
      : `<div class="veto-alert safe">
           <strong>✅ 未触发《WMPSES_否定项规则》一票否决红线</strong>（按当前数据库启用的规则核验通过）。
         </div>`;

    const shownScore = result.effectiveScore != null ? result.effectiveScore : result.earnedScore;
    const scoreSubText = result.hasZeroPenalty
      ? `有效得分（卷面原分 ${result.earnedScore} 分）`
      : '卷面得分';

    const filteredDetails = onlyWrong ? result.details.filter((d) => !d.isCorrect) : result.details;
    const reviewHtml = filteredDetails.length
      ? filteredDetails.map((item, idx) => `
          <div class="report-review-item ${item.isCorrect ? '' : 'wrong-item'}">
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <strong>${idx + 1}. [${escapeHtml(item.hotspotCode)} ${escapeHtml(item.hotspotName)}] ${item.defectCode ? `(${escapeHtml(item.defectCode)})` : ''}</strong>
              <span style="font-weight:700;color:${item.isCorrect ? '#4ade80' : '#f87171'};">
                ${item.isCorrect ? `✅ 正确 +${item.earned}分` : `❌ 错误 0/${item.score}分`}
              </span>
            </div>
            <div style="margin-bottom:6px;color:#f8fafc;">${escapeHtml(item.title)}</div>
            <div style="font-size:12.5px;color:#cbd5e1;">
              您的作答：<strong style="color:${item.isCorrect ? '#86efac' : '#fca5a5'};">${item.userAnswer.length ? escapeHtml(item.userAnswer.join('、')) : '未作答'}</strong>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              标准答案：<strong style="color:#4ade80;">${escapeHtml(item.correctAnswer.join('、'))}</strong>
            </div>
            <div style="margin-top:6px;font-size:12.5px;color:#94a3b8;">
              解析：${escapeHtml(item.explanation)}
            </div>
          </div>
        `).join('')
      : `<div style="text-align:center;padding:24px;color:#86efac;">🎉 没有错题，全部回答正确！</div>`;

    body.innerHTML = `
      <div class="report-hero">
        <div class="report-stat">
          <div class="report-stat-val ${result.passed ? 'pass' : 'fail'}">${shownScore} / ${result.totalScore}</div>
          <div class="report-stat-label">${scoreSubText}</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-val">${result.correctCount} / ${result.totalCount}</div>
          <div class="report-stat-label">答对题数（正确率 ${result.accuracy}%）</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-val">${result.durationSeconds ? formatSeconds(result.durationSeconds) : '--:--'}</div>
          <div class="report-stat-label">考试耗时</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-val ${result.passed ? 'pass' : 'fail'}">${result.passed ? '合格' : '不合格'}</div>
          <div class="report-stat-label">综合评定（${result.studentName}）</div>
        </div>
      </div>
      ${vetoHtml}
      <h3 style="margin:10px 0;font-size:14px;color:#7dd3fc;">逐题作答复盘明细</h3>
      ${reviewHtml}
    `;
  }

  // ==========================================
  // 教师编辑 / 标点编辑器
  // ==========================================
  function openEditorModal(hotspotId) {
    const hs = (state.bank.hotspots || []).find((h) => h.id === hotspotId);
    if (!hs) return;
    state.editingHotspotDraft = structuredClone(hs);
    state.editingPoolDraft = structuredClone((state.bank && Array.isArray(state.bank.unassignedQuestions)) ? state.bank.unassignedQuestions : []);
    state.editorPickerOpen = false;
    state.editorPickerKeyword = '';
    renderEditorModalBody();
    openModal('editor-modal');
  }

  function renderEditorModalBody() {
    const hs = state.editingHotspotDraft;
    if (!hs) return;
    const body = $('editor-modal-body');

    const widgetOptionsHtml = widgets.WIDGET_OPTIONS.map((w) =>
      `<option value="${escapeHtml(w.value)}" ${hs.widgetType === w.value ? 'selected' : ''}>${escapeHtml(w.label)}</option>`
    ).join('');

    const questionsHtml = (hs.questions || []).map((q, qIdx) => {
      const optsHtml = (q.options || []).map((opt, oIdx) => {
        const isAns = (q.answer || []).includes(opt.key);
        return `
          <div class="editor-opt-row">
            <label style="display:flex;align-items:center;gap:4px;white-space:nowrap;cursor:pointer;">
              <input type="checkbox" class="ed-opt-ans" data-qidx="${qIdx}" data-key="${escapeHtml(opt.key)}" ${isAns ? 'checked' : ''}>
              <span>${escapeHtml(opt.key)}</span>
            </label>
            <input type="text" class="form-control ed-opt-text" data-qidx="${qIdx}" data-oidx="${oIdx}" value="${escapeHtml(opt.text)}">
            <button type="button" class="btn btn-danger btn-sm ed-del-opt" data-qidx="${qIdx}" data-oidx="${oIdx}">删</button>
          </div>
        `;
      }).join('');

      return `
        <div class="editor-question-box">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">
            <strong>题目 #${qIdx + 1}</strong>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn btn-ghost btn-sm ed-unlink-q" data-qidx="${qIdx}" title="取消与本热点的关联，保留题目并移回独立题库池">🔓 移回题库池</button>
              <button type="button" class="btn btn-danger btn-sm ed-del-q" data-qidx="${qIdx}">删除本题</button>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <label for="ed-q-type-${qIdx}">题型</label>
              <select id="ed-q-type-${qIdx}" class="form-control ed-q-type" data-qidx="${qIdx}">
                <option value="single" ${q.type === 'single' ? 'selected' : ''}>单选题</option>
                <option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>多选题</option>
                <option value="judge" ${q.type === 'judge' ? 'selected' : ''}>判断题</option>
                <option value="short_answer" ${q.type === 'short_answer' ? 'selected' : ''}>文字简答题（考评员手工阅卷）</option>
              </select>
            </div>
            <div class="form-field">
              <label for="ed-q-score-${qIdx}">分值</label>
              <input type="number" id="ed-q-score-${qIdx}" min="1" max="50" required class="form-control ed-q-score" data-qidx="${qIdx}" data-error="ed-q-score-err-${qIdx}" value="${Number(q.score) || 2}">
              <div id="ed-q-score-err-${qIdx}" class="field-error-msg"><span role="img" aria-label="错误">⚠️</span> 请输入 1–50 之间的分值。</div>
            </div>
            <div class="form-field">
              <label for="ed-q-defect-code-${qIdx}">缺陷编号（如 D1 / G1）</label>
              <input type="text" id="ed-q-defect-code-${qIdx}" class="form-control ed-q-defect-code" data-qidx="${qIdx}" value="${escapeHtml(q.defectCode || '')}">
            </div>
            <div class="form-field">
              <label for="ed-q-defect-level-${qIdx}">缺陷级别</label>
              <select id="ed-q-defect-level-${qIdx}" class="form-control ed-q-defect-level" data-qidx="${qIdx}">
                <option value="major" ${q.defectLevel === 'major' ? 'selected' : ''}>重大缺陷</option>
                <option value="general" ${q.defectLevel === 'general' ? 'selected' : ''}>一般缺陷</option>
                <option value="interference" ${q.defectLevel === 'interference' ? 'selected' : ''}>正常干扰项</option>
                <option value="safety" ${q.defectLevel === 'safety' ? 'selected' : ''}>安全红线</option>
                <option value="critical" ${q.defectLevel === 'critical' ? 'selected' : ''}>总体验收结论</option>
              </select>
            </div>
          </div>
          <div class="form-field">
            <label for="ed-q-title-${qIdx}">题干内容</label>
            <textarea id="ed-q-title-${qIdx}" required class="form-control ed-q-title" data-qidx="${qIdx}" data-error="ed-q-title-err-${qIdx}">${escapeHtml(q.title)}</textarea>
            <div id="ed-q-title-err-${qIdx}" class="field-error-msg"><span role="img" aria-label="错误">⚠️</span> 请填写题干内容。</div>
          </div>
          ${q.type === 'short_answer' ? `
          <div style="padding:9px 12px;border-radius:8px;background:rgba(56,189,248,0.1);border:1px dashed rgba(56,189,248,0.4);font-size:12px;color:#7dd3fc;margin-bottom:10px;">
            ✍️ 文字简答题无需配置客观选项；请在下方「参考评分要点」填写评分细则，正式考试交卷后由「考评员」在成绩表中手工阅卷打分。
          </div>
          ` : `
          <div class="form-field">
            <label>选项列表（勾选左侧复选框表示标准答案）</label>
            ${optsHtml}
            <div>
              <button type="button" class="btn btn-ghost btn-sm ed-add-opt" data-qidx="${qIdx}">➕ 添加选项</button>
            </div>
          </div>
          `}
          <div class="form-grid">
            <div class="form-field">
              <label>标准依据</label>
              <input type="text" class="form-control ed-q-ref" data-qidx="${qIdx}" value="${escapeHtml(q.referenceStandard || '')}">
            </div>
            <div class="form-field">
              <label>${q.type === 'short_answer' ? '参考答案 / 评分要点（供考评员手工打分）' : '答案解析'}</label>
              <textarea class="form-control ed-q-exp" data-qidx="${qIdx}">${escapeHtml(q.explanation || '')}</textarea>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const p3 = hs.pos3d || (scene3d ? scene3d.inferPos3DFrom2D(hs) : { x: 0, y: -2, z: 3 });

    body.innerHTML = `
      <form id="editor-hotspot-form">
      <div class="form-grid">
        <div class="form-field">
          <label for="ed-hs-code">设备位号</label>
          <input type="text" id="ed-hs-code" class="form-control" required data-error="ed-hs-code-err" value="${escapeHtml(hs.code)}">
          <div id="ed-hs-code-err" class="field-error-msg"><span role="img" aria-label="错误">⚠️</span> 请填写设备位号。</div>
        </div>
        <div class="form-field">
          <label for="ed-hs-name">设备部位名称</label>
          <input type="text" id="ed-hs-name" class="form-control" required data-error="ed-hs-name-err" value="${escapeHtml(hs.name)}">
          <div id="ed-hs-name-err" class="field-error-msg"><span role="img" aria-label="错误">⚠️</span> 请填写设备部位名称。</div>
        </div>
        <div class="form-field">
          <label for="ed-hs-cat">所属验收方面</label>
          <input type="text" id="ed-hs-cat" class="form-control" value="${escapeHtml(hs.category)}">
        </div>
        <div class="form-field">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;">
            <label for="ed-hs-widget" style="margin:0;">顶部工况可视化卡片</label>
            <button type="button" class="btn btn-warning btn-sm" id="btn-ed-open-tpl-modal" style="padding:2px 8px;font-size:11px;">➕ 新增/管理模板</button>
          </div>
          <select id="ed-hs-widget" class="form-control">${widgetOptionsHtml}</select>
        </div>
        <div class="form-field">
          <label>2D 坐标 X% / Y%</label>
          <div style="display:flex;gap:6px;">
            <input type="number" step="0.1" min="2" max="98" id="ed-hs-x" class="form-control" value="${hs.x}" title="2D X坐标百分比">
            <input type="number" step="0.1" min="4" max="96" id="ed-hs-y" class="form-control" value="${hs.y}" title="2D Y坐标百分比">
          </div>
        </div>
        <div class="form-field">
          <label>3D 空间坐标 X / Y / 高度 Z (m)</label>
          <div style="display:flex;gap:6px;">
            <input type="number" step="0.2" min="-25" max="25" id="ed-hs-x3d" class="form-control" value="${p3.x}" title="3D 横向坐标 X (m)">
            <input type="number" step="0.2" min="-20" max="20" id="ed-hs-y3d" class="form-control" value="${p3.y}" title="3D 纵深坐标 Y (m)">
            <input type="number" step="0.2" min="0.5" max="18" id="ed-hs-z3d" class="form-control" value="${p3.z}" title="3D 高度坐标 Z (m)">
          </div>
        </div>
      </div>
      <div class="form-field">
        <label>现场工况描述（通用卡展示文本）</label>
        <input type="text" id="ed-hs-summary" class="form-control" value="${escapeHtml(hs.sceneSummary || '')}">
      </div>
      <div style="padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid rgba(56,189,248,0.28);margin-bottom:12px;">
        <div style="font-size:12.5px;font-weight:700;color:#7dd3fc;margin-bottom:8px;">🎛️ 顶部 SVG 仪表工况参数设定（存入 SQLite WMPSES_设备热点）</div>
        <div id="ed-widget-params-container" class="form-grid">${renderEditorWidgetParamsHtml(hs)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 10px;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;font-size:14px;color:#7dd3fc;">关联习题 (${(hs.questions || []).length} 题)</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-warning btn-sm" id="btn-ed-toggle-picker">🔗 从题库关联已有题目 (${(state.editingPoolDraft || []).length} 题待关联)</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-ed-add-question">➕ 新建习题</button>
        </div>
      </div>
      ${state.editorPickerOpen ? renderEditorBankPickerHtml(hs) : ''}
      ${questionsHtml}
      </form>
    `;

    const edForm = $('editor-hotspot-form');
    if (edForm) {
      edForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if ($('btn-save-hotspot-edit')) $('btn-save-hotspot-edit').click();
      });
    }

    bindEditorDraftEvents();
  }

  function renderEditorBankPickerHtml(curHs) {
    const pool = Array.isArray(state.editingPoolDraft) ? state.editingPoolDraft : [];
    const kw = String(state.editorPickerKeyword || '').trim().toLowerCase();
    const otherHotspots = (state.bank && Array.isArray(state.bank.hotspots))
      ? state.bank.hotspots.filter((h) => h.id !== curHs.id)
      : [];
    const existingIds = new Set((curHs.questions || []).map((q) => q.id));

    const matchKw = (q, srcLabel) => {
      if (!kw) return true;
      return `${srcLabel} ${q.title || ''} ${q.defectCode || ''} ${q.referenceStandard || ''}`.toLowerCase().includes(kw);
    };

    const poolItems = pool.filter((q) => matchKw(q, '独立题库池'));
    const otherItems = [];
    otherHotspots.forEach((h) => {
      (h.questions || []).forEach((q) => {
        if (!existingIds.has(q.id) && matchKw(q, `${h.code} ${h.name}`)) {
          otherItems.push({ hs: h, q: q });
        }
      });
    });

    const poolRows = poolItems.length
      ? poolItems.map((q) => `
          <label style="display:flex;align-items:flex-start;gap:8px;padding:7px 9px;border-radius:6px;background:#162033;margin-bottom:6px;cursor:pointer;font-size:12px;">
            <input type="checkbox" class="ed-pick-pool-cb" value="${escapeHtml(q.id)}" style="margin-top:3px;">
            <div style="flex:1;">
              <div>
                <span class="q-type-badge">${escapeHtml(getTypeLabel(q.type))}</span>
                <span class="q-score-badge" style="margin-left:4px;">${q.score} 分</span>
                <span style="color:#fde68a;margin-left:4px;font-size:11px;">📌 独立题库池（关联后移入本热点）</span>
              </div>
              <div style="color:#f8fafc;margin-top:3px;">${escapeHtml(q.title)}</div>
            </div>
          </label>
        `).join('')
      : '<div style="font-size:12px;color:#94a3b8;padding:8px 0;">暂无未关联的独立题库池题目（可在「📝 习题总表」中先单独设计题目并选「暂不关联热点」）。</div>';

    const otherRows = otherItems.length
      ? otherItems.map(({ hs, q }) => `
          <label style="display:flex;align-items:flex-start;gap:8px;padding:7px 9px;border-radius:6px;background:#0f172a;margin-bottom:5px;cursor:pointer;font-size:12px;">
            <input type="checkbox" class="ed-pick-copy-cb" data-hsid="${escapeHtml(hs.id)}" value="${escapeHtml(q.id)}" style="margin-top:3px;">
            <div style="flex:1;">
              <div>
                <span class="q-type-badge">${escapeHtml(getTypeLabel(q.type))}</span>
                <span class="q-score-badge" style="margin-left:4px;">${q.score} 分</span>
                <span style="color:#94a3b8;margin-left:4px;font-size:11px;">来自 [${escapeHtml(hs.code)}] ${escapeHtml(hs.name)}（复制一份到本热点）</span>
              </div>
              <div style="color:#cbd5e1;margin-top:3px;">${escapeHtml(q.title)}</div>
            </div>
          </label>
        `).join('')
      : '<div style="font-size:12px;color:#94a3b8;padding:6px 0;">无匹配的其他部位题目</div>';

    return `
      <div style="padding:12px 14px;border-radius:10px;background:#090e1a;border:1px solid rgba(245,158,11,0.45);margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <strong style="font-size:13px;color:#fde68a;">🔗 从已设计题库选择并关联到「${escapeHtml(curHs.name)}」</strong>
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="search" id="ed-picker-search" class="form-control" style="width:200px;padding:4px 8px;font-size:12px;" placeholder="搜索题干 / 缺陷号…" value="${escapeHtml(state.editorPickerKeyword || '')}">
            <button type="button" class="btn btn-success btn-sm" id="btn-ed-confirm-pick">✅ 确认关联所选题目</button>
          </div>
        </div>
        <div style="font-size:12px;color:#7dd3fc;font-weight:700;margin-bottom:5px;">一、独立题库池（未关联热点的待分配题目：${poolItems.length} 题）</div>
        <div style="max-height:170px;overflow:auto;margin-bottom:8px;">${poolRows}</div>
        <details>
          <summary style="cursor:pointer;font-size:12px;color:#94a3b8;">二、或从其他热点复制复用已有题目（${otherItems.length} 题）</summary>
          <div style="max-height:150px;overflow:auto;margin-top:6px;">${otherRows}</div>
        </details>
      </div>
    `;
  }

  function renderEditorWidgetParamsHtml(hs) {
    const wType = (hs && hs.widgetType) || 'generic';
    const schema = (widgets.WIDGET_PARAM_SCHEMAS && widgets.WIDGET_PARAM_SCHEMAS[wType]) || widgets.WIDGET_PARAM_SCHEMAS.generic;
    const params = widgets.resolveParams(wType, hs);
    return schema.map((f) => {
      const val = params[f.key];
      const unitHint = f.unit ? ` (${f.unit})` : '';
      if (f.type === 'select') {
        return `
          <div class="form-field" style="margin-bottom:0;">
            <label>${escapeHtml(f.label)}</label>
            <select class="form-control ed-wp-input" data-wpkey="${escapeHtml(f.key)}">
              ${(f.options || []).map((opt) => `<option value="${escapeHtml(opt)}" ${val === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
            </select>
          </div>
        `;
      }
      if (f.type === 'number') {
        return `
          <div class="form-field" style="margin-bottom:0;">
            <label>${escapeHtml(f.label)}${escapeHtml(unitHint)}</label>
            <input type="number" step="${f.step}" min="${f.min}" max="${f.max}" class="form-control ed-wp-input" data-wpkey="${escapeHtml(f.key)}" value="${escapeHtml(val)}">
          </div>
        `;
      }
      return `
        <div class="form-field" style="margin-bottom:0;">
          <label>${escapeHtml(f.label)}</label>
          <input type="text" class="form-control ed-wp-input" data-wpkey="${escapeHtml(f.key)}" value="${escapeHtml(val)}">
        </div>
      `;
    }).join('');
  }

  function syncDraftFromDom() {
    const hs = state.editingHotspotDraft;
    if (!hs) return;
    hs.code = $('ed-hs-code').value.trim() || hs.code;
    hs.name = $('ed-hs-name').value.trim() || hs.name;
    hs.category = $('ed-hs-cat').value.trim() || hs.category;
    hs.widgetType = $('ed-hs-widget').value;
    hs.x = Math.min(98, Math.max(2, Number($('ed-hs-x').value) || hs.x));
    hs.y = Math.min(96, Math.max(4, Number($('ed-hs-y').value) || hs.y));
    const curP3 = hs.pos3d || (scene3d ? scene3d.inferPos3DFrom2D(hs) : { x: 0, y: -2, z: 3 });
    const nx3 = $('ed-hs-x3d') ? Number($('ed-hs-x3d').value) : curP3.x;
    const ny3 = $('ed-hs-y3d') ? Number($('ed-hs-y3d').value) : curP3.y;
    const nz3 = $('ed-hs-z3d') ? Number($('ed-hs-z3d').value) : curP3.z;
    hs.pos3d = {
      x: Number.isFinite(nx3) ? Math.round(nx3 * 100) / 100 : curP3.x,
      y: Number.isFinite(ny3) ? Math.round(ny3 * 100) / 100 : curP3.y,
      z: Number.isFinite(nz3) ? Math.round(nz3 * 100) / 100 : curP3.z
    };
    hs.sceneSummary = $('ed-hs-summary').value.trim();

    const wpSchema = (widgets.WIDGET_PARAM_SCHEMAS && widgets.WIDGET_PARAM_SCHEMAS[hs.widgetType]) || widgets.WIDGET_PARAM_SCHEMAS.generic;
    const nextWp = {};
    document.querySelectorAll('.ed-wp-input').forEach((el) => {
      const k = el.dataset.wpkey;
      const def = wpSchema.find((s) => s.key === k);
      nextWp[k] = def && def.type === 'number' ? Number(el.value) : el.value;
    });
    if (Object.keys(nextWp).length) {
      nextWp._pos3d = hs.pos3d;
      hs.widgetParams = nextWp;
    } else if (hs.widgetParams && typeof hs.widgetParams === 'object') {
      hs.widgetParams._pos3d = hs.pos3d;
    }

    document.querySelectorAll('.ed-q-type').forEach((el) => {
      const idx = Number(el.dataset.qidx);
      hs.questions[idx].type = el.value;
    });
    document.querySelectorAll('.ed-q-score').forEach((el) => {
      const idx = Number(el.dataset.qidx);
      hs.questions[idx].score = Math.max(1, Number(el.value) || 2);
    });
    document.querySelectorAll('.ed-q-defect-code').forEach((el) => {
      const idx = Number(el.dataset.qidx);
      hs.questions[idx].defectCode = el.value.trim();
    });
    document.querySelectorAll('.ed-q-defect-level').forEach((el) => {
      const idx = Number(el.dataset.qidx);
      const lvl = el.value;
      hs.questions[idx].defectLevel = lvl;
      hs.questions[idx].isMajorDefect = lvl === 'major';
      hs.questions[idx].isCriticalConclusion = lvl === 'critical';
    });
    document.querySelectorAll('.ed-q-title').forEach((el) => {
      const idx = Number(el.dataset.qidx);
      hs.questions[idx].title = el.value;
    });
    document.querySelectorAll('.ed-q-ref').forEach((el) => {
      const idx = Number(el.dataset.qidx);
      hs.questions[idx].referenceStandard = el.value;
    });
    document.querySelectorAll('.ed-q-exp').forEach((el) => {
      const idx = Number(el.dataset.qidx);
      hs.questions[idx].explanation = el.value;
    });
    document.querySelectorAll('.ed-opt-text').forEach((el) => {
      const qIdx = Number(el.dataset.qidx);
      const oIdx = Number(el.dataset.oidx);
      hs.questions[qIdx].options[oIdx].text = el.value;
    });
    hs.questions.forEach((q, qIdx) => {
      if (q.type === 'short_answer') {
        q.answer = [];
        return;
      }
      const checkedKeys = [];
      document.querySelectorAll(`.ed-opt-ans[data-qidx="${qIdx}"]`).forEach((cb) => {
        if (cb.checked) checkedKeys.push(cb.dataset.key);
      });
      q.answer = checkedKeys.length ? checkedKeys : [q.options[0] ? q.options[0].key : 'A'];
    });
  }

  function bindEditorDraftEvents() {
    const openTplBtn = $('btn-ed-open-tpl-modal');
    if (openTplBtn) {
      openTplBtn.addEventListener('click', () => {
        syncDraftFromDom();
        state.templateOpenedFromEditor = true;
        openTemplateModal();
      });
    }

    const widgetSel = $('ed-hs-widget');
    if (widgetSel) {
      widgetSel.addEventListener('change', () => {
        const nextType = widgetSel.value;
        state.editingHotspotDraft.widgetType = nextType;
        const nextDef = widgets.getDefaultParams(nextType);
        if (state.editingHotspotDraft.pos3d) nextDef._pos3d = state.editingHotspotDraft.pos3d;
        state.editingHotspotDraft.widgetParams = nextDef;
        const wpBox = $('ed-widget-params-container');
        if (wpBox) {
          wpBox.innerHTML = renderEditorWidgetParamsHtml(state.editingHotspotDraft);
        }
      });
    }

    $('btn-ed-add-question').addEventListener('click', () => {
      syncDraftFromDom();
      state.editingHotspotDraft.questions.push({
        id: 'q-' + Date.now(),
        defectCode: '',
        defectLevel: 'general',
        isMajorDefect: false,
        type: 'single',
        score: 2,
        title: '请输入新题目题干...',
        options: [
          { key: 'A', text: '合格' },
          { key: 'B', text: '不合格' }
        ],
        answer: ['A'],
        referenceStandard: '',
        explanation: '请输入标准解析...'
      });
      renderEditorModalBody();
    });

    document.querySelectorAll('.ed-q-type').forEach((sel) => {
      sel.addEventListener('change', () => {
        syncDraftFromDom();
        renderEditorModalBody();
      });
    });

    const togglePickerBtn = $('btn-ed-toggle-picker');
    if (togglePickerBtn) {
      togglePickerBtn.addEventListener('click', () => {
        syncDraftFromDom();
        state.editorPickerOpen = !state.editorPickerOpen;
        renderEditorModalBody();
      });
    }

    const pickerSearch = $('ed-picker-search');
    if (pickerSearch) {
      let composing = false;
      const applySearch = () => {
        syncDraftFromDom();
        state.editorPickerKeyword = pickerSearch.value;
        renderEditorModalBody();
        const nextInp = $('ed-picker-search');
        if (nextInp) {
          nextInp.focus();
          nextInp.setSelectionRange(nextInp.value.length, nextInp.value.length);
        }
      };
      pickerSearch.addEventListener('compositionstart', () => { composing = true; });
      pickerSearch.addEventListener('compositionend', () => { composing = false; applySearch(); });
      pickerSearch.addEventListener('input', (e) => {
        if (composing || (e && e.isComposing)) return;
        applySearch();
      });
    }

    const confirmPickBtn = $('btn-ed-confirm-pick');
    if (confirmPickBtn) {
      confirmPickBtn.addEventListener('click', () => {
        syncDraftFromDom();
        const selectedPoolIds = new Set();
        document.querySelectorAll('.ed-pick-pool-cb:checked').forEach((cb) => selectedPoolIds.add(cb.value));
        const copySpecs = [];
        document.querySelectorAll('.ed-pick-copy-cb:checked').forEach((cb) => {
          copySpecs.push({ hsId: cb.dataset.hsid, qId: cb.value });
        });
        if (!selectedPoolIds.size && !copySpecs.length) {
          showToast('请先勾选至少一道要关联的题目', 'warn');
          return;
        }
        let added = 0;
        if (selectedPoolIds.size) {
          const remain = [];
          (state.editingPoolDraft || []).forEach((q) => {
            if (selectedPoolIds.has(q.id)) {
              state.editingHotspotDraft.questions.push(structuredClone(q));
              added++;
            } else {
              remain.push(q);
            }
          });
          state.editingPoolDraft = remain;
        }
        if (copySpecs.length) {
          const nowTs = Date.now();
          copySpecs.forEach((spec, idx) => {
            const srcHs = (state.bank.hotspots || []).find((h) => h.id === spec.hsId);
            const srcQ = srcHs && (srcHs.questions || []).find((q) => q.id === spec.qId);
            if (srcQ) {
              const cloned = structuredClone(srcQ);
              cloned.id = `q-ref-${nowTs}-${idx}`;
              state.editingHotspotDraft.questions.push(cloned);
              added++;
            }
          });
        }
        state.editorPickerOpen = false;
        renderEditorModalBody();
        showToast(`已关联 ${added} 道题目到本热点，点击下方「保存热点与习题」即可生效`, 'success');
      });
    }

    document.querySelectorAll('.ed-unlink-q').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncDraftFromDom();
        const idx = Number(btn.dataset.qidx);
        const removed = state.editingHotspotDraft.questions.splice(idx, 1)[0];
        if (removed) {
          state.editingPoolDraft = state.editingPoolDraft || [];
          state.editingPoolDraft.push(removed);
          showToast('已将该题移回独立题库池（保存热点后生效）', 'info');
        }
        renderEditorModalBody();
      });
    });

    document.querySelectorAll('.ed-del-q').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncDraftFromDom();
        state.editingHotspotDraft.questions.splice(Number(btn.dataset.qidx), 1);
        renderEditorModalBody();
      });
    });

    document.querySelectorAll('.ed-add-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncDraftFromDom();
        const q = state.editingHotspotDraft.questions[Number(btn.dataset.qidx)];
        const nextKey = String.fromCharCode(65 + q.options.length);
        q.options.push({ key: nextKey, text: `选项 ${nextKey}` });
        renderEditorModalBody();
      });
    });

    document.querySelectorAll('.ed-del-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncDraftFromDom();
        const q = state.editingHotspotDraft.questions[Number(btn.dataset.qidx)];
        if (q.options.length <= 2) {
          showToast('每道题至少保留 2 个选项', 'warn');
          return;
        }
        q.options.splice(Number(btn.dataset.oidx), 1);
        q.options.forEach((opt, i) => { opt.key = String.fromCharCode(65 + i); });
        renderEditorModalBody();
      });
    });
  }

  async function persistEditToBackend(prefixMsg, actionType) {
    const res = await adapter.saveQuestionBank(state.bank, {
      actionType: actionType || '编辑更新题库',
      changeSummary: prefixMsg || '手动保存同步题库与热点配置'
    });
    state.bank = res.bank;
    if (Array.isArray(res.changeLogs)) {
      state.changeLogs = res.changeLogs;
    }
    if (res.sqliteSaved) {
      $('data-source-badge').textContent = '· ' + (adapter.getBackendLabel ? adapter.getBackendLabel() : 'SQLite 数据库 (db/wmpses.db)');
    }
    syncAllSimParamsTo3D();
    renderPanoramaImage();
    renderHotspotsAndDock();
    showToast(prefixMsg ? `${prefixMsg} · ${res.syncMessage}` : res.syncMessage, 'success');
  }

  function renderSqliteTableViewerHtml(snapshot) {
    if (!snapshot) {
      return '<div style="padding:18px;color:#94a3b8;">正在从本地 SQLite 服务读取表数据...</div>';
    }
    if (snapshot.error) {
      return `
        <div style="padding:16px;border-radius:10px;background:rgba(180,83,9,0.2);border:1px solid rgba(245,158,11,0.5);color:#fde68a;">
          <strong>⚠️ 未检测到运行中的 SQLite 后台服务</strong>
          <div style="margin-top:6px;font-size:12.5px;">请先启动项目根目录下的本地 SQLite 后台服务，即可将教师新增/编辑的热点和习题实时写入 <code>db/wmpses.db</code>：</div>
          <pre style="margin:8px 0 0;padding:8px 10px;border-radius:6px;background:#090e1a;color:#7dd3fc;overflow:auto;">python3 /Users/mac/projects/WMPSES/server.py</pre>
          <div style="margin-top:6px;font-size:12px;color:#cbd5e1;">（或在 Finder 中直接双击项目下的 <code>启动SQLite后台服务.command</code>）</div>
        </div>
      `;
    }

    const counts = snapshot.counts || {};
    const tableNames = Object.keys(snapshot.tables || {});
    if (!tableNames.includes(state.activeSqliteTable) && tableNames.length) {
      state.activeSqliteTable = tableNames[0];
    }
    const rows = (snapshot.tables && snapshot.tables[state.activeSqliteTable]) || [];

    const countChips = tableNames.map((tbl) => `
      <button type="button" class="tab-btn sqlite-tbl-btn ${state.activeSqliteTable === tbl ? 'active' : ''}" data-tbl="${escapeHtml(tbl)}">
        ${escapeHtml(tbl)} (${counts[tbl] != null ? counts[tbl] : 0})
      </button>
    `).join('');

    let tableContent = '<div style="padding:16px;color:#94a3b8;">该表暂无记录</div>';
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      const ths = cols.map((c) => `<th style="padding:7px 10px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">${escapeHtml(c)}</th>`).join('');
      const trs = rows.map((r) => `
        <tr>
          ${cols.map((c) => {
            const val = r[c] == null ? '' : String(r[c]);
            const shortVal = val.length > 72 ? val.slice(0, 72) + '…' : val;
            return `<td style="padding:6px 10px;border-bottom:1px solid rgba(148,163,184,0.12);white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(val)}">${escapeHtml(shortVal)}</td>`;
          }).join('')}
        </tr>
      `).join('');
      tableContent = `
        <div style="overflow:auto;max-height:360px;border:1px solid rgba(148,163,184,0.25);border-radius:8px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr>${ths}</tr></thead>
            <tbody>${trs}</tbody>
          </table>
        </div>
      `;
    }

    return `
      <div style="font-size:12px;color:#86efac;margin-bottom:10px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <span>🟢 已连接数据库：<code>${escapeHtml(snapshot.dbPath || 'db/wmpses.db')}</code></span>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-refresh-sqlite">🔄 刷新表数据</button>
      </div>
      <div class="tabs-bar" style="margin-bottom:10px;">${countChips}</div>
      ${tableContent}
    `;
  }

  async function loadAndRenderSqliteTab() {
    try {
      state.sqliteSnapshot = await adapter.fetchSqliteTables();
    } catch (err) {
      state.sqliteSnapshot = { error: err.message };
    }
    const container = $('sqlite-viewer-container');
    if (container) {
      container.innerHTML = renderSqliteTableViewerHtml(state.sqliteSnapshot);
      container.querySelectorAll('.sqlite-tbl-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.activeSqliteTable = btn.dataset.tbl;
          container.innerHTML = renderSqliteTableViewerHtml(state.sqliteSnapshot);
          bindSqliteViewerButtons(container);
        });
      });
      bindSqliteViewerButtons(container);
    }
  }

  function bindSqliteViewerButtons(container) {
    container.querySelectorAll('.sqlite-tbl-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeSqliteTable = btn.dataset.tbl;
        container.innerHTML = renderSqliteTableViewerHtml(state.sqliteSnapshot);
        bindSqliteViewerButtons(container);
      });
    });
    const refreshBtn = $('btn-refresh-sqlite');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadAndRenderSqliteTab);
    }
  }

  // ==========================================
  // 工况台账、24项验收规范与设计方案弹窗
  // ==========================================
  function openDocsModal(initialTab) {
    if (!state.currentUser) {
      showToast('请先登录系统账号', 'warn');
      openLoginModal();
      return;
    }
    if (!getRolePermissions().allowDocs) {
      showToast('当前角色无权查看台账与验收方案', 'warn');
      return;
    }
    if (initialTab) state.activeDocsTab = initialTab;
    state.docsEditDraft = null;
    renderDocsModal();
    openModal('docs-modal');
  }

  function renderDocsEditorBoxHtml(canEdit) {
    const draft = state.docsEditDraft;
    if (!canEdit || !draft) return '';
    const hotspots = (state.bank && Array.isArray(state.bank.hotspots)) ? state.bank.hotspots : [];

    if (draft.kind === 'docs' || draft.kind === 'standards') {
      const isStd = draft.kind === 'standards';
      return `
        <div style="padding:12px 14px;border-radius:10px;background:#090e1a;border:1px solid rgba(56,189,248,0.45);margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <strong style="color:#7dd3fc;font-size:13px;">${draft.isNew ? (isStd ? '➕ 新增引用标准' : '➕ 新增现场工况台账') : (isStd ? '✏️ 编辑引用标准' : '✏️ 编辑现场工况台账')}</strong>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-docs-cancel-edit">取消</button>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <label>${isStd ? '标准编号（如 HJ 1093-2020）' : '台账编号（如 DOC-JX-2026-11）'}</label>
              <input type="text" id="doc-ed-code" class="form-control" value="${escapeHtml(draft.docCode || '')}">
            </div>
            <div class="form-field">
              <label>${isStd ? '标准类别（如 大气环境 / 职业技能）' : '责任部门 / 班组（如 设备检修部）'}</label>
              <input type="text" id="doc-ed-dept" class="form-control" value="${escapeHtml(draft.deptOrCategory || '')}">
            </div>
            <div class="form-field" style="grid-column:1 / -1;">
              <label>${isStd ? '标准名称（必填）' : '台账标题（必填）'}</label>
              <input type="text" id="doc-ed-title" class="form-control" value="${escapeHtml(draft.docTitle || '')}">
            </div>
            <div class="form-field" style="grid-column:1 / -1;">
              <label>${isStd ? '在本系统中的用途说明' : '台账正文 / 工况记录摘要（必填）'}</label>
              <textarea id="doc-ed-summary" class="form-control" rows="3">${escapeHtml(draft.contentSummary || '')}</textarea>
            </div>
            <div class="form-field" style="grid-column:1 / -1;margin-bottom:0;">
              <label>关联设备位号（选填，如 A-101A / V-101 或 ALL）</label>
              <input type="text" id="doc-ed-hs" class="form-control" value="${escapeHtml(draft.relatedHotspotCode || '')}">
            </div>
          </div>
          <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;">
            <button type="button" class="btn btn-success btn-sm" id="btn-docs-save-edit">💾 保存并同步 SQLite</button>
          </div>
        </div>
      `;
    }

    if (draft.kind === 'checklist') {
      return `
        <div style="padding:12px 14px;border-radius:10px;background:#090e1a;border:1px solid rgba(56,189,248,0.45);margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <strong style="color:#7dd3fc;font-size:13px;">${draft.isNew ? '➕ 新增验收规范核查项' : '✏️ 编辑验收规范核查项'}</strong>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-docs-cancel-edit">取消</button>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <label>序号</label>
              <input type="number" id="chk-ed-no" class="form-control" min="1" value="${Number(draft.itemNo) || 1}">
            </div>
            <div class="form-field">
              <label>验收方面（如 1.机械结构与防腐）</label>
              <input type="text" id="chk-ed-aspect" class="form-control" value="${escapeHtml(draft.aspectName || '')}">
            </div>
            <div class="form-field" style="grid-column:1 / -1;">
              <label>核查项名称（必填）</label>
              <input type="text" id="chk-ed-name" class="form-control" value="${escapeHtml(draft.checkItemName || '')}">
            </div>
            <div class="form-field">
              <label>判定依据标准</label>
              <input type="text" id="chk-ed-basis" class="form-control" value="${escapeHtml(draft.standardBasis || '')}">
            </div>
            <div class="form-field">
              <label>关联缺陷编号（选填，如 D1 / G2）</label>
              <input type="text" id="chk-ed-defect" class="form-control" value="${escapeHtml(draft.relatedDefectCode || '')}">
            </div>
            <div class="form-field" style="grid-column:1 / -1;">
              <label>现场工况描述</label>
              <input type="text" id="chk-ed-status" class="form-control" value="${escapeHtml(draft.sceneStatus || '')}">
            </div>
            <div class="form-field" style="grid-column:1 / -1;margin-bottom:0;">
              <label>关联场景热点（用于“前往”一键定位）</label>
              <select id="chk-ed-hs" class="form-control">
                <option value="">-- 不绑定特定热点 --</option>
                ${hotspots.map((h) => `<option value="${escapeHtml(h.id)}" ${draft.hotspotId === h.id ? 'selected' : ''}>[${escapeHtml(h.code)}] ${escapeHtml(h.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;">
            <button type="button" class="btn btn-success btn-sm" id="btn-docs-save-edit">💾 保存并同步 SQLite</button>
          </div>
        </div>
      `;
    }
    return '';
  }

  function renderDocsModal() {
    const body = $('docs-modal-body');
    const perms = getRolePermissions();
    const canEdit = Boolean(perms.modes.includes('edit'));
    const docs = (state.bank && state.bank.scenarioDocs) || [];
    const checklist = (state.bank && state.bank.checklistItems) || [];
    const vetoRules = (state.bank && state.bank.vetoRules) || [];

    const accountDocs = docs.filter((d) => d.docCategory === '工况台账');
    const stdDocs = docs.filter((d) => d.docCategory === '引用标准');

    const docsToolbarHtml = canEdit
      ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
           <span style="font-size:12px;color:#94a3b8;">💡 命题教师 / 审题专家可针对当前试卷场景在线增删改现场工况台账，实时同步 SQLite。</span>
           <button type="button" class="btn btn-success btn-sm" id="btn-docs-add-account">➕ 新增工况台账</button>
         </div>`
      : '';

    const docsHtml = `
      ${docsToolbarHtml}
      ${state.activeDocsTab === 'docs' ? renderDocsEditorBoxHtml(canEdit) : ''}
      ${accountDocs.length ? accountDocs.map((d) => `
        <div class="question-card" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
            <strong style="color:#7dd3fc;">${escapeHtml(d.docTitle)}</strong>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="q-type-badge">${escapeHtml(d.docCode)} · ${escapeHtml(d.deptOrCategory)}</span>
              ${canEdit ? `<button type="button" class="btn btn-primary btn-sm btn-doc-edit" data-kind="docs" data-id="${escapeHtml(d.id)}">✏️ 编辑</button>` : ''}
              ${canEdit ? `<button type="button" class="btn btn-danger btn-sm btn-doc-del" data-kind="docs" data-id="${escapeHtml(d.id)}" data-title="${escapeHtml(d.docTitle)}">删</button>` : ''}
            </div>
          </div>
          <div style="color:#e2e8f0;font-size:13px;white-space:pre-wrap;">${escapeHtml(d.contentSummary)}</div>
          ${d.relatedHotspotCode ? `<div style="margin-top:6px;font-size:11.5px;color:#94a3b8;">关联设备位号：${escapeHtml(d.relatedHotspotCode)}</div>` : ''}
        </div>
      `).join('') : '<div style="padding:18px;text-align:center;color:#94a3b8;">当前试卷场景暂无现场工况台账</div>'}
    `;

    const chkToolbarHtml = canEdit
      ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
           <span style="font-size:12px;color:#94a3b8;">💡 可新增、修改或删除当前场景的验收核查项与热点定位绑定。</span>
           <button type="button" class="btn btn-success btn-sm" id="btn-docs-add-chk">➕ 新增验收核查项</button>
         </div>`
      : '';

    const checklistHtml = `
      ${chkToolbarHtml}
      ${state.activeDocsTab === 'checklist' ? renderDocsEditorBoxHtml(canEdit) : ''}
      <div style="overflow:auto;max-height:430px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#090e1a;color:#7dd3fc;">
              <th style="padding:8px;text-align:center;">序号</th>
              <th style="padding:8px;text-align:left;">验收方面</th>
              <th style="padding:8px;text-align:left;">核查项</th>
              <th style="padding:8px;text-align:left;">判定依据标准</th>
              <th style="padding:8px;text-align:left;">现场工况（关联缺陷）</th>
              <th style="padding:8px;text-align:center;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${checklist.length ? checklist.map((c) => `
              <tr style="border-bottom:1px solid rgba(148,163,184,0.12);">
                <td style="padding:7px;text-align:center;">${c.itemNo}</td>
                <td style="padding:7px;white-space:nowrap;">${escapeHtml(c.aspectName)}</td>
                <td style="padding:7px;font-weight:600;color:#f8fafc;">${escapeHtml(c.checkItemName)}</td>
                <td style="padding:7px;color:#cbd5e1;">${escapeHtml(c.standardBasis)}</td>
                <td style="padding:7px;color:#94a3b8;">
                  ${escapeHtml(c.sceneStatus)}
                  ${c.relatedDefectCode ? `<span class="q-score-badge" style="margin-left:4px;">${escapeHtml(c.relatedDefectCode)}</span>` : ''}
                </td>
                <td style="padding:7px;text-align:center;white-space:nowrap;">
                  ${c.hotspotId ? `<button type="button" class="btn btn-primary btn-sm docs-jump-hs" data-hsid="${escapeHtml(c.hotspotId)}">前往</button>` : ''}
                  ${canEdit ? `<button type="button" class="btn btn-ghost btn-sm btn-chk-edit" data-id="${escapeHtml(c.id)}">✏️</button>` : ''}
                  ${canEdit ? `<button type="button" class="btn btn-danger btn-sm btn-chk-del" data-id="${escapeHtml(c.id)}" data-title="${escapeHtml(c.checkItemName)}">删</button>` : ''}
                </td>
              </tr>
            `).join('') : '<tr><td colspan="6" style="padding:18px;text-align:center;color:#94a3b8;">暂无验收核查项</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    const stdToolbarHtml = canEdit
      ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
           <span style="font-size:12px;color:#94a3b8;">💡 可维护当前试卷场景所引用的国标、行标与技术规程清单。</span>
           <button type="button" class="btn btn-success btn-sm" id="btn-docs-add-std">➕ 新增引用标准</button>
         </div>`
      : '';

    const stdHtml = `
      ${stdToolbarHtml}
      ${state.activeDocsTab === 'standards' ? renderDocsEditorBoxHtml(canEdit) : ''}
      <div style="overflow:auto;max-height:430px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead>
            <tr style="background:#090e1a;color:#7dd3fc;">
              <th style="padding:8px;text-align:left;">类别</th>
              <th style="padding:8px;text-align:left;">标准编号</th>
              <th style="padding:8px;text-align:left;">标准名称</th>
              <th style="padding:8px;text-align:left;">在本系统中的用途</th>
              ${canEdit ? '<th style="padding:8px;text-align:center;">操作</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${stdDocs.length ? stdDocs.map((s) => `
              <tr style="border-bottom:1px solid rgba(148,163,184,0.12);">
                <td style="padding:7px;white-space:nowrap;">${escapeHtml(s.deptOrCategory)}</td>
                <td style="padding:7px;white-space:nowrap;color:#38bdf8;">${escapeHtml(s.docCode)}</td>
                <td style="padding:7px;font-weight:600;">${escapeHtml(s.docTitle)}</td>
                <td style="padding:7px;color:#cbd5e1;">${escapeHtml(s.contentSummary)}</td>
                ${canEdit ? `
                <td style="padding:7px;text-align:center;white-space:nowrap;">
                  <button type="button" class="btn btn-primary btn-sm btn-doc-edit" data-kind="standards" data-id="${escapeHtml(s.id)}">✏️</button>
                  <button type="button" class="btn btn-danger btn-sm btn-doc-del" data-kind="standards" data-id="${escapeHtml(s.id)}" data-title="${escapeHtml(s.docTitle)}">删</button>
                </td>` : ''}
              </tr>
            `).join('') : `<tr><td colspan="${canEdit ? 5 : 4}" style="padding:18px;text-align:center;color:#94a3b8;">暂无引用标准</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    const vetoViewHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <span style="color:#cbd5e1;font-size:12.5px;">当前考试判分实时读取下表规则执行一票否决核验：</span>
        ${perms.allowVetoEdit ? '<button type="button" class="btn btn-warning btn-sm" id="btn-docs-goto-veto-cfg">⚙️ 编辑否定项规则与阈值</button>' : '<span style="font-size:12px;color:#94a3b8;">当前角色为只读查阅权限</span>'}
      </div>
      ${vetoRules.map((r) => `
        <div class="question-card" style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <strong>[${escapeHtml(r.code)}] ${escapeHtml(r.name)}</strong>
            <span class="q-defect-badge ${r.isEnabled ? 'major' : 'interference'}">${r.isEnabled ? '已启用' : '已停用'} · ${r.penaltyAction === 'ZERO_SCORE' ? '触发记 0 分' : '仅提示警告'}</span>
          </div>
          <div style="margin-top:6px;font-size:12.5px;color:#cbd5e1;">
            触发条件：<code>${escapeHtml(r.conditionType)}</code> ｜ 阈值：<strong>${r.thresholdValue}</strong> ｜ 目标：<code>${escapeHtml(r.targetRef || '-')}</code>
          </div>
          <div style="margin-top:4px;font-size:12px;color:#94a3b8;">告警说明：${escapeHtml(r.alertMessage)}</div>
        </div>
      `).join('')}
    `;

    body.innerHTML = `
      <div class="tabs-bar">
        <button type="button" class="tab-btn docs-tab-btn ${state.activeDocsTab === 'docs' ? 'active' : ''}" data-dtab="docs">📄 现场工况台账 (${accountDocs.length})</button>
        <button type="button" class="tab-btn docs-tab-btn ${state.activeDocsTab === 'checklist' ? 'active' : ''}" data-dtab="checklist">✅ 验收规范与确认单 (${checklist.length})</button>
        <button type="button" class="tab-btn docs-tab-btn ${state.activeDocsTab === 'standards' ? 'active' : ''}" data-dtab="standards">📚 附录C引用国标 (${stdDocs.length})</button>
        <button type="button" class="tab-btn docs-tab-btn ${state.activeDocsTab === 'veto' ? 'active' : ''}" data-dtab="veto">⚖️ 否定项规则库 (${vetoRules.length})</button>
      </div>
      <div style="display:${state.activeDocsTab === 'docs' ? 'block' : 'none'};">${docsHtml}</div>
      <div style="display:${state.activeDocsTab === 'checklist' ? 'block' : 'none'};">${checklistHtml}</div>
      <div style="display:${state.activeDocsTab === 'standards' ? 'block' : 'none'};">${stdHtml}</div>
      <div style="display:${state.activeDocsTab === 'veto' ? 'block' : 'none'};">${vetoViewHtml}</div>
    `;

    body.querySelectorAll('.docs-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeDocsTab = btn.dataset.dtab;
        state.docsEditDraft = null;
        renderDocsModal();
      });
    });

    body.querySelectorAll('.docs-jump-hs').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeModal('docs-modal');
        onHotspotActivated(btn.dataset.hsid);
      });
    });

    const gotoVeto = $('btn-docs-goto-veto-cfg');
    if (gotoVeto) {
      gotoVeto.addEventListener('click', () => {
        closeModal('docs-modal');
        openSettingsModal('veto');
      });
    }

    if (canEdit) {
      const addAccBtn = $('btn-docs-add-account');
      if (addAccBtn) {
        addAccBtn.addEventListener('click', () => {
          state.docsEditDraft = {
            kind: 'docs',
            isNew: true,
            id: 'DOC-TZ-' + Date.now().toString().slice(-5),
            docCategory: '工况台账',
            sortOrder: accountDocs.length + 1,
            docCode: `DOC-${new Date().getFullYear()}-${String(accountDocs.length + 1).padStart(2, '0')}`,
            docTitle: '',
            deptOrCategory: '工艺技术科',
            contentSummary: '',
            relatedHotspotCode: ''
          };
          renderDocsModal();
        });
      }

      const addStdBtn = $('btn-docs-add-std');
      if (addStdBtn) {
        addStdBtn.addEventListener('click', () => {
          state.docsEditDraft = {
            kind: 'standards',
            isNew: true,
            id: 'STD-' + Date.now().toString().slice(-5),
            docCategory: '引用标准',
            sortOrder: stdDocs.length + 1,
            docCode: '',
            docTitle: '',
            deptOrCategory: '大气环境',
            contentSummary: '',
            relatedHotspotCode: 'ALL'
          };
          renderDocsModal();
        });
      }

      const addChkBtn = $('btn-docs-add-chk');
      if (addChkBtn) {
        addChkBtn.addEventListener('click', () => {
          state.docsEditDraft = {
            kind: 'checklist',
            isNew: true,
            id: 'CHK-' + Date.now().toString().slice(-5),
            itemNo: checklist.length + 1,
            aspectName: '1.机械结构与防腐',
            checkItemName: '',
            interactionWay: '热点核查',
            standardBasis: '',
            sceneStatus: '',
            standardConclusion: '合格',
            relatedDefectCode: '',
            hotspotId: ''
          };
          renderDocsModal();
        });
      }

      body.querySelectorAll('.btn-doc-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const found = docs.find((x) => x.id === btn.dataset.id);
          if (!found) return;
          state.docsEditDraft = Object.assign({ kind: btn.dataset.kind, isNew: false }, structuredClone(found));
          renderDocsModal();
        });
      });

      body.querySelectorAll('.btn-doc-del').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!global.confirm(`确定删除「${btn.dataset.title}」吗？`)) return;
          state.bank.scenarioDocs = (state.bank.scenarioDocs || []).filter((x) => x.id !== btn.dataset.id);
          state.docsEditDraft = null;
          await persistEditToBackend(`已删除资料「${btn.dataset.title}」`, '删除台账或引用标准');
          renderDocsModal();
        });
      });

      body.querySelectorAll('.btn-chk-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const found = checklist.find((x) => x.id === btn.dataset.id);
          if (!found) return;
          state.docsEditDraft = Object.assign({ kind: 'checklist', isNew: false }, structuredClone(found));
          renderDocsModal();
        });
      });

      body.querySelectorAll('.btn-chk-del').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!global.confirm(`确定删除验收核查项「${btn.dataset.title}」吗？`)) return;
          state.bank.checklistItems = (state.bank.checklistItems || []).filter((x) => x.id !== btn.dataset.id);
          state.docsEditDraft = null;
          await persistEditToBackend(`已删除验收核查项「${btn.dataset.title}」`, '删除验收核查项');
          renderDocsModal();
        });
      });

      const cancelBtn = $('btn-docs-cancel-edit');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          state.docsEditDraft = null;
          renderDocsModal();
        });
      }

      const saveBtn = $('btn-docs-save-edit');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const d = state.docsEditDraft;
          if (!d) return;
          if (d.kind === 'docs' || d.kind === 'standards') {
            const title = ($('doc-ed-title') ? $('doc-ed-title').value : '').trim();
            const summary = ($('doc-ed-summary') ? $('doc-ed-summary').value : '').trim();
            if (!title) {
              showToast('请填写标题/标准名称', 'warn');
              return;
            }
            const nextDoc = {
              id: d.id,
              docCategory: d.kind === 'standards' ? '引用标准' : '工况台账',
              sortOrder: Number(d.sortOrder) || 1,
              docCode: ($('doc-ed-code') ? $('doc-ed-code').value : '').trim(),
              docTitle: title,
              deptOrCategory: ($('doc-ed-dept') ? $('doc-ed-dept').value : '').trim(),
              contentSummary: summary,
              relatedHotspotCode: ($('doc-ed-hs') ? $('doc-ed-hs').value : '').trim()
            };
            state.bank.scenarioDocs = Array.isArray(state.bank.scenarioDocs) ? state.bank.scenarioDocs : [];
            const idx = state.bank.scenarioDocs.findIndex((x) => x.id === nextDoc.id);
            if (idx >= 0) state.bank.scenarioDocs[idx] = nextDoc;
            else state.bank.scenarioDocs.push(nextDoc);
            state.docsEditDraft = null;
            await persistEditToBackend(`${d.isNew ? '新增' : '更新'}${nextDoc.docCategory}「${title}」`, '维护工况台账与引用标准');
            renderDocsModal();
            return;
          }

          if (d.kind === 'checklist') {
            const name = ($('chk-ed-name') ? $('chk-ed-name').value : '').trim();
            if (!name) {
              showToast('请填写核查项名称', 'warn');
              return;
            }
            const nextChk = {
              id: d.id,
              itemNo: Math.max(1, Number($('chk-ed-no') ? $('chk-ed-no').value : 1) || 1),
              aspectName: ($('chk-ed-aspect') ? $('chk-ed-aspect').value : '').trim(),
              checkItemName: name,
              interactionWay: d.interactionWay || '热点核查',
              standardBasis: ($('chk-ed-basis') ? $('chk-ed-basis').value : '').trim(),
              sceneStatus: ($('chk-ed-status') ? $('chk-ed-status').value : '').trim(),
              standardConclusion: d.standardConclusion || '合格',
              relatedDefectCode: ($('chk-ed-defect') ? $('chk-ed-defect').value : '').trim(),
              hotspotId: ($('chk-ed-hs') ? $('chk-ed-hs').value : '').trim()
            };
            state.bank.checklistItems = Array.isArray(state.bank.checklistItems) ? state.bank.checklistItems : [];
            const idx = state.bank.checklistItems.findIndex((x) => x.id === nextChk.id);
            if (idx >= 0) state.bank.checklistItems[idx] = nextChk;
            else state.bank.checklistItems.push(nextChk);
            state.bank.checklistItems.sort((a, b) => (Number(a.itemNo) || 0) - (Number(b.itemNo) || 0));
            state.docsEditDraft = null;
            await persistEditToBackend(`${d.isNew ? '新增' : '更新'}验收核查项「${name}」`, '维护验收规范与确认单');
            renderDocsModal();
          }
        });
      }
    }
  }

  // ==========================================
  // 设置 & SQLite / FileMaker 对接弹窗
  // ==========================================
  async function loadUsersAndLogsPanel() {
    const data = await adapter.fetchUsersAndLogs();
    state.usersList = data.users || [];
    state.changeLogs = data.changeLogs || [];
    if (state.activeSettingsTab === 'bank' && $('settings-modal').classList.contains('open')) {
      renderBankUserPanelContent(data.offlineFallback);
    }
  }

  function renderBankUserPanelContent(isOfflineFallback) {
    const host = $('bank-user-dynamic-area');
    if (!host) return;
    const cfg = adapter.getConfig();
    const perms = getRolePermissions();
    const users = state.usersList || [];
    const logs = state.changeLogs || [];
    const examinees = users.filter((u) => u.RoleType === '考生');
    const teachers = users.filter((u) => ['命题教师', '审题专家', '系统管理员'].includes(u.RoleType));

    const roles = ['全部', '考生', '命题教师', '审题专家', '考评员', '监考员'];
    const rolePills = roles.map((r) => `
      <button type="button" class="tab-btn user-role-filter ${state.activeRoleFilter === r ? 'active' : ''}" data-role="${escapeHtml(r)}" style="padding:4px 9px;font-size:11.5px;">
        ${escapeHtml(r)}${r === '全部' ? ` (${users.length})` : ` (${users.filter((u) => u.RoleType === r).length})`}
      </button>
    `).join('');

    const visibleUsers = state.activeRoleFilter === '全部'
      ? users
      : users.filter((u) => u.RoleType === state.activeRoleFilter);

    const showActionCol = Boolean(perms.allowPickActiveIdentity || perms.allowUserDelete);
    const userRowsHtml = visibleUsers.length
      ? visibleUsers.map((u) => {
          const pwdHash = u.Password ? String(u.Password) : '';
          const pwdCellText = pwdHash
            ? `🔒 ${escapeHtml(`${pwdHash.slice(0, 6)}…${pwdHash.slice(-6)}`)}`
            : '🔒 已加密 (SHA-256)';
          const canDeleteRow = perms.allowUserDelete
            && u.pk_UserID !== (state.currentUser && state.currentUser.pk_UserID)
            && (u.RoleType !== '系统管理员' || perms.allowGrantAdmin);
          return `
            <tr style="border-bottom:1px solid rgba(148,163,184,0.12);">
              <td style="padding:6px 8px;white-space:nowrap;color:#38bdf8;">${escapeHtml(u.UserCode)}</td>
              <td style="padding:6px 8px;font-weight:600;white-space:nowrap;">${escapeHtml(u.FullName)}</td>
              <td style="padding:6px 8px;white-space:nowrap;"><span class="q-type-badge">${escapeHtml(u.RoleType)}</span></td>
              <td style="padding:6px 8px;white-space:nowrap;font-family:monospace;font-size:11px;color:#86efac;">${pwdCellText}</td>
              <td style="padding:6px 8px;color:#cbd5e1;">${escapeHtml(u.Department)}</td>
              <td style="padding:6px 8px;color:#94a3b8;white-space:nowrap;">${escapeHtml(u.SkillLevel || u.Specialty)}</td>
              ${showActionCol ? `
              <td style="padding:6px 8px;white-space:nowrap;text-align:center;">
                ${perms.allowPickActiveIdentity ? `<button type="button" class="btn btn-primary btn-sm btn-pick-user" data-uid="${escapeHtml(u.pk_UserID)}">${u.RoleType === '考生' ? '设为考生' : '设为编辑人'}</button>` : ''}
                ${canDeleteRow ? `<button type="button" class="btn btn-danger btn-sm btn-del-user" data-uid="${escapeHtml(u.pk_UserID)}" data-name="${escapeHtml(u.FullName)}">删</button>` : ''}
              </td>
              ` : ''}
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="${showActionCol ? 7 : 6}" style="padding:12px;text-align:center;color:#94a3b8;">当前筛选下暂无人员记录</td></tr>`;

    const logsHtml = logs.length
      ? logs.slice(0, 8).map((l) => `
          <div style="padding:8px 10px;border-radius:7px;background:#162033;margin-bottom:6px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
              <span><strong style="color:#38bdf8;">[${escapeHtml(l.ActionType)}]</strong> ${escapeHtml(l.OperatorName)} · 热点${l.HotspotCount}/题${l.QuestionCount}/共${l.TotalScore}分</span>
              <span style="color:#94a3b8;">${escapeHtml(l.ChangedAt)}</span>
            </div>
            <div style="color:#cbd5e1;margin-top:3px;">${escapeHtml(l.ChangeSummary)}</div>
          </div>
        `).join('')
      : '<div style="color:#94a3b8;font-size:12px;">暂无题库变更记录</div>';

    const identitySwitchHtml = perms.allowPickActiveIdentity ? `
      <div style="padding:10px 12px;border-radius:8px;background:#162033;border:1px solid rgba(56,189,248,0.25);margin-bottom:12px;">
        <div style="font-size:12.5px;color:#7dd3fc;font-weight:700;margin-bottom:8px;">
          当前身份切换（来自统一人员表 WMPSES_用户人员${isOfflineFallback ? ' · 离线兜底' : ' · SQLite实时同步'}）
        </div>
        <div class="form-grid">
          <div class="form-field" style="margin-bottom:0;">
            <label>从名册快速选择当前考生</label>
            <select id="select-active-examinee" class="form-control">
              <option value="">-- 手动填写或从下拉选取 --</option>
              ${examinees.map((u) => `<option value="${escapeHtml(u.pk_UserID)}" ${cfg.student.userId === u.pk_UserID ? 'selected' : ''}>${escapeHtml(u.FullName)} (${escapeHtml(u.UserCode)} · ${escapeHtml(u.Department)})</option>`).join('')}
            </select>
          </div>
          <div class="form-field" style="margin-bottom:0;">
            <label>当前题库编辑责任教师</label>
            <select id="select-active-teacher" class="form-control">
              ${teachers.map((u) => `<option value="${escapeHtml(u.pk_UserID)}" ${cfg.student.teacherId === u.pk_UserID ? 'selected' : ''}>${escapeHtml(u.FullName)} (${escapeHtml(u.RoleType)})</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    ` : `
      <div style="padding:8px 12px;border-radius:8px;background:#162033;border:1px solid rgba(148,163,184,0.25);margin-bottom:12px;font-size:12px;color:#94a3b8;">
        🛡️ 当前角色（${escapeHtml(perms.role)}）对人员名册与题库仅具备只读查阅与导出权限。
      </div>
    `;

    const addUserFormHtml = perms.allowUserCreate ? `
      <div style="padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid rgba(148,163,184,0.22);margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#fde68a;margin-bottom:8px;">➕ 新增人员（存入 SQLite WMPSES_用户人员 表，默认初始密码 123456）</div>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">
          <input type="text" id="new-user-code" class="form-control" placeholder="考号/工号 (如 ZK004)">
          <input type="text" id="new-user-name" class="form-control" placeholder="姓名 (必填)">
          <select id="new-user-role" class="form-control">
            <option value="考生">考生</option>
            <option value="命题教师">命题教师</option>
            <option value="审题专家">审题专家</option>
            <option value="考评员">考评员</option>
            <option value="监考员">监考员</option>
            ${perms.allowGrantAdmin ? '<option value="系统管理员">系统管理员</option>' : ''}
          </select>
          <input type="password" id="new-user-password" class="form-control" value="123456" placeholder="初始密码 (默认 123456)">
          <input type="text" id="new-user-dept" class="form-control" placeholder="所属车间/教研室">
          <input type="text" id="new-user-level" class="form-control" placeholder="等级/职称 (如 二级/技师)">
          <button type="button" class="btn btn-success btn-sm" id="btn-add-user">新增人员存库</button>
        </div>
      </div>
    ` : '';

    host.innerHTML = `
      ${identitySwitchHtml}

      <h4 style="margin:12px 0 8px;color:#7dd3fc;">统一人员名册${perms.allowUserCreate ? '管理' : '查阅'}（考生 / 教师 / 考评员 / 监考员同表存储）</h4>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${rolePills}</div>
      <div style="overflow:auto;max-height:200px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;margin-bottom:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#090e1a;color:#7dd3fc;">
              <th style="padding:7px 8px;text-align:left;">考号/工号</th>
              <th style="padding:7px 8px;text-align:left;">姓名</th>
              <th style="padding:7px 8px;text-align:left;">角色</th>
              <th style="padding:7px 8px;text-align:left;">密码 (SHA-256)</th>
              <th style="padding:7px 8px;text-align:left;">单位/车间</th>
              <th style="padding:7px 8px;text-align:left;">等级/专业</th>
              ${showActionCol ? '<th style="padding:7px 8px;text-align:center;">操作</th>' : ''}
            </tr>
          </thead>
          <tbody>${userRowsHtml}</tbody>
        </table>
      </div>

      ${addUserFormHtml}

      <h4 style="margin:12px 0 8px;color:#7dd3fc;">题库变更审计日志（WMPSES_题库变更日志）</h4>
      ${logsHtml}
    `;

    host.querySelectorAll('.user-role-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeRoleFilter = btn.dataset.role;
        renderBankUserPanelContent(isOfflineFallback);
      });
    });

    const exSel = $('select-active-examinee');
    if (exSel) {
      exSel.addEventListener('change', () => {
        const u = users.find((x) => x.pk_UserID === exSel.value);
        if (!u) return;
        if ($('cfg-student-name')) $('cfg-student-name').value = u.FullName;
        if ($('cfg-student-id')) $('cfg-student-id').value = u.UserCode;
        adapter.updateConfig({
          student: {
            userId: u.pk_UserID,
            name: u.FullName,
            examineeId: u.UserCode,
            department: u.Department,
            skillLevel: u.SkillLevel
          }
        });
        updateHeaderStats();
        showToast(`已切换当前考生为：${u.FullName} (${u.UserCode})`, 'success');
      });
    }

    const tcSel = $('select-active-teacher');
    if (tcSel) {
      tcSel.addEventListener('change', () => {
        const u = users.find((x) => x.pk_UserID === tcSel.value);
        if (!u) return;
        adapter.updateConfig({
          student: {
            teacherId: u.pk_UserID,
            teacherName: `${u.FullName} (${u.RoleType})`
          }
        });
        showToast(`已切换题库操作教师为：${u.FullName}`, 'success');
      });
    }

    host.querySelectorAll('.btn-pick-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = users.find((x) => x.pk_UserID === btn.dataset.uid);
        if (!u) return;
        if (u.RoleType === '考生') {
          if ($('cfg-student-name')) $('cfg-student-name').value = u.FullName;
          if ($('cfg-student-id')) $('cfg-student-id').value = u.UserCode;
          adapter.updateConfig({
            student: { userId: u.pk_UserID, name: u.FullName, examineeId: u.UserCode, department: u.Department, skillLevel: u.SkillLevel }
          });
          updateHeaderStats();
          showToast(`已设为当前应考考生：${u.FullName}`, 'success');
        } else {
          adapter.updateConfig({
            student: { teacherId: u.pk_UserID, teacherName: `${u.FullName} (${u.RoleType})` }
          });
          showToast(`已设为当前题库编辑责任人：${u.FullName} (${u.RoleType})`, 'success');
        }
        renderBankUserPanelContent(isOfflineFallback);
      });
    });

    host.querySelectorAll('.btn-del-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!global.confirm(`确定从 WMPSES_用户人员 表删除「${btn.dataset.name}」吗？`)) return;
        try {
          await adapter.deleteUser(btn.dataset.uid);
          showToast(`已删除人员「${btn.dataset.name}」`, 'info');
          loadUsersAndLogsPanel();
        } catch (err) {
          showToast('删除失败（请确认 SQLite 后台服务已启动）：' + err.message, 'error');
        }
      });
    });

    const addBtn = $('btn-add-user');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const fullName = $('new-user-name').value.trim();
        if (!fullName) {
          showToast('请填写人员姓名', 'warn');
          return;
        }
        try {
          await adapter.saveUser({
            userCode: $('new-user-code').value.trim() || ('U-' + Date.now().toString().slice(-4)),
            fullName: fullName,
            roleType: $('new-user-role').value,
            password: ($('new-user-password') ? $('new-user-password').value : '') || '123456',
            department: $('new-user-dept').value.trim(),
            skillLevel: $('new-user-level').value.trim()
          });
          showToast(`已将「${fullName}」存入 SQLite WMPSES_用户人员 表`, 'success');
          loadUsersAndLogsPanel();
        } catch (err) {
          showToast('写入失败（请确认 SQLite 后台服务已启动）：' + err.message, 'error');
        }
      });
    }
  }

  async function loadAndRenderLanHealthPanel() {
    const panel = $('lan-health-panel');
    if (!panel) return;
    panel.innerHTML = '<div style="padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid rgba(56,189,248,0.22);font-size:12px;color:#94a3b8;">正在探测后台服务端口与局域网考场访问地址...</div>';
    const health = await adapter.fetchServerHealth();
    const currentPanel = $('lan-health-panel');
    if (!currentPanel) return;
    if (!health || !health.ok) {
      currentPanel.innerHTML = `
        <div style="padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid rgba(244,63,94,0.35);font-size:12px;color:#fda4af;">
          <div><strong>⚠️ 未连接到 SQLite 后台服务</strong>（当前探测地址：<code>${escapeHtml((health && health.sqliteBase) || '')}</code>）</div>
          <div style="margin-top:4px;color:#94a3b8;">请双击项目根目录 <code>启动SQLite后台服务.command</code> 或运行 <code>python3 server.py</code>；启动后支持端口自检与局域网多机访问。</div>
        </div>
      `;
      return;
    }

    const lanUrls = Array.isArray(health.lanUrls) ? health.lanUrls : [];
    const cleaned = Array.isArray(health.cleanedPids) && health.cleanedPids.length
      ? ` · 本次已自动清理旧占用进程 PID: ${health.cleanedPids.join(', ')}`
      : '';
    const lanListHtml = lanUrls.length
      ? lanUrls.map((u, idx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:6px;background:#162033;margin-top:5px;">
            <code style="color:#38bdf8;font-size:12px;">${escapeHtml(u)}</code>
            <span style="font-size:11px;color:#94a3b8;">局域网考生机入口 ${idx + 1}</span>
          </div>
        `).join('')
      : '<div style="font-size:11.5px;color:#94a3b8;margin-top:4px;">未检测到活跃非回环局域网 IPv4（仅限本机访问）</div>';

    currentPanel.innerHTML = `
      <div style="padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid rgba(16,185,129,0.35);font-size:12px;color:#cbd5e1;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
          <strong style="color:#34d399;">🟢 后台服务与局域网考场状态正常</strong>
          <span style="font-size:11.5px;color:#94a3b8;">监听 <code>${escapeHtml(health.host || '0.0.0.0')}:${Number(health.port) || 8765}</code>${escapeHtml(cleaned)}</span>
        </div>
        <div style="font-size:12px;">教师本机地址：<code style="color:#fde68a;">${escapeHtml(health.localUrl || health.sqliteBase || '')}</code></div>
        <div style="margin-top:6px;font-size:12px;color:#7dd3fc;">🌐 同网段考生机免配置访问地址（访问后前端自动同源直连数据库）：</div>
        ${lanListHtml}
      </div>
    `;
  }

  function formatDurationMMSS(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function buildExamScoresRowsHtml() {
    const list = Array.isArray(state.examResultsList) ? state.examResultsList : [];
    const kw = String(state.scoreSearchKeyword || '').trim().toLowerCase();
    const canGrade = getRolePermissions().allowGrading;
    const filtered = kw
      ? list.filter((r) =>
          String(r.ExamineeName || '').toLowerCase().includes(kw) ||
          String(r.ExamineeID || '').toLowerCase().includes(kw) ||
          String(r.fk_UserID || '').toLowerCase().includes(kw) ||
          String(r.Department || '').toLowerCase().includes(kw) ||
          String(r.ReviewStatus || '').toLowerCase().includes(kw)
        )
      : list;

    const rowsHtml = filtered.length
      ? filtered.map((r) => {
          const isPending = r.ReviewStatus === '待阅卷';
          const isGraded = r.ReviewStatus === '已阅卷';
          const hasSubj = Number(r.SubjectiveCount || 0) > 0 || isPending || isGraded;
          const passed = r.PassStatus === '合格';
          const veto = Number(r.VetoTriggered) === 1;
          const timeText = String(r.SubmittedAt || '').replace('T', ' ').slice(0, 19);
          const passBadgeBg = isPending ? 'rgba(245,158,11,0.22)' : (passed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)');
          const passBadgeColor = isPending ? '#fde68a' : (passed ? '#86efac' : '#fca5a5');
          const reviewBadge = isPending
            ? '<span style="padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(245,158,11,0.24);color:#fde68a;">⏳ 待阅卷</span>'
            : (isGraded
              ? `<span style="padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(56,189,248,0.2);color:#7dd3fc;" title="阅卷人：${escapeHtml(r.ReviewerName || '')} (${escapeHtml(r.ReviewedAt || '')})">✍️ 已阅卷</span>`
              : '<span style="font-size:11.5px;color:#94a3b8;">自动已评</span>');
          const gradeBtnHtml = (canGrade && state.examResultsSource === 'sqlite' && hasSubj)
            ? `<button type="button" class="btn ${isPending ? 'btn-warning' : 'btn-ghost'} btn-sm btn-open-grading" data-rid="${escapeHtml(r.pk_ResultID)}">${isPending ? '✍️ 手工阅卷' : '🔍 复核/改分'}</button>`
            : '<span style="font-size:11px;color:#64748b;">—</span>';
          return `
            <tr>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;"><strong>${escapeHtml(r.ExamineeName || '现场考生')}</strong></td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;"><code>${escapeHtml(r.ExamineeID || r.fk_UserID || '-')}</code></td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;">${escapeHtml(r.Department || '-')}</td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;"><strong>${Number(r.Score) || 0}</strong> / ${Number(r.TotalScore) || 50}</td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;">${Number(r.Accuracy) || 0}%</td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;">
                <span style="padding:2px 7px;border-radius:999px;font-size:11.5px;font-weight:700;background:${passBadgeBg};color:${passBadgeColor};">${escapeHtml(r.PassStatus || '不合格')}</span>
              </td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;">${reviewBadge}</td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.VetoReason || '')}">${veto ? `⚠️ ${escapeHtml(r.VetoReason || '已触发')}` : '无'}</td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;">${formatDurationMMSS(r.DurationSeconds)}</td>
              <td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;color:#94a3b8;">${escapeHtml(timeText)}</td>
              ${canGrade ? `<td style="padding:7px 9px;border-bottom:1px solid rgba(148,163,184,0.14);white-space:nowrap;text-align:center;">${gradeBtnHtml}</td>` : ''}
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="${canGrade ? 11 : 10}" style="padding:18px;text-align:center;color:#94a3b8;">${kw ? '未找到匹配的考生成绩记录' : '暂无正式考试交卷成绩记录'}</td></tr>`;

    return { count: filtered.length, rowsHtml };
  }

  function renderExamScoresPanelHtml() {
    const { count, rowsHtml } = buildExamScoresRowsHtml();
    const canGrade = getRolePermissions().allowGrading;
    const backendLabel = adapter.getBackendLabel ? adapter.getBackendLabel() : 'SQLite 数据库';
    const sourceBadge = state.examResultsSource === 'sqlite'
      ? `<span style="color:#86efac;">🟢 数据来源：${escapeHtml(backendLabel)} 成绩表（WMPSES_考试记录）</span>`
      : '<span style="color:#fde68a;">🟡 数据来源：浏览器本地档案（连接后台服务后自动汇总全考场成绩）</span>';

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:12px;">
        <div>${sourceBadge}（共 <strong id="scores-count-num">${count}</strong> 条）</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="search" id="scores-search-input" class="form-control" style="width:220px;padding:5px 9px;font-size:12px;" placeholder="按姓名 / 考号 / 部门 / 待阅卷筛选…" value="${escapeHtml(state.scoreSearchKeyword || '')}">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-refresh-scores">🔄 刷新成绩表</button>
        </div>
      </div>
      <div style="overflow:auto;max-height:390px;border:1px solid rgba(148,163,184,0.25);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">考生姓名</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">考号 / 工号</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">部门 / 单位</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">得分</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">正确率</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">评定</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">阅卷状态</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">否定项</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">用时</th>
              <th style="padding:8px 9px;text-align:left;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">交卷时间</th>
              ${canGrade ? '<th style="padding:8px 9px;text-align:center;background:#090e1a;color:#7dd3fc;white-space:nowrap;border-bottom:1px solid rgba(148,163,184,0.25);">人工阅卷</th>' : ''}
            </tr>
          </thead>
          <tbody id="scores-table-body">${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function bindScoreRowGradingButtons() {
    const tbody = $('scores-table-body');
    if (!tbody) return;
    tbody.querySelectorAll('.btn-open-grading').forEach((btn) => {
      btn.addEventListener('click', () => openGradingModal(btn.dataset.rid));
    });
  }

  function updateExamScoresRowsOnly() {
    const { count, rowsHtml } = buildExamScoresRowsHtml();
    const tbody = $('scores-table-body');
    const countEl = $('scores-count-num');
    if (tbody) tbody.innerHTML = rowsHtml;
    if (countEl) countEl.textContent = String(count);
    bindScoreRowGradingButtons();
  }

  function bindScoresPanelEvents() {
    const searchEl = $('scores-search-input');
    if (searchEl) {
      let composing = false;
      const applyFilter = () => {
        state.scoreSearchKeyword = searchEl.value;
        updateExamScoresRowsOnly();
      };
      searchEl.addEventListener('compositionstart', () => {
        composing = true;
      });
      searchEl.addEventListener('compositionend', () => {
        composing = false;
        applyFilter();
      });
      searchEl.addEventListener('input', (e) => {
        if (composing || (e && e.isComposing)) return;
        applyFilter();
      });
    }
    const refreshBtn = $('btn-refresh-scores');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadAndRenderScoresTab);
    }
    bindScoreRowGradingButtons();
  }

  // ==========================================
  // 考评员手工阅卷工作台（文字简答题人工打分）
  // ==========================================
  async function openGradingModal(resultId) {
    const perms = getRolePermissions();
    if (!state.currentUser || !perms.allowGrading) {
      showToast('仅考评员、审题专家、命题教师或系统管理员可执行手工阅卷', 'warn');
      return;
    }
    try {
      const res = await adapter.fetchExamResultDetail(resultId);
      if (!res || !res.result) {
        showToast((res && res.error) || '加载考卷明细失败', 'error');
        return;
      }
      state.gradingSession = {
        result: res.result,
        details: Array.isArray(res.details) ? res.details : []
      };
      renderGradingModal();
      openModal('grading-modal');
    } catch (err) {
      showToast('加载考卷明细失败：' + (err && err.message ? err.message : String(err)), 'error');
    }
  }

  function renderGradingModal() {
    const body = $('grading-modal-body');
    const sess = state.gradingSession;
    if (!body || !sess || !sess.result) return;
    const rec = sess.result;
    const details = sess.details || [];
    const subjectiveList = details.filter((d) => d.QuestionType === 'short_answer');
    const objectiveList = details.filter((d) => d.QuestionType !== 'short_answer');
    const blind = Boolean(state.gradingBlindMode);

    const objScore = objectiveList.reduce((sum, d) => sum + (Number(d.EarnedScore) || 0), 0);
    const subjScoreInit = subjectiveList.reduce((sum, d) => sum + (Number(d.EarnedScore) || 0), 0);
    const totalScore = Number(rec.TotalScore) || 50;
    const passScore = Number(rec.PassScore) || 30;
    const veto = Number(rec.VetoTriggered) === 1;

    const examineeBanner = blind
      ? `🙈 <strong>盲评匿名答卷</strong>（卷号 <code>${escapeHtml(String(rec.pk_ResultID || '').slice(0, 8).toUpperCase())}</code>）`
      : `👤 考生：<strong>${escapeHtml(rec.ExamineeName || '现场考生')}</strong>（<code>${escapeHtml(rec.ExamineeID || rec.fk_UserID || '-')}</code> · ${escapeHtml(rec.Department || '未填单位')}）`;

    const subjHtml = subjectiveList.length
      ? subjectiveList.map((d, idx) => {
          const maxS = Number(d.MaxScore || d.QuestionScore || 10);
          const curS = Number(d.EarnedScore) || 0;
          return `
            <div class="question-card" style="margin-bottom:12px;border-color:rgba(56,189,248,0.35);">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                <div>
                  <span class="q-type-badge">主观简答 #${idx + 1}</span>
                  <strong style="margin-left:6px;color:#f8fafc;">[${escapeHtml(d.HotspotCode || '')} ${escapeHtml(d.HotspotName || '')}]</strong>
                </div>
                <span class="q-score-badge">满分 ${maxS} 分</span>
              </div>
              <div style="font-size:13.5px;color:#f8fafc;margin-bottom:10px;line-height:1.5;">${escapeHtml(d.QuestionTitle || d.fk_QuestionID)}</div>
              <div style="padding:10px 12px;border-radius:8px;background:#090e1a;border:1px solid rgba(148,163,184,0.22);margin-bottom:10px;">
                <div style="font-size:11.5px;color:#7dd3fc;margin-bottom:4px;">📝 考生文字作答：</div>
                <div style="font-size:13px;color:#e2e8f0;white-space:pre-wrap;line-height:1.6;">${escapeHtml(d.UserAnswer || '（考生未作答）')}</div>
              </div>
              <div style="padding:9px 12px;border-radius:8px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);margin-bottom:10px;font-size:12.5px;color:#cbd5e1;">
                <div style="color:#86efac;font-weight:700;margin-bottom:3px;">📋 参考答案与评分要点${d.ReferenceStandard ? `（依据：${escapeHtml(d.ReferenceStandard)}）` : ''}：</div>
                <div style="white-space:pre-wrap;">${escapeHtml(d.Explanation || '请依据标准验收规程要点酌情给分。')}</div>
              </div>
              <div class="form-grid" style="grid-template-columns:180px 1fr;gap:10px;align-items:end;">
                <div class="form-field" style="margin-bottom:0;">
                  <label>考评员手工给分 (0 ~ ${maxS})</label>
                  <input type="number" class="form-control gm-score-input" data-did="${escapeHtml(d.pk_DetailID)}" data-max="${maxS}" min="0" max="${maxS}" step="1" value="${curS}">
                </div>
                <div class="form-field" style="margin-bottom:0;">
                  <label>扣分说明 / 阅卷评语（选填）</label>
                  <input type="text" class="form-control gm-comment-input" data-did="${escapeHtml(d.pk_DetailID)}" value="${escapeHtml(d.ReviewComment || '')}" placeholder="如：漏写泄爆门复位复核步骤，扣 2 分">
                </div>
              </div>
            </div>
          `;
        }).join('')
      : '<div style="padding:18px;text-align:center;color:#94a3b8;">该答卷无文字简答题。</div>';

    const objSummaryHtml = objectiveList.length
      ? `
        <details style="margin-top:12px;padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid rgba(148,163,184,0.2);">
          <summary style="cursor:pointer;font-size:12.5px;color:#94a3b8;font-weight:600;">🔒 查看客观题自动判分明细（共 ${objectiveList.length} 题，已得 ${objScore} 分，系统锁定不可人工改分）</summary>
          <div style="margin-top:8px;display:grid;gap:6px;">
            ${objectiveList.map((d, idx) => `
              <div style="font-size:12px;padding:6px 8px;border-radius:6px;background:#162033;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <span>${idx + 1}. [${escapeHtml(d.HotspotCode || '')}] ${escapeHtml(d.QuestionTitle || d.fk_QuestionID)}</span>
                <span style="white-space:nowrap;color:${Number(d.IsCorrect) ? '#86efac' : '#fca5a5'};">
                  作答 ${escapeHtml(d.UserAnswer || '未答')} / 标准 ${escapeHtml(d.CorrectAnswer || '-')} · ${Number(d.EarnedScore) || 0}分
                </span>
              </div>
            `).join('')}
          </div>
        </details>
      `
      : '';

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;border-radius:8px;background:#162033;border:1px solid rgba(56,189,248,0.28);margin-bottom:14px;font-size:12.5px;">
        <div>
          <div>${examineeBanner}</div>
          <div style="color:#94a3b8;margin-top:4px;">
            试卷：${escapeHtml(rec.ExamTitle || rec.fk_ExamID)} · 合格线 ${passScore}/${totalScore} 分 · 当前状态：<strong>${escapeHtml(rec.ReviewStatus || '待阅卷')}</strong>
            ${rec.ReviewerName ? ` · 上次阅卷：${escapeHtml(rec.ReviewerName)} (${escapeHtml(rec.ReviewedAt || '')})` : ''}
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-toggle-blind-mode">${blind ? '👁️ 显示考生身份' : '🙈 切换盲评匿名'}</button>
      </div>
      ${veto ? `<div class="veto-alert triggered" style="margin-bottom:12px;">⚠️ 本卷已触发否定项条款：${escapeHtml(rec.VetoReason || '')}</div>` : ''}
      ${subjHtml}
      ${objSummaryHtml}
    `;

    const updateLiveSummary = () => {
      let subjSum = 0;
      body.querySelectorAll('.gm-score-input').forEach((inp) => {
        const maxV = Number(inp.dataset.max) || 0;
        let v = Number(inp.value);
        if (!Number.isFinite(v) || v < 0) v = 0;
        if (v > maxV) v = maxV;
        subjSum += Math.round(v);
      });
      const totalEst = objScore + subjSum;
      if ($('gm-footer-summary')) {
        $('gm-footer-summary').innerHTML = `客观分 <strong>${objScore}</strong> + 主观分 <strong style="color:#38bdf8;">${subjSum}</strong> = 预计总分 <strong style="color:${totalEst >= passScore ? '#86efac' : '#fca5a5'};">${totalEst} / ${totalScore}</strong>（合格线 ${passScore} 分）`;
      }
    };

    body.querySelectorAll('.gm-score-input').forEach((inp) => {
      inp.addEventListener('input', updateLiveSummary);
    });
    const blindBtn = $('btn-toggle-blind-mode');
    if (blindBtn) {
      blindBtn.addEventListener('click', () => {
        state.gradingBlindMode = !state.gradingBlindMode;
        renderGradingModal();
      });
    }
    if ($('gm-subtitle')) {
      $('gm-subtitle').textContent = `当前阅卷人：${state.currentUser ? `${state.currentUser.FullName} (${state.currentUser.RoleType})` : ''} · 客观题自动判分结果只读锁定`;
    }
    updateLiveSummary();
    if ($('btn-submit-grading')) {
      $('btn-submit-grading').disabled = subjectiveList.length === 0;
    }
  }

  async function handleSubmitGrading() {
    const sess = state.gradingSession;
    const body = $('grading-modal-body');
    if (!sess || !sess.result || !body) return;
    if (!getRolePermissions().allowGrading) {
      showToast('当前角色无权提交手工阅卷打分', 'warn');
      return;
    }
    const grades = [];
    let invalidMsg = '';
    body.querySelectorAll('.gm-score-input').forEach((inp) => {
      const did = inp.dataset.did;
      const maxV = Number(inp.dataset.max) || 0;
      const val = Number(inp.value);
      if (!Number.isFinite(val) || val < 0 || val > maxV) {
        invalidMsg = `手工得分必须在 0 ~ ${maxV} 之间`;
        return;
      }
      const commentEl = body.querySelector(`.gm-comment-input[data-did="${did}"]`);
      grades.push({
        detailId: did,
        score: Math.round(val),
        comment: commentEl ? commentEl.value.trim() : ''
      });
    });
    if (invalidMsg) {
      showToast(invalidMsg, 'warn');
      return;
    }
    if (!grades.length) {
      showToast('没有可提交的主观题评分', 'warn');
      return;
    }
    try {
      const res = await adapter.gradeExamResult(sess.result.pk_ResultID, grades);
      if (!res || !res.ok) {
        showToast((res && res.error) || '保存阅卷打分失败', 'error');
        return;
      }
      closeModal('grading-modal');
      showToast(res.message || '手工阅卷打分已保存', 'success');
      await loadAndRenderScoresTab();
    } catch (err) {
      showToast('提交阅卷打分失败：' + (err && err.message ? err.message : String(err)), 'error');
    }
  }

  // ==========================================
  // 集中习题总表管理（不点图增删改 + CSV 批量导入导出）
  // ==========================================
  function getFlattenedQuestionsList() {
    const hotspots = (state.bank && Array.isArray(state.bank.hotspots)) ? state.bank.hotspots : [];
    const pool = (state.bank && Array.isArray(state.bank.unassignedQuestions)) ? state.bank.unassignedQuestions : [];
    const flat = [];
    pool.forEach((q, qIdx) => {
      flat.push({
        hotspotId: '',
        hotspotCode: '独立池',
        hotspotName: '未关联热点（待分配）',
        isUnassigned: true,
        qIdx: qIdx,
        q: q
      });
    });
    hotspots.forEach((hs) => {
      (hs.questions || []).forEach((q, qIdx) => {
        flat.push({
          hotspotId: hs.id,
          hotspotCode: hs.code || '',
          hotspotName: hs.name || '',
          isUnassigned: false,
          qIdx: qIdx,
          q: q
        });
      });
    });
    return flat;
  }

  function buildQuestionsBankRowsHtml() {
    const f = state.questionBankFilters || { hotspotId: 'ALL', type: 'ALL', keyword: '' };
    const kw = String(f.keyword || '').trim().toLowerCase();
    const all = getFlattenedQuestionsList();
    const poolCount = all.filter((x) => x.isUnassigned).length;
    const filtered = all.filter((item) => {
      if (f.hotspotId === 'UNASSIGNED') {
        if (!item.isUnassigned) return false;
      } else if (f.hotspotId !== 'ALL' && item.hotspotId !== f.hotspotId) {
        return false;
      }
      if (f.type !== 'ALL' && (item.q.type || 'single') !== f.type) return false;
      if (kw) {
        const hay = `${item.hotspotCode} ${item.hotspotName} ${item.q.title || ''} ${item.q.defectCode || ''} ${item.q.referenceStandard || ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    const rowsHtml = filtered.length
      ? filtered.map((item, idx) => {
          const q = item.q;
          const ansText = q.type === 'short_answer'
            ? '<span style="color:#fde68a;">考评员手工打分</span>'
            : `<code>${escapeHtml((q.answer || []).join('、') || '-')}</code>`;
          const defectText = q.defectCode ? `${escapeHtml(q.defectCode)} (${escapeHtml(q.defectLevel || 'general')})` : escapeHtml(q.defectLevel || 'general');
          const hsCell = item.isUnassigned
            ? '<span style="padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(245,158,11,0.2);color:#fde68a;">📌 独立题库池（未关联）</span>'
            : `<code style="color:#38bdf8;">${escapeHtml(item.hotspotCode)}</code><span style="color:#e2e8f0;margin-left:4px;">${escapeHtml(item.hotspotName)}</span>`;
          return `
            <tr style="border-bottom:1px solid rgba(148,163,184,0.14);">
              <td style="padding:7px 8px;text-align:center;color:#94a3b8;">${idx + 1}</td>
              <td style="padding:7px 8px;white-space:nowrap;">${hsCell}</td>
              <td style="padding:7px 8px;white-space:nowrap;"><span class="q-type-badge">${escapeHtml(getTypeLabel(q.type))}</span></td>
              <td style="padding:7px 8px;white-space:nowrap;text-align:center;"><strong>${Number(q.score) || 0}</strong></td>
              <td style="padding:7px 8px;white-space:nowrap;font-size:11.5px;color:#cbd5e1;">${defectText}</td>
              <td style="padding:7px 8px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f8fafc;" title="${escapeHtml(q.title || '')}">${escapeHtml(q.title || '')}</td>
              <td style="padding:7px 8px;white-space:nowrap;">${ansText}</td>
              <td style="padding:7px 8px;white-space:nowrap;text-align:center;">
                <button type="button" class="btn btn-primary btn-sm btn-qb-edit" data-hsid="${escapeHtml(item.hotspotId)}" data-qid="${escapeHtml(q.id)}">✏️ 编辑</button>
                <button type="button" class="btn btn-danger btn-sm btn-qb-del" data-hsid="${escapeHtml(item.hotspotId)}" data-qid="${escapeHtml(q.id)}">删</button>
              </td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="8" style="padding:18px;text-align:center;color:#94a3b8;">当前筛选条件下暂无习题，可点击「➕ 新增习题」先单独设计题目</td></tr>';

    return { total: all.length, poolCount: poolCount, filteredCount: filtered.length, totalScore: getTotalScore(), rowsHtml };
  }

  function renderQuestionsBankPanelHtml() {
    const hotspots = (state.bank && Array.isArray(state.bank.hotspots)) ? state.bank.hotspots : [];
    const f = state.questionBankFilters || { hotspotId: 'ALL', type: 'ALL', keyword: '' };
    const { total, poolCount, filteredCount, totalScore, rowsHtml } = buildQuestionsBankRowsHtml();
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:12px;">
        <div style="color:#cbd5e1;">
          题库共 <strong id="qb-total-num">${total}</strong> 题（已关联试卷满分 <strong id="qb-total-score">${totalScore}</strong> 分 · 独立题库池 <strong style="color:#fde68a;" id="qb-pool-num">${poolCount}</strong> 题 · 筛选显示 <strong id="qb-filtered-num">${filteredCount}</strong> 题）
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button type="button" class="btn btn-success btn-sm" id="btn-qb-add">➕ 新增独立/热点习题</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-qb-export-csv">⬇️ 导出 CSV 模板</button>
          <label class="btn btn-primary btn-sm" style="cursor:pointer;margin:0;">
            ⬆️ 批量导入 (.csv)
            <input type="file" id="input-qb-import-csv" accept=".csv,text/csv" style="display:none;">
          </label>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <select id="qb-filter-hotspot" class="form-control" style="max-width:250px;padding:5px 8px;font-size:12px;">
          <option value="ALL" ${f.hotspotId === 'ALL' ? 'selected' : ''}>全部题目（含独立题库池）</option>
          <option value="UNASSIGNED" ${f.hotspotId === 'UNASSIGNED' ? 'selected' : ''}>📌 独立题库池 / 未关联热点 (${poolCount}题)</option>
          ${hotspots.map((hs) => `<option value="${escapeHtml(hs.id)}" ${f.hotspotId === hs.id ? 'selected' : ''}>[${escapeHtml(hs.code)}] ${escapeHtml(hs.name)} (${(hs.questions || []).length}题)</option>`).join('')}
        </select>
        <select id="qb-filter-type" class="form-control" style="max-width:160px;padding:5px 8px;font-size:12px;">
          <option value="ALL" ${f.type === 'ALL' ? 'selected' : ''}>全部题型</option>
          <option value="single" ${f.type === 'single' ? 'selected' : ''}>单选题</option>
          <option value="multiple" ${f.type === 'multiple' ? 'selected' : ''}>多选题</option>
          <option value="judge" ${f.type === 'judge' ? 'selected' : ''}>判断题</option>
          <option value="short_answer" ${f.type === 'short_answer' ? 'selected' : ''}>文字简答题</option>
        </select>
        <input type="search" id="qb-filter-keyword" class="form-control" style="flex:1;min-width:180px;padding:5px 9px;font-size:12px;" placeholder="按题干 / 缺陷号 / 标准依据 / 设备名筛选…" value="${escapeHtml(f.keyword || '')}">
      </div>
      <div style="overflow:auto;max-height:380px;border:1px solid rgba(148,163,184,0.25);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#090e1a;color:#7dd3fc;">
              <th style="padding:8px;text-align:center;white-space:nowrap;">#</th>
              <th style="padding:8px;text-align:left;white-space:nowrap;">所属设备部位</th>
              <th style="padding:8px;text-align:left;white-space:nowrap;">题型</th>
              <th style="padding:8px;text-align:center;white-space:nowrap;">分值</th>
              <th style="padding:8px;text-align:left;white-space:nowrap;">缺陷级别</th>
              <th style="padding:8px;text-align:left;">题干内容</th>
              <th style="padding:8px;text-align:left;white-space:nowrap;">标准答案 / 评分</th>
              <th style="padding:8px;text-align:center;white-space:nowrap;">操作</th>
            </tr>
          </thead>
          <tbody id="qb-table-body">${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  function refreshQuestionsBankPanel(rowsOnly) {
    if (rowsOnly) {
      const { total, poolCount, filteredCount, totalScore, rowsHtml } = buildQuestionsBankRowsHtml();
      if ($('qb-table-body')) $('qb-table-body').innerHTML = rowsHtml;
      if ($('qb-total-num')) $('qb-total-num').textContent = String(total);
      if ($('qb-pool-num')) $('qb-pool-num').textContent = String(poolCount);
      if ($('qb-total-score')) $('qb-total-score').textContent = String(totalScore);
      if ($('qb-filtered-num')) $('qb-filtered-num').textContent = String(filteredCount);
      bindQuestionsBankRowEvents();
      return;
    }
    const container = $('questions-bank-container');
    if (container) {
      container.innerHTML = renderQuestionsBankPanelHtml();
      bindQuestionsBankPanelEvents();
    }
  }

  function bindQuestionsBankRowEvents() {
    const tbody = $('qb-table-body');
    if (!tbody) return;
    tbody.querySelectorAll('.btn-qb-edit').forEach((btn) => {
      btn.addEventListener('click', () => openQuestionItemModal(btn.dataset.hsid, btn.dataset.qid));
    });
    tbody.querySelectorAll('.btn-qb-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hsId = btn.dataset.hsid || '';
        const qId = btn.dataset.qid;
        if (!hsId) {
          const pool = state.bank.unassignedQuestions || [];
          const qIdx = pool.findIndex((q) => q.id === qId);
          if (qIdx === -1) return;
          const targetTitle = pool[qIdx].title || qId;
          if (!global.confirm(`确定从独立题库池永久删除习题「${targetTitle.slice(0, 36)}」吗？`)) return;
          pool.splice(qIdx, 1);
          await persistEditToBackend(`已从独立题库池删除题目「${targetTitle.slice(0, 24)}」`, '删除独立池习题');
          refreshQuestionsBankPanel(false);
          return;
        }
        const hs = (state.bank.hotspots || []).find((h) => h.id === hsId);
        if (!hs) return;
        const qIdx = (hs.questions || []).findIndex((q) => q.id === qId);
        if (qIdx === -1) return;
        const targetTitle = hs.questions[qIdx].title || qId;
        if (!global.confirm(`确定从「${hs.name}」删除习题「${targetTitle.slice(0, 36)}」吗？`)) return;
        hs.questions.splice(qIdx, 1);
        await persistEditToBackend(`已从习题总表删除题目「${targetTitle.slice(0, 24)}」`, '删除习题');
        refreshQuestionsBankPanel(false);
      });
    });
  }

  function bindQuestionsBankPanelEvents() {
    const hsSel = $('qb-filter-hotspot');
    if (hsSel) {
      hsSel.addEventListener('change', () => {
        state.questionBankFilters.hotspotId = hsSel.value;
        refreshQuestionsBankPanel(true);
      });
    }
    const typeSel = $('qb-filter-type');
    if (typeSel) {
      typeSel.addEventListener('change', () => {
        state.questionBankFilters.type = typeSel.value;
        refreshQuestionsBankPanel(true);
      });
    }
    const kwEl = $('qb-filter-keyword');
    if (kwEl) {
      let composing = false;
      const applyKw = () => {
        state.questionBankFilters.keyword = kwEl.value;
        refreshQuestionsBankPanel(true);
      };
      kwEl.addEventListener('compositionstart', () => { composing = true; });
      kwEl.addEventListener('compositionend', () => { composing = false; applyKw(); });
      kwEl.addEventListener('input', (e) => {
        if (composing || (e && e.isComposing)) return;
        applyKw();
      });
    }
    const addBtn = $('btn-qb-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const fHs = state.questionBankFilters.hotspotId;
        const defHs = (fHs === 'ALL' || fHs === 'UNASSIGNED') ? '' : fHs;
        openQuestionItemModal(defHs, null);
      });
    }
    const expBtn = $('btn-qb-export-csv');
    if (expBtn) {
      expBtn.addEventListener('click', exportQuestionsCsvTemplate);
    }
    const impInp = $('input-qb-import-csv');
    if (impInp) {
      impInp.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => handleImportQuestionsCsv(String(reader.result || ''), file.name);
        reader.readAsText(file, 'utf-8');
        impInp.value = '';
      });
    }
    bindQuestionsBankRowEvents();
  }

  function openQuestionItemModal(hotspotId, questionId) {
    if (!getRolePermissions().modes.includes('edit')) {
      showToast('仅命题教师、审题专家或系统管理员可增改习题', 'warn');
      return;
    }
    const hotspots = (state.bank && state.bank.hotspots) || [];
    const pool = (state.bank && Array.isArray(state.bank.unassignedQuestions)) ? state.bank.unassignedQuestions : [];
    const normalizedHsId = hotspotId || '';
    let existing = null;
    if (questionId) {
      if (!normalizedHsId) {
        existing = pool.find((q) => q.id === questionId) || null;
      } else {
        const targetHs = hotspots.find((h) => h.id === normalizedHsId);
        existing = targetHs ? ((targetHs.questions || []).find((q) => q.id === questionId) || null) : null;
      }
    }
    if (existing) {
      state.editingQuestionItem = {
        isNew: false,
        origHotspotId: normalizedHsId,
        hotspotId: normalizedHsId,
        draft: structuredClone(existing)
      };
    } else {
      state.editingQuestionItem = {
        isNew: true,
        origHotspotId: normalizedHsId,
        hotspotId: normalizedHsId,
        draft: {
          id: 'q-' + Date.now(),
          defectCode: '',
          defectLevel: 'general',
          isMajorDefect: false,
          isCriticalConclusion: false,
          type: 'single',
          score: 2,
          title: '',
          options: [
            { key: 'A', text: '' },
            { key: 'B', text: '' },
            { key: 'C', text: '' },
            { key: 'D', text: '' }
          ],
          answer: ['A'],
          referenceStandard: '',
          explanation: ''
        }
      };
    }
    if ($('qim-title')) {
      $('qim-title').textContent = state.editingQuestionItem.isNew ? '➕ 新增习题（支持先入独立题库池）' : '✏️ 编辑习题';
    }
    renderQuestionItemModal();
    openModal('question-item-modal');
  }

  function syncQuestionItemDraftFromDom() {
    const ctx = state.editingQuestionItem;
    if (!ctx || !ctx.draft) return;
    const d = ctx.draft;
    if ($('qim-hotspot')) ctx.hotspotId = $('qim-hotspot').value;
    if ($('qim-type')) d.type = $('qim-type').value;
    if ($('qim-score')) d.score = Math.max(1, Number($('qim-score').value) || 2);
    if ($('qim-defect-code')) d.defectCode = $('qim-defect-code').value.trim();
    if ($('qim-defect-level')) {
      d.defectLevel = $('qim-defect-level').value;
      d.isMajorDefect = d.defectLevel === 'major';
      d.isCriticalConclusion = d.defectLevel === 'critical';
    }
    if ($('qim-title-input')) d.title = $('qim-title-input').value.trim();
    if ($('qim-ref')) d.referenceStandard = $('qim-ref').value.trim();
    if ($('qim-exp')) d.explanation = $('qim-exp').value.trim();

    if (d.type === 'short_answer') {
      d.answer = [];
    } else {
      document.querySelectorAll('.qim-opt-text').forEach((el) => {
        const idx = Number(el.dataset.oidx);
        if (d.options[idx]) d.options[idx].text = el.value;
      });
      const checked = [];
      document.querySelectorAll('.qim-opt-ans').forEach((cb) => {
        if (cb.checked) checked.push(cb.dataset.key);
      });
      d.answer = checked.length ? checked : [d.options[0] ? d.options[0].key : 'A'];
    }
  }

  function renderQuestionItemModal() {
    const body = $('question-item-modal-body');
    const ctx = state.editingQuestionItem;
    if (!body || !ctx || !ctx.draft) return;
    const d = ctx.draft;
    const hotspots = (state.bank && state.bank.hotspots) || [];
    const isSubj = d.type === 'short_answer';
    const optsHtml = (d.options || []).map((opt, idx) => {
      const checked = (d.answer || []).includes(opt.key);
      return `
        <div class="editor-opt-row">
          <label style="display:flex;align-items:center;gap:4px;white-space:nowrap;cursor:pointer;">
            <input type="checkbox" class="qim-opt-ans" data-key="${escapeHtml(opt.key)}" ${checked ? 'checked' : ''}>
            <span>${escapeHtml(opt.key)}</span>
          </label>
          <input type="text" class="form-control qim-opt-text" data-oidx="${idx}" value="${escapeHtml(opt.text)}" placeholder="请输入选项 ${escapeHtml(opt.key)} 内容">
          <button type="button" class="btn btn-danger btn-sm qim-del-opt" data-oidx="${idx}">删</button>
        </div>
      `;
    }).join('');

    body.innerHTML = `
      <div class="form-grid">
        <div class="form-field" style="grid-column:1 / -1;">
          <label for="qim-hotspot">归属设备部位（可先选「独立题库池」单独设计，稍后在热点编辑中一键关联）</label>
          <select id="qim-hotspot" class="form-control">
            <option value="" ${!ctx.hotspotId ? 'selected' : ''}>📌 暂不关联热点（放入独立题库池，后续在热点编辑中关联）</option>
            ${hotspots.map((hs) => `<option value="${escapeHtml(hs.id)}" ${ctx.hotspotId === hs.id ? 'selected' : ''}>[${escapeHtml(hs.code)}] ${escapeHtml(hs.name)}（${escapeHtml(hs.category)}）</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="qim-type">题型</label>
          <select id="qim-type" class="form-control">
            <option value="single" ${d.type === 'single' ? 'selected' : ''}>单选题</option>
            <option value="multiple" ${d.type === 'multiple' ? 'selected' : ''}>多选题</option>
            <option value="judge" ${d.type === 'judge' ? 'selected' : ''}>判断题</option>
            <option value="short_answer" ${d.type === 'short_answer' ? 'selected' : ''}>文字简答题（考评员手工阅卷）</option>
          </select>
        </div>
        <div class="form-field">
          <label for="qim-score">分值</label>
          <input type="number" id="qim-score" class="form-control" min="1" max="50" value="${Number(d.score) || 2}">
        </div>
        <div class="form-field">
          <label for="qim-defect-code">缺陷编号（选填，如 D1 / G2）</label>
          <input type="text" id="qim-defect-code" class="form-control" value="${escapeHtml(d.defectCode || '')}">
        </div>
        <div class="form-field">
          <label for="qim-defect-level">缺陷级别</label>
          <select id="qim-defect-level" class="form-control">
            <option value="major" ${d.defectLevel === 'major' ? 'selected' : ''}>重大缺陷</option>
            <option value="general" ${d.defectLevel === 'general' ? 'selected' : ''}>一般缺陷</option>
            <option value="interference" ${d.defectLevel === 'interference' ? 'selected' : ''}>正常干扰项</option>
            <option value="safety" ${d.defectLevel === 'safety' ? 'selected' : ''}>安全红线</option>
            <option value="critical" ${d.defectLevel === 'critical' ? 'selected' : ''}>总体验收结论</option>
          </select>
        </div>
      </div>
      <div class="form-field">
        <label for="qim-title-input">题干内容（必填）</label>
        <textarea id="qim-title-input" class="form-control" rows="3" placeholder="请输入题目题干...">${escapeHtml(d.title || '')}</textarea>
      </div>
      ${isSubj ? `
        <div style="padding:9px 12px;border-radius:8px;background:rgba(56,189,248,0.1);border:1px dashed rgba(56,189,248,0.4);font-size:12px;color:#7dd3fc;margin-bottom:10px;">
          ✍️ 文字简答题无需配置选项；请在下方填写参考答案与评分要点，正式考试交卷后由考评员在成绩表中手工阅卷打分。
        </div>
      ` : `
        <div class="form-field">
          <label>选项列表（勾选左侧复选框表示标准答案）</label>
          ${optsHtml}
          <div style="margin-top:6px;">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-qim-add-opt">➕ 添加选项</button>
          </div>
        </div>
      `}
      <div class="form-grid">
        <div class="form-field" style="margin-bottom:0;">
          <label for="qim-ref">标准依据</label>
          <input type="text" id="qim-ref" class="form-control" value="${escapeHtml(d.referenceStandard || '')}" placeholder="如 HJ 2026-2013 / GB 50160">
        </div>
        <div class="form-field" style="margin-bottom:0;">
          <label for="qim-exp">${isSubj ? '参考答案 / 评分要点' : '答案解析'}</label>
          <textarea id="qim-exp" class="form-control" rows="3" placeholder="请输入参考解析或评分要点...">${escapeHtml(d.explanation || '')}</textarea>
        </div>
      </div>
    `;

    const typeSel = $('qim-type');
    if (typeSel) {
      typeSel.addEventListener('change', () => {
        syncQuestionItemDraftFromDom();
        if (d.type === 'judge' && (!d.options || d.options.length > 2 || !d.options[0].text)) {
          d.options = [
            { key: 'A', text: '正确 / 合格' },
            { key: 'B', text: '错误 / 不合格' }
          ];
          d.answer = ['A'];
        } else if (d.type !== 'short_answer' && (!d.options || d.options.length < 2)) {
          d.options = [
            { key: 'A', text: '' },
            { key: 'B', text: '' }
          ];
          d.answer = ['A'];
        }
        renderQuestionItemModal();
      });
    }
    const addOptBtn = $('btn-qim-add-opt');
    if (addOptBtn) {
      addOptBtn.addEventListener('click', () => {
        syncQuestionItemDraftFromDom();
        if (d.options.length >= 5) {
          showToast('最多支持 5 个选项 (A~E)', 'warn');
          return;
        }
        const nextKey = String.fromCharCode(65 + d.options.length);
        d.options.push({ key: nextKey, text: '' });
        renderQuestionItemModal();
      });
    }
    body.querySelectorAll('.qim-del-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncQuestionItemDraftFromDom();
        if (d.options.length <= 2) {
          showToast('客观题至少保留 2 个选项', 'warn');
          return;
        }
        d.options.splice(Number(btn.dataset.oidx), 1);
        d.options.forEach((o, i) => { o.key = String.fromCharCode(65 + i); });
        renderQuestionItemModal();
      });
    });
  }

  async function handleSaveQuestionItem() {
    const ctx = state.editingQuestionItem;
    if (!ctx || !ctx.draft) return;
    syncQuestionItemDraftFromDom();
    const d = ctx.draft;
    if (!d.title) {
      showToast('请填写题干内容', 'warn');
      return;
    }
    if (d.type !== 'short_answer') {
      const validOpts = (d.options || []).filter((o) => String(o.text || '').trim());
      if (validOpts.length < 2) {
        showToast('客观题至少需要填写 2 个非空选项', 'warn');
        return;
      }
      d.options = validOpts.map((o, i) => ({ key: String.fromCharCode(65 + i), text: o.text.trim() }));
      const validKeys = new Set(d.options.map((o) => o.key));
      d.answer = (d.answer || []).filter((k) => validKeys.has(k));
      if (!d.answer.length) d.answer = [d.options[0].key];
    }

    const hotspots = (state.bank && state.bank.hotspots) || [];
    state.bank.unassignedQuestions = Array.isArray(state.bank.unassignedQuestions) ? state.bank.unassignedQuestions : [];
    const targetHsId = ctx.hotspotId || '';
    const origHsId = ctx.origHotspotId || '';
    let targetLabel = '独立题库池';

    if (!ctx.isNew && origHsId !== targetHsId) {
      if (!origHsId) {
        state.bank.unassignedQuestions = state.bank.unassignedQuestions.filter((q) => q.id !== d.id);
      } else {
        const origHs = hotspots.find((h) => h.id === origHsId);
        if (origHs && Array.isArray(origHs.questions)) {
          origHs.questions = origHs.questions.filter((q) => q.id !== d.id);
        }
      }
    }

    if (!targetHsId) {
      const idx = state.bank.unassignedQuestions.findIndex((q) => q.id === d.id);
      if (idx >= 0) state.bank.unassignedQuestions[idx] = d;
      else state.bank.unassignedQuestions.push(d);
    } else {
      const targetHs = hotspots.find((h) => h.id === targetHsId);
      if (!targetHs) {
        showToast('未找到所选设备部位', 'error');
        return;
      }
      targetLabel = targetHs.name;
      targetHs.questions = targetHs.questions || [];
      const idx = targetHs.questions.findIndex((q) => q.id === d.id);
      if (idx >= 0) targetHs.questions[idx] = d;
      else targetHs.questions.push(d);
    }

    closeModal('question-item-modal');
    await persistEditToBackend(
      `${ctx.isNew ? '新增' : '更新'}习题至「${targetLabel}」：${d.title.slice(0, 24)}`,
      ctx.isNew ? '习题总表新增题目' : '习题总表编辑题目'
    );
    refreshQuestionsBankPanel(false);
  }

  function csvEscapeCell(val) {
    const s = String(val == null ? '' : val);
    return `"${s.replace(/"/g, '""')}"`;
  }

  function exportQuestionsCsvTemplate() {
    const header = [
      '设备位号(DeviceCode)', '题型(single/multiple/judge/short_answer)', '分值(Score)',
      '缺陷编号(DefectCode)', '缺陷级别(major/general/interference/safety/critical)',
      '题干(QuestionTitle)', '选项A', '选项B', '选项C', '选项D', '选项E',
      '标准答案(如A或A,B)', '标准依据', '答案解析/评分要点'
    ];
    const rows = [header.map(csvEscapeCell).join(',')];
    getFlattenedQuestionsList().forEach((item) => {
      const q = item.q;
      const optMap = {};
      (q.options || []).forEach((o) => { optMap[o.key] = o.text; });
      rows.push([
        item.hotspotCode,
        q.type || 'single',
        q.score || 2,
        q.defectCode || '',
        q.defectLevel || 'general',
        q.title || '',
        optMap.A || '',
        optMap.B || '',
        optMap.C || '',
        optMap.D || '',
        optMap.E || '',
        q.type === 'short_answer' ? '' : (q.answer || []).join(','),
        q.referenceStandard || '',
        q.explanation || ''
      ].map(csvEscapeCell).join(','));
    });
    const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wmpses-questions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出当前全部习题 CSV（可直接用 Excel 编辑后批量导入）', 'success');
  }

  function parseCsvLines(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const src = String(text || '').replace(/^\ufeff/, '');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"' && src[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(field);
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    return rows;
  }

  async function handleImportQuestionsCsv(csvText, fileName) {
    const rows = parseCsvLines(csvText);
    if (rows.length < 2) {
      showToast('CSV 文件为空或缺少数据行', 'warn');
      return;
    }
    const hotspots = (state.bank && state.bank.hotspots) || [];
    if (!hotspots.length) {
      showToast('当前试卷无可用设备部位', 'error');
      return;
    }
    let addedCount = 0;
    const nowBase = Date.now();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const devCode = String(r[0] || '').trim();
      const rawType = String(r[1] || 'single').trim();
      const qType = ['single', 'multiple', 'judge', 'short_answer'].includes(rawType) ? rawType : 'single';
      const score = Math.max(1, Number(r[2]) || 2);
      const defectCode = String(r[3] || '').trim();
      const rawLvl = String(r[4] || 'general').trim();
      const defectLevel = ['major', 'general', 'interference', 'safety', 'critical'].includes(rawLvl) ? rawLvl : 'general';
      const title = String(r[5] || '').trim();
      if (!title) continue;

      const targetHs = devCode
        ? hotspots.find((h) => h.code === devCode || h.name === devCode || h.id === devCode)
        : null;
      const opts = [];
      ['A', 'B', 'C', 'D', 'E'].forEach((k, idx) => {
        const txt = String(r[6 + idx] || '').trim();
        if (txt) opts.push({ key: k, text: txt });
      });
      if (qType !== 'short_answer' && opts.length < 2) continue;

      const ansRaw = String(r[11] || '').toUpperCase().replace(/[^A-E,]/g, '');
      const answer = qType === 'short_answer'
        ? []
        : (ansRaw ? ansRaw.split(',').filter(Boolean) : [opts[0].key]);

      const newQ = {
        id: `q-csv-${nowBase}-${i}`,
        defectCode: defectCode,
        defectLevel: defectLevel,
        isMajorDefect: defectLevel === 'major',
        isCriticalConclusion: defectLevel === 'critical',
        type: qType,
        score: score,
        title: title,
        options: qType === 'short_answer' ? [] : opts,
        answer: answer,
        referenceStandard: String(r[12] || '').trim(),
        explanation: String(r[13] || '').trim()
      };
      if (targetHs) {
        targetHs.questions = targetHs.questions || [];
        targetHs.questions.push(newQ);
      } else {
        state.bank.unassignedQuestions = Array.isArray(state.bank.unassignedQuestions) ? state.bank.unassignedQuestions : [];
        state.bank.unassignedQuestions.push(newQ);
      }
      addedCount++;
    }
    if (!addedCount) {
      showToast('未解析到有效习题行，请先导出 CSV 模板核对列格式', 'warn');
      return;
    }
    await persistEditToBackend(`从 ${fileName} 批量导入 ${addedCount} 道习题`, 'CSV 批量导入习题');
    refreshQuestionsBankPanel(false);
  }

  async function loadAndRenderScoresTab() {
    const res = await adapter.fetchExamResults({ limit: 200 });
    state.examResultsList = Array.isArray(res.results) ? res.results : [];
    state.examResultsSource = res.source || 'local';
    const container = $('scores-viewer-container');
    if (container) {
      container.innerHTML = renderExamScoresPanelHtml();
      bindScoresPanelEvents();
    }
  }

  function openSettingsModal(initialTab) {
    if (!state.currentUser) {
      showToast('请先登录系统账号', 'warn');
      openLoginModal();
      return;
    }
    const perms = getRolePermissions();
    if (!perms.allowSettings) {
      showToast(`当前角色「${perms.role}」无权访问数据库与题库管理面板`, 'warn');
      return;
    }
    if (initialTab) state.activeSettingsTab = initialTab;
    else state.activeSettingsTab = perms.settingsTabs[0] || 'bank';
    if (!perms.settingsTabs.includes(state.activeSettingsTab)) {
      state.activeSettingsTab = perms.settingsTabs[0] || 'bank';
    }
    renderSettingsModal();
    openModal('settings-modal');
    if (state.activeSettingsTab === 'scores') {
      loadAndRenderScoresTab();
    } else if (state.activeSettingsTab === 'sqlite') {
      loadAndRenderSqliteTab();
    } else if (state.activeSettingsTab === 'bank') {
      loadUsersAndLogsPanel();
    } else if (state.activeSettingsTab === 'fm') {
      loadAndRenderLanHealthPanel();
    }
  }

  function renderSettingsModal() {
    const cfg = adapter.getConfig();
    const perms = getRolePermissions();
    if (!perms.settingsTabs.includes(state.activeSettingsTab)) {
      state.activeSettingsTab = perms.settingsTabs[0] || 'bank';
    }
    const inFM = adapter.isWebViewer();
    $('fm-env-indicator').textContent = inFM
      ? '🟢 当前运行在 FileMaker WebViewer 宿主中'
      : '⚪ 当前运行在独立浏览器模式（FileMaker WebViewer 对象未挂载）';

    const history = adapter.getExamHistory();
    const historyHtml = history.length
      ? history.slice(0, 5).map((h) => `
          <div style="padding:8px 10px;border-radius:7px;background:#162033;margin-bottom:6px;font-size:12px;display:flex;justify-content:space-between;">
            <span>${escapeHtml(h.studentName)} · ${h.earnedScore}/${h.totalScore}分 (${h.passed ? '合格' : '不合格'})</span>
            <span style="color:#94a3b8;">${escapeHtml((h.submittedAt || '').slice(0, 16).replace('T', ' '))}</span>
          </div>
        `).join('')
      : '<div style="color:#94a3b8;font-size:12px;">暂无历史交卷记录</div>';

    const vetoRules = (state.bank && state.bank.vetoRules) || [];
    const vetoCfgHtml = vetoRules.map((r, idx) => `
      <div class="editor-question-box" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <strong>[${escapeHtml(r.code)}] ${escapeHtml(r.name)}</strong>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" class="veto-cfg-enabled" data-vidx="${idx}" ${r.isEnabled ? 'checked' : ''}>
            <span>启用此规则</span>
          </label>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label>判定条件类型（只读）</label>
            <input type="text" class="form-control" value="${escapeHtml(r.conditionType)}" disabled>
          </div>
          <div class="form-field">
            <label>触发阈值 (如 25分钟 / 漏判3项)</label>
            <input type="number" step="1" min="1" class="form-control veto-cfg-threshold" data-vidx="${idx}" value="${r.thresholdValue}">
          </div>
          <div class="form-field">
            <label>触发后处置动作</label>
            <select class="form-control veto-cfg-action" data-vidx="${idx}">
              <option value="ZERO_SCORE" ${r.penaltyAction === 'ZERO_SCORE' ? 'selected' : ''}>直接判 0 分（一票否决）</option>
              <option value="WARN_ONLY" ${r.penaltyAction === 'WARN_ONLY' ? 'selected' : ''}>仅提示警告（不扣分）</option>
            </select>
          </div>
        </div>
        <div class="form-field" style="margin-bottom:0;">
          <label>触发提示说明文案（支持 {threshold} 占位符）</label>
          <input type="text" class="form-control veto-cfg-msg" data-vidx="${idx}" value="${escapeHtml(r.alertMessage)}">
        </div>
      </div>
    `).join('');

    const tabDefs = [
      { id: 'scores', label: '📊 考生成绩表' },
      { id: 'questions', label: '📝 习题总表' },
      { id: 'bank', label: '📦 题库管理与考生信息' },
      { id: 'veto', label: '⚖️ 否定项规则表配置' },
      { id: 'sqlite', label: `🗄️ ${adapter.getBackendType && adapter.getBackendType() === 'mysql' ? 'MySQL' : 'SQLite'} 数据库表预览` },
      { id: 'fm', label: '🔗 数据源与 FileMaker 配置' }
    ].filter((t) => perms.settingsTabs.includes(t.id));

    const body = $('settings-modal-body');
    body.innerHTML = `
      <div class="tabs-bar">
        ${tabDefs.map((t) => `<button type="button" class="tab-btn ${state.activeSettingsTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>

      <div id="tab-panel-scores" style="display:${state.activeSettingsTab === 'scores' && perms.settingsTabs.includes('scores') ? 'block' : 'none'};">
        <div id="scores-viewer-container">${renderExamScoresPanelHtml()}</div>
      </div>

      <div id="tab-panel-questions" style="display:${state.activeSettingsTab === 'questions' && perms.settingsTabs.includes('questions') ? 'block' : 'none'};">
        <div id="questions-bank-container">${renderQuestionsBankPanelHtml()}</div>
      </div>

      <div id="tab-panel-veto" style="display:${state.activeSettingsTab === 'veto' && perms.settingsTabs.includes('veto') ? 'block' : 'none'};">
        <div style="font-size:12.5px;color:#cbd5e1;margin-bottom:10px;">
          修改后点击下方保存按钮，将实时写入 SQLite <code>WMPSES_否定项规则</code> 表并立即作用于后续交卷评判。
        </div>
        ${vetoCfgHtml}
        <div style="margin-top:10px;">
          <button type="button" class="btn btn-success" id="btn-save-veto-rules">💾 保存否定项规则到 SQLite</button>
        </div>
      </div>

      <div id="tab-panel-sqlite" style="display:${state.activeSettingsTab === 'sqlite' && perms.settingsTabs.includes('sqlite') ? 'block' : 'none'};">
        <div id="sqlite-viewer-container">${renderSqliteTableViewerHtml(state.sqliteSnapshot)}</div>
      </div>

      <div id="tab-panel-bank" style="display:${state.activeSettingsTab === 'bank' && perms.settingsTabs.includes('bank') ? 'block' : 'none'};">
        ${perms.allowPickActiveIdentity ? `
        <div class="form-grid">
          <div class="form-field">
            <label>考生姓名</label>
            <input type="text" id="cfg-student-name" class="form-control" value="${escapeHtml(cfg.student.name)}">
          </div>
          <div class="form-field">
            <label>准考证号 / 工号</label>
            <input type="text" id="cfg-student-id" class="form-control" value="${escapeHtml(cfg.student.examineeId)}">
          </div>
        </div>
        ` : ''}
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 16px;">
          <button type="button" class="btn btn-primary" id="btn-export-bank-json">⬇️ 导出当前题库 (.json)</button>
          ${perms.allowBankImport ? `
          <label class="btn btn-ghost" style="cursor:pointer;">
            ⬆️ 导入题库 (.json)
            <input type="file" id="input-import-bank" accept=".json,application/json" style="display:none;">
          </label>
          ` : ''}
          ${perms.modes.includes('edit') ? '<button type="button" class="btn btn-warning" id="btn-bank-open-tpl-modal">🎛️ 管理专业仪表模板</button>' : ''}
          ${perms.allowBankRestore ? '<button type="button" class="btn btn-danger" id="btn-settings-reset-bank">↩️ 恢复出厂默认题库</button>' : ''}
        </div>
        <div id="bank-user-dynamic-area"><div style="color:#94a3b8;font-size:12px;">正在加载人员名册与题库变更审计日志...</div></div>
        <h4 style="margin:14px 0 8px;color:#7dd3fc;">最近本地交卷成绩摘要</h4>
        ${historyHtml}
      </div>

      <div id="tab-panel-fm" style="display:${state.activeSettingsTab === 'fm' && perms.settingsTabs.includes('fm') ? 'block' : 'none'};">
        <div class="form-field">
          <label>数据源工作模式</label>
          <select id="cfg-source-mode" class="form-control">
            <option value="auto" ${cfg.sourceMode === 'auto' ? 'selected' : ''}>自动探测（优先本地 SQLite 服务 / WebViewer / Data API，离线兜底）</option>
            <option value="sqlite" ${cfg.sourceMode === 'sqlite' ? 'selected' : ''}>本地 SQLite 数据库服务 (db/wmpses.db)</option>
            <option value="local" ${cfg.sourceMode === 'local' ? 'selected' : ''}>纯浏览器离线模式（localStorage + 默认题库）</option>
            <option value="webviewer" ${cfg.sourceMode === 'webviewer' ? 'selected' : ''}>FileMaker WebViewer 双向脚本桥接</option>
            <option value="dataapi" ${cfg.sourceMode === 'dataapi' ? 'selected' : ''}>FileMaker Data API (REST)</option>
            <option value="rest" ${cfg.sourceMode === 'rest' ? 'selected' : ''}>自定义 REST API 网关</option>
          </select>
        </div>
        <div class="form-field">
          <label>本地 SQLite 后台服务地址（通过 HTTP/局域网访问时默认自动同源适配）</label>
          <input type="text" id="cfg-sqlite-url" class="form-control" value="${escapeHtml(cfg.sqliteApiUrl || 'http://127.0.0.1:8765')}">
        </div>
        <div id="lan-health-panel" style="margin:10px 0 14px;"></div>

        <h4 style="margin:14px 0 8px;color:#7dd3fc;">1. FileMaker WebViewer 脚本名称映射（配套 XML 已生成在 filemaker_script/）</h4>
        <div class="form-grid">
          <div class="form-field">
            <label>请求加载题库脚本名</label>
            <input type="text" id="cfg-fm-load" class="form-control" value="${escapeHtml(cfg.fmScripts.loadBank)}">
          </div>
          <div class="form-field">
            <label>交卷接收成绩脚本名</label>
            <input type="text" id="cfg-fm-submit" class="form-control" value="${escapeHtml(cfg.fmScripts.submitResult)}">
          </div>
          <div class="form-field">
            <label>保存题库配置脚本名</label>
            <input type="text" id="cfg-fm-save" class="form-control" value="${escapeHtml(cfg.fmScripts.saveBank)}">
          </div>
        </div>

        <h4 style="margin:14px 0 8px;color:#7dd3fc;">2. FileMaker Data API 直连配置</h4>
        <div class="form-grid">
          <div class="form-field">
            <label>FM Server 地址</label>
            <input type="text" id="cfg-dapi-server" class="form-control" placeholder="https://fm.example.com" value="${escapeHtml(cfg.dataApi.serverUrl)}">
          </div>
          <div class="form-field">
            <label>数据库文件名</label>
            <input type="text" id="cfg-dapi-db" class="form-control" placeholder="WMPSES_Exam" value="${escapeHtml(cfg.dataApi.database)}">
          </div>
          <div class="form-field">
            <label>API 版本</label>
            <input type="text" id="cfg-dapi-ver" class="form-control" value="${escapeHtml(cfg.dataApi.apiVersion)}">
          </div>
          <div class="form-field">
            <label>Bearer Token（留空则用账密换取）</label>
            <input type="password" id="cfg-dapi-token" class="form-control" value="${escapeHtml(cfg.dataApi.token)}">
          </div>
          <div class="form-field">
            <label>账号（可选）</label>
            <input type="text" id="cfg-dapi-user" class="form-control" value="${escapeHtml(cfg.dataApi.username)}">
          </div>
          <div class="form-field">
            <label>密码（可选）</label>
            <input type="password" id="cfg-dapi-pass" class="form-control" value="${escapeHtml(cfg.dataApi.password)}">
          </div>
          <div class="form-field">
            <label>题库布局名 / JSON 字段名</label>
            <div style="display:flex;gap:6px;">
              <input type="text" id="cfg-dapi-blayout" class="form-control" value="${escapeHtml(cfg.dataApi.bankLayout)}">
              <input type="text" id="cfg-dapi-bfield" class="form-control" value="${escapeHtml(cfg.dataApi.bankField)}">
            </div>
          </div>
          <div class="form-field">
            <label>交卷成绩布局名</label>
            <input type="text" id="cfg-dapi-rlayout" class="form-control" value="${escapeHtml(cfg.dataApi.resultLayout)}">
          </div>
        </div>

        <h4 style="margin:14px 0 8px;color:#7dd3fc;">3. 自定义 REST 接口（可选中转代理）</h4>
        <div class="form-grid">
          <div class="form-field">
            <label>GET 题库 URL</label>
            <input type="text" id="cfg-rest-get" class="form-control" placeholder="https://api.example.com/bank" value="${escapeHtml(cfg.restApi.getBankUrl)}">
          </div>
          <div class="form-field">
            <label>POST 成绩 URL</label>
            <input type="text" id="cfg-rest-post" class="form-control" placeholder="https://api.example.com/results" value="${escapeHtml(cfg.restApi.postResultUrl)}">
          </div>
          <div class="form-field">
            <label>POST 保存题库 URL</label>
            <input type="text" id="cfg-rest-save" class="form-control" placeholder="https://api.example.com/bank" value="${escapeHtml(cfg.restApi.saveBankUrl)}">
          </div>
          <div class="form-field">
            <label>Authorization 请求头（可选）</label>
            <input type="text" id="cfg-rest-auth" class="form-control" value="${escapeHtml(cfg.restApi.authHeader)}">
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm" id="btn-test-pull-bank">🔄 立即从远端拉取题库</button>
        </div>
      </div>
    `;

    body.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        saveSettingsFromDom(true);
        state.activeSettingsTab = btn.dataset.tab;
        renderSettingsModal();
        if (state.activeSettingsTab === 'scores') {
          loadAndRenderScoresTab();
        } else if (state.activeSettingsTab === 'sqlite') {
          loadAndRenderSqliteTab();
        } else if (state.activeSettingsTab === 'bank') {
          loadUsersAndLogsPanel();
        } else if (state.activeSettingsTab === 'fm') {
          loadAndRenderLanHealthPanel();
        }
      });
    });
    if (state.activeSettingsTab === 'scores') {
      bindScoresPanelEvents();
    } else if (state.activeSettingsTab === 'questions') {
      bindQuestionsBankPanelEvents();
    }

    const exportBtn = $('btn-export-bank-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        downloadJson(state.bank, `wmpses-question-bank-${new Date().toISOString().slice(0, 10)}.json`);
      });
    }

    const importInput = $('input-import-bank');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const parsed = JSON.parse(String(reader.result));
            state.bank = adapter.normalizeQuestionBank(parsed);
            state.answers = {};
            state.practiceChecked = {};
            persistEditToBackend(`成功导入题库（${state.bank.hotspots.length} 个部位）`);
          } catch (err) {
            showToast('题库 JSON 解析失败：' + err.message, 'error');
          }
        };
        reader.readAsText(file, 'utf-8');
      });
    }

    const resetBankBtn = $('btn-settings-reset-bank');
    if (resetBankBtn) {
      resetBankBtn.addEventListener('click', async () => {
        if (!global.confirm('确定恢复出厂默认题库吗？您的自定义热点与修改将被覆盖。')) return;
        const res = await adapter.resetBankWithBackend();
        state.bank = res.bank;
        state.widgetTemplates = res.bank.widgetTemplates || [];
        widgets.registerTemplates(state.widgetTemplates);
        state.answers = {};
        state.practiceChecked = {};
        renderPanoramaImage();
        renderHotspotsAndDock();
        showToast(res.message, 'success');
      });
    }

    const bankTplBtn = $('btn-bank-open-tpl-modal');
    if (bankTplBtn) {
      bankTplBtn.addEventListener('click', () => {
        state.templateOpenedFromEditor = false;
        openTemplateModal();
      });
    }

    const pullBtn = $('btn-test-pull-bank');
    if (pullBtn) {
      pullBtn.addEventListener('click', async () => {
        saveSettingsFromDom(true);
        loadAndRenderLanHealthPanel();
        const res = await adapter.loadQuestionBank();
        state.bank = res.bank;
        $('data-source-badge').textContent = '· ' + res.source;
        renderPanoramaImage();
        renderHotspotsAndDock();
        if (res.error) showToast(res.error, 'warn');
        else showToast('拉取成功：' + res.source, 'success');
      });
    }

    const saveVetoBtn = $('btn-save-veto-rules');
    if (saveVetoBtn) {
      saveVetoBtn.addEventListener('click', () => {
        const rules = state.bank.vetoRules || [];
        document.querySelectorAll('.veto-cfg-enabled').forEach((el) => {
          rules[Number(el.dataset.vidx)].isEnabled = el.checked;
        });
        document.querySelectorAll('.veto-cfg-threshold').forEach((el) => {
          rules[Number(el.dataset.vidx)].thresholdValue = Math.max(1, Number(el.value) || 1);
        });
        document.querySelectorAll('.veto-cfg-action').forEach((el) => {
          rules[Number(el.dataset.vidx)].penaltyAction = el.value;
        });
        document.querySelectorAll('.veto-cfg-msg').forEach((el) => {
          rules[Number(el.dataset.vidx)].alertMessage = el.value.trim();
        });
        persistEditToBackend('已更新《WMPSES_否定项规则》', '修改否定项规则');
      });
    }
  }

  function saveSettingsFromDom(silent) {
    if (!$('cfg-student-name')) return;
    const next = adapter.updateConfig({
      sourceMode: $('cfg-source-mode') ? $('cfg-source-mode').value : undefined,
      sqliteApiUrl: $('cfg-sqlite-url') ? $('cfg-sqlite-url').value.trim() : undefined,
      student: {
        name: $('cfg-student-name').value.trim() || '现场考生',
        examineeId: $('cfg-student-id').value.trim()
      },
      fmScripts: $('cfg-fm-load') ? {
        loadBank: $('cfg-fm-load').value.trim() || '加载仿真题库到WebViewer',
        submitResult: $('cfg-fm-submit').value.trim() || '接收仿真考试交卷成绩',
        saveBank: $('cfg-fm-save').value.trim() || '保存题库热点配置'
      } : undefined,
      dataApi: $('cfg-dapi-server') ? {
        serverUrl: $('cfg-dapi-server').value.trim(),
        database: $('cfg-dapi-db').value.trim(),
        apiVersion: $('cfg-dapi-ver').value.trim() || 'vLatest',
        token: $('cfg-dapi-token').value.trim(),
        username: $('cfg-dapi-user').value.trim(),
        password: $('cfg-dapi-pass').value,
        bankLayout: $('cfg-dapi-blayout').value.trim() || 'QuestionBank_API',
        bankField: $('cfg-dapi-bfield').value.trim() || 'QuestionBankJSON',
        resultLayout: $('cfg-dapi-rlayout').value.trim() || 'ExamResults_API'
      } : undefined,
      restApi: $('cfg-rest-get') ? {
        getBankUrl: $('cfg-rest-get').value.trim(),
        postResultUrl: $('cfg-rest-post').value.trim(),
        saveBankUrl: $('cfg-rest-save').value.trim(),
        authHeader: $('cfg-rest-auth').value.trim()
      } : undefined
    });
    updateHeaderStats();
    if (!silent) {
      showToast('配置已保存', 'success');
    }
    return next;
  }

  // ==========================================
  // 正式系统身份认证登录模块与个人修改密码弹窗
  // ==========================================
  function showLoginFormStep(prefillCode) {
    const confirmBox = $('login-session-confirm-box');
    const formSection = $('login-form-section');
    const footer = $('login-modal-footer');
    if (confirmBox) confirmBox.style.display = 'none';
    if (formSection) formSection.style.display = '';
    if (footer) footer.style.display = '';
    const loginForm = $('login-form');
    const keptSceneId = $('login-scene-select') ? $('login-scene-select').value : '';
    if (loginForm) loginForm.reset();
    if ($('login-scene-select') && keptSceneId) {
      $('login-scene-select').value = keptSceneId;
    }
    if ($('login-username')) {
      $('login-username').value = prefillCode || '';
    }
    if ($('login-password')) {
      $('login-password').value = '';
    }
    if ($('login-error-tip')) $('login-error-tip').textContent = '';
    if ($('login-username')) {
      setTimeout(() => $('login-username').focus(), 30);
    }
  }

  async function loadAvailableExamScenesForPicker() {
    try {
      const res = await adapter.fetchExamScenes();
      if (res && Array.isArray(res.scenes) && res.scenes.length) {
        state.scenesList = res.scenes;
      }
    } catch (e) {
      // ignore offline fallback
    }
    const all = Array.isArray(state.scenesList) ? state.scenesList : [];
    const enabled = all.filter((s) => s.status === '已启用' && Number(s.hotspotCount || 0) > 0);
    const list = enabled.length ? enabled : (all.length ? all : [{
      id: (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1',
      title: (state.bank && state.bank.meta && state.bank.meta.title) || '工业废气治理工（二级/技师）实操模拟仿真考试系统',
      variantCode: 'V1',
      questionCount: getTotalQuestionCount(),
      totalScore: getTotalScore()
    }]);

    const curId = (state.bank && state.bank.meta && state.bank.meta.id) || adapter.getActiveExamId() || 'WMPSES-1.1.1-V1';
    const buildOptionLabel = (s) => {
      const t = s.title || s.id;
      const qCnt = Number(s.questionCount || 0);
      const tScore = Number(s.totalScore || 50);
      return `${t} [${s.variantCode || s.id} · ${qCnt}题/${tScore}分]`;
    };

    const loginSel = $('login-scene-select');
    if (loginSel) {
      const prevVal = loginSel.value;
      loginSel.innerHTML = list.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(buildOptionLabel(s))}</option>`).join('');
      const targetVal = list.some((s) => s.id === prevVal) ? prevVal : (list.some((s) => s.id === curId) ? curId : list[0].id);
      loginSel.value = targetVal;
    }

    const topSel = $('examinee-scene-select');
    if (topSel) {
      topSel.innerHTML = list.map((s) => {
        const shortTitle = String(s.title || s.id).replace('实操模拟仿真考试系统', '').trim();
        return `<option value="${escapeHtml(s.id)}">📚 ${escapeHtml(shortTitle)} (${escapeHtml(s.variantCode || s.id)})</option>`;
      }).join('');
      if (list.some((s) => s.id === curId)) {
        topSel.value = curId;
      }
    }
    syncExamineeSceneSelectUi();
  }

  function syncExamineeSceneSelectUi() {
    const topSel = $('examinee-scene-select');
    if (!topSel) return;
    const isLoggedIn = Boolean(state.currentUser);
    const show = isLoggedIn && isExamineeRole() && topSel.options.length > 1;
    topSel.style.display = show ? 'inline-block' : 'none';
    topSel.disabled = isExamineeExamSealed();
    const curId = (state.bank && state.bank.meta && state.bank.meta.id) || '';
    if (curId && Array.from(topSel.options).some((o) => o.value === curId)) {
      topSel.value = curId;
    }
  }

  async function openLoginModal(options) {
    const opts = options || {};
    if (!state.usersList || !state.usersList.length) {
      const data = await adapter.fetchUsersAndLogs();
      state.usersList = data.users || [];
      state.changeLogs = data.changeLogs || [];
    }
    await loadAvailableExamScenesForPicker();

    const modalEl = $('login-modal');
    const cur = state.currentUser;
    const detectedSession = opts.existingSession || cur || null;
    const isRefreshGate = opts.reason === 'refresh' || !cur;

    if (modalEl) {
      modalEl.classList.toggle('is-locked', isRefreshGate);
    }

    const closeBtn = $('btn-close-login-modal');
    const cancelBtn = $('btn-cancel-login');
    const logoutBtn = $('btn-logout-user');
    if (closeBtn) closeBtn.style.display = cur ? '' : 'none';
    if (cancelBtn) cancelBtn.style.display = cur ? '' : 'none';
    if (logoutBtn) logoutBtn.style.display = cur ? '' : 'none';

    const banner = $('login-current-banner');
    if (banner) {
      if (cur) {
        banner.innerHTML = `🟢 当前活跃会话：<strong>${escapeHtml(cur.FullName)}</strong> <span class="q-type-badge" style="margin:0 4px;">${escapeHtml(cur.RoleType)}</span> 账号 <code>${escapeHtml(cur.UserCode)}</code> · ${escapeHtml(cur.Department || '')}`;
      } else if (detectedSession) {
        banner.innerHTML = `🔒 页面已刷新，系统强制重新登录（检测到残留会话：<strong>${escapeHtml(detectedSession.FullName)}</strong> / <code>${escapeHtml(detectedSession.UserCode || '')}</code>）`;
      } else {
        banner.innerHTML = '🔒 <strong>正式安全登录：</strong>请输入您的考号 / 工号与密码完成身份验证后进入系统。';
      }
    }

    const quickBox = $('login-quick-users');
    if (quickBox) {
      quickBox.innerHTML = (state.usersList || []).map((u) => {
        const isActive = cur && cur.pk_UserID === u.pk_UserID;
        return `
          <button type="button" class="btn ${isActive ? 'btn-primary' : 'btn-ghost'} btn-sm quick-login-card" data-code="${escapeHtml(u.UserCode)}" style="text-align:left;justify-content:flex-start;padding:7px 10px;">
            <span>[${escapeHtml(u.RoleType)}] <strong>${escapeHtml(u.FullName)}</strong> <small style="opacity:0.8;">(${escapeHtml(u.UserCode)})</small></span>
          </button>
        `;
      }).join('');
      quickBox.querySelectorAll('.quick-login-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          $('login-username').value = btn.dataset.code || '';
          $('login-password').value = '';
          $('login-error-tip').textContent = '';
          $('login-password').focus();
        });
      });
    }

    const confirmBox = $('login-session-confirm-box');
    const detailEl = $('login-session-detail');
    const formSection = $('login-form-section');
    const footer = $('login-modal-footer');
    const abortBtn = $('btn-abort-relogin');

    if (detectedSession && !opts.skipSessionConfirm) {
      const loginTimeText = detectedSession.loginAt
        ? String(detectedSession.loginAt).replace('T', ' ').slice(0, 19)
        : '本次浏览器会话';
      if (detailEl) {
        detailEl.innerHTML = `
          <div>· 已保存账号：<strong>${escapeHtml(detectedSession.FullName || '')}</strong>（${escapeHtml(detectedSession.RoleType || '考生')} / <code>${escapeHtml(detectedSession.UserCode || detectedSession.pk_UserID || '')}</code>）</div>
          <div>· 所属单位：${escapeHtml(detectedSession.Department || '未填写')} · 上次登录时间：<code>${escapeHtml(loginTimeText)}</code></div>
        `;
      }
      if (abortBtn) {
        abortBtn.style.display = cur ? '' : 'none';
      }
      if (confirmBox) confirmBox.style.display = 'block';
      if (formSection) formSection.style.display = 'none';
      if (footer) footer.style.display = 'none';
    } else {
      showLoginFormStep('');
    }

    openModal('login-modal');
  }

  function confirmClearSessionAndRelogin() {
    adapter.logoutUser();
    state.currentUser = null;
    stopExamTimer();
    clearPracticeAndExamSessionData();
    switchMode('practice', true);
    applyRolePermissions();
    updateHeaderStats();
    renderHotspotsAndDock();

    const modalEl = $('login-modal');
    if (modalEl) modalEl.classList.add('is-locked');
    if ($('btn-close-login-modal')) $('btn-close-login-modal').style.display = 'none';
    if ($('btn-cancel-login')) $('btn-cancel-login').style.display = 'none';
    if ($('btn-logout-user')) $('btn-logout-user').style.display = 'none';
    if ($('login-current-banner')) {
      $('login-current-banner').innerHTML = '🔓 已清除旧会话与所有未保存信息，请输入账号与密码重新登录。';
    }
    showLoginFormStep('');
    showToast('已清除原有会话信息，请重新输入账号密码登录', 'info');
  }

  async function handleLoginSubmit() {
    const form = $('login-form');
    if (form && !form.reportValidity()) return;

    const username = ($('login-username') ? $('login-username').value : '').trim();
    const password = $('login-password') ? $('login-password').value : '';
    const selectedExamId = $('login-scene-select') ? $('login-scene-select').value : '';
    const errEl = $('login-error-tip');
    if (errEl) errEl.textContent = '';

    const res = await adapter.loginUser(username, password);
    if (!res.ok) {
      if (errEl) errEl.textContent = res.error || '登录失败';
      return;
    }

    state.currentUser = res.user;
    stopExamTimer();
    clearPracticeAndExamSessionData();
    const usersData = await adapter.fetchUsersAndLogs();
    if (Array.isArray(usersData.users) && usersData.users.length) {
      state.usersList = usersData.users;
    }
    const curExamId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
    if (selectedExamId && selectedExamId !== curExamId) {
      await switchActiveExamScene(selectedExamId);
    }
    applyRolePermissions();
    updateHeaderStats();
    renderPanoramaImage();
    renderHotspotsAndDock();
    if ($('login-modal')) $('login-modal').classList.remove('is-locked');
    closeModal('login-modal');
    const sceneTitle = (state.bank && state.bank.meta && state.bank.meta.title) || selectedExamId || curExamId;
    showToast(`登录成功：${res.user.FullName}（${res.user.RoleType}）· 当前考卷：${sceneTitle}`, 'success');
    const permsAfterLogin = getRolePermissions();
    if (!permsAfterLogin.modes.length && permsAfterLogin.allowSettings) {
      openSettingsModal('scores');
    } else if (isExamineeRole() && adapter.fetchExamDraft) {
      const activeExamId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
      const draft = await adapter.fetchExamDraft(activeExamId);
      if (draft && draft.answers && Object.keys(draft.answers).length > 0) {
        const answeredCnt = Object.keys(draft.answers).length;
        const ok = global.confirm(`检测到您上次尚未提交的正式考试草稿（已答 ${answeredCnt} 题，剩余约 ${Math.ceil((draft.remainingSeconds || 60) / 60)} 分钟），是否立即恢复继续考试？`);
        if (ok) {
          switchMode('exam', true);
          state.answers = Object.assign({}, draft.answers);
          startExamTimer(draft.remainingSeconds);
          updateHeaderStats();
          renderHotspotsAndDock();
          showToast(`已恢复上次考试作答进度（${answeredCnt} 题）`, 'success');
        }
      }
    }
  }

  function openPasswordModal() {
    if (!state.currentUser) {
      showToast('请先登录账号后再修改个人密码', 'warn');
      openLoginModal();
      return;
    }
    const u = state.currentUser;
    if ($('pwd-user-summary')) {
      $('pwd-user-summary').innerHTML = `当前登录账号：<strong>${escapeHtml(u.FullName)}</strong> <span class="q-type-badge" style="margin:0 4px;">${escapeHtml(u.RoleType)}</span> 账号 <code>${escapeHtml(u.UserCode)}</code>`;
    }
    if ($('pwd-hash-preview')) {
      $('pwd-hash-preview').textContent = u.Password
        ? `当前本地缓存加密密文 (SHA-256)：${u.Password}`
        : '🔒 当前账号密码采用 SHA-256 不可逆加密存储于数据库（服务端已脱敏隐藏密文）';
    }
    const pwdForm = $('password-form');
    if (pwdForm) pwdForm.reset();
    if ($('pwd-confirm')) $('pwd-confirm').setCustomValidity('');
    if ($('pwd-error-tip')) $('pwd-error-tip').textContent = '';
    openModal('password-modal');
  }

  function syncPasswordConfirmValidity() {
    const newEl = $('pwd-new');
    const confirmEl = $('pwd-confirm');
    if (!newEl || !confirmEl) return;
    if (confirmEl.value && newEl.value !== confirmEl.value) {
      confirmEl.setCustomValidity('两次输入的新密码不一致');
    } else {
      confirmEl.setCustomValidity('');
    }
  }

  async function handlePasswordChangeSubmit() {
    if (!state.currentUser) {
      showToast('请先登录', 'warn');
      return;
    }
    syncPasswordConfirmValidity();
    const pwdForm = $('password-form');
    if (pwdForm && !pwdForm.reportValidity()) return;

    const oldPwd = $('pwd-old') ? $('pwd-old').value : '';
    const newPwd = $('pwd-new') ? $('pwd-new').value : '';
    const confirmPwd = $('pwd-confirm') ? $('pwd-confirm').value : '';
    const errEl = $('pwd-error-tip');
    if (errEl) errEl.textContent = '';

    if (!oldPwd) {
      if (errEl) errEl.textContent = '请输入原密码';
      return;
    }
    if (newPwd.trim().length < 4) {
      if (errEl) errEl.textContent = '新密码长度不能少于 4 位';
      return;
    }
    if (newPwd !== confirmPwd) {
      if (errEl) errEl.textContent = '两次输入的新密码不一致';
      return;
    }

    const res = await adapter.changeUserPassword(state.currentUser.pk_UserID, oldPwd, newPwd);
    if (!res.ok) {
      if (errEl) errEl.textContent = res.error || '密码修改失败';
      return;
    }

    state.currentUser = res.user || Object.assign({}, state.currentUser, { Password: adapter.sha256Hex(newPwd) });
    const usersData = await adapter.fetchUsersAndLogs();
    if (Array.isArray(usersData.users) && usersData.users.length) {
      state.usersList = usersData.users;
    }
    closeModal('password-modal');
    showToast(res.message || '密码修改成功', 'success');
  }

  // ==========================================
  // 专业仪表模板构建器弹窗（WMPSES_工况卡片模板）
  // ==========================================
  function createEmptyTemplateDraft(seedTpl) {
    if (seedTpl) {
      return structuredClone({
        id: seedTpl.id || '',
        code: seedTpl.code || '',
        name: seedTpl.name || '',
        isBuiltin: Boolean(seedTpl.isBuiltin),
        leftPanelType: seedTpl.leftPanelType || 'gauge_dial',
        leftPanelTitle: seedTpl.leftPanelTitle || '',
        leftPanelCode: seedTpl.leftPanelCode || '',
        rightPanelType: seedTpl.rightPanelType || 'dcs_interlock',
        rightPanelTitle: seedTpl.rightPanelTitle || '',
        rightPanelCode: seedTpl.rightPanelCode || '',
        customImageBase64: seedTpl.customImageBase64 || '',
        paramSchema: Array.isArray(seedTpl.paramSchema) && seedTpl.paramSchema.length
          ? seedTpl.paramSchema
          : widgets.buildSchemaForPanels(seedTpl.leftPanelType, seedTpl.rightPanelType)
      });
    }
    const leftType = 'gauge_dial';
    const rightType = 'dcs_interlock';
    return {
      id: '',
      code: 'custom_' + Date.now().toString().slice(-4),
      name: '',
      isBuiltin: false,
      leftPanelType: leftType,
      leftPanelTitle: '左侧现场仪表监测',
      leftPanelCode: 'PI-701',
      rightPanelType: rightType,
      rightPanelTitle: '右侧运行趋势与联锁',
      rightPanelCode: 'TI-701 / SIS',
      customImageBase64: '',
      paramSchema: widgets.buildSchemaForPanels(leftType, rightType)
    };
  }

  async function openTemplateModal() {
    if (!state.currentUser) {
      showToast('请先登录系统账号', 'warn');
      openLoginModal();
      return;
    }
    const perms = getRolePermissions();
    if (!perms.modes.includes('edit')) {
      showToast('当前角色无权管理专业仪表模板', 'warn');
      return;
    }
    const fetched = await adapter.fetchWidgetTemplates();
    if (Array.isArray(fetched.templates) && fetched.templates.length) {
      state.widgetTemplates = fetched.templates;
      widgets.registerTemplates(state.widgetTemplates);
    }
    if (!state.templateDraft) {
      state.templateDraft = createEmptyTemplateDraft(null);
    }
    renderTemplateModal();
    openModal('template-modal');
  }

  function syncTemplateDraftFromDom() {
    const d = state.templateDraft;
    if (!d) return;
    if ($('tpl-code') && !d.isBuiltin) {
      d.code = $('tpl-code').value.trim();
    }
    if ($('tpl-name')) d.name = $('tpl-name').value.trim();
    if ($('tpl-left-type') && !d.isBuiltin) d.leftPanelType = $('tpl-left-type').value;
    if ($('tpl-left-title')) d.leftPanelTitle = $('tpl-left-title').value.trim();
    if ($('tpl-left-code')) d.leftPanelCode = $('tpl-left-code').value.trim();
    if ($('tpl-right-type') && !d.isBuiltin) d.rightPanelType = $('tpl-right-type').value;
    if ($('tpl-right-title')) d.rightPanelTitle = $('tpl-right-title').value.trim();
    if ($('tpl-right-code')) d.rightPanelCode = $('tpl-right-code').value.trim();

    const schema = d.paramSchema || [];
    document.querySelectorAll('.tpl-p-label').forEach((el) => {
      const i = Number(el.dataset.pidx);
      if (schema[i]) schema[i].label = el.value;
    });
    document.querySelectorAll('.tpl-p-default').forEach((el) => {
      const i = Number(el.dataset.pidx);
      if (schema[i]) {
        schema[i].default = schema[i].type === 'number' ? Number(el.value) : el.value;
      }
    });
    document.querySelectorAll('.tpl-p-min').forEach((el) => {
      const i = Number(el.dataset.pidx);
      if (schema[i]) schema[i].min = Number(el.value);
    });
    document.querySelectorAll('.tpl-p-max').forEach((el) => {
      const i = Number(el.dataset.pidx);
      if (schema[i]) schema[i].max = Number(el.value);
    });
    document.querySelectorAll('.tpl-p-unit').forEach((el) => {
      const i = Number(el.dataset.pidx);
      if (schema[i]) schema[i].unit = el.value;
    });
  }

  function updateTemplateLivePreview() {
    syncTemplateDraftFromDom();
    const d = state.templateDraft;
    const preview = $('tpl-live-preview');
    if (!d || !preview) return;
    if (d.isBuiltin && d.code) {
      const demoParams = {};
      (d.paramSchema || []).forEach((f) => { demoParams[f.key] = f.default; });
      preview.innerHTML = widgets.render(d.code, { name: d.name || d.code, code: 'PREVIEW', widgetParams: demoParams }, demoParams);
    } else {
      preview.innerHTML = widgets.previewTemplate(d);
    }
  }

  function renderTemplateModal() {
    const d = state.templateDraft || createEmptyTemplateDraft(null);
    state.templateDraft = d;
    const listBox = $('tpl-list-container');
    const templates = state.widgetTemplates || [];
    if (listBox) {
      listBox.innerHTML = templates.map((t) => {
        const active = (d.id && d.id === t.id) || (d.code && d.code === t.code);
        return `
          <div class="tpl-card-item ${active ? 'active' : ''}" data-code="${escapeHtml(t.code)}" style="padding:8px 10px;border-radius:8px;border:1px solid ${active ? '#38bdf8' : 'rgba(148,163,184,0.24)'};background:${active ? '#162944' : '#0f172a'};cursor:pointer;display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
            <div style="min-width:0;">
              <div style="font-size:11px;margin-bottom:2px;">
                <span class="q-type-badge" style="${t.isBuiltin ? '' : 'background:rgba(34,197,94,0.18);color:#86efac;border-color:rgba(34,197,94,0.45);'}">${t.isBuiltin ? '系统内置' : '自定义模板'}</span>
                <code style="font-size:11px;color:#94a3b8;">${escapeHtml(t.code)}</code>
              </div>
              <div style="font-size:12px;font-weight:600;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
            </div>
            ${t.isBuiltin ? '' : `<button type="button" class="btn btn-danger btn-sm btn-del-tpl" data-id="${escapeHtml(t.id)}" data-name="${escapeHtml(t.name)}" style="padding:2px 6px;font-size:11px;">删</button>`}
          </div>
        `;
      }).join('');

      listBox.querySelectorAll('.tpl-card-item').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-del-tpl')) return;
          const found = templates.find((x) => x.code === card.dataset.code);
          if (found) {
            state.templateDraft = createEmptyTemplateDraft(found);
            renderTemplateModal();
          }
        });
      });

      listBox.querySelectorAll('.btn-del-tpl').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!global.confirm(`确定删除自定义专业仪表模板「${btn.dataset.name}」吗？`)) return;
          const res = await adapter.deleteWidgetTemplate(btn.dataset.id);
          if (!res.ok) {
            showToast(res.error || '删除模板失败', 'error');
            return;
          }
          state.widgetTemplates = res.templates || [];
          widgets.registerTemplates(state.widgetTemplates);
          state.templateDraft = createEmptyTemplateDraft(null);
          renderTemplateModal();
          if ($('editor-modal').classList.contains('open')) {
            renderEditorModalBody();
          }
          showToast(`已删除模板「${btn.dataset.name}」`, 'info');
        });
      });
    }

    const panelOpts = (widgets.PANEL_COMPONENT_TYPES || []).map((c) =>
      `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`
    ).join('');
    if ($('tpl-left-type')) {
      $('tpl-left-type').innerHTML = panelOpts;
      $('tpl-left-type').value = d.leftPanelType || 'gauge_dial';
      $('tpl-left-type').disabled = Boolean(d.isBuiltin);
    }
    if ($('tpl-right-type')) {
      $('tpl-right-type').innerHTML = panelOpts;
      $('tpl-right-type').value = d.rightPanelType || 'dcs_interlock';
      $('tpl-right-type').disabled = Boolean(d.isBuiltin);
    }

    if ($('tpl-id')) $('tpl-id').value = d.id || '';
    if ($('tpl-code')) {
      $('tpl-code').value = d.code || '';
      $('tpl-code').disabled = Boolean(d.isBuiltin);
    }
    if ($('tpl-name')) $('tpl-name').value = d.name || '';
    if ($('tpl-left-title')) $('tpl-left-title').value = d.leftPanelTitle || '';
    if ($('tpl-left-code')) $('tpl-left-code').value = d.leftPanelCode || '';
    if ($('tpl-right-title')) $('tpl-right-title').value = d.rightPanelTitle || '';
    if ($('tpl-right-code')) $('tpl-right-code').value = d.rightPanelCode || '';

    const needImg = d.leftPanelType === 'custom_image_card' || d.rightPanelType === 'custom_image_card';
    if ($('tpl-custom-img-row')) {
      $('tpl-custom-img-row').style.display = needImg ? 'block' : 'none';
    }
    if ($('tpl-custom-img-status')) {
      $('tpl-custom-img-status').textContent = d.customImageBase64
        ? `已上传自定义特写图（约 ${Math.round(d.customImageBase64.length / 1024)} KB）`
        : '尚未选择图片（可在上方点击“选择图片文件”上传局部设备特写）';
    }

    const paramsBox = $('tpl-params-editor');
    if (paramsBox) {
      const schema = d.paramSchema || [];
      paramsBox.innerHTML = schema.length
        ? `
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#090e1a;color:#7dd3fc;">
                <th style="padding:6px 8px;text-align:left;">参数键</th>
                <th style="padding:6px 8px;text-align:left;">显示名称</th>
                <th style="padding:6px 8px;text-align:left;">默认值</th>
                <th style="padding:6px 8px;text-align:left;">最小值</th>
                <th style="padding:6px 8px;text-align:left;">最大值</th>
                <th style="padding:6px 8px;text-align:left;">单位</th>
              </tr>
            </thead>
            <tbody>
              ${schema.map((f, idx) => `
                <tr style="border-bottom:1px solid rgba(148,163,184,0.12);">
                  <td style="padding:5px 8px;color:#94a3b8;white-space:nowrap;"><code>${escapeHtml(f.key)}</code></td>
                  <td style="padding:5px 8px;"><input type="text" class="form-control tpl-p-label" data-pidx="${idx}" value="${escapeHtml(f.label)}" style="padding:4px 6px;font-size:12px;"></td>
                  <td style="padding:5px 8px;">
                    ${f.type === 'select'
                      ? `<select class="form-control tpl-p-default" data-pidx="${idx}" style="padding:4px 6px;font-size:12px;">${(f.options || []).map((o) => `<option value="${escapeHtml(o)}" ${f.default === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`
                      : `<input type="${f.type === 'number' ? 'number' : 'text'}" step="any" class="form-control tpl-p-default" data-pidx="${idx}" value="${escapeHtml(f.default)}" style="padding:4px 6px;font-size:12px;">`}
                  </td>
                  <td style="padding:5px 8px;">${f.type === 'number' ? `<input type="number" step="any" class="form-control tpl-p-min" data-pidx="${idx}" value="${f.min}" style="padding:4px 6px;font-size:12px;width:76px;">` : '-'}</td>
                  <td style="padding:5px 8px;">${f.type === 'number' ? `<input type="number" step="any" class="form-control tpl-p-max" data-pidx="${idx}" value="${f.max}" style="padding:4px 6px;font-size:12px;width:76px;">` : '-'}</td>
                  <td style="padding:5px 8px;">${f.type === 'number' ? `<input type="text" class="form-control tpl-p-unit" data-pidx="${idx}" value="${escapeHtml(f.unit || '')}" style="padding:4px 6px;font-size:12px;width:72px;">` : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `
        : '<div style="padding:10px;color:#94a3b8;font-size:12px;">当前组合无参数项</div>';
    }

    updateTemplateLivePreview();
  }

  async function handleSaveTemplate() {
    syncTemplateDraftFromDom();
    const d = state.templateDraft;
    if (!d) return;
    if (!d.name) {
      showToast('请填写模板在下拉框中的显示名称', 'warn');
      if ($('tpl-name')) $('tpl-name').focus();
      return;
    }
    const res = await adapter.saveWidgetTemplate(d);
    if (!res || !res.ok) {
      showToast((res && res.error) || '保存专业仪表模板失败', 'error');
      return;
    }
    state.widgetTemplates = res.templates || [];
    widgets.registerTemplates(state.widgetTemplates);
    state.templateDraft = createEmptyTemplateDraft(res.template);
    renderTemplateModal();
    showToast(`已保存专业仪表模板「${res.template.name}」到选择源`, 'success');

    if (state.templateOpenedFromEditor && $('editor-modal').classList.contains('open') && state.editingHotspotDraft) {
      state.editingHotspotDraft.widgetType = res.template.code;
      state.editingHotspotDraft.widgetParams = widgets.getDefaultParams(res.template.code);
      renderEditorModalBody();
      closeModal('template-modal');
    }
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function bindGlobalEvents() {
    // 模式切换
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });

    // 3D / 2D 视角切换与快速传送、第一人称漫游控制
    document.querySelectorAll('.scene-view-btn[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => switchSceneViewMode(btn.dataset.view));
    });

    document.querySelectorAll('.btn-teleport-preset[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset || 'overview';
        state.activePresetKey = preset;
        document.querySelectorAll('.btn-teleport-preset').forEach((b) => {
          b.classList.toggle('active', b.dataset.preset === preset);
        });
        if (state.sceneViewMode === '2d') {
          switchSceneViewMode('3d-orbit');
        }
        if (scene3d) scene3d.flyToPreset(preset);
      });
    });

    const meshBtn = $('btn-toggle-3d-mesh');
    if (meshBtn) {
      meshBtn.addEventListener('click', () => {
        const cur = scene3d ? scene3d.getShowTwinMesh() : true;
        const next = !cur;
        if (scene3d) scene3d.setShowTwinMesh(next);
        meshBtn.textContent = next ? '🧊 孪生模型: 叠加' : '🧊 孪生模型: 仅底图';
        meshBtn.classList.toggle('active', !next);
      });
    }

    const flowBtn = $('btn-toggle-3d-flow');
    if (flowBtn) {
      flowBtn.addEventListener('click', () => {
        state.sceneShowFlow = !state.sceneShowFlow;
        flowBtn.textContent = state.sceneShowFlow ? '💨 工艺流向: 开' : '💨 工艺流向: 关';
        if (scene3d) scene3d.setShowFlow(state.sceneShowFlow);
      });
    }

    const resetCamBtn = $('btn-reset-3d-cam');
    if (resetCamBtn) {
      resetCamBtn.addEventListener('click', () => {
        state.activePresetKey = 'overview';
        document.querySelectorAll('.btn-teleport-preset').forEach((b) => {
          b.classList.toggle('active', b.dataset.preset === 'overview');
        });
        if (state.sceneViewMode === '2d') {
          switchSceneViewMode('3d-orbit');
        }
        if (scene3d) scene3d.flyToPreset('overview');
      });
    }

    const fpsDpadMap = [
      { id: 'fps-btn-forward', move: { forward: 1 }, nudge: [1, 0, 0] },
      { id: 'fps-btn-back', move: { forward: -1 }, nudge: [-1, 0, 0] },
      { id: 'fps-btn-left', move: { strafe: -1 }, nudge: [0, -1, 0] },
      { id: 'fps-btn-right', move: { strafe: 1 }, nudge: [0, 1, 0] },
      { id: 'fps-btn-up', move: { lift: 1 }, nudge: [0, 0, 1] },
      { id: 'fps-btn-down', move: { lift: -1 }, nudge: [0, 0, -1] }
    ];
    fpsDpadMap.forEach((cfgBtn) => {
      const el = $(cfgBtn.id);
      if (!el) return;
      let holdTimer = null;
      let heldLong = false;
      const stopHold = () => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (scene3d) scene3d.setFpsMoveInput({ forward: 0, strafe: 0, lift: 0 });
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        heldLong = false;
        if (scene3d) scene3d.setFpsMoveInput(cfgBtn.move);
        holdTimer = setTimeout(() => { heldLong = true; }, 160);
      });
      el.addEventListener('pointerup', stopHold);
      el.addEventListener('pointercancel', stopHold);
      el.addEventListener('pointerleave', stopHold);
      el.addEventListener('click', () => {
        if (!heldLong && scene3d) {
          scene3d.nudgeFps(cfgBtn.nudge[0], cfgBtn.nudge[1], cfgBtn.nudge[2]);
        }
      });
    });

    // 关闭弹窗按钮与遮罩点击
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal(backdrop.id);
      });
    });

    // 原生 <dialog>：清理 returnValue，并为不支持 closedby="any" 的浏览器（如 Safari / WebViewer）提供轻量降级
    document.querySelectorAll('dialog.native-modal').forEach((dialog) => {
      dialog.addEventListener('close', () => {
        dialog.returnValue = '';
      });
    });
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const isOutsideDialog = (e, dialog) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
          pressedOutside = isOutsideDialog(e, dialog);
        });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && isOutsideDialog(e, dialog)) dialog.close();
          pressedOutside = false;
        });
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach((el) => closeModal(el.id));
      }
    });

    // 部位弹窗上/下一题导航
    $('btn-prev-hotspot').addEventListener('click', () => {
      const hsList = state.bank.hotspots || [];
      const idx = hsList.findIndex((h) => h.id === state.activeHotspotId);
      if (idx > 0) openQuestionModal(hsList[idx - 1].id);
    });

    $('btn-next-hotspot').addEventListener('click', () => {
      const hsList = state.bank.hotspots || [];
      const idx = hsList.findIndex((h) => h.id === state.activeHotspotId);
      if (idx >= 0 && idx < hsList.length - 1) {
        openQuestionModal(hsList[idx + 1].id);
      } else {
        closeModal('question-modal');
        submitExamAndShowReport(false);
      }
    });

    // 顶部操作
    $('btn-submit-exam').addEventListener('click', () => {
      if (!state.currentUser) {
        showToast('请先登录系统账号', 'warn');
        openLoginModal();
        return;
      }
      submitExamAndShowReport(false);
    });
    $('btn-open-docs').addEventListener('click', () => openDocsModal('docs'));
    $('btn-reset-exam').addEventListener('click', resetCurrentProgress);
    $('btn-open-settings').addEventListener('click', () => openSettingsModal());
    if ($('btn-open-questions-bank')) {
      $('btn-open-questions-bank').addEventListener('click', () => openSettingsModal('questions'));
    }
    if ($('btn-save-qitem')) {
      $('btn-save-qitem').addEventListener('click', handleSaveQuestionItem);
    }
    if ($('btn-submit-grading')) {
      $('btn-submit-grading').addEventListener('click', handleSubmitGrading);
    }
    const topSceneSel = $('examinee-scene-select');
    if (topSceneSel) {
      topSceneSel.addEventListener('change', async () => {
        const curId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
        const nextId = topSceneSel.value;
        if (!nextId || nextId === curId) return;
        if (isExamineeExamSealed()) {
          topSceneSel.value = curId;
          showToast('🔒 正式考试答卷已提交并封闭，不可切换报考级别', 'warn');
          return;
        }
        if (Object.keys(state.answers).length > 0 || (state.mode === 'exam' && !state.examSubmitted)) {
          const ok = global.confirm('切换报考级别 / 考试场景将清空当前未提交的作答进度，确认切换吗？');
          if (!ok) {
            topSceneSel.value = curId;
            return;
          }
        }
        stopExamTimer();
        await switchActiveExamScene(nextId);
        if (state.mode === 'exam') {
          startExamTimer();
        }
        syncExamineeSceneSelectUi();
        showToast(`已切换至：${(state.bank && state.bank.meta && state.bank.meta.title) || nextId}`, 'success');
      });
    }
    $('btn-open-login').addEventListener('click', openLoginModal);
    $('btn-open-password').addEventListener('click', openPasswordModal);
    $('btn-student-badge').addEventListener('click', () => {
      if (!state.currentUser || !getRolePermissions().allowSettings) {
        openLoginModal();
      } else {
        openSettingsModal('bank');
      }
    });

    // 登录与改密弹窗原生表单提交与验证
    const loginForm = $('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLoginSubmit();
      });
    }
    if ($('btn-confirm-relogin')) {
      $('btn-confirm-relogin').addEventListener('click', confirmClearSessionAndRelogin);
    }
    if ($('btn-abort-relogin')) {
      $('btn-abort-relogin').addEventListener('click', () => {
        if (state.currentUser) {
          closeModal('login-modal');
        }
      });
    }
    global.addEventListener('beforeunload', (e) => {
      if (state.currentUser && (Object.keys(state.answers).length > 0 || (state.mode === 'exam' && !state.examSubmitted))) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    $('btn-logout-user').addEventListener('click', () => {
      adapter.logoutUser();
      state.currentUser = null;
      stopExamTimer();
      state.answers = {};
      state.practiceChecked = {};
      state.examSubmitted = false;
      state.lastReportResult = null;
      switchMode('practice', true);
      applyRolePermissions();
      updateHeaderStats();
      renderHotspotsAndDock();
      document.querySelectorAll('.modal-backdrop.open').forEach((el) => {
        if (el.id !== 'login-modal') el.classList.remove('open');
      });
      document.querySelectorAll('dialog[open]').forEach((el) => {
        if (el.id !== 'login-modal') el.close();
      });
      if ($('login-username')) $('login-username').value = '';
      if ($('login-password')) $('login-password').value = '';
      showToast('已退出登录，请重新选择账号登录', 'info');
      openLoginModal();
    });
    const passwordForm = $('password-form');
    if (passwordForm) {
      passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handlePasswordChangeSubmit();
      });
    }
    if ($('pwd-new')) $('pwd-new').addEventListener('input', syncPasswordConfirmValidity);
    if ($('pwd-confirm')) $('pwd-confirm').addEventListener('input', syncPasswordConfirmValidity);

    // 同步 :user-invalid 与 aria-invalid / aria-describedby，避免隐藏错误被提前朗读
    const linkFieldError = (el, shown) => {
      const errId = el.dataset && el.dataset.error;
      if (!errId) return;
      const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== errId);
      if (shown) ids.push(errId);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    };
    const syncFieldAria = (el) => {
      if (!el || !el.matches || !el.matches('input, select, textarea')) return;
      const invalid = el.matches(':user-invalid');
      el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      linkFieldError(el, invalid);
    };
    document.querySelectorAll('input, select, textarea').forEach(syncFieldAria);
    document.addEventListener('blur', (e) => syncFieldAria(e.target), true);
    document.addEventListener('input', (e) => {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('aria-invalid')) syncFieldAria(e.target);
    });
    document.addEventListener('invalid', (e) => syncFieldAria(e.target), true);
    document.addEventListener('reset', (e) => {
      setTimeout(() => {
        if (e.target && e.target.elements) Array.from(e.target.elements).forEach(syncFieldAria);
      });
    }, true);

    // 成绩单弹窗按钮
    $('btn-toggle-wrong-only').addEventListener('click', () => {
      state.wrongOnlyInReport = !state.wrongOnlyInReport;
      const result = state.lastReportResult && state.examSubmitted ? state.lastReportResult : evaluateExam();
      renderReportModal(result, $('rm-sync-status').textContent);
    });

    $('btn-export-result-json').addEventListener('click', () => {
      const result = state.lastReportResult && state.examSubmitted ? state.lastReportResult : evaluateExam();
      downloadJson(result, `wmpses-result-${new Date().toISOString().slice(0, 10)}.json`);
    });

    // 教师编辑模式按钮
    $('btn-toggle-place-mode').addEventListener('click', () => {
      state.placingNewHotspot = !state.placingNewHotspot;
      $('panorama-stage').classList.toggle('placing-new', state.placingNewHotspot);
      $('btn-toggle-place-mode').textContent = state.placingNewHotspot
        ? '🎯 请在下方图片点击选点（点击取消）'
        : '➕ 在图上新增热点';
    });

    $('panorama-stage').addEventListener('click', (e) => {
      if (state.mode !== 'edit' || !state.placingNewHotspot) return;
      if (e.target.closest('.hotspot-pin') || e.target.closest('.fps-dpad')) return;
      if (state.sceneViewMode !== '2d' && scene3d && scene3d.wasRecentDrag()) return;

      const rect = $('panorama-stage').getBoundingClientRect();
      const x = Math.round(Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      const y = Math.round(Math.min(96, Math.max(4, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
      const pos3d = (state.sceneViewMode !== '2d' && scene3d)
        ? scene3d.screenToWorld3D(e.clientX, e.clientY)
        : (scene3d ? scene3d.inferPos3DFrom2D({ x: x, y: y }) : { x: 0, y: -2, z: 3 });

      const newOrder = state.bank.hotspots.length + 1;
      const wp = widgets.getDefaultParams('generic');
      wp._pos3d = pos3d;
      const newPano = (state.sceneViewMode !== '2d' && scene3d && scene3d.isPanoLocked())
        ? scene3d.screenToPano(e.clientX, e.clientY) : null;
      if (newPano) wp._pano = newPano;

      const newHs = {
        id: 'hs-' + Date.now(),
        order: newOrder,
        code: 'DEV-' + String(newOrder).padStart(2, '0'),
        name: '新增设备部位 ' + newOrder,
        category: '现场设备核查',
        x: x,
        y: y,
        pos3d: pos3d,
        panoPos: newPano,
        presetKey: 'overview',
        widgetType: 'generic',
        widgetParams: wp,
        sceneSummary: '请核查该部位运行状态并完成判定。',
        questions: [
          {
            id: 'q-' + Date.now(),
            defectCode: '',
            defectLevel: 'general',
            isMajorDefect: false,
            type: 'single',
            score: 2,
            title: '请描述在该部位发现的隐患及正确处理方式？',
            options: [
              { key: 'A', text: '合格，符合启动条件' },
              { key: 'B', text: '不合格，需整改复验' }
            ],
            answer: ['B'],
            referenceStandard: '',
            explanation: '请补充本题标准解析。'
          }
        ]
      };

      state.bank.hotspots.push(newHs);
      state.placingNewHotspot = false;
      $('panorama-stage').classList.remove('placing-new');
      $('btn-toggle-place-mode').textContent = '➕ 在图上新增热点';
      persistEditToBackend(`已在图上新增热点「${newHs.name}」`, '新增设备热点');
      openEditorModal(newHs.id);
    });

    $('btn-save-bank').addEventListener('click', () => {
      persistEditToBackend('手动保存同步全部题库', '保存同步题库');
    });

    const examPicInput = $('input-exam-picture');
    if (examPicInput) {
      examPicInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          const dataUri = String(reader.result || '');
          if (!dataUri.startsWith('data:image/')) {
            showToast('请选择有效的图片文件（JPG / PNG / WebP）', 'error');
            return;
          }
          state.bank.meta = state.bank.meta || {};
          state.bank.meta.examPicture = dataUri;
          switchSceneViewMode('2d');
          persistEditToBackend(`已更换 2D 场景底图 (${file.name}) 并切换至 2D 视图`, '更换场景底图');
        };
        reader.readAsDataURL(file);
        examPicInput.value = '';
      });
    }

    const examPic3dInput = $('input-exam-picture-3d');
    if (examPic3dInput) {
      examPic3dInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
          const dataUri = String(reader.result || '');
          if (!dataUri.startsWith('data:image/')) {
            showToast('请选择有效的图片文件（JPG / PNG / WebP）', 'error');
            return;
          }
          state.bank.meta = state.bank.meta || {};
          state.bank.meta.examPicture3d = dataUri;
          delete state.bank.meta.clearExamPicture3d;
          if (scene3d) {
            scene3d.setCustomBackground(dataUri);
          }
          updateCustom3dUiState();
          if (state.sceneViewMode === '2d') {
            switchSceneViewMode('3d-orbit');
          }
          persistEditToBackend(`已更换 3D 全景/漫游底图 (${file.name}) 并存入数据库`, '更换3D底图');
        };
        reader.readAsDataURL(file);
        examPic3dInput.value = '';
      });
    }

    const clear3dBtn = $('btn-clear-exam-picture-3d');
    if (clear3dBtn) {
      clear3dBtn.addEventListener('click', () => {
        if (!global.confirm('确定清除自定义 3D 全景底图，恢复默认数字孪生程序化背景吗？')) return;
        state.bank.meta = state.bank.meta || {};
        state.bank.meta.examPicture3d = '';
        state.bank.meta.clearExamPicture3d = true;
        if (scene3d) {
          scene3d.setCustomBackground(null);
        }
        updateCustom3dUiState();
        persistEditToBackend('已清除自定义 3D 底图，恢复默认孪生背景', '清除3D底图');
      });
    }

    const glbInput = $('input-scene-glb');
    if (glbInput) {
      glbInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.glb')) {
          showToast('请选择 glTF 2.0 二进制模型文件（.glb）', 'error');
          glbInput.value = '';
          return;
        }
        try {
          showToast(`正在解析并加载 3D 模型「${file.name}」...`, 'info');
          const ab = await file.arrayBuffer();
          if (!scene3d) throw new Error('3D 引擎未就绪');
          const info = scene3d.loadGlbModel(ab, file.name);
          state.bank.meta = state.bank.meta || {};
          state.bank.meta.hasScene3dModel = true;
          state.bank.meta.scene3dModelName = file.name;
          state.bank.meta.scene3dModelSize = ab.byteLength;
          if (state.sceneViewMode === '2d') {
            switchSceneViewMode('3d-orbit');
          }
          updateCustom3dUiState();
          renderHotspotsAndDock();

          const examId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
          const upRes = await adapter.uploadScene3dModel(file.name, ab, examId);
          if (Array.isArray(upRes.changeLogs)) {
            state.changeLogs = upRes.changeLogs;
          }
          showToast(
            `已加载真 3D 模型「${file.name}」（${info.meshCount} 网格 / ${info.triangleCount.toLocaleString()} 三角面），${upRes.message}`,
            'success'
          );
        } catch (err) {
          showToast('GLB 模型加载失败：' + (err && err.message ? err.message : String(err)), 'error');
        } finally {
          glbInput.value = '';
        }
      });
    }

    const clearGlbBtn = $('btn-clear-scene-glb');
    if (clearGlbBtn) {
      clearGlbBtn.addEventListener('click', async () => {
        if (!global.confirm('确定清除自定义 GLB 3D 模型，恢复默认程序化数字孪生场景吗？')) return;
        if (scene3d) scene3d.clearGlbModel();
        state.bank.meta = state.bank.meta || {};
        state.bank.meta.hasScene3dModel = false;
        state.bank.meta.scene3dModelName = '';
        state.bank.meta.scene3dModelSize = 0;
        const examId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
        const res = await adapter.clearScene3dModel(examId);
        if (Array.isArray(res.changeLogs)) {
          state.changeLogs = res.changeLogs;
        }
        updateCustom3dUiState();
        renderHotspotsAndDock();
        showToast('已清除自定义 GLB 3D 模型，恢复默认孪生场景', 'success');
      });
    }

    $('btn-restore-default').addEventListener('click', async () => {
      if (!global.confirm('确定恢复出厂默认的 8 个部位与 15 道题目吗？')) return;
      const res = await adapter.resetBankWithBackend();
      state.bank = res.bank;
      state.widgetTemplates = res.bank.widgetTemplates || [];
      widgets.registerTemplates(state.widgetTemplates);
      syncAllSimParamsTo3D();
      if (scene3d) {
        scene3d.setCustomBackground(state.bank.meta && state.bank.meta.examPicture3d ? state.bank.meta.examPicture3d : null);
      }
      updateCustom3dUiState();
      state.answers = {};
      state.practiceChecked = {};
      renderPanoramaImage();
      renderHotspotsAndDock();
      showToast(res.message, 'success');
    });

    const btnOpenScenes = $('btn-open-scenes');
    if (btnOpenScenes) {
      btnOpenScenes.addEventListener('click', openScenesModal);
    }
    const btnSceneNew = $('btn-scene-new');
    if (btnSceneNew) {
      btnSceneNew.addEventListener('click', () => {
        selectSceneForEdit(null);
        renderScenesModal();
      });
    }
    const btnSceneSave = $('btn-scene-save');
    if (btnSceneSave) {
      btnSceneSave.addEventListener('click', () => handleSaveScene(false));
    }
    const btnSceneActivate = $('btn-scene-activate');
    if (btnSceneActivate) {
      btnSceneActivate.addEventListener('click', () => handleSaveScene(true));
    }
    const btnSceneDelete = $('btn-scene-delete');
    if (btnSceneDelete) {
      btnSceneDelete.addEventListener('click', handleDeleteScene);
    }

    // 专业仪表模板构建器弹窗事件
    $('btn-tpl-new').addEventListener('click', () => {
      state.templateDraft = createEmptyTemplateDraft(null);
      renderTemplateModal();
    });
    $('btn-tpl-save').addEventListener('click', handleSaveTemplate);
    ['tpl-left-type', 'tpl-right-type'].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener('change', () => {
          syncTemplateDraftFromDom();
          if (state.templateDraft && !state.templateDraft.isBuiltin) {
            state.templateDraft.paramSchema = widgets.buildSchemaForPanels(
              state.templateDraft.leftPanelType,
              state.templateDraft.rightPanelType
            );
            renderTemplateModal();
          }
        });
      }
    });
    ['tpl-code', 'tpl-name', 'tpl-left-title', 'tpl-left-code', 'tpl-right-title', 'tpl-right-code'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('input', updateTemplateLivePreview);
    });
    $('tpl-params-editor').addEventListener('input', updateTemplateLivePreview);
    $('tpl-params-editor').addEventListener('change', updateTemplateLivePreview);
    $('tpl-custom-image').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file || !state.templateDraft) return;
      const reader = new FileReader();
      reader.onload = function () {
        const uri = String(reader.result || '');
        if (!uri.startsWith('data:image/')) {
          showToast('请选择有效图片文件', 'error');
          return;
        }
        state.templateDraft.customImageBase64 = uri;
        if ($('tpl-custom-img-status')) {
          $('tpl-custom-img-status').textContent = `已加载「${file.name}」（约 ${Math.round(uri.length / 1024)} KB）`;
        }
        updateTemplateLivePreview();
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
    $('btn-tpl-clear-img').addEventListener('click', () => {
      if (!state.templateDraft) return;
      state.templateDraft.customImageBase64 = '';
      if ($('tpl-custom-img-status')) $('tpl-custom-img-status').textContent = '尚未选择图片';
      updateTemplateLivePreview();
    });

    // 热点编辑器弹窗保存/删除
    $('btn-save-hotspot-edit').addEventListener('click', () => {
      const edForm = $('editor-hotspot-form');
      if (edForm && !edForm.reportValidity()) return;
      syncDraftFromDom();
      const draft = state.editingHotspotDraft;
      const idx = state.bank.hotspots.findIndex((h) => h.id === draft.id);
      if (idx !== -1) {
        state.bank.hotspots[idx] = draft;
      }
      if (Array.isArray(state.editingPoolDraft)) {
        state.bank.unassignedQuestions = state.editingPoolDraft;
      }
      closeModal('editor-modal');
      persistEditToBackend(`已更新「${draft.name}」(${(draft.questions || []).length}道题)`, '编辑热点与习题');
    });

    $('btn-delete-hotspot').addEventListener('click', () => {
      const draft = state.editingHotspotDraft;
      if (!draft) return;
      if (!global.confirm(`确定删除热点「${draft.name}」吗？该热点下的题目将自动移回独立题库池保留。`)) return;
      const origHs = (state.bank.hotspots || []).find((h) => h.id === draft.id);
      if (origHs && Array.isArray(origHs.questions) && origHs.questions.length) {
        state.bank.unassignedQuestions = (state.bank.unassignedQuestions || []).concat(structuredClone(origHs.questions));
      }
      state.bank.hotspots = state.bank.hotspots.filter((h) => h.id !== draft.id);
      closeModal('editor-modal');
      persistEditToBackend(`已删除热点「${draft.name}」（原题目已保留至独立题库池）`, '删除设备热点');
    });

    // 设置弹窗保存
    $('btn-save-settings').addEventListener('click', () => {
      saveSettingsFromDom(false);
      closeModal('settings-modal');
    });
  }

  function registerFileMakerHooks() {
    global.__wmpsesOnExternalBankLoaded = function (bank) {
      state.bank = bank;
      state.answers = {};
      state.practiceChecked = {};
      state.examSubmitted = false;
      $('data-source-badge').textContent = '· FileMaker 已同步题库';
      renderPanoramaImage();
      renderHotspotsAndDock();
      showToast(`已从 FileMaker 加载题库（${bank.hotspots.length} 个部位）`, 'success');
    };

    global.__wmpsesOnStudentUpdated = function () {
      updateHeaderStats();
    };

    global.__wmpsesGetBank = function () {
      return state.bank;
    };

    global.__wmpsesGetResult = function () {
      return state.lastReportResult || evaluateExam();
    };

    global.__wmpsesSetMode = function (mode) {
      if (mode === 'practice' || mode === 'exam' || mode === 'edit') {
        switchMode(mode);
      }
    };

    global.__wmpsesResetExam = function () {
      state.answers = {};
      state.practiceChecked = {};
      state.examSubmitted = false;
      state.lastReportResult = null;
      if (state.mode === 'exam') startExamTimer();
      renderHotspotsAndDock();
    };

    global.__wmpsesLoadGLBBase64 = function (base64Str, fileName) {
      try {
        if (!base64Str || !scene3d) return { ok: false, error: '参数或 3D 引擎未就绪' };
        const clean = String(base64Str).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
        const bin = atob(clean);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const info = scene3d.loadGlbModel(bytes.buffer, fileName || 'filemaker-scene.glb');
        if (state.bank && state.bank.meta) {
          state.bank.meta.hasScene3dModel = true;
          state.bank.meta.scene3dModelName = fileName || 'filemaker-scene.glb';
        }
        updateCustom3dUiState();
        renderHotspotsAndDock();
        return { ok: true, info: info };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    };
  }

  // ==========================================
  // 试卷场景浏览与自定义工作台 (WMPSES_试卷场景)
  // ==========================================
  async function openScenesModal() {
    const perms = getRolePermissions();
    if (!state.currentUser || !perms.modes.includes('edit')) {
      showToast('仅命题教师、审题专家或系统管理员可管理试卷场景', 'warn');
      return;
    }
    const res = await adapter.fetchExamScenes();
    state.scenesList = Array.isArray(res.scenes) ? res.scenes : [];
    const curId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
    selectSceneForEdit(curId);
    renderScenesModal();
    openModal('scenes-modal');
  }

  function selectSceneForEdit(examIdOrNull) {
    state.sceneGlbPending = null;
    if (!examIdOrNull) {
      const idx = state.scenesList.length + 1;
      state.sceneDraft = {
        isNew: true,
        id: `WMPSES-1.1.1-V${idx}`,
        title: '工业废气治理工（二级/技师）实操模拟仿真考试系统',
        subtitle: `自定义考核场景 ${idx}`,
        examCode: '6-28-02-05 / 1.1.1',
        variantCode: `V${idx}`,
        totalScore: 50,
        passScore: 30,
        durationMinutes: 30,
        status: '已启用',
        version: '1.0.0',
        examPicture: '',
        clearExamPicture: false,
        examPicture3d: '',
        clearExamPicture3d: false,
        hasScene3dModel: false,
        scene3dModelName: '',
        scene3dModelSize: 0,
        cloneFromExamId: 'WMPSES-1.1.1-V1'
      };
      return;
    }
    const found = state.scenesList.find((s) => s.id === examIdOrNull) || state.scenesList[0];
    if (!found) {
      selectSceneForEdit(null);
      return;
    }
    state.sceneDraft = Object.assign({
      isNew: false,
      clearExamPicture: false,
      clearExamPicture3d: false,
      cloneFromExamId: ''
    }, structuredClone(found));
  }

  function syncSceneDraftFromDom() {
    const d = state.sceneDraft;
    if (!d) return;
    const val = (id, fb) => {
      const el = $(id);
      return el ? el.value : fb;
    };
    if (d.isNew) {
      d.id = val('sc-id', d.id).trim();
      const cloneEl = $('sc-clone-rules');
      d.cloneFromExamId = (cloneEl && cloneEl.checked) ? 'WMPSES-1.1.1-V1' : '';
    }
    d.title = val('sc-title', d.title).trim();
    d.subtitle = val('sc-subtitle', d.subtitle).trim();
    d.examCode = val('sc-code', d.examCode).trim();
    d.variantCode = val('sc-variant', d.variantCode).trim();
    d.status = val('sc-status', d.status);
    d.version = val('sc-version', d.version).trim();
    d.totalScore = Math.max(1, Number(val('sc-total', d.totalScore)) || 50);
    d.passScore = Math.max(0, Number(val('sc-pass', d.passScore)) || 30);
    d.durationMinutes = Math.max(1, Number(val('sc-duration', d.durationMinutes)) || 30);
  }

  function renderScenesModal() {
    const listEl = $('scenes-list');
    const editorEl = $('scenes-editor-pane');
    const countEl = $('scenes-count-badge');
    const delBtn = $('btn-scene-delete');
    if (!listEl || !editorEl) return;

    const curActiveId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
    const d = state.sceneDraft;
    if (countEl) countEl.textContent = String(state.scenesList.length);

    listEl.innerHTML = state.scenesList.map((sc) => {
      const isSelected = d && !d.isNew && d.id === sc.id;
      const isCurrent = sc.id === curActiveId;
      return `
        <div class="scene-card-item${isSelected ? ' selected' : ''}" data-scene-id="${escapeHtml(sc.id)}">
          <div class="scene-card-title">
            <span>${escapeHtml(sc.variantCode || 'V1')} · ${escapeHtml(sc.id)}</span>
            <span class="scene-pill ${isCurrent ? 'active-now' : ''}">${isCurrent ? '当前使用中' : escapeHtml(sc.status)}</span>
          </div>
          <div class="scene-card-sub">${escapeHtml(sc.subtitle || sc.title)}</div>
          <div class="scene-card-tags">
            <span class="scene-pill">热点 ${sc.hotspotCount || 0}</span>
            <span class="scene-pill">习题 ${sc.questionCount || 0}</span>
            ${sc.hasExamPicture ? '<span class="scene-pill has-media">🖼️ 2D底图</span>' : ''}
            ${sc.hasExamPicture3d ? '<span class="scene-pill has-media">🌐 3D全景</span>' : ''}
            ${sc.hasScene3dModel ? '<span class="scene-pill has-glb">📦 GLB模型</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.scene-card-item').forEach((item) => {
      item.addEventListener('click', () => {
        selectSceneForEdit(item.dataset.sceneId);
        renderScenesModal();
      });
    });

    if (delBtn) {
      const perms = getRolePermissions();
      delBtn.style.display = (perms.allowSceneDelete && d && !d.isNew && d.id !== 'WMPSES-1.1.1-V1') ? 'inline-block' : 'none';
    }

    if (!d) {
      editorEl.innerHTML = '<div style="color:#94a3b8;padding:30px;text-align:center;">请从左侧选择一个试卷场景，或点击「新建场景」。</div>';
      return;
    }

    const pic2dHtml = (!d.clearExamPicture && d.examPicture)
      ? `<img src="${d.examPicture}" alt="2D底图预览">`
      : '<span>尚未上传 2D 平面底图<br>（JPG / PNG / WebP）</span>';
    const pic3dHtml = (!d.clearExamPicture3d && d.examPicture3d)
      ? `<img src="${d.examPicture3d}" alt="3D全景底图预览">`
      : '<span>尚未上传 3D 全景底图<br>（推荐 2:1 等距柱状全景图）</span>';

    let glbStatusHtml = '<span>尚未上传 .glb 模型<br>（将使用 3D 全景图或程序化孪生）</span>';
    let hasGlbVisual = false;
    if (state.sceneGlbPending === 'CLEAR') {
      glbStatusHtml = '<span style="color:#fca5a5;">已标记为清除（点击保存生效）</span>';
    } else if (state.sceneGlbPending && state.sceneGlbPending.fileName) {
      hasGlbVisual = true;
      glbStatusHtml = `<strong style="color:#ddd6fe;">📦 ${escapeHtml(state.sceneGlbPending.fileName)}</strong><span>待保存上传 · ${(state.sceneGlbPending.buffer.byteLength / 1024).toFixed(0)} KB</span>`;
    } else if (d.hasScene3dModel) {
      hasGlbVisual = true;
      glbStatusHtml = `<strong style="color:#ddd6fe;">📦 ${escapeHtml(d.scene3dModelName || 'scene.glb')}</strong><span>已入库 SQLite BLOB · ${((d.scene3dModelSize || 0) / 1024).toFixed(0)} KB</span>`;
    }

    editorEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <strong style="font-size:15px;color:#f8fafc;">${d.isNew ? '➕ 新建自定义试卷场景' : '✏️ 编辑试卷场景：' + escapeHtml(d.id)}</strong>
        <span style="font-size:12px;color:#94a3b8;">${d.isNew ? '保存后将写入 WMPSES_试卷场景 表' : '最后更新：' + escapeHtml(d.updatedAt || '-')}</span>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label>试卷场景 ID (pk_ExamID)</label>
          <input type="text" id="sc-id" value="${escapeHtml(d.id)}" ${d.isNew ? '' : 'readonly style="opacity:0.75;"'} placeholder="如 WMPSES-1.1.1-V4">
        </div>
        <div class="form-field">
          <label>变式代号 (VariantCode)</label>
          <input type="text" id="sc-variant" value="${escapeHtml(d.variantCode)}" placeholder="如 V1 / V2 / CUSTOM">
        </div>
        <div class="form-field" style="grid-column: 1 / -1;">
          <label>系统主标题 (Title)</label>
          <input type="text" id="sc-title" value="${escapeHtml(d.title)}">
        </div>
        <div class="form-field" style="grid-column: 1 / -1;">
          <label>考核点与装置副标题 (Subtitle)</label>
          <input type="text" id="sc-subtitle" value="${escapeHtml(d.subtitle)}" placeholder="如 1.1.1 系统启动前设备验收（活性炭吸附＋催化燃烧装置）">
        </div>
        <div class="form-field">
          <label>技能标准编码 (ExamCode)</label>
          <input type="text" id="sc-code" value="${escapeHtml(d.examCode)}">
        </div>
        <div class="form-field">
          <label>启用状态 (Status)</label>
          <select id="sc-status">
            <option value="已启用" ${d.status === '已启用' ? 'selected' : ''}>已启用</option>
            <option value="变式预留" ${d.status === '变式预留' ? 'selected' : ''}>变式预留</option>
            <option value="草稿" ${d.status === '草稿' ? 'selected' : ''}>草稿</option>
            <option value="已停用" ${d.status === '已停用' ? 'selected' : ''}>已停用</option>
          </select>
        </div>
        <div class="form-field">
          <label>满分 / 合格线 / 限时(分)</label>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
            <input type="number" id="sc-total" value="${d.totalScore}" min="1" title="满分">
            <input type="number" id="sc-pass" value="${d.passScore}" min="0" title="合格线">
            <input type="number" id="sc-duration" value="${d.durationMinutes}" min="1" title="限时分钟">
          </div>
        </div>
        <div class="form-field">
          <label>版本号 (Version)</label>
          <input type="text" id="sc-version" value="${escapeHtml(d.version)}">
        </div>
      </div>

      ${d.isNew ? `
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12.5px;color:#cbd5e1;cursor:pointer;">
          <input type="checkbox" id="sc-clone-rules" ${d.cloneFromExamId ? 'checked' : ''}>
          自动复制主基准卷 (WMPSES-1.1.1-V1) 的否定项安全红线规则（N1/N2/N3）
        </label>
      ` : ''}

      <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(148,163,184,0.2);">
        <strong style="font-size:13.5px;color:#7dd3fc;">🎨 场景底图与真 3D 模型配置（优先级：GLB 模型 &gt; 3D 全景底图 &gt; 默认数字孪生）</strong>
        <div class="scene-media-grid">
          <div class="scene-media-box">
            <h4><span>🖼️ 2D 平面底图</span><span style="font-size:11px;color:#94a3b8;">ExamPicture</span></h4>
            <div class="scene-media-preview">${pic2dHtml}</div>
            <div class="scene-media-actions">
              <label class="btn btn-primary btn-sm" style="cursor:pointer;flex:1;text-align:center;">
                选择 2D 底图
                <input type="file" id="sc-file-2d" accept="image/*" style="display:none;">
              </label>
              ${(!d.clearExamPicture && d.examPicture) ? '<button type="button" class="btn btn-ghost btn-sm" id="sc-clear-2d">清除</button>' : ''}
            </div>
          </div>

          <div class="scene-media-box">
            <h4><span>🌐 3D 全景底图</span><span style="font-size:11px;color:#94a3b8;">ExamPicture3D</span></h4>
            <div class="scene-media-preview">${pic3dHtml}</div>
            <div class="scene-media-actions">
              <label class="btn btn-info btn-sm" style="cursor:pointer;flex:1;text-align:center;">
                选择 3D 底图
                <input type="file" id="sc-file-3d" accept="image/*" style="display:none;">
              </label>
              ${(!d.clearExamPicture3d && d.examPicture3d) ? '<button type="button" class="btn btn-ghost btn-sm" id="sc-clear-3d">清除</button>' : ''}
            </div>
          </div>

          <div class="scene-media-box">
            <h4><span>📦 真 3D 模型</span><span style="font-size:11px;color:#94a3b8;">.glb 二进制</span></h4>
            <div class="scene-media-preview">${glbStatusHtml}</div>
            <div class="scene-media-actions">
              <label class="btn btn-purple btn-sm" style="cursor:pointer;flex:1;text-align:center;">
                选择 .glb 模型
                <input type="file" id="sc-file-glb" accept=".glb,model/gltf-binary" style="display:none;">
              </label>
              ${hasGlbVisual ? '<button type="button" class="btn btn-ghost btn-sm" id="sc-clear-glb">清除</button>' : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    // 绑定三个文件上传与清除控件
    const bindImageUpload = (inputId, propName, clearProp) => {
      const inp = $(inputId);
      if (!inp) return;
      inp.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        syncSceneDraftFromDom();
        const reader = new FileReader();
        reader.onload = () => {
          const uri = String(reader.result || '');
          if (!uri.startsWith('data:image/')) {
            showToast('请选择有效的图片文件（JPG / PNG / WebP）', 'error');
            return;
          }
          state.sceneDraft[propName] = uri;
          state.sceneDraft[clearProp] = false;
          renderScenesModal();
          showToast(`已载入「${file.name}」，点击保存后写入数据库`, 'info');
        };
        reader.readAsDataURL(file);
        inp.value = '';
      });
    };

    bindImageUpload('sc-file-2d', 'examPicture', 'clearExamPicture');
    bindImageUpload('sc-file-3d', 'examPicture3d', 'clearExamPicture3d');

    const clr2d = $('sc-clear-2d');
    if (clr2d) {
      clr2d.addEventListener('click', () => {
        syncSceneDraftFromDom();
        state.sceneDraft.examPicture = '';
        state.sceneDraft.clearExamPicture = true;
        renderScenesModal();
      });
    }
    const clr3d = $('sc-clear-3d');
    if (clr3d) {
      clr3d.addEventListener('click', () => {
        syncSceneDraftFromDom();
        state.sceneDraft.examPicture3d = '';
        state.sceneDraft.clearExamPicture3d = true;
        renderScenesModal();
      });
    }
    const glbInp = $('sc-file-glb');
    if (glbInp) {
      glbInp.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.glb')) {
          showToast('请选择 glTF 2.0 二进制模型文件（.glb）', 'error');
          glbInp.value = '';
          return;
        }
        syncSceneDraftFromDom();
        const ab = await file.arrayBuffer();
        state.sceneGlbPending = { fileName: file.name, buffer: ab };
        renderScenesModal();
        showToast(`已载入 3D 模型「${file.name}」，点击保存后写入数据库`, 'info');
        glbInp.value = '';
      });
    }
    const clrGlb = $('sc-clear-glb');
    if (clrGlb) {
      clrGlb.addEventListener('click', () => {
        syncSceneDraftFromDom();
        state.sceneGlbPending = 'CLEAR';
        renderScenesModal();
      });
    }
  }

  async function switchActiveExamScene(examId) {
    adapter.setActiveExamId(examId);
    const loaded = await adapter.loadQuestionBank(examId);
    state.bank = loaded.bank;
    state.answers = {};
    state.practiceChecked = {};
    state.examSubmitted = false;
    state.lastReportResult = null;
    if (scene3d) {
      scene3d.clearGlbModel();
      scene3d.setCustomBackground((state.bank.meta && state.bank.meta.examPicture3d) || null);
      if (adapter.loadScene3dModel) {
        try {
          const glbData = await adapter.loadScene3dModel(examId, state.bank.meta);
          if (glbData && glbData.buffer) {
            scene3d.loadGlbModel(glbData.buffer, glbData.name);
          }
        } catch (err) {
          console.warn('切换场景加载 GLB 失败:', err);
        }
      }
      syncAllSimParamsTo3D();
    }
    updateCustom3dUiState();
    updateHeaderStats();
    renderPanoramaImage();
    updateHeaderStats();
    renderHotspotsAndDock();
  }

  async function handleSaveScene(activateAfter) {
    syncSceneDraftFromDom();
    const d = state.sceneDraft;
    if (!d || !d.id) {
      showToast('请填写有效的试卷场景 ID', 'error');
      return;
    }
    try {
      const saveRes = await adapter.saveExamScene(d);
      const savedId = (saveRes.scene && saveRes.scene.id) || d.id;

      if (state.sceneGlbPending === 'CLEAR') {
        await adapter.clearScene3dModel(savedId);
      } else if (state.sceneGlbPending && state.sceneGlbPending.buffer) {
        await adapter.uploadScene3dModel(state.sceneGlbPending.fileName, state.sceneGlbPending.buffer, savedId);
      }
      state.sceneGlbPending = null;

      const listRes = await adapter.fetchExamScenes();
      state.scenesList = listRes.scenes || saveRes.scenes || [];
      selectSceneForEdit(savedId);
      renderScenesModal();

      const curActiveId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
      if (activateAfter || curActiveId === savedId) {
        await switchActiveExamScene(savedId);
        if (activateAfter) {
          closeModal('scenes-modal');
          showToast(`已保存并切换至试卷场景「${d.subtitle || d.id}」`, 'success');
          return;
        }
      }
      showToast(`试卷场景「${savedId}」已保存至数据库`, 'success');
    } catch (err) {
      showToast('保存试卷场景失败：' + (err && err.message ? err.message : String(err)), 'error');
    }
  }

  async function handleDeleteScene() {
    if (!getRolePermissions().allowSceneDelete) {
      showToast('仅命题教师或系统管理员可删除试卷场景', 'warn');
      return;
    }
    const d = state.sceneDraft;
    if (!d || d.isNew || d.id === 'WMPSES-1.1.1-V1') return;
    if (!global.confirm(`确定永久删除试卷场景「${d.id}」及其关联热点和习题吗？`)) return;
    try {
      const res = await adapter.deleteExamScene(d.id);
      state.scenesList = res.scenes || [];
      const curActiveId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
      if (curActiveId === d.id) {
        await switchActiveExamScene('WMPSES-1.1.1-V1');
      }
      selectSceneForEdit('WMPSES-1.1.1-V1');
      renderScenesModal();
      showToast(`已删除试卷场景「${d.id}」`, 'success');
    } catch (err) {
      showToast('删除失败：' + (err && err.message ? err.message : String(err)), 'error');
    }
  }

  function updateCustom3dUiState() {
    const hasCustom3d = Boolean(state.bank && state.bank.meta && state.bank.meta.examPicture3d);
    const hasGlb = Boolean((scene3d && scene3d.hasGlbModel()) || (state.bank && state.bank.meta && state.bank.meta.hasScene3dModel));
    const clearBtn = $('btn-clear-exam-picture-3d');
    if (clearBtn) {
      clearBtn.style.display = hasCustom3d ? 'inline-block' : 'none';
    }
    const clearGlbBtn = $('btn-clear-scene-glb');
    if (clearGlbBtn) {
      clearGlbBtn.style.display = hasGlb ? 'inline-block' : 'none';
    }
    const meshBtn = $('btn-toggle-3d-mesh');
    if (meshBtn) {
      const isMeshOn = scene3d ? scene3d.getShowTwinMesh() : true;
      meshBtn.textContent = isMeshOn ? '🧊 孪生模型: 叠加' : '🧊 孪生模型: 仅底图';
      meshBtn.classList.toggle('active', !isMeshOn);
      meshBtn.style.display = hasGlb ? 'none' : '';
    }
  }

  async function init() {
    // 每次页面刷新均强制重新登录：先读取残留 session 用于二次确认提示，不自动进入已登录态
    const existingSession = adapter.getStoredSession();
    state.currentUser = null;
    if (scene3d) {
      scene3d.init({
        canvas: $('plant-3d-canvas'),
        glbCanvas: $('plant-glb-canvas'),
        viewMode: state.sceneViewMode,
        hotspots: [],
        onProject: update3DProjectionPins,
        onStateChange: updateFpsHudDisplay
      });
    }
    applyRolePermissions();
    updateHeaderStats();
    renderPanoramaImage();
    bindGlobalEvents();
    registerFileMakerHooks();
    switchSceneViewMode(state.sceneViewMode);

    const loaded = await adapter.loadQuestionBank();
    state.bank = loaded.bank;
    if (scene3d && state.bank.meta && state.bank.meta.examPicture3d) {
      scene3d.setCustomBackground(state.bank.meta.examPicture3d);
    }
    if (scene3d && adapter.loadScene3dModel) {
      try {
        const examId = (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1';
        const glbData = await adapter.loadScene3dModel(examId, state.bank.meta);
        if (glbData && glbData.buffer) {
          scene3d.loadGlbModel(glbData.buffer, glbData.name);
        }
      } catch (err) {
        console.warn('自动加载 GLB 模型失败:', err);
      }
    }
    updateCustom3dUiState();
    $('data-source-badge').textContent = '· ' + loaded.source;

    const bankTemplates = (state.bank && Array.isArray(state.bank.widgetTemplates) && state.bank.widgetTemplates.length)
      ? state.bank.widgetTemplates
      : (await adapter.fetchWidgetTemplates()).templates;
    state.widgetTemplates = bankTemplates || [];
    widgets.registerTemplates(state.widgetTemplates);
    syncAllSimParamsTo3D();

    const usersData = await adapter.fetchUsersAndLogs();
    state.usersList = usersData.users || [];
    state.changeLogs = usersData.changeLogs || [];

    applyRolePermissions();
    updateHeaderStats();
    renderPanoramaImage();
    renderHotspotsAndDock();

    // 强制弹出正式登录模块；若存在历史 session，先要求用户确认清除旧信息后再重新登录
    openLoginModal({ reason: 'refresh', existingSession: existingSession });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
