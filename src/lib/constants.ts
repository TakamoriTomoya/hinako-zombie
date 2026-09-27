// ゲーム全体の設定値。挙動を変えたい時はここだけを触ればよいようにまとめてある。
// 距離・大きさは「m(メートル)」、速さは「m/秒」、時間は「ms」。

// 開発用の道具(スタート画面でステージを選んで始める)を出すか。
// 開発サーバー(npm run dev)では常に出し、公開版でもURLに ?dev を付けると出す
export const DEV_TOOLS = import.meta.env.DEV || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev"));

// ---- カメラ(プレイヤーの目) ----
// 道のまん中に立って、道の先を見ている。遠くのものほど小さく、地平線の近くに見える
export const HORIZON_RATIO = 0.42; // 地平線の高さ(画面の高さに対する割合)
export const FOCAL_RATIO = 0.8; // 1m先のものが「画面の高さ×この値」px/m で見える
export const CAMERA_HEIGHT_M = 1.6; // 目の高さ
export const ROAD_HALF_WIDTH_M = 3.5; // 車道の半分の幅
export const SIDEWALK_WIDTH_M = 2; // 歩道の幅(車道の外側)

// ---- プレイヤー ----
export const PLAYER_START_LIVES = 5;
export const PLAYER_INVINCIBLE_MS = 1200; // かじられた直後の無敵時間
export const HURT_FLASH_MS = 600; // かじられた時に画面が赤くなる時間
export const SHAKE_MS = 350;

// ---- 銃 ----
export const MAX_AMMO = 8;
export const RELOAD_MS = 1000;
export const SHOT_COOLDOWN_MS = 110; // 連打しすぎないよう、次の弾を撃てるまでの最短間隔
export const RECOIL_MS = 130; // 撃った時に銃が跳ね上がって戻るまで
export const MUZZLE_FLASH_MS = 60;
export const BODY_DAMAGE = 1;
export const HEAD_DAMAGE = 3; // 頭に当てると3倍(ふつうのゾンビは一撃)

// ---- ゾンビ ----
export const ZOMBIE_HEIGHT_M = 1.6; // sizeScale=1 のゾンビの高さ
export const SPAWN_Z_MIN = 16; // この距離の範囲で、霧の奥から出てくる
export const SPAWN_Z_MAX = 20;
export const SPAWN_X_MAX_M = 3; // 出てくる横の位置(道のまん中から左右に)
export const ATTACK_Z = 2.4; // ここまで近づくと、かみつこうとする
export const ATTACK_WINDUP_MS = 750; // かみつく前の予備動作(この間に倒せばかじられない)
export const BITE_KNOCKBACK_M = 2.5; // かみついた後、これだけ後ろへ下がる
export const HIT_STAGGER_MS = 220; // 弾が当たってよろける時間(その間は進まない)
export const HIT_STAGGER_BACK_M = 0.35; // よろけて下がる距離
export const HIT_FLASH_MS = 80;
export const DYING_MS = 550; // 倒れて消えるまで
export const FOG_START_Z = 11; // これより遠くは霧で薄く見える
// 近づいた時に画面の外へはみ出さないよう、かみつく距離で画面の中央からこの割合以内に寄ってくる
export const LANE_SCREEN_RATIO = 0.28;

export type ZombieKind = "walker" | "runner" | "tank";

export const ZOMBIE_KINDS: Record<ZombieKind, { hp: number; speedMin: number; speedMax: number; size: number; score: number }> = {
  walker: { hp: 3, speedMin: 1.0, speedMax: 1.35, size: 1, score: 100 },
  runner: { hp: 2, speedMin: 2.6, speedMax: 3.1, size: 1, score: 150 },
  tank: { hp: 9, speedMin: 0.6, speedMax: 0.75, size: 1.35, score: 300 },
};
export const HEADSHOT_BONUS = 100;

// ---- ボス ----
export const BOSS_HEIGHT_M = 3.4;
export const BOSS_STAND_Z = 6.5; // ここまで歩いてきて止まり、ものを投げてくる
export const BOSS_CHARGE_Z = 3.6; // 突進してきて、ここでかみつく
export const BOSS_CHARGE_SPEED = 4.5;
export const BOSS_CHARGE_STOP_DAMAGE = 12; // 突進中にこれだけダメージを与えると、ひるんで止まる
export const BOSS_HEAD_MULTIPLIER = 2; // ボスは頭(弱点)に当てるとHEAD_DAMAGEのさらに2倍
export const PROJECTILE_FLIGHT_MS = 1700; // 投げたものが目の前に届くまで
export const PROJECTILE_RADIUS_M = 0.28;
export const PROJECTILE_MIN_HIT_PX = 22; // 遠くて小さい時でも、これくらいの半径なら撃ち落とせる
export const BOSS_SCORE_PER_STAGE = 5000;
export const PROJECTILE_SCORE = 50;

// ---- ステージ ----
export interface StageDef {
  place: string; // 「STAGE 1」の下に出す場所の名前
  bgm: "venus" | "mars" | "mercury";
  waveMs: number; // ザコ戦の長さ。これが過ぎるとボスが来る
  spawnStartMs: number; // ザコの出てくる間隔(始め)
  spawnEndMs: number; // ザコの出てくる間隔(終わり)。だんだん短くなる
  maxAlive: number; // 同時に出ているザコの上限
  kinds: Partial<Record<ZombieKind, number>>; // 出てくる種類の重み
  groupMax: number; // 一度に何体まで一緒に出てくるか
  bossHp: number;
  bossThrowMs: number; // ボスがものを投げる間隔
  bossChargeMs: number; // ボスが突進してくる間隔
  bossMinionMs: number; // ボス戦中にザコが出てくる間隔
}

export const STAGES: StageDef[] = [
  {
    place: "ゆうぐれの じゅうたくがい",
    bgm: "venus",
    waveMs: 30000,
    spawnStartMs: 2400,
    spawnEndMs: 1300,
    maxAlive: 5,
    kinds: { walker: 1 },
    groupMax: 1,
    bossHp: 60,
    bossThrowMs: 2600,
    bossChargeMs: 12000,
    bossMinionMs: 5000,
  },
  {
    place: "よるの しょうてんがい",
    bgm: "mars",
    waveMs: 35000,
    spawnStartMs: 2000,
    spawnEndMs: 1000,
    maxAlive: 7,
    kinds: { walker: 3, runner: 1 },
    groupMax: 2,
    bossHp: 90,
    bossThrowMs: 2100,
    bossChargeMs: 10000,
    bossMinionMs: 4000,
  },
  {
    place: "まよなかの えきまえ",
    bgm: "mercury",
    waveMs: 40000,
    spawnStartMs: 1700,
    spawnEndMs: 800,
    maxAlive: 9,
    kinds: { walker: 4, runner: 2, tank: 1 },
    groupMax: 3,
    bossHp: 130,
    bossThrowMs: 1700,
    bossChargeMs: 8500,
    bossMinionMs: 3000,
  },
];

// ---- 流れ ----
export const STAGE_BANNER_MS = 2400; // 「STAGE 1」を出している時間
export const BOSS_WARNING_MS = 3000;
export const STAGE_CLEAR_MS = 2800;
export const GAMEOVER_DELAY_MS = 1400;
export const HINT_MS = 5000; // 「タップで うつ」の案内を出している時間
export const LIFE_CLEAR_BONUS = 1000; // クリア時、残りライフ1つにつき

export const HIGH_SCORE_STORAGE_KEY = "hinako-zombie:highScore";
export const SOUND_MUTED_STORAGE_KEY = "hinako-zombie:soundMuted";

export function zombieImageSrc(file: string): string {
  return `/images/${file}`;
}
