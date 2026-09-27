// ゲームの本体。町を歩いてくるゾンビひなこを、画面をタップ(クリック)して撃つ。
// Reactには依存しない。画面に出す数字(スコア・ライフ・弾数など)が変わった時だけ onState で知らせる。

import {
  ATTACK_WINDUP_MS,
  ATTACK_Z,
  BITE_KNOCKBACK_M,
  BODY_DAMAGE,
  BOSS_CHARGE_SPEED,
  BOSS_CHARGE_STOP_DAMAGE,
  BOSS_CHARGE_Z,
  BOSS_HEAD_MULTIPLIER,
  BOSS_HEIGHT_M,
  BOSS_SCORE_PER_STAGE,
  BOSS_STAND_Z,
  BOSS_WARNING_MS,
  DYING_MS,
  FOG_START_Z,
  GAMEOVER_DELAY_MS,
  HEAD_DAMAGE,
  HEADSHOT_BONUS,
  HINT_MS,
  HIT_FLASH_MS,
  HIT_STAGGER_BACK_M,
  HIT_STAGGER_MS,
  HURT_FLASH_MS,
  LIFE_CLEAR_BONUS,
  MAX_AMMO,
  MUZZLE_FLASH_MS,
  PLAYER_INVINCIBLE_MS,
  PLAYER_START_LIVES,
  PROJECTILE_FLIGHT_MS,
  PROJECTILE_MIN_HIT_PX,
  PROJECTILE_RADIUS_M,
  PROJECTILE_SCORE,
  RECOIL_MS,
  RELOAD_MS,
  SHAKE_MS,
  SHOT_COOLDOWN_MS,
  SPAWN_X_MAX_M,
  SPAWN_Z_MAX,
  SPAWN_Z_MIN,
  STAGE_BANNER_MS,
  STAGE_CLEAR_MS,
  STAGES,
  ZOMBIE_HEIGHT_M,
  ZOMBIE_KINDS,
  type StageDef,
  type ZombieKind,
} from "./constants";
import { drawCrosshair, drawGun, muzzlePoint } from "./gun";
import { loadHighScore, saveHighScore } from "./highScore";
import { hitTestSprite, laneLimitM, makeView, projectX, projectY, scaleAt, standingRect, type HitPart, type Rect, type View } from "./perspective";
import type { SoundManager } from "./sound";
import { loadSprites, SPRITE_OUTLINE_PX, type Sprite } from "./sprites";
import { drawTown, drawTownOverlay } from "./town";

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
  ammo: number;
  reloading: boolean;
  stage: number; // 1から
  stageBanner: StageBannerText | null;
  bossHp: BossHp | null;
  bossWarning: boolean;
  hintVisible: boolean;
  highScore: number;
  isNewRecord: boolean;
  assetsReady: boolean;
}

export interface StartOptions {
  stageIndex?: number;
  startAtBoss?: boolean;
}

type StagePhase = "banner" | "wave" | "warning" | "boss" | "cleared";
type ZombieState = "walk" | "windup" | "lunge" | "stand" | "charge" | "retreat" | "dying" | "wander";

interface Zombie {
  sprite: Sprite;
  kind: ZombieKind | "boss";
  heightM: number;
  x: number;
  z: number;
  spawnX: number;
  spawnZ: number;
  laneFrac: number; // -1〜1。最後に寄ってくる横の位置(画面の幅に合わせて m に直す)
  hp: number;
  maxHp: number;
  speed: number;
  state: ZombieState;
  stateMs: number;
  ageMs: number; // 出てきてからの時間
  staggerMs: number;
  flashMs: number;
  walkPhase: number; // 歩く動きの位相(ゾンビごとにずらす)
  lastHitHead: boolean;
  // ボスだけが使う
  throwMs: number;
  chargeMs: number;
  chargeDamage: number;
  vx: number; // ホーム画面で横切るだけのゾンビの速さ
}

interface Projectile {
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  ms: number;
  spin: number;
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

const GOO_COLORS = ["#7fbf3a", "#5f9a2a", "#a8d95a", "#4c7a22"];
const POPUP_MS = 800;
const TRACER_MS = 70;
const CROSSHAIR_TOUCH_MS = 900; // タッチで撃った時、照準をしばらく残しておく
const WANDER_MAX = 4; // ホーム画面をうろうろするゾンビの数
const MAX_DPR = 1.5;
const MAX_RENDER_PIXELS = 1_600_000;

export class ZombieEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private bg: HTMLCanvasElement = document.createElement("canvas");
  private bgKey = "";
  private view: View = makeView(390, 844);
  private dpr = 1;
  private raf = 0;
  private lastTime = 0;
  private time = 0;

  private readonly sprites: Sprite[];
  private loadedCount = 0;

  private phase: Phase = "home";
  private stageIndex = 0;
  private stagePhase: StagePhase = "banner";
  private stageMs = 0;
  private spawnMs = 0;
  private minionMs = 0;
  private banner: StageBannerText | null = null;
  private hintMs = 0;
  private endMs = 0; // ゲームオーバー/クリアから結果画面に進むまで
  private bossSprite: Sprite | null = null;

  private score = 0;
  private lives = PLAYER_START_LIVES;
  private ammo = MAX_AMMO;
  private reloadMs = 0; // 0より大きい間リロード中(残り時間)
  private cooldownMs = 0;
  private recoilMs = 0;
  private flashMs = 0;
  private invincibleMs = 0;
  private hurtMs = 0;
  private shakeMs = 0;
  private highScore = loadHighScore();
  private isNewRecord = false;

  private aimX = 0;
  private aimY = 0;
  private aimVisibleMs = 0;
  private mouseAim = false; // マウスで遊んでいる時は照準をずっと出す

  private zombies: Zombie[] = [];
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private tracers: Tracer[] = [];

  private lastSent = "";

  private readonly onState: (state: EngineState) => void;
  private readonly sound: SoundManager;

  constructor(onState: (state: EngineState) => void, sound: SoundManager) {
    this.onState = onState;
    this.sound = sound;
    this.sprites = loadSprites(() => {
      this.loadedCount += 1;
    });
  }

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    // 町の背景で毎回全体を塗りつぶすので、透明にしない(重ね合わせの処理が軽くなる)
    this.ctx = canvas.getContext("2d", { alpha: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);
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
    this.hintMs = HINT_MS;
    this.beginStage(Math.max(0, Math.min(STAGES.length - 1, options.stageIndex ?? 0)), options.startAtBoss ?? false);
  }

  goHome(): void {
    this.phase = "home";
    this.stageIndex = 0;
    this.zombies = [];
    this.projectiles = [];
    this.banner = null;
    this.sound.playBgm("map");
  }

  reload(): void {
    if (this.phase !== "playing" || this.reloadMs > 0 || this.ammo === MAX_AMMO) return;
    this.reloadMs = RELOAD_MS;
    this.sound.playSfx("reload");
  }

  // ---- ステージの流れ ----

  private get stage(): StageDef {
    return STAGES[this.stageIndex];
  }

  private beginStage(index: number, atBoss: boolean): void {
    this.stageIndex = index;
    this.zombies = [];
    this.projectiles = [];
    this.spawnMs = 1200;
    this.minionMs = 0;
    const readySprites = this.readySprites();
    this.bossSprite = readySprites.length ? readySprites[Math.floor(Math.random() * readySprites.length)] : null;
    if (atBoss) {
      this.setStagePhase("warning");
      this.banner = null;
      this.sound.stopMusic();
      this.sound.playSfx("warning");
    } else {
      this.setStagePhase("banner");
      this.banner = { title: `STAGE ${index + 1}`, sub: this.stage.place };
      this.sound.playJingle("intro");
    }
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
        this.spawnMs -= dt;
        const progress = Math.min(1, this.stageMs / stage.waveMs);
        if (this.spawnMs <= 0) {
          this.spawnGroup(stage, stage.maxAlive);
          this.spawnMs = stage.spawnStartMs + (stage.spawnEndMs - stage.spawnStartMs) * progress;
        }
        if (this.stageMs >= stage.waveMs) {
          this.setStagePhase("warning");
          this.sound.stopMusic();
          this.sound.playSfx("warning");
        }
        break;
      }
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
    for (let i = 0; i < count && this.aliveMinions() < maxAlive; i++) {
      this.spawnZombie(this.pickKind(stage));
    }
    if (count > 0) this.sound.playSfx("groan");
  }

  private spawnZombie(kind: ZombieKind): void {
    const sprites = this.readySprites().filter((s) => s !== this.bossSprite);
    if (!sprites.length) return;
    const sprite = sprites[Math.floor(Math.random() * sprites.length)];
    const def = ZOMBIE_KINDS[kind];
    const z = SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN);
    const x = (Math.random() * 2 - 1) * SPAWN_X_MAX_M;
    this.zombies.push(this.makeZombie(sprite, kind, ZOMBIE_HEIGHT_M * sprite.sizeScale * def.size, x, z, def.hp, def.speedMin + Math.random() * (def.speedMax - def.speedMin), "walk"));
  }

  private makeZombie(sprite: Sprite, kind: Zombie["kind"], heightM: number, x: number, z: number, hp: number, speed: number, state: ZombieState): Zombie {
    return {
      sprite,
      kind,
      heightM,
      x,
      z,
      spawnX: x,
      spawnZ: z,
      laneFrac: Math.random() * 2 - 1,
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
      throwMs: 0,
      chargeMs: 0,
      chargeDamage: 0,
      vx: 0,
    };
  }

  private spawnBoss(): void {
    const sprite = this.bossSprite ?? this.readySprites()[0];
    if (!sprite) return;
    const boss = this.makeZombie(sprite, "boss", BOSS_HEIGHT_M * Math.max(0.75, sprite.sizeScale), 0, SPAWN_Z_MAX, this.stage.bossHp, 1.6, "walk");
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
    if (this.reloadMs > 0) {
      this.reloadMs -= dt;
      if (this.reloadMs <= 0) {
        this.reloadMs = 0;
        this.ammo = MAX_AMMO;
      }
    }

    if (this.phase === "home") this.updateWanderers(dt);
    if (this.phase === "playing") {
      this.hintMs = Math.max(0, this.hintMs - (this.stagePhase === "wave" ? dt : 0));
      this.updateStage(dt);
    }
    if (this.phase === "gameover" && this.endMs > 0) this.endMs -= dt;

    for (const z of this.zombies) this.updateZombie(z, dt);
    this.zombies = this.zombies.filter((z) => !(z.state === "dying" && z.stateMs >= DYING_MS) && !(z.state === "wander" && Math.abs(z.x) > 9));
    this.updateProjectiles(dt);
    this.updateEffects(dt);
  }

  private updateWanderers(dt: number): void {
    const count = this.zombies.filter((z) => z.state === "wander").length;
    if (count < WANDER_MAX && Math.random() < dt / 1500) {
      const sprites = this.readySprites();
      if (!sprites.length) return;
      const sprite = sprites[Math.floor(Math.random() * sprites.length)];
      const dir = Math.random() < 0.5 ? -1 : 1;
      const z = 7 + Math.random() * 10;
      const zombie = this.makeZombie(sprite, "walker", ZOMBIE_HEIGHT_M * sprite.sizeScale, -dir * 8, z, 1, 0, "wander");
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
    if (this.phase !== "playing") return; // ゲームオーバー後は止まる
    if (z.staggerMs > 0) {
      z.staggerMs -= dt;
      return;
    }
    if (z.kind === "boss") {
      this.updateBoss(z, dt);
      return;
    }
    switch (z.state) {
      case "walk":
        z.z -= z.speed * sec;
        z.x = this.walkX(z);
        if (z.z <= ATTACK_Z) {
          z.z = ATTACK_Z;
          this.setZombieState(z, "windup");
        }
        break;
      case "windup":
        if (z.stateMs >= ATTACK_WINDUP_MS) this.setZombieState(z, "lunge");
        break;
      case "lunge":
        // 目の前に飛びかかってきて、かじる
        z.z = ATTACK_Z - Math.min(1, z.stateMs / 150) * 0.9;
        if (z.stateMs >= 150) {
          this.hurtPlayer();
          z.z = ATTACK_Z + BITE_KNOCKBACK_M;
          z.spawnZ = Math.max(z.spawnZ, z.z + 0.01);
          this.setZombieState(z, "walk");
        }
        break;
    }
  }

  // 霧の奥から、だんだん画面の中央寄りの決まった位置(laneFrac)へ寄ってくる
  private walkX(z: Zombie): number {
    const laneX = z.laneFrac * laneLimitM(this.view, ATTACK_Z);
    const t = Math.max(0, Math.min(1, (z.z - ATTACK_Z) / (z.spawnZ - ATTACK_Z)));
    return laneX + (z.spawnX - laneX) * t;
  }

  private updateBoss(b: Zombie, dt: number): void {
    const sec = dt / 1000;
    const stage = this.stage;
    const swayX = Math.sin(this.time / 1400) * laneLimitM(this.view, BOSS_STAND_Z) * 0.9;
    switch (b.state) {
      case "walk":
        b.z -= b.speed * sec;
        b.x += (swayX - b.x) * Math.min(1, sec * 2);
        if (b.z <= BOSS_STAND_Z) {
          b.z = BOSS_STAND_Z;
          this.setZombieState(b, "stand");
        }
        break;
      case "stand":
        b.x += (swayX - b.x) * Math.min(1, sec * 2);
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
      case "charge":
        b.z -= BOSS_CHARGE_SPEED * sec;
        b.x += (0 - b.x) * Math.min(1, sec * 3);
        if (b.z <= BOSS_CHARGE_Z) {
          b.z = BOSS_CHARGE_Z;
          this.setZombieState(b, "windup");
        }
        break;
      case "windup":
        if (b.stateMs >= ATTACK_WINDUP_MS * 1.2) this.setZombieState(b, "lunge");
        break;
      case "lunge":
        b.z = BOSS_CHARGE_Z - Math.min(1, b.stateMs / 160) * 1.0;
        if (b.stateMs >= 160) {
          this.hurtPlayer();
          b.z = BOSS_CHARGE_Z + 1;
          this.setZombieState(b, "retreat");
        }
        break;
      case "retreat":
        b.z += 3 * sec;
        b.x += (swayX - b.x) * Math.min(1, sec * 2);
        if (b.z >= BOSS_STAND_Z) {
          b.z = BOSS_STAND_Z;
          this.setZombieState(b, "stand");
        }
        break;
    }
  }

  private setZombieState(z: Zombie, state: ZombieState): void {
    z.state = state;
    z.stateMs = 0;
  }

  private throwProjectile(b: Zombie): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    this.projectiles.push({
      fromX: b.x + side * 0.6,
      fromY: b.heightM * 0.75,
      fromZ: b.z,
      toX: (Math.random() * 2 - 1) * 0.6,
      ms: 0,
      spin: Math.random() * Math.PI,
    });
    this.sound.playSfx("throw");
  }

  private projectilePos(p: Projectile): { x: number; y: number; z: number } {
    const t = Math.min(1, p.ms / PROJECTILE_FLIGHT_MS);
    return {
      x: p.fromX + (p.toX - p.fromX) * t,
      y: p.fromY + (1.2 - p.fromY) * t + Math.sin(Math.PI * t) * 0.6,
      z: p.fromZ + (0.6 - p.fromZ) * t,
    };
  }

  private updateProjectiles(dt: number): void {
    if (this.phase !== "playing") return;
    for (const p of this.projectiles) {
      p.ms += dt;
      p.spin += dt * 0.01;
    }
    const arrived = this.projectiles.filter((p) => p.ms >= PROJECTILE_FLIGHT_MS);
    if (arrived.length) {
      this.projectiles = this.projectiles.filter((p) => p.ms < PROJECTILE_FLIGHT_MS);
      this.hurtPlayer();
    }
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

  private shoot(px: number, py: number): void {
    if (this.cooldownMs > 0) return;
    if (this.reloadMs > 0 || this.ammo <= 0) {
      this.sound.playSfx("empty");
      this.cooldownMs = SHOT_COOLDOWN_MS * 2;
      return;
    }
    this.ammo -= 1;
    this.cooldownMs = SHOT_COOLDOWN_MS;
    this.recoilMs = RECOIL_MS;
    this.flashMs = MUZZLE_FLASH_MS;
    this.sound.playSfx("shot");
    const muzzle = muzzlePoint(this.view, this.gunPose());
    this.tracers.push({ x0: muzzle.x, y0: muzzle.y, x1: px, y1: py, life: TRACER_MS });

    if (!this.hitSomething(px, py)) this.spawnDust(px, py);
    // 弾がなくなったら自動でリロードする
    if (this.ammo === 0) this.reload();
  }

  private hitSomething(px: number, py: number): boolean {
    type Target = { z: number; hit: () => boolean };
    const targets: Target[] = [];
    this.projectiles.forEach((p) => {
      const pos = this.projectilePos(p);
      targets.push({
        z: pos.z,
        hit: () => {
          const sx = projectX(this.view, pos.x, pos.z);
          const sy = projectY(this.view, pos.y, pos.z);
          const r = Math.max(PROJECTILE_MIN_HIT_PX, PROJECTILE_RADIUS_M * scaleAt(this.view, pos.z) * 1.3);
          if (Math.hypot(px - sx, py - sy) > r) return false;
          this.projectiles = this.projectiles.filter((q) => q !== p);
          this.spawnBurst(sx, sy, ["#8a6a4a", "#5a4632", "#b09070"], 14, 1);
          this.addScore(PROJECTILE_SCORE, sx, sy - 20, "#ffe066");
          this.sound.playSfx("shatter");
          return true;
        },
      });
    });
    this.zombies.forEach((z) => {
      if (z.state === "dying" || z.state === "wander") return;
      targets.push({
        z: z.z,
        hit: () => {
          const rect = this.zombieRect(z);
          const mask = z.sprite.mask;
          if (!mask) return false;
          const part = hitTestSprite(rect, mask, z.sprite.head, px, py);
          if (!part) return false;
          this.damageZombie(z, part, px, py);
          return true;
        },
      });
    });
    // 手前のものから順に当たるか調べ、最初に当たったものだけにダメージを与える
    targets.sort((a, b) => a.z - b.z);
    return targets.some((t) => t.hit());
  }

  private damageZombie(z: Zombie, part: HitPart, px: number, py: number): void {
    const isBoss = z.kind === "boss";
    const damage = part === "head" ? HEAD_DAMAGE * (isBoss ? BOSS_HEAD_MULTIPLIER : 1) : BODY_DAMAGE;
    z.hp -= damage;
    z.flashMs = HIT_FLASH_MS;
    z.lastHitHead = part === "head";
    this.spawnBurst(px, py, GOO_COLORS, part === "head" ? 16 : 9, part === "head" ? 1.4 : 1);
    this.sound.playSfx(part === "head" ? "headshot" : "hit");
    if (part === "head") this.popups.push({ x: px, y: py - 28, text: isBoss ? "じゃくてん!" : "HEADSHOT!", color: "#ffe066", life: POPUP_MS });

    if (isBoss) {
      this.addScore(damage * 10, px, py, null);
      if (z.state === "charge" || z.state === "windup") {
        z.chargeDamage += damage;
        if (z.chargeDamage >= BOSS_CHARGE_STOP_DAMAGE) {
          // 突進を止めた: ひるんで下がる
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
    z.z = Math.min(z.spawnZ, z.z + HIT_STAGGER_BACK_M);
    if (z.state === "windup" || z.state === "lunge") this.setZombieState(z, "walk");
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
    }
  }

  private defeatBoss(b: Zombie): void {
    this.killZombie(b, false);
    this.projectiles = [];
    // 残っているザコもいっしょに倒れる(点は入らない)
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
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 120 * power,
        life,
        maxLife: life,
        size: 2 + Math.random() * 4 * power,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 700,
      });
    }
  }

  // 外れた時は、当たったところに土ぼこりを出す
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
    // canvas自身の大きさは描画バッファのサイズに引きずられるので、入れ物の大きさを測る
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
      this.view = makeView(w, h);
      this.dpr = dpr;
    }
    const key = `${w}x${h}@${dpr}:${this.stageIndex}`;
    if (key !== this.bgKey) {
      this.bgKey = key;
      this.bg.width = canvas.width;
      this.bg.height = canvas.height;
      const bctx = this.bg.getContext("2d");
      if (bctx) {
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawTown(bctx, this.view, this.stageIndex);
      }
    }
  }

  private gunPose() {
    return {
      aimX: this.aimX,
      aimY: this.aimY,
      recoil: this.recoilMs / RECOIL_MS,
      reload: this.reloadMs > 0 ? 1 - this.reloadMs / RELOAD_MS : 0,
      flash: this.flashMs > 0,
    };
  }

  // ゾンビを描く四角。歩く時の上下のゆれも入れる(当たり判定も同じ四角で行う)
  private zombieRect(z: Zombie): Rect {
    const rect = standingRect(this.view, z.x, z.z, z.heightM, z.sprite.aspect);
    const moving = z.state === "walk" || z.state === "charge" || z.state === "wander" || z.state === "retreat";
    const freq = z.kind === "runner" ? 0.016 : 0.007;
    const bob = moving ? Math.abs(Math.sin(this.time * freq + z.walkPhase)) * rect.h * 0.03 : 0;
    let dz = 0;
    if (z.state === "windup") dz = Math.sin(z.stateMs * 0.08) * rect.w * 0.03;
    return { left: rect.left + dz, top: rect.top - bob, w: rect.w, h: rect.h };
  }

  private render(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const view = this.view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.shakeMs > 0) {
      // ゆらした時に画面のふちに前のフレームが残らないよう、先に黒で塗る
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, view.w, view.h);
      const k = (this.shakeMs / SHAKE_MS) * 10;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }

    ctx.drawImage(this.bg, 0, 0, view.w, view.h);
    drawTownOverlay(ctx, view, this.stageIndex, this.time);

    // 遠くのものから描く
    type Drawable = { z: number; draw: () => void };
    const drawables: Drawable[] = [
      ...this.zombies.map((z) => ({ z: z.z, draw: () => this.drawZombie(ctx, z) })),
      ...this.projectiles.map((p) => ({ z: this.projectilePos(p).z, draw: () => this.drawProjectile(ctx, p) })),
    ];
    drawables.sort((a, b) => b.z - a.z).forEach((d) => d.draw());

    this.drawEffects(ctx);
    this.drawHurt(ctx);

    if (this.phase === "playing" || this.endMs > 0) {
      drawGun(ctx, view, this.gunPose());
      if (this.mouseAim || this.aimVisibleMs > 0) drawCrosshair(ctx, this.aimX, this.aimY, this.recoilMs / RECOIL_MS);
    } else if (this.phase !== "home") {
      // 結果画面: 少し暗くして文字を読みやすく
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  private drawZombie(ctx: CanvasRenderingContext2D, z: Zombie): void {
    const sprite = z.sprite;
    if (!sprite.zombie) return;
    const rect = this.zombieRect(z);
    const footX = rect.left + rect.w / 2;
    const footY = rect.top + rect.h;
    const fog = z.z > FOG_START_Z ? Math.max(0.15, 1 - ((z.z - FOG_START_Z) / (SPAWN_Z_MAX - FOG_START_Z)) * 0.8) : 1;
    // 出てきた直後は霧の中からふわっと現れる
    const appear = Math.min(1, z.ageMs / 500);

    ctx.save();
    ctx.globalAlpha = fog * appear;
    // 足もとの影
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(footX, footY, rect.w * 0.4, rect.w * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(footX, footY);
    const moving = z.state === "walk" || z.state === "charge" || z.state === "wander" || z.state === "retreat";
    const freq = z.kind === "runner" ? 0.008 : 0.0035;
    let angle = moving ? Math.sin(this.time * freq + z.walkPhase) * 0.07 : 0;
    let scaleY = 1;
    if (z.state === "dying") {
      // うしろへ倒れていきながら消える
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
      // ボスのまわりの、あやしい緑のオーラ
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
      // かみつく前は赤く点滅して知らせる
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
    const pos = this.projectilePos(p);
    const sx = projectX(this.view, pos.x, pos.z);
    const sy = projectY(this.view, pos.y, pos.z);
    const r = PROJECTILE_RADIUS_M * scaleAt(this.view, pos.z);
    // 地面の影(どこに落ちてくるかの目安)
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(sx, projectY(this.view, 0, pos.z), r, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    // がれき(ごつごつした石)
    ctx.save();
    ctx.translate(sx, sy);
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
    // 近づいてきたら赤い輪で知らせる
    const t = p.ms / PROJECTILE_FLIGHT_MS;
    if (t > 0.45) {
      ctx.strokeStyle = `rgba(255,70,90,${(t - 0.45) * 1.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(PROJECTILE_MIN_HIT_PX, r * 1.3), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawEffects(ctx: CanvasRenderingContext2D): void {
    for (const t of this.tracers) {
      const a = t.life / TRACER_MS;
      ctx.strokeStyle = `rgba(255,235,160,${0.8 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // 銃口から当たったところまで、奥へいくほど細く見えるように途中までだけ
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

  // かじられた時: 画面のふちが赤くなり、ひっかき傷が出る
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

  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    const { x, y } = this.toLocal(e);
    this.aimX = x;
    this.aimY = y;
    this.mouseAim = e.pointerType === "mouse";
    this.aimVisibleMs = CROSSHAIR_TOUCH_MS;
    if (this.phase !== "playing") return;
    if (e.button === 2) {
      this.reload();
      return;
    }
    this.shoot(x, y);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") return;
    const { x, y } = this.toLocal(e);
    this.aimX = x;
    this.aimY = y;
    this.mouseAim = true;
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") this.mouseAim = false;
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "r" || e.key === "R") this.reload();
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
      stage: this.stageIndex + 1,
      stageBanner: this.banner,
      bossHp: this.phase === "playing" && boss && this.stagePhase === "boss" ? { name: `でかゾンビ${boss.sprite.name}`, percent: Math.max(0, (boss.hp / boss.maxHp) * 100) } : null,
      bossWarning: this.phase === "playing" && this.stagePhase === "warning",
      hintVisible: this.phase === "playing" && this.stageIndex === 0 && this.stagePhase === "wave" && this.hintMs > 0,
      highScore: this.highScore,
      isNewRecord: this.isNewRecord,
      assetsReady: this.loadedCount >= this.sprites.length,
    };
    const key = JSON.stringify(state);
    if (key === this.lastSent) return;
    this.lastSent = key;
    // 遊んでいる間は、マウスのカーソルの代わりに照準を出す
    if (this.canvas) this.canvas.style.cursor = state.phase === "playing" ? "none" : "default";
    this.onState(state);
  }
}
