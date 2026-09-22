import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { FurnitureVariantRenderer } from "./FurnitureVariantRenderer";
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
 * harness), this is meant to render dozens at once in a product grid, so it
 * stays deliberately bare.
 */
export function CatalogProductPreview({ variantId, registry, materialPresets }: CatalogProductPreviewProps) {
  const variant = registry.getFurnitureVariant(variantId);
  const targetY = variant.dimensions.height / 2;
  const distance = Math.max(variant.dimensions.width, variant.dimensions.depth, variant.dimensions.height, 0.5) * 1.9;
  const target = useMemo<[number, number, number]>(() => [0, targetY, 0], [targetY]);
  const cameraPosition = useMemo<[number, number, number]>(
    () => [distance * 0.85, targetY + distance * 0.7, distance * 0.85],
    [distance, targetY],
  );

  return (
    <div style={{ width: "100%", aspectRatio: "4 / 3" }}>
      <Canvas
        camera={{ position: cameraPosition, fov: 40 }}
        onCreated={({ camera }) => camera.lookAt(...target)}
      >
        <color attach="background" args={["#f6f3ef"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 4, 3]} intensity={1.0} />
        <FurnitureVariantRenderer variantId={variantId} registry={registry} materialPresets={materialPresets} />
      </Canvas>
    </div>
  );
}

export default CatalogProductPreview;
