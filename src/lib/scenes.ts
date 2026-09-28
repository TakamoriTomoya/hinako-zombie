// 戦う場所(シーン)の形。地面・建物・道に置いてあるもの・ゾンビが出てくる口(ドアや建物のすき間)を決める。
// 町の景色を描く town.ts と、ゾンビを出す engine.ts の両方がこれを使う。
// 座標は、プレイヤーが立っている所が原点。x: 右が+(m)、z: 前方への距離(m)、y: 高さ(m)。

import type { EntryKind } from "./constants";

// 地面のぬり分け
export type GroundKind = "road" | "sidewalk" | "grass" | "plaza" | "dirt" | "shadow" | "line" | "ceiling";

export interface GroundPoly {
  kind: GroundKind;
  pts: [x: number, z: number][];
  y?: number; // 天井(アーケードの屋根など)の高さ。地面なら0
}

export type BoxStyle = "house" | "building" | "shop" | "station" | "school" | "hedge" | "fence" | "bridge" | "sign";

// 建物などの四角い箱
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0?: number; // 宙に浮いた箱(高架・看板)の下の高さ
  height: number; // 上の高さ
  style: BoxStyle;
  text?: string; // 看板の文字(こちら向きの面に書く)
}

// ゾンビが出てくる口。ゾンビは口の奥にいて、出てくるまでは口の中しか見えない。
// plane "x": 道に面した横向きの壁(x = at)にあいた口。from〜to は z の範囲
// plane "z": こちらを向いた壁(z = at)にあいた口。from〜to は x の範囲
export interface Portal {
  kind: "door" | "gap";
  plane: "x" | "z";
  at: number;
  from: number;
  to: number;
  height: number;
  exitX: number; // 出てきた後、まず歩いていく場所
  exitZ: number;
}

export type PropKind = "car" | "carSide" | "dumpster" | "vending" | "barricade" | "stall" | "tree" | "bench" | "fountain" | "bush" | "bus" | "pillar" | "shelter";

// 道や広場に置いてあるもの。ゾンビがかげに隠れていたり、撃った弾をさえぎったりする
export interface Prop {
  kind: PropKind;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  height: number;
  color: string;
}

export interface Region {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Trigger extends Region {
  count: number;
}

export interface Lamp {
  x: number;
  z: number;
  arm: -1 | 0 | 1; // 明かりが柱からどちらへ張り出しているか(0: 柱のてっぺん)
}

export interface Scene {
  name: string; // 着いた時・移動する時に出す場所の名前
  ground: GroundPoly[];
  boxes: Box[];
  portals: Portal[];
  props: Prop[];
  lamps: Lamp[];
  far: Region | null; // 霧の奥から歩いてくる範囲
  groundSpawn: Region | null; // 地面から這い出てくる範囲
  spawnWeights: Record<EntryKind, number>; // どこから出てくるかの重み
  bossStart?: { x: number; z: number; portal?: number }; // ボスが出てくる所(portal は portals の番号)
  walkable: Region[]; // プレイヤーが歩ける範囲(どれかの四角の中)
  // ゾンビが出てくる地点。プレイヤーがこの範囲に入ると、count 体がその場で出てくる(1回だけ)。
  // 全部の地点を通って倒しきると出口が開く(ボスの場所ではボスが来る)
  triggers: Trigger[];
  exit?: { x: number; z: number }; // ザコ戦が終わった後、ここまで歩くと次の場所へ進む
}

// はじめに立っている所のうしろをふさぐ建物の並び(ふり返った時に何もない所が見えないように)
const behind = (): Box[] => [box(-60, 60, -16, -6, 10, "building")];

// ---- 形を短く書くための道具 ----

const rect = (kind: GroundKind, x0: number, x1: number, z0: number, z1: number): GroundPoly => ({
  kind,
  pts: [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ],
});

// z の向き(前後)にのびる道のセンターラインの点線
function dashesZ(x: number, z0: number, z1: number): GroundPoly[] {
  const list: GroundPoly[] = [];
  for (let z = z0; z < z1; z += 6) list.push(rect("line", x - 0.08, x + 0.08, z, Math.min(z + 3, z1)));
  return list;
}

// x の向き(左右)にのびる道のセンターラインの点線
function dashesX(z: number, x0: number, x1: number): GroundPoly[] {
  const list: GroundPoly[] = [];
  for (let x = x0; x < x1; x += 5) list.push(rect("line", x, Math.min(x + 2.5, x1), z - 0.08, z + 0.08));
  return list;
}

// 前後にのびる道を横切る横断歩道
function crosswalkAcross(z: number, x0: number, x1: number): GroundPoly[] {
  const list: GroundPoly[] = [];
  for (let x = x0 + 0.3; x < x1 - 0.3; x += 0.9) list.push(rect("line", x, x + 0.5, z, z + 2.5));
  return list;
}

// 左右にのびる道を横切る横断歩道
function crosswalkAlong(x: number, z0: number, z1: number): GroundPoly[] {
  const list: GroundPoly[] = [];
  for (let z = z0 + 0.3; z < z1 - 0.3; z += 0.9) list.push(rect("line", x, x + 2.5, z, z + 0.5));
  return list;
}

const box = (x0: number, x1: number, z0: number, z1: number, height: number, style: BoxStyle, more: Partial<Box> = {}): Box => ({ x0, x1, z0, z1, height, style, ...more });

const doorX = (at: number, z: number, exitX: number, exitZ: number, width = 1.1): Portal => ({ kind: "door", plane: "x", at, from: z, to: z + width, height: 2.2, exitX, exitZ });
const doorZ = (at: number, x: number, exitX: number, exitZ: number, width = 1.1, height = 2.2): Portal => ({ kind: "door", plane: "z", at, from: x, to: x + width, height, exitX, exitZ });
const gapX = (at: number, z0: number, z1: number, exitX: number, exitZ: number, height = 40): Portal => ({ kind: "gap", plane: "x", at, from: z0, to: z1, height, exitX, exitZ });
const gapZ = (at: number, x0: number, x1: number, exitX: number, exitZ: number, height = 40): Portal => ({ kind: "gap", plane: "z", at, from: x0, to: x1, height, exitX, exitZ });

const prop = (kind: PropKind, x0: number, x1: number, z0: number, z1: number, height: number, color: string): Prop => ({ kind, x0, x1, z0, z1, height, color });

// ================= STAGE 1: ゆうぐれの住宅街 =================

// 曲がり角: 前にのびた道が、少し先で右へ曲がる。つきあたりには家が並ぶ
const cornerStreet: Scene = {
  name: "じゅうたくがいの まがりかど",
  ground: [
    rect("sidewalk", -60, 60, 0, 40),
    rect("road", -3.5, 3.5, 0.2, 16),
    rect("road", 3.5, 60, 10, 16),
    ...dashesZ(0, 1, 10),
    ...dashesX(13, 5, 60),
    ...crosswalkAlong(4, 10, 16),
  ],
  boxes: [
    ...behind(),
    box(-13, -5.5, -2, 5, 6.5, "house"),
    box(-13, -5.5, 6.8, 12, 7, "house"),
    box(-13, -5.5, 12, 18, 6, "house"),
    box(5.5, 14, -2, 4.2, 6.5, "house"),
    box(5.5, 20, 6, 8.5, 6, "house"),
    box(-20, -6, 18, 26, 7, "house"),
    box(-6, 4, 18, 26, 8, "building"),
    box(4, 14, 18, 26, 6.5, "house"),
    box(14, 30, 18, 26, 9, "building"),
    box(30, 60, 18, 30, 10, "building"),
  ],
  portals: [
    gapX(-5.5, 5, 6.8, -3, 5.9),
    doorX(-5.5, 13.4, -2.8, 13.9),
    gapX(5.5, 4.2, 6, 2.8, 5.1),
    gapX(5.5, 8.5, 18, 2.6, 13),
    doorZ(18, -1, -0.5, 16),
  ],
  props: [
    prop("car", -3.4, -2.1, 8.5, 12.5, 1.45, "#c94f4f"),
    prop("carSide", 9, 13.2, 13.8, 15.4, 1.45, "#5a7fb0"),
    prop("dumpster", 3.9, 5, 2.6, 3.5, 1.1, "#3f6f8f"),
    prop("vending", -5.4, -4.6, 5.8, 6.6, 1.9, "#e8eef5"),
  ],
  lamps: [
    { x: -4.1, z: 9, arm: 1 },
    { x: 4.1, z: 3, arm: -1 },
    { x: -4.1, z: 16.5, arm: 1 },
  ],
  far: { x0: -2, x1: 2, z0: 14, z1: 16 },
  groundSpawn: { x0: -2, x1: 2, z0: 5, z1: 8 },
  spawnWeights: { far: 20, gap: 25, door: 20, prop: 20, ground: 15 },
  triggers: [
    { x0: -5, x1: 5, z0: -4, z1: 3, count: 3 },
    { x0: -5, x1: 5, z0: 6, z1: 10, count: 4 },
    { x0: 3, x1: 30, z0: 8.8, z1: 17.5, count: 5 },
  ],
  walkable: [
    { x0: -5, x1: 5, z0: -4, z1: 17.5 },
    { x0: 5, x1: 30, z0: 8.8, z1: 17.5 },
  ],
  exit: { x: 22, z: 12.5 },
};

// 公園: 芝生の広場のまん中に噴水。木やベンチのかげ、生けがきのすき間、トイレ、奥の門から来る
const park: Scene = {
  name: "こうえん",
  ground: [
    rect("grass", -60, 60, 0, 60),
    rect("plaza", -1.6, 1.6, 0.2, 25),
    { kind: "plaza", pts: Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2) * 4.2, 10 + Math.sin((i / 16) * Math.PI * 2) * 4.2] as [number, number]) },
    rect("dirt", -9, -5, 3, 7),
  ],
  boxes: [
    ...behind(),
    box(-12.5, -11.5, -2, 8, 1.3, "hedge"),
    box(-12.5, -11.5, 10.5, 24, 1.3, "hedge"),
    box(11.5, 12.5, -2, 14, 1.3, "hedge"),
    box(11.5, 12.5, 16.5, 24, 1.3, "hedge"),
    box(-12.5, -2, 24, 25, 1.3, "hedge"),
    box(2, 12.5, 24, 25, 1.3, "hedge"),
    box(-9, -6, 16, 19, 3, "building"),
    box(-30, -8, 30, 38, 7, "house"),
    box(-8, 8, 32, 40, 12, "building"),
    box(8, 30, 30, 38, 7, "house"),
  ],
  portals: [gapX(-11.5, 8, 10.5, -6, 9.2), gapX(11.5, 14, 16.5, 6, 15.2), gapZ(24, -2, 2, 0, 21.5), doorX(-6, 17, -4, 17.5)],
  props: [
    prop("fountain", -2.2, 2.2, 7.8, 12.2, 1, "#9aa3ad"),
    prop("tree", -7.2, -5, 5, 7, 4.5, "#3f6b35"),
    prop("tree", 5, 7.2, 7.5, 9.5, 5, "#46743a"),
    prop("tree", -8.4, -6.2, 11.5, 13.5, 4.8, "#3a6332"),
    prop("tree", 6, 8.4, 18, 20, 5.2, "#46743a"),
    prop("bench", -4.6, -3, 3.8, 4.4, 0.9, "#8a5a2b"),
    prop("bench", 3, 4.6, 13, 13.6, 0.9, "#8a5a2b"),
    prop("bush", 2.4, 4, 3.8, 5, 0.9, "#4d7d3c"),
    prop("bush", -5, -3.4, 19.5, 20.6, 1, "#4d7d3c"),
  ],
  lamps: [
    { x: 2.6, z: 5, arm: 0 },
    { x: -2.6, z: 15, arm: 0 },
    { x: 2.6, z: 22, arm: 0 },
  ],
  far: { x0: -1.2, x1: 1.2, z0: 20, z1: 22 },
  groundSpawn: { x0: -5, x1: 5, z0: 4.5, z1: 7 },
  spawnWeights: { far: 20, gap: 22, door: 10, prop: 30, ground: 18 },
  triggers: [
    { x0: -11, x1: 11, z0: -4, z1: 3, count: 3 },
    { x0: -11, x1: 11, z0: 7, z1: 13, count: 4 },
    { x0: -11, x1: 11, z0: 16, z1: 23.5, count: 5 },
  ],
  walkable: [{ x0: -11, x1: 11, z0: -4, z1: 23.5 }],
  exit: { x: 0, z: 22.5 },
};

// T字路: 前の道が少し先で左右の道につきあたる。正面は学校。ボスは左の道から曲がってくる
const tJunctionSchool: Scene = {
  name: "がっこうまえの Tじろ",
  ground: [
    rect("sidewalk", -60, 60, 0, 40),
    rect("road", -3.5, 3.5, 0.2, 14),
    rect("road", -60, 60, 14, 21),
    ...dashesZ(0, 1, 12),
    ...dashesX(17.5, -60, 60),
    ...crosswalkAcross(11, -3.5, 3.5),
  ],
  boxes: [
    ...behind(),
    box(-14, -5.5, -2, 6, 7, "house"),
    box(-14, -5.5, 6, 12, 6, "house"),
    box(5.5, 14, -2, 5, 6.5, "house"),
    box(5.5, 14, 6.8, 12, 8, "building"),
    box(-40, -8, 23, 32, 8, "building"),
    box(-8, 8, 23, 34, 11, "school"),
    box(8, 40, 23, 32, 8, "building"),
    box(-24, -14, 4, 12, 6, "house"),
    box(14, 24, 4, 12, 6.5, "house"),
  ],
  portals: [gapX(-5.5, 12, 23, -2.5, 17.2), gapX(5.5, 12, 23, 2.5, 17.2), doorZ(23, -1.2, 0, 20, 2.4, 2.6), doorX(-5.5, 8, -2.8, 8.5), gapX(5.5, 5, 6.8, 2.8, 5.9)],
  props: [
    prop("carSide", -12.5, -8.3, 15, 16.6, 1.5, "#e0b43a"),
    prop("barricade", 4, 5.4, 13, 13.25, 1.05, "#f2c14e"),
    prop("dumpster", -5.1, -4, 3, 4, 1.1, "#3f6f8f"),
  ],
  lamps: [
    { x: -4.1, z: 5, arm: 1 },
    { x: 4.1, z: 12.5, arm: -1 },
  ],
  far: null,
  groundSpawn: { x0: -2, x1: 2, z0: 4.5, z1: 8 },
  spawnWeights: { far: 0, gap: 35, door: 25, prop: 20, ground: 20 },
  bossStart: { x: -9, z: 17.5, portal: 0 },
  triggers: [
    { x0: -5, x1: 5, z0: -4, z1: 3, count: 3 },
    { x0: -5, x1: 5, z0: 6, z1: 12, count: 4 },
    { x0: -30, x1: 30, z0: 12.3, z1: 22.5, count: 5 },
  ],
  walkable: [
    { x0: -5, x1: 5, z0: -4, z1: 22.5 },
    { x0: -30, x1: 30, z0: 12.3, z1: 22.5 },
  ],
};

// ================= STAGE 2: よるの商店街 =================

// 大きな交差点: 四つ角にお店。横断歩道の向こうからも、左右の道からも来る
const scramble: Scene = {
  name: "しょうてんがいの こうさてん",
  ground: [
    rect("sidewalk", -60, 60, 0, 40),
    rect("road", -3.5, 3.5, 0.2, 40),
    rect("road", -60, 60, 5, 12),
    ...dashesZ(0, 14, 40),
    ...dashesX(8.5, -60, -5),
    ...dashesX(8.5, 5, 60),
    ...crosswalkAcross(12.3, -3.5, 3.5),
    ...crosswalkAlong(-6, 5, 12),
    ...crosswalkAlong(3.5, 5, 12),
  ],
  boxes: [
    ...behind(),
    box(-16, -5.5, -3, 5, 9, "shop"),
    box(5.5, 16, -3, 5, 12, "shop"),
    box(-16, -5.5, 14, 22, 10, "shop"),
    box(-16, -5.5, 22, 32, 13, "shop"),
    box(5.5, 16, 14, 19, 11, "shop"),
    box(5.5, 16, 20.8, 32, 9, "shop"),
    box(-40, -16, 14, 24, 12, "shop"),
    box(16, 40, 14, 24, 10, "shop"),
  ],
  portals: [gapX(-5.5, 5, 12, -2.5, 8.5), gapX(5.5, 5, 12, 2.5, 8.5), doorZ(14, -9, -3.5, 12.8), doorZ(14, 7.5, 3.5, 12.8), gapX(5.5, 19, 20.8, 2.8, 19.9), doorX(-5.5, 16, -2.8, 16.5)],
  props: [
    prop("carSide", -10, -5.8, 6, 7.6, 1.5, "#e0b43a"),
    prop("vending", -5.4, -4.6, 18.5, 19.3, 1.9, "#e04f6a"),
    prop("barricade", 1.8, 3.3, 15, 15.25, 1.05, "#f2c14e"),
    prop("stall", 3.8, 4.9, 0.8, 2, 1.2, "#b85c38"),
  ],
  lamps: [
    { x: -4.1, z: 3.5, arm: 1 },
    { x: 4.1, z: 14.5, arm: -1 },
    { x: -4.1, z: 22, arm: 1 },
  ],
  far: { x0: -1.5, x1: 1.5, z0: 16, z1: 20 },
  groundSpawn: { x0: -2, x1: 2, z0: 4, z1: 8 },
  spawnWeights: { far: 18, gap: 30, door: 20, prop: 17, ground: 15 },
  triggers: [
    { x0: -5, x1: 5, z0: -3.5, z1: 3, count: 3 },
    { x0: -30, x1: 30, z0: 5.2, z1: 13.8, count: 4 },
    { x0: -5, x1: 5, z0: 16, z1: 30, count: 5 },
  ],
  walkable: [
    { x0: -5, x1: 5, z0: -3.5, z1: 30 },
    { x0: -30, x1: 30, z0: 5.2, z1: 13.8 },
  ],
  exit: { x: 0, z: 26 },
};

// 駐車場: 車がずらりと並ぶ。車のかげや、奥のスーパーの自動ドアから来る
const parkingLot: Scene = {
  name: "スーパーの ちゅうしゃじょう",
  ground: [
    rect("road", -60, 60, 0, 60),
    ...[-9, -6, -3, 3, 6, 9].flatMap((x) => [rect("line", x - 0.06, x + 0.06, 5.6, 10.6), rect("line", x - 0.06, x + 0.06, 12.6, 17.6)]),
    rect("line", -10.5, -2, 10.55, 10.7),
    rect("line", 2, 10.5, 10.55, 10.7),
    rect("sidewalk", -14, 10, 20, 22),
  ],
  boxes: [
    ...behind(),
    box(-14.5, -14, -2, 9, 1.8, "fence"),
    box(-14.5, -14, 12, 22, 1.8, "fence"),
    box(14, 14.5, -2, 16, 1.8, "fence"),
    box(-14, 10, 22, 32, 7, "shop", { text: "スーパー ひなこ" }),
    box(10, 24, 18, 30, 10, "building"),
    box(-30, -14.5, 8, 30, 12, "building"),
  ],
  portals: [doorZ(22, -3, -2, 19, 2, 2.4), doorZ(22, 3, 4, 19, 2, 2.4), gapX(-14, 9, 12, -9, 11.3), gapX(14, 16, 18, 10, 17.2)],
  props: [
    prop("car", -8.6, -7, 6, 10.2, 1.45, "#c94f4f"),
    prop("car", -5.6, -4, 6, 10.2, 1.45, "#e8e8e8"),
    prop("car", 3.4, 5, 6, 10.2, 1.45, "#4f8fe0"),
    prop("car", 7.4, 9, 6, 10.2, 1.45, "#3b3b3b"),
    prop("car", -7.4, -5.8, 13, 17.2, 1.45, "#e0b43a"),
    prop("car", 4.4, 6, 13, 17.2, 1.45, "#6bb36b"),
    prop("dumpster", 8, 9.2, 20, 21, 1.3, "#2f5a3a"),
  ],
  lamps: [
    { x: -6.8, z: 11.6, arm: 0 },
    { x: 6.8, z: 11.6, arm: 0 },
  ],
  far: { x0: -1.5, x1: 1.5, z0: 18, z1: 20 },
  groundSpawn: { x0: -1.8, x1: 1.8, z0: 4, z1: 8 },
  spawnWeights: { far: 18, gap: 15, door: 22, prop: 30, ground: 15 },
  triggers: [
    { x0: -13.5, x1: 13.5, z0: -4, z1: 3, count: 3 },
    { x0: -13.5, x1: 13.5, z0: 6, z1: 12, count: 4 },
    { x0: -13.5, x1: 13.5, z0: 14, z1: 21.5, count: 5 },
  ],
  walkable: [{ x0: -13.5, x1: 13.5, z0: -4, z1: 21.5 }],
  exit: { x: 1, z: 20.8 },
};

// 商店街のゲート: 手前の広場の先に、アーケードの入口。ボスはアーケードの奥から来る
const arcadeGate: Scene = {
  name: "しょうてんがいの ゲート",
  ground: [
    rect("plaza", -60, 60, 0, 60),
    rect("road", -5.5, 5.5, 14, 60),
    { kind: "ceiling", y: 7, pts: [[-5.5, 14.6], [5.5, 14.6], [5.5, 60], [-5.5, 60]] },
  ],
  boxes: [
    ...behind(),
    box(-24, -12, -2, 14, 9, "shop"),
    box(12, 24, -2, 14, 9, "shop"),
    box(-24, -5.5, 14, 40, 9, "shop"),
    box(5.5, 24, 14, 40, 10, "shop"),
    box(-5.2, 5.2, 14, 14.6, 7, "sign", { y0: 5.4, text: "ひなこ しょうてんがい" }),
  ],
  portals: [gapX(-12, 5, 7, -8, 6), gapX(12, 9, 11, 8, 10), doorX(-12, 10, -9, 10.5), doorZ(14, -9, -7.5, 12), doorZ(14, 7, 7.5, 12)],
  props: [
    prop("pillar", -5.4, -4.6, 14, 14.6, 5.4, "#8a6a4a"),
    prop("pillar", 4.6, 5.4, 14, 14.6, 5.4, "#8a6a4a"),
    prop("bench", -7, -5.4, 6, 6.6, 0.9, "#6b4a2b"),
    prop("vending", 10.6, 11.4, 4, 4.8, 1.9, "#4f8fe0"),
    prop("stall", -3.6, -1.8, 9, 10.2, 1.2, "#b85c38"),
  ],
  lamps: [
    { x: -9, z: 8, arm: 0 },
    { x: 9, z: 8, arm: 0 },
  ],
  far: { x0: -2, x1: 2, z0: 17, z1: 20 },
  groundSpawn: { x0: -3, x1: 3, z0: 4, z1: 7.5 },
  spawnWeights: { far: 25, gap: 20, door: 25, prop: 15, ground: 15 },
  triggers: [
    { x0: -11.5, x1: 11.5, z0: -4, z1: 3, count: 3 },
    { x0: -11.5, x1: 11.5, z0: 5, z1: 9, count: 4 },
    { x0: -11.5, x1: 11.5, z0: 9, z1: 40, count: 5 },
  ],
  walkable: [
    { x0: -11.5, x1: 11.5, z0: -4, z1: 13.6 },
    { x0: -5, x1: 5, z0: 13.6, z1: 40 },
  ],
};

// ================= STAGE 3: まよなかの駅前 =================

// バスのりば: 止まっているバスのかげや、バスのドアからも出てくる
const busTerminal: Scene = {
  name: "えきまえの バスのりば",
  ground: [
    rect("plaza", -60, 60, 0, 60),
    rect("road", -60, 60, 8, 14.5),
    ...dashesX(11.2, -60, 60),
  ],
  boxes: [
    ...behind(),
    box(-30, -12, -2, 20, 14, "building"),
    box(12, 30, -2, 10, 12, "building"),
    box(12, 30, 13, 25, 16, "building"),
    box(-30, -12, 24, 40, 20, "building"),
    box(-20, 20, 34, 44, 12, "station", { text: "ひなこえき" }),
  ],
  portals: [gapX(12, 10, 13, 8, 7), doorX(-12, 3, -8, 3.6), doorZ(10, 6.2, 6.7, 7.8, 1)],
  props: [
    prop("bus", -1, 9.5, 10, 12.6, 3.1, "#3f7fbf"),
    prop("shelter", -6, -2, 5.5, 6.5, 2.6, "#9aa3ad"),
    prop("carSide", -10, -5.8, 15.5, 17.1, 1.5, "#e0b43a"),
    prop("bench", 3, 4.6, 5.2, 5.8, 0.9, "#6b4a2b"),
  ],
  lamps: [
    { x: -8, z: 7, arm: 0 },
    { x: 7, z: 16.5, arm: 0 },
  ],
  far: { x0: -3, x1: 3, z0: 17, z1: 20 },
  groundSpawn: { x0: -4, x1: 3, z0: 3.5, z1: 6 },
  spawnWeights: { far: 22, gap: 18, door: 20, prop: 22, ground: 18 },
  triggers: [
    { x0: -11.5, x1: 11.5, z0: -4, z1: 3, count: 3 },
    { x0: -11.5, x1: 11.5, z0: 6, z1: 12, count: 4 },
    { x0: -11.5, x1: 11.5, z0: 14, z1: 22, count: 5 },
  ],
  walkable: [{ x0: -11.5, x1: 11.5, z0: -4, z1: 22 }],
  exit: { x: 0, z: 21 },
};

// ガード下: 道の上を高架の線路が横切る。太い柱のかげや、高架の下の暗がりから来る
const underBridge: Scene = {
  name: "ガードした",
  ground: [
    rect("sidewalk", -60, 60, 0, 60),
    rect("road", -3.5, 3.5, 0.2, 60),
    rect("road", -60, 60, 8, 14),
    rect("shadow", -60, 60, 8, 14),
    ...dashesZ(0, 1, 60),
  ],
  boxes: [
    ...behind(),
    box(-14, -5.5, -2, 4, 8, "building"),
    box(-14, -5.5, 5.1, 8, 7, "building"),
    box(5.5, 14, -2, 5.5, 9, "building"),
    box(5.5, 14, 7.2, 8, 9, "building"),
    box(-60, 60, 8, 14, 7.2, "bridge", { y0: 5.5 }),
    box(-14, -5.5, 14, 30, 11, "building"),
    box(5.5, 14, 14, 24, 13, "building"),
    box(5.5, 14, 26, 40, 10, "building"),
  ],
  portals: [doorX(-5.5, 4, -2.8, 4.5), gapX(5.5, 5.5, 7.2, 2.8, 6.3), gapX(-5.5, 8, 14, -2.5, 11, 5.5), gapX(5.5, 8, 14, 2.5, 11, 5.5), gapX(5.5, 24, 26, 2.8, 20)],
  props: [
    prop("pillar", -4.9, -4, 9, 10, 5.5, "#5a5f66"),
    prop("pillar", 4, 4.9, 9, 10, 5.5, "#5a5f66"),
    prop("pillar", -0.5, 0.5, 12, 13, 5.5, "#5a5f66"),
    prop("dumpster", 3.9, 5.1, 2.6, 3.6, 1.3, "#2f5a3a"),
    prop("car", 2.2, 3.4, 16, 20, 1.4, "#6b7a8a"),
  ],
  lamps: [
    { x: -4.1, z: 3, arm: 1 },
    { x: 4.1, z: 16, arm: -1 },
  ],
  far: { x0: -1.5, x1: 1.5, z0: 17, z1: 20 },
  groundSpawn: { x0: -2, x1: 2, z0: 4, z1: 7 },
  spawnWeights: { far: 18, gap: 30, door: 12, prop: 25, ground: 15 },
  triggers: [
    { x0: -5, x1: 5, z0: -4, z1: 3, count: 3 },
    { x0: -30, x1: 30, z0: 7, z1: 14, count: 4 },
    { x0: -5, x1: 5, z0: 18, z1: 40, count: 5 },
  ],
  walkable: [
    { x0: -5, x1: 5, z0: -4, z1: 40 },
    { x0: -30, x1: 30, z0: 8.3, z1: 13.7 },
  ],
  exit: { x: 0, z: 30 },
};

// 駅の正面: 正面に駅。ボスは駅の入口から出てくる
const stationFront: Scene = {
  name: "ひなこえき",
  ground: [rect("plaza", -60, 60, 0, 60), rect("road", -15, 15, 9, 13)],
  boxes: [
    ...behind(),
    box(-18, 18, 18, 30, 12, "station", { text: "ひなこえき" }),
    box(-30, -15, -2, 18, 14, "building"),
    box(15, 30, -2, 8, 10, "building"),
    box(15, 30, 11, 18, 16, "building"),
  ],
  portals: [doorZ(18, -3, 0, 15, 6, 3.2), doorZ(18, -12, -10, 15, 1.2), doorZ(18, 10.8, 10, 15, 1.2), gapX(15, 8, 11, 11, 9.5), doorX(-15, 6, -11, 6.5)],
  props: [
    prop("carSide", -8, -3.8, 10, 11.6, 1.5, "#e0b43a"),
    prop("barricade", 4, 6, 12.5, 12.75, 1.05, "#f2c14e"),
    prop("bush", -7, -5, 4, 5, 1, "#2f5a3a"),
    prop("bush", 5, 7, 4, 5, 1, "#2f5a3a"),
    prop("bench", -3, -1.4, 6, 6.6, 0.9, "#6b4a2b"),
  ],
  lamps: [
    { x: -9, z: 7, arm: 0 },
    { x: 9, z: 14, arm: 0 },
  ],
  far: null,
  groundSpawn: { x0: -3, x1: 3, z0: 4, z1: 7 },
  spawnWeights: { far: 0, gap: 25, door: 40, prop: 15, ground: 20 },
  bossStart: { x: 0, z: 19, portal: 0 },
  triggers: [
    { x0: -14.5, x1: 14.5, z0: -4, z1: 3, count: 3 },
    { x0: -14.5, x1: 14.5, z0: 5, z1: 10, count: 4 },
    { x0: -14.5, x1: 14.5, z0: 10, z1: 17.5, count: 5 },
  ],
  walkable: [{ x0: -14.5, x1: 14.5, z0: -4, z1: 17.5 }],
};

export const STAGE_SCENES: Scene[][] = [
  [cornerStreet, park, tJunctionSchool],
  [scramble, parkingLot, arcadeGate],
  [busTerminal, underBridge, stationFront],
];
