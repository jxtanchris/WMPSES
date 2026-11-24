/**
 * 工业废气治理工（二级/技师）实操模拟仿真考试系统 - 默认题库配置
 * 依据：《工业废气治理工国家职业技能标准（2019年版）》1.1.1 系统启动前设备验收
 * 覆盖：碱洗预处理＋三室蓄热式焚烧（RTO）联合装置 8 个核心部位、15 道题（共 50 分）、全部 D1~D10 缺陷与 G1~G3 干扰项
 */
(function (global) {
  'use strict';

  global.DEFAULT_QUESTION_BANK = {
    meta: {
      id: 'WMPSES-1.1.1-V1',
      title: '工业废气治理工（二级/技师）实操模拟仿真考试系统',
      subtitle: '1.1.1 系统启动前设备验收（碱洗预处理＋三室RTO联合装置）',
      examCode: '6-28-02-05 / 1.1.1',
      totalScore: 50,
      passScore: 30,
      durationMinutes: 30,
      version: '1.0.0',
      updatedAt: '2026-11-19',
      examPicture: global.PLANT_IMAGE_BASE64 || 'assets/plant-panorama.jpg',
      examPicture3d: ''
    },
    hotspots: [
      {
        id: 'hs-scrubber-top',
        order: 1,
        code: 'A-101A',
        name: '碱洗塔上部与塔顶平台',
        category: '设备本体外观 / 监测仪表',
        x: 16.0,
        y: 34.0,
        pos3d: { x: -11.5, y: -2.15, z: 8.8 },
        presetKey: 'scrubber_top',
        widgetType: 'scrubber_top',
        widgetParams: { peelArea: 0.3, topPressure: 0.15, expiredDays: 15 },
        sceneSummary: '碱洗塔喷淋层上方内壁防腐层起皮脱落约0.3m²，塔顶压力表PI-101强检标签已过期15天。',
        questions: [
          {
            id: 'q-d1',
            defectCode: 'D1',
            defectLevel: 'major',
            isMajorDefect: true,
            type: 'single',
            score: 4,
            title: '核查碱洗塔喷淋层上方内壁时，发现防腐层大面积起皮脱落并露出碳钢基材（面积约0.3m²）。关于该现象的验收判定与处理，正确的是（ ）。',
            options: [
              { key: 'A', text: '合格，碱洗塔为常温低压设备，局部脱落不影响启动' },
              { key: 'B', text: '不合格（一般缺陷），先启动投运，待下次大修时一并处理' },
              { key: 'C', text: '不合格（重大缺陷），必须停工修补防腐并经测厚与复验合格后方可启动' },
              { key: 'D', text: '无法判定，只需在验收台账备注“注意观察”即可放行' }
            ],
            answer: ['C'],
            referenceStandard: 'HJ 2000-2018《大气污染治理工程技术导则》及设备防腐验收规范',
            explanation: '碱洗塔内部存在碱性吸收液及可能穿透的酸性腐蚀介质，喷淋层上方内壁防腐层大面积脱落露出碳钢基材（0.3m²）会迅速引起塔体腐蚀减薄甚至穿孔泄漏，属于重大缺陷（D1），不得放行启动，必须停工修复防腐层并复测厚度合格。'
          },
          {
            id: 'q-d8',
            defectCode: 'D8',
            defectLevel: 'general',
            isMajorDefect: false,
            type: 'single',
            score: 3,
            title: '放大查看塔顶压力表（PI-101）强检标签，显示检定有效期至 2026-11-04（当前已过期15天），表盘指示 0.15MPa。该项核查应判定为（ ）。',
            options: [
              { key: 'A', text: '合格，只要指针能动作且外观无破损即可继续使用' },
              { key: 'B', text: '不合格（一般缺陷），需登记台账并限期更换或重新校验贴标' },
              { key: 'C', text: '合格（干扰项），强检标签有30天宽限期' },
              { key: 'D', text: '直接触发系统级中毒窒息否定项' }
            ],
            answer: ['B'],
            referenceStandard: '《计量法》及本方案表2缺陷清单（D8）',
            explanation: '压力表超过检定有效期（过期15天）属于不合格项，按实际风险审定为一般缺陷（D8），应登记缺陷台账并限期送检或更换合格仪表，防止读数失准。'
          }
        ]
      },
      {
        id: 'hs-scrubber-bottom',
        order: 2,
        code: 'A-101B',
        name: '碱洗塔下部法兰与液位联锁',
        category: '安全联锁保护 / 设备本体外观',
        x: 16.5,
        y: 73.0,
        pos3d: { x: -10.8, y: -2.5, z: 2.3 },
        presetKey: 'scrubber_bottom',
        widgetType: 'scrubber_bottom',
        widgetParams: { dcsLevel: 60, localLevel: 20, interlockStatus: '旁路 (BYPASS)', missingBolts: 2 },
        sceneSummary: 'LALL-101低低液位联锁处于旁路且无挂牌审批；DCS显示60%而就地液位仅20%；DN500法兰同侧相邻缺2条M20螺栓。',
        questions: [
          {
            id: 'q-d6',
            defectCode: 'D6',
            defectLevel: 'major',
            isMajorDefect: true,
            type: 'multiple',
            score: 4,
            title: '对比 DCS 联锁画面与塔底就地液位计后，下列分析与判定正确的有（ ）。（多选）',
            options: [
              { key: 'A', text: '差压液位计引压管堵塞造成假液位（DCS显示60%，实际仅20%），属于重大缺陷' },
              { key: 'B', text: 'LALL-101 液位低低联锁处于旁路状态且无挂牌、无审批单，违背安全联锁管理规定' },
              { key: 'C', text: '若在此状态下强行启动循环泵，可能导致低液位泵空转烧毁或气体串压风险' },
              { key: 'D', text: '应以 DCS 远传 60% 读数为准，现场就地玻璃板液位计可忽略' }
            ],
            answer: ['A', 'B', 'C'],
            referenceStandard: 'GB 30871-2022 / 安全联锁投用及仪表比对规程（D6）',
            explanation: 'D6场景中同时存在“联锁未经审批挂牌被旁路”和“引压管堵塞导致假液位”两项致命隐患。必须疏通引压管恢复真实液位指示，并取消旁路、做联锁动作试验确认投用后方可启动。'
          },
          {
            id: 'q-d7',
            defectCode: 'D7',
            defectLevel: 'general',
            isMajorDefect: false,
            type: 'single',
            score: 3,
            title: '检查碱洗塔下部循环出口 DN500 法兰（FL-102）紧固情况，发现同侧相邻缺失 2 条 M20 螺栓（垫片完好、常温无渗漏）。按本方案缺陷分级标准应判为（ ）。',
            options: [
              { key: 'A', text: '合格，只要不渗漏就可以减少螺栓数量' },
              { key: 'B', text: '不合格（一般缺陷），须补齐同规格 M20 螺栓并按对角顺序紧固到位' },
              { key: 'C', text: '合格，同侧缺失2条属于安装工艺允许误差' },
              { key: 'D', text: '不需要记录到缺陷台账中' }
            ],
            answer: ['B'],
            referenceStandard: '管道与设备法兰紧固验收规范（D7）',
            explanation: '法兰螺栓必须齐全、紧固力矩均匀，同侧相邻缺失2条M20螺栓属于不合格项（D7一般缺陷），开车前应督促检修人员补齐螺栓并复紧。'
          }
        ]
      },
      {
        id: 'hs-induced-fan',
        order: 3,
        code: 'B-101',
        name: '引风机与润滑油系统',
        category: '润滑冷却系统',
        x: 27.6,
        y: 77.0,
        pos3d: { x: -5.2, y: -3.5, z: 1.8 },
        presetKey: 'fan_cooling',
        widgetType: 'induced_fan',
        widgetParams: { mainOilOffset: -8, mainOilQuality: '乳白色浑浊乳化', auxOilOffset: 5 },
        sceneSummary: '主引风机油位低于下限约8mm且油品呈乳白色乳化；辅助侧油位在低限上方5mm且清亮透明。',
        questions: [
          {
            id: 'q-d2',
            defectCode: 'D2',
            defectLevel: 'major',
            isMajorDefect: true,
            type: 'single',
            score: 4,
            title: '观察主引风机轴承箱油标（情况B），油位低于下限约 8mm，且油样呈乳白色乳化状。该问题的危害及判定是（ ）。',
            options: [
              { key: 'A', text: '合格，开机运行升温后水分会自动蒸发' },
              { key: 'B', text: '不合格（一般缺陷），只需直接补充新润滑油至上下限之间即可' },
              { key: 'C', text: '不合格（重大缺陷），直接启动易造成轴承润滑失效烧毁，须查明进水原因并彻底换油清洗' },
              { key: 'D', text: '干扰项，油位略低于下限属正常热胀冷缩余量' }
            ],
            answer: ['C'],
            referenceStandard: '转动设备润滑系统验收规范（D2）',
            explanation: '润滑油低于下限且发生乳化（混入水分）会导致油膜破坏，大功率引风机启动后极易发生轴承抱死烧毁（重大缺陷 D2）。不能仅补油，必须排净乳化油、排查密封或冷却器漏水点、清洗并重新加注合格润滑油。'
          },
          {
            id: 'q-g1',
            defectCode: 'G1',
            defectLevel: 'interference',
            isMajorDefect: false,
            type: 'judge',
            score: 2,
            title: '辅助侧轴承箱油标（情况A）显示油位处于下限刻度上方 5mm 处，且油品金黄清亮无杂质。有考生认为“接近下限即属于油位不足缺陷”，这种判断是否正确？（判断对错）',
            options: [
              { key: 'A', text: '正确（应该判定为不合格）' },
              { key: 'B', text: '错误（该情况仍在上下限允许区间内，应判为合格）' }
            ],
            answer: ['B'],
            referenceStandard: '本方案场景判定原则及 PDF 第 9 页对照练习（G1）',
            explanation: '“接近下限不等于低于下限”。油位在油标下限上方 5mm 且油质清亮透明，完全处于允许区间内，属于本题刻意设置的干扰项（G1），不应误判为缺陷。'
          }
        ]
      },
      {
        id: 'hs-cooling-water',
        order: 4,
        code: 'W-101',
        name: '循环冷却水管线与阀组',
        category: '润滑冷却系统 / 管线阀门',
        x: 35.8,
        y: 58.0,
        pos3d: { x: -1.8, y: -6.1, z: 1.9 },
        presetKey: 'fan_cooling',
        widgetType: 'cooling_water',
        widgetParams: { pressure: 0.28, valveStatus: '关闭', flow: 0, returnTemp: 45.0, maxTemp: 50 },
        sceneSummary: '主冷却水管压力表显示0.28MPa，但流量计示数为0 m³/h且供水阀关闭；另一分支回水温度实测45℃（设计≤50℃）。',
        questions: [
          {
            id: 'q-d3',
            defectCode: 'D3',
            defectLevel: 'major',
            isMajorDefect: true,
            type: 'single',
            score: 4,
            title: '查看冷却水系统现场仪表，主供水管压力表显示 0.28MPa，但电磁流量计显示 0.00 m³/h，供水手动阀处于关闭位置。此时能否判定“冷却水已正常投用”？（ ）',
            options: [
              { key: 'A', text: '可以，有 0.28MPa 压力说明水已进入设备' },
              { key: 'B', text: '不可以，管路存在憋压假象且流量为 0、供水阀关闭，属于重大缺陷（冷却水未投用）' },
              { key: 'C', text: '可以，只要在 DCS 上强制把流量计设为正常值即可启动' },
              { key: 'D', text: '属于一般缺陷，启动后再缓慢开启供水阀即可' }
            ],
            answer: ['B'],
            referenceStandard: 'PDF 第 8 页判断练习及本方案（D3）',
            explanation: '不能只看压力表！压力 0.28MPa 可能是阀前静压或管线憋压，核对阀位（关闭）与流量计（0 m³/h）可知冷却水根本未流动投用。若盲目启动将导致设备及风机轴承超温损坏，属重大缺陷（D3）。'
          },
          {
            id: 'q-g2',
            defectCode: 'G2',
            defectLevel: 'interference',
            isMajorDefect: false,
            type: 'judge',
            score: 2,
            title: '某分支循环冷却水回水温度表（TI-302）当前读数为 45.0℃，设备设计要求回水温度 ≤ 50℃。该回水温度指标是否合格？（ ）',
            options: [
              { key: 'A', text: '合格，45.0℃ 未超出 ≤50℃ 的设计允许上限（属正常范围干扰项）' },
              { key: 'B', text: '不合格，回水温度超过 40℃ 即构成重大高温故障' }
            ],
            answer: ['A'],
            referenceStandard: '本方案表2干扰项清单（G2）',
            explanation: '判定必须以设计值与规程为准，不能凭主观感觉认为“45℃偏热就是异常”。在设计要求 ≤50℃ 的前提下，45.0℃ 处于合格范围，属于干扰项（G2）。'
          }
        ]
      },
      {
        id: 'hs-rto-chamber',
        order: 5,
        code: 'R-101',
        name: '三室RTO本体与二层平台',
        category: '设备本体外观 / 安全附件',
        x: 50.2,
        y: 43.0,
        pos3d: { x: 4.5, y: -2.3, z: 6.4 },
        presetKey: 'rto_frame',
        widgetType: 'rto_chamber',
        widgetParams: { chamberTemp: 28, railBendCm: 4, manholeStatus: '已打开 (待入内检查)' },
        sceneSummary: 'RTO二层平台一处护栏中横杆局部弯曲变形，立柱焊缝完好；人孔已开启，需检查受限空间作业安全前置条件。',
        questions: [
          {
            id: 'q-d9',
            defectCode: 'D9',
            defectLevel: 'general',
            isMajorDefect: false,
            type: 'single',
            score: 3,
            title: '在 RTO 二层平台巡检时，发现东侧护栏一处中横杆受碰撞轻微弯曲变形，但立柱焊接牢固且不影响整体结构承载。该缺陷应如何定级与处置？（ ）',
            options: [
              { key: 'A', text: '重大缺陷，必须整套废气装置停产大修才能验收' },
              { key: 'B', text: '一般缺陷（D9），不影响装置核心工艺安全，登记台账并限期整形修复' },
              { key: 'C', text: '完全合格，不需要任何登记记录' },
              { key: 'D', text: '立即判定整套设备可以无条件放行' }
            ],
            answer: ['B'],
            referenceStandard: '本方案表2缺陷清单（D9）',
            explanation: '区分问题轻重是技师实操的核心能力：护栏局部横杆变形但不影响承载力，属于一般缺陷（D9），应记录缺陷台账并限期整改，不应将其混同为导致停运的重大工艺隐患。'
          },
          {
            id: 'q-n3',
            defectCode: 'N3',
            defectLevel: 'safety',
            isMajorDefect: false,
            type: 'multiple',
            score: 3,
            title: '验收人员若需通过人孔进入 RTO 蓄热室或碱洗塔内部检查填料与防腐层，按安全底线要求（GB 30871-2022），入内前必须完成哪些确认？（ ）（多选）',
            options: [
              { key: 'A', text: '完成机械通风置换及氧含量、可燃气体、有毒气体检测合格' },
              { key: 'B', text: '确认与运行系统可靠盲板隔离，并办理受限空间作业审批' },
              { key: 'C', text: '在人孔外设专人监护并备好应急救援器材' },
              { key: 'D', text: '只要自己带着手电筒、屏住呼吸快速进出，就无需检测与监护' }
            ],
            answer: ['A', 'B', 'C'],
            referenceStandard: 'GB 30871-2022《危险化学品企业特殊作业安全规范》及方案否定项 N3',
            explanation: '未经气体分析检测、可靠隔离、审批与专人监护便进入塔内或炉内受限空间，极易引发中毒、窒息事故（本方案安全否定项 N3 红线）。'
          }
        ]
      },
      {
        id: 'hs-rto-valves',
        order: 6,
        code: 'V-101',
        name: 'RTO下部切换阀组与气源',
        category: '管线阀门',
        x: 50.2,
        y: 77.0,
        pos3d: { x: 4.5, y: -3.6, z: 1.5 },
        presetKey: 'rto_frame',
        widgetType: 'rto_valves',
        widgetParams: { airPressure: 0.32, switchTime: 9.0, stdSwitchTime: 3.0 },
        sceneSummary: '切换阀仪表气源压力仅0.32MPa（设计0.5~0.7MPa），就地动作测试切换阀全行程时间由3s延长至9s。',
        questions: [
          {
            id: 'q-d4',
            defectCode: 'D4',
            defectLevel: 'major',
            isMajorDefect: true,
            type: 'single',
            score: 4,
            title: '检测 RTO 切换阀组发现：仪表气源压力为 0.32MPa（设计要求 0.5～0.7MPa），就地动作测试切换阀全行程时间由正常的 3s 延长至 9s。该隐患造成的直接后果及判定是（ ）。',
            options: [
              { key: 'A', text: '一般缺陷，阀门能动作即可，时间长一点反而运行更平稳' },
              { key: 'B', text: '重大缺陷（D4），气源不足导致切换阀严重迟滞，易造成三室切换时未处理废气短窜超标排放或压力剧烈波动' },
              { key: 'C', text: '合格，只要把主空压机停掉即可恢复' },
              { key: 'D', text: '仅需修改 DCS 阀门报警延时参数掩盖即可' }
            ],
            answer: ['B'],
            referenceStandard: 'RTO切换阀组验收规范及本方案（D4）',
            explanation: '三室 RTO 靠切换阀快速准确切换实现蓄热与吹扫。仪表气源仅 0.32MPa 造成切换动作耗时 9s（正常≤3s），会导致进出气交叉短窜、VOCs 瞬时超标和炉膛压力波动，必须判为重大缺陷（D4），须先排查气源减压阀或管路泄漏恢复至 0.5~0.7MPa 并复测动作时间。'
          }
        ]
      },
      {
        id: 'hs-cems-stack',
        order: 7,
        code: 'M-101',
        name: '排气筒与CEMS/报警监测站',
        category: '监测仪表 / 安全联锁保护',
        x: 68.0,
        y: 46.0,
        pos3d: { x: 11.2, y: -2.0, z: 4.8 },
        presetKey: 'stack_plc',
        widgetType: 'cems_stack',
        widgetParams: { gasAlarmMode: 'CAL (标定维护/未投用)', zeroDrift: 0.9, stdGasExpiredDays: 23 },
        sceneSummary: '可燃气体报警仪处于“标定”未投用状态；CEMS零点漂移+0.9%（要求±0.5%）、标气超期23天；CEMS量程与环评批复一致。',
        questions: [
          {
            id: 'q-d5',
            defectCode: 'D5',
            defectLevel: 'major',
            isMajorDefect: true,
            type: 'multiple',
            score: 4,
            title: '在排气筒监测站与入口可燃气体报警控制器前核查，下列哪些属于阻碍系统安全环保启动的重大缺陷（D5）？（ ）（多选）',
            options: [
              { key: 'A', text: '可燃气体报警仪停留在“CAL 标定”模式，检测元件未正常投用' },
              { key: 'B', text: 'CEMS 分析仪零点漂移达 +0.9% F.S.（超出 ±0.5% 规范限值）' },
              { key: 'C', text: 'CEMS 校准用标准气体已过期 23 天，无法完成有效标定' },
              { key: 'D', text: 'CEMS 设置的量程与环评批复一致' }
            ],
            answer: ['A', 'B', 'C'],
            referenceStandard: 'HJ 75-2017 / HJ 76-2017 及 GB 50058 防爆监测要求（D5）',
            explanation: 'RTO 入口可燃气体浓度（%LEL）未投用会导致高浓度废气窜入炉膛引发闪爆风险；CEMS 零点漂移超 ±0.5% 且标气过期 23 天导致环保排放监测失真。A、B、C 均为重大隐患；D 项与环评批复一致属正常设置。'
          },
          {
            id: 'q-g3',
            defectCode: 'G3',
            defectLevel: 'interference',
            isMajorDefect: false,
            type: 'judge',
            score: 2,
            title: '核对 CEMS 分析仪量程参数时，发现其设定值与项目环评批复要求完全一致，但与仪表出厂铭牌上的默认最大量程不同。是否应将其判为不合格缺陷？（ ）',
            options: [
              { key: 'A', text: '是，必须强行改回出厂铭牌最大值' },
              { key: 'B', text: '否，量程设置与环评批复及实际工艺排放浓度匹配即属合格（干扰项）' }
            ],
            answer: ['B'],
            referenceStandard: 'HJ 75-2017 量程设定规范及本方案（G3）',
            explanation: 'CEMS 实际运行量程应根据污染源排放标准与环评批复设定，出厂铭牌仅标示仪表硬件支持的最大能力范围。因此与环评批复一致属于正常合格状态（G3干扰项）。'
          }
        ]
      },
      {
        id: 'hs-utilities-plc',
        order: 8,
        code: 'U-101',
        name: '公用工程站与PLC总控柜',
        category: '公用工程配套 / 总体放行结论',
        x: 82.0,
        y: 76.0,
        pos3d: { x: 15.2, y: -4.3, z: 2.0 },
        presetKey: 'stack_plc',
        widgetType: 'utilities_plc',
        widgetParams: { airMainPressure: 0.68, n2Pressure: 0.50, powerStatus: 'I/II段均带电·备自投正常', nameplateStatus: '铭牌污损·介质色标不清' },
        sceneSummary: '压缩空气0.68MPa、氮气0.50MPa、双回路供电正常；现场设备铭牌与管道色标污损不清；需给出整套装置最终验收结论。',
        questions: [
          {
            id: 'q-d10',
            defectCode: 'D10',
            defectLevel: 'general',
            isMajorDefect: false,
            type: 'single',
            score: 3,
            title: '在公用工程站与控制柜区检查发现：压缩空气总管 0.68MPa（设计 0.6~0.8）、氮气 0.50MPa（设计 0.4~0.6）、双回路供电均正常带电；但部分现场设备铭牌及管道介质标识污损、色标不清（D10）。下列评价最准确的是（ ）。',
            options: [
              { key: 'A', text: '公用工程气/电参数全部不合格，需停电改造' },
              { key: 'B', text: '公用工程主参数合格；铭牌与介质色标污损属于一般缺陷（D10），需登记并限期补全标识' },
              { key: 'C', text: '铭牌与管道色标污损属于重大缺陷，可直接触发设备爆炸' },
              { key: 'D', text: '只要双回路供电有 I 段带电即可，II 段备自投不需要检查' }
            ],
            answer: ['B'],
            referenceStandard: '本方案表3公用工程判定口径及表2缺陷清单（D10）',
            explanation: '压缩空气（0.68MPa）、氮气（0.50MPa）及双回路供电均符合启动条件；铭牌与介质色标污损影响现场管理与辨识，属一般缺陷（D10），应限期清洁或补牌。'
          },
          {
            id: 'q-final',
            defectCode: 'CONCLUSION',
            defectLevel: 'critical',
            isMajorDefect: false,
            isCriticalConclusion: true,
            type: 'single',
            score: 5,
            title: '【核心放行判定】综合本次对“碱洗预处理＋三室RTO联合装置”六大方面的全部检查结果，关于本套检修后装置能否启动及后续处置要求，最终验收结论应为（ ）。',
            options: [
              { key: 'A', text: '验收合格，具备启动条件，一般缺陷可在运行后逐步消除' },
              { key: 'B', text: '验收不合格，不具备启动条件；须对 6 项重大缺陷停工整改并经复验、签字确认后方可移交启动，4 项一般缺陷限期整改' },
              { key: 'C', text: '验收基本合格，仅开启引风机和 RTO 主燃烧器试运行 2 小时再说' },
              { key: 'D', text: '只需把存在缺陷的仪表和联锁全部切至旁路即可强行启动' }
            ],
            answer: ['B'],
            referenceStandard: '《工业废气治理工国家职业技能标准（2019年版）》1.1.1 核心判定及否定项规程',
            explanation: '本装置存在防腐脱落(D1)、油位低且乳化(D2)、冷却水未投用(D3)、气源不足切换迟滞(D4)、报警仪未投用与CEMS超期(D5)、液位联锁旁路与假指示(D6)共 6 项重大缺陷，绝对不具备启动条件！若误判“合格/放行”，在国家技能考核中将直接触发“一票否决（0分）”否定项。'
          }
        ]
      }
    ],
    vetoRules: [
      {
        id: 'N1',
        order: 1,
        code: 'N1',
        name: '操作超时未提交',
        conditionType: 'OVERTIME',
        thresholdValue: 25,
        targetRef: 'durationMinutes',
        penaltyAction: 'ZERO_SCORE',
        isEnabled: true,
        alertMessage: 'N1：操作阶段超过规定时限仍未提交，按方案规则触发本题 0 分。'
      },
      {
        id: 'N2-A',
        order: 2,
        code: 'N2-A',
        name: '总体验收结论误判放行',
        conditionType: 'CONCLUSION_WRONG',
        thresholdValue: 1,
        targetRef: 'q-final',
        penaltyAction: 'ZERO_SCORE',
        isEnabled: true,
        alertMessage: 'N2：装置存在重大隐患却未判“不合格、不具备启动条件”，直接触发一票否决（0分）。'
      },
      {
        id: 'N2-B',
        order: 3,
        code: 'N2-B',
        name: '重大缺陷漏判或误判达阈值',
        conditionType: 'MAJOR_MISS_COUNT',
        thresholdValue: 3,
        targetRef: 'IsMajorDefect=1',
        penaltyAction: 'ZERO_SCORE',
        isEnabled: true,
        alertMessage: 'N2：重大缺陷（D1~D6）漏判或误判达到或超过设定阈值（{threshold} 项），触发一票否决（0分）。'
      },
      {
        id: 'N3',
        order: 4,
        code: 'N3',
        name: '未做安全确认进入受限空间（建议项）',
        conditionType: 'QUESTION_WRONG',
        thresholdValue: 1,
        targetRef: 'q-n3',
        penaltyAction: 'ZERO_SCORE',
        isEnabled: true,
        alertMessage: 'N3：未完成气体检测、盲板隔离与监护确认即进入受限空间，触发安全红线否定项（0分）。'
      }
    ],
    checklistItems: [
      { id: 'CHK-01', hotspotId: 'hs-scrubber-top', itemNo: 1, aspectName: '设备本体外观', checkItemName: '塔体与管道防腐层', interactionWay: '环绕巡视、内壁特写查看与测厚核对', standardBasis: '防腐层无起皮、无脱落，测厚不低于设计值的90%', sceneStatus: '碱洗塔喷淋层上方内壁防腐层起皮脱落约0.3m²，露出碳钢基材', standardConclusion: '不合格（重大）', relatedDefectCode: 'D1' },
      { id: 'CHK-02', hotspotId: 'hs-scrubber-bottom', itemNo: 2, aspectName: '设备本体外观', checkItemName: '法兰紧固与垫片', interactionWay: '局部放大核查螺栓数量与垫片老化情况', standardBasis: '法兰螺栓规格齐全无缺失，垫片无老化龟裂、无渗漏', sceneStatus: 'DN500法兰同侧相邻缺失2条M20螺栓（垫片完好、常温无渗漏）', standardConclusion: '不合格（一般）', relatedDefectCode: 'D7' },
      { id: 'CHK-03', hotspotId: 'hs-rto-chamber', itemNo: 3, aspectName: '设备本体外观', checkItemName: '支吊架与基础', interactionWay: '现场巡视平台支架与护栏结构承载力', standardBasis: '支吊架牢固无松脱、基础无沉降、安全护栏完好无变形', sceneStatus: 'RTO二层平台一处护栏中横杆局部变形，不影响整体结构承载', standardConclusion: '不合格（一般）', relatedDefectCode: 'D9' },
      { id: 'CHK-04', hotspotId: 'hs-utilities-plc', itemNo: 4, aspectName: '设备本体外观', checkItemName: '保温、伴热与铭牌标识', interactionWay: '现场目视铭牌与管线色标流向牌', standardBasis: '保温完整无破损，设备铭牌与介质色标、流向牌清晰准确', sceneStatus: '现场设备铭牌与管道介质标识污损、色标不清', standardConclusion: '不合格（一般）', relatedDefectCode: 'D10' },
      { id: 'CHK-05', hotspotId: 'hs-induced-fan', itemNo: 5, aspectName: '润滑冷却系统', checkItemName: '油位与油质', interactionWay: '油标视镜观察与油样取样比对', standardBasis: '油位处于油标上下限之间且油品透明无乳化、无杂质', sceneStatus: '主引风机油位低于下限约8mm且呈乳白色乳化；辅助侧低于上限但在低限上方5mm清亮', standardConclusion: '不合格（重大）', relatedDefectCode: 'D2 / G1' },
      { id: 'CHK-06', hotspotId: 'hs-induced-fan', itemNo: 6, aspectName: '润滑冷却系统', checkItemName: '油泵与油压', interactionWay: '就地油压表与润滑站运行台账核对', standardBasis: '润滑油泵完好备用，供油压力符合设备设计值', sceneStatus: '备用润滑油泵盘车及油路切换正常', standardConclusion: '合格', relatedDefectCode: '' },
      { id: 'CHK-07', hotspotId: 'hs-cooling-water', itemNo: 7, aspectName: '润滑冷却系统', checkItemName: '冷却水流量、压力、温度', interactionWay: '就地压力表、流量计与回水温度对比', standardBasis: '冷却水流量>0，压力正常，回水温度≤50℃（温差≤8℃）', sceneStatus: '主回路压力0.28MPa但流量为0、供水阀关闭；另一分支回水45℃（≤50℃）', standardConclusion: '不合格（重大）', relatedDefectCode: 'D3 / G2' },
      { id: 'CHK-08', hotspotId: 'hs-cooling-water', itemNo: 8, aspectName: '润滑冷却系统', checkItemName: '过滤器压差', interactionWay: '查看冷却水Y型过滤器前后压差表', standardBasis: '过滤器前后压差≤0.05MPa，无堵塞污物', sceneStatus: '冷却水过滤器压差0.02MPa，在允许范围内', standardConclusion: '合格', relatedDefectCode: '' },
      { id: 'CHK-09', hotspotId: 'hs-cooling-water', itemNo: 9, aspectName: '管线阀门', checkItemName: '阀门开关状态与标识', interactionWay: '查看阀门手轮位置、阀位标识与开度指示', standardBasis: '工艺阀门开关状态与启动前工艺要求一致，挂牌清晰', sceneStatus: '冷却水供水手动阀处于全关闭状态', standardConclusion: '不合格（重大）', relatedDefectCode: 'D3' },
      { id: 'CHK-10', hotspotId: 'hs-rto-chamber', itemNo: 10, aspectName: '管线阀门', checkItemName: '盲板抽堵与台账', interactionWay: '现场核查盲板位置并调阅盲板抽堵台账', standardBasis: '工艺盲板抽堵记录齐全可追溯，进入受限空间前可靠盲板隔离', sceneStatus: '系统工艺盲板抽堵台账一致，受限空间隔离条件待逐项确认', standardConclusion: '合格 / 待确认', relatedDefectCode: 'N3' },
      { id: 'CHK-11', hotspotId: 'hs-rto-valves', itemNo: 11, aspectName: '管线阀门', checkItemName: '止回阀与软连接', interactionWay: '检查风机出口软连接与止回阀安装方向', standardBasis: '软连接无龟裂破损，止回阀流向与介质流向一致', sceneStatus: '风机进出口软连接及止回阀安装完好', standardConclusion: '合格', relatedDefectCode: '' },
      { id: 'CHK-12', hotspotId: 'hs-rto-valves', itemNo: 12, aspectName: '管线阀门', checkItemName: '仪表气源压力', interactionWay: '减压阀压力表读数与切换阀就地动作测试', standardBasis: '仪表气源压力0.5～0.7MPa，三室切换阀全行程时间≤3s', sceneStatus: '气源压力仅0.32MPa，切换阀全行程时间延长至9s', standardConclusion: '不合格（重大）', relatedDefectCode: 'D4' },
      { id: 'CHK-13', hotspotId: 'hs-scrubber-bottom', itemNo: 13, aspectName: '监测仪表', checkItemName: '就地压力、温度、流量、液位指示', interactionWay: '就地液位计/压力表与DCS远传示值对比', standardBasis: '就地与远传指示偏差≤1.5%，引压管畅通无假指示', sceneStatus: 'DCS液位显示60%，就地实际仅20%，差压液位计引压管堵塞', standardConclusion: '不合格（重大）', relatedDefectCode: 'D6' },
      { id: 'CHK-14', hotspotId: 'hs-cems-stack', itemNo: 14, aspectName: '监测仪表', checkItemName: 'CEMS采样与分析单元', interactionWay: '查看CEMS分析仪面板漂移值、量程与校验记录', standardBasis: '零点漂移≤±0.5%，标气在有效期内，量程符合环评批复', sceneStatus: '零点漂移+0.9%（超标），标气过期23天；量程与环评批复一致', standardConclusion: '不合格（重大）', relatedDefectCode: 'D5 / G3' },
      { id: 'CHK-15', hotspotId: 'hs-cems-stack', itemNo: 15, aspectName: '监测仪表', checkItemName: '报警值与联锁设定', interactionWay: '核查DCS报警联锁设定值台账', standardBasis: '高高/低低报警值及联锁触发阈值符合设计与工艺规程', sceneStatus: '碱洗塔低低液位联锁阈值设定25%，符合设计值', standardConclusion: '合格', relatedDefectCode: '' },
      { id: 'CHK-16', hotspotId: 'hs-scrubber-top', itemNo: 16, aspectName: '监测仪表', checkItemName: '校验有效期与标签', interactionWay: '放大查看强检压力表、报警仪检定标签日期', standardBasis: '所有强制检定仪表均在检定有效期内且标签完好', sceneStatus: '塔顶压力表PI-101检定标签已过期15天', standardConclusion: '不合格（一般）', relatedDefectCode: 'D8' },
      { id: 'CHK-17', hotspotId: 'hs-scrubber-bottom', itemNo: 17, aspectName: '安全联锁保护', checkItemName: '联锁投用状态', interactionWay: '查阅DCS/SIS安全联锁画面投用状态', standardBasis: '全部安全联锁（含LALL-101）均处于投用状态并动作试验合格', sceneStatus: '碱洗塔LALL-101低低液位联锁处于旁路状态', standardConclusion: '不合格（重大）', relatedDefectCode: 'D6' },
      { id: 'CHK-18', hotspotId: 'hs-scrubber-bottom', itemNo: 18, aspectName: '安全联锁保护', checkItemName: '旁路审批与挂牌', interactionWay: '核对旁路管理台账与现场挂牌情况', standardBasis: '任何联锁旁路必须有书面审批单与现场明显挂牌', sceneStatus: 'LALL-101联锁旁路无现场挂牌，旁路审批单缺失', standardConclusion: '不合格（重大）', relatedDefectCode: 'D6' },
      { id: 'CHK-19', hotspotId: 'hs-cems-stack', itemNo: 19, aspectName: '安全联锁保护', checkItemName: '可燃、有毒气体报警', interactionWay: '现场查看可燃气体报警控制器状态灯', standardBasis: '气体报警仪处于正常监测运行态，无屏蔽或离线', sceneStatus: '可燃气体报警仪处于“CAL标定”状态，检测元件未投用', standardConclusion: '不合格（重大）', relatedDefectCode: 'D5' },
      { id: 'CHK-20', hotspotId: 'hs-rto-chamber', itemNo: 20, aspectName: '安全联锁保护', checkItemName: '消防设施与紧急停车', interactionWay: '检查现场灭火器压力表、洗眼器及ESD按钮', standardBasis: '灭火器压力处于绿区，紧急停车按钮（ESD）功能完好、无遮挡', sceneStatus: '现场灭火器与ESD急停按钮完好有效（入塔作业须履行受限空间审批）', standardConclusion: '合格', relatedDefectCode: '' },
      { id: 'CHK-21', hotspotId: 'hs-utilities-plc', itemNo: 21, aspectName: '公用工程配套', checkItemName: '压缩空气', interactionWay: '查看压缩空气储罐就地压力表与公用工程画面', standardBasis: '压缩空气总管压力处于 0.6～0.8 MPa 区间，干燥无积水', sceneStatus: '压缩空气总管实测 0.68 MPa，符合要求', standardConclusion: '合格', relatedDefectCode: '' },
      { id: 'CHK-22', hotspotId: 'hs-utilities-plc', itemNo: 22, aspectName: '公用工程配套', checkItemName: '氮气与蒸汽', interactionWay: '查看氮气密封总管压力表与吹扫管线', standardBasis: '氮气总管压力处于 0.4～0.6 MPa 区间，满足吹扫及密封需求', sceneStatus: '氮气密封总管实测 0.50 MPa，符合要求', standardConclusion: '合格', relatedDefectCode: '' },
      { id: 'CHK-23', hotspotId: 'hs-utilities-plc', itemNo: 23, aspectName: '公用工程配套', checkItemName: '循环水', interactionWay: '核查公用工程循环水站总供水压差与备用泵状态', standardBasis: '循环水母管压力与水质达标，具备向各支路供水能力', sceneStatus: '循环水总站母管备压正常（注意需开启装置区支路供水阀）', standardConclusion: '合格（总站）', relatedDefectCode: '' },
      { id: 'CHK-24', hotspotId: 'hs-utilities-plc', itemNo: 24, aspectName: '公用工程配套', checkItemName: '双回路供电', interactionWay: '检查低压配电柜I段/II段进线指示灯与备自投状态', standardBasis: 'I段主电源与II段备用电源均带电，备自投处于就绪状态', sceneStatus: '双回路供电I段、II段均显示绿灯带电，备自投就绪', standardConclusion: '合格', relatedDefectCode: '' }
    ],
    scenarioDocs: [
      { id: 'DOC-TZ-01', docCategory: '工况台账', sortOrder: 1, docCode: 'DOC-JX-2026-11', docTitle: '1. 本次大修检修记录（碱洗＋三室RTO）', deptOrCategory: '设备检修部', relatedHotspotCode: 'A-101A / B-101 / V-101', contentSummary: '本次大修包含碱洗塔喷淋层检修（注：内壁防腐修补项显示“未完成终验”）、主引风机轴承解体回装、RTO蓄热体清灰及气动切换阀调校。检修单位尚未提交塔内防腐测厚合格复验单与切换阀9s迟滞消缺记录。' },
      { id: 'DOC-TZ-02', docCategory: '工况台账', sortOrder: 2, docCode: 'DOC-TZ-2026-01', docTitle: '2. 废气治理联合装置设备与工艺设计台账', deptOrCategory: '工艺技术科', relatedHotspotCode: 'W-101 / V-101 / U-101', contentSummary: '核心设计指标：① 引风机轴承箱油位须处于上下限之间且无乳化；② 循环冷却水流量>0、回水温度设计上限≤50℃；③ RTO切换阀仪表气源0.5～0.7MPa、全行程≤3.0s；④ 公用工程压缩空气0.6～0.8MPa、氮气0.4～0.6MPa；⑤ 碱洗塔低低液位联锁LALL-101设定值25%。' },
      { id: 'DOC-TZ-03', docCategory: '工况台账', sortOrder: 3, docCode: 'DOC-YS-2025-11', docTitle: '3. 上次启动前设备验收报告及问题闭环清单', deptOrCategory: '安全环保部', relatedHotspotCode: 'A-101B / R-101', contentSummary: '上次检修曾提出“碱洗塔差压液位计引压管易结晶堵塞”、“联锁旁路必须严格履行书面审批与现场挂牌”两项重点整改要求。本次验收需重点核查LALL-101旁路状态与就地/DCS液位一致性。' },
      { id: 'DOC-TZ-04', docCategory: '工况台账', sortOrder: 4, docCode: 'DOC-CEMS-2026-10', docTitle: '4. CEMS与气体报警仪校验记录台账', deptOrCategory: '仪表运维班', relatedHotspotCode: 'M-101 / A-101A', contentSummary: '① CEMS校验规定零点漂移允许±0.5% F.S.，量程按项目环评批复设定（区别于出厂铭牌最大量程），当前校准用标准气体有效期记录已超期23天；② 塔顶压力表PI-101有效期至2026-11-04（已超期15天）；③ 入口可燃气体报警仪在检修时切至CAL标定态。' },
      { id: 'STD-01', docCategory: '引用标准', sortOrder: 1, docCode: '职业技能-2019', docTitle: '《工业废气治理工国家职业技能标准（2019年版）》（6-28-02-05）', deptOrCategory: '职业技能', relatedHotspotCode: 'ALL', contentSummary: '考核点1.1.1（50分/30分钟）、分值权重及安全否定项设置的根本依据。' },
      { id: 'STD-02', docCategory: '引用标准', sortOrder: 2, docCode: '技能规程-2018', docTitle: '《国家职业技能标准编制技术规程（2018年版）》', deptOrCategory: '职业技能', relatedHotspotCode: 'ALL', contentSummary: '技能要求拆解与操作/知识权重结构的理解口径。' },
      { id: 'STD-03', docCategory: '引用标准', sortOrder: 3, docCode: '认定规程', docTitle: '《职业技能等级认定工作规程（试行）》', deptOrCategory: '职业技能', relatedHotspotCode: 'ALL', contentSummary: '考务组织、监考屏蔽规则、成绩认定与档案留痕管理。' },
      { id: 'STD-04', docCategory: '引用标准', sortOrder: 4, docCode: 'GB 37822-2019', docTitle: '《挥发性有机物无组织排放控制标准》', deptOrCategory: '大气环境', relatedHotspotCode: 'A-101B / V-101', contentSummary: '法兰密封、切换阀短窜与VOCs泄漏逸散类缺陷判定背景。' },
      { id: 'STD-05', docCategory: '引用标准', sortOrder: 5, docCode: 'GB 16297-1996', docTitle: '《大气污染物综合排放标准》', deptOrCategory: '大气环境', relatedHotspotCode: 'M-101', contentSummary: '污染物排放限值与超标风险判定依据。' },
      { id: 'STD-06', docCategory: '引用标准', sortOrder: 6, docCode: 'HJ 2000-2018', docTitle: '《大气污染治理工程技术导则》', deptOrCategory: '大气环境', relatedHotspotCode: 'A-101A', contentSummary: '碱洗塔、RTO治理设施设计防腐与验收技术要求。' },
      { id: 'STD-07', docCategory: '引用标准', sortOrder: 7, docCode: 'HJ 75-2017', docTitle: '《固定污染源烟气排放连续监测技术规范》', deptOrCategory: '监测', relatedHotspotCode: 'M-101', contentSummary: 'CEMS安装位置、量程设置与日常运行验收要求。' },
      { id: 'STD-08', docCategory: '引用标准', sortOrder: 8, docCode: 'HJ 76-2017', docTitle: '《固定污染源烟气排放连续监测系统技术要求及检测方法》', deptOrCategory: '监测', relatedHotspotCode: 'M-101', contentSummary: 'CEMS零点漂移（±0.5%）、标气有效期与校验周期判定。' },
      { id: 'STD-09', docCategory: '引用标准', sortOrder: 9, docCode: 'GB 30871-2022', docTitle: '《危险化学品企业特殊作业安全规范》', deptOrCategory: '安全', relatedHotspotCode: 'R-101 / A-101B', contentSummary: '进入塔内/炉内受限空间作业气体分析、盲板抽堵隔离与监护要求（N3）。' },
      { id: 'STD-10', docCategory: '引用标准', sortOrder: 10, docCode: 'GB 50160-2008', docTitle: '《石油化工企业设计防火标准》（2018年版）', deptOrCategory: '安全', relatedHotspotCode: 'R-101', contentSummary: '装置防火间距与现场消防设施配置核查要求。' },
      { id: 'STD-11', docCategory: '引用标准', sortOrder: 11, docCode: 'GB 50058-2014', docTitle: '《爆炸危险环境电力装置设计规范》', deptOrCategory: '安全', relatedHotspotCode: 'M-101 / U-101', contentSummary: '防爆电气与入口可燃气体报警仪投用选型规范。' },
      { id: 'STD-12', docCategory: '引用标准', sortOrder: 12, docCode: 'GB/T 29639-2020', docTitle: '《生产经营单位生产安全事故应急预案编制导则》', deptOrCategory: '应急', relatedHotspotCode: 'R-101', contentSummary: '受限空间中毒窒息与超温联锁停车的应急处置流程。' },
      { id: 'STD-13', docCategory: '引用标准', sortOrder: 13, docCode: 'GB/T 22239-2019', docTitle: '《信息安全技术 网络安全等级保护基本要求》', deptOrCategory: '信息化', relatedHotspotCode: 'ALL', contentSummary: '仿真考试系统信息安全、日志留存与等保二级要求。' },
      { id: 'STD-14', docCategory: '引用标准', sortOrder: 14, docCode: 'GB/T 25000.51-2016', docTitle: '《系统与软件工程 SQuaRE 第51部分》', deptOrCategory: '信息化', relatedHotspotCode: 'ALL', contentSummary: '软件产品质量评价与系统验收测试细则。' }
    ],
    users: [
      { id: 'USR-EX-001', userCode: 'ZK202611001', fullName: '张建国', roleType: '考生', password: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', department: '涂装一车间RTO运行班', skillLevel: '二级/技师', specialty: '工业废气治理', certificateNo: '', batchNo: '2026-11-第一批', phone: '13800138001', status: '正常' },
      { id: 'USR-EX-002', userCode: 'ZK202611002', fullName: '李梅', roleType: '考生', password: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', department: '精细化工环保运维班', skillLevel: '二级/技师', specialty: '工业废气治理', certificateNo: '', batchNo: '2026-11-第一批', phone: '13800138002', status: '正常' },
      { id: 'USR-EX-003', userCode: 'ZK202611003', fullName: '王浩然', roleType: '考生', password: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', department: '包装印刷VOCs治理站', skillLevel: '二级/技师', specialty: '工业废气治理', certificateNo: '', batchNo: '2026-11-第一批', phone: '13800138003', status: '正常' },
      { id: 'USR-TC-001', userCode: 'TC-GY-01', fullName: '陈明远', roleType: '命题教师', password: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', department: '环保工艺教研室', skillLevel: '高级工程师', specialty: '废气工艺与RTO热工', certificateNo: 'MT-2024-018', batchNo: '命题组', phone: '13900139001', status: '正常' },
      { id: 'USR-TC-002', userCode: 'TC-AQ-02', fullName: '周志强', roleType: '命题教师', password: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', department: '安全仪表教研室', skillLevel: '注册安全工程师', specialty: '安全联锁与特殊作业', certificateNo: 'MT-2024-025', batchNo: '命题组', phone: '13900139002', status: '正常' },
      { id: 'USR-REV-001', userCode: 'EX-SH-01', fullName: '刘教授', roleType: '审题专家', password: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', department: '省职业技能鉴定专家库', skillLevel: '正高级工程师', specialty: '标准符合性与现场审题', certificateNo: 'ZJ-2023-102', batchNo: '审题组', phone: '13700137001', status: '正常' },
      { id: 'USR-EV-001', userCode: 'KP-2025-08', fullName: '赵丽华', roleType: '考评员', password: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', department: '市环境监测站/考评中心', skillLevel: '一级考评员', specialty: '答辩评分与Kappa标定', certificateNo: 'KP-2025-0088', batchNo: '考评组', phone: '13600136001', status: '正常' },
      { id: 'USR-JK-001', userCode: 'JK-01', fullName: '孙伟', roleType: '监考员', password: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', department: '技能鉴定考点考务科', skillLevel: '考务专员', specialty: '机房考务与异常处置', certificateNo: 'JK-2025-011', batchNo: '监考组', phone: '13500135001', status: '正常' }
    ],
    changeLogs: [
      { id: 'LOG-INIT-001', examId: 'WMPSES-1.1.1-V1', userId: 'USR-TC-001', operatorName: '陈明远 (命题教师)', actionType: '初始化入库', versionAfter: '1.0.0', hotspotCount: 8, questionCount: 15, totalScore: 50, changeSummary: '初始化 V1 基准卷（碱洗预处理＋三室RTO）：录入 8 个核心设备热点、15 道题（50分）、D1~D10 缺陷与 G1~G3 干扰项。', changedAt: '2026-11-19 10:00:00' },
      { id: 'LOG-INIT-002', examId: 'WMPSES-1.1.1-V1', userId: 'USR-REV-001', operatorName: '刘教授 (审题专家)', actionType: '三审签审通过', versionAfter: '1.0.0', hotspotCount: 8, questionCount: 15, totalScore: 50, changeSummary: '完成 24 项确认单、4 份工况台账、N1/N2/N3 否定项规则表与 ExamPicture 装置底图核验入库。', changedAt: '2026-11-19 14:30:00' }
    ],
    widgetTemplates: [
      {
        id: 'TPL-01', code: 'scrubber_top', name: '碱洗塔上部（防腐脱落 + 压力表过期标签）', isBuiltin: true, sortOrder: 1,
        leftPanelType: 'cert_nameplate', leftPanelTitle: '现场外观特写 · 喷淋层上方塔壁', leftPanelCode: 'T-101-W01',
        rightPanelType: 'gauge_dial', rightPanelTitle: '塔顶仪表与检定标签放大', rightPanelCode: 'PI-101',
        paramSchema: [
          { key: 'peelArea', label: '防腐层脱落面积', type: 'number', min: 0, max: 2.0, step: 0.1, unit: 'm²', default: 0.3 },
          { key: 'topPressure', label: '塔顶压力 PI-101', type: 'number', min: 0, max: 0.8, step: 0.01, unit: 'MPa', default: 0.15 },
          { key: 'expiredDays', label: '检定超期天数(负数为剩余)', type: 'number', min: -180, max: 180, step: 1, unit: '天', default: 15 }
        ]
      },
      {
        id: 'TPL-02', code: 'scrubber_bottom', name: '碱洗塔下部（液位联锁旁路/假液位 + 缺螺栓）', isBuiltin: true, sortOrder: 2,
        leftPanelType: 'sight_glass', leftPanelTitle: '联锁与液位仪表对比（DCS vs 就地）', leftPanelCode: 'LT-101 / SIS',
        rightPanelType: 'flange_bolts', rightPanelTitle: '塔底循环出口法兰局部放大', rightPanelCode: 'FL-102 (DN500)',
        paramSchema: [
          { key: 'dcsLevel', label: 'DCS 远传液位 LT-101', type: 'number', min: 0, max: 100, step: 1, unit: '%', default: 60 },
          { key: 'localLevel', label: '就地液位计实测', type: 'number', min: 0, max: 100, step: 1, unit: '%', default: 20 },
          { key: 'interlockStatus', label: 'LALL-101 联锁状态', type: 'select', options: ['旁路 (BYPASS)', '正常投用 (NORMAL)'], default: '旁路 (BYPASS)' },
          { key: 'missingBolts', label: 'FL-102 缺失螺栓数', type: 'number', min: 0, max: 4, step: 1, unit: '条', default: 2 }
        ]
      },
      {
        id: 'TPL-03', code: 'induced_fan', name: '引风机（油位低乳化 vs 正常油位对比视镜）', isBuiltin: true, sortOrder: 3,
        leftPanelType: 'sight_glass', leftPanelTitle: '情况 B · 主引风机轴承箱油标视镜', leftPanelCode: 'LG-201A',
        rightPanelType: 'sight_glass', rightPanelTitle: '情况 A · 备用/辅助侧轴承油标对照', rightPanelCode: 'LG-201B',
        paramSchema: [
          { key: 'mainOilOffset', label: '主轴承箱油位偏差(相对MIN)', type: 'number', min: -25, max: 30, step: 1, unit: 'mm', default: -8 },
          { key: 'mainOilQuality', label: '主轴承箱油品状态', type: 'select', options: ['乳白色浑浊乳化', '金黄清亮无杂质'], default: '乳白色浑浊乳化' },
          { key: 'auxOilOffset', label: '辅助侧油位偏差(相对MIN)', type: 'number', min: -20, max: 30, step: 1, unit: 'mm', default: 5 }
        ]
      },
      {
        id: 'TPL-04', code: 'cooling_water', name: '循环冷却水（0.28MPa但流量0 + 回水45℃）', isBuiltin: true, sortOrder: 4,
        leftPanelType: 'pipe_valve_flow', leftPanelTitle: '冷却水总管压力、流量与阀门状态', leftPanelCode: 'PI-301 / FI-301',
        rightPanelType: 'dcs_interlock', rightPanelTitle: '冷却水回水温度与运行趋势', rightPanelCode: 'TI-302 / DCS',
        paramSchema: [
          { key: 'pressure', label: '主管压力 PI-301', type: 'number', min: 0, max: 1.5, step: 0.01, unit: 'MPa', default: 0.28 },
          { key: 'valveStatus', label: '供水手动阀状态', type: 'select', options: ['关闭', '开启'], default: '关闭' },
          { key: 'flow', label: '电磁流量计 FI-301', type: 'number', min: 0, max: 120, step: 1, unit: 'm³/h', default: 0 },
          { key: 'returnTemp', label: '回水温度实测 TI-302', type: 'number', min: 15, max: 80, step: 0.5, unit: '℃', default: 45.0 },
          { key: 'maxTemp', label: '设计允许上限温度', type: 'number', min: 30, max: 70, step: 1, unit: '℃', default: 50 }
        ]
      },
      {
        id: 'TPL-05', code: 'rto_chamber', name: 'RTO本体（平台护栏变形 + 受限空间警示）', isBuiltin: true, sortOrder: 5,
        leftPanelType: 'dcs_interlock', leftPanelTitle: '三室 RTO 蓄热床与平台护栏现状', leftPanelCode: 'R-101 / PL-2F',
        rightPanelType: 'dcs_interlock', rightPanelTitle: '炉膛/塔内受限空间人孔检查点', rightPanelCode: 'MH-101 (安全红线)',
        paramSchema: [
          { key: 'chamberTemp', label: 'RTO 蓄热室温度', type: 'number', min: 15, max: 200, step: 1, unit: '℃', default: 28 },
          { key: 'railBendCm', label: '护栏横杆弯曲变形量', type: 'number', min: 0, max: 15, step: 0.5, unit: 'cm', default: 4 },
          { key: 'manholeStatus', label: '人孔受限空间状态', type: 'select', options: ['已打开 (待入内检查)', '已气体检测与盲板隔离', '已封闭复位'], default: '已打开 (待入内检查)' }
        ]
      },
      {
        id: 'TPL-06', code: 'rto_valves', name: 'RTO切换阀组（气源0.32MPa + 动作9s迟滞）', isBuiltin: true, sortOrder: 6,
        leftPanelType: 'gauge_dial', leftPanelTitle: '切换阀仪表气源减压站', leftPanelCode: 'PI-401 (IA)',
        rightPanelType: 'dcs_interlock', rightPanelTitle: '提升切换阀就地动作测试', rightPanelCode: 'XV-401A/B/C',
        paramSchema: [
          { key: 'airPressure', label: '仪表气源压力 PI-401', type: 'number', min: 0, max: 1.0, step: 0.01, unit: 'MPa', default: 0.32 },
          { key: 'switchTime', label: '切换阀全行程动作时间', type: 'number', min: 1.0, max: 15.0, step: 0.5, unit: 's', default: 9.0 },
          { key: 'stdSwitchTime', label: '标准动作时间上限', type: 'number', min: 1.0, max: 6.0, step: 0.5, unit: 's', default: 3.0 }
        ]
      },
      {
        id: 'TPL-07', code: 'cems_stack', name: '烟囱与CEMS（报警仪标定态 + 零漂0.9%超期23天）', isBuiltin: true, sortOrder: 7,
        leftPanelType: 'gas_cems_alarm', leftPanelTitle: '可燃气体报警控制器就地面板', leftPanelCode: 'GD-501',
        rightPanelType: 'gas_cems_alarm', rightPanelTitle: 'CEMS 烟气在线监测单元面板', rightPanelCode: 'AT-502 (HJ 76)',
        paramSchema: [
          { key: 'gasAlarmMode', label: '可燃气体报警仪模式', type: 'select', options: ['CAL (标定维护/未投用)', 'RUN (正常在线监测)'], default: 'CAL (标定维护/未投用)' },
          { key: 'zeroDrift', label: 'CEMS 零点漂移', type: 'number', min: -2.0, max: 2.0, step: 0.1, unit: '% F.S.', default: 0.9 },
          { key: 'stdGasExpiredDays', label: '标气超期天数(负数有效)', type: 'number', min: -180, max: 90, step: 1, unit: '天', default: 23 }
        ]
      },
      {
        id: 'TPL-08', code: 'utilities_plc', name: '公用工程与PLC（气电正常 + 铭牌污损 + 总结论）', isBuiltin: true, sortOrder: 8,
        leftPanelType: 'dcs_interlock', leftPanelTitle: '公用工程与双回路配电柜监控', leftPanelCode: 'UT-601 / MCC',
        rightPanelType: 'cert_nameplate', rightPanelTitle: '现场设备铭牌与管道介质标识特写', rightPanelCode: 'TAG-602',
        paramSchema: [
          { key: 'airMainPressure', label: '压缩空气总管压力', type: 'number', min: 0, max: 1.0, step: 0.01, unit: 'MPa', default: 0.68 },
          { key: 'n2Pressure', label: '氮气密封总管压力', type: 'number', min: 0, max: 1.0, step: 0.01, unit: 'MPa', default: 0.50 },
          { key: 'powerStatus', label: '双回路供电状态', type: 'select', options: ['I/II段均带电·备自投正常', '仅单段带电·备自投告警'], default: 'I/II段均带电·备自投正常' },
          { key: 'nameplateStatus', label: '铭牌与介质色标', type: 'select', options: ['铭牌污损·介质色标不清', '铭牌齐全·介质色标清晰'], default: '铭牌污损·介质色标不清' }
        ]
      },
      {
        id: 'TPL-09', code: 'generic', name: '通用可调双仪表卡（自定义新增热点专用）', isBuiltin: true, sortOrder: 9,
        leftPanelType: 'gauge_dial', leftPanelTitle: '左表盘参数实时监控', leftPanelCode: 'PI-001',
        rightPanelType: 'dcs_interlock', rightPanelTitle: '右看板运行参数监控', rightPanelCode: 'DCS-001',
        paramSchema: [
          { key: 'param1Label', label: '左表盘参数名称', type: 'text', default: '系统压力 PI' },
          { key: 'param1Value', label: '左表盘读数', type: 'number', min: 0, max: 1.6, step: 0.01, unit: '', default: 0.45 },
          { key: 'param1Unit', label: '左表盘单位', type: 'text', default: 'MPa' },
          { key: 'param2Label', label: '右看板参数名称', type: 'text', default: '运行温度 TI' },
          { key: 'param2Value', label: '右看板数值', type: 'number', min: 0, max: 200, step: 1, unit: '', default: 38 },
          { key: 'param2Unit', label: '右看板单位', type: 'text', default: '℃' },
          { key: 'deviceStatus', label: '现场运行状态', type: 'select', options: ['异常告警', '待检停机', '正常投用'], default: '待检停机' }
        ]
      }
    ]
  };
})(window);
