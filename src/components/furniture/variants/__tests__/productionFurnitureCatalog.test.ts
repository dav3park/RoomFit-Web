import originalVariantIds from "../../../../data/furniture/originalVariantIds.json";
import { beforeAll } from "vitest";
import { CylinderGeometry, ExtrudeGeometry, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { describe, expect, it } from "vitest";
import {
  computeFurnitureVariantBounds,
  createFurniturePartGeometry,
} from "../geometryFactory";
import { resolveMaterialPreset } from "../materialResolver";
import {
  PRODUCTION_FURNITURE_CATALOG_METADATA,
  PRODUCTION_FURNITURE_VARIANT_IDS,
  createProductionFurnitureCatalog,
  getProductionFurnitureVisualFootprint,
} from "../productionFurnitureCatalog";
import type { ValidatedFurnitureVariant } from "../types";

const BOUNDS_TOLERANCE = 0.001;

describe("production furniture catalog", () => {
  it("validates and registers every generated production variant", () => {
    const catalog = loadedCatalog;
    const variantIds = catalog.variants.map((variant) => variant.variantId);

    expect(variantIds).toEqual(PRODUCTION_FURNITURE_VARIANT_IDS);
    expect(variantIds).toHaveLength(193);
    expect(variantIds).toEqual(expect.arrayContaining(originalVariantIds));
    expect(variantIds).toEqual(expect.arrayContaining(Array.from({length:100},(_,i)=>`expansion-c${String(i+1).padStart(3,'0')}`)));
    expect(PRODUCTION_FURNITURE_CATALOG_METADATA.variantCount).toBe(193);
    expect(PRODUCTION_FURNITURE_CATALOG_METADATA.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(new Set(variantIds).size).toBe(PRODUCTION_FURNITURE_VARIANT_IDS.length);
    for (const variantId of PRODUCTION_FURNITURE_VARIANT_IDS) {
      expect(catalog.registry.getFurnitureVariant(variantId).variantId).toBe(variantId);
    }
  });

  it("keeps part IDs and material references valid for every production variant", () => {
    const { materialPresets, variants } = loadedCatalog;

    for (const variant of variants) {
      const partIds = variant.parts.map((part) => part.id);
      expect(new Set(partIds).size).toBe(partIds.length);

      for (const material of variant.materials) {
        expect(materialPresets).toHaveProperty(material);
      }
      for (const part of variant.parts) {
        expect(variant.materials).toContain(part.material);
        expect(materialPresets).toHaveProperty(part.material);
      }
    }
  });

  it("matches declared dimensions and floor-center bounds", () => {
    const { variants } = loadedCatalog;
    const mismatches: string[] = [];

    for (const variant of variants) {
      const bounds = computeFurnitureVariantBounds(variant);
      const size = bounds.getSize(new Vector3());
      const organicTolerance = Math.max(
        BOUNDS_TOLERANCE,
        ...variant.parts.filter((part) => part.geometry === "leaf").map((part) => part.width),
      );
      const differences = [
        ["width", size.x, variant.dimensions.width, organicTolerance],
        ["height", size.y, variant.dimensions.height, organicTolerance],
        ["depth", size.z, variant.dimensions.depth, organicTolerance],
        ["floor", bounds.min.y, 0, BOUNDS_TOLERANCE],
      ] as const;
      for (const [dimension, actual, expected, tolerance] of differences) {
        if (Math.abs(actual - expected) > tolerance) {
          mismatches.push(`${variant.variantId}.${dimension}: ${actual} != ${expected}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("keeps generated visual footprints identical to rendered part geometry", () => {
    const { variants } = loadedCatalog;

    for (const variant of variants) {
      const bounds = computeFurnitureVariantBounds(variant);
      expect(getProductionFurnitureVisualFootprint(variant.variantId), variant.variantId).toEqual({
        minX: Number(bounds.min.x.toFixed(9)),
        maxX: Number(bounds.max.x.toFixed(9)),
        minZ: Number(bounds.min.z.toFixed(9)),
        maxZ: Number(bounds.max.z.toFixed(9)),
      });
    }
  });

  it("audits variants whose visual geometry exceeds declared X/Z dimensions", () => {
    const { variants } = loadedCatalog;
    const exceeding = variants.flatMap((variant) => {
      const footprint = getProductionFurnitureVisualFootprint(variant.variantId)!;
      const widthExcess = footprint.maxX - footprint.minX - variant.dimensions.width;
      const depthExcess = footprint.maxZ - footprint.minZ - variant.dimensions.depth;
      return widthExcess > 0.000001 || depthExcess > 0.000001
        ? [{ variantId: variant.variantId, widthExcess, depthExcess }]
        : [];
    });

    expect(exceeding.map((item) => item.variantId)).toEqual([
      "plant-corner",
      "plant-floor",
      "plant-midcentury",
      "plant-tabletop",
    ]);
    expect(Math.max(...exceeding.map((item) => item.widthExcess))).toBeCloseTo(0.075899069, 8);
  });

  it("keeps all production purchase URLs on HTTPS", () => {
    const { variants } = loadedCatalog;

    for (const variant of variants) {
      expect(variant.purchaseUrl).not.toBeNull();
      expect(new URL(variant.purchaseUrl as string).protocol).toBe("https:");
    }
  });

  it("creates every production part geometry without throwing", () => {
    const { variants } = loadedCatalog;

    for (const variant of variants) {
      for (const furniturePart of variant.parts) {
        const geometry = createFurniturePartGeometry(furniturePart);
        expect(geometry.attributes.position.count, `${variant.variantId}/${furniturePart.id}`).toBeGreaterThan(0);
        geometry.dispose();
      }
    }
  });

  it("includes representative variants for the supported catalog types", () => {
    expect(PRODUCTION_FURNITURE_VARIANT_IDS).toEqual(expect.arrayContaining([
      "bed-low-platform",
      "desk-compact",
      "chair-basic",
      "drawer-chest-vertical",
      "bookshelf-high",
      "hanger-basic",
      "nightstand-open",
      "side-table-round",
      "sofa-single",
      "rug-round",
      "lamp-floor",
    ]));
  });

  it("preserves front and rear placement semantics for compact and storage desks", () => {
    const { registry } = loadedCatalog;
    const compact = registry.getFurnitureVariant("desk-compact");
    const storage = registry.getFurnitureVariant("desk-storage");

    expect(part(compact, "cable-tray").position[2]).toBeLessThan(0);
    for (const partId of ["drawer-1", "drawer-2", "drawer-3", "handle-1", "handle-2", "handle-3"]) {
      expect(part(storage, partId).position[2]).toBeGreaterThan(0);
    }
    expect(part(storage, "modesty-panel").position[2]).toBeLessThan(0);
  });

  it("builds the corner desktop on XZ with Y thickness and rear fixtures", () => {
    const { registry } = loadedCatalog;
    const corner = registry.getFurnitureVariant("desk-corner");
    const desktop = part(corner, "corner-desktop");
    const geometry = createFurniturePartGeometry(desktop);
    geometry.computeBoundingBox();

    expect(geometry).toBeInstanceOf(ExtrudeGeometry);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(-0.02);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(0.02);
    expect(geometry.boundingBox?.min.x).toBeCloseTo(-0.8);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(0.5);
    for (const partId of [
      "left-shelf-lower",
      "left-shelf-upper",
      "right-shelf-lower",
      "right-shelf-upper",
    ]) {
      expect(part(corner, partId).position[2]).toBeLessThan(0);
    }
    expect(part(corner, "magnetic-board").position[2]).toBeLessThan(0);
    geometry.dispose();
  });

  it("builds the midcentury glass top, Y-axis legs, and brass details", () => {
    const { materialPresets, registry } = loadedCatalog;
    const variant = registry.getFurnitureVariant("desk-midcentury-glass");
    const glassTopGeometry = createFurniturePartGeometry(part(variant, "glass-top"));
    const legGeometry = createFurniturePartGeometry(part(variant, "left-leg-front"));

    expect(glassTopGeometry).toBeInstanceOf(RoundedBoxGeometry);
    expect((glassTopGeometry as RoundedBoxGeometry).parameters).toMatchObject({
      radius: 0.009,
      segments: 5,
    });
    expect(legGeometry).toBeInstanceOf(CylinderGeometry);
    expect((legGeometry as CylinderGeometry).parameters.height).toBeCloseTo(0.72);
    expect(resolveMaterialPreset("glass", materialPresets)).toMatchObject({
      transparent: true,
      opacity: 0.42,
    });
    expect(variant.materials).toEqual(["glass", "woodDark", "brass"]);
    expect(variant.dimensions.height).toBe(0.812);

    glassTopGeometry.dispose();
    legGeometry.dispose();
  });
});

function part(
  variant: ValidatedFurnitureVariant,
  partId: string,
) {
  const furniturePart = variant.parts.find((item) => item.id === partId);
  if (!furniturePart) {
    throw new Error(`Expected part "${partId}" in variant "${variant.variantId}"`);
  }
  return furniturePart;
}

let loadedCatalog: Awaited<ReturnType<typeof createProductionFurnitureCatalog>>;
beforeAll(async()=>{loadedCatalog=await createProductionFurnitureCatalog();});
