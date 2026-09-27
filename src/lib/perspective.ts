// 3Dの町を、プレイヤーの目(カメラ)から見た画面の2D座標に写すための計算。
// 世界の座標は x: 右が+(m)、z: はじめに向いている方向が+(m)、y: 地面からの高さ(m)。
// カメラは (camX, camZ) に立ち、yaw だけ右を向いている(0 ではじめの向き)。
// canvasにもDOMにも依存しない純粋な関数だけを置く(テストしやすいように)。

import { CAMERA_HEIGHT_M, FOCAL_RATIO, HORIZON_RATIO } from "./constants";
import type { HeadCircle } from "./zombieCatalog";

export const NEAR_DEPTH = 0.3; // これより手前(カメラのすぐ前・うしろ)は描かない

export interface View {
  w: number; // 画面の幅(CSS px)
  h: number;
  horizonY: number;
  focal: number;
  camX: number;
  camZ: number;
  yaw: number; // 右を向くと+(ラジアン)
  cos: number;
  sin: number;
}

export function makeView(w: number, h: number, camX = 0, camZ = 0, yaw = 0): View {
  return { w, h, horizonY: h * HORIZON_RATIO, focal: h * FOCAL_RATIO, camX, camZ, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw) };
}

// 世界の点をカメラから見た座標に直す。x: 右が+、z: 前方への距離(奥行き)
export function toCamera(view: View, x: number, z: number): { x: number; z: number } {
  const dx = x - view.camX;
  const dz = z - view.camZ;
  return { x: dx * view.cos - dz * view.sin, z: dx * view.sin + dz * view.cos };
}

// カメラから見た座標を、世界の座標に戻す
export function fromCamera(view: View, cx: number, cz: number): { x: number; z: number } {
  return { x: view.camX + cx * view.cos + cz * view.sin, z: view.camZ - cx * view.sin + cz * view.cos };
}

// 世界の点の奥行き(カメラの前方への距離)。うしろにあるとマイナス
export function depthOf(view: View, x: number, z: number): number {
  return toCamera(view, x, z).z;
}

// 奥行き depth のところで、1mが何pxに見えるか
export function scaleAt(view: View, depth: number): number {
  return view.focal / Math.max(depth, NEAR_DEPTH);
}

// カメラから見た座標を画面に写す
export function projectCam(view: View, cx: number, y: number, cz: number): { x: number; y: number } {
  const s = scaleAt(view, cz);
  return { x: view.w / 2 + cx * s, y: view.horizonY + (CAMERA_HEIGHT_M - y) * s };
}

// 世界の点を画面に写す(うしろにある点は、すぐ前にあるものとして写す)
export function project(view: View, x: number, y: number, z: number): { x: number; y: number } {
  const c = toCamera(view, x, z);
  return projectCam(view, c.x, y, c.z);
}

// 画面の下端に見える地面までの奥行き(これより近い地面は画面の外)
export function nearestVisibleDepth(view: View): number {
  return (CAMERA_HEIGHT_M * view.focal) / (view.h - view.horizonY);
}

export interface Rect {
  left: number;
  top: number;
  w: number;
  h: number;
}

// 地面の(x, z)に足をつけて立つ、高さheightM・縦横比aspect(幅/高さ)の写真が画面に写る四角。
// 写真はいつもカメラの方を向いている
export function standingRect(view: View, x: number, z: number, heightM: number, aspect: number): Rect {
  const c = toCamera(view, x, z);
  const s = scaleAt(view, c.z);
  const h = heightM * s;
  const w = h * aspect;
  const foot = projectCam(view, c.x, 0, c.z);
  return { left: foot.x - w / 2, top: foot.y - h, w, h };
}

// 写真の不透明な部分を粗い格子にしたもの(1: 体がある、0: 透明)。撃った場所が体に当たったかの判定に使う
export interface AlphaMask {
  cols: number;
  rows: number;
  data: Uint8Array;
}

export type HitPart = "head" | "body";

// 画面上の点(px, py)が、rectに描いた写真のどこに当たったか。当たっていなければnull
export function hitTestSprite(rect: Rect, mask: AlphaMask, head: HeadCircle, px: number, py: number): HitPart | null {
  const u = (px - rect.left) / rect.w;
  const v = (py - rect.top) / rect.h;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;

  // 頭は写真の上で円として決めてある。髪や帽子のすき間を撃っても頭に当たったことにする
  const dx = (u - head.cx) * rect.w;
  const dy = (v - head.cy) * rect.h;
  if (Math.hypot(dx, dy) <= head.r * rect.h) return "head";

  const col = Math.min(mask.cols - 1, Math.floor(u * mask.cols));
  const row = Math.min(mask.rows - 1, Math.floor(v * mask.rows));
  return mask.data[row * mask.cols + col] ? "body" : null;
}

// 格子のまわり1マスまで「体がある」ことにする。指でタップしても当てやすいように、少しだけ甘くする
export function dilateMask(mask: AlphaMask): AlphaMask {
  const { cols, rows, data } = mask;
  const out = new Uint8Array(data.length);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let on = 0;
      for (let dr = -1; dr <= 1 && !on; dr++) {
        for (let dc = -1; dc <= 1 && !on; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && data[rr * cols + cc]) on = 1;
        }
      }
      out[r * cols + c] = on;
    }
  }
  return { cols, rows, data: out };
}

// 画面上の点に見えている地面の、世界の位置。地平線より上(空)なら null
export function screenToGround(view: View, sx: number, sy: number): { x: number; z: number } | null {
  if (sy <= view.horizonY + 0.5) return null;
  const cz = (CAMERA_HEIGHT_M * view.focal) / (sy - view.horizonY);
  const cx = (sx - view.w / 2) / scaleAt(view, cz);
  return fromCamera(view, cx, cz);
}

// 点が多角形(画面上の点の並び)の中にあるか
export function pointInPolygon(px: number, py: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// カメラから見た多角形(x, y, 奥行き)を、カメラのすぐ前の面で切り取る。うしろにはみ出した部分を描かないため
export function clipNear(pts: { x: number; y: number; z: number }[], near = NEAR_DEPTH): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const aIn = a.z >= near;
    const bIn = b.z >= near;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (near - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: near });
    }
  }
  return out;
}

// 世界の多角形(x, y, z の並び)を画面に写す。カメラのうしろにはみ出した部分は切り取る。全部うしろなら空
export function projectPolygon(view: View, pts: [number, number, number][]): { x: number; y: number }[] {
  const cam = pts.map(([x, y, z]) => {
    const c = toCamera(view, x, z);
    return { x: c.x, y, z: c.z };
  });
  return clipNear(cam).map((p) => projectCam(view, p.x, p.y, p.z));
}

// 線分(ax,az)→(bx,bz) が、地面の上の四角(x0〜x1, z0〜z1)を通るか。
// カメラからゾンビまでの間に建物があるか(建物のうしろに隠れているか)の判定に使う
export function segmentHitsBox(ax: number, az: number, bx: number, bz: number, b: { x0: number; x1: number; z0: number; z1: number }): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, ax - b.x0) && clip(dx, b.x1 - ax) && clip(-dz, az - b.z0) && clip(dz, b.z1 - az) && t0 <= t1;
}
