/**
 * 工业废气治理工实操模拟仿真考试系统 - 核心交互控制器
 */
(function (global) {
  'use strict';

  const adapter = global.FMDataAdapter;
  const widgets = global.VisualWidgets;

  const state = {
    mode: 'practice', // 'practice' | 'exam' | 'edit'
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
    activeSettingsTab: 'bank',
    activeDocsTab: 'docs',
    activeSqliteTable: 'WMPSES_设备热点',
    sqliteSnapshot: null
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
    if (el) el.classList.add('open');
  }

  function closeModal(modalId) {
    const el = $(modalId);
    if (el) el.classList.remove('open');
  }

  function arraysEqual(a, b) {
    const sa = (a || []).slice().sort();
    const sb = (b || []).slice().sort();
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
    return Array.isArray(ans) && ans.length > 0;
  }

  function getHotspotProgress(hs) {
    const questions = hs.questions || [];
    const total = questions.length;
    let answered = 0;
    let wrongCount = 0;

    questions.forEach((q) => {
      if (isQuestionAnswered(q)) {
        answered++;
        const showJudge = state.mode === 'practice'
          ? Boolean(state.practiceChecked[q.id])
          : state.examSubmitted;
        if (showJudge && !arraysEqual(state.answers[q.id], q.answer)) {
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

    const cfg = adapter.getConfig();
    $('student-name-display').textContent = cfg.student.name || '现场考生';

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
    if (global.PLANT_IMAGE_BASE64) {
      img.src = global.PLANT_IMAGE_BASE64;
    } else {
      img.src = 'assets/plant-panorama.jpg';
    }
    img.onerror = function () {
      if (img.src !== 'assets/plant-panorama.jpg') {
        img.src = 'assets/plant-panorama.jpg';
      }
    };
  }

  function renderHotspotsAndDock() {
    const layer = $('hotspot-layer');
    const dock = $('device-dock');
    if (!layer || !dock || !state.bank) return;

    layer.innerHTML = '';
    dock.innerHTML = '';

    const hotspots = state.bank.hotspots || [];
    hotspots.forEach((hs, index) => {
      const displayOrder = index + 1;
      const prog = getHotspotProgress(hs);
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = `hotspot-pin ${prog.statusClass}${state.mode === 'edit' ? ' mode-edit' : ''}`;
      pin.style.left = `${hs.x}%`;
      pin.style.top = `${hs.y}%`;
      pin.dataset.hotspotId = hs.id;
      pin.title = `${hs.code} ${hs.name} (${prog.answered}/${prog.total})`;

      pin.innerHTML = `
        <span class="hotspot-core">
          <span class="hotspot-pulse"></span>
          ${displayOrder}
        </span>
        <span class="hotspot-label">
          <span>${escapeHtml(hs.name)}</span>
          <span class="hotspot-badge">${state.mode === 'edit' ? `${hs.x.toFixed(1)}%,${hs.y.toFixed(1)}%` : `${prog.answered}/${prog.total}`}</span>
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
            <span>${prog.answered}/${prog.total}题</span>
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
        persistEditToBackend(`已移动「${hs.name}」至 (${hs.x}%, ${hs.y}%)`);
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
    if (state.mode === 'edit') {
      openEditorModal(hotspotId);
      return;
    }
    openQuestionModal(hotspotId);
  }

  function getTypeLabel(type) {
    if (type === 'multiple') return '多选题';
    if (type === 'judge') return '判断题';
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

  function openQuestionModal(hotspotId) {
    const hotspots = state.bank.hotspots || [];
    const idx = hotspots.findIndex((h) => h.id === hotspotId);
    if (idx === -1) return;

    state.activeHotspotId = hotspotId;
    const hs = hotspots[idx];

    $('qm-code').textContent = hs.code;
    $('qm-title').textContent = `${idx + 1}. ${hs.name}`;
    $('qm-category').textContent = hs.category;

    // 渲染顶部现场仿真工况 SVG 卡片
    $('visual-widget-container').innerHTML = widgets.render(hs.widgetType, hs);

    // 渲染习题列表
    renderQuestionsForHotspot(hs);

    $('btn-prev-hotspot').disabled = idx === 0;
    $('btn-next-hotspot').textContent = idx === hotspots.length - 1 ? '完成并查看汇总 →' : '下一部位 →';

    openModal('question-modal');
  }

  function renderQuestionsForHotspot(hs) {
    const container = $('question-list-container');
    const questions = hs.questions || [];
    const prog = getHotspotProgress(hs);
    $('qm-progress-text').textContent = `本部位作答进度：${prog.answered} / ${prog.total}`;

    if (!questions.length) {
      container.innerHTML = `<div class="question-card" style="text-align:center;color:#94a3b8;">当前部位暂未配置习题，可在“教师编辑/标点”模式中添加。</div>`;
      return;
    }

    container.innerHTML = questions.map((q, qIdx) => {
      const selected = state.answers[q.id] || [];
      const showFeedback = state.mode === 'practice'
        ? Boolean(state.practiceChecked[q.id])
        : state.examSubmitted;
      const isCorrect = showFeedback && arraysEqual(selected, q.answer);
      const locked = state.mode === 'exam' && state.examSubmitted;
      const defectTag = showFeedback ? getDefectTag(q) : null;

      const optionsHtml = (q.options || []).map((opt) => {
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

      let actionHtml = '';
      if (state.mode === 'practice') {
        if (!showFeedback && q.type === 'multiple') {
          actionHtml = `
            <div class="q-actions">
              <button type="button" class="btn btn-primary btn-sm btn-check-multi" data-qid="${escapeHtml(q.id)}" ${selected.length ? '' : 'disabled'}>确认本题判定</button>
              <span style="font-size:12px;color:#94a3b8;">请选择所有符合题意的选项后点击确认</span>
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

    // 绑定选项点击事件
    container.querySelectorAll('.option-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.dataset.qid;
        const key = btn.dataset.key;
        handleOptionClick(hs, qid, key);
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

  function startExamTimer() {
    stopExamTimer();
    const mins = (state.bank && state.bank.meta && Number(state.bank.meta.durationMinutes)) || 30;
    state.examDurationSeconds = mins * 60;
    state.remainingSeconds = state.examDurationSeconds;
    state.examStartTime = Date.now();
    state.overtimeTriggered = false;
    updateTimerDisplay();

    state.timerId = setInterval(() => {
      if (state.examSubmitted || state.mode !== 'exam') {
        stopExamTimer();
        return;
      }
      state.remainingSeconds -= 1;
      updateTimerDisplay();
      if (state.remainingSeconds <= 0) {
        stopExamTimer();
        state.overtimeTriggered = true;
        showToast('考试时间到！系统已自动交卷（触发超时规则 N1）', 'warn');
        submitExamAndShowReport(true);
      }
    }, 1000);
  }

  function switchMode(newMode) {
    if (state.mode === newMode) return;

    if (state.mode === 'exam' && !state.examSubmitted && Object.keys(state.answers).length > 0) {
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
      state.answers = {};
      state.practiceChecked = {};
      state.examSubmitted = false;
      state.lastReportResult = null;
      startExamTimer();
      $('stage-hint').innerHTML = '📝 <strong>正式考试中：</strong>请核查装置全部 8 个部位并作答，全部完成后点击右上角“提交试卷”。';
      showToast('已进入正式考试模式，30分钟倒计时开始', 'info');
    } else if (newMode === 'edit') {
      updateTimerDisplay();
      $('stage-hint').innerHTML = '🛠️ <strong>标点与编辑模式：</strong>拖动图上任意圆标可调整位置，点击圆标可修改设备信息与习题。';
    } else {
      state.examSubmitted = false;
      updateTimerDisplay();
      $('stage-hint').innerHTML = '💡 <strong>练习演示模式：</strong>点击装置图上闪烁的热点圆标（或下方设备导航卡片），即答即评并查看标准解析。';
    }

    renderHotspotsAndDock();
  }

  function resetCurrentProgress() {
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

    hotspots.forEach((hs) => {
      (hs.questions || []).forEach((q) => {
        totalCount++;
        const userAns = state.answers[q.id] || [];
        const isCorrect = arraysEqual(userAns, q.answer);
        if (isCorrect) {
          earnedScore += Number(q.score) || 0;
          correctCount++;
        } else {
          if (q.isMajorDefect) majorMissedCount++;
          if (q.isCriticalConclusion) criticalConclusionWrong = true;
        }
        details.push({
          hotspotId: hs.id,
          hotspotCode: hs.code,
          hotspotName: hs.name,
          questionId: q.id,
          defectCode: q.defectCode || '',
          defectLevel: q.defectLevel || '',
          title: q.title,
          score: Number(q.score) || 0,
          earned: isCorrect ? (Number(q.score) || 0) : 0,
          isCorrect: isCorrect,
          userAnswer: userAns,
          correctAnswer: q.answer || [],
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

    return {
      examId: (state.bank && state.bank.meta && state.bank.meta.id) || 'WMPSES-1.1.1-V1',
      studentName: cfg.student.name || '现场考生',
      examineeId: cfg.student.examineeId || '',
      examCode: (state.bank && state.bank.meta && state.bank.meta.examCode) || '1.1.1',
      mode: state.mode,
      earnedScore: earnedScore,
      effectiveScore: effectiveScore,
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
      const result = evaluateExam();
      state.lastReportResult = result;
      const sync = await adapter.submitExamResult(result);
      renderReportModal(result, sync.syncMessage);
      renderHotspotsAndDock();
      openModal('report-modal');
      return;
    }

    // 练习模式汇总，或已交卷再次查看成绩单
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
    state.editingHotspotDraft = JSON.parse(JSON.stringify(hs));
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
            <button type="button" class="btn btn-danger btn-sm ed-del-q" data-qidx="${qIdx}">删除本题</button>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <label>题型</label>
              <select class="form-control ed-q-type" data-qidx="${qIdx}">
                <option value="single" ${q.type === 'single' ? 'selected' : ''}>单选题</option>
                <option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>多选题</option>
                <option value="judge" ${q.type === 'judge' ? 'selected' : ''}>判断题</option>
              </select>
            </div>
            <div class="form-field">
              <label>分值</label>
              <input type="number" min="1" max="50" class="form-control ed-q-score" data-qidx="${qIdx}" value="${Number(q.score) || 2}">
            </div>
            <div class="form-field">
              <label>缺陷编号（如 D1 / G1）</label>
              <input type="text" class="form-control ed-q-defect-code" data-qidx="${qIdx}" value="${escapeHtml(q.defectCode || '')}">
            </div>
            <div class="form-field">
              <label>缺陷级别</label>
              <select class="form-control ed-q-defect-level" data-qidx="${qIdx}">
                <option value="major" ${q.defectLevel === 'major' ? 'selected' : ''}>重大缺陷</option>
                <option value="general" ${q.defectLevel === 'general' ? 'selected' : ''}>一般缺陷</option>
                <option value="interference" ${q.defectLevel === 'interference' ? 'selected' : ''}>正常干扰项</option>
                <option value="safety" ${q.defectLevel === 'safety' ? 'selected' : ''}>安全红线</option>
                <option value="critical" ${q.defectLevel === 'critical' ? 'selected' : ''}>总体验收结论</option>
              </select>
            </div>
          </div>
          <div class="form-field">
            <label>题干内容</label>
            <textarea class="form-control ed-q-title" data-qidx="${qIdx}">${escapeHtml(q.title)}</textarea>
          </div>
          <div class="form-field">
            <label>选项列表（勾选左侧复选框表示标准答案）</label>
            ${optsHtml}
            <div>
              <button type="button" class="btn btn-ghost btn-sm ed-add-opt" data-qidx="${qIdx}">➕ 添加选项</button>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <label>标准依据</label>
              <input type="text" class="form-control ed-q-ref" data-qidx="${qIdx}" value="${escapeHtml(q.referenceStandard || '')}">
            </div>
            <div class="form-field">
              <label>答案解析</label>
              <textarea class="form-control ed-q-exp" data-qidx="${qIdx}">${escapeHtml(q.explanation || '')}</textarea>
            </div>
          </div>
        </div>
      `;
    }).join('');

    body.innerHTML = `
      <div class="form-grid">
        <div class="form-field">
          <label>设备位号</label>
          <input type="text" id="ed-hs-code" class="form-control" value="${escapeHtml(hs.code)}">
        </div>
        <div class="form-field">
          <label>设备部位名称</label>
          <input type="text" id="ed-hs-name" class="form-control" value="${escapeHtml(hs.name)}">
        </div>
        <div class="form-field">
          <label>所属验收方面</label>
          <input type="text" id="ed-hs-cat" class="form-control" value="${escapeHtml(hs.category)}">
        </div>
        <div class="form-field">
          <label>顶部工况可视化卡片</label>
          <select id="ed-hs-widget" class="form-control">${widgetOptionsHtml}</select>
        </div>
        <div class="form-field">
          <label>X 坐标百分比 (2 ~ 98)</label>
          <input type="number" step="0.1" min="2" max="98" id="ed-hs-x" class="form-control" value="${hs.x}">
        </div>
        <div class="form-field">
          <label>Y 坐标百分比 (4 ~ 96)</label>
          <input type="number" step="0.1" min="4" max="96" id="ed-hs-y" class="form-control" value="${hs.y}">
        </div>
      </div>
      <div class="form-field">
        <label>现场工况描述（通用卡展示文本）</label>
        <input type="text" id="ed-hs-summary" class="form-control" value="${escapeHtml(hs.sceneSummary || '')}">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 10px;">
        <h3 style="margin:0;font-size:14px;color:#7dd3fc;">关联习题 (${(hs.questions || []).length} 题)</h3>
        <button type="button" class="btn btn-primary btn-sm" id="btn-ed-add-question">➕ 新增习题</button>
      </div>
      ${questionsHtml}
    `;

    bindEditorDraftEvents();
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
    hs.sceneSummary = $('ed-hs-summary').value.trim();

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
      const checkedKeys = [];
      document.querySelectorAll(`.ed-opt-ans[data-qidx="${qIdx}"]`).forEach((cb) => {
        if (cb.checked) checkedKeys.push(cb.dataset.key);
      });
      q.answer = checkedKeys.length ? checkedKeys : [q.options[0] ? q.options[0].key : 'A'];
    });
  }

  function bindEditorDraftEvents() {
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

  async function persistEditToBackend(prefixMsg) {
    const res = await adapter.saveQuestionBank(state.bank);
    state.bank = res.bank;
    if (res.sqliteSaved) {
      $('data-source-badge').textContent = '· SQLite 数据库 (db/wmpses.db)';
    }
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
    if (initialTab) state.activeDocsTab = initialTab;
    renderDocsModal();
    openModal('docs-modal');
  }

  function renderDocsModal() {
    const body = $('docs-modal-body');
    const docs = (state.bank && state.bank.scenarioDocs) || [];
    const checklist = (state.bank && state.bank.checklistItems) || [];
    const vetoRules = (state.bank && state.bank.vetoRules) || [];

    const accountDocs = docs.filter((d) => d.docCategory === '工况台账');
    const stdDocs = docs.filter((d) => d.docCategory === '引用标准');

    const docsHtml = accountDocs.map((d) => `
      <div class="question-card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
          <strong style="color:#7dd3fc;">${escapeHtml(d.docTitle)}</strong>
          <span class="q-type-badge">${escapeHtml(d.docCode)} · ${escapeHtml(d.deptOrCategory)}</span>
        </div>
        <div style="color:#e2e8f0;font-size:13px;">${escapeHtml(d.contentSummary)}</div>
        ${d.relatedHotspotCode ? `<div style="margin-top:6px;font-size:11.5px;color:#94a3b8;">关联设备位号：${escapeHtml(d.relatedHotspotCode)}</div>` : ''}
      </div>
    `).join('');

    const checklistHtml = `
      <div style="overflow:auto;max-height:430px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#090e1a;color:#7dd3fc;">
              <th style="padding:8px;text-align:center;">序号</th>
              <th style="padding:8px;text-align:left;">验收方面</th>
              <th style="padding:8px;text-align:left;">核查项</th>
              <th style="padding:8px;text-align:left;">判定依据标准</th>
              <th style="padding:8px;text-align:left;">现场工况（关联缺陷）</th>
              <th style="padding:8px;text-align:center;">定位</th>
            </tr>
          </thead>
          <tbody>
            ${checklist.map((c) => `
              <tr style="border-bottom:1px solid rgba(148,163,184,0.12);">
                <td style="padding:7px;text-align:center;">${c.itemNo}</td>
                <td style="padding:7px;white-space:nowrap;">${escapeHtml(c.aspectName)}</td>
                <td style="padding:7px;font-weight:600;color:#f8fafc;">${escapeHtml(c.checkItemName)}</td>
                <td style="padding:7px;color:#cbd5e1;">${escapeHtml(c.standardBasis)}</td>
                <td style="padding:7px;color:#94a3b8;">
                  ${escapeHtml(c.sceneStatus)}
                  ${c.relatedDefectCode ? `<span class="q-score-badge" style="margin-left:4px;">${escapeHtml(c.relatedDefectCode)}</span>` : ''}
                </td>
                <td style="padding:7px;text-align:center;">
                  ${c.hotspotId ? `<button type="button" class="btn btn-primary btn-sm docs-jump-hs" data-hsid="${escapeHtml(c.hotspotId)}">前往</button>` : '-'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const stdHtml = `
      <div style="overflow:auto;max-height:430px;border:1px solid rgba(148,163,184,0.22);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead>
            <tr style="background:#090e1a;color:#7dd3fc;">
              <th style="padding:8px;text-align:left;">类别</th>
              <th style="padding:8px;text-align:left;">标准编号</th>
              <th style="padding:8px;text-align:left;">标准名称</th>
              <th style="padding:8px;text-align:left;">在本系统中的用途</th>
            </tr>
          </thead>
          <tbody>
            ${stdDocs.map((s) => `
              <tr style="border-bottom:1px solid rgba(148,163,184,0.12);">
                <td style="padding:7px;white-space:nowrap;">${escapeHtml(s.deptOrCategory)}</td>
                <td style="padding:7px;white-space:nowrap;color:#38bdf8;">${escapeHtml(s.docCode)}</td>
                <td style="padding:7px;font-weight:600;">${escapeHtml(s.docTitle)}</td>
                <td style="padding:7px;color:#cbd5e1;">${escapeHtml(s.contentSummary)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const vetoViewHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <span style="color:#cbd5e1;font-size:12.5px;">当前考试判分实时读取下表规则执行一票否决核验：</span>
        <button type="button" class="btn btn-warning btn-sm" id="btn-docs-goto-veto-cfg">⚙️ 编辑否定项规则与阈值</button>
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
        <button type="button" class="tab-btn docs-tab-btn ${state.activeDocsTab === 'docs' ? 'active' : ''}" data-dtab="docs">📄 4份现场工况台账</button>
        <button type="button" class="tab-btn docs-tab-btn ${state.activeDocsTab === 'checklist' ? 'active' : ''}" data-dtab="checklist">✅ 6方面24项验收规范 (${checklist.length})</button>
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
  }

  // ==========================================
  // 设置 & SQLite / FileMaker 对接弹窗
  // ==========================================
  function openSettingsModal(initialTab) {
    if (initialTab) state.activeSettingsTab = initialTab;
    renderSettingsModal();
    openModal('settings-modal');
    if (state.activeSettingsTab === 'sqlite') {
      loadAndRenderSqliteTab();
    }
  }

  function renderSettingsModal() {
    const cfg = adapter.getConfig();
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

    const body = $('settings-modal-body');
    body.innerHTML = `
      <div class="tabs-bar">
        <button type="button" class="tab-btn ${state.activeSettingsTab === 'bank' ? 'active' : ''}" data-tab="bank">📦 题库管理与考生信息</button>
        <button type="button" class="tab-btn ${state.activeSettingsTab === 'veto' ? 'active' : ''}" data-tab="veto">⚖️ 否定项规则表配置</button>
        <button type="button" class="tab-btn ${state.activeSettingsTab === 'sqlite' ? 'active' : ''}" data-tab="sqlite">🗄️ SQLite 数据库表预览</button>
        <button type="button" class="tab-btn ${state.activeSettingsTab === 'fm' ? 'active' : ''}" data-tab="fm">🔗 数据源与 FileMaker 配置</button>
      </div>

      <div id="tab-panel-veto" style="display:${state.activeSettingsTab === 'veto' ? 'block' : 'none'};">
        <div style="font-size:12.5px;color:#cbd5e1;margin-bottom:10px;">
          修改后点击下方保存按钮，将实时写入 SQLite <code>WMPSES_否定项规则</code> 表并立即作用于后续交卷评判。
        </div>
        ${vetoCfgHtml}
        <div style="margin-top:10px;">
          <button type="button" class="btn btn-success" id="btn-save-veto-rules">💾 保存否定项规则到 SQLite</button>
        </div>
      </div>

      <div id="tab-panel-sqlite" style="display:${state.activeSettingsTab === 'sqlite' ? 'block' : 'none'};">
        <div id="sqlite-viewer-container">${renderSqliteTableViewerHtml(state.sqliteSnapshot)}</div>
      </div>

      <div id="tab-panel-bank" style="display:${state.activeSettingsTab === 'bank' ? 'block' : 'none'};">
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
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 16px;">
          <button type="button" class="btn btn-primary" id="btn-export-bank-json">⬇️ 导出当前题库 (.json)</button>
          <label class="btn btn-ghost" style="cursor:pointer;">
            ⬆️ 导入题库 (.json)
            <input type="file" id="input-import-bank" accept=".json,application/json" style="display:none;">
          </label>
          <button type="button" class="btn btn-danger" id="btn-settings-reset-bank">↩️ 恢复出厂默认题库</button>
        </div>
        <h4 style="margin:12px 0 8px;color:#7dd3fc;">最近本地作答交卷记录</h4>
        ${historyHtml}
      </div>

      <div id="tab-panel-fm" style="display:${state.activeSettingsTab === 'fm' ? 'block' : 'none'};">
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
          <label>本地 SQLite 后台服务地址</label>
          <input type="text" id="cfg-sqlite-url" class="form-control" value="${escapeHtml(cfg.sqliteApiUrl || 'http://127.0.0.1:8765')}">
        </div>

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
        if (state.activeSettingsTab === 'sqlite') {
          loadAndRenderSqliteTab();
        }
      });
    });

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
        state.answers = {};
        state.practiceChecked = {};
        renderHotspotsAndDock();
        showToast(res.message, 'success');
      });
    }

    const pullBtn = $('btn-test-pull-bank');
    if (pullBtn) {
      pullBtn.addEventListener('click', async () => {
        saveSettingsFromDom(true);
        const res = await adapter.loadQuestionBank();
        state.bank = res.bank;
        $('data-source-badge').textContent = '· ' + res.source;
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
        persistEditToBackend('已更新《WMPSES_否定项规则》');
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

    // 关闭弹窗按钮与遮罩点击
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('open');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach((el) => el.classList.remove('open'));
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
    $('btn-submit-exam').addEventListener('click', () => submitExamAndShowReport(false));
    $('btn-open-docs').addEventListener('click', () => openDocsModal('docs'));
    $('btn-reset-exam').addEventListener('click', resetCurrentProgress);
    $('btn-open-settings').addEventListener('click', () => openSettingsModal('bank'));
    $('btn-student-badge').addEventListener('click', () => openSettingsModal('bank'));

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
      if (e.target.closest('.hotspot-pin')) return;

      const rect = $('panorama-stage').getBoundingClientRect();
      const x = Math.round(Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
      const y = Math.round(Math.min(96, Math.max(4, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;

      const newOrder = state.bank.hotspots.length + 1;
      const newHs = {
        id: 'hs-' + Date.now(),
        order: newOrder,
        code: 'DEV-' + String(newOrder).padStart(2, '0'),
        name: '新增设备部位 ' + newOrder,
        category: '现场设备核查',
        x: x,
        y: y,
        widgetType: 'generic',
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
      persistEditToBackend(`已在图上新增热点「${newHs.name}」`);
      openEditorModal(newHs.id);
    });

    $('btn-save-bank').addEventListener('click', () => {
      persistEditToBackend('');
    });

    $('btn-restore-default').addEventListener('click', async () => {
      if (!global.confirm('确定恢复出厂默认的 8 个部位与 15 道题目吗？')) return;
      const res = await adapter.resetBankWithBackend();
      state.bank = res.bank;
      state.answers = {};
      state.practiceChecked = {};
      renderHotspotsAndDock();
      showToast(res.message, 'success');
    });

    // 热点编辑器弹窗保存/删除
    $('btn-save-hotspot-edit').addEventListener('click', () => {
      syncDraftFromDom();
      const draft = state.editingHotspotDraft;
      const idx = state.bank.hotspots.findIndex((h) => h.id === draft.id);
      if (idx !== -1) {
        state.bank.hotspots[idx] = draft;
      }
      closeModal('editor-modal');
      persistEditToBackend(`已更新「${draft.name}」`);
    });

    $('btn-delete-hotspot').addEventListener('click', () => {
      const draft = state.editingHotspotDraft;
      if (!draft) return;
      if (!global.confirm(`确定删除热点「${draft.name}」及其所有题目吗？`)) return;
      state.bank.hotspots = state.bank.hotspots.filter((h) => h.id !== draft.id);
      closeModal('editor-modal');
      persistEditToBackend(`已删除热点「${draft.name}」`);
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
  }

  async function init() {
    renderPanoramaImage();
    bindGlobalEvents();
    registerFileMakerHooks();

    const loaded = await adapter.loadQuestionBank();
    state.bank = loaded.bank;
    $('data-source-badge').textContent = '· ' + loaded.source;

    renderHotspotsAndDock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
