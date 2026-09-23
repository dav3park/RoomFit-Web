import { ContactShadows, OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useState } from "react";
import * as THREE from "three";
import { FurnitureMesh } from "./FurnitureMesh";
import Door from "./Door";
import Floor from "./Floor";
import Lighting from "./Lighting";
import Wall from "./Wall";
import Window from "./Window";
import { entranceViewCamera, interiorViewWallIds } from "./roomViewGeometry";
import { resolveFurnitureSupportPositions } from "./furnitureSupportPlacement";
import { isWindowAnchoredFurniture, resolveWindowBlindPlacements } from "./windowBlindPlacement";
import { computeLocalValidationIssues } from "../../geometry/liveValidation";
import type { Furniture, RoomLayout, Vector2D, WallSegment } from "../../types";
import type { PreferredColorToneId } from "../../config/preferredColorTone";

interface RoomViewerProps {
  room: RoomLayout;
  furniture: Furniture[];
  selectedFurnitureId: string | null;
  onSelectFurniture: (id: string | null) => void;
  onMoveFurniture: (id: string, position: Vector2D) => void;
  onBeginMoveFurniture?: (id: string) => void;
  onEndMoveFurniture?: (id: string) => void;
  onRotateFurniture?: (id: string) => void;
  hideEntranceWalls?: boolean;
  alignCameraToEntrance?: boolean;
  showEditingHelpers?: boolean;
  preferredColorTone?: PreferredColorToneId | null;
}

export function RoomViewer({
  room,
  furniture,
  selectedFurnitureId,
  onSelectFurniture,
  onMoveFurniture,
  onBeginMoveFurniture,
  onEndMoveFurniture,
  onRotateFurniture,
  hideEntranceWalls = false,
  alignCameraToEntrance = false,
  showEditingHelpers = false,
  preferredColorTone,
}: RoomViewerProps) {
  const camera = room.camera ?? {
    type: "orthographic" as const,
    position: { x: 6.2, y: 5.2, z: 6.2 },
    target: { x: 0, y: 0.6, z: 0 },
    zoom: 78,
  };
  const activeCamera = alignCameraToEntrance ? entranceViewCamera(room, camera) : camera;
  const cameraMode = alignCameraToEntrance ? `entrance-${room.id}` : `default-${room.id}`;
  const visibleFurniture = furniture.filter((item) => item.status !== "deleted");
  const blindPlacements = resolveWindowBlindPlacements(room, visibleFurniture);
  const supportPositions = resolveFurnitureSupportPositions(visibleFurniture);
  // Recomputed from the furniture list alone on every render — including
  // every drag tick — so a collision/clearance problem shows up as a
  // red/orange floor decal instantly, before any server round-trip.
  const liveIssues = computeLocalValidationIssues(furniture, room);

  return (
    <div className="viewer-shell">
      <Canvas
        shadows
        dpr={[1, 2]}
        // preserveDrawingBuffer keeps the last-rendered frame in the canvas's
        // backbuffer instead of it being cleared right after compositing —
        // without it, canvas.toDataURL() (see ManageFurniture.tsx's room
        // thumbnail capture) can grab a blank/black frame depending on
        // exactly when the browser decides to swap buffers relative to the
        // capture call.
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        onPointerMissed={() => onSelectFurniture(null)}
      >

        <group position={[0, -1, 0]}>
          {/* A warmer, clearly-distinct ivory — the walls are already a near-white
              "#f4f1ec", so a near-identical background made the room blend into
              its own backdrop instead of standing apart from it. */}
          <FitOrthographicCamera
            key={`camera-${cameraMode}`}
            position={activeCamera.position}
            zoom={activeCamera.zoom}
          />
          <Lighting room={room} />

          <RoomShell
            room={room}
            hideEntranceWalls={hideEntranceWalls}
            cameraPosition={activeCamera.position}
          />

          {visibleFurniture.map((item) => {
            const blindPlacement = blindPlacements.get(item.id);
            const supportPosition = supportPositions.get(item.id);
            // A blind has no free-standing fallback: a room without a window,
            // or with no remaining unused window, cannot render one mid-room.
            if (isWindowAnchoredFurniture(item) && !blindPlacement) return null;
            const itemIssues = liveIssues.filter((issue) => issue.furnitureId === item.id);
            const bodySeverity = itemIssues.some((issue) => issue.severity === "ERROR") ? "ERROR" : null;
            const warningZoneSides = itemIssues
              .map((issue) => issue.zoneSide)
              .filter((side): side is "front" | "left" | "right" => side !== undefined);
            return (
              <FurnitureMesh
                key={item.id}
                item={item}
                room={room}
                isSelected={selectedFurnitureId === item.id}
                canTransform={showEditingHelpers && !blindPlacement}
                showSelectionIndicator={showEditingHelpers && !blindPlacement}
                onSelect={onSelectFurniture}
                onMove={onMoveFurniture}
                onMoveStart={onBeginMoveFurniture}
                onMoveEnd={onEndMoveFurniture}
                preferredColorTone={preferredColorTone}
                layoutPosition={blindPlacement?.position ?? supportPosition}
                layoutRotationY={blindPlacement?.rotationY}
                visualScale={blindPlacement?.scale}
                bodySeverity={bodySeverity}
                warningZoneSides={warningZoneSides}
              />
            );
          })}

          <ContactShadows opacity={0.24} scale={8} blur={3.2} far={5} position={[0, 0.015, 0]} />
          <OrbitControls
            key={`controls-${cameraMode}`}
            makeDefault
            enableDamping
            target={[activeCamera.target.x, activeCamera.target.y, activeCamera.target.z]}
            minDistance={4.2}
            maxDistance={10}
            // Nearly top-down to nearly-horizontal — was locked to a narrow
            // 37.5°-85° band that made it impossible to look straight down into
            // the room (walls always blocked the view from any angle allowed).
            minPolarAngle={0.05}
            maxPolarAngle={1.5}
          />
        </group>
      </Canvas>
      <div className="viewer-caption">
        {showEditingHelpers && <span>가구를 클릭한 뒤 드래그해 이동할 수 있습니다.</span>}
        {showEditingHelpers && selectedFurnitureId && onRotateFurniture && (
          <button
            type="button"
            onClick={() => onRotateFurniture(selectedFurnitureId)}
            className="rounded-full bg-[#111111] px-3 py-1 text-[11px] font-extrabold text-white transition-colors hover:bg-[#333333]"
          >
            ⟳ 90° 회전
          </button>
        )}
        <strong>{showEditingHelpers && selectedFurnitureId ? "선택됨" : "둘러보기"}</strong>
      </div>
    </div>
  );
}

export default RoomViewer;

// `activeCamera.zoom` is baked in (backend default, or a fixed fallback)
// for whatever pixel size the viewport happened to be when the camera was
// created — it has no idea the editor's catalog sidebar can be dragged
// wider/narrower. Since the sidebar resize only changes CSS layout (not
// `cameraMode`), the <OrthographicCamera> here never remounts during a
// drag, so its frustum needs to be rescaled live or the room stays pinned
// at its first-rendered size while the viewport around it grows/shrinks —
// which reads as the room getting shoved into a corner instead of filling
// the newly available space. Rescaling zoom by how much the canvas has
// grown/shrunk since this camera first mounted keeps the room centered and
// fully framed at any panel width.
function FitOrthographicCamera({
  position,
  zoom,
}: {
  position: { x: number; y: number; z: number };
  zoom: number;
}) {
  const size = useThree((state) => state.size);
  const [baseline] = useState(() => ({ width: size.width, height: size.height }));
  const scale = Math.min(size.width / baseline.width, size.height / baseline.height);

  return (
    <OrthographicCamera
      makeDefault
      position={[position.x, position.y, position.z]}
      zoom={zoom * scale}
      near={0.1}
      far={100}
    />
  );
}

function RoomShell({
  room,
  hideEntranceWalls,
  cameraPosition,
}: {
  room: RoomLayout;
  hideEntranceWalls: boolean;
  cameraPosition: { x: number; z: number };
}) {
  const hiddenWallIds = hideEntranceWalls
    ? interiorViewWallIds(room, cameraPosition)
    : new Set<string>();
  const visibleDoors = room.doors.filter((opening) => !opening.wallId || !hiddenWallIds.has(opening.wallId));
  const visibleWindows = room.windows.filter((opening) => !opening.wallId || !hiddenWallIds.has(opening.wallId));

  return (
    <group>
      <Floor room={room} />

      {room.walls.map((wall) => (
        hiddenWallIds.has(wall.id) ? null : <Wall key={wall.id} wall={wall} doors={visibleDoors} windows={visibleWindows} />
      ))}

      {visibleWindows.map((opening) => (
        <Window key={opening.id} opening={opening} wallHeight={room.height ?? 2.4} />
      ))}
      {visibleDoors.map((opening) => (
        <Door key={opening.id} opening={opening} wallThickness={wallThicknessFor(opening.wallId, room.walls)} />
      ))}
    </group>
  );
}

// Falls back to the default wall thickness (matches Wall.tsx's own default)
// when an opening has no wallId (older/hand-authored data) or its wall
// somehow isn't found.
function wallThicknessFor(wallId: string | undefined, walls: WallSegment[]): number {
  return walls.find((wall) => wall.id === wallId)?.thickness ?? 0.12;
}
