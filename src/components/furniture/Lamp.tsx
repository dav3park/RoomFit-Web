import { useMemo } from "react";
import * as THREE from "three";
import Material from "../materials/Material";
import type { FurnitureRenderProps } from "./furnitureTheme";

export default function Lamp({ item, colors }: FurnitureRenderProps) {
  const height = item.dimensions.height;
  const theme = item.theme;

  // 네츄럴 톤(rest-natural-wood)만 실제로 다른 실루엣을 쓴다 — 기본 디자인은
  // 얇은 금속 암(arc)에 전구가 달린 리딩램프 느낌인데, 그 색만 바꿔서는
  // "다른 디자인"으로 안 읽혀서 아예 다른 형태(트라이포드 다리 + 원목 기둥 +
  // 패브릭 갓)로 분리했다.
  // Where the tripod legs meet the pole — shared by both the legs (as their
  // pivot point) and the pole (as its bottom end) below, so the two pieces
  // are guaranteed to actually touch instead of each being positioned from
  // its own separate, easy-to-mismatch formula (which is exactly how the
  // pole previously ended up floating ~0.2m above where the legs met).
  const legPivotY = -height / 2 + 0.1;

  const legs = useMemo(() => {
    const legCount = 3;
    // Each leg runs from the shared pivot point down to its own foot on the
    // floor — computed as actual 3D points rather than guessed Euler angles,
    // since an earlier hand-rolled X/Z rotation didn't compose the way a
    // single "tilt toward this direction" rotation would, and ended up
    // reading as the legs splaying the wrong way (narrow end at the floor,
    // wide end at the pole, instead of the other way round).
    const pivot = new THREE.Vector3(0, legPivotY, 0);
    const footRadius = 0.19;

    return Array.from({ length: legCount }, (_, i) => {
      const angle = (i / legCount) * Math.PI * 2;
      const foot = new THREE.Vector3(Math.cos(angle) * footRadius, -height / 2, Math.sin(angle) * footRadius);
      const direction = foot.clone().sub(pivot).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      const midpoint = pivot.clone().add(foot).multiplyScalar(0.5);
      const length = pivot.distanceTo(foot);

      return { key: i, midpoint, quaternion, length };
    });
  }, [height, legPivotY]);

  if (theme === "wood") {
    const shadeHeight = height * 0.24;
    // Reaches from legPivotY up into the shade's own base (shade center sits
    // at height*0.38, shadeHeight tall) rather than stopping short of it, so
    // there's no gap at either end of the pole.
    const poleTopY = height * 0.3;
    const poleLength = poleTopY - legPivotY;
    const poleCenterY = (poleTopY + legPivotY) / 2;

    return (
      <group>
        {legs.map((leg) => (
          <mesh key={leg.key} castShadow receiveShadow position={leg.midpoint} quaternion={leg.quaternion}>
            {/* setFromUnitVectors(+Y, direction) points the geometry's local
                +Y end (radiusTop) toward `foot` (direction runs pivot->foot)
                and its -Y end (radiusBottom) toward `pivot` — so radiusTop
                needs to be the wider value (the floor-contact foot) and
                radiusBottom the thin one (near the pole), or the leg reads
                as flared at the pole and pinched at the floor instead. */}
            <cylinderGeometry args={[0.02, 0.013, leg.length, 10]} />
            <Material type="wood" color={colors?.wood[0] ?? "#a9764c"} roughness={0.55} />
          </mesh>
        ))}

        {/* Straight center pole, spanning exactly from where the tripod legs
            meet (legPivotY) up into the shade's base — see poleLength/
            poleCenterY above. */}
        <mesh castShadow receiveShadow position={[0, poleCenterY, 0]}>
          <cylinderGeometry args={[0.018, 0.022, poleLength, 16]} />
          <Material type="wood" color={colors?.wood[0] ?? "#a9764c"} roughness={0.55} />
        </mesh>

        {/* Fabric drum shade */}
        <mesh castShadow position={[0, height * 0.38, 0]}>
          <cylinderGeometry args={[0.13, 0.18, shadeHeight, 32]} />
          <meshStandardMaterial color={colors?.neutral[1] ?? "#f2e9d8"} roughness={0.88} />
        </mesh>
        <mesh position={[0, height * 0.38, 0]}>
          <cylinderGeometry args={[0.12, 0.17, shadeHeight * 0.94, 32]} />
          <meshStandardMaterial color="#fff6e0" emissive="#f6dfa8" emissiveIntensity={0.5} roughness={0.7} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, -height / 2 + 0.035, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.07, 32]} />
        <Material type="metal" color={colors?.accent[0] ?? "#211d19"} roughness={0.42} metalness={0.45} />
      </mesh>
      <mesh castShadow position={[0, -0.05, 0]} rotation={[0, 0, -0.18]}>
        <cylinderGeometry args={[0.025, 0.025, height * 0.92, 24]} />
        <Material type="metal" color={colors?.accent[0] ?? "#211d19"} roughness={0.42} metalness={0.45} />
      </mesh>
      <mesh castShadow position={[0.18, height * 0.38, -0.02]}>
        <sphereGeometry args={[0.13, 24, 16]} />
        <meshStandardMaterial color="#f7e8bd" emissive="#f4d47d" emissiveIntensity={0.55} roughness={0.42} />
      </mesh>
    </group>
  );
}
