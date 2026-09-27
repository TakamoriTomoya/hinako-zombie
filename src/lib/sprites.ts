import { zombieImageSrc } from "./constants";
import { dilateMask, type AlphaMask } from "./perspective";
import { ZOMBIE_IMAGE_FILES, type HeadCircle } from "./zombieCatalog";

export interface Sprite {
  name: string;
  sizeScale: number;
  head: HeadCircle;
  img: HTMLImageElement;
  ready: boolean;
  aspect: number; // 幅/高さ
  // 写真をゾンビっぽく(色を抜いて青緑がかった顔色に、ところどころ緑のしみ)した絵。読み込み時に1回だけ作る
  zombie: HTMLCanvasElement | null;
  // 弾が当たった瞬間に重ねる、写真と同じ形の真っ白なシルエット
  silhouette: HTMLCanvasElement | null;
  // かみつく直前に重ねて点滅させる、赤いシルエット
  danger: HTMLCanvasElement | null;
  // 写真のまわりの暗いふち。暗い町の背景でも形がわかるように、うっすら緑に光らせる
  outline: HTMLCanvasElement | null;
  mask: AlphaMask | null;
}

export const SPRITE_OUTLINE_PX = 10; // 元画像(480px高)の単位
const MASK_ROWS = 48;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  return ctx ? [canvas, ctx] : null;
}

// 同じ写真からは毎回同じしみの模様になるよう、ファイル名から決まる乱数を使う
function seededRandom(seed: string): () => number {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function createZombieCanvas(img: HTMLImageElement, seed: string): HTMLCanvasElement | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const made = makeCanvas(w, h);
  if (!made) return null;
  const [canvas, ctx] = made;
  ctx.drawImage(img, 0, 0);
  // 1. 色を半分くらい抜く
  ctx.globalCompositeOperation = "saturation";
  ctx.fillStyle = "rgba(128,128,128,0.8)";
  ctx.fillRect(0, 0, w, h);
  // 2. 青緑がかった、血の気のない色にする
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#8fbf8a";
  ctx.fillRect(0, 0, w, h);
  // 3. 足もとほど暗く汚れた感じに
  const grad = ctx.createLinearGradient(0, h * 0.4, 0, h);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(120,110,100,1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // multiplyは透明なところにも色を塗ってしまうので、元の写真の形で切り抜き直す
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);
  // 4. ところどころに緑のしみ(ゾンビ汁)
  ctx.globalCompositeOperation = "source-atop";
  const rand = seededRandom(seed);
  for (let i = 0; i < 9; i++) {
    const x = rand() * w;
    const y = h * (0.2 + rand() * 0.75);
    const r = (0.03 + rand() * 0.05) * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(70,110,30,0.75)");
    g.addColorStop(0.6, "rgba(60,90,25,0.35)");
    g.addColorStop(1, "rgba(60,90,25,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvas;
}

function createSilhouette(img: HTMLImageElement, color: string): HTMLCanvasElement | null {
  const made = makeCanvas(img.naturalWidth, img.naturalHeight);
  if (!made) return null;
  const [canvas, ctx] = made;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

// シルエットを周りに少しずつずらして何度も重ね、写真の輪郭に沿った太いふちを作る
function createOutline(silhouette: HTMLCanvasElement): HTMLCanvasElement | null {
  const pad = SPRITE_OUTLINE_PX;
  const made = makeCanvas(silhouette.width + pad * 2, silhouette.height + pad * 2);
  if (!made) return null;
  const [canvas, ctx] = made;
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    ctx.drawImage(silhouette, pad + Math.cos(angle) * pad, pad + Math.sin(angle) * pad);
  }
  return canvas;
}

function createMask(img: HTMLImageElement): AlphaMask | null {
  const rows = MASK_ROWS;
  const cols = Math.max(4, Math.round((rows * img.naturalWidth) / img.naturalHeight));
  const made = makeCanvas(cols, rows);
  if (!made) return null;
  const [, ctx] = made;
  ctx.drawImage(img, 0, 0, cols, rows);
  const pixels = ctx.getImageData(0, 0, cols, rows).data;
  const data = new Uint8Array(cols * rows);
  for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4 + 3] > 60 ? 1 : 0;
  return dilateMask({ cols, rows, data });
}

export function loadSprites(onEachLoad: () => void): Sprite[] {
  return ZOMBIE_IMAGE_FILES.map(({ file, name, sizeScale, head }) => {
    const sprite: Sprite = { name, sizeScale, head, img: new Image(), ready: false, aspect: 0.6, zombie: null, silhouette: null, danger: null, outline: null, mask: null };
    sprite.img.onload = () => {
      const img = sprite.img;
      sprite.aspect = img.naturalWidth / img.naturalHeight;
      sprite.zombie = createZombieCanvas(img, file);
      sprite.silhouette = createSilhouette(img, "#ffffff");
      sprite.danger = createSilhouette(img, "#ff2a2a");
      const dark = createSilhouette(img, "#0d1a10");
      sprite.outline = dark && createOutline(dark);
      sprite.mask = createMask(img);
      sprite.ready = sprite.zombie !== null && sprite.mask !== null;
      onEachLoad();
    };
    // 読み込みに失敗した画像はreadyにしないまま進める(その画像のゾンビは出てこない)
    sprite.img.onerror = onEachLoad;
    sprite.img.src = zombieImageSrc(file);
    return sprite;
  });
}
