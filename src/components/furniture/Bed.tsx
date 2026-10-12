import { RoundedBox } from "@react-three/drei";
import Material from "../materials/Material";
import { materialFromConfig } from "../materials/materialConfig";
import type { FurnitureRenderProps } from "./furnitureTheme";

// RoundedBoxGeometry errors if radius exceeds half of any edge, so this caps
// a desired radius to whatever the box's own thinnest dimension allows.
function safeRadius(dims: number[], desired: number): number {
  return Math.min(desired, Math.min(...dims) * 0.35);
}

// A made bed: frame, mattress, headboard, a duvet draped over most of the
// mattress, and a single pillow at the head. `item.theme` (set only by a
// demo scenario restyle — see config/scenarios.ts) switches both the frame/
// duvet colors *and* the proportions: undefined ("기본") always renders the
// original warm-wood, full-headboard look regardless of the mattress
// fabric's own (often near-white, scan-derived) color — frame/duvet used to
// derive from that color, which made an unstyled bed with pale linens look
// accidentally gray/"모던" before any scenario was ever applied.
export default function Bed({ item, colors }: FurnitureRenderProps) {
  const { width, depth, height } = item.dimensions;
  const material = materialFromConfig(item.material, item.color);
  const theme = item.theme;

  const frameColor = colors?.wood[0] ?? (theme === "gray" ? "#b3b3b3" : theme === "wood" ? "#c9a874" : "#c8a877");
  const duvetColor = colors?.primary[0] ?? (theme === "gray" ? "#eaeaea" : theme === "wood" ? "#f0e8d8" : "#d8c9ad");
  // 미니멀/그레이: a low, headboard-less floating platform. 네추럴/우드: a
  // slightly chunkier frame and taller headboard. 기본: the original
  // proportions.
  const frameHeight = height * (theme === "gray" ? 0.22 : theme === "wood" ? 0.42 : 0.4);
  const showHeadboard = theme !== "gray";
  const headboardHeight = height * (theme === "wood" ? 1.4 : 1.3);

  const mattressHeight = height * 0.45;
  const duvetHeight = height * 0.22;
  const mattressTop = -height / 2 + frameHeight + mattressHeight;

  const frameDims: [number, number, number] = [width, frameHeight, depth];
  const mattressDims: [number, number, number] = [width * 0.97, mattressHeight, depth * 0.97];
  const headboardDims: [number, number, number] = [width + 0.04, headboardHeight, 0.05];
  const duvetDims: [number, number, number] = [width * 1.02, duvetHeight, depth * 0.78];
  const pillowDims: [number, number, number] = [width * 0.52, 0.12, depth * 0.18];

  return (
    <group>
      {/* Base frame */}
      <RoundedBox
        args={frameDims}
        radius={safeRadius(frameDims, 0.03)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, -height / 2 + frameHeight / 2, 0]}
      >
        <Material type="wood" color={frameColor} roughness={0.6} />
      </RoundedBox>

      {/* Mattress */}
      <RoundedBox
        args={mattressDims}
        radius={safeRadius(mattressDims, 0.05)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, -height / 2 + frameHeight + mattressHeight / 2, 0]}
      >
        <Material {...material} color={colors?.neutral[0] ?? material.color} roughness={material.roughness ?? 0.85} />
      </RoundedBox>

      {/* Headboard — inset within the bed's own depth footprint (not beyond
          it) so it can't poke through a wall placed flush against the bed.
          Skipped for the minimal/gray theme's low floating-platform look. */}
      {showHeadboard && (
        <RoundedBox
          args={headboardDims}
          radius={safeRadius(headboardDims, 0.025)}
          smoothness={4}
          castShadow
          receiveShadow
          position={[0, height * 0.35, -depth / 2 + 0.025]}
        >
          <Material type="wood" color={colors?.primary[1] ?? frameColor} roughness={0.55} />
        </RoundedBox>
      )}

      {/* Duvet — draped over most of the mattress, leaving room near the
          headboard for the pillow. */}
      <RoundedBox
        args={duvetDims}
        radius={safeRadius(duvetDims, 0.05)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, mattressTop + duvetHeight / 2, depth * 0.08]}
      >
        <Material type="fabric" color={duvetColor} roughness={0.92} />
      </RoundedBox>

      {/* One pillow at the head. */}
      <RoundedBox
        args={pillowDims}
        radius={safeRadius(pillowDims, 0.04)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, mattressTop + 0.06, -depth / 2 + depth * 0.12]}
      >
        <Material type="fabric" color={colors?.secondary[0] ?? "#aebccb"} roughness={0.9} />
      </RoundedBox>
    </group>
  );
}
