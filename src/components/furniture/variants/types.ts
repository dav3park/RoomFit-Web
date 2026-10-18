export const FURNITURE_VARIANT_SCHEMA_VERSION = "1.0" as const;

export const FURNITURE_STYLE_TAGS = [
  "minimal",
  "natural",
  "modern",
  "classic",
  "midcentury",
] as const;

export const FURNITURE_LIFESTYLE_TAGS = [
  "REST",
  "WORK_STUDY",
  "STORAGE",
  "HOBBY_LEISURE",
] as const;

export type FurnitureStyleTag = (typeof FURNITURE_STYLE_TAGS)[number];
export type FurnitureLifestyleTag = (typeof FURNITURE_LIFESTYLE_TAGS)[number];
export type Vector2Tuple = [number, number];
export type Vector3Tuple = [number, number, number];

export interface FurnitureVariantDimensions {
  width: number;
  depth: number;
  height: number;
}

export interface FurnitureCoordinateSystem {
  origin: "floor-center";
  axes: {
    x: "right";
    y: "up";
    z: "front";
  };
}

interface FurniturePartBase {
  id: string;
  material: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
}

export interface BoxFurniturePart extends FurniturePartBase {
  geometry: "box";
  size: Vector3Tuple;
}

export interface RoundedBoxFurniturePart extends FurniturePartBase {
  geometry: "roundedBox";
  size: Vector3Tuple;
  radius?: number;
  smoothness?: number;
}

export interface CylinderFurniturePart extends FurniturePartBase {
  geometry: "cylinder";
  size: Vector3Tuple;
  radialSegments?: number;
}

export interface ExtrudedPolygonFurniturePart extends FurniturePartBase {
  geometry: "extrudedPolygon";
  points: Vector2Tuple[];
  height: number;
  bevel?: false;
}

export interface CurtainFurniturePart extends FurniturePartBase {
  geometry: "curtain";
  size: Vector3Tuple;
  folds: number;
  segmentsX: number;
  segmentsY: number;
}

export interface EllipsoidFurniturePart extends FurniturePartBase {
  geometry: "ellipsoid";
  size: Vector3Tuple;
}

export interface LeafFurniturePart extends FurniturePartBase {
  geometry: "leaf";
  width: number;
  height: number;
  curveSegments: number;
}

export interface PlanterFurniturePart extends FurniturePartBase {
  geometry: "planter";
  size: Vector3Tuple;
  segments: number;
}

export interface TubeFurniturePart extends FurniturePartBase {
  geometry: "tube";
  curvePoints: Vector3Tuple[];
  radius: number;
  tubularSegments: number;
  radialSegments: number;
}

export interface MeshFurniturePart extends FurniturePartBase {
  geometry: "mesh";
  vertices: number[];
  indices: number[];
}
export interface ProfileFurniturePart extends FurniturePartBase {
  geometry: "profile";
  profile: Vector2Tuple[];
  segments: number;
}
export interface SweepFurniturePart extends FurniturePartBase {
  geometry: "sweep";
  points: Vector3Tuple[];
  radius: number;
  segments: number;
  radialSegments: number;
  closed?: boolean;
}

export type FurniturePart =
  | BoxFurniturePart
  | RoundedBoxFurniturePart
  | CylinderFurniturePart
  | ExtrudedPolygonFurniturePart
  | CurtainFurniturePart
  | EllipsoidFurniturePart
  | LeafFurniturePart
  | PlanterFurniturePart
  | TubeFurniturePart
  | MeshFurniturePart
  | ProfileFurniturePart
  | SweepFurniturePart;

export interface FurnitureVariant {
  schemaVersion: typeof FURNITURE_VARIANT_SCHEMA_VERSION;
  variantId: string;
  name: string;
  furnitureType: string;
  furnitureTypeCode: string;
  variant: string;
  units: "meter";
  coordinateSystem: FurnitureCoordinateSystem;
  rotationUnit: "radian";
  dimensions: FurnitureVariantDimensions;
  materials: string[];
  parts: FurniturePart[];
  styleTags: FurnitureStyleTag[];
  lifestyleTags: FurnitureLifestyleTag[];
  purchaseUrl: string | null;
}

export type ValidatedFurniturePart = FurniturePart & { rotation: Vector3Tuple };

export interface ValidatedFurnitureVariant extends Omit<FurnitureVariant, "parts"> {
  parts: ValidatedFurniturePart[];
}
