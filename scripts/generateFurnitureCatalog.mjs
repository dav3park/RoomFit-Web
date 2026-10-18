import { assertSculptedFurniturePart } from "../src/geometry/sculptedFurnitureGeometry.mjs";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeVariantVisualFootprint } from "./furnitureVisualFootprint.mjs";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_SCHEMA_VERSION = "1.0";
const CATALOG_VERSION = "2026-10-18.1";
const LEGACY_DESK_ORDER = [
  "desk-compact",
  "desk-storage",
  "desk-corner",
  "desk-midcentury-glass",
];

const CANONICAL_TYPE_BY_CODE = Object.freeze({
  BED: "bed",
  BOOKSHELF: "bookshelf",
  CURTAIN_BLIND: "curtain_blind",
  DESK: "desk",
  DESK_CHAIR: "desk_chair",
  DRAWER_CHEST: "drawer_chest",
  FULL_LENGTH_MIRROR: "full_length_mirror",
  HANGER: "hanger",
  MEDIA_CONSOLE: "media_console",
  MONITOR: "monitor",
  MOOD_LAMP: "mood_lamp",
  MULTI_TABLE: "multi_table",
  NIGHTSTAND: "nightstand",
  PARTITION_SHELF: "partition_shelf",
  PLANT: "plant",
  RUG: "rug",
  SIDE_TABLE: "side_table",
  SOFA: "sofa",
  SOFA_BED: "sofa_bed",
  TV: "tv",
  WARDROBE: "wardrobe",
});

const CLEARANCE_BY_CODE = Object.freeze({
  BED: [0.5, 0.2],
  BOOKSHELF: [0.5, 0.2],
  CURTAIN_BLIND: [0.1, 0.1],
  DESK: [0.6, 0.2],
  DESK_CHAIR: [0.4, 0.1],
  DRAWER_CHEST: [0.5, 0.2],
  FULL_LENGTH_MIRROR: [0.2, 0.1],
  HANGER: [0.5, 0.2],
  MEDIA_CONSOLE: [0.4, 0.1],
  MONITOR: [0.1, 0.1],
  MOOD_LAMP: [0.2, 0.1],
  MULTI_TABLE: [0.4, 0.1],
  NIGHTSTAND: [0.3, 0.1],
  PARTITION_SHELF: [0.5, 0.2],
  PLANT: [0.2, 0.1],
  RUG: [0.1, 0.1],
  SIDE_TABLE: [0.3, 0.1],
  SOFA: [0.5, 0.2],
  SOFA_BED: [0.5, 0.2],
  TV: [0.2, 0.1],
  WARDROBE: [0.5, 0.2],
});

const TYPE_ALIASES = Object.freeze({
  "bedside table": "nightstand",
  "bedside-table": "nightstand",
  bedside_table: "nightstand",
  blind: "curtain_blind",
  chair: "desk_chair",
  curtain: "curtain_blind",
  "desk-chair": "desk_chair",
  lamp: "mood_lamp",
  lighting: "mood_lamp",
  mirror: "full_length_mirror",
  "mood-light": "mood_lamp",
  "night-stand": "nightstand",
  "night stand": "nightstand",
  "side table": "side_table",
  "side-table": "side_table",
  table: "multi_table",
  "tv-stand": "media_console",
  tvStand: "media_console",
  tvstand: "media_console",
});

const SUPPORTED_GEOMETRIES = new Set([
  "mesh", "sweep", "profile",
  "box",
  "roundedBox",
  "cylinder",
  "extrudedPolygon",
  "curtain",
  "ellipsoid",
  "leaf",
  "planter",
  "tube",
]);

const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(WEB_ROOT, args.source ?? "src/data/furniture");
const backendRoot = path.resolve(WEB_ROOT, args.backendRoot ?? "../RoomFit-Backend");
const sourceVariants = await resolveVariantDirectory(sourceRoot);
const sourceMaterials = path.join(sourceRoot, "materials.json");
const placementMetadata=await readJson(path.join(WEB_ROOT,"src/data/furniture/placementMetadata.json"));

const materialsDocument = await readJson(sourceMaterials);
validateMaterials(materialsDocument);

const fileNames = (await readdir(sourceVariants))
  .filter((fileName) => fileName.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right));
const documents = await Promise.all(fileNames.map(async (fileName) => ({
  fileName,
  document: await readJson(path.join(sourceVariants, fileName)),
})));

const materialIds = new Set(Object.keys(materialsDocument.materials));
const variantIds = new Set();
const productIds = new Set();
for (const { fileName, document } of documents) {
  validateVariant(fileName, document, materialIds, variantIds, productIds);
}

if (args.copyAssets) {
  await copyRuntimeAssets(sourceMaterials, sourceVariants, fileNames);
}

const sortedDocuments = [...documents].sort(compareVariants);
const sourceHash = createHash("sha256")
  .update(stableStringify({
    materials: materialsDocument,
    placement: placementMetadata,
    variants: [...documents]
      .sort((left, right) => left.document.variantId.localeCompare(right.document.variantId))
      .map(({ document }) => document),
  }))
  .digest("hex");

const typeAliases = Object.fromEntries([
  ...Object.entries(CANONICAL_TYPE_BY_CODE),
  ...Object.values(CANONICAL_TYPE_BY_CODE).map((type) => [type, type]),
  ...Object.entries(TYPE_ALIASES),
].sort(([left], [right]) => left.localeCompare(right)));

const catalog = {
  schemaVersion: CATALOG_SCHEMA_VERSION,
  catalogVersion: CATALOG_VERSION,
  sourceHash: `sha256:${sourceHash}`,
  variantCount: sortedDocuments.length,
  typeAliases,
  products: sortedDocuments.map(({ fileName, document }) => {
    const [front, side] = CLEARANCE_BY_CODE[document.furnitureTypeCode];
    return {
      productId: `${document.variantId}-01`,
      variantId: document.variantId,
      furnitureType: CANONICAL_TYPE_BY_CODE[document.furnitureTypeCode],
      furnitureTypeCode: document.furnitureTypeCode,
      label: document.name,
      dimensions: document.dimensions,
      visualFootprint: computeVariantVisualFootprint(document),
      styleTags: document.styleTags,
      lifestyleTags: document.lifestyleTags,
      materials: document.materials,
      purchaseUrl: document.purchaseUrl,
      requiredClearance: { front, side },
      renderCapability: "VARIANT_JSON",
      variantPath: `variants/${fileName}`,
      placement: {...placementMetadata.defaults[CANONICAL_TYPE_BY_CODE[document.furnitureTypeCode]], ...placementMetadata.overrides[document.variantId]},
    };
  }),
};

const output = `${JSON.stringify(catalog, null, 2)}\n`;
const webCatalogPath = path.join(WEB_ROOT, "src/data/furniture/catalog.json");
const backendCatalogPath = path.join(
  backendRoot,
  "src/main/resources/catalog/furniture-catalog.json",
);
await mkdir(path.dirname(webCatalogPath), { recursive: true });
await mkdir(path.dirname(backendCatalogPath), { recursive: true });
await Promise.all([
  writeFile(webCatalogPath, output),
  writeFile(backendCatalogPath, output),
]);

process.stdout.write(
  `Generated ${catalog.variantCount} products (${catalog.sourceHash})\n` +
    `Web: ${webCatalogPath}\nBackend: ${backendCatalogPath}\n`,
);

async function copyRuntimeAssets(materialsPath, variantsPath, variantFileNames) {
  const targetRoot = path.join(WEB_ROOT, "src/data/furniture");
  const targetVariants = path.join(targetRoot, "variants");
  await mkdir(targetVariants, { recursive: true });
  await copyFile(materialsPath, path.join(targetRoot, "materials.json"));
  await Promise.all(variantFileNames.map((fileName) =>
    copyFile(path.join(variantsPath, fileName), path.join(targetVariants, fileName))));
}

function compareVariants(left, right) {
  const leftIndex = LEGACY_DESK_ORDER.indexOf(left.document.variantId);
  const rightIndex = LEGACY_DESK_ORDER.indexOf(right.document.variantId);
  if (leftIndex >= 0 || rightIndex >= 0) {
    if (leftIndex < 0) return 1;
    if (rightIndex < 0) return -1;
    return leftIndex - rightIndex;
  }
  return left.document.variantId.localeCompare(right.document.variantId);
}

function validateMaterials(document) {
  if (!isRecord(document) || document.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new Error(`materials.json must use schemaVersion ${CATALOG_SCHEMA_VERSION}`);
  }
  if (!isRecord(document.materials) || Object.keys(document.materials).length === 0) {
    throw new Error("materials.json must declare a non-empty materials object");
  }
}

function validateVariant(fileName, document, materialIds, variantIds, productIds) {
  if (!isRecord(document) || document.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new Error(`${fileName}: unsupported schemaVersion`);
  }
  if (typeof document.variantId !== "string" || document.variantId.length === 0) {
    throw new Error(`${fileName}: missing variantId`);
  }
  if (variantIds.has(document.variantId)) {
    throw new Error(`${fileName}: duplicate variantId ${document.variantId}`);
  }
  variantIds.add(document.variantId);
  const productId = `${document.variantId}-01`;
  if (productIds.has(productId)) {
    throw new Error(`${fileName}: duplicate productId ${productId}`);
  }
  productIds.add(productId);
  if (!Object.hasOwn(CANONICAL_TYPE_BY_CODE, document.furnitureTypeCode)) {
    throw new Error(`${fileName}: unsupported furnitureTypeCode ${document.furnitureTypeCode}`);
  }
  if (!isPositiveDimensions(document.dimensions)) {
    throw new Error(`${fileName}: invalid dimensions`);
  }
  if (!Array.isArray(document.materials) || document.materials.length === 0) {
    throw new Error(`${fileName}: materials must be a non-empty array`);
  }
  for (const material of document.materials) {
    if (!materialIds.has(material)) {
      throw new Error(`${fileName}: unknown material ${material}`);
    }
  }
  if (!Array.isArray(document.parts) || document.parts.length === 0) {
    throw new Error(`${fileName}: parts must be a non-empty array`);
  }
  const partIds = new Set();
  for (const part of document.parts) {
    if (!isRecord(part) || typeof part.id !== "string" || part.id.length === 0) {
      throw new Error(`${fileName}: invalid part id`);
    }
    if (partIds.has(part.id)) {
      throw new Error(`${fileName}: duplicate part id ${part.id}`);
    }
    partIds.add(part.id);
    if (!SUPPORTED_GEOMETRIES.has(part.geometry)) {
      throw new Error(`${fileName}: unsupported geometry ${part.geometry}`);
    }
    if (["mesh", "sweep", "profile"].includes(part.geometry)) assertSculptedFurniturePart(part);
    if (!document.materials.includes(part.material) || !materialIds.has(part.material)) {
      throw new Error(`${fileName}: unresolved material ${part.material} in part ${part.id}`);
    }
  }
}

function isPositiveDimensions(value) {
  return isRecord(value) && [value.width, value.depth, value.height]
    .every((item) => typeof item === "number" && Number.isFinite(item) && item > 0);
}

async function resolveVariantDirectory(root) {
  const incomingStyle = path.join(root, "furniture");
  try {
    const files = await readdir(incomingStyle);
    if (files.some((fileName) => fileName.endsWith(".json"))) return incomingStyle;
  } catch {
    // The checked-in runtime source uses variants/ instead of furniture/.
  }
  return path.join(root, "variants");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(values) {
  const parsed = { source: null, backendRoot: null, copyAssets: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--copy-assets") {
      parsed.copyAssets = true;
    } else if (value === "--source" || value === "--backend-root") {
      const next = values[index + 1];
      if (!next) throw new Error(`${value} requires a path`);
      parsed[value === "--source" ? "source" : "backendRoot"] = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return parsed;
}
