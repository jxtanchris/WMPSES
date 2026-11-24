/**
 * WMPSES 零依赖 WebGL glTF 2.0 (.glb) 加载、渲染与射线拾取引擎
 *
 * 特性：
 * - 零外部 CDN 依赖，纯原生 WebGL2/WebGL1，离线与 FileMaker WebViewer 直接可用
 * - 完整解析 glTF 2.0 二进制 (.glb)：节点层级矩阵 (matrix / TRS)、多材质 PBR、嵌入式贴图 (PNG/JPEG/WebP)、自动补法线
 * - 自动将 glTF Y-up 坐标系转换为 WMPSES Z-up 坐标系 (x, y, z) -> (x, -z, y)，与系统 8 热点与预设机位无缝对齐
 * - 与 js/scene-3d.js 共享同一套相机基底与焦距，保证旋转、平移、缩放、第一人称漫游时热点 0 漂移
 * - 内置 AABB + Möller–Trumbore 三角网格射线拾取，支持命题团队在任意模型表面精准标定/拖拽热点
 */
(function (global) {
  'use strict';

  // glTF Y-up -> WMPSES Z-up (x' = x, y' = -z, z' = y)，列主序 4x4 矩阵
  const GLTF_TO_WMPSES = new Float32Array([
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1
  ]);

  function mat4Identity() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  function mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }

  function mat4FromTRS(t, r, s) {
    const x = r[0], y = r[1], z = r[2], w = r[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = s[0], sy = s[1], sz = s[2];
    const out = new Float32Array(16);
    out[0] = (1 - (yy + zz)) * sx;
    out[1] = (xy + wz) * sx;
    out[2] = (xz - wy) * sx;
    out[3] = 0;
    out[4] = (xy - wz) * sy;
    out[5] = (1 - (xx + zz)) * sy;
    out[6] = (yz + wx) * sy;
    out[7] = 0;
    out[8] = (xz + wy) * sz;
    out[9] = (yz - wx) * sz;
    out[10] = (1 - (xx + yy)) * sz;
    out[11] = 0;
    out[12] = t[0];
    out[13] = t[1];
    out[14] = t[2];
    out[15] = 1;
    return out;
  }

  function normalMat3FromMat4(m) {
    // 计算左上 3x3 的逆转置矩阵（用于非均匀缩放下的法线变换）
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[4], a11 = m[5], a12 = m[6];
    const a20 = m[8], a21 = m[9], a22 = m[10];
    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (Math.abs(det) < 1e-8) {
      return new Float32Array([a00, a01, a02, a10, a11, a12, a20, a21, a22]);
    }
    det = 1.0 / det;
    return new Float32Array([
      b01 * det,
      (-a22 * a01 + a02 * a21) * det,
      (a12 * a01 - a02 * a11) * det,
      b11 * det,
      (a22 * a00 - a02 * a20) * det,
      (-a12 * a00 + a02 * a10) * det,
      b21 * det,
      (-a21 * a00 + a01 * a20) * det,
      (a11 * a00 - a01 * a10) * det
    ]);
  }

  const TYPE_COMPONENTS = {
    SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16
  };

  function readAccessorFloat(gltf, binView, accessorIdx) {
    const acc = gltf.accessors[accessorIdx];
    if (!acc) return null;
    const bv = gltf.bufferViews[acc.bufferView];
    if (!bv) return null;
    const numComp = TYPE_COMPONENTS[acc.type] || 1;
    const count = acc.count;
    const baseOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const compSize = (acc.componentType === 5126 || acc.componentType === 5125) ? 4
      : (acc.componentType === 5122 || acc.componentType === 5123) ? 2 : 1;
    const stride = bv.byteStride || (numComp * compSize);
    const out = new Float32Array(count * numComp);
    const dv = new DataView(binView.buffer, binView.byteOffset, binView.byteLength);

    for (let i = 0; i < count; i++) {
      const rowOff = baseOffset + i * stride;
      for (let c = 0; c < numComp; c++) {
        const off = rowOff + c * compSize;
        let val = 0;
        if (acc.componentType === 5126) val = dv.getFloat32(off, true);
        else if (acc.componentType === 5123) val = dv.getUint16(off, true) / (acc.normalized ? 65535 : 1);
        else if (acc.componentType === 5121) val = dv.getUint8(off) / (acc.normalized ? 255 : 1);
        else if (acc.componentType === 5122) val = Math.max(-1, dv.getInt16(off, true) / (acc.normalized ? 32767 : 1));
        else if (acc.componentType === 5120) val = Math.max(-1, dv.getInt8(off) / (acc.normalized ? 127 : 1));
        else if (acc.componentType === 5125) val = dv.getUint32(off, true);
        out[i * numComp + c] = val;
      }
    }
    return out;
  }

  function readAccessorIndices(gltf, binView, accessorIdx) {
    const acc = gltf.accessors[accessorIdx];
    if (!acc) return null;
    const bv = gltf.bufferViews[acc.bufferView];
    if (!bv) return null;
    const count = acc.count;
    const baseOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const compSize = acc.componentType === 5125 ? 4 : (acc.componentType === 5123 ? 2 : 1);
    const stride = bv.byteStride || compSize;
    const out = new Uint32Array(count);
    const dv = new DataView(binView.buffer, binView.byteOffset, binView.byteLength);
    for (let i = 0; i < count; i++) {
      const off = baseOffset + i * stride;
      if (acc.componentType === 5125) out[i] = dv.getUint32(off, true);
      else if (acc.componentType === 5123) out[i] = dv.getUint16(off, true);
      else out[i] = dv.getUint8(off);
    }
    return out;
  }

  function computeFlatNormals(positions, indices) {
    const vCount = positions.length / 3;
    const normals = new Float32Array(positions.length);
    const triCount = indices ? (indices.length / 3) : Math.floor(vCount / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = indices ? indices[t * 3] : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;
      const ax = positions[i0 * 3], ay = positions[i0 * 3 + 1], az = positions[i0 * 3 + 2];
      const bx = positions[i1 * 3], by = positions[i1 * 3 + 1], bz = positions[i1 * 3 + 2];
      const cx = positions[i2 * 3], cy = positions[i2 * 3 + 1], cz = positions[i2 * 3 + 2];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      normals[i0 * 3] += nx; normals[i0 * 3 + 1] += ny; normals[i0 * 3 + 2] += nz;
      normals[i1 * 3] += nx; normals[i1 * 3 + 1] += ny; normals[i1 * 3 + 2] += nz;
      normals[i2 * 3] += nx; normals[i2 * 3 + 1] += ny; normals[i2 * 3 + 2] += nz;
    }
    for (let i = 0; i < vCount; i++) {
      const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    }
    return normals;
  }

  // 解析 glTF 2.0 二进制 (.glb) -> 已变换到 WMPSES Z-up 世界坐标系的网格与材质列表
  function parseGLB(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 20) {
      throw new Error('GLB 文件过小或为空');
    }
    const dv = new DataView(arrayBuffer);
    const magic = dv.getUint32(0, true);
    if (magic !== 0x46546C67) {
      throw new Error('不是有效的 glTF 2.0 二进制 (.glb) 文件');
    }
    const version = dv.getUint32(4, true);
    if (version !== 2) {
      throw new Error(`仅支持 glTF 2.0，当前文件版本: ${version}`);
    }
    const totalLen = dv.getUint32(8, true);

    let offset = 12;
    let gltf = null;
    let binView = null;
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

    while (offset + 8 <= Math.min(totalLen, arrayBuffer.byteLength)) {
      const chunkLen = dv.getUint32(offset, true);
      const chunkType = dv.getUint32(offset + 4, true);
      offset += 8;
      if (chunkType === 0x4E4F534A) { // JSON
        const slice = new Uint8Array(arrayBuffer, offset, chunkLen);
        const text = decoder ? decoder.decode(slice) : String.fromCharCode.apply(null, slice);
        gltf = JSON.parse(text);
      } else if (chunkType === 0x004E4942) { // BIN
        binView = new Uint8Array(arrayBuffer, offset, chunkLen);
      }
      offset += chunkLen;
    }

    if (!gltf) throw new Error('GLB 缺少 JSON 数据块');
    if (Array.isArray(gltf.extensionsRequired) && gltf.extensionsRequired.includes('KHR_draco_mesh_compression')) {
      throw new Error('该 GLB 启用了 Draco 网格压缩，请在 Blender 导出时取消勾选「Compression / 压缩」后重新导出');
    }

    // 1. 提取嵌入图片字节（用于纹理贴图）
    const imageSources = [];
    if (Array.isArray(gltf.images) && binView) {
      gltf.images.forEach((imgDef, idx) => {
        if (imgDef.bufferView != null && gltf.bufferViews && gltf.bufferViews[imgDef.bufferView]) {
          const bv = gltf.bufferViews[imgDef.bufferView];
          const bytes = new Uint8Array(binView.buffer, binView.byteOffset + (bv.byteOffset || 0), bv.byteLength);
          imageSources[idx] = { bytes: bytes.slice(), mimeType: imgDef.mimeType || 'image/png' };
        } else if (typeof imgDef.uri === 'string' && imgDef.uri.startsWith('data:')) {
          imageSources[idx] = { dataUri: imgDef.uri };
        }
      });
    }

    // 2. 遍历场景节点层级，收集所有网格实例的世界变换矩阵
    const primitives = [];
    const globalMin = [Infinity, Infinity, Infinity];
    const globalMax = [-Infinity, -Infinity, -Infinity];
    let totalTriangles = 0;

    function visitNode(nodeIdx, parentWorld) {
      const node = gltf.nodes && gltf.nodes[nodeIdx];
      if (!node) return;
      let local;
      if (Array.isArray(node.matrix) && node.matrix.length === 16) {
        local = new Float32Array(node.matrix);
      } else {
        const t = node.translation || [0, 0, 0];
        const r = node.rotation || [0, 0, 0, 1];
        const s = node.scale || [1, 1, 1];
        local = mat4FromTRS(t, r, s);
      }
      const world = mat4Multiply(parentWorld, local);

      if (node.mesh != null && gltf.meshes && gltf.meshes[node.mesh]) {
        const mesh = gltf.meshes[node.mesh];
        const nMat = normalMat3FromMat4(world);
        (mesh.primitives || []).forEach((prim) => {
          // 仅处理标准三角形图元 (mode 默认为 4 = TRIANGLES)
          if (prim.mode != null && prim.mode !== 4) return;
          if (!prim.attributes || prim.attributes.POSITION == null) return;

          const rawPos = readAccessorFloat(gltf, binView, prim.attributes.POSITION);
          if (!rawPos || rawPos.length < 9) return;
          const indices = prim.indices != null ? readAccessorIndices(gltf, binView, prim.indices) : null;
          const rawNorm = prim.attributes.NORMAL != null
            ? readAccessorFloat(gltf, binView, prim.attributes.NORMAL)
            : computeFlatNormals(rawPos, indices);
          const uvs = prim.attributes.TEXCOORD_0 != null
            ? readAccessorFloat(gltf, binView, prim.attributes.TEXCOORD_0)
            : null;

          // 直接烘焙世界矩阵到 WMPSES Z-up 顶点（兼顾渲染和射线拾取！）
          const vCount = rawPos.length / 3;
          const worldPos = new Float32Array(rawPos.length);
          const worldNorm = new Float32Array(rawPos.length);
          let minX = Infinity, minY = Infinity, minZ = Infinity;
          let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

          const m0 = world[0], m1 = world[1], m2 = world[2];
          const m4 = world[4], m5 = world[5], m6 = world[6];
          const m8 = world[8], m9 = world[9], m10 = world[10];
          const m12 = world[12], m13 = world[13], m14 = world[14];
          const nm0 = nMat[0], nm1 = nMat[1], nm2 = nMat[2];
          const nm3 = nMat[3], nm4 = nMat[4], nm5 = nMat[5];
          const nm6 = nMat[6], nm7 = nMat[7], nm8 = nMat[8];

          for (let i = 0; i < vCount; i++) {
            const o = i * 3;
            const px = rawPos[o], py = rawPos[o + 1], pz = rawPos[o + 2];
            const wx = m0 * px + m4 * py + m8 * pz + m12;
            const wy = m1 * px + m5 * py + m9 * pz + m13;
            const wz = m2 * px + m6 * py + m10 * pz + m14;
            worldPos[o] = wx;
            worldPos[o + 1] = wy;
            worldPos[o + 2] = wz;
            if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
            if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;

            const nx = rawNorm[o], ny = rawNorm[o + 1], nz = rawNorm[o + 2];
            const wnx = nm0 * nx + nm3 * ny + nm6 * nz;
            const wny = nm1 * nx + nm4 * ny + nm7 * nz;
            const wnz = nm2 * nx + nm5 * ny + nm8 * nz;
            const nlen = Math.hypot(wnx, wny, wnz) || 1;
            worldNorm[o] = wnx / nlen;
            worldNorm[o + 1] = wny / nlen;
            worldNorm[o + 2] = wnz / nlen;
          }

          if (minX < globalMin[0]) globalMin[0] = minX;
          if (minY < globalMin[1]) globalMin[1] = minY;
          if (minZ < globalMin[2]) globalMin[2] = minZ;
          if (maxX > globalMax[0]) globalMax[0] = maxX;
          if (maxY > globalMax[1]) globalMax[1] = maxY;
          if (maxZ > globalMax[2]) globalMax[2] = maxZ;

          const matDef = (prim.material != null && gltf.materials) ? gltf.materials[prim.material] : null;
          const pbr = (matDef && matDef.pbrMetallicRoughness) || {};
          const bcf = Array.isArray(pbr.baseColorFactor) ? pbr.baseColorFactor : [0.75, 0.78, 0.82, 1.0];
          const emissive = Array.isArray(matDef && matDef.emissiveFactor) ? matDef.emissiveFactor : [0, 0, 0];
          let imageIdx = -1;
          if (pbr.baseColorTexture && gltf.textures && gltf.textures[pbr.baseColorTexture.index]) {
            const src = gltf.textures[pbr.baseColorTexture.index].source;
            if (src != null) imageIdx = src;
          }

          const triCount = indices ? (indices.length / 3) : Math.floor(vCount / 3);
          totalTriangles += triCount;

          primitives.push({
            name: node.name || mesh.name || 'part',
            positions: worldPos,
            normals: worldNorm,
            uvs: uvs,
            indices: indices,
            vertexCount: vCount,
            triangleCount: triCount,
            aabb: [minX, minY, minZ, maxX, maxY, maxZ],
            material: {
              baseColor: [bcf[0], bcf[1], bcf[2], bcf[3] != null ? bcf[3] : 1.0],
              metallic: pbr.metallicFactor != null ? pbr.metallicFactor : 0.1,
              roughness: pbr.roughnessFactor != null ? pbr.roughnessFactor : 0.8,
              emissive: emissive,
              doubleSided: Boolean(matDef && matDef.doubleSided),
              alphaMode: (matDef && matDef.alphaMode) || 'OPAQUE',
              imageIdx: imageIdx
            }
          });
        });
      }

      if (Array.isArray(node.children)) {
        node.children.forEach((childIdx) => visitNode(childIdx, world));
      }
    }

    const sceneIdx = gltf.scene != null ? gltf.scene : 0;
    const sceneDef = gltf.scenes && gltf.scenes[sceneIdx];
    const rootNodes = (sceneDef && Array.isArray(sceneDef.nodes))
      ? sceneDef.nodes
      : (Array.isArray(gltf.nodes) ? gltf.nodes.map((_, i) => i) : []);

    rootNodes.forEach((nIdx) => visitNode(nIdx, GLTF_TO_WMPSES));

    if (!primitives.length) {
      throw new Error('GLB 文件中未找到可渲染的三角形网格');
    }

    const center = [
      (globalMin[0] + globalMax[0]) * 0.5,
      (globalMin[1] + globalMax[1]) * 0.5,
      (globalMin[2] + globalMax[2]) * 0.5
    ];
    const radius = Math.hypot(
      globalMax[0] - globalMin[0],
      globalMax[1] - globalMin[1],
      globalMax[2] - globalMin[2]
    ) * 0.5;

    return {
      primitives: primitives,
      imageSources: imageSources,
      totalTriangles: totalTriangles,
      bounds: { min: globalMin, max: globalMax, center: center, radius: radius }
    };
  }

  // ==========================================
  // 射线检测：AABB 粗筛 + Möller–Trumbore 三角面精测
  // ==========================================
  function intersectAABB(orig, invDir, aabb) {
    let tmin = -1e9, tmax = 1e9;
    for (let a = 0; a < 3; a++) {
      let t1 = (aabb[a] - orig[a]) * invDir[a];
      let t2 = (aabb[a + 3] - orig[a]) * invDir[a];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    return tmax >= 0 ? Math.max(0, tmin) : null;
  }

  function raycastPrimitives(primitives, orig, dir, maxDist) {
    const invDir = [
      Math.abs(dir[0]) > 1e-8 ? 1 / dir[0] : 1e8,
      Math.abs(dir[1]) > 1e-8 ? 1 / dir[1] : 1e8,
      Math.abs(dir[2]) > 1e-8 ? 1 / dir[2] : 1e8
    ];
    const ox = orig[0], oy = orig[1], oz = orig[2];
    const dx = dir[0], dy = dir[1], dz = dir[2];
    let bestT = maxDist != null ? maxDist : 1e9;
    let bestHit = null;

    for (let p = 0; p < primitives.length; p++) {
      const prim = primitives[p];
      const boxT = intersectAABB(orig, invDir, prim.aabb);
      if (boxT === null || boxT > bestT) continue;

      const pos = prim.positions;
      const idx = prim.indices;
      const triCount = prim.triangleCount;
      for (let t = 0; t < triCount; t++) {
        const i0 = (idx ? idx[t * 3] : t * 3) * 3;
        const i1 = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3;
        const i2 = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;

        const v0x = pos[i0], v0y = pos[i0 + 1], v0z = pos[i0 + 2];
        const e1x = pos[i1] - v0x, e1y = pos[i1 + 1] - v0y, e1z = pos[i1 + 2] - v0z;
        const e2x = pos[i2] - v0x, e2y = pos[i2 + 1] - v0y, e2z = pos[i2 + 2] - v0z;

        const hx = dy * e2z - dz * e2y;
        const hy = dz * e2x - dx * e2z;
        const hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-7) continue;

        const invDet = 1.0 / det;
        const sx = ox - v0x, sy = oy - v0y, sz = oz - v0z;
        const u = (sx * hx + sy * hy + sz * hz) * invDet;
        if (u < 0 || u > 1) continue;

        const qx = sy * e1z - sz * e1y;
        const qy = sz * e1x - sx * e1z;
        const qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * invDet;
        if (v < 0 || u + v > 1) continue;

        const hitT = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (hitT > 0.25 && hitT < bestT) {
          bestT = hitT;
          bestHit = {
            t: hitT,
            partName: prim.name,
            point: {
              x: Math.round((ox + dx * hitT) * 100) / 100,
              y: Math.round((oy + dy * hitT) * 100) / 100,
              z: Math.round((oz + dz * hitT) * 100) / 100
            }
          };
        }
      }
    }
    return bestHit;
  }

  // ==========================================
  // WebGL 着色器（天空渐变背景 + PBR 光照网格）
  // ==========================================
  const SKY_VS = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.9999, 1.0);
    }
  `;

  const SKY_FS = `
    precision mediump float;
    varying vec2 vUv;
    uniform float uHorizon;
    void main() {
      vec3 zenith = vec3(0.11, 0.26, 0.48);
      vec3 horizon = vec3(0.56, 0.72, 0.86);
      vec3 ground = vec3(0.16, 0.20, 0.26);
      float t = vUv.y - uHorizon;
      vec3 col = t >= 0.0
        ? mix(horizon, zenith, clamp(pow(t / max(0.05, 1.0 - uHorizon), 0.72), 0.0, 1.0))
        : mix(horizon * 0.75, ground, clamp(-t / max(0.05, uHorizon + 0.25), 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const MESH_VS = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    attribute vec2 aUv;
    uniform mat4 uViewProj;
    varying vec3 vWorldPos;
    varying vec3 vNorm;
    varying vec2 vUv;
    void main() {
      vWorldPos = aPos;
      vNorm = aNorm;
      vUv = aUv;
      gl_Position = uViewProj * vec4(aPos, 1.0);
    }
  `;

  const MESH_FS = `
    precision mediump float;
    varying vec3 vWorldPos;
    varying vec3 vNorm;
    varying vec2 vUv;
    uniform vec3 uCamPos;
    uniform vec4 uBaseColor;
    uniform float uMetallic;
    uniform float uRoughness;
    uniform vec3 uEmissive;
    uniform int uHasTex;
    uniform sampler2D uTex;

    void main() {
      vec4 base = uBaseColor;
      if (uHasTex == 1) {
        vec4 texCol = texture2D(uTex, vUv);
        // glTF baseColorTexture 为 sRGB，解码至线性空间后再参与光照
        base.rgb *= pow(texCol.rgb, vec3(2.2));
        base.a *= texCol.a;
      }
      if (base.a < 0.05) discard;

      vec3 N = normalize(vNorm);
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(uCamPos - vWorldPos);

      // 主太阳光 + 补光 + 天地半球环境光
      vec3 L1 = normalize(vec3(-0.48, -0.58, 0.74));
      vec3 L2 = normalize(vec3(0.55, 0.42, 0.38));
      float ndl1 = max(dot(N, L1), 0.0);
      float ndl2 = max(dot(N, L2), 0.0);

      float hemi = clamp(N.z * 0.5 + 0.5, 0.0, 1.0);
      vec3 ambient = mix(vec3(0.20, 0.22, 0.26), vec3(0.42, 0.50, 0.62), hemi);

      vec3 H = normalize(L1 + V);
      float shininess = mix(96.0, 8.0, clamp(uRoughness, 0.05, 1.0));
      float specStrength = mix(0.08, 0.55, uMetallic) * (1.0 - 0.65 * uRoughness);
      float spec = pow(max(dot(N, H), 0.0), shininess) * specStrength;

      vec3 diffuse = base.rgb * (ambient + vec3(1.05, 1.00, 0.92) * ndl1 * 0.88 + vec3(0.48, 0.58, 0.75) * ndl2 * 0.30);
      vec3 specCol = mix(vec3(1.0), base.rgb, uMetallic) * spec;
      vec3 color = diffuse + specCol + uEmissive;

      // 远处轻微空气雾化（增强工业厂区纵深感）
      float dist = length(uCamPos - vWorldPos);
      float fog = clamp((dist - 120.0) / 480.0, 0.0, 0.45);
      color = mix(color, vec3(0.36, 0.48, 0.62), fog);

      // ACES 轻量色调映射 + sRGB 编码
      color = color / (color + vec3(0.75)) * 1.48;
      color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
      gl_FragColor = vec4(color, base.a);
    }
  `;

  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('WebGL 着色器编译失败: ' + log);
    }
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('WebGL 着色器链接失败: ' + log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  // 与 scene-3d.js 完全等价的 View-Projection 矩阵 (列主序 4x4)
  function buildViewProjMatrix(cam, width, height) {
    const sx = (2.0 * cam.focalLen) / Math.max(1, width);
    const sy = (2.0 * cam.focalLen) / Math.max(1, height);
    const near = 0.2;
    const far = 2500.0;
    const A = (far + near) / (far - near);
    const B = (-2.0 * far * near) / (far - near);

    const rx = cam.right[0], ry = cam.right[1], rz = cam.right[2];
    const ux = cam.up[0], uy = cam.up[1], uz = cam.up[2];
    const fx = cam.forward[0], fy = cam.forward[1], fz = cam.forward[2];
    const cx = cam.camPos[0], cy = cam.camPos[1], cz = cam.camPos[2];

    const tx = -(rx * cx + ry * cy + rz * cz);
    const ty = -(ux * cx + uy * cy + uz * cz);
    const tz = -(fx * cx + fy * cy + fz * cz);

    // 列主序：col0=(m0..m3), col1=(m4..m7), col2=(m8..m11), col3=(m12..m15)
    return new Float32Array([
      sx * rx, sy * ux, A * fx, fx,
      sx * ry, sy * uy, A * fy, fy,
      sx * rz, sy * uz, A * fz, fz,
      sx * tx, sy * ty, A * tz + B, tz
    ]);
  }

  // ==========================================
  // 主渲染器类
  // ==========================================
  function createRenderer(canvas) {
    let gl = null;
    let isWebGL2 = false;
    let hasUintIndex = false;
    let skyProg = null;
    let meshProg = null;
    let skyBuf = null;
    let skyLocs = null;
    let meshLocs = null;
    let dummyUvBuf = null;

    let loaded = false;
    let modelName = '';
    let parsed = null;
    let gpuPrims = [];
    let gpuTextures = [];

    function ensureGL() {
      if (gl) return true;
      if (!canvas || typeof canvas.getContext !== 'function') return false;
      const attrs = { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: false };
      gl = canvas.getContext('webgl2', attrs);
      if (gl) {
        isWebGL2 = true;
        hasUintIndex = true;
      } else {
        gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
        if (gl) {
          hasUintIndex = Boolean(gl.getExtension('OES_element_index_uint'));
        }
      }
      if (!gl) return false;

      skyProg = createProgram(gl, SKY_VS, SKY_FS);
      meshProg = createProgram(gl, MESH_VS, MESH_FS);

      skyBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      skyLocs = {
        aPos: gl.getAttribLocation(skyProg, 'aPos'),
        uHorizon: gl.getUniformLocation(skyProg, 'uHorizon')
      };

      meshLocs = {
        aPos: gl.getAttribLocation(meshProg, 'aPos'),
        aNorm: gl.getAttribLocation(meshProg, 'aNorm'),
        aUv: gl.getAttribLocation(meshProg, 'aUv'),
        uViewProj: gl.getUniformLocation(meshProg, 'uViewProj'),
        uCamPos: gl.getUniformLocation(meshProg, 'uCamPos'),
        uBaseColor: gl.getUniformLocation(meshProg, 'uBaseColor'),
        uMetallic: gl.getUniformLocation(meshProg, 'uMetallic'),
        uRoughness: gl.getUniformLocation(meshProg, 'uRoughness'),
        uEmissive: gl.getUniformLocation(meshProg, 'uEmissive'),
        uHasTex: gl.getUniformLocation(meshProg, 'uHasTex'),
        uTex: gl.getUniformLocation(meshProg, 'uTex')
      };

      dummyUvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, dummyUvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(2), gl.STATIC_DRAW);
      return true;
    }

    function disposeGpuResources() {
      if (!gl) return;
      gpuPrims.forEach((gp) => {
        if (gp.posBuf) gl.deleteBuffer(gp.posBuf);
        if (gp.normBuf) gl.deleteBuffer(gp.normBuf);
        if (gp.uvBuf) gl.deleteBuffer(gp.uvBuf);
        if (gp.idxBuf) gl.deleteBuffer(gp.idxBuf);
      });
      gpuTextures.forEach((tex) => {
        if (tex) gl.deleteTexture(tex);
      });
      gpuPrims = [];
      gpuTextures = [];
    }

    function uploadTextureFromSource(src, idx) {
      if (!gl || !src) return;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gpuTextures[idx] = tex;

      const img = new Image();
      let objUrl = null;
      img.onload = () => {
        if (gl && gpuTextures[idx] === tex) {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        }
        if (objUrl) URL.revokeObjectURL(objUrl);
      };
      img.onerror = () => {
        if (objUrl) URL.revokeObjectURL(objUrl);
      };
      if (src.dataUri) {
        img.src = src.dataUri;
      } else if (src.bytes && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
        const blob = new Blob([src.bytes], { type: src.mimeType || 'image/png' });
        objUrl = URL.createObjectURL(blob);
        img.src = objUrl;
      }
    }

    return {
      loadArrayBuffer: function (arrayBuffer, name) {
        const result = parseGLB(arrayBuffer);
        disposeGpuResources();
        parsed = result;
        modelName = name || 'scene.glb';
        loaded = true;

        if (ensureGL()) {
          // 上传嵌入贴图
          (result.imageSources || []).forEach((src, idx) => uploadTextureFromSource(src, idx));

          // 上传每个图元顶点与索引缓冲
          result.primitives.forEach((prim) => {
            const posBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(gl.ARRAY_BUFFER, prim.positions, gl.STATIC_DRAW);

            const normBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
            gl.bufferData(gl.ARRAY_BUFFER, prim.normals, gl.STATIC_DRAW);

            let uvBuf = null;
            if (prim.uvs) {
              uvBuf = gl.createBuffer();
              gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
              gl.bufferData(gl.ARRAY_BUFFER, prim.uvs, gl.STATIC_DRAW);
            }

            let idxBuf = null;
            let idxType = gl.UNSIGNED_SHORT;
            let idxCount = 0;
            if (prim.indices) {
              idxBuf = gl.createBuffer();
              gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
              if (prim.vertexCount > 65535 && hasUintIndex) {
                idxType = gl.UNSIGNED_INT;
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, prim.indices, gl.STATIC_DRAW);
              } else {
                idxType = gl.UNSIGNED_SHORT;
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(prim.indices), gl.STATIC_DRAW);
              }
              idxCount = prim.indices.length;
            }

            gpuPrims.push({
              posBuf: posBuf,
              normBuf: normBuf,
              uvBuf: uvBuf,
              idxBuf: idxBuf,
              idxType: idxType,
              idxCount: idxCount,
              vertexCount: prim.vertexCount,
              material: prim.material
            });
          });
        }

        return this.getInfo();
      },

      clear: function () {
        disposeGpuResources();
        parsed = null;
        modelName = '';
        loaded = false;
        if (gl) {
          gl.clearColor(0.03, 0.07, 0.14, 1);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
      },

      resize: function (w, h, dpr) {
        if (!canvas) return;
        const scale = Math.min(2, Number(dpr) || 1);
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
      },

      render: function (cam, width, height) {
        if (!loaded || !gl || !gpuPrims.length) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.07, 0.14, 0.24, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // 1. 绘制随俯仰角移动的工业厂区天空渐变背景
        const horizY = 0.5 - Math.asin(Math.max(-1, Math.min(1, cam.forward[2]))) / Math.PI;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(skyProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
        gl.enableVertexAttribArray(skyLocs.aPos);
        gl.vertexAttribPointer(skyLocs.aPos, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(skyLocs.uHorizon, horizY);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // 2. 绘制 3D 网格（与 scene-3d.js 相机矩阵严格一致）
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.useProgram(meshProg);
        const vp = buildViewProjMatrix(cam, width, height);
        gl.uniformMatrix4fv(meshLocs.uViewProj, false, vp);
        gl.uniform3f(meshLocs.uCamPos, cam.camPos[0], cam.camPos[1], cam.camPos[2]);
        gl.uniform1i(meshLocs.uTex, 0);

        for (let i = 0; i < gpuPrims.length; i++) {
          const gp = gpuPrims[i];
          const mat = gp.material;

          if (mat.doubleSided) {
            gl.disable(gl.CULL_FACE);
          } else {
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
          }

          if (mat.alphaMode === 'BLEND' || mat.baseColor[3] < 0.99) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          } else {
            gl.disable(gl.BLEND);
          }

          gl.bindBuffer(gl.ARRAY_BUFFER, gp.posBuf);
          gl.enableVertexAttribArray(meshLocs.aPos);
          gl.vertexAttribPointer(meshLocs.aPos, 3, gl.FLOAT, false, 0, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, gp.normBuf);
          gl.enableVertexAttribArray(meshLocs.aNorm);
          gl.vertexAttribPointer(meshLocs.aNorm, 3, gl.FLOAT, false, 0, 0);

          if (meshLocs.aUv >= 0) {
            if (gp.uvBuf) {
              gl.bindBuffer(gl.ARRAY_BUFFER, gp.uvBuf);
              gl.enableVertexAttribArray(meshLocs.aUv);
              gl.vertexAttribPointer(meshLocs.aUv, 2, gl.FLOAT, false, 0, 0);
            } else {
              gl.disableVertexAttribArray(meshLocs.aUv);
              gl.vertexAttrib2f(meshLocs.aUv, 0, 0);
            }
          }

          const hasTex = mat.imageIdx >= 0 && gpuTextures[mat.imageIdx];
          gl.uniform1i(meshLocs.uHasTex, hasTex ? 1 : 0);
          if (hasTex) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, gpuTextures[mat.imageIdx]);
          }

          gl.uniform4f(meshLocs.uBaseColor, mat.baseColor[0], mat.baseColor[1], mat.baseColor[2], mat.baseColor[3]);
          gl.uniform1f(meshLocs.uMetallic, mat.metallic);
          gl.uniform1f(meshLocs.uRoughness, mat.roughness);
          gl.uniform3f(meshLocs.uEmissive, mat.emissive[0], mat.emissive[1], mat.emissive[2]);

          if (gp.idxBuf) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gp.idxBuf);
            gl.drawElements(gl.TRIANGLES, gp.idxCount, gp.idxType, 0);
          } else {
            gl.drawArrays(gl.TRIANGLES, 0, gp.vertexCount);
          }
        }
      },

      raycast: function (orig, dir, maxDist) {
        if (!loaded || !parsed) return null;
        return raycastPrimitives(parsed.primitives, orig, dir, maxDist);
      },

      isLoaded: function () {
        return loaded;
      },

      getInfo: function () {
        if (!loaded || !parsed) return null;
        return {
          name: modelName,
          meshCount: parsed.primitives.length,
          triangleCount: parsed.totalTriangles,
          bounds: parsed.bounds,
          webgl2: isWebGL2
        };
      }
    };
  }

  global.WMPSESGlbRenderer = {
    createRenderer: createRenderer,
    parseGLB: parseGLB,
    buildViewProjMatrix: buildViewProjMatrix,
    raycastPrimitives: raycastPrimitives
  };
})(window);
