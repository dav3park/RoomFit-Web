import { floorContains } from "../../geometry/furnitureInstallation";
import type { RoomLayout, Vector2D, WallSegment } from "../../types";

// 벽이 카메라를 등지고(바깥면이 카메라 쪽) 있으면 방 안을 가린다. 이런 벽만 반투명하게 보여준다 —
// 예전 "내부 보기"는 입구 쪽 벽 2개를 처음 카메라 기준으로 숨겨서, 벽이 여러 개인 방이나
// 카메라를 돌렸을 때 엉뚱한 벽이 가리거나 사라졌다.

/** 페이드 시작/해제 기준(바깥 법선 · 카메라 쪽 방향). 사이 구간은 이전 상태 유지 — 경계에서 깜빡임 방지. */
export const FADE_IN_THRESHOLD = 0.2;
export const FADE_OUT_THRESHOLD = 0.05;

export interface WallFacing {
  id: string;
  outward: Vector2D;
}

/** 각 벽의 바깥쪽(방 밖) 수평 법선. 벽 중간에서 살짝 안쪽 점이 방 바닥 안에 있는지로 방향을 정한다. */
export function wallOutwardNormals(room: Pick<RoomLayout, "width" | "depth" | "walls">): WallFacing[] {
  return room.walls.flatMap((wall: WallSegment) => {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return [];
    const left = { x: -dz / length, z: dx / length };
    const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 };
    const probe = Math.max(0.15, (wall.thickness ?? 0.12) / 2 + 0.05);
    const leftIsInside = floorContains(room, { x: mid.x + left.x * probe, z: mid.z + left.z * probe });
    return [{ id: wall.id, outward: leftIsInside ? { x: -left.x, z: -left.z } : left }];
  });
}

/**
 * 카메라 쪽(= 시선 반대 방향) 수평 벡터 기준으로 가리는 벽 집합을 갱신한다.
 * `toCamera`는 정규화되지 않아도 된다. 바뀐 게 없으면 같은 Set 인스턴스를 돌려준다.
 */
export function occludingWallIds(
  walls: readonly WallFacing[],
  toCamera: Vector2D,
  previous: ReadonlySet<string>,
): ReadonlySet<string> {
  const length = Math.hypot(toCamera.x, toCamera.z);
  if (length < 1e-6) return previous; // 정수리에서 내려다보면 가리는 벽이 없다
  const view = { x: toCamera.x / length, z: toCamera.z / length };
  const next = new Set<string>();
  for (const wall of walls) {
    const facing = wall.outward.x * view.x + wall.outward.z * view.z;
    const threshold = previous.has(wall.id) ? FADE_OUT_THRESHOLD : FADE_IN_THRESHOLD;
    if (facing > threshold) next.add(wall.id);
  }
  return next.size === previous.size && [...next].every((id) => previous.has(id)) ? previous : next;
}
