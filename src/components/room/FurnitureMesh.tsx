import { TransformControls } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
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
  directDrag?: boolean;
  selectOnClick?: boolean;
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
  selectOnClick = false,
  directDrag = false,
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
  const get = useThree(state => state.get);
  const orbitControls = () => get().controls as unknown as {enabled:boolean} | undefined;
  const enableOrbit = (enabled:boolean) => { const control=orbitControls(); if(control) control.enabled=enabled; };
  const dragging = useRef<{x:number;y:number;offset:Vector2D; moved:boolean; enabled:boolean} | null>(null);
  const floorPoint = (event: ThreeEvent<PointerEvent>) => event.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),1),new THREE.Vector3());
  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    event.stopPropagation();
    enableOrbit(dragging.current.enabled);
    dragging.current=null;
    (event.target as unknown as HTMLElement).releasePointerCapture(event.pointerId);
    onMoveEnd?.(item.id);
  };
  useEffect(() => () => { const control=get().controls as unknown as {enabled:boolean} | undefined; if(dragging.current && control) control.enabled=dragging.current.enabled; }, [get]);
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
    if (directDrag && event.button === 0) {
      const point=floorPoint(event);
      if (point) {
        dragging.current={x:event.clientX,y:event.clientY,offset:{x:item.position.x-point.x,z:item.position.z-point.z},moved:false,enabled:orbitControls()?.enabled ?? true};
        enableOrbit(false);
        (event.target as unknown as HTMLElement).setPointerCapture(event.pointerId);
      }
    }
    if (!selectOnClick) onSelect(item.id);
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
      onPointerMove={directDrag ? event => {
        const drag=dragging.current;
        if (!drag) return;
        event.stopPropagation();
        if (!drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4) return;
        const point=floorPoint(event);
        if (!point) return;
        if (!drag.moved) { drag.moved=true; onSelect(item.id); onMoveStart?.(item.id); }
        onMove(item.id,{x:point.x+drag.offset.x,z:point.z+drag.offset.z});
      } : undefined}
      onPointerUp={directDrag ? finishDrag : undefined}
      onPointerCancel={directDrag ? finishDrag : undefined}
      onClick={selectOnClick ? event => { event.stopPropagation(); onSelect(item.id); } : undefined}
    >
      <FurnitureRenderer item={item} preferredColorTone={preferredColorTone} visualScale={visualScale ?? item.demoVisualScale} />
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

  if (isSelected && canTransform && !directDrag) {
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
