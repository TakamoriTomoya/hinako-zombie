import { describe, expect, it } from "vitest";
import { CAMERA_HEIGHT_M } from "./constants";
import {
  clipNear,
  depthOf,
  dilateMask,
  fromCamera,
  hitTestSprite,
  makeView,
  nearestVisibleDepth,
  pointInPolygon,
  project,
  projectPolygon,
  screenToGround,
  segmentHitsBox,
  standingRect,
  toCamera,
  type AlphaMask,
} from "./perspective";

const view = makeView(400, 800);

describe("遠近の計算", () => {
  it("遠くのものほど小さく、地平線に近づく", () => {
    expect(project(view, 0, 0, 100).y).toBeLessThan(project(view, 0, 0, 5).y);
    expect(project(view, 0, 0, 1e6).y).toBeCloseTo(view.horizonY, 1);
  });

  it("目の高さのものは、どの距離でも地平線の高さに見える", () => {
    expect(project(view, 0, CAMERA_HEIGHT_M, 3).y).toBeCloseTo(view.horizonY);
    expect(project(view, 2, CAMERA_HEIGHT_M, 30).y).toBeCloseTo(view.horizonY);
  });

  it("前にあるものは画面のまん中、右にあるものは右", () => {
    expect(project(view, 0, 0, 7).x).toBe(200);
    expect(project(view, 1, 0, 7).x).toBeGreaterThan(200);
  });

  it("右を向くと、前にあったものは左に見える", () => {
    const turned = makeView(400, 800, 0, 0, 0.3);
    expect(project(turned, 0, 0, 7).x).toBeLessThan(200);
  });

  it("歩いて近づくと大きく見える", () => {
    const walked = makeView(400, 800, 0, 3);
    expect(depthOf(walked, 0, 7)).toBeCloseTo(4);
    const far = standingRect(view, 0, 7, 1.6, 0.5);
    const near = standingRect(walked, 0, 7, 1.6, 0.5);
    expect(near.h).toBeGreaterThan(far.h);
  });

  it("カメラから見た座標と世界の座標は行き来できる", () => {
    const v = makeView(400, 800, 2, -3, 1.1);
    const c = toCamera(v, 5, 4);
    const back = fromCamera(v, c.x, c.z);
    expect(back.x).toBeCloseTo(5);
    expect(back.z).toBeCloseTo(4);
  });

  it("画面の下端に見える地面までの奥行き", () => {
    expect(project(view, 0, 0, nearestVisibleDepth(view)).y).toBeCloseTo(view.h);
  });

  it("足もとは地面の高さ", () => {
    const rect = standingRect(view, 0, 5, 1.6, 0.5);
    expect(rect.top + rect.h).toBeCloseTo(project(view, 0, 0, 5).y);
    expect(rect.w).toBeCloseTo(rect.h * 0.5);
  });

  it("画面の点から、そこに見えている地面の位置がわかる", () => {
    const v = makeView(400, 800, 1, 2, -0.4);
    const p = project(v, 1.5, 0, 9);
    const g = screenToGround(v, p.x, p.y);
    expect(g?.x).toBeCloseTo(1.5);
    expect(g?.z).toBeCloseTo(9);
    expect(screenToGround(v, 200, v.horizonY - 10)).toBeNull();
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

describe("多角形と線分", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it("多角形の中と外", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
  });

  it("カメラのうしろにはみ出した部分は切り取られる", () => {
    const clipped = clipNear([
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 5 },
      { x: 1, y: 0, z: 5 },
    ]);
    expect(clipped.every((p) => p.z >= 0.3 - 1e-9)).toBe(true);
    expect(clipped.length).toBe(4);
  });

  it("全部うしろにある多角形は描かない", () => {
    expect(
      projectPolygon(view, [
        [0, 0, -5],
        [1, 0, -5],
        [1, 1, -5],
      ]),
    ).toEqual([]);
  });

  it("建物のうしろに隠れているか", () => {
    const building = { x0: -1, x1: 1, z0: 4, z1: 6 };
    expect(segmentHitsBox(0, 0, 0, 10, building)).toBe(true);
    expect(segmentHitsBox(0, 0, 0, 3, building)).toBe(false);
    expect(segmentHitsBox(0, 0, 5, 10, building)).toBe(false);
  });
});
