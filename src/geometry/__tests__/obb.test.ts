import { describe, expect, it } from "vitest";

import { obbOverlap } from "../obb";

function rect(cx: number, cz: number, width: number, depth: number, rotationY: number) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const local = [
    { x: -halfW, z: -halfD },
    { x: halfW, z: -halfD },
    { x: halfW, z: halfD },
    { x: -halfW, z: halfD },
  ];
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return local.map(({ x, z }) => ({
    x: cx + (x * cosine - z * sine),
    z: cz + (x * sine + z * cosine),
  }));
}

describe("obbOverlap", () => {
  it("flags two axis-aligned rectangles that overlap", () => {
    const a = rect(0, 0, 1, 1, 0);
    const b = rect(0.5, 0, 1, 1, 0);

    expect(obbOverlap(a, b)).toBe(true);
  });

  it("does not flag two axis-aligned rectangles that merely touch edges", () => {
    const a = rect(0, 0, 1, 1, 0);
    const b = rect(1, 0, 1, 1, 0);

    expect(obbOverlap(a, b)).toBe(false);
  });

  it("does not flag two axis-aligned rectangles that are clearly separated", () => {
    const a = rect(0, 0, 1, 1, 0);
    const b = rect(3, 3, 1, 1, 0);

    expect(obbOverlap(a, b)).toBe(false);
  });

  it("correctly separates two 45deg rotated rectangles whose AABBs overlap but bodies do not", () => {
    const a = rect(1.5, 1.5, 1.0, 0.3, Math.PI / 4);
    const b = rect(2.35, 0.65, 1.0, 0.3, Math.PI / 4);

    expect(obbOverlap(a, b)).toBe(false);
  });

  it("correctly flags two 45deg rotated rectangles that genuinely overlap", () => {
    const a = rect(1.5, 1.5, 1.0, 0.3, Math.PI / 4);
    const b = rect(1.5 + 0.1414, 1.5 + 0.2828, 1.0, 0.3, Math.PI / 4);

    expect(obbOverlap(a, b)).toBe(true);
  });
});
