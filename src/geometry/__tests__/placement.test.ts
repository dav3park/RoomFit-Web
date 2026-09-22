import { describe, expect, it } from "vitest";

import { findFreePlacement } from "../placement";
import { calculateRotatedFootprint } from "../../components/room/furnitureBoundary";
import { obbOverlap, worldCorners } from "../obb";
import type { Furniture } from "../../types";

const room = { width: 4, depth: 4, walls: [] };

function furniture(overrides: Partial<Furniture> & Pick<Furniture, "id" | "sourceType" | "dimensions" | "position">): Furniture {
  return {
    name: overrides.id,
    category: "cabinet",
    rotationY: 0,
    color: "#ffffff",
    material: "wood",
    status: "existing",
    removable: true,
    ...overrides,
  };
}

describe("findFreePlacement", () => {
  it("returns the room center when the room is empty", () => {
    const position = findFreePlacement(room, { width: 1, depth: 0.5, height: 0.5 }, null, []);

    expect(position.x).toBeCloseTo(0, 1);
    expect(position.z).toBeCloseTo(0, 1);
  });

  it("finds a spot that does not overlap an item already sitting at the center", () => {
    const existing = furniture({
      id: "desk-1", sourceType: "desk", dimensions: { width: 1.2, depth: 0.7, height: 0.72 },
      position: { x: 0, z: 0 },
    });
    const newDimensions = { width: 1.0, depth: 0.6, height: 2.0 };

    const position = findFreePlacement(room, newDimensions, null, [existing]);

    const newCorners = worldCorners(position, calculateRotatedFootprint(newDimensions, 0));
    const existingCorners = worldCorners(existing.position, calculateRotatedFootprint(existing.dimensions, 0));
    expect(obbOverlap(newCorners, existingCorners)).toBe(false);
  });

  it("ignores a deleted item when checking for overlap", () => {
    const deleted = furniture({
      id: "desk-1", sourceType: "desk", dimensions: { width: 3.8, depth: 3.8, height: 0.72 },
      position: { x: 0, z: 0 }, status: "deleted",
    });

    const position = findFreePlacement(room, { width: 1, depth: 0.5, height: 0.5 }, null, [deleted]);

    expect(position.x).toBeCloseTo(0, 1);
    expect(position.z).toBeCloseTo(0, 1);
  });

  it("ignores a rug when checking for overlap (a floor overlay, not an obstacle)", () => {
    const rug = furniture({
      id: "rug-1", sourceType: "rug", dimensions: { width: 3.8, depth: 3.8, height: 0.02 },
      position: { x: 0, z: 0 },
    });

    const position = findFreePlacement(room, { width: 1, depth: 0.5, height: 0.5 }, null, [rug]);

    expect(position.x).toBeCloseTo(0, 1);
    expect(position.z).toBeCloseTo(0, 1);
  });

  it("falls back to a colliding center placement when the room is entirely full", () => {
    const packed = furniture({
      id: "wardrobe-1", sourceType: "wardrobe", dimensions: { width: 3.9, depth: 3.9, height: 2.0 },
      position: { x: 0, z: 0 },
    });
    const newDimensions = { width: 1.0, depth: 0.6, height: 2.0 };

    const position = findFreePlacement(room, newDimensions, null, [packed]);

    // No free spot exists — the fallback must still return a finite,
    // in-room position rather than throwing or returning NaN.
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.z)).toBe(true);
  });
});
