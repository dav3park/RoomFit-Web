import { describe, expect, it } from "vitest";
import { applyBackendFurnitureToLayout, toRoomFurnitureReplaceRequest, type BackendFurnitureApiItem } from "../rooms";
import { resolveFurnitureInstallations } from "../../geometry/furnitureInstallation";
import { computeLocalValidationIssues } from "../../geometry/liveValidation";
import type { RoomLayout } from "../../types";

const room: RoomLayout = {
  id: "api-room-9",
  name: "주방",
  width: 3.5,
  depth: 3.5,
  height: 2.4,
  walls: [],
  doors: [],
  windows: [],
  furniture: [],
};

function scanned(overrides: Partial<BackendFurnitureApiItem>): BackendFurnitureApiItem {
  return {
    id: "sink-1",
    type: "sink",
    label: "싱크대",
    width: 1.2,
    depth: 0.6,
    height: 0.9,
    position: { x: 1.0, z: 0.31 },
    rotation: 0,
    status: "EXISTING",
    productId: null,
    variantId: null,
    styleTags: [],
    ...overrides,
  };
}

const kitchen = () => applyBackendFurnitureToLayout(room, [
  scanned({}),
  scanned({ id: "cabinet-1", type: "upper_cabinet", label: "상부장", depth: 0.35, height: 0.7,
    position: { x: 1.0, z: 0.2 }, mount: "WALL", elevation: 1.45 }),
]);

describe("RoomPlan fixtures", () => {
  it("maps fixtures to a locked, non-removable fixture category", () => {
    const [sink, cabinet] = kitchen().furniture;
    expect(sink).toMatchObject({ category: "fixture", sourceType: "sink", removable: false, recommendationLocked: true });
    expect(cabinet).toMatchObject({ category: "fixture", sourceType: "upper_cabinet", mount: "WALL", elevation: 1.45 });
  });

  it("installs a wall cabinet at its scanned elevation so it does not collide with the sink below", () => {
    const layout = kitchen();
    const installed = resolveFurnitureInstallations(layout, layout.furniture).get("cabinet-1")!;
    expect(installed.valid).toBe(true);
    expect(installed.minY).toBeCloseTo(1.45);
    expect(installed.position[1]).toBeCloseTo(1.45 + 0.35);
    const collisions = computeLocalValidationIssues(layout.furniture, layout, "render")
      .filter((issue) => issue.type === "BODY_COLLISION");
    expect(collisions).toEqual([]);
  });

  it("round-trips fixture type and wall mount through the furniture save request", () => {
    const request = toRoomFurnitureReplaceRequest(kitchen());
    expect(request.furniture[0]).toMatchObject({ type: "sink" });
    expect(request.furniture[0]).not.toHaveProperty("mount");
    expect(request.furniture[1]).toMatchObject({ type: "upper_cabinet", mount: "WALL", elevation: 1.45 });
  });
});
