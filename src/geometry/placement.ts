import { normalizeCanonicalFurnitureType } from "../config/canonicalFurnitureType";
import { getProductionFurnitureVisualFootprint } from "../components/furniture/variants/productionFurnitureCatalog";
import {
  calculateRoomUsableBounds,
  calculateRotatedFootprint,
  clampFurniturePositionToRoom,
  nominalLocalFootprint,
  resolveFurnitureLocalFootprint,
  type FurnitureLocalFootprint,
} from "../components/room/furnitureBoundary";
import { obbOverlap, worldCorners } from "./obb";
import type { Furniture, RoomLayout, Size3D, Vector2D } from "../types";

const SEARCH_STEP_COUNT = 24; // ~24x24 grid over the room's usable bounds

/**
 * Finds a position for a new item of `dimensions` (rotation 0) that doesn't
 * overlap any existing non-deleted, non-rug furniture, preferring the spot
 * closest to the room's center among the free ones found. Falls back to the
 * room center (clamped inside the room) — with a collision — only when the
 * room genuinely has no free spot; this is the one case a body collision on
 * a first placement is expected/acceptable.
 */
export function findFreePlacement(
  room: Pick<RoomLayout, "width" | "depth" | "walls">,
  dimensions: Size3D,
  variantId: string | null,
  existingFurniture: readonly Furniture[],
): Vector2D {
  const usable = calculateRoomUsableBounds(room);
  const centerFallback = { x: 0, z: 0 };
  if (!usable) return centerFallback;

  const localFootprint = resolveLocalFootprintFor(dimensions, variantId);
  const candidateFootprint = calculateRotatedFootprint(dimensions, 0, localFootprint);

  const others = existingFurniture
    .filter((item) => item.status !== "deleted" && !isRug(item))
    .map((item) => worldCorners(
      item.position,
      calculateRotatedFootprint(item.dimensions, item.rotationY, resolveFurnitureLocalFootprint(item)),
    ));

  const centerX = (usable.minX + usable.maxX) / 2;
  const centerZ = (usable.minZ + usable.maxZ) / 2;
  const stepsX = Math.max(1, SEARCH_STEP_COUNT);
  const stepsZ = Math.max(1, SEARCH_STEP_COUNT);

  let best: Vector2D | null = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let ix = 0; ix <= stepsX; ix++) {
    const x = usable.minX + ((usable.maxX - usable.minX) * ix) / stepsX;
    for (let iz = 0; iz <= stepsZ; iz++) {
      const z = usable.minZ + ((usable.maxZ - usable.minZ) * iz) / stepsZ;
      const clamped = clampFurniturePositionToRoom(room, dimensions, { x, z }, 0, localFootprint);
      if (!clamped) continue;

      const corners = worldCorners(clamped, candidateFootprint);
      if (others.some((otherCorners) => obbOverlap(corners, otherCorners))) continue;

      const distanceSquared = (clamped.x - centerX) ** 2 + (clamped.z - centerZ) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        best = clamped;
      }
    }
  }

  if (best) return best;

  // No free spot anywhere in the room — accept a collision at the center
  // rather than refusing to place the item at all.
  return clampFurniturePositionToRoom(room, dimensions, { x: centerX, z: centerZ }, 0, localFootprint)
    ?? centerFallback;
}

function resolveLocalFootprintFor(dimensions: Size3D, variantId: string | null): FurnitureLocalFootprint {
  if (variantId) {
    const footprint = getProductionFurnitureVisualFootprint(variantId);
    if (footprint) return footprint;
  }
  return nominalLocalFootprint(dimensions);
}

function isRug(item: Furniture): boolean {
  // Mirrors liveValidation.ts's isRug — rugs are a floor overlay and never
  // block a new item from sharing their spot.
  return normalizeCanonicalFurnitureType(item.sourceType ?? item.category) === "rug";
}
