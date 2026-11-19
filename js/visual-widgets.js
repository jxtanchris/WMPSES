/**
 * 工业废气治理仿真工况可视化组件 (SVG)
 * 为每个设备热点弹窗顶部渲染高保真现场仪表、视镜、面板与设备局部特写图
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

  function renderScrubberTop() {
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">现场外观特写 · 喷淋层上方塔壁</span>
            <span class="sim-code">T-101-W01</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="碱洗塔上部防腐层起皮脱落特写">
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
            <!-- 塔体切面 -->
            <rect x="42" y="14" width="160" height="127" rx="4" fill="url(#st-shell)" stroke="#475569" stroke-width="1.5"/>
            <!-- 焊缝与喷淋层标记线 -->
            <line x1="42" y1="98" x2="202" y2="98" stroke="#334155" stroke-dasharray="4 3" stroke-width="1.5"/>
            <text x="48" y="113" fill="#1e293b" font-size="10" font-weight="600">喷淋层位置标高 EL+6.5m</text>
            <!-- 正常防腐内衬区域 -->
            <rect x="52" y="22" width="140" height="70" rx="3" fill="#cbd5e1" stroke="#64748b" stroke-width="1"/>
            <!-- 脱落裸露碳钢区域 -->
            <path d="M96 34 C118 28, 152 32, 156 50 C160 66, 142 82, 118 80 C94 78, 86 58, 96 34 Z" fill="url(#st-rust)" stroke="#f59e0b" stroke-width="1.8"/>
            <!-- 起皮翘起边缘 -->
            <path d="M92 38 L104 42 L95 54 Z" fill="#e2e8f0" stroke="#475569"/>
            <path d="M153 45 L164 52 L149 62 Z" fill="#e2e8f0" stroke="#475569"/>
            <!-- 标注箭头 -->
            <line x1="158" y1="54" x2="214" y2="40" stroke="#fbbf24" stroke-width="1.5"/>
            <rect x="212" y="20" width="98" height="58" rx="5" fill="#1e293b" stroke="#f59e0b" stroke-width="1"/>
            <text x="220" y="36" fill="#fbbf24" font-size="10" font-weight="700">防腐层大面积起皮</text>
            <text x="220" y="51" fill="#e2e8f0" font-size="10">裸露碳钢约 0.3 m²</text>
            <text x="220" y="66" fill="#94a3b8" font-size="9">测厚：局部减薄明显</text>
            <!-- 台账提示 -->
            <rect x="212" y="88" width="98" height="46" rx="5" fill="#1e293b" stroke="#38bdf8" stroke-width="1"/>
            <text x="220" y="104" fill="#38bdf8" font-size="9.5" font-weight="600">检修台账核对：</text>
            <text x="220" y="118" fill="#cbd5e1" font-size="9">塔内壁修补项</text>
            <text x="220" y="130" fill="#cbd5e1" font-size="9">状态：未完成验收</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">塔顶仪表与检定标签放大</span>
            <span class="sim-code">PI-101</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="塔顶压力表与检定标签">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 压力表外壳 -->
            <circle cx="88" cy="78" r="56" fill="#cbd5e1" stroke="#475569" stroke-width="3"/>
            <circle cx="88" cy="78" r="48" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
            <!-- 刻度线 -->
            <path d="M52 102 A42 42 0 1 1 124 102" fill="none" stroke="#334155" stroke-width="2"/>
            <text x="53" y="106" fill="#334155" font-size="9" font-weight="700">0</text>
            <text x="51" y="62" fill="#334155" font-size="9" font-weight="700">0.2</text>
            <text x="82" y="42" fill="#334155" font-size="9" font-weight="700">0.4</text>
            <text x="112" y="62" fill="#334155" font-size="9" font-weight="700">0.6</text>
            <text x="110" y="106" fill="#334155" font-size="9" font-weight="700">0.8</text>
            <text x="77" y="96" fill="#475569" font-size="9" font-weight="700">MPa</text>
            <!-- 指针指向 0.15MPa -->
            <line x1="88" y1="78" x2="54" y2="70" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="88" cy="78" r="4.5" fill="#1e293b"/>
            <rect x="61" y="114" width="54" height="16" rx="3" fill="#0f172a"/>
            <text x="66" y="125" fill="#38bdf8" font-size="9.5" font-weight="700">0.15 MPa</text>
            <!-- 检定标签牌 -->
            <rect x="162" y="20" width="144" height="115" rx="6" fill="#fefce8" stroke="#ca8a04" stroke-width="1.5"/>
            <rect x="162" y="20" width="144" height="24" rx="5" fill="#eab308"/>
            <text x="190" y="36" fill="#0f172a" font-size="11" font-weight="700">强检计量器具合格证</text>
            <text x="172" y="59" fill="#334155" font-size="10">位号：PI-101（塔顶压力）</text>
            <text x="172" y="76" fill="#334155" font-size="10">检定日期：2025-11-04</text>
            <text x="172" y="93" fill="#334155" font-size="10">有效期至：2026-11-04</text>
            <rect x="172" y="103" width="124" height="22" rx="4" fill="#fee2e2" stroke="#ef4444" stroke-width="1"/>
            <text x="180" y="118" fill="#b91c1c" font-size="10" font-weight="700">当前检查：已过期 15 天</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar">
        <span><strong>现场可见现象：</strong>① 碱洗塔喷淋层上方内壁防腐层起皮脱落约 0.3m²，露出碳钢基材；② 塔顶就地压力表 PI-101 读数 0.15MPa，但强检标签已过期 15 天（当前系统日期：2026-11-19）。</span>
      </div>`;
  }

  function renderScrubberBottom() {
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">联锁与液位仪表对比（DCS vs 就地）</span>
            <span class="sim-code">LT-101 / SIS</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="液位联锁旁路与假液位对比">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 左侧：DCS 画面 -->
            <rect x="12" y="14" width="144" height="127" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
            <text x="20" y="31" fill="#38bdf8" font-size="10" font-weight="700">DCS / SIS 联锁画面</text>
            <rect x="20" y="39" width="128" height="28" rx="4" fill="#0f172a" stroke="#475569"/>
            <text x="27" y="51" fill="#94a3b8" font-size="9">LT-101 远传液位读数</text>
            <text x="27" y="63" fill="#22d3ee" font-size="11" font-weight="700">60.0 %  (稳态无波动)</text>
            <rect x="20" y="75" width="128" height="56" rx="4" fill="#451a03" stroke="#f59e0b" stroke-width="1.5"/>
            <text x="27" y="91" fill="#fbbf24" font-size="10" font-weight="700">LALL-101 液位低低联锁</text>
            <text x="27" y="106" fill="#fef3c7" font-size="10">状态：旁路 (BYPASS)</text>
            <text x="27" y="121" fill="#fca5a5" font-size="9">挂牌：无 ｜ 审批单：缺失</text>

            <!-- 右侧：就地磁翻板/差压检查 -->
            <rect x="166" y="14" width="142" height="127" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
            <text x="174" y="31" fill="#a7f3d0" font-size="10" font-weight="700">现场就地液位计实测</text>
            <!-- 液位柱 -->
            <rect x="180" y="42" width="24" height="86" rx="3" fill="#0f172a" stroke="#64748b" stroke-width="1.5"/>
            <rect x="182" y="110" width="20" height="16" fill="#0284c7"/>
            <line x1="176" y1="110" x2="208" y2="110" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3 2"/>
            <text x="212" y="54" fill="#cbd5e1" font-size="9.5">玻璃板就地读数：</text>
            <text x="212" y="70" fill="#f87171" font-size="12" font-weight="700">实际仅 20%</text>
            <text x="212" y="88" fill="#fbbf24" font-size="9">核查发现：</text>
            <text x="212" y="102" fill="#e2e8f0" font-size="9">差压变送器引压管</text>
            <text x="212" y="115" fill="#e2e8f0" font-size="9">结晶堵塞，形成假指示</text>
            <text x="212" y="129" fill="#94a3b8" font-size="8.5">(低于低低联锁线 25%)</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">塔底循环出口法兰局部放大</span>
            <span class="sim-code">FL-102 (DN500)</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="塔体法兰同侧相邻缺失2条M20螺栓">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 法兰盘 -->
            <circle cx="95" cy="78" r="56" fill="#94a3b8" stroke="#475569" stroke-width="2.5"/>
            <circle cx="95" cy="78" r="32" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
            <!-- 螺栓孔 (8个，右侧相邻2个缺失) -->
            <circle cx="95" cy="34" r="6" fill="#334155" stroke="#e2e8f0" stroke-width="2"/>
            <circle cx="64" cy="47" r="6" fill="#334155" stroke="#e2e8f0" stroke-width="2"/>
            <circle cx="51" cy="78" r="6" fill="#334155" stroke="#e2e8f0" stroke-width="2"/>
            <circle cx="64" cy="109" r="6" fill="#334155" stroke="#e2e8f0" stroke-width="2"/>
            <circle cx="95" cy="122" r="6" fill="#334155" stroke="#e2e8f0" stroke-width="2"/>
            <circle cx="126" cy="109" r="6" fill="#334155" stroke="#e2e8f0" stroke-width="2"/>
            <!-- 缺失的两孔 -->
            <circle cx="139" cy="78" r="6.5" fill="#0f172a" stroke="#ef4444" stroke-width="2" stroke-dasharray="3 2"/>
            <circle cx="126" cy="47" r="6.5" fill="#0f172a" stroke="#ef4444" stroke-width="2" stroke-dasharray="3 2"/>
            <!-- 指示文字框 -->
            <line x1="133" y1="47" x2="174" y2="47" stroke="#ef4444" stroke-width="1.5"/>
            <line x1="146" y1="78" x2="174" y2="66" stroke="#ef4444" stroke-width="1.5"/>
            <rect x="174" y="24" width="134" height="106" rx="6" fill="#1e293b" stroke="#475569"/>
            <text x="184" y="44" fill="#f87171" font-size="10.5" font-weight="700">M20 螺栓缺装 2 条</text>
            <text x="184" y="61" fill="#e2e8f0" font-size="9.5">位置：同侧相邻两孔空缺</text>
            <text x="184" y="78" fill="#cbd5e1" font-size="9.5">垫片外观：无老化龟裂</text>
            <text x="184" y="95" fill="#cbd5e1" font-size="9.5">密封测试：常温暂无渗漏</text>
            <text x="184" y="114" fill="#94a3b8" font-size="9">待核定：缺螺栓缺陷等级</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar">
        <span><strong>现场可见现象：</strong>① DCS显示液位60%，但就地液位计仅20%，差压引压管堵塞；且LALL-101低低液位联锁处于“旁路”状态，无挂牌及审批单；② 塔底法兰同侧相邻缺失2条M20螺栓（垫片完好）。</span>
      </div>`;
  }

  function renderInducedFan() {
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">情况 B · 主引风机轴承箱油标视镜</span>
            <span class="sim-code">LG-201A</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="主引风机油位低于下限约8mm且油品乳化">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 视镜外壳 -->
            <rect x="34" y="16" width="56" height="123" rx="8" fill="#64748b" stroke="#94a3b8" stroke-width="2"/>
            <rect x="44" y="26" width="36" height="103" rx="4" fill="#1e293b"/>
            <!-- 乳化发白油液（低于下限约8mm） -->
            <rect x="45" y="102" width="34" height="26" rx="2" fill="#e5e7eb"/>
            <rect x="45" y="96" width="34" height="6" fill="#ca8a04" opacity="0.75"/>
            <!-- 上下限刻度 -->
            <line x1="36" y1="45" x2="108" y2="45" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 2"/>
            <text x="112" y="48" fill="#38bdf8" font-size="9.5">上限 (MAX)</text>
            <line x1="36" y1="86" x2="108" y2="86" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3 2"/>
            <text x="112" y="89" fill="#fbbf24" font-size="9.5">下限 (MIN)</text>
            <!-- 差距标注 -->
            <line x1="94" y1="86" x2="94" y2="97" stroke="#ef4444" stroke-width="2"/>
            <rect x="112" y="100" width="194" height="40" rx="5" fill="#450a0a" stroke="#ef4444"/>
            <text x="120" y="116" fill="#fca5a5" font-size="10" font-weight="700">油位低于下限约 8 mm</text>
            <text x="120" y="131" fill="#fecaca" font-size="9.5">油样取样：呈乳白色浑浊乳化状</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">情况 A · 备用/辅助侧轴承油标对照</span>
            <span class="sim-code">LG-201B</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="辅助轴承油位处于低限上方5mm且清亮透明">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="34" y="16" width="56" height="123" rx="8" fill="#64748b" stroke="#94a3b8" stroke-width="2"/>
            <rect x="44" y="26" width="36" height="103" rx="4" fill="#1e293b"/>
            <!-- 清亮金黄色油液（低限上方5mm） -->
            <rect x="45" y="76" width="34" height="52" rx="2" fill="#eab308"/>
            <rect x="45" y="76" width="34" height="6" fill="#fde047"/>
            <!-- 上下限刻度 -->
            <line x1="36" y1="45" x2="108" y2="45" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 2"/>
            <text x="112" y="48" fill="#38bdf8" font-size="9.5">上限 (MAX)</text>
            <line x1="36" y1="86" x2="108" y2="86" stroke="#22c55e" stroke-width="1.5" stroke-dasharray="3 2"/>
            <text x="112" y="89" fill="#86efac" font-size="9.5">下限 (MIN)</text>
            <line x1="94" y1="76" x2="94" y2="86" stroke="#22c55e" stroke-width="2"/>
            <rect x="112" y="100" width="194" height="40" rx="5" fill="#052e16" stroke="#22c55e"/>
            <text x="120" y="116" fill="#86efac" font-size="10" font-weight="700">油位在低限上方 5 mm</text>
            <text x="120" y="131" fill="#bbf7d0" font-size="9.5">油品色泽：金黄清亮、无杂质水珠</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar">
        <span><strong>现场可见现象：</strong>引风机主轴承箱（情况B）油位低于下限约8mm且取样呈乳白色乳化；辅助侧（情况A）油位在低限上方5mm（处于上下限之间）且油质清亮透明。</span>
      </div>`;
  }

  function renderCoolingWater() {
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">冷却水总管压力、流量与阀门状态</span>
            <span class="sim-code">PI-301 / FI-301</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="压力0.28MPa、流量为0、供水阀关闭">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 水平管线 -->
            <rect x="14" y="106" width="292" height="22" rx="4" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
            <!-- 压力表 0.28MPa -->
            <line x1="66" y1="106" x2="66" y2="86" stroke="#cbd5e1" stroke-width="6"/>
            <circle cx="66" cy="54" r="34" fill="#f8fafc" stroke="#64748b" stroke-width="3"/>
            <text x="46" y="73" fill="#334155" font-size="8" font-weight="700">0</text>
            <text x="41" y="47" fill="#334155" font-size="8" font-weight="700">0.5</text>
            <text x="61" y="31" fill="#334155" font-size="8" font-weight="700">1.0</text>
            <text x="82" y="47" fill="#334155" font-size="8" font-weight="700">1.5</text>
            <line x1="66" y1="54" x2="46" y2="61" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="66" cy="54" r="3" fill="#0f172a"/>
            <rect x="33" y="88" width="66" height="17" rx="3" fill="#1d4ed8"/>
            <text x="40" y="100" fill="#ffffff" font-size="9.5" font-weight="700">0.28 MPa</text>

            <!-- 红色手动阀门（关闭） -->
            <rect x="144" y="98" width="26" height="36" rx="3" fill="#475569" stroke="#cbd5e1"/>
            <line x1="157" y1="98" x2="157" y2="78" stroke="#cbd5e1" stroke-width="4"/>
            <ellipse cx="157" cy="76" rx="22" ry="6" fill="#dc2626" stroke="#fca5a5" stroke-width="1.5"/>
            <rect x="118" y="134" width="78" height="17" rx="3" fill="#dc2626"/>
            <text x="127" y="146" fill="#ffffff" font-size="9.5" font-weight="700">供水阀：关闭</text>

            <!-- 电磁流量计 0 m3/h -->
            <line x1="248" y1="106" x2="248" y2="86" stroke="#cbd5e1" stroke-width="6"/>
            <rect x="214" y="22" width="68" height="64" rx="8" fill="#0284c7" stroke="#7dd3fc" stroke-width="2"/>
            <rect x="223" y="31" width="50" height="34" rx="4" fill="#0f172a"/>
            <text x="234" y="51" fill="#f87171" font-size="14" font-weight="700">0.00</text>
            <text x="235" y="61" fill="#94a3b8" font-size="8">m³/h</text>
            <rect x="216" y="88" width="64" height="17" rx="3" fill="#1e293b" stroke="#f87171"/>
            <text x="227" y="100" fill="#fca5a5" font-size="9.5" font-weight="700">流量为 0</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">冷却水回水温度与运行趋势</span>
            <span class="sim-code">TI-302 / DCS</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="冷却水回水温度45度，设计值小于等于50度">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="16" width="292" height="58" rx="6" fill="#1e293b" stroke="#334155"/>
            <text x="26" y="36" fill="#94a3b8" font-size="10">辅助冷却分支（TI-302）回水温度实测：</text>
            <text x="26" y="61" fill="#22d3ee" font-size="20" font-weight="700">45.0 ℃</text>
            <rect x="165" y="39" width="128" height="24" rx="4" fill="#052e16" stroke="#22c55e"/>
            <text x="175" y="55" fill="#86efac" font-size="10" font-weight="600">设计允许上限：≤ 50 ℃</text>

            <rect x="14" y="84" width="292" height="56" rx="6" fill="#1e293b" stroke="#334155"/>
            <text x="26" y="103" fill="#fbbf24" font-size="10" font-weight="700">主冷却回路趋势核对提示：</text>
            <text x="26" y="120" fill="#cbd5e1" font-size="9.5">• 泵出口压力：0.28 MPa（静压憋压所致）</text>
            <text x="26" y="133" fill="#cbd5e1" font-size="9.5">• 流量趋势：持续 0 m³/h，供水手动阀处于全关位</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar">
        <span><strong>现场可见现象：</strong>① 主冷却水泵出口压力表显示 0.28MPa，但电磁流量计显示 0 m³/h 且供水手动阀关闭；② 另一路循环冷却水回水温度实测 45℃（设计要求 ≤50℃）。</span>
      </div>`;
  }

  function renderRtoChamber() {
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">三室 RTO 蓄热床与平台护栏现状</span>
            <span class="sim-code">R-101 / PL-2F</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="RTO二层平台护栏横杆变形">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 三室结构 -->
            <rect x="20" y="20" width="52" height="62" rx="3" fill="#334155" stroke="#64748b"/>
            <rect x="78" y="20" width="52" height="62" rx="3" fill="#334155" stroke="#64748b"/>
            <rect x="136" y="20" width="52" height="62" rx="3" fill="#334155" stroke="#64748b"/>
            <text x="34" y="45" fill="#e2e8f0" font-size="10" font-weight="700">A 室</text>
            <text x="92" y="45" fill="#e2e8f0" font-size="10" font-weight="700">B 室</text>
            <text x="150" y="45" fill="#e2e8f0" font-size="10" font-weight="700">C 室</text>
            <text x="31" y="64" fill="#94a3b8" font-size="8.5">待机 28℃</text>
            <text x="89" y="64" fill="#94a3b8" font-size="8.5">待机 29℃</text>
            <text x="147" y="64" fill="#94a3b8" font-size="8.5">待机 28℃</text>

            <!-- 平台及护栏变形特写 -->
            <rect x="16" y="128" width="182" height="8" fill="#475569"/>
            <line x1="26" y1="88" x2="26" y2="128" stroke="#eab308" stroke-width="3.5"/>
            <line x1="104" y1="88" x2="104" y2="128" stroke="#eab308" stroke-width="3.5"/>
            <line x1="184" y1="88" x2="184" y2="128" stroke="#eab308" stroke-width="3.5"/>
            <!-- 顶杆正常 -->
            <line x1="26" y1="90" x2="184" y2="90" stroke="#eab308" stroke-width="3"/>
            <!-- 中横杆一处变形弯曲 -->
            <line x1="26" y1="109" x2="104" y2="109" stroke="#eab308" stroke-width="2.5"/>
            <path d="M104 109 Q144 123 184 109" fill="none" stroke="#f97316" stroke-width="3"/>

            <rect x="206" y="20" width="102" height="116" rx="6" fill="#1e293b" stroke="#f59e0b"/>
            <text x="214" y="40" fill="#fbbf24" font-size="10" font-weight="700">护栏局部变形</text>
            <text x="214" y="58" fill="#e2e8f0" font-size="9">位置：二层东侧平台</text>
            <text x="214" y="75" fill="#e2e8f0" font-size="9">立柱焊接完好，</text>
            <text x="214" y="90" fill="#e2e8f0" font-size="9">仅中横杆弯曲约4cm，</text>
            <text x="214" y="106" fill="#86efac" font-size="9">不影响整体结构承载</text>
            <text x="214" y="124" fill="#94a3b8" font-size="8.5">待定：缺陷分级判定</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">炉膛/塔内受限空间人孔检查点</span>
            <span class="sim-code">MH-101 (安全红线)</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="受限空间作业安全确认看板">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="14" y="16" width="292" height="123" rx="6" fill="#1e293b" stroke="#ef4444" stroke-width="1.5"/>
            <rect x="14" y="16" width="292" height="28" rx="5" fill="#991b1b"/>
            <text x="30" y="34" fill="#fef2f2" font-size="11" font-weight="700">⚠ 警示：进入设备内部检查属于受限空间作业</text>
            <text x="26" y="64" fill="#e2e8f0" font-size="10">当前状态：RTO 蓄热室 / 碱洗塔人孔已打开</text>
            <text x="26" y="84" fill="#fbbf24" font-size="10">前置确认清单（需按 GB 30871-2022 核查）：</text>
            <text x="26" y="103" fill="#cbd5e1" font-size="9.5">□ 气体分析（O₂ / 可燃气体 / 有毒气体）</text>
            <text x="26" y="119" fill="#cbd5e1" font-size="9.5">□ 工艺盲板隔离与机械通风置换</text>
            <text x="26" y="135" fill="#cbd5e1" font-size="9.5">□ 作业许可审批及外部专人监护</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar">
        <span><strong>现场可见现象：</strong>① RTO二层平台一处护栏中横杆弯曲变形，立柱焊缝完好、不影响结构承载；② 如需点击人孔进入塔内或蓄热室内检查，须先完成受限空间安全确认。</span>
      </div>`;
  }

  function renderRtoValves() {
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">切换阀仪表气源减压站</span>
            <span class="sim-code">PI-401 (IA)</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="仪表气源压力0.32MPa，低于设计0.5至0.7MPa">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 压力表 -->
            <circle cx="84" cy="76" r="54" fill="#f8fafc" stroke="#64748b" stroke-width="3"/>
            <!-- 正常绿区弧线 0.5-0.7 -->
            <path d="M98 34 A44 44 0 0 1 122 68" fill="none" stroke="#22c55e" stroke-width="7"/>
            <!-- 欠压红区弧线 0-0.4 -->
            <path d="M48 102 A44 44 0 0 1 58 40" fill="none" stroke="#ef4444" stroke-width="7"/>
            <text x="48" y="106" fill="#334155" font-size="9" font-weight="700">0</text>
            <text x="41" y="64" fill="#334155" font-size="9" font-weight="700">0.3</text>
            <text x="77" y="38" fill="#334155" font-size="9" font-weight="700">0.5</text>
            <text x="111" y="64" fill="#334155" font-size="9" font-weight="700">0.7</text>
            <text x="108" y="106" fill="#334155" font-size="9" font-weight="700">1.0</text>
            <!-- 指针指向 0.32MPa -->
            <line x1="84" y1="76" x2="48" y2="62" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>
            <circle cx="84" cy="76" r="4.5" fill="#1e293b"/>

            <rect x="154" y="24" width="152" height="106" rx="6" fill="#1e293b" stroke="#ef4444"/>
            <text x="164" y="45" fill="#94a3b8" font-size="9.5">实测仪表气源压力：</text>
            <text x="164" y="69" fill="#f87171" font-size="20" font-weight="700">0.32 MPa</text>
            <text x="164" y="91" fill="#86efac" font-size="10">设计要求：0.5 ~ 0.7 MPa</text>
            <text x="164" y="111" fill="#fca5a5" font-size="9.5">状态：气源压力严重偏低</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">提升切换阀就地动作测试</span>
            <span class="sim-code">XV-401A/B/C</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="切换阀动作时间由3s延长至9s">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="16" y="18" width="288" height="119" rx="6" fill="#1e293b" stroke="#475569"/>
            <text x="28" y="40" fill="#38bdf8" font-size="10.5" font-weight="700">三室切换阀全行程开/关响应测试结果</text>
            <!-- 进度条对比 -->
            <text x="28" y="64" fill="#94a3b8" font-size="9.5">标准动作时间 (≤3.0s)</text>
            <rect x="148" y="54" width="46" height="13" rx="3" fill="#22c55e"/>
            <text x="200" y="64" fill="#86efac" font-size="10" font-weight="700">3.0 s</text>

            <text x="28" y="92" fill="#fca5a5" font-size="9.5">本次实测时间 (迟滞)</text>
            <rect x="148" y="82" width="136" height="13" rx="3" fill="#ef4444"/>
            <text x="200" y="114" fill="#f87171" font-size="13" font-weight="700">实测 9.0 s（超标3倍）</text>
            <text x="28" y="128" fill="#cbd5e1" font-size="9">现象：气缸驱动力不足，阀板闭合明显爬行迟滞</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar">
        <span><strong>现场可见现象：</strong>RTO切换阀组仪表气源压力表显示仅 0.32 MPa（设计要求 0.5～0.7 MPa），对切换阀执行就地动作测试发现全行程动作时间由 3s 延长至 9s。</span>
      </div>`;
  }

  function renderCemsStack() {
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">可燃气体报警控制器就地面板</span>
            <span class="sim-code">GD-501</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="可燃气体报警仪处于标定状态未投用">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 防爆外壳 -->
            <rect x="20" y="16" width="280" height="123" rx="8" fill="#334155" stroke="#64748b" stroke-width="2"/>
            <rect x="36" y="28" width="174" height="66" rx="4" fill="#090d16" stroke="#475569"/>
            <text x="46" y="48" fill="#fbbf24" font-size="11" font-weight="700">MODE: CAL (标定维护中)</text>
            <text x="46" y="68" fill="#f87171" font-size="13" font-weight="700">检测元件：未投用 / 离线</text>
            <text x="46" y="85" fill="#94a3b8" font-size="9">当前显示：--- %LEL (信号保持)</text>
            <!-- 指示灯 -->
            <circle cx="242" cy="44" r="9" fill="#334155" stroke="#64748b"/>
            <text x="257" y="48" fill="#94a3b8" font-size="9">正常</text>
            <circle cx="242" cy="70" r="9" fill="#f59e0b" stroke="#fef08a" stroke-width="2"/>
            <text x="257" y="74" fill="#fbbf24" font-size="9.5" font-weight="700">标定/屏蔽</text>
            <rect x="36" y="102" width="248" height="26" rx="4" fill="#451a03" stroke="#f59e0b"/>
            <text x="46" y="119" fill="#fde68a" font-size="9.5">现场核查：未切换回正常监测状态，RTO 入口防爆监测缺失</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">CEMS 烟气在线监测单元面板</span>
            <span class="sim-code">AT-502 (HJ 76)</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="CEMS零点漂移0.9%，标气超期23天，量程与环评一致">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <rect x="16" y="16" width="288" height="123" rx="6" fill="#1e293b" stroke="#475569"/>
            <text x="26" y="36" fill="#38bdf8" font-size="10" font-weight="700">CEMS 分析仪校准与参数诊断画面</text>
            <!-- 三行状态 -->
            <rect x="26" y="44" width="268" height="24" rx="4" fill="#450a0a" stroke="#ef4444"/>
            <text x="34" y="60" fill="#fca5a5" font-size="9.5" font-weight="700">1. 零点漂移：+0.9% F.S.（标准要求 ≤ ±0.5%）</text>

            <rect x="26" y="74" width="268" height="24" rx="4" fill="#450a0a" stroke="#ef4444"/>
            <text x="34" y="90" fill="#fca5a5" font-size="9.5" font-weight="700">2. 标准气体有效期：已过期 23 天（无法有效校准）</text>

            <rect x="26" y="104" width="268" height="24" rx="4" fill="#052e16" stroke="#22c55e"/>
            <text x="34" y="120" fill="#86efac" font-size="9.5" font-weight="600">3. 仪表量程设定：与环评批复一致（不同于出厂铭牌）</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar">
        <span><strong>现场可见现象：</strong>① 可燃气体报警仪处于“标定”状态、检测元件未投用；② CEMS 零点漂移 0.9%（超 ±0.5%）、标气校验过期 23 天；③ CEMS 量程与环评批复一致但与设备铭牌默认量程不同。</span>
      </div>`;
  }

  function renderUtilitiesPlc() {
    return `
      <div class="sim-card-grid sim-card-grid-2">
        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">公用工程与双回路配电柜监控</span>
            <span class="sim-code">UT-601 / MCC</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="压缩空气0.68MPa，氮气0.50MPa，双回路带电正常">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 三组参数卡 -->
            <rect x="14" y="18" width="92" height="118" rx="6" fill="#052e16" stroke="#22c55e" stroke-width="1.2"/>
            <text x="24" y="38" fill="#bbf7d0" font-size="9.5" font-weight="700">压缩空气总管</text>
            <text x="24" y="68" fill="#4ade80" font-size="16" font-weight="700">0.68</text>
            <text x="68" y="68" fill="#86efac" font-size="10">MPa</text>
            <text x="22" y="92" fill="#cbd5e1" font-size="8.5">设计: 0.6~0.8</text>
            <text x="22" y="118" fill="#4ade80" font-size="9.5" font-weight="700">● 压力正常</text>

            <rect x="114" y="18" width="92" height="118" rx="6" fill="#052e16" stroke="#22c55e" stroke-width="1.2"/>
            <text x="124" y="38" fill="#bbf7d0" font-size="9.5" font-weight="700">氮气密封总管</text>
            <text x="124" y="68" fill="#4ade80" font-size="16" font-weight="700">0.50</text>
            <text x="168" y="68" fill="#86efac" font-size="10">MPa</text>
            <text x="122" y="92" fill="#cbd5e1" font-size="8.5">设计: 0.4~0.6</text>
            <text x="122" y="118" fill="#4ade80" font-size="9.5" font-weight="700">● 压力正常</text>

            <rect x="214" y="18" width="92" height="118" rx="6" fill="#052e16" stroke="#22c55e" stroke-width="1.2"/>
            <text x="224" y="38" fill="#bbf7d0" font-size="9.5" font-weight="700">双回路供电</text>
            <circle cx="232" cy="64" r="6" fill="#22c55e"/>
            <text x="243" y="68" fill="#e2e8f0" font-size="9">I段：带电</text>
            <circle cx="232" cy="88" r="6" fill="#22c55e"/>
            <text x="243" y="92" fill="#e2e8f0" font-size="9">II段：带电</text>
            <text x="222" y="118" fill="#4ade80" font-size="9.5" font-weight="700">● 备自投正常</text>
          </svg>
        </div>

        <div class="sim-panel">
          <div class="sim-panel-header">
            <span class="sim-tag">现场设备铭牌与管道介质标识特写</span>
            <span class="sim-code">TAG-602</span>
          </div>
          <svg viewBox="0 0 320 155" class="sim-svg" aria-label="设备铭牌与管道介质标识污损色标不清">
            <rect x="0" y="0" width="320" height="155" rx="8" fill="#0f172a"/>
            <!-- 管线 -->
            <rect x="20" y="28" width="280" height="30" rx="4" fill="#64748b" stroke="#94a3b8"/>
            <!-- 污损色环 -->
            <rect x="112" y="28" width="54" height="30" fill="#78716c" opacity="0.8"/>
            <text x="118" y="47" fill="#d6d3d1" font-size="9" opacity="0.6">介质: ?? →</text>
            <!-- 污损铭牌 -->
            <rect x="26" y="72" width="128" height="66" rx="4" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
            <text x="36" y="92" fill="#334155" font-size="10" font-weight="700">设备铭牌（污损）</text>
            <line x1="34" y1="98" x2="144" y2="124" stroke="#451a03" stroke-width="7" opacity="0.45"/>
            <text x="36" y="112" fill="#1e293b" font-size="8.5">型号：████-250</text>
            <text x="36" y="128" fill="#1e293b" font-size="8.5">出厂编号：字迹模糊</text>

            <rect x="166" y="72" width="136" height="66" rx="5" fill="#1e293b" stroke="#f59e0b"/>
            <text x="176" y="91" fill="#fbbf24" font-size="10" font-weight="700">标识核查现象：</text>
            <text x="176" y="108" fill="#e2e8f0" font-size="9">公用工程气/电均正常，</text>
            <text x="176" y="123" fill="#e2e8f0" font-size="9">但现场管道色标与铭牌污损</text>
          </svg>
        </div>
      </div>
      <div class="sim-facts-bar">
        <span><strong>现场可见现象：</strong>① 压缩空气（0.68MPa）、氮气（0.50MPa）及双回路供电指示均符合启动条件；② 部分现场设备铭牌与管道介质标识污损、色标不清；③ 综合全套装置已查出的各项重大与一般缺陷，准备作总体验收判定。</span>
      </div>`;
  }

  function renderGeneric(hotspot) {
    const title = escapeHtml(hotspot && hotspot.name ? hotspot.name : '现场设备节点');
    const code = escapeHtml(hotspot && hotspot.code ? hotspot.code : 'DEV-00');
    const category = escapeHtml(hotspot && hotspot.category ? hotspot.category : '设备核查');
    const summary = escapeHtml(hotspot && hotspot.sceneSummary ? hotspot.sceneSummary : '请结合本部位设备铭牌、参数与验收规范完成作答。');
    return `
      <div class="sim-panel">
        <div class="sim-panel-header">
          <span class="sim-tag">${category} · ${title}</span>
          <span class="sim-code">${code}</span>
        </div>
        <div class="sim-generic-body">
          <div class="sim-generic-icon">🏭</div>
          <div>
            <div class="sim-generic-title">${title} (${code})</div>
            <div class="sim-generic-desc">${summary}</div>
          </div>
        </div>
      </div>`;
  }

  global.VisualWidgets = {
    render: function (widgetType, hotspot) {
      switch (widgetType) {
        case 'scrubber_top':
          return renderScrubberTop();
        case 'scrubber_bottom':
          return renderScrubberBottom();
        case 'induced_fan':
          return renderInducedFan();
        case 'cooling_water':
          return renderCoolingWater();
        case 'rto_chamber':
          return renderRtoChamber();
        case 'rto_valves':
          return renderRtoValves();
        case 'cems_stack':
          return renderCemsStack();
        case 'utilities_plc':
          return renderUtilitiesPlc();
        default:
          return renderGeneric(hotspot);
      }
    },
    WIDGET_OPTIONS: [
      { value: 'scrubber_top', label: '碱洗塔上部（防腐脱落 + 压力表过期标签）' },
      { value: 'scrubber_bottom', label: '碱洗塔下部（液位联锁旁路/假液位 + 缺螺栓）' },
      { value: 'induced_fan', label: '引风机（油位低乳化 vs 正常油位对比视镜）' },
      { value: 'cooling_water', label: '循环冷却水（0.28MPa但流量0 + 回水45℃）' },
      { value: 'rto_chamber', label: 'RTO本体（平台护栏变形 + 受限空间警示）' },
      { value: 'rto_valves', label: 'RTO切换阀组（气源0.32MPa + 动作9s迟滞）' },
      { value: 'cems_stack', label: '烟囱与CEMS（报警仪标定态 + 零漂0.9%超期23天）' },
      { value: 'utilities_plc', label: '公用工程与PLC（气电正常 + 铭牌污损 + 总结论）' },
      { value: 'generic', label: '通用设备信息卡（自定义新增热点）' }
    ]
  };
})(window);
