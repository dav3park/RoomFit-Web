import { FaRug } from "react-icons/fa6";
import { FiExternalLink, FiShoppingBag } from "react-icons/fi";
import {
  MdOutlineBed,
  MdOutlineDesk,
  MdOutlineLibraryBooks,
  MdOutlineLightbulb,
  MdOutlineWeekend,
} from "react-icons/md";

import type { MockProductApiItem } from "../../api/products";
import { buildShoppingListEntries } from "../../config/shoppingList";
import type { Furniture, FurnitureCategory } from "../../types";
import { isFixtureFurniture } from "../../config/fixtureType";

export type ShoppingListLoadStatus = "loading" | "success" | "error";

interface ShoppingListPanelProps {
  furniture: Furniture[];
  products: MockProductApiItem[];
  status: ShoppingListLoadStatus;
  onRetry: () => void;
}

const ICONS: Record<FurnitureCategory, typeof MdOutlineBed> = {
  bed: MdOutlineBed,
  desk: MdOutlineDesk,
  chair: MdOutlineWeekend,
  cabinet: MdOutlineLibraryBooks,
  rug: FaRug,
  lighting: MdOutlineLightbulb,
  fixture: FiShoppingBag,
  unsupported: FiShoppingBag,
};

const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  bed: "침실 가구",
  desk: "책상 / 테이블",
  chair: "의자 / 소파",
  cabinet: "수납 가구",
  rug: "러그",
  lighting: "조명",
  fixture: "고정설비",
  unsupported: "가구",
};

export default function ShoppingListPanel({
  furniture,
  products,
  status,
  onRetry,
}: ShoppingListPanelProps) {
  if (status === "loading") {
    return <p role="status" className="text-sm font-semibold leading-6 text-[#777777]">쇼핑 리스트를 불러오는 중이에요...</p>;
  }

  if (status === "error") {
    return (
      <div role="alert" className="rounded-lg bg-[#fff8f6] p-4 text-sm font-semibold text-[#6f3329]">
        <p>상품 정보를 불러오지 못했습니다.</p>
        <button type="button" onClick={onRetry} className="mt-3 font-extrabold underline">다시 시도</button>
      </div>
    );
  }

  // 고정설비(싱크대·냉장고 등)는 방의 일부라 살 물건이 아니다.
  const activeFurniture = furniture.filter((item) => item.status !== "deleted" && !isFixtureFurniture(item));
  if (activeFurniture.length === 0) {
    return <p className="text-sm font-semibold leading-6 text-[#777777]">현재 배치에 쇼핑할 가구가 없습니다.</p>;
  }

  const entries = buildShoppingListEntries(activeFurniture, products);
  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const Icon = ICONS[entry.category];
        const detail = [
          entry.brand,
          entry.price === null ? null : `${entry.price.toLocaleString("ko-KR")}원`,
          CATEGORY_LABELS[entry.category],
        ].filter(Boolean).join(" · ");
        const content = (
          <>
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-[#f3f0eb]">
              <Icon className="h-6 w-6 text-[#8b633d]" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm font-bold">
                {entry.name}{entry.quantity > 1 ? ` × ${entry.quantity}` : ""}
              </strong>
              <span className="mt-0.5 block truncate text-xs font-medium text-[#999999]">{detail}</span>
              {!entry.purchaseUrl && (
                <span className="mt-1 block text-xs font-bold text-[#a06a00]">구매 링크 준비 중</span>
              )}
            </span>
          </>
        );

        return (
          <li key={entry.key} data-product-id={entry.productId ?? undefined}>
            {entry.purchaseUrl ? (
              <a
                href={entry.purchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${entry.name} 구매 페이지 새 탭으로 열기`}
                className="flex items-center gap-3.5 rounded-lg border border-[#eeeeee] p-3 transition-colors hover:border-[#111111] hover:bg-[#f9f9f9]"
              >
                {content}
                <FiExternalLink className="h-4 w-4 shrink-0 text-[#999999]" />
              </a>
            ) : (
              <div className="flex items-center gap-3.5 rounded-lg border border-[#eeeeee] p-3" aria-label={`${entry.name}, 구매 링크 준비 중`}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
