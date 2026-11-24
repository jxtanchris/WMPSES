/**
 * WMPSES 零依赖 3D 工业数字孪生与第一人称漫游引擎
 * 场景：碱洗预处理 + 三室蓄热式焚烧 (RTO) 联合装置
 * 支持：3D 轨道环绕 (3d-orbit)、第一人称巡检漫游 (3d-fps)、2D 全景切换、
 *       6 机位平滑飞行传送、工况流体粒子实时联动、3D->2D 热点实时投影与射线拾取
 */
(function (global) {
  'use strict';

  const PRESETS = {
    overview: {
      label: '全景总览',
      orbit: { tx: 1.8, ty: -0.5, tz: 4.5, yaw: -0.22, pitch: 0.34, distance: 28.0 },
      fps: { x: 1.5, y: -17.5, z: 1.75, yaw: 0.02, pitch: 0.14 }
    },
    scrubber_top: {
      label: '塔顶平台 (A-101A)',
      orbit: { tx: -11.5, ty: 0.2, tz: 8.8, yaw: -0.42, pitch: 0.24, distance: 12.5 },
      fps: { x: -7.8, y: -7.8, z: 7.4, yaw: -0.45, pitch: 0.10 }
    },
    scrubber_bottom: {
      label: '塔底法兰区 (A-101B)',
      orbit: { tx: -10.8, ty: -1.4, tz: 2.3, yaw: -0.30, pitch: 0.22, distance: 11.0 },
      fps: { x: -9.5, y: -8.5, z: 1.75, yaw: -0.20, pitch: 0.04 }
    },
    fan_cooling: {
      label: '风机与冷却水区 (B-101/W-101)',
      orbit: { tx: -3.5, ty: -4.2, tz: 1.8, yaw: 0.18, pitch: 0.28, distance: 12.5 },
      fps: { x: -3.5, y: -11.5, z: 1.75, yaw: 0.0, pitch: -0.02 }
    },
    rto_frame: {
      label: 'RTO本体与切换阀 (R-101/V-101)',
      orbit: { tx: 4.5, ty: -1.0, tz: 4.2, yaw: 0.24, pitch: 0.24, distance: 15.5 },
      fps: { x: 4.5, y: -10.2, z: 5.8, yaw: 0.0, pitch: -0.08 }
    },
    stack_plc: {
      label: '排气筒与中控站 (M-101/U-101)',
      orbit: { tx: 13.0, ty: -2.0, tz: 3.8, yaw: -0.28, pitch: 0.24, distance: 15.5 },
      fps: { x: 12.8, y: -11.5, z: 1.75, yaw: 0.04, pitch: 0.10 }
    }
  };

  const HOTSPOT_DEFAULT_POS3D = {
    'hs-scrubber-top': { x: -11.5, y: -2.15, z: 8.8 },
    'hs-scrubber-bottom': { x: -10.8, y: -2.5, z: 2.3 },
    'hs-induced-fan': { x: -5.2, y: -3.5, z: 1.8 },
    'hs-cooling-water': { x: -1.8, y: -6.1, z: 1.9 },
    'hs-rto-chamber': { x: 4.5, y: -2.3, z: 6.4 },
    'hs-rto-valves': { x: 4.5, y: -3.6, z: 1.5 },
    'hs-cems-stack': { x: 11.2, y: -2.0, z: 4.8 },
    'hs-utilities-plc': { x: 15.2, y: -4.3, z: 2.0 }
  };

  // ==========================================
  // 向量与颜色工具
  // ==========================================
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    let diff = (b - a) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function normalize(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function shadeHex(rgb, factor) {
    const r = clamp(Math.round(rgb[0] * factor), 0, 255);
    const g = clamp(Math.round(rgb[1] * factor), 0, 255);
    const b = clamp(Math.round(rgb[2] * factor), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  const LIGHT_DIR = normalize([-0.45, -0.62, 0.78]);

  // ==========================================
  // 3D 几何体构建器（返回面片 { verts, color, stroke, doubleSided }）
  // ==========================================
  function buildBoxFaces(cx, cy, cz, sx, sy, sz, color, stroke) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const v = [
      [cx - hx, cy - hy, cz - hz], // 0: L B D
      [cx + hx, cy - hy, cz - hz], // 1: R B D
      [cx + hx, cy + hy, cz - hz], // 2: R F D
      [cx - hx, cy + hy, cz - hz], // 3: L F D
      [cx - hx, cy - hy, cz + hz], // 4: L B U
      [cx + hx, cy - hy, cz + hz], // 5: R B U
      [cx + hx, cy + hy, cz + hz], // 6: R F U
      [cx - hx, cy + hy, cz + hz]  // 7: L F U
    ];
    const quads = [
      [v[4], v[5], v[6], v[7]], // top +Z
      [v[3], v[2], v[1], v[0]], // bottom -Z
      [v[0], v[1], v[5], v[4]], // front -Y
      [v[2], v[3], v[7], v[6]], // back +Y
      [v[3], v[0], v[4], v[7]], // left -X
      [v[1], v[2], v[6], v[5]]  // right +X
    ];
    return quads.map((pts) => ({ verts: pts, color: color, stroke: stroke || null, doubleSided: false }));
  }

  function buildCylinderFaces(cx, cy, z0, z1, rBottom, rTop, segs, color, capColor, stroke) {
    const faces = [];
    const step = (Math.PI * 2) / segs;
    const topPts = [];
    const botPts = [];
    for (let i = 0; i < segs; i++) {
      const a = i * step;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      botPts.push([cx + rBottom * ca, cy + rBottom * sa, z0]);
      topPts.push([cx + rTop * ca, cy + rTop * sa, z1]);
    }
    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      faces.push({
        verts: [botPts[i], botPts[n], topPts[n], topPts[i]],
        color: color,
        stroke: stroke || null,
        doubleSided: false
      });
    }
    if (rTop > 0.01) {
      faces.push({ verts: topPts.slice(), color: capColor || color, stroke: stroke || null, doubleSided: false });
    }
    if (rBottom > 0.01) {
      faces.push({ verts: botPts.toReversed(), color: capColor || color, stroke: stroke || null, doubleSided: false });
    }
    return faces;
  }

  function buildHorizontalCylinderFaces(x0, x1, cy, cz, r, segs, color, stroke) {
    const faces = [];
    const step = (Math.PI * 2) / segs;
    const leftPts = [];
    const rightPts = [];
    for (let i = 0; i < segs; i++) {
      const a = i * step;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      leftPts.push([x0, cy + r * ca, cz + r * sa]);
      rightPts.push([x1, cy + r * ca, cz + r * sa]);
    }
    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      faces.push({
        verts: [leftPts[i], rightPts[i], rightPts[n], leftPts[n]],
        color: color,
        stroke: stroke || null,
        doubleSided: false
      });
    }
    faces.push({ verts: leftPts.toReversed(), color: color, stroke: stroke || null, doubleSided: false });
    faces.push({ verts: rightPts.slice(), color: color, stroke: stroke || null, doubleSided: false });
    return faces;
  }

  // ==========================================
  // 主场景控制器状态
  // ==========================================
  const engine = {
    canvas: null,
    ctx: null,
    glbCanvas: null,
    glbRenderer: null,
    width: 1000,
    height: 520,
    dpr: 1,
    initialized: false,
    running: false,
    rafId: null,
    viewMode: '3d-orbit', // '3d-orbit' | '3d-fps' | '2d'
    showFlow: true,
    showTwinMesh: true,
    customBgImg: null,
    customBgUri: '',
    panoCanvas: null, // 左右拼接两份的全景图，用于跨接缝取样
    panoEye: [-3.96, -26.27, 13.84], // 渲染底图时的视点（与系统默认轨道机位一致）
    pano: { yaw: 0.22, pitch: -0.34, zoom: 1 },
    hotspots: [],
    simOverrides: {}, // hotspotId -> params object
    highlightedHotspotId: null,
    onProjectCallback: null,
    onHotspotClickCallback: null,
    onStateChangeCallback: null,

    orbit: Object.assign({}, PRESETS.overview.orbit),
    fps: Object.assign({}, PRESETS.overview.fps),
    flyAnim: null,

    // 交互状态
    keysDown: {},
    isPointerDown: false,
    pointerButton: 0,
    dragStartX: 0,
    dragStartY: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    dragTotalDist: 0,
    lastDragTimestamp: 0,
    fpsMoveState: { forward: 0, strafe: 0, lift: 0 },

    // 当前帧投影矩阵缓存
    lastCamState: null,
    colliders: []
  };

  // ==========================================
  // 工具：默认 3D 坐标解析（兼容旧数据与新增热点）
  // ==========================================
  function inferPos3DFrom2D(hs) {
    if (hs && hs.pos3d && typeof hs.pos3d === 'object' && Number.isFinite(Number(hs.pos3d.x))) {
      return {
        x: Number(hs.pos3d.x),
        y: Number(hs.pos3d.y),
        z: Number(hs.pos3d.z)
      };
    }
    const wp3d = hs && hs.widgetParams && hs.widgetParams._pos3d;
    if (wp3d && typeof wp3d === 'object' && Number.isFinite(Number(wp3d.x))) {
      return {
        x: Number(wp3d.x),
        y: Number(wp3d.y),
        z: Number(wp3d.z)
      };
    }
    if (hs && hs.id && HOTSPOT_DEFAULT_POS3D[hs.id]) {
      return Object.assign({}, HOTSPOT_DEFAULT_POS3D[hs.id]);
    }
    const px = Number((hs && hs.x) || 50);
    const py = Number((hs && hs.y) || 50);
    return {
      x: Math.round(((px - 50) * 0.36) * 10) / 10,
      y: Math.round(((py - 50) * -0.04 - 2.0) * 10) / 10,
      z: Math.round(clamp((95 - py) * 0.12, 1.0, 12.0) * 10) / 10
    };
  }

  function getMergedHotspotParams(hs) {
    const base = (hs && hs.widgetParams && typeof hs.widgetParams === 'object') ? hs.widgetParams : {};
    const over = (hs && engine.simOverrides[hs.id]) ? engine.simOverrides[hs.id] : {};
    return Object.assign({}, base, over);
  }

  function findHotspotById(id) {
    return (engine.hotspots || []).find((h) => h.id === id) || null;
  }

  // ==========================================
  // 静态与实时联动 3D 模型生成
  // ==========================================
  function buildColliders() {
    return [
      { id: 'hs-scrubber-top', type: 'cyl', x: -11.5, y: 0.5, z0: 4.6, z1: 11.5, r: 1.85 },
      { id: 'hs-scrubber-bottom', type: 'cyl', x: -11.5, y: 0.5, z0: 0, z1: 4.5, r: 1.85 },
      { id: 'hs-induced-fan', type: 'box', min: [-7.0, -3.2, 0], max: [-3.0, -1.2, 2.9] },
      { id: 'hs-cooling-water', type: 'box', min: [-3.6, -5.8, 0.2], max: [0.4, -4.5, 2.3] },
      { id: 'hs-rto-chamber', type: 'box', min: [0.5, -1.2, 2.6], max: [8.5, 3.2, 9.5] },
      { id: 'hs-rto-valves', type: 'box', min: [0.5, -3.1, 0.0], max: [8.5, 3.0, 2.4] },
      { id: 'hs-cems-stack', type: 'cyl', x: 11.2, y: 2.0, z0: 0, z1: 15.5, r: 0.9 },
      { id: 'hs-utilities-plc', type: 'box', min: [13.4, -3.8, 0], max: [17.2, -1.6, 3.0] }
    ];
  }

  function buildPlantGeometry(timeSec) {
    const faces = [];
    const pushAll = (arr) => {
      for (let i = 0; i < arr.length; i++) faces.push(arr[i]);
    };

    const hsTop = findHotspotById('hs-scrubber-top');
    const hsBot = findHotspotById('hs-scrubber-bottom');
    const hsFan = findHotspotById('hs-induced-fan');
    const hsCw = findHotspotById('hs-cooling-water');
    const hsRto = findHotspotById('hs-rto-chamber');
    const hsVlv = findHotspotById('hs-rto-valves');
    const hsCems = findHotspotById('hs-cems-stack');
    const hsPlc = findHotspotById('hs-utilities-plc');

    const pTop = getMergedHotspotParams(hsTop);
    const pBot = getMergedHotspotParams(hsBot);
    const pFan = getMergedHotspotParams(hsFan);
    const pCw = getMergedHotspotParams(hsCw);
    const pRto = getMergedHotspotParams(hsRto);
    const pVlv = getMergedHotspotParams(hsVlv);
    const pCems = getMergedHotspotParams(hsCems);

    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 4.2);

    // 1. 设备混凝土基座垫块
    pushAll(buildBoxFaces(-11.5, 0.5, 0.18, 6.2, 6.2, 0.36, [71, 85, 105], 'rgba(148,163,184,0.28)'));
    pushAll(buildBoxFaces(-4.8, -2.5, 0.16, 4.8, 3.8, 0.32, [71, 85, 105], 'rgba(148,163,184,0.25)'));
    pushAll(buildBoxFaces(-1.8, -5.5, 0.14, 4.6, 2.6, 0.28, [60, 76, 98], 'rgba(56,189,248,0.25)'));
    pushAll(buildBoxFaces(4.5, 1.0, 0.20, 9.8, 6.2, 0.40, [71, 85, 105], 'rgba(148,163,184,0.28)'));
    pushAll(buildBoxFaces(11.2, 2.0, 0.20, 3.4, 3.4, 0.40, [71, 85, 105], 'rgba(148,163,184,0.28)'));
    pushAll(buildBoxFaces(15.2, -2.8, 0.18, 5.2, 4.0, 0.36, [71, 85, 105], 'rgba(148,163,184,0.28)'));

    // 2. A-101 碱洗喷淋塔 (下段 0.36..5.4, 上段 5.4..10.6, 锥顶 10.6..11.6)
    const towerMetal = [148, 163, 184];
    const towerCap = [186, 200, 218];
    pushAll(buildCylinderFaces(-11.5, 0.5, 0.36, 5.4, 2.05, 2.05, 14, towerMetal, towerCap, 'rgba(30,41,59,0.35)'));
    pushAll(buildCylinderFaces(-11.5, 0.5, 5.4, 10.6, 2.05, 2.05, 14, [162, 178, 198], towerCap, 'rgba(30,41,59,0.35)'));
    pushAll(buildCylinderFaces(-11.5, 0.5, 10.6, 11.6, 2.05, 0.55, 14, [130, 148, 172], towerCap));

    // 三层环形检修平台
    [4.2, 7.3, 10.3].forEach((pz) => {
      pushAll(buildCylinderFaces(-11.5, 0.5, pz - 0.12, pz, 2.9, 2.9, 14, [234, 179, 8], [100, 116, 139], 'rgba(250,204,21,0.5)'));
    });

    // D1 防腐层脱落高亮区 (随 peelArea 参数变化)
    const peelArea = Number(pTop.peelArea != null ? pTop.peelArea : 0.3);
    if (peelArea > 0) {
      const pw = clamp(0.8 + peelArea * 1.4, 0.8, 2.6);
      pushAll(buildBoxFaces(-11.5, -1.55, 8.6, pw, 0.25, 1.35, [217, 119, 6], 'rgba(248,113,113,0.9)'));
    }
    // D8 塔顶压力表 PI-101 与超期红牌
    const expiredDays = Number(pTop.expiredDays != null ? pTop.expiredDays : 15);
    const gaugeAlertColor = expiredDays > 0 ? [239, 68, 68] : [34, 197, 94];
    pushAll(buildCylinderFaces(-10.4, -1.2, 10.6, 11.9, 0.08, 0.08, 6, [148, 163, 184], [148, 163, 184]));
    pushAll(buildBoxFaces(-10.4, -1.3, 12.1, 0.65, 0.25, 0.65, gaugeAlertColor, '#ffffff'));

    // D7 法兰 FL-102 + 缺螺栓高亮 & D6 液位联锁旁路指示箱
    pushAll(buildCylinderFaces(-11.5, -1.75, 1.5, 2.4, 0.55, 0.55, 10, [100, 116, 139], [203, 213, 225]));
    const missingBolts = Number(pBot.missingBolts != null ? pBot.missingBolts : 2);
    if (missingBolts > 0) {
      pushAll(buildBoxFaces(-11.5, -2.35, 2.0, 0.85, 0.22, 0.85, [239, 68, 68], '#fecaca'));
    }
    const sisBypass = String(pBot.interlockStatus || '').indexOf('旁路') !== -1 || String(pBot.interlockStatus || '').indexOf('BYPASS') !== -1;
    const sisColor = sisBypass ? [Math.round(220 + 35 * pulse), 130, 18] : [34, 197, 94];
    pushAll(buildBoxFaces(-9.2, -1.2, 2.1, 0.75, 0.55, 1.25, [51, 65, 85], 'rgba(148,163,184,0.6)'));
    pushAll(buildBoxFaces(-9.2, -1.5, 2.85, 0.36, 0.36, 0.36, sisColor, '#ffffff'));

    // 3. B-101 离心引风机、主电机与轴承油标
    pushAll(buildCylinderFaces(-6.2, -2.5, 0.32, 2.3, 1.25, 1.25, 12, [56, 130, 188], [75, 155, 214], 'rgba(14,165,233,0.4)'));
    pushAll(buildBoxFaces(-4.4, -2.5, 1.1, 1.6, 1.3, 1.5, [37, 99, 235], 'rgba(147,197,253,0.45)'));
    const oilBad = Number(pFan.mainOilOffset != null ? pFan.mainOilOffset : -8) < 0 || String(pFan.mainOilQuality || '').indexOf('乳化') !== -1;
    const oilLed = oilBad ? [Math.round(215 + 40 * pulse), 120, 20] : [34, 197, 94];
    pushAll(buildBoxFaces(-5.2, -3.25, 1.45, 0.52, 0.24, 0.65, oilLed, '#fef08a'));

    // 4. W-101 循环冷却水管线与阀组（手轮与流量联动）
    const cwOpen = String(pCw.valveStatus || '').indexOf('开启') !== -1 && Number(pCw.flow != null ? pCw.flow : 0) > 0;
    const cwPipeColor = cwOpen ? [14, 165, 233] : [71, 85, 105];
    pushAll(buildHorizontalCylinderFaces(-3.8, 0.4, -5.3, 1.05, 0.22, 8, cwPipeColor));
    pushAll(buildHorizontalCylinderFaces(-3.8, 0.4, -5.8, 1.65, 0.18, 8, [56, 189, 248]));
    const valveWheelColor = cwOpen ? [34, 197, 94] : [239, 68, 68];
    pushAll(buildCylinderFaces(-1.8, -5.3, 1.05, 1.95, 0.12, 0.12, 6, [203, 213, 225], [203, 213, 225]));
    pushAll(buildCylinderFaces(-1.8, -5.3, 1.92, 2.08, 0.55, 0.55, 10, valveWheelColor, valveWheelColor, '#ffffff'));
    pushAll(buildBoxFaces(-0.5, -5.35, 1.65, 0.65, 0.35, 0.72, [15, 23, 42], cwOpen ? '#38bdf8' : '#f87171'));

    // 5. R-101 三室 RTO 本体（三个蓄热室 + 上部燃烧室 + 燃烧器）与二层变形护栏
    const chamberXs = [1.8, 4.5, 7.2];
    const rtoShell = [148, 163, 184];
    const rtoWarm = [190, 120, 75];
    chamberXs.forEach((cx) => {
      // 下部切换阀室锥斗 V-101
      pushAll(buildCylinderFaces(cx, 1.0, 0.4, 2.6, 0.65, 1.15, 8, [100, 116, 139], [148, 163, 184]));
      // 三室蓄热室本体
      pushAll(buildBoxFaces(cx, 1.0, 4.8, 2.45, 3.6, 4.4, rtoShell, 'rgba(30,41,59,0.45)'));
    });
    // 上部共用燃烧室与侧面燃烧器
    pushAll(buildBoxFaces(4.5, 1.0, 8.2, 8.2, 3.8, 2.5, [168, 182, 200], 'rgba(245,158,11,0.35)'));
    pushAll(buildBoxFaces(4.5, -1.3, 8.1, 1.8, 1.0, 1.2, rtoWarm, 'rgba(251,146,60,0.6)'));
    // 二层钢结构检修平台
    pushAll(buildBoxFaces(4.5, -1.7, 5.35, 9.0, 1.8, 0.22, [202, 138, 4], 'rgba(250,204,21,0.5)'));
    // 二层前端立柱与护栏（含 D9 局部变形护栏高亮）
    const railBend = Number(pRto.railBendCm != null ? pRto.railBendCm : 4);
    const railAlertColor = railBend > 0 ? [245, 158, 11] : [234, 179, 8];
    [0.2, 2.3, 4.5, 6.7, 8.8].forEach((rx) => {
      pushAll(buildBoxFaces(rx, -2.55, 6.0, 0.14, 0.14, 1.15, [234, 179, 8]));
    });
    pushAll(buildBoxFaces(2.4, -2.55, 6.5, 4.3, 0.10, 0.10, [234, 179, 8]));
    pushAll(buildBoxFaces(6.7, -2.55, 6.5, 4.3, 0.10, 0.10, railAlertColor, railBend > 0 ? '#fca5a5' : null));

    // V-101 气源缓冲罐与低压黄灯
    const airP = Number(pVlv.airPressure != null ? pVlv.airPressure : 0.32);
    const airColor = airP < 0.5 ? [Math.round(220 + 35 * pulse), 140, 20] : [34, 197, 94];
    pushAll(buildHorizontalCylinderFaces(2.5, 6.5, -2.9, 1.15, 0.45, 10, [14, 116, 144]));
    pushAll(buildBoxFaces(4.5, -3.4, 1.65, 0.45, 0.25, 0.45, airColor, '#ffffff'));

    // 6. M-101 排气筒（红白分段高烟囱）+ 采样平台 + CEMS 分析小屋 + 气体报警立柱
    pushAll(buildCylinderFaces(11.2, 2.0, 0.4, 5.2, 1.05, 0.95, 12, [203, 213, 225], [226, 232, 240]));
    pushAll(buildCylinderFaces(11.2, 2.0, 5.2, 8.6, 0.95, 0.85, 12, [220, 38, 38], [239, 68, 68]));
    pushAll(buildCylinderFaces(11.2, 2.0, 8.6, 12.2, 0.85, 0.78, 12, [226, 232, 240], [248, 250, 252]));
    pushAll(buildCylinderFaces(11.2, 2.0, 12.2, 15.5, 0.78, 0.72, 12, [220, 38, 38], [30, 41, 59]));
    pushAll(buildCylinderFaces(11.2, 2.0, 9.2, 9.4, 1.65, 1.65, 12, [234, 179, 8], [148, 163, 184]));

    // CEMS 监测小屋与可燃气体报警仪 CAL 状态灯
    pushAll(buildBoxFaces(10.8, -1.8, 1.65, 2.6, 2.2, 2.5, [203, 213, 225], 'rgba(56,189,248,0.45)'));
    pushAll(buildBoxFaces(10.8, -2.92, 1.85, 1.2, 0.12, 1.0, [15, 23, 42], '#38bdf8'));
    const calBad = String(pCems.gasAlarmMode || '').indexOf('CAL') !== -1;
    const cemsLed = calBad ? [Math.round(230 + 25 * pulse), 110, 20] : [34, 197, 94];
    pushAll(buildBoxFaces(10.8, -2.95, 3.15, 0.45, 0.35, 0.45, cemsLed, '#ffffff'));

    // 7. U-101 公用工程空压氮气站 + PLC 总控柜
    pushAll(buildCylinderFaces(14.3, -1.8, 0.36, 3.0, 0.68, 0.68, 10, [14, 165, 233], [56, 189, 248]));
    pushAll(buildBoxFaces(16.0, -2.8, 1.55, 2.0, 1.4, 2.4, [30, 58, 138], 'rgba(125,211,252,0.5)'));
    pushAll(buildBoxFaces(16.0, -3.52, 1.85, 1.35, 0.10, 0.85, [15, 23, 42], '#22c55e'));

    // 8. 主装置工艺连接风道（A-101 塔顶 -> B-101 风机 -> R-101 RTO -> M-101 烟囱）
    // A-101 塔顶弯出横向管道
    pushAll(buildHorizontalCylinderFaces(-11.5, -6.2, 0.5, 11.1, 0.52, 8, [148, 163, 184]));
    pushAll(buildCylinderFaces(-6.2, 0.5, 2.2, 11.1, 0.48, 0.48, 8, [148, 163, 184], [148, 163, 184]));
    // B-101 到 R-101 总风管
    pushAll(buildHorizontalCylinderFaces(-5.5, 1.2, -1.1, 1.8, 0.52, 8, [100, 116, 139]));
    // R-101 到 M-101 净气烟道
    pushAll(buildHorizontalCylinderFaces(7.8, 11.2, 2.0, 2.0, 0.58, 8, [148, 163, 184]));

    return { faces: faces, cwOpen: cwOpen, pulse: pulse };
  }

  // ==========================================
  // 相机计算与 3D -> 2D 透视投影
  // ==========================================
  // 是否已加载团队 A 交付的真 3D 模型 (.glb)
  function isGlbActive() {
    return engine.viewMode !== '2d' && Boolean(engine.glbRenderer && engine.glbRenderer.isLoaded());
  }

  // 自定义 360° 底图是否生效（宽高比 >= 1.5 且已加载，且未加载 GLB 模型）：此时使用「定点全景相机」
  function isPanoActive() {
    if (isGlbActive()) return false;
    const img = engine.customBgImg;
    return engine.viewMode !== '2d' && !!engine.panoCanvas && !!img
      && img.naturalWidth > 0 && img.naturalWidth / img.naturalHeight >= 1.5;
  }

  function computeCameraBasis() {
    let camPos;
    let forward;
    let zoom = 1;
    if (isPanoActive()) {
      const pn = engine.pano;
      camPos = engine.panoEye.slice();
      const cp = Math.cos(pn.pitch);
      forward = normalize([cp * Math.sin(pn.yaw), cp * Math.cos(pn.yaw), Math.sin(pn.pitch)]);
      zoom = pn.zoom;
    } else if (engine.viewMode === '3d-fps') {
      const f = engine.fps;
      camPos = [f.x, f.y, f.z];
      const cp = Math.cos(f.pitch);
      forward = normalize([
        cp * Math.sin(f.yaw),
        cp * Math.cos(f.yaw),
        Math.sin(f.pitch)
      ]);
    } else {
      const o = engine.orbit;
      const cp = Math.cos(o.pitch);
      const sp = Math.sin(o.pitch);
      const sy = Math.sin(o.yaw);
      const cy = Math.cos(o.yaw);
      camPos = [
        o.tx + o.distance * cp * sy,
        o.ty - o.distance * cp * cy,
        o.tz + o.distance * sp
      ];
      forward = normalize([o.tx - camPos[0], o.ty - camPos[1], o.tz - camPos[2]]);
    }

    const worldUp = [0, 0, 1];
    let right = cross(forward, worldUp);
    if (Math.hypot(right[0], right[1], right[2]) < 1e-4) {
      right = [1, 0, 0];
    } else {
      right = normalize(right);
    }
    const up = cross(right, forward);
    const focalLen = Math.min(engine.height * 1.05, engine.width * 0.62) * zoom;

    return {
      camPos: camPos,
      forward: forward,
      right: right,
      up: up,
      focalLen: focalLen
    };
  }

  function projectPoint(pt, cam) {
    const dx = pt[0] - cam.camPos[0];
    const dy = pt[1] - cam.camPos[1];
    const dz = pt[2] - cam.camPos[2];
    const vx = dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2];
    const vy = dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2];
    const vz = dx * cam.forward[0] + dy * cam.forward[1] + dz * cam.forward[2];
    if (vz <= 0.35) {
      return { visible: false, sx: -9999, sy: -9999, vz: vz };
    }
    const sx = engine.width * 0.5 + (vx / vz) * cam.focalLen;
    const sy = engine.height * 0.5 - (vy / vz) * cam.focalLen;
    return { visible: true, sx: sx, sy: sy, vz: vz, vx: vx, vy: vy };
  }

  // 判断点是否被任意设备本体（含背面自遮挡）遮挡
  function isPointOccluded(pt, selfId, cam) {
    if (engine.showTwinMesh === false || isGlbActive()) return false;
    const rayDir = sub(pt, cam.camPos);
    const targetDist = Math.hypot(rayDir[0], rayDir[1], rayDir[2]);
    if (targetDist < 0.5) return false;
    const dir = [rayDir[0] / targetDist, rayDir[1] / targetDist, rayDir[2] / targetDist];

    for (let i = 0; i < engine.colliders.length; i++) {
      const col = engine.colliders[i];
      if (col.type === 'box') {
        const t = rayIntersectAABB(cam.camPos, dir, col.min, col.max);
        if (t !== null && t > 0.4 && t < targetDist - 0.3) {
          return true;
        }
      } else if (col.type === 'cyl') {
        const t = rayIntersectVerticalCyl(cam.camPos, dir, col);
        if (t !== null && t > 0.4 && t < targetDist - 0.3) {
          return true;
        }
      }
    }
    return false;
  }

  function rayIntersectAABB(orig, dir, bmin, bmax) {
    let tmin = -1e9;
    let tmax = 1e9;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dir[a]) < 1e-6) {
        if (orig[a] < bmin[a] || orig[a] > bmax[a]) return null;
      } else {
        let t1 = (bmin[a] - orig[a]) / dir[a];
        let t2 = (bmax[a] - orig[a]) / dir[a];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin > 0 ? tmin : (tmax > 0 ? tmax : null);
  }

  function rayIntersectVerticalCyl(orig, dir, col) {
    const ox = orig[0] - col.x;
    const oy = orig[1] - col.y;
    const a = dir[0] * dir[0] + dir[1] * dir[1];
    const b = 2 * (ox * dir[0] + oy * dir[1]);
    const c = ox * ox + oy * oy - col.r * col.r;
    if (a < 1e-6) return null;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    for (const t of [t1, t2]) {
      if (t > 0) {
        const zHit = orig[2] + t * dir[2];
        if (zHit >= col.z0 && zHit <= col.z1) return t;
      }
    }
    return null;
  }

  // ==========================================
  // 地面网格、工艺流程流向粒子与 3D 渲染
  // ==========================================
  function drawTexTriangle(ctx, img, d0, d1, d2, s0, s1, s2) {
    const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
    if (Math.abs(det) < 1e-6) return;
    const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / det;
    const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / det;
    const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / det;
    const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / det;
    const e = d0[0] - a * s0[0] - c * s0[1];
    const f = d0[1] - b * s0[0] - d * s0[1];
    // 三角形略向外扩 0.7px，避免相邻三角形之间出现缝隙
    const cx = (d0[0] + d1[0] + d2[0]) / 3;
    const cy = (d0[1] + d1[1] + d2[1]) / 3;
    const grow = (p) => {
      const vx = p[0] - cx;
      const vy = p[1] - cy;
      const l = Math.hypot(vx, vy) || 1;
      return [p[0] + (vx / l) * 0.7, p[1] + (vy / l) * 0.7];
    };
    const g0 = grow(d0);
    const g1 = grow(d1);
    const g2 = grow(d2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g0[0], g0[1]);
    ctx.lineTo(g1[0], g1[1]);
    ctx.lineTo(g2[0], g2[1]);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  // 定点全景：把等距柱状图按真实透视贴到画面（旋转/缩放时与热点完全同步）
  function drawPanoSphere(ctx, cam) {
    const tex = engine.panoCanvas;
    const iw = tex.width / 2;
    const ih = tex.height;
    const w = engine.width;
    const h = engine.height;
    const GX = 44;
    const GY = 26;
    const verts = [];
    for (let j = 0; j <= GY; j++) {
      for (let i = 0; i <= GX; i++) {
        const sx = (i / GX) * w;
        const sy = (j / GY) * h;
        const nx = (sx - w * 0.5) / cam.focalLen;
        const ny = (h * 0.5 - sy) / cam.focalLen;
        const rx = cam.forward[0] + nx * cam.right[0] + ny * cam.up[0];
        const ry = cam.forward[1] + nx * cam.right[1] + ny * cam.up[1];
        const rz = cam.forward[2] + nx * cam.right[2] + ny * cam.up[2];
        const len = Math.hypot(rx, ry, rz) || 1;
        let u = Math.atan2(rx, ry) / (Math.PI * 2) + 0.5;
        const v = clamp(0.5 - Math.asin(clamp(rz / len, -1, 1)) / Math.PI, 0, 1);
        u = ((u % 1) + 1) % 1;
        verts.push({ sx: sx, sy: sy, u: u, v: v * ih });
      }
    }
    const at = (i, j) => verts[j * (GX + 1) + i];
    for (let j = 0; j < GY; j++) {
      for (let i = 0; i < GX; i++) {
        const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        // 跨接缝时把 u 展开到同一圈，再整体平移到 [0,1) 内，纹理画布左右各放一份故可取到 [0,2)
        let umin = Math.min(q[0].u, q[1].u, q[2].u, q[3].u);
        const us = q.map((p) => (p.u - umin > 0.5 ? p.u - 1 : p.u));
        umin = Math.min(us[0], us[1], us[2], us[3]);
        const shift = umin < 0 ? 1 : 0;
        const P = q.map((p, k) => [(us[k] + shift) * iw, p.v]);
        const D = q.map((p) => [p.sx, p.sy]);
        drawTexTriangle(ctx, tex, D[0], D[1], D[2], P[0], P[1], P[2]);
        drawTexTriangle(ctx, tex, D[0], D[2], D[3], P[0], P[2], P[3]);
      }
    }
  }

  function drawBackgroundAndFloor(ctx, cam) {
    const w = engine.width;
    const h = engine.height;

    // 1. 如果存在命题管理员上传的手工 360°/3D 全景底图，优先以等距柱状天球投影渲染
    let drewCustomBg = false;
    const bgImg = engine.customBgImg;
    if (isPanoActive()) {
      drawPanoSphere(ctx, cam);
      drewCustomBg = true;
    } else if (bgImg && bgImg.complete && bgImg.naturalWidth > 0 && bgImg.naturalHeight > 0) {
      const iw = bgImg.naturalWidth;
      const ih = bgImg.naturalHeight;
      const angleH = Math.atan2(cam.forward[0], cam.forward[1]);
      const horizLen = Math.hypot(cam.forward[0], cam.forward[1]) || 1e-5;
      const angleV = Math.atan2(cam.forward[2], horizLen);
      const focal = cam.focalLen || Math.min(w, h) * 0.95;
      const fovX = 2 * Math.atan(w / (2 * focal));
      const fovY = 2 * Math.atan(h / (2 * focal));

      // 宽幅全景图 (通常宽高比 >= 1.5)
      if (iw / ih >= 1.5) {
        let uCenter = (angleH / (Math.PI * 2) + 0.5) % 1;
        if (uCenter < 0) uCenter += 1;
        const vCenter = clamp(0.5 - (angleV / Math.PI), 0.05, 0.95);

        const uSpan = fovX / (Math.PI * 2);
        const vSpan = fovY / Math.PI;

        const srcW = Math.max(1, uSpan * iw);
        const srcH = Math.max(1, vSpan * ih);
        const srcX = uCenter * iw - srcW * 0.5;
        const srcY = clamp(vCenter * ih - srcH * 0.5, 0, ih - srcH);

        const normX = ((srcX % iw) + iw) % iw;
        if (normX + srcW <= iw) {
          ctx.drawImage(bgImg, normX, srcY, srcW, srcH, 0, 0, w, h);
        } else {
          const w1 = iw - normX;
          const dw1 = (w1 / srcW) * w;
          ctx.drawImage(bgImg, normX, srcY, w1, srcH, 0, 0, dw1, h);
          ctx.drawImage(bgImg, 0, srcY, srcW - w1, srcH, dw1, 0, w - dw1, h);
        }
      } else {
        // 普通平面照片：以柔和视差跟随镜头水平/仰俯移动
        const panRatio = clamp(0.5 + (angleH / Math.PI) * 0.5, 0, 1);
        const tiltRatio = clamp(0.5 - (angleV / (Math.PI * 0.5)) * 0.5, 0, 1);
        const scale = Math.max(w / iw, h / ih) * 1.35;
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (w - dw) * panRatio;
        const dy = (h - dh) * tiltRatio;
        ctx.drawImage(bgImg, dx, dy, dw, dh);
      }
      drewCustomBg = true;
    }

    if (!drewCustomBg) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#071426');
      grad.addColorStop(0.55, '#0b1d35');
      grad.addColorStop(1, '#050b16');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else {
      // 自定义底图时添加一层极淡的工业深色遮罩，保证前景热点高对比可读性
      ctx.fillStyle = 'rgba(7, 20, 38, 0.22)';
      ctx.fillRect(0, 0, w, h);
    }

    // 地面网格 (-22..22, -16..16) —— 若未关闭孪生模型，绘制空间标定网格
    if (engine.showTwinMesh !== false) {
      ctx.lineWidth = 1;
      const gridAlpha = drewCustomBg ? '0.12' : '0.22';
      const subAlpha = drewCustomBg ? '0.06' : '0.11';
      for (let gx = -22; gx <= 22; gx += 4) {
        const p1 = projectPoint([gx, -16, 0], cam);
        const p2 = projectPoint([gx, 16, 0], cam);
        if (p1.visible && p2.visible) {
          ctx.strokeStyle = gx === 0 ? `rgba(56,189,248,${gridAlpha})` : `rgba(148,163,184,${subAlpha})`;
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.stroke();
        }
      }
      for (let gy = -16; gy <= 16; gy += 4) {
        const p1 = projectPoint([-22, gy, 0], cam);
        const p2 = projectPoint([22, gy, 0], cam);
        if (p1.visible && p2.visible) {
          ctx.strokeStyle = gy === 0 ? `rgba(56,189,248,${gridAlpha})` : `rgba(148,163,184,${subAlpha})`;
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.stroke();
        }
      }

      // 主巡检黄色人行通道线 (y = -7.2)
      const walkA = projectPoint([-16, -7.2, 0.03], cam);
      const walkB = projectPoint([17.5, -7.2, 0.03], cam);
      if (walkA.visible && walkB.visible) {
        ctx.save();
        ctx.setLineDash([10, 7]);
        ctx.strokeStyle = drewCustomBg ? 'rgba(250,204,21,0.30)' : 'rgba(250,204,21,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(walkA.sx, walkA.sy);
        ctx.lineTo(walkB.sx, walkB.sy);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawFlowParticles(ctx, cam, timeSec, cwOpen) {
    if (!engine.showFlow) return;

    // 废气主工艺路径：进气 -> A-101 塔顶 -> B-101 引风机 -> R-101 -> M-101 烟囱顶部
    const gasPaths = [
      [[-15.5, 0.5, 2.2], [-11.5, 0.5, 2.2]],
      [[-11.5, 0.5, 11.1], [-6.2, 0.5, 11.1]],
      [[-6.2, 0.5, 11.1], [-6.2, 0.5, 2.2]],
      [[-5.5, -1.1, 1.8], [1.5, -1.1, 1.8]],
      [[7.5, 2.0, 2.0], [11.2, 2.0, 2.0]],
      [[11.2, 2.0, 2.0], [11.2, 2.0, 16.0]]
    ];
    gasPaths.forEach((seg, sIdx) => {
      for (let k = 0; k < 4; k++) {
        const t = ((timeSec * 0.45 + k * 0.25 + sIdx * 0.13) % 1);
        const pt = [
          lerp(seg[0][0], seg[1][0], t),
          lerp(seg[0][1], seg[1][1], t),
          lerp(seg[0][2], seg[1][2], t)
        ];
        const pr = projectPoint(pt, cam);
        if (!pr.visible) continue;
        const rad = clamp(cam.focalLen * 0.16 / pr.vz, 2.2, 7.0);
        ctx.fillStyle = sIdx >= 4 ? 'rgba(167,243,208,0.9)' : 'rgba(56,189,248,0.92)';
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 循环冷却水路径：仅当供水阀开启且有流量时流动，否则停滞高亮提示
    if (cwOpen) {
      for (let k = 0; k < 5; k++) {
        const t = ((timeSec * 0.6 + k * 0.2) % 1);
        const pt = [lerp(-3.8, 0.4, t), -5.3, 1.05];
        const pr = projectPoint(pt, cam);
        if (!pr.visible) continue;
        const rad = clamp(cam.focalLen * 0.14 / pr.vz, 2.2, 6.0);
        ctx.fillStyle = 'rgba(34,211,238,0.95)';
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawDeviceLabels3D(ctx, cam) {
    const labels = [
      { pos: [-11.5, 0.5, 12.6], text: 'A-101 碱洗塔' },
      { pos: [-5.2, -2.5, 3.6], text: 'B-101 引风机' },
      { pos: [-1.8, -5.5, 2.8], text: 'W-101 冷却水阀组' },
      { pos: [4.5, 1.0, 10.3], text: 'R-101 / V-101 三室RTO' },
      { pos: [11.2, 2.0, 16.4], text: 'M-101 排气筒 & CEMS' },
      { pos: [15.5, -2.8, 3.7], text: 'U-101 公用工程 & PLC' }
    ];
    ctx.save();
    ctx.font = '600 11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    labels.forEach((lbl) => {
      const pr = projectPoint(lbl.pos, cam);
      if (!pr.visible || pr.sx < -80 || pr.sx > engine.width + 80 || pr.sy < -40 || pr.sy > engine.height + 40) return;
      const tw = ctx.measureText(lbl.text).width + 14;
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      ctx.strokeStyle = 'rgba(56,189,248,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(pr.sx - tw / 2, pr.sy - 10, tw, 20, 5);
      } else {
        ctx.rect(pr.sx - tw / 2, pr.sy - 10, tw, 20);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#bae6fd';
      ctx.fillText(lbl.text, pr.sx, pr.sy);
    });
    ctx.restore();
  }

  function renderFrame(nowMs) {
    const dt = engine._lastTimeMs ? Math.min(0.05, (nowMs - engine._lastTimeMs) / 1000) : 0.016;
    engine._lastTimeMs = nowMs;
    const timeSec = nowMs / 1000;

    updateFlyAnimation(nowMs);
    if (engine.viewMode === '3d-fps') {
      stepFpsMovement(dt);
    }

    if (engine.viewMode === '2d' || !engine.canvas || !engine.ctx) {
      return;
    }

    const cam = computeCameraBasis();
    engine.lastCamState = cam;
    const ctx = engine.ctx;
    ctx.save();
    ctx.setTransform(engine.dpr, 0, 0, engine.dpr, 0, 0);

    if (isGlbActive()) {
      ctx.clearRect(0, 0, engine.width, engine.height);
      engine.glbRenderer.render(cam, engine.width, engine.height);
      if (engine.showFlow) {
        drawFlowParticles(ctx, cam, timeSec, true);
      }
      ctx.restore();
      if (typeof engine.onProjectCallback === 'function') {
        engine.onProjectCallback(computeHotspotProjections(engine.hotspots, cam));
      }
      return;
    }

    drawBackgroundAndFloor(ctx, cam);

    let geom = null;
    if (engine.showTwinMesh !== false) {
      geom = buildPlantGeometry(timeSec);
      const drawList = [];
      for (let i = 0; i < geom.faces.length; i++) {
        const f = geom.faces[i];
        const verts = f.verts;
        const e1 = sub(verts[1], verts[0]);
        const e2 = sub(verts[2], verts[0]);
        const norm = normalize(cross(e1, e2));

        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (let k = 0; k < verts.length; k++) {
          cx += verts[k][0];
          cy += verts[k][1];
          cz += verts[k][2];
        }
        const n = verts.length;
        const center = [cx / n, cy / n, cz / n];
        const toCam = sub(cam.camPos, center);
        if (!f.doubleSided && dot(norm, toCam) <= 0) {
          continue;
        }

        const projVerts = [];
        let allVisible = true;
        for (let k = 0; k < verts.length; k++) {
          const p = projectPoint(verts[k], cam);
          if (!p.visible) {
            allVisible = false;
            break;
          }
          projVerts.push(p);
        }
        if (!allVisible) continue;

        const depth = dot(sub(center, cam.camPos), cam.forward);
        const diffuse = 0.42 + 0.58 * Math.max(0, dot(norm, LIGHT_DIR));
        drawList.push({
          depth: depth,
          pts: projVerts,
          fill: shadeHex(f.color, diffuse),
          stroke: f.stroke
        });
      }

      drawList.sort((a, b) => b.depth - a.depth);
      for (let i = 0; i < drawList.length; i++) {
        const item = drawList[i];
        ctx.beginPath();
        ctx.moveTo(item.pts[0].sx, item.pts[0].sy);
        for (let j = 1; j < item.pts.length; j++) {
          ctx.lineTo(item.pts[j].sx, item.pts[j].sy);
        }
        ctx.closePath();
        ctx.fillStyle = item.fill;
        ctx.fill();
        if (item.stroke) {
          ctx.strokeStyle = item.stroke;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }
    }

    drawFlowParticles(ctx, cam, timeSec, geom ? geom.cwOpen : true);
    if (engine.showTwinMesh !== false) {
      drawDeviceLabels3D(ctx, cam);
    }
    ctx.restore();

    if (typeof engine.onProjectCallback === 'function') {
      engine.onProjectCallback(computeHotspotProjections(engine.hotspots, cam));
    }
  }

  // 全景锁定模式下，热点按「视线方向」锚定在底图上（yaw/pitch），与底图内容同步旋转缩放
  function panoDirOf(hs) {
    const pp = hs && hs.panoPos;
    if (pp && Number.isFinite(Number(pp.yaw)) && Number.isFinite(Number(pp.pitch))) {
      return { yaw: Number(pp.yaw), pitch: Number(pp.pitch) };
    }
    const p3 = inferPos3DFrom2D(hs);
    const e = engine.panoEye;
    const dx = p3.x - e[0];
    const dy = p3.y - e[1];
    const dz = p3.z - e[2];
    return { yaw: Math.atan2(dx, dy), pitch: Math.atan2(dz, Math.hypot(dx, dy)) };
  }

  function computeHotspotProjections(hotspots, camInput) {
    const cam = camInput || engine.lastCamState || computeCameraBasis();
    const out = {};
    const w = engine.width || 1000;
    const h = engine.height || 520;
    if (isPanoActive()) {
      (hotspots || []).forEach((hs) => {
        const d = panoDirOf(hs);
        const cp = Math.cos(d.pitch);
        const far = 60;
        const pt = [
          cam.camPos[0] + far * cp * Math.sin(d.yaw),
          cam.camPos[1] + far * cp * Math.cos(d.yaw),
          cam.camPos[2] + far * Math.sin(d.pitch)
        ];
        const pr = projectPoint(pt, cam);
        if (!pr.visible) {
          out[hs.id] = { visible: false, screenXPct: -50, screenYPct: -50, scale: 0.7, occluded: true, pos3d: hs.pos3d };
          return;
        }
        const xPct = (pr.sx / w) * 100;
        const yPct = (pr.sy / h) * 100;
        out[hs.id] = {
          visible: xPct >= -4 && xPct <= 104 && yPct >= -4 && yPct <= 104,
          screenXPct: xPct,
          screenYPct: yPct,
          scale: 1,
          occluded: false,
          depth: pr.vz,
          pos3d: hs.pos3d
        };
      });
      return out;
    }
    (hotspots || []).forEach((hs) => {
      const p3 = inferPos3DFrom2D(hs);
      const pr = projectPoint([p3.x, p3.y, p3.z], cam);
      if (!pr.visible) {
        out[hs.id] = { visible: false, screenXPct: -50, screenYPct: -50, scale: 0.7, occluded: true, pos3d: p3 };
        return;
      }
      const xPct = (pr.sx / w) * 100;
      const yPct = (pr.sy / h) * 100;
      const inBounds = xPct >= -4 && xPct <= 104 && yPct >= -4 && yPct <= 104;
      const scale = clamp(24 / Math.max(8, pr.vz), 0.75, 1.25);
      const occluded = isPointOccluded([p3.x, p3.y, p3.z], hs.id, cam);
      out[hs.id] = {
        visible: inBounds,
        screenXPct: xPct,
        screenYPct: yPct,
        scale: scale,
        occluded: occluded,
        depth: pr.vz,
        pos3d: p3
      };
    });
    return out;
  }

  // ==========================================
  // 相机飞行动画与第一人称步进
  // ==========================================
  function panoLookAt(tx, ty, tz, zoom) {
    const e = engine.panoEye;
    const dx = tx - e[0];
    const dy = ty - e[1];
    const dz = tz - e[2];
    return { yaw: Math.atan2(dx, dy), pitch: Math.atan2(dz, Math.hypot(dx, dy)), zoom: zoom };
  }

  function startFlyTo(targetMode, targetCam, durationMs) {
    if (isPanoActive()) {
      // 定点全景：任何传送/飞向热点，都转化为「转头 + 变焦」
      let end;
      if (targetCam.tx != null) {
        end = panoLookAt(targetCam.tx, targetCam.ty, targetCam.tz, clamp(28 / (targetCam.distance || 28), 0.8, 3.2));
      } else if (targetCam.yaw != null && targetCam.x != null) {
        end = panoLookAt(targetCam.x + Math.sin(targetCam.yaw) * 12, targetCam.y + Math.cos(targetCam.yaw) * 12, 4, 1);
      } else {
        return;
      }
      engine.flyAnim = {
        mode: 'pano',
        start: Object.assign({}, engine.pano),
        end: end,
        startTime: performance.now ? performance.now() : Date.now(),
        duration: durationMs || 600
      };
      return;
    }
    const start = targetMode === '3d-fps'
      ? Object.assign({}, engine.fps)
      : Object.assign({}, engine.orbit);
    engine.flyAnim = {
      mode: targetMode,
      start: start,
      end: Object.assign({}, targetCam),
      startTime: performance.now ? performance.now() : Date.now(),
      duration: durationMs || 650
    };
  }

  function updateFlyAnimation(nowMs) {
    const anim = engine.flyAnim;
    if (!anim) return;
    const elapsed = nowMs - anim.startTime;
    const rawT = clamp(elapsed / anim.duration, 0, 1);
    const t = 1 - Math.pow(1 - rawT, 3); // easeOutCubic
    if (anim.mode === 'pano') {
      engine.pano.yaw = lerpAngle(anim.start.yaw, anim.end.yaw, t);
      engine.pano.pitch = lerp(anim.start.pitch, anim.end.pitch, t);
      engine.pano.zoom = lerp(anim.start.zoom, anim.end.zoom, t);
    } else if (anim.mode === '3d-fps') {
      engine.fps.x = lerp(anim.start.x, anim.end.x, t);
      engine.fps.y = lerp(anim.start.y, anim.end.y, t);
      engine.fps.z = lerp(anim.start.z, anim.end.z, t);
      engine.fps.yaw = lerpAngle(anim.start.yaw, anim.end.yaw, t);
      engine.fps.pitch = lerp(anim.start.pitch, anim.end.pitch, t);
    } else {
      engine.orbit.tx = lerp(anim.start.tx, anim.end.tx, t);
      engine.orbit.ty = lerp(anim.start.ty, anim.end.ty, t);
      engine.orbit.tz = lerp(anim.start.tz, anim.end.tz, t);
      engine.orbit.yaw = lerpAngle(anim.start.yaw, anim.end.yaw, t);
      engine.orbit.pitch = lerp(anim.start.pitch, anim.end.pitch, t);
      engine.orbit.distance = lerp(anim.start.distance, anim.end.distance, t);
    }
    if (rawT >= 1) {
      engine.flyAnim = null;
      notifyStateChanged();
    }
  }

  function stepFpsMovement(dt) {
    if (isPanoActive()) return;
    let fwd = engine.fpsMoveState.forward;
    let strafe = engine.fpsMoveState.strafe;
    let lift = engine.fpsMoveState.lift;
    if (engine.keysDown['KeyW'] || engine.keysDown['ArrowUp']) fwd += 1;
    if (engine.keysDown['KeyS'] || engine.keysDown['ArrowDown']) fwd -= 1;
    if (engine.keysDown['KeyD'] || engine.keysDown['ArrowRight']) strafe += 1;
    if (engine.keysDown['KeyA'] || engine.keysDown['ArrowLeft']) strafe -= 1;
    if (engine.keysDown['KeyE']) lift += 1;
    if (engine.keysDown['KeyQ']) lift -= 1;

    if (fwd === 0 && strafe === 0 && lift === 0) return;
    engine.flyAnim = null;

    const speed = 7.5 * dt;
    const sy = Math.sin(engine.fps.yaw);
    const cy = Math.cos(engine.fps.yaw);
    const dx = (fwd * sy + strafe * cy) * speed;
    const dy = (fwd * cy - strafe * sy) * speed;

    engine.fps.x = clamp(engine.fps.x + dx, -26, 26);
    engine.fps.y = clamp(engine.fps.y + dy, -22, 18);
    engine.fps.z = clamp(engine.fps.z + lift * 4.2 * dt, 1.3, 12.5);
    notifyStateChanged();
  }

  function notifyStateChanged() {
    if (typeof engine.onStateChangeCallback === 'function') {
      engine.onStateChangeCallback(getCameraSummary());
    }
  }

  function getCameraSummary() {
    return {
      viewMode: engine.viewMode,
      showFlow: engine.showFlow,
      showTwinMesh: engine.showTwinMesh !== false,
      hasCustomBg: Boolean(engine.customBgImg && engine.customBgImg.complete),
      hasGlbModel: isGlbActive(),
      glbInfo: engine.glbRenderer ? engine.glbRenderer.getInfo() : null,
      panoLocked: isPanoActive(),
      fps: Object.assign({}, engine.fps),
      orbit: Object.assign({}, engine.orbit)
    };
  }

  // ==========================================
  // 屏幕坐标 -> 3D 世界坐标（用于教师 3D 标点与拖拽）
  // ==========================================
  function screenToWorld3D(clientX, clientY, refPos3d) {
    if (!engine.canvas) return refPos3d || { x: 0, y: 0, z: 3 };
    const rect = engine.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return refPos3d || { x: 0, y: 0, z: 3 };

    const cam = engine.lastCamState || computeCameraBasis();
    const sx = ((clientX - rect.left) / rect.width) * engine.width;
    const sy = ((clientY - rect.top) / rect.height) * engine.height;
    const nx = (sx - engine.width * 0.5) / cam.focalLen;
    const ny = (engine.height * 0.5 - sy) / cam.focalLen;
    const rayDir = normalize([
      cam.forward[0] + nx * cam.right[0] + ny * cam.up[0],
      cam.forward[1] + nx * cam.right[1] + ny * cam.up[1],
      cam.forward[2] + nx * cam.right[2] + ny * cam.up[2]
    ]);

    // 0. 若已加载团队 A 的真 3D GLB 模型，优先直接射线拾取模型三角面，实现“指哪贴哪”
    if (isGlbActive() && engine.glbRenderer) {
      const hit = engine.glbRenderer.raycast(cam.camPos, rayDir, 300);
      if (hit && hit.point) {
        return {
          x: Math.round(hit.point.x * 100) / 100,
          y: Math.round(hit.point.y * 100) / 100,
          z: Math.round(hit.point.z * 100) / 100
        };
      }
    }

    // 1. 拖动已有热点时，沿与相机垂直的参考平面移动
    if (refPos3d && Number.isFinite(Number(refPos3d.x))) {
      const refPt = [Number(refPos3d.x), Number(refPos3d.y), Number(refPos3d.z)];
      const planeDepth = dot(sub(refPt, cam.camPos), cam.forward);
      const denom = dot(rayDir, cam.forward);
      if (Math.abs(denom) > 1e-4) {
        const t = Math.max(2.0, planeDepth / denom);
        return {
          x: Math.round(clamp(cam.camPos[0] + rayDir[0] * t, -20, 20) * 10) / 10,
          y: Math.round(clamp(cam.camPos[1] + rayDir[1] * t, -14, 14) * 10) / 10,
          z: Math.round(clamp(cam.camPos[2] + rayDir[2] * t, 0.5, 16) * 10) / 10
        };
      }
    }

    // 2. 新增热点时，优先尝试碰撞装置主体表面，其次回退 y=-2 工业中心立面
    let bestT = null;
    for (let i = 0; i < engine.colliders.length; i++) {
      const col = engine.colliders[i];
      const t = col.type === 'box'
        ? rayIntersectAABB(cam.camPos, rayDir, col.min, col.max)
        : rayIntersectVerticalCyl(cam.camPos, rayDir, col);
      if (t !== null && (bestT === null || t < bestT)) {
        bestT = t;
      }
    }
    if (bestT !== null) {
      return {
        x: Math.round(clamp(cam.camPos[0] + rayDir[0] * bestT, -20, 20) * 10) / 10,
        y: Math.round(clamp(cam.camPos[1] + rayDir[1] * bestT, -14, 14) * 10) / 10,
        z: Math.round(clamp(cam.camPos[2] + rayDir[2] * bestT, 0.8, 16) * 10) / 10
      };
    }

    // 命中地面 z=1.5 参考高度
    if (Math.abs(rayDir[2]) > 0.05) {
      const tGnd = (1.5 - cam.camPos[2]) / rayDir[2];
      if (tGnd > 1.0 && tGnd < 80) {
        return {
          x: Math.round(clamp(cam.camPos[0] + rayDir[0] * tGnd, -20, 20) * 10) / 10,
          y: Math.round(clamp(cam.camPos[1] + rayDir[1] * tGnd, -14, 14) * 10) / 10,
          z: 1.5
        };
      }
    }
    return { x: 0, y: -2.0, z: 3.0 };
  }

  // ==========================================
  // 事件绑定与动画循环
  // ==========================================
  function bindCanvasInteractions(canvas) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      engine.isPointerDown = true;
      engine.pointerButton = e.button;
      engine.dragStartX = e.clientX;
      engine.dragStartY = e.clientY;
      engine.lastPointerX = e.clientX;
      engine.lastPointerY = e.clientY;
      engine.dragTotalDist = 0;
      engine.flyAnim = null;
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!engine.isPointerDown || engine.viewMode === '2d') return;
      const dx = e.clientX - engine.lastPointerX;
      const dy = e.clientY - engine.lastPointerY;
      engine.dragTotalDist += Math.hypot(dx, dy);
      engine.lastPointerX = e.clientX;
      engine.lastPointerY = e.clientY;

      if (isPanoActive()) {
        // 抓取式旋转：向右拖 = 画面向右移动，视线向左转；缩放越大转得越慢
        const k = 0.0058 / Math.max(0.6, engine.pano.zoom);
        engine.pano.yaw -= dx * k;
        engine.pano.pitch = clamp(engine.pano.pitch + dy * k, -1.25, 1.25);
        notifyStateChanged();
        return;
      }

      if (engine.viewMode === '3d-fps') {
        engine.fps.yaw += dx * 0.0055;
        engine.fps.pitch = clamp(engine.fps.pitch - dy * 0.0045, -0.78, 0.85);
        notifyStateChanged();
        return;
      }

      if (e.buttons === 2 || e.button === 2 || e.shiftKey) {
        const cam = computeCameraBasis();
        const panScale = engine.orbit.distance * 0.0014;
        engine.orbit.tx = clamp(engine.orbit.tx - dx * panScale * cam.right[0], -22, 22);
        engine.orbit.ty = clamp(engine.orbit.ty - dx * panScale * cam.right[1], -18, 18);
        engine.orbit.tz = clamp(engine.orbit.tz + dy * panScale, 0.5, 14);
      } else {
        engine.orbit.yaw += dx * 0.0075;
        engine.orbit.pitch = clamp(engine.orbit.pitch + dy * 0.006, 0.06, 1.28);
      }
      notifyStateChanged();
    });

    const endPointer = (e) => {
      if (!engine.isPointerDown) return;
      engine.isPointerDown = false;
      if (engine.dragTotalDist > 5) {
        engine.lastDragTimestamp = Date.now();
      }
      if (canvas.releasePointerCapture) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('wheel', (e) => {
      if (engine.viewMode === '2d') return;
      e.preventDefault();
      engine.flyAnim = null;
      if (isPanoActive()) {
        const f = e.deltaY > 0 ? 0.91 : 1.1;
        engine.pano.zoom = clamp(engine.pano.zoom * f, 0.55, 5.0);
      } else if (engine.viewMode === '3d-fps') {
        const step = -Math.sign(e.deltaY) * 1.6;
        engine.fps.x = clamp(engine.fps.x + step * Math.sin(engine.fps.yaw), -26, 26);
        engine.fps.y = clamp(engine.fps.y + step * Math.cos(engine.fps.yaw), -22, 18);
      } else {
        const factor = e.deltaY > 0 ? 1.09 : 0.91;
        engine.orbit.distance = clamp(engine.orbit.distance * factor, 7.5, 58.0);
      }
      notifyStateChanged();
    }, { passive: false });

    global.addEventListener('keydown', (e) => {
      if (engine.viewMode !== '3d-fps') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.querySelector('.modal-backdrop.open')) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        engine.keysDown[e.code] = true;
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
    });

    global.addEventListener('keyup', (e) => {
      if (engine.keysDown[e.code]) {
        delete engine.keysDown[e.code];
      }
    });
  }

  function startLoop() {
    if (engine.running) return;
    engine.running = true;
    const tick = (ts) => {
      if (!engine.running) return;
      if (engine.viewMode !== '2d') {
        renderFrame(ts);
      }
      if (typeof global.requestAnimationFrame === 'function') {
        engine.rafId = global.requestAnimationFrame(tick);
      }
    };
    if (typeof global.requestAnimationFrame === 'function') {
      engine.rafId = global.requestAnimationFrame(tick);
    }
  }

  // ==========================================
  // 公共 API
  // ==========================================
  const PlantScene3D = {
    PRESETS: PRESETS,
    HOTSPOT_DEFAULT_POS3D: HOTSPOT_DEFAULT_POS3D,

    init: function (options) {
      const opts = options || {};
      engine.canvas = opts.canvas || null;
      engine.glbCanvas = opts.glbCanvas || null;
      if (engine.glbCanvas && global.WMPSESGlbRenderer && !engine.glbRenderer) {
        engine.glbRenderer = global.WMPSESGlbRenderer.createRenderer(engine.glbCanvas);
      }
      engine.hotspots = Array.isArray(opts.hotspots) ? opts.hotspots : [];
      engine.onProjectCallback = opts.onProject || null;
      engine.onStateChangeCallback = opts.onStateChange || null;
      engine.colliders = buildColliders();
      if (opts.viewMode) {
        engine.viewMode = opts.viewMode;
      }
      if (opts.customBackground) {
        this.setCustomBackground(opts.customBackground);
      }
      if (opts.showTwinMesh != null) {
        engine.showTwinMesh = Boolean(opts.showTwinMesh);
      }

      if (engine.canvas && typeof engine.canvas.getContext === 'function') {
        engine.ctx = engine.canvas.getContext('2d');
        this.resize();
        if (!engine.initialized) {
          bindCanvasInteractions(engine.canvas);
          if (typeof global.ResizeObserver === 'function' && engine.canvas.parentElement) {
            const ro = new global.ResizeObserver(() => this.resize());
            ro.observe(engine.canvas.parentElement);
          } else {
            global.addEventListener('resize', () => this.resize());
          }
          startLoop();
        }
      }
      engine.initialized = true;
      notifyStateChanged();
    },

    resize: function () {
      if (!engine.canvas) return;
      const parent = engine.canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : engine.canvas.getBoundingClientRect();
      const w = Math.max(320, Math.round(rect.width || 1000));
      const h = Math.max(360, Math.round(rect.height || 520));
      const dpr = Math.min(2, Number(global.devicePixelRatio) || 1);
      engine.width = w;
      engine.height = h;
      engine.dpr = dpr;
      engine.canvas.width = Math.round(w * dpr);
      engine.canvas.height = Math.round(h * dpr);
      if (engine.glbRenderer) {
        engine.glbRenderer.resize(w, h, dpr);
      }
    },

    setHotspots: function (hotspots) {
      engine.hotspots = Array.isArray(hotspots) ? hotspots : [];
      if (engine.viewMode !== '2d') {
        this.forceProject();
      }
    },

    setViewMode: function (mode) {
      if (mode !== '3d-orbit' && mode !== '3d-fps' && mode !== '2d') return;
      const prevMode = engine.viewMode;
      engine.viewMode = mode;
      engine.keysDown = {};
      engine.fpsMoveState = { forward: 0, strafe: 0, lift: 0 };

      if (mode === '3d-fps' && prevMode === '3d-orbit') {
        // 从当前轨道视角平滑过渡到合理的第一人称巡检高度
        const p = PRESETS.overview.fps;
        startFlyTo('3d-fps', p, 450);
      } else if (mode === '3d-orbit' && prevMode === '3d-fps') {
        const lookDist = 14;
        const target = {
          tx: clamp(engine.fps.x + Math.sin(engine.fps.yaw) * lookDist, -18, 18),
          ty: clamp(engine.fps.y + Math.cos(engine.fps.yaw) * lookDist, -12, 12),
          tz: clamp(engine.fps.z, 1.5, 9.0),
          yaw: engine.fps.yaw,
          pitch: 0.30,
          distance: 22
        };
        startFlyTo('3d-orbit', target, 450);
      }
      if (mode !== '2d') {
        this.resize();
        this.forceProject();
      }
      notifyStateChanged();
    },

    getViewMode: function () {
      return engine.viewMode;
    },

    setShowFlow: function (show) {
      engine.showFlow = Boolean(show);
      notifyStateChanged();
    },

    flyToPreset: function (presetKey) {
      const p = PRESETS[presetKey] || PRESETS.overview;
      if (engine.viewMode === '2d') return;
      if (engine.viewMode === '3d-fps') {
        startFlyTo('3d-fps', p.fps, 600);
      } else {
        startFlyTo('3d-orbit', p.orbit, 600);
      }
    },

    isPanoLocked: function () {
      return isPanoActive();
    },

    // 屏幕坐标 -> 全景视线方向（用于全景模式下新增/拖动热点）
    screenToPano: function (clientX, clientY) {
      const rect = engine.canvas.getBoundingClientRect();
      const cam = engine.lastCamState || computeCameraBasis();
      const sx = ((clientX - rect.left) / rect.width) * engine.width;
      const sy = ((clientY - rect.top) / rect.height) * engine.height;
      const nx = (sx - engine.width * 0.5) / cam.focalLen;
      const ny = (engine.height * 0.5 - sy) / cam.focalLen;
      const r = [
        cam.forward[0] + nx * cam.right[0] + ny * cam.up[0],
        cam.forward[1] + nx * cam.right[1] + ny * cam.up[1],
        cam.forward[2] + nx * cam.right[2] + ny * cam.up[2]
      ];
      const len = Math.hypot(r[0], r[1], r[2]) || 1;
      return {
        yaw: Math.round(Math.atan2(r[0], r[1]) * 10000) / 10000,
        pitch: Math.round(Math.asin(clamp(r[2] / len, -1, 1)) * 10000) / 10000
      };
    },

    flyToHotspot: function (hotspotId) {
      if (engine.viewMode === '2d') return;
      const hs = findHotspotById(hotspotId);
      if (!hs) return;
      if (isPanoActive()) {
        const d = panoDirOf(hs);
        engine.flyAnim = {
          mode: 'pano',
          start: Object.assign({}, engine.pano),
          end: { yaw: d.yaw, pitch: d.pitch, zoom: Math.max(engine.pano.zoom, 1.8) },
          startTime: performance.now ? performance.now() : Date.now(),
          duration: 550
        };
        return;
      }
      const p3 = inferPos3DFrom2D(hs);
      if (engine.viewMode === '3d-fps') {
        const standX = clamp(p3.x, -22, 22);
        const standY = clamp(p3.y - 6.8, -20, 14);
        const standZ = clamp(p3.z > 5.0 ? p3.z - 0.8 : 1.75, 1.5, 10.5);
        const yaw = Math.atan2(p3.x - standX, p3.y - standY);
        startFlyTo('3d-fps', { x: standX, y: standY, z: standZ, yaw: yaw, pitch: 0.05 }, 550);
      } else {
        startFlyTo('3d-orbit', {
          tx: p3.x,
          ty: p3.y + 0.6,
          tz: p3.z,
          yaw: engine.orbit.yaw,
          pitch: 0.25,
          distance: 11.5
        }, 550);
      }
    },

    updateSimParams: function (hotspotId, params) {
      if (!hotspotId) return;
      engine.simOverrides[hotspotId] = Object.assign({}, params || {});
    },

    setFpsMoveInput: function (partial) {
      engine.fpsMoveState = Object.assign(engine.fpsMoveState, partial || {});
    },

    nudgeFps: function (fwd, strafe, lift) {
      if (engine.viewMode !== '3d-fps' || isPanoActive()) return;
      engine.flyAnim = null;
      const sy = Math.sin(engine.fps.yaw);
      const cy = Math.cos(engine.fps.yaw);
      engine.fps.x = clamp(engine.fps.x + ((fwd || 0) * sy + (strafe || 0) * cy) * 1.1, -26, 26);
      engine.fps.y = clamp(engine.fps.y + ((fwd || 0) * cy - (strafe || 0) * sy) * 1.1, -22, 18);
      engine.fps.z = clamp(engine.fps.z + (lift || 0) * 0.7, 1.3, 12.5);
      this.forceProject();
      notifyStateChanged();
    },

    wasRecentDrag: function () {
      return (Date.now() - engine.lastDragTimestamp) < 220;
    },

    screenToWorld3D: screenToWorld3D,
    inferPos3DFrom2D: inferPos3DFrom2D,

    computeProjections: function (hotspots, viewportW, viewportH) {
      if (viewportW && viewportH) {
        engine.width = viewportW;
        engine.height = viewportH;
      }
      return computeHotspotProjections(hotspots || engine.hotspots);
    },

    forceProject: function () {
      const cam = computeCameraBasis();
      engine.lastCamState = cam;
      if (typeof engine.onProjectCallback === 'function') {
        engine.onProjectCallback(computeHotspotProjections(engine.hotspots, cam));
      }
    },

    setCustomBackground: function (dataUriOrNull) {
      if (!dataUriOrNull) {
        engine.customBgImg = null;
        engine.customBgUri = '';
        engine.panoCanvas = null;
        if (engine.viewMode !== '2d') {
          this.forceProject();
          notifyStateChanged();
        }
        return;
      }
      engine.customBgUri = String(dataUriOrNull);
      const img = new Image();
      img.onload = () => {
        engine.customBgImg = img;
        try {
          const tex = document.createElement('canvas');
          tex.width = img.naturalWidth * 2;
          tex.height = img.naturalHeight;
          const tctx = tex.getContext('2d');
          tctx.drawImage(img, 0, 0);
          tctx.drawImage(img, img.naturalWidth, 0);
          engine.panoCanvas = tex;
        } catch (err) {
          engine.panoCanvas = null;
        }
        const look = panoLookAt(1.8, -0.5, 4.5, 1);
        engine.pano = { yaw: look.yaw, pitch: look.pitch, zoom: 1 };
        if (engine.viewMode !== '2d') {
          this.forceProject();
          notifyStateChanged();
        }
      };
      img.onerror = () => {
        console.warn('Failed to load custom 3D background image');
      };
      img.src = dataUriOrNull;
    },

    getCustomBackground: function () {
      return engine.customBgUri || '';
    },

    setShowTwinMesh: function (show) {
      engine.showTwinMesh = Boolean(show);
      if (engine.viewMode !== '2d') {
        this.forceProject();
        notifyStateChanged();
      }
    },

    getShowTwinMesh: function () {
      return engine.showTwinMesh !== false;
    },

    loadGlbModel: function (arrayBuffer, name) {
      if (!engine.glbRenderer && engine.glbCanvas && global.WMPSESGlbRenderer) {
        engine.glbRenderer = global.WMPSESGlbRenderer.createRenderer(engine.glbCanvas);
      }
      if (!engine.glbRenderer) {
        throw new Error('当前环境未初始化 WebGL 3D 渲染画布');
      }
      const info = engine.glbRenderer.loadArrayBuffer(arrayBuffer, name || 'scene.glb');
      if (engine.glbCanvas && engine.glbCanvas.style) {
        engine.glbCanvas.style.display = 'block';
      }
      this.resize();
      if (engine.viewMode !== '2d') {
        this.forceProject();
      }
      notifyStateChanged();
      return info;
    },

    clearGlbModel: function () {
      if (engine.glbRenderer) {
        engine.glbRenderer.clear();
      }
      if (engine.glbCanvas && engine.glbCanvas.style) {
        engine.glbCanvas.style.display = 'none';
      }
      if (engine.viewMode !== '2d') {
        this.forceProject();
      }
      notifyStateChanged();
    },

    hasGlbModel: function () {
      return Boolean(engine.glbRenderer && engine.glbRenderer.isLoaded());
    },

    getGlbInfo: function () {
      return engine.glbRenderer ? engine.glbRenderer.getInfo() : null;
    },

    getState: getCameraSummary
  };

  global.PlantScene3D = PlantScene3D;
})(window);
