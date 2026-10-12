import Material from "../materials/Material";
import { DOOR_FRAME_MARGIN, WINDOW_FRAME_MARGIN, windowCenterY } from "./openingLayout";
import type { Opening, WallSegment } from "../../types";

interface WallProps {
  wall: WallSegment;
  doors?: Opening[];
  windows?: Opening[];
  hidden?: boolean;
  onSelect?: () => void;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface OpeningCut {
  offset: number; // center, measured along the wall from wall.start
  width: number;
  height: number;
  bottom: number;
  marginWidth: number;
  marginHeight: number;
}

// Rectangle-minus-rectangle: keeps up to 4 pieces (below/above/left/right of the
// hole) per input piece. Walls and openings are always axis-aligned boxes here,
// so this is exact — no need for a general CSG library.
function subtractRect(rects: Rect[], hole: Rect): Rect[] {
  const result: Rect[] = [];

  for (const r of rects) {
    const noOverlap = hole.x1 <= r.x0 || hole.x0 >= r.x1 || hole.y1 <= r.y0 || hole.y0 >= r.y1;
    if (noOverlap) {
      result.push(r);
      continue;
    }

    if (r.y0 < hole.y0) {
      result.push({ x0: r.x0, x1: r.x1, y0: r.y0, y1: hole.y0 });
    }
    if (hole.y1 < r.y1) {
      result.push({ x0: r.x0, x1: r.x1, y0: hole.y1, y1: r.y1 });
    }

    const midY0 = Math.max(r.y0, hole.y0);
    const midY1 = Math.min(r.y1, hole.y1);
    if (midY1 > midY0) {
      if (r.x0 < hole.x0) {
        result.push({ x0: r.x0, x1: hole.x0, y0: midY0, y1: midY1 });
      }
      if (hole.x1 < r.x1) {
        result.push({ x0: hole.x1, x1: r.x1, y0: midY0, y1: midY1 });
      }
    }
  }

  return result;
}

// Matches an opening to this wall by geometry (distance to the wall's line +
// overlap along its length) rather than by a shared id/label — real scanned
// rooms can have several wall segments on the same side, and openings aren't
// linked to a specific segment.
function matchOpenings(
  wall: WallSegment,
  length: number,
  dirX: number,
  dirZ: number,
  openings: Opening[],
  bottomOf: (opening: Opening) => number,
  margin: { width: number; height: number },
): OpeningCut[] {
  const normX = -dirZ;
  const normZ = dirX;
  const matches: OpeningCut[] = [];

  for (const opening of openings) {
    // Trust an explicit wall assignment (set by snapToWall in api/rooms.ts)
    // over re-deriving it here. The two checks used to run independently and
    // could disagree near corners or between adjacent wall segments, cutting
    // the hole into the wrong wall and leaving the opening's real wall solid
    // — which read as the door/window overlapping the wall.
    if (opening.wallId !== undefined && opening.wallId !== wall.id) {
      continue;
    }

    const relX = opening.position.x - wall.start.x;
    const relZ = opening.position.z - wall.start.z;
    const along = relX * dirX + relZ * dirZ;
    const perp = relX * normX + relZ * normZ;
    const halfWidth = opening.dimensions.width / 2;

    const onThisWall = Math.abs(perp) < 0.25 && along + halfWidth > -0.05 && along - halfWidth < length + 0.05;
    if (onThisWall) {
      matches.push({
        offset: along,
        width: opening.dimensions.width,
        height: opening.dimensions.height,
        bottom: bottomOf(opening),
        marginWidth: margin.width,
        marginHeight: margin.height,
      });
    }
  }

  return matches;
}

export default function Wall({ wall, doors = [], windows = [], hidden = false, onSelect }: WallProps) {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.sqrt(dx * dx + dz * dz);

  if (length < 0.01 || hidden) {
    return null;
  }

  const angle = Math.atan2(dz, dx);
  const centerX = (wall.start.x + wall.end.x) / 2;
  const centerZ = (wall.start.z + wall.end.z) / 2;
  const height = wall.height ?? 2.9;
  const thickness = wall.thickness ?? 0.12;
  const dirX = dx / length;
  const dirZ = dz / length;

  const doorCuts = matchOpenings(wall, length, dirX, dirZ, doors, () => 0, DOOR_FRAME_MARGIN);
  // Shared with Window.tsx so the cut always lines up with where the window
  // mesh is actually drawn, including when it has to shift down to fit under
  // a shorter wall.
  const windowCuts = matchOpenings(
    wall,
    length,
    dirX,
    dirZ,
    windows,
    (opening) => windowCenterY(opening.dimensions.height, height, opening.sillHeight) - opening.dimensions.height / 2,
    WINDOW_FRAME_MARGIN,
  );

  // The hole matches the frame's own overhang (marginWidth/marginHeight) —
  // otherwise the frame mesh's edge overlaps the neighboring solid wall piece
  // and the two coplanar surfaces z-fight (flicker/"sparkle" at the seam).
  let pieces: Rect[] = [{ x0: 0, x1: length, y0: 0, y1: height }];
  for (const cut of [...doorCuts, ...windowCuts]) {
    pieces = subtractRect(pieces, {
      x0: cut.offset - cut.width / 2 - cut.marginWidth / 2,
      x1: cut.offset + cut.width / 2 + cut.marginWidth / 2,
      y0: Math.max(0, cut.bottom - cut.marginHeight / 2),
      y1: Math.min(height, cut.bottom + cut.height + cut.marginHeight / 2),
    });
  }

  return (
    <group position={[centerX, 0, centerZ]} rotation={[0, -angle, 0]}>
      {pieces.map((piece, index) => {
        const pieceWidth = piece.x1 - piece.x0;
        const pieceHeight = piece.y1 - piece.y0;
        if (pieceWidth <= 0.001 || pieceHeight <= 0.001) {
          return null;
        }

        return (
          <mesh
            key={index}
            castShadow
            receiveShadow
            position={[(piece.x0 + piece.x1) / 2 - length / 2, (piece.y0 + piece.y1) / 2, 0]}
            onPointerDown={
              onSelect &&
              ((event) => {
                event.stopPropagation();
                onSelect();
              })
            }
          >
            <boxGeometry args={[pieceWidth, pieceHeight, thickness]} />
            <Material type="white" color={wall.material?.color ?? "#f4f1ec"} roughness={wall.material?.roughness ?? 0.82} />
          </mesh>
        );
      })}
    </group>
  );
}
