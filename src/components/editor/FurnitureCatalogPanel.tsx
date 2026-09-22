import { useEffect, useMemo, useRef, useState } from "react";
import { FiX } from "react-icons/fi";

import { addFurnitureAt } from "../../api/layouts";
import { applyBackendFurnitureToLayout } from "../../api/rooms";
import FurnitureVisual from "../ui/FurnitureVisual";
import { CatalogProductPreview } from "../furniture/variants/CatalogProductPreview";
import { getProductionFurnitureVariantRenderResources } from "../furniture/variants/furnitureVariantRouting";
import { findFreePlacement } from "../../geometry/placement";
import { FURNITURE_SELECTION_ITEMS } from "../../config/furnitureSelectionCatalog";
import type { FurnitureVisualType } from "../ui/furnitureVisualRegistry";
import type { CanonicalFurnitureType } from "../../config/canonicalFurnitureType";
import catalogDocument from "../../data/furniture/catalog.json";
import type { LayoutResponse } from "../../api/layouts";
import type { RoomLayout } from "../../types";

type CatalogProduct = (typeof catalogDocument.products)[number];

const { materialPresets, registry } = getProductionFurnitureVariantRenderResources();

// 카테고리 안에 타입이 하나뿐이면(소파, 의자, 책장, 선반, 파티션…) 그 카테고리
// 하나를 위해 탭을 따로 두지 않고 전부 "기타"로 묶는다.
const OTHER_CATEGORY_LABEL = "기타";

interface CategoryGroup {
  label: string;
  types: readonly CanonicalFurnitureType[];
}

const CATEGORY_GROUPS: readonly CategoryGroup[] = buildCategoryGroups();
const DEFAULT_CATEGORY = CATEGORY_GROUPS[0]?.label ?? OTHER_CATEGORY_LABEL;

function buildCategoryGroups(): CategoryGroup[] {
  const byCategory = new Map<string, CanonicalFurnitureType[]>();
  for (const item of FURNITURE_SELECTION_ITEMS) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item.canonicalType);
    byCategory.set(item.category, list);
  }

  const groups: CategoryGroup[] = [];
  const singleItemTypes: CanonicalFurnitureType[] = [];
  for (const [label, types] of byCategory) {
    if (types.length <= 1) {
      singleItemTypes.push(...types);
    } else {
      groups.push({ label, types });
    }
  }
  if (singleItemTypes.length > 0) {
    groups.push({ label: OTHER_CATEGORY_LABEL, types: singleItemTypes });
  }
  return groups;
}

const TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(FURNITURE_SELECTION_ITEMS.map((item) => [item.canonicalType, item.name])),
);
const TYPE_VISUALS: Readonly<Record<string, FurnitureVisualType>> = Object.freeze(
  Object.fromEntries(FURNITURE_SELECTION_ITEMS.map((item) => [item.canonicalType, item.visual])),
);

interface FurnitureCatalogPanelProps {
  layoutId: number;
  room: RoomLayout;
  onPlaced: (updatedRoom: RoomLayout, response: LayoutResponse) => void;
  onClose: () => void;
}

/**
 * The "+ 가구 추가" left-side widget in the editor — browse category → real
 * catalog products, click one to drop it into the room immediately. A
 * category shows every product of every type inside it right away; the
 * "종류" chips underneath only narrow that further (never a required extra
 * screen). No "전체" tab — showing every product's live 3D preview at once
 * (all ~93) blows the browser's WebGL context budget (see
 * FurnitureCatalogCard's lazy mount below, which caps this per-category too).
 * Was previously a full-page route — see git history of AddFurniture.tsx.
 */
export default function FurnitureCatalogPanel({ layoutId, room, onPlaced, onClose }: FurnitureCatalogPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>(DEFAULT_CATEGORY);
  const [activeSubType, setActiveSubType] = useState<CanonicalFurnitureType | null>(null);
  const [placingProductId, setPlacingProductId] = useState<string | null>(null);
  const [placementError, setPlacementError] = useState("");

  const activeGroup = CATEGORY_GROUPS.find((group) => group.label === activeCategory) ?? CATEGORY_GROUPS[0] ?? null;

  const products: CatalogProduct[] = useMemo(() => {
    const effectiveTypes = activeSubType ? [activeSubType] : activeGroup?.types ?? [];
    return catalogDocument.products.filter((product) => effectiveTypes.includes(product.furnitureType as CanonicalFurnitureType));
  }, [activeGroup, activeSubType]);

  const handleSelectCategory = (label: string) => {
    setActiveCategory(label);
    setActiveSubType(null);
  };

  const handlePlace = async (product: CatalogProduct) => {
    if (placingProductId) return;

    setPlacingProductId(product.productId);
    setPlacementError("");
    try {
      // Search for a spot that doesn't overlap existing furniture first — the
      // red/orange decal still shows if this genuinely has to collide (a
      // full room), but a collision should be the exception, not the default.
      const position = findFreePlacement(room, product.dimensions, product.variantId, room.furniture);
      const response = await addFurnitureAt(layoutId, {
        productId: product.productId,
        position,
        rotation: 0,
      });
      onPlaced(applyBackendFurnitureToLayout(room, response.recommendedFurniture), response);
    } catch {
      setPlacementError("가구를 배치하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPlacingProductId(null);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[#eeeeee] bg-[#fbfbfb]">
      <div className="flex items-center justify-between border-b border-[#eeeeee] px-4 py-4">
        <div className="min-w-0">
          <strong className="block truncate text-sm font-extrabold">가구 추가</strong>
          <span className="block text-xs font-medium text-[#888888]">클릭하면 방에 바로 배치돼요.</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="가구 추가 닫기"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#888888] hover:bg-[#f1f1f1] hover:text-[#111111]"
        >
          <FiX className="h-4 w-4" />
        </button>
      </div>

      {placementError && (
        <p role="alert" className="mx-4 mt-3 rounded-lg bg-[#fff1f1] px-3 py-2 text-xs font-bold text-[#b42318]">
          {placementError}
        </p>
      )}

      <nav className="flex gap-2 overflow-x-auto border-b border-[#eeeeee] px-4 py-3">
        {CATEGORY_GROUPS.map((group) => (
          <button
            key={group.label}
            type="button"
            onClick={() => handleSelectCategory(group.label)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors whitespace-nowrap ${
              activeCategory === group.label ? "bg-[#111111] text-white" : "bg-[#f2f2f2] text-[#555555] hover:bg-[#e6e6e6]"
            }`}
          >
            {group.label}
          </button>
        ))}
      </nav>

      {activeGroup && activeGroup.types.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-b border-[#eeeeee] px-4 py-2">
          <button
            type="button"
            onClick={() => setActiveSubType(null)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors whitespace-nowrap ${
              activeSubType === null ? "bg-[#e4e4e4] text-[#111111]" : "text-[#888888] hover:bg-[#f2f2f2]"
            }`}
          >
            전체
          </button>
          {activeGroup.types.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveSubType(type)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors whitespace-nowrap ${
                activeSubType === type ? "bg-[#e4e4e4] text-[#111111]" : "text-[#888888] hover:bg-[#f2f2f2]"
              }`}
            >
              {TYPE_LABELS[type] ?? type}
            </button>
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto px-4 py-3 content-start">
        {products.map((product) => (
          <FurnitureCatalogCard
            key={product.productId}
            product={product}
            isPlacing={placingProductId === product.productId}
            disabled={placingProductId !== null}
            onSelect={() => void handlePlace(product)}
          />
        ))}
        {products.length === 0 && (
          <p className="col-span-2 text-xs font-semibold text-[#888888]">이 종류의 제품이 아직 없어요.</p>
        )}
      </div>
    </aside>
  );
}

interface FurnitureCatalogCardProps {
  product: CatalogProduct;
  isPlacing: boolean;
  disabled: boolean;
  onSelect: () => void;
}

/**
 * Each card only mounts its live 3D `CatalogProductPreview` (a full WebGL
 * `<Canvas>`) once it actually scrolls into view — every browser hard-caps
 * simultaneous WebGL contexts (Chrome: 16), and a scrollable grid can hold
 * far more product cards than that (a "기타" category alone has 24). Mounting
 * every card's canvas eagerly blows that budget and breaks WebGL rendering
 * app-wide, including the main room viewport. Off-screen cards show a cheap
 * static icon instead.
 */
function FurnitureCatalogCard({ product, isPlacing, disabled, onSelect }: FurnitureCatalogCardProps) {
  const [containerRef, isVisible] = useInViewport<HTMLDivElement>();
  const visual = TYPE_VISUALS[product.furnitureType];

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="rounded-lg border border-transparent bg-white p-2 text-left transition-colors hover:border-[#111111] disabled:cursor-wait disabled:opacity-60"
    >
      <div ref={containerRef} className="grid place-items-center overflow-hidden rounded-md bg-[#f6f3ef]" style={{ aspectRatio: "4 / 3" }}>
        {isVisible ? (
          <CatalogProductPreview variantId={product.variantId} registry={registry} materialPresets={materialPresets} />
        ) : (
          visual && <FurnitureVisual type={visual} />
        )}
      </div>
      <strong className="mt-2 block text-xs font-extrabold">{product.label}</strong>
      <span className="mt-0.5 block text-[11px] font-medium text-[#777777]">
        {formatDimensionMm(product.dimensions)}
      </span>
      {isPlacing && (
        <span className="mt-0.5 block text-[11px] font-bold text-[#111111]">배치하는 중...</span>
      )}
    </button>
  );
}

/** True once `ref`'s element has scrolled into (or near) the viewport, false again once it scrolls back out. */
function useInViewport<T extends Element>(rootMargin = "150px"): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry?.isIntersecting ?? false),
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, isVisible];
}

function formatDimensionMm(dimensions: { width: number; depth: number; height: number }): string {
  return `W${Math.round(dimensions.width * 1000)} D${Math.round(dimensions.depth * 1000)} H${Math.round(dimensions.height * 1000)}`;
}
