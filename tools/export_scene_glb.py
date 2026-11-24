#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 WMPSES 的 3D 孪生场景导出为 glTF 2.0 二进制 (.glb)。

用途：
  - 用 Blender（免费）打开 → 改材质 / 加灯光 / 用「Panoramic > Equirectangular」
    相机渲出 4096×2048 的 360° 全景底图（正好是「更换 3D 底图」要求的 2:1）。
  - 也可以导入 SketchUp / 3ds Max / C4D / UE 继续编辑。

导出内容：
  - 全部设备几何（按材质颜色合并，Blender 里不会出现几百个小物件）
  - 地面
  - 两台相机：总览机位、第一人称机位（与系统预设一致）

用法：python3 tools/export_scene_glb.py
"""

import json
import math
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import panorama_360 as pano  # noqa: E402

OUT = "assets/3d-test/WMPSES装置_可编辑.glb"


def up(p):
    """Z-up 右手系 -> glTF 的 Y-up 右手系。"""
    x, y, z = p
    return (x, z, -y)


def up_n(n):
    x, y, z = n
    return (x, z, -y)


# ---------------------------------------------------------------- 图元三角化
def box_tris(a):
    x0, x1, y0, y1, z0, z1 = (a[0], a[1], a[2], a[3], a[4], a[5])
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    out = []
    for f in faces:
        p0, p1, p2, p3 = (v[i] for i in f)
        n = np.cross(np.subtract(p1, p0), np.subtract(p2, p0))
        ln = np.linalg.norm(n)
        n = tuple(n / ln) if ln > 1e-9 else (0.0, 0.0, 1.0)
        out.append((p0, p1, p2, n))
        out.append((p0, p2, p3, n))
    return out


def cyl_tris(a, seg=20):
    cx, cy, r, z0, z1 = (a[0], a[1], a[2], a[3], a[4])
    out = []
    for i in range(seg):
        a0 = 2 * math.pi * i / seg
        a1 = 2 * math.pi * (i + 1) / seg
        am = (a0 + a1) / 2
        p0 = (cx + r * math.cos(a0), cy + r * math.sin(a0), z0)
        p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1), z0)
        p2 = (cx + r * math.cos(a1), cy + r * math.sin(a1), z1)
        p3 = (cx + r * math.cos(a0), cy + r * math.sin(a0), z1)
        n = (math.cos(am), math.sin(am), 0.0)
        out.append((p0, p1, p2, n))
        out.append((p0, p2, p3, n))
        out.append(((cx, cy, z0), p1, p0, (0.0, 0.0, -1.0)))
        out.append(((cx, cy, z1), p3, p2, (0.0, 0.0, 1.0)))
    return out


def hcyl_x_tris(a, seg=14):
    x0, x1, cy, cz, r = (a[0], a[1], a[2], a[3], a[4])
    out = []
    for i in range(seg):
        a0 = 2 * math.pi * i / seg
        a1 = 2 * math.pi * (i + 1) / seg
        am = (a0 + a1) / 2
        n = (0.0, math.cos(am), math.sin(am))
        p0 = (x0, cy + r * math.cos(a0), cz + r * math.sin(a0))
        p1 = (x1, cy + r * math.cos(a0), cz + r * math.sin(a0))
        p2 = (x1, cy + r * math.cos(a1), cz + r * math.sin(a1))
        p3 = (x0, cy + r * math.cos(a1), cz + r * math.sin(a1))
        out.append((p0, p1, p2, n))
        out.append((p0, p2, p3, n))
        out.append(((x0, cy, cz), p3, p0, (-1.0, 0.0, 0.0)))
        out.append(((x1, cy, cz), p1, p2, (1.0, 0.0, 0.0)))
    return out


def hcyl_y_tris(a, seg=14):
    y0, y1, cx, cz, r = (a[0], a[1], a[2], a[3], a[4])
    out = []
    for i in range(seg):
        a0 = 2 * math.pi * i / seg
        a1 = 2 * math.pi * (i + 1) / seg
        am = (a0 + a1) / 2
        n = (math.cos(am), 0.0, math.sin(am))
        p0 = (cx + r * math.cos(a0), y0, cz + r * math.sin(a0))
        p1 = (cx + r * math.cos(a0), y1, cz + r * math.sin(a0))
        p2 = (cx + r * math.cos(a1), y1, cz + r * math.sin(a1))
        p3 = (cx + r * math.cos(a1), y0, cz + r * math.sin(a1))
        out.append((p0, p1, p2, n))
        out.append((p0, p2, p3, n))
        out.append(((cx, y0, cz), p3, p0, (0.0, -1.0, 0.0)))
        out.append(((cx, y1, cz), p1, p2, (0.0, 1.0, 0.0)))
    return out


def plane_tris(size, z):
    h = size / 2
    p0, p1, p2, p3 = (-h, -h, z), (h, -h, z), (h, h, z), (-h, h, z)
    n = (0.0, 0.0, 1.0)
    return [(p0, p1, p2, n), (p0, p2, p3, n)]


def camera_matrix(pos, target):
    """glTF 相机：朝 -Z、上 +Y。返回列主序 16 元矩阵。"""
    p = np.array(pos, dtype=np.float64)
    f = np.array(target, dtype=np.float64) - p
    f /= np.linalg.norm(f)
    upv = np.array([0.0, 1.0, 0.0])
    if abs(float(np.dot(f, upv))) > 0.999:
        upv = np.array([0.0, 0.0, 1.0])
    r = np.cross(f, upv)
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    m = np.eye(4)
    m[0:3, 0] = r
    m[0:3, 1] = u
    m[0:3, 2] = -f
    m[0:3, 3] = p
    return m.reshape(-1).tolist()


def main():
    pano.build_scene("day")

    groups = {}
    n_tris = 0
    for i in range(len(pano.PRIM_KIND)):
        k = pano.PRIM_KIND[i]
        a = pano.PRIM_A[i]
        col = pano.PRIM_COLOR[i]

        def q(v):
            return round(round(float(v) * 12.0) / 12.0, 3)

        key = (q(col[0]), q(col[1]), q(col[2]), round(float(pano.PRIM_SPEC[i]), 1))
        if k == 0:
            tris = box_tris(a)
        elif k == 1:
            tris = cyl_tris(a, 20 if a[2] > 0.35 else 12)
        elif k == 2:
            tris = hcyl_x_tris(a)
        else:
            tris = hcyl_y_tris(a)
        groups.setdefault(key, []).extend(tris)
        n_tris += len(tris)

    # 地面
    groups.setdefault((0.47, 0.47, 0.46, 0.02), []).extend(plane_tris(2000.0, 0.0))

    bin_parts = []
    buffer_offset = 0
    buffer_views = []
    accessors = []

    def add_view(data, target):
        nonlocal buffer_offset
        while len(data) % 4:
            data += b"\x00"
        off = buffer_offset
        bin_parts.append(data)
        buffer_offset += len(data)
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            bv["target"] = target
        buffer_views.append(bv)
        return len(buffer_views) - 1

    meshes, materials, nodes = [], [], []

    for key, tris in groups.items():
        if not tris:
            continue
        verts, norms, idx = [], [], []
        for (p0, p1, p2, n) in tris:
            base = len(verts)
            for p in (p0, p1, p2):
                verts.append(up(p))
                norms.append(up_n(n))
            idx.extend([base, base + 1, base + 2])

        pos_arr = np.asarray(verts, dtype=np.float32)
        nrm_arr = np.asarray(norms, dtype=np.float32)
        idx_arr = np.asarray(idx, dtype=np.uint32)

        pv = add_view(pos_arr.tobytes(), 34962)
        nv = add_view(nrm_arr.tobytes(), 34962)
        iv = add_view(idx_arr.tobytes(), 34963)

        a_pos = len(accessors)
        accessors.append({"bufferView": pv, "componentType": 5126, "count": len(verts),
                          "type": "VEC3", "min": pos_arr.min(axis=0).tolist(),
                          "max": pos_arr.max(axis=0).tolist()})
        a_nrm = len(accessors)
        accessors.append({"bufferView": nv, "componentType": 5126, "count": len(verts), "type": "VEC3"})
        a_idx = len(accessors)
        accessors.append({"bufferView": iv, "componentType": 5125, "count": len(idx), "type": "SCALAR"})

        r, g, b, spec = key
        materials.append({
            "name": f"mat_{r:.2f}_{g:.2f}_{b:.2f}",
            "pbrMetallicRoughness": {
                "baseColorFactor": [float(r) ** 2.2, float(g) ** 2.2, float(b) ** 2.2, 1.0],
                "metallicFactor": 0.0 if spec < 0.2 else 0.3,
                "roughnessFactor": max(0.15, min(1.0, 1.0 - spec)),
            },
        })
        name = "ground" if key == (0.47, 0.47, 0.46, 0.02) else f"part_{len(meshes):03d}"
        meshes.append({"name": name, "primitives": [{
            "attributes": {"POSITION": a_pos, "NORMAL": a_nrm},
            "indices": a_idx, "material": len(materials) - 1}]})

    for mi, m in enumerate(meshes):
        nodes.append({"mesh": mi, "name": m["name"]})

    cameras = [
        {"type": "perspective", "name": "CAM_总览",
         "perspective": {"yfov": 0.85, "znear": 0.1, "zfar": 2000.0}},
        {"type": "perspective", "name": "CAM_第一人称",
         "perspective": {"yfov": 0.85, "znear": 0.05, "zfar": 2000.0}},
    ]
    ov = up((-3.959, -26.268, 13.838))
    ov_t = up((1.8, -0.5, 4.5))
    fp = up((1.5, -17.5, 1.75))
    fp_t = up((1.52, -16.5, 1.89))
    nodes.append({"camera": 0, "name": "CAM_总览", "matrix": camera_matrix(ov, ov_t)})
    nodes.append({"camera": 1, "name": "CAM_第一人称", "matrix": camera_matrix(fp, fp_t)})

    gltf = {
        "asset": {"version": "2.0", "generator": "WMPSES scene exporter"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": 0}],
        "cameras": cameras,
    }

    bin_blob = b"".join(bin_parts)
    while len(bin_blob) % 4:
        bin_blob += b"\x00"
    gltf["buffers"][0]["byteLength"] = len(bin_blob)

    json_blob = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_blob) % 4:
        json_blob += b" "

    total = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    with open(OUT, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_blob), 0x4E4F534A))
        f.write(json_blob)
        f.write(struct.pack("<II", len(bin_blob), 0x004E4942))
        f.write(bin_blob)

    print(f"✔ {OUT}  {os.path.getsize(OUT) / 1024 / 1024:.1f} MB")
    print(f"  三角面 {n_tris:,} · 材质 {len(materials)} · 网格 {len(meshes)} · 相机 2")


if __name__ == "__main__":
    main()
