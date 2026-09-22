import { getProductionFurnitureVisualFootprint } from "../furniture/variants/productionFurnitureCatalog";
import type { Furniture, Opening, RoomLayout, Size3D, Vector2D, WallSegment } from "../../types";

export const WALL_CLEARANCE_METERS = 0.02;
export const DEFAULT_WALL_THICKNESS_METERS = 0.12;
export const BOUNDARY_EPSILON = 1e-9;

type RoomBounds = Pick<RoomLayout, "width" | "depth"> & Partial<Pick<RoomLayout, "walls">>;

export interface FurnitureLocalFootprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface FurnitureFootprint extends FurnitureLocalFootprint {
  effectiveWidth: number;
  effectiveDepth: number;
  corners: readonly Vector2D[];
}

export interface RoomUsableBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function resolveFurnitureLocalFootprint(furniture: Furniture): FurnitureLocalFootprint {
  if (furniture.variantId) {
    const visualFootprint = getProductionFurnitureVisualFootprint(furniture.variantId);
    if (visualFootprint) {
      return visualFootprint;
    }
  }

  // A null or unknown variant is rendered by the legacy renderer. Its explicit
  // fallback contract is the centered nominal layout dimensions, with no
  // guessed padding that could drift from the visible legacy geometry.
  return nominalLocalFootprint(furniture.dimensions);
}

export function calculateRotatedFootprint(
  dimensions: Pick<Size3D, "width" | "depth">,
  rotationY: number,
  localFootprint: FurnitureLocalFootprint = nominalLocalFootprint(dimensions),
): FurnitureFootprint {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  const corners = [
    rotate(localFootprint.minX, localFootprint.minZ, cosine, sine),
    rotate(localFootprint.maxX, localFootprint.minZ, cosine, sine),
    rotate(localFootprint.maxX, localFootprint.maxZ, cosine, sine),
    rotate(localFootprint.minX, localFootprint.maxZ, cosine, sine),
  ];
  const xValues = corners.map((corner) => corner.x);
  const zValues = corners.map((corner) => corner.z);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minZ = Math.min(...zValues);
  const maxZ = Math.max(...zValues);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    effectiveWidth: maxX - minX,
    effectiveDepth: maxZ - minZ,
    corners,
  };
}

export function calculateRoomUsableBounds(room: RoomBounds): RoomUsableBounds | null {
  if (!hasFiniteRoom(room)) {
    return null;
  }

  const insets = wallInteriorInsets(room);
  const usable = {
    minX: -room.width / 2 + insets.left + WALL_CLEARANCE_METERS,
    maxX: room.width / 2 - insets.right - WALL_CLEARANCE_METERS,
    minZ: -room.depth / 2 + insets.top + WALL_CLEARANCE_METERS,
    maxZ: room.depth / 2 - insets.bottom - WALL_CLEARANCE_METERS,
  };
  return usable.maxX >= usable.minX && usable.maxZ >= usable.minZ ? usable : null;
}

export function isFurnitureInsideRoom(
  room: RoomBounds,
  dimensions: Pick<Size3D, "width" | "depth">,
  position: Vector2D,
  rotationY: number,
  localFootprint?: FurnitureLocalFootprint,
): boolean {
  if (!hasFinitePosition(position)) {
    return false;
  }
  const usable = calculateRoomUsableBounds(room);
  if (!usable) {
    return false;
  }
  const footprint = calculateRotatedFootprint(dimensions, rotationY, localFootprint);
  return footprint.corners.every((corner) => {
    const x = position.x + corner.x;
    const z = position.z + corner.z;
    return x >= usable.minX - BOUNDARY_EPSILON && x <= usable.maxX + BOUNDARY_EPSILON
      && z >= usable.minZ - BOUNDARY_EPSILON && z <= usable.maxZ + BOUNDARY_EPSILON;
  });
}

export function clampFurniturePositionToRoom(
  room: RoomBounds,
  dimensions: Pick<Size3D, "width" | "depth">,
  position: Vector2D,
  rotationY: number,
  localFootprint?: FurnitureLocalFootprint,
): Vector2D | null {
  if (!hasFinitePosition(position)) {
    return null;
  }
  const usable = calculateRoomUsableBounds(room);
  if (!usable) {
    return null;
  }
  const footprint = calculateRotatedFootprint(dimensions, rotationY, localFootprint);
  const minX = usable.minX - footprint.minX;
  const maxX = usable.maxX - footprint.maxX;
  const minZ = usable.minZ - footprint.minZ;
  const maxZ = usable.maxZ - footprint.maxZ;
  if (maxX < minX - BOUNDARY_EPSILON || maxZ < minZ - BOUNDARY_EPSILON) {
    return null;
  }
  return {
    x: clamp(position.x, minX, maxX),
    z: clamp(position.z, minZ, maxZ),
  };
}

export function moveFurnitureInsideRoom(
  room: RoomBounds,
  furniture: Furniture,
  proposedPosition: Vector2D,
): Furniture {
  const localFootprint = resolveFurnitureLocalFootprint(furniture);
  const position = clampFurniturePositionToRoom(
    room,
    furniture.dimensions,
    proposedPosition,
    furniture.rotationY,
    localFootprint,
  );
  return position ? { ...furniture, position } : furniture;
}

// RoomPlan's measured width/depth for a scanned piece can be off by a few
// centimeters; this lets a user correct it after the fact. Re-clamps the
// existing position/rotation against the new footprint (same as a move/
// rotate) so a resize can't silently leave furniture poking through a wall
// or overlapping its neighbors undetected.
export function resizeFurnitureInsideRoom(
  room: RoomBounds,
  furniture: Furniture,
  proposedDimensions: Pick<Size3D, "width" | "depth">,
): Furniture {
  const dimensions: Size3D = { ...furniture.dimensions, ...proposedDimensions };
  const resized = { ...furniture, dimensions };
  const localFootprint = resolveFurnitureLocalFootprint(resized);
  const position = clampFurniturePositionToRoom(
    room,
    dimensions,
    furniture.position,
    furniture.rotationY,
    localFootprint,
  );
  return position ? { ...resized, position } : resized;
}

export function rotateFurnitureInsideRoom(
  room: RoomBounds,
  furniture: Furniture,
  proposedRotationY: number,
): Furniture {
  const localFootprint = resolveFurnitureLocalFootprint(furniture);
  const position = clampFurniturePositionToRoom(
    room,
    furniture.dimensions,
    furniture.position,
    proposedRotationY,
    localFootprint,
  );
  return position ? { ...furniture, position, rotationY: proposedRotationY } : furniture;
}

// RoomPlan's measured room width/depth can be off by a few centimeters, same
// as an individual piece of furniture. Rescales the room's own walls/openings
// proportionally so the floor/wall geometry stays consistent with the
// corrected width/depth instead of just relabeling it, then re-clamps every
// piece of furniture (scaled to the same proportional position) into the
// resized room so nothing is left poking through a wall.
export function resizeRoomInsideBounds(
  room: RoomLayout,
  next: Partial<Pick<RoomLayout, "width" | "depth" | "height">>,
): RoomLayout {
  const width = next.width ?? room.width;
  const depth = next.depth ?? room.depth;
  const height = next.height ?? room.height;
  const scaleX = room.width > 0 ? width / room.width : 1;
  const scaleZ = room.depth > 0 ? depth / room.depth : 1;
  const scalePoint = (point: Vector2D): Vector2D => ({ x: point.x * scaleX, z: point.z * scaleZ });
  const scaleOpening = (opening: Opening): Opening => ({ ...opening, position: scalePoint(opening.position) });

  const resizedRoom: RoomLayout = {
    ...room,
    width,
    depth,
    height,
    floor: room.floor ? { ...room.floor, size: { width, depth } } : room.floor,
    walls: room.walls.map((wall) => ({ ...wall, start: scalePoint(wall.start), end: scalePoint(wall.end) })),
    doors: room.doors.map(scaleOpening),
    windows: room.windows.map(scaleOpening),
  };

  return {
    ...resizedRoom,
    furniture: room.furniture.map((item) => (
      moveFurnitureInsideRoom(resizedRoom, item, scalePoint(item.position))
    )),
  };
}

export function nominalLocalFootprint(
  dimensions: Pick<Size3D, "width" | "depth">,
): FurnitureLocalFootprint {
  return {
    minX: -dimensions.width / 2,
    maxX: dimensions.width / 2,
    minZ: -dimensions.depth / 2,
    maxZ: dimensions.depth / 2,
  };
}

function wallInteriorInsets(room: RoomBounds) {
  const walls = room.walls ?? [];
  if (walls.length === 0) {
    const inset = DEFAULT_WALL_THICKNESS_METERS / 2;
    return { left: inset, right: inset, top: inset, bottom: inset };
  }

  const insets = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const wall of walls) {
    const side = boundarySide(wall, room.width, room.depth);
    if (!side) {
      continue;
    }
    const thickness = wall.thickness && wall.thickness > 0
      ? wall.thickness
      : DEFAULT_WALL_THICKNESS_METERS;
    const centerX = (wall.start.x + wall.end.x) / 2;
    const centerZ = (wall.start.z + wall.end.z) / 2;
    const centerOffset = boundaryCenterOffset(side, centerX, centerZ, room.width, room.depth);
    insets[side] = Math.max(insets[side], Math.max(0, centerOffset + thickness / 2));
  }
  return insets;
}

function boundarySide(
  wall: WallSegment,
  width: number,
  depth: number,
): "left" | "right" | "top" | "bottom" | null {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const centerX = (wall.start.x + wall.end.x) / 2;
  const centerZ = (wall.start.z + wall.end.z) / 2;
  const tolerance = Math.max(wall.thickness ?? DEFAULT_WALL_THICKNESS_METERS, 0.25);

  if (Math.abs(dz) >= Math.abs(dx)) {
    if (Math.abs(centerX + width / 2) <= tolerance) return "left";
    if (Math.abs(centerX - width / 2) <= tolerance) return "right";
  } else {
    if (Math.abs(centerZ + depth / 2) <= tolerance) return "top";
    if (Math.abs(centerZ - depth / 2) <= tolerance) return "bottom";
  }
  return null;
}

function boundaryCenterOffset(
  side: "left" | "right" | "top" | "bottom",
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): number {
  switch (side) {
    case "left": return centerX + width / 2;
    case "right": return width / 2 - centerX;
    case "top": return centerZ + depth / 2;
    case "bottom": return depth / 2 - centerZ;
  }
}

function rotate(x: number, z: number, cosine: number, sine: number): Vector2D {
  return { x: x * cosine - z * sine, z: x * sine + z * cosine };
}

function clamp(value: number, min: number, max: number): number {
  return Math.abs(max - min) <= BOUNDARY_EPSILON
    ? (min + max) / 2
    : Math.max(min, Math.min(max, value));
}

function hasFiniteRoom(room: RoomBounds): boolean {
  return Number.isFinite(room.width) && Number.isFinite(room.depth)
    && room.width > 0 && room.depth > 0;
}

function hasFinitePosition(position: Vector2D): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.z);
}
