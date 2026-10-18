import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import * as THREE from "three";

// 자식 메시들의 투명도를 목표값으로 부드럽게 옮긴다. 각 메시는 JSX로 만든 자기 전용 재질을 가져서
// 직접 바꿔도 다른 메시에 영향이 없다. 반투명일 때는 깊이 기록·그림자를 꺼서 뒤의 가구가
// 가려지거나 깜빡이지 않게 한다.
const FADE_SPEED = 8; // 1초에 남은 차이의 약 8배 비율로 수렴(≈0.3초)

export default function FadeGroup({ opacity, children }: { opacity: number; children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const current = useRef(opacity);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const diff = opacity - current.current;
    if (Math.abs(diff) < 0.002) {
      if (current.current === opacity) return;
      current.current = opacity;
    } else {
      current.current += diff * Math.min(1, delta * FADE_SPEED);
    }
    const value = current.current;
    const solid = value >= 0.999;
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      // 처음 흐려질 때 원래 그림자 설정을 기억해 두었다가, 다시 불투명해지면 되돌린다.
      object.userData.castShadowWhenSolid ??= object.castShadow;
      object.castShadow = solid && Boolean(object.userData.castShadowWhenSolid);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials as THREE.Material[]) {
        const base = (material.userData.baseOpacity ??= material.opacity);
        const transparent = !solid || base < 1;
        if (material.transparent !== transparent) material.needsUpdate = true;
        material.opacity = base * value;
        material.transparent = transparent;
        material.depthWrite = solid;
      }
    });
  });

  return <group ref={groupRef}>{children}</group>;
}
