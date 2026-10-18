import { createSculptedFurnitureGeometry } from "../src/geometry/sculptedFurnitureGeometry.mjs";
import {
  Box3,
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const DEFAULT_ROUNDED_BOX_RADIUS = 0.02;
const DEFAULT_ROUNDED_BOX_SMOOTHNESS = 4;
const DEFAULT_CYLINDER_SEGMENTS = 32;
const DEFAULT_ROUNDED_BOX_RADIUS_RATIO = 0.35;
const MAX_ROUNDED_BOX_RADIUS_RATIO = 0.5;

export function computeVariantVisualFootprint(variant) {
  const bounds = new Box3().makeEmpty();

  for (const part of variant.parts) {
    const geometry = createGeometry(part);
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      const rotation = part.rotation ?? [0, 0, 0];
      const transform = new Matrix4().compose(
        new Vector3(...part.position),
        new Quaternion().setFromEuler(new Euler(...rotation, "XYZ")),
        new Vector3(1, 1, 1),
      );
      if (["mesh", "sweep", "profile"].includes(part.geometry)) {
        geometry.applyMatrix4(transform);
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox);
      } else bounds.union(geometry.boundingBox.clone().applyMatrix4(transform));
    }
    geometry.dispose();
  }

  if (bounds.isEmpty()) {
    throw new Error(`Variant "${variant.variantId}" has no visual bounds`);
  }

  return {
    minX: round(bounds.min.x),
    maxX: round(bounds.max.x),
    minZ: round(bounds.min.z),
    maxZ: round(bounds.max.z),
  };
}

function createGeometry(part) {
  switch (part.geometry) {
    case "mesh":
    case "profile":
    case "sweep":
      return createSculptedFurnitureGeometry(part);
    case "box":
      return new BoxGeometry(...part.size);
    case "roundedBox": {
      const smallestSize = Math.min(...part.size);
      const radius = part.radius === undefined
        ? Math.min(DEFAULT_ROUNDED_BOX_RADIUS, smallestSize * DEFAULT_ROUNDED_BOX_RADIUS_RATIO)
        : Math.min(part.radius, smallestSize * MAX_ROUNDED_BOX_RADIUS_RATIO);
      return new RoundedBoxGeometry(
        part.size[0],
        part.size[1],
        part.size[2],
        part.smoothness ?? DEFAULT_ROUNDED_BOX_SMOOTHNESS,
        radius,
      );
    }
    case "cylinder":
      return new CylinderGeometry(
        part.size[0],
        part.size[1],
        part.size[2],
        part.radialSegments ?? DEFAULT_CYLINDER_SEGMENTS,
      );
    case "extrudedPolygon":
      return createExtrudedPolygonGeometry(part);
    case "curtain":
      return createCurtainGeometry(part);
    case "ellipsoid": {
      const geometry = new SphereGeometry(0.5, 32, 16);
      geometry.scale(part.size[0], part.size[1], part.size[2]);
      return geometry;
    }
    case "leaf":
      return createLeafGeometry(part);
    case "planter":
      return new CylinderGeometry(part.size[0] / 2, part.size[1] / 2, part.size[2], part.segments);
    case "tube":
      return new TubeGeometry(
        new CatmullRomCurve3(part.curvePoints.map((point) => new Vector3(...point))),
        part.tubularSegments,
        part.radius,
        part.radialSegments,
        false,
      );
    default:
      throw new Error(`Unsupported geometry "${part.geometry}" in variant "${part.id}"`);
  }
}

function createCurtainGeometry(part) {
  const [width, height, depth] = part.size;
  const geometry = new PlaneGeometry(width, height, part.segmentsX, part.segmentsY);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const normalizedX = positions.getX(index) / width + 0.5;
    positions.setZ(index, Math.sin(normalizedX * part.folds * Math.PI * 2) * depth / 2);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createLeafGeometry(part) {
  const controlX = part.width * 2 / 3;
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(controlX, part.height / 4, controlX, part.height * 3 / 4, 0, part.height);
  shape.bezierCurveTo(-controlX, part.height * 3 / 4, -controlX, part.height / 4, 0, 0);
  return new ShapeGeometry(shape, part.curveSegments);
}

function createExtrudedPolygonGeometry(part) {
  const shape = new Shape();
  const [first, ...remaining] = part.points;
  shape.moveTo(first[0], -first[1]);
  for (const point of remaining) {
    shape.lineTo(point[0], -point[1]);
  }
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: part.height,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -part.height / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function round(value) {
  return Number(value.toFixed(9));
}
