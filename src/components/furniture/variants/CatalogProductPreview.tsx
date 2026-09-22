import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { FurnitureVariantRenderer } from "./FurnitureVariantRenderer";
import { getProductionFurnitureVisualFootprint } from "./productionFurnitureCatalog";
import type { FurnitureVariantRegistry } from "./FurnitureVariantRegistry";
import type { MaterialPresetCatalog } from "./materialResolver";

interface CatalogProductPreviewProps {
  variantId: string;
  registry: FurnitureVariantRegistry;
  materialPresets: Readonly<MaterialPresetCatalog>;
}

/**
 * A small, static (no orbit controls, no grid/axes gizmos) 3D thumbnail for a
 * catalog product card — unlike `FurnitureVariantPreview` (the dev inspector
 * harness), this is meant to render several at once in a product grid, so it
 * stays deliberately bare.
 *
 * Frames on the variant's actual rendered bounding box (`visualFootprint`),
 * not on local origin (0,0) — several variants (corner desks, asymmetric
 * legs, etc.) render off-center from their own local origin, which used to
 * crop half the object out of frame when the camera aimed at (0, h/2, 0).
 */
export function CatalogProductPreview({ variantId, registry, materialPresets }: CatalogProductPreviewProps) {
  const variant = registry.getFurnitureVariant(variantId);
  const footprint = getProductionFurnitureVisualFootprint(variantId);
  const centerX = footprint ? (footprint.minX + footprint.maxX) / 2 : 0;
  const centerZ = footprint ? (footprint.minZ + footprint.maxZ) / 2 : 0;
  const spanX = footprint ? footprint.maxX - footprint.minX : variant.dimensions.width;
  const spanZ = footprint ? footprint.maxZ - footprint.minZ : variant.dimensions.depth;
  const targetY = variant.dimensions.height / 2;
  const distance = Math.max(spanX, spanZ, variant.dimensions.height, 0.5) * 1.9;

  const target = useMemo<[number, number, number]>(
    () => [centerX, targetY, centerZ],
    [centerX, targetY, centerZ],
  );
  const cameraPosition = useMemo<[number, number, number]>(
    () => [centerX + distance * 0.85, targetY + distance * 0.7, centerZ + distance * 0.85],
    [centerX, centerZ, distance, targetY],
  );

  return (
    <div style={{ width: "100%", aspectRatio: "4 / 3" }}>
      <Canvas
        camera={{ position: cameraPosition, fov: 40 }}
        onCreated={({ camera }) => camera.lookAt(...target)}
      >
        <color attach="background" args={["#f6f3ef"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[centerX + 2, 4, centerZ + 3]} intensity={1.0} />
        <FurnitureVariantRenderer variantId={variantId} registry={registry} materialPresets={materialPresets} />
      </Canvas>
    </div>
  );
}

export default CatalogProductPreview;
