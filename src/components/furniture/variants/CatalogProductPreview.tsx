import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, type ComponentRef } from "react";
import { FurnitureVariantRenderer } from "./FurnitureVariantRenderer";
import { getProductionFurnitureVisualFootprint } from "./productionFurnitureCatalog";
import type { FurnitureVariantRegistry } from "./FurnitureVariantRegistry";
import type { MaterialPresetCatalog } from "./materialResolver";

interface CatalogProductPreviewProps {
  variantId: string;
  registry: FurnitureVariantRegistry;
  materialPresets: Readonly<MaterialPresetCatalog>;
  interactive?: boolean;
  allowOrbit?: boolean;
  transparentBackground?: boolean;
  label?: string;
}

/**
 * A small, static by default (no grid/axes gizmos) 3D thumbnail for a
 * catalog product card — unlike `FurnitureVariantPreview` (the dev inspector
 * harness), this is meant to render several at once in a product grid, so it
 * stays deliberately bare.
 *
 * Frames on the variant's actual rendered bounding box (`visualFootprint`),
 * not on local origin (0,0) — several variants (corner desks, asymmetric
 * legs, etc.) render off-center from their own local origin, which used to
 * crop half the object out of frame when the camera aimed at (0, h/2, 0).
 */
export function CatalogProductPreview({ variantId, registry, materialPresets, interactive = false, allowOrbit = true, transparentBackground = false, label }: CatalogProductPreviewProps) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const variant = registry.getFurnitureVariant(variantId);
  const footprint = getProductionFurnitureVisualFootprint(variantId);
  const centerX = footprint ? (footprint.minX + footprint.maxX) / 2 : 0;
  const centerZ = footprint ? (footprint.minZ + footprint.maxZ) / 2 : 0;
  const spanX = footprint ? footprint.maxX - footprint.minX : variant.dimensions.width;
  const spanZ = footprint ? footprint.maxZ - footprint.minZ : variant.dimensions.depth;
  const targetY = variant.dimensions.height / 2;
  const distance = Math.max(spanX, spanZ, variant.dimensions.height, 0.5) * (interactive ? 1.35 : 1.9);

  const target = useMemo<[number, number, number]>(
    () => [centerX, targetY, centerZ],
    [centerX, targetY, centerZ],
  );
  const cameraPosition = useMemo<[number, number, number]>(
    () => [centerX + distance * 0.85, targetY + distance * 0.7, centerZ + distance * 0.85],
    [centerX, centerZ, distance, targetY],
  );

  return (
    <div
      style={{ width: "100%", aspectRatio: interactive ? "1" : "4 / 3" }}
      tabIndex={interactive && allowOrbit ? 0 : undefined}
      role={interactive ? "group" : undefined}
      aria-label={interactive ? `${label ?? variantId} 3D 미리보기. ${allowOrbit ? "드래그 또는 좌우 방향키로 회전" : "작업 공간으로 끌어 배치"}` : undefined}
      onKeyDown={interactive && allowOrbit ? event => {
        if (!controls.current || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        controls.current.setAzimuthalAngle(controls.current.getAzimuthalAngle() + (event.key === "ArrowLeft" ? -1 : 1) * Math.PI / 8);
      } : undefined}
    >
      <Canvas
        gl={{ alpha: true, preserveDrawingBuffer: transparentBackground }}
        frameloop={interactive ? "demand" : "always"}
        camera={{ position: cameraPosition, fov: 40 }}
        onCreated={({ camera }) => camera.lookAt(...target)}
      >
        {!transparentBackground && <color attach="background" args={["#f6f3ef"]} />}
        <ambientLight intensity={0.85} />
        <directionalLight position={[centerX + 2, 4, centerZ + 3]} intensity={1.0} />
        <FurnitureVariantRenderer variantId={variantId} registry={registry} materialPresets={materialPresets} />
        {interactive && allowOrbit && <OrbitControls ref={controls} target={target} enablePan={false} enableZoom={false} enableDamping={false} minPolarAngle={0.15} maxPolarAngle={Math.PI / 2} />}
      </Canvas>
    </div>
  );
}

export default CatalogProductPreview;
