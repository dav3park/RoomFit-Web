import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import { computeLocalValidationIssues } from '../geometry/liveValidation';
import { calculateRotatedFootprint, resolveFurnitureLocalFootprint } from '../components/room/furnitureBoundary';
import { isWindowAnchoredFurniture } from '../components/room/windowBlindPlacement';
import { clearanceZonesWorld } from '../geometry/clearance';
import { obbOverlap, worldCorners } from '../geometry/obb';
import { normalizeCanonicalFurnitureType } from '../config/canonicalFurnitureType';
import type { Furniture, RoomLayout, Vector2D } from '../types';

// RoomViewer's scene group is translated down by 1m; its floor is world y=-1.
export function projectDemoFloor(camera: Camera, rect: {left: number; top: number; width: number; height: number}, x: number, y: number): Vector2D | null {
  if (rect.width <= 0 || rect.height <= 0 || x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return null;
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
  const hit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 1), new Vector3());
  return hit ? { x: hit.x, z: hit.z } : null;
}

export function demoPlacementIssues(room: RoomLayout, item: Furniture) {
  return computeLocalValidationIssues([...room.furniture, item].map(demoGeometryItem), room).filter(issue => issue.furnitureId === item.id || issue.otherFurnitureId === item.id);
}

export function demoPlacementReason(room: RoomLayout, item: Furniture): string | null {
  if (!Number.isFinite(item.position.x) || !Number.isFinite(item.position.z)) return '방 바닥의 위치를 지정해 주세요.';
  const footprint = calculateRotatedFootprint(item.dimensions, -item.rotationY, resolveFurnitureLocalFootprint(item));
  const corners = footprint.corners.map(corner => ({x: item.position.x + corner.x, z: item.position.z + corner.z}));
  if (!demoFloorContains(room, item.position) || corners.some(corner => !demoFloorContains(room, corner)) || crossesRoomWall(room, corners)) return '가구가 방 바닥 범위를 벗어났습니다.';
  if (isWindowAnchoredFurniture(item)) return '창문에 연결하는 가구는 자유 배치를 지원하지 않습니다.';
  // Overlapping furniture is allowed in the local editor; collision highlights remain visible.
  return null;
}

export function demoFloorContains(room: RoomLayout, point: Vector2D): boolean {
  const walls = room.walls;
  if (walls.length < 3 || Math.hypot(walls.at(-1)!.end.x - walls[0].start.x, walls.at(-1)!.end.z - walls[0].start.z) > .02) return Math.abs(point.x) <= room.width / 2 && Math.abs(point.z) <= room.depth / 2;
  let inside = false;
  for (const wall of walls) {
    const a = wall.start, b = wall.end;
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// Same 0.8m depth / 0.1m lateral margins as ValidationService. No hinge or swing direction is inferred.
export function demoDoorZone(room: RoomLayout, door: RoomLayout['doors'][number]): Vector2D[] {
  const wall = room.walls.find(wall => wall.id === door.wallId);
  if (!wall) return [];
  const dx = wall.end.x - wall.start.x, dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return [];
  const x = dx / length, z = dz / length;
  let nx = -z, nz = x;
  if (!demoFloorContains(room, {x: door.position.x + nx * .4, z: door.position.z + nz * .4})) { nx = -nx; nz = -nz; }
  if (!demoFloorContains(room, {x: door.position.x + nx * .4, z: door.position.z + nz * .4})) return [];
  const half = door.dimensions.width / 2 + .1;
  const a = {x: door.position.x - x * half, z: door.position.z - z * half};
  const b = {x: door.position.x + x * half, z: door.position.z + z * half};
  return [a, b, {x: b.x + nx * .8, z: b.z + nz * .8}, {x: a.x + nx * .8, z: a.z + nz * .8}];
}

// Illustrative inward 90-degree swing; hinge side is not present in room data.
// Manual drops remain allowed; the recommendation engine also checks this assumed swing.
export function demoDoorSwing(room: RoomLayout, door: RoomLayout['doors'][number]): Vector2D[] {
  const wall = room.walls.find(wall => wall.id === door.wallId) ?? room.walls.reduce<RoomLayout['walls'][number] | undefined>((closest, wall) => {
    const distance = (w: RoomLayout['walls'][number]) => {
      const dx = w.end.x-w.start.x, dz = w.end.z-w.start.z;
      const t = Math.max(0, Math.min(1, ((door.position.x-w.start.x)*dx+(door.position.z-w.start.z)*dz)/(dx*dx+dz*dz || 1)));
      return Math.hypot(door.position.x-w.start.x-t*dx, door.position.z-w.start.z-t*dz);
    };
    return !closest || distance(wall)<distance(closest) ? wall : closest;
  }, undefined);
  if (!wall || door.dimensions.width <= 0) return [];
  const length = Math.hypot(wall.end.x-wall.start.x, wall.end.z-wall.start.z);
  if (length < 1e-6) return [];
  const x = (wall.end.x-wall.start.x)/length, z = (wall.end.z-wall.start.z)/length;
  let nx = -z, nz = x;
  if (!demoFloorContains(room, {x:door.position.x+nx*.2,z:door.position.z+nz*.2})) { nx=-nx; nz=-nz; }
  const radius = door.dimensions.width;
  const hinge = {x:door.position.x-x*radius/2,z:door.position.z-z*radius/2};
  return [hinge, ...Array.from({length:33}, (_,i) => {
    const a=i/32*Math.PI/2;
    return {x:hinge.x+radius*(x*Math.cos(a)+nx*Math.sin(a)),z:hinge.z+radius*(z*Math.cos(a)+nz*Math.sin(a))};
  })];
}

export function crossesRoomWall(room: RoomLayout, corners: Vector2D[]): boolean {
  const cross = (a: Vector2D, b: Vector2D, c: Vector2D) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  return corners.some((a,index) => {
    const b = corners[(index+1)%corners.length];
    return room.walls.some(({start:c,end:d}) => cross(a,b,c)*cross(a,b,d)<-1e-10 && cross(c,d,a)*cross(c,d,b)<-1e-10);
  });
}

// Three.js rotates x/z clockwise for positive Y; shared 2D helpers use the opposite sign.
function demoGeometryItem(item: Furniture): Furniture {
  return {...item, rotationY: -item.rotationY};
}

export type DemoSpaceStatus = 'clear' | 'warning' | 'blocked';
export const DEMO_SPACE_COLORS: Record<DemoSpaceStatus, string> = {
  clear: '#1677e8', warning: '#f59e0b', blocked: '#ef4444',
};

// Demo policy: access recommendations may be obstructed (orange); opening
// approximations must remain free (red). Product-specific opening metadata is absent.
export function demoZoneIsOpening(item: Furniture, side: string): boolean {
  const type = normalizeCanonicalFurnitureType(item.sourceType ?? item.category);
  return side === 'front' && (type === 'wardrobe' || type === 'drawer_chest'
    || (item.sourceType ?? '').toLowerCase() === 'storage');
}

/** One local display policy for existing, added and preview furniture. Never rejects a drop. */
export function demoOverlapHighlights(room: RoomLayout) {
  const bodies = new Set<string>();
  const clearance = new Map<string, Set<string>>();
  const doors = new Set<string>();
  const status = new Map<string, DemoSpaceStatus>();
  const zoneStatus = new Map<string, Map<string, DemoSpaceStatus>>();
  const reasons = new Map<string, string[]>();
  const active = room.furniture.filter(item => item.status !== 'deleted');
  const physical = active.filter(item => normalizeCanonicalFurnitureType(item.sourceType ?? item.category) !== 'rug');
  const corners = new Map(physical.map(item => [item.id, worldCorners(item.position, calculateRotatedFootprint(item.dimensions,-item.rotationY,resolveFurnitureLocalFootprint(item)))]));
  const rank = {clear: 0, warning: 1, blocked: 2};
  active.forEach(item => status.set(item.id, 'clear'));
  const markItem = (id: string, level: DemoSpaceStatus, reason: string) => {
    if (rank[level] > rank[status.get(id) ?? 'clear']) status.set(id, level);
    if (!reasons.has(id)) reasons.set(id, []);
    if (!reasons.get(id)!.includes(reason)) reasons.get(id)!.push(reason);
  };
  const markZone = (item: Furniture, side: string, reason: string, otherId?: string) => {
    const level = demoZoneIsOpening(item, side) ? 'blocked' : 'warning';
    if (!clearance.has(item.id)) clearance.set(item.id,new Set());
    clearance.get(item.id)!.add(side);
    if (!zoneStatus.has(item.id)) zoneStatus.set(item.id, new Map());
    zoneStatus.get(item.id)!.set(side, level);
    markItem(item.id, level, reason);
    if (otherId) markItem(otherId, level, reason);
  };
  // Reuse shared support/stack exemptions, including desk + chair and monitor + desk.
  const issues = computeLocalValidationIssues(room.furniture.map(demoGeometryItem),room);
  for (const issue of issues) {
    if (issue.type === 'BODY_COLLISION' || issue.type === 'OUT_OF_BOUNDS') {
      bodies.add(issue.furnitureId);
      markItem(issue.furnitureId, 'blocked', issue.message);
      if (issue.otherFurnitureId) {
        bodies.add(issue.otherFurnitureId);
        markItem(issue.otherFurnitureId, 'blocked', issue.message);
      }
    }
    if (!issue.otherFurnitureId || (issue.type !== 'BODY_COLLISION' && issue.type !== 'ZONE_INTRUSION')) continue;
    const pairs = issue.type === 'BODY_COLLISION'
      ? [[issue.furnitureId,issue.otherFurnitureId],[issue.otherFurnitureId,issue.furnitureId]]
      : [[issue.furnitureId,issue.otherFurnitureId]];
    for (const [owner, other] of pairs) {
      const item = physical.find(item => item.id === owner)!;
      for (const zone of clearanceZonesWorld(demoGeometryItem(item))) {
        if (obbOverlap(zone.corners,corners.get(other)!)) {
          markZone(item,zone.side, demoZoneIsOpening(item,zone.side)
            ? `${item.name}: 개폐 공간 침범 (근사치)` : `${item.name}: 권장 접근 공간 일부 침범`, other);
        }
      }
    }
  }
  // A wall can obstruct clearance even when the furniture body fits inside the room.
  for (const item of physical) for (const zone of clearanceZonesWorld(demoGeometryItem(item))) {
    const center = zone.corners.reduce((p,c) => ({x:p.x+c.x/zone.corners.length,z:p.z+c.z/zone.corners.length}), {x:0,z:0});
    // Test slightly inset vertices so touching a wall alone is not an intrusion.
    const outside = zone.corners.some(p => !demoFloorContains(room,{x:p.x+(center.x-p.x)*1e-6,z:p.z+(center.z-p.z)*1e-6}));
    if (outside || crossesRoomWall(room,zone.corners)) markZone(item,zone.side,
      demoZoneIsOpening(item,zone.side) ? `${item.name}: 개폐 공간이 방 경계를 벗어남 (근사치)` : `${item.name}: 권장 접근 공간이 방 경계를 벗어남`);
  }
  for (const door of room.doors) {
    const swing=demoDoorSwing(room,door);
    if (!swing.length) continue;
    for (const item of physical) if (obbOverlap(swing,corners.get(item.id)!)) {
      doors.add(door.id);
      markItem(item.id,'blocked',`${door.label || '문'}: 90° 개폐 공간 침범 (안쪽 열림 가정)`);
    }
  }
  return {bodies,clearance,doors,status,zoneStatus,reasons};
}
