import { normalizeCanonicalFurnitureType } from "../config/canonicalFurnitureType";
import {
  BOUNDARY_EPSILON,
  calculateRotatedFootprint,
  isFurnitureInsideRoom,
  resolveFurnitureLocalFootprint,
} from "../components/room/furnitureBoundary";
import { clearanceZonesWorld } from "./clearance";
import { obbOverlap, worldCorners } from "./obb";
import type { Furniture, RoomLayout } from "../types";

/**
 * Client-side mirror of the backend's per-furniture `ValidationIssue` (Java) —
 * computed instantly from the furniture list alone (no round trip), so the 3D
 * view can show red/orange while a piece is still being dragged. Only the
 * geometric checks that don't need Opening/wall data are covered here
 * (BODY_COLLISION, OUT_OF_BOUNDS, ZONE_INTRUSION); DOOR_CLEARANCE /
 * WINDOW_CLEARANCE / PATH_BLOCKED come from the last server
 * `validationResult.issues` response and are merged in by the caller.
 */

export type LiveIssueType =
  | "BODY_COLLISION"
  | "OUT_OF_BOUNDS"
  | "ZONE_INTRUSION"
  | "DOOR_CLEARANCE"
  | "WINDOW_CLEARANCE"
  | "PATH_BLOCKED";

export type LiveIssueSeverity = "ERROR" | "WARNING";

export interface LiveValidationIssue {
  furnitureId: string;
  otherFurnitureId?: string | null;
  type: LiveIssueType;
  severity: LiveIssueSeverity;
  message: string;
  /** Only set for a client-computed ZONE_INTRUSION issue. */
  zoneSide?: "front" | "left" | "right";
}

const SUPPORT_TYPE_BY_DEPENDENT: Readonly<Record<string, string>> = Object.freeze({
  monitor: "desk",
  tv: "media_console",
});

export function computeLocalValidationIssues(
  furniture: readonly Furniture[],
  room: Pick<RoomLayout, "width" | "depth" | "walls">,
): LiveValidationIssue[] {
  const active = furniture.filter((item) => item.status !== "deleted");
  const physical = active.filter((item) => !isRug(item));
  const issues: LiveValidationIssue[] = [];

  const bodyCorners = new Map(physical.map((item) => [item.id, worldCorners(item.position, footprintOf(item))]));

  for (let i = 0; i < physical.length; i++) {
    for (let j = i + 1; j < physical.length; j++) {
      const a = physical[i];
      const b = physical[j];
      if (isStrictStack(a, b)) continue;
      if (obbOverlap(bodyCorners.get(a.id)!, bodyCorners.get(b.id)!)) {
        issues.push({
          furnitureId: a.id,
          otherFurnitureId: b.id,
          type: "BODY_COLLISION",
          severity: "ERROR",
          message: "가구가 서로 겹칩니다.",
        });
      }
    }
  }

  for (const item of active) {
    const inside = isFurnitureInsideRoom(
      room,
      item.dimensions,
      item.position,
      item.rotationY,
      resolveFurnitureLocalFootprint(item),
    );
    if (!inside) {
      issues.push({
        furnitureId: item.id,
        otherFurnitureId: null,
        type: "OUT_OF_BOUNDS",
        severity: "ERROR",
        message: "가구가 방 범위를 벗어났습니다.",
      });
    }
  }

  for (const item of physical) {
    const zones = clearanceZonesWorld(item);
    if (zones.length === 0) continue;
    const itemCorners = bodyCorners.get(item.id)!;
    for (const other of physical) {
      if (other.id === item.id) continue;
      if (isStrictStack(item, other)) continue;
      const otherCorners = bodyCorners.get(other.id)!;
      if (obbOverlap(itemCorners, otherCorners)) continue; // already a BODY_COLLISION
      const hitZone = zones.find((zone) => obbOverlap(zone.corners, otherCorners));
      if (hitZone) {
        issues.push({
          furnitureId: item.id,
          otherFurnitureId: other.id,
          type: "ZONE_INTRUSION",
          severity: "WARNING",
          message: `가구 작동 공간(${zoneLabel(hitZone.side)})을 다른 가구가 막고 있습니다.`,
          zoneSide: hitZone.side,
        });
      }
    }
  }

  return issues;
}

function footprintOf(item: Furniture) {
  return calculateRotatedFootprint(item.dimensions, item.rotationY, resolveFurnitureLocalFootprint(item));
}

function isRug(item: Furniture): boolean {
  return normalizeCanonicalFurnitureType(item.sourceType ?? item.category) === "rug";
}

/** Mirrors `furnitureSupportPlacement.ts`'s monitor-on-desk / tv-on-console exemption. */
function isStrictStack(first: Furniture, second: Furniture): boolean {
  const pair = resolveSupportPair(first, second) ?? resolveSupportPair(second, first);
  if (!pair) return false;
  const [supporter, dependent] = pair;
  const footprint = footprintOf(supporter);
  const localX = dependent.position.x - supporter.position.x;
  const localZ = dependent.position.z - supporter.position.z;
  return localX >= footprint.minX - BOUNDARY_EPSILON && localX <= footprint.maxX + BOUNDARY_EPSILON
    && localZ >= footprint.minZ - BOUNDARY_EPSILON && localZ <= footprint.maxZ + BOUNDARY_EPSILON;
}

function resolveSupportPair(supporter: Furniture, dependent: Furniture): [Furniture, Furniture] | null {
  const dependentType = normalizeCanonicalFurnitureType(dependent.sourceType);
  const supporterType = dependentType ? SUPPORT_TYPE_BY_DEPENDENT[dependentType] : undefined;
  if (!supporterType) return null;
  return normalizeCanonicalFurnitureType(supporter.sourceType) === supporterType ? [supporter, dependent] : null;
}

function zoneLabel(side: "front" | "left" | "right"): string {
  switch (side) {
    case "front": return "전면";
    case "left": return "좌측";
    case "right": return "우측";
  }
}

/** Worst severity across an item's own issues, for a single decal/badge color. */
export function worstSeverityFor(furnitureId: string, issues: readonly LiveValidationIssue[]): LiveIssueSeverity | null {
  let worst: LiveIssueSeverity | null = null;
  for (const issue of issues) {
    if (issue.furnitureId !== furnitureId) continue;
    if (issue.severity === "ERROR") return "ERROR";
    worst = "WARNING";
  }
  return worst;
}
