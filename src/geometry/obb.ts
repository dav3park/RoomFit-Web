import type { Vector2D } from "../types";
import type { FurnitureFootprint } from "../components/room/furnitureBoundary";

/**
 * Separating Axis Theorem overlap test for two convex quadrilaterals given as
 * world-space corners (in cyclic order — exactly what
 * `calculateRotatedFootprint(...).corners` and a clearance zone's corners
 * already are). Correct for any rotation, unlike an axis-aligned bounding-box
 * check. Mirrors the backend's `ValidationService#obbOverlap` (Java) —
 * both must treat a shared edge (touching, not overlapping) as non-colliding,
 * which is why this uses `<=` rather than `<` when comparing projected ranges.
 */
export function obbOverlap(a: readonly Vector2D[], b: readonly Vector2D[]): boolean {
  return !separatedByEdgeNormals(a, b) && !separatedByEdgeNormals(b, a);
}

const EPSILON = 1e-9;

function separatedByEdgeNormals(edgesOf: readonly Vector2D[], other: readonly Vector2D[]): boolean {
  const n = edgesOf.length;
  for (let i = 0; i < n; i++) {
    const p1 = edgesOf[i];
    const p2 = edgesOf[(i + 1) % n];
    const edgeX = p2.x - p1.x;
    const edgeZ = p2.z - p1.z;
    const axisX = -edgeZ;
    const axisZ = edgeX;
    if (Math.abs(axisX) < EPSILON && Math.abs(axisZ) < EPSILON) {
      continue;
    }
    const [selfMin, selfMax] = project(edgesOf, axisX, axisZ);
    const [otherMin, otherMax] = project(other, axisX, axisZ);
    if (selfMax <= otherMin + EPSILON || otherMax <= selfMin + EPSILON) {
      return true;
    }
  }
  return false;
}

function project(corners: readonly Vector2D[], axisX: number, axisZ: number): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    const dot = corner.x * axisX + corner.z * axisZ;
    min = Math.min(min, dot);
    max = Math.max(max, dot);
  }
  return [min, max];
}

/** World-space corners of a footprint centered at `position`. */
export function worldCorners(position: Vector2D, footprint: Pick<FurnitureFootprint, "corners">): Vector2D[] {
  return footprint.corners.map((corner) => ({ x: position.x + corner.x, z: position.z + corner.z }));
}
