import { describe, expect, it } from "vitest";
import { CAMERA_HEIGHT_M } from "./constants";
import { dilateMask, hitTestSprite, laneLimitM, makeView, nearestVisibleZ, projectX, projectY, scaleAt, standingRect, type AlphaMask } from "./perspective";

const view = makeView(400, 800);

describe("遠近の計算", () => {
  it("遠くのものほど小さく、地平線に近づく", () => {
    expect(scaleAt(view, 10)).toBeLessThan(scaleAt(view, 5));
    expect(projectY(view, 0, 100)).toBeLessThan(projectY(view, 0, 5));
    expect(projectY(view, 0, 1e6)).toBeCloseTo(view.horizonY, 1);
  });

  it("目の高さのものは、どの距離でも地平線の高さに見える", () => {
    expect(projectY(view, CAMERA_HEIGHT_M, 3)).toBeCloseTo(view.horizonY);
    expect(projectY(view, CAMERA_HEIGHT_M, 30)).toBeCloseTo(view.horizonY);
  });

  it("道のまん中は画面のまん中", () => {
    expect(projectX(view, 0, 7)).toBe(200);
    expect(projectX(view, 1, 7)).toBeGreaterThan(200);
  });

  it("画面の下端に見える地面までの距離", () => {
    expect(projectY(view, 0, nearestVisibleZ(view))).toBeCloseTo(view.h);
  });

  it("寄ってくる横の範囲は、画面からはみ出さない", () => {
    const z = 2.4;
    const x = laneLimitM(view, z);
    const rect = standingRect(view, x, z, 1.6, 0.6);
    expect(rect.left + rect.w / 2).toBeLessThan(view.w);
  });

  it("足もとは地面の高さ", () => {
    const rect = standingRect(view, 0, 5, 1.6, 0.5);
    expect(rect.top + rect.h).toBeCloseTo(projectY(view, 0, 5));
    expect(rect.w).toBeCloseTo(rect.h * 0.5);
  });
});

describe("当たり判定", () => {
  // 左半分だけ体がある 2x2 の格子
  const mask: AlphaMask = { cols: 2, rows: 2, data: Uint8Array.from([1, 0, 1, 0]) };
  const rect = { left: 0, top: 0, w: 100, h: 100 };
  const head = { cx: 0.25, cy: 0.1, r: 0.08 };

  it("頭の円の中は head", () => {
    expect(hitTestSprite(rect, mask, head, 25, 12)).toBe("head");
  });

  it("体のあるところは body、透明なところは外れ", () => {
    expect(hitTestSprite(rect, mask, head, 20, 70)).toBe("body");
    expect(hitTestSprite(rect, mask, head, 80, 70)).toBeNull();
  });

  it("四角の外は外れ", () => {
    expect(hitTestSprite(rect, mask, head, -1, 50)).toBeNull();
    expect(hitTestSprite(rect, mask, head, 50, 100)).toBeNull();
  });

  it("dilateMaskは1マス広げる", () => {
    const m: AlphaMask = { cols: 3, rows: 1, data: Uint8Array.from([1, 0, 0]) };
    expect(Array.from(dilateMask(m).data)).toEqual([1, 1, 0]);
  });
});
