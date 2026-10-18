import { RoundedBox } from "@react-three/drei";
import Material from "../materials/Material";
import { normalizeFixtureType } from "../../config/fixtureType";
import type { FurnitureRenderProps } from "./furnitureTheme";

// RoomPlan이 잡은 고정설비(싱크대·냉장고·상부장 등). 상품이 아니라 방의 일부라서 테마 색을
// 따르지 않고 실제 설비처럼 무채색으로 그린다. 그룹 원점은 설비 중심이고 앞면은 +Z.
const BODY = "#e4e6e8";
const COUNTER = "#bfc3c7";
const DARK = "#3a3d40";
const METAL = "#a7adb3";

function safeRadius(dims: number[], desired: number): number {
  return Math.min(desired, Math.min(...dims) * 0.35);
}

export default function Fixture({ item }: FurnitureRenderProps) {
  const { width, height, depth } = item.dimensions;
  const type = normalizeFixtureType(item.sourceType) ?? "sink";
  const body: [number, number, number] = [width, height, depth];
  const front = depth / 2 + 0.004;

  const shell = (color = BODY) => (
    <RoundedBox args={body} radius={safeRadius(body, 0.02)} smoothness={3} castShadow receiveShadow>
      <Material type="white" color={color} roughness={0.55} />
    </RoundedBox>
  );

  // 조리대에 박힌 싱크대·가스레인지(mount=WALL로 떠 있음)는 아래 하부장이 몸체라 윗면만 그린다.
  if (item.mount === "WALL" && (type === "sink" || type === "stove")) {
    return (
      <mesh position={[0, height / 2 - 0.004, 0]}>
        <boxGeometry args={[width, 0.008, depth]} />
        {type === "sink"
          ? <Material type="metal" color={METAL} roughness={0.25} metalness={0.8} />
          : <Material type="glass" color={DARK} roughness={0.2} />}
      </mesh>
    );
  }

  switch (type) {
    case "sink":
      return (
        <group>
          {shell()}
          <mesh position={[0, height / 2 + 0.012, 0]} castShadow>
            <boxGeometry args={[width, 0.025, depth]} />
            <Material type="white" color={COUNTER} roughness={0.35} />
          </mesh>
          {/* 개수대 */}
          <mesh position={[0, height / 2 + 0.026, 0]}>
            <boxGeometry args={[Math.min(width * 0.45, 0.6), 0.004, depth * 0.6]} />
            <Material type="metal" color={METAL} roughness={0.25} metalness={0.8} />
          </mesh>
        </group>
      );
    case "stove":
    case "oven":
      return (
        <group>
          {shell()}
          <mesh position={[0, height / 2 + 0.005, 0]}>
            <boxGeometry args={[width * 0.92, 0.01, depth * 0.85]} />
            <Material type="glass" color={DARK} roughness={0.2} />
          </mesh>
          {type === "oven" && (
            <mesh position={[0, -height * 0.05, front]}>
              <boxGeometry args={[width * 0.8, height * 0.5, 0.006]} />
              <Material type="glass" color={DARK} roughness={0.2} />
            </mesh>
          )}
        </group>
      );
    case "refrigerator":
      return (
        <group>
          {shell("#eef0f1")}
          {/* 냉동/냉장 문 경계와 손잡이 */}
          <mesh position={[0, height * 0.18, front]}>
            <boxGeometry args={[width * 0.98, 0.008, 0.004]} />
            <Material type="metal" color={METAL} />
          </mesh>
          <mesh position={[width * 0.38, height * 0.05, front + 0.012]}>
            <boxGeometry args={[0.02, height * 0.3, 0.02]} />
            <Material type="metal" color={METAL} metalness={0.7} />
          </mesh>
        </group>
      );
    case "washer_dryer":
    case "dishwasher":
      return (
        <group>
          {shell()}
          {type === "washer_dryer" ? (
            <mesh position={[0, 0, front]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[Math.min(width, height) * 0.28, Math.min(width, height) * 0.28, 0.01, 32]} />
              <Material type="glass" color={DARK} roughness={0.15} />
            </mesh>
          ) : (
            <mesh position={[0, height * 0.4, front]}>
              <boxGeometry args={[width * 0.9, 0.04, 0.004]} />
              <Material type="metal" color={METAL} />
            </mesh>
          )}
        </group>
      );
    case "base_cabinet":
      return (
        <group>
          {shell("#ece8e1")}
          {/* 조리대 상판 */}
          <mesh position={[0, height / 2 + 0.012, 0]} castShadow>
            <boxGeometry args={[width + 0.02, 0.025, depth + 0.02]} />
            <Material type="white" color={COUNTER} roughness={0.35} />
          </mesh>
        </group>
      );
    case "upper_cabinet":
      return (
        <group>
          {shell("#ece8e1")}
          {width > 0.6 && (
            <mesh position={[0, 0, front]}>
              <boxGeometry args={[0.006, height * 0.92, 0.004]} />
              <Material type="white" color="#c9c3b8" />
            </mesh>
          )}
        </group>
      );
    default:
      // 변기·욕조·벽난로·계단 등은 형태 차이가 커서 공간만 차지하는 박스로 표시한다.
      return shell();
  }
}
