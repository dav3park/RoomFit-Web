// Flat, floor-level rectangle rendered as a *child* of a furniture item's own
// rotated <group> (see FurnitureMesh) — local (unrotated) coordinates in, so
// it inherits that group's rotation/position for free, same as every other
// child mesh there.
interface FootprintDecalProps {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  color: string;
  opacity: number;
}

export function FootprintDecal({ minX, maxX, minZ, maxZ, y, color, opacity }: FootprintDecalProps) {
  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (!(width > 0) || !(depth > 0)) {
    return null;
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return (
    <mesh position={[centerX, y, centerZ]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

export default FootprintDecal;
