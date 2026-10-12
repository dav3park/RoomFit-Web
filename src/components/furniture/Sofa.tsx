import { RoundedBox } from "@react-three/drei";
import Material from "../materials/Material";
import { materialFromConfig } from "../materials/materialConfig";
import type { FurnitureRenderProps } from "./furnitureTheme";

// RoundedBoxGeometry errors if radius exceeds half of any edge, so this caps
// a desired radius to whatever the box's own thinnest dimension allows.
function safeRadius(dims: number[], desired: number): number {
  return Math.min(desired, Math.min(...dims) * 0.35);
}

// Blends toward a fixed warm terracotta accent rather than just lightening
// the base color — a same-hue-but-lighter cushion reads as one flat block of
// color (which is exactly what made a dark sofa look like an undifferentiated
// black mass). Mixing toward a warm accent gives the cushions their own
// character while still harmonizing with whatever base color the sofa has.
const ACCENT = { r: 0xc9, g: 0x8a, b: 0x55 };

function mixToAccent(hex: string, t: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const channel = (shift: number, accent: number) => {
    const base = (num >> shift) & 0xff;
    return Math.round(base + (accent - base) * t);
  };
  const r = channel(16, ACCENT.r);
  const g = channel(8, ACCENT.g);
  const b = channel(0, ACCENT.b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default function Sofa({ item, colors }: FurnitureRenderProps) {
  const { width, depth, height } = item.dimensions;
  const material = materialFromConfig(item.material, item.color);
  const cushionCount = width > 2 ? 3 : 1;
  const cushionColor = colors?.primary[0] ?? mixToAccent(material.color, 0.5);
  const pillowColor = colors?.secondary[0] ?? mixToAccent(material.color, 0.75);
  const legHeight = Math.min(0.1, height * 0.14);

  const bodyDims: [number, number, number] = [width, height * 0.34, depth];
  const backDims: [number, number, number] = [width, height * 0.7, depth * 0.16];
  const armDims: [number, number, number] = [width * 0.08, height * 0.52, depth];
  const cushionDims: [number, number, number] = [width / (cushionCount + 0.45), height * 0.18, depth * 0.68];
  const pillowDims: [number, number, number] = [0.38, 0.28, 0.12];

  return (
    <group>
      <RoundedBox
        args={bodyDims}
        radius={safeRadius(bodyDims, 0.035)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, -height * 0.22, 0]}
      >
        <Material {...material} color={colors?.primary[1] ?? material.color} />
      </RoundedBox>
      <RoundedBox
        args={backDims}
        radius={safeRadius(backDims, 0.035)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[0, height * 0.12, -depth * 0.42]}
      >
        <Material {...material} color={colors?.primary[1] ?? material.color} />
      </RoundedBox>
      <RoundedBox
        args={armDims}
        radius={safeRadius(armDims, 0.03)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[-width * 0.48, height * 0.02, 0]}
      >
        <Material {...material} color={colors?.primary[1] ?? material.color} />
      </RoundedBox>
      <RoundedBox
        args={armDims}
        radius={safeRadius(armDims, 0.03)}
        smoothness={4}
        castShadow
        receiveShadow
        position={[width * 0.48, height * 0.02, 0]}
      >
        <Material {...material} color={colors?.primary[1] ?? material.color} />
      </RoundedBox>
      {Array.from({ length: cushionCount }, (_, index) => (
        <RoundedBox
          key={index}
          args={cushionDims}
          radius={safeRadius(cushionDims, 0.03)}
          smoothness={4}
          castShadow
          receiveShadow
          position={[-width * 0.28 + index * (width * 0.28), height * 0.12, depth * 0.02]}
        >
          <Material type="fabric" color={cushionColor} roughness={0.8} />
        </RoundedBox>
      ))}
      <RoundedBox
        args={pillowDims}
        radius={safeRadius(pillowDims, 0.03)}
        smoothness={4}
        castShadow
        // y was height*0.48 (then height*0.26) — the backrest's own top is
        // at height*0.47 (see backDims/position above), and the pillow's
        // tilt (rotation below) swings its top corner up by roughly its own
        // half-height on top of its center y, so even height*0.26 was still
        // poking out by a couple cm once that tilt was accounted for. Lower
        // center + a gentler tilt keeps the whole tilted box under the
        // backrest top with real margin.
        position={[width * 0.18, height * 0.18, -depth * 0.2]}
        rotation={[0.08, 0.08, 0]}
      >
        <Material type="fabric" color={pillowColor} roughness={0.85} />
      </RoundedBox>

      {/* Slim block legs — a low-profile, modern silhouette instead of the
          body sitting flush on the floor. */}
      {[
        [-width * 0.42, -depth * 0.36],
        [width * 0.42, -depth * 0.36],
        [-width * 0.42, depth * 0.36],
        [width * 0.42, depth * 0.36],
      ].map(([x, z], index) => (
        <mesh key={index} castShadow receiveShadow position={[x, -height * 0.42, z]}>
          <boxGeometry args={[0.05, legHeight, 0.05]} />
          <Material type="metal" color="#1a1a1a" roughness={0.4} metalness={0.55} />
        </mesh>
      ))}
    </group>
  );
}
