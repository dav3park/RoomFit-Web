import { describe, expect, it } from "vitest";

import { computeLocalValidationIssues } from "../liveValidation";
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

describe("computeLocalValidationIssues", () => {
  it("flags two overlapping bodies as BODY_COLLISION", () => {
    const bed = furniture({
      id: "bed-1", sourceType: "bed", dimensions: { width: 1.5, depth: 1.5, height: 0.5 },
      position: { x: 1.0, z: 1.0 },
    });
    const sofa = furniture({
      id: "sofa-1", sourceType: "sofa", dimensions: { width: 1.5, depth: 1.5, height: 0.6 },
      position: { x: 1.1, z: 1.1 },
    });

    const issues = computeLocalValidationIssues([bed, sofa], room);

    expect(issues.some((issue) => issue.type === "BODY_COLLISION" && issue.severity === "ERROR")).toBe(true);
  });

  it("flags furniture placed outside the room as OUT_OF_BOUNDS", () => {
    const bed = furniture({
      id: "bed-1", sourceType: "bed", dimensions: { width: 1.5, depth: 1.5, height: 0.5 },
      position: { x: 10, z: 10 },
    });

    const issues = computeLocalValidationIssues([bed], room);

    expect(issues.some((issue) => issue.type === "OUT_OF_BOUNDS" && issue.furnitureId === "bed-1")).toBe(true);
  });

  it("flags a chair sitting in a wardrobe's front clearance zone as a WARNING, not an ERROR", () => {
    const wardrobe = furniture({
      id: "wardrobe-1", sourceType: "wardrobe", dimensions: { width: 1.0, depth: 0.6, height: 2.0 },
      position: { x: 0, z: -1.15 },
    });
    const chair = furniture({
      id: "chair-1", sourceType: "desk_chair", dimensions: { width: 0.45, depth: 0.45, height: 0.8 },
      position: { x: 0, z: -0.6 },
    });

    const issues = computeLocalValidationIssues([wardrobe, chair], room);

    const zoneIssue = issues.find((issue) => issue.type === "ZONE_INTRUSION" && issue.furnitureId === "wardrobe-1");
    expect(zoneIssue).toBeDefined();
    expect(zoneIssue?.severity).toBe("WARNING");
    expect(issues.some((issue) => issue.type === "BODY_COLLISION")).toBe(false);
  });

  it("does not report a zone intrusion once the bodies actually overlap (already a collision)", () => {
    const wardrobe = furniture({
      id: "wardrobe-1", sourceType: "wardrobe", dimensions: { width: 1.0, depth: 0.6, height: 2.0 },
      position: { x: 0, z: 0 },
    });
    const overlapping = furniture({
      id: "bed-1", sourceType: "bed", dimensions: { width: 1.0, depth: 0.6, height: 0.5 },
      position: { x: 0, z: 0 },
    });

    const issues = computeLocalValidationIssues([wardrobe, overlapping], room);

    expect(issues.some((issue) => issue.type === "ZONE_INTRUSION")).toBe(false);
    expect(issues.some((issue) => issue.type === "BODY_COLLISION")).toBe(true);
  });

  it("excludes deleted furniture from every check", () => {
    const bed = furniture({
      id: "bed-1", sourceType: "bed", dimensions: { width: 1.5, depth: 1.5, height: 0.5 },
      position: { x: 1.0, z: 1.0 }, status: "deleted",
    });
    const sofa = furniture({
      id: "sofa-1", sourceType: "sofa", dimensions: { width: 1.5, depth: 1.5, height: 0.6 },
      position: { x: 1.1, z: 1.1 },
    });

    const issues = computeLocalValidationIssues([bed, sofa], room);

    expect(issues).toHaveLength(0);
  });
});
