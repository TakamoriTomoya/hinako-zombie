// 3Dの町(道のまん中に立つプレイヤーから見た景色)を、画面の2D座標に写すための計算。
// 座標は x: 右が+(m)、z: 前方への距離(m)、y: 地面からの高さ(m)。
// canvasにもDOMにも依存しない純粋な関数だけを置く(テストしやすいように)。

import { CAMERA_HEIGHT_M, FOCAL_RATIO, HORIZON_RATIO, LANE_SCREEN_RATIO } from "./constants";
import type { HeadCircle } from "./zombieCatalog";

export interface View {
  w: number; // 画面の幅(CSS px)
  h: number;
  horizonY: number;
  focal: number;
}

export function makeView(w: number, h: number): View {
  return { w, h, horizonY: h * HORIZON_RATIO, focal: h * FOCAL_RATIO };
}

// 距離zのところで、1mが何pxに見えるか
export function scaleAt(view: View, z: number): number {
  return view.focal / Math.max(z, 0.05);
}

export function projectX(view: View, x: number, z: number): number {
  return view.w / 2 + x * scaleAt(view, z);
}

export function projectY(view: View, y: number, z: number): number {
  return view.horizonY + (CAMERA_HEIGHT_M - y) * scaleAt(view, z);
}

// 画面の下端に見える地面までの距離(これより近い地面は画面の外)
export function nearestVisibleZ(view: View): number {
  return (CAMERA_HEIGHT_M * view.focal) / (view.h - view.horizonY);
}

// ゾンビが最後に寄ってくる横の位置の範囲(m)。近くでも画面からはみ出さないように、画面の幅から決める
export function laneLimitM(view: View, z: number): number {
  return (view.w * LANE_SCREEN_RATIO) / scaleAt(view, z);
}

export interface Rect {
  left: number;
  top: number;
  w: number;
  h: number;
}

// 地面の(x, z)に足をつけて立つ、高さheightM・縦横比aspect(幅/高さ)の写真が画面に写る四角
export function standingRect(view: View, x: number, z: number, heightM: number, aspect: number): Rect {
  const s = scaleAt(view, z);
  const h = heightM * s;
  const w = h * aspect;
  const footY = projectY(view, 0, z);
  return { left: projectX(view, x, z) - w / 2, top: footY - h, w, h };
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
