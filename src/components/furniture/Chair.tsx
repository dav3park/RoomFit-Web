import { RoundedBox } from "@react-three/drei";
import Material from "../materials/Material";
import { materialFromConfig } from "../materials/materialConfig";
import type { FurnitureRenderProps } from "./furnitureTheme";

// RoundedBoxGeometry errors if radius exceeds half of any edge, so this caps
// a desired radius to whatever the box's own thinnest dimension allows.
function safeRadius(dims: number[], desired: number): number {
  return Math.min(desired, Math.min(...dims) * 0.35);
}

// A single-seat chair — thin legs, a slim seat, one backrest panel — so it
// reads distinctly from Sofa's wide cushioned silhouette instead of looking
// like a small couch. A gray theme (the 모던/그레이 demo scenario's desk
// chair — see restyleForWork in config/scenarios.ts) instead renders a
// cushioned leather office-chair silhouette: a thicker rounded seat/back and
// a center pedestal + star base instead of 4 legs, since a desk chair in a
// "modern" room reads as an actual computer chair, not a dining chair.
export default function Chair({ item, colors }: FurnitureRenderProps) {
  const { width, depth, height } = item.dimensions;
  const material = materialFromConfig(item.material, item.color);
  const isOfficeChair = item.theme === "gray";
  // item.theme (set only by a demo scenario restyle — see
  // config/scenarios.ts) picks the leg tone explicitly. Undefined ("기본")
  // always keeps the original wood-brown legs regardless of the seat's own
  // (often near-white, scan-derived) color.
  const legColor = (colors ? (isOfficeChair ? colors.accent[0] : colors.wood[1]) : undefined) ?? (item.theme === "gray" ? "#2b2b2b" : item.theme === "wood" ? "#6b4a2c" : "#8d6037");

  const seatThickness = isOfficeChair ? height * 0.16 : Math.min(0.04, height * 0.08);
  const seatHeightFromFloor = height * 0.52;
  const legThickness = Math.min(0.035, width * 0.07);
  const legInset = 0.025;
  const legHeight = seatHeightFromFloor - seatThickness / 2;
  const legX = width / 2 - legInset - legThickness / 2;
  const legZ = depth / 2 - legInset - legThickness / 2;
  const backThickness = isOfficeChair ? Math.min(0.07, depth * 0.2) : Math.min(0.035, depth * 0.1);
  const backHeight = height - seatHeightFromFloor;

  const toLocalY = (fromFloor: number) => fromFloor - height / 2;

  const seatDims: [number, number, number] = [width, seatThickness, depth];
  const backDims: [number, number, number] = [width * (isOfficeChair ? 0.96 : 0.9), backHeight, backThickness];

  const pedestalRadius = Math.min(0.025, width * 0.06);
  const baseArmLength = width * 0.42;
  const baseArmThickness = Math.min(0.03, width * 0.06);

  return (
    <group>
      {/* Seat */}
      <RoundedBox
        args={seatDims}
        radius={safeRadius(seatDims, isOfficeChair ? 0.06 : 0.02)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, toLocalY(seatHeightFromFloor - seatThickness / 2), 0]}
      >
        <Material {...material} color={colors?.primary[0] ?? material.color} />
      </RoundedBox>

      {/* Backrest */}
      <RoundedBox
        args={backDims}
        radius={safeRadius(backDims, isOfficeChair ? 0.07 : 0.02)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, toLocalY(seatHeightFromFloor + backHeight / 2), -depth / 2 + backThickness / 2]}
      >
        <Material {...material} color={colors?.secondary[0] ?? material.color} />
      </RoundedBox>

      {isOfficeChair ? (
        <>
          {/* Center pedestal */}
          <mesh castShadow receiveShadow position={[0, toLocalY(legHeight / 2), 0]}>
            <cylinderGeometry args={[pedestalRadius, pedestalRadius, legHeight, 16]} />
            <Material type="metal" color={legColor} roughness={0.35} metalness={0.7} />
          </mesh>
          {/* 5-point star base */}
          {Array.from({ length: 5 }, (_, index) => {
            const angle = (index / 5) * Math.PI * 2;
            return (
              <mesh
                key={index}
                castShadow
                receiveShadow
                position={[(Math.cos(angle) * baseArmLength) / 2, toLocalY(baseArmThickness / 2), (Math.sin(angle) * baseArmLength) / 2]}
                rotation={[0, -angle, 0]}
              >
                <boxGeometry args={[baseArmLength, baseArmThickness, baseArmThickness]} />
                <Material type="metal" color={legColor} roughness={0.35} metalness={0.7} />
              </mesh>
            );
          })}
        </>
      ) : (
        /* Legs */
        [
          [legX, legZ],
          [-legX, legZ],
          [legX, -legZ],
          [-legX, -legZ],
        ].map(([x, z], index) => (
          <mesh key={index} castShadow receiveShadow position={[x, toLocalY(legHeight / 2), z]}>
            <boxGeometry args={[legThickness, legHeight, legThickness]} />
            <Material type="wood" color={legColor} roughness={0.58} />
          </mesh>
        ))
      )}
    </group>
  );
}
