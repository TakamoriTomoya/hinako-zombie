// 町の景色(空・地面・建物・街灯)と、置いてあるもの(車・木など)を描く。
// プレイヤーが歩き回るので、毎フレーム今のカメラから描き直す。
// 重くならないよう、窓の配置や色などは場所に着いた時に buildSceneModel で1回だけ決めておき、
// 毎フレームは見えている面だけを写して塗る。遠くのものは色を霧の色に近づけてかすませる。

import { CAMERA_HEIGHT_M } from "./constants";
import { projectCam, projectPolygon, scaleAt, toCamera, type View } from "./perspective";
import type { Box, GroundKind, Lamp, Portal, Prop, Scene } from "./scenes";

type RGB = [number, number, number];

interface Theme {
  sky: [string, string, string]; // 上・中・地平線
  celestial: { kind: "sun" | "moon"; angle: number; elev: number; r: number; color: string; glow: string };
  fog: RGB;
  fogMax: number; // いちばん遠い所での霧の濃さ
  ground: Record<Exclude<GroundKind, "line" | "shadow" | "ceiling">, string>;
  walls: string[];
  roof: string;
  windowLit: string[];
  windowDark: string;
  litRatio: number;
  neon: boolean;
  lampColor: string; // (r,g,b)
}

const THEMES: Theme[] = [
  {
    sky: ["#2a1b4d", "#b04f76", "#f59a5c"],
    celestial: { kind: "sun", angle: 0.35, elev: 0.02, r: 0.07, color: "#ffcf7a", glow: "255,150,80" },
    fog: [240, 140, 110],
    fogMax: 0.55,
    ground: { road: "#3a3340", sidewalk: "#5d5460", grass: "#4f5a3c", plaza: "#6a5f62", dirt: "#6b5646" },
    walls: ["#6b5566", "#7a6258", "#5e5870", "#80695e", "#6e5f52"],
    roof: "#3d2c3a",
    windowLit: ["#ffd98a", "#ffc070"],
    windowDark: "#2e2436",
    litRatio: 0.35,
    neon: false,
    lampColor: "255,210,140",
  },
  {
    sky: ["#050818", "#141c44", "#2b2f66"],
    celestial: { kind: "moon", angle: -0.5, elev: 0.3, r: 0.045, color: "#f4f1d8", glow: "200,210,255" },
    fog: [90, 80, 150],
    fogMax: 0.6,
    ground: { road: "#1d1d2b", sidewalk: "#34324a", grass: "#1f3326", plaza: "#3a3650", dirt: "#3b3140" },
    walls: ["#2e2a44", "#3a2f45", "#28324a", "#3b3550", "#302a3c"],
    roof: "#1a1830",
    windowLit: ["#ffe7a0", "#9fe8ff", "#ffb3d1"],
    windowDark: "#15142a",
    litRatio: 0.45,
    neon: true,
    lampColor: "190,220,255",
  },
  {
    sky: ["#020405", "#0b1712", "#1d3326"],
    celestial: { kind: "moon", angle: 0.4, elev: 0.3, r: 0.075, color: "#e8f5c8", glow: "170,255,170" },
    fog: [90, 150, 100],
    fogMax: 0.75,
    ground: { road: "#141a17", sidewalk: "#27302a", grass: "#16241a", plaza: "#2c3530", dirt: "#2a2a22" },
    walls: ["#1f2a24", "#26302a", "#2b2a24", "#1e2622"],
    roof: "#121a15",
    windowLit: ["#d8ff9a", "#ffe79a"],
    windowDark: "#0c120f",
    litRatio: 0.18,
    neon: false,
    lampColor: "200,255,190",
  },
];

const NEON_COLORS = ["255,80,170", "80,230,255", "255,220,80", "140,255,120"];
const FOG_NEAR = 10; // これより近いものは霧がかからない
const FOG_FAR = 45; // ここで霧がいちばん濃くなる
const SKY_OBJECTS = 140; // 地平線ぞいの遠くの町なみ・星の数(360°ぶん)

type P3 = [x: number, y: number, z: number];
type Pt = { x: number; y: number };

export function themeFor(stageIndex: number): Theme {
  return THEMES[stageIndex % THEMES.length];
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 色を明るく(+)・暗く(-)する
function shadeRgb([r, g, b]: RGB, amount: number): RGB {
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return [f(r), f(g), f(b)];
}

function shade(hex: string, amount: number): RGB {
  return shadeRgb(hexToRgb(hex), amount);
}

// 距離に応じて霧の色に近づけた色
function fogged(rgb: RGB, alpha: number, depth: number, theme: Theme): string {
  const t = Math.max(0, Math.min(1, (depth - FOG_NEAR) / (FOG_FAR - FOG_NEAR))) * theme.fogMax;
  const [r, g, b] = rgb;
  const [fr, fg, fb] = theme.fog;
  return `rgba(${Math.round(r + (fr - r) * t)},${Math.round(g + (fg - g) * t)},${Math.round(b + (fb - b) * t)},${alpha})`;
}

export function fogAmount(depth: number, stageIndex: number): number {
  return Math.max(0, Math.min(1, (depth - FOG_NEAR) / (FOG_FAR - FOG_NEAR))) * themeFor(stageIndex).fogMax;
}

// 画面の外にはみ出していれば true(塗っても見えないので、塗らずにすませる)
function offScreen(pts: Pt[], view: View): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return maxX < 0 || minX > view.w || maxY < 0 || minY > view.h || maxX - minX < 0.5 || maxY - minY < 0.5;
}

function fillPts(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string): void {
  if (pts.length < 3) return;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// 世界の多角形の、カメラからのおおよその奥行き(霧の濃さに使う)
function polyDepth(view: View, pts: P3[]): number {
  let sum = 0;
  for (const [x, , z] of pts) sum += toCamera(view, x, z).z;
  return sum / pts.length;
}

// ---- 場所に着いた時に1回だけ作る、描くための形 ----

// 平らな面。normal の向きから見た時だけ見える(うら側は描かない)
interface Face {
  pts: P3[];
  rgb: RGB;
  alpha: number;
  normal: P3;
  detail?: boolean; // 窓などの細かい部分。遠くの建物では描かない
}

const DETAIL_DIST = 26; // これより遠い建物は、窓などを描かない(霧でかすんで見えないので)

interface TextDeco {
  at: P3; // 文字のまん中
  height: number; // 文字の高さ(m)
  width: number; // 文字を書ける幅(m)
  text: string;
  color: string;
  normal: P3;
}

interface GlowDeco {
  at: P3;
  radius: number; // m
  color: string; // (r,g,b)
  alpha: number;
}

export interface BoxModel {
  box: Box;
  faces: Face[]; // 壁・屋根・窓・ドアなど(描く順)
  texts: TextDeco[];
  glows: GlowDeco[];
}

export interface SceneModel {
  stageIndex: number;
  scene: Scene;
  theme: Theme;
  ground: { pts: P3[]; rgb: RGB; alpha: number }[];
  boxes: BoxModel[];
  sky: { angle: number; w: number; h: number }[]; // 地平線ぞいの遠くの町なみ(角度と大きさ)
  stars: { angle: number; elev: number; r: number; alpha: number }[];
}

// 箱の面を作る。box の外側を向いた面だけ
function boxShell(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, base: RGB): Face[] {
  return [
    { normal: [0, 1, 0], rgb: shadeRgb(base, 0.12), alpha: 1, pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },
    { normal: [0, -1, 0], rgb: shadeRgb(base, -0.4), alpha: 1, pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { normal: [-1, 0, 0], rgb: shadeRgb(base, -0.2), alpha: 1, pts: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { normal: [1, 0, 0], rgb: shadeRgb(base, -0.2), alpha: 1, pts: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]] },
    { normal: [0, 0, -1], rgb: base, alpha: 1, pts: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]] },
    { normal: [0, 0, 1], rgb: shadeRgb(base, -0.1), alpha: 1, pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
  ];
}

// 箱の4つの壁。それぞれ「壁にそって並ぶ向きの範囲」と、面の上に小さな四角を置く関数を持つ
interface Wall {
  normal: P3;
  from: number;
  to: number;
  quad: (a0: number, a1: number, y0: number, y1: number, out?: number) => P3[];
}

function wallsOf(b: Box): Wall[] {
  const e = 0.03;
  return [
    { normal: [-1, 0, 0], from: b.z0, to: b.z1, quad: (a0, a1, y0, y1, o = e) => [[b.x0 - o, y0, a0], [b.x0 - o, y0, a1], [b.x0 - o, y1, a1], [b.x0 - o, y1, a0]] },
    { normal: [1, 0, 0], from: b.z0, to: b.z1, quad: (a0, a1, y0, y1, o = e) => [[b.x1 + o, y0, a0], [b.x1 + o, y0, a1], [b.x1 + o, y1, a1], [b.x1 + o, y1, a0]] },
    { normal: [0, 0, -1], from: b.x0, to: b.x1, quad: (a0, a1, y0, y1, o = e) => [[a0, y0, b.z0 - o], [a1, y0, b.z0 - o], [a1, y1, b.z0 - o], [a0, y1, b.z0 - o]] },
    { normal: [0, 0, 1], from: b.x0, to: b.x1, quad: (a0, a1, y0, y1, o = e) => [[a0, y0, b.z1 + o], [a1, y0, b.z1 + o], [a1, y1, b.z1 + o], [a0, y1, b.z1 + o]] },
  ];
}

function buildBox(b: Box, theme: Theme, rand: () => number, portals: Portal[]): BoxModel {
  const y0 = b.y0 ?? 0;
  const baseHex =
    b.style === "hedge"
      ? "#3f6a35"
      : b.style === "fence" || b.style === "bridge"
        ? "#6f737a"
        : b.style === "sign"
          ? "#c0392b"
          : b.style === "station" || b.style === "school"
            ? "#" + shadeRgb(hexToRgb(theme.walls[0]), 0.15).map((v) => v.toString(16).padStart(2, "0")).join("")
            : theme.walls[Math.floor(rand() * theme.walls.length)];
  const base = hexToRgb(baseHex);
  const faces: Face[] = boxShell(b.x0, b.x1, b.z0, b.z1, y0, b.height, base);
  const texts: TextDeco[] = [];
  const glows: GlowDeco[] = [];
  const windowRow = (w: Wall, fromY: number, toY: number, floorH: number, spacing: number) => {
    for (let fy = fromY; fy + 1.6 < toY; fy += floorH) {
      for (let a = w.from + 0.6; a + 1.2 < w.to - 0.3; a += spacing) {
        const lit = rand() < theme.litRatio;
        faces.push({ normal: w.normal, alpha: 1, detail: true, rgb: hexToRgb(lit ? theme.windowLit[Math.floor(rand() * theme.windowLit.length)] : theme.windowDark), pts: w.quad(a, a + 1.2, fy, fy + 1.4) });
      }
    }
  };

  for (const w of wallsOf(b)) {
    switch (b.style) {
      case "house":
        windowRow(w, 1, b.height, 3, 3);
        break;
      case "building":
        windowRow(w, 1.2, b.height, 3, 2);
        faces.push({ normal: w.normal, alpha: 1, rgb: shadeRgb(base, -0.3), pts: w.quad(w.from, w.to, b.height - 0.35, b.height) });
        break;
      case "shop": {
        windowRow(w, 3.4, b.height, 3, 2);
        const glow = NEON_COLORS[Math.floor(rand() * NEON_COLORS.length)];
        const open = rand() < 0.7;
        const [r, g, bl] = glow.split(",").map(Number);
        faces.push({ normal: w.normal, alpha: open ? 0.6 : 1, rgb: open ? [r, g, bl] : [35, 34, 51], pts: w.quad(w.from + 0.3, w.to - 0.3, 0.2, 2.6) });
        faces.push({ normal: w.normal, alpha: 1, rgb: shadeRgb(base, 0.15), pts: w.quad(w.from, w.to, 2.6, 3.0, 0.05) });
        break;
      }
      case "station":
      case "school":
        windowRow(w, 4, b.height - 2, 3, 2.5);
        break;
      case "bridge":
        faces.push({ normal: w.normal, alpha: 1, rgb: [154, 161, 171], pts: w.quad(w.from, w.to, b.height - 0.5, b.height - 0.3) });
        break;
      default:
        break;
    }
  }

  // 家の屋根(まん中が高い切妻)。ふつうは道からは見上げても見えず、離れると見える
  if (b.style === "house") {
    const roof = hexToRgb(theme.roof);
    const xc = (b.x0 + b.x1) / 2;
    const top = b.height + 1.8;
    const half = (b.x1 - b.x0) / 2;
    faces.push({ normal: [-1.8, half, 0], rgb: roof, alpha: 1, pts: [[b.x0 - 0.3, b.height, b.z0], [b.x0 - 0.3, b.height, b.z1], [xc, top, b.z1], [xc, top, b.z0]] });
    faces.push({ normal: [1.8, half, 0], rgb: shadeRgb(roof, -0.15), alpha: 1, pts: [[b.x1 + 0.3, b.height, b.z0], [b.x1 + 0.3, b.height, b.z1], [xc, top, b.z1], [xc, top, b.z0]] });
    faces.push({ normal: [0, 0, -1], rgb: base, alpha: 1, pts: [[b.x0, b.height, b.z0], [b.x1, b.height, b.z0], [xc, top, b.z0]] });
    faces.push({ normal: [0, 0, 1], rgb: shadeRgb(base, -0.1), alpha: 1, pts: [[b.x0, b.height, b.z1], [b.x1, b.height, b.z1], [xc, top, b.z1]] });
  }

  // 駅・学校の正面(こちら向きの面): 入口、看板、時計
  if (b.style === "station" || b.style === "school") {
    const mid = (b.x0 + b.x1) / 2;
    const z = b.z0 - 0.04;
    if (b.style === "station") {
      faces.push({ normal: [0, 0, -1], rgb: [220, 255, 200], alpha: 0.45, pts: [[mid - 4, 0, z], [mid + 4, 0, z], [mid + 4, 3.4, z], [mid - 4, 3.4, z]] });
      faces.push({ normal: [0, 0, -1], rgb: [230, 237, 216], alpha: 1, pts: [[mid - 5, b.height - 2.2, z], [mid + 5, b.height - 2.2, z], [mid + 5, b.height - 0.4, z], [mid - 5, b.height - 0.4, z]] });
      if (b.text) texts.push({ at: [mid, b.height - 1.3, z - 0.01], height: 1.4, width: 9.5, text: b.text, color: "#1a211c", normal: [0, 0, -1] });
    }
    const cy = b.height - (b.style === "station" ? 3.6 : 1.6);
    const clock: P3[] = Array.from({ length: 16 }, (_, i) => [mid + Math.cos((i / 16) * Math.PI * 2) * 1.1, cy + Math.sin((i / 16) * Math.PI * 2) * 1.1, z - 0.01] as P3);
    faces.push({ normal: [0, 0, -1], rgb: [230, 237, 216], alpha: 1, pts: clock });
    faces.push({ normal: [0, 0, -1], rgb: [26, 33, 28], alpha: 1, pts: [[mid - 0.06, cy, z - 0.02], [mid + 0.06, cy, z - 0.02], [mid + 0.06, cy + 0.85, z - 0.02], [mid - 0.06, cy + 0.85, z - 0.02]] });
    faces.push({ normal: [0, 0, -1], rgb: [26, 33, 28], alpha: 1, pts: [[mid, cy - 0.05, z - 0.02], [mid + 0.55, cy - 0.2, z - 0.02], [mid + 0.55, cy - 0.1, z - 0.02], [mid, cy + 0.05, z - 0.02]] });
  }

  // お店の看板の文字(こちら向きの面)
  if (b.style === "shop" && b.text) {
    const mid = (b.x0 + b.x1) / 2;
    const z = b.z0 - 0.05;
    faces.push({ normal: [0, 0, -1], rgb: [242, 239, 230], alpha: 1, pts: [[b.x0 + 1, 3.4, z], [b.x1 - 1, 3.4, z], [b.x1 - 1, 5, z], [b.x0 + 1, 5, z]] });
    texts.push({ at: [mid, 4.2, z - 0.01], height: 1.2, width: b.x1 - b.x0 - 2.5, text: b.text, color: "#c0392b", normal: [0, 0, -1] });
  }
  if (b.style === "sign" && b.text) {
    texts.push({ at: [(b.x0 + b.x1) / 2, (y0 + b.height) / 2, b.z0 - 0.02], height: (b.height - y0) * 0.6, width: b.x1 - b.x0 - 0.5, text: b.text, color: "#fff3b0", normal: [0, 0, -1] });
  }

  // 夜の商店街のネオン看板(壁から道の方へ突き出た板)
  if (theme.neon && b.style === "shop" && b.height > 6) {
    for (const [wx, dir] of [
      [b.x0, -1],
      [b.x1, 1],
    ] as const) {
      if (rand() > 0.6) continue;
      const sz = b.z0 + 1;
      const color = NEON_COLORS[Math.floor(rand() * NEON_COLORS.length)];
      const xOut = wx + dir * 0.9;
      const [r, g, bl] = color.split(",").map(Number);
      for (const n of [-1, 1]) {
        const z = sz + n * 0.05;
        faces.push({ normal: [0, 0, n], rgb: [26, 20, 38], alpha: 1, pts: [[Math.min(wx, xOut), 3.4, z], [Math.max(wx, xOut), 3.4, z], [Math.max(wx, xOut), 6.6, z], [Math.min(wx, xOut), 6.6, z]] });
        faces.push({ normal: [0, 0, n], rgb: [r, g, bl], alpha: 1, pts: [[Math.min(wx, xOut) + 0.12, 3.6, z + n * 0.01], [Math.max(wx, xOut) - 0.12, 3.6, z + n * 0.01], [Math.max(wx, xOut) - 0.12, 6.4, z + n * 0.01], [Math.min(wx, xOut) + 0.12, 6.4, z + n * 0.01]] });
      }
      glows.push({ at: [(wx + xOut) / 2, 5, sz], radius: 2.2, color, alpha: 0.45 });
    }
  }

  // この箱の壁にあるドア(暗い入口と、まわりの枠・ひさし)
  for (const p of portals) {
    if (p.kind !== "door") continue;
    const wall = wallsOf(b).find((w) => doorOnWall(b, w, p));
    if (!wall) continue;
    const frame = shade(theme.walls[1 % theme.walls.length], -0.45);
    faces.push({ normal: wall.normal, rgb: frame, alpha: 1, pts: wall.quad(p.from - 0.15, p.to + 0.15, 0, p.height + 0.15, 0.04) });
    faces.push({ normal: wall.normal, rgb: [7, 8, 10], alpha: 1, pts: wall.quad(p.from, p.to, 0, p.height, 0.05) });
    faces.push({ normal: wall.normal, rgb: shade(theme.walls[0], -0.5), alpha: 1, pts: wall.quad(p.from - 0.3, p.to + 0.3, p.height + 0.2, p.height + 0.45, 0.07) });
  }
  return { box: b, faces, texts, glows };
}

// ドアがこの箱のこの壁にあるか
function doorOnWall(b: Box, w: Wall, p: Portal): boolean {
  const eps = 0.05;
  if (p.plane === "x") {
    const x = w.normal[0] < 0 ? b.x0 : w.normal[0] > 0 ? b.x1 : NaN;
    return Math.abs(x - p.at) < eps && p.from >= b.z0 - eps && p.to <= b.z1 + eps;
  }
  const z = w.normal[2] < 0 ? b.z0 : w.normal[2] > 0 ? b.z1 : NaN;
  return Math.abs(z - p.at) < eps && p.from >= b.x0 - eps && p.to <= b.x1 + eps;
}

function groundRgb(kind: GroundKind, theme: Theme): { rgb: RGB; alpha: number } {
  if (kind === "line") return { rgb: [235, 225, 190], alpha: 0.5 };
  if (kind === "shadow") return { rgb: [0, 0, 0], alpha: 0.45 };
  if (kind === "ceiling") return { rgb: shade(theme.roof, 0.1), alpha: 1 };
  return { rgb: hexToRgb(theme.ground[kind]), alpha: 1 };
}

export function buildSceneModel(stageIndex: number, scene: Scene): SceneModel {
  const theme = themeFor(stageIndex);
  const rand = seededRandom(4321 + stageIndex * 57 + scene.name.length * 13);
  const skyRand = seededRandom(99 + stageIndex);
  return {
    stageIndex,
    scene,
    theme,
    ground: scene.ground.map((g) => ({ pts: g.pts.map(([x, z]) => [x, g.y ?? 0, z] as P3), ...groundRgb(g.kind, theme) })),
    boxes: scene.boxes.map((b) => buildBox(b, theme, rand, scene.portals)),
    sky: Array.from({ length: SKY_OBJECTS }, (_, i) => ({ angle: (i / SKY_OBJECTS) * Math.PI * 2, w: 0.03 + skyRand() * 0.03, h: 0.01 + skyRand() * 0.04 })),
    stars: theme.celestial.kind === "moon" ? Array.from({ length: 160 }, () => ({ angle: skyRand() * Math.PI * 2, elev: 0.08 + skyRand() * 0.9, r: 0.3 + skyRand() * 1.2, alpha: 0.2 + skyRand() * 0.6 })) : [],
  };
}

// ---- 毎フレーム描く ----

function faceVisible(view: View, f: { pts: P3[]; normal: P3 }): boolean {
  const [px, py, pz] = f.pts[0];
  const [nx, ny, nz] = f.normal;
  return nx * (view.camX - px) + ny * (CAMERA_HEIGHT_M - py) + nz * (view.camZ - pz) > 0;
}

// 画面に写した時の、ある方向(yaw からの角度)の横の位置。見えていない方向なら null
function angleToScreenX(view: View, angle: number): number | null {
  let d = angle - view.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) > 1.35) return null;
  return view.w / 2 + Math.tan(d) * view.focal;
}

// 空・遠くの町なみ・地面。いちばん最初に描く
export function drawBackdrop(ctx: CanvasRenderingContext2D, view: View, model: SceneModel): void {
  const { theme } = model;
  const { w, h, horizonY } = view;
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.6, theme.sky[1]);
  sky.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizonY + 2);

  for (const s of model.stars) {
    const x = angleToScreenX(view, s.angle);
    if (x === null) continue;
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.fillRect(x, horizonY * (1 - s.elev), s.r * 1.5, s.r * 1.5);
  }

  const c = theme.celestial;
  const cx = angleToScreenX(view, c.angle);
  if (cx !== null) {
    const cy = horizonY * (1 - c.elev) - (c.kind === "sun" ? 0 : 0);
    const r = Math.min(w, h) * c.r * 1.6;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 4);
    glow.addColorStop(0, `rgba(${c.glow},0.45)`);
    glow.addColorStop(1, `rgba(${c.glow},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 地平線ぞいの遠くの町なみ(霧の色)
  const skyline = theme.sky[2];
  ctx.fillStyle = `rgb(${shade(skyline, -0.45).join(",")})`;
  for (const s of model.sky) {
    const x = angleToScreenX(view, s.angle);
    if (x === null) continue;
    const bw = s.w * view.focal;
    ctx.fillRect(x, horizonY - s.h * view.focal, bw + 1, s.h * view.focal + 2);
  }

  // 地面
  ctx.fillStyle = fogged(hexToRgb(theme.ground.road), 1, 30, theme);
  ctx.fillRect(0, horizonY, w, h - horizonY);
  for (const g of model.ground) {
    const pts = projectPolygon(view, g.pts);
    if (pts.length < 3 || offScreen(pts, view)) continue;
    fillPts(ctx, pts, fogged(g.rgb, g.alpha, Math.max(0, polyDepth(view, g.pts)), theme));
  }
  // 地平線のかすみ
  const haze = ctx.createLinearGradient(0, horizonY - h * 0.08, 0, horizonY + h * 0.06);
  const [fr, fg, fb] = theme.fog;
  haze.addColorStop(0, `rgba(${fr},${fg},${fb},0)`);
  haze.addColorStop(0.6, `rgba(${fr},${fg},${fb},${theme.fogMax * 0.6})`);
  haze.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizonY - h * 0.08, w, h * 0.14);

  // 街灯の地面の光だまり
  for (const l of model.scene.lamps) drawLampPool(ctx, view, l, theme);
}

// 箱がまるごとカメラのうしろにあるか
function boxBehind(view: View, b: Box): boolean {
  return [
    [b.x0, b.z0],
    [b.x1, b.z0],
    [b.x0, b.z1],
    [b.x1, b.z1],
  ].every(([x, z]) => toCamera(view, x, z).z < 0.3);
}

export function drawBoxModel(ctx: CanvasRenderingContext2D, view: View, model: SceneModel, b: BoxModel): void {
  const { theme } = model;
  if (boxBehind(view, b.box)) return;
  const bx = b.box;
  const far = Math.hypot(Math.max(bx.x0 - view.camX, 0, view.camX - bx.x1), Math.max(bx.z0 - view.camZ, 0, view.camZ - bx.z1)) > DETAIL_DIST;
  for (const f of b.faces) {
    if (far && f.detail) continue;
    if (!faceVisible(view, f)) continue;
    const pts = projectPolygon(view, f.pts);
    if (pts.length < 3 || offScreen(pts, view)) continue;
    fillPts(ctx, pts, fogged(f.rgb, f.alpha, Math.max(0, polyDepth(view, f.pts)), theme));
  }
  for (const t of b.texts) {
    if (!faceVisible(view, { pts: [t.at], normal: t.normal })) continue;
    const c = toCamera(view, t.at[0], t.at[2]);
    if (c.z < 0.5) continue;
    const s = scaleAt(view, c.z);
    const size = Math.min(t.height * s, (t.width * s * 1.6) / t.text.length);
    if (size < 6) continue;
    const p = projectCam(view, c.x, t.at[1], c.z);
    ctx.font = `800 ${Math.round(size)}px "M PLUS Rounded 1c", "Baloo 2", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, p.x, p.y);
    ctx.textBaseline = "alphabetic";
  }
  for (const g of b.glows) drawGlow(ctx, view, g.at, g.radius, g.color, g.alpha);
}

// ---- 光(やわらかい丸い光は、1回だけ作った絵を大きさを変えて貼る) ----

const glowCache = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (!c) {
    c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g2 = c.getContext("2d");
    if (g2) {
      const g = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${color},1)`);
      g.addColorStop(0.15, `rgba(${color},0.5)`);
      g.addColorStop(1, `rgba(${color},0)`);
      g2.fillStyle = g;
      g2.fillRect(0, 0, 64, 64);
    }
    glowCache.set(color, c);
  }
  return c;
}

function drawGlow(ctx: CanvasRenderingContext2D, view: View, at: P3, radiusM: number, color: string, alpha: number, squash = 1): void {
  const c = toCamera(view, at[0], at[2]);
  if (c.z < 0.4) return;
  const p = projectCam(view, c.x, at[1], c.z);
  const r = radiusM * scaleAt(view, c.z);
  if (p.x + r < 0 || p.x - r > view.w) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), p.x - r, p.y - r * squash, r * 2, r * 2 * squash);
  ctx.globalAlpha = 1;
}

function lampHead(l: Lamp): P3 {
  return l.arm === 0 ? [l.x, 4.2, l.z] : [l.x + l.arm * 1.2, 5, l.z];
}

function drawLampPool(ctx: CanvasRenderingContext2D, view: View, l: Lamp, theme: Theme): void {
  const [hx, , hz] = lampHead(l);
  drawGlow(ctx, view, [hx, 0, hz], 3.2, theme.lampColor, 0.35, 0.28);
}

// 街灯の柱と明かり。flicker は明るさ(1: ふつう)
export function drawLamp(ctx: CanvasRenderingContext2D, view: View, l: Lamp, stageIndex: number, flicker: number): void {
  const theme = themeFor(stageIndex);
  const c = toCamera(view, l.x, l.z);
  if (c.z < 0.4) return;
  const head = lampHead(l);
  const hc = toCamera(view, head[0], head[2]);
  const base = projectCam(view, c.x, 0, c.z);
  const top = projectCam(view, c.x, head[1], c.z);
  const hp = projectCam(view, hc.x, head[1], Math.max(0.4, hc.z));
  ctx.strokeStyle = "#0e0e14";
  ctx.lineWidth = Math.max(1.2, scaleAt(view, c.z) * 0.14);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.lineTo(hp.x, hp.y);
  ctx.stroke();
  drawGlow(ctx, view, head, 1.6, theme.lampColor, 0.9 * flicker);
}

// ---- 置いてあるもの(車・木・噴水など) ----

type Poly = P3[];

function propBox(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, color: string): Face[] {
  return boxShell(x0, x1, z0, z1, y0, y1, hexToRgb(color));
}

function drawFaces(ctx: CanvasRenderingContext2D, view: View, faces: Face[], stageIndex: number): void {
  const theme = themeFor(stageIndex);
  for (const f of faces) {
    if (!faceVisible(view, f)) continue;
    const pts = projectPolygon(view, f.pts);
    if (pts.length < 3 || offScreen(pts, view)) continue;
    fillPts(ctx, pts, fogged(f.rgb, f.alpha, Math.max(0, polyDepth(view, f.pts)), theme));
  }
}

function ellipseAround(view: View, at: P3, rxM: number, ryM: number, n = 18): Pt[] {
  const c = toCamera(view, at[0], at[2]);
  if (c.z < 0.4) return [];
  const p = projectCam(view, c.x, at[1], c.z);
  const s = scaleAt(view, c.z);
  return Array.from({ length: n }, (_, i) => ({ x: p.x + Math.cos((i / n) * Math.PI * 2) * rxM * s, y: p.y + Math.sin((i / n) * Math.PI * 2) * ryM * s }));
}

function ring(cx: number, cz: number, r: number, y: number, n = 20): Poly {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, y, cz + Math.sin((i / n) * Math.PI * 2) * r] as P3);
}

// 横から見た車・バスの窓やドアの面(見えている長い面に貼る)
function sideDecor(p: Prop, faces: Face[]): void {
  const h = p.height;
  const bus = p.kind === "bus";
  const long = p.x1 - p.x0 > p.z1 - p.z0 ? "x" : "z";
  for (const n of [-1, 1]) {
    const q = (a0: number, a1: number, y0: number, y1: number): P3[] =>
      long === "x"
        ? [[a0, y0, n < 0 ? p.z0 - 0.02 : p.z1 + 0.02], [a1, y0, n < 0 ? p.z0 - 0.02 : p.z1 + 0.02], [a1, y1, n < 0 ? p.z0 - 0.02 : p.z1 + 0.02], [a0, y1, n < 0 ? p.z0 - 0.02 : p.z1 + 0.02]]
        : [[n < 0 ? p.x0 - 0.02 : p.x1 + 0.02, y0, a0], [n < 0 ? p.x0 - 0.02 : p.x1 + 0.02, y0, a1], [n < 0 ? p.x0 - 0.02 : p.x1 + 0.02, y1, a1], [n < 0 ? p.x0 - 0.02 : p.x1 + 0.02, y1, a0]];
    const normal: P3 = long === "x" ? [0, 0, n] : [n, 0, 0];
    const a0 = long === "x" ? p.x0 : p.z0;
    const a1 = long === "x" ? p.x1 : p.z1;
    if (bus) {
      for (let a = a0 + 0.4; a + 1.1 < a1 - 0.3; a += 1.4) faces.push({ normal, rgb: [207, 232, 240], alpha: 1, pts: q(a, a + 1.1, h * 0.5, h * 0.85) });
      faces.push({ normal, rgb: [242, 239, 230], alpha: 1, pts: q(a0, a1, h * 0.3, h * 0.36) });
      if (n < 0) faces.push({ normal, rgb: [7, 8, 10], alpha: 1, pts: q(a1 - 3.3, a1 - 2.3, 0.2, h * 0.85) });
    } else {
      faces.push({ normal, rgb: [29, 36, 48], alpha: 1, pts: q(a0 + (a1 - a0) * 0.18, a1 - (a1 - a0) * 0.2, h * 0.58, h * 0.92) });
    }
    for (const wa of [a0 + (bus ? 1.3 : 0.8), a1 - (bus ? 1.6 : 0.8)]) faces.push({ normal, rgb: [17, 17, 17], alpha: 1, pts: q(wa - 0.35, wa + 0.35, 0, 0.6) });
  }
}

// 置いてあるものの面(形の決まった部分)
function propFaces(p: Prop): Face[] {
  const { x0, x1, z0, z1, height: h, color } = p;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  switch (p.kind) {
    case "tree":
      return propBox(cx - 0.18, cx + 0.18, cz - 0.18, cz + 0.18, 0, h * 0.6, "#5a3d25");
    case "bush":
    case "fountain":
      return [];
    case "bench":
      return [...propBox(x0, x1, z0, z1, 0.4, 0.5, color), ...propBox(x0, x1, z1 - 0.08, z1, 0.5, h, color), ...propBox(x0 + 0.1, x0 + 0.18, z0, z1, 0, 0.4, "#222222"), ...propBox(x1 - 0.18, x1 - 0.1, z0, z1, 0, 0.4, "#222222")];
    case "shelter":
      return [
        ...propBox(x0, x1, z0, z1, h - 0.2, h, color),
        ...propBox(x0 + 0.05, x0 + 0.15, z0 + 0.05, z0 + 0.15, 0, h - 0.2, "#444444"),
        ...propBox(x1 - 0.15, x1 - 0.05, z0 + 0.05, z0 + 0.15, 0, h - 0.2, "#444444"),
        { normal: [0, 0, -1], rgb: [170, 200, 220], alpha: 0.25, pts: [[x0, 0.2, z1], [x1, 0.2, z1], [x1, h - 0.2, z1], [x0, h - 0.2, z1]] },
        { normal: [0, 0, 1], rgb: [170, 200, 220], alpha: 0.25, pts: [[x0, 0.2, z1], [x1, 0.2, z1], [x1, h - 0.2, z1], [x0, h - 0.2, z1]] },
      ];
    default: {
      const faces = propBox(x0, x1, z0, z1, 0, h, color);
      const w = x1 - x0;
      const front = (a0: number, a1: number, y0: number, y1: number, rgb: RGB, n = -1): Face => ({
        normal: [0, 0, n],
        rgb,
        alpha: 1,
        pts: [[a0, y0, (n < 0 ? z0 : z1) + n * 0.02], [a1, y0, (n < 0 ? z0 : z1) + n * 0.02], [a1, y1, (n < 0 ? z0 : z1) + n * 0.02], [a0, y1, (n < 0 ? z0 : z1) + n * 0.02]],
      });
      switch (p.kind) {
        case "car":
          // うしろ(手前の面)と前(奥の面)の窓・ランプ・ナンバー、横の窓とタイヤ
          for (const n of [-1, 1]) {
            faces.push(front(x0 + w * 0.12, x1 - w * 0.12, h * 0.62, h * 0.93, [29, 36, 48], n));
            faces.push(front(x0 + 0.05, x0 + 0.3, h * 0.42, h * 0.52, n < 0 ? [255, 59, 59] : [255, 250, 210], n));
            faces.push(front(x1 - 0.3, x1 - 0.05, h * 0.42, h * 0.52, n < 0 ? [255, 59, 59] : [255, 250, 210], n));
            faces.push(front(x0 + w * 0.35, x1 - w * 0.35, h * 0.2, h * 0.32, [232, 232, 216], n));
          }
          sideDecor(p, faces);
          break;
        case "carSide":
        case "bus":
          sideDecor(p, faces);
          break;
        case "dumpster":
          faces.push(front(x0, x1, h * 0.85, h, shade(color, -0.35)));
          faces.push(front(x0 + w * 0.15, x1 - w * 0.15, h * 0.35, h * 0.55, shade(color, 0.2)));
          break;
        case "vending":
          faces.push(front(x0 + w * 0.1, x1 - w * 0.1, h * 0.5, h * 0.92, [255, 247, 214]));
          faces.push(front(x0 + w * 0.3, x1 - w * 0.3, h * 0.08, h * 0.2, [17, 17, 17]));
          break;
        case "barricade":
          for (const n of [-1, 1]) {
            for (let i = 0; i < 6; i += 2) {
              const a = x0 + (w * i) / 6;
              faces.push(front(a, a + w / 6, h * 0.45, h * 0.9, [26, 26, 26], n));
            }
          }
          break;
        case "stall":
          faces.push(front(x0 - 0.1, x1 + 0.1, h * 0.8, h, [232, 224, 200]));
          faces.push(front(x0, x1, h * 0.8, h * 0.9, [192, 57, 43]));
          break;
        default:
          break;
      }
      return faces;
    }
  }
}

const propFaceCache = new WeakMap<Prop, Face[]>();

function cachedPropFaces(p: Prop): Face[] {
  let f = propFaceCache.get(p);
  if (!f) {
    f = propFaces(p);
    propFaceCache.set(p, f);
  }
  return f;
}

export function drawProp(ctx: CanvasRenderingContext2D, view: View, p: Prop, stageIndex: number): void {
  const { x0, x1, z0, z1, height: h } = p;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const theme = themeFor(stageIndex);
  const depth = Math.max(0, toCamera(view, cx, cz).z);
  // 足もとの影
  const shadow = projectPolygon(view, [[x0 - 0.1, 0, z0 - 0.1], [x1 + 0.1, 0, z0 - 0.1], [x1 + 0.1, 0, z1 + 0.1], [x0 - 0.1, 0, z1 + 0.1]]);
  fillPts(ctx, shadow, "rgba(0,0,0,0.35)");

  if (p.kind === "fountain") {
    const r = (x1 - x0) / 2;
    // 手前半分の側面と、上の縁・水面(輪をいくつかの帯に分けて描く)
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const q: Poly = [
        [cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r],
        [cx + Math.cos(a1) * r, 0, cz + Math.sin(a1) * r],
        [cx + Math.cos(a1) * r, h, cz + Math.sin(a1) * r],
        [cx + Math.cos(a0) * r, h, cz + Math.sin(a0) * r],
      ];
      const mid: P3 = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      if (!faceVisible(view, { pts: q, normal: mid })) continue;
      fillPts(ctx, projectPolygon(view, q), fogged(shade(p.color, -0.2), 1, depth, theme));
    }
    fillPts(ctx, projectPolygon(view, ring(cx, cz, r, h)), fogged(hexToRgb(p.color), 1, depth, theme));
    fillPts(ctx, projectPolygon(view, ring(cx, cz, r * 0.85, h + 0.01)), fogged([95, 143, 176], 1, depth, theme));
    drawFaces(ctx, view, propBox(cx - 0.15, cx + 0.15, cz - 0.15, cz + 0.15, 0, h + 1.2, p.color), stageIndex);
    return;
  }
  if (p.kind === "bush") {
    fillPts(ctx, ellipseAround(view, [cx, h * 0.5, cz], (x1 - x0) / 2, h * 0.6), fogged(hexToRgb(p.color), 1, depth, theme));
    return;
  }
  drawFaces(ctx, view, cachedPropFaces(p), stageIndex);
  if (p.kind === "tree") {
    const r = (x1 - x0) / 2;
    fillPts(ctx, ellipseAround(view, [cx, h * 0.7, cz], r, r * 0.85), fogged(hexToRgb(p.color), 1, depth, theme));
    fillPts(ctx, ellipseAround(view, [cx - r * 0.25, h * 0.78, cz], r * 0.55, r * 0.45), fogged(shade(p.color, 0.15), 1, depth, theme));
  }
}

// 弾をさえぎる形(画面上の多角形)。見た目の形に合わせる
export function propPolygons(view: View, p: Prop): Pt[][] {
  const { x0, x1, z0, z1, height: h } = p;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const faces = (list: Face[]) => list.filter((f) => faceVisible(view, f)).map((f) => projectPolygon(view, f.pts));
  switch (p.kind) {
    case "tree": {
      const r = (x1 - x0) / 2;
      return [...faces(cachedPropFaces(p)), ellipseAround(view, [cx, h * 0.7, cz], r, r * 0.85)];
    }
    case "bush":
      return [ellipseAround(view, [cx, h * 0.5, cz], (x1 - x0) / 2, h * 0.6)];
    case "fountain":
      return faces(propBox(x0 + 0.3, x1 - 0.3, z0 + 0.3, z1 - 0.3, 0, h, p.color));
    case "shelter":
      return faces(propBox(x0, x1, z0, z1, h - 0.2, h, p.color));
    default:
      return faces(propBox(x0, x1, z0, z1, 0, h, p.color));
  }
}

// 建物の面のうち、画面の点(px, py)をさえぎっているもの(撃った弾が建物に当たるか)
export function boxPolygons(view: View, b: BoxModel): Pt[][] {
  const y0 = b.box.y0 ?? 0;
  return boxShell(b.box.x0, b.box.x1, b.box.z0, b.box.z1, y0, b.box.height, [0, 0, 0])
    .filter((f) => faceVisible(view, f))
    .map((f) => projectPolygon(view, f.pts))
    .filter((pts) => pts.length >= 3);
}
