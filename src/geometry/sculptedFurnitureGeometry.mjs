import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  LatheGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';

/** Geometry used by rendering and bounds/connection QA, so their silhouettes cannot drift. */
export function createSculptedFurnitureGeometry(part) {
  assertSculptedFurniturePart(part);
  if (part.geometry === 'profile') {
    return new LatheGeometry(
      part.profile.map(([r, y]) => new Vector2(r, y)),
      part.segments,
    );
  }
  if (part.geometry === 'sweep') {
    const curve = new CatmullRomCurve3(
      part.points.map((p) => new Vector3(...p)),
      part.closed ?? false,
      'centripetal',
    );
    return new TubeGeometry(
      curve,
      part.segments,
      part.radius,
      part.radialSegments,
      part.closed ?? false,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(part.vertices, 3),
  );
  geometry.setIndex([...part.indices]);
  geometry.computeVertexNormals();
  return geometry;
}

export function assertSculptedFurniturePart(part) {
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const positive = value => finite(value) && value > 0;
  const segments = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const points = (value, count, size) => Array.isArray(value) && value.length >= count
    && value.every(point => Array.isArray(point) && point.length === size && point.every(finite));
  let valid = false;
  if (part.geometry === 'mesh') {
    valid = Array.isArray(part.vertices) && part.vertices.length >= 9 && part.vertices.length % 3 === 0
      && part.vertices.every(finite) && Array.isArray(part.indices) && part.indices.length >= 3
      && part.indices.length % 3 === 0 && part.indices.every(index => Number.isInteger(index)
        && index >= 0 && index < part.vertices.length / 3);
  } else if (part.geometry === 'profile') {
    valid = points(part.profile, 2, 2) && part.profile.every(point => point[0] >= 0)
      && part.profile.some(point => point[0] > 0) && segments(part.segments, 3, 256);
  } else if (part.geometry === 'sweep') {
    valid = points(part.points, 2, 3) && positive(part.radius) && segments(part.segments, 1, 2048)
      && segments(part.radialSegments, 3, 128) && (part.closed === undefined || typeof part.closed === 'boolean');
  }
  if (!valid) throw new Error(`Invalid ${part.geometry} geometry in part ${part.id}`);
}
