import { assertSculptedFurniturePart } from "../../../geometry/sculptedFurnitureGeometry.mjs";
import type { MaterialPresetCatalog } from "./materialResolver";
import {
  FURNITURE_LIFESTYLE_TAGS,
  FURNITURE_STYLE_TAGS,
  FURNITURE_VARIANT_SCHEMA_VERSION,
} from "./types";
import type {
  FurnitureCoordinateSystem,
  FurnitureLifestyleTag,
  FurnitureStyleTag,
  FurnitureVariantDimensions,
  ValidatedFurniturePart,
  ValidatedFurnitureVariant,
  Vector2Tuple,
  Vector3Tuple,
} from "./types";

const STYLE_TAGS = new Set<string>(FURNITURE_STYLE_TAGS);
const LIFESTYLE_TAGS = new Set<string>(FURNITURE_LIFESTYLE_TAGS);

export class FurnitureVariantValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FurnitureVariantValidationError";
  }
}

export function validateFurnitureVariant(
  input: unknown,
  materialPresets: Readonly<MaterialPresetCatalog>,
): ValidatedFurnitureVariant {
  const root = readRecord(input, "Furniture variant must be an object");
  const variantId = readNonBlankString(root.variantId, "variantId", "<unknown>");

  if (root.schemaVersion !== FURNITURE_VARIANT_SCHEMA_VERSION) {
    fail(variantId, `schemaVersion must be "${FURNITURE_VARIANT_SCHEMA_VERSION}"`);
  }
  if (root.units !== "meter") {
    fail(variantId, "units must be \"meter\"");
  }
  if (root.rotationUnit !== "radian") {
    fail(variantId, "rotationUnit must be \"radian\"");
  }

  const name = readNonBlankString(root.name, "name", variantId);
  const furnitureType = readNonBlankString(root.furnitureType, "furnitureType", variantId);
  const furnitureTypeCode = readNonBlankString(root.furnitureTypeCode, "furnitureTypeCode", variantId);
  const variant = readNonBlankString(root.variant, "variant", variantId);
  const coordinateSystem = readCoordinateSystem(root.coordinateSystem, variantId);
  const dimensions = readDimensions(root.dimensions, variantId);
  const materials = readStringArray(root.materials, "materials", variantId, true);
  ensureUniqueStrings(materials, "material", variantId);
  for (const material of materials) {
    if (!Object.hasOwn(materialPresets, material)) {
      throw new FurnitureVariantValidationError(
        `Material preset "${material}" declared by variant "${variantId}" does not exist in the global material catalog.`,
      );
    }
  }
  const styleTags = readAllowedTags(root.styleTags, "styleTags", variantId, STYLE_TAGS) as FurnitureStyleTag[];
  const lifestyleTags = readAllowedTags(
    root.lifestyleTags,
    "lifestyleTags",
    variantId,
    LIFESTYLE_TAGS,
  ) as FurnitureLifestyleTag[];
  const purchaseUrl = readPurchaseUrl(root.purchaseUrl, variantId);
  const parts = readParts(root.parts, variantId, materials, materialPresets);

  return {
    schemaVersion: FURNITURE_VARIANT_SCHEMA_VERSION,
    variantId,
    name,
    furnitureType,
    furnitureTypeCode,
    variant,
    units: "meter",
    coordinateSystem,
    rotationUnit: "radian",
    dimensions,
    materials,
    parts,
    styleTags,
    lifestyleTags,
    purchaseUrl,
  };
}

function readParts(
  value: unknown,
  variantId: string,
  materials: string[],
  materialPresets: Readonly<MaterialPresetCatalog>,
): ValidatedFurniturePart[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(variantId, "parts must be a non-empty array");
  }

  const partIds = new Set<string>();
  return value.map((rawPart, index) => {
    const part = readRecord(rawPart, `Invalid furniture variant "${variantId}", part at index ${index} must be an object`);
    const partId = readNonBlankString(part.id, `parts[${index}].id`, variantId);
    if (partIds.has(partId)) {
      fail(variantId, `Duplicate part id "${partId}"`, partId);
    }
    partIds.add(partId);

    const material = readNonBlankString(part.material, "material", variantId, partId);
    if (!materials.includes(material)) {
      throw new FurnitureVariantValidationError(
        `Material "${material}" referenced by variant "${variantId}", part "${partId}" is not declared in variant.materials.`,
      );
    }
    if (!Object.hasOwn(materialPresets, material)) {
      throw new FurnitureVariantValidationError(
        `Material preset "${material}" referenced by variant "${variantId}", part "${partId}" does not exist in the global material catalog.`,
      );
    }

    const base: ValidatedPartBase = {
      id: partId,
      material,
      position: readFiniteTuple3(part.position, "position", variantId, partId),
      rotation: part.rotation === undefined
        ? [0, 0, 0]
        : readFiniteTuple3(part.rotation, "rotation", variantId, partId),
    };

    return readPartGeometry(part, variantId, partId, base);
  });
}

interface ValidatedPartBase {
  id: string;
  material: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
}

function readPartGeometry(
  part: Record<string, unknown>,
  variantId: string,
  partId: string,
  base: ValidatedPartBase,
): ValidatedFurniturePart {
  switch (part.geometry) {
    case "mesh":
    case "profile":
    case "sweep": {
      try { assertSculptedFurniturePart(part); }
      catch { fail(variantId, `Invalid ${part.geometry} geometry`, partId); }
      if (part.geometry === "mesh") return { ...base, geometry:"mesh", vertices:[...(part.vertices as number[])], indices:[...(part.indices as number[])] };
      if (part.geometry === "profile") return { ...base, geometry:"profile", profile:(part.profile as Vector2Tuple[]).map(point=>[...point]), segments:part.segments as number };
      return { ...base, geometry:"sweep", points:(part.points as Vector3Tuple[]).map(point=>[...point]), radius:part.radius as number,
        segments:part.segments as number, radialSegments:part.radialSegments as number, closed:part.closed as boolean|undefined };
    }
    case "box":
      return {
        ...base,
        geometry: "box",
        size: readPositiveTuple3(part.size, "size", variantId, partId),
      };
    case "roundedBox": {
      const size = readPositiveTuple3(part.size, "size", variantId, partId);
      const radius = readOptionalPositiveNumber(part.radius, "radius", variantId, partId);
      const smoothness = readOptionalIntegerInRange(
        part.smoothness,
        "smoothness",
        1,
        10,
        variantId,
        partId,
      );
      return { ...base, geometry: "roundedBox", size, radius, smoothness };
    }
    case "cylinder":
      return {
        ...base,
        geometry: "cylinder",
        size: readPositiveTuple3(part.size, "size", variantId, partId),
        radialSegments: readOptionalPositiveInteger(
          part.radialSegments,
          "radialSegments",
          variantId,
          partId,
        ),
      };
    case "extrudedPolygon": {
      if (!Array.isArray(part.points) || part.points.length < 3) {
        fail(variantId, "extrudedPolygon points must contain at least 3 points", partId);
      }
      const points = part.points.map((point, index) =>
        readFiniteTuple2(point, `points[${index}]`, variantId, partId));
      const height = readPositiveNumber(part.height, "height", variantId, partId);
      if (part.bevel !== undefined && part.bevel !== false) {
        fail(variantId, "extrudedPolygon bevel must be omitted or false in schema 1.0", partId);
      }
      return { ...base, geometry: "extrudedPolygon", points, height, bevel: false };
    }
    case "curtain":
      return {
        ...base,
        geometry: "curtain",
        size: readPositiveTuple3(part.size, "size", variantId, partId),
        folds: readIntegerInRange(part.folds, "folds", 1, 32, variantId, partId),
        segmentsX: readIntegerInRange(part.segmentsX, "segmentsX", 1, 128, variantId, partId),
        segmentsY: readIntegerInRange(part.segmentsY, "segmentsY", 1, 128, variantId, partId),
      };
    case "ellipsoid":
      return {
        ...base,
        geometry: "ellipsoid",
        size: readPositiveTuple3(part.size, "size", variantId, partId),
      };
    case "leaf":
      return {
        ...base,
        geometry: "leaf",
        width: readPositiveNumber(part.width, "width", variantId, partId),
        height: readPositiveNumber(part.height, "height", variantId, partId),
        curveSegments: readIntegerInRange(part.curveSegments, "curveSegments", 1, 64, variantId, partId),
      };
    case "planter":
      return {
        ...base,
        geometry: "planter",
        size: readPositiveTuple3(part.size, "size", variantId, partId),
        segments: readIntegerInRange(part.segments, "segments", 3, 128, variantId, partId),
      };
    case "tube": {
      if (!Array.isArray(part.curvePoints) || part.curvePoints.length < 2) {
        fail(variantId, "curvePoints must contain at least 2 points", partId);
      }
      return {
        ...base,
        geometry: "tube",
        curvePoints: part.curvePoints.map((point, index) =>
          readFiniteTuple3(point, `curvePoints[${index}]`, variantId, partId)),
        radius: readPositiveNumber(part.radius, "radius", variantId, partId),
        tubularSegments: readIntegerInRange(
          part.tubularSegments,
          "tubularSegments",
          1,
          256,
          variantId,
          partId,
        ),
        radialSegments: readIntegerInRange(
          part.radialSegments,
          "radialSegments",
          3,
          64,
          variantId,
          partId,
        ),
      };
    }
    default:
      fail(variantId, `Unsupported geometry type "${String(part.geometry)}"`, partId);
  }
}

function readCoordinateSystem(value: unknown, variantId: string): FurnitureCoordinateSystem {
  const coordinateSystem = readRecord(value, `Invalid furniture variant "${variantId}": coordinateSystem must be an object`);
  const axes = readRecord(
    coordinateSystem.axes,
    `Invalid furniture variant "${variantId}": coordinateSystem.axes must be an object`,
  );
  if (
    coordinateSystem.origin !== "floor-center"
    || axes.x !== "right"
    || axes.y !== "up"
    || axes.z !== "front"
  ) {
    fail(variantId, "coordinateSystem must use floor-center, +X right, +Y up, +Z front");
  }
  return {
    origin: "floor-center",
    axes: { x: "right", y: "up", z: "front" },
  };
}

function readDimensions(value: unknown, variantId: string): FurnitureVariantDimensions {
  const dimensions = readRecord(value, `Invalid furniture variant "${variantId}": dimensions must be an object`);
  return {
    width: readPositiveNumber(dimensions.width, "dimensions.width", variantId),
    depth: readPositiveNumber(dimensions.depth, "dimensions.depth", variantId),
    height: readPositiveNumber(dimensions.height, "dimensions.height", variantId),
  };
}

function readAllowedTags(
  value: unknown,
  label: string,
  variantId: string,
  allowed: ReadonlySet<string>,
): string[] {
  const tags = readStringArray(value, label, variantId, false);
  for (const tag of tags) {
    if (!allowed.has(tag)) {
      fail(variantId, `Unsupported ${label} value "${tag}"`);
    }
  }
  return tags;
}

function readStringArray(value: unknown, label: string, variantId: string, requireNonEmpty: boolean): string[] {
  if (!Array.isArray(value) || (requireNonEmpty && value.length === 0)) {
    fail(variantId, `${label} must be ${requireNonEmpty ? "a non-empty" : "an"} array`);
  }
  return value.map((item, index) => readNonBlankString(item, `${label}[${index}]`, variantId));
}

function ensureUniqueStrings(values: string[], label: string, variantId: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      fail(variantId, `Duplicate ${label} "${value}"`);
    }
    seen.add(value);
  }
}

function readPurchaseUrl(value: unknown, variantId: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    fail(variantId, "purchaseUrl must be null or a valid HTTPS URL");
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.length === 0 || url.username || url.password) {
      fail(variantId, "purchaseUrl must be null or a valid HTTPS URL");
    }
    return value;
  } catch (error) {
    if (error instanceof FurnitureVariantValidationError) {
      throw error;
    }
    fail(variantId, "purchaseUrl must be null or a valid HTTPS URL");
  }
}

function readFiniteTuple3(value: unknown, label: string, variantId: string, partId?: string): Vector3Tuple {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    fail(variantId, `${label} must contain exactly 3 finite numbers`, partId);
  }
  return [value[0], value[1], value[2]];
}

function readPositiveTuple3(value: unknown, label: string, variantId: string, partId: string): Vector3Tuple {
  const tuple = readFiniteTuple3(value, label, variantId, partId);
  if (tuple.some((item) => item <= 0)) {
    fail(variantId, `${label} values must all be positive`, partId);
  }
  return tuple;
}

function readFiniteTuple2(value: unknown, label: string, variantId: string, partId: string): Vector2Tuple {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isFiniteNumber)) {
    fail(variantId, `${label} must contain exactly 2 finite numbers`, partId);
  }
  return [value[0], value[1]];
}

function readPositiveNumber(value: unknown, label: string, variantId: string, partId?: string): number {
  if (!isFiniteNumber(value) || value <= 0) {
    fail(variantId, `${label} must be a positive finite number`, partId);
  }
  return value;
}

function readOptionalPositiveNumber(
  value: unknown,
  label: string,
  variantId: string,
  partId: string,
): number | undefined {
  return value === undefined ? undefined : readPositiveNumber(value, label, variantId, partId);
}

function readOptionalPositiveInteger(
  value: unknown,
  label: string,
  variantId: string,
  partId: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || (value as number) <= 0) {
    fail(variantId, `${label} must be a positive integer`, partId);
  }
  return value as number;
}

function readOptionalIntegerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  variantId: string,
  partId: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(variantId, `${label} must be an integer between ${minimum} and ${maximum}`, partId);
  }
  return value as number;
}

function readIntegerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  variantId: string,
  partId: string,
): number {
  const result = readOptionalIntegerInRange(value, label, minimum, maximum, variantId, partId);
  if (result === undefined) {
    fail(variantId, `${label} is required`, partId);
  }
  return result;
}

function readNonBlankString(value: unknown, label: string, variantId: string, partId?: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(variantId, `${label} must be a non-blank string`, partId);
  }
  return value;
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FurnitureVariantValidationError(message);
  }
  return value as Record<string, unknown>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function partMessage(variantId: string, partId: string, message: string): string {
  return `Invalid furniture variant "${variantId}", part "${partId}": ${message}`;
}

function fail(variantId: string, message: string, partId?: string): never {
  throw new FurnitureVariantValidationError(
    partId ? partMessage(variantId, partId, message) : `Invalid furniture variant "${variantId}": ${message}`,
  );
}
