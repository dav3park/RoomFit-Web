import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import FurnitureRenderer from "../../FurnitureRenderer";
import Table from "../../Table";
import type { Furniture } from "../../../../types";
import { FurnitureVariantRenderer } from "../FurnitureVariantRenderer";

function createDesk(overrides: Partial<Furniture> = {}): Furniture {
  return {
    id: "desk-rec-1",
    name: "컴팩트 책상",
    category: "desk",
    productId: "desk-compact-01",
    variantId: "desk-compact",
    styleTags: ["minimal", "classic"],
    dimensions: { width: 1.2, depth: 0.6, height: 0.73 },
    position: { x: 0, z: 0 },
    rotationY: -Math.PI / 2,
    color: "#ffffff",
    geometry: "box",
    material: "wood",
    status: "recommended",
    removable: true,
    ...overrides,
  };
}

describe("FurnitureRenderer variant adapter", () => {
  it("renders a registered variant with only the floor-center Y correction", () => {
    const element = FurnitureRenderer({ item: createDesk() }) as ReactElement<{
      layoutPosition?: [number, number, number];
      layoutRotation?: [number, number, number];
      scale?: unknown;
    }>;

    expect(element.type).toBe(FurnitureVariantRenderer);
    expect(element.props.layoutPosition).toEqual([0, -0.365, 0]);
    expect(element.props.layoutRotation).toBeUndefined();
    expect(element.props.scale).toBeUndefined();
  });

  it("passes the selected color tone to the registered variant renderer", () => {
    const element = FurnitureRenderer({
      item: createDesk(),
      preferredColorTone: "blue",
    }) as ReactElement<{ preferredColorTone?: string }>;

    expect(element.type).toBe(FurnitureVariantRenderer);
    expect(element.props.preferredColorTone).toBe("blue");
  });

  it("passes part-specific palette colors to legacy furniture without changing scan data", () => {
    const element = FurnitureRenderer({
      item: createDesk({ variantId: null }),
      preferredColorTone: "brown",
    }) as ReactElement<{ item: Furniture; colors?: {primary:readonly string[]; wood:readonly string[]} }>;

    expect(element.type).toBe(Table);
    expect(element.props.colors?.primary[0]).not.toBe(element.props.colors?.wood[0]);
    expect(element.props.colors).toBeDefined();
    expect(element.props.item.color).toBe("#ffffff");
    expect(element.props.item.productId).toBe("desk-compact-01");
    expect(element.props.item.variantId).toBeNull();
  });

  it("keeps the legacy renderer for an unknown variantId", () => {
    const element = FurnitureRenderer({ item: createDesk({ variantId: "unknown-renderer-test" }) });

    expect(element.type).toBe(Table);
  });
});
