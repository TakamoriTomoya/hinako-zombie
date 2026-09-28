// ゲームの本体。町を自由に歩き回りながら、追いかけてくるゾンビひなこをタップ(クリック)で撃つ。
// Reactには依存しない。画面に出す数字(スコア・ライフ・弾数など)が変わった時だけ onState で知らせる。

import {
  ATTACK_WINDUP_MS,
  ATTACK_Z,
  BITE_KNOCKBACK_M,
  BITE_REACH,
  BOSS_CHARGE_SPEED,
  BOSS_CHARGE_STOP_DAMAGE,
  BOSS_CHARGE_Z,
  BOSS_HEAD_MULTIPLIER,
  BOSS_HEIGHT_M,
  BOSS_SCORE_PER_STAGE,
  BOSS_STAND_Z,
  BOSS_WARNING_MS,
  DRAG_TURN_PER_SCREEN,
  MAX_TURN_VELOCITY,
  TURN_INERTIA_DECAY,
  DYING_MS,
  EMERGE_MS,
  ENTER_SPEED,
  EXIT_RADIUS_M,
  GAMEOVER_DELAY_MS,
  HEADSHOT_BONUS,
  HEART_DROP_CHANCE,
  HEART_FULL_BONUS,
  HEART_ROAD_CHANCE,
  HINT_MS,
  HIT_FLASH_MS,
  HIT_STAGGER_BACK_M,
  HIT_STAGGER_MS,
  HORDE_MAX,
  HORDE_MIN,
  HORDE_STAGGER_MS,
  HURT_FLASH_MS,
  LIFE_CLEAR_BONUS,
  MAX_AMMO,
  MOVE_MS,
  MUZZLE_FLASH_MS,
  PLAYER_INVINCIBLE_MS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_START_LIVES,
  PROJECTILE_FLIGHT_MS,
  PROJECTILE_HIT_RADIUS_M,
  PROJECTILE_MIN_HIT_PX,
  PROJECTILE_RADIUS_M,
  PROJECTILE_SCORE,
  RECOIL_MS,
  RELOAD_MS,
  RISE_MS,
  SHAKE_MS,
  SHOT_COOLDOWN_MS,
  SPAWN_Z_MAX,
  STAGE_BANNER_MS,
  ARRIVE_BANNER_MS,
  STAGE_CLEAR_MS,
  STAGES,
  TURN_SPEED,
  ZOMBIE_HEIGHT_M,
  ZOMBIE_KINDS,
  ZOMBIE_RADIUS,
  type EntryKind,
  type StageDef,
  type ZombieKind,
} from "./constants";
import { drawCrosshair, drawGun, muzzlePoint, type GunPose } from "./gun";
import { loadHighScore, saveHighScore } from "./highScore";
import {
  depthOf,
  fromCamera,
  hitTestSprite,
  makeView,
  pointInPolygon,
  project,
  projectPolygon,
  scaleAt,
  screenToGround,
  segmentHitsBox,
  standingRect,
  toCamera,
  type HitPart,
  type Rect,
  type View,
} from "./perspective";
import type { SoundManager } from "./sound";
import { loadSprites, SPRITE_OUTLINE_PX, type Sprite } from "./sprites";
import { STAGE_SCENES, type Portal, type Prop, type Region, type Scene } from "./scenes";
import { boxPolygons, buildSceneModel, drawBackdrop, drawBoxModel, drawLamp, drawProp, fogAmount, propPolygons, type BoxModel, type SceneModel } from "./town";
import {
  blastDamage,
  BOSS_PICKUP_INTERVAL_MS,
  DROP_CHANCE,
  EXPLOSION_MS,
  GRENADE_FLIGHT_BASE_MS,
  GRENADE_FLIGHT_PER_M_MS,
  MG_SPREAD_PX,
  PICKUP_BLINK_MS,
  PICKUP_LIFETIME_MS,
  PICKUP_MAX_ALIVE,
  PICKUP_MIN_HIT_PX,
  PICKUP_SIZE_M,
  pickSpecialWeapon,
  ROAD_PICKUP_INTERVAL_MS,
  ROCKET_FLIGHT_MS,
  SWITCH_MS,
  WEAPON_ORDER,
  WEAPONS,
  type SpecialWeaponId,
  type WeaponId,
} from "./weapons";

export type Phase = "home" | "playing" | "gameover" | "clear";

export interface BossHp {
  name: string;
  percent: number;
}

export interface StageBannerText {
  title: string;
  sub?: string;
}

export interface EngineState {
  phase: Phase;
  score: number;
  lives: number;
  ammo: number; // ハンドガンの弾
  reloading: boolean;
  weapon: WeaponId;
  weaponAmmo: Record<SpecialWeaponId, number>; // 拾った武器の残りの弾
  stage: number; // 1から
  areaName: string; // 今いる場所の名前
  stageBanner: StageBannerText | null;
  bossHp: BossHp | null;
  bossWarning: boolean;
  exitOpen: boolean; // 出口へ向かえる(次の場所へ進める)
  hintVisible: boolean;
  highScore: number;
  isNewRecord: boolean;
  assetsReady: boolean;
}

export interface StartOptions {
  stageIndex?: number;
  startAtBoss?: boolean;
}

// exit: ザコ戦が終わり、出口へ歩いていくのを待っている / move: 次の場所へ移動している(暗転)
type StagePhase = "banner" | "wave" | "exit" | "move" | "warning" | "boss" | "cleared";
// emerge: ドアの暗がりから姿をあらわす / rise: かげや地面から立ち上がる / enter: すき間などから出てくる
type ZombieState = "emerge" | "rise" | "enter" | "walk" | "windup" | "lunge" | "stand" | "charge" | "retreat" | "dying" | "wander";

interface Zombie {
  sprite: Sprite;
  kind: ZombieKind | "boss";
  heightM: number;
  x: number;
  z: number;
  portal: Portal | null; // ドアの奥にいる間、その口からしか見えない
  entryX: number | null; // 出てきた後、まず歩いていく先
  entryZ: number | null;
  riseFromGround: boolean; // 地面から這い出てくる(地面より下は見えない)
  hp: number;
  maxHp: number;
  speed: number;
  state: ZombieState;
  stateMs: number;
  ageMs: number;
  staggerMs: number;
  flashMs: number;
  walkPhase: number;
  lastHitHead: boolean;
  stuckMs: number; // 建物につっかえて進めていない時間
  detourMs: number; // よけて回りこんでいる残り時間
  detourDir: number;
  // ボスだけが使う
  throwMs: number;
  chargeMs: number;
  chargeDamage: number;
  vx: number; // ホーム画面で横切るだけのゾンビの速さ
}

// ボスが投げてきたがれき。投げた時にプレイヤーがいた所へ落ちてくる(歩いてよけられる)
interface Projectile {
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toZ: number;
  ms: number;
  spin: number;
}

// 落ちている武器の箱。撃つか、上を歩くと拾える
interface Pickup {
  item: SpecialWeaponId | "heart";
  x: number;
  z: number;
  ageMs: number;
}

interface Rocket {
  sx: number; // 発射した銃口(画面)
  sy: number;
  tx: number; // 着弾する位置(m)
  tz: number;
  ms: number;
}

interface Grenade {
  x0: number;
  z0: number;
  tx: number;
  tz: number;
  ms: number;
  durMs: number;
  spin: number;
}

interface Explosion {
  x: number;
  z: number;
  radiusM: number;
  ms: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
}

interface AABB {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

// 建物や車など、うしろのものを隠し、ぶつかると通れないもの
interface Occluder {
  aabb: AABB;
  box?: BoxModel;
  prop?: Prop;
  blocks: boolean; // 歩いて通れない
}

// 毎フレーム描くもの。occluders の間に、隠れ方に合わせて差しこんで描く
interface DrawItem {
  x: number;
  z: number;
  depth: number;
  ignore?: Occluder; // この建物の中にいても隠れない(ドアから出てくる途中)
  draw: () => void;
  hit?: (px: number, py: number) => Target | null;
}

interface Target {
  hit: (bodyDamage: number, headDamage: number) => void;
  ground: { x: number; z: number };
}

const GOO_COLORS = ["#7fbf3a", "#5f9a2a", "#a8d95a", "#4c7a22"];
const POPUP_MS = 800;
const TRACER_MS = 70;
const CROSSHAIR_TOUCH_MS = 900; // タッチで撃った時、照準をしばらく残しておく
const WANDER_MAX = 4; // ホーム画面をうろうろするゾンビの数
const WANDER_HALF_WIDTH_M = 5;
const TAP_MOVE_PX = 10; // これより動かしたら、タップではなくドラッグ(向きを変える)
const HOLD_TO_FIRE_MS = 150; // マシンガンは、動かさずにこれだけ押し続けると撃ちはじめる
const MAX_DPR = 1.5;
const MAX_RENDER_PIXELS = 1_600_000;
const PICKUP_WALK_RADIUS = 0.9; // 箱にこれだけ近づくと拾える
const SPAWN_MIN_DIST = 4; // プレイヤーのすぐそばには出てこない

// 歩いて(走って)いる時は、体を左右にゆらして上下にはずませる
function isMoving(z: Zombie): boolean {
  return z.state === "walk" || z.state === "enter" || z.state === "charge" || z.state === "wander" || z.state === "retreat" || z.state === "stand";
}

function inAABB(x: number, z: number, b: AABB, pad = 0): boolean {
  return x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
}

function inRegion(x: number, z: number, r: Region): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

// カメラから四角までのいちばん近い距離
function aabbDistance(cx: number, cz: number, b: AABB): number {
  const dx = Math.max(b.x0 - cx, 0, cx - b.x1);
  const dz = Math.max(b.z0 - cz, 0, cz - b.z1);
  return Math.hypot(dx, dz);
}

export class ZombieEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private view: View = makeView(390, 844);
  private dpr = 1;
  private raf = 0;
  private lastTime = 0;
  private time = 0;

  private readonly sprites: Sprite[];
  private loadedCount = 0;

  private phase: Phase = "home";
  private stageIndex = 0;
  private areaIndex = 0; // ステージの中の何か所目の場所か
  private stagePhase: StagePhase = "banner";
  private stageMs = 0;
  private spawnMs = 0;
  private minionMs = 0;
  private hordeMs = 0;
  private banner: StageBannerText | null = null;
  private hintMs = 0;
  private endMs = 0; // ゲームオーバーから結果画面に進むまで
  private bossSprite: Sprite | null = null;

  // 今いる場所の形(場所が変わった時に作り直す)
  private model: SceneModel;
  private occluders: Occluder[] = [];
  private elevated: BoxModel[] = []; // 高架や看板など、宙に浮いていて下を通れるもの

  // プレイヤー(カメラ)
  private px = 0;
  private pz = 0;
  private yaw = 0;
  private moveInput = { x: 0, y: 0 }; // 画面のスティック(-1〜1)
  private keys = new Set<string>();
  private walking = false;

  private score = 0;
  private lives = PLAYER_START_LIVES;
  private ammo = MAX_AMMO;
  private reloadMs = 0;
  private cooldownMs = 0;
  private recoilMs = 0;
  private flashMs = 0;
  private invincibleMs = 0;
  private hurtMs = 0;
  private shakeMs = 0;
  private highScore = loadHighScore();
  private isNewRecord = false;

  // 画面にふれている指(マウス)。動かさずに離せば撃つ、動かせば向きを変える、マシンガンは押し続けると連射
  private touches = new Map<number, { startX: number; startY: number; lastX: number; lastY: number; downAt: number; mode: "pending" | "drag" | "fire"; lastMoveAt: number; turnVel: number }>();
  private yawVel = 0; // はらったあとに回り続ける勢い(ラジアン/秒)
  private aimX = 0;
  private aimY = 0;
  private aimVisibleMs = 0;
  private mouseAim = false;

  private weapon: WeaponId = "pistol";
  private weaponAmmo: Record<SpecialWeaponId, number> = { mg: 0, rocket: 0, grenade: 0 };
  private switchMs = 0;
  private firePointerId: number | null = null;
  private pickupMs = 0;
  private pickupHintShown = false;

  private zombies: Zombie[] = [];
  private pendingSpawns: { delayMs: number; kind: ZombieKind; entry: EntryKind; portal?: Portal }[] = [];
  private pickups: Pickup[] = [];
  private rockets: Rocket[] = [];
  private grenades: Grenade[] = [];
  private explosions: Explosion[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private tracers: Tracer[] = [];
  private drawOrder: DrawItem[] = []; // 最後に描いた順番(撃った時の当たり判定に使う)

  private lastSent = "";

  private readonly onState: (state: EngineState) => void;
  private readonly sound: SoundManager;

  constructor(onState: (state: EngineState) => void, sound: SoundManager) {
    this.onState = onState;
    this.sound = sound;
    this.sprites = loadSprites(() => {
      this.loadedCount += 1;
    });
    this.model = buildSceneModel(0, STAGE_SCENES[0][0]);
    this.loadArea();
  }

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.resize();
    this.aimX = this.view.w / 2;
    this.aimY = this.view.h * 0.4;
    this.sound.playBgm("map");
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener("pointerdown", this.onPointerDown);
      canvas.removeEventListener("pointermove", this.onPointerMove);
      canvas.removeEventListener("pointerleave", this.onPointerLeave);
      canvas.removeEventListener("contextmenu", this.onContextMenu);
    }
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
  }

  // ---- 外から呼ぶ操作 ----

  startGame(options: StartOptions = {}): void {
    this.phase = "playing";
    this.score = 0;
    this.lives = PLAYER_START_LIVES;
    this.ammo = MAX_AMMO;
    this.reloadMs = 0;
    this.invincibleMs = 0;
    this.hurtMs = 0;
    this.isNewRecord = false;
    this.endMs = 0;
    this.weapon = "pistol";
    this.weaponAmmo = { mg: 0, rocket: 0, grenade: 0 };
    this.switchMs = 0;
    this.firePointerId = null;
    this.pickupHintShown = false;
    this.hintMs = HINT_MS;
    this.beginStage(Math.max(0, Math.min(STAGES.length - 1, options.stageIndex ?? 0)), options.startAtBoss ?? false);
  }

  goHome(): void {
    this.phase = "home";
    this.stageIndex = 0;
    this.areaIndex = 0;
    this.loadArea();
    this.banner = null;
    this.sound.playBgm("map");
  }

  // 画面のスティック。x: 右が+、y: 前が+(どちらも -1〜1)
  setMoveInput(x: number, y: number): void {
    this.moveInput = { x, y };
  }

  selectWeapon(id: WeaponId): void {
    if (this.phase !== "playing" || id === this.weapon) return;
    if (id !== "pistol" && this.weaponAmmo[id] <= 0) return;
    this.weapon = id;
    this.switchMs = SWITCH_MS;
    this.reloadMs = 0;
    this.firePointerId = null;
    this.sound.playSfx("switch");
    if (id === "pistol" && this.ammo === 0) this.reload();
  }

  reload(): void {
    if (this.phase !== "playing" || this.weapon !== "pistol" || this.reloadMs > 0 || this.ammo === MAX_AMMO) return;
    this.reloadMs = RELOAD_MS;
    this.sound.playSfx("reload");
  }

  // ---- ステージの流れ ----

  private get stage(): StageDef {
    return STAGES[this.stageIndex];
  }

  private get scene(): Scene {
    return STAGE_SCENES[this.stageIndex][this.areaIndex];
  }

  private get isLastArea(): boolean {
    return this.areaIndex === STAGE_SCENES[this.stageIndex].length - 1;
  }

  private beginStage(index: number, atBoss: boolean): void {
    this.stageIndex = index;
    this.areaIndex = atBoss ? STAGE_SCENES[index].length - 1 : 0;
    this.loadArea();
    this.hordeMs = this.stage.hordeMs;
    const readySprites = this.readySprites();
    this.bossSprite = readySprites.length ? readySprites[Math.floor(Math.random() * readySprites.length)] : null;
    if (atBoss) {
      this.setStagePhase("warning");
      this.banner = null;
      this.sound.stopMusic();
      this.sound.playSfx("warning");
    } else {
      this.setStagePhase("banner");
      this.banner = { title: `STAGE ${index + 1}`, sub: this.scene.name };
      this.sound.playJingle("intro");
    }
  }

  // 新しい場所に着いた: 形を作り直し、はじめの位置に立つ。前の場所のゾンビや箱は置いていく
  private loadArea(): void {
    const scene = this.scene;
    this.model = buildSceneModel(this.stageIndex, scene);
    this.occluders = [];
    this.elevated = [];
    for (const b of this.model.boxes) {
      if ((b.box.y0 ?? 0) > 1) this.elevated.push(b);
      else this.occluders.push({ aabb: b.box, box: b, blocks: true });
    }
    for (const p of scene.props) {
      // 木は幹だけ、バス停の屋根の下は通れる
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      const aabb = p.kind === "tree" ? { x0: cx - 0.3, x1: cx + 0.3, z0: cz - 0.3, z1: cz + 0.3 } : p;
      this.occluders.push({ aabb, prop: p, blocks: p.kind !== "shelter" });
    }
    this.px = 0;
    this.pz = 0;
    this.yaw = 0;
    this.zombies = [];
    this.projectiles = [];
    this.pendingSpawns = [];
    this.pickups = [];
    this.rockets = [];
    this.grenades = [];
    this.explosions = [];
    this.pickupMs = ROAD_PICKUP_INTERVAL_MS / 2;
    this.spawnMs = 1200;
    this.minionMs = 0;
  }

  private setStagePhase(p: StagePhase): void {
    this.stagePhase = p;
    this.stageMs = 0;
  }

  private updateStage(dt: number): void {
    this.stageMs += dt;
    const stage = this.stage;
    switch (this.stagePhase) {
      case "banner":
        if (this.stageMs >= STAGE_BANNER_MS) {
          this.banner = null;
          this.setStagePhase("wave");
          this.sound.playBgm(stage.bgm);
        }
        break;
      case "wave": {
        const waveMs = stage.areaWaveMs[this.areaIndex];
        if (this.banner && this.stageMs >= ARRIVE_BANNER_MS) this.banner = null;
        this.spawnMs -= dt;
        const progress = Math.min(1, this.stageMs / waveMs);
        if (this.spawnMs <= 0) {
          this.spawnGroup(stage, stage.maxAlive);
          this.spawnMs = stage.spawnStartMs + (stage.spawnEndMs - stage.spawnStartMs) * progress;
        }
        this.hordeMs -= dt;
        if (this.hordeMs <= 0) {
          this.hordeMs = stage.hordeMs;
          this.startHorde();
        }
        if (this.stageMs >= waveMs) {
          this.pendingSpawns = [];
          this.banner = null;
          if (this.isLastArea) {
            this.setStagePhase("warning");
            this.sound.stopMusic();
            this.sound.playSfx("warning");
          } else {
            // 出口が開く。歩いていくと次の場所へ
            this.setStagePhase("exit");
            this.sound.playSfx("pickup");
          }
        }
        break;
      }
      case "exit": {
        const exit = this.scene.exit;
        if (!exit || Math.hypot(this.px - exit.x, this.pz - exit.z) <= EXIT_RADIUS_M) {
          this.setStagePhase("move");
          this.banner = { title: STAGE_SCENES[this.stageIndex][this.areaIndex + 1].name, sub: "へ いどう…" };
          this.firePointerId = null;
        }
        break;
      }
      case "move":
        if (Math.floor(this.stageMs / 380) !== Math.floor((this.stageMs - dt) / 380)) this.sound.playSfx("step");
        // 暗くなりきったところで場所を入れかえる
        if (this.stageMs >= MOVE_MS / 2 && this.stageMs - dt < MOVE_MS / 2) {
          this.areaIndex += 1;
          this.loadArea();
        }
        if (this.stageMs >= MOVE_MS) {
          this.setStagePhase("wave");
          this.banner = { title: this.scene.name };
        }
        break;
      case "warning":
        if (this.stageMs >= BOSS_WARNING_MS) {
          this.spawnBoss();
          this.setStagePhase("boss");
          this.sound.playBgm("boss");
          this.sound.playSfx("roar");
        }
        break;
      case "boss":
        this.minionMs += dt;
        if (this.minionMs >= stage.bossMinionMs) {
          this.minionMs = 0;
          this.spawnGroup(stage, Math.ceil(stage.maxAlive / 2));
        }
        break;
      case "cleared":
        if (this.stageMs >= STAGE_CLEAR_MS) {
          if (this.stageIndex + 1 < STAGES.length) this.beginStage(this.stageIndex + 1, false);
          else this.finish(true);
        }
        break;
    }
  }

  // 移動中の暗さ(0: ふつう〜1: まっ暗)
  private moveDarkness(): number {
    if (this.phase !== "playing" || this.stagePhase !== "move") return 0;
    const t = this.stageMs / MOVE_MS;
    return t < 0.4 ? t / 0.4 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
  }

  private finish(cleared: boolean): void {
    if (cleared) {
      this.score += this.lives * LIFE_CLEAR_BONUS;
      this.phase = "clear";
      this.sound.playJingle("win");
    } else {
      this.phase = "gameover";
      this.sound.stopMusic();
    }
    this.banner = null;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewRecord = true;
      saveHighScore(this.score);
    }
  }

  // ---- 歩く・ぶつかる ----

  private walkableAt(x: number, z: number): boolean {
    return this.scene.walkable.some((r) => inRegion(x, z, r));
  }

  private blockedAt(x: number, z: number, radius: number): boolean {
    return this.occluders.some((o) => o.blocks && inAABB(x, z, o.aabb, radius));
  }

  // (x, z) から (dx, dz) だけ動く。ぶつかる時は、動ける向きだけ動く(壁にそってすべる)
  private slide(x: number, z: number, dx: number, dz: number, radius: number, player: boolean): { x: number; z: number; moved: boolean } {
    const ok = (nx: number, nz: number) => !this.blockedAt(nx, nz, radius) && (!player || this.walkableAt(nx, nz));
    if (ok(x + dx, z + dz)) return { x: x + dx, z: z + dz, moved: true };
    if (Math.abs(dx) > 1e-6 && ok(x + dx, z)) return { x: x + dx, z, moved: true };
    if (Math.abs(dz) > 1e-6 && ok(x, z + dz)) return { x, z: z + dz, moved: true };
    return { x, z, moved: false };
  }

  private updatePlayer(dt: number): void {
    const sec = dt / 1000;
    const canAct = this.phase === "playing" && this.stagePhase !== "move";
    let turn = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("q")) turn -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("e")) turn += 1;
    this.yaw += turn * TURN_SPEED * sec;
    // はらったあとの勢い(だんだん止まる)
    if (this.yawVel !== 0) {
      this.yaw += this.yawVel * sec;
      this.yawVel *= Math.exp(-TURN_INERTIA_DECAY * sec);
      if (Math.abs(this.yawVel) < 0.05) this.yawVel = 0;
    }

    let mx = this.moveInput.x;
    let my = this.moveInput.y;
    if (this.keys.has("a")) mx -= 1;
    if (this.keys.has("d")) mx += 1;
    if (this.keys.has("w") || this.keys.has("ArrowUp")) my += 1;
    if (this.keys.has("s") || this.keys.has("ArrowDown")) my -= 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.walking = canAct && len > 0.1;
    if (!this.walking) return;
    // 右 = (cos, -sin)、前 = (sin, cos)
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const dx = (mx * c + my * s) * PLAYER_SPEED * sec;
    const dz = (-mx * s + my * c) * PLAYER_SPEED * sec;
    const r = this.slide(this.px, this.pz, dx, dz, PLAYER_RADIUS, true);
    this.px = r.x;
    this.pz = r.z;
    // 箱の上を歩くと拾える
    for (const p of [...this.pickups]) {
      if (Math.hypot(p.x - this.px, p.z - this.pz) <= PICKUP_WALK_RADIUS) this.collectPickup(p);
    }
  }

  // ---- ゾンビを出す ----

  private readySprites(): Sprite[] {
    return this.sprites.filter((s) => s.ready);
  }

  private pickKind(stage: StageDef): ZombieKind {
    const entries = Object.entries(stage.kinds) as [ZombieKind, number][];
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = Math.random() * total;
    for (const [kind, w] of entries) {
      r -= w;
      if (r <= 0) return kind;
    }
    return "walker";
  }

  private aliveMinions(): number {
    return this.zombies.filter((z) => z.kind !== "boss" && z.state !== "dying").length;
  }

  private spawnGroup(stage: StageDef, maxAlive: number): void {
    const count = 1 + Math.floor(Math.random() * stage.groupMax);
    let spawned = 0;
    for (let i = 0; i < count && this.aliveMinions() < maxAlive; i++) {
      // 出られる場所がなければ、ほかの出方でもう一度ためす
      for (let tries = 0; tries < 3; tries++) {
        if (this.spawnZombie(this.pickKind(stage), this.pickEntry())) {
          spawned += 1;
          break;
        }
      }
    }
    if (spawned > 0) this.sound.playSfx("groan");
  }

  private distToPlayer(x: number, z: number): number {
    return Math.hypot(x - this.px, z - this.pz);
  }

  // ゾンビが出てこられる口(プレイヤーから近すぎず遠すぎないもの)
  private portalsFor(kind: "gap" | "door"): Portal[] {
    return this.scene.portals.filter((p) => p.kind === kind && this.distToPlayer(p.exitX, p.exitZ) >= SPAWN_MIN_DIST && this.distToPlayer(p.exitX, p.exitZ) <= SPAWN_Z_MAX + 2);
  }

  private hideoutProps(): Prop[] {
    return this.scene.props.filter((p) => {
      const d = this.distToPlayer((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
      return d >= SPAWN_MIN_DIST && d <= SPAWN_Z_MAX && p.kind !== "shelter" && p.kind !== "pillar";
    });
  }

  private pickEntry(): EntryKind {
    const weights = this.scene.spawnWeights;
    const available = (Object.keys(weights) as EntryKind[]).filter((k) => {
      if (weights[k] <= 0) return false;
      if (k === "far") return this.scene.far !== null;
      if (k === "ground") return true;
      if (k === "prop") return this.hideoutProps().length > 0;
      return this.portalsFor(k).length > 0;
    });
    const total = available.reduce((sum, k) => sum + weights[k], 0);
    let r = Math.random() * total;
    for (const k of available) {
      r -= weights[k];
      if (r < 0) return k;
    }
    return available[0] ?? "ground";
  }

  // 地面から這い出てくる場所: プレイヤーの前のほう、少しはなれた歩ける所
  private groundSpawnPoint(): { x: number; z: number } | null {
    for (let i = 0; i < 10; i++) {
      const a = this.yaw + (Math.random() - 0.5) * Math.PI * 1.1;
      const d = 4.5 + Math.random() * 4;
      const x = this.px + Math.sin(a) * d;
      const z = this.pz + Math.cos(a) * d;
      if (this.walkableAt(x, z) && !this.blockedAt(x, z, 0.6)) return { x, z };
    }
    return null;
  }

  private spawnZombie(kind: ZombieKind, entry: EntryKind, portal?: Portal): boolean {
    const sprites = this.readySprites().filter((s) => s !== this.bossSprite);
    if (!sprites.length) return false;
    const sprite = sprites[Math.floor(Math.random() * sprites.length)];
    const def = ZOMBIE_KINDS[kind];
    const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
    const zombie = this.makeZombie(sprite, kind, ZOMBIE_HEIGHT_M * sprite.sizeScale * def.size, 0, 0, def.hp, def.speedMin + Math.random() * (def.speedMax - def.speedMin), "walk");

    if (entry === "gap" || entry === "door") {
      const list = this.portalsFor(entry);
      if (!portal && !list.length) return false;
      this.placeInPortal(zombie, portal ?? pick(list));
    } else if (entry === "prop") {
      // 車などのうしろ(プレイヤーから見て)にしゃがんでいて、立ち上がって横から出てくる
      const list = this.hideoutProps();
      if (!list.length) return false;
      const p = pick(list);
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      const d = this.distToPlayer(cx, cz) || 1;
      const away = { x: (cx - this.px) / d, z: (cz - this.pz) / d };
      zombie.x = cx + away.x * 0.5;
      zombie.z = cz + away.z * 0.5;
      // 出てくる先: 箱の横(プレイヤーから見て右か左)
      const side = Math.random() < 0.5 ? -1 : 1;
      const half = Math.max(p.x1 - p.x0, p.z1 - p.z0) / 2 + 0.7;
      zombie.entryX = cx + -away.z * side * half;
      zombie.entryZ = cz + away.x * side * half;
      zombie.state = "rise";
    } else if (entry === "ground") {
      const at = this.groundSpawnPoint();
      if (!at) return false;
      zombie.x = at.x;
      zombie.z = at.z;
      zombie.riseFromGround = true;
      zombie.state = "rise";
      const g = project(this.view, zombie.x, 0, zombie.z);
      if (depthOf(this.view, zombie.x, zombie.z) > 0.5) this.spawnBurst(g.x, g.y, ["#5a4632", "#3d2f22", "#7a6248"], 18, 1);
    } else {
      const region = this.scene.far;
      if (!region) return false;
      zombie.x = region.x0 + Math.random() * (region.x1 - region.x0);
      zombie.z = region.z0 + Math.random() * (region.z1 - region.z0);
      if (this.distToPlayer(zombie.x, zombie.z) < 7) return false;
    }
    this.zombies.push(zombie);
    return true;
  }

  // ドアや建物のすき間の奥に置く。そこから口を通って exit まで歩いて出てくる
  private placeInPortal(zombie: Zombie, p: Portal): void {
    const along = p.kind === "door" ? (p.from + p.to) / 2 : p.from + 0.4 + Math.random() * Math.max(0, p.to - p.from - 0.8);
    const depth = p.kind === "door" ? 0.35 : 0.8 + Math.random() * 1.2;
    // 口の「奥」は、出口(exit)と反対側
    if (p.plane === "x") {
      const inward = Math.sign(p.at - p.exitX) || 1;
      zombie.x = p.at + inward * depth;
      zombie.z = along;
    } else {
      const inward = Math.sign(p.at - p.exitZ) || 1;
      zombie.z = p.at + inward * depth;
      zombie.x = along;
    }
    zombie.portal = p.kind === "door" ? p : null;
    zombie.entryX = p.exitX + (Math.random() - 0.5) * (p.kind === "door" ? 0.4 : 1);
    zombie.entryZ = p.exitZ + (Math.random() - 0.5) * (p.kind === "door" ? 0.2 : 1);
    zombie.state = p.kind === "door" ? "emerge" : "enter";
  }

  // 群れ: 同じすき間(なければ遠く)から、何体かが少しずつ間をあけて出てくる
  private startHorde(): void {
    const stage = this.stage;
    const gaps = this.portalsFor("gap");
    const portal = gaps.length && (Math.random() < 0.75 || !this.scene.far) ? gaps[Math.floor(Math.random() * gaps.length)] : undefined;
    if (!portal && !this.scene.far) return;
    const count = HORDE_MIN + Math.floor(Math.random() * (HORDE_MAX - HORDE_MIN + 1));
    for (let i = 0; i < count; i++) {
      this.pendingSpawns.push({ delayMs: i * HORDE_STAGGER_MS, kind: this.pickKind(stage), entry: portal ? "gap" : "far", portal });
    }
    this.sound.playSfx("groan");
  }

  private updatePendingSpawns(dt: number): void {
    for (const p of this.pendingSpawns) p.delayMs -= dt;
    const ready = this.pendingSpawns.filter((p) => p.delayMs <= 0);
    this.pendingSpawns = this.pendingSpawns.filter((p) => p.delayMs > 0);
    for (const p of ready) this.spawnZombie(p.kind, p.entry, p.portal);
  }

  private makeZombie(sprite: Sprite, kind: Zombie["kind"], heightM: number, x: number, z: number, hp: number, speed: number, state: ZombieState): Zombie {
    return {
      sprite,
      kind,
      heightM,
      x,
      z,
      portal: null,
      entryX: null,
      entryZ: null,
      riseFromGround: false,
      hp,
      maxHp: hp,
      speed,
      state,
      stateMs: 0,
      ageMs: 0,
      staggerMs: 0,
      flashMs: 0,
      walkPhase: Math.random() * Math.PI * 2,
      lastHitHead: false,
      stuckMs: 0,
      detourMs: 0,
      detourDir: 1,
      throwMs: 0,
      chargeMs: 0,
      chargeDamage: 0,
      vx: 0,
    };
  }

  // ボスは、場所ごとに決まった所(駅の入口や横の道など)から出てくる
  private spawnBoss(): void {
    const sprite = this.bossSprite ?? this.readySprites()[0];
    if (!sprite) return;
    const start = this.scene.bossStart ?? { x: 0, z: SPAWN_Z_MAX };
    const boss = this.makeZombie(sprite, "boss", BOSS_HEIGHT_M * Math.max(0.75, sprite.sizeScale), start.x, start.z, this.stage.bossHp, 1.6, "walk");
    if (start.portal !== undefined) {
      const p = this.scene.portals[start.portal];
      boss.portal = p.kind === "door" ? p : null;
      boss.entryX = p.exitX;
      boss.entryZ = p.exitZ;
      boss.state = "enter";
    }
    boss.throwMs = this.stage.bossThrowMs;
    boss.chargeMs = this.stage.bossChargeMs;
    this.zombies.push(boss);
  }

  private get boss(): Zombie | undefined {
    return this.zombies.find((z) => z.kind === "boss");
  }

  // ---- 毎フレーム ----

  private frame = (now: number): void => {
    const dt = Math.min(50, now - this.lastTime);
    this.lastTime = now;
    this.time += dt;
    this.resize();
    this.update(dt);
    this.render();
    this.sendState();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    this.cooldownMs = Math.max(0, this.cooldownMs - dt);
    this.recoilMs = Math.max(0, this.recoilMs - dt);
    this.flashMs = Math.max(0, this.flashMs - dt);
    this.invincibleMs = Math.max(0, this.invincibleMs - dt);
    this.hurtMs = Math.max(0, this.hurtMs - dt);
    this.shakeMs = Math.max(0, this.shakeMs - dt);
    this.aimVisibleMs = Math.max(0, this.aimVisibleMs - dt);
    this.switchMs = Math.max(0, this.switchMs - dt);
    if (this.reloadMs > 0) {
      this.reloadMs -= dt;
      if (this.reloadMs <= 0) {
        this.reloadMs = 0;
        this.ammo = MAX_AMMO;
      }
    }

    if (this.phase === "playing") this.updatePlayer(dt);
    this.view = makeView(this.view.w, this.view.h, this.px, this.pz, this.yaw);

    if (this.phase === "home") this.updateWanderers(dt);
    if (this.phase === "playing") {
      this.hintMs = Math.max(0, this.hintMs - (this.stagePhase === "wave" ? dt : 0));
      this.updateStage(dt);
      this.updatePendingSpawns(dt);
      // マシンガンは、動かさずに少し押し続けると撃ちはじめ、離すまで撃ち続ける
      if (WEAPONS[this.weapon].auto && this.firePointerId === null) {
        for (const [id, t] of this.touches) {
          if (t.mode === "pending" && this.time - t.downAt >= HOLD_TO_FIRE_MS) {
            t.mode = "fire";
            this.firePointerId = id;
            this.aimX = t.lastX;
            this.aimY = t.lastY;
            break;
          }
        }
      }
      if (this.firePointerId !== null && WEAPONS[this.weapon].auto) {
        this.aimVisibleMs = CROSSHAIR_TOUCH_MS;
        this.fire(this.aimX, this.aimY);
      }
      this.updatePickups(dt);
    }
    if (this.phase === "gameover" && this.endMs > 0) this.endMs -= dt;

    for (const z of this.zombies) this.updateZombie(z, dt);
    this.zombies = this.zombies.filter((z) => !(z.state === "dying" && z.stateMs >= DYING_MS) && !(z.state === "wander" && Math.abs(z.x) > WANDER_HALF_WIDTH_M + 0.1));
    this.updateProjectiles(dt);
    this.updateWeaponShots(dt);
    this.updateEffects(dt);
  }

  private updateWanderers(dt: number): void {
    const count = this.zombies.filter((z) => z.state === "wander").length;
    if (count < WANDER_MAX && Math.random() < dt / 1500) {
      const sprites = this.readySprites();
      if (!sprites.length) return;
      const sprite = sprites[Math.floor(Math.random() * sprites.length)];
      const dir = Math.random() < 0.5 ? -1 : 1;
      const z = 6 + Math.random() * 8;
      // 建物を突きぬけないよう、道の幅の中だけを横切る
      const zombie = this.makeZombie(sprite, "walker", ZOMBIE_HEIGHT_M * sprite.sizeScale, -dir * WANDER_HALF_WIDTH_M, z, 1, 0, "wander");
      zombie.vx = dir * (0.5 + Math.random() * 0.4);
      this.zombies.push(zombie);
    }
  }

  private updateZombie(z: Zombie, dt: number): void {
    z.stateMs += dt;
    z.ageMs += dt;
    z.flashMs = Math.max(0, z.flashMs - dt);
    const sec = dt / 1000;
    if (z.state === "dying") return;
    if (z.state === "wander") {
      z.x += z.vx * sec;
      return;
    }
    // ゲームオーバー後と、次の場所へ移動している間は止まる
    if (this.phase !== "playing" || this.stagePhase === "move") return;
    if (z.staggerMs > 0) {
      z.staggerMs -= dt;
      return;
    }
    if (z.kind === "boss") {
      this.updateBoss(z, dt);
      return;
    }
    switch (z.state) {
      case "emerge":
        if (z.stateMs >= EMERGE_MS) this.setZombieState(z, "enter");
        break;
      case "rise":
        if (z.stateMs >= RISE_MS) this.setZombieState(z, z.entryX !== null ? "enter" : "walk");
        break;
      case "enter":
        if (this.stepToEntry(z, Math.max(ENTER_SPEED, z.speed) * sec)) this.startWalking(z);
        break;
      case "walk": {
        const d = this.distToPlayer(z.x, z.z);
        if (d <= ATTACK_Z) {
          this.setZombieState(z, "windup");
          break;
        }
        this.chase(z, z.speed * sec, dt);
        break;
      }
      case "windup":
        if (z.stateMs >= ATTACK_WINDUP_MS) {
          // よけられた(離れた)ら、また追いかける
          if (this.distToPlayer(z.x, z.z) > BITE_REACH) this.setZombieState(z, "walk");
          else this.setZombieState(z, "lunge");
        }
        break;
      case "lunge":
        if (z.stateMs >= 150) {
          if (this.distToPlayer(z.x, z.z) <= BITE_REACH) this.hurtPlayer();
          this.pushAway(z, BITE_KNOCKBACK_M);
          this.setZombieState(z, "walk");
        }
        break;
    }
  }

  // プレイヤーの方へ歩く。ほかのゾンビとかさならないようにし、建物につっかえたら回りこむ
  private chase(z: Zombie, step: number, dt: number): void {
    const d = this.distToPlayer(z.x, z.z) || 1;
    let dx = (this.px - z.x) / d;
    let dz = (this.pz - z.z) / d;
    if (z.detourMs > 0) {
      z.detourMs -= dt;
      const t = dx;
      dx = -dz * z.detourDir;
      dz = t * z.detourDir;
    }
    for (const o of this.zombies) {
      if (o === z || o.state === "dying" || o.state === "wander") continue;
      const ox = z.x - o.x;
      const oz = z.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od > 0.01 && od < ZOMBIE_RADIUS * 2.4) {
        dx += (ox / od) * 0.6;
        dz += (oz / od) * 0.6;
      }
    }
    const len = Math.hypot(dx, dz) || 1;
    const r = this.slide(z.x, z.z, (dx / len) * step, (dz / len) * step, ZOMBIE_RADIUS, false);
    z.x = r.x;
    z.z = r.z;
    if (!r.moved) {
      z.stuckMs += dt;
      if (z.stuckMs > 400) {
        z.stuckMs = 0;
        z.detourMs = 1200;
        z.detourDir = Math.random() < 0.5 ? -1 : 1;
      }
    } else {
      z.stuckMs = 0;
    }
  }

  // プレイヤーから遠ざける(かみついた後に下がる、弾が当たってよろける)
  private pushAway(z: Zombie, distance: number): void {
    const d = this.distToPlayer(z.x, z.z) || 1;
    const r = this.slide(z.x, z.z, ((z.x - this.px) / d) * distance, ((z.z - this.pz) / d) * distance, ZOMBIE_RADIUS, false);
    z.x = r.x;
    z.z = r.z;
  }

  private updateBoss(b: Zombie, dt: number): void {
    const sec = dt / 1000;
    const stage = this.stage;
    const d = this.distToPlayer(b.x, b.z) || 1;
    const toward = { x: (this.px - b.x) / d, z: (this.pz - b.z) / d };
    const move = (vx: number, vz: number) => {
      const r = this.slide(b.x, b.z, vx * sec, vz * sec, 0.8, false);
      b.x = r.x;
      b.z = r.z;
    };
    switch (b.state) {
      case "enter":
        if (this.stepToEntry(b, 2 * sec)) this.setZombieState(b, "walk");
        break;
      case "walk":
        if (d <= BOSS_STAND_Z) this.setZombieState(b, "stand");
        else move(toward.x * b.speed, toward.z * b.speed);
        break;
      case "stand": {
        // プレイヤーとの距離をたもちながら、横にゆらゆら動く
        const keep = d < BOSS_STAND_Z - 1.5 ? -1.2 : d > BOSS_STAND_Z + 2.5 ? 1.2 : 0;
        const sway = Math.sin(this.time / 1400) * 1.2;
        move(toward.x * keep - toward.z * sway, toward.z * keep + toward.x * sway);
        b.throwMs -= dt;
        b.chargeMs -= dt;
        if (b.throwMs <= 0) {
          b.throwMs = stage.bossThrowMs * (b.hp < b.maxHp / 2 ? 0.7 : 1);
          this.throwProjectile(b);
        }
        if (b.chargeMs <= 0) {
          b.chargeMs = stage.bossChargeMs;
          b.chargeDamage = 0;
          this.setZombieState(b, "charge");
          this.sound.playSfx("roar");
        }
        break;
      }
      case "charge":
        if (d <= BOSS_CHARGE_Z) this.setZombieState(b, "windup");
        else move(toward.x * BOSS_CHARGE_SPEED, toward.z * BOSS_CHARGE_SPEED);
        break;
      case "windup":
        if (b.stateMs >= ATTACK_WINDUP_MS * 1.2) this.setZombieState(b, "lunge");
        break;
      case "lunge":
        if (b.stateMs >= 160) {
          if (d <= BOSS_CHARGE_Z + 1) this.hurtPlayer();
          this.setZombieState(b, "retreat");
        }
        break;
      case "retreat":
        if (d >= BOSS_STAND_Z) this.setZombieState(b, "stand");
        else move(-toward.x * 3, -toward.z * 3);
        break;
    }
  }

  // 出てきた口から、まず決まった場所(entryX, entryZ)へ歩いていく。着いたらtrue
  private stepToEntry(z: Zombie, step: number): boolean {
    const tx = z.entryX ?? z.x;
    const tz = z.entryZ ?? z.z;
    const d = Math.hypot(tx - z.x, tz - z.z);
    if (d <= step) {
      z.x = tx;
      z.z = tz;
    } else {
      z.x += ((tx - z.x) / d) * step;
      z.z += ((tz - z.z) / d) * step;
    }
    // ドアを通りぬけたら、もう隠れていない
    if (z.portal && !this.insidePortal(z, z.portal)) z.portal = null;
    return d <= step;
  }

  private insidePortal(z: Zombie, p: Portal): boolean {
    if (p.plane === "x") {
      const inward = Math.sign(p.at - p.exitX) || 1;
      return (z.x - p.at) * inward > -0.05;
    }
    const inward = Math.sign(p.at - p.exitZ) || 1;
    return (z.z - p.at) * inward > -0.05;
  }

  private startWalking(z: Zombie): void {
    z.entryX = null;
    z.entryZ = null;
    z.portal = null;
    z.riseFromGround = false;
    this.setZombieState(z, "walk");
  }

  private setZombieState(z: Zombie, state: ZombieState): void {
    z.state = state;
    z.stateMs = 0;
  }

  private throwProjectile(b: Zombie): void {
    this.projectiles.push({
      fromX: b.x,
      fromY: b.heightM * 0.75,
      fromZ: b.z,
      toX: this.px + (Math.random() - 0.5) * 0.8,
      toZ: this.pz + (Math.random() - 0.5) * 0.8,
      ms: 0,
      spin: Math.random() * Math.PI,
    });
    this.sound.playSfx("throw");
  }

  private projectilePos(p: Projectile): { x: number; y: number; z: number } {
    const t = Math.min(1, p.ms / PROJECTILE_FLIGHT_MS);
    return {
      x: p.fromX + (p.toX - p.fromX) * t,
      y: p.fromY + (0.3 - p.fromY) * t + Math.sin(Math.PI * t) * 2.2,
      z: p.fromZ + (p.toZ - p.fromZ) * t,
    };
  }

  private updateProjectiles(dt: number): void {
    if (this.phase !== "playing" || this.stagePhase === "move") return;
    for (const p of this.projectiles) {
      p.ms += dt;
      p.spin += dt * 0.01;
    }
    for (const p of this.projectiles.filter((q) => q.ms >= PROJECTILE_FLIGHT_MS)) {
      // 落ちた所の近くにいたら当たる。歩いてよけていれば、地面でくだける
      if (Math.hypot(p.toX - this.px, p.toZ - this.pz) <= PROJECTILE_HIT_RADIUS_M) this.hurtPlayer();
      else if (depthOf(this.view, p.toX, p.toZ) > 0.5) {
        const g = project(this.view, p.toX, 0, p.toZ);
        this.spawnBurst(g.x, g.y, ["#8a6a4a", "#5a4632", "#b09070"], 12, 0.8);
        this.sound.playSfx("shatter");
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.ms < PROJECTILE_FLIGHT_MS);
  }

  private hurtPlayer(): void {
    if (this.phase !== "playing" || this.invincibleMs > 0) return;
    this.lives -= 1;
    this.invincibleMs = PLAYER_INVINCIBLE_MS;
    this.hurtMs = HURT_FLASH_MS;
    this.shakeMs = SHAKE_MS;
    this.sound.playSfx("bite");
    if (this.lives <= 0) {
      this.lives = 0;
      this.endMs = GAMEOVER_DELAY_MS;
      this.sound.playSfx("gameOver");
      this.finish(false);
    }
  }

  // ---- 撃つ ----

  private fire(px: number, py: number): void {
    if (this.cooldownMs > 0 || this.switchMs > 0 || this.stagePhase === "move") return;
    const weapon = this.weapon;
    const def = WEAPONS[weapon];
    if (weapon === "pistol") {
      if (this.reloadMs > 0 || this.ammo <= 0) {
        this.sound.playSfx("empty");
        this.cooldownMs = SHOT_COOLDOWN_MS * 2;
        return;
      }
      this.ammo -= 1;
    } else {
      this.weaponAmmo[weapon] -= 1;
    }
    this.cooldownMs = def.cooldownMs;
    this.recoilMs = RECOIL_MS;
    this.flashMs = weapon === "grenade" ? 0 : MUZZLE_FLASH_MS;
    const muzzle = muzzlePoint(this.view, this.gunPose());

    if (weapon === "rocket") {
      this.launchRocket(px, py, muzzle);
    } else if (weapon === "grenade") {
      this.throwGrenade(px, py);
    } else {
      if (weapon === "mg") {
        px += (Math.random() - 0.5) * 2 * MG_SPREAD_PX;
        py += (Math.random() - 0.5) * 2 * MG_SPREAD_PX;
      }
      this.sound.playSfx(weapon === "mg" ? "mg" : "shot");
      this.tracers.push({ x0: muzzle.x, y0: muzzle.y, x1: px, y1: py, life: TRACER_MS });
      const target = this.findTarget(px, py);
      if (target) target.hit(def.bodyDamage, def.headDamage);
      else this.spawnDust(px, py);
    }

    if (weapon === "pistol") {
      if (this.ammo === 0) this.reload();
    } else if (this.weaponAmmo[weapon] <= 0) {
      this.firePointerId = null;
      this.selectWeapon("pistol");
    }
  }

  // 画面の点(px, py)をねらった時に、いちばん手前で当たるもの(描いた順番の逆から調べる)
  private findTarget(px: number, py: number): Target | null {
    for (let i = this.drawOrder.length - 1; i >= 0; i--) {
      const t = this.drawOrder[i].hit?.(px, py);
      if (t) return t;
    }
    return null;
  }

  // ねらった点の地面の位置。何かに当たればその足もと、空をねらっていれば前方の遠く
  private aimGround(px: number, py: number): { x: number; z: number } {
    const target = this.findTarget(px, py);
    if (target) return target.ground;
    const g = screenToGround(this.view, px, py);
    if (g && this.distToPlayer(g.x, g.z) <= SPAWN_Z_MAX) return g;
    const cz = SPAWN_Z_MAX;
    return fromCamera(this.view, (px - this.view.w / 2) / scaleAt(this.view, cz), cz);
  }

  private launchRocket(px: number, py: number, muzzle: { x: number; y: number }): void {
    const g = this.aimGround(px, py);
    this.rockets.push({ sx: muzzle.x, sy: muzzle.y, tx: g.x, tz: g.z, ms: 0 });
    this.sound.playSfx("rocket");
    this.shakeMs = SHAKE_MS * 0.5;
  }

  private throwGrenade(px: number, py: number): void {
    const g = this.aimGround(px, py);
    const start = fromCamera(this.view, 0.2, 0.8);
    const dist = Math.hypot(g.x - start.x, g.z - start.z);
    this.grenades.push({ x0: start.x, z0: start.z, tx: g.x, tz: g.z, ms: 0, durMs: GRENADE_FLIGHT_BASE_MS + dist * GRENADE_FLIGHT_PER_M_MS, spin: 0 });
    this.sound.playSfx("toss");
  }

  private grenadePos(g: Grenade): { x: number; y: number; z: number } {
    const t = Math.min(1, g.ms / g.durMs);
    const dist = Math.hypot(g.tx - g.x0, g.tz - g.z0);
    return { x: g.x0 + (g.tx - g.x0) * t, z: g.z0 + (g.tz - g.z0) * t, y: 1.3 * (1 - t) + 0.15 * t + Math.sin(Math.PI * t) * (0.8 + dist * 0.12) };
  }

  private updateWeaponShots(dt: number): void {
    for (const r of this.rockets) r.ms += dt;
    for (const r of this.rockets.filter((q) => q.ms >= ROCKET_FLIGHT_MS)) this.explode(r.tx, r.tz, "rocket");
    this.rockets = this.rockets.filter((r) => r.ms < ROCKET_FLIGHT_MS);
    for (const g of this.grenades) {
      g.ms += dt;
      g.spin += dt * 0.015;
    }
    for (const g of this.grenades.filter((q) => q.ms >= q.durMs)) this.explode(g.tx, g.tz, "grenade");
    this.grenades = this.grenades.filter((g) => g.ms < g.durMs);
    for (const e of this.explosions) e.ms += dt;
    this.explosions = this.explosions.filter((e) => e.ms < EXPLOSION_MS);
  }

  // 爆発: まわりのゾンビ全部にダメージを与え、飛んでくるがれきも吹き飛ばす
  private explode(x: number, z: number, weapon: "rocket" | "grenade"): void {
    const blast = WEAPONS[weapon].blast;
    if (!blast) return;
    this.explosions.push({ x, z, radiusM: blast.radiusM, ms: 0 });
    this.sound.playSfx("explosion");
    this.shakeMs = SHAKE_MS;
    const depth = depthOf(this.view, x, z);
    if (depth > 0.5) {
      const p = project(this.view, x, 0.6, z);
      const power = Math.min(2.5, Math.max(0.8, scaleAt(this.view, depth) / 60));
      this.spawnBurst(p.x, p.y, ["#fff3b0", "#ffc93c", "#ff8a3c", "#ff5a3c", "rgba(90,80,70,0.8)"], 34, power);
    }
    if (this.phase !== "playing") return;
    for (const zombie of this.zombies) {
      if (zombie.state === "dying" || zombie.state === "wander") continue;
      const distance = Math.hypot(zombie.x - x, zombie.z - z) - (zombie.kind === "boss" ? 1 : 0.3);
      const damage = blastDamage(blast.damage, blast.radiusM, distance);
      if (damage <= 0) continue;
      const rect = this.zombieRect(zombie);
      this.applyDamage(zombie, damage, false, rect.left + rect.w / 2, rect.top + rect.h * 0.4);
    }
    for (const p of [...this.projectiles]) {
      const pos = this.projectilePos(p);
      if (Math.hypot(pos.x - x, pos.z - z) <= blast.radiusM) this.destroyProjectile(p);
    }
  }

  private destroyProjectile(p: Projectile): void {
    const pos = this.projectilePos(p);
    const s = project(this.view, pos.x, pos.y, pos.z);
    this.projectiles = this.projectiles.filter((q) => q !== p);
    this.spawnBurst(s.x, s.y, ["#8a6a4a", "#5a4632", "#b09070"], 14, 1);
    this.addScore(PROJECTILE_SCORE, s.x, s.y - 20, "#ffe066");
    this.sound.playSfx("shatter");
  }

  private shotZombie(z: Zombie, part: HitPart, damage: number, px: number, py: number): void {
    const isBoss = z.kind === "boss";
    if (part === "head" && isBoss) damage *= BOSS_HEAD_MULTIPLIER;
    this.spawnBurst(px, py, GOO_COLORS, part === "head" ? 16 : 9, part === "head" ? 1.4 : 1);
    this.sound.playSfx(part === "head" ? "headshot" : "hit");
    if (part === "head") this.popups.push({ x: px, y: py - 28, text: isBoss ? "じゃくてん!" : "HEADSHOT!", color: "#ffe066", life: POPUP_MS });
    this.applyDamage(z, damage, part === "head", px, py);
  }

  private applyDamage(z: Zombie, damage: number, headshot: boolean, px: number, py: number): void {
    const isBoss = z.kind === "boss";
    z.hp -= damage;
    z.flashMs = HIT_FLASH_MS;
    z.lastHitHead = headshot;

    if (isBoss) {
      this.addScore(Math.round(damage * 10), px, py, null);
      if (z.state === "charge" || z.state === "windup") {
        z.chargeDamage += damage;
        if (z.chargeDamage >= BOSS_CHARGE_STOP_DAMAGE) {
          z.staggerMs = 500;
          this.setZombieState(z, "retreat");
          this.popups.push({ x: px, y: py - 56, text: "ひるんだ!", color: "#9ff0ff", life: POPUP_MS });
        }
      }
      if (z.hp <= 0) this.defeatBoss(z);
      return;
    }

    if (z.hp <= 0) {
      this.killZombie(z, true);
      return;
    }
    // よろけて少し下がる。かみつこうとしていたら、やめて歩き直す
    z.staggerMs = HIT_STAGGER_MS;
    if (z.state === "walk" || z.state === "windup" || z.state === "lunge") this.pushAway(z, HIT_STAGGER_BACK_M);
    if (z.state === "windup" || z.state === "lunge") this.setZombieState(z, "walk");
  }

  // ---- 落ちている武器の箱 ----

  private updatePickups(dt: number): void {
    for (const p of this.pickups) p.ageMs += dt;
    this.pickups = this.pickups.filter((p) => p.ageMs < PICKUP_LIFETIME_MS);
    if (this.stagePhase !== "wave" && this.stagePhase !== "boss") return;
    this.pickupMs -= dt;
    if (this.pickupMs <= 0) {
      this.pickupMs = this.stagePhase === "boss" ? BOSS_PICKUP_INTERVAL_MS : ROAD_PICKUP_INTERVAL_MS;
      // プレイヤーの前のほうの、歩いて取りにいける所に置く
      for (let i = 0; i < 10; i++) {
        const a = this.yaw + (Math.random() - 0.5) * 1.4;
        const d = 5 + Math.random() * 5;
        const x = this.px + Math.sin(a) * d;
        const z = this.pz + Math.cos(a) * d;
        if (this.walkableAt(x, z) && !this.blockedAt(x, z, 0.5)) {
          this.dropPickup(x, z, this.lives < PLAYER_START_LIVES && Math.random() < HEART_ROAD_CHANCE ? "heart" : undefined);
          break;
        }
      }
    }
  }

  private dropPickup(x: number, z: number, item?: Pickup["item"]): void {
    if (this.pickups.length >= PICKUP_MAX_ALIVE) return;
    const pickup: Pickup = { item: item ?? pickSpecialWeapon(Math.random()), x, z, ageMs: 0 };
    this.pickups.push(pickup);
    if (!this.pickupHintShown && depthOf(this.view, x, z) > 1) {
      this.pickupHintShown = true;
      const r = this.pickupHitRect(pickup);
      this.popups.push({ x: r.left + r.w / 2, y: r.top - 8, text: "うつか ふんで ゲット!", color: "#ffe066", life: 2500 });
    }
  }

  private collectPickup(p: Pickup): void {
    this.pickups = this.pickups.filter((q) => q !== p);
    const depth = depthOf(this.view, p.x, p.z);
    const at = depth > 0.5 ? project(this.view, p.x, 0.5, p.z) : { x: this.view.w / 2, y: this.view.h * 0.6 };
    if (p.item === "heart") {
      // ライフが1ふえる。満タンなら、かわりに点数
      if (this.lives < PLAYER_START_LIVES) {
        this.lives += 1;
        this.popups.push({ x: at.x, y: at.y - 20, text: "ライフ +1", color: "#ff6f91", life: POPUP_MS * 1.5 });
      } else {
        this.addScore(HEART_FULL_BONUS, at.x, at.y - 20, "#ff6f91");
      }
      this.spawnBurst(at.x, at.y, ["#ff6f91", "#ffffff", "#ffb3c6"], 16, 1);
      this.sound.playSfx("heal");
      return;
    }
    const def = WEAPONS[p.item];
    this.weaponAmmo[p.item] = Math.min(def.maxAmmo, this.weaponAmmo[p.item] + def.pickupAmmo);
    this.popups.push({ x: at.x, y: at.y - 20, text: `${def.name} ゲット!`, color: def.color, life: POPUP_MS * 1.5 });
    this.spawnBurst(at.x, at.y, [def.color, "#ffffff"], 14, 1);
    // 拾っても持ちかえない(持ちかえは画面のボタンか 1〜4 キーで)
    this.sound.playSfx("pickup");
  }

  private pickupRect(p: Pickup): Rect {
    const depth = depthOf(this.view, p.x, p.z);
    const s = scaleAt(this.view, depth);
    const w = PICKUP_SIZE_M * s;
    const h = PICKUP_SIZE_M * 0.75 * s;
    const bob = Math.sin(this.time * 0.005 + p.x) * h * 0.06;
    const g = project(this.view, p.x, 0, p.z);
    return { left: g.x - w / 2, top: g.y - h - bob, w, h };
  }

  private pickupHitRect(p: Pickup): Rect {
    const r = this.pickupRect(p);
    if (p.item === "heart") {
      // 浮いているハートのまわり
      const groundY = project(this.view, p.x, 0, p.z).y;
      const size = Math.max(PICKUP_MIN_HIT_PX, r.w * 1.4);
      const hy = groundY - r.w * 1.1;
      return { left: r.left + r.w / 2 - size / 2, top: hy - size / 2, w: size, h: size + r.w * 0.8 };
    }
    const w = Math.max(PICKUP_MIN_HIT_PX, r.w * 1.3);
    const h = Math.max(PICKUP_MIN_HIT_PX, r.h * 1.3) + 18;
    return { left: r.left + r.w / 2 - w / 2, top: r.top + r.h - h + r.h * 0.15, w, h };
  }

  private killZombie(z: Zombie, scored: boolean): void {
    this.setZombieState(z, "dying");
    this.sound.playSfx("defeat");
    const rect = this.zombieRect(z);
    this.spawnBurst(rect.left + rect.w / 2, rect.top + rect.h * 0.5, ["rgba(200,230,180,0.8)", "rgba(150,180,140,0.7)"], 10, 0.6);
    if (scored && z.kind !== "boss") {
      const def = ZOMBIE_KINDS[z.kind];
      const points = def.score + (z.lastHitHead ? HEADSHOT_BONUS : 0);
      this.addScore(points, rect.left + rect.w / 2, rect.top, "#ffffff");
      if (!this.blockedAt(z.x, z.z, 0.3)) {
        if (Math.random() < HEART_DROP_CHANCE) this.dropPickup(z.x, z.z, "heart");
        else if (Math.random() < DROP_CHANCE[z.kind]) this.dropPickup(z.x, z.z);
      }
    }
  }

  private defeatBoss(b: Zombie): void {
    this.killZombie(b, false);
    this.projectiles = [];
    this.pendingSpawns = [];
    this.zombies.filter((z) => z !== b && z.state !== "dying").forEach((z) => this.killZombie(z, false));
    const rect = this.zombieRect(b);
    this.addScore(BOSS_SCORE_PER_STAGE * (this.stageIndex + 1), rect.left + rect.w / 2, rect.top + rect.h * 0.3, "#ffe066");
    for (let i = 0; i < 5; i++) this.spawnBurst(rect.left + Math.random() * rect.w, rect.top + Math.random() * rect.h, GOO_COLORS, 16, 1.6);
    this.sound.stopMusic();
    this.sound.playSfx("bossDefeat");
    this.shakeMs = SHAKE_MS * 2;
    this.setStagePhase("cleared");
    this.banner = { title: "STAGE CLEAR!" };
  }

  private addScore(points: number, x: number, y: number, color: string | null): void {
    this.score += points;
    if (color) this.popups.push({ x, y, text: `+${points}`, color, life: POPUP_MS });
  }

  // ---- 演出 ----

  private spawnBurst(x: number, y: number, colors: string[], count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (80 + Math.random() * 260) * power;
      const life = 350 + Math.random() * 350;
      this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 120 * power, life, maxLife: life, size: 2 + Math.random() * 4 * power, color: colors[Math.floor(Math.random() * colors.length)], gravity: 700 });
    }
  }

  private spawnDust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const life = 300 + Math.random() * 200;
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 120, life, maxLife: life, size: 2 + Math.random() * 3, color: "rgba(200,190,170,0.8)", gravity: 200 });
    }
  }

  private updateEffects(dt: number): void {
    const sec = dt / 1000;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.vy += p.gravity * sec;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.life -= dt;
      p.y -= 40 * sec;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
  }

  // ---- 描く ----

  private resize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const box = canvas.parentElement ?? canvas;
    const w = box.clientWidth || window.innerWidth;
    const h = box.clientHeight || window.innerHeight;
    // 大きな画面を高い解像度で描くととても重くなるので、描く点の数に上限をつける
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_RENDER_PIXELS / (w * h)));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr) || this.view.w !== w || this.view.h !== h) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      this.dpr = dpr;
    }
    this.view = makeView(w, h, this.px, this.pz, this.yaw);
  }

  private gunPose(): GunPose {
    // 持ちかえ中はリロードと同じように、いったん下げて持ち上げる。歩いている時は小さくゆらす
    const moving = this.phase === "playing" && (this.stagePhase === "move" || this.walking);
    const reload = this.reloadMs > 0 ? 1 - this.reloadMs / RELOAD_MS : this.switchMs > 0 ? 1 - this.switchMs / SWITCH_MS : moving ? 0.08 + Math.abs(Math.sin(this.time * 0.009)) * 0.06 : 0;
    return {
      weapon: this.weapon,
      aimX: this.aimX,
      aimY: this.aimY,
      recoil: Math.min(1, (this.recoilMs / RECOIL_MS) * (this.weapon === "rocket" ? 1.6 : 1)),
      reload,
      flash: this.flashMs > 0,
    };
  }

  // ゾンビを描く四角(当たり判定も同じ四角で行う)
  private zombieRect(z: Zombie): Rect {
    const rect = standingRect(this.view, z.x, z.z, z.heightM, z.sprite.aspect);
    const freq = z.kind === "runner" ? 0.016 : 0.007;
    const bob = isMoving(z) ? Math.abs(Math.sin(this.time * freq + z.walkPhase)) * rect.h * 0.03 : 0;
    let dz = 0;
    if (z.state === "windup") dz = Math.sin(z.stateMs * 0.08) * rect.w * 0.03;
    let sink = 0;
    if (z.state === "rise") {
      const t = Math.min(1, z.stateMs / RISE_MS);
      sink = (1 - t) * (1 - t) * rect.h * 0.85;
      dz += Math.sin(z.stateMs * 0.03) * rect.w * 0.03;
    }
    return { left: rect.left + dz, top: rect.top - bob + sink, w: rect.w, h: rect.h };
  }

  // ゾンビが見えている範囲(画面上の多角形)。ドアの中にいる間はその口だけ、地面から出てくる途中は地面より上だけ
  private zombieClip(z: Zombie): { x: number; y: number }[] | null {
    const p = z.portal;
    if (p && this.insidePortal(z, p)) {
      const corners: [number, number, number][] =
        p.plane === "x"
          ? [
              [p.at, 0, p.from],
              [p.at, 0, p.to],
              [p.at, p.height, p.to],
              [p.at, p.height, p.from],
            ]
          : [
              [p.from, 0, p.at],
              [p.to, 0, p.at],
              [p.to, p.height, p.at],
              [p.from, p.height, p.at],
            ];
      return projectPolygon(this.view, corners);
    }
    if (z.state === "rise") {
      const groundY = project(this.view, z.x, 0, z.z).y;
      return [
        { x: -1e5, y: -1e5 },
        { x: 1e5, y: -1e5 },
        { x: 1e5, y: groundY },
        { x: -1e5, y: groundY },
      ];
    }
    return null;
  }

  // ドアから出てくる途中のゾンビが中にいる建物(その建物には隠されない)
  private containingOccluder(x: number, z: number): Occluder | undefined {
    return this.occluders.find((o) => inAABB(x, z, o.aabb));
  }

  private render(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const view = this.view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shakeMs > 0) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, view.w, view.h);
      const k = (this.shakeMs / SHAKE_MS) * 10;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }

    drawBackdrop(ctx, view, this.model);
    // 高架や看板は、下を通るものより先に描く
    [...this.elevated].sort((a, b) => aabbDistance(this.px, this.pz, b.box) - aabbDistance(this.px, this.pz, a.box)).forEach((b) => drawBoxModel(ctx, view, this.model, b));

    this.drawWorld(ctx);
    this.drawEffects(ctx);
    if (this.phase === "playing") this.drawOffscreenMarkers(ctx);
    this.drawHurt(ctx);
    const dark = this.moveDarkness();
    if (dark > 0) {
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(-20, -20, view.w + 40, view.h + 40);
    }

    if (this.phase === "playing" || this.endMs > 0) {
      drawGun(ctx, view, this.gunPose());
      if (this.mouseAim || this.aimVisibleMs > 0) drawCrosshair(ctx, this.aimX, this.aimY, this.recoilMs / RECOIL_MS);
    } else if (this.phase !== "home") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  // 建物・置いてあるもの・ゾンビなどを、見えている前後関係どおりに描く。
  // 建物どうしは遠い順に描き、ゾンビなどは「カメラとのあいだに建物がある」ならその建物より先に描いて隠す
  private drawWorld(ctx: CanvasRenderingContext2D): void {
    const view = this.view;
    const occ = this.occluders
      .map((o) => ({ o, d: aabbDistance(this.px, this.pz, o.aabb) }))
      .filter((e) => e.d < 80)
      .sort((a, b) => b.d - a.d)
      .map((e) => e.o);

    const dynamics: DrawItem[] = [];
    const stageIndex = this.stageIndex;
    const flicker = Math.sin(this.time * 0.013) > 0.93 || Math.sin(this.time * 0.0021) > 0.97 ? 0.15 : 1;
    this.scene.lamps.forEach((l, i) => dynamics.push({ x: l.x, z: l.z, depth: depthOf(view, l.x, l.z), draw: () => drawLamp(ctx, view, l, stageIndex, i === 0 ? flicker : 1) }));
    for (const z of this.zombies) {
      const depth = depthOf(view, z.x, z.z);
      if (depth < 0.35) continue;
      dynamics.push({
        x: z.x,
        z: z.z,
        depth,
        ignore: z.portal ? this.containingOccluder(z.x, z.z) : undefined,
        draw: () => this.drawZombie(ctx, z, depth),
        hit: (px, py) => this.hitZombie(z, px, py),
      });
    }
    for (const p of this.pickups) {
      const depth = depthOf(view, p.x, p.z);
      if (depth < 0.5) continue;
      dynamics.push({
        x: p.x,
        z: p.z,
        depth,
        draw: () => this.drawPickup(ctx, p),
        hit: (px, py) => {
          const r = this.pickupHitRect(p);
          if (px < r.left || px > r.left + r.w || py < r.top || py > r.top + r.h) return null;
          return { hit: () => this.collectPickup(p), ground: { x: p.x, z: p.z } };
        },
      });
    }
    for (const p of this.projectiles) {
      const pos = this.projectilePos(p);
      const depth = depthOf(view, pos.x, pos.z);
      if (depth < 0.4) continue;
      dynamics.push({
        x: pos.x,
        z: pos.z,
        depth,
        draw: () => this.drawProjectile(ctx, p),
        hit: (px, py) => {
          const s = project(view, pos.x, pos.y, pos.z);
          const r = Math.max(PROJECTILE_MIN_HIT_PX, PROJECTILE_RADIUS_M * scaleAt(view, depth) * 1.3);
          if (Math.hypot(px - s.x, py - s.y) > r) return null;
          return { hit: () => this.destroyProjectile(p), ground: { x: pos.x, z: pos.z } };
        },
      });
    }
    for (const g of this.grenades) {
      const pos = this.grenadePos(g);
      const depth = depthOf(view, pos.x, pos.z);
      if (depth > 0.4) dynamics.push({ x: pos.x, z: pos.z, depth, draw: () => this.drawGrenade(ctx, g) });
    }
    for (const e of this.explosions) {
      const depth = depthOf(view, e.x, e.z);
      if (depth > 0.4) dynamics.push({ x: e.x, z: e.z, depth: depth - 1, draw: () => this.drawExplosion(ctx, e) });
    }
    const exit = this.scene.exit;
    if (exit && this.phase === "playing" && this.stagePhase === "exit") {
      const depth = depthOf(view, exit.x, exit.z);
      if (depth > 0.5) dynamics.push({ x: exit.x, z: exit.z, depth, draw: () => this.drawExit(ctx, exit.x, exit.z) });
    }

    // それぞれのゾンビなどを、隠している建物のうち一番先に描くものの前に差しこむ
    const groups: DrawItem[][] = Array.from({ length: occ.length + 1 }, () => []);
    for (const item of dynamics) {
      let index = occ.length;
      for (let i = 0; i < occ.length; i++) {
        const o = occ[i];
        if (o === item.ignore) continue;
        if (segmentHitsBox(this.px, this.pz, item.x, item.z, o.aabb)) {
          index = i;
          break;
        }
      }
      groups[index].push(item);
    }

    const order: DrawItem[] = [];
    for (let i = 0; i <= occ.length; i++) {
      groups[i].sort((a, b) => b.depth - a.depth);
      order.push(...groups[i]);
      if (i < occ.length) order.push(this.occluderItem(ctx, occ[i]));
    }
    for (const item of order) item.draw();
    this.drawOrder = order;
    for (const r of this.rockets) this.drawRocket(ctx, r);
  }

  // 建物・置いてあるものを描き、撃った弾をさえぎる
  private occluderItem(ctx: CanvasRenderingContext2D, o: Occluder): DrawItem {
    const view = this.view;
    const cx = (o.aabb.x0 + o.aabb.x1) / 2;
    const cz = (o.aabb.z0 + o.aabb.z1) / 2;
    const polys = () => (o.box ? boxPolygons(view, o.box) : o.prop ? propPolygons(view, o.prop) : []);
    return {
      x: cx,
      z: cz,
      depth: depthOf(view, cx, cz),
      draw: () => {
        if (o.box) drawBoxModel(ctx, view, this.model, o.box);
        else if (o.prop) drawProp(ctx, view, o.prop, this.stageIndex);
      },
      hit: (px, py) => {
        if (!polys().some((poly) => poly.length >= 3 && pointInPolygon(px, py, poly))) return null;
        const g = screenToGround(view, px, py);
        return {
          hit: () => {
            this.spawnBurst(px, py, ["#fff3b0", "#d0d0d0"], 6, 0.5);
            this.sound.playSfx("clank");
          },
          // 建物に当たったロケットは、建物の手前で爆発する
          ground: g && inAABB(g.x, g.z, o.aabb) ? { x: this.px + (g.x - this.px) * 0.9, z: this.pz + (g.z - this.pz) * 0.9 } : (g ?? { x: cx, z: cz }),
        };
      },
    };
  }

  private hitZombie(z: Zombie, px: number, py: number): Target | null {
    if (z.state === "dying" || z.state === "wander") return null;
    const mask = z.sprite.mask;
    if (!mask) return null;
    const clip = this.zombieClip(z);
    if (clip && !pointInPolygon(px, py, clip)) return null;
    const part = hitTestSprite(this.zombieRect(z), mask, z.sprite.head, px, py);
    if (!part) return null;
    return { hit: (body, head) => this.shotZombie(z, part, part === "head" ? head : body, px, py), ground: { x: z.x, z: z.z } };
  }

  private drawZombie(ctx: CanvasRenderingContext2D, z: Zombie, depth: number): void {
    const sprite = z.sprite;
    if (!sprite.zombie) return;
    const rect = this.zombieRect(z);
    if (rect.left > this.view.w || rect.left + rect.w < 0) return;
    const footX = rect.left + rect.w / 2;
    const footY = rect.top + rect.h;
    const fog = 1 - fogAmount(depth, this.stageIndex) * 0.9;
    const appear = z.state === "emerge" ? Math.min(1, z.stateMs / EMERGE_MS) : Math.min(1, z.ageMs / 500);

    ctx.save();
    ctx.globalAlpha = fog * appear;
    const clip = this.zombieClip(z);
    if (clip) {
      ctx.beginPath();
      clip.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.clip();
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(footX, footY, rect.w * 0.4, rect.w * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(footX, footY);
    const freq = z.kind === "runner" ? 0.008 : 0.0035;
    let angle = isMoving(z) ? Math.sin(this.time * freq + z.walkPhase) * 0.07 : 0;
    let scaleY = 1;
    if (z.state === "dying") {
      const t = Math.min(1, z.stateMs / DYING_MS);
      scaleY = Math.cos((t * Math.PI) / 2);
      angle += t * 0.3 * (z.walkPhase > Math.PI ? 1 : -1);
      ctx.globalAlpha *= 1 - Math.max(0, t - 0.4) / 0.6;
    }
    if (z.state === "windup") angle = Math.sin(z.stateMs * 0.05) * 0.05;
    ctx.rotate(angle);
    ctx.scale(1, scaleY);

    const left = rect.left - footX;
    const top = rect.top - footY;
    if (z.kind === "boss") {
      const pulse = 0.5 + Math.sin(this.time * 0.006) * 0.2;
      const g = ctx.createRadialGradient(0, top + rect.h * 0.5, rect.h * 0.1, 0, top + rect.h * 0.5, rect.h * 0.75);
      g.addColorStop(0, `rgba(140,255,90,${0.35 * pulse})`);
      g.addColorStop(1, "rgba(140,255,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-rect.h, top - rect.h * 0.3, rect.h * 2, rect.h * 1.6);
    }
    if (sprite.outline) {
      const pad = (SPRITE_OUTLINE_PX * rect.h) / sprite.img.naturalHeight;
      ctx.drawImage(sprite.outline, left - pad, top - pad, rect.w + pad * 2, rect.h + pad * 2);
    }
    ctx.drawImage(sprite.zombie, left, top, rect.w, rect.h);
    if (z.flashMs > 0 && sprite.silhouette) {
      ctx.globalAlpha *= 0.8;
      ctx.drawImage(sprite.silhouette, left, top, rect.w, rect.h);
    } else if (z.state === "windup" && sprite.danger) {
      ctx.globalAlpha *= 0.15 + 0.25 * (Math.sin(z.stateMs * 0.03) * 0.5 + 0.5);
      ctx.drawImage(sprite.danger, left, top, rect.w, rect.h);
    }
    ctx.restore();

    if (z.state === "windup") {
      ctx.save();
      ctx.font = `800 ${Math.round(Math.max(22, rect.h * 0.08))}px "Baloo 2", sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#3a0010";
      ctx.fillStyle = "#ff4d6d";
      const y = Math.max(40, rect.top - 6);
      ctx.strokeText("!!", footX, y);
      ctx.fillText("!!", footX, y);
      ctx.restore();
    }
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
    const view = this.view;
    const pos = this.projectilePos(p);
    const depth = depthOf(view, pos.x, pos.z);
    const s = project(view, pos.x, pos.y, pos.z);
    const r = PROJECTILE_RADIUS_M * scaleAt(view, depth);
    // 落ちてくる場所の目印(赤い輪)。近づくほど濃くなる
    const t = p.ms / PROJECTILE_FLIGHT_MS;
    if (depthOf(view, p.toX, p.toZ) > 0.5) {
      const ring = Array.from({ length: 16 }, (_, i) => [p.toX + Math.cos((i / 16) * Math.PI * 2) * PROJECTILE_HIT_RADIUS_M, 0.02, p.toZ + Math.sin((i / 16) * Math.PI * 2) * PROJECTILE_HIT_RADIUS_M] as [number, number, number]);
      const pts = projectPolygon(view, ring);
      if (pts.length >= 3) {
        ctx.strokeStyle = `rgba(255,70,90,${0.25 + t * 0.6})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        pts.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(p.spin);
    ctx.fillStyle = "#6b5640";
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7;
      const rr = r * (0.8 + ((i * 37) % 5) * 0.06);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPickup(ctx: CanvasRenderingContext2D, p: Pickup): void {
    const left = PICKUP_LIFETIME_MS - p.ageMs;
    if (left < PICKUP_BLINK_MS && Math.floor(p.ageMs / 120) % 2 === 0) return;
    if (p.item === "heart") {
      this.drawHeartPickup(ctx, p);
      return;
    }
    const def = WEAPONS[p.item];
    const r = this.pickupRect(p);
    const cx = r.left + r.w / 2;
    const groundY = project(this.view, p.x, 0, p.z).y;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.008);
    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.35;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = Math.max(2, r.w * 0.06);
    ctx.beginPath();
    ctx.ellipse(cx, groundY, r.w * (0.8 + pulse * 0.2), r.w * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#8a5a2b";
    ctx.fillRect(r.left, r.top, r.w, r.h);
    ctx.fillStyle = "#6b4420";
    ctx.fillRect(r.left, r.top, r.w, r.h * 0.12);
    ctx.fillStyle = def.color;
    ctx.fillRect(r.left, r.top + r.h * 0.38, r.w, r.h * 0.26);
    ctx.strokeStyle = "#3b2410";
    ctx.lineWidth = Math.max(1, r.w * 0.04);
    ctx.strokeRect(r.left, r.top, r.w, r.h);
    const size = Math.round(Math.max(11, Math.min(16, r.w * 0.28)));
    ctx.font = `800 ${size}px "Baloo 2", "M PLUS Rounded 1c", sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1b1450";
    const y = r.top - 6 - pulse * 3;
    ctx.strokeText(def.name, cx, y);
    ctx.fillStyle = def.color;
    ctx.fillText(def.name, cx, y);
  }

  // 落ちているハート: 地面の少し上にふわふわ浮いて、足もとにピンクの輪
  private drawHeartPickup(ctx: CanvasRenderingContext2D, p: Pickup): void {
    const r = this.pickupRect(p);
    const cx = r.left + r.w / 2;
    const groundY = project(this.view, p.x, 0, p.z).y;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.008);
    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.35;
    ctx.strokeStyle = "#ff6f91";
    ctx.lineWidth = Math.max(2, r.w * 0.06);
    ctx.beginPath();
    ctx.ellipse(cx, groundY, r.w * (0.8 + pulse * 0.2), r.w * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // ハートの形(少し大きくなったり小さくなったりする)
    const size = r.w * (0.9 + pulse * 0.12);
    const hx = cx;
    const hy = groundY - r.w * 1.1 - Math.sin(this.time * 0.004 + p.x) * r.w * 0.12;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(size / 100, size / 100);
    ctx.beginPath();
    ctx.moveTo(0, 35);
    ctx.bezierCurveTo(-60, -5, -45, -60, 0, -30);
    ctx.bezierCurveTo(45, -60, 60, -5, 0, 35);
    ctx.closePath();
    ctx.fillStyle = "#ff4d79";
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#fff0f5";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(-18, -22, 9, 6, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 出口の目印: 地面の光る輪と、上で上下する矢印
  private drawExit(ctx: CanvasRenderingContext2D, x: number, z: number): void {
    const view = this.view;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.006);
    const ring = Array.from({ length: 20 }, (_, i) => [x + Math.cos((i / 20) * Math.PI * 2) * EXIT_RADIUS_M, 0.02, z + Math.sin((i / 20) * Math.PI * 2) * EXIT_RADIUS_M] as [number, number, number]);
    const pts = projectPolygon(view, ring);
    if (pts.length >= 3) {
      ctx.beginPath();
      pts.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = `rgba(120,255,160,${0.15 + pulse * 0.15})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(160,255,190,0.9)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    const depth = depthOf(view, x, z);
    const top = project(view, x, 2.4 + pulse * 0.3, z);
    const s = scaleAt(view, depth);
    const a = Math.max(14, 0.5 * s);
    ctx.fillStyle = "#8dffb0";
    ctx.strokeStyle = "#0f3d22";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(top.x - a, top.y - a);
    ctx.lineTo(top.x + a, top.y - a);
    ctx.lineTo(top.x, top.y + a * 0.2);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.font = `800 ${Math.round(Math.max(14, Math.min(28, 0.45 * s)))}px "M PLUS Rounded 1c", "Baloo 2", sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeText("つぎへ", top.x, top.y - a * 1.4);
    ctx.fillText("つぎへ", top.x, top.y - a * 1.4);
  }

  private drawGrenade(ctx: CanvasRenderingContext2D, g: Grenade): void {
    const view = this.view;
    const pos = this.grenadePos(g);
    const depth = depthOf(view, pos.x, pos.z);
    const s = scaleAt(view, depth);
    const p = project(view, pos.x, pos.y, pos.z);
    const ground = project(view, pos.x, 0, pos.z);
    const r = Math.max(4, 0.09 * s);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(g.spin);
    ctx.fillStyle = "#4f6b2f";
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9aa1ab";
    ctx.fillRect(-r * 0.35, -r * 1.5, r * 0.7, r * 0.45);
    ctx.restore();
  }

  private drawRocket(ctx: CanvasRenderingContext2D, r: Rocket): void {
    const t = Math.min(1, r.ms / ROCKET_FLIGHT_MS);
    const target = depthOf(this.view, r.tx, r.tz) > 0.4 ? project(this.view, r.tx, 0.8, r.tz) : { x: this.view.w / 2, y: this.view.horizonY };
    const x = r.sx + (target.x - r.sx) * t;
    const y = r.sy + (target.y - r.sy) * t;
    const grad = ctx.createLinearGradient(r.sx, r.sy, x, y);
    grad.addColorStop(0, "rgba(220,220,220,0)");
    grad.addColorStop(1, "rgba(230,230,230,0.8)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 8 * (1 - t) + 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(r.sx, r.sy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#ffd36b";
    ctx.beginPath();
    ctx.arc(x, y, 7 * (1 - t) + 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawExplosion(ctx: CanvasRenderingContext2D, e: Explosion): void {
    const t = e.ms / EXPLOSION_MS;
    const depth = depthOf(this.view, e.x, e.z);
    const s = scaleAt(this.view, depth);
    const p = project(this.view, e.x, 0.7, e.z);
    const r = e.radiusM * s * (0.35 + 0.65 * Math.min(1, t * 2.5));
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, "rgba(255,250,210,1)");
    g.addColorStop(0.3, "rgba(255,200,80,0.95)");
    g.addColorStop(0.65, "rgba(255,110,40,0.7)");
    g.addColorStop(1, "rgba(120,60,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawEffects(ctx: CanvasRenderingContext2D): void {
    for (const t of this.tracers) {
      const a = t.life / TRACER_MS;
      ctx.strokeStyle = `rgba(255,235,160,${0.8 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x0 + (t.x1 - t.x0) * 0.85, t.y0 + (t.y1 - t.y0) * 0.85);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, p.life / 300);
      ctx.font = `800 ${p.text.startsWith("+") ? 20 : 24}px "Baloo 2", "M PLUS Rounded 1c", sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#1b1450";
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // 画面の外(うしろや横)にいるゾンビ・飛んでくるがれき・出口を、画面の左右のはしに矢印で知らせる。
  // かみつかれそうなもの・近いものほど大きく赤くする。出口は緑
  private drawOffscreenMarkers(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this.view;
    const markers: { side: -1 | 1; y: number; danger: number; color?: string }[] = [];
    const place = (x: number, z: number, y: number): { side: -1 | 1; y: number } | null => {
      const c = toCamera(this.view, x, z);
      if (c.z > 0.4) {
        const p = project(this.view, x, y, z);
        if (p.x >= 0 && p.x <= w) return null;
        return { side: p.x < 0 ? -1 : 1, y: p.y };
      }
      return { side: c.x < 0 ? -1 : 1, y: h * 0.5 };
    };
    for (const z of this.zombies) {
      if (z.state === "dying" || z.state === "wander") continue;
      const m = place(z.x, z.z, z.heightM * 0.6);
      if (!m) continue;
      const attacking = z.state === "windup" || z.state === "lunge" || z.state === "charge";
      const danger = attacking ? 1 : Math.max(0, Math.min(0.8, 1 - (this.distToPlayer(z.x, z.z) - ATTACK_Z) / 6));
      markers.push({ ...m, danger });
    }
    for (const p of this.projectiles) {
      const m = place(p.toX, p.toZ, 0);
      if (m && Math.hypot(p.toX - this.px, p.toZ - this.pz) <= PROJECTILE_HIT_RADIUS_M * 2) markers.push({ ...m, danger: 1 });
    }
    const exit = this.scene.exit;
    if (exit && this.stagePhase === "exit") {
      const m = place(exit.x, exit.z, 1);
      if (m) markers.push({ ...m, danger: 0.5, color: "rgba(120,255,160,0.95)" });
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.02);
    for (const m of markers) {
      const size = 12 + m.danger * 10 + (m.danger >= 1 ? pulse * 4 : 0);
      const x = m.side < 0 ? 8 : w - 8;
      const y = Math.max(h * 0.18, Math.min(h * 0.75, m.y));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - m.side * size, y - size * 0.8);
      ctx.lineTo(x - m.side * size, y + size * 0.8);
      ctx.closePath();
      ctx.fillStyle = m.color ?? (m.danger >= 1 ? `rgba(255,60,80,${0.75 + pulse * 0.25})` : `rgba(255,${Math.round(230 - m.danger * 170)},${Math.round(200 - m.danger * 130)},0.85)`);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(27,20,80,0.8)";
      ctx.stroke();
      ctx.fill();
    }
  }

  private drawHurt(ctx: CanvasRenderingContext2D): void {
    if (this.hurtMs <= 0) return;
    const { w, h } = this.view;
    const a = this.hurtMs / HURT_FLASH_MS;
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.3, w / 2, h / 2, r);
    g.addColorStop(0, "rgba(200,0,30,0)");
    g.addColorStop(1, `rgba(200,0,30,${0.7 * a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(160,0,20,${0.8 * a})`;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(6, w * 0.018);
    for (let i = 0; i < 3; i++) {
      const x = w * (0.3 + i * 0.13);
      ctx.beginPath();
      ctx.moveTo(x, h * 0.28);
      ctx.lineTo(x + w * 0.16, h * 0.6);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  // ---- 入力 ----

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  // 撃つのは、動かさずに離した時(タップ・クリック)。動かしたらドラッグで向きを変える
  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    const { x, y } = this.toLocal(e);
    this.mouseAim = e.pointerType === "mouse";
    if (this.phase !== "playing") return;
    if (e.button === 2) {
      this.reload();
      return;
    }
    this.touches.set(e.pointerId, { startX: x, startY: y, lastX: x, lastY: y, downAt: this.time, mode: "pending", lastMoveAt: performance.now(), turnVel: 0 });
    // さわったら、回っている勢いは止める
    this.yawVel = 0;
    try {
      this.canvas?.setPointerCapture(e.pointerId);
    } catch {
      // 指の動きを追いかけられなくても、遊ぶのに支障はない
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const { x, y } = this.toLocal(e);
    const t = this.touches.get(e.pointerId);
    if (!t) {
      if (e.pointerType === "mouse") {
        this.aimX = x;
        this.aimY = y;
        this.mouseAim = true;
      }
      return;
    }
    if (t.mode === "pending" && Math.hypot(x - t.startX, y - t.startY) > TAP_MOVE_PX) t.mode = "drag";
    if (t.mode === "drag") {
      // 指を右へ動かすと右を向く(画面の幅に対してなぞった割合で回すので、短いスワイプでも大きく向きが変わる)
      const dyaw = ((x - t.lastX) / this.view.w) * DRAG_TURN_PER_SCREEN;
      this.yaw += dyaw;
      const now = performance.now();
      const dtSec = Math.max(0.008, (now - t.lastMoveAt) / 1000);
      // なぞる速さ(少しなめらかにする)
      t.turnVel = t.turnVel * 0.5 + (dyaw / dtSec) * 0.5;
      t.lastMoveAt = now;
    } else if (t.mode === "fire") {
      this.aimX = x;
      this.aimY = y;
      this.aimVisibleMs = CROSSHAIR_TOUCH_MS;
    }
    t.lastX = x;
    t.lastY = y;
    if (e.pointerType === "mouse") {
      this.aimX = x;
      this.aimY = y;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const t = this.touches.get(e.pointerId);
    this.touches.delete(e.pointerId);
    if (e.pointerId === this.firePointerId) this.firePointerId = null;
    // はらうようになぞって離したら、その勢いで回り続ける(止まってから離した時は回らない)
    if (t?.mode === "drag" && performance.now() - t.lastMoveAt < 80) {
      this.yawVel = Math.max(-MAX_TURN_VELOCITY, Math.min(MAX_TURN_VELOCITY, t.turnVel));
    }
    if (!t || t.mode !== "pending" || this.phase !== "playing" || e.type === "pointercancel") return;
    this.aimX = t.lastX;
    this.aimY = t.lastY;
    this.aimVisibleMs = CROSSHAIR_TOUCH_MS;
    this.fire(t.lastX, t.lastY);
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") this.mouseAim = false;
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "r") this.reload();
    const index = Number(key) - 1;
    if (index >= 0 && index < WEAPON_ORDER.length) this.selectWeapon(WEAPON_ORDER[index]);
    this.keys.add(key);
    if (key.startsWith("Arrow")) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };

  // ほかのウィンドウに移ると keyup が来ないことがあるので、押しっぱなしを解除する
  private onBlur = (): void => {
    this.keys.clear();
    this.touches.clear();
    this.firePointerId = null;
    this.moveInput = { x: 0, y: 0 };
  };

  // ---- Reactへ知らせる ----

  private sendState(): void {
    const boss = this.boss;
    const state: EngineState = {
      phase: this.phase === "gameover" && this.endMs > 0 ? "playing" : this.phase,
      score: this.score,
      lives: this.lives,
      ammo: this.ammo,
      reloading: this.reloadMs > 0,
      weapon: this.weapon,
      weaponAmmo: { ...this.weaponAmmo },
      stage: this.stageIndex + 1,
      areaName: this.scene.name,
      stageBanner: this.banner,
      bossHp: this.phase === "playing" && boss && this.stagePhase === "boss" ? { name: `でかゾンビ${boss.sprite.name}`, percent: Math.max(0, (boss.hp / boss.maxHp) * 100) } : null,
      bossWarning: this.phase === "playing" && this.stagePhase === "warning",
      exitOpen: this.phase === "playing" && this.stagePhase === "exit",
      hintVisible: this.phase === "playing" && this.stageIndex === 0 && this.areaIndex === 0 && this.stagePhase === "wave" && this.hintMs > 0,
      highScore: this.highScore,
      isNewRecord: this.isNewRecord,
      assetsReady: this.loadedCount >= this.sprites.length,
    };
    const key = JSON.stringify(state);
    if (key === this.lastSent) return;
    this.lastSent = key;
    if (this.canvas) this.canvas.style.cursor = state.phase === "playing" ? "none" : "default";
    this.onState(state);
  }
}
