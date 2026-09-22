import {
  normalizePreferredColorToneId,
  type PreferredColorToneId,
} from "./preferredColorTone";
import { FURNITURE_TYPE_BY_UI_ID } from "./furnitureSelectionCatalog";

type ReadableStorage = Pick<Storage, "getItem">;

// /preference와 /reference-image가 실제로 쓰는 기존 localStorage 키. 이 파일은
// 새 키를 만들지 않고(특히 isValid 같은 파생 값은 저장하지 않는다) 이 세 키의
// 현재 값만 읽어 유효성을 그때그때 계산한다.
export const PURPOSE_STORAGE_KEY = "roomfit:selectedPurpose";
export const PALETTE_STORAGE_KEY = "roomfit:selectedPalette";
export const STYLE_STORAGE_KEY = "roomfit:selectedStyle";
export const ADDITIONAL_FURNITURE_STORAGE_KEY = "roomfit:selectedAdditionalFurnitureIds";

// 라이프스타일(생활 목적) 유효 id — Preference.tsx의 선택 카드 id와 동일하게
// 유지해야 한다. 지원하지 않는/오래된 값은 미선택으로 취급한다.
export const LIFESTYLE_IDS = ["rest", "work", "hobby", "storage"] as const;
export type LifestyleId = (typeof LIFESTYLE_IDS)[number];

// 인테리어 스타일 유효 id — ReferenceImage.tsx의 선택 카드 id 및 백엔드 스타일
// enum과 동일하게 유지해야 한다.
export const INTERIOR_STYLE_IDS = [
  "minimal",
  "natural",
  "modern",
  "classic",
  "midcentury",
] as const;
export type InteriorStyleId = (typeof INTERIOR_STYLE_IDS)[number];

const lifestyleIdSet = new Set<string>(LIFESTYLE_IDS);
const interiorStyleIdSet = new Set<string>(INTERIOR_STYLE_IDS);

export function isLifestyleId(value: unknown): value is LifestyleId {
  return typeof value === "string" && lifestyleIdSet.has(value);
}

export function normalizeLifestyleId(value: unknown): LifestyleId | null {
  return isLifestyleId(value) ? value : null;
}

export function isInteriorStyleId(value: unknown): value is InteriorStyleId {
  return typeof value === "string" && interiorStyleIdSet.has(value);
}

export function normalizeInteriorStyleId(value: unknown): InteriorStyleId | null {
  return isInteriorStyleId(value) ? value : null;
}

export interface PreferenceSelection {
  purpose: LifestyleId | null;
  palette: PreferredColorToneId | null;
}

export function readPreferenceSelection(
  storage: ReadableStorage = localStorage,
): PreferenceSelection {
  try {
    return {
      purpose: normalizeLifestyleId(storage.getItem(PURPOSE_STORAGE_KEY)),
      palette: normalizePreferredColorToneId(storage.getItem(PALETTE_STORAGE_KEY)),
    };
  } catch {
    return { purpose: null, palette: null };
  }
}

export function isPreferenceComplete(selection: PreferenceSelection): boolean {
  return selection.purpose !== null && selection.palette !== null;
}

export function isPreferenceSelectionComplete(
  storage: ReadableStorage = localStorage,
): boolean {
  return isPreferenceComplete(readPreferenceSelection(storage));
}

/**
 * 아직 선택하지 않은 항목만 짚어 안내 문구를 만든다. 모두 선택했으면 빈 문자열을
 * 돌려주므로, 페이지는 빈 문자열일 때 안내 영역을 렌더링하지 않으면 된다.
 */
export function getPreferenceGuidanceMessage(selection: PreferenceSelection): string {
  const missing: string[] = [];
  if (selection.purpose === null) missing.push("라이프스타일");
  if (selection.palette === null) missing.push("색상 톤");
  if (missing.length === 0) return "";
  return `${missing.join("과 ")}을 선택해 주세요.`;
}

export function readInteriorStyleSelection(
  storage: ReadableStorage = localStorage,
): InteriorStyleId | null {
  try {
    return normalizeInteriorStyleId(storage.getItem(STYLE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function isReferenceStyleSelectionComplete(
  storage: ReadableStorage = localStorage,
): boolean {
  return readInteriorStyleSelection(storage) !== null;
}

export function getReferenceStyleGuidanceMessage(style: InteriorStyleId | null): string {
  return style === null ? "인테리어 스타일을 선택해 주세요." : "";
}

export function readAdditionalFurnitureSelection(
  storage: ReadableStorage = localStorage,
): string[] {
  try {
    const raw = storage.getItem(ADDITIONAL_FURNITURE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => (
        typeof item === "string" && item in FURNITURE_TYPE_BY_UI_ID
      ))
      : [];
  } catch {
    return [];
  }
}

export function getFurnitureSelectionGuidanceMessage(selectedIds: string[]): string {
  return selectedIds.length > 0 ? "" : "추천에 포함할 가구를 하나 이상 선택해 주세요.";
}

// 이 두 단계에서만 선택 검증으로 "다음 단계" 이동을 막는다. 그 외 단계는 영향 없음.
export const ONBOARDING_GATED_PATHS = ["/preference", "/reference-image"] as const;

/**
 * 현재 경로에서 다음 단계로 이동해도 되는지 계산한다 — 게이트 대상이 아닌
 * 경로는 항상 true(기존 이동 동작 유지). Navbar가 버튼 disabled 여부와
 * 실제 navigation handler 양쪽에서 이 함수를 공통으로 쓴다.
 */
export function canAdvanceFromPath(
  pathname: string,
  storage: ReadableStorage = localStorage,
): boolean {
  if (pathname === "/preference") return isPreferenceSelectionComplete(storage);
  if (pathname === "/reference-image") return isReferenceStyleSelectionComplete(storage);
  return true;
}

// /preference·/reference-image의 선택이 바뀌면 같은 탭의 Navbar가 즉시
// 다시 계산하도록 알린다(같은 문서 내 localStorage 쓰기는 storage 이벤트를
// 발생시키지 않으므로 커스텀 이벤트를 쓴다).
export const ONBOARDING_SELECTION_EVENT = "roomfit:onboarding-selection-changed";
export const ONBOARDING_VALIDATION_EVENT = "roomfit:onboarding-validation-requested";

export function notifyOnboardingSelectionChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ONBOARDING_SELECTION_EVENT));
  }
}

export function requestOnboardingValidation(pathname: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ONBOARDING_VALIDATION_EVENT, { detail: { pathname } }));
  }
}
