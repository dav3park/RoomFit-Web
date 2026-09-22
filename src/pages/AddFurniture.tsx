import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

import { addFurnitureAt } from "../api/layouts";
import { applyBackendFurnitureToLayout } from "../api/rooms";
import FurnitureVisual from "../components/ui/FurnitureVisual";
import RecommendationResultPanel from "../components/editor/RecommendationResultPanel";
import { CatalogProductPreview } from "../components/furniture/variants/CatalogProductPreview";
import { getProductionFurnitureVariantRenderResources } from "../components/furniture/variants/furnitureVariantRouting";
import {
  readRecommendationResult,
  subscribeRecommendationResult,
  type RecommendationResultNotice,
} from "../config/recommendationResult";
import { readRoomSetupSession } from "../config/roomSetupSession";
import { normalizeBackendRoomId } from "../api/agentContextRequest";
import {
  isSessionForRoom,
  readActiveLayoutEditingSession,
  saveLayoutResponseSession,
} from "../config/layoutEditingSession";
import {
  FURNITURE_SELECTION_CATEGORIES,
  FURNITURE_SELECTION_ITEMS,
} from "../config/furnitureSelectionCatalog";
import type { CanonicalFurnitureType } from "../config/canonicalFurnitureType";
import catalogDocument from "../data/furniture/catalog.json";
import type { RoomLayout } from "../types";

type CatalogProduct = (typeof catalogDocument.products)[number];

const { materialPresets, registry } = getProductionFurnitureVariantRenderResources();

export default function AddFurniture() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<(typeof FURNITURE_SELECTION_CATEGORIES)[number]>("전체");
  const [activeType, setActiveType] = useState<CanonicalFurnitureType | null>(null);
  const [placingProductId, setPlacingProductId] = useState<string | null>(null);
  const [placementError, setPlacementError] = useState("");
  const [recommendationNotice, setRecommendationNotice] = useState<RecommendationResultNotice | null>(
    readCurrentRecommendationNotice,
  );

  useEffect(() => subscribeRecommendationResult(() => {
    setRecommendationNotice(readCurrentRecommendationNotice());
  }), []);

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

    const room = loadSelectedRoomLayout();
    const backendRoomId = normalizeBackendRoomId(localStorage.getItem("roomfit:backendRoomId"));
    const session = readActiveLayoutEditingSession();
    if (!room || backendRoomId === null || !isSessionForRoom(session, room.id, backendRoomId)) {
      setPlacementError("먼저 에디터의 \"+ 가구 추가\" 버튼으로 다시 들어와 주세요.");
      return;
    }

    setPlacingProductId(product.productId);
    setPlacementError("");
    try {
      const response = await addFurnitureAt(session.activeLayoutId, {
        productId: product.productId,
        // Room center — the user drags it into place afterward; the editor
        // already shows a red/orange decal instantly if this overlaps
        // something, so no "find an empty spot" search is needed here.
        position: { x: 0, z: 0 },
        rotation: 0,
      });
      const updatedRoom = applyBackendFurnitureToLayout(room, response.recommendedFurniture);
      localStorage.setItem("roomfit:selectedRoomLayout", JSON.stringify(updatedRoom));
      saveLayoutResponseSession(room.id, response, localStorage, session.editingMode);
      navigate("/editor");
    } catch {
      setPlacementError("가구를 배치하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPlacingProductId(null);
    }
  };

  return (
    <main className="min-h-[calc(100vh-76px)] bg-[#fbfbfb] px-5 py-8 text-[#141414] sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <div className="mb-12 flex items-center gap-4">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[#eeeeee] text-base font-bold">4</span>
          <span className="text-lg font-extrabold">가구 · 소품 선택</span>
        </div>

        <header className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-normal sm:text-4xl">
            {activeTypeCard ? `${activeTypeCard.name} 고르기` : "배치하고 싶은 가구와 소품을 선택하세요"}
          </h1>
          <p className="mt-3 text-sm font-semibold text-[#777777]">
            {activeTypeCard ? "원하는 제품을 클릭하면 방에 바로 배치돼요." : "카테고리를 눌러 원하는 종류를 골라보세요."}
          </p>
        </header>

        {recommendationNotice && (
          <div className="mb-8">
            <RecommendationResultPanel notice={recommendationNotice} />
          </div>
        )}
        {placementError && (
          <p role="alert" className="mb-8 rounded-xl border border-[#d7b7b1] bg-[#fff8f6] px-5 py-4 text-sm font-semibold text-[#6f3329]">
            {placementError}
          </p>
        )}

        <div className="grid gap-8 lg:grid-cols-[128px_1fr]">
          <aside>
            <nav className="flex gap-2 overflow-x-auto rounded-xl bg-[#f2f2f2] p-2 lg:flex-col lg:overflow-visible">
              {FURNITURE_SELECTION_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category);
                    setActiveType(null);
                  }}
                  className={`shrink-0 rounded-lg px-4 py-3 text-left text-sm font-extrabold transition-colors whitespace-nowrap ${
                    activeCategory === category ? "bg-white text-[#111111] shadow-sm" : "text-[#555555] hover:bg-white/70"
                  }`}
                >
                  {category}
                </button>
              ))}
            </nav>
          </aside>

          <section>
            {activeType ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveType(null)}
                  className="mb-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#555555] hover:text-[#111111]"
                >
                  <FiArrowLeft aria-hidden="true" /> 종류 다시 고르기
                </button>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((product) => (
                    <button
                      key={product.productId}
                      type="button"
                      onClick={() => void handlePlace(product)}
                      disabled={placingProductId !== null}
                      className="rounded-lg border border-transparent bg-white p-3 text-left transition-all hover:-translate-y-1 hover:border-[#111111] hover:shadow-[0_18px_35px_rgba(0,0,0,0.08)] disabled:cursor-wait disabled:opacity-60"
                    >
                      <div className="overflow-hidden rounded-md bg-[#f6f3ef]">
                        <CatalogProductPreview variantId={product.variantId} registry={registry} materialPresets={materialPresets} />
                      </div>
                      <strong className="mt-3 block text-sm font-extrabold">{product.label}</strong>
                      <span className="mt-1 block text-xs font-medium text-[#777777]">
                        {formatDimensionMm(product.dimensions)}
                      </span>
                      {placingProductId === product.productId && (
                        <span className="mt-1 block text-xs font-bold text-[#111111]">배치하는 중...</span>
                      )}
                    </button>
                  ))}
                  {products.length === 0 && (
                    <p className="text-sm font-semibold text-[#888888]">이 종류의 제품이 아직 없어요.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {visibleTypeCards.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveType(item.canonicalType)}
                    className="rounded-lg border border-transparent bg-white p-3 text-left transition-all hover:-translate-y-1 hover:shadow-[0_18px_35px_rgba(0,0,0,0.08)]"
                  >
                    <FurnitureVisual type={item.visual} />
                    <strong className="mt-4 block text-sm font-extrabold">{item.name}</strong>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function formatDimensionMm(dimensions: { width: number; depth: number; height: number }): string {
  return `W${Math.round(dimensions.width * 1000)} D${Math.round(dimensions.depth * 1000)} H${Math.round(dimensions.height * 1000)}`;
}

function loadSelectedRoomLayout(): RoomLayout | null {
  const raw = localStorage.getItem("roomfit:selectedRoomLayout");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoomLayout;
  } catch {
    return null;
  }
}

function readCurrentRecommendationNotice(): RecommendationResultNotice | null {
  const setup = readRoomSetupSession();
  if (!setup?.roomLayoutId || setup.backendRoomId === null) return null;
  return readRecommendationResult({
    sessionId: setup.sessionId,
    roomLayoutId: setup.roomLayoutId,
    backendRoomId: setup.backendRoomId,
  });
}
