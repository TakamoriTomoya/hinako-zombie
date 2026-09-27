// 画面の右下に見える、自分の手と銃(拳銃)を描く。
// 後ろから見た拳銃が、ねらっている点の方へ少し向きを変える。撃つと跳ね上がり、リロード中は下に下げる。

import type { View } from "./perspective";

export interface GunPose {
  aimX: number;
  aimY: number;
  recoil: number; // 0〜1。撃った直後が1
  reload: number; // 0〜1。リロードの進み具合(0: していない)
  flash: boolean; // 銃口の火
}

interface GunGeometry {
  size: number;
  baseX: number;
  baseY: number;
  angle: number;
  dip: number;
}

function geometry(view: View, pose: GunPose): GunGeometry {
  const { w, h } = view;
  const size = Math.min(w * 0.55, h * 0.36);
  // 手首の位置。ねらう点の横の位置に合わせて少し左右に動く
  const baseX = w * 0.66 + (pose.aimX - w / 2) * 0.18;
  const baseY = h + size * 0.08 + (pose.aimY - h * 0.45) * 0.06;
  // ねらう点の方へ傾ける(大きく傾けすぎない)
  const angle = Math.max(-0.5, Math.min(0.35, Math.atan2(pose.aimX - baseX, baseY - pose.aimY) * 0.6));
  // リロード中は下へ沈めて傾ける
  const r = pose.reload > 0 ? Math.sin(Math.min(1, pose.reload) * Math.PI) : 0;
  return { size, baseX, baseY, angle: angle + r * 0.6 - pose.recoil * 0.12, dip: r * size * 0.45 + pose.recoil * size * 0.08 };
}

// 銃口の画面上の位置(弾の光のすじを出すのに使う)
export function muzzlePoint(view: View, pose: GunPose): { x: number; y: number } {
  const g = geometry(view, pose);
  const lx = 0;
  const ly = -g.size * 0.92;
  const c = Math.cos(g.angle);
  const s = Math.sin(g.angle);
  return { x: g.baseX + lx * c - ly * s, y: g.baseY + g.dip + lx * s + ly * c };
}

export function drawGun(ctx: CanvasRenderingContext2D, view: View, pose: GunPose): void {
  const g = geometry(view, pose);
  const u = g.size / 100; // 以下、銃の大きさを100とした座標で描く
  ctx.save();
  ctx.translate(g.baseX, g.baseY + g.dip);
  ctx.rotate(g.angle);
  ctx.scale(u, u);

  // 袖(画面の下から伸びる腕)
  ctx.fillStyle = "#2b3240";
  ctx.beginPath();
  ctx.moveTo(-34, 30);
  ctx.lineTo(-26, -18);
  ctx.lineTo(28, -18);
  ctx.lineTo(44, 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3a4354";
  ctx.fillRect(-27, -24, 55, 10);

  // グリップ(手の中に隠れる部分)
  ctx.fillStyle = "#1a1c21";
  roundRect(ctx, -12, -58, 24, 44, 5);
  ctx.fill();

  // スライド(上から見た銃身。奥へいくほど細く見える)
  const slide = ctx.createLinearGradient(-14, 0, 14, 0);
  slide.addColorStop(0, "#2a2d34");
  slide.addColorStop(0.45, "#5a606c");
  slide.addColorStop(1, "#23262c");
  ctx.fillStyle = slide;
  ctx.beginPath();
  ctx.moveTo(-15, -52);
  ctx.lineTo(-9, -90);
  ctx.lineTo(9, -90);
  ctx.lineTo(15, -52);
  ctx.closePath();
  ctx.fill();
  // スライドのみぞ
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-13 + i * 0.3, -56 - i * 3.2);
    ctx.lineTo(13 - i * 0.3, -56 - i * 3.2);
    ctx.stroke();
  }
  // 銃口
  ctx.fillStyle = "#0b0c0e";
  ctx.beginPath();
  ctx.ellipse(0, -90, 4.2, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // 照門(手前)と照星(奥)
  ctx.fillStyle = "#101114";
  ctx.fillRect(-11, -58, 7, 5);
  ctx.fillRect(4, -58, 7, 5);
  ctx.fillStyle = "#ffe066";
  ctx.fillRect(-1.2, -92, 2.4, 4);

  // 手(グリップを包む)
  ctx.fillStyle = "#f0c7a4";
  ctx.beginPath();
  ctx.moveTo(-22, -16);
  ctx.quadraticCurveTo(-26, -44, -14, -52);
  ctx.lineTo(14, -52);
  ctx.quadraticCurveTo(26, -44, 22, -16);
  ctx.closePath();
  ctx.fill();
  // 指のすじ
  ctx.strokeStyle = "rgba(150,90,60,0.5)";
  ctx.lineWidth = 1.4;
  [-40, -32, -24].forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.quadraticCurveTo(-8, y - 3, 4, y);
    ctx.stroke();
  });
  // 親指
  ctx.fillStyle = "#e8b994";
  ctx.beginPath();
  ctx.ellipse(12, -46, 5, 11, -0.35, 0, Math.PI * 2);
  ctx.fill();

  if (pose.flash) {
    const fl = ctx.createRadialGradient(0, -98, 0, 0, -98, 30);
    fl.addColorStop(0, "rgba(255,255,220,1)");
    fl.addColorStop(0.3, "rgba(255,200,80,0.9)");
    fl.addColorStop(1, "rgba(255,120,0,0)");
    ctx.fillStyle = fl;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      const r = i % 2 === 0 ? 30 : 12;
      ctx.lineTo(Math.cos(a) * r, -98 + Math.sin(a) * r * 1.2);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ねらっている場所に出す照準
export function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, pulse: number): void {
  const r = 16 + pulse * 6;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,90,90,0.95)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r - 7, y);
  ctx.lineTo(x - r + 7, y);
  ctx.moveTo(x + r - 7, y);
  ctx.lineTo(x + r + 7, y);
  ctx.moveTo(x, y - r - 7);
  ctx.lineTo(x, y - r + 7);
  ctx.moveTo(x, y + r - 7);
  ctx.lineTo(x, y + r + 7);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,90,90,0.95)";
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
