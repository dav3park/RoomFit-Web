import { resolveFurnitureInstallations,windowFurnitureInsideRoom } from './furnitureInstallation';
import { placementPolicy } from '../config/furniturePlacementPolicy';
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
import { isImmovableFixture } from "../config/fixtureType";

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
  | "INSTALLATION_INVALID"
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
  room: Pick<RoomLayout, "width" | "depth" | "walls"> & Partial<RoomLayout>,
  coordinates: 'geometry'|'render' = 'geometry',
): LiveValidationIssue[] {
  const geometryFurniture=coordinates==='render'?furniture.map(item=>({...item,rotationY:-item.rotationY})):furniture;
  const active = geometryFurniture.filter((item) => item.status !== "deleted");
  const physical = active.filter((item) => !isRug(item));
  const issues: LiveValidationIssue[] = [];
  const renderItems=active.map(item=>({...item,rotationY:-item.rotationY}));
  const installations=resolveFurnitureInstallations({id:'validation',name:'',height:room.height??3,doors:[],windows:[],furniture:[],...room},renderItems);
  for(const item of active){const installed=installations.get(item.id);
    if(item.variantId&&!installed?.valid)issues.push({furnitureId:item.id,type:'INSTALLATION_INVALID',severity:'ERROR',message:installed?.reason??'설치 조건을 확인해 주세요.'});
  }
  const verticalOverlap=(a:Furniture,b:Furniture)=>{
    const first=installations.get(a.id)!,second=installations.get(b.id)!;
    return first.minY<second.maxY-1e-6&&second.minY<first.maxY-1e-6;
  };
  const isSupportedPair=(a:Furniture,b:Furniture)=>installations.get(a.id)?.valid&&installations.get(a.id)?.supportId===b.id
    ||installations.get(b.id)?.valid&&installations.get(b.id)?.supportId===a.id;

  const bodyCorners = new Map(physical.map((item) => [item.id, worldCorners(item.position, footprintOf(item))]));

  for (let i = 0; i < physical.length; i++) {
    for (let j = i + 1; j < physical.length; j++) {
      const a = physical[i];
      const b = physical[j];
      if (!verticalOverlap(a,b)||isSupportedPair(a,b)||isStrictStack(a, b) || isCollisionExempt(a, b)) continue;
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
    const inside = placementPolicy(item).installation==='WINDOW'
      ? windowFurnitureInsideRoom(room,{...item,rotationY:-item.rotationY}) : isFurnitureInsideRoom(
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
    if(['SUPPORT','WALL','WINDOW'].includes(placementPolicy(item).installation))continue;
    const zones = clearanceZonesWorld(item);
    if (zones.length === 0) continue;
    const itemCorners = bodyCorners.get(item.id)!;
    for (const other of physical) {
      if (other.id === item.id) continue;
      if (!verticalOverlap(item,other)||isSupportedPair(item,other)||isStrictStack(item, other) || isCollisionExempt(item, other)) continue;
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

/**
 * Full exemption (backend mirror: `FurnitureSupportPolicy#isCollisionExempt`)
 * for two immovable fixtures, or a desk/desk_chair pair — a chair pushed under a desk usually only
 * partially overlaps it (unlike `isStrictStack`'s center-in-footprint test),
 * so any overlap between the pair, body or zone, is ignored entirely.
 */
function isCollisionExempt(first: Furniture, second: Furniture): boolean {
  // 하부장과 거기 박힌 싱크대·가스레인지처럼 붙박이 설비끼리는 원래 한 덩어리라 겹쳐도 충돌이 아니다.
  if (isImmovableFixture(first) && isImmovableFixture(second)) return true;
  const firstType = normalizeCanonicalFurnitureType(first.sourceType ?? first.category);
  const secondType = normalizeCanonicalFurnitureType(second.sourceType ?? second.category);
  // 의자는 책상·테이블 아래로 밀어 넣어 두는 게 보통이라 일부 겹쳐도 충돌이 아니다(백엔드와 동일).
  const tuckSurfaces: ReadonlySet<string> = new Set(["desk", "multi_table"]);
  return (secondType === "desk_chair" && tuckSurfaces.has(firstType ?? ""))
    || (firstType === "desk_chair" && tuckSurfaces.has(secondType ?? ""));
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
