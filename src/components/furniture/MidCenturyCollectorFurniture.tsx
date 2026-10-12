import { RoundedBox } from "@react-three/drei";

import Material from "../materials/Material";
import type { FurnitureRenderProps } from "./furnitureTheme";

const DEFAULT_COLORS = {
  cream: "#F7F1E8",
  walnut: "#5A3422",
  wood: "#8C5632",
  coral: "#D98272",
  red: "#B64535",
  blue: "#1E63C6",
  mustard: "#D6A23A",
  chrome: "#C9C9C9",
  green: "#2F6B3F",
  black: "#151515",
};

function collectorColors(colors: FurnitureRenderProps['colors']) {
  return colors ? {...DEFAULT_COLORS, cream:colors.neutral[0], walnut:colors.wood[1], wood:colors.wood[0],
    coral:colors.secondary[0], red:colors.primary[1], blue:colors.primary[0], mustard:colors.secondary[1], black:colors.accent[0]} : DEFAULT_COLORS;
}

export default function MidCenturyCollectorFurniture({ item, colors }: FurnitureRenderProps) {
  const templateId = item.id.replace(/^studio-/, "collector-");

  switch (templateId) {
    case "collector-bed":
      return <CollectorBed item={item} colors={colors} />;
    case "collector-bedside":
      return <CoralBedside item={item} colors={colors} />;
    case "collector-desk":
      return <CollectorDesk item={item} colors={colors} />;
    case "collector-desk-chair":
      return <DeskChair item={item} colors={colors} />;
    case "collector-blue-cabinet":
      return <BlueCabinet item={item} colors={colors} />;
    case "collector-glass-shelf":
      return <GlassShelf item={item} colors={colors} />;
    case "collector-console":
      return <CollectorConsole item={item} colors={colors} />;
    case "collector-red-shelf":
      return <RedWallShelf item={item} colors={colors} />;
    case "collector-lounge-chair":
      return <LoungeChair item={item} colors={colors} />;
    case "collector-cane-chair":
      return <CaneChair item={item} colors={colors} />;
    case "collector-rug":
      return <CollectorRug item={item} colors={colors} />;
    case "collector-coffee-table":
      return <GlassCoffeeTable item={item} colors={colors} />;
    default:
      return null;
  }
}

function CollectorBed({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;

  return (
    <group>
      <RoundedBox args={[width, 0.17, depth]} radius={0.025} smoothness={4} castShadow receiveShadow position={[0, floor + 0.11, 0]}>
        <Material type="wood" color={COLORS.walnut} roughness={0.56} />
      </RoundedBox>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={index} castShadow position={[Number(x) * (width * 0.42), floor + 0.04, Number(z) * (depth * 0.42)]}>
          <cylinderGeometry args={[0.025, 0.035, 0.16, 12]} />
          <Material type="wood" color={COLORS.walnut} />
        </mesh>
      ))}
      <RoundedBox args={[width * 0.95, 0.18, depth * 0.94]} radius={0.04} smoothness={4} castShadow receiveShadow position={[0, floor + 0.28, 0]}>
        <Material type="white" color="#FFF8EF" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[width * 0.98, 0.08, depth * 0.55]} radius={0.03} smoothness={4} castShadow position={[0, floor + 0.42, depth * 0.12]}>
        <Material type="fabric" color={COLORS.cream} roughness={0.94} />
      </RoundedBox>
      <RoundedBox args={[width * 0.46, 0.09, depth * 0.16]} radius={0.03} smoothness={4} castShadow position={[0, floor + 0.43, -depth * 0.31]}>
        <Material type="fabric" color="#FFF8EF" roughness={0.92} />
      </RoundedBox>
      <RoundedBox args={[width * 0.2, 0.08, depth * 0.14]} radius={0.03} smoothness={4} castShadow position={[0, floor + 0.49, -depth * 0.12]}>
        <Material type="fabric" color={COLORS.coral} roughness={0.85} />
      </RoundedBox>
      {Array.from({ length: 6 }, (_, index) => (
        <mesh key={`stripe-${index}`} castShadow position={[0, floor + 0.47, depth * (0.18 + index * 0.05)]}>
          <boxGeometry args={[width * 0.99, 0.012, 0.022]} />
          <Material type="fabric" color={COLORS.black} roughness={0.8} />
        </mesh>
      ))}
      <RoundedBox args={[width + 0.05, 0.68, 0.06]} radius={0.02} smoothness={4} castShadow position={[0, floor + 0.51, -depth / 2 + 0.03]}>
        <Material type="wood" color={COLORS.walnut} roughness={0.54} />
      </RoundedBox>
    </group>
  );
}

function CoralBedside({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;

  return (
    <group>
      <RoundedBox args={[width, height * 0.7, depth]} radius={0.02} smoothness={4} castShadow receiveShadow position={[0, floor + height * 0.48, 0]}>
        <Material type="wood" color={COLORS.red} roughness={0.48} />
      </RoundedBox>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={index} castShadow position={[Number(x) * width * 0.38, floor + 0.08, Number(z) * depth * 0.35]}>
          <cylinderGeometry args={[0.018, 0.018, 0.16, 10]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.22} metalness={0.85} />
        </mesh>
      ))}
      {[0.35, 0.58].map((ratio) => (
        <mesh key={ratio} position={[0, floor + height * ratio, depth / 2 + 0.012]} receiveShadow>
          <boxGeometry args={[width * 0.84, 0.012, 0.016]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.22} metalness={0.85} />
        </mesh>
      ))}
      <mesh castShadow position={[0, floor + height * 0.82, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.035, 24]} />
        <Material type="metal" color={COLORS.mustard} roughness={0.35} metalness={0.25} />
      </mesh>
      <mesh castShadow position={[0, floor + height * 0.98, 0]}>
        <sphereGeometry args={[0.1, 24, 16]} />
        <meshStandardMaterial color="#FFF2C9" emissive="#F2C26B" emissiveIntensity={0.5} roughness={0.45} />
      </mesh>
    </group>
  );
}

function CollectorDesk({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;
  const legHeight = height - 0.06;

  return (
    <group>
      <RoundedBox args={[width, 0.06, depth]} radius={0.02} smoothness={4} castShadow receiveShadow position={[0, floor + height - 0.03, 0]}>
        <Material type="wood" color={COLORS.wood} roughness={0.55} />
      </RoundedBox>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={index} castShadow position={[Number(x) * (width * 0.42), floor + legHeight / 2, Number(z) * (depth * 0.4)]} rotation={[0, 0, Number(x) * 0.08]}>
          <cylinderGeometry args={[0.026, 0.034, legHeight, 12]} />
          <Material type="wood" color={COLORS.walnut} roughness={0.58} />
        </mesh>
      ))}
      <mesh castShadow position={[-width * 0.15, floor + height + 0.035, -depth * 0.06]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[width * 0.34, 0.018, depth * 0.43]} />
        <Material type="metal" color={COLORS.black} roughness={0.28} metalness={0.48} />
      </mesh>
      <mesh castShadow position={[width * 0.31, floor + height + 0.07, -depth * 0.1]}>
        <cylinderGeometry args={[0.09, 0.11, 0.035, 24]} />
        <Material type="wood" color={COLORS.coral} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[width * 0.31, floor + height + 0.16, -depth * 0.1]}>
        <sphereGeometry args={[0.075, 20, 16]} />
        <meshStandardMaterial color="#FFE1B1" emissive="#F3C074" emissiveIntensity={0.45} roughness={0.45} />
      </mesh>
    </group>
  );
}

function DeskChair({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;

  return (
    <group>
      <RoundedBox args={[width * 0.9, 0.06, depth * 0.82]} radius={0.025} smoothness={4} castShadow receiveShadow position={[0, floor + height * 0.48, 0]}>
        <Material type="wood" color={COLORS.wood} roughness={0.58} />
      </RoundedBox>
      <RoundedBox args={[width * 0.86, height * 0.42, 0.055]} radius={0.025} smoothness={4} castShadow position={[0, floor + height * 0.7, -depth * 0.37]} rotation={[0.12, 0, 0]}>
        <Material type="wood" color={COLORS.walnut} roughness={0.56} />
      </RoundedBox>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={index} castShadow position={[Number(x) * width * 0.34, floor + height * 0.24, Number(z) * depth * 0.3]}>
          <cylinderGeometry args={[0.018, 0.025, height * 0.48, 10]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.22} metalness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function BlueCabinet({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;

  return (
    <group>
      {[0.25, 0.75].map((ratio) => (
        <group key={ratio} position={[0, floor + height * ratio, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[width, height * 0.46, depth]} />
            <Material type="wood" color={COLORS.blue} roughness={0.42} />
          </mesh>
          <mesh position={[0, 0, depth / 2 + 0.008]} receiveShadow>
            <boxGeometry args={[width * 0.86, height * 0.37, 0.016]} />
            <Material type="wood" color={colors?.accent[0] ?? "#174E98"} roughness={0.38} />
          </mesh>
          <mesh position={[width * 0.29, 0, depth / 2 + 0.022]} castShadow>
            <sphereGeometry args={[0.026, 16, 16]} />
            <Material type="metal" color={COLORS.chrome} roughness={0.22} metalness={0.9} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x * width * 0.49, 0, 0]}>
          <boxGeometry args={[0.018, height, 0.018]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.2} metalness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function GlassShelf({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;

  return (
    <group>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={index} castShadow position={[Number(x) * width * 0.46, 0, Number(z) * depth * 0.44]}>
          <cylinderGeometry args={[0.014, 0.014, height, 10]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.2} metalness={0.95} />
        </mesh>
      ))}
      {[0.12, 0.48, 0.84].map((ratio) => (
        <group key={ratio} position={[0, floor + height * ratio, 0]}>
          <mesh receiveShadow>
            <boxGeometry args={[width, 0.025, depth]} />
            <meshStandardMaterial color="#EAF4F7" transparent opacity={0.38} roughness={0.08} metalness={0.18} />
          </mesh>
          {[0, 1, 2].map((book) => (
            <mesh key={book} castShadow position={[-width * 0.25 + book * width * 0.15, 0.09, 0]}>
              <boxGeometry args={[0.07, 0.16 + (book % 2) * 0.04, depth * 0.5]} />
              <Material type="fabric" color={[COLORS.cream, COLORS.coral, COLORS.blue][book]} roughness={0.72} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function CollectorConsole({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;

  return (
    <group>
      <RoundedBox args={[width, height * 0.72, depth]} radius={0.025} smoothness={4} castShadow receiveShadow position={[0, floor + height * 0.5, 0]}>
        <Material type="white" color={COLORS.cream} roughness={0.68} />
      </RoundedBox>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={index} castShadow position={[Number(x) * width * 0.42, floor + 0.09, Number(z) * depth * 0.35]}>
          <cylinderGeometry args={[0.018, 0.026, 0.18, 10]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.2} metalness={0.95} />
        </mesh>
      ))}
      {[0.25, 0.5, 0.75].map((ratio) => (
        <mesh key={ratio} position={[-width / 2 + width * ratio, floor + height * 0.5, depth / 2 + 0.012]} receiveShadow>
          <boxGeometry args={[0.012, height * 0.56, 0.018]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.24} metalness={0.85} />
        </mesh>
      ))}
      <mesh castShadow position={[-width * 0.24, floor + height * 0.92, 0]}>
        <boxGeometry args={[0.42, 0.04, depth * 0.66]} />
        <Material type="white" color={colors?.neutral[1] ?? "#F0E9DB"} roughness={0.55} />
      </mesh>
      <mesh castShadow position={[-width * 0.24, floor + height * 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.014, 36]} />
        <Material type="metal" color={COLORS.black} roughness={0.28} metalness={0.38} />
      </mesh>
      <mesh castShadow position={[width * 0.24, floor + height * 0.97, 0]}>
        <sphereGeometry args={[0.1, 24, 16]} />
        <meshStandardMaterial color="#FFF0C8" emissive="#F2C36B" emissiveIntensity={0.48} roughness={0.42} />
      </mesh>
      <mesh position={[width * 0.02, floor + height * 1.4, -depth * 0.42]} receiveShadow>
        <boxGeometry args={[width * 0.28, height * 0.5, 0.018]} />
        <Material type="white" color={colors?.neutral[0] ?? "#F8F2E9"} roughness={0.65} />
      </mesh>
      <mesh position={[width * 0.02, floor + height * 1.4, -depth * 0.43]}>
        <circleGeometry args={[height * 0.14, 20]} />
        <Material type="accent" color={COLORS.blue} roughness={0.7} />
      </mesh>
    </group>
  );
}

function RedWallShelf({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const mountY = 1.25 - height / 2;

  return (
    <group position={[0, mountY, 0]}>
      {[0, 0.38, 0.76].map((y, row) => (
        <group key={y} position={[0, y, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[width, 0.045, depth]} />
            <Material type="wood" color={COLORS.red} roughness={0.45} />
          </mesh>
          {row < 2 && <mesh position={[-width * 0.38, 0.19, -depth * 0.3]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.16, 16]} />
            <Material type="accent" color={colors?.secondary[1] ?? COLORS.green} roughness={0.78} />
          </mesh>}
          <mesh position={[width * 0.2, 0.09, 0]} castShadow>
            <boxGeometry args={[0.16, 0.16, depth * 0.52]} />
            <Material type="fabric" color={row === 1 ? COLORS.blue : COLORS.cream} roughness={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function LoungeChair({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, floor + height * 0.33, depth * 0.05]} scale={[width * 0.58, height * 0.34, depth * 0.58]}>
        <sphereGeometry args={[1, 32, 24]} />
        <Material type="fabric" color={COLORS.coral} roughness={0.82} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, floor + height * 0.57, -depth * 0.26]} scale={[width * 0.56, height * 0.52, depth * 0.3]}>
        <sphereGeometry args={[1, 32, 24]} />
        <Material type="fabric" color={colors?.primary[1] ?? "#C96350"} roughness={0.8} />
      </mesh>
      {[-1, 1].map((x) => (
        <mesh key={x} castShadow position={[x * width * 0.38, floor + 0.1, depth * 0.22]}>
          <cylinderGeometry args={[0.02, 0.03, 0.18, 10]} />
          <Material type="wood" color={COLORS.walnut} />
        </mesh>
      ))}
    </group>
  );
}

function CaneChair({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, depth, height } = item.dimensions;
  const floor = -height / 2;

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, floor + height * 0.47, 0]}>
        <boxGeometry args={[width * 0.82, 0.05, depth * 0.72]} />
        <Material type="wood" color={colors?.wood[0] ?? "#D9B87A"} roughness={0.7} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, floor + height * 0.68, -depth * 0.32]} rotation={[0.14, 0, 0]}>
        <boxGeometry args={[width * 0.82, height * 0.36, 0.04]} />
        <Material type="wood" color={colors?.wood[0] ?? "#D9B87A"} roughness={0.7} />
      </mesh>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={index} castShadow position={[Number(x) * width * 0.39, floor + height * 0.23, Number(z) * depth * 0.3]}>
          <cylinderGeometry args={[0.018, 0.018, height * 0.48, 10]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.2} metalness={0.96} />
        </mesh>
      ))}
    </group>
  );
}

function CollectorRug({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const radius = item.dimensions.width / 2;
  const floor = -item.dimensions.height / 2;

  return (
    <group>
      <mesh receiveShadow position={[0, floor + 0.019, 0]}>
        <cylinderGeometry args={[radius, radius, item.dimensions.height, 64]} />
        <Material type="fabric" color={COLORS.cream} roughness={0.94} />
      </mesh>
      <mesh receiveShadow position={[0, floor + 0.027, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.88, 0.012, 8, 64]} />
        <Material type="fabric" color={colors?.secondary[0] ?? "#E7D3BD"} roughness={0.9} />
      </mesh>
    </group>
  );
}

function GlassCoffeeTable({ item, colors }: FurnitureRenderProps) {
  const COLORS = collectorColors(colors);
  const { width, height } = item.dimensions;
  const radius = width / 2;
  const floor = -height / 2;

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, floor + height - 0.035, 0]}>
        <cylinderGeometry args={[radius, radius, 0.04, 48]} />
        <meshStandardMaterial color="#D9EEF1" transparent opacity={0.46} roughness={0.06} metalness={0.24} />
      </mesh>
      <mesh position={[0, floor + height - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.012, 8, 64]} />
        <Material type="metal" color={COLORS.chrome} roughness={0.18} metalness={0.96} />
      </mesh>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z], index) => (
        <mesh key={index} castShadow position={[Number(x) * radius * 0.68, floor + height * 0.42, Number(z) * radius * 0.68]}>
          <cylinderGeometry args={[0.015, 0.018, height * 0.84, 10]} />
          <Material type="metal" color={COLORS.chrome} roughness={0.18} metalness={0.96} />
        </mesh>
      ))}
      <mesh castShadow position={[0, floor + height + 0.07, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.12, 16]} />
        <Material type="accent" color="#2F6B3F" roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0, floor + height + 0.17, 0]} scale={[0.11, 0.18, 0.11]}>
        <sphereGeometry args={[1, 16, 12]} />
        <Material type="accent" color={COLORS.green} roughness={0.76} />
      </mesh>
    </group>
  );
}
