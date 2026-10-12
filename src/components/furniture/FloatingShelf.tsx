import { RoundedBox } from "@react-three/drei";
import Material from "../materials/Material";
import { materialFromConfig } from "../materials/materialConfig";
import type { FurnitureRenderProps } from "./furnitureTheme";

// RoundedBoxGeometry errors if radius exceeds half of any edge, so this caps
// a desired radius to whatever the box's own thinnest dimension allows.
function safeRadius(dims: number[], desired: number): number {
  return Math.min(desired, Math.min(...dims) * 0.35);
}

// A wall-mounted floating shelf carrying small decor objects — no books (see
// Bookshelf.tsx for the shelving unit that holds those). This always hangs
// well above the floor, so like Television/Plant it re-anchors local y=0 to
// a fixed mount height instead of the floor-relative height/2 centering
// FurnitureMesh normally assumes for things that sit on the ground.
export default function FloatingShelf({ item, colors }: FurnitureRenderProps) {
  const material = materialFromConfig(item.material, item.color);
  const { width, depth, height } = item.dimensions;
  const mountHeight = item.mountHeight ?? 1.5;
  const baseY = mountHeight - height / 2;
  const shelfThickness = 0.045;
  const shelfDims: [number, number, number] = [width, shelfThickness, depth];
  const top = shelfThickness / 2;

  return (
    <group position={[0, baseY, 0]}>
      <RoundedBox args={shelfDims} radius={safeRadius(shelfDims, 0.012)} smoothness={4} castShadow receiveShadow>
        <Material {...material} color={colors?.primary[0] ?? material.color} />
      </RoundedBox>

      {/* Small vase */}
      <mesh castShadow position={[-width * 0.32, top + 0.09, depth * 0.1]}>
        <cylinderGeometry args={[0.035, 0.05, 0.18, 16]} />
        <Material type="accent" color={colors?.secondary[0] ?? "#6f7d54"} roughness={0.7} />
      </mesh>

      {/* Wood decor box */}
      <mesh castShadow position={[-width * 0.08, top + 0.045, 0]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.1, 0.09, 0.1]} />
        <Material type="wood" color={colors?.wood[0] ?? "#8a6542"} roughness={0.55} />
      </mesh>

      {/* Ceramic orb */}
      <mesh castShadow position={[width * 0.14, top + 0.06, 0]}>
        <sphereGeometry args={[0.06, 20, 20]} />
        <Material type="white" color={colors?.neutral[1] ?? "#e7e1d3"} roughness={0.5} />
      </mesh>

      {/* Small framed piece, leaning back against the wall */}
      <mesh castShadow position={[width * 0.34, top + 0.095, -depth * 0.28]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.14, 0.19, 0.02]} />
        <Material type="white" color={colors?.neutral[0] ?? "#f4f1ec"} roughness={0.6} />
      </mesh>
    </group>
  );
}
