import { beforeAll } from "vitest";
import { describe, expect, it } from "vitest";
import type { Furniture } from "../../../../types";
import {
  applyPreferredColorToneToLegacyFurniture,
  applyPreferredColorToneToMaterialPreset,
  FURNITURE_MATERIAL_PALETTES,
} from "../../materialPalette";
import { createProductionFurnitureCatalog } from "../productionFurnitureCatalog";
import { resolveMaterialPreset } from "../materialResolver";

function createFurniture(overrides: Partial<Furniture> = {}): Furniture {
  return {
    id: "desk-1",
    name: "책상",
    category: "desk",
    productId: "desk-midcentury-glass-01",
    variantId: "desk-midcentury-glass",
    styleTags: ["midcentury", "modern"],
    dimensions: { width: 1.75, depth: 0.74, height: 0.812 },
    position: { x: 1, z: 1 },
    rotationY: 0,
    color: "#A87852",
    geometry: "box",
    material: { type: "wood", color: "#A87852", roughness: 0.72, metalness: 0 },
    status: "recommended",
    removable: true,
    ...overrides,
  };
}

describe("furniture material palette", () => {
  it("defines all eight preferred color tone palettes", () => {
    expect(Object.keys(FURNITURE_MATERIAL_PALETTES)).toEqual([
      "ivory",
      "beige",
      "gray",
      "brown",
      "green",
      "blue",
      "pink",
      "black",
    ]);
  });

  it("keeps the original material for a missing or invalid palette", () => {
    const preset = { color: "#A87852", roughness: 0.72, metalness: 0 };

    expect(applyPreferredColorToneToMaterialPreset("wood", preset, null)).toBe(preset);
    expect(applyPreferredColorToneToMaterialPreset("wood", preset, "purple")).toBe(preset);
  });

  it("recolors wood and fabric without mutating their source presets", () => {
    const wood = { color: "#A87852", roughness: 0.72, metalness: 0 };
    const fabric = { color: "#CFC2B3", roughness: 0.94, metalness: 0 };
    const originalWood = { ...wood };
    const originalFabric = { ...fabric };

    expect(applyPreferredColorToneToMaterialPreset("woodDark", wood, "brown")).toEqual({
      ...wood,
      color: FURNITURE_MATERIAL_PALETTES.brown.wood,
    });
    expect(applyPreferredColorToneToMaterialPreset("fabricLight", fabric, "blue")).toEqual({
      ...fabric,
      color: FURNITURE_MATERIAL_PALETTES.blue.fabric,
    });
    expect(wood).toEqual(originalWood);
    expect(fabric).toEqual(originalFabric);
  });

  it("changes only the color of ordinary metal and preserves metalness", () => {
    const metal = { color: "#4B4A47", roughness: 0.36, metalness: 0.72 };
    const recolored = applyPreferredColorToneToMaterialPreset("metal", metal, "green");

    expect(recolored).toEqual({
      color: FURNITURE_MATERIAL_PALETTES.green.metal,
      roughness: 0.36,
      metalness: 0.72,
    });
    expect(metal.color).toBe("#4B4A47");
  });

  it.each([
    "glass",
    "mirror",
    "screen",
    "light",
    "ledDiffuser",
    "plant",
    "plantStem",
    "soil",
  ])("protects the %s material preset", (presetId) => {
    const preset = { color: "#123456", roughness: 0.5, metalness: 0.1 };

    expect(applyPreferredColorToneToMaterialPreset(presetId, preset, "pink")).toBe(preset);
  });

  it("protects any emissive material even when its preset ID is unfamiliar", () => {
    const preset = {
      color: "#FFF5D6",
      roughness: 0.4,
      metalness: 0,
      emissive: "#FFD582",
      emissiveIntensity: 1.2,
    };

    expect(applyPreferredColorToneToMaterialPreset("customGlow", preset, "black")).toBe(preset);
  });

  it("keeps the desk-midcentury-glass top unchanged while recoloring its wood", () => {
    const { materialPresets } = loadedCatalog;
    const originalGlass = resolveMaterialPreset("glass", materialPresets);
    const brownGlass = resolveMaterialPreset("glass", materialPresets, "brown");
    const originalWood = resolveMaterialPreset("woodDark", materialPresets);
    const brownWood = resolveMaterialPreset("woodDark", materialPresets, "brown");

    expect(brownGlass).toEqual(originalGlass);
    expect(brownWood.color).toBe(FURNITURE_MATERIAL_PALETTES.brown.wood);
    expect(brownWood.roughness).toBe(originalWood.roughness);
    expect(brownWood.metalness).toBe(originalWood.metalness);
  });

  it("does not change product or variant metadata between brown and blue", () => {
    const source = createFurniture();
    const brown = applyPreferredColorToneToLegacyFurniture(source, "brown");
    const blue = applyPreferredColorToneToLegacyFurniture(source, "blue");

    for (const result of [brown, blue]) {
      expect(result.productId).toBe(source.productId);
      expect(result.variantId).toBe(source.variantId);
      expect(result.styleTags).toEqual(source.styleTags);
      expect(result.dimensions).toBe(source.dimensions);
      expect(result.position).toBe(source.position);
    }
    expect(source.color).toBe("#A87852");
  });

  it("recolors a legacy furniture material without mutating its PBR config", () => {
    const source = createFurniture({ variantId: null });
    const originalMaterial = { ...(source.material as Exclude<Furniture["material"], string>) };
    const result = applyPreferredColorToneToLegacyFurniture(source, "blue");

    expect(result).not.toBe(source);
    expect(result.color).toBe(FURNITURE_MATERIAL_PALETTES.blue.wood);
    expect(result.material).toEqual({
      ...originalMaterial,
      color: FURNITURE_MATERIAL_PALETTES.blue.wood,
    });
    expect(source.material).toEqual(originalMaterial);
  });

  it("does not recolor protected legacy glass, lighting, screen, or plant furniture", () => {
    const protectedItems = [
      createFurniture({ material: "glass" }),
      createFurniture({ category: "lighting", material: "metal" }),
      createFurniture({ id: "tv-1", name: "TV", category: "cabinet" }),
      createFurniture({ id: "plant-1", name: "화분", category: "cabinet" }),
    ];

    for (const item of protectedItems) {
      expect(applyPreferredColorToneToLegacyFurniture(item, "beige")).toBe(item);
    }
  });
});

let loadedCatalog: Awaited<ReturnType<typeof createProductionFurnitureCatalog>>;
beforeAll(async()=>{loadedCatalog=await createProductionFurnitureCatalog();});
