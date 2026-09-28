// 武器の設定。ハンドガンがずっと使える基本の武器で、ほかは道に落ちている箱を撃って拾うと、弾がなくなるまで使える。

import { BODY_DAMAGE, HEAD_DAMAGE, SHOT_COOLDOWN_MS } from "./constants";

export type WeaponId = "pistol" | "mg" | "shotgun" | "sniper" | "flame" | "rocket" | "grenade";
export type SpecialWeaponId = Exclude<WeaponId, "pistol">;

export interface WeaponDef {
  name: string;
  color: string; // 箱の帯・ボタンの色
  cooldownMs: number; // 次を撃てるまで
  bodyDamage: number; // 弾が体に当たった時(ロケラン・手榴弾は使わない)
  headDamage: number;
  auto: boolean; // 押しっぱなしで撃ち続ける
  pickupAmmo: number; // 箱1つで増える弾の数
  maxAmmo: number;
  blast?: { radiusM: number; damage: number }; // 爆発する武器
  pellets?: { count: number; spreadPx: number }; // 1発で何個の弾がどれくらい広がって飛ぶか(ショットガン)
  pierce?: number; // 1発で何体までつらぬくか(スナイパー)
  flame?: { rangeM: number; coneRad: number; damagePerShot: number }; // 前方を焼く(かえんほうしゃき)
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { name: "ハンドガン", color: "#cfd6e0", cooldownMs: SHOT_COOLDOWN_MS, bodyDamage: BODY_DAMAGE, headDamage: HEAD_DAMAGE, auto: false, pickupAmmo: 0, maxAmmo: 0 },
  mg: { name: "マシンガン", color: "#ffc93c", cooldownMs: 85, bodyDamage: 1, headDamage: 2, auto: true, pickupAmmo: 60, maxAmmo: 400 },
  shotgun: { name: "ショットガン", color: "#ff9f43", cooldownMs: 550, bodyDamage: 1, headDamage: 2, auto: false, pickupAmmo: 12, maxAmmo: 40, pellets: { count: 7, spreadPx: 55 } },
  sniper: { name: "スナイパー", color: "#7ec8ff", cooldownMs: 900, bodyDamage: 8, headDamage: 20, auto: false, pickupAmmo: 6, maxAmmo: 24, pierce: 3 },
  flame: { name: "かえんほうしゃき", color: "#ff5e3a", cooldownMs: 60, bodyDamage: 0, headDamage: 0, auto: true, pickupAmmo: 100, maxAmmo: 300, flame: { rangeM: 5, coneRad: 0.28, damagePerShot: 0.45 } },
  rocket: { name: "ロケラン", color: "#ff6f91", cooldownMs: 700, bodyDamage: 0, headDamage: 0, auto: false, pickupAmmo: 3, maxAmmo: 20, blast: { radiusM: 2.4, damage: 10 } },
  grenade: { name: "しゅりゅうだん", color: "#9be15d", cooldownMs: 600, bodyDamage: 0, headDamage: 0, auto: false, pickupAmmo: 3, maxAmmo: 20, blast: { radiusM: 3, damage: 7 } },
};

export const WEAPON_ORDER: WeaponId[] = ["pistol", "mg", "shotgun", "sniper", "flame", "rocket", "grenade"];
export const SPECIAL_WEAPONS: SpecialWeaponId[] = ["mg", "shotgun", "sniper", "flame", "rocket", "grenade"];

// 箱からどの武器が出るかの重み
export const PICKUP_WEIGHTS: Record<SpecialWeaponId, number> = { mg: 25, shotgun: 20, sniper: 13, flame: 15, rocket: 12, grenade: 15 };

export function emptyWeaponAmmo(): Record<SpecialWeaponId, number> {
  return { mg: 0, shotgun: 0, sniper: 0, flame: 0, rocket: 0, grenade: 0 };
}

export const MG_SPREAD_PX = 7; // マシンガンは少しばらける
export const SWITCH_MS = 250; // 持ちかえている間は撃てない
export const ROCKET_FLIGHT_MS = 200;
export const GRENADE_FLIGHT_BASE_MS = 450; // 投げた手榴弾が落ちるまで(遠くへ投げるほど長くなる)
export const GRENADE_FLIGHT_PER_M_MS = 25;
export const EXPLOSION_MS = 550;
export const BLAST_MIN_FALLOFF = 0.5; // 爆発のふちでは、まん中のこの割合のダメージ

// ---- 落ちている箱 ----
export const PICKUP_LIFETIME_MS = 10000;
export const PICKUP_BLINK_MS = 2500; // 消える前のこの時間は点滅する
export const PICKUP_SIZE_M = 0.6;
export const PICKUP_MIN_HIT_PX = 44; // 遠くて小さくても、これくらいの大きさなら撃てば拾える
export const PICKUP_MAX_ALIVE = 3;
export const PICKUP_MIN_Z = 3.5; // 近すぎると銃に隠れるので、これより手前には置かない
export const ROAD_PICKUP_INTERVAL_MS = 13000; // ザコ戦中、道にときどき箱が置かれる
export const BOSS_PICKUP_INTERVAL_MS = 9000;
// 倒したゾンビが箱を落とす確率
export const DROP_CHANCE = { walker: 0.1, runner: 0.12, tank: 0.4 } as const;

export function pickSpecialWeapon(rand: number): SpecialWeaponId {
  const total = SPECIAL_WEAPONS.reduce((sum, id) => sum + PICKUP_WEIGHTS[id], 0);
  let r = rand * total;
  for (const id of SPECIAL_WEAPONS) {
    r -= PICKUP_WEIGHTS[id];
    if (r < 0) return id;
  }
  return "mg";
}

// 爆発の中心からの距離に応じたダメージ。ふちに行くほど弱くなり、範囲の外は0
export function blastDamage(damage: number, radiusM: number, distanceM: number): number {
  if (distanceM > radiusM) return 0;
  const t = Math.max(0, distanceM) / radiusM;
  return damage * (1 - (1 - BLAST_MIN_FALLOFF) * t);
}
