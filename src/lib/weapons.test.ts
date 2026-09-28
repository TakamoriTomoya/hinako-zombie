import { describe, expect, it } from "vitest";
import { blastDamage, BLAST_MIN_FALLOFF, pickSpecialWeapon, PICKUP_WEIGHTS, SPECIAL_WEAPONS } from "./weapons";

describe("爆発のダメージ", () => {
  it("まん中はそのまま、ふちは弱く、外は0", () => {
    expect(blastDamage(10, 2, 0)).toBe(10);
    expect(blastDamage(10, 2, 2)).toBeCloseTo(10 * BLAST_MIN_FALLOFF);
    expect(blastDamage(10, 2, 2.01)).toBe(0);
  });

  it("遠いほど弱い", () => {
    expect(blastDamage(10, 2, 1)).toBeLessThan(blastDamage(10, 2, 0.5));
  });
});

describe("箱から出る武器", () => {
  it("重みどおりに全部の武器が出る", () => {
    const total = SPECIAL_WEAPONS.reduce((sum, id) => sum + PICKUP_WEIGHTS[id], 0);
    expect(pickSpecialWeapon(0)).toBe(SPECIAL_WEAPONS[0]);
    expect(pickSpecialWeapon(0.9999)).toBe(SPECIAL_WEAPONS[SPECIAL_WEAPONS.length - 1]);
    expect(pickSpecialWeapon((PICKUP_WEIGHTS.mg + 1) / total)).toBe(SPECIAL_WEAPONS[1]);
  });
});
