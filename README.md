# WMPSES - 工业废气治理工实操模拟仿真考试系统（1.1.1 设备验收）

基于《工业废气治理工国家职业技能标准（2019年版）》（6-28-02-05）二级/技师 **“1.1.1 系统启动前设备验收”** 开发的 2D 热点交互式实操模拟仿真考试系统，配套项目甘特图看板及 **FileMaker 5表关系型题库与考务脚本**。

---

## 一、核心功能特性

1. **2D 全景装置热点交互**：
   - 以“碱洗预处理＋三室蓄热式焚烧（RTO）联合装置”全景图为操作舞台，设置 **8 个核心设备部位热点**，共 **15 道仿真习题（满分 50 分）**。
   - 完整覆盖基准场景的 **6 项重大缺陷（D1~D6）、4 项一般缺陷（D7~D10）、3 项干扰项（G1~G3）**、受限空间安全红线（N3）及总体验收放行判定（N2）。
2. **SVG 现场工况可视化**：
   - 每个设备热点弹窗顶部均配有高保真工业 SVG 工况特写卡（压力表 0.28MPa 与 0 流量计对照、乳化油标 vs 正常油标视镜、LALL-101 联锁旁路与假液位、CEMS 漂移与过期标签、切换阀 0.32MPa 气源与 9s 迟滞等）。
3. **三态工作模式**：
   - **🎯 练习演示模式**：单题即答即评，展示标准依据与解析。
   - **📝 正式考试模式**：30 分钟倒计时、超时规则 N1 提醒、交卷生成成绩单报告与 N2 否定项核验、支持错题筛选与导出 JSON。
   - **🛠️ 教师编辑/标点模式**：支持直接在图上拖拽调整热点坐标、点击图面新增热点、增删改习题并同步至本地或 FileMaker。
4. **FileMaker 关系型题库与三合一数据适配**：
   - 内置 `FMDataAdapter` 与 `window.FMExam` 桥接接口，支持 **FileMaker WebViewer 双向脚本调用**、**FileMaker Data API / REST** 及 **纯离线本地运行**。
   - 提供完整的 5 表关系模型设计手册、CSV 种子数据（可直接导入 FileMaker 新建表）及 4 个标准 `<fmxmlsnippet type="FMObjectList">` XML 脚本。
5. **项目任务清单与交互式甘特图**：
   - 内置 `gantt-roadmap.html` 看板，支持“11周单题试点 (220人天)”与“12个月全套13题推广”视图切换、完成度勾选与 CSV 导出。

---

## 二、快速启动

- **纯离线直接运行**：在文件管理器中直接双击打开 `index.html` 即可全屏使用（无需安装 Node、数据库或后端服务）。
- **查看甘特图与 WBS 清单**：点击页面右上角 **「📅 任务清单与甘特图」** 或直接双击 `gantt-roadmap.html`。

---

## 三、目录结构

```text
WMPSES/
├── index.html                                      # 主考试系统入口（双击即用）
├── gantt-roadmap.html                              # 交互式全周期甘特图与任务跟踪看板
├── assets/
│   └── plant-panorama.jpg                          # 碱洗预处理+三室RTO联合装置全景图
├── css/
│   └── styles.css                                  # 工业深蓝仿真 UI 样式表
├── js/
│   ├── plant-image-data.js                         # 内置 Base64 底图模块（防断图）
│   ├── question-bank.js                            # 默认题库配置（8热点 / 15题 / 50分）
│   ├── visual-widgets.js                           # 8大现场工况 SVG 可视化组件
│   ├── fm-adapter.js                               # FileMaker WebViewer / Data API / 本地适配层
│   └── app.js                                      # 核心交互、计时、评分与编辑器逻辑
├── filemaker_script/
│   ├── README.md                                   # FileMaker 3步落地指南
│   ├── FileMaker题库数据库表结构设计手册.md          # 5表关系架构、ER图与JSON聚合公式
│   ├── seed_data/                                  # UTF-8 BOM 一键建表 CSV 种子数据
│   │   ├── 1_WMPSES_试卷场景.csv
│   │   ├── 2_WMPSES_设备热点.csv
│   │   └── 3_WMPSES_习题库.csv
│   ├── 加载仿真题库到WebViewer.xml                   # 标准 FileMaker 脚本 XML
│   ├── 初始化导入题库JSON到FileMaker关系表.xml         # 标准 FileMaker 脚本 XML
│   ├── 保存题库热点配置.xml                          # 标准 FileMaker 脚本 XML
│   └── 接收仿真考试交卷成绩.xml                      # 标准 FileMaker 脚本 XML
├── 启动前设备验收仿真考试系统_任务清单与甘特图.md      # Markdown 全周期 WBS 与排期文档
├── 启动前设备验收仿真考试系统介绍 (1).pdf              # 系统介绍演示文稿
├── 废气治理工技师实操仿真考试系统设计方案（设备验收1.1.1）.docx
└── 碱洗预处理与三室RTO联合装置OTS培训与操作优化方案.docx
```
