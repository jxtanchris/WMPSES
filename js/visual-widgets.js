/**
 * 工业废气治理仿真工况可视化组件 (SVG)
 * 支持：1) 8套专业工业设备 SVG + 通用双仪表卡；2) 数据库 WMPSES_工况卡片模板 驱动的自定义组合模板与实时仿真推演
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function calcNeedlePoint(cx, cy, radius, value, min, max, startDeg, sweepDeg) {
    const span = max - min || 1;
    const ratio = Math.min(1, Math.max(0, (value - min) / span));
    const deg = startDeg + ratio * sweepDeg;
    const rad = (deg * Math.PI) / 180;
    return {
      x: (cx + radius * Math.cos(rad)).toFixed(1),
      y: (cy + radius * Math.sin(rad)).toFixed(1)
    };
  }

  // 8 种可自由组合的工业现场 SVG 仪表/设备部件
  const PANEL_COMPONENT_TYPES = [
    { value: 'gauge_dial', label: '圆形指针压力/真空表', summary: '可调量程、指针实时旋转与超压告警' },
    { value: 'pipe_valve_flow', label: '工艺管线 + 阀门 + 数字流量计', summary: '管线压力、阀门开闭状态与电磁流量计读数' },
    { value: 'sight_glass', label: '立式液位计 / 轴承油标视镜', summary: '上下限刻度、动态液位柱高度与油品乳化状态' },
    { value: 'dcs_interlock', label: 'DCS / SIS 联锁与参数趋势看板', summary: '实测值对比设计上限、SIS 联锁投用/旁路开关' },
    { value: 'flange_bolts', label: '圆形法兰螺栓紧固检查盘', summary: '法兰总孔数、缺失螺栓红色虚线高亮与密封状态' },
    { value: 'cert_nameplate', label: '强检合格证与设备铭牌色标卡', summary: '强检超期天数倒计时、设备铭牌及管道色标状态' },
    { value: 'gas_cems_alarm', label: '气体报警仪 / CEMS 诊断面板', summary: 'RUN/CAL 指示灯、零点漂移/浓度与限值判定' },
    { value: 'custom_image_card', label: '自定义上传现场特写图 + 读数角标', summary: '上传局部设备照片并叠加实时数值与核查状态' }
  ];

  function getPanelParamSchema(panelType, side) {
    const pfx = side === 'right' ? 'R_' : 'L_';
    const tag = side === 'right' ? '右·' : '左·';
    switch (panelType) {
      case 'gauge_dial':
        return [
          { key: pfx + 'label', label: tag + '表盘参数名', type: 'text', default: '出口压力 PI' },
          { key: pfx + 'value', label: tag + '实测读数', type: 'number', min: 0, max: 1.6, step: 0.01, unit: '', default: 0.45 },
          { key: pfx + 'max', label: tag + '表盘满量程', type: 'number', min: 0.4, max: 10.0, step: 0.2, unit: '', default: 1.6 },
          { key: pfx + 'unit', label: tag + '单位', type: 'text', default: 'MPa' },
          { key: pfx + 'alarm', label: tag + '状态判定', type: 'select', options: ['正常', '偏低告警', '超压告警'], default: '正常' }
        ];
      case 'pipe_valve_flow':
        return [
          { key: pfx + 'pressure', label: tag + '管线压力', type: 'number', min: 0, max: 1.6, step: 0.01, unit: 'MPa', default: 0.35 },
          { key: pfx + 'valve', label: tag + '阀门开关状态', type: 'select', options: ['开启', '关闭'], default: '开启' },
          { key: pfx + 'flow', label: tag + '瞬时流量', type: 'number', min: 0, max: 150, step: 1, unit: 'm³/h', default: 42 },
          { key: pfx + 'flowUnit', label: tag + '流量单位', type: 'text', default: 'm³/h' }
        ];
      case 'sight_glass':
        return [
          { key: pfx + 'medium', label: tag + '液位/油标名称', type: 'text', default: '液位/油位视镜' },
          { key: pfx + 'level', label: tag + '液位/油位比例', type: 'number', min: 0, max: 100, step: 1, unit: '%', default: 55 },
          { key: pfx + 'minLine', label: tag + '低限报警线', type: 'number', min: 5, max: 60, step: 1, unit: '%', default: 25 },
          { key: pfx + 'quality', label: tag + '介质/油品状态', type: 'select', options: ['清亮正常', '浑浊乳化', '偏低告警'], default: '清亮正常' }
        ];
      case 'dcs_interlock':
        return [
          { key: pfx + 'metricName', label: tag + 'DCS监测指标', type: 'text', default: '运行温度 TI' },
          { key: pfx + 'metricVal', label: tag + '当前实测值', type: 'number', min: -50, max: 1200, step: 1, unit: '', default: 45 },
          { key: pfx + 'metricLimit', label: tag + '设计允许上限', type: 'number', min: 0, max: 1200, step: 1, unit: '', default: 60 },
          { key: pfx + 'metricUnit', label: tag + '指标单位', type: 'text', default: '℃' },
          { key: pfx + 'interlock', label: tag + 'SIS联锁状态', type: 'select', options: ['正常投用 (NORMAL)', '旁路 (BYPASS)', '报警动作 (TRIP)'], default: '正常投用 (NORMAL)' }
        ];
      case 'flange_bolts':
        return [
          { key: pfx + 'totalBolts', label: tag + '法兰孔总数', type: 'number', min: 6, max: 12, step: 2, unit: '孔', default: 8 },
          { key: pfx + 'missingBolts', label: tag + '缺失螺栓数量', type: 'number', min: 0, max: 4, step: 1, unit: '条', default: 0 },
          { key: pfx + 'sealState', label: tag + '垫片与渗漏状态', type: 'select', options: ['密封完好无渗漏', '垫片老化轻微渗漏'], default: '密封完好无渗漏' }
        ];
      case 'cert_nameplate':
        return [
          { key: pfx + 'expiredDays', label: tag + '强检超期天数(负数为剩余)', type: 'number', min: -365, max: 180, step: 1, unit: '天', default: -30 },
          { key: pfx + 'tagState', label: tag + '铭牌与色标状态', type: 'select', options: ['铭牌清晰·介质色标齐全', '铭牌污损·色标模糊', '未见强检合格标签'], default: '铭牌清晰·介质色标齐全' },
          { key: pfx + 'certNote', label: tag + '现场核查备注', type: 'text', default: '定期强检仪表' }
        ];
      case 'gas_cems_alarm':
        return [
          { key: pfx + 'mode', label: tag + '监测运行模式', type: 'select', options: ['RUN (正常在线监测)', 'CAL (标定维护/未投用)'], default: 'RUN (正常在线监测)' },
          { key: pfx + 'reading', label: tag + '测值/零点漂移', type: 'number', min: -5, max: 100, step: 0.1, unit: '', default: 0.2 },
          { key: pfx + 'limit', label: tag + '允许限值', type: 'number', min: 0.1, max: 100, step: 0.1, unit: '', default: 0.5 },
          { key: pfx + 'unit', label: tag + '单位', type: 'text', default: '% F.S.' }
        ];
      case 'custom_image_card':
        return [
          { key: pfx + 'paramName', label: tag + '特写关联指标', type: 'text', default: '现场核查值' },
          { key: pfx + 'paramVal', label: tag + '实测读数', type: 'number', min: 0, max: 500, step: 0.5, unit: '', default: 25 },
          { key: pfx + 'paramUnit', label: tag + '单位', type: 'text', default: 'Pa' },
          { key: pfx + 'checkState', label: tag + '现场状态结论', type: 'select', options: ['正常', '一般异常', '严重隐患'], default: '正常' }
        ];
      default:
        return [];
    }
  }

  function buildSchemaForPanels(leftType, rightType) {
    return [].concat(
      getPanelParamSchema(leftType || 'gauge_dial', 'left'),
      getPanelParamSchema(rightType || 'dcs_interlock', 'right')
    );
  }

  function renderPanelBody(panelType, side, p, tpl) {
    const pfx = side === 'right' ? 'R_' : 'L_';
    switch (panelType) {
      case 'gauge_dial': {
        const label = String(p[pfx + 'label'] || '出口压力 PI');
        const val = toNum(p[pfx + 'value'], 0.45);
        const max = Math.max(0.1, toNum(p[pfx + 'max'], 1.6));
        const unit = String(p[pfx + 'unit'] || 'MPa');
        const alarm = String(p[pfx + 'alarm'] || '正常');
        const pt = calcNeedlePoint(84, 78, 35, val, 0, max, 135, 270);
        const isOk = alarm === '正常';
        const strokeCol = isOk ? '#22c55e' : '#ef4444';
        const bgCol = isOk ? '#052e16' : '#450a0a';
        return `
          <svg viewBox="0 0 320 155" class="sim-svg">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <circle cx="84" cy="78" r="54" fill="#f8fafc" stroke="#64748b" stroke-width="3"/>
            <path d="M48 106 A44 44 0 1 1 120 106" fill="none" stroke="#334155" stroke-width="2"/>
            <text x="50" y="106" fill="#334155" font-size="8.5" font-weight="700">0</text>
            <text x="45" y="64" fill="#334155" font-size="8.5" font-weight="700">${(max * 0.25).toFixed(1)}</text>
            <text x="77" y="38" fill="#334155" font-size="8.5" font-weight="700">${(max * 0.5).toFixed(1)}</text>
            <text x="109" y="64" fill="#334155" font-size="8.5" font-weight="700">${(max * 0.75).toFixed(1)}</text>
            <text x="106" y="106" fill="#334155" font-size="8.5" font-weight="700">${max.toFixed(1)}</text>
            <line x1="84" y1="78" x2="${pt.x}" y2="${pt.y}" stroke="${isOk ? '#0284c7' : '#dc2626'}" stroke-width="2.8" stroke-linecap="round"/>
            <circle cx="84" cy="78" r="4.5" fill="#1e293b"/>
            <rect x="156" y="24" width="148" height="106" rx="6" fill="#1e293b" stroke="${strokeCol}"/>
            <text x="168" y="46" fill="#94a3b8" font-size="9.5">${escapeHtml(label)}：</text>
            <text x="168" y="72" fill="#38bdf8" font-size="19" font-weight="700">${val.toFixed(2)} ${escapeHtml(unit)}</text>
            <rect x="168" y="90" width="124" height="24" rx="4" fill="${bgCol}" stroke="${strokeCol}"/>
            <text x="230" y="106" text-anchor="middle" fill="#f8fafc" font-size="10" font-weight="700">${escapeHtml(alarm)}</text>
          </svg>`;
      }
      case 'pipe_valve_flow': {
        const pres = toNum(p[pfx + 'pressure'], 0.35);
        const valve = String(p[pfx + 'valve'] || '开启');
        const flow = toNum(p[pfx + 'flow'], 42);
        const flowUnit = String(p[pfx + 'flowUnit'] || 'm³/h');
        const valveOpen = valve === '开启';
        const hasFlow = flow > 0;
        const pt = calcNeedlePoint(66, 54, 24, pres, 0, 1.6, 135, 210);
        return `
          <svg viewBox="0 0 320 155" class="sim-svg">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="106" width="292" height="22" rx="4" fill="${hasFlow ? '#0ea5e9' : '#94a3b8'}" stroke="#475569" stroke-width="1.5"/>
            <line x1="66" y1="106" x2="66" y2="86" stroke="#cbd5e1" stroke-width="6"/>
            <circle cx="66" cy="54" r="34" fill="#f8fafc" stroke="#64748b" stroke-width="3"/>
            <line x1="66" y1="54" x2="${pt.x}" y2="${pt.y}" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="66" cy="54" r="3" fill="#0f172a"/>
            <rect x="33" y="88" width="66" height="17" rx="3" fill="#1d4ed8"/>
            <text x="66" y="100" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="700">${pres.toFixed(2)} MPa</text>
            <rect x="144" y="98" width="26" height="36" rx="3" fill="#475569" stroke="#cbd5e1"/>
            <line x1="157" y1="98" x2="157" y2="${valveOpen ? 68 : 78}" stroke="#cbd5e1" stroke-width="4"/>
            <ellipse cx="157" cy="${valveOpen ? 66 : 76}" rx="22" ry="6" fill="${valveOpen ? '#16a34a' : '#dc2626'}" stroke="${valveOpen ? '#86efac' : '#fca5a5'}" stroke-width="1.5"/>
            <rect x="118" y="134" width="78" height="17" rx="3" fill="${valveOpen ? '#16a34a' : '#dc2626'}"/>
            <text x="157" y="146" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="700">阀门：${escapeHtml(valve)}</text>
            <line x1="248" y1="106" x2="248" y2="86" stroke="#cbd5e1" stroke-width="6"/>
            <rect x="214" y="22" width="68" height="64" rx="8" fill="#0284c7" stroke="#7dd3fc" stroke-width="2"/>
            <rect x="221" y="31" width="54" height="34" rx="4" fill="#0f172a"/>
            <text x="248" y="51" text-anchor="middle" fill="${hasFlow ? '#4ade80' : '#f87171'}" font-size="13" font-weight="700">${flow.toFixed(1)}</text>
            <text x="248" y="61" text-anchor="middle" fill="#94a3b8" font-size="8">${escapeHtml(flowUnit)}</text>
            <rect x="214" y="88" width="68" height="17" rx="3" fill="${hasFlow ? '#052e16' : '#1e293b'}" stroke="${hasFlow ? '#22c55e' : '#f87171'}"/>
            <text x="248" y="100" text-anchor="middle" fill="${hasFlow ? '#86efac' : '#fca5a5'}" font-size="9.5" font-weight="700">${hasFlow ? '正常流动' : '流量为 0'}</text>
          </svg>`;
      }
      case 'sight_glass': {
        const medium = String(p[pfx + 'medium'] || '液位/油位视镜');
        const level = Math.min(100, Math.max(0, toNum(p[pfx + 'level'], 55)));
        const minLine = Math.min(85, Math.max(5, toNum(p[pfx + 'minLine'], 25)));
        const quality = String(p[pfx + 'quality'] || '清亮正常');
        const colH = Math.max(4, (level / 100) * 96);
        const colY = (126 - colH).toFixed(1);
        const minY = (126 - (minLine / 100) * 96).toFixed(1);
        const isEmulsified = quality.indexOf('乳化') !== -1;
        const isOk = quality === '清亮正常' && level >= minLine;
        const fillCol = isEmulsified ? '#e5e7eb' : (isOk ? '#0ea5e9' : '#f59e0b');
        return `
          <svg viewBox="0 0 320 155" class="sim-svg">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="34" y="16" width="52" height="123" rx="8" fill="#64748b" stroke="#94a3b8" stroke-width="2"/>
            <rect x="43" y="25" width="34" height="104" rx="4" fill="#1e293b"/>
            <rect x="44" y="${colY}" width="32" height="${colH.toFixed(1)}" rx="2" fill="${fillCol}"/>
            <line x1="36" y1="36" x2="108" y2="36" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 2"/>
            <text x="114" y="40" fill="#38bdf8" font-size="9.5">上限 (MAX)</text>
            <line x1="36" y1="${minY}" x2="108" y2="${minY}" stroke="${isOk ? '#22c55e' : '#ef4444'}" stroke-width="1.6" stroke-dasharray="3 2"/>
            <text x="114" y="${Number(minY) + 4}" fill="${isOk ? '#86efac' : '#fca5a5'}" font-size="9.5">下限 (${minLine}%)</text>
            <rect x="114" y="64" width="190" height="72" rx="6" fill="${isOk ? '#052e16' : '#450a0a'}" stroke="${isOk ? '#22c55e' : '#ef4444'}"/>
            <text x="124" y="84" fill="#cbd5e1" font-size="9.5">${escapeHtml(medium)}</text>
            <text x="124" y="106" fill="${isOk ? '#4ade80' : '#f87171'}" font-size="14" font-weight="700">实测：${level.toFixed(0)}%</text>
            <text x="124" y="125" fill="${isOk ? '#bbf7d0' : '#fecaca'}" font-size="9.5">状态：${escapeHtml(quality)}</text>
          </svg>`;
      }
      case 'dcs_interlock': {
        const name = String(p[pfx + 'metricName'] || '运行温度 TI');
        const val = toNum(p[pfx + 'metricVal'], 45);
        const limit = toNum(p[pfx + 'metricLimit'], 60);
        const unit = String(p[pfx + 'metricUnit'] || '℃');
        const interlock = String(p[pfx + 'interlock'] || '正常投用 (NORMAL)');
        const valOk = val <= limit;
        const ilOk = interlock.indexOf('正常投用') !== -1;
        return `
          <svg viewBox="0 0 320 155" class="sim-svg">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="16" width="292" height="58" rx="6" fill="#1e293b" stroke="${valOk ? '#334155' : '#ef4444'}"/>
            <text x="26" y="36" fill="#94a3b8" font-size="10">${escapeHtml(name)} 实测值：</text>
            <text x="26" y="61" fill="${valOk ? '#22d3ee' : '#f87171'}" font-size="20" font-weight="700">${val} ${escapeHtml(unit)}</text>
            <rect x="170" y="38" width="124" height="24" rx="4" fill="${valOk ? '#052e16' : '#450a0a'}" stroke="${valOk ? '#22c55e' : '#ef4444'}"/>
            <text x="232" y="54" text-anchor="middle" fill="${valOk ? '#86efac' : '#fca5a5'}" font-size="9.5" font-weight="600">${valOk ? `设计上限 ≤ ${limit} ${escapeHtml(unit)}` : `超限！限值 ${limit}`}</text>
            <rect x="14" y="84" width="292" height="56" rx="6" fill="${ilOk ? '#052e16' : '#451a03'}" stroke="${ilOk ? '#22c55e' : '#f59e0b'}" stroke-width="1.5"/>
            <text x="26" y="106" fill="${ilOk ? '#86efac' : '#fbbf24'}" font-size="10.5" font-weight="700">SIS 安全联锁回路状态</text>
            <text x="26" y="126" fill="${ilOk ? '#bbf7d0' : '#fef3c7'}" font-size="11" font-weight="700">${escapeHtml(interlock)}</text>
          </svg>`;
      }
      case 'flange_bolts': {
        const total = Math.min(12, Math.max(6, Math.round(toNum(p[pfx + 'totalBolts'], 8))));
        const miss = Math.min(4, Math.max(0, Math.round(toNum(p[pfx + 'missingBolts'], 0))));
        const seal = String(p[pfx + 'sealState'] || '密封完好无渗漏');
        const present = total - miss;
        let holes = '';
        for (let i = 0; i < total; i++) {
          const ang = (i * 2 * Math.PI) / total - Math.PI / 2;
          const bx = (95 + 44 * Math.cos(ang)).toFixed(1);
          const by = (78 + 44 * Math.sin(ang)).toFixed(1);
          holes += i < present
            ? `<circle cx="${bx}" cy="${by}" r="5.8" fill="#334155" stroke="#e2e8f0" stroke-width="2"/>`
            : `<circle cx="${bx}" cy="${by}" r="6.2" fill="#0f172a" stroke="#ef4444" stroke-width="2" stroke-dasharray="3 2"/>`;
        }
        const ok = miss === 0 && seal.indexOf('完好') !== -1;
        return `
          <svg viewBox="0 0 320 155" class="sim-svg">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <circle cx="95" cy="78" r="56" fill="#94a3b8" stroke="#475569" stroke-width="2.5"/>
            <circle cx="95" cy="78" r="30" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
            ${holes}
            <rect x="170" y="24" width="136" height="106" rx="6" fill="#1e293b" stroke="${ok ? '#22c55e' : '#ef4444'}"/>
            <text x="180" y="45" fill="${miss > 0 ? '#f87171' : '#86efac'}" font-size="10.5" font-weight="700">${miss > 0 ? `缺装螺栓 ${miss} 条 (${present}/${total})` : `螺栓齐全 (${total}/${total})`}</text>
            <text x="180" y="72" fill="#e2e8f0" font-size="9.5">${escapeHtml(seal)}</text>
            <text x="180" y="98" fill="#94a3b8" font-size="9">${ok ? '法兰连接及密封合格' : '存在连接/密封隐患需整改'}</text>
          </svg>`;
      }
      case 'cert_nameplate': {
        const expDays = toNum(p[pfx + 'expiredDays'], -30);
        const tagState = String(p[pfx + 'tagState'] || '铭牌清晰·介质色标齐全');
        const note = String(p[pfx + 'certNote'] || '定期强检仪表');
        const isExpired = expDays > 0;
        const tagOk = tagState.indexOf('清晰') !== -1;
        return `
          <svg viewBox="0 0 320 155" class="sim-svg">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="18" width="144" height="118" rx="6" fill="#fefce8" stroke="#ca8a04" stroke-width="1.5"/>
            <rect x="14" y="18" width="144" height="24" rx="5" fill="${isExpired ? '#eab308' : '#22c55e'}"/>
            <text x="86" y="34" text-anchor="middle" fill="#0f172a" font-size="10.5" font-weight="700">计量强检合格证</text>
            <text x="24" y="60" fill="#334155" font-size="9.5">${escapeHtml(note.slice(0, 14))}</text>
            <text x="24" y="80" fill="#334155" font-size="9.5">${isExpired ? '复检周期：已逾期' : '复检周期：有效'}</text>
            <rect x="22" y="98" width="128" height="24" rx="4" fill="${isExpired ? '#fee2e2' : '#dcfce7'}" stroke="${isExpired ? '#ef4444' : '#22c55e'}"/>
            <text x="86" y="114" text-anchor="middle" fill="${isExpired ? '#b91c1c' : '#15803d'}" font-size="9.5" font-weight="700">${isExpired ? `已过期 ${expDays} 天` : `有效期余 ${Math.abs(expDays)} 天`}</text>
            <rect x="168" y="18" width="138" height="118" rx="6" fill="#1e293b" stroke="${tagOk ? '#22c55e' : '#f59e0b'}"/>
            <text x="178" y="42" fill="#7dd3fc" font-size="10" font-weight="700">设备铭牌与色标检查</text>
            <text x="178" y="72" fill="${tagOk ? '#86efac' : '#fbbf24'}" font-size="10" font-weight="700">${escapeHtml(tagState.slice(0, 12))}</text>
            <text x="178" y="92" fill="#cbd5e1" font-size="9.5">${escapeHtml(tagState.slice(12, 24))}</text>
            <text x="178" y="118" fill="#94a3b8" font-size="9">${tagOk ? '标识完整可追溯' : '需补齐铭牌或色标'}</text>
          </svg>`;
      }
      case 'gas_cems_alarm': {
        const mode = String(p[pfx + 'mode'] || 'RUN (正常在线监测)');
        const reading = toNum(p[pfx + 'reading'], 0.2);
        const limit = Math.max(0.01, toNum(p[pfx + 'limit'], 0.5));
        const unit = String(p[pfx + 'unit'] || '% F.S.');
        const isCal = mode.indexOf('CAL') !== -1;
        const valOk = Math.abs(reading) <= limit;
        return `
          <svg viewBox="0 0 320 155" class="sim-svg">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="16" y="16" width="288" height="123" rx="8" fill="#1e293b" stroke="${!isCal && valOk ? '#22c55e' : '#ef4444'}" stroke-width="1.8"/>
            <rect x="28" y="28" width="184" height="58" rx="4" fill="#090d16" stroke="#475569"/>
            <text x="38" y="47" fill="${isCal ? '#fbbf24' : '#4ade80'}" font-size="10.5" font-weight="700">${escapeHtml(mode)}</text>
            <text x="38" y="72" fill="${valOk ? '#38bdf8' : '#f87171'}" font-size="15" font-weight="700">${reading} ${escapeHtml(unit)}</text>
            <circle cx="242" cy="42" r="8" fill="${isCal ? '#334155' : '#22c55e'}"/>
            <text x="255" y="46" fill="#cbd5e1" font-size="9">RUN</text>
            <circle cx="242" cy="68" r="8" fill="${isCal ? '#f59e0b' : '#334155'}"/>
            <text x="255" y="72" fill="#cbd5e1" font-size="9">CAL</text>
            <rect x="28" y="96" width="264" height="28" rx="4" fill="${!isCal && valOk ? '#052e16' : '#450a0a'}" stroke="${!isCal && valOk ? '#22c55e' : '#ef4444'}"/>
            <text x="38" y="114" fill="${!isCal && valOk ? '#86efac' : '#fca5a5'}" font-size="9.5" font-weight="700">允许限值 ≤ ±${limit} ${escapeHtml(unit)} · ${!isCal && valOk ? '在线监测合格' : '存在屏蔽或超标隐患'}</text>
          </svg>`;
      }
      case 'custom_image_card': {
        const pName = String(p[pfx + 'paramName'] || '现场核查值');
        const pVal = toNum(p[pfx + 'paramVal'], 25);
        const pUnit = String(p[pfx + 'paramUnit'] || 'Pa');
        const stateStr = String(p[pfx + 'checkState'] || '正常');
        const imgSrc = (tpl && tpl.customImageBase64) || '';
        const ok = stateStr === '正常';
        const warn = stateStr === '一般异常';
        const badgeCol = ok ? '#16a34a' : (warn ? '#d97706' : '#dc2626');
        return `
          <div style="position:relative;border-radius:8px;overflow:hidden;background:#0f172a;border:1px solid #334155;height:155px;display:flex;align-items:center;justify-content:center;">
            ${imgSrc
              ? `<img src="${escapeHtml(imgSrc)}" alt="自定义设备特写" style="width:100%;height:100%;object-fit:contain;">`
              : `<div style="color:#94a3b8;font-size:12px;text-align:center;padding:12px;">📷 尚未上传局部设备特写照片<br><small>在模板构建器中上传图片即可展示</small></div>`}
            <div style="position:absolute;left:8px;right:8px;bottom:8px;padding:5px 9px;border-radius:6px;background:rgba(15,23,42,0.88);border:1px solid ${badgeCol};display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
              <span style="color:#e2e8f0;">${escapeHtml(pName)}: <strong style="color:#38bdf8;">${pVal} ${escapeHtml(pUnit)}</strong></span>
              <span style="padding:2px 6px;border-radius:4px;background:${badgeCol};color:#fff;font-size:10.5px;font-weight:700;">${escapeHtml(stateStr)}</span>
            </div>
          </div>`;
      }
      default:
        return '';
    }
  }

  function summarizePanelFacts(panelType, side, p) {
    const pfx = side === 'right' ? 'R_' : 'L_';
    switch (panelType) {
      case 'gauge_dial':
        return `${p[pfx + 'label'] || '压力表'} ${toNum(p[pfx + 'value'], 0).toFixed(2)} ${p[pfx + 'unit'] || ''}（${p[pfx + 'alarm'] || '正常'}）`;
      case 'pipe_valve_flow':
        return `管压 ${toNum(p[pfx + 'pressure'], 0).toFixed(2)} MPa，阀门「${p[pfx + 'valve'] || '开启'}」，流量 ${toNum(p[pfx + 'flow'], 0)} ${p[pfx + 'flowUnit'] || 'm³/h'}`;
      case 'sight_glass':
        return `${p[pfx + 'medium'] || '视镜'}实测 ${toNum(p[pfx + 'level'], 0)}%（下限 ${toNum(p[pfx + 'minLine'], 25)}%），状态「${p[pfx + 'quality'] || '清亮正常'}」`;
      case 'dcs_interlock':
        return `${p[pfx + 'metricName'] || '指标'}实测 ${p[pfx + 'metricVal']} ${p[pfx + 'metricUnit'] || ''}（上限 ${p[pfx + 'metricLimit']}），联锁「${p[pfx + 'interlock']}」`;
      case 'flange_bolts':
        return `法兰 ${toNum(p[pfx + 'totalBolts'], 8)} 孔缺 ${toNum(p[pfx + 'missingBolts'], 0)} 条螺栓（${p[pfx + 'sealState']}）`;
      case 'cert_nameplate': {
        const d = toNum(p[pfx + 'expiredDays'], -30);
        return `${d > 0 ? `强检超期 ${d} 天` : `强检余 ${Math.abs(d)} 天`}，${p[pfx + 'tagState']}`;
      }
      case 'gas_cems_alarm':
        return `监测模式「${p[pfx + 'mode']}」，测值 ${p[pfx + 'reading']} ${p[pfx + 'unit'] || ''}（限值 ±${p[pfx + 'limit']}）`;
      case 'custom_image_card':
        return `${p[pfx + 'paramName'] || '现场值'} ${p[pfx + 'paramVal']} ${p[pfx + 'paramUnit'] || ''}（${p[pfx + 'checkState'] || '正常'}）`;
      default:
        return '';
    }
  }

  const BUILTIN_WIDGET_PARAM_SCHEMAS = {
    scrubber_top: [
      { key: 'peelArea', label: '防腐层脱落面积', type: 'number', min: 0, max: 2.0, step: 0.1, unit: 'm²', default: 0.3 },
      { key: 'topPressure', label: '塔顶压力 PI-101', type: 'number', min: 0, max: 0.8, step: 0.01, unit: 'MPa', default: 0.15 },
      { key: 'expiredDays', label: '检定超期天数(负数为剩余)', type: 'number', min: -180, max: 180, step: 1, unit: '天', default: 15 }
    ],
    scrubber_bottom: [
      { key: 'dcsLevel', label: 'DCS 远传液位 LT-101', type: 'number', min: 0, max: 100, step: 1, unit: '%', default: 60 },
      { key: 'localLevel', label: '就地液位计实测', type: 'number', min: 0, max: 100, step: 1, unit: '%', default: 20 },
      { key: 'interlockStatus', label: 'LALL-101 联锁状态', type: 'select', options: ['旁路 (BYPASS)', '正常投用 (NORMAL)'], default: '旁路 (BYPASS)' },
      { key: 'missingBolts', label: 'FL-102 缺失螺栓数', type: 'number', min: 0, max: 4, step: 1, unit: '条', default: 2 }
    ],
    induced_fan: [
      { key: 'mainOilOffset', label: '主轴承箱油位偏差(相对MIN)', type: 'number', min: -25, max: 30, step: 1, unit: 'mm', default: -8 },
      { key: 'mainOilQuality', label: '主轴承箱油品状态', type: 'select', options: ['乳白色浑浊乳化', '金黄清亮无杂质'], default: '乳白色浑浊乳化' },
      { key: 'auxOilOffset', label: '辅助侧油位偏差(相对MIN)', type: 'number', min: -20, max: 30, step: 1, unit: 'mm', default: 5 }
    ],
    cooling_water: [
      { key: 'pressure', label: '主管压力 PI-301', type: 'number', min: 0, max: 1.5, step: 0.01, unit: 'MPa', default: 0.28 },
      { key: 'valveStatus', label: '供水手动阀状态', type: 'select', options: ['关闭', '开启'], default: '关闭' },
      { key: 'flow', label: '电磁流量计 FI-301', type: 'number', min: 0, max: 120, step: 1, unit: 'm³/h', default: 0 },
      { key: 'returnTemp', label: '回水温度实测 TI-302', type: 'number', min: 15, max: 80, step: 0.5, unit: '℃', default: 45.0 },
      { key: 'maxTemp', label: '设计允许上限温度', type: 'number', min: 30, max: 70, step: 1, unit: '℃', default: 50 }
    ],
    rto_chamber: [
      { key: 'chamberTemp', label: 'RTO 蓄热室温度', type: 'number', min: 15, max: 200, step: 1, unit: '℃', default: 28 },
      { key: 'railBendCm', label: '护栏横杆弯曲变形量', type: 'number', min: 0, max: 15, step: 0.5, unit: 'cm', default: 4 },
      { key: 'manholeStatus', label: '人孔受限空间状态', type: 'select', options: ['已打开 (待入内检查)', '已气体检测与盲板隔离', '已封闭复位'], default: '已打开 (待入内检查)' }
    ],
    rto_valves: [
      { key: 'airPressure', label: '仪表气源压力 PI-401', type: 'number', min: 0, max: 1.0, step: 0.01, unit: 'MPa', default: 0.32 },
      { key: 'switchTime', label: '切换阀全行程动作时间', type: 'number', min: 1.0, max: 15.0, step: 0.5, unit: 's', default: 9.0 },
      { key: 'stdSwitchTime', label: '标准动作时间上限', type: 'number', min: 1.0, max: 6.0, step: 0.5, unit: 's', default: 3.0 }
    ],
    cems_stack: [
      { key: 'gasAlarmMode', label: '可燃气体报警仪模式', type: 'select', options: ['CAL (标定维护/未投用)', 'RUN (正常在线监测)'], default: 'CAL (标定维护/未投用)' },
      { key: 'zeroDrift', label: 'CEMS 零点漂移', type: 'number', min: -2.0, max: 2.0, step: 0.1, unit: '% F.S.', default: 0.9 },
      { key: 'stdGasExpiredDays', label: '标气超期天数(负数有效)', type: 'number', min: -180, max: 90, step: 1, unit: '天', default: 23 }
    ],
    utilities_plc: [
      { key: 'airMainPressure', label: '压缩空气总管压力', type: 'number', min: 0, max: 1.0, step: 0.01, unit: 'MPa', default: 0.68 },
      { key: 'n2Pressure', label: '氮气密封总管压力', type: 'number', min: 0, max: 1.0, step: 0.01, unit: 'MPa', default: 0.50 },
      { key: 'powerStatus', label: '双回路供电状态', type: 'select', options: ['I/II段均带电·备自投正常', '仅单段带电·备自投告警'], default: 'I/II段均带电·备自投正常' },
      { key: 'nameplateStatus', label: '铭牌与介质色标', type: 'select', options: ['铭牌污损·介质色标不清', '铭牌齐全·介质色标清晰'], default: '铭牌污损·介质色标不清' }
    ],
    generic: [
      { key: 'param1Label', label: '左表盘参数名称', type: 'text', default: '系统压力 PI' },
      { key: 'param1Value', label: '左表盘读数', type: 'number', min: 0, max: 1.6, step: 0.01, unit: '', default: 0.45 },
      { key: 'param1Unit', label: '左表盘单位', type: 'text', default: 'MPa' },
      { key: 'param2Label', label: '右看板参数名称', type: 'text', default: '运行温度 TI' },
      { key: 'param2Value', label: '右看板数值', type: 'number', min: 0, max: 200, step: 1, unit: '', default: 38 },
      { key: 'param2Unit', label: '右看板单位', type: 'text', default: '℃' },
      { key: 'deviceStatus', label: '现场运行状态', type: 'select', options: ['异常告警', '待检停机', '正常投用'], default: '待检停机' }
    ]
  };

  const DEFAULT_BUILTIN_OPTIONS = [
    { value: 'scrubber_top', label: '碱洗塔上部（防腐脱落 + 压力表过期标签）' },
    { value: 'scrubber_bottom', label: '碱洗塔下部（液位联锁旁路/假液位 + 缺螺栓）' },
    { value: 'induced_fan', label: '引风机（油位低乳化 vs 正常油位对比视镜）' },
    { value: 'cooling_water', label: '循环冷却水（0.28MPa但流量0 + 回水45℃）' },
    { value: 'rto_chamber', label: 'RTO本体（平台护栏变形 + 受限空间警示）' },
    { value: 'rto_valves', label: 'RTO切换阀组（气源0.32MPa + 动作9s迟滞）' },
    { value: 'cems_stack', label: '烟囱与CEMS（报警仪标定态 + 零漂0.9%超期23天）' },
    { value: 'utilities_plc', label: '公用工程与PLC（气电正常 + 铭牌污损 + 总结论）' },
    { value: 'generic', label: '通用可调双仪表卡（自定义新增热点专用）' }
  ];

  const WIDGET_PARAM_SCHEMAS = Object.assign({}, BUILTIN_WIDGET_PARAM_SCHEMAS);
  const CUSTOM_TEMPLATES_MAP = {};

  function getSchema(widgetType) {
    return WIDGET_PARAM_SCHEMAS[widgetType] || WIDGET_PARAM_SCHEMAS.generic;
  }

  function getDefaultParams(widgetType) {
    const schema = getSchema(widgetType);
    const out = {};
    schema.forEach((f) => {
      out[f.key] = f.default;
    });
    return out;
  }

  function resolveParams(widgetType, hotspot) {
    const defaults = getDefaultParams(widgetType);
    const custom = hotspot && hotspot.widgetParams && typeof hotspot.widgetParams === 'object'
      ? hotspot.widgetParams
      : {};
    const merged = Object.assign({}, defaults, custom);
    const schema = getSchema(widgetType);
    schema.forEach((f) => {
      if (f.type === 'number') {
        merged[f.key] = toNum(merged[f.key], f.default);
      } else if (merged[f.key] == null || merged[f.key] === '') {
        merged[f.key] = f.default;
      }
    });
    return merged;
  }

  function buildFactsText(widgetType, hotspot, p) {
    if (CUSTOM_TEMPLATES_MAP[widgetType] && !CUSTOM_TEMPLATES_MAP[widgetType].isBuiltin) {
      const tpl = CUSTOM_TEMPLATES_MAP[widgetType];
      const fL = summarizePanelFacts(tpl.leftPanelType, 'left', p);
      const fR = summarizePanelFacts(tpl.rightPanelType, 'right', p);
      return `① ${fL}；② ${fR}。`;
    }
    switch (widgetType) {
      case 'scrubber_top': {
        const peelText = p.peelArea > 0
          ? `碱洗塔喷淋层上方内壁防腐层起皮脱落约 ${p.peelArea.toFixed(1)}m²，露出碳钢基材`
          : '碱洗塔喷淋层上方内壁防腐层完好无起皮';
        const expText = p.expiredDays > 0
          ? `强检标签已过期 ${p.expiredDays} 天`
          : `强检在有效期内（剩余 ${Math.abs(p.expiredDays)} 天）`;
        return `① ${peelText}；② 塔顶压力表 PI-101 读数 ${p.topPressure.toFixed(2)}MPa，${expText}。`;
      }
      case 'scrubber_bottom': {
        const boltText = p.missingBolts > 0 ? `塔底法兰缺失 ${p.missingBolts} 条 M20 螺栓` : '塔底法兰螺栓齐全紧固';
        return `① DCS液位 ${p.dcsLevel.toFixed(0)}%，就地液位计实测 ${p.localLevel.toFixed(0)}%；LALL-101 联锁处于「${p.interlockStatus}」；② ${boltText}。`;
      }
      case 'induced_fan': {
        const mainPos = p.mainOilOffset >= 0 ? `高于下限 ${p.mainOilOffset}mm` : `低于下限约 ${Math.abs(p.mainOilOffset)}mm`;
        const auxPos = p.auxOilOffset >= 0 ? `低限上方 ${p.auxOilOffset}mm` : `低于下限 ${Math.abs(p.auxOilOffset)}mm`;
        return `引风机主轴承箱油位${mainPos}且油样呈「${p.mainOilQuality}」；辅助侧油位在${auxPos}。`;
      }
      case 'cooling_water': {
        const tempState = p.returnTemp <= p.maxTemp ? '符合设计要求' : '超温报警';
        return `① 主冷却水管压力表显示 ${p.pressure.toFixed(2)}MPa，电磁流量计显示 ${p.flow.toFixed(2)} m³/h，供水手动阀处于「${p.valveStatus}」位；② 回水温度实测 ${p.returnTemp.toFixed(1)}℃（设计要求 ≤${p.maxTemp}℃，${tempState}）。`;
      }
      case 'rto_chamber': {
        const railText = p.railBendCm > 0 ? `护栏中横杆弯曲变形约 ${p.railBendCm}cm，立柱焊缝完好` : '二层平台护栏完好无变形';
        return `① RTO 蓄热室待机 ${p.chamberTemp}℃，${railText}；② 受限空间人孔当前状态：${p.manholeStatus}。`;
      }
      case 'rto_valves': {
        const pOk = p.airPressure >= 0.5 && p.airPressure <= 0.7;
        const tOk = p.switchTime <= p.stdSwitchTime;
        return `RTO切换阀组仪表气源压力实测 ${p.airPressure.toFixed(2)} MPa（设计 0.5~0.7 MPa，${pOk ? '正常' : '异常'}），就地全行程动作时间 ${p.switchTime.toFixed(1)}s（标准 ≤${p.stdSwitchTime.toFixed(1)}s，${tOk ? '合格' : '迟滞超标'}）。`;
      }
      case 'cems_stack': {
        const driftOk = Math.abs(p.zeroDrift) <= 0.5;
        const gasText = p.stdGasExpiredDays > 0 ? `标气过期 ${p.stdGasExpiredDays} 天` : `标气有效（余 ${Math.abs(p.stdGasExpiredDays)} 天）`;
        return `① 可燃气体报警仪当前为「${p.gasAlarmMode}」；② CEMS 零点漂移 ${p.zeroDrift >= 0 ? '+' : ''}${p.zeroDrift.toFixed(1)}%（要求 ±0.5%，${driftOk ? '合格' : '超标'}），${gasText}。`;
      }
      case 'utilities_plc':
        return `① 压缩空气 ${p.airMainPressure.toFixed(2)}MPa、氮气 ${p.n2Pressure.toFixed(2)}MPa，供电状态「${p.powerStatus}」；② 现场标识状态：「${p.nameplateStatus}」。`;
      default: {
        const summary = hotspot && hotspot.sceneSummary ? hotspot.sceneSummary : '';
        return `${p.param1Label} ${p.param1Value} ${p.param1Unit} ｜ ${p.param2Label} ${p.param2Value} ${p.param2Unit} ｜ 状态：${p.deviceStatus}${summary ? ' ｜ ' + summary : ''}`;
      }
    }
  }

  function renderScrubberTop(p, facts) {
    const hasPeel = p.peelArea > 0;
    const pt = calcNeedlePoint(88, 78, 35, p.topPressure, 0, 0.8, 140, 260);
    const scale = Math.min(1.35, Math.max(0.55, p.peelArea / 0.3));
    const isExpired = p.expiredDays > 0;
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">现场外观特写 · 喷淋层上方塔壁</span>
            <span class="sim-code">T-101-W01</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="碱洗塔上部防腐层状态特写">
            <defs>
              <linearGradient id="st-shell" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#94a3b8"/>
                <stop offset="45%" stop-color="#e2e8f0"/>
                <stop offset="100%" stop-color="#64748b"/>
              </linearGradient>
              <pattern id="st-rust" width="10" height="10" patternUnits="userSpaceOnUse">
                <rect width="10" height="10" fill="#7c2d12"/>
                <circle cx="3" cy="3" r="1.8" fill="#9a3412"/>
                <circle cx="7" cy="7" r="1.4" fill="#431407"/>
              </pattern>
            </defs>
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="42" y="14" width="160" height="127" rx="4" fill="url(#st-shell)" stroke="#475569" stroke-width="1.5"/>
            <line x1="42" y1="98" x2="202" y2="98" stroke="#334155" stroke-dasharray="4 3" stroke-width="1.5"/>
            <text x="48" y="113" fill="#1e293b" font-size="10" font-weight="600">喷淋层位置标高 EL+6.5m</text>
            <rect x="52" y="22" width="140" height="70" rx="3" fill="#cbd5e1" stroke="#64748b" stroke-width="1"/>
            ${hasPeel ? `
              <g transform="translate(122, 56) scale(${scale}) translate(-122, -56)">
                <path d="M96 34 C118 28, 152 32, 156 50 C160 66, 142 82, 118 80 C94 78, 86 58, 96 34 Z" fill="url(#st-rust)" stroke="#f59e0b" stroke-width="1.8"/>
                <path d="M92 38 L104 42 L95 54 Z" fill="#e2e8f0" stroke="#475569"/>
                <path d="M153 45 L164 52 L149 62 Z" fill="#e2e8f0" stroke="#475569"/>
              </g>
              <line x1="158" y1="54" x2="214" y2="40" stroke="#fbbf24" stroke-width="1.5"/>
              <rect x="212" y="20" width="98" height="58" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="1"/>
              <text x="220" y="36" fill="#fbbf24" font-size="10" font-weight="700">防腐层局部起皮</text>
              <text x="220" y="51" fill="#e2e8f0" font-size="10">裸露碳钢约 ${p.peelArea.toFixed(1)} m²</text>
              <text x="220" y="66" fill="#94a3b8" font-size="9">测厚：局部减薄风险</text>
            ` : `
              <rect x="212" y="20" width="98" height="58" rx="5" fill="#052e16" stroke="#22c55e" stroke-width="1"/>
              <text x="220" y="40" fill="#86efac" font-size="10" font-weight="700">内壁防腐层完好</text>
              <text x="220" y="56" fill="#bbf7d0" font-size="9.5">脱落面积：0.0 m²</text>
              <text x="220" y="70" fill="#86efac" font-size="9">复验合格</text>
            `}
            <rect x="212" y="88" width="98" height="46" rx="5" fill="#1e293b" stroke="#38bdf8" stroke-width="1"/>
            <text x="220" y="104" fill="#38bdf8" font-size="9.5" font-weight="600">检修台账核对：</text>
            <text x="220" y="118" fill="#cbd5e1" font-size="9">塔内壁修补项</text>
            <text x="220" y="130" fill="#cbd5e1" font-size="9">${hasPeel ? '状态：未完成验收' : '状态：已复验闭环'}</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">塔顶仪表与检定标签放大</span>
            <span class="sim-code">PI-101</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="塔顶压力表与检定标签">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <circle cx="88" cy="78" r="56" fill="#cbd5e1" stroke="#475569" stroke-width="3"/>
            <circle cx="88" cy="78" r="48" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
            <path d="M52 102 A42 42 0 1 1 124 102" fill="none" stroke="#334155" stroke-width="2"/>
            <text x="53" y="106" fill="#334155" font-size="9" font-weight="700">0</text>
            <text x="51" y="62" fill="#334155" font-size="9" font-weight="700">0.2</text>
            <text x="82" y="42" fill="#334155" font-size="9" font-weight="700">0.4</text>
            <text x="112" y="62" fill="#334155" font-size="9" font-weight="700">0.6</text>
            <text x="110" y="106" fill="#334155" font-size="9" font-weight="700">0.8</text>
            <text x="77" y="96" fill="#475569" font-size="9" font-weight="700">MPa</text>
            <line x1="88" y1="78" x2="${pt.x}" y2="${pt.y}" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="88" cy="78" r="4.5" fill="#1e293b"/>
            <rect x="59" y="114" width="58" height="16" rx="3" fill="#0f172a"/>
            <text x="64" y="125" fill="#38bdf8" font-size="9.5" font-weight="700">${p.topPressure.toFixed(2)} MPa</text>
            <rect x="162" y="20" width="144" height="115" rx="6" fill="#fefce8" stroke="#ca8a04" stroke-width="1.5"/>
            <rect x="162" y="20" width="144" height="24" rx="5" fill="${isExpired ? '#eab308' : '#22c55e'}"/>
            <text x="190" y="36" fill="#0f172a" font-size="11" font-weight="700">强检计量器具合格证</text>
            <text x="172" y="59" fill="#334155" font-size="10">位号：PI-101（塔顶压力）</text>
            <text x="172" y="76" fill="#334155" font-size="10">校验周期：12 个月</text>
            <text x="172" y="93" fill="#334155" font-size="10">${isExpired ? '超期状态：逾期未复检' : '强检状态：在有效期内'}</text>
            <rect x="172" y="103" width="124" height="22" rx="4" fill="${isExpired ? '#fee2e2' : '#dcfce7'}" stroke="${isExpired ? '#ef4444' : '#22c55e'}" stroke-width="1"/>
            <text x="178" y="118" fill="${isExpired ? '#b91c1c' : '#15803d'}" font-size="10" font-weight="700">${isExpired ? `当前检查：已过期 ${p.expiredDays} 天` : `有效期余 ${Math.abs(p.expiredDays)} 天`}</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderScrubberBottom(p, facts) {
    const isBypass = String(p.interlockStatus).indexOf('旁路') !== -1;
    const colMaxH = 82;
    const colH = Math.max(2, (Math.min(100, Math.max(0, p.localLevel)) / 100) * colMaxH);
    const colY = (44 + colMaxH - colH).toFixed(1);
    const levelMismatch = Math.abs(p.dcsLevel - p.localLevel) >= 10 || p.localLevel < 25;

    const boltCoords = [
      [95, 34], [64, 47], [51, 78], [64, 109],
      [95, 122], [126, 109], [139, 78], [126, 47]
    ];
    const missCount = Math.min(4, Math.max(0, Math.round(p.missingBolts)));
    const presentCount = boltCoords.length - missCount;
    const boltsSvg = boltCoords.map(([bx, by], i) => {
      if (i < presentCount) {
        return `<circle cx="${bx}" cy="${by}" r="6" fill="#334155" stroke="#e2e8f0" stroke-width="2"/>`;
      }
      return `<circle cx="${bx}" cy="${by}" r="6.5" fill="#0f172a" stroke="#ef4444" stroke-width="2" stroke-dasharray="3 2"/>`;
    }).join('');

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">联锁与液位仪表对比（DCS vs 就地）</span>
            <span class="sim-code">LT-101 / SIS</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="液位联锁与液位对比">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="12" y="14" width="144" height="127" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
            <text x="20" y="31" fill="#38bdf8" font-size="10" font-weight="700">DCS / SIS 联锁画面</text>
            <rect x="20" y="39" width="128" height="28" rx="4" fill="#0f172a" stroke="#475569"/>
            <text x="27" y="51" fill="#94a3b8" font-size="9">LT-101 远传液位读数</text>
            <text x="27" y="63" fill="#22d3ee" font-size="11" font-weight="700">${p.dcsLevel.toFixed(1)} %</text>
            <rect x="20" y="75" width="128" height="56" rx="4" fill="${isBypass ? '#451a03' : '#052e16'}" stroke="${isBypass ? '#f59e0b' : '#22c55e'}" stroke-width="1.5"/>
            <text x="27" y="91" fill="${isBypass ? '#fbbf24' : '#86efac'}" font-size="10" font-weight="700">LALL-101 液位低低联锁</text>
            <text x="27" y="106" fill="${isBypass ? '#fef3c7' : '#bbf7d0'}" font-size="9.5">状态：${escapeHtml(p.interlockStatus)}</text>
            <text x="27" y="121" fill="${isBypass ? '#fca5a5' : '#86efac'}" font-size="9">${isBypass ? '挂牌：无 ｜ 审批单：缺失' : '联锁投用 · 动作回路正常'}</text>

            <rect x="166" y="14" width="142" height="127" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
            <text x="174" y="31" fill="#a7f3d0" font-size="10" font-weight="700">现场就地液位计实测</text>
            <rect x="180" y="42" width="24" height="86" rx="3" fill="#0f172a" stroke="#64748b" stroke-width="1.5"/>
            <rect x="182" y="${colY}" width="20" height="${colH.toFixed(1)}" fill="${levelMismatch ? '#0284c7' : '#22c55e'}"/>
            <line x1="176" y1="106" x2="208" y2="106" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3 2"/>
            <text x="212" y="54" fill="#cbd5e1" font-size="9.5">玻璃板就地读数：</text>
            <text x="212" y="70" fill="${levelMismatch ? '#f87171' : '#4ade80'}" font-size="12" font-weight="700">实际 ${p.localLevel.toFixed(0)}%</text>
            <text x="212" y="88" fill="${levelMismatch ? '#fbbf24' : '#86efac'}" font-size="9">${levelMismatch ? '核查发现异常：' : '核查一致：'}</text>
            <text x="212" y="102" fill="#e2e8f0" font-size="9">${Math.abs(p.dcsLevel - p.localLevel) >= 10 ? '差压变送器引压管' : '远传与就地液位'}</text>
            <text x="212" y="115" fill="#e2e8f0" font-size="9">${Math.abs(p.dcsLevel - p.localLevel) >= 10 ? '可能堵塞/虚假液位' : '比对偏差在允许内'}</text>
            <text x="212" y="129" fill="#94a3b8" font-size="8.5">(低低联锁线：25%)</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">塔底循环出口法兰局部放大</span>
            <span class="sim-code">FL-102 (DN500)</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="塔体法兰螺栓检查">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <circle cx="95" cy="78" r="56" fill="#94a3b8" stroke="#475569" stroke-width="2.5"/>
            <circle cx="95" cy="78" r="32" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
            ${boltsSvg}
            <rect x="174" y="24" width="134" height="106" rx="6" fill="#1e293b" stroke="${missCount > 0 ? '#ef4444' : '#22c55e'}"/>
            <text x="184" y="44" fill="${missCount > 0 ? '#f87171' : '#86efac'}" font-size="10.5" font-weight="700">${missCount > 0 ? `M20 螺栓缺装 ${missCount} 条` : 'M20 螺栓 8/8 齐全'}</text>
            <text x="184" y="62" fill="#e2e8f0" font-size="9.5">${missCount > 0 ? '位置：同侧邻孔空缺' : '紧固力矩复核正常'}</text>
            <text x="184" y="80" fill="#cbd5e1" font-size="9.5">垫片外观：无老化龟裂</text>
            <text x="184" y="98" fill="#cbd5e1" font-size="9.5">密封测试：常温暂无渗漏</text>
            <text x="184" y="116" fill="#94a3b8" font-size="9">${missCount > 0 ? '需补齐缺装螺栓复紧' : '法兰密封符合规范'}</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderInducedFan(p, facts) {
    const calcOilRect = (offset) => {
      const surfaceY = Math.min(120, Math.max(34, 86 - offset * 1.8));
      return { y: surfaceY.toFixed(1), h: Math.max(8, 128 - surfaceY).toFixed(1) };
    };
    const mainR = calcOilRect(p.mainOilOffset);
    const auxR = calcOilRect(p.auxOilOffset);
    const mainIsEmulsified = String(p.mainOilQuality).indexOf('乳') !== -1;
    const mainFill = mainIsEmulsified ? '#e5e7eb' : '#eab308';
    const mainTop = mainIsEmulsified ? '#ca8a04' : '#fde047';
    const mainOk = !mainIsEmulsified && p.mainOilOffset >= 0;
    const auxOk = p.auxOilOffset >= 0;

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">情况 B · 主引风机轴承箱油标视镜</span>
            <span class="sim-code">LG-201A</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="主引风机油位与油品视镜">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="34" y="16" width="56" height="123" rx="8" fill="#64748b" stroke="#94a3b8" stroke-width="2"/>
            <rect x="44" y="26" width="36" height="103" rx="4" fill="#1e293b"/>
            <rect x="45" y="${mainR.y}" width="34" height="${mainR.h}" rx="2" fill="${mainFill}"/>
            <rect x="45" y="${mainR.y}" width="34" height="5" fill="${mainTop}" opacity="0.8"/>
            <line x1="36" y1="45" x2="108" y2="45" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 2"/>
            <text x="112" y="48" fill="#38bdf8" font-size="9.5">上限 (MAX)</text>
            <line x1="36" y1="86" x2="108" y2="86" stroke="${mainOk ? '#22c55e' : '#f59e0b'}" stroke-width="1.5" stroke-dasharray="3 2"/>
            <text x="112" y="89" fill="${mainOk ? '#86efac' : '#fbbf24'}" font-size="9.5">下限 (MIN)</text>
            <rect x="112" y="100" width="194" height="40" rx="5" fill="${mainOk ? '#052e16' : '#450a0a'}" stroke="${mainOk ? '#22c55e' : '#ef4444'}"/>
            <text x="120" y="116" fill="${mainOk ? '#86efac' : '#fca5a5'}" font-size="10" font-weight="700">油位 ${p.mainOilOffset >= 0 ? `高于下限 ${p.mainOilOffset} mm` : `低于下限 ${Math.abs(p.mainOilOffset)} mm`}</text>
            <text x="120" y="131" fill="${mainOk ? '#bbf7d0' : '#fecaca'}" font-size="9.5">油样：${escapeHtml(p.mainOilQuality)}</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">情况 A · 备用/辅助侧轴承油标对照</span>
            <span class="sim-code">LG-201B</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="辅助轴承油位对照">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="34" y="16" width="56" height="123" rx="8" fill="#64748b" stroke="#94a3b8" stroke-width="2"/>
            <rect x="44" y="26" width="36" height="103" rx="4" fill="#1e293b"/>
            <rect x="45" y="${auxR.y}" width="34" height="${auxR.h}" rx="2" fill="#eab308"/>
            <rect x="45" y="${auxR.y}" width="34" height="5" fill="#fde047"/>
            <line x1="36" y1="45" x2="108" y2="45" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 2"/>
            <text x="112" y="48" fill="#38bdf8" font-size="9.5">上限 (MAX)</text>
            <line x1="36" y1="86" x2="108" y2="86" stroke="${auxOk ? '#22c55e' : '#ef4444'}" stroke-width="1.5" stroke-dasharray="3 2"/>
            <text x="112" y="89" fill="${auxOk ? '#86efac' : '#fca5a5'}" font-size="9.5">下限 (MIN)</text>
            <rect x="112" y="100" width="194" height="40" rx="5" fill="${auxOk ? '#052e16' : '#450a0a'}" stroke="${auxOk ? '#22c55e' : '#ef4444'}"/>
            <text x="120" y="116" fill="${auxOk ? '#86efac' : '#fca5a5'}" font-size="10" font-weight="700">油位 ${p.auxOilOffset >= 0 ? `在低限上方 ${p.auxOilOffset} mm` : `低于下限 ${Math.abs(p.auxOilOffset)} mm`}</text>
            <text x="120" y="131" fill="${auxOk ? '#bbf7d0' : '#fecaca'}" font-size="9.5">油品色泽：金黄清亮、无杂质水珠</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderCoolingWater(p, facts) {
    const pt = calcNeedlePoint(66, 54, 24, p.pressure, 0, 1.5, 135, 210);
    const valveOpen = p.valveStatus === '开启';
    const hasFlow = p.flow > 0;
    const tempOk = p.returnTemp <= p.maxTemp;

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">冷却水总管压力、流量与阀门状态</span>
            <span class="sim-code">PI-301 / FI-301</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="冷却水压力流量与阀门实时视图">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="106" width="292" height="22" rx="4" fill="${hasFlow ? '#0ea5e9' : '#94a3b8'}" stroke="#475569" stroke-width="1.5"/>
            <line x1="66" y1="106" x2="66" y2="86" stroke="#cbd5e1" stroke-width="6"/>
            <circle cx="66" cy="54" r="34" fill="#f8fafc" stroke="#64748b" stroke-width="3"/>
            <text x="46" y="73" fill="#334155" font-size="8" font-weight="700">0</text>
            <text x="41" y="47" fill="#334155" font-size="8" font-weight="700">0.5</text>
            <text x="61" y="31" fill="#334155" font-size="8" font-weight="700">1.0</text>
            <text x="82" y="47" fill="#334155" font-size="8" font-weight="700">1.5</text>
            <line x1="66" y1="54" x2="${pt.x}" y2="${pt.y}" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="66" cy="54" r="3" fill="#0f172a"/>
            <rect x="33" y="88" width="66" height="17" rx="3" fill="#1d4ed8"/>
            <text x="40" y="100" fill="#ffffff" font-size="9.5" font-weight="700">${p.pressure.toFixed(2)} MPa</text>

            <rect x="144" y="98" width="26" height="36" rx="3" fill="#475569" stroke="#cbd5e1"/>
            <line x1="157" y1="98" x2="157" y2="${valveOpen ? 68 : 78}" stroke="#cbd5e1" stroke-width="4"/>
            <ellipse cx="157" cy="${valveOpen ? 66 : 76}" rx="22" ry="6" fill="${valveOpen ? '#16a34a' : '#dc2626'}" stroke="${valveOpen ? '#86efac' : '#fca5a5'}" stroke-width="1.5"/>
            <rect x="118" y="134" width="78" height="17" rx="3" fill="${valveOpen ? '#16a34a' : '#dc2626'}"/>
            <text x="127" y="146" fill="#ffffff" font-size="9.5" font-weight="700">供水阀：${escapeHtml(p.valveStatus)}</text>

            <line x1="248" y1="106" x2="248" y2="86" stroke="#cbd5e1" stroke-width="6"/>
            <rect x="214" y="22" width="68" height="64" rx="8" fill="#0284c7" stroke="#7dd3fc" stroke-width="2"/>
            <rect x="221" y="31" width="54" height="34" rx="4" fill="#0f172a"/>
            <text x="248" y="51" text-anchor="middle" fill="${hasFlow ? '#4ade80' : '#f87171'}" font-size="13" font-weight="700">${p.flow.toFixed(2)}</text>
            <text x="248" y="61" text-anchor="middle" fill="#94a3b8" font-size="8">m³/h</text>
            <rect x="214" y="88" width="68" height="17" rx="3" fill="${hasFlow ? '#052e16' : '#1e293b'}" stroke="${hasFlow ? '#22c55e' : '#f87171'}"/>
            <text x="248" y="100" text-anchor="middle" fill="${hasFlow ? '#86efac' : '#fca5a5'}" font-size="9.5" font-weight="700">${hasFlow ? '循环流动中' : '流量为 0'}</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">冷却水回水温度与运行趋势</span>
            <span class="sim-code">TI-302 / DCS</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="冷却水回水温度实时视图">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="16" width="292" height="58" rx="6" fill="#1e293b" stroke="${tempOk ? '#334155' : '#ef4444'}"/>
            <text x="26" y="36" fill="#94a3b8" font-size="10">辅助冷却分支（TI-302）回水温度实测：</text>
            <text x="26" y="61" fill="${tempOk ? '#22d3ee' : '#f87171'}" font-size="20" font-weight="700">${p.returnTemp.toFixed(1)} ℃</text>
            <rect x="165" y="39" width="128" height="24" rx="4" fill="${tempOk ? '#052e16' : '#450a0a'}" stroke="${tempOk ? '#22c55e' : '#ef4444'}"/>
            <text x="175" y="55" fill="${tempOk ? '#86efac' : '#fca5a5'}" font-size="10" font-weight="600">${tempOk ? `设计上限：≤ ${p.maxTemp} ℃` : `超限！上限 ${p.maxTemp} ℃`}</text>

            <rect x="14" y="84" width="292" height="56" rx="6" fill="#1e293b" stroke="#334155"/>
            <text x="26" y="103" fill="#fbbf24" font-size="10" font-weight="700">主冷却回路实时核对提示：</text>
            <text x="26" y="120" fill="#cbd5e1" font-size="9.5">• 泵出口压力：${p.pressure.toFixed(2)} MPa（${hasFlow ? '正常建立循环压头' : '疑似静压憋压'}）</text>
            <text x="26" y="133" fill="#cbd5e1" font-size="9.5">• 流量与阀位：${p.flow.toFixed(1)} m³/h，供水手动阀处于${escapeHtml(p.valveStatus)}位</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderRtoChamber(p, facts) {
    const hasBend = p.railBendCm > 0;
    const midY = (109 + Math.min(20, p.railBendCm * 3.2)).toFixed(1);
    const isSafeReady = String(p.manholeStatus).indexOf('气体检测') !== -1 || String(p.manholeStatus).indexOf('封闭') !== -1;

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">三室 RTO 蓄热床与平台护栏现状</span>
            <span class="sim-code">R-101 / PL-2F</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="RTO蓄热床与二层平台护栏">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="20" y="20" width="52" height="62" rx="3" fill="#334155" stroke="#64748b"/>
            <rect x="78" y="20" width="52" height="62" rx="3" fill="#334155" stroke="#64748b"/>
            <rect x="136" y="20" width="52" height="62" rx="3" fill="#334155" stroke="#64748b"/>
            <text x="34" y="45" fill="#e2e8f0" font-size="10" font-weight="700">A 室</text>
            <text x="92" y="45" fill="#e2e8f0" font-size="10" font-weight="700">B 室</text>
            <text x="150" y="45" fill="#e2e8f0" font-size="10" font-weight="700">C 室</text>
            <text x="27" y="64" fill="#94a3b8" font-size="8.5">待机 ${p.chamberTemp}℃</text>
            <text x="85" y="64" fill="#94a3b8" font-size="8.5">待机 ${p.chamberTemp + 1}℃</text>
            <text x="143" y="64" fill="#94a3b8" font-size="8.5">待机 ${p.chamberTemp}℃</text>

            <rect x="16" y="128" width="182" height="8" fill="#475569"/>
            <line x1="26" y1="88" x2="26" y2="128" stroke="#eab308" stroke-width="3.5"/>
            <line x1="104" y1="88" x2="104" y2="128" stroke="#eab308" stroke-width="3.5"/>
            <line x1="184" y1="88" x2="184" y2="128" stroke="#eab308" stroke-width="3.5"/>
            <line x1="26" y1="90" x2="184" y2="90" stroke="#eab308" stroke-width="3"/>
            <line x1="26" y1="109" x2="104" y2="109" stroke="#eab308" stroke-width="2.5"/>
            <path d="M104 109 Q144 ${midY} 184 109" fill="none" stroke="${hasBend ? '#f97316' : '#eab308'}" stroke-width="3"/>

            <rect x="206" y="20" width="102" height="116" rx="6" fill="#1e293b" stroke="${hasBend ? '#f59e0b' : '#22c55e'}"/>
            <text x="214" y="40" fill="${hasBend ? '#fbbf24' : '#86efac'}" font-size="10" font-weight="700">${hasBend ? '护栏局部变形' : '平台护栏完好'}</text>
            <text x="214" y="58" fill="#e2e8f0" font-size="9">位置：二层东侧平台</text>
            <text x="214" y="75" fill="#e2e8f0" font-size="9">立柱焊接完好，</text>
            <text x="214" y="90" fill="#e2e8f0" font-size="9">${hasBend ? `中横杆弯曲约 ${p.railBendCm}cm` : '中横杆平直无变形'}</text>
            <text x="214" y="106" fill="#86efac" font-size="9">不影响整体结构承载</text>
            <text x="214" y="124" fill="#94a3b8" font-size="8.5">${hasBend ? '建议：限期整形修复' : '结构检查合格'}</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">炉膛/塔内受限空间人孔检查点</span>
            <span class="sim-code">MH-101 (安全红线)</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="受限空间作业安全确认看板">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="16" width="292" height="123" rx="6" fill="#1e293b" stroke="${isSafeReady ? '#22c55e' : '#ef4444'}" stroke-width="1.5"/>
            <rect x="14" y="16" width="292" height="28" rx="5" fill="${isSafeReady ? '#15803d' : '#991b1b'}"/>
            <text x="30" y="34" fill="#fef2f2" font-size="11" font-weight="700">${isSafeReady ? '✓ 受限空间隔离与监测手续齐全' : '⚠ 警示：进入设备内部属于受限空间作业'}</text>
            <text x="26" y="64" fill="#e2e8f0" font-size="10">人孔当前状态：${escapeHtml(p.manholeStatus)}</text>
            <text x="26" y="84" fill="#fbbf24" font-size="10">前置确认清单（需按 GB 30871-2022 核查）：</text>
            <text x="26" y="103" fill="#cbd5e1" font-size="9.5">${isSafeReady ? '☑' : '□'} 气体分析（O₂ / 可燃气体 / 有毒气体）</text>
            <text x="26" y="119" fill="#cbd5e1" font-size="9.5">${isSafeReady ? '☑' : '□'} 工艺盲板隔离与机械通风置换</text>
            <text x="26" y="135" fill="#cbd5e1" font-size="9.5">${isSafeReady ? '☑' : '□'} 作业许可审批及外部专人监护</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderRtoValves(p, facts) {
    const pt = calcNeedlePoint(84, 76, 36, p.airPressure, 0, 1.0, 135, 270);
    const pOk = p.airPressure >= 0.5 && p.airPressure <= 0.7;
    const tOk = p.switchTime <= p.stdSwitchTime;
    const stdW = Math.min(140, Math.max(24, p.stdSwitchTime * 15)).toFixed(0);
    const curW = Math.min(148, Math.max(20, p.switchTime * 14.5)).toFixed(0);
    const ratioStr = p.stdSwitchTime > 0 ? (p.switchTime / p.stdSwitchTime).toFixed(1) : '1.0';

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">切换阀仪表气源减压站</span>
            <span class="sim-code">PI-401 (IA)</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="仪表气源压力实时视图">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <circle cx="84" cy="76" r="54" fill="#f8fafc" stroke="#64748b" stroke-width="3"/>
            <path d="M84 32 A44 44 0 0 1 124 94" fill="none" stroke="#22c55e" stroke-width="7"/>
            <path d="M52 106 A44 44 0 0 1 56 42" fill="none" stroke="#ef4444" stroke-width="7"/>
            <text x="48" y="106" fill="#334155" font-size="9" font-weight="700">0</text>
            <text x="41" y="64" fill="#334155" font-size="9" font-weight="700">0.3</text>
            <text x="77" y="38" fill="#334155" font-size="9" font-weight="700">0.5</text>
            <text x="111" y="64" fill="#334155" font-size="9" font-weight="700">0.7</text>
            <text x="108" y="106" fill="#334155" font-size="9" font-weight="700">1.0</text>
            <line x1="84" y1="76" x2="${pt.x}" y2="${pt.y}" stroke="${pOk ? '#16a34a' : '#dc2626'}" stroke-width="3" stroke-linecap="round"/>
            <circle cx="84" cy="76" r="4.5" fill="#1e293b"/>

            <rect x="154" y="24" width="152" height="106" rx="6" fill="#1e293b" stroke="${pOk ? '#22c55e' : '#ef4444'}"/>
            <text x="164" y="45" fill="#94a3b8" font-size="9.5">实测仪表气源压力：</text>
            <text x="164" y="69" fill="${pOk ? '#4ade80' : '#f87171'}" font-size="20" font-weight="700">${p.airPressure.toFixed(2)} MPa</text>
            <text x="164" y="91" fill="#86efac" font-size="10">设计要求：0.5 ~ 0.7 MPa</text>
            <text x="164" y="111" fill="${pOk ? '#86efac' : '#fca5a5'}" font-size="9.5">${pOk ? '状态：气源压力正常' : (p.airPressure < 0.5 ? '状态：气源压力偏低' : '状态：气源超压告警')}</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">提升切换阀就地动作测试</span>
            <span class="sim-code">XV-401A/B/C</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="切换阀动作时间实时对比">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="16" y="18" width="288" height="119" rx="6" fill="#1e293b" stroke="#475569"/>
            <text x="28" y="40" fill="#38bdf8" font-size="10.5" font-weight="700">三室切换阀全行程开/关响应测试结果</text>
            <text x="28" y="64" fill="#94a3b8" font-size="9.5">标准动作时间 (≤${p.stdSwitchTime.toFixed(1)}s)</text>
            <rect x="148" y="54" width="${stdW}" height="13" rx="3" fill="#22c55e"/>
            <text x="${154 + Number(stdW)}" y="64" fill="#86efac" font-size="10" font-weight="700">${p.stdSwitchTime.toFixed(1)} s</text>

            <text x="28" y="92" fill="${tOk ? '#86efac' : '#fca5a5'}" font-size="9.5">本次实测时间</text>
            <rect x="148" y="82" width="${curW}" height="13" rx="3" fill="${tOk ? '#22c55e' : '#ef4444'}"/>
            <text x="148" y="114" fill="${tOk ? '#4ade80' : '#f87171'}" font-size="13" font-weight="700">实测 ${p.switchTime.toFixed(1)} s（${tOk ? '达标正常' : `超限达标准 ${ratioStr} 倍`}）</text>
            <text x="28" y="128" fill="#cbd5e1" font-size="9">${tOk ? '现象：气缸驱动有力，切换响应迅速同步' : '现象：驱动力不足，阀板闭合明显迟滞'}</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderCemsStack(p, facts) {
    const isCal = String(p.gasAlarmMode).indexOf('CAL') !== -1;
    const driftOk = Math.abs(p.zeroDrift) <= 0.5;
    const gasValid = p.stdGasExpiredDays <= 0;

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">可燃气体报警控制器就地面板</span>
            <span class="sim-code">GD-501</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="可燃气体报警仪面板">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="20" y="16" width="280" height="123" rx="8" fill="#334155" stroke="#64748b" stroke-width="2"/>
            <rect x="36" y="28" width="174" height="66" rx="4" fill="#090d16" stroke="#475569"/>
            <text x="46" y="48" fill="${isCal ? '#fbbf24' : '#4ade80'}" font-size="11" font-weight="700">${escapeHtml(p.gasAlarmMode)}</text>
            <text x="46" y="68" fill="${isCal ? '#f87171' : '#86efac'}" font-size="13" font-weight="700">${isCal ? '检测元件：未投用 / 离线' : '检测元件：正常监测'}</text>
            <text x="46" y="85" fill="#94a3b8" font-size="9">${isCal ? '当前显示：--- %LEL (信号保持)' : '当前显示：0.0 %LEL (安全在线)'}</text>
            <circle cx="242" cy="44" r="9" fill="${isCal ? '#334155' : '#22c55e'}" stroke="${isCal ? '#64748b' : '#bbf7d0'}" stroke-width="${isCal ? 1 : 2}"/>
            <text x="257" y="48" fill="${isCal ? '#94a3b8' : '#86efac'}" font-size="9">正常</text>
            <circle cx="242" cy="70" r="9" fill="${isCal ? '#f59e0b' : '#334155'}" stroke="${isCal ? '#fef08a' : '#64748b'}" stroke-width="${isCal ? 2 : 1}"/>
            <text x="257" y="74" fill="${isCal ? '#fbbf24' : '#94a3b8'}" font-size="9.5" font-weight="700">标定/屏蔽</text>
            <rect x="36" y="102" width="248" height="26" rx="4" fill="${isCal ? '#451a03' : '#052e16'}" stroke="${isCal ? '#f59e0b' : '#22c55e'}"/>
            <text x="46" y="119" fill="${isCal ? '#fde68a' : '#86efac'}" font-size="9.5">${isCal ? '核查：未切换回正常监测，RTO入口防爆监测缺失' : '核查：入口可燃气体报警仪已可靠投用'}</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">CEMS 烟气在线监测单元面板</span>
            <span class="sim-code">AT-502 (HJ 76)</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="CEMS分析仪实时诊断面板">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="16" y="16" width="288" height="123" rx="6" fill="#1e293b" stroke="#475569"/>
            <text x="26" y="36" fill="#38bdf8" font-size="10" font-weight="700">CEMS 分析仪校准与参数诊断画面</text>
            <rect x="26" y="44" width="268" height="24" rx="4" fill="${driftOk ? '#052e16' : '#450a0a'}" stroke="${driftOk ? '#22c55e' : '#ef4444'}"/>
            <text x="34" y="60" fill="${driftOk ? '#86efac' : '#fca5a5'}" font-size="9.5" font-weight="700">1. 零点漂移：${p.zeroDrift >= 0 ? '+' : ''}${p.zeroDrift.toFixed(1)}% F.S.（要求 ≤ ±0.5%）</text>

            <rect x="26" y="74" width="268" height="24" rx="4" fill="${gasValid ? '#052e16' : '#450a0a'}" stroke="${gasValid ? '#22c55e' : '#ef4444'}"/>
            <text x="34" y="90" fill="${gasValid ? '#86efac' : '#fca5a5'}" font-size="9.5" font-weight="700">2. 标准气体有效期：${gasValid ? `有效（剩余 ${Math.abs(p.stdGasExpiredDays)} 天）` : `已过期 ${p.stdGasExpiredDays} 天（无法校准）`}</text>

            <rect x="26" y="104" width="268" height="24" rx="4" fill="#052e16" stroke="#22c55e"/>
            <text x="34" y="120" fill="#86efac" font-size="9.5" font-weight="600">3. 仪表量程设定：与环评批复一致（不同于出厂铭牌）</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderUtilitiesPlc(p, facts) {
    const airOk = p.airMainPressure >= 0.6 && p.airMainPressure <= 0.8;
    const n2Ok = p.n2Pressure >= 0.4 && p.n2Pressure <= 0.6;
    const pwrOk = String(p.powerStatus).indexOf('均带电') !== -1;
    const tagOk = String(p.nameplateStatus).indexOf('齐全') !== -1;

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">公用工程与双回路配电柜监控</span>
            <span class="sim-code">UT-601 / MCC</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="压缩空气、氮气与双回路供电监控">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="18" width="92" height="118" rx="6" fill="${airOk ? '#052e16' : '#450a0a'}" stroke="${airOk ? '#22c55e' : '#ef4444'}" stroke-width="1.2"/>
            <text x="24" y="38" fill="${airOk ? '#bbf7d0' : '#fecaca'}" font-size="9.5" font-weight="700">压缩空气总管</text>
            <text x="24" y="68" fill="${airOk ? '#4ade80' : '#f87171'}" font-size="16" font-weight="700">${p.airMainPressure.toFixed(2)}</text>
            <text x="68" y="68" fill="#cbd5e1" font-size="10">MPa</text>
            <text x="22" y="92" fill="#cbd5e1" font-size="8.5">设计: 0.6~0.8</text>
            <text x="22" y="118" fill="${airOk ? '#4ade80' : '#fca5a5'}" font-size="9.5" font-weight="700">${airOk ? '● 压力正常' : '● 压力超限'}</text>

            <rect x="114" y="18" width="92" height="118" rx="6" fill="${n2Ok ? '#052e16' : '#450a0a'}" stroke="${n2Ok ? '#22c55e' : '#ef4444'}" stroke-width="1.2"/>
            <text x="124" y="38" fill="${n2Ok ? '#bbf7d0' : '#fecaca'}" font-size="9.5" font-weight="700">氮气密封总管</text>
            <text x="124" y="68" fill="${n2Ok ? '#4ade80' : '#f87171'}" font-size="16" font-weight="700">${p.n2Pressure.toFixed(2)}</text>
            <text x="168" y="68" fill="#cbd5e1" font-size="10">MPa</text>
            <text x="122" y="92" fill="#cbd5e1" font-size="8.5">设计: 0.4~0.6</text>
            <text x="122" y="118" fill="${n2Ok ? '#4ade80' : '#fca5a5'}" font-size="9.5" font-weight="700">${n2Ok ? '● 压力正常' : '● 压力超限'}</text>

            <rect x="214" y="18" width="92" height="118" rx="6" fill="${pwrOk ? '#052e16' : '#451a03'}" stroke="${pwrOk ? '#22c55e' : '#f59e0b'}" stroke-width="1.2"/>
            <text x="224" y="38" fill="${pwrOk ? '#bbf7d0' : '#fde68a'}" font-size="9.5" font-weight="700">双回路供电</text>
            <circle cx="232" cy="64" r="6" fill="#22c55e"/>
            <text x="243" y="68" fill="#e2e8f0" font-size="9">I段：带电</text>
            <circle cx="232" cy="88" r="6" fill="${pwrOk ? '#22c55e' : '#ef4444'}"/>
            <text x="243" y="92" fill="#e2e8f0" font-size="9">${pwrOk ? 'II段：带电' : 'II段：失电'}</text>
            <text x="222" y="118" fill="${pwrOk ? '#4ade80' : '#fbbf24'}" font-size="9.5" font-weight="700">${pwrOk ? '● 备自投正常' : '● 备自投告警'}</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">现场设备铭牌与管道介质标识特写</span>
            <span class="sim-code">TAG-602</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="设备铭牌与管道介质标识检查">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="20" y="28" width="280" height="30" rx="4" fill="#64748b" stroke="#94a3b8"/>
            <rect x="112" y="28" width="54" height="30" fill="${tagOk ? '#0ea5e9' : '#78716c'}" opacity="0.85"/>
            <text x="118" y="47" fill="${tagOk ? '#ffffff' : '#d6d3d1'}" font-size="9">${tagOk ? '介质:碱液→' : '介质: ?? →'}</text>
            <rect x="26" y="72" width="128" height="66" rx="4" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
            <text x="36" y="92" fill="#1e293b" font-size="10" font-weight="700">${tagOk ? '设备铭牌（清晰）' : '设备铭牌（污损）'}</text>
            ${tagOk ? '' : '<line x1="34" y1="98" x2="144" y2="124" stroke="#451a03" stroke-width="7" opacity="0.45"/>'}
            <text x="36" y="112" fill="#1e293b" font-size="8.5">${tagOk ? '型号：RTO-250A' : '型号：████-250'}</text>
            <text x="36" y="128" fill="#1e293b" font-size="8.5">${tagOk ? '出厂编号：SN202601' : '出厂编号：字迹模糊'}</text>

            <rect x="166" y="72" width="136" height="66" rx="5" fill="#1e293b" stroke="${tagOk ? '#22c55e' : '#f59e0b'}"/>
            <text x="176" y="91" fill="${tagOk ? '#86efac' : '#fbbf24'}" font-size="10" font-weight="700">标识核查现象：</text>
            <text x="176" y="108" fill="#e2e8f0" font-size="9">${escapeHtml(p.powerStatus.slice(0, 12))}</text>
            <text x="176" y="123" fill="#e2e8f0" font-size="9">${escapeHtml(p.nameplateStatus)}</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderGeneric(hotspot, p, facts) {
    const title = escapeHtml(hotspot && hotspot.name ? hotspot.name : '现场设备节点');
    const code = escapeHtml(hotspot && hotspot.code ? hotspot.code : 'DEV-00');
    const pt = calcNeedlePoint(88, 78, 35, p.param1Value, 0, 1.6, 135, 270);
    const isOk = p.deviceStatus === '正常投用';
    const isWarn = p.deviceStatus === '待检停机';
    const statusColor = isOk ? '#22c55e' : (isWarn ? '#f59e0b' : '#ef4444');
    const statusBg = isOk ? '#052e16' : (isWarn ? '#451a03' : '#450a0a');

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">${escapeHtml(p.param1Label)} 实时表盘</span>
            <span class="sim-code">${code}</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="自定义设备仪表表盘">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <circle cx="88" cy="78" r="54" fill="#f8fafc" stroke="#64748b" stroke-width="3"/>
            <path d="M52 106 A44 44 0 1 1 124 106" fill="none" stroke="#334155" stroke-width="2"/>
            <text x="53" y="106" fill="#334155" font-size="9" font-weight="700">0</text>
            <text x="50" y="62" fill="#334155" font-size="9" font-weight="700">0.4</text>
            <text x="81" y="40" fill="#334155" font-size="9" font-weight="700">0.8</text>
            <text x="112" y="62" fill="#334155" font-size="9" font-weight="700">1.2</text>
            <text x="108" y="106" fill="#334155" font-size="9" font-weight="700">1.6</text>
            <line x1="88" y1="78" x2="${pt.x}" y2="${pt.y}" stroke="#0284c7" stroke-width="2.8" stroke-linecap="round"/>
            <circle cx="88" cy="78" r="4.5" fill="#1e293b"/>

            <rect x="160" y="24" width="146" height="106" rx="6" fill="#1e293b" stroke="${statusColor}"/>
            <text x="172" y="46" fill="#94a3b8" font-size="9.5">${escapeHtml(p.param1Label)}：</text>
            <text x="172" y="72" fill="#38bdf8" font-size="20" font-weight="700">${toNum(p.param1Value, 0).toFixed(2)} ${escapeHtml(p.param1Unit)}</text>
            <rect x="172" y="90" width="122" height="24" rx="4" fill="${statusBg}" stroke="${statusColor}"/>
            <text x="233" y="106" text-anchor="middle" fill="#f8fafc" font-size="10" font-weight="700">${escapeHtml(p.deviceStatus)}</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">${title} · 运行工况看板</span>
            <span class="sim-code">${code}</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="自定义部位运行参数看板">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="16" width="292" height="58" rx="6" fill="#1e293b" stroke="#334155"/>
            <text x="26" y="36" fill="#94a3b8" font-size="10">${escapeHtml(p.param2Label)} 实测值：</text>
            <text x="26" y="62" fill="#22d3ee" font-size="20" font-weight="700">${toNum(p.param2Value, 0)} ${escapeHtml(p.param2Unit)}</text>
            <rect x="14" y="84" width="292" height="56" rx="6" fill="#1e293b" stroke="#334155"/>
            <text x="26" y="104" fill="#fbbf24" font-size="10" font-weight="700">部位现场描述（${code}）：</text>
            <text x="26" y="123" fill="#cbd5e1" font-size="9.5">${escapeHtml(String((hotspot && hotspot.sceneSummary) || '请核查该部位运行参数与验收规范').slice(0, 34))}</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  function renderModularTemplate(tpl, hotspot, p) {
    const leftTitle = escapeHtml(tpl.leftPanelTitle || '左侧现场仪表监测');
    const leftCode = escapeHtml(tpl.leftPanelCode || (hotspot && hotspot.code) || 'L-01');
    const rightTitle = escapeHtml(tpl.rightPanelTitle || '右侧工况分析看板');
    const rightCode = escapeHtml(tpl.rightPanelCode || (hotspot && hotspot.code) || 'R-01');
    const leftHtml = renderPanelBody(tpl.leftPanelType || 'gauge_dial', 'left', p, tpl);
    const rightHtml = renderPanelBody(tpl.rightPanelType || 'dcs_interlock', 'right', p, tpl);
    const facts = `① ${summarizePanelFacts(tpl.leftPanelType || 'gauge_dial', 'left', p)}；② ${summarizePanelFacts(tpl.rightPanelType || 'dcs_interlock', 'right', p)}。`;

    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">${leftTitle}</span>
            <span class="sim-code">${leftCode}</span>
          </div>
          ${leftHtml}
        </div>
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">${rightTitle}</span>
            <span class="sim-code">${rightCode}</span>
          </div>
          ${rightHtml}
        </div>
      </div>
      <div class="sim-facts-bar"><span><strong>现场可见现象：</strong>${escapeHtml(facts)}</span></div>`;
  }

  const WIDGET_OPTIONS = DEFAULT_BUILTIN_OPTIONS.slice();

  function registerTemplates(templates) {
    if (!Array.isArray(templates) || !templates.length) return;
    Object.keys(CUSTOM_TEMPLATES_MAP).forEach((k) => delete CUSTOM_TEMPLATES_MAP[k]);

    const seen = new Set();
    const nextOptions = [];

    templates.forEach((tpl) => {
      if (!tpl || !tpl.code) return;
      const code = String(tpl.code);
      CUSTOM_TEMPLATES_MAP[code] = tpl;

      if (Array.isArray(tpl.paramSchema) && tpl.paramSchema.length) {
        WIDGET_PARAM_SCHEMAS[code] = tpl.paramSchema;
      } else if (!BUILTIN_WIDGET_PARAM_SCHEMAS[code]) {
        WIDGET_PARAM_SCHEMAS[code] = buildSchemaForPanels(tpl.leftPanelType, tpl.rightPanelType);
      }

      if (!seen.has(code)) {
        seen.add(code);
        nextOptions.push({
          value: code,
          label: tpl.isBuiltin ? (tpl.name || code) : `[自定义] ${tpl.name || code}`
        });
      }
    });

    DEFAULT_BUILTIN_OPTIONS.forEach((b) => {
      if (!seen.has(b.value)) {
        nextOptions.push(b);
      }
    });

    WIDGET_OPTIONS.length = 0;
    nextOptions.forEach((o) => WIDGET_OPTIONS.push(o));
  }

  global.VisualWidgets = {
    PANEL_COMPONENT_TYPES: PANEL_COMPONENT_TYPES,
    WIDGET_PARAM_SCHEMAS: WIDGET_PARAM_SCHEMAS,
    CUSTOM_TEMPLATES_MAP: CUSTOM_TEMPLATES_MAP,
    WIDGET_OPTIONS: WIDGET_OPTIONS,
    buildSchemaForPanels: buildSchemaForPanels,
    registerTemplates: registerTemplates,
    getDefaultParams: getDefaultParams,
    resolveParams: resolveParams,
    buildFactsText: buildFactsText,
    previewTemplate: function (tpl, overrideParams) {
      if (!tpl) return '';
      const schema = Array.isArray(tpl.paramSchema) && tpl.paramSchema.length
        ? tpl.paramSchema
        : buildSchemaForPanels(tpl.leftPanelType, tpl.rightPanelType);
      const p = {};
      schema.forEach((f) => {
        const raw = overrideParams && overrideParams[f.key] !== undefined ? overrideParams[f.key] : f.default;
        p[f.key] = f.type === 'number' ? toNum(raw, f.default) : raw;
      });
      return renderModularTemplate(tpl, { name: tpl.name || '预览模板', code: 'PREVIEW' }, p);
    },
    render: function (widgetType, hotspot, overrideParams) {
      const effectiveHs = overrideParams
        ? Object.assign({}, hotspot, { widgetParams: overrideParams })
        : hotspot;
      const p = resolveParams(widgetType, effectiveHs);
      const customTpl = CUSTOM_TEMPLATES_MAP[widgetType];
      if (customTpl && (!customTpl.isBuiltin || !BUILTIN_WIDGET_PARAM_SCHEMAS[widgetType])) {
        return renderModularTemplate(customTpl, effectiveHs, p);
      }
      const facts = buildFactsText(widgetType, effectiveHs, p);
      switch (widgetType) {
        case 'scrubber_top':
          return renderScrubberTop(p, facts);
        case 'scrubber_bottom':
          return renderScrubberBottom(p, facts);
        case 'induced_fan':
          return renderInducedFan(p, facts);
        case 'cooling_water':
          return renderCoolingWater(p, facts);
        case 'rto_chamber':
          return renderRtoChamber(p, facts);
        case 'rto_valves':
          return renderRtoValves(p, facts);
        case 'cems_stack':
          return renderCemsStack(p, facts);
        case 'utilities_plc':
          return renderUtilitiesPlc(p, facts);
        case 'generic':
          return renderGeneric(effectiveHs, p, facts);
        default:
          if (customTpl) return renderModularTemplate(customTpl, effectiveHs, p);
          return renderGeneric(effectiveHs, p, facts);
      }
    }
  };
})(window);
