import { MeshStandardMaterial } from "three";
import type { MeshStandardMaterialParameters } from "three";
import { applyPreferredColorToneToMaterialPreset } from "../materialPalette";
import type { FurnitureColorThemeId } from "../../../config/furnitureBehaviorPolicy";
import { getThemeColor, type ThemeTarget } from "../../../config/furnitureBehaviorPolicy";

export interface MaterialPreset {
  color: string;
  roughness: number;
  metalness: number;
  transparent?: boolean;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export type MaterialPresetCatalog = Record<string, MaterialPreset>;

export const MATERIAL_CATALOG_SCHEMA_VERSION = "1.0" as const;

export interface MaterialCatalogDocument {
  schemaVersion: typeof MATERIAL_CATALOG_SCHEMA_VERSION;
  materials: MaterialPresetCatalog;
}

export function parseMaterialCatalogDocument(input: unknown): MaterialPresetCatalog {
  if (!isRecord(input)) {
    throw new Error("Material catalog document must be an object");
  }
  if (input.schemaVersion !== MATERIAL_CATALOG_SCHEMA_VERSION) {
    throw new Error(`Material catalog schemaVersion must be "${MATERIAL_CATALOG_SCHEMA_VERSION}"`);
  }
  if (!isRecord(input.materials) || Object.keys(input.materials).length === 0) {
    throw new Error("Material catalog materials must be a non-empty object");
  }
  return parseMaterialPresetCatalog(input.materials);
}

export function parseMaterialPresetCatalog(input: unknown): MaterialPresetCatalog {
  if (!isRecord(input)) {
    throw new Error("Material preset catalog must be an object");
  }

  const entries = Object.entries(input).map(([presetId, rawPreset]) => {
    if (presetId.trim().length === 0) {
      throw new Error("Material preset ID must not be blank");
    }
    if (!isRecord(rawPreset)) {
      throw new Error(`Material preset "${presetId}" must be an object`);
    }

    return [presetId, parseMaterialPreset(presetId, rawPreset)] as const;
  });

  return Object.fromEntries(entries);
}

export function resolveMaterialPreset(
  presetId: string,
  catalog: Readonly<MaterialPresetCatalog>,
  preferredColorTone?: FurnitureColorThemeId | null,
  themeTarget?: ThemeTarget | null,
  themeKey = presetId,
  furnitureType?: string,
): MeshStandardMaterialParameters {
  if (!Object.hasOwn(catalog, presetId)) {
    throw new Error(`Unknown material preset "${presetId}"`);
  }

  // A material is never recolored merely because it has a familiar name such
  // as `fabric` or `wood`. Only an explicitly declared variant part receives
  // a palette slot; every other PBR preset remains untouched.
  const paletteColor = preferredColorTone && themeTarget
    ? getThemeColor(preferredColorTone, themeTarget, themeKey, furnitureType)
    : null;
  // The omitted-argument branch retains the public utility's historical
  // behaviour for callers outside the renderer. Renderer callers always pass
  // `null` for an undeclared part, which is the deliberate no-tint policy.
  const preset = themeTarget === undefined
    ? applyPreferredColorToneToMaterialPreset(presetId, catalog[presetId], preferredColorTone)
    : paletteColor ? { ...catalog[presetId], color: paletteColor } : catalog[presetId];
  const opacity = preset.opacity ?? 1;
  return {
    color: preset.color,
    roughness: preset.roughness,
    metalness: preset.metalness,
    transparent: preset.transparent ?? opacity < 1,
    opacity,
    emissive: preset.emissive,
    emissiveIntensity: preset.emissiveIntensity,
  };
}

export function createMaterialFromPreset(
  presetId: string,
  catalog: Readonly<MaterialPresetCatalog>,
  preferredColorTone?: FurnitureColorThemeId | null,
  themeTarget?: ThemeTarget | null,
  themeKey?: string,
): MeshStandardMaterial {
  return new MeshStandardMaterial(resolveMaterialPreset(presetId, catalog, preferredColorTone, themeTarget, themeKey));
}

function parseMaterialPreset(presetId: string, input: Record<string, unknown>): MaterialPreset {
  const color = readNonBlankString(input.color, `Material preset "${presetId}" color`);
  const roughness = readUnitInterval(input.roughness, `Material preset "${presetId}" roughness`);
  const metalness = readUnitInterval(input.metalness, `Material preset "${presetId}" metalness`);
  const opacity = readOptionalUnitInterval(input.opacity, `Material preset "${presetId}" opacity`);
  const transparent = readOptionalBoolean(input.transparent, `Material preset "${presetId}" transparent`);
  const emissive = input.emissive === undefined
    ? undefined
    : readNonBlankString(input.emissive, `Material preset "${presetId}" emissive`);
  const emissiveIntensity = readOptionalNonNegativeNumber(
    input.emissiveIntensity,
    `Material preset "${presetId}" emissiveIntensity`,
  );

  return {
    color,
    roughness,
    metalness,
    transparent,
    opacity,
    emissive,
    emissiveIntensity,
  };
}

function readNonBlankString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-blank string`);
  }
  return value;
}

function readOptionalUnitInterval(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number between 0 and 1`);
  }
  return value;
}

function readUnitInterval(value: unknown, label: string): number {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number between 0 and 1`);
  }
  return value;
}

function readOptionalNonNegativeNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isFiniteNumber(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
  return value;
}

function readOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
