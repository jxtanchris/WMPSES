#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成「全景图为什么能转」的演示素材：
  1) 全景旋转演示.gif —— 同一张 JPG，只移动取景窗口，做出 360° 环绕动画
  2) 全景取景原理.jpg —— 左边整张全景 + 右边四个不同朝向的取景窗口
取图逻辑与 js/scene-3d.js 的 drawBackgroundAndFloor() 完全一致。
"""

import math
import os

from PIL import Image, ImageDraw, ImageFont

SRC = "assets/3d-test/3D全景底图A_白天装置区.jpg"
OUT_DIR = "assets/3d-test"


def font(size):
    for p in ("/System/Library/Fonts/PingFang.ttc",
              "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def view(img, w, h, yaw, pitch):
    """模拟 scene-3d.js：按相机方位角/俯仰角，从全景图上裁一块窗口。"""
    iw, ih = img.size
    focal = min(h * 1.05, w * 0.62)
    fov_x = 2 * math.atan(w / (2 * focal))
    fov_y = 2 * math.atan(h / (2 * focal))
    uc = (yaw / (2 * math.pi) + 0.5) % 1.0
    vc = min(0.95, max(0.05, 0.5 - pitch / math.pi))
    sw = fov_x / (2 * math.pi) * iw
    sh = fov_y / math.pi * ih
    sx = uc * iw - sw / 2
    sy = min(max(vc * ih - sh / 2, 0), ih - sh)

    canvas = Image.new("RGB", (w, h))
    nx = sx % iw
    if nx + sw <= iw:
        canvas.paste(img.crop((int(nx), int(sy), int(nx + sw), int(sy + sh))).resize((w, h), Image.LANCZOS), (0, 0))
    else:
        w1 = iw - nx
        p1 = img.crop((int(nx), int(sy), iw, int(sy + sh))).resize((max(1, int(w * w1 / sw)), h), Image.LANCZOS)
        p2 = img.crop((0, int(sy), int(sw - w1), int(sy + sh))).resize((max(1, w - p1.width), h), Image.LANCZOS)
        canvas.paste(p1, (0, 0))
        canvas.paste(p2, (p1.width, 0))
    return canvas


def make_gif(img, w=560, h=315, frames=40, pitch=-0.08):
    out = []
    for i in range(frames):
        yaw = 2 * math.pi * i / frames
        out.append(view(img, w, h, yaw, pitch))
    path = os.path.join(OUT_DIR, "全景旋转演示.gif")
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=96) for f in out]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=110, loop=0, optimize=True, disposal=2)
    print("✔", path, f"{os.path.getsize(path)/1024:.0f} KB")


def make_sheet(img):
    w, h = 560, 315
    yaws = [(0, "朝向 0°（正前方）"), (math.pi / 2, "右转 90°"), (math.pi, "转 180°（背后）"), (-math.pi / 2, "左转 90°")]
    sheet = Image.new("RGB", (w * 2 + 36, h * 2 + 170), (18, 24, 34))
    dr = ImageDraw.Draw(sheet)
    f1 = font(20)
    f2 = font(16)
    for i, (yaw, label) in enumerate(yaws):
        cx = 12 + (i % 2) * (w + 12)
        cy = 56 + (i // 2) * (h + 52)
        sheet.paste(view(img, w, h, yaw, -0.08), (cx, cy))
        dr.text((cx + 8, cy + h + 10), label, font=f2, fill=(190, 205, 220))
    dr.text((12, 16), "同一张全景 JPG，四个不同的「取景窗口」——图片没变，变的是窗口位置", font=f1, fill=(240, 245, 250))
    path = os.path.join(OUT_DIR, "全景取景原理.jpg")
    sheet.save(path, quality=88)
    print("✔", path)


def main():
    img = Image.open(SRC).convert("RGB")
    make_gif(img)
    make_sheet(img)


if __name__ == "__main__":
    main()
