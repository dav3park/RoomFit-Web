import type { Furniture } from "../types";

// RoomPlan이 감지하는 "옮길 수 없는 장애물". 카탈로그 상품이 아니라 백엔드 FixtureType과
// 1:1로 맞춘 별도 타입이다 — 값은 업로드/조회 JSON의 furniture.type 그대로.
export const FIXTURE_TYPES = [
  "upper_cabinet",
  "sink",
  "stove",
  "oven",
  "refrigerator",
  "dishwasher",
  "washer_dryer",
  "toilet",
  "bathtub",
  "fireplace",
  "stairs",
] as const;

export type FixtureType = (typeof FIXTURE_TYPES)[number];

export const FIXTURE_LABELS: Readonly<Record<FixtureType, string>> = {
  upper_cabinet: "상부장",
  sink: "싱크대",
  stove: "가스레인지",
  oven: "오븐",
  refrigerator: "냉장고",
  dishwasher: "식기세척기",
  washer_dryer: "세탁기",
  toilet: "변기",
  bathtub: "욕조",
  fireplace: "벽난로",
  stairs: "계단",
};

export function normalizeFixtureType(value: unknown): FixtureType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (FIXTURE_TYPES as readonly string[]).includes(normalized) ? (normalized as FixtureType) : null;
}

export function isFixtureFurniture(item: Pick<Furniture, "category" | "sourceType">): boolean {
  return item.category === "fixture" || normalizeFixtureType(item.sourceType) !== null;
}
