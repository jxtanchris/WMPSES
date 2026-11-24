#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WMPSES 360° 全景底图渲染器（等距柱状投影 / Equirectangular，宽:高 = 2:1）

用途：为「🌐 更换 3D 底图」功能生成可测试的全景图，写入
      WMPSES_试卷场景.ExamPicture3D。

坐标约定（与 js/scene-3d.js 完全一致）：
      x = 东，y = 北，z = 上，单位：米
      视点取第一人称「全景总览」机位 (1.5, -17.5, 1.75)，
      因此画面中设备方位与系统中的 8 个热点 (pos3d) 一一对应。

投影约定（与 scene-3d.js 的取图方式一致）：
      列 u ∈ [0,1)  →  方位角 az = (u - 0.5) * 360°，az=0 为正北（画面正中）
      行 v ∈ [0,1)  →  仰角 el = (0.5 - v) * 180°，v=0.5 为地平线
      即画面 50% 处 = 默认视角正前方 / 地平线，左右边缘可无缝衔接。

实现：numpy 向量化光线投射（盒体 / 立式圆柱 / 卧式圆柱），
      线性色彩空间光照、太阳投影阴影、程序化天空 / 云 / 远山、
      地面贴图、夜间点光源与泛光。仅依赖 numpy + Pillow。

用法：
    python3 tools/panorama_360.py --theme day   --out assets/3d-test/xxx.jpg
    python3 tools/panorama_360.py --theme night --out ...
    python3 tools/panorama_360.py --theme indoor --out ...
    加 --preview 可同时输出「App 实际取图视角」的预览图。
"""

import argparse
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

INF = np.float32(1e30)
EYE = np.array([1.5, -17.5, 1.75], dtype=np.float32)
DEG = math.pi / 180.0


def s2l(c):
    """sRGB -> 线性光。输入 0..1 或 0..255 均可。"""
    c = np.asarray(c, dtype=np.float32)
    if float(c.max()) > 1.001:
        c = c / 255.0
    return np.power(np.clip(c, 0, 1), 2.2)


def l2s(c):
    return np.power(np.clip(c, 0, 1), 1 / 2.2)


# =============================================================================
# 一、图元定义
# =============================================================================
# kind: 0=盒体  1=立式圆柱  2=沿 X 的卧式圆柱  3=沿 Y 的卧式圆柱
PRIM_KIND, PRIM_A, PRIM_COLOR = [], [], []
PRIM_SPEC, PRIM_SHIN, PRIM_EMIT = [], [], []


def _add(kind, geom, color, spec=0.10, shin=24.0, emit=0.0):
    PRIM_KIND.append(kind)
    PRIM_A.append(np.array(geom, dtype=np.float32))
    PRIM_COLOR.append(np.array(color, dtype=np.float32) / 255.0)
    PRIM_SPEC.append(float(spec))
    PRIM_SHIN.append(float(shin))
    PRIM_EMIT.append(float(emit))


def box(xc, yc, z0, w, d, h, color, spec=0.08, shin=20.0, emit=0.0):
    _add(0, (xc - w / 2, xc + w / 2, yc - d / 2, yc + d / 2, z0, z0 + h, 0, 0), color, spec, shin, emit)


def cyl(xc, yc, z0, z1, r0, r1=None, color=(150, 164, 182), spec=0.35, shin=60.0):
    """立式圆柱；r0 != r1 时按 6 段锥体近似。"""
    if r1 is None:
        r1 = r0
    if abs(r1 - r0) < 1e-6:
        _add(1, (xc, yc, r0, z0, z1, 0, 0, 0), color, spec, shin)
    else:
        n = 6
        for i in range(n):
            zz0 = z0 + (z1 - z0) * i / n
            zz1 = z0 + (z1 - z0) * (i + 1) / n
            rr = r0 + (r1 - r0) * (i + 0.5) / n
            _add(1, (xc, yc, rr, zz0, zz1, 0, 0, 0), color, spec, shin)


def hcyl_x(x0, x1, yc, zc, r, color, spec=0.35, shin=60.0):
    _add(2, (x0, x1, yc, zc, r, 0, 0, 0), color, spec, shin)


def hcyl_y(y0, y1, xc, zc, r, color, spec=0.35, shin=60.0):
    _add(3, (y0, y1, xc, zc, r, 0, 0, 0), color, spec, shin)


def sphere(xc, yc, zc, r, color, spec=0.2, shin=30.0, emit=0.0):
    """用 6 段圆柱堆出近似球（灯罩等小件）。"""
    n = 6
    for i in range(n):
        t0 = math.pi * i / n
        t1 = math.pi * (i + 1) / n
        rr = r * math.sin((t0 + t1) / 2)
        _add(1, (xc, yc, rr, zc + r * math.cos(t1), zc + r * math.cos(t0), 0, 0, 0), color, spec, shin, emit)


def tree(x, y, h=7.0, r=2.2, tint=1.0):
    box(x, y, 0.0, 0.45, 0.45, h * 0.45, (74, 60, 44), spec=0.02)
    base = (34, 68, 38)
    for i in range(3):
        rr = r * (1.0 - i * 0.26) * tint
        z0 = h * (0.35 + i * 0.2)
        cyl(x, y, z0, z0 + h * 0.34, rr, rr * 0.55,
            color=(int(base[0] * (0.85 + i * 0.1)), int(base[1] * (0.85 + i * 0.1)), int(base[2] * (0.85 + i * 0.1))),
            spec=0.04)


def vehicle(x, y, col=(196, 200, 204), kind="car"):
    """简易车辆（轴对齐），用于厂区尺度参照。"""
    if kind == "car":
        box(x, y, 0.30, 1.85, 4.3, 0.62, col, spec=0.5, shin=90)
        box(x, y - 0.15, 0.92, 1.70, 2.30, 0.55, col, spec=0.5, shin=90)
        box(x, y - 0.15, 1.10, 1.72, 2.10, 0.30, (40, 52, 66), spec=0.6, shin=120)
        for wx in (x - 0.95, x + 0.95):
            for wy in (y - 1.35, y + 1.35):
                hcyl_x(wx - 0.12, wx + 0.12, wy, 0.34, 0.34, (26, 28, 30), spec=0.1)
    else:
        box(x, y, 0.45, 2.35, 6.4, 2.10, col, spec=0.35)
        box(x, y + 2.6, 0.45, 2.30, 2.0, 1.45, (228, 230, 228), spec=0.4)
        box(x, y + 2.55, 1.15, 2.05, 0.08, 0.9, (60, 76, 92), spec=0.6, shin=110)
        for wx in (x - 1.05, x + 1.05):
            for wy in (y - 1.9, y + 1.5, y + 3.1):
                hcyl_x(wx - 0.14, wx + 0.14, wy, 0.48, 0.48, (26, 28, 30), spec=0.1)


METAL = (150, 164, 182)
METAL_DARK = (104, 118, 134)
PAVE = (186, 188, 186)
YELLOW = (214, 170, 20)
RED = (176, 32, 32)


# =============================================================================
# 二、场景：碱洗预处理 + 三室 RTO 联合装置
# =============================================================================
def build_scene(theme="day"):
    PRIM_KIND.clear(); PRIM_A.clear(); PRIM_COLOR.clear()
    PRIM_SPEC.clear(); PRIM_SHIN.clear(); PRIM_EMIT.clear()

    night = theme == "night"

    steel = (96, 108, 122) if night else METAL
    steel2 = (128, 140, 156) if night else (186, 200, 218)
    steel_d = (66, 76, 90) if night else METAL_DARK

    # ---------------- 设备基础 ----------------
    pads = [
        (-11.5, 0.5, 6.6, 6.6), (-4.8, -2.5, 5.2, 4.2), (-1.8, -5.5, 5.0, 3.0),
        (4.5, 1.0, 10.2, 6.6), (11.2, 2.0, 3.8, 3.8), (15.2, -2.8, 5.6, 4.4),
    ]
    for (x, y, w, d) in pads:
        box(x, y, 0.0, w, d, 0.30, PAVE, spec=0.02)
        box(x, y, 0.30, w - 0.2, d - 0.2, 0.05, (204, 204, 198), spec=0.02)

    # ---------------- A-101 碱洗塔 ----------------
    tx, ty = -11.5, 0.5
    cyl(tx, ty, 0.35, 5.4, 2.05, color=steel, spec=0.32)
    cyl(tx, ty, 5.4, 10.6, 2.05, color=steel2, spec=0.32)
    cyl(tx, ty, 10.6, 11.6, 2.05, 0.55, color=steel, spec=0.32)
    hcyl_x(tx, tx + 5.3, ty, 11.1, 0.5, steel, spec=0.32)
    # 三层平台（黄色格栅 + 栏杆）
    for pz in (4.2, 7.3, 10.3):
        cyl(tx, ty, pz - 0.10, pz, 2.86, color=YELLOW, spec=0.15)
        cyl(tx, ty, pz + 1.06, pz + 1.12, 2.88, color=YELLOW, spec=0.2)
        cyl(tx, ty, pz + 0.52, pz + 0.58, 2.88, color=YELLOW, spec=0.2)
        for k in range(14):
            a = 2 * math.pi * k / 14
            box(tx + 2.88 * math.sin(a), ty + 2.88 * math.cos(a), pz, 0.07, 0.07, 1.12, YELLOW, spec=0.2)
    # 塔体直爬梯
    for lx in (tx + 2.2, tx + 2.55):
        box(lx, ty + 0.6, 0.3, 0.06, 0.06, 10.2, YELLOW, spec=0.2)
    for z in np.arange(0.5, 10.5, 0.32):
        box(tx + 2.38, ty + 0.6, float(z), 0.42, 0.05, 0.04, YELLOW, spec=0.2)
    # 塔体接管 / 法兰 / 人孔
    for z in (2.4, 3.1, 6.2, 9.1):
        cyl(tx, ty - 2.05, z, z + 0.22, 0.42, color=steel_d, spec=0.3)
        cyl(tx, ty - 2.3, z + 0.22, z + 0.34, 0.55, color=steel_d, spec=0.3)
    # 防腐层脱落（塔身上部，朝南）
    box(tx - 0.15, ty - 2.02, 8.15, 1.5, 0.20, 1.35, (170, 92, 30), spec=0.05)
    box(tx - 0.15, ty - 2.06, 8.15, 1.62, 0.10, 0.08, (120, 62, 22), spec=0.05)
    # 塔顶压力表 PI-101
    cyl(tx + 0.9, ty - 1.5, 10.6, 11.95, 0.05, color=steel_d)
    cyl(tx + 0.9, ty - 1.5, 11.7, 12.05, 0.30, color=(236, 236, 232), spec=0.6, shin=80)
    box(tx + 1.35, ty - 1.5, 10.9, 0.5, 0.06, 0.6, RED, spec=0.2)
    # 塔底循环泵
    box(-14.9, -1.4, 0.30, 1.5, 0.9, 0.75, (32, 82, 150), spec=0.35)
    cyl(-13.5, -1.0, 0.32, 1.15, 0.42, color=(60, 110, 180), spec=0.4)
    hcyl_y(-2.4, -0.6, -13.0, 0.7, 0.18, steel_d)
    cyl(tx, ty, 11.6, 13.4, 0.04, color=steel_d)

    # ---------------- B-101 引风机 ----------------
    fx, fy = -6.2, -2.5
    cyl(fx, fy, 0.35, 2.35, 1.28, color=(46, 118, 176), spec=0.4, shin=70)
    cyl(fx, fy, 2.35, 2.55, 1.42, color=(38, 96, 150), spec=0.4)
    box(-4.35, fy, 1.10, 1.65, 1.25, 1.55, (30, 84, 170), spec=0.35)
    cyl(-4.35, fy, 2.65, 3.0, 0.35, color=(40, 96, 180), spec=0.4)
    box(-5.25, fy, 1.05, 0.55, 0.9, 0.75, (228, 196, 40), spec=0.2)
    hcyl_y(-6.4, -0.6, fx, 1.35, 0.62, steel_d, spec=0.3)
    hcyl_x(-5.5, 1.4, -1.1, 1.8, 0.62, steel_d, spec=0.3)
    box(-5.2, fy - 0.72, 1.45, 0.55, 0.14, 0.62, (18, 24, 34), spec=0.5)
    box(-5.2, fy - 0.78, 1.5, 0.4, 0.06, 0.2, (196, 206, 216), spec=0.4)
    box(fx - 0.2, fy, 0.32, 3.2, 2.6, 0.30, (70, 80, 92), spec=0.1)

    # ---------------- W-101 循环冷却水 ----------------
    hcyl_x(-3.9, 0.5, -5.3, 1.05, 0.24, (30, 120, 168), spec=0.4)
    hcyl_x(-3.9, 0.5, -5.8, 1.62, 0.20, (56, 170, 214), spec=0.4)
    hcyl_y(-7.4, -5.3, -3.9, 1.05, 0.24, (30, 120, 168), spec=0.4)
    box(-1.8, -5.3, 1.0, 0.16, 0.16, 1.0, steel_d)
    cyl(-1.8, -5.3, 1.94, 2.10, 0.62, color=(200, 46, 40), spec=0.4)
    cyl(-1.8, -5.3, 2.10, 2.22, 0.14, color=(60, 66, 74))
    box(-0.8, -6.0, 0.7, 0.5, 0.6, 0.5, (90, 100, 110), spec=0.3)
    cyl(-0.8, -6.0, 1.2, 1.42, 0.16, color=(230, 230, 225), spec=0.5)
    box(-0.2, -5.5, 1.1, 0.26, 0.26, 0.5, (40, 46, 56), spec=0.4)
    box(-0.2, -5.53, 1.24, 0.18, 0.05, 0.16, (80, 220, 160), spec=0.2)

    # ---------------- R-101 三室 RTO ----------------
    for cx in (1.8, 4.5, 7.2):
        cyl(cx, 1.0, 0.35, 2.6, 1.18, 0.62, color=steel_d, spec=0.3)
        for dx in (-0.95, 0.95):
            for dy in (-1.5, 1.5):
                box(cx + dx, 1.0 + dy, 2.6, 0.18, 0.18, 2.2, steel_d, spec=0.2)
        box(cx, 1.0, 4.8, 2.45, 3.6, 4.4, steel, spec=0.28)
        for z in (5.4, 6.6, 7.8, 9.0):
            box(cx, 1.0, z, 2.55, 3.7, 0.09, steel2, spec=0.3)
        cyl(cx, -0.85, 2.55, 2.95, 0.24, color=(210, 150, 30), spec=0.3)
    box(4.5, 1.0, 9.2, 8.2, 3.8, 2.4, steel2, spec=0.28)
    box(4.5, 1.0, 11.6, 8.4, 4.0, 0.18, (200, 210, 224), spec=0.3)
    box(4.5, -1.35, 9.15, 1.8, 1.0, 1.2, (176, 90, 40), spec=0.3)
    cyl(4.5, -1.85, 9.2, 9.6, 0.32, color=(150, 70, 30), spec=0.3)
    box(4.5, -1.7, 5.30, 9.2, 1.9, 0.16, (196, 140, 10), spec=0.15)
    for rx in (0.15, 2.3, 4.5, 6.7, 8.85):
        box(rx, -2.55, 5.35, 0.10, 0.10, 1.15, YELLOW, spec=0.2)
    for rz in (5.9, 6.45):
        box(4.5, -2.55, rz, 8.7, 0.07, 0.07, YELLOW, spec=0.2)
    for k in range(9):
        box(-0.6, -2.4 + k * 0.22, 0.6 + k * 0.55, 0.8, 0.18, 0.08, YELLOW, spec=0.2)
    hcyl_x(2.2, 6.8, -2.9, 1.15, 0.45, (24, 110, 132), spec=0.35)
    box(4.5, -3.35, 1.6, 0.4, 0.25, 0.4, (220, 160, 30), spec=0.3)
    hcyl_x(7.8, 11.2, 2.0, 2.0, 0.60, steel, spec=0.3)
    for rx in np.linspace(0.6, 8.4, 7):
        box(float(rx), 2.85, 11.6, 0.08, 0.08, 0.9, YELLOW, spec=0.2)

    # ---------------- M-101 排气筒 + CEMS ----------------
    sx, sy = 11.2, 2.0
    cyl(sx, sy, 0.35, 5.2, 1.05, 0.95, color=(214, 220, 228), spec=0.4, shin=70)
    cyl(sx, sy, 5.2, 8.6, 0.95, 0.85, color=(188, 44, 40), spec=0.4, shin=70)
    cyl(sx, sy, 8.6, 12.2, 0.85, 0.78, color=(228, 232, 240), spec=0.4, shin=70)
    cyl(sx, sy, 12.2, 15.5, 0.78, 0.72, color=(188, 44, 40), spec=0.4, shin=70)
    cyl(sx, sy, 15.5, 15.62, 0.80, color=(70, 76, 86), spec=0.4)
    cyl(sx, sy, 9.20, 9.36, 1.70, color=YELLOW, spec=0.15)
    cyl(sx, sy, 10.25, 10.31, 1.72, color=YELLOW, spec=0.2)
    for k in range(12):
        a = 2 * math.pi * k / 12
        box(sx + 1.71 * math.sin(a), sy + 1.71 * math.cos(a), 9.36, 0.06, 0.06, 0.95, YELLOW, spec=0.2)
    for lx in (sx - 0.55, sx - 0.25):
        box(lx, sy - 1.15, 0.5, 0.05, 0.05, 15.0, YELLOW, spec=0.2)
    for z in np.arange(0.7, 15.0, 0.34):
        box(sx - 0.4, sy - 1.15, float(z), 0.34, 0.05, 0.04, YELLOW, spec=0.2)
    box(10.4, -0.2, 1.6, 2.6, 2.2, 2.5, (206, 212, 220), spec=0.2)
    box(10.4, -0.2, 4.1, 2.9, 2.5, 0.22, (168, 176, 186), spec=0.2)
    box(10.4, -1.35, 1.95, 1.15, 0.08, 1.05, (30, 44, 58), spec=0.5)
    box(10.4, -1.40, 1.95, 1.0, 0.03, 0.95, (96, 176, 220), spec=0.2, shin=80)
    hcyl_x(11.2, 11.9, -0.4, 4.6, 0.10, steel_d)
    cyl(10.4, -0.2, 4.3, 6.3, 0.09, color=steel_d)
    cyl(sx, sy, 15.6, 15.9, 0.16, color=(220, 40, 40), spec=0.1)
    cyl(sx, sy, 0.30, 0.55, 1.35, color=(160, 162, 158), spec=0.05)

    # ---------------- U-101 公用工程 ----------------
    cyl(14.3, -1.8, 0.35, 3.0, 0.68, color=(40, 128, 186), spec=0.4)
    cyl(14.3, -1.8, 3.0, 3.16, 0.72, color=(30, 100, 150), spec=0.4)
    box(16.2, -2.9, 1.55, 2.0, 1.4, 2.4, (30, 56, 122), spec=0.3)
    box(16.2, -3.62, 1.8, 1.5, 0.08, 0.9, (16, 24, 36), spec=0.5)
    box(16.2, -3.66, 2.4, 0.16, 0.03, 0.16, (60, 230, 130), spec=0.2, shin=90)
    for i in range(4):
        cyl(13.4 + i * 0.36, -3.6, 0.3, 1.8, 0.14, color=(70, 74, 82), spec=0.4)
    box(1.0, -6.9, 3.3, 26.0, 0.5, 0.16, (110, 118, 126), spec=0.2)
    for bx in np.arange(0.5, 15.0, 3.0):
        box(float(bx), -6.9, 0.3, 0.10, 0.10, 3.1, (110, 118, 126), spec=0.2)

    # ---------------- 中控室 / 门卫 / 罐区 / 仓库（背后与两侧） ----------------
    box(-4.0, -47.0, 0.0, 15.0, 9.0, 6.4, (216, 214, 208), spec=0.06)
    box(-4.0, -47.0, 6.4, 15.6, 9.4, 0.35, (150, 154, 154), spec=0.06)
    box(-4.0, -47.0, 6.75, 15.0, 9.0, 0.06, (186, 186, 180), spec=0.05)
    for i in range(6):
        for zz in (1.3, 3.6):
            box(-10.0 + i * 2.4, -51.52, zz, 1.85, 0.10, 1.5,
                (250, 214, 140) if night else (86, 128, 168), spec=0.2, shin=80,
                emit=1.0 if night else 0.0)
    box(2.0, -51.6, 0.0, 2.4, 0.5, 2.4, (60, 72, 84), spec=0.2)
    box(2.0, -51.9, 2.4, 3.4, 1.4, 0.18, (120, 130, 140), spec=0.1)
    for i in range(2):
        box(-7.0 + i * 6.0, -46.0, 6.8, 1.6, 1.1, 0.85, (190, 194, 196), spec=0.15)
        box(-7.0 + i * 6.0, -46.0, 7.65, 1.4, 0.9, 0.12, (150, 154, 156), spec=0.1)
    # 碱液 / 废水储罐
    for (cx2, cy2) in [(-24.0, 6.0), (-19.6, 9.5)]:
        cyl(cx2, cy2, 0.0, 4.2, 2.6, color=(198, 202, 204) if not night else (88, 94, 102), spec=0.3)
        cyl(cx2, cy2, 4.2, 4.36, 2.65, color=(150, 156, 160), spec=0.3)
        cyl(cx2, cy2, 0.0, 0.9, 2.66, color=(160, 162, 158), spec=0.05)
    for (cx3, cy3, w3, d3) in [(-21.8, 7.6, 12.4, 9.6)]:
        for (dx, dy, ww, dd) in [(-w3 / 2, 0, 0.3, d3), (w3 / 2, 0, 0.3, d3),
                                 (0, -d3 / 2, w3, 0.3), (0, d3 / 2, w3, 0.3)]:
            box(cx3 + dx, cy3 + dy, 0.0, ww, dd, 0.9, (188, 188, 182), spec=0.05)
    # 仓库（东侧，稍远）
    box(36.0, -12.0, 0.0, 18.0, 22.0, 6.6, (204, 206, 202), spec=0.05)
    box(36.0, -12.0, 6.6, 18.6, 22.6, 0.3, (150, 154, 152), spec=0.05)
    box(36.0, -12.0, 6.9, 17.0, 20.0, 0.05, (176, 178, 174), spec=0.05)
    for i in range(3):
        box(28.5 + i * 7.0, -12.0, 6.95, 3.0, 2.2, 0.5, (188, 192, 194), spec=0.1)
    box(27.2, -12.2, 0.0, 0.25, 0.25, 5.4, (120, 126, 132), spec=0.1)

    # ---------------- 管廊 / 灯杆 / 围栏 / 门 / 树 ----------------
    for px in (-19.0, -6.0, 7.0, 20.0):
        box(px, 9.5, 0.0, 0.5, 0.5, 7.2, (120, 126, 132), spec=0.2)
    box(0.5, 9.5, 7.2, 40.0, 0.55, 0.35, (120, 126, 132), spec=0.2)
    for i, (rz, rr, col) in enumerate([(7.7, 0.34, (150, 160, 170)),
                                      (7.7, 0.22, (60, 130, 180)),
                                      (8.15, 0.26, (190, 150, 40))]):
        hcyl_x(-19.0, 20.5, 9.5 + (i - 1) * 0.85, rz, rr, col, spec=0.3)
    for (lx, ly) in [(-16.0, -9.0), (0.0, -9.0), (16.0, -9.0), (25.0, 14.0), (-22.0, 16.0)]:
        cyl(lx, ly, 0.0, 9.0, 0.11, color=(96, 104, 112), spec=0.3)
        box(lx, ly, 8.85, 0.75, 0.45, 0.22, (60, 66, 74), spec=0.3)
        sphere(lx, ly - 0.2, 8.75, 0.20, (255, 232, 170), spec=0.1, emit=1.0 if night else 0.0)
    # 围栏（南、东、西）
    for fx_ in np.arange(-42, 48, 2.4):
        box(float(fx_), -36.0, 0.0, 0.10, 0.10, 2.2, (108, 116, 124), spec=0.2)
    for zz in (0.55, 1.35, 2.1):
        box(2.5, -36.0, zz, 88.0, 0.05, 0.05, (108, 116, 124), spec=0.2)
    for fy_ in np.arange(-36, 20, 2.4):
        box(-42.0, float(fy_), 0.0, 0.10, 0.10, 2.2, (108, 116, 124), spec=0.2)
        box(46.0, float(fy_), 0.0, 0.10, 0.10, 2.2, (108, 116, 124), spec=0.2)
    for gx in (-5.0, 6.0):
        box(gx, -36.0, 0.0, 0.9, 0.9, 3.2, (170, 172, 168), spec=0.05)
    box(0.5, -36.0, 2.6, 11.0, 0.35, 2.4, (52, 60, 68), spec=0.25)
    box(9.0, -38.0, 0.0, 3.6, 3.0, 3.2, (214, 214, 208), spec=0.05)
    box(9.0, -38.0, 3.2, 4.0, 3.4, 0.3, (140, 144, 142), spec=0.05)
    # 厂区外树线
    rng = np.random.default_rng(5)
    for i in range(26):
        x = -46 + i * 4.0 + rng.uniform(-1.2, 1.2)
        tree(x, -57.0 + rng.uniform(-3.0, 0.0), h=float(rng.uniform(6.5, 10.5)), r=float(rng.uniform(2.0, 3.2)))
    for i in range(10):
        y = -32 + i * 5.5 + rng.uniform(-1.0, 1.0)
        tree(-52.5 + rng.uniform(-1.5, 1.5), y, h=float(rng.uniform(7.0, 10.0)), r=float(rng.uniform(2.2, 3.0)))
    for i in range(8):
        y = -26 + i * 6.0
        tree(50.0 + rng.uniform(-1.0, 2.0), y, h=float(rng.uniform(7.0, 11.0)), r=float(rng.uniform(2.2, 3.2)))

    # ---------------- 厂界围墙与周边建筑 ----------------
    wall_c = (166, 168, 164) if not night else (78, 82, 86)
    for (x0, y0, x1, y1) in [(-44.0, 24.0, 46.0, 24.6), (-44.6, -36.0, -44.0, 24.0), (46.0, -36.0, 46.6, 24.0)]:
        box((x0 + x1) / 2, (y0 + y1) / 2, 0.0, abs(x1 - x0), abs(y1 - y0), 2.3, wall_c, spec=0.05)
    # 北侧库房群
    for (bx, by, w_, d_, h_) in [(-58.0, 46.0, 26.0, 16.0, 9.0),
                                 (-24.0, 52.0, 20.0, 14.0, 7.5),
                                 (36.0, 40.0, 24.0, 18.0, 8.5),
                                 (78.0, 30.0, 30.0, 22.0, 10.0)]:
        box(bx, by, 0.0, w_, d_, h_, (196, 198, 194), spec=0.05)
        box(bx, by, h_, w_ + 0.8, d_ + 0.8, 0.4, (152, 156, 154), spec=0.05)
    # 东侧罐区
    for i in range(3):
        cyl(62.0 + i * 9.0, 56.0, 0.0, 8.0, 4.0, color=(190, 194, 196), spec=0.25)
        cyl(62.0 + i * 9.0, 56.0, 8.0, 8.3, 4.1, color=(150, 156, 158), spec=0.25)
    # 输电铁塔（远处）
    for (px_, py_) in [(-70.0, 66.0), (-20.0, 78.0), (30.0, 70.0)]:
        for lx in (-1.6, 1.6):
            box(px_ + lx, py_, 0.0, 0.18, 0.18, 22.0, (120, 126, 130), spec=0.2)
        for zz in (6.0, 12.0, 18.0):
            box(px_, py_, zz, 3.4, 0.16, 0.16, (120, 126, 130), spec=0.2)
    
    # ---------------- 中景 / 远景工业轮廓（营造纵深） ----------------
    # 冷却塔（双曲线近似）
    for (fx_, fy_, h_, r_) in [(320.0, 380.0, 46.0, 22.0), (420.0, 430.0, 50.0, 24.0)]:
        cyl(fx_, fy_, 0.0, h_ * 0.30, r_ * 1.15, r_ * 0.72, color=(158, 164, 168), spec=0.05)
        cyl(fx_, fy_, h_ * 0.30, h_, r_ * 0.72, r_ * 0.98, color=(168, 172, 176), spec=0.05)
    # 远处高烟囱
    for (fx_, fy_, h_, r_) in [(-170.0, 210.0, 62.0, 2.4), (240.0, 330.0, 48.0, 2.0), (-40.0, 330.0, 40.0, 1.8)]:
        cyl(fx_, fy_, 0.0, h_, r_, r_ * 0.8, color=(196, 198, 196), spec=0.2)
    # 远处精馏塔群
    for i in range(4):
        bx = -105.0 + i * 16.0
        by = 250.0 + (i % 2) * 18.0
        cyl(bx, by, 0.0, 30.0 + i * 3.0, 2.6, color=(184, 190, 196), spec=0.2)
        cyl(bx, by, 0.0, 0.8, 3.2, color=(164, 166, 162), spec=0.05)
        box(bx, by, 12.0, 7.0, 7.0, 0.4, (150, 156, 160), spec=0.1)
        box(bx, by, 22.0, 7.0, 7.0, 0.4, (150, 156, 160), spec=0.1)
    # 远处球罐
    for (fx_, fy_) in [(84.0, 168.0), (100.0, 176.0)]:
        sphere(fx_, fy_, 5.5, 5.5, (198, 202, 204), spec=0.3)
        for k in range(6):
            a = 2 * math.pi * k / 6
            cyl(fx_ + 4.6 * math.cos(a), fy_ + 4.6 * math.sin(a), 0.0, 5.6, 0.22, color=(150, 154, 152))
    # 远处厂房轮廓
    for (fx_, fy_, w_, d_, h_) in [(-190.0, 120.0, 60.0, 30.0, 14.0),
                                   (110.0, 110.0, 70.0, 34.0, 12.0),
                                   (250.0, 120.0, 50.0, 40.0, 18.0)]:
        box(fx_, fy_, 0.0, w_, d_, h_, (196, 200, 202), spec=0.05)
        box(fx_, fy_, h_, w_ + 1.5, d_ + 1.5, 0.8, (164, 168, 168), spec=0.05)
    # 厂区周边小库房 / 配电间
    box(-34.0, -14.0, 0.0, 10.0, 8.0, 5.0, (198, 200, 196), spec=0.05)
    box(-34.0, -14.0, 5.0, 10.5, 8.5, 0.3, (150, 154, 152), spec=0.05)
    box(24.0, 16.0, 0.0, 7.0, 6.0, 4.2, (196, 198, 194), spec=0.05)
    # 集装箱办公室
    box(-24.0, -22.0, 0.0, 6.0, 2.6, 2.8, (196, 118, 52), spec=0.15)
    box(-24.0, -22.0, 2.8, 6.1, 2.7, 0.12, (150, 92, 44), spec=0.1)
    for k in range(4):
        box(-26.2 + k * 1.4, -23.32, 1.0, 0.9, 0.05, 0.8, (150, 190, 210), spec=0.3, shin=80)
    # 消防器材 / 洗眼器 / 灭火器
    for (ex_, ey_) in [(-8.6, -3.6), (7.2, -3.2), (12.6, -3.0)]:
        cyl(ex_, ey_, 0.3, 0.95, 0.22, color=(190, 40, 36), spec=0.3)
        box(ex_, ey_, 0.0, 0.5, 0.5, 0.3, (70, 74, 78), spec=0.1)
    # 安全警示牌
    for (sx_, sy_) in [(-9.4, -4.2), (6.2, -4.0), (13.2, -3.8)]:
        for pxx in (sx_ - 0.35, sx_ + 0.35):
            box(pxx, sy_, 0.0, 0.06, 0.06, 2.0, (120, 126, 132), spec=0.2)
        box(sx_, sy_, 1.6, 1.0, 0.05, 0.6, (230, 190, 20), spec=0.2)

    # ---------------- 前景小物件（尺度参照） ----------------
    # 安全锥
    for (cx_, cy_) in [(-6.2, -20.4), (-5.6, -20.9), (6.6, -21.2)]:
        cyl(cx_, cy_, 0.0, 0.12, 0.28, color=(206, 92, 24), spec=0.2)
        cyl(cx_, cy_, 0.12, 0.62, 0.05, 0.03, color=(214, 108, 30), spec=0.2)
        cyl(cx_, cy_, 0.30, 0.38, 0.055, color=(240, 240, 236), spec=0.2)
    # 防撞柱
    for (bx_, by_) in [(-9.4, -19.0), (-3.2, -19.0), (3.0, -19.0), (9.2, -19.0)]:
        cyl(bx_, by_, 0.0, 0.85, 0.11, color=(214, 176, 26), spec=0.25)
        cyl(bx_, by_, 0.55, 0.65, 0.115, color=(240, 240, 236), spec=0.25)
    # 洗眼器 / 软管卷盘
    box(8.6, -6.2, 0.0, 0.5, 0.5, 1.1, (36, 132, 74), spec=0.3)
    cyl(8.6, -6.2, 1.1, 1.5, 0.3, color=(36, 132, 74), spec=0.3)

    # ---------------- 车辆 / 物料堆放（尺度参照） ----------------
    vehicle(-12.0, -42.0, (206, 208, 204))
    vehicle(-7.0, -42.0, (150, 160, 176))
    vehicle(-2.0, -42.0, (192, 70, 56))
    vehicle(29.0, -20.0, (214, 216, 212), kind="truck")
    # 托盘 / 桶区
    for i in range(6):
        box(24.0 + (i % 3) * 1.2, -24.0 - (i // 3) * 1.4, 0.0, 1.0, 1.1, 0.9, (150, 122, 84), spec=0.05)
    for i in range(8):
        cyl(20.0 + i * 0.62, -22.0, 0.0, 0.9, 0.30, color=(58, 96, 140), spec=0.3)

    # ---------------- 夜间灯光点 ----------------
    if night:
        lamps = [
            ((-11.5, -2.3, 10.4), (255, 214, 150), 950.0),
            ((-11.5, -2.3, 4.4), (255, 206, 140), 750.0),
            ((-4.4, -3.4, 2.2), (255, 226, 170), 520.0),
            ((4.5, -2.6, 5.6), (255, 200, 130), 950.0),
            ((11.2, -2.6, 4.4), (255, 220, 160), 620.0),
            ((15.2, -3.9, 2.3), (255, 220, 160), 520.0),
            ((-16.0, -9.0, 8.7), (255, 236, 190), 2400.0),
            ((0.0, -9.0, 8.7), (255, 236, 190), 2400.0),
            ((16.0, -9.0, 8.7), (255, 236, 190), 2400.0),
        ]
    elif theme == "indoor":
        lamps = [
            ((0.0, -12.0, 7.5), (255, 246, 224), 2800.0),
            ((-11.5, 0.5, 9.0), (255, 246, 224), 1900.0),
            ((4.5, 1.0, 9.0), (255, 246, 224), 1900.0),
            ((11.2, 2.0, 9.0), (255, 246, 224), 1900.0),
        ]
    else:
        lamps = []

    return lamps


# =============================================================================
# 三、程序化贴图
# =============================================================================
class Noise2D:
    def __init__(self, n=256, seed=1, smooth=2):
        rng = np.random.default_rng(seed)
        img = rng.random((n, n), dtype=np.float32)
        for _ in range(smooth):
            img = (img + np.roll(img, 1, 0) + np.roll(img, -1, 0)
                   + np.roll(img, 1, 1) + np.roll(img, -1, 1)) / 5.0
        img = (img - img.min()) / (img.max() - img.min() + 1e-6)
        self.n = n
        self.img = img

    def sample(self, x, y):
        n = self.n
        xf = x % n
        yf = y % n
        x0 = np.floor(xf).astype(np.int32) % n
        y0 = np.floor(yf).astype(np.int32) % n
        x1 = (x0 + 1) % n
        y1 = (y0 + 1) % n
        tx = xf - np.floor(xf)
        ty = yf - np.floor(yf)
        a = self.img[y0, x0]; b = self.img[y0, x1]
        c = self.img[y1, x0]; d = self.img[y1, x1]
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def fbm(noise, x, y, octaves=5, scale=1.0, gain=0.5, lac=2.0):
    total = np.zeros_like(x, dtype=np.float32)
    amp = 1.0
    norm = 0.0
    s = scale
    for _ in range(octaves):
        total += amp * noise.sample(x * s, y * s)
        norm += amp
        amp *= gain
        s *= lac
    return total / norm


def _font(size):
    for p in ("/System/Library/Fonts/PingFang.ttc",
              "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
              "/System/Library/Fonts/Helvetica.ttc"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


GROUND_CENTER = (2.0, -8.0)


def build_ground_texture(theme="day", meters=420.0, px=4096):
    """俯视地面贴图：混凝土装置区地坪 / 伸缩缝 / 黄色巡检通道 / 围栏外草地。"""
    ppm = px / meters
    cx, cy = GROUND_CENTER

    def w2p(x, y):
        return ((np.asarray(x, dtype=np.float64) - cx) * ppm + px / 2,
                (cy - np.asarray(y, dtype=np.float64)) * ppm + px / 2)

    rng = np.random.default_rng(7)
    X = (np.arange(px)[None, :] - px / 2) / ppm + cx
    Y = (cy - (np.arange(px)[:, None] - px / 2) / ppm)
    X = np.broadcast_to(X, (px, px)).astype(np.float32)
    Y = np.broadcast_to(Y, (px, px)).astype(np.float32)

    n1 = Noise2D(128, 3, 3)
    n2 = Noise2D(256, 9, 2)
    big = fbm(n1, X * 2.0, Y * 2.0, 4, 0.05)
    fine = fbm(n2, X * 11.0, Y * 11.0, 3, 0.5)

    if theme == "night":
        v = 44 + 8 * big + 5 * fine
    else:
        v = 118 + 9 * big + 7 * fine
    base = np.stack([v * 1.00, v * 1.005, v * 1.015], -1)

    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    dr = ImageDraw.Draw(img)

    def R(x0, y0, x1, y1, fill=None, outline=None, width=1):
        p0 = w2p(min(x0, x1), max(y0, y1))
        p1 = w2p(max(x0, x1), min(y0, y1))
        dr.rectangle([float(p0[0]), float(p0[1]), float(p1[0]), float(p1[1])],
                     fill=fill, outline=outline, width=width)

    def L(x0, y0, x1, y1, fill, width):
        p0 = w2p(x0, y0)
        p1 = w2p(x1, y1)
        dr.line([float(p0[0]), float(p0[1]), float(p1[0]), float(p1[1])], fill=fill, width=width)

    # 围栏外草地
    grass = (58, 70, 46) if theme != "night" else (20, 26, 18)
    R(-210, -210, 210, -36.6, fill=grass)
    R(-210, 24.0, 210, 210, fill=grass)
    R(-210, -36.6, -44.0, 24.0, fill=grass)
    R(46.0, -36.6, 210, 24.0, fill=grass)

    # 厂外农田 / 绿化肌理
    rng2 = np.random.default_rng(19)
    for _ in range(150):
        gx = rng2.uniform(-200, 200)
        gy = rng2.uniform(-200, 200)
        if -44.5 < gx < 46.5 and -36.5 < gy < 24.5:
            continue
        w = rng2.uniform(4, 26)
        h = rng2.uniform(4, 22)
        k = rng2.uniform(0.80, 1.15)
        c = tuple(int(v * k) for v in grass)
        R(gx - w, gy - h, gx + w, gy + h, fill=c)
    # 进场道路（大门向南延伸）
    R(-1.5, -200, 8.0, -36.0, fill=(74, 76, 78) if theme != "night" else (34, 36, 40))
    L(3.2, -200, 3.2, -36.0, (206, 202, 188) if theme != "night" else (104, 100, 90), 3)
    # 厂外环形路
    R(-200, 26.5, 200, 31.0, fill=(74, 76, 78) if theme != "night" else (34, 36, 40))

    # 装置区混凝土大板（略亮），四周留出草地
    R(-44.0, -36.0, 46.0, 24.0, fill=(136, 136, 132) if theme != "night" else (62, 64, 66))

    # 混凝土伸缩缝（6m 网格，弱对比）
    joint = (134, 134, 130) if theme != "night" else (58, 60, 62)
    for gx in np.arange(-42, 46, 6.0):
        L(gx, -36, gx, 24, joint, 3)
    for gy in np.arange(-36, 24, 6.0):
        L(-44, gy, 46, gy, joint, 3)

    # 黄色巡检通道（对应系统 y = -7.2 的人行路线）
    R(-44, -8.7, 46, -5.8, fill=(186, 148, 18) if theme != "night" else (112, 88, 10))
    L(-44, -5.85, 46, -5.85, (230, 228, 218) if theme != "night" else (140, 138, 130), 5)
    L(-44, -8.65, 46, -8.65, (230, 228, 218) if theme != "night" else (140, 138, 130), 5)

    # 装置区外圈黄色安全线
    R(-20.5, -4.6, 21.0, 13.5, outline=(206, 168, 26), width=7)
    # RTO 检修区斜线
    for i in range(22):
        L(7.6 + i * 0.8, 3.0, 8.4 + i * 0.8, 3.9, (206, 168, 26), 4)

    # 停车位（中控楼前）
    for i in range(8):
        L(-13.0 + i * 3.0, -41.0, -13.0 + i * 3.0, -36.8, (222, 220, 210) if theme != "night" else (130, 128, 120), 4)

    # 排水沟盖板
    for gx in np.arange(-16, 20, 8.0):
        R(gx - 1.2, -4.4, gx + 1.2, -4.0, fill=(120, 122, 120) if theme != "night" else (48, 50, 52))

    # 油渍 / 污渍
    for _ in range(34):
        gx = rng.uniform(-18, 20)
        gy = rng.uniform(-9, 12)
        r = rng.uniform(0.3, 1.2)
        p0 = w2p(gx - r, gy + r)
        p1 = w2p(gx + r, gy - r)
        shade = int(rng.uniform(96, 118)) if theme != "night" else 34
        dr.ellipse([float(p0[0]), float(p0[1]), float(p1[0]), float(p1[1])],
                   fill=(shade, shade, shade + 2))

    # 小面积补丁（沥青修补）
    for _ in range(16):
        gx = rng.uniform(-20, 22)
        gy = rng.uniform(-10, 14)
        w = rng.uniform(0.6, 2.4)
        h = rng.uniform(0.5, 1.8)
        p0 = w2p(gx - w, gy + h)
        p1 = w2p(gx + w, gy - h)
        c = int(rng.uniform(128, 142)) if theme != "night" else 56
        dr.rectangle([float(p0[0]), float(p0[1]), float(p1[0]), float(p1[1])], fill=(c, c, c + 2))

    arr = np.asarray(img).astype(np.float32)
    arr = np.asarray(Image.fromarray(arr.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
    return arr, ppm, cx, cy


# =============================================================================
# 四、天空 / 远景
# =============================================================================
class Sky:
    def __init__(self, theme, sun_dir):
        self.theme = theme
        self.sun = np.array(sun_dir, dtype=np.float32)
        self.cloud_noise = Noise2D(256, 21, 3)
        self.wisp = Noise2D(256, 33, 2)
        self.zen = s2l([44, 96, 158] if theme == "day" else ([195, 205, 220] if theme == "indoor" else [8, 13, 30]))
        self.hor = s2l([170, 196, 216] if theme == "day" else ([150, 156, 162] if theme == "indoor" else [34, 44, 62]))
        self.haze = s2l([196, 206, 214] if theme == "day" else ([120, 124, 128] if theme == "indoor" else [22, 28, 42]))
        self.sun_col = s2l([255, 244, 224] if theme == "day" else [200, 214, 244])
        self.hill = s2l([96, 104, 96] if theme == "day" else [14, 18, 26])
        self.tree = s2l([44, 64, 46] if theme == "day" else [10, 16, 14])

    def ridge(self, az):
        s = (0.022
             + 0.012 * np.sin(az * 2.0 + 1.1)
             + 0.007 * np.sin(az * 5.0 + 2.7)
             + 0.0035 * np.sin(az * 11.0 + 0.4)
             + 0.0020 * np.sin(az * 23.0 + 1.7))
        # 北侧远处工业区 / 城市楼群
        blocks = np.clip(np.sin(az * 9.0 + 0.8), 0, 1) ** 8 * 0.012
        s = s + blocks
        return np.clip(s, 0.008, 0.062)

    def color(self, dx, dy, dz):
        th = self.theme
        el = np.arcsin(np.clip(dz, -1, 1))
        az = np.arctan2(dx, dy)
        eln = np.clip(el / (math.pi / 2), 0, 1)

        col = self.hor + (self.zen - self.hor) * (eln[:, None] ** np.float32(0.65))

        if th != "indoor":
            g = np.clip(dx * self.sun[0] + dy * self.sun[1] + dz * self.sun[2], 0, 1)
            col = col + self.sun_col * (0.06 * g ** 5 + 0.55 * g ** 220)[:, None]
            if th == "day":
                col[g > 0.99975] = s2l([255, 252, 238])
            else:
                col[g > 0.99990] = s2l([226, 234, 250])

        # 地平线雾霾
        hz = np.exp(-np.clip(el, 0, None) / 0.05)[:, None]
        col = col * (1 - 0.8 * hz) + self.haze * (0.8 * hz)

        # 远山 / 树线
        rr = self.ridge(az)
        land = (el < rr) & (el > -0.001)
        if np.any(land):
            k = np.clip(el[land] / np.maximum(rr[land], 1e-4), 0, 1)[:, None]
            col[land] = self.hill * (0.55 + 0.45 * k) + self.haze * (0.55 * (1 - k))

        # 云
        if th == "day":
            above = el > 0.035
            if np.any(above):
                t = (1500.0 - EYE[2]) / np.maximum(dz[above], 1e-4)
                px = EYE[0] + t * dx[above]
                py = EYE[1] + t * dy[above]
                c = fbm(self.cloud_noise, px, py, 6, 0.012, 0.55)
                c2 = fbm(self.wisp, px, py, 4, 0.06, 0.5)
                dens = np.clip((c - 0.56) * 4.0, 0, 1) * np.clip((el[above] - 0.05) / 0.10, 0, 1)
                shade = np.clip(0.80 + 0.35 * (c2 - 0.4), 0.6, 1.05)
                cloud = np.stack([shade * 1.0, shade * 0.99, shade * 0.97], -1) * 1.02
                col[above] = col[above] * (1 - dens[:, None]) + cloud * dens[:, None]
        elif th == "night":
            h = np.sin(dx * 1024.0) * np.sin(dy * 1024.0) * np.sin(dz * 1024.0)
            star = (h > 0.995) & (el > 0.10)
            col[star] = np.array([0.62, 0.66, 0.78], np.float32)
        return col


# =============================================================================
# 五、渲染器
# =============================================================================
class Renderer:
    def __init__(self, theme, W, H, ground, lamps, sun_dir):
        self.theme = theme
        self.W, self.H = W, H
        self.ground_img, self.ppm, self.gx, self.gy = ground
        self.ground_img = s2l(self.ground_img.astype(np.float32) / 255.0)
        self.sun = np.array(sun_dir, np.float32)
        self.sun = self.sun / np.linalg.norm(self.sun)
        self.lamps = [(np.array(p, np.float32), s2l(np.array(c, np.float32) / 255.0), s)
                      for (p, c, s) in lamps]
        self.sky = Sky(theme, self.sun)
        self.kind = np.array(PRIM_KIND, dtype=np.int8)
        self.a = np.array(PRIM_A, dtype=np.float32)
        self.col = s2l(np.array(PRIM_COLOR, dtype=np.float32))
        self.n = len(PRIM_KIND)
        self.spec = np.array(PRIM_SPEC, np.float32)
        self.emit = np.array(PRIM_EMIT, np.float32)
        self.shin = np.array(PRIM_SHIN, np.float32)
        self.tex = Noise2D(256, 77, 3)
        self._prep_bbox()
        self.shadow_map = None

    # ---------- 图元包围盒（像素范围） ----------
    def _bounds(self, i):
        k = self.kind[i]
        a = self.a[i]
        if k == 0:
            mn = np.array([a[0], a[2], a[4]], np.float32)
            mx = np.array([a[1], a[3], a[5]], np.float32)
        elif k == 1:
            mn = np.array([a[0] - a[2], a[1] - a[2], a[3]], np.float32)
            mx = np.array([a[0] + a[2], a[1] + a[2], a[4]], np.float32)
        elif k == 2:
            mn = np.array([a[0], a[2] - a[4], a[3] - a[4]], np.float32)
            mx = np.array([a[1], a[2] + a[4], a[3] + a[4]], np.float32)
        else:
            mn = np.array([a[2] - a[4], a[0], a[3] - a[4]], np.float32)
            mx = np.array([a[2] + a[4], a[1], a[3] + a[4]], np.float32)
        return mn, mx

    def _prep_bbox(self):
        self.rects = []
        for i in range(self.n):
            mn, mx = self._bounds(i)
            c = (mn + mx) / 2
            r = float(np.linalg.norm(mx - mn) / 2)
            v = c - EYE
            d = float(np.linalg.norm(v))
            if d < r:
                self.rects.append([(0, self.H, 0, self.W)])
                continue
            ang = math.asin(min(0.999, r / d)) + 2.0 * DEG
            az0 = math.atan2(float(v[0]), float(v[1]))
            el0 = math.asin(float(v[2]) / d)
            r0 = max(0, int(math.floor(self.H * (0.5 - (el0 + ang) / math.pi) - 4)))
            r1 = min(self.H, int(math.ceil(self.H * (0.5 - (el0 - ang) / math.pi) + 4)))
            az_lo, az_hi = az0 - ang, az0 + ang
            if az_hi - az_lo >= 2 * math.pi:
                cs = [(0, self.W)]
            else:
                cs = []
                for k in range(-1, 3):
                    lo = az_lo + k * 2 * math.pi
                    hi = az_hi + k * 2 * math.pi
                    c0 = int(math.floor(self.W * (lo / (2 * math.pi) + 0.5))) - 4
                    c1 = int(math.ceil(self.W * (hi / (2 * math.pi) + 0.5))) + 4
                    lo_c, hi_c = max(0, c0), min(self.W, c1)
                    if lo_c < hi_c:
                        cs.append((lo_c, hi_c))
            if r0 < r1 and cs:
                self.rects.append([(r0, r1, a_, b_) for (a_, b_) in cs])
            else:
                self.rects.append([])

    # ---------- 交点 ----------
    def intersect(self, i, dx, dy, dz):
        k = self.kind[i]
        a = self.a[i]
        t = np.full(dx.shape, INF, np.float32)
        if k == 0:
            x0, x1, y0, y1, z0, z1 = a[0], a[1], a[2], a[3], a[4], a[5]
            with np.errstate(divide="ignore", invalid="ignore"):
                ix = 1.0 / dx; iy = 1.0 / dy; iz = 1.0 / dz
                tx1 = (x0 - EYE[0]) * ix; tx2 = (x1 - EYE[0]) * ix
                ty1 = (y0 - EYE[1]) * iy; ty2 = (y1 - EYE[1]) * iy
                tz1 = (z0 - EYE[2]) * iz; tz2 = (z1 - EYE[2]) * iz
                tmin = np.maximum(np.maximum(np.minimum(tx1, tx2), np.minimum(ty1, ty2)), np.minimum(tz1, tz2))
                tmax = np.minimum(np.minimum(np.maximum(tx1, tx2), np.maximum(ty1, ty2)), np.maximum(tz1, tz2))
                ok = (tmax >= np.maximum(tmin, 0)) & (tmin > 0)
                t[ok] = tmin[ok]
        elif k == 1:
            cx, cy, r, z0, z1 = a[0], a[1], a[2], a[3], a[4]
            ox, oy = EYE[0] - cx, EYE[1] - cy
            A = dx * dx + dy * dy
            B = 2 * (ox * dx + oy * dy)
            C = ox * ox + oy * oy - r * r
            disc = B * B - 4 * A * C
            good = (disc > 0) & (A > 1e-9)
            if np.any(good):
                sq = np.sqrt(np.where(good, disc, 0))
                tt = (-B - sq) / (2 * np.where(A > 1e-9, A, 1))
                zz = EYE[2] + tt * dz
                ok = good & (tt > 0) & (zz >= z0) & (zz <= z1)
                t[ok] = tt[ok]
        elif k == 2:
            x0, x1, cy, cz, r = a[0], a[1], a[2], a[3], a[4]
            oy, oz = EYE[1] - cy, EYE[2] - cz
            A = dy * dy + dz * dz
            B = 2 * (oy * dy + oz * dz)
            C = oy * oy + oz * oz - r * r
            disc = B * B - 4 * A * C
            good = (disc > 0) & (A > 1e-9)
            if np.any(good):
                sq = np.sqrt(np.where(good, disc, 0))
                tt = (-B - sq) / (2 * np.where(A > 1e-9, A, 1))
                xx = EYE[0] + tt * dx
                ok = good & (tt > 0) & (xx >= x0) & (xx <= x1)
                t[ok] = tt[ok]
        else:
            y0, y1, cx, cz, r = a[0], a[1], a[2], a[3], a[4]
            ox, oz = EYE[0] - cx, EYE[2] - cz
            A = dx * dx + dz * dz
            B = 2 * (ox * dx + oz * dz)
            C = ox * ox + oz * oz - r * r
            disc = B * B - 4 * A * C
            good = (disc > 0) & (A > 1e-9)
            if np.any(good):
                sq = np.sqrt(np.where(good, disc, 0))
                tt = (-B - sq) / (2 * np.where(A > 1e-9, A, 1))
                yy = EYE[1] + tt * dy
                ok = good & (tt > 0) & (yy >= y0) & (yy <= y1)
                t[ok] = tt[ok]
        return t

    # ---------- 阴影贴图 ----------
    def build_shadow(self, res=2048, span=170.0):
        img = Image.new("L", (res, res), 0)
        dr = ImageDraw.Draw(img)
        L = self.sun

        def proj(x, y, z):
            return (x - float(L[0]) / float(L[2]) * z, y - float(L[1]) / float(L[2]) * z)

        def to_px(px, py):
            return ((px - self.gx) * (res / span) + res / 2,
                    (self.gy - py) * (res / span) + res / 2)

        def hull(pts):
            pts = sorted(set((round(float(a), 3), round(float(b), 3)) for a, b in pts))
            if len(pts) < 3:
                return pts

            def cross(o, a, b):
                return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

            lower, upper = [], []
            for p in pts:
                while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
                    lower.pop()
                lower.append(p)
            for p in reversed(pts):
                while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
                    upper.pop()
                upper.append(p)
            return lower[:-1] + upper[:-1]

        for i in range(self.n):
            k = self.kind[i]
            a = self.a[i]
            pts = []
            if k == 0:
                for x in (a[0], a[1]):
                    for y in (a[2], a[3]):
                        for z in (a[4], a[5]):
                            pts.append(proj(x, y, z))
            elif k == 1:
                for z in (a[3], a[4]):
                    for j in range(12):
                        ang = 2 * math.pi * j / 12
                        pts.append(proj(a[0] + a[2] * math.cos(ang), a[1] + a[2] * math.sin(ang), z))
            elif k == 2:
                for x in (a[0], a[1]):
                    for j in range(8):
                        ang = 2 * math.pi * j / 8
                        pts.append(proj(x, a[2] + a[4] * math.cos(ang), a[3] + a[4] * math.sin(ang)))
            else:
                for y in (a[0], a[1]):
                    for j in range(8):
                        ang = 2 * math.pi * j / 8
                        pts.append(proj(a[2] + a[4] * math.cos(ang), y, a[3] + a[4] * math.sin(ang)))
            hp = hull(pts)
            if len(hp) >= 3:
                dr.polygon([to_px(x, y) for (x, y) in hp], fill=255)
        img = img.filter(ImageFilter.GaussianBlur(2.0))
        self.shadow_map = np.asarray(img).astype(np.float32) / 255.0
        self.shadow_span = span
        self.shadow_res = res

    def shadow_at(self, x, y):
        u = ((x - self.gx) * (self.shadow_res / self.shadow_span) + self.shadow_res / 2).astype(np.int32)
        v = ((self.gy - y) * (self.shadow_res / self.shadow_span) + self.shadow_res / 2).astype(np.int32)
        u = np.clip(u, 0, self.shadow_res - 1)
        v = np.clip(v, 0, self.shadow_res - 1)
        return self.shadow_map[v, u]

    def ground_albedo(self, x, y):
        H, W = self.ground_img.shape[:2]
        u = ((x - self.gx) * self.ppm + W / 2).astype(np.int32)
        v = ((self.gy - y) * self.ppm + H / 2).astype(np.int32)
        u = np.clip(u, 0, W - 1)
        v = np.clip(v, 0, H - 1)
        return self.ground_img[v, u]

    # ---------- 主渲染 ----------
    def render(self, tile=128, progress=None):
        W, H = self.W, self.H
        out = np.zeros((H, W, 3), np.float32)
        th = self.theme
        if th == "day":
            sun_i = 2.35
            sun_col = s2l([255, 246, 226])
            amb_sky = s2l([176, 198, 224]) * 0.55
            amb_gnd = s2l([142, 134, 118]) * 0.20
            fog = s2l([196, 206, 214])
        elif th == "night":
            sun_i = 0.30
            sun_col = s2l([150, 176, 226])
            amb_sky = s2l([34, 46, 74]) * 0.75
            amb_gnd = s2l([20, 18, 16]) * 0.20
            fog = s2l([20, 26, 40])
        else:
            sun_i = 0.9
            sun_col = s2l([228, 232, 240])
            amb_sky = s2l([120, 124, 130]) * 0.9
            amb_gnd = s2l([80, 80, 78]) * 0.4
            fog = s2l([120, 124, 128])

        L = self.sun
        for y0 in range(0, H, tile):
            y1 = min(H, y0 + tile)
            n = (y1 - y0) * W
            rows = np.arange(y0, y1, dtype=np.float32)[:, None]
            el = (0.5 - (rows + 0.5) / H) * math.pi
            aux = np.arange(W, dtype=np.float32)[None, :]
            az = ((aux + 0.5) / W - 0.5) * (2 * math.pi)
            ce = np.cos(el)
            dx = (ce * np.sin(az)).astype(np.float32)
            dy = (ce * np.cos(az)).astype(np.float32)
            dz = np.broadcast_to(np.sin(el), (y1 - y0, W)).astype(np.float32)

            T = np.full((y1 - y0, W), INF, np.float32)
            ID = np.full((y1 - y0, W), -1, np.int16)

            for i in range(self.n):
                for (r0, r1, c0, c1) in self.rects[i]:
                    rr0 = max(r0, y0); rr1 = min(r1, y1)
                    if rr0 >= rr1:
                        continue
                    sl = (slice(rr0 - y0, rr1 - y0), slice(c0, c1))
                    t = self.intersect(i, dx[sl], dy[sl], dz[sl])
                    sub = T[sl]
                    m = t < sub
                    if not m.any():
                        continue
                    sub[m] = t[m]
                    ID[sl][m] = i

            flat_dx = dx.reshape(-1); flat_dy = dy.reshape(-1); flat_dz = dz.reshape(-1)
            t = T.reshape(-1); idx = ID.reshape(-1)
            hit = idx >= 0
            rgb = np.zeros((n, 3), np.float32)

            if np.any(~hit):
                rgb[~hit] = self.sky.color(flat_dx[~hit], flat_dy[~hit], flat_dz[~hit])

            gmask = (~hit) & (flat_dz < -1e-4)
            if np.any(gmask):
                gg = np.flatnonzero(gmask)
                t_g = -EYE[2] / flat_dz[gg]
                gx = EYE[0] + t_g * flat_dx[gg]
                gy = EYE[1] + t_g * flat_dy[gg]
                alb = self.ground_albedo(gx, gy)
                sh = 1.0 - 0.70 * self.shadow_at(gx, gy)
                ndl = max(float(L[2]), 0.0)
                lit = alb * (amb_sky * 1.0 + amb_gnd * 1.0 + sun_col * sun_i * ndl * sh[:, None])
                f = (1.0 - np.exp(-(t_g / 210.0) ** 1.5)) * 0.55
                lit = lit * (1 - f[:, None]) + fog * f[:, None]
                rgb[gg] = lit

            if np.any(hit):
                hi = np.flatnonzero(hit)
                hti = idx[hi]
                th_ = t[hi]
                px = EYE[0] + th_ * flat_dx[hi]
                py = EYE[1] + th_ * flat_dy[hi]
                pz = EYE[2] + th_ * flat_dz[hi]

                k = self.kind[hti]
                a = self.a[hti]
                nrm = np.zeros((len(hi), 3), np.float32)
                mb = k == 0
                if np.any(mb):
                    aa = a[mb]
                    ex_ = np.stack([np.abs(px[mb] - aa[:, 0]), np.abs(px[mb] - aa[:, 1]),
                                    np.abs(py[mb] - aa[:, 2]), np.abs(py[mb] - aa[:, 3]),
                                    np.abs(pz[mb] - aa[:, 4]), np.abs(pz[mb] - aa[:, 5])], 1)
                    fi = np.argmin(ex_, 1)
                    nn = np.zeros((mb.sum(), 3), np.float32)
                    nn[fi == 0, 0] = -1; nn[fi == 1, 0] = 1
                    nn[fi == 2, 1] = -1; nn[fi == 3, 1] = 1
                    nn[fi == 4, 2] = -1; nn[fi == 5, 2] = 1
                    nrm[mb] = nn
                mc = k == 1
                if np.any(mc):
                    aa = a[mc]
                    nrm[mc, 0] = (px[mc] - aa[:, 0]) / np.maximum(aa[:, 2], 1e-5)
                    nrm[mc, 1] = (py[mc] - aa[:, 1]) / np.maximum(aa[:, 2], 1e-5)
                m2 = k == 2
                if np.any(m2):
                    aa = a[m2]
                    nrm[m2, 1] = (py[m2] - aa[:, 2]) / np.maximum(aa[:, 4], 1e-5)
                    nrm[m2, 2] = (pz[m2] - aa[:, 3]) / np.maximum(aa[:, 4], 1e-5)
                m3 = k == 3
                if np.any(m3):
                    aa = a[m3]
                    nrm[m3, 0] = (px[m3] - aa[:, 2]) / np.maximum(aa[:, 4], 1e-5)
                    nrm[m3, 2] = (pz[m3] - aa[:, 3]) / np.maximum(aa[:, 4], 1e-5)

                nrm = nrm / (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-6)
                alb = self.col[hti]

                # 表面细微纹理，避免塑料感
                tv = self.tex.sample(px * 7.0 + pz * 5.0, py * 7.0 - pz * 4.0)
                alb = alb * (0.90 + 0.20 * tv)[:, None]

                ndl = np.clip(nrm @ L, 0, 1)
                up = np.clip(nrm[:, 2], 0, 1)
                ambient = amb_sky * (0.55 + 0.45 * up)[:, None] + amb_gnd * (0.55 - 0.45 * up)[:, None]
                # 接触阴影：越靠近地面越暗（用顶视阴影图衰减近似）
                occ = 1.0 - 0.55 * (1.0 - self.shadow_at(px, py)) * np.exp(-np.clip(pz, 0, None) / 2.2)
                col = alb * (ambient + sun_col * sun_i * ndl[:, None] * occ[:, None])

                V = -np.stack([flat_dx[hi], flat_dy[hi], flat_dz[hi]], 1)
                Hv = L[None, :] + V
                Hv /= (np.linalg.norm(Hv, axis=1, keepdims=True) + 1e-6)
                ndh = np.clip(np.sum(nrm * Hv, 1), 0, 1)
                spec = (self.spec[hti] * (ndh ** self.shin[hti]))[:, None] * sun_col * sun_i
                col = col + spec * 0.45

                em = self.emit[hti]
                if np.any(em > 0):
                    glow_col = alb * (1.8 * em)[:, None]
                    col = col * (1 - em[:, None]) + glow_col

                for (lp, lc, inten) in self.lamps:
                    lv = lp[None, :] - np.stack([px, py, pz], 1)
                    dist2 = np.sum(lv * lv, 1) + 0.8
                    lvn = lv / np.sqrt(dist2)[:, None]
                    ndl2 = np.clip(np.sum(nrm * lvn, 1), 0, 1)
                    att = inten / (dist2 * 6.0 + 4.0) * 0.11
                    col = col + alb * (lc[None, :] * (ndl2 * att)[:, None])

                f = (1.0 - np.exp(-(th_ / 230.0) ** 1.5)) * 0.50
                col = col * (1 - f[:, None]) + fog * f[:, None]
                rgb[hi] = np.clip(col, 0, 1)

            if th == "night":
                rgb = 1.0 - np.exp(-rgb * 1.25)
            out[y0:y1] = rgb.reshape(y1 - y0, W, 3)
            if progress:
                progress(y1, H)

        return l2s(out)


# =============================================================================
# 六、后处理 / 输出 / 预览
# =============================================================================
def postprocess(arr, theme):
    img = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), "RGB")
    if theme == "night":
        px = np.asarray(img).astype(np.float32) / 255.0
        lum = px.max(axis=2)
        bright = (lum > 0.55).astype(np.float32)
        glow = np.stack([px[..., i] * bright for i in range(3)], -1) * 255
        gimg = Image.fromarray(np.clip(glow, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24))
        px = px + np.asarray(gimg).astype(np.float32) / 255.0 * 0.6
        img = Image.fromarray(np.clip(px * 255, 0, 255).astype(np.uint8))
        img = img.filter(ImageFilter.GaussianBlur(0.35))
    else:
        img = Image.fromarray(np.clip(np.asarray(img).astype(np.float32) * 0.96, 0, 255).astype(np.uint8))
        img = img.filter(ImageFilter.UnsharpMask(radius=2.2, percent=55, threshold=3))
    return img


def app_preview(img, out, w=1280, h=740, yaw=0.0, pitch=0.0):
    """模拟 scene-3d.js 的底图取图逻辑，输出“App 里实际看到的样子”。"""
    iw, ih = img.size
    focal = min(h * 1.05, w * 0.62)
    fovX = 2 * math.atan(w / (2 * focal))
    fovY = 2 * math.atan(h / (2 * focal))
    uC = (yaw / (2 * math.pi) + 0.5) % 1.0
    vC = min(0.95, max(0.05, 0.5 - pitch / math.pi))
    srcW = fovX / (2 * math.pi) * iw
    srcH = fovY / math.pi * ih
    srcX = uC * iw - srcW / 2
    srcY = min(max(vC * ih - srcH / 2, 0), ih - srcH)
    canvas = Image.new("RGB", (w, h))
    normX = srcX % iw
    if normX + srcW <= iw:
        canvas.paste(img.crop((int(normX), int(srcY), int(normX + srcW), int(srcY + srcH))).resize((w, h), Image.LANCZOS), (0, 0))
    else:
        w1 = iw - normX
        part1 = img.crop((int(normX), int(srcY), iw, int(srcY + srcH))).resize((int(w * w1 / srcW), h), Image.LANCZOS)
        part2 = img.crop((0, int(srcY), int(srcW - w1), int(srcY + srcH))).resize((w - part1.width, h), Image.LANCZOS)
        canvas.paste(part1, (0, 0))
        canvas.paste(part2, (part1.width, 0))
    canvas.save(out, quality=90)
    return out


def orbit_forward(preset):
    tx, ty, tz, yaw, pitch, dist = preset
    cp = math.cos(pitch)
    cx = tx + dist * cp * math.sin(yaw)
    cy = ty - dist * cp * math.cos(yaw)
    cz = tz + dist * math.sin(pitch)
    fx, fy, fz = tx - cx, ty - cy, tz - cz
    ln = math.sqrt(fx * fx + fy * fy + fz * fz)
    f = (fx / ln, fy / ln, fz / ln)
    return math.atan2(f[0], f[1]), math.atan2(f[2], math.hypot(f[0], f[1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme", default="day", choices=["day", "night", "indoor"])
    ap.add_argument("--out", default=None)
    ap.add_argument("--width", type=int, default=4096)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--eye", default="fps", choices=["fps", "overview"])
    args = ap.parse_args()

    W = args.width
    H = W // 2
    theme = args.theme

    global EYE
    if args.eye == "overview":
        EYE = np.array([-3.959, -26.268, 13.838], dtype=np.float32)

    if theme == "night":
        sun = np.array([-0.30, -0.62, 0.38], np.float32)
    elif theme == "indoor":
        sun = np.array([0.10, 0.22, 0.96], np.float32)
    else:
        sun = np.array([-0.42, -0.52, 0.74], np.float32)
    sun = sun / np.linalg.norm(sun)

    ground = build_ground_texture(theme)
    lamps = build_scene(theme)
    r = Renderer(theme, W, H, ground, lamps, sun)
    r.build_shadow(res=2048, span=150.0)
    done = [0]

    def prog(y, h):
        if y - done[0] >= h // 6:
            done[0] = y
            print(f"  渲染 {y}/{h}", flush=True)

    arr = r.render(progress=prog)
    img = postprocess(arr, theme)
    out = args.out or f"assets/3d-test/pano_{theme}_{W}.jpg"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, quality=88, subsampling=1, optimize=True)
    print(f"✔ {out}  {W}x{H}  {os.path.getsize(out) / 1024:.0f} KB")

    if args.preview:
        if args.eye == "fps":
            angH, angV = 0.02, 0.14          # 第一人称预设 yaw / pitch
        else:
            angH, angV = orbit_forward((1.8, -0.5, 4.5, -0.22, 0.34, 28.0))
        p = os.path.splitext(out)[0] + "_app预览.jpg"
        app_preview(img, p, 1280, 740, angH, angV)
        print("✔", p)


if __name__ == "__main__":
    main()
