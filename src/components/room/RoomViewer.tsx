import { getLayoutAppliedColorScheme } from '../../config/appliedColorTone';
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { FurnitureMesh } from "./FurnitureMesh";
import Door from "./Door";
import Floor from "./Floor";
import Lighting from "./Lighting";
import Wall from "./Wall";
import Window from "./Window";
import { entranceViewCamera } from "./roomViewGeometry";
import FadeGroup from "./FadeGroup";
import { occludingWallIds, wallOutwardNormals } from "./occludingWalls";
import { resolveFurnitureInstallations } from "../../geometry/furnitureInstallation";
import { placementPolicy } from "../../config/furniturePlacementPolicy";
import { computeLocalValidationIssues } from "../../geometry/liveValidation";
import type { Furniture, RoomLayout, Vector2D, WallSegment } from "../../types";
import type { FurnitureColorThemeId } from "../../config/furnitureBehaviorPolicy";
import { isImmovableFixture } from "../../config/fixtureType";

interface RoomViewerProps {
  directDrag?: boolean;
  selectOnClick?: boolean;
  children?: ReactNode;
  disableOrbit?: boolean;
  room: RoomLayout;
  furniture: Furniture[];
  selectedFurnitureId: string | null;
  onSelectFurniture: (id: string | null) => void;
  onMoveFurniture: (id: string, position: Vector2D) => void;
  onBeginMoveFurniture?: (id: string) => void;
  onEndMoveFurniture?: (id: string) => void;
  onRotateFurniture?: (id: string) => void;
  /** 카메라와 방 사이에 있는 벽(문 제외)을 반투명하게 보여준다. 기본 켜짐. */
  fadeOccludingWalls?: boolean;
  alignCameraToEntrance?: boolean;
  showEditingHelpers?: boolean;
  preferredColorTone?: FurnitureColorThemeId | null;
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
  fadeOccludingWalls = true,
  alignCameraToEntrance = false,
  showEditingHelpers = false,
  preferredColorTone,
  children,
  selectOnClick = false,
  directDrag = false,
  disableOrbit = false,
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
  const installations=resolveFurnitureInstallations(room,visibleFurniture);
  // Recomputed from the furniture list alone on every render — including
  // every drag tick — so a collision/clearance problem shows up as a
  // red/orange floor decal instantly, before any server round-trip.
  const liveIssues = computeLocalValidationIssues(furniture, room, "render");

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
            target={activeCamera.target}
            roomWidth={room.width}
            roomDepth={room.depth}
            roomHeight={room.height ?? 2.4}
          />
          <Lighting room={room} />

          <RoomShell
            room={room}
            fadeOccludingWalls={fadeOccludingWalls}
          />

          {visibleFurniture.map((item) => {
            const installation=installations.get(item.id);
            // 창문 부착형과 붙박이 설비(싱크대·상부장 등)는 끌어서 옮길 수 없다. 냉장고는 옮길 수 있다.
            const anchored=placementPolicy(item).installation==='WINDOW'||isImmovableFixture(item);
            const itemIssues = liveIssues.filter((issue) => issue.furnitureId === item.id);
            const bodySeverity = itemIssues.some((issue) => issue.severity === "ERROR") ? "ERROR" : null;
            const warningZoneSides = itemIssues
              .map((issue) => issue.zoneSide)
              .filter((side): side is "front" | "left" | "right" => side !== undefined);
            return (
              <FurnitureMesh
                key={item.id}
                selectOnClick={selectOnClick}
                directDrag={directDrag}
                item={item}
                room={room}
                isSelected={selectedFurnitureId === item.id}
                canTransform={showEditingHelpers && !anchored}
                showSelectionIndicator={showEditingHelpers && !anchored}
                onSelect={onSelectFurniture}
                onMove={onMoveFurniture}
                onMoveStart={onBeginMoveFurniture}
                onMoveEnd={onEndMoveFurniture}
                preferredColorTone={getLayoutAppliedColorScheme(room)??preferredColorTone}
                layoutPosition={installation?.position}
                layoutRotationY={installation?.rotationY}
                visualScale={item.demoVisualScale??installation?.scale}
                bodySeverity={bodySeverity}
                warningZoneSides={warningZoneSides}
              />
            );
          })}

          {children}
          <ContactShadows opacity={0.24} scale={8} blur={3.2} far={5} position={[0, 0.015, 0]} />
          <OrbitControls
            key={`controls-${cameraMode}`}
            makeDefault
            enabled={!disableOrbit}
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

// `activeCamera.zoom` (backend-provided or the fixed fallback) is just a
// magnitude tuned once for whatever pixel size someone happened to view it
// at — it has no idea the editor's catalog sidebar can be dragged wider or
// that the browser window itself can be resized. A naive fix that rescales
// that fixed zoom relative to a "size when this camera first mounted"
// baseline breaks the moment the layout changes shape *after* mount (e.g.
// the catalog panel auto-opens right after the page loads, shrinking the
// viewport out from under an already-captured baseline) — it also has no
// way to know the fixed zoom was ever a good fit in the first place.
//
// Instead, on every resize (and every room/camera-pose change) this
// recomputes zoom from scratch: project the room's actual bounding box
// (its footprint extruded up to ceiling height) into the camera's current
// view space, and pick the zoom that fits the more constraining axis into
// the current canvas — so the room is always fully visible and centered,
// regardless of viewport size or aspect ratio, with no dependency on
// historical state.
function FitOrthographicCamera({
  position,
  target,
  roomWidth,
  roomDepth,
  roomHeight,
}: {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}) {
  const size = useThree((state) => state.size);
  const set = useThree((state) => state.set);
  const cameraRef = useRef<THREE.OrthographicCamera>(null);

  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (camera) set({ camera });
  }, [set]);

  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (!camera || size.width <= 0 || size.height <= 0) return;

    camera.position.set(position.x, position.y, position.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(target.x, target.y, target.z);
    camera.updateMatrixWorld(true);

    const halfWidth = roomWidth / 2;
    const halfDepth = roomDepth / 2;
    const corners: Array<[number, number, number]> = [
      [-halfWidth, 0, -halfDepth],
      [halfWidth, 0, -halfDepth],
      [halfWidth, 0, halfDepth],
      [-halfWidth, 0, halfDepth],
      [-halfWidth, roomHeight, -halfDepth],
      [halfWidth, roomHeight, -halfDepth],
      [halfWidth, roomHeight, halfDepth],
      [-halfWidth, roomHeight, halfDepth],
    ];

    let maxAbsX = 0.01;
    let maxAbsY = 0.01;
    const point = new THREE.Vector3();
    for (const [x, y, z] of corners) {
      point.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      maxAbsX = Math.max(maxAbsX, Math.abs(point.x));
      maxAbsY = Math.max(maxAbsY, Math.abs(point.y));
    }

    camera.left = -size.width / 2;
    camera.right = size.width / 2;
    camera.top = size.height / 2;
    camera.bottom = -size.height / 2;

    // 12% breathing room so the room's outer walls aren't flush with the
    // canvas edge.
    const framePadding = 1.12;
    const zoomForWidth = size.width / (2 * maxAbsX * framePadding);
    const zoomForHeight = size.height / (2 * maxAbsY * framePadding);
    const nextZoom = Math.min(zoomForWidth, zoomForHeight);
    camera.zoom = Number.isFinite(nextZoom) && nextZoom > 0 ? nextZoom : 1;
    camera.updateProjectionMatrix();
  }, [size.width, size.height, position.x, position.y, position.z, target.x, target.y, target.z, roomWidth, roomDepth, roomHeight]);

  return <orthographicCamera ref={cameraRef} near={0.1} far={100} />;
}

// 반투명 벽의 불투명도. 방 모양은 읽히되 안쪽 가구가 가리지 않을 정도.
const OCCLUDING_WALL_OPACITY = 0.2;

function RoomShell({
  room,
  fadeOccludingWalls,
}: {
  room: RoomLayout;
  fadeOccludingWalls: boolean;
}) {
  const wallFacings = useMemo(() => wallOutwardNormals(room), [room]);
  const [fadedWallIds, setFadedWallIds] = useState<ReadonlySet<string>>(() => new Set());
  const fadedRef = useRef(fadedWallIds);
  const viewDirection = useMemo(() => new THREE.Vector3(), []);

  // 카메라가 돌 때마다(OrbitControls) 가리는 벽이 바뀐다. 계산은 매 프레임 하되 집합이 바뀔 때만
  // 다시 렌더링한다.
  useFrame(({ camera }) => {
    const next = fadeOccludingWalls
      ? occludingWallIds(wallFacings, { x: -camera.getWorldDirection(viewDirection).x, z: -viewDirection.z }, fadedRef.current)
      : new Set<string>();
    if (next !== fadedRef.current && (next.size > 0 || fadedRef.current.size > 0)) {
      fadedRef.current = next;
      setFadedWallIds(next);
    }
  });

  return (
    <group>
      <Floor room={room} />

      {room.walls.map((wall) => {
        const faded = fadedWallIds.has(wall.id);
        // 반투명 벽의 창문도 같이 흐리게 한다 — 안 그러면 유리만 공중에 떠 보인다. 문은 입구가
        // 읽히도록 항상 불투명하게 둔다.
        const wallWindows = room.windows.filter((opening) => opening.wallId === wall.id);
        return (
          <FadeGroup key={wall.id} opacity={faded ? OCCLUDING_WALL_OPACITY : 1}>
            <Wall wall={wall} doors={room.doors} windows={room.windows} />
            {wallWindows.map((opening) => (
              <Window key={opening.id} opening={opening} wallHeight={room.height ?? 2.4} />
            ))}
          </FadeGroup>
        );
      })}

      {room.windows
        .filter((opening) => !opening.wallId || !room.walls.some((wall) => wall.id === opening.wallId))
        .map((opening) => (
          <Window key={opening.id} opening={opening} wallHeight={room.height ?? 2.4} />
        ))}
      {room.doors.map((opening) => (
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
