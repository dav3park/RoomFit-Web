import { windowCenterY } from "./openingLayout";
import type { Opening } from "../../types";

// Referencing the divided-lite/casement window convention common in interior
// renders: an outer casing, a sill ledge, and a recessed sky-blue pane split
// into a small grid by mullions. The casing/
// glass/mullions are centered on z=0 (not offset toward one face) so the
// window reads the same from both inside and outside the room.
export default function Window({ opening, wallHeight = 2.4 }: { opening: Opening; wallHeight?: number }) {
  const width = opening.dimensions.width;
  const height = opening.dimensions.height;
  const centerY = windowCenterY(height, wallHeight, opening.sillHeight);
  const paneWidth = width - 0.06;
  const paneHeight = height - 0.06;
  const outerWidth = width + 0.12;
  const outerHeight = height + 0.12;
  const casingDepth = 0.07;
  const borderW = (outerWidth - paneWidth) / 2;
  const borderH = (outerHeight - paneHeight) / 2;
  const columns = width > 1.4 ? 3 : 2;
  const rows = height > 1.4 ? 2 : 1;

  return (
    <group position={[opening.position.x, centerY, opening.position.z]} rotation={[0, opening.rotationY, 0]}>
      {/* Outer casing — 4 border pieces around the pane, not a solid slab.
          A single box the size of the whole opening previously entombed the
          glass pane inside its own volume (both are centered at the same
          origin, and the casing was larger in every dimension), so the glass
          was never actually visible — just the casing's ivory face, reading
          as a plain recessed wall instead of a window. */}
      <mesh receiveShadow position={[0, paneHeight / 2 + borderH / 2, 0]}>
        <boxGeometry args={[outerWidth, borderH, casingDepth]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.75} />
      </mesh>
      <mesh receiveShadow position={[0, -(paneHeight / 2 + borderH / 2), 0]}>
        <boxGeometry args={[outerWidth, borderH, casingDepth]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.75} />
      </mesh>
      <mesh receiveShadow position={[-(paneWidth / 2 + borderW / 2), 0, 0]}>
        <boxGeometry args={[borderW, paneHeight, casingDepth]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.75} />
      </mesh>
      <mesh receiveShadow position={[paneWidth / 2 + borderW / 2, 0, 0]}>
        <boxGeometry args={[borderW, paneHeight, casingDepth]} />
        <meshStandardMaterial color="#f4f1ec" roughness={0.75} />
      </mesh>

      {/* Sill — sticks into the room only, like a real windowsill would. */}
      <mesh position={[0, -height / 2 - 0.05, 0.05]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.22, 0.04, 0.15]} />
        <meshStandardMaterial color="#e7e1d3" roughness={0.6} />
      </mesh>

      {/* Recessed glass, centered so both faces show it equally. Solid-ish
          meshStandardMaterial instead of a transmission pane — transmission
          samples whatever is behind the glass (usually the pale room
          background), which washed the color out to near-white regardless of
          the color prop. */}
      <mesh>
        <boxGeometry args={[paneWidth, paneHeight, 0.03]} />
        <meshStandardMaterial color="#5fa8c9" roughness={0.15} metalness={0.1} opacity={0.9} transparent />
      </mesh>

      {/* Divided-lite mullion grid — depth matches the casing so it pokes
          through symmetrically on both sides instead of only showing on one. */}
      {Array.from({ length: columns - 1 }, (_, index) => {
        const x = -paneWidth / 2 + (paneWidth / columns) * (index + 1);
        return (
          <mesh key={`v-${index}`} position={[x, 0, 0]}>
            <boxGeometry args={[0.026, paneHeight, 0.07]} />
            <meshStandardMaterial color="#f4f1ec" roughness={0.6} />
          </mesh>
        );
      })}
      {Array.from({ length: rows - 1 }, (_, index) => {
        const y = -paneHeight / 2 + (paneHeight / rows) * (index + 1);
        return (
          <mesh key={`h-${index}`} position={[0, y, 0]}>
            <boxGeometry args={[paneWidth, 0.026, 0.07]} />
            <meshStandardMaterial color="#f4f1ec" roughness={0.6} />
          </mesh>
        );
      })}

      {/* Window openings intentionally render frame and glass only. Blinds are
          independently selected furniture, anchored by RoomViewer; historical
          opening.blind data is ignored so it cannot reappear after reload. */}
    </group>
  );
}
