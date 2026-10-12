import { useMemo } from "react";
import * as THREE from "three";

import Material from "../materials/Material";
import type { FurnitureRenderProps } from "./furnitureTheme";

type Leaf = {
  curve: THREE.CatmullRomCurve3;
  end: THREE.Vector3;
  angle: number;
  tilt: number;
  scale: number;
};

function createLeafShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.12, 0.08, 0.17, 0.34, 0, 0.62);
  shape.bezierCurveTo(-0.17, 0.34, -0.12, 0.08, 0, 0);
  return shape;
}

// A compact broad-leaf plant: tapered pot, gently curved stems, and shaped
// double-sided leaves. The plant stays within the size specified by the
// furniture data instead of scaling a fixed tiny vase into an oversized prop.
export default function Plant({ item, colors }: FurnitureRenderProps) {
  // "몬스테라" pieces (see config/scenarios.ts's sofa-corner extra) are
  // placed directly on the floor, same as "바닥"/"플로어" — without it here
  // too, this branch's tabletop restHeight (0.4) would float the pot in
  // mid-air instead of sitting on the ground.
  const isFloorPlant = item.name.includes("바닥") || item.name.includes("플로어") || item.name.includes("몬스테라");
  const plantHeight = Math.min(Math.max(item.dimensions.height, 0.32), 1.25);
  const restHeight = isFloorPlant ? 0 : 0.4;
  const potHeight = isFloorPlant ? plantHeight * 0.24 : 0.12;
  const potRadius = Math.min(item.dimensions.width * 0.32, plantHeight * 0.19);
  const baseY = restHeight - item.dimensions.height / 2;
  const leafShape = useMemo(() => createLeafShape(), []);

  const leaves = useMemo<Leaf[]>(() => {
    const count = isFloorPlant ? 9 : 5;
    const stemStartY = baseY + potHeight * 0.94;

    return Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2 + (index % 2 ? 0.18 : 0);
      const heightRatio = 0.48 + (index % 3) * 0.1;
      const spread = plantHeight * (0.2 + (index % 2) * 0.035);
      const directionX = Math.cos(angle);
      const directionZ = Math.sin(angle);
      const end = new THREE.Vector3(
        directionX * spread,
        stemStartY + plantHeight * heightRatio,
        directionZ * spread,
      );
      const control = new THREE.Vector3(
        directionX * spread * 0.34,
        stemStartY + plantHeight * (heightRatio * 0.56),
        directionZ * spread * 0.34,
      );

      return {
        curve: new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, stemStartY, 0),
          control,
          end,
        ]),
        end,
        angle,
        tilt: 0.48 + (index % 3) * 0.1,
        scale: plantHeight * (0.72 + (index % 2) * 0.12),
      };
    });
  }, [baseY, isFloorPlant, plantHeight, potHeight]);

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, baseY + potHeight / 2, 0]}>
        <cylinderGeometry args={[potRadius * 0.82, potRadius, potHeight, 32]} />
        <Material type="wood" color={colors?.secondary[0] ?? "#907052"} roughness={0.78} />
      </mesh>
      <mesh receiveShadow position={[0, baseY + potHeight + 0.008, 0]}>
        <cylinderGeometry args={[potRadius * 0.82, potRadius * 0.82, 0.016, 24]} />
        <meshStandardMaterial color="#3f3023" roughness={1} />
      </mesh>

      {leaves.map((leaf, index) => (
        <group key={index}>
          <mesh castShadow>
            <tubeGeometry args={[leaf.curve, 14, isFloorPlant ? 0.012 : 0.008, 6, false]} />
            <meshStandardMaterial color="#4d6335" roughness={0.8} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            position={leaf.end}
            rotation={[leaf.tilt, -leaf.angle, 0]}
            scale={[leaf.scale, leaf.scale, 1]}
          >
            <shapeGeometry args={[leafShape, 10]} />
            <meshStandardMaterial
              color={index % 3 === 0 ? "#2f6b3f" : item.color}
              roughness={0.72}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
