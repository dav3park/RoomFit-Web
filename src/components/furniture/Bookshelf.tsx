import { RoundedBox } from "@react-three/drei";
import Material from "../materials/Material";
import { materialFromConfig } from "../materials/materialConfig";
import type { FurnitureRenderProps } from "./furnitureTheme";

// RoundedBoxGeometry errors if radius exceeds half of any edge, so this caps
// a desired radius to whatever the box's own thinnest dimension allows.
function safeRadius(dims: number[], desired: number): number {
  return Math.min(desired, Math.min(...dims) * 0.35);
}

const BOOK_COLORS = ["#8a4b3a", "#3d5a80", "#6b8f56", "#c9a227", "#7a4869", "#4a5a4a"];
// 모던/그레이 시나리오가 이 컴포넌트를 재사용하는 자리 (see config/scenarios.ts
// restyleForWork) — 처음엔 순수 그레이스케일만 썼더니 "일부러 맞춘 느낌"이 너무
// 강했음 (사용자 피드백). 톤 자체는 여전히 차분하게 맞추되, 채도 낮은 여러 색
// (더스티블루/세이지/그레이지/차콜/샌드)을 섞어 실제 책장처럼 보이게 한다 —
// 무지개색은 아니지만 완전 단색도 아닌, 저채도 다양성.
const BOOK_COLORS_GRAY = ["#7d8ba1", "#8a9a86", "#a89684", "#5a5a5a", "#b6ac9a", "#6e7d8c", "#9c8d7a", "#4f5b52"];

// A real open-shelf carcass — back panel, two side panels, and horizontal
// shelf boards spanning the full depth (plus vertical dividers once the unit
// is wide enough to need more than one column) — instead of a solid box with
// a few thin decorative strips glued to its front face, which read as a
// plain block rather than a bookshelf. Each resulting compartment holds
// either a cluster of upright "books" or a small decor object.
export default function Bookshelf({ item, colors }: FurnitureRenderProps) {
  const material = materialFromConfig(item.material, item.color);
  const theme = item.theme;
  // "wood" (네츄럴 톤) gets the same bright light-oak tone as the carcass
  // itself (see config/scenarios.ts's restyleForRest) instead of this
  // component's own much-darker default board color — otherwise the shelf
  // boards/dividers stood out as a separate, dingier wood tone even after
  // the carcass around them was brightened.
  const shelfBoardColor = colors?.primary[0] ?? (theme === "gray" ? "#e2e2e2" : theme === "wood" ? "#c9a874" : "#5d3f25");
  const bookColors = colors ? [...colors.secondary, ...colors.neutral, ...colors.accent] : theme === "gray" ? BOOK_COLORS_GRAY : BOOK_COLORS;
  const { width, depth, height } = item.dimensions;
  const boardThickness = Math.min(0.025, depth * 0.2);
  const sideThickness = Math.min(0.03, width * 0.04);
  const backThickness = Math.min(0.02, depth * 0.15);

  const rows = Math.max(3, Math.min(6, Math.round(height / 0.42)));
  const columns = Math.max(1, Math.min(6, Math.round(width / 0.9)));
  const innerWidth = width - sideThickness * 2;
  const cellWidth = innerWidth / columns;
  const cellHeight = height / rows;

  const backDims: [number, number, number] = [width, height, backThickness];
  const sideDims: [number, number, number] = [sideThickness, height, depth];

  return (
    <group>
      {/* Back panel */}
      <RoundedBox
        args={backDims}
        radius={safeRadius(backDims, 0.015)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, 0, -depth / 2 + backThickness / 2]}
      >
        <Material {...material} color={colors?.neutral[0] ?? material.color} />
      </RoundedBox>

      {/* Side panels */}
      {[-1, 1].map((side) => (
        <RoundedBox
          key={side}
          args={sideDims}
          radius={safeRadius(sideDims, 0.015)}
          smoothness={4}
          castShadow
          receiveShadow
          position={[side * (width / 2 - sideThickness / 2), 0, 0]}
        >
          <Material {...material} color={colors?.wood[0] ?? material.color} />
        </RoundedBox>
      ))}

      {/* Horizontal shelf boards — one per row boundary, including top/bottom */}
      {Array.from({ length: rows + 1 }, (_, i) => {
        const y = -height / 2 + cellHeight * i;
        return (
          <mesh key={`shelf-${i}`} castShadow receiveShadow position={[0, y, 0]}>
            <boxGeometry args={[innerWidth, boardThickness, depth - 0.01]} />
            <Material type={theme === "gray" ? "white" : "wood"} color={shelfBoardColor} roughness={0.6} />
          </mesh>
        );
      })}

      {/* Vertical dividers between columns */}
      {columns > 1 &&
        Array.from({ length: columns - 1 }, (_, i) => {
          const x = -width / 2 + sideThickness + cellWidth * (i + 1);
          return (
            <mesh key={`div-${i}`} castShadow receiveShadow position={[x, 0, 0]}>
              <boxGeometry args={[boardThickness, height, depth - 0.01]} />
              <Material type={theme === "gray" ? "white" : "wood"} color={shelfBoardColor} roughness={0.6} />
            </mesh>
          );
        })}

      {/* Books / decor objects filling each compartment */}
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, col) => {
          const cellCenterX = -width / 2 + sideThickness + cellWidth * (col + 0.5);
          const cellBottomY = -height / 2 + cellHeight * row + boardThickness / 2;
          const variant = (row + col) % 3;

          if (variant === 2) {
            const decorHeight = cellHeight * 0.5;
            const decorRadius = Math.min(cellWidth, depth) * 0.16;
            return (
              <mesh key={`${row}-${col}`} castShadow position={[cellCenterX, cellBottomY + decorHeight / 2, 0]}>
                <cylinderGeometry args={[decorRadius, decorRadius * 1.25, decorHeight, 16]} />
                <Material type="accent" color={colors?.secondary[row % 2] ?? (theme === "gray" ? (row % 2 ? "#7d8ba1" : "#5a5a5a") : row % 2 ? "#6f7d54" : "#8a6542")} roughness={0.75} />
              </mesh>
            );
          }

          const bookCount = 4 + (variant === 0 ? 1 : 0);
          const bookSlot = (cellWidth * 0.8) / bookCount;
          const bookDepth = depth * 0.6;

          return (
            <group key={`${row}-${col}`}>
              {Array.from({ length: bookCount }, (_, book) => {
                const bookHeight = cellHeight * (0.55 + ((book + row) % 3) * 0.12);
                const bookX = cellCenterX - cellWidth * 0.4 + bookSlot * (book + 0.5);
                return (
                  <mesh key={book} castShadow position={[bookX, cellBottomY + bookHeight / 2, 0]}>
                    <boxGeometry args={[Math.max(0.02, bookSlot * 0.8), bookHeight, bookDepth]} />
                    <Material
                      type="fabric"
                      color={bookColors[(row * 3 + col + book) % bookColors.length]}
                      roughness={0.65}
                    />
                  </mesh>
                );
              })}
            </group>
          );
        }),
      )}
    </group>
  );
}
