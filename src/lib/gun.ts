// 画面の右下に見える、自分の手と武器を描く。
// 後ろから見た武器が、ねらっている点の方へ少し向きを変える。撃つと跳ね上がり、リロード中や持ちかえ中は下に下げる。

import type { View } from "./perspective";
import type { WeaponId } from "./weapons";

export interface GunPose {
  weapon: WeaponId;
  aimX: number;
  aimY: number;
  recoil: number; // 0〜1。撃った直後が1
  reload: number; // 0〜1。リロード(持ちかえ)の進み具合(0: していない)
  flash: boolean; // 銃口の火
}

// 武器ごとの銃口の位置(銃の大きさを100とした座標)
const MUZZLE_Y: Record<WeaponId, number> = { pistol: -92, mg: -130, rocket: -122, grenade: -70 };

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
  const ly = (g.size * MUZZLE_Y[pose.weapon]) / 100;
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
  if (pose.weapon === "mg") drawMachineGun(ctx);
  else if (pose.weapon === "rocket") drawRocketLauncher(ctx);
  else if (pose.weapon === "grenade") drawGrenadeHand(ctx, pose.recoil);
  else drawPistol(ctx);
  if (pose.flash && pose.weapon !== "grenade") drawMuzzleFlash(ctx, MUZZLE_Y[pose.weapon] - 6, pose.weapon === "rocket" ? 1.6 : pose.weapon === "mg" ? 1.2 : 1);
  ctx.restore();
}

function drawSleeve(ctx: CanvasRenderingContext2D): void {
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
}

// 手(グリップを包む)
function drawGripHand(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#f0c7a4";
  ctx.beginPath();
  ctx.moveTo(-22, -16);
  ctx.quadraticCurveTo(-26, -44, -14, -52);
  ctx.lineTo(14, -52);
  ctx.quadraticCurveTo(26, -44, 22, -16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(150,90,60,0.5)";
  ctx.lineWidth = 1.4;
  [-40, -32, -24].forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.quadraticCurveTo(-8, y - 3, 4, y);
    ctx.stroke();
  });
  ctx.fillStyle = "#e8b994";
  ctx.beginPath();
  ctx.ellipse(12, -46, 5, 11, -0.35, 0, Math.PI * 2);
  ctx.fill();
}

// 奥へいくほど細く見える台形(銃身・筒)
function taper(ctx: CanvasRenderingContext2D, nearHalf: number, farHalf: number, nearY: number, farY: number, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-nearHalf, nearY);
  ctx.lineTo(-farHalf, farY);
  ctx.lineTo(farHalf, farY);
  ctx.lineTo(nearHalf, nearY);
  ctx.closePath();
  ctx.fill();
}

function metal(ctx: CanvasRenderingContext2D, half: number, dark: string, light: string): CanvasGradient {
  const g = ctx.createLinearGradient(-half, 0, half, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.45, light);
  g.addColorStop(1, dark);
  return g;
}

function drawMachineGun(ctx: CanvasRenderingContext2D): void {
  drawSleeve(ctx);
  // 横に突き出たマガジン
  ctx.fillStyle = "#23262c";
  ctx.beginPath();
  ctx.moveTo(-16, -66);
  ctx.quadraticCurveTo(-40, -58, -46, -36);
  ctx.lineTo(-36, -32);
  ctx.quadraticCurveTo(-30, -50, -14, -54);
  ctx.closePath();
  ctx.fill();
  // 本体と、穴のあいた銃身のカバー
  taper(ctx, 19, 12, -48, -96, metal(ctx, 19, "#1f2227", "#4d535e"));
  taper(ctx, 11, 7, -94, -130, metal(ctx, 11, "#2a2d34", "#5f6672"));
  ctx.fillStyle = "#0e0f12";
  for (let i = 0; i < 5; i++) {
    const y = -100 - i * 6;
    ctx.beginPath();
    ctx.ellipse(0, y, 3.2 - i * 0.25, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, -130, 4.5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // 上の持ち手と照星
  ctx.fillStyle = "#15171b";
  ctx.fillRect(-4, -92, 8, 34);
  ctx.fillStyle = "#ffe066";
  ctx.fillRect(-1.2, -134, 2.4, 4);
  drawGripHand(ctx);
}

function drawRocketLauncher(ctx: CanvasRenderingContext2D): void {
  drawSleeve(ctx);
  // 太い筒
  taper(ctx, 30, 19, -20, -122, metal(ctx, 30, "#3d4a2a", "#6f8250"));
  // 帯
  ctx.fillStyle = "#2c361e";
  [-44, -88].forEach((y) => {
    const half = 30 - ((-20 - y) / 102) * 11;
    ctx.fillRect(-half, y - 3, half * 2, 6);
  });
  ctx.fillStyle = "#ff6f91";
  ctx.fillRect(-24, -66, 48, 5);
  // 筒の口(中が見える)
  ctx.fillStyle = "#4c5c34";
  ctx.beginPath();
  ctx.ellipse(0, -122, 19, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#101208";
  ctx.beginPath();
  ctx.ellipse(0, -122, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // 照準器
  ctx.fillStyle = "#1a1f12";
  ctx.fillRect(-36, -80, 10, 18);
  drawGripHand(ctx);
}

function drawGrenadeHand(ctx: CanvasRenderingContext2D, recoil: number): void {
  // 投げた直後は、手を前に振り出して手榴弾は見えない
  ctx.save();
  ctx.translate(0, -recoil * 30);
  drawSleeve(ctx);
  if (recoil < 0.3) {
    ctx.fillStyle = "#4f6b2f";
    ctx.beginPath();
    ctx.ellipse(0, -62, 17, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.5;
    [-70, -60, -50].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(-15, y);
      ctx.lineTo(15, y);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(0, -83);
    ctx.lineTo(0, -41);
    ctx.stroke();
    // 上の金具とピンの輪
    ctx.fillStyle = "#9aa1ab";
    ctx.fillRect(-6, -88, 12, 7);
    ctx.strokeStyle = "#c9ced6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(10, -88, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 手のひら(下から包む)
  ctx.fillStyle = "#f0c7a4";
  ctx.beginPath();
  ctx.moveTo(-22, -16);
  ctx.quadraticCurveTo(-28, -46, -16, -54);
  ctx.lineTo(-8, -40);
  ctx.lineTo(8, -40);
  ctx.lineTo(16, -54);
  ctx.quadraticCurveTo(28, -46, 22, -16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, y: number, scale: number): void {
  const R = 30 * scale;
  const fl = ctx.createRadialGradient(0, y, 0, 0, y, R);
  fl.addColorStop(0, "rgba(255,255,220,1)");
  fl.addColorStop(0.3, "rgba(255,200,80,0.9)");
  fl.addColorStop(1, "rgba(255,120,0,0)");
  ctx.fillStyle = fl;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    const r = i % 2 === 0 ? R : R * 0.4;
    ctx.lineTo(Math.cos(a) * r, y + Math.sin(a) * r * 1.2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawPistol(ctx: CanvasRenderingContext2D): void {
  drawSleeve(ctx);

  // グリップ(手の中に隠れる部分)
  ctx.fillStyle = "#1a1c21";
  roundRect(ctx, -12, -58, 24, 44, 5);
  ctx.fill();

  // スライド(上から見た銃身。奥へいくほど細く見える)
  taper(ctx, 15, 9, -52, -90, metal(ctx, 14, "#2a2d34", "#5a606c"));
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

  drawGripHand(ctx);
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
