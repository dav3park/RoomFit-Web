import Material from "../materials/Material";
import type { FurnitureRenderProps } from "./furnitureTheme";

// A flat panel resting on a TV console (not wall-mounted): thin matte bezel,
// an inset glossy screen with a soft diagonal reflection highlight, and a
// small foot bar along the bottom edge instead of a wall-mount bracket — the
// previous version was two near-black boxes (#0d0d0d / #161616) barely
// offset from each other, which at a glance just read as one plain black box.
//
// FurnitureMesh always centers an item's group at floor + dimensions.height/2
// (there's no separate "mounting height" field), so a TV item's own height
// doubles as its full floor-to-top footprint. To actually read as sitting
// *on top of* a low TV stand next to it, rather than a panel sitting on the
// floor behind the stand, the panel itself only fills the upper portion of
// that footprint — its bottom edge lands exactly at the reserved clearance
// height, which is where the foot bar sits. The clearance is pinned to a
// real stand height (0.36m — the sample TV stand is 0.28m tall, plus a
// visible gap) rather than a fraction of the TV's own height: a fraction
// landed barely above the stand with almost no gap, which didn't read as
// "resting on top of it." Clamped so a much shorter TV item still keeps a
// usable screen instead of the clearance eating most of its height.
export default function Television({ item, colors }: FurnitureRenderProps) {
  const { width, height, depth } = item.dimensions;
  const bezelDepth = Math.max(0.025, depth * 0.5);
  const screenInset = 0.05;
  const standClearance = Math.min(0.36, height * 0.5);
  const panelHeight = height - standClearance - height * 0.05;
  const panelCenterY = -height / 2 + standClearance + panelHeight / 2;

  return (
    <group>
      {/* Bezel / body — a dark graphite rather than near-black so it reads
          as a distinct frame instead of merging with the screen. */}
      <mesh castShadow receiveShadow position={[0, panelCenterY, 0]}>
        <boxGeometry args={[width, panelHeight, bezelDepth]} />
        <Material type="glass" color={colors?.accent[0] ?? "#232323"} roughness={0.4} metalness={0.15} />
      </mesh>

      {/* Screen — a cooler, glossier dark blue-black so it visibly separates
          from the matte bezel around it. */}
      <mesh position={[0, panelCenterY, bezelDepth / 2 + 0.004]}>
        <boxGeometry args={[width - screenInset, panelHeight - screenInset, 0.008]} />
        <Material type="glass" color="#0c141d" roughness={0.06} metalness={0.35} />
      </mesh>

      {/* Soft diagonal reflection glint across the glass. */}
      <mesh position={[-width * 0.12, panelCenterY + panelHeight * 0.1, bezelDepth / 2 + 0.009]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[width * 0.18, panelHeight * 1.15, 0.002]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </mesh>

      {/* Foot bar along the bottom edge — this TV rests on the stand below
          it rather than being wall-mounted. */}
      <mesh castShadow receiveShadow position={[0, panelCenterY - panelHeight / 2 - 0.008, bezelDepth * 0.2]}>
        <boxGeometry args={[width * 0.55, 0.016, bezelDepth * 1.6]} />
        <Material type="metal" color={colors?.accent[1] ?? "#1c1c1c"} roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}
