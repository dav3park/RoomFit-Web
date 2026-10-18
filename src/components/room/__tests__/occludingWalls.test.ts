import { describe, expect, it } from "vitest";
import { occludingWallIds, wallOutwardNormals } from "../occludingWalls";
import type { RoomLayout } from "../../../types";

// 중심 원점 L자 방(벽 6개): 왼쪽 아래 1×1이 비어 있다.
const lRoom: Pick<RoomLayout, "width" | "depth" | "walls"> = {
  width: 4,
  depth: 3,
  walls: [
    { id: "top", start: { x: -2, z: -1.5 }, end: { x: 2, z: -1.5 } },
    { id: "right", start: { x: 2, z: -1.5 }, end: { x: 2, z: 1.5 } },
    { id: "bottom", start: { x: 2, z: 1.5 }, end: { x: -1, z: 1.5 } },
    { id: "notch-v", start: { x: -1, z: 1.5 }, end: { x: -1, z: 0.5 } },
    { id: "notch-h", start: { x: -1, z: 0.5 }, end: { x: -2, z: 0.5 } },
    { id: "left", start: { x: -2, z: 0.5 }, end: { x: -2, z: -1.5 } },
  ],
};

function expectNormal(normal: { x: number; z: number }, x: number, z: number) {
  expect(normal.x).toBeCloseTo(x);
  expect(normal.z).toBeCloseTo(z);
}

describe("occluding walls", () => {
  it("points every wall normal out of the floor, including the L notch", () => {
    const normals = Object.fromEntries(wallOutwardNormals(lRoom).map((wall) => [wall.id, wall.outward]));
    expectNormal(normals.top, 0, -1);
    expectNormal(normals.right, 1, 0);
    expectNormal(normals.bottom, 0, 1);
    expectNormal(normals["notch-v"], -1, 0);
    expectNormal(normals["notch-h"], 0, 1);
    expectNormal(normals.left, -1, 0);
  });

  it("fades only the walls between a corner camera and the room, and follows the camera", () => {
    const walls = wallOutwardNormals(lRoom);
    const fromSouthWest = occludingWallIds(walls, { x: -1, z: 1 }, new Set());
    expect([...fromSouthWest].sort()).toEqual(["bottom", "left", "notch-h", "notch-v"]);
    const fromNorthEast = occludingWallIds(walls, { x: 1, z: -1 }, fromSouthWest);
    expect([...fromNorthEast].sort()).toEqual(["right", "top"]);
  });

  it("keeps the previous set at grazing angles so walls don't flicker", () => {
    const walls = wallOutwardNormals(lRoom);
    const faded = occludingWallIds(walls, { x: 0, z: 1 }, new Set());
    expect(faded.has("bottom")).toBe(true);
    // 거의 옆에서 보는 각도: 새로 흐려지진 않지만 이미 흐린 벽은 유지
    const grazing = occludingWallIds(walls, { x: 1, z: 0.1 }, faded);
    expect(grazing.has("bottom")).toBe(true);
    expect(occludingWallIds(walls, { x: 1, z: 0.1 }, new Set()).has("bottom")).toBe(false);
  });

  it("returns the same set instance when nothing changed", () => {
    const walls = wallOutwardNormals(lRoom);
    const faded = occludingWallIds(walls, { x: 0, z: 1 }, new Set());
    expect(occludingWallIds(walls, { x: 0, z: 1 }, faded)).toBe(faded);
  });
});
