import type { FurnitureVariantRegistry } from "./FurnitureVariantRegistry";
import { productionFurnitureRegistry,productionMaterialPresets,getProductionFurnitureProductMetadata } from "./productionFurnitureCatalog";
import type { FurnitureVariantDimensions, ValidatedFurnitureVariant } from "./types";

export const FURNITURE_VARIANT_DIMENSION_TOLERANCE_METERS = 0.001;

type FurnitureDimensionName = keyof FurnitureVariantDimensions;
type FurnitureVariantRegistryReader = Pick<
  FurnitureVariantRegistry,
  "getFurnitureVariant" | "hasFurnitureVariant"
>;

interface WarningEnvironment {
  isDevelopment: boolean;
  warn: (message: string) => void;
}

export interface FurnitureDimensionMismatch {
  dimension: FurnitureDimensionName;
  furnitureValue: number;
  variantValue: number;
}

const productionRenderResources = {materialPresets:productionMaterialPresets,registry:productionFurnitureRegistry};
const warnedUnknownVariantIds = new Set<string>();
const warnedDimensionMismatches = new Set<string>();
const defaultWarningEnvironment: WarningEnvironment = {
  isDevelopment: import.meta.env.DEV,
  warn: (message) => console.warn(message),
};

export function resolveFurnitureVariant(
  variantId: string | null | undefined,
  registry: FurnitureVariantRegistryReader = productionFurnitureRegistry,
  warningEnvironment: WarningEnvironment = defaultWarningEnvironment,
): Pick<ValidatedFurnitureVariant,'variantId'|'dimensions'> | null {
  if (variantId == null) {
    return null;
  }

  if(registry===productionFurnitureRegistry){const product=getProductionFurnitureProductMetadata(variantId);if(product)return product;}
  if (!registry.hasFurnitureVariant(variantId)) {
    if (warningEnvironment.isDevelopment && !warnedUnknownVariantIds.has(variantId)) {
      warnedUnknownVariantIds.add(variantId);
      warningEnvironment.warn(
        `Furniture variant "${variantId}" is not registered. Falling back to the legacy renderer.`,
      );
    }
    return null;
  }

  return registry.getFurnitureVariant(variantId);
}

export function getProductionFurnitureVariantRenderResources() {
  return productionRenderResources;
}

export function getFurnitureVariantLocalYOffset(height: number): number {
  return -height / 2;
}

export function findFurnitureVariantDimensionMismatches(
  furnitureDimensions: FurnitureVariantDimensions,
  variantDimensions: FurnitureVariantDimensions,
  tolerance = FURNITURE_VARIANT_DIMENSION_TOLERANCE_METERS,
): FurnitureDimensionMismatch[] {
  const dimensions: FurnitureDimensionName[] = ["width", "depth", "height"];

  return dimensions.flatMap((dimension) => {
    const furnitureValue = furnitureDimensions[dimension];
    const variantValue = variantDimensions[dimension];
    const differs =
      !Number.isFinite(furnitureValue) ||
      !Number.isFinite(variantValue) ||
      Math.abs(furnitureValue - variantValue) > tolerance;

    return differs ? [{ dimension, furnitureValue, variantValue }] : [];
  });
}

export function warnFurnitureVariantDimensionMismatch(
  variantId: string,
  furnitureDimensions: FurnitureVariantDimensions,
  variantDimensions: FurnitureVariantDimensions,
  warningEnvironment: WarningEnvironment = defaultWarningEnvironment,
): void {
  const mismatches = findFurnitureVariantDimensionMismatches(furnitureDimensions, variantDimensions);

  if (!warningEnvironment.isDevelopment || mismatches.length === 0) {
    return;
  }

  const mismatchSignature = mismatches
    .map(({ dimension, furnitureValue, variantValue }) =>
      `${dimension}:${furnitureValue}:${variantValue}`)
    .join("|");
  const warningKey = `${variantId}|${mismatchSignature}`;

  if (warnedDimensionMismatches.has(warningKey)) {
    return;
  }

  warnedDimensionMismatches.add(warningKey);
  warningEnvironment.warn(
    `Furniture variant "${variantId}" dimensions differ from the backend layout (${mismatchSignature}). ` +
      "The JSON variant is rendered at scale 1 without functional scaling.",
  );
}
