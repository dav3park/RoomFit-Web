import { describe, expect, it, vi } from "vitest";

import {
  canAdvanceFromPath,
  getPreferenceGuidanceMessage,
  getReferenceStyleGuidanceMessage,
  isPreferenceSelectionComplete,
  isReferenceStyleSelectionComplete,
  normalizeInteriorStyleId,
  normalizeLifestyleId,
  PALETTE_STORAGE_KEY,
  PURPOSE_STORAGE_KEY,
  readInteriorStyleSelection,
  readPreferenceSelection,
  STYLE_STORAGE_KEY,
} from "../onboardingSelection";

// 이 저장소에는 jsdom/RTL 설정이 없어(기존 .test.tsx도 DOM을 마운트하지 않고
// 컴포넌트를 순수 함수로 다룬다) Navbar/페이지를 마운트하는 대신, 버튼 disabled와
// navigation handler가 공통으로 쓰는 순수 결정 함수(canAdvanceFromPath 등)를
// 직접 검증한다.

function createMemoryStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem"> {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null };
}

// Navbar.goNext의 가드(`if (!canAdvanceFromPath(pathname, storage)) return;`)를
// 그대로 흉내 낸 헬퍼 — disabled를 우회한 호출에서도 navigation이 실제로 실행되지
// 않는지 검증한다.
function simulateGoNext(
  pathname: string,
  storage: Pick<Storage, "getItem">,
  navigate: () => void,
): void {
  if (!canAdvanceFromPath(pathname, storage)) return;
  navigate();
}

describe("id normalization", () => {
  it("accepts only supported lifestyle ids", () => {
    expect(normalizeLifestyleId("rest")).toBe("rest");
    expect(normalizeLifestyleId("work")).toBe("work");
    expect(normalizeLifestyleId("")).toBeNull();
    expect(normalizeLifestyleId("banana")).toBeNull();
    expect(normalizeLifestyleId(null)).toBeNull();
  });

  it("accepts only supported interior style ids", () => {
    expect(normalizeInteriorStyleId("minimal")).toBe("minimal");
    expect(normalizeInteriorStyleId("midcentury")).toBe("midcentury");
    expect(normalizeInteriorStyleId("")).toBeNull();
    expect(normalizeInteriorStyleId("vaporwave")).toBeNull();
  });
});

describe("/preference required selection", () => {
  it("1. 아무것도 선택하지 않음 → 이동 불가 + 두 항목 안내", () => {
    const storage = createMemoryStorage();
    expect(isPreferenceSelectionComplete(storage)).toBe(false);
    expect(canAdvanceFromPath("/preference", storage)).toBe(false);
    expect(getPreferenceGuidanceMessage(readPreferenceSelection(storage)))
      .toBe("라이프스타일과 색상 톤을 선택해 주세요.");
  });

  it("2. 라이프스타일만 선택 → 이동 불가 + 색상 톤 안내", () => {
    const storage = createMemoryStorage({ [PURPOSE_STORAGE_KEY]: "work" });
    expect(canAdvanceFromPath("/preference", storage)).toBe(false);
    expect(getPreferenceGuidanceMessage(readPreferenceSelection(storage)))
      .toBe("색상 톤을 선택해 주세요.");
  });

  it("3. 색상 톤만 선택 → 이동 불가 + 라이프스타일 안내", () => {
    const storage = createMemoryStorage({ [PALETTE_STORAGE_KEY]: "gray" });
    expect(canAdvanceFromPath("/preference", storage)).toBe(false);
    expect(getPreferenceGuidanceMessage(readPreferenceSelection(storage)))
      .toBe("라이프스타일을 선택해 주세요.");
  });

  it("4. 두 항목 모두 선택 → 이동 가능 + 안내 없음", () => {
    const storage = createMemoryStorage({
      [PURPOSE_STORAGE_KEY]: "rest",
      [PALETTE_STORAGE_KEY]: "brown",
    });
    expect(isPreferenceSelectionComplete(storage)).toBe(true);
    expect(canAdvanceFromPath("/preference", storage)).toBe(true);
    expect(getPreferenceGuidanceMessage(readPreferenceSelection(storage))).toBe("");
  });

  it("5. 유효한 두 값 저장 상태 복원 → 이동 가능", () => {
    const storage = createMemoryStorage({
      [PURPOSE_STORAGE_KEY]: "storage",
      [PALETTE_STORAGE_KEY]: "ivory",
    });
    expect(canAdvanceFromPath("/preference", storage)).toBe(true);
  });

  it("6. 한 항목만 저장된 상태 복원 → 이동 불가", () => {
    const onlyPurpose = createMemoryStorage({ [PURPOSE_STORAGE_KEY]: "hobby" });
    const onlyPalette = createMemoryStorage({ [PALETTE_STORAGE_KEY]: "blue" });
    expect(canAdvanceFromPath("/preference", onlyPurpose)).toBe(false);
    expect(canAdvanceFromPath("/preference", onlyPalette)).toBe(false);
  });

  it("7. 지원하지 않는 저장값 → 이동 불가(첫 옵션으로 치환하지 않음)", () => {
    const storage = createMemoryStorage({
      [PURPOSE_STORAGE_KEY]: "legacy-purpose",
      [PALETTE_STORAGE_KEY]: "neon",
    });
    const selection = readPreferenceSelection(storage);
    expect(selection.purpose).toBeNull();
    expect(selection.palette).toBeNull();
    expect(canAdvanceFromPath("/preference", storage)).toBe(false);
  });

  it("8. 선택 미완료 시 navigation 함수가 호출되지 않음", () => {
    const navigate = vi.fn();
    const incomplete = createMemoryStorage({ [PURPOSE_STORAGE_KEY]: "work" });
    simulateGoNext("/preference", incomplete, navigate);
    expect(navigate).not.toHaveBeenCalled();

    const complete = createMemoryStorage({
      [PURPOSE_STORAGE_KEY]: "work",
      [PALETTE_STORAGE_KEY]: "green",
    });
    simulateGoNext("/preference", complete, navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe("/reference-image required selection", () => {
  it("1. 스타일 미선택 → 이동 불가 + 안내", () => {
    const storage = createMemoryStorage();
    expect(isReferenceStyleSelectionComplete(storage)).toBe(false);
    expect(canAdvanceFromPath("/reference-image", storage)).toBe(false);
    expect(getReferenceStyleGuidanceMessage(readInteriorStyleSelection(storage)))
      .toBe("인테리어 스타일을 선택해 주세요.");
  });

  it("2. 유효한 스타일 선택 → 이동 가능 + 안내 없음", () => {
    const storage = createMemoryStorage({ [STYLE_STORAGE_KEY]: "natural" });
    expect(canAdvanceFromPath("/reference-image", storage)).toBe(true);
    expect(getReferenceStyleGuidanceMessage(readInteriorStyleSelection(storage))).toBe("");
  });

  it("3. 유효한 저장값 복원 → 이동 가능", () => {
    const storage = createMemoryStorage({ [STYLE_STORAGE_KEY]: "classic" });
    expect(canAdvanceFromPath("/reference-image", storage)).toBe(true);
  });

  it("4. 지원하지 않는 저장값 복원 → 이동 불가", () => {
    const storage = createMemoryStorage({ [STYLE_STORAGE_KEY]: "brutalist" });
    expect(readInteriorStyleSelection(storage)).toBeNull();
    expect(canAdvanceFromPath("/reference-image", storage)).toBe(false);
  });

  it("5. 스타일 미선택 시 navigation 함수가 호출되지 않음", () => {
    const navigate = vi.fn();
    simulateGoNext("/reference-image", createMemoryStorage(), navigate);
    expect(navigate).not.toHaveBeenCalled();

    simulateGoNext(
      "/reference-image",
      createMemoryStorage({ [STYLE_STORAGE_KEY]: "modern" }),
      navigate,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe("non-gated steps are unaffected", () => {
  it("게이트 대상이 아닌 경로는 선택과 무관하게 이동 가능", () => {
    const storage = createMemoryStorage();
    expect(canAdvanceFromPath("/", storage)).toBe(true);
    expect(canAdvanceFromPath("/rooms", storage)).toBe(true);
    expect(canAdvanceFromPath("/manage-furniture", storage)).toBe(true);
    expect(canAdvanceFromPath("/recommendation", storage)).toBe(true);
    expect(canAdvanceFromPath("/editor", storage)).toBe(true);
    // /add-furniture is no longer a routed page (it's an in-editor sidebar
    // widget now — see FurnitureCatalogPanel.tsx) so it's not gated either.
    expect(canAdvanceFromPath("/add-furniture", storage)).toBe(true);
  });
});
