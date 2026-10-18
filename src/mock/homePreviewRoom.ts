import catalogDocument from "../data/furniture/catalog.json";
import type { Furniture, FurnitureCategory, RoomLayout } from "../types";
import { sampleRoom } from "./sampleRoom";

// 홈 화면 3D 미리보기 전용 방. 현재 카탈로그 가구(내추럴·모던 톤)로 작업·거실·침실 구역을 꾸민다.
// 좌표는 방 중심 원점(x: -3.2..3.2, z: -2.4..2.4), 뒷벽 z=-2.4 · 오른쪽 벽 x=3.2.
// rotationY 0이면 가구 앞면이 +z(방 안쪽)를 본다.

// 벽 안쪽 면(뒷벽 -2.34, 오른쪽 3.13)에서 벽 앞 여유 2cm와 모델 외곽 오차를 더 띄운다.
const BACK = -2.29;
const LIVING_X = -0.25; // 거실 구역(미디어장·소파) 중심선
const RIGHT = 3.08;

const categoryByType: Record<string, FurnitureCategory> = {
  bed: "bed",
  desk: "desk",
  multi_table: "desk",
  side_table: "desk",
  nightstand: "desk",
  desk_chair: "chair",
  sofa: "chair",
  rug: "rug",
  mood_lamp: "lighting",
};

function place(variantId: string, x: number, z: number, rotationY = 0): Furniture {
  const product = catalogDocument.products.find((candidate) => candidate.variantId === variantId);
  if (!product) throw new Error(`Unknown home preview variant: ${variantId}`);
  return {
    id: `home-${variantId}`,
    name: product.label,
    category: categoryByType[product.furnitureType] ?? "cabinet",
    sourceType: product.furnitureType,
    productId: product.productId,
    variantId,
    styleTags: [...product.styleTags],
    dimensions: { ...product.dimensions },
    position: { x, z },
    rotationY,
    color: "#c8a27a",
    material: "wood",
    status: "existing",
    removable: false,
  };
}

const furniture: Furniture[] = [
  // 작업 구역: 창문 아래 책상
  place("expansion-c006", -2.2, BACK + 0.325),
  place("expansion-c029", -2.2, -1.4, Math.PI),
  place("monitor-basic", -2.25, BACK + 0.22),
  place("expansion-c091", -2.7, BACK + 0.2),
  // 거실 구역: 미디어장 + TV, 소파, 러그, 커피 테이블
  place("expansion-c071", LIVING_X, BACK + 0.231),
  place("tv-natural-frame", LIVING_X, BACK + 0.2),
  place("rug-rectangular", LIVING_X, 0.55, Math.PI / 2),
  place("side-table-coffee", LIVING_X, 0.6),
  place("expansion-c057", LIVING_X, 1.7, Math.PI),
  place("expansion-c100", -1.6, 1.85),
  place("lamp-floor", 1.25, 1.95),
  place("plant-corner", 1.25, BACK + 0.33),
  // 침실 구역: 오른쪽 벽에 헤드보드를 붙인 침대 + 협탁, 뒤 모서리 원목 선반
  place("expansion-c014", RIGHT - 1.069, 0.5, -Math.PI / 2),
  place("expansion-c021", RIGHT - 0.179, 1.6, -Math.PI / 2),
  place("expansion-c097", RIGHT - 0.179, 1.6, -Math.PI / 2),
  place("expansion-c035", 2.55, BACK + 0.216),
];

export const homePreviewRoom: RoomLayout = {
  ...sampleRoom,
  id: "home-preview",
  name: "RoomFit 홈 미리보기",
  camera: {
    ...sampleRoom.camera,
    type: "orthographic",
    position: { x: -6.4, y: 5.2, z: 6.2 },
    target: { x: 0.15, y: 0.7, z: -0.1 },
    zoom: 82,
  },
  furniture,
};
