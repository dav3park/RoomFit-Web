import { RoundedBox } from "@react-three/drei";
import Material from "../materials/Material";
import { materialFromConfig } from "../materials/materialConfig";
import type { FurnitureRenderProps } from "./furnitureTheme";

// RoundedBoxGeometry errors if radius exceeds half of any edge, so this caps
// a desired radius to whatever the box's own thinnest dimension allows.
function safeRadius(dims: number[], desired: number): number {
  return Math.min(desired, Math.min(...dims) * 0.35);
}

// Generic storage furniture ("수납장" from a scan can be anything from a low
// dresser to a tall wardrobe). Taller pieces get door panel(s); shorter ones
// get stacked drawer fronts — either way it reads as storage rather than a
// plain block.
export default function Storage({ item, colors }: FurnitureRenderProps) {
  const { width, depth, height } = item.dimensions;
  const material = materialFromConfig(item.material, item.color);
  const theme = item.theme;
  const isTall = height > 1.1;
  const doorCount = isTall && width > 0.9 ? 2 : 1;
  const drawerCount = Math.max(2, Math.min(4, Math.round(height / 0.18)));
  const hasLouverDoors = item.name.includes("루버");
  // item.theme (set only by a demo scenario restyle — see
  // config/scenarios.ts) changes the hardware, not just the color: 미니멀
  // drops handles entirely for a flush, handleless look; 네추럴 gets bigger
  // pulls in a soft sage green — a small, deliberate accent of the "화이트
  // + 우드 + 초록" natural palette on the one piece (책장) that otherwise
  // reads as all-wood. 기본 keeps the original hardware untouched.
  const showHandles = theme !== "gray";
  const handleColor = theme === "wood" ? "#7d9169" : "#d8c8a0";
  const handleScale = theme === "wood" ? 1.6 : 1;

  const bodyDims: [number, number, number] = [width, height, depth];

  return (
    <group>
      <RoundedBox args={bodyDims} radius={safeRadius(bodyDims, 0.025)} smoothness={4} castShadow receiveShadow>
        <Material {...material} color={colors?.neutral[0] ?? material.color} />
      </RoundedBox>

      {isTall
        ? Array.from({ length: doorCount }, (_, index) => {
            const doorWidth = width / doorCount - 0.02;
            const x = doorCount === 2 ? (index === 0 ? -width / 4 : width / 4) : 0;
            const handleX = doorCount === 2 ? (index === 0 ? doorWidth / 2 - 0.04 : -(doorWidth / 2 - 0.04)) : doorWidth / 2 - 0.04;

            return (
              <group key={index} position={[x, 0, depth / 2 + 0.007]}>
                <mesh receiveShadow>
                  <boxGeometry args={[doorWidth, height - 0.06, 0.014]} />
                  <Material type="wood" color={colors?.primary[index % 2] ?? material.color} roughness={0.5} />
                </mesh>
                {showHandles && (
                  <mesh position={[handleX, 0, 0.014]} castShadow>
                    <boxGeometry args={[0.014 * handleScale, 0.1 * handleScale, 0.014 * handleScale]} />
                    <meshStandardMaterial color={handleColor} roughness={0.3} metalness={0.5} />
                  </mesh>
                )}
                {hasLouverDoors &&
                  Array.from({ length: 6 }, (_, slatIndex) => (
                    <mesh
                      key={slatIndex}
                      position={[0, -height * 0.32 + slatIndex * ((height * 0.64) / 5), 0.018]}
                      receiveShadow
                    >
                      <boxGeometry args={[doorWidth * 0.78, 0.018, 0.012]} />
                      <meshStandardMaterial color={colors?.wood[0] ?? "#a87743"} roughness={0.62} />
                    </mesh>
                  ))}
              </group>
            );
          })
        : Array.from({ length: drawerCount }, (_, index) => {
            const drawerHeight = (height - 0.04) / drawerCount - 0.02;
            const y = height / 2 - 0.02 - drawerHeight / 2 - index * (drawerHeight + 0.02);

            return (
              <group key={index} position={[0, y, depth / 2 + 0.007]}>
                <mesh receiveShadow>
                  <boxGeometry args={[width - 0.05, drawerHeight, 0.014]} />
                  <Material type="wood" color={colors?.primary[index % 2] ?? material.color} roughness={0.5} />
                </mesh>
                {showHandles && (
                  <mesh position={[0, 0, 0.014]} castShadow>
                    <boxGeometry args={[width * 0.28 * handleScale, 0.014 * handleScale, 0.014 * handleScale]} />
                    <meshStandardMaterial color={handleColor} roughness={0.3} metalness={0.5} />
                  </mesh>
                )}
              </group>
            );
          })}
    </group>
  );
}
