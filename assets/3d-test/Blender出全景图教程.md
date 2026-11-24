# 怎么做出"你截图那种 3D 图"？—— 软件选择 + Blender 实操

## 0. 先说清楚：你截图里的那张，不是"图片"

你发的截图是系统 **运行时用 canvas 实时画出来的**三维场景：

- 几何体：`js/scene-3d.js` 里的 `buildPlantGeometry()`（盒子、圆柱、锥体）
- 着色：扁平光照 + 深色背景 + 青色发光描边
- 编号 1~8 的圆圈：热点图层（HTML 元素，不是画上去的）
- 名字标签："碱洗塔上部与塔顶平台 0/2" 之类：同样是 3D 投影出来的 HTML

所以它"干净、对位、能点"，因为它**本来就是活的**，不是一张图。
你上传的照片风格底图（我给的 A/B）只是背景，气质不一样，厂区杂物一多就显得乱。

**结论**：如果你更喜欢这种风格，最省事的做法是 **不上传任何底图**，
点「✕ 清除 3D 底图」就回到这套实时孪生场景了。

---

## 1. 那如果我就是想自己"做图"，用什么软件？

看你想要哪种"图"：

| 目标 | 推荐软件 | 价格 | 上手难度 | 能出 2:1 全景吗 |
|---|---|---|---|---|
| **照片级/写实**厂区渲染，自由摆机位 | **Blender** | 免费开源 | 中等 | ✅ 相机切 Panoramic → Equirectangular |
| 快速出厂房/装置效果图 | SketchUp + Enscape | 付费 | 容易 | ✅ Enscape 一键 360 全景 |
| 实时可视化、漫游动画 | Twinmotion | 个人版免费 | 容易 | ✅ 支持全景导出 |
| 工业级效果图（甲方级） | 3ds Max + V-Ray / Corona | 付费 | 难 | ✅（全景相机/插件） |
| 影视级质感 | Cinema 4D + Redshift | 付费 | 中等 | ✅ |
| 可交互漫游 + 截图 | Unreal Engine 5 | 免费 | 难 | ✅（全景截图） |
| **真实厂区** | Insta360 等全景相机 | 2~4 千元 | 极容易 | ✅ 直出 2:1 等距柱状 |

**推荐路线：Blender（免费）。** 它一个软件就覆盖建模、材质、灯光、渲染、全景导出，
而且我已经把你系统的场景导出成 `.glb`，导入就能改，不用从零建模。

---

## 2. Blender 实操：从 GLB 到 4096×2048 全景图

### 2.1 安装

官网 <https://www.blender.org/download/> 下载安装（免费，Mac/Win 都有）。
中文界面：`Edit > Preferences > Interface > Translation` 选「简体中文」。

### 2.2 导入场景

`文件 > 导入 > glTF 2.0 (.glb/.gltf)` → 选
`assets/3d-test/WMPSES装置_可编辑.glb`

导入后你会看到：碱洗塔、引风机、三室 RTO、排气筒、罐区、厂房、树木、地面，
还有两台相机（`CAM_总览`、`CAM_第一人称`）。

> 坐标已经做好转换：Blender 里的 `X=东、Y=北、Z=上`，和系统里的 `pos3d` 完全一致。
> 所以系统热点坐标 `(-11.5, -2.15, 8.8)` 在 Blender 里就是同一个点，可以直接对齐。

### 2.3 加灯光（不然一片死白）

`Shift+A > 灯光 > 日光`，旋转到西南方向（模拟下午的太阳），强度 3~5。
再补一盏面光/环境光，或用 `世界环境` 给一点天光。

### 2.4 设置全景相机（关键一步）

选中相机 → 右侧 `物体数据属性`（绿色相机图标）：

1. `镜头 > 类型`：改成 **全景（Panoramic）**
2. `全景类型`：**等距柱状（Equirectangular）**
3. 相机位置：想模拟第一人称就放 `(1.5, -17.5, 1.75)`；
   想模拟系统默认总览就放 `(-3.96, -26.27, 13.84)`
4. 相机旋转：看向 +Y（正北）→ `旋转 X = 90°`

### 2.5 渲染设置

- `输出属性 > 格式`：**4096 × 2048**（必须 2:1，否则系统会当普通照片处理）
- 渲染引擎：`Cycles`（真实，慢）或 `EEVEE`（快，够用）
- 采样：Cycles 128~256，EEVEE 64
- `渲染 > 渲染图像`，保存为 JPG/PNG

### 2.6 直接复制这段 Python（Blender 的 Scripting 面板）

```python
import bpy, math

scene = bpy.context.scene
cam = bpy.data.objects.get('CAM_第一人称') or bpy.data.objects['Camera']

cam.location = (1.5, -17.5, 1.75)          # 与系统 fps 预设一致
cam.rotation_euler = (math.radians(90), 0, 0)   # 朝北 (+Y)
cam.data.type = 'PANO'
cam.data.panorama_type = 'EQUIRECTANGULAR'

scene.camera = cam
scene.render.resolution_x = 4096
scene.render.resolution_y = 2048          # 2:1
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'JPEG'
scene.render.filepath = '//pano_out.jpg'
bpy.ops.render.render(write_still=True)
```

跑完就在 .blend 同目录得到 `pano_out.jpg`，直接拿去「🌐 更换 3D 底图」上传。

---

## 3. 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| 上传后不能环绕，只是平移 | 图不是 2:1 | 渲染尺寸设 4096×2048 |
| 画面上下颠倒/歪 | 相机没朝 +Y 或旋转错 | 旋转 X=90°，朝向 +Y |
| 接缝处有一条线 | 光照/贴图不连续 | 全景相机本身是环绕的，检查地面是否无限大 |
| 全景里地面穿帮 | 地面平面不够大 | 地面加到 2000m 或加 HDRI 天空 |
| 导入后模型是躺着的 | 手动用了 OBJ 且轴没转 | 用 GLB 导入，Blender 会自动转 Y-up |
| 渲染很慢 | Cycles 采样太高 | 先用 EEVEE 64 采样预览 |

---

## 4. 更省事的三条路（不用学 3D）

1. **保持现状**：清除 3D 底图，用系统自带的实时孪生场景（就是你截图那个）。
2. **让我改风格**：把现在的程序化场景换个配色/加设备，改 `js/scene-3d.js` 就行。
3. **实拍**：借一台 Insta360 去厂区中间拍一张，导出 2:1 全景，真实感最强。

---

## 5. 一句话总结

- 你截图那种：**代码实时渲染**，不需要图片，也不该用图片替代；
- 你要"自己做一张好看的 3D 图"：**Blender**，导入我给的 `.glb`，相机切等距柱状，渲 4096×2048；
- 你要"最真实"：**全景相机实拍**。
