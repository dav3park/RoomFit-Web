import { useState } from "react";
import { FiArrowLeft, FiX } from "react-icons/fi";

import { addFurnitureAt } from "../../api/layouts";
import { applyBackendFurnitureToLayout } from "../../api/rooms";
import FurnitureVisual from "../ui/FurnitureVisual";
import { CatalogProductPreview } from "../furniture/variants/CatalogProductPreview";
import { getProductionFurnitureVariantRenderResources } from "../furniture/variants/furnitureVariantRouting";
import {
  FURNITURE_SELECTION_CATEGORIES,
  FURNITURE_SELECTION_ITEMS,
} from "../../config/furnitureSelectionCatalog";
import type { CanonicalFurnitureType } from "../../config/canonicalFurnitureType";
import catalogDocument from "../../data/furniture/catalog.json";
import type { LayoutResponse } from "../../api/layouts";
import type { RoomLayout } from "../../types";

type CatalogProduct = (typeof catalogDocument.products)[number];

const { materialPresets, registry } = getProductionFurnitureVariantRenderResources();

interface FurnitureCatalogPanelProps {
  layoutId: number;
  room: RoomLayout;
  onPlaced: (updatedRoom: RoomLayout, response: LayoutResponse) => void;
  onClose: () => void;
}

/**
 * The "+ 가구 추가" left-side widget in the editor — browse category → type →
 * real catalog products, click one to drop it into the room immediately.
 * Was previously a full-page route (see git history of AddFurniture.tsx);
 * moved in-editor so it reads as a tool panel, not a screen change.
 */
export default function FurnitureCatalogPanel({ layoutId, room, onPlaced, onClose }: FurnitureCatalogPanelProps) {
  const [activeCategory, setActiveCategory] = useState<(typeof FURNITURE_SELECTION_CATEGORIES)[number]>("전체");
  const [activeType, setActiveType] = useState<CanonicalFurnitureType | null>(null);
  const [placingProductId, setPlacingProductId] = useState<string | null>(null);
  const [placementError, setPlacementError] = useState("");

  const visibleTypeCards =
    activeCategory === "전체"
      ? FURNITURE_SELECTION_ITEMS
      : FURNITURE_SELECTION_ITEMS.filter((item) => item.category === activeCategory);

  const activeTypeCard = FURNITURE_SELECTION_ITEMS.find((item) => item.canonicalType === activeType) ?? null;
  const products: CatalogProduct[] = activeType
    ? catalogDocument.products.filter((product) => product.furnitureType === activeType)
    : [];

  const handlePlace = async (product: CatalogProduct) => {
    if (placingProductId) return;

    setPlacingProductId(product.productId);
    setPlacementError("");
    try {
      const response = await addFurnitureAt(layoutId, {
        productId: product.productId,
        // Room center — the user drags it into place afterward; the red/
        // orange decal already shows instantly if this overlaps something.
        position: { x: 0, z: 0 },
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
          <strong className="block truncate text-sm font-extrabold">
            {activeTypeCard ? `${activeTypeCard.name} 고르기` : "가구 추가"}
          </strong>
          <span className="block text-xs font-medium text-[#888888]">
            {activeTypeCard ? "클릭하면 방에 바로 배치돼요." : "종류를 눌러 제품을 골라보세요."}
          </span>
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

      {activeType ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            onClick={() => setActiveType(null)}
            className="mx-4 mt-3 inline-flex items-center gap-2 self-start text-xs font-extrabold text-[#555555] hover:text-[#111111]"
          >
            <FiArrowLeft aria-hidden="true" /> 종류 다시 고르기
          </button>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {products.map((product) => (
              <button
                key={product.productId}
                type="button"
                onClick={() => void handlePlace(product)}
                disabled={placingProductId !== null}
                className="w-full rounded-lg border border-transparent bg-white p-2 text-left transition-colors hover:border-[#111111] disabled:cursor-wait disabled:opacity-60"
              >
                <div className="overflow-hidden rounded-md bg-[#f6f3ef]">
                  <CatalogProductPreview variantId={product.variantId} registry={registry} materialPresets={materialPresets} />
                </div>
                <strong className="mt-2 block text-xs font-extrabold">{product.label}</strong>
                <span className="mt-0.5 block text-[11px] font-medium text-[#777777]">
                  {formatDimensionMm(product.dimensions)}
                </span>
                {placingProductId === product.productId && (
                  <span className="mt-0.5 block text-[11px] font-bold text-[#111111]">배치하는 중...</span>
                )}
              </button>
            ))}
            {products.length === 0 && (
              <p className="text-xs font-semibold text-[#888888]">이 종류의 제품이 아직 없어요.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <nav className="flex gap-2 overflow-x-auto border-b border-[#eeeeee] px-4 py-3">
            {FURNITURE_SELECTION_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors whitespace-nowrap ${
                  activeCategory === category ? "bg-[#111111] text-white" : "bg-[#f2f2f2] text-[#555555] hover:bg-[#e6e6e6]"
                }`}
              >
                {category}
              </button>
            ))}
          </nav>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto px-4 py-3 content-start">
            {visibleTypeCards.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveType(item.canonicalType)}
                className="rounded-lg border border-transparent bg-white p-2 text-left transition-all hover:border-[#111111]"
              >
                <FurnitureVisual type={item.visual} />
                <strong className="mt-2 block text-xs font-extrabold">{item.name}</strong>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function formatDimensionMm(dimensions: { width: number; depth: number; height: number }): string {
  return `W${Math.round(dimensions.width * 1000)} D${Math.round(dimensions.depth * 1000)} H${Math.round(dimensions.height * 1000)}`;
}
