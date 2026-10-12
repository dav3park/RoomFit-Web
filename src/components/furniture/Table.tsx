import { RoundedBox } from "@react-three/drei";
import Material from "../materials/Material";
import { materialFromConfig } from "../materials/materialConfig";
import type { FurnitureRenderProps } from "./furnitureTheme";

// RoundedBoxGeometry errors if radius exceeds half of any edge, so this caps
// a desired radius to whatever the box's own thinnest dimension allows.
function safeRadius(dims: number[], desired: number): number {
  return Math.min(desired, Math.min(...dims) * 0.35);
}

export default function Table({ item, colors }: FurnitureRenderProps) {
  const material = materialFromConfig(item.material, item.color);
  const radius = Math.min(item.dimensions.width, item.dimensions.depth) / 2;
  // item.theme (set only by a demo scenario restyle — see
  // config/scenarios.ts) picks the leg tone explicitly. Undefined ("기본")
  // always keeps the original wood-brown legs regardless of the tabletop's
  // own (often near-white, scan-derived) color — deriving the leg color from
  // that made an unstyled desk's legs turn accidentally gray before any
  // scenario was ever applied.
  const legColor = colors?.wood[1] ?? (item.theme === "gray" ? "#9a9a9a" : item.theme === "wood" ? "#6b4a2c" : "#8d6037");

  // Rectangular desks (the common case for a scanned desk) — a tabletop on
  // four legs instead of a solid block.
  if (item.geometry === "box" || item.dimensions.width !== item.dimensions.depth) {
    const { width, depth, height } = item.dimensions;
    const topThickness = Math.min(0.04, height * 0.12);
    const legInset = 0.05;
    const legThickness = 0.045;
    const legHeight = height - topThickness;
    const legX = width / 2 - legInset - legThickness / 2;
    const legZ = depth / 2 - legInset - legThickness / 2;

    const topDims: [number, number, number] = [width, topThickness, depth];

    return (
      <group>
        <RoundedBox
          args={topDims}
          radius={safeRadius(topDims, 0.02)}
          smoothness={4}
          castShadow
          receiveShadow
          position={[0, height / 2 - topThickness / 2, 0]}
        >
          <Material {...material} color={material.type === "glass" ? material.color : colors?.secondary[0] ?? material.color} />
        </RoundedBox>
        {[
          [legX, legZ],
          [-legX, legZ],
          [legX, -legZ],
          [-legX, -legZ],
        ].map(([x, z], index) => (
          <mesh key={index} castShadow receiveShadow position={[x, -topThickness / 2, z]}>
            <boxGeometry args={[legThickness, legHeight, legThickness]} />
            <Material type="wood" color={legColor} roughness={0.58} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, item.dimensions.height / 2 - 0.04, 0]}>
        <cylinderGeometry args={[radius, radius, 0.08, 48]} />
        <Material {...material} color={material.type === "glass" ? material.color : colors?.secondary[0] ?? material.color} />
      </mesh>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.08, 0.11, item.dimensions.height, 32]} />
        <Material type="wood" color={legColor} roughness={0.58} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, -item.dimensions.height / 2 + 0.04, 0]}>
        <cylinderGeometry args={[radius * 0.45, radius * 0.45, 0.08, 40]} />
        <Material type="wood" color={legColor} roughness={0.58} />
      </mesh>
    </group>
  );
}
