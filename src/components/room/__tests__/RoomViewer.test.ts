import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createCustomRoom } from "../../../config/customRoom";
import type { Furniture } from "../../../types";
import { FurnitureMesh } from "../FurnitureMesh";
import { RoomViewer } from "../RoomViewer";
import { interiorViewWallIds } from "../roomViewGeometry";
import { windowInstallationCandidates,resolveFurnitureInstallations } from "../../../geometry/furnitureInstallation";

describe("interiorViewWallIds", () => {
  it("hides the two camera-facing walls when a custom room has no door", () => {
    const result = createCustomRoom({ name: "빈 방", width: "6", depth: "6" });
    if (!result.success) throw new Error("custom room fixture 생성 실패");

    const hidden = interiorViewWallIds(result.room.layout, { x: 8.1, z: 8.1 });

    expect(hidden).toEqual(new Set(["east", "south"]));
    expect(result.room.layout.floor?.size).toEqual({ width: 6, depth: 6 });
    expect(result.room.layout.furniture).toEqual([]);
    expect(result.room.layout.doors).toEqual([]);
    expect(result.room.layout.windows).toEqual([]);
  });

  it("keeps the existing door-based wall selection for sample rooms", () => {
    const result = createCustomRoom({ name: "문이 있는 방", width: "6", depth: "6" });
    if (!result.success) throw new Error("custom room fixture 생성 실패");
    const room = {
      ...result.room.layout,
      source: "SAMPLE",
      doors: [
        {
          id: "door-1",
          label: "현관",
          position: { x: 0, z: 3 },
          dimensions: { width: 0.8, depth: 0.18, height: 2.1 },
          rotationY: 0,
          wallId: "south",
        },
      ],
    };

    expect(interiorViewWallIds(room, { x: 8.1, z: 8.1 })).toEqual(new Set(["south", "west"]));
  });
});

describe("RoomViewer furniture layout placement", () => {
  it("passes resolved support height to FurnitureMesh", () => {
    const room = customRoom();
    const desk = furniture("desk", "desk", { width: 1.4, depth: 0.7, height: 0.72 });
    const monitor = furniture("monitor", "monitor", { width: 0.55, depth: 0.2, height: 0.4 });
    const rendered = RoomViewer({
      room,
      furniture: [desk, monitor],
      selectedFurnitureId: null,
      onSelectFurniture: vi.fn(),
      onMoveFurniture: vi.fn(),
    });

    expect(findFurnitureMesh(rendered, "monitor")?.props.layoutPosition)
      .toEqual([0, desk.dimensions.height + monitor.dimensions.height / 2, 0]);
  });

  it("keeps blind placement ahead of support placement", () => {
    const room = customRoom();
    room.windows = [{
      id: "window-1",
      label: "창문",
      position: { x: 0, z: -room.depth / 2 },
      dimensions: { width: 1.2, depth: 0.12, height: 1.2 },
      rotationY: 0,
      wallId: "north",
    }];
    const desk = {
      ...furniture("desk", "desk", { width: 1.4, depth: 0.7, height: 0.72 }),
      position: { x: 0, z: -room.depth / 2 },
    };
    const source = {
      ...furniture("monitor", "monitor", { width: 0.55, depth: 0.2, height: 0.4 }),
      variantId: "blind-roller",
      position: { x: 0, z: -room.depth / 2 },
    };
    const anchoredMonitor=windowInstallationCandidates(room,source)[0];
    const furnitureItems = [desk, anchoredMonitor];
    const rendered = RoomViewer({
      room,
      furniture: furnitureItems,
      selectedFurnitureId: null,
      onSelectFurniture: vi.fn(),
      onMoveFurniture: vi.fn(),
    });

    expect(findFurnitureMesh(rendered, "monitor")?.props.layoutPosition)
      .toEqual(resolveFurnitureInstallations(room, furnitureItems).get("monitor")?.position);
    expect(resolveFurnitureInstallations(room,furnitureItems).get('monitor')?.valid).toBe(true);
  });
});

interface FurnitureMeshElementProps {
  item?: Furniture;
  layoutPosition?: [number, number, number];
  children?: ReactNode;
}

function findFurnitureMesh(
  node: ReactNode,
  furnitureId: string,
): ReactElement<FurnitureMeshElementProps> | null {
  if (Array.isArray(node)) {
    return node.map((child) => findFurnitureMesh(child, furnitureId)).find(Boolean) ?? null;
  }
  if (!isValidElement<FurnitureMeshElementProps>(node)) return null;
  if (node.type === FurnitureMesh && node.props.item?.id === furnitureId) return node;
  return findFurnitureMesh(node.props.children, furnitureId);
}

function customRoom() {
  const result = createCustomRoom({ name: "배치 테스트 방", width: "6", depth: "6" });
  if (!result.success) throw new Error("custom room fixture 생성 실패");
  return result.room.layout;
}

function furniture(
  id: string,
  sourceType: string,
  dimensions: Furniture["dimensions"],
): Furniture {
  return {
    id,
    name: id,
    category: sourceType === "desk" ? "desk" : "cabinet",
    sourceType,
    dimensions,
    position: { x: 0, z: 0 },
    rotationY: 0,
    color: "#fff",
    material: "wood",
    status: "recommended",
    removable: true,
  };
}
