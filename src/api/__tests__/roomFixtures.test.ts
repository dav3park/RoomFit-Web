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

  it("does not flag a sink set into the base cabinet as a collision", () => {
    // 개수대가 조리대 안으로 파여 있어 싱크대 밑면(0.64)이 하부장 윗면(0.86)보다 낮다.
    const layout = applyBackendFurnitureToLayout(room, [
      scanned({ id: "base-1", type: "base_cabinet", label: "하부장", width: 1.4, depth: 0.65, height: 0.86,
        position: { x: 1.0, z: 0.34 } }),
      scanned({ id: "sink-2", type: "sink", width: 0.5, depth: 0.4, height: 0.22,
        position: { x: 1.3, z: 0.34 }, mount: "WALL", elevation: 0.64 }),
      scanned({ id: "stove-1", type: "stove", label: "가스레인지", width: 0.7, depth: 0.5, height: 0.05,
        position: { x: 0.6, z: 0.34 }, mount: "WALL", elevation: 0.86 }),
    ]);
    const issues = computeLocalValidationIssues(layout.furniture, layout, "render")
      .filter((issue) => issue.type === "BODY_COLLISION" || issue.type === "ZONE_INTRUSION");
    expect(issues).toEqual([]);
  });

  it("treats the refrigerator as a movable, removable appliance that still collides", () => {
    const layout = applyBackendFurnitureToLayout(room, [
      scanned({ id: "base-1", type: "base_cabinet", label: "하부장", width: 1.4, depth: 0.65, height: 0.86,
        position: { x: 1.0, z: 0.34 } }),
      scanned({ id: "fridge-1", type: "refrigerator", label: "냉장고", width: 0.6, depth: 0.6, height: 1.1,
        position: { x: 1.5, z: 0.34 } }),
    ]);
    const fridge = layout.furniture.find((item) => item.id === "fridge-1")!;
    expect(fridge).toMatchObject({ category: "fixture", removable: true, recommendationLocked: true });
    const collisions = computeLocalValidationIssues(layout.furniture, layout, "render")
      .filter((issue) => issue.type === "BODY_COLLISION");
    expect(collisions).toHaveLength(1);
  });

  it("does not flag a chair tucked under a table", () => {
    const layout = applyBackendFurnitureToLayout(room, [
      scanned({ id: "table-1", type: "multi_table", label: "테이블", width: 0.8, depth: 0.8, height: 0.45,
        position: { x: 2.0, z: 2.0 } }),
      scanned({ id: "chair-1", type: "desk_chair", label: "의자", width: 0.45, depth: 0.5, height: 0.75,
        position: { x: 2.0, z: 2.4 } }),
    ]);
    const collisions = computeLocalValidationIssues(layout.furniture, layout, "render")
      .filter((issue) => issue.type === "BODY_COLLISION" || issue.type === "ZONE_INTRUSION");
    expect(collisions).toEqual([]);
  });
});
