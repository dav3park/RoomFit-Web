import type { Furniture, InspirationImage, RoomLayout, UserPreference } from "../types";

export const requiredFurnitureOptions: Furniture["category"][] = [
  "bed",
  "desk",
  "chair",
  "cabinet",
  "rug",
  "lighting",
];

export const categoryLabels: Record<Furniture["category"], string> = {
  bed: "침대",
  desk: "책상",
  chair: "의자",
  cabinet: "수납장",
  rug: "러그",
  lighting: "조명",
  fixture: "고정설비",
  unsupported: "지원되지 않는 가구",
};

export const purposeOptions: Array<{ id: UserPreference["purpose"]; label: string; description: string }> = [
  { id: "study", label: "공부형", description: "책상과 조명을 중심으로 집중 동선을 확보합니다." },
  { id: "rest", label: "휴식형", description: "침대와 러그 주변을 여유롭게 배치합니다." },
  { id: "balanced", label: "균형형", description: "공부와 휴식을 모두 고려한 기본형입니다." },
];

export const styleOptions: Array<{ id: UserPreference["style"]; label: string; description: string }> = [
  { id: "minimal-white", label: "미니멀/화이트톤", description: "흰색과 낮은 대비로 깔끔하게 정리합니다." },
  { id: "warm-natural", label: "웜 내추럴", description: "우드 톤과 패브릭 소품으로 부드럽게 구성합니다." },
  { id: "compact-modern", label: "컴팩트 모던", description: "좁은 공간에 맞춰 실용성을 우선합니다." },
];

export const initialPreference: UserPreference = {
  purpose: "study",
  style: "minimal-white",
  requiredItems: ["bed", "desk", "chair", "cabinet", "rug", "lighting"],
  inspirationImageIds: ["inspo-01"],
};

const studioBase: RoomLayout = {
  id: "studio-1r-sample",
  name: "화이트 1R 기본형",
  description: "처음 자취를 시작하는 학생에게 적합한 6.2m x 4.4m 원룸입니다.",
  width: 6.2,
  depth: 4.4,
  walls: [
    { id: "north", start: { x: -3.1, z: -2.2 }, end: { x: 3.1, z: -2.2 } },
    { id: "east", start: { x: 3.1, z: -2.2 }, end: { x: 3.1, z: 2.2 } },
    { id: "south", start: { x: 3.1, z: 2.2 }, end: { x: -3.1, z: 2.2 } },
    { id: "west", start: { x: -3.1, z: 2.2 }, end: { x: -3.1, z: -2.2 } },
  ],
  doors: [
    {
      id: "door-main",
      label: "현관",
      position: { x: -2.35, z: 2.18 },
      dimensions: { width: 1.0, depth: 0.22, height: 2.1 },
      rotationY: 0,
    },
  ],
  windows: [
    {
      id: "window-main",
      label: "창문",
      position: { x: 2.1, z: -2.18 },
      dimensions: { width: 1.8, depth: 0.18, height: 1.2 },
      rotationY: 0,
    },
  ],
  furniture: [
    {
      id: "existing-bed",
      name: "기존 침대",
      category: "bed",
      dimensions: { width: 2.0, depth: 1.25, height: 0.45 },
      position: { x: -1.75, z: -1.25 },
      rotationY: 0,
      color: "#f7f7f5",
      material: "fabric",
      status: "existing",
      removable: false,
    },
    {
      id: "existing-desk",
      name: "기존 책상",
      category: "desk",
      dimensions: { width: 1.25, depth: 0.62, height: 0.72 },
      position: { x: 1.85, z: 1.28 },
      rotationY: 0,
      color: "#c7b299",
      material: "wood",
      status: "existing",
      removable: true,
    },
  ],
};

export const sampleRoomLayouts: RoomLayout[] = [
  studioBase,
  {
    ...studioBase,
    id: "studio-long-window",
    name: "창가 긴 책상형",
    description: "창문 폭이 넓어 공부 공간을 창가에 두기 좋은 샘플입니다.",
    windows: [
      {
        ...studioBase.windows[0],
        position: { x: 1.2, z: -2.18 },
        dimensions: { width: 2.3, depth: 0.18, height: 1.2 },
      },
    ],
    furniture: studioBase.furniture.map((item) =>
      item.category === "desk" ? { ...item, position: { x: 2.05, z: 0.9 } } : item,
    ),
  },
  {
    ...studioBase,
    id: "studio-storage-focus",
    name: "수납 우선형",
    description: "침대 옆 수납 공간과 중앙 동선을 함께 확인하기 좋은 샘플입니다.",
    furniture: [
      ...studioBase.furniture,
      {
        id: "existing-cabinet",
        name: "기존 수납장",
        category: "cabinet",
        dimensions: { width: 0.8, depth: 0.42, height: 1.15 },
        position: { x: 2.45, z: 1.32 },
        rotationY: 0,
        color: "#f4f4f5",
        material: "white",
        status: "existing",
        removable: true,
      },
    ],
  },
];

export const initialRoomLayout = sampleRoomLayouts[0];

export const inspirationImages: InspirationImage[] = [
  {
    id: "inspo-01",
    title: "창가 공부 코너",
    tags: ["화이트 책상", "자연광"],
    palette: "linear-gradient(135deg, #f8fafc, #d9e5ec)",
  },
  {
    id: "inspo-02",
    title: "깔끔한 수납 벽면",
    tags: ["수납", "정돈"],
    palette: "linear-gradient(135deg, #fafafa, #e7e5e4)",
  },
  {
    id: "inspo-03",
    title: "부드러운 러그 중심",
    tags: ["휴식", "패브릭"],
    palette: "linear-gradient(135deg, #ffffff, #f1e8dc)",
  },
  {
    id: "inspo-04",
    title: "집중형 데스크",
    tags: ["공부", "작업 조명"],
    palette: "linear-gradient(135deg, #f4f4f5, #cbd5e1)",
  },
  {
    id: "inspo-05",
    title: "화이트톤 원룸",
    tags: ["미니멀", "저채도"],
    palette: "linear-gradient(135deg, #ffffff, #e5e7eb)",
  },
];
