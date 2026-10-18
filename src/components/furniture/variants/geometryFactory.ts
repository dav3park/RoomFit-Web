import { createSculptedFurnitureGeometry } from "../../../geometry/sculptedFurnitureGeometry.mjs";
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
import type { BufferGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type {
  CurtainFurniturePart,
  ExtrudedPolygonFurniturePart,
  FurniturePart,
  LeafFurniturePart,
  TubeFurniturePart,
  ValidatedFurniturePart,
  ValidatedFurnitureVariant,
} from "./types";

const DEFAULT_ROUNDED_BOX_RADIUS = 0.02;
const DEFAULT_ROUNDED_BOX_SMOOTHNESS = 4;
const DEFAULT_CYLINDER_SEGMENTS = 32;
const DEFAULT_ROUNDED_BOX_RADIUS_RATIO = 0.35;
const MAX_ROUNDED_BOX_RADIUS_RATIO = 0.5;

export function createFurniturePartGeometry(
  definition: FurniturePart | ValidatedFurniturePart,
): BufferGeometry {
  switch (definition.geometry) {
    case "mesh":
    case "profile":
    case "sweep":
      return createSculptedFurnitureGeometry(definition);
    case "box":
      return new BoxGeometry(...definition.size);
    case "roundedBox": {
      const smallestSize = Math.min(...definition.size);
      const radius = definition.radius === undefined
        ? Math.min(DEFAULT_ROUNDED_BOX_RADIUS, smallestSize * DEFAULT_ROUNDED_BOX_RADIUS_RATIO)
        : Math.min(definition.radius, smallestSize * MAX_ROUNDED_BOX_RADIUS_RATIO);
      return new RoundedBoxGeometry(
        definition.size[0],
        definition.size[1],
        definition.size[2],
        definition.smoothness ?? DEFAULT_ROUNDED_BOX_SMOOTHNESS,
        radius,
      );
    }
    case "cylinder":
      return new CylinderGeometry(
        definition.size[0],
        definition.size[1],
        definition.size[2],
        definition.radialSegments ?? DEFAULT_CYLINDER_SEGMENTS,
      );
    case "extrudedPolygon":
      return createExtrudedPolygonGeometry(definition);
    case "curtain":
      return createCurtainGeometry(definition);
    case "ellipsoid": {
      const geometry = new SphereGeometry(0.5, 32, 16);
      geometry.scale(definition.size[0], definition.size[1], definition.size[2]);
      return geometry;
    }
    case "leaf":
      return createLeafGeometry(definition);
    case "planter":
      return new CylinderGeometry(
        definition.size[0] / 2,
        definition.size[1] / 2,
        definition.size[2],
        definition.segments,
      );
    case "tube":
      return createTubeGeometry(definition);
  }
}

function createCurtainGeometry(definition: CurtainFurniturePart): PlaneGeometry {
  const [width, height, depth] = definition.size;
  const geometry = new PlaneGeometry(width, height, definition.segmentsX, definition.segmentsY);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const normalizedX = positions.getX(index) / width + 0.5;
    positions.setZ(index, Math.sin(normalizedX * definition.folds * Math.PI * 2) * depth / 2);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createLeafGeometry(definition: LeafFurniturePart): ShapeGeometry {
  const controlX = definition.width * 2 / 3;
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(
    controlX,
    definition.height / 4,
    controlX,
    definition.height * 3 / 4,
    0,
    definition.height,
  );
  shape.bezierCurveTo(
    -controlX,
    definition.height * 3 / 4,
    -controlX,
    definition.height / 4,
    0,
    0,
  );
  return new ShapeGeometry(shape, definition.curveSegments);
}

function createTubeGeometry(definition: TubeFurniturePart): TubeGeometry {
  const curve = new CatmullRomCurve3(definition.curvePoints.map((point) => new Vector3(...point)));
  return new TubeGeometry(
    curve,
    definition.tubularSegments,
    definition.radius,
    definition.radialSegments,
    false,
  );
}

export function computeFurnitureVariantBounds(variant: ValidatedFurnitureVariant): Box3 {
  const bounds = new Box3().makeEmpty();

  for (const part of variant.parts) {
    const geometry = createFurniturePartGeometry(part);
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      const transform = new Matrix4().compose(
        new Vector3(...part.position),
        new Quaternion().setFromEuler(new Euler(...part.rotation, "XYZ")),
        new Vector3(1, 1, 1),
      );
      if (["mesh", "sweep", "profile"].includes(part.geometry)) {
        geometry.applyMatrix4(transform);
        geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox!);
      } else bounds.union(geometry.boundingBox.clone().applyMatrix4(transform));
    }
    geometry.dispose();
  }

  return bounds;
}

function createExtrudedPolygonGeometry(definition: ExtrudedPolygonFurniturePart): ExtrudeGeometry {
  const shape = new Shape();
  const [first, ...remaining] = definition.points;

  // Shape uses XY and ExtrudeGeometry extrudes along +Z. Negating the source
  // Z coordinate and rotating -90 degrees around X maps the polygon back to
  // RoomFit's XZ plane while mapping extrusion thickness to +Y.
  shape.moveTo(first[0], -first[1]);
  for (const point of remaining) {
    shape.lineTo(point[0], -point[1]);
  }
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: definition.height,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -definition.height / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}
