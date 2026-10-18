import catalogDocument from "../../../data/furniture/catalog.json";
import materialsDocument from "../../../data/furniture/materials.json";
import { FurnitureVariantRegistry } from "./FurnitureVariantRegistry";
import { parseMaterialCatalogDocument } from "./materialResolver";
import type { MaterialPresetCatalog } from "./materialResolver";
import type { ValidatedFurnitureVariant } from "./types";
import { validateFurnitureVariant } from "./validateFurnitureVariant";

const variantAssets = import.meta.glob("../../../data/furniture/variants/*.json", {eager:true,query:"?url&no-inline",import:"default"}) as Record<string,string>;

interface CatalogProduct {
  productId: string;
  variantId: string;
  furnitureType: string;
  dimensions: { width: number; depth: number; height: number };
  visualFootprint: FurnitureVariantVisualFootprint;
  variantPath: string;
}

export interface FurnitureVariantVisualFootprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface GeneratedCatalogDocument {
  schemaVersion: "1.0";
  catalogVersion: string;
  sourceHash: string;
  variantCount: number;
  products: CatalogProduct[];
}

const generatedCatalog = validateGeneratedCatalog(catalogDocument);

export const PRODUCTION_FURNITURE_VARIANT_IDS: readonly string[] = Object.freeze(
  generatedCatalog.products.map((product) => product.variantId),
);

export type ProductionFurnitureVariantId = string;

export const PRODUCTION_FURNITURE_CATALOG_METADATA = Object.freeze({
  catalogVersion: generatedCatalog.catalogVersion,
  sourceHash: generatedCatalog.sourceHash,
  variantCount: generatedCatalog.variantCount,
});

export interface ProductionFurnitureCatalog {
  materialPresets: MaterialPresetCatalog;
  registry: FurnitureVariantRegistry;
  variants: ValidatedFurnitureVariant[];
}

export const productionMaterialPresets=parseMaterialCatalogDocument(materialsDocument);
export const productionFurnitureRegistry=new FurnitureVariantRegistry();
const productsById=new Map(generatedCatalog.products.map(product=>[product.variantId,product]));
const requests=new Map<string,Promise<ValidatedFurnitureVariant>>();
const states=new Map<string,'loading'|'ready'|'error'>();
const reloads=new Set<string>();
const listeners=new Set<()=>void>();
const notify=()=>{for(const listener of listeners)listener();};
export function subscribeFurnitureModels(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function getProductionFurnitureVariantState(id:string){return states.get(id)??'idle';}
export function getProductionFurnitureProductMetadata(id:string){return productsById.get(id)??null;}
export function getLoadedFurnitureVariant(id:string):ValidatedFurnitureVariant|null {
 return productionFurnitureRegistry.hasFurnitureVariant(id)?productionFurnitureRegistry.getFurnitureVariant(id):null;
}
export function retryProductionFurnitureVariant(id:string):void {
 if(states.get(id)!=='error')return;requests.delete(id);states.delete(id);reloads.add(id);notify();
}
export function loadProductionFurnitureVariant(id:string):Promise<ValidatedFurnitureVariant> {
 const pending=requests.get(id);if(pending)return pending;
 const product=productsById.get(id),asset=product?variantAssets[`../../../data/furniture/${product.variantPath}`]:undefined;
 if(!product||!asset)return Promise.reject(new Error(`Unknown furniture model: ${id}`));
 states.set(id,'loading');
 const request=fetch(asset,{cache:reloads.delete(id)?'reload':'default',signal:AbortSignal.timeout(20_000)}).then(async response=>{
  if(!response.ok)throw new Error(`Furniture model request failed: ${response.status}`);
  return response.json() as Promise<unknown>;
 }).then(document=>{
  const variant=validateFurnitureVariant(document,productionMaterialPresets);assertProductContract(product,variant);
  productionFurnitureRegistry.registerFurnitureVariant(variant);states.set(id,'ready');notify();return variant;
 }).catch((error:unknown)=>{states.set(id,'error');notify();throw error;});
 requests.set(id,request);notify();return request;
}
/** Explicit full preload is for QA, never for catalog listings or the Worker. */
export async function createProductionFurnitureCatalog():Promise<ProductionFurnitureCatalog> {
 const variants=await Promise.all(PRODUCTION_FURNITURE_VARIANT_IDS.map(loadProductionFurnitureVariant));
 return {materialPresets:productionMaterialPresets,registry:productionFurnitureRegistry,variants};
}

export function getProductionFurnitureVisualFootprint(
  variantId: string,
): FurnitureVariantVisualFootprint | null {
  const product = generatedCatalog.products.find((item) => item.variantId === variantId);
  return product?.visualFootprint ?? null;
}


function assertProductContract(product: CatalogProduct, variant: ValidatedFurnitureVariant): void {
  if (product.productId !== `${variant.variantId}-01`) {
    throw new Error(`Catalog productId for "${variant.variantId}" must be "${variant.variantId}-01"`);
  }
  if (product.furnitureType !== canonicalTypeCode(variant.furnitureTypeCode)) {
    throw new Error(`Catalog furniture type does not match variant "${variant.variantId}"`);
  }
  for (const dimension of ["width", "depth", "height"] as const) {
    if (product.dimensions[dimension] !== variant.dimensions[dimension]) {
      throw new Error(`Catalog ${dimension} does not match variant "${variant.variantId}"`);
    }
  }
  assertVisualFootprint(product.variantId, product.visualFootprint);
}

function assertVisualFootprint(
  variantId: string,
  footprint: FurnitureVariantVisualFootprint,
): void {
  if (!footprint || ![footprint.minX, footprint.maxX, footprint.minZ, footprint.maxZ].every(Number.isFinite)
      || footprint.minX >= footprint.maxX || footprint.minZ >= footprint.maxZ) {
    throw new Error(`Catalog visual footprint is invalid for variant "${variantId}"`);
  }
}

function canonicalTypeCode(code: string): string | undefined {
  const aliases = (catalogDocument as { typeAliases?: Record<string, string> }).typeAliases;
  return aliases?.[code];
}

function validateGeneratedCatalog(input: unknown): GeneratedCatalogDocument {
  if (!isRecord(input) || input.schemaVersion !== "1.0") {
    throw new Error("Generated furniture catalog must use schemaVersion 1.0");
  }
  if (typeof input.catalogVersion !== "string" || !/^sha256:[a-f0-9]{64}$/.test(String(input.sourceHash))) {
    throw new Error("Generated furniture catalog metadata is invalid");
  }
  if (!Array.isArray(input.products) || input.products.length === 0 || input.variantCount !== input.products.length) {
    throw new Error("Generated furniture catalog product count is invalid");
  }
  return input as unknown as GeneratedCatalogDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
