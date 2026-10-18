import type {
  AgentContext,
  Furniture,
  FurnitureCategory,
  Opening,
  RoomLayout,
  ValidationResult,
  Vector2D,
} from "./types";

interface Bounds {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const recommendedCatalog: Record<FurnitureCategory, Omit<Furniture, "id" | "status" | "removable">> = {
  bed: {
    name: "Low White Bed",
    category: "bed",
    dimensions: { width: 2.0, depth: 1.25, height: 0.45 },
    position: { x: -1.75, z: -1.25 },
    rotationY: 0,
    color: "#f8fafc",
    material: "fabric",
  },
  desk: {
    name: "White Study Desk",
    category: "desk",
    dimensions: { width: 1.35, depth: 0.62, height: 0.72 },
    position: { x: 1.95, z: -1.42 },
    rotationY: 0,
    color: "#ffffff",
    material: "white",
  },
  chair: {
    name: "Slim Study Chair",
    category: "chair",
    dimensions: { width: 0.55, depth: 0.55, height: 0.82 },
    position: { x: 1.95, z: -0.62 },
    rotationY: 0,
    color: "#d4d4d8",
    material: "metal",
  },
  cabinet: {
    name: "Narrow Cabinet",
    category: "cabinet",
    dimensions: { width: 0.85, depth: 0.42, height: 1.2 },
    position: { x: 2.45, z: 1.15 },
    rotationY: 0,
    color: "#f4f4f5",
    material: "white",
  },
  rug: {
    name: "Quiet Grid Rug",
    category: "rug",
    dimensions: { width: 1.65, depth: 1.2, height: 0.03 },
    position: { x: 0.2, z: 0.35 },
    rotationY: 0,
    color: "#e7e5e4",
    material: "fabric",
  },
  lighting: {
    name: "Task Floor Lamp",
    category: "lighting",
    dimensions: { width: 0.28, depth: 0.28, height: 1.55 },
    position: { x: 1.15, z: -1.65 },
    rotationY: 0,
    color: "#111827",
    material: "metal",
  },
  fixture: {
    name: "고정설비",
    category: "fixture",
    dimensions: { width: 0.6, depth: 0.6, height: 0.9 },
    position: { x: 0, z: 0 },
    rotationY: 0,
    color: "#d9dcdf",
    material: "white",
  },
  unsupported: {
    name: "지원되지 않는 가구",
    category: "unsupported",
    dimensions: { width: 0.5, depth: 0.5, height: 0.5 },
    position: { x: 0, z: 0 },
    rotationY: 0,
    color: "#8b8b86",
    material: "white",
  },
};

export function buildAgentContext(context: AgentContext): AgentContext {
  return context;
}

export function generateRecommendedLayout(context: AgentContext): Furniture[] {
  const existingBed = context.room.furniture.find((item) => item.category === "bed");
  const bed = existingBed ? { ...existingBed, status: "existing" as const } : null;

  const generated = context.preference.requiredItems
    .filter((category) => category !== "bed")
    .map((category) => ({
      ...recommendedCatalog[category],
      id: `recommended-${category}`,
      status: "recommended" as const,
      removable: false,
    }));

  return bed ? [bed, ...generated] : generated;
}

export function updateFurniturePosition(
  furniture: Furniture[],
  furnitureId: string,
  position: Vector2D,
): Furniture[] {
  return furniture.map((item) =>
    item.id === furnitureId
      ? {
          ...item,
          position: {
            x: roundToGrid(position.x),
            z: roundToGrid(position.z),
          },
        }
      : item,
  );
}

export function validateLayout(room: RoomLayout, furniture: Furniture[]): ValidationResult[] {
  const solidFurniture = furniture.filter((item) => item.category !== "rug");
  const bounds = solidFurniture.map(getFurnitureBounds);
  const collisionPairs = findCollisions(bounds);
  const doorZones = room.doors.map((door, index) => getOpeningZone(door, 0.45, `door-zone-${index}`));
  const windowZones = room.windows.map((win, index) => getOpeningZone(win, 0.34, `window-zone-${index}`));
  const doorBlocks = bounds.filter((bound) => doorZones.some((zone) => intersects(bound, zone)));
  const windowBlocks = bounds.filter((bound) => windowZones.some((zone) => intersects(bound, zone)));
  const trafficWarnings = findTrafficWarnings(room, bounds);

  return [
    {
      id: "collision",
      label: "가구 겹침",
      severity: collisionPairs.length === 0 ? "pass" : "warning",
      message:
        collisionPairs.length === 0
          ? "가구 간 겹침이 없습니다."
          : `${collisionPairs.map((pair) => pair.join(" / ")).join(", ")} 겹침 가능성이 있습니다.`,
    },
    {
      id: "door",
      label: "문 가림",
      severity: doorBlocks.length === 0 ? "pass" : "warning",
      message:
        doorBlocks.length === 0
          ? "현관 진입 공간이 확보되었습니다."
          : `주의: ${doorBlocks.map((item) => item.label).join(", ")}이 문 앞 공간을 막고 있습니다.`,
    },
    {
      id: "window",
      label: "창문 가림",
      severity: windowBlocks.length === 0 ? "pass" : "warning",
      message:
        windowBlocks.length === 0
          ? "창문 채광과 개폐 공간이 유지됩니다."
          : `주의: ${windowBlocks.map((item) => item.label).join(", ")}이 창문 영역과 가깝습니다.`,
    },
    {
      id: "traffic",
      label: "동선 확보",
      severity: trafficWarnings.length === 0 ? "pass" : "warning",
      message:
        trafficWarnings.length === 0
          ? "침대, 책상, 출입구 사이 이동 동선이 확보되었습니다."
          : trafficWarnings.join(" "),
    },
  ];
}

function roundToGrid(value: number): number {
  return Math.round(value * 20) / 20;
}

function getFurnitureBounds(item: Furniture): Bounds {
  return {
    id: item.id,
    label: item.name,
    minX: item.position.x - item.dimensions.width / 2,
    maxX: item.position.x + item.dimensions.width / 2,
    minZ: item.position.z - item.dimensions.depth / 2,
    maxZ: item.position.z + item.dimensions.depth / 2,
  };
}

function getOpeningZone(opening: Opening, padding: number, id: string): Bounds {
  return {
    id,
    label: opening.label,
    minX: opening.position.x - opening.dimensions.width / 2 - padding,
    maxX: opening.position.x + opening.dimensions.width / 2 + padding,
    minZ: opening.position.z - opening.dimensions.depth / 2 - padding,
    maxZ: opening.position.z + opening.dimensions.depth / 2 + padding,
  };
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function findCollisions(bounds: Bounds[]): [string, string][] {
  const pairs: [string, string][] = [];

  for (let i = 0; i < bounds.length; i += 1) {
    for (let j = i + 1; j < bounds.length; j += 1) {
      if (intersects(bounds[i], bounds[j])) {
        pairs.push([bounds[i].label, bounds[j].label]);
      }
    }
  }

  return pairs;
}

function findTrafficWarnings(room: RoomLayout, bounds: Bounds[]): string[] {
  const centerLane: Bounds = {
    id: "center-lane",
    label: "Center Lane",
    minX: -0.55,
    maxX: 0.55,
    minZ: -room.depth / 2 + 0.55,
    maxZ: room.depth / 2 - 0.55,
  };
  const blocked = bounds.filter((bound) => intersects(bound, centerLane));

  if (blocked.length === 0) {
    return [];
  }

  return [`중앙 이동축에 ${blocked.map((item) => item.label).join(", ")}이 가까워 여유 폭을 확인하세요.`];
}
