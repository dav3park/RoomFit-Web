import Material from "../materials/Material";
import { furnitureThemeColors } from "./furnitureTheme";
import { materialFromConfig } from "../materials/materialConfig";
import Bed from "./Bed";
import Bookshelf from "./Bookshelf";
import Chair from "./Chair";
import FloatingShelf from "./FloatingShelf";
import Lamp from "./Lamp";
import MidCenturyCollectorFurniture from "./MidCenturyCollectorFurniture";
import ModelFurniture from "./ModelFurniture";
import Plant from "./Plant";
import Sofa from "./Sofa";
import Storage from "./Storage";
import Table from "./Table";
import Television from "./Television";
import { FurnitureVariantRenderer } from "./variants/FurnitureVariantRenderer";
import {
  getFurnitureVariantLocalYOffset,
  getProductionFurnitureVariantRenderResources,
  resolveFurnitureVariant,
  warnFurnitureVariantDimensionMismatch,
} from "./variants/furnitureVariantRouting";
import type { Furniture } from "../../types";
import type { PreferredColorToneId } from "../../config/preferredColorTone";
import type { Vector3Tuple } from "./variants/types";

export default function FurnitureRenderer({
  item,
  preferredColorTone,
  visualScale,
}: {
  item: Furniture;
  preferredColorTone?: PreferredColorToneId | null;
  visualScale?: Vector3Tuple;
}) {
  const variant = resolveFurnitureVariant(item.variantId);

  if (variant) {
    const { materialPresets, registry } = getProductionFurnitureVariantRenderResources();
    if (!visualScale) warnFurnitureVariantDimensionMismatch(variant.variantId, item.dimensions, variant.dimensions);

    return (
      <FurnitureVariantRenderer
        variantId={variant.variantId}
        registry={registry}
        materialPresets={materialPresets}
        layoutPosition={[0, getFurnitureVariantLocalYOffset(item.dimensions.height), 0]}
        preferredColorTone={preferredColorTone}
        visualScale={visualScale}
      />
    );
  }

  // Legacy renderers receive the same part roles without changing scan geometry.
  const renderedItem = item;
  const colors = furnitureThemeColors(preferredColorTone);
  const name = `${renderedItem.id} ${renderedItem.name}`.toLowerCase();
  const material = materialFromConfig(renderedItem.material, renderedItem.color);

  if (renderedItem.geometry === "model" && renderedItem.model) {
    return <ModelFurniture item={renderedItem} />;
  }

  if (name.includes("plant") || renderedItem.name.includes("화병")) {
    return <Plant item={renderedItem} colors={colors} />;
  }

  if (renderedItem.id.startsWith("collector-") || renderedItem.id.startsWith("studio-")) {
    return <MidCenturyCollectorFurniture item={renderedItem} colors={colors} />;
  }

  if (renderedItem.category === "lighting") {
    return <Lamp item={renderedItem} colors={colors} />;
  }

  if (renderedItem.category === "rug" || renderedItem.geometry === "plane") {
    if (renderedItem.geometry === "cylinder") {
      return (
        <group>
          <mesh receiveShadow position={[0, -renderedItem.dimensions.height / 2 + 0.018, 0]}>
            <cylinderGeometry args={[renderedItem.dimensions.width / 2, renderedItem.dimensions.width / 2, renderedItem.dimensions.height, 64]} />
            <Material {...material} color={colors?.primary[0] ?? material.color} roughness={material.roughness ?? 0.96} />
          </mesh>
          {name.includes("라탄") &&
            [0.32, 0.53, 0.73, 0.9].map((ratio) => (
              <mesh key={ratio} position={[0, -renderedItem.dimensions.height / 2 + 0.027, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
                <torusGeometry args={[renderedItem.dimensions.width * ratio * 0.5, 0.009, 8, 64]} />
                <meshStandardMaterial color="#b18a58" roughness={0.9} />
              </mesh>
            ))}
        </group>
      );
    }

    return (
      <mesh receiveShadow position={[0, -renderedItem.dimensions.height / 2 + 0.018, 0]}>
        <boxGeometry args={[renderedItem.dimensions.width, renderedItem.dimensions.height, renderedItem.dimensions.depth]} />
        <Material {...material} color={colors?.primary[0] ?? material.color} roughness={material.roughness ?? 0.96} />
      </mesh>
    );
  }

  if (renderedItem.category === "bed") {
    return <Bed item={renderedItem} colors={colors} />;
  }

  if (renderedItem.category === "desk") {
    return <Table item={renderedItem} colors={colors} />;
  }

  if (renderedItem.category === "chair") {
    // "chair" covers both real chairs and sofas (rooms.ts collapses both
    // furniture types into this one category) — only render the wide
    // cushioned Sofa for items actually labeled as one, a single-seat Chair
    // otherwise, so a desk chair doesn't get mistaken for a couch.
    if (name.includes("소파") || name.includes("sofa") || name.includes("couch")) {
      return <Sofa item={renderedItem} colors={colors} />;
    }
    return <Chair item={renderedItem} colors={colors} />;
  }

  if (name.includes("tv") && !name.includes("stand")) {
    return <Television item={renderedItem} colors={colors} />;
  }

  if (renderedItem.name.includes("선반")) {
    return <FloatingShelf item={renderedItem} colors={colors} />;
  }

  if (renderedItem.name.includes("책장") || name.includes("shelf")) {
    return <Bookshelf item={renderedItem} colors={colors} />;
  }

  if (renderedItem.category === "cabinet") {
    return <Storage item={renderedItem} colors={colors} />;
  }

  if (renderedItem.geometry === "cylinder") {
    return (
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[renderedItem.dimensions.width / 2, renderedItem.dimensions.width / 2, renderedItem.dimensions.height, 48]} />
        <Material {...material} color={material.type === "glass" ? material.color : colors?.primary[0] ?? material.color} />
      </mesh>
    );
  }

  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[renderedItem.dimensions.width, renderedItem.dimensions.height, renderedItem.dimensions.depth]} />
      <Material {...material} color={material.type === "glass" ? material.color : colors?.primary[0] ?? material.color} />
    </mesh>
  );
}
