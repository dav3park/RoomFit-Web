import { furnitureVisuals, type FurnitureVisualType } from "./furnitureVisualRegistry";

// Shared between FurnitureCatalogPanel.tsx's type grid and LayoutConfirm.tsx's
// shopping-list thumbnails. Each product owns a distinct SVG illustration in
// FurnitureVisuals.tsx; `scale` is kept for compact thumbnail use sites.
export default function FurnitureVisual({
  type,
  className = "h-36",
  scale = 1,
}: {
  type: FurnitureVisualType;
  className?: string;
  scale?: number;
}) {
  const Visual = furnitureVisuals[type];

  return (
    <div className={`relative grid place-items-center overflow-hidden rounded-lg bg-[#f3f0eb] ${className}`}>
      <Visual
        className="h-[82px] w-[110px]"
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
      />
    </div>
  );
}
