import { beforeAll } from "vitest";
import { describe, expect, it } from "vitest";

import { createProductionFurnitureCatalog } from "../../furniture/variants/productionFurnitureCatalog";
import type { Furniture } from "../../../types";
import {
  DEFAULT_WALL_THICKNESS_METERS,
  WALL_CLEARANCE_METERS,
  calculateRotatedFootprint,
  calculateRoomUsableBounds,
  clampFurniturePositionToRoom,
  isFurnitureInsideRoom,
  moveFurnitureInsideRoom,
  resolveFurnitureLocalFootprint,
  rotateFurnitureInsideRoom,
} from "../furnitureBoundary";

const room = { width: 4, depth: 3 };
const dimensions = { width: 2, depth: 1, height: 0.7 };

describe("furniture boundary policy", () => {
  it("clamps all four room sides with clearance at rotation 0", () => {
    const leftBottom = clampFurniturePositionToRoom(room, dimensions, { x: -10, z: -10 }, 0);
    const rightTop = clampFurniturePositionToRoom(room, dimensions, { x: 10, z: 10 }, 0);
    const commonFixture = clampFurniturePositionToRoom(room, dimensions, { x: 10, z: -10 }, 0);

    expect(leftBottom?.x).toBeCloseTo(-0.92);
    expect(leftBottom?.z).toBeCloseTo(-0.92);
    expect(rightTop?.x).toBeCloseTo(0.92);
    expect(rightTop?.z).toBeCloseTo(0.92);
    expect(commonFixture?.x).toBeCloseTo(0.92);
    expect(commonFixture?.z).toBeCloseTo(-0.92);
    expect(isFurnitureInsideRoom(room, dimensions, leftBottom!, 0)).toBe(true);
    expect(isFurnitureInsideRoom(room, dimensions, rightTop!, 0)).toBe(true);
  });

  it("swaps the footprint extents for a 90 degree rotation", () => {
    const footprint = calculateRotatedFootprint(dimensions, Math.PI / 2);
    const clamped = clampFurniturePositionToRoom(room, dimensions, { x: 10, z: 10 }, Math.PI / 2);

    expect(footprint.effectiveWidth).toBeCloseTo(1);
    expect(footprint.effectiveDepth).toBeCloseTo(2);
    expect(clamped?.x).toBeCloseTo(1.42);
    expect(clamped?.z).toBeCloseTo(0.42);
  });

  it.each([0, 45, 90, 135, 180, 270])(
    "keeps all four corners inside for rotation %s degrees",
    (degrees) => {
      const rotation = degrees * Math.PI / 180;
      const clamped = clampFurniturePositionToRoom(room, dimensions, { x: 10, z: -10 }, rotation);

      expect(clamped).not.toBeNull();
      expect(isFurnitureInsideRoom(room, dimensions, clamped!, rotation)).toBe(true);
    },
  );

  it("uses the rotated 45 degree bounding footprint", () => {
    const footprint = calculateRotatedFootprint(dimensions, Math.PI / 4);
    const expectedExtent = 3 / Math.sqrt(2);

    expect(footprint.effectiveWidth).toBeCloseTo(expectedExtent);
    expect(footprint.effectiveDepth).toBeCloseTo(expectedExtent);
  });

  it("returns no valid position when the furniture is larger than the room", () => {
    expect(clampFurniturePositionToRoom(
      room,
      { width: 4, depth: 1 },
      { x: 0, z: 0 },
      0,
    )).toBeNull();
  });

  it("requires the shared wall clearance", () => {
    const touchingWall = { x: -room.width / 2 + dimensions.width / 2, z: 0 };
    const safe = {
      x: touchingWall.x + DEFAULT_WALL_THICKNESS_METERS / 2 + WALL_CLEARANCE_METERS,
      z: 0,
    };

    expect(isFurnitureInsideRoom(room, dimensions, touchingWall, 0)).toBe(false);
    expect(isFurnitureInsideRoom(room, dimensions, safe, 0)).toBe(true);
  });

  it("clamps drag updates before they can enter state", () => {
    const source = furniture({ x: 0, z: 0 }, 0);
    const moved = moveFurnitureInsideRoom(room, source, { x: 50, z: 50 });

    expect(moved.position.x).toBeCloseTo(0.92);
    expect(moved.position.z).toBeCloseTo(0.92);
    expect(isFurnitureInsideRoom(room, moved.dimensions, moved.position, moved.rotationY)).toBe(true);
    expect(source.position).toEqual({ x: 0, z: 0 });
  });

  it("revalidates the same safe position at drag end", () => {
    const source = furniture({ x: 0, z: 0 }, 0);
    const first = moveFurnitureInsideRoom(room, source, { x: 50, z: 50 });
    const committed = moveFurnitureInsideRoom(room, first, first.position);

    expect(committed.position).toEqual(first.position);
  });

  it("minimally moves an item inward when rotation changes its footprint", () => {
    const source = furniture({ x: 0, z: 0.98 }, 0);
    const rotated = rotateFurnitureInsideRoom(room, source, Math.PI / 2);

    expect(rotated.rotationY).toBe(Math.PI / 2);
    expect(rotated.position.x).toBeCloseTo(0);
    expect(rotated.position.z).toBeCloseTo(0.42);
    expect(isFurnitureInsideRoom(room, rotated.dimensions, rotated.position, rotated.rotationY)).toBe(true);
  });

  it("keeps the previous item when no rotation placement can fit", () => {
    const oversized = { ...furniture({ x: 0, z: 0 }, 0), dimensions: { width: 4, depth: 3.1, height: 1 } };

    expect(rotateFurnitureInsideRoom(room, oversized, Math.PI / 2)).toBe(oversized);
  });

  it("creates and applies visual footprints for all 93 production variants", () => {
    const catalog = loadedCatalog;

    expect(catalog.variants).toHaveLength(193);
    for (const variant of catalog.variants) {
      const item = furniture({ x: 0, z: 0 }, Math.PI / 4, variant.variantId, variant.dimensions);
      const visualFootprint = resolveFurnitureLocalFootprint(item);
      const position = clampFurniturePositionToRoom(
        { width: 10, depth: 10 },
        variant.dimensions,
        { x: 0, z: 0 },
        Math.PI / 4,
        visualFootprint,
      );
      expect(position, variant.variantId).not.toBeNull();
      expect(isFurnitureInsideRoom(
        { width: 10, depth: 10 },
        variant.dimensions,
        position!,
        Math.PI / 4,
        visualFootprint,
      ), variant.variantId).toBe(true);
    }
  });

  it("keeps a bed variant visual bounds outside all four wall interior faces", () => {
    const catalog = loadedCatalog;
    const variant = catalog.registry.getFurnitureVariant("bed-classic-idanaes");
    const item = furniture({ x: 0, z: 0 }, 0, variant.variantId, variant.dimensions);
    const visual = resolveFurnitureLocalFootprint(item);
    const usable = calculateRoomUsableBounds(room)!;

    for (const proposed of [
      { x: -100, z: 0 },
      { x: 100, z: 0 },
      { x: 0, z: -100 },
      { x: 0, z: 100 },
    ]) {
      const position = clampFurniturePositionToRoom(room, item.dimensions, proposed, 0, visual)!;
      const footprint = calculateRotatedFootprint(item.dimensions, 0, visual);
      expect(position.x + footprint.minX).toBeGreaterThanOrEqual(usable.minX - 1e-9);
      expect(position.x + footprint.maxX).toBeLessThanOrEqual(usable.maxX + 1e-9);
      expect(position.z + footprint.minZ).toBeGreaterThanOrEqual(usable.minZ - 1e-9);
      expect(position.z + footprint.maxZ).toBeLessThanOrEqual(usable.maxZ + 1e-9);
    }
  });

  it.each([0, 45, 90, 135])(
    "preserves an asymmetric local anchor at %s degrees",
    (degrees) => {
      const asymmetric = { minX: -0.8, maxX: 1.2, minZ: -0.4, maxZ: 0.6 };
      const rotation = degrees * Math.PI / 180;
      const position = clampFurniturePositionToRoom(
        room,
        dimensions,
        { x: -100, z: -100 },
        rotation,
        asymmetric,
      );

      expect(position).not.toBeNull();
      expect(isFurnitureInsideRoom(room, dimensions, position!, rotation, asymmetric)).toBe(true);
    },
  );

  it("uses geometry bounds when parts exceed declared dimensions", () => {
    const catalog = loadedCatalog;
    const variant = catalog.registry.getFurnitureVariant("plant-corner");
    const item = furniture({ x: 0, z: 0 }, 0, variant.variantId, variant.dimensions);
    const visual = resolveFurnitureLocalFootprint(item);

    expect(visual.maxX - visual.minX).toBeGreaterThan(variant.dimensions.width);
    expect(visual.maxZ - visual.minZ).toBeGreaterThan(variant.dimensions.depth);
    expect((visual.minX + visual.maxX) / 2).not.toBe(0);
  });

  it("uses each wall's actual inward half-thickness", () => {
    const thickLeftWall = {
      width: 4,
      depth: 3,
      walls: [{
        id: "left",
        start: { x: -1.95, z: -1.5 },
        end: { x: -1.95, z: 1.5 },
        thickness: 0.2,
      }],
    };
    const usable = calculateRoomUsableBounds(thickLeftWall)!;

    expect(usable.minX).toBeCloseTo(-1.95 + 0.1 + WALL_CLEARANCE_METERS);
    expect(usable.maxX).toBeCloseTo(2 - WALL_CLEARANCE_METERS);
  });

  it("falls back explicitly to centered nominal dimensions for an unknown variant", () => {
    const item = furniture({ x: 0, z: 0 }, 0, "not-registered", dimensions);

    expect(resolveFurnitureLocalFootprint(item)).toEqual({
      minX: -1,
      maxX: 1,
      minZ: -0.5,
      maxZ: 0.5,
    });
  });
});

function furniture(
  position: { x: number; z: number },
  rotationY: number,
  variantId?: string,
  itemDimensions = dimensions,
): Furniture {
  return {
    id: "desk-1",
    name: "책상",
    category: "desk",
    variantId,
    dimensions: itemDimensions,
    position,
    rotationY,
    color: "#8a6542",
    material: "wood",
    status: "recommended",
    removable: true,
  };
}

let loadedCatalog: Awaited<ReturnType<typeof createProductionFurnitureCatalog>>;
beforeAll(async()=>{loadedCatalog=await createProductionFurnitureCatalog();});
