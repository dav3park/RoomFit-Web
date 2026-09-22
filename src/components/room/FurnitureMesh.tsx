import { TransformControls } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import FurnitureRenderer from "../furniture/FurnitureRenderer";
import type { Furniture, RoomLayout, Vector2D } from "../../types";
import type { PreferredColorToneId } from "../../config/preferredColorTone";
import type { Vector3Tuple } from "../furniture/variants/types";
import { resolveFurnitureCollisionMode } from "../../config/furnitureBehaviorPolicy";
import {
  clampFurniturePositionToRoom,
  resolveFurnitureLocalFootprint,
} from "./furnitureBoundary";
import { localClearanceRects } from "../../geometry/clearance";
import { FootprintDecal } from "./FootprintDecal";
import type { LiveIssueSeverity } from "../../geometry/liveValidation";

const ERROR_DECAL_COLOR = "#ef4444";
const WARNING_DECAL_COLOR = "#f97316";

interface FurnitureMeshProps {
  item: Furniture;
  room: Pick<RoomLayout, "width" | "depth" | "walls">;
  isSelected: boolean;
  canTransform: boolean;
  showSelectionIndicator: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, position: Vector2D) => void;
  onMoveStart?: (id: string) => void;
  onMoveEnd?: (id: string) => void;
  preferredColorTone?: PreferredColorToneId | null;
  layoutPosition?: Vector3Tuple;
  layoutRotationY?: number;
  visualScale?: Vector3Tuple;
  /** Red floor decal on this item's own footprint — a body collision or out-of-bounds placement. */
  bodySeverity?: LiveIssueSeverity | null;
  /** Orange floor decals on the specific clearance zone(s) (front/left/right) another item is blocking. */
  warningZoneSides?: readonly ("front" | "left" | "right")[];
}

export function FurnitureMesh({
  item,
  room,
  isSelected,
  canTransform,
  showSelectionIndicator,
  onSelect,
  onMove,
  onMoveStart,
  onMoveEnd,
  preferredColorTone,
  layoutPosition,
  layoutRotationY,
  visualScale,
  bodySeverity,
  warningZoneSides,
}: FurnitureMeshProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const floorOverlayOffset = resolveFurnitureCollisionMode(item.variantId, item.category) === "FLOOR_OVERLAY"
    ? 0.006
    : 0;
  const heightOffset = (layoutPosition?.[1] ?? item.dimensions.height / 2) + floorOverlayOffset;
  const positionX = layoutPosition?.[0] ?? item.position.x;
  const positionZ = layoutPosition?.[2] ?? item.position.z;
  const rotationY = layoutRotationY ?? item.rotationY;

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.set(positionX, heightOffset, positionZ);
    groupRef.current.rotation.y = rotationY;
  }, [heightOffset, positionX, positionZ, rotationY]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onSelect(item.id);
  };

  const commitPosition = () => {
    if (!groupRef.current) {
      return;
    }

    const position = clampFurniturePositionToRoom(room, item.dimensions, {
      x: groupRef.current.position.x,
      z: groupRef.current.position.z,
    }, item.rotationY, resolveFurnitureLocalFootprint(item));
    if (!position) {
      groupRef.current.position.set(item.position.x, heightOffset, item.position.z);
      return;
    }
    groupRef.current.position.x = position.x;
    groupRef.current.position.z = position.z;
    onMove(item.id, position);
  };

  // Rendered as children of this already-rotated group, in the item's own
  // local (unrotated) frame — see FootprintDecal's doc comment.
  const floorDecalY = -heightOffset + 0.008;
  const localFootprint = resolveFurnitureLocalFootprint(item);
  const activeWarningZones = warningZoneSides && warningZoneSides.length > 0
    ? localClearanceRects(item).filter((rect) => warningZoneSides.includes(rect.side))
    : [];

  const meshGroup = (
    <group
      ref={groupRef}
      position={[positionX, heightOffset, positionZ]}
      rotation={[0, rotationY, 0]}
      onPointerDown={handlePointerDown}
    >
      <FurnitureRenderer item={item} preferredColorTone={preferredColorTone} visualScale={visualScale} />
      {isSelected && showSelectionIndicator && (
        <mesh position={[0, item.dimensions.height / 2 + 0.045, 0]}>
          <boxGeometry args={[item.dimensions.width + 0.1, 0.035, item.dimensions.depth + 0.1]} />
          <meshStandardMaterial color="#111111" transparent opacity={0.16} />
        </mesh>
      )}
      {bodySeverity === "ERROR" && (
        <FootprintDecal
          minX={localFootprint.minX}
          maxX={localFootprint.maxX}
          minZ={localFootprint.minZ}
          maxZ={localFootprint.maxZ}
          y={floorDecalY}
          color={ERROR_DECAL_COLOR}
          opacity={0.4}
        />
      )}
      {activeWarningZones.map((zone) => (
        <FootprintDecal
          key={zone.side}
          minX={zone.minX}
          maxX={zone.maxX}
          minZ={zone.minZ}
          maxZ={zone.maxZ}
          y={floorDecalY}
          color={WARNING_DECAL_COLOR}
          opacity={0.25}
        />
      ))}
    </group>
  );

  if (isSelected && canTransform) {
    // `meshGroup` is rendered as a *sibling*, not nested inside
    // <TransformControls>, and `object={groupRef}` points it straight at our
    // own group. Nesting it as `children` used to cause two compounding bugs:
    // drei's TransformControls attaches to a wrapper <group> *it* creates
    // around `children` when no `object` is given, not to `meshGroup` itself,
    // so dragging moved that invisible wrapper while commitPosition() kept
    // reading groupRef's (unmoved) position. And even after passing `object`,
    // its attach effect still lists `children` in its dependency array — a
    // new `meshGroup` element (a fresh reference every render, since it
    // embeds the constantly-changing `item.position`) made that effect
    // detach+reattach the gizmo on every single drag tick, resetting its
    // internal drag state each time and cancelling out any net movement.
    // With no children passed here, that dependency never changes and the
    // gizmo attaches exactly once.
    return (
      <>
        {meshGroup}
        <TransformControls
          object={groupRef}
          mode="translate"
          showY={false}
          translationSnap={0.05}
          onMouseDown={() => onMoveStart?.(item.id)}
          onMouseUp={() => {
            commitPosition();
            onMoveEnd?.(item.id);
          }}
          onObjectChange={commitPosition}
        />
      </>
    );
  }

  return meshGroup;
}
