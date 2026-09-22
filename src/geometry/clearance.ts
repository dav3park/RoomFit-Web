import catalogDocument from "../data/furniture/catalog.json";
import { normalizeCanonicalFurnitureType } from "../config/canonicalFurnitureType";
import { resolveFurnitureLocalFootprint } from "../components/room/furnitureBoundary";
import type { Furniture, Vector2D } from "../types";

/**
 * Client-side mirror of the backend's `FurnitureClearance` (Java) —
 * approximates a gabinet/desk/etc.'s "clearance zone" (door swing, drawer
 * pull, chair pull-out space) as a front rectangle plus two side rectangles,
 * sized from the same `requiredClearance` (front/side) every catalog product
 * already carries. See that class's doc comment for why this is an
 * approximation rather than an authored per-product zone shape.
 */

type ClearanceSide = "front" | "left" | "right";

export interface ClearanceZone {
  side: ClearanceSide;
  corners: Vector2D[];
}

const DEFAULT_CLEARANCE: readonly [number, number] = [0.3, 0.1];
const LEGACY_TYPE_OVERRIDES: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  storage: [0.5, 0.2],
});

const BY_CANONICAL_TYPE: Readonly<Record<string, readonly [number, number]>> = Object.freeze(
  buildByCanonicalType(),
);

function buildByCanonicalType(): Record<string, readonly [number, number]> {
  const byType: Record<string, readonly [number, number]> = {};
  for (const product of catalogDocument.products) {
    if (!(product.furnitureType in byType)) {
      byType[product.furnitureType] = [product.requiredClearance.front, product.requiredClearance.side];
    }
  }
  return byType;
}

// Wardrobes swing a hinged door open rather than needing a fixed clearance
// constant — approximated as half the wardrobe's own width (one door of a
// typical two-door wardrobe), mirroring the backend's FurnitureClearance.
// drawer_chest is excluded: a drawer pulls straight out by its own depth,
// not a swinging door, so the catalog's fixed front value stays better there.
const WARDROBE_TYPE = "wardrobe";

function frontSide(furniture: Furniture): readonly [number, number] {
  const rawType = furniture.sourceType ?? furniture.category;
  const canonical = normalizeCanonicalFurnitureType(rawType);
  if (canonical === WARDROBE_TYPE) {
    const catalogValue = BY_CANONICAL_TYPE[canonical] ?? DEFAULT_CLEARANCE;
    return [furniture.dimensions.width / 2, catalogValue[1]];
  }
  if (canonical && BY_CANONICAL_TYPE[canonical]) {
    return BY_CANONICAL_TYPE[canonical];
  }
  const key = (rawType ?? "").trim().toLowerCase();
  return LEGACY_TYPE_OVERRIDES[key] ?? DEFAULT_CLEARANCE;
}

export interface LocalClearanceRect {
  side: ClearanceSide;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Local (unrotated, furniture-center-origin) clearance rectangles — the same
 * frame the furniture's own footprint and a `<FurnitureMesh>`'s rotated
 * `<group>` already use, so a caller rendering inside that group (see
 * `FootprintDecal`) doesn't need to re-apply rotation itself.
 */
export function localClearanceRects(furniture: Furniture): LocalClearanceRect[] {
  const [front, side] = frontSide(furniture);
  if (front <= 1e-6 && side <= 1e-6) {
    return [];
  }

  const local = resolveFurnitureLocalFootprint(furniture);
  const rects: LocalClearanceRect[] = [];
  if (front > 1e-6) {
    rects.push({ side: "front", minX: local.minX, maxX: local.maxX, minZ: local.maxZ, maxZ: local.maxZ + front });
  }
  if (side > 1e-6) {
    rects.push({ side: "left", minX: local.minX - side, maxX: local.minX, minZ: local.minZ, maxZ: local.maxZ });
    rects.push({ side: "right", minX: local.maxX, maxX: local.maxX + side, minZ: local.minZ, maxZ: local.maxZ });
  }
  return rects;
}

/** World-space (room-center-origin) corner rectangles for this furniture's front/left/right clearance zones. */
export function clearanceZonesWorld(furniture: Furniture): ClearanceZone[] {
  return localClearanceRects(furniture)
    .map((rect) => worldZone(furniture, rect.minX, rect.minZ, rect.maxX, rect.maxZ, rect.side));
}

function worldZone(
  furniture: Furniture,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  side: ClearanceSide,
): ClearanceZone {
  const localXs = [minX, maxX, maxX, minX];
  const localZs = [minZ, minZ, maxZ, maxZ];
  const cosine = Math.cos(furniture.rotationY);
  const sine = Math.sin(furniture.rotationY);
  const corners = localXs.map((localX, index) => {
    const localZ = localZs[index];
    return {
      x: furniture.position.x + (localX * cosine - localZ * sine),
      z: furniture.position.z + (localX * sine + localZ * cosine),
    };
  });
  return { side, corners };
}
