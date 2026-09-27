// 町の景色(空・建物・道・街灯)を描く。
// 動かない部分は drawTown でステージや画面サイズが変わった時に1回だけ別のcanvasに描いておき、
// 毎フレームはそれを貼るだけにする。ちらつく街灯・霧のゆらぎ・画面のすみの暗さは drawTownOverlay で毎フレーム描く。

import { ROAD_HALF_WIDTH_M, SIDEWALK_WIDTH_M } from "./constants";
import { projectX, projectY, scaleAt, type View } from "./perspective";

interface Theme {
  sky: [string, string, string]; // 上・中・地平線
  celestial: { kind: "sun" | "moon"; x: number; y: number; r: number; color: string; glow: string };
  fog: string; // 地平線あたりの霧の色 (r,g,b)
  fogAlpha: number;
  ground: string;
  sidewalk: string;
  walls: string[]; // 建物の壁の色(ランダムに選ぶ)
  windowLit: string[];
  windowDark: string;
  litRatio: number; // 窓の明かりがついている割合
  buildingHeight: [number, number];
  shops: boolean; // 1階をお店にして、ネオンの看板を出す
  station: boolean; // 道のつきあたりに駅
  crosswalk: boolean;
  lampColor: string; // (r,g,b)
}

const THEMES: Theme[] = [
  {
    sky: ["#2a1b4d", "#b04f76", "#f59a5c"],
    celestial: { kind: "sun", x: 0.72, y: -0.02, r: 0.07, color: "#ffcf7a", glow: "255,150,80" },
    fog: "240,140,110",
    fogAlpha: 0.45,
    ground: "#3a3340",
    sidewalk: "#5d5460",
    walls: ["#6b5566", "#7a6258", "#5e5870", "#80695e", "#6e5f52"],
    windowLit: ["#ffd98a", "#ffc070"],
    windowDark: "#2e2436",
    litRatio: 0.35,
    buildingHeight: [5, 8],
    shops: false,
    station: false,
    crosswalk: true,
    lampColor: "255,210,140",
  },
  {
    sky: ["#050818", "#141c44", "#2b2f66"],
    celestial: { kind: "moon", x: 0.25, y: 0.17, r: 0.045, color: "#f4f1d8", glow: "200,210,255" },
    fog: "90,80,150",
    fogAlpha: 0.5,
    ground: "#1d1d2b",
    sidewalk: "#34324a",
    walls: ["#2e2a44", "#3a2f45", "#28324a", "#3b3550", "#302a3c"],
    windowLit: ["#ffe7a0", "#9fe8ff", "#ffb3d1"],
    windowDark: "#15142a",
    litRatio: 0.45,
    buildingHeight: [7, 13],
    shops: true,
    station: false,
    crosswalk: false,
    lampColor: "190,220,255",
  },
  {
    sky: ["#020405", "#0b1712", "#1d3326"],
    celestial: { kind: "moon", x: 0.7, y: 0.2, r: 0.075, color: "#e8f5c8", glow: "170,255,170" },
    fog: "90,150,100",
    fogAlpha: 0.65,
    ground: "#141a17",
    sidewalk: "#27302a",
    walls: ["#1f2a24", "#26302a", "#2b2a24", "#1e2622"],
    windowLit: ["#d8ff9a", "#ffe79a"],
    windowDark: "#0c120f",
    litRatio: 0.18,
    buildingHeight: [6, 16],
    shops: false,
    station: true,
    crosswalk: true,
    lampColor: "200,255,190",
  },
];

const WALL_X = ROAD_HALF_WIDTH_M + SIDEWALK_WIDTH_M;
const FAR_Z = 70;
const STATION_Z = 46;
const NEAR_Z = 0.4;
const NEON_COLORS = ["255,80,170", "80,230,255", "255,220,80", "140,255,120"];
const LAMPS: { side: -1 | 1; z: number }[] = [
  { side: 1, z: 7 },
  { side: -1, z: 13 },
  { side: 1, z: 22 },
  { side: -1, z: 30 },
  { side: 1, z: 40 },
];

type P3 = [x: number, y: number, z: number];

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function poly(ctx: CanvasRenderingContext2D, view: View, pts: P3[], fill: string): void {
  ctx.beginPath();
  pts.forEach(([x, y, z], i) => {
    const zz = Math.max(z, NEAR_Z);
    const px = projectX(view, x, zz);
    const py = projectY(view, y, zz);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// 道に面した壁(x一定の面)の上の四角。zは奥行き、yは高さ
function wallQuad(ctx: CanvasRenderingContext2D, view: View, x: number, z0: number, z1: number, y0: number, y1: number, fill: string): void {
  poly(ctx, view, [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], fill);
}

// こちらを向いた面(z一定の面)の上の四角
function faceQuad(ctx: CanvasRenderingContext2D, view: View, z: number, x0: number, x1: number, y0: number, y1: number, fill: string): void {
  poly(ctx, view, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], fill);
}

interface Building {
  side: -1 | 1;
  z0: number;
  z1: number;
  height: number;
  wall: string;
}

function planBuildings(theme: Theme, rand: () => number, endZ: number): Building[] {
  const list: Building[] = [];
  for (const side of [-1, 1] as const) {
    let z = 0;
    while (z < endZ) {
      const len = 4 + rand() * 6;
      const [hMin, hMax] = theme.buildingHeight;
      list.push({ side, z0: z, z1: Math.min(z + len, endZ), height: hMin + rand() * (hMax - hMin), wall: theme.walls[Math.floor(rand() * theme.walls.length)] });
      // ときどき細い路地のすき間をあける
      z += len + (rand() < 0.25 ? 1.2 + rand() * 1.5 : 0);
    }
  }
  return list;
}

function drawBuilding(ctx: CanvasRenderingContext2D, view: View, b: Building, theme: Theme, rand: () => number, shopRand: () => number): void {
  const x = b.side * WALL_X;
  const outerX = b.side * (WALL_X + 14);
  // こちら向きの面(手前の建物より高いところだけ見える)。道に面した壁より少し暗くする
  faceQuad(ctx, view, b.z0, x, outerX, 0, b.height, shade(b.wall, -0.18));
  wallQuad(ctx, view, x, b.z0, b.z1, 0, b.height, b.wall);
  // 屋上のふち
  wallQuad(ctx, view, x, b.z0, b.z1, b.height - 0.35, b.height, shade(b.wall, -0.3));

  // 窓: 3mごとの階に、2mおきに並べる
  const firstFloor = theme.shops ? 3.2 : 1;
  for (let fy = firstFloor; fy + 2 < b.height; fy += 3) {
    for (let wz = b.z0 + 0.6; wz + 1.2 < b.z1 - 0.3; wz += 2) {
      const lit = rand() < theme.litRatio;
      const color = lit ? theme.windowLit[Math.floor(rand() * theme.windowLit.length)] : theme.windowDark;
      wallQuad(ctx, view, x - b.side * 0.01, wz, wz + 1.2, fy, fy + 1.4, color);
    }
  }

  if (theme.shops) {
    // 1階のお店: 明るいショーウィンドウと、ひさし
    const glow = NEON_COLORS[Math.floor(shopRand() * NEON_COLORS.length)];
    const open = shopRand() < 0.6;
    wallQuad(ctx, view, x - b.side * 0.01, b.z0 + 0.3, b.z1 - 0.3, 0.2, 2.6, open ? `rgba(${glow},0.55)` : "#232233");
    if (!open) {
      // シャッターの横すじ
      for (let y = 0.5; y < 2.6; y += 0.3) wallQuad(ctx, view, x - b.side * 0.02, b.z0 + 0.3, b.z1 - 0.3, y, y + 0.05, "#2f2e44");
    }
    wallQuad(ctx, view, x - b.side * 0.02, b.z0, b.z1, 2.6, 3.0, shade(b.wall, 0.15));
    // 壁から道の方へ突き出たネオンの看板(こちら向き)
    if (shopRand() < 0.55 && b.height > 6) {
      const sz = b.z0 + 1;
      const color = NEON_COLORS[Math.floor(shopRand() * NEON_COLORS.length)];
      const x0 = x - b.side * 0.9;
      const s = scaleAt(view, sz);
      const cx = projectX(view, (x + x0) / 2, sz);
      const cy = projectY(view, 5, sz);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 2.2);
      g.addColorStop(0, `rgba(${color},0.45)`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - s * 2.2, cy - s * 2.2, s * 4.4, s * 4.4);
      faceQuad(ctx, view, sz, x0, x, 3.4, 6.6, "#1a1426");
      faceQuad(ctx, view, sz - 0.01, x0 + b.side * 0.12, x - b.side * 0.12, 3.6, 6.4, `rgb(${color})`);
    }
  }
}

// 色を明るく(+)・暗く(-)する。"#rrggbb" のみ
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawSky(ctx: CanvasRenderingContext2D, view: View, theme: Theme, rand: () => number): void {
  const { w, horizonY } = view;
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.6, theme.sky[1]);
  sky.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizonY + 2);

  // 星(夜だけ)
  if (theme.celestial.kind === "moon") {
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`;
      const r = rand() * 1.2 + 0.3;
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * horizonY * 0.8, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const c = theme.celestial;
  const cx = w * c.x;
  const cy = c.kind === "sun" ? horizonY * (0.85 + c.y) : horizonY * c.y;
  const r = Math.min(w, view.h) * c.r * 1.6;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 4);
  glow.addColorStop(0, `rgba(${c.glow},0.45)`);
  glow.addColorStop(1, `rgba(${c.glow},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
  ctx.fillStyle = c.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (c.kind === "moon") {
    // 月のもよう
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    [[-0.3, -0.2, 0.25], [0.25, 0.1, 0.18], [-0.05, 0.4, 0.15]].forEach(([dx, dy, rr]) => {
      ctx.beginPath();
      ctx.arc(cx + dx * r, cy + dy * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 遠くの町なみのシルエット(地平線ぞいに)
  ctx.fillStyle = shade(theme.sky[2], -0.55);
  let x = 0;
  while (x < w) {
    const bw = 8 + rand() * 26;
    const bh = 6 + rand() * 30;
    ctx.fillRect(x, horizonY - bh * (view.h / 800), bw, bh * (view.h / 800) + 2);
    x += bw;
  }
}

function drawGround(ctx: CanvasRenderingContext2D, view: View, theme: Theme): void {
  const { w, h, horizonY } = view;
  const ground = ctx.createLinearGradient(0, horizonY, 0, h);
  ground.addColorStop(0, shade(theme.ground, -0.3));
  ground.addColorStop(1, theme.ground);
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  // 歩道と縁石
  for (const side of [-1, 1]) {
    poly(ctx, view, [[side * ROAD_HALF_WIDTH_M, 0, NEAR_Z], [side * WALL_X, 0, NEAR_Z], [side * WALL_X, 0, FAR_Z], [side * ROAD_HALF_WIDTH_M, 0, FAR_Z]], theme.sidewalk);
    poly(ctx, view, [[side * ROAD_HALF_WIDTH_M, 0, NEAR_Z], [side * (ROAD_HALF_WIDTH_M + 0.2), 0, NEAR_Z], [side * (ROAD_HALF_WIDTH_M + 0.2), 0, FAR_Z], [side * ROAD_HALF_WIDTH_M, 0, FAR_Z]], shade(theme.sidewalk, 0.25));
  }
  // センターラインの点線
  for (let z = 1; z < FAR_Z; z += 6) {
    poly(ctx, view, [[-0.08, 0, z], [0.08, 0, z], [0.08, 0, z + 3], [-0.08, 0, z + 3]], "rgba(235,225,190,0.55)");
  }
  if (theme.crosswalk) {
    for (let x = -ROAD_HALF_WIDTH_M + 0.3; x < ROAD_HALF_WIDTH_M - 0.3; x += 0.9) {
      poly(ctx, view, [[x, 0, 15], [x + 0.5, 0, 15], [x + 0.5, 0, 18], [x, 0, 18]], "rgba(235,235,225,0.45)");
    }
  }
}

function drawStation(ctx: CanvasRenderingContext2D, view: View): void {
  const z = STATION_Z;
  faceQuad(ctx, view, z, -16, 16, 0, 11, "#2a332c");
  faceQuad(ctx, view, z - 0.01, -16, 16, 10.4, 11, "#1a211c");
  // 入口の明かり
  faceQuad(ctx, view, z - 0.01, -3, 3, 0, 3.2, "rgba(220,255,200,0.5)");
  // 窓
  for (let x = -14; x < 14; x += 2.5) {
    if (Math.abs(x) < 4) continue;
    faceQuad(ctx, view, z - 0.01, x, x + 1.5, 4.5, 6.5, Math.abs(x) % 5 < 2 ? "#cfe8a8" : "#141a16");
  }
  // 時計
  const cx = projectX(view, 0, z);
  const cy = projectY(view, 7.8, z);
  const r = scaleAt(view, z) * 1.3;
  ctx.fillStyle = "#e6edd8";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a211c";
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - r * 0.8);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.1, cy - r * 0.55);
  ctx.stroke();
}

function drawLamp(ctx: CanvasRenderingContext2D, view: View, side: -1 | 1, z: number, theme: Theme): void {
  const x = side * (ROAD_HALF_WIDTH_M + 0.6);
  const s = scaleAt(view, z);
  const px = projectX(view, x, z);
  const baseY = projectY(view, 0, z);
  const topY = projectY(view, 5, z);
  const headX = projectX(view, x - side * 1.2, z);
  // 地面の光だまり
  const poolX = projectX(view, x - side * 1.2, z);
  ctx.save();
  ctx.translate(poolX, baseY);
  ctx.scale(1, 0.28);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 3.2);
  pool.addColorStop(0, `rgba(${theme.lampColor},0.35)`);
  pool.addColorStop(1, `rgba(${theme.lampColor},0)`);
  ctx.fillStyle = pool;
  ctx.fillRect(-s * 3.2, -s * 3.2, s * 6.4, s * 6.4);
  ctx.restore();
  // 柱とアーム
  ctx.strokeStyle = "#0e0e14";
  ctx.lineWidth = Math.max(1.2, s * 0.14);
  ctx.beginPath();
  ctx.moveTo(px, baseY);
  ctx.lineTo(px, topY);
  ctx.lineTo(headX, topY);
  ctx.stroke();
}

export function drawTown(ctx: CanvasRenderingContext2D, view: View, stageIndex: number): void {
  const theme = THEMES[stageIndex % THEMES.length];
  const rand = seededRandom(1234 + stageIndex * 99);
  const shopRand = seededRandom(777 + stageIndex);
  drawSky(ctx, view, theme, rand);
  drawGround(ctx, view, theme);
  const endZ = theme.station ? STATION_Z : FAR_Z;
  if (theme.station) drawStation(ctx, view);

  const buildings = planBuildings(theme, rand, endZ);
  // 遠くの建物から順に描いて、近くの建物で上書きする
  buildings.sort((a, b) => b.z0 - a.z0);
  for (const b of buildings) drawBuilding(ctx, view, b, theme, rand, shopRand);

  // 地平線あたりの霧(遠くの建物をかすませる)
  const { w, horizonY, h } = view;
  const fog = ctx.createLinearGradient(0, horizonY - h * 0.18, 0, horizonY + h * 0.08);
  fog.addColorStop(0, `rgba(${theme.fog},0)`);
  fog.addColorStop(0.7, `rgba(${theme.fog},${theme.fogAlpha})`);
  fog.addColorStop(1, `rgba(${theme.fog},0)`);
  ctx.fillStyle = fog;
  ctx.fillRect(0, horizonY - h * 0.18, w, h * 0.26);

  // 地面をはう霧のかたまり
  [0.25, 0.7, 0.45].forEach((fx, i) => {
    ctx.save();
    ctx.translate(fx * w, horizonY + h * (0.03 + i * 0.05));
    ctx.scale(1, 0.18);
    const r = w * 0.6;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${theme.fog},${theme.fogAlpha * 0.35})`);
    g.addColorStop(1, `rgba(${theme.fog},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  });

  for (const lamp of [...LAMPS].reverse()) drawLamp(ctx, view, lamp.side, lamp.z, theme);
  // 街灯の明かり。いちばん手前の1本はちらつかせるので、毎フレーム drawTownOverlay で描く
  LAMPS.slice(1).forEach((lamp) => drawLampGlow(ctx, view, lamp, theme, 1));
}

function drawLampGlow(ctx: CanvasRenderingContext2D, view: View, lamp: (typeof LAMPS)[number], theme: Theme, strength: number): void {
  const s = scaleAt(view, lamp.z);
  const hx = projectX(view, lamp.side * (ROAD_HALF_WIDTH_M + 0.6 - 1.2), lamp.z);
  const hy = projectY(view, 5, lamp.z);
  const r = s * 1.6;
  const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
  g.addColorStop(0, `rgba(${theme.lampColor},${0.9 * strength})`);
  g.addColorStop(0.15, `rgba(${theme.lampColor},${0.45 * strength})`);
  g.addColorStop(1, `rgba(${theme.lampColor},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
}

// 毎フレーム描く、動く部分: いちばん手前の街灯が、ときどきチカチカする。time は ms。
// (画面全体を塗る処理は重いので、毎フレームはこの小さな光だけにして、ほかは drawTown で焼き込んでおく)
export function drawTownOverlay(ctx: CanvasRenderingContext2D, view: View, stageIndex: number, time: number): void {
  const theme = THEMES[stageIndex % THEMES.length];
  const flicker = Math.sin(time * 0.013) > 0.93 || Math.sin(time * 0.0021) > 0.97 ? 0.15 : 1;
  drawLampGlow(ctx, view, LAMPS[0], theme, flicker);
}
