# FileMaker 关系型题库数据库与脚本集成说明

为支持在 FileMaker Pro / Server 中建立真正的关系型题库与考务数据库，本目录提供 **5 表关系模型设计手册**、**一键建表 CSV 种子数据** 及 **4 个标准 FileMaker 脚本 XML（`<fmxmlsnippet type="FMObjectList">` 格式）**。

---

## 一、目录文件清单

| 文件 / 子目录 | 用途说明 |
| :--- | :--- |
| [FileMaker题库数据库表结构设计手册.md](file:///Users/mac/projects/WMPSES/filemaker_script/FileMaker%E9%A2%98%E5%BA%93%E6%95%B0%E6%8D%AE%E5%BA%93%E8%A1%A8%E7%BB%93%E6%9E%84%E8%AE%BE%E8%AE%A1%E6%89%8B%E5%86%8C.md) | **必读核心文档**：包含 5 张关系表的字段规范、ER 关系图、JSON 实时聚合计算公式（`While` + `JSONSetElement`）与布局搭建指南 |
| `seed_data/1_WMPSES_试卷场景.csv` | 试卷与装置场景初始数据（含 V1 基准卷及 V2/V3 变式预留，可直接导入 FileMaker 新建表） |
| `seed_data/2_WMPSES_设备热点.csv` | 8 个设备部位热点坐标、位号与可视化卡片配置初始数据 |
| `seed_data/3_WMPSES_习题库.csv` | 15 道实操习题（共 50 分，覆盖 D1~D10、G1~G3、N3、总结论）初始数据 |
| `加载仿真题库到WebViewer.xml` | 优先读取 `c_FullBankJSON` 或循环查询 `WMPSES_设备热点`/`WMPSES_习题库` 组装 JSON 注入 `wv_exam` |
| `初始化导入题库JSON到FileMaker关系表.xml` | 将完整题库 JSON 自动拆分 Upsert 写入 3 张关系型题库表 |
| `保存题库热点配置.xml` | 接收前端“编辑/标点模式”拖拽修改后的题库，同步更新至 FileMaker 关系表 |
| `接收仿真考试交卷成绩.xml` | 交卷时写入 `WMPSES_考试记录` 主表，并循环遍历 `details` 写入 `WMPSES_作答明细` 子表 |

---

## 二、快速落地步骤（3 步在 FileMaker 建成后台数据库）

### 第 1 步：用 CSV 一键创建并填充三张题库核心表
1. 新建或打开您的 FileMaker 文件（如 `WMPSES_Exam.fmp12`）。
2. 依次点击菜单 `文件 -> 导入记录 -> 文件...`：
   - 导入 `seed_data/1_WMPSES_试卷场景.csv` → 目标选 **新建表（`WMPSES_试卷场景`）**；
   - 导入 `seed_data/2_WMPSES_设备热点.csv` → 目标选 **新建表（`WMPSES_设备热点`）**；
   - 导入 `seed_data/3_WMPSES_习题库.csv` → 目标选 **新建表（`WMPSES_习题库`）**；
   - （导入时勾选 **“不要导入第一条记录（使用作字段名称）”**，UTF-8 BOM 已确保中文零乱码）。
3. 参照《[表结构设计手册](file:///Users/mac/projects/WMPSES/filemaker_script/FileMaker%E9%A2%98%E5%BA%93%E6%95%B0%E6%8D%AE%E5%BA%93%E8%A1%A8%E7%BB%93%E6%9E%84%E8%AE%BE%E8%AE%A1%E6%89%8B%E5%86%8C.md)》补充创建 `WMPSES_考试记录` 与 `WMPSES_作答明细` 两张成绩表，并在“管理数据库 -> 关系”中按主键/外键连线。

### 第 2 步：导入本目录下的 4 个标准 XML 脚本
1. 在 FileMaker 脚本工作区，按顺序导入或借助剪切板工具粘贴以下脚本（注意先建好 `初始化导入题库JSON到FileMaker关系表`，再粘贴调用它的 `保存题库热点配置`）：
   1. `初始化导入题库JSON到FileMaker关系表.xml`
   2. `加载仿真题库到WebViewer.xml`
   3. `保存题库热点配置.xml`
   4. `接收仿真考试交卷成绩.xml`

### 第 3 步：配置 WebViewer 布局
1. 在 `WMPSES_试卷场景` 布局上放置 Web 查看器，将**对象名称（Object Name）**设为 `wv_exam`。
2. 勾选 **“允许 JavaScript 执行 FileMaker 脚本”**。
3. 为布局设置 `OnRecordLoad` 脚本触发器运行 `加载仿真题库到WebViewer`（或在页面按钮触发），即可实现切换试卷记录自动换卷、交卷自动落入成绩主从表、编辑模式拖拽实时回写关系表！
