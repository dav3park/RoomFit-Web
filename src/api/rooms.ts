import { isAxiosError } from "axios";

import { apiClient } from "./client";
import type { Furniture, FurnitureCategory, FurnitureStatus, Opening, RoomLayout, Vector2D, WallSegment } from "../types";
import { normalizeCanonicalFurnitureType } from "../config/canonicalFurnitureType";
import { FIXTURE_LABELS, normalizeFixtureType } from "../config/fixtureType";
import {
  clampFurniturePositionToRoom,
  resolveFurnitureLocalFootprint,
} from "../components/room/furnitureBoundary";

export interface SampleRoomApiItem {
  roomId: number;
  name: string;
  room: {
    width: number;
    depth: number;
    height: number;
    unit: string;
  };
  walls?: Array<{
    id: string;
    start: { x: number; z: number };
    end: { x: number; z: number };
    height: number;
    thickness: number;
  }>;
  openings: Array<{
    id: string;
    type: "door" | "window" | string;
    // A `walls[].id` reference (backend/iOS now send this). Older uploads may
    // still carry a legacy cardinal-side string ("north"/"east"/"south"/"west");
    // `openingPosition()` below falls back to the old rectangle-idealized math
    // for those.
    wall: string;
    offset: number;
    width: number;
    height: number;
    sillHeight: number | null;
  }>;
  furniture: Array<{
    id: string;
    type: string;
    label: string;
    width: number;
    depth: number;
    height: number;
    position: {
      x: number;
      z: number;
    };
    rotation: number;
    status: "EXISTING" | "RECOMMENDED" | string;
    productId: string | null;
    variantId: string | null;
    styleTags: string[];
    // 벽걸이(상부장·TV 등)면 "WALL" + 바닥에서 밑면까지 높이. 없거나 null이면 바닥 가구.
    mount?: "FLOOR" | "WALL" | null;
    elevation?: number | null;
  }>;
  source: string;
  createdAt: string;
  // Base64-encoded JPEG snapshot the iOS app takes at scan completion (see
  // RoomScanController.swift's exportJSONData). Undefined for sample rooms
  // and any upload predating this field.
  thumbnailBase64?: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  } | null;
}

export interface SampleRoomCard {
  roomId: number;
  title: string;
  size: string;
  tone: string;
  category: string;
  layoutId: string;
  layout: RoomLayout;
  // data: URI built from the backend's thumbnailBase64 (see SampleRoomApiItem)
  // — undefined when the room has no real snapshot, so callers fall back to
  // the tone-based illustration.
  thumbnailUrl?: string;
}

export interface UploadedRoomCard extends SampleRoomCard {
  source: string;
  createdAt: string;
  dimensions: string;
}

export interface RoomUploadApiRequest {
  name: string;
  room: {
    width: number;
    depth: number;
    height: number;
    unit: string;
  };
  walls: Array<{
    id: string;
    start: { x: number; z: number };
    end: { x: number; z: number };
    height: number;
    thickness: number;
  }>;
  openings: Array<{
    id: string;
    type: "door" | "window";
    // `walls[].id` this opening belongs to.
    wall: string;
    offset: number;
    width: number;
    height: number;
    sillHeight: number | null;
  }>;
  furniture: Array<{
    id: string;
    type: string;
    label: string;
    width: number;
    depth: number;
    height: number;
    position: { x: number; z: number };
    rotation: number;
    status: "EXISTING" | "RECOMMENDED";
    mount?: "WALL";
    elevation?: number;
  }>;
}

type CollectorAppearance = Pick<Furniture, "color" | "material" | "geometry">;

// The backend deliberately keeps its generic furniture schema. These stable
// sample-only IDs supply the visual palette without adding API-only fields.
const collectorAppearanceById: Record<string, CollectorAppearance> = {
  "collector-bed": { color: "#F7F1E8", material: { type: "fabric", color: "#F7F1E8", roughness: 0.9, metalness: 0 }, geometry: "box" },
  "collector-bedside": { color: "#B64535", material: { type: "wood", color: "#B64535", roughness: 0.48, metalness: 0 }, geometry: "box" },
  "collector-floor-plant": { color: "#2F6B3F", material: { type: "accent", color: "#2F6B3F", roughness: 0.8, metalness: 0 }, geometry: "cylinder" },
  "collector-desk": { color: "#8C5632", material: { type: "wood", color: "#8C5632", roughness: 0.55, metalness: 0 }, geometry: "box" },
  "collector-desk-chair": { color: "#8C5632", material: { type: "wood", color: "#8C5632", roughness: 0.55, metalness: 0 }, geometry: "box" },
  "collector-blue-cabinet": { color: "#1E63C6", material: { type: "wood", color: "#1E63C6", roughness: 0.42, metalness: 0.08 }, geometry: "box" },
  "collector-glass-shelf": { color: "#E8EEF1", material: { type: "glass", color: "#E8EEF1", roughness: 0.08, metalness: 0.35 }, geometry: "box" },
  "collector-console": { color: "#F7F1E8", material: { type: "white", color: "#F7F1E8", roughness: 0.68, metalness: 0 }, geometry: "box" },
  "collector-red-shelf": { color: "#B64535", material: { type: "wood", color: "#B64535", roughness: 0.46, metalness: 0 }, geometry: "box" },
  "collector-lounge-chair": { color: "#D98272", material: { type: "fabric", color: "#D98272", roughness: 0.82, metalness: 0 }, geometry: "rounded-box" },
  "collector-cane-chair": { color: "#C99A68", material: { type: "wood", color: "#C99A68", roughness: 0.66, metalness: 0 }, geometry: "box" },
  "collector-rug": { color: "#F7F1E8", material: { type: "fabric", color: "#F7F1E8", roughness: 0.94, metalness: 0 }, geometry: "cylinder" },
  "collector-coffee-table": { color: "#E8EEF1", material: { type: "glass", color: "#E8EEF1", roughness: 0.08, metalness: 0.35 }, geometry: "cylinder" },
};

export async function getSampleRooms(): Promise<SampleRoomCard[]> {
  const response = await apiClient.get<ApiResponse<SampleRoomApiItem[]>>("/api/rooms/samples", {
    roomfitClientScope: "PUBLIC",
  });
  return response.data.data.map(toSampleRoomCard);
}

export async function getSampleRoomLayouts(): Promise<RoomLayout[]> {
  const response = await apiClient.get<ApiResponse<SampleRoomApiItem[]>>("/api/rooms/samples", {
    roomfitClientScope: "PUBLIC",
  });
  return response.data.data.map(toRoomLayout);
}

export async function getRecentUploadedRooms(
  limit = 10,
  clientId?: string,
  signal?: AbortSignal,
): Promise<UploadedRoomCard[]> {
  const response = await apiClient.get<ApiResponse<SampleRoomApiItem[]>>("/api/rooms/uploads/recent", {
    params: { limit },
    ...(signal ? { signal } : {}),
    ...(clientId ? {
      roomfitClientScope: "EXPLICIT" as const,
      roomfitClientIdOverride: clientId,
    } : {}),
  });
  const cards = response.data.data.map(toUploadedRoomCard);

  // Temporary client-side patch: the backend's room store is in-memory only
  // (see RoomFit-Backend's RoomRepository) and resets on every server
  // restart, so a freshly-reset room can land without a thumbnail even
  // though it's a re-scan of a room that used to have one. The backend's
  // own data is never touched here — this only borrows a thumbnailUrl for
  // display. Prefer the next-most-recent upload sharing the same name
  // (`cards` is sorted newest-first, so that's literally "the previous
  // version of this room"); if none exists (e.g. right after a reset, where
  // this may be the only entry left with that name), fall back to whatever
  // other room still has a real thumbnail so the card never shows blank.
  return cards.map((card) => {
    if (card.thumbnailUrl) {
      return card;
    }
    const others = cards.filter((other) => other !== card);
    const previousVersion = others.find((other) => other.title === card.title && other.thumbnailUrl);
    const anyOtherThumbnail = others.find((other) => other.thumbnailUrl);
    const borrowed = previousVersion ?? anyOtherThumbnail;
    return borrowed ? { ...card, thumbnailUrl: borrowed.thumbnailUrl } : card;
  });
}

export async function getRoomById(roomId: number): Promise<UploadedRoomCard> {
  const response = await apiClient.get<ApiResponse<SampleRoomApiItem>>(`/api/rooms/${roomId}`);
  return toUploadedRoomCard(response.data.data, 0);
}

export async function uploadRoomLayout(room: RoomLayout): Promise<number> {
  const sampleRoomId = room.source === "SAMPLE" ? readApiRoomId(room.id) : null;
  if (room.source === "SAMPLE") {
    if (sampleRoomId === null) throw new Error("샘플 Room ID가 올바르지 않습니다.");
    const response = await apiClient.post<ApiResponse<SampleRoomApiItem>>(
      `/api/rooms/${sampleRoomId}/copy`,
    );
    return response.data.data.roomId;
  }

  const response = await apiClient.post<ApiResponse<SampleRoomApiItem>>(
    "/api/rooms/upload",
    toRoomUploadRequest(room),
  );

  return response.data.data.roomId;
}

// 벽걸이 정보를 빠뜨리면 저장 왕복 후 상부장이 바닥으로 내려앉고 아래 싱크대와 충돌로 판정된다.
function wallMountFields(item: Furniture): { mount: "WALL"; elevation: number } | Record<string, never> {
  return item.mount === "WALL" && item.elevation !== undefined
    ? { mount: "WALL", elevation: item.elevation }
    : {};
}

function toFurnitureStatusApiValue(status: FurnitureStatus) {
  const values = {
    existing: "EXISTING",
    recommended: "RECOMMENDED",
    user_modified: "USER_MODIFIED",
    deleted: "DELETED",
  } as const satisfies Record<FurnitureStatus, string>;
  return values[status];
}

export function toRoomFurnitureReplaceRequest(room: RoomLayout) {
  return {
    furniture: room.furniture.map((item) => ({
      id: item.id,
      type: item.sourceType ?? item.category,
      label: item.name,
      width: item.dimensions.width,
      depth: item.dimensions.depth,
      height: item.dimensions.height,
      position: {
        x: item.position.x + room.width / 2,
        z: item.position.z + room.depth / 2,
      },
      rotation: normalizeDegrees((-item.rotationY * 180) / Math.PI),
      status: toFurnitureStatusApiValue(item.status),
      ...wallMountFields(item),
    })),
  };
}

export async function replaceRoomFurniture(roomId: number, room: RoomLayout): Promise<RoomLayout> {
  const response = await apiClient.put<ApiResponse<SampleRoomApiItem>>(
    `/api/rooms/${roomId}/layout`,
    toRoomFurnitureReplaceRequest(room),
  );
  return toUploadedRoomCard(response.data.data, 0).layout;
}

function readApiRoomId(roomLayoutId: string): number | null {
  const match = /^api-room-(\d+)$/.exec(roomLayoutId);
  if (!match) return null;
  const roomId = Number(match[1]);
  return Number.isInteger(roomId) && roomId > 0 ? roomId : null;
}

export function toRoomUploadRequest(room: RoomLayout): RoomUploadApiRequest {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;

  return {
    name: room.name,
    room: {
      width: room.width,
      depth: room.depth,
      height: room.height ?? 2.4,
      unit: room.unit ?? "meter",
    },
    // RoomViewer uses a center-origin coordinate system, while the upload
    // contract uses a 0..width / 0..depth corner origin.
    walls: room.walls.map((wall) => ({
      id: wall.id,
      start: { x: wall.start.x + halfWidth, z: wall.start.z + halfDepth },
      end: { x: wall.end.x + halfWidth, z: wall.end.z + halfDepth },
      height: wall.height ?? room.height ?? 2.4,
      thickness: wall.thickness ?? 0.12,
    })),
    openings: [
      ...room.doors.map((opening) => toRoomUploadOpening(room, opening, "door")),
      ...room.windows.map((opening) => toRoomUploadOpening(room, opening, "window")),
    ],
    furniture: room.furniture.map((item) => ({
      id: item.id,
      // category는 렌더러용 묶음(cabinet/fixture 등)이라 백엔드 타입이 아니다.
      type: item.sourceType ?? item.category,
      label: item.name,
      width: item.dimensions.width,
      depth: item.dimensions.depth,
      height: item.dimensions.height,
      position: {
        x: item.position.x + halfWidth,
        z: item.position.z + halfDepth,
      },
      rotation: normalizeDegrees((-item.rotationY * 180) / Math.PI),
      status: item.status === "recommended" ? "RECOMMENDED" : "EXISTING",
      ...wallMountFields(item),
    })),
  };
}

function toRoomUploadOpening(
  room: RoomLayout,
  opening: Opening,
  type: "door" | "window",
): RoomUploadApiRequest["openings"][number] {
  // `opening.wallId` is normally already set (toOpening()/snapToWall() below
  // resolve it on load) and, for a real scan, names an actual `room.walls[]`
  // entry — offset can then be computed exactly along that wall. A room with
  // no real wall geometry (`walls: []`, e.g. a manually-built/legacy layout)
  // or an opening still carrying a legacy cardinal label ("south"/"east"/...)
  // has no such entry to look up; fall back to the previous rectangle-
  // idealized width/depth math for those, same as before this change.
  const wall = opening.wallId ? room.walls.find((candidate) => candidate.id === opening.wallId) : undefined;
  if (wall) {
    return {
      id: opening.id,
      type,
      wall: wall.id,
      offset: offsetAlongWall(wall, opening.position, opening.dimensions.width),
      width: opening.dimensions.width,
      height: opening.dimensions.height,
      sillHeight: type === "window" ? opening.sillHeight ?? 0.9 : null,
    };
  }

  const side = resolveOpeningSide(room, opening);
  const rawOffset = side === "north" || side === "south"
    ? opening.position.x + room.width / 2
    : opening.position.z + room.depth / 2;
  const wallLength = side === "north" || side === "south" ? room.width : room.depth;

  return {
    id: opening.id,
    type,
    wall: side,
    offset: Math.min(Math.max(rawOffset, opening.dimensions.width / 2), wallLength - opening.dimensions.width / 2),
    width: opening.dimensions.width,
    height: opening.dimensions.height,
    sillHeight: type === "window" ? opening.sillHeight ?? 0.9 : null,
  };
}

function resolveOpeningSide(
  room: RoomLayout,
  opening: Opening,
): "north" | "east" | "south" | "west" {
  if (opening.wallId === "north" || opening.wallId === "east"
    || opening.wallId === "south" || opening.wallId === "west") {
    return opening.wallId;
  }

  const distances = [
    ["north", Math.abs(opening.position.z + room.depth / 2)],
    ["east", Math.abs(opening.position.x - room.width / 2)],
    ["south", Math.abs(opening.position.z - room.depth / 2)],
    ["west", Math.abs(opening.position.x + room.width / 2)],
  ] as const;
  return distances.reduce((nearest, candidate) => candidate[1] < nearest[1] ? candidate : nearest)[0];
}

// How far `position` sits from `wall.start`, measured along the wall's own
// direction (not a room-width/depth-relative offset) — the offset convention
// `openingPosition()` below expects. Clamped so the opening's whole footprint
// (not just its center) stays within the wall segment's own length.
function offsetAlongWall(wall: WallSegment, position: Vector2D, openingWidth: number): number {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len = Math.hypot(dx, dz) || 1;
  const rawAlong = ((position.x - wall.start.x) * dx + (position.z - wall.start.z) * dz) / len;
  const halfWidth = Math.min(openingWidth / 2, len / 2);
  return Math.min(Math.max(rawAlong, halfWidth), Math.max(len - halfWidth, halfWidth));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export async function deleteUploadedRoom(roomId: number, clientId?: string): Promise<void> {
  try {
    await apiClient.delete<ApiResponse<null>>(`/api/rooms/uploads/${roomId}`, clientId ? {
      roomfitClientScope: "EXPLICIT",
      roomfitClientIdOverride: clientId,
    } : undefined);
  } catch (error) {
    if (isAxiosError<{ error?: { message?: string } }>(error)) {
      throw new Error(error.response?.data.error?.message ?? "업로드 방을 삭제하지 못했습니다.", { cause: error });
    }
    throw new Error("업로드 방을 삭제하지 못했습니다.", { cause: error });
  }
}

function toThumbnailUrl(item: SampleRoomApiItem): string | undefined {
  return item.thumbnailBase64 ? `data:image/jpeg;base64,${item.thumbnailBase64}` : undefined;
}

function toSampleRoomCard(item: SampleRoomApiItem, index: number): SampleRoomCard {
  const layout = toRoomLayout(item);

  return {
    roomId: item.roomId,
    title: item.name || `샘플 원룸 ${index + 1}`,
    size: `${Math.round(item.room.width * item.room.depth)}㎡`,
    tone: ["white", "wood", "cream", "bright", "deep"][index % 5],
    category: "원룸",
    layoutId: layout.id,
    layout,
    thumbnailUrl: toThumbnailUrl(item),
  };
}

function toUploadedRoomCard(item: SampleRoomApiItem, index: number): UploadedRoomCard {
  const layout = toRoomLayout(item);

  return {
    roomId: item.roomId,
    title: item.name || `업로드 방 ${index + 1}`,
    size: `${item.room.width}m × ${item.room.depth}m`,
    dimensions: `${item.room.width}m × ${item.room.depth}m`,
    tone: ["bright", "white", "wood", "light"][index % 4],
    category: "업로드 방",
    source: item.source,
    createdAt: item.createdAt,
    layoutId: layout.id,
    layout,
    thumbnailUrl: toThumbnailUrl(item),
  };
}

function toRoomLayout(item: SampleRoomApiItem): RoomLayout {
  const width = item.room.width;
  const depth = item.room.depth;
  // Real scanned wall segments if the backend has them; otherwise fall back to
  // an idealized rectangle synthesized from width/depth (older uploads/samples
  // won't have `walls` yet).
  const walls =
    item.walls && item.walls.length > 0
      ? item.walls.map((wall) => toWallSegment(wall, width, depth))
      : createRectangularWalls(width, depth);

  return {
    id: `api-room-${item.roomId}`,
    name: item.name,
    description: `${width}m x ${depth}m ${item.room.unit} ${item.source === "ROOMPLAN" ? "업로드 방" : "샘플 방"}`,
    width,
    depth,
    height: item.room.height,
    unit: item.room.unit,
    source: item.source,
    createdAt: item.createdAt,
    floor: {
      size: { width, depth },
      material: { color: "#c2996a", roughness: 0.68 },
    },
    camera: {
      type: "orthographic",
      position: {
        x: Math.max(width, depth) * 1.35,
        y: Math.max(width, depth) * 1.08,
        z: Math.max(width, depth) * 1.35,
      },
      target: { x: 0, y: 0.55, z: 0 },
      zoom: Math.max(68, 108 - Math.max(width, depth) * 6),
    },
    lighting: {
      ambient: 0.78,
      sun: {
        intensity: 1.85,
        position: [3.8, 7.5, 4.6],
      },
      environment: "bright-neutral-studio",
    },
    walls,
    doors: toOpenings(item.openings, "door", "현관", width, depth, walls),
    windows: toOpenings(item.openings, "window", "창문", width, depth, walls),
    furniture: item.furniture.map((furniture) => toFurniture(furniture, width, depth, walls)),
  };
}

export function createRectangularWalls(width: number, depth: number): WallSegment[] {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  return [
    createWall("north", { x: -halfWidth, z: -halfDepth }, { x: halfWidth, z: -halfDepth }),
    createWall("east", { x: halfWidth, z: -halfDepth }, { x: halfWidth, z: halfDepth }),
    createWall("south", { x: halfWidth, z: halfDepth }, { x: -halfWidth, z: halfDepth }),
    createWall("west", { x: -halfWidth, z: halfDepth }, { x: -halfWidth, z: -halfDepth }),
  ];
}

function createWall(id: string, start: { x: number; z: number }, end: { x: number; z: number }): WallSegment {
  return {
    id,
    start,
    end,
    height: 2.4,
    thickness: 0.12,
    material: {
      color: "#f6f3ee",
      roughness: 0.82,
    },
  };
}

// Backend wall segments are in the room's corner-origin space (0..width,
// 0..depth) — same convention as furniture positions — so they need the same
// center-origin shift the scene expects.
function toWallSegment(
  wall: NonNullable<SampleRoomApiItem["walls"]>[number],
  roomWidth: number,
  roomDepth: number,
): WallSegment {
  return {
    id: wall.id,
    start: { x: wall.start.x - roomWidth / 2, z: wall.start.z - roomDepth / 2 },
    end: { x: wall.end.x - roomWidth / 2, z: wall.end.z - roomDepth / 2 },
    height: wall.height || 2.4,
    thickness: wall.thickness || 0.12,
    material: {
      color: "#f6f3ee",
      roughness: 0.82,
    },
  };
}

// Picks every opening of `type` (a room can have more than one door or
// window) rather than just the first — the old `.find()`-based version
// silently dropped every opening past the first match of each type. Falls
// back to a single synthesized opening only when none exist at all, so demo
// rooms without real opening data still render something reasonable.
function toOpenings(
  openings: SampleRoomApiItem["openings"],
  type: "door" | "window",
  label: string,
  roomWidth: number,
  roomDepth: number,
  walls: WallSegment[],
): Opening[] {
  const matches = openings.filter((opening) => opening.type === type);

  if (matches.length === 0) {
    return [toOpening(defaultOpening(type, roomWidth), label, roomWidth, roomDepth, walls)];
  }

  return matches.map((opening, index) => toOpening(opening, label, roomWidth, roomDepth, walls, index));
}

// The backend only ever sends a symbolic wall side ("north"/"east"/...) plus a
// scalar offset — never a real position or rotation (confirmed end-to-end:
// iOS's extractOpenings() computes a real x/z from RoomPlan but collapses it
// to that scalar before sending; the DTO/domain/response types have no
// position or rotation field for openings, unlike furniture). openingPosition()
// below reconstructs a position by assuming a perfect axis-aligned rectangle,
// which real scanned rooms rarely are. Snapping to the nearest actual wall
// segment (and reusing that segment's own angle) keeps the opening always
// exactly coplanar with the wall Wall.tsx renders, instead of floating at a
// mismatched angle — which is what made doors/windows render as thin wedges
// (a ~0.05m-thick box seen edge-on) instead of flush rectangles.
//
// `halfWidth` additionally keeps the opening's *whole footprint* — not just
// its center point — inside the chosen wall segment. Doors in particular are
// very often close to a room corner (a real front door), and clamping only
// the center let a door's near edge sit past the wall's own endpoint: Wall.tsx
// only cuts the hole within that segment's own length, so the overhanging
// sliver of the door had no hole to sit in and rendered as if jammed straight
// into the (still-solid) neighboring wall.
//
// `side` (the "north"/"south"/"east"/"west" label the backend already
// resolved this opening against — see wallSideAndOffset() on the iOS side)
// restricts the nearest-point search to wall segments running along that
// side's own axis (north/south run along X, east/west run along Z). Real
// scans are rarely a perfect rectangle: near a corner, a *perpendicular*
// wall segment's line can pass closer to the idealized point than the
// opening's true wall does, so a plain nearest-point search picks a wall at
// roughly the wrong angle. The opening still renders (position/width are
// fine), but its rotation no longer matches the wall plane it's cut into —
// which reads as the door slicing through the wall at an angle from most
// camera angles, closing to a clean rectangle only from very few.
function snapToWall(
  position: { x: number; z: number },
  walls: WallSegment[],
  halfWidth = 0,
  side?: string,
): { position: { x: number; z: number }; rotationY: number; wallId?: string } {
  const expectAlongX = side === "north" || side === "south" ? true : side === "east" || side === "west" ? false : undefined;

  type Candidate = { dist: number; x: number; z: number; rotationY: number; wallId: string };
  let best: Candidate | null = null;
  let bestAny: Candidate | null = null;

  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) {
      continue;
    }

    const dirX = dx / len;
    const dirZ = dz / len;
    const rawAlong = (position.x - wall.start.x) * dirX + (position.z - wall.start.z) * dirZ;
    const minAlong = Math.min(halfWidth, len / 2);
    const maxAlong = Math.max(len - halfWidth, len / 2);
    const along = Math.min(Math.max(rawAlong, minAlong), maxAlong);
    const nearX = wall.start.x + dirX * along;
    const nearZ = wall.start.z + dirZ * along;
    const dist = Math.hypot(position.x - nearX, position.z - nearZ);
    const candidate: Candidate = { dist, x: nearX, z: nearZ, rotationY: -Math.atan2(dz, dx), wallId: wall.id };

    if (!bestAny || dist < bestAny.dist) {
      bestAny = candidate;
    }

    const wallAlongX = Math.abs(dx) >= Math.abs(dz);
    if (expectAlongX !== undefined && wallAlongX !== expectAlongX) {
      continue;
    }

    if (!best || dist < best.dist) {
      best = candidate;
    }
  }

  // Fall back to the plain nearest wall (ignoring orientation) if none of
  // the axis-matching ones panned out — better a slightly-off match than an
  // opening with no wall at all.
  const chosen = best ?? bestAny;

  if (!chosen) {
    return { position, rotationY: 0 };
  }

  return { position: { x: chosen.x, z: chosen.z }, rotationY: chosen.rotationY, wallId: chosen.wallId };
}

function defaultOpening(type: "door" | "window", roomWidth: number): SampleRoomApiItem["openings"][number] {
  return {
    id: type === "door" ? "door-main" : "window-main",
    type,
    wall: type === "door" ? "south" : "north",
    offset: type === "door" ? roomWidth * 0.25 : roomWidth * 0.65,
    width: type === "door" ? 0.8 : 1.4,
    height: type === "door" ? 2.1 : 1.2,
    sillHeight: type === "door" ? null : 0.9,
  };
}

function toOpening(
  opening: SampleRoomApiItem["openings"][number],
  label: string,
  roomWidth: number,
  roomDepth: number,
  walls: WallSegment[],
  index = 0,
): Opening {
  const idealizedPosition = openingPosition(opening.wall, opening.offset, roomWidth, roomDepth, walls);
  const snapped = snapToWall(idealizedPosition, walls, opening.width / 2, opening.wall);

  return {
    id: opening.id,
    label: index === 0 ? label : `${label} ${index + 1}`,
    position: snapped.position,
    dimensions: {
      width: opening.width,
      depth: 0.18,
      height: opening.height,
    },
    rotationY: snapped.rotationY,
    wallId: snapped.wallId,
    sillHeight: opening.sillHeight,
    frame: {
      color: "#8a623d",
    },
    glass: {
      transmission: opening.type === "window" ? 0.28 : 0,
      opacity: opening.type === "window" ? 0.24 : 1,
    },
    // A window opening has no implicit blind. Blinds are independent furniture
    // and are only rendered after the user selects one.
    blind: undefined,
  };
}

// `wall` is normally a `walls[].id` reference now: the opening's true
// position is just that wall's start point plus `offset` meters along the
// wall's own direction — exact, not an idealization, so it works for any
// wall angle/count (not only 4 cardinal sides). Older payloads that still
// send a literal "north"/"east"/"south"/"west" (no matching wall id exists)
// fall back to the previous perfect-rectangle math; `snapToWall()` in the
// caller then corrects that idealized guess against the real wall geometry
// same as before.
function openingPosition(
  wall: string,
  offset: number,
  roomWidth: number,
  roomDepth: number,
  walls: WallSegment[],
) {
  const matched = walls.find((candidate) => candidate.id === wall);
  if (matched) {
    const dx = matched.end.x - matched.start.x;
    const dz = matched.end.z - matched.start.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.01) {
      const t = Math.min(Math.max(offset, 0), len) / len;
      return { x: matched.start.x + dx * t, z: matched.start.z + dz * t };
    }
  }

  const halfWidth = roomWidth / 2;
  const halfDepth = roomDepth / 2;

  if (wall === "north") {
    return { x: -halfWidth + offset, z: -halfDepth };
  }

  if (wall === "south") {
    return { x: -halfWidth + offset, z: halfDepth };
  }

  if (wall === "east") {
    return { x: halfWidth, z: -halfDepth + offset };
  }

  return { x: -halfWidth, z: -halfDepth + offset };
}

function toFurniture(
  item: SampleRoomApiItem["furniture"][number],
  roomWidth: number,
  roomDepth: number,
  walls: WallSegment[],
): Furniture {
  const normalizedItem = normalizeBackendFurnitureApiItem(item);
  const category = toFurnitureCategory(normalizedItem.type);
  const fixtureType = normalizeFixtureType(normalizedItem.type);
  const canonicalType = fixtureType ?? normalizeCanonicalFurnitureType(normalizedItem.type);
  // `storage` is the one legacy Backend type that is intentionally accepted
  // outside the generated canonical catalog. Keep it as the persistence type:
  // falling back to the renderer category (`cabinet`) makes a no-op Room
  // furniture save fail with INVALID_FURNITURE_TYPE.
  const sourceType = canonicalType ?? (normalizedItem.type === "storage" ? "storage" : null);
  const materialType = materialByCategory(category);
  const collectorAppearance = collectorAppearanceById[normalizedItem.id.replace(/^studio-/, "collector-")];
  const color = collectorAppearance?.color ?? colorByCategory(category);
  const rotationY = normalizeRotation(item.rotation);
  const rawPosition = { x: item.position.x - roomWidth / 2, z: item.position.z - roomDepth / 2 };

  const wallMounted = item.mount === "WALL" && typeof item.elevation === "number" && Number.isFinite(item.elevation);
  const furniture: Furniture = {
    id: normalizedItem.id,
    name: normalizedItem.label || (fixtureType ? FIXTURE_LABELS[fixtureType] : normalizedItem.type),
    category,
    ...(sourceType ? { sourceType } : {}),
    productId: normalizedItem.productId,
    variantId: normalizedItem.variantId,
    styleTags: [...normalizedItem.styleTags],
    geometry: collectorAppearance?.geometry ?? geometryByType(normalizedItem.type, category),
    dimensions: {
      width: item.width,
      depth: item.depth,
      height: item.height,
    },
    position: rawPosition,
    rotationY,
    color,
    material: collectorAppearance?.material ?? {
      type: materialType,
      color,
      roughness: category === "rug" ? 0.96 : materialType === "wood" ? 0.55 : 0.9,
      metalness: materialType === "metal" ? 0.8 : 0,
    },
    status: toFurnitureStatus(item.status),
    // 고정설비는 지울 수 없고, 추천 엔진도 위치·크기를 바꾸지 않는다.
    removable: fixtureType === null,
    ...(fixtureType ? { recommendationLocked: true } : {}),
    ...(wallMounted ? { mount: "WALL" as const, elevation: item.elevation as number } : {}),
  };
  // 고정설비는 스캔 위치가 사실이라 화면 쪽에서 다시 clamp하지 않는다.
  if (fixtureType) return furniture;
  const position = clampFurniturePositionToRoom(
    { width: roomWidth, depth: roomDepth, walls },
    furniture.dimensions,
    rawPosition,
    rotationY,
    resolveFurnitureLocalFootprint(furniture),
  );
  return position ? { ...furniture, position } : furniture;
}

function toFurnitureCategory(type: string): FurnitureCategory {
  if (normalizeFixtureType(type)) {
    return "fixture";
  }

  if (type === "desk" || type === "bed" || type === "chair" || type === "cabinet" || type === "rug" || type === "lighting") {
    return type;
  }

  if (type === "sofa") {
    return "chair";
  }

  if (type === "table") {
    return "desk";
  }

  if (type === "shelf" || type === "tvStand" || type === "storage" || type === "wardrobe") {
    return "cabinet";
  }

  const canonicalType = normalizeCanonicalFurnitureType(type);
  if (canonicalType === "bed" || canonicalType === "sofa_bed") return "bed";
  if (["desk", "multi_table", "side_table", "nightstand"].includes(canonicalType ?? "")) return "desk";
  if (canonicalType === "desk_chair" || canonicalType === "sofa") return "chair";
  if (canonicalType === "rug") return "rug";
  if (canonicalType === "mood_lamp") return "lighting";
  if (canonicalType !== null) return "cabinet";

  if (import.meta.env.DEV) {
    console.warn(`Unsupported backend furniture type "${type}"; rendering a neutral placeholder.`);
  }
  return "unsupported";
}

function geometryByType(type: string, category: FurnitureCategory) {
  if (category === "rug") {
    return "plane" as const;
  }

  if (category === "lighting" || type === "table") {
    return "cylinder" as const;
  }

  if (type === "sofa") {
    return "rounded-box" as const;
  }

  return "box" as const;
}

// iOS reports rotation as a positive-degrees-clockwise angle (yaw measured via
// atan2(z, x) relative to the room frame). Three.js's `rotation.y` turns a
// positive angle the opposite way around (+Z toward +X, not +X toward +Z), so
// applying the raw value spun every 90°/270° item backwards — 0°/180° pieces
// happened to look fine since negating them is a no-op. Negate after
// converting to radians to match Three.js's rotation sense.
function normalizeRotation(rotation: number): number {
  const radians = Math.abs(rotation) > Math.PI * 2 ? (rotation * Math.PI) / 180 : rotation;
  return -radians;
}

function toFurnitureStatus(status: string): FurnitureStatus {
  const values: Record<string, FurnitureStatus> = {
    EXISTING: "existing",
    RECOMMENDED: "recommended",
    USER_MODIFIED: "user_modified",
    DELETED: "deleted",
  };
  const value = values[status];
  if (!value) {
    throw new Error(`Unsupported Backend furniture status: ${status}`);
  }
  return value;
}

function materialByCategory(category: FurnitureCategory) {
  if (category === "desk" || category === "cabinet") {
    return "wood" as const;
  }

  if (category === "lighting") {
    return "metal" as const;
  }

  return "fabric" as const;
}

function colorByCategory(category: FurnitureCategory): string {
  const colors: Record<FurnitureCategory, string> = {
    bed: "#f7f7f5",
    desk: "#c7a27a",
    chair: "#f2ebe2",
    cabinet: "#8a6542",
    rug: "#d8c7ad",
    lighting: "#26211d",
    fixture: "#d9dcdf",
    unsupported: "#8b8b86",
  };

  return colors[category];
}


export type BackendFurnitureApiItem = SampleRoomApiItem["furniture"][number];

export function normalizeBackendFurnitureApiItem(
  item: BackendFurnitureApiItem,
): BackendFurnitureApiItem {
  const canonicalType = normalizeCanonicalFurnitureType(item.type);
  return canonicalType && canonicalType !== item.type
    ? { ...item, type: canonicalType }
    : item;
}

export function normalizeBackendFurnitureApiItems(
  furniture: BackendFurnitureApiItem[],
): BackendFurnitureApiItem[] {
  return furniture.map(normalizeBackendFurnitureApiItem);
}

export function applyBackendFurnitureToLayout(
  layout: RoomLayout,
  furniture: BackendFurnitureApiItem[],
): RoomLayout {
  return {
    ...layout,
    furniture: normalizeBackendFurnitureApiItems(furniture)
      .map((item) => toFurniture(item, layout.width, layout.depth, layout.walls)),
  };
}
