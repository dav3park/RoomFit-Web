import { describe, expect, it } from "vitest";
import { createProductionFurnitureCatalog } from "../../components/furniture/variants/productionFurnitureCatalog";
import { resolveMaterialPreset } from "../../components/furniture/variants/materialResolver";
import { PREFERRED_COLOR_TONE_OPTIONS } from "../preferredColorTone";
import { FURNITURE_THEME_TARGETS } from "../furnitureThemeTargets";
import {
  getThemeColor,
  getThemeTarget,
  resolveFurnitureCollisionMode,
  THEME_PALETTES,
} from "../furnitureBehaviorPolicy";

describe("furniture behavior policy", () => {
  const catalog = createProductionFurnitureCatalog();
  it("covers every real part of all 93 models and no stale part IDs", () => {
    expect(Object.keys(FURNITURE_THEME_TARGETS).sort()).toEqual(catalog.variants.map(v=>v.variantId).sort());
    for(const variant of catalog.variants) {
      expect(Object.keys(FURNITURE_THEME_TARGETS[variant.variantId]).sort(),variant.variantId).toEqual(variant.parts.map(p=>p.id).sort());
      for(const target of Object.values(FURNITURE_THEME_TARGETS[variant.variantId])) expect(["primary","secondary","accent","neutral","wood","preserve"]).toContain(target.slot);
    }
  });
  it("changes at least one visible surface of every model in every palette, keeping PBR properties", () => {
    for(const variant of catalog.variants) for(const tone of PREFERRED_COLOR_TONE_OPTIONS) {
      let changed = false;
      for(const part of variant.parts) {
        const before=resolveMaterialPreset(part.material,catalog.materialPresets);
        const after=resolveMaterialPreset(part.material,catalog.materialPresets,tone.id,getThemeTarget(variant.variantId,part.id),variant.variantId+":"+part.id);
        if(before.color!==after.color) changed=true;
        const {color: originalColor,...originalPbr}=before;const {color: themedColor,...themedPbr}=after;
        expect(typeof originalColor).toBe("string");expect(typeof themedColor).toBe("string");
        expect(themedPbr).toEqual(originalPbr);
      }
      expect(changed,variant.variantId+":"+tone.id).toBe(true);
    }
  });
  it("protects foliage, soil, glass, mirrors, screens and light sources", () => {
    const protectedMaterials=["glass","mirror","screen","light","ledDiffuser","plant","plantLight","plantStem","soil","chrome","brass"];
    for(const variant of catalog.variants) for(const part of variant.parts) if(protectedMaterials.includes(part.material)) {
      expect(getThemeTarget(variant.variantId,part.id)?.slot,variant.variantId+":"+part.id).toBe("preserve");
    }
  });
  it("coordinates previously unthemed shelves, painted metal and pots rather than one flat tint", () => {
    expect(getThemeTarget("bookshelf-midcentury-stockholm","shelf-middle")?.slot).toBe("primary");
    expect(getThemeTarget("bookshelf-midcentury-stockholm","post-left-front")?.slot).toBe("preserve");
    expect(getThemeTarget("plant-midcentury","pot")?.slot).toBe("primary");
    expect(getThemeTarget("plant-midcentury","leaf-1")?.slot).toBe("preserve");
    const cabinet=["side-left","door-left","door-right","handle-left"].map(id=>getThemeColor("green",getThemeTarget("wardrobe-hinged",id)!,id));
    expect(new Set(cabinet).size).toBeGreaterThanOrEqual(3);
  });
  it("uses a multi-colour palette for every selectable tone", () => {
    for (const palette of Object.values(THEME_PALETTES)) {
      expect(palette.primary.length).toBeGreaterThanOrEqual(2);
      expect(palette.secondary.length).toBeGreaterThanOrEqual(2);
      expect(palette.accent.length).toBeGreaterThanOrEqual(2);
      expect(new Set([...palette.primary, ...palette.secondary, ...palette.accent]).size).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps palette assignment deterministic and part-specific", () => {
    const pillow = getThemeTarget("bed-fabric-headboard", "pillow-left")!;
    const blanket = getThemeTarget("bed-fabric-headboard", "blanket")!;
    expect(getThemeColor("green", pillow, "bed:pillow")).toBe(getThemeColor("green", pillow, "bed:pillow"));
    expect(getThemeColor("green", pillow, "bed:pillow")).not.toBe(getThemeColor("green", blanket, "bed:blanket"));
    expect(getThemeTarget("bed-fabric-headboard", "mattress")?.slot).toBe("neutral");
  });

  it("treats rugs as floor overlays without changing desk-chair policy", () => {
    expect(resolveFurnitureCollisionMode("rug-rectangular", "rug")).toBe("FLOOR_OVERLAY");
    expect(resolveFurnitureCollisionMode("chair-basic", "chair")).toBe("SOLID");
  });
});
