import { getFurnitureBehaviorPolicy } from "../../config/furnitureBehaviorPolicy";
import type { Furniture, Opening, RoomLayout } from "../../types";
import { windowCenterY } from "./openingLayout";

export interface WindowBlindPlacement {
  opening: Opening;
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
}

export function isWindowAnchoredFurniture(item: Furniture): boolean {
  return getFurnitureBehaviorPolicy(item.variantId)?.anchorMode === "WINDOW";
}

// The placement deliberately does not add a `windowId` to the API contract.
// Existing layouts are deterministic: each blind takes its nearest unused
// opening, with opening id as the stable tie-breaker.
export function resolveWindowBlindPlacements(
  room: Pick<RoomLayout, "windows" | "height">,
  furniture: readonly Furniture[],
): ReadonlyMap<string, WindowBlindPlacement> {
  const available = [...room.windows].sort((left, right) => left.id.localeCompare(right.id));
  const placements = new Map<string, WindowBlindPlacement>();
  const wallHeight = room.height ?? 2.4;

  for (const item of furniture) {
    if (!isWindowAnchoredFurniture(item) || available.length === 0) continue;
    const openingIndex = nearestOpeningIndex(item, available);
    const [opening] = available.splice(openingIndex, 1);
    const targetHeight = opening.dimensions.height;
    const scaleX = opening.dimensions.width / item.dimensions.width;
    const scaleY = targetHeight / item.dimensions.height;
    const bottom = windowCenterY(targetHeight, wallHeight, opening.sillHeight) - targetHeight / 2;

    placements.set(item.id, {
      opening,
      // FurnitureVariantRenderer offsets a floor-origin JSON model by half
      // its source height. Compensate with the scaled source half-height so
      // the blind bottom/top exactly follow the opening after scaling.
      position: [
        opening.position.x,
        bottom + item.dimensions.height * scaleY / 2,
        opening.position.z,
      ],
      rotationY: opening.rotationY,
      scale: [scaleX, scaleY, 1],
    });
  }

  return placements;
}

function nearestOpeningIndex(item: Furniture, openings: readonly Opening[]): number {
  let chosenIndex = 0;
  let chosenDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < openings.length; index += 1) {
    const opening = openings[index];
    const dx = item.position.x - opening.position.x;
    const dz = item.position.z - opening.position.z;
    const distance = dx * dx + dz * dz;
    if (distance < chosenDistance) {
      chosenIndex = index;
      chosenDistance = distance;
    }
  }
  return chosenIndex;
}
