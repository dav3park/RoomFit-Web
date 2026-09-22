import { useEffect, useMemo, useRef, useState } from "react";
import { FiMinus, FiPlus, FiRotateCcw, FiTrash2, FiZoomIn } from "react-icons/fi";

import { getSampleRoomLayouts } from "../api/rooms";
import { RoomViewer } from "../components/room/RoomViewer";
import {
  moveFurnitureInsideRoom,
  resizeFurnitureInsideRoom,
  resizeRoomInsideBounds,
  rotateFurnitureInsideRoom,
} from "../components/room/furnitureBoundary";
import { resolveFurnitureVariant } from "../components/furniture/variants/furnitureVariantRouting";
import { resolveRoomLayoutPreferredColorTone } from "../config/appliedColorTone";
import { getLiveMirrorForSelectedRoom } from "../config/confirmedLayouts";
import {
  loadManagedFurnitureLayout,
  persistManagedFurnitureSnapshot,
  settleLatestManagedFurniturePersistence,
} from "../config/layoutEditingWorkflow";
import { captureCanvasThumbnail, saveRoomThumbnail } from "../config/roomThumbnails";
import { sampleRoomLayouts } from "../mock/interiorPlacementMock";
import { sampleRoom } from "../mock/sampleRoom";
import type { Furniture, RoomLayout, Size3D, Vector2D } from "../types";

const MANAGED_FURNITURE_SAVE_ERROR = "가구 배치를 저장하지 못했습니다. 편집 내용은 이 브라우저에 유지됩니다.";

// Millimeters, rounded to the nearest whole mm — matches the ±0.05m (50mm)
// step size below, so this never shows a fractional mm from a step press.
function formatDimensionMm(dimensions: Size3D): string {
  const w = Math.round(dimensions.width * 1000);
  const d = Math.round(dimensions.depth * 1000);
  const h = Math.round(dimensions.height * 1000);
  return `W${w} D${d} H${h}`;
}

// This page is the one place RoomPlan measurement error gets corrected, once,
// right after scanning — not a general resize tool. Bounding every correction
// to ±15% of the as-scanned value keeps it a "fix the noise" control rather
// than a redesign one.
const DIMENSION_CORRECTION_RANGE = 0.15;
const MIN_DIMENSION_METERS = 0.1;
const DIMENSION_STEP_METERS = 0.05;

function correctedBounds(original: number): { min: number; max: number } {
  return {
    min: Math.max(MIN_DIMENSION_METERS, original * (1 - DIMENSION_CORRECTION_RANGE)),
    max: original * (1 + DIMENSION_CORRECTION_RANGE),
  };
}

function roundToStep(value: number): number {
  return Math.round(value * 100) / 100;
}

export default function ManageFurniture() {
  const [selectedRoom, setSelectedRoom] = useState<RoomLayout>(() => getSelectedRoom());
  const selectedRoomMeta = useMemo(() => getSelectedRoomMeta(selectedRoom), [selectedRoom]);
  const preferredColorTone = useMemo(
    () => resolveRoomLayoutPreferredColorTone(selectedRoom),
    [selectedRoom],
  );
  const [furniture, setFurniture] = useState<Furniture[]>(() => cloneFurniture(selectedRoom.furniture));
  const latestRoomRef = useRef<RoomLayout>({
    ...selectedRoom,
    furniture: cloneFurniture(selectedRoom.furniture),
  });
  // The as-uploaded baseline for the "초기화" button. Kept out of localStorage
  // on purpose — each edit overwrites `roomfit:selectedRoomLayout` with the
  // *current* furniture before its Backend request starts, so that key can't
  // also serve as "what it looked like originally" once anything's been moved.
  const originalFurnitureRef = useRef<Furniture[]>(cloneFurniture(selectedRoom.furniture));
  // As-scanned room size — the correction range for the width/depth/height
  // steppers below is relative to this, not to whatever the room currently is.
  const originalRoomDimensionsRef = useRef<{ width: number; depth: number; height: number }>({
    width: selectedRoom.width,
    depth: selectedRoom.depth,
    height: selectedRoom.height ?? 2.4,
  });
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  // Starts true (not false) so the very first render already shows/captures
  // the interior view, without an initial exterior-view render needing to be
  // undone by an effect right after mount.
  const [hideEntranceWalls, setHideEntranceWalls] = useState(true);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const persistenceUiRevisionRef = useRef(0);

  const visibleFurniture = furniture.filter((item) => item.status !== "deleted");

  useEffect(() => {
    if (localStorage.getItem("roomfit:selectedRoomLayout") || localStorage.getItem("roomfit:selectedRoomId")) {
      return;
    }

    getSampleRoomLayouts()
      .then((rooms) => {
        const firstRoom = rooms[0];

        if (!firstRoom) {
          return;
        }

        setSelectedRoom(firstRoom);
        setFurniture(cloneFurniture(firstRoom.furniture));
        latestRoomRef.current = firstRoom;
        originalFurnitureRef.current = cloneFurniture(firstRoom.furniture);
        originalRoomDimensionsRef.current = {
          width: firstRoom.width,
          depth: firstRoom.depth,
          height: firstRoom.height ?? 2.4,
        };
        localStorage.setItem("roomfit:selectedRoomLayout", JSON.stringify(firstRoom));
        localStorage.setItem("roomfit:selectedRoomId", firstRoom.id);
        localStorage.setItem("roomfit:selectedRoomTitle", firstRoom.name);
        localStorage.setItem("roomfit:selectedRoomType", "원룸");
        localStorage.setItem("roomfit:selectedRoomSize", `${Math.round(firstRoom.width * firstRoom.depth)}㎡`);
      })
      .catch(() => {
        setSelectedRoom(sampleRoom);
        setFurniture(cloneFurniture(sampleRoom.furniture));
        latestRoomRef.current = sampleRoom;
        originalFurnitureRef.current = cloneFurniture(sampleRoom.furniture);
        originalRoomDimensionsRef.current = {
          width: sampleRoom.width,
          depth: sampleRoom.depth,
          height: sampleRoom.height ?? 2.4,
        };
      });
  }, []);

  useEffect(() => {
    const rawRoomId = localStorage.getItem("roomfit:backendRoomId");
    const backendRoomId = rawRoomId ? Number(rawRoomId) : Number.NaN;
    if (!Number.isInteger(backendRoomId) || backendRoomId <= 0) return;

    let cancelled = false;
    loadManagedFurnitureLayout(selectedRoom, backendRoomId)
      .then((restored) => {
        if (cancelled || !restored) return;
        setSelectedRoom(restored);
        setFurniture(cloneFurniture(restored.furniture));
        latestRoomRef.current = restored;
        originalFurnitureRef.current = cloneFurniture(restored.furniture);
        originalRoomDimensionsRef.current = {
          width: restored.width,
          depth: restored.depth,
          height: restored.height ?? 2.4,
        };
        setLayoutError("");
      })
      .catch(() => {
        if (!cancelled) {
          setLayoutError("저장된 배치를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      });

    return () => {
      cancelled = true;
    };
    // The selected room is fixed for this page mount. Including selectedRoom
    // would refetch after applying the restored backend snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = window.innerWidth - event.clientX;
      setPanelWidth(Math.min(520, Math.max(280, nextWidth)));
    };

    const stopResizing = () => {
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const applyRoomUpdate = (nextRoom: RoomLayout, persistToBackend: boolean) => {
    latestRoomRef.current = nextRoom;
    localStorage.setItem("roomfit:selectedRoomLayout", JSON.stringify(nextRoom));
    setSelectedRoom(nextRoom);
    setFurniture(nextRoom.furniture);

    if (persistToBackend) {
      persistFurniture(nextRoom);
    }
  };

  const saveFurniture = (nextFurniture: Furniture[], persistToBackend: boolean) => {
    applyRoomUpdate({ ...latestRoomRef.current, furniture: nextFurniture }, persistToBackend);
  };

  // Room dimension correction has no backend endpoint to persist to (the
  // upload/layout APIs only ever accept furniture, never room width/depth/
  // height) — this stays a local/session correction, same as every other
  // edit here until "다음 단계" runs prepareManagedFurnitureDraft.
  const adjustRoomDimension = (axis: "width" | "depth" | "height", delta: number) => {
    const current = latestRoomRef.current;
    const currentValue = axis === "height" ? current.height ?? originalRoomDimensionsRef.current.height : current[axis];
    const bounds = correctedBounds(originalRoomDimensionsRef.current[axis]);
    const next = Math.min(bounds.max, Math.max(bounds.min, roundToStep(currentValue + delta)));
    if (next === currentValue) return;
    applyRoomUpdate(resizeRoomInsideBounds(current, { [axis]: next }), false);
  };

  const resizeFurniture = (id: string, axis: "width" | "depth", delta: number) => {
    const item = latestRoomRef.current.furniture.find((candidate) => candidate.id === id);
    const original = originalFurnitureRef.current.find((candidate) => candidate.id === id);
    if (!item || !original) return;
    const bounds = correctedBounds(original.dimensions[axis]);
    const next = Math.min(bounds.max, Math.max(bounds.min, roundToStep(item.dimensions[axis] + delta)));
    if (next === item.dimensions[axis]) return;
    const nextDimensions = { width: item.dimensions.width, depth: item.dimensions.depth, [axis]: next };
    saveFurniture(
      latestRoomRef.current.furniture.map((candidate) => (
        candidate.id === id
          ? markUserModified(resizeFurnitureInsideRoom(latestRoomRef.current, candidate, nextDimensions))
          : candidate
      )),
      true,
    );
  };

  const persistFurniture = (room: RoomLayout) => {
    setLayoutError("");
    settleLatestManagedFurniturePersistence(
      persistManagedFurnitureSnapshot(room),
      persistenceUiRevisionRef,
      () => setLayoutError(""),
      () => setLayoutError(MANAGED_FURNITURE_SAVE_ERROR),
    );
  };

  const removeFurniture = (id: string) => {
    saveFurniture(latestRoomRef.current.furniture.map((item) => (
      item.id === id ? { ...item, status: "deleted" } : item
    )), true);
    setSelectedFurnitureId((current) => (current === id ? null : current));
  };

  const moveFurniture = (id: string, position: Vector2D) => {
    saveFurniture(latestRoomRef.current.furniture.map((item) => (
      item.id === id
        ? markUserModified(moveFurnitureInsideRoom(selectedRoom, item, position))
        : item
    )), false);
  };

  const persistMovedFurniture = () => {
    persistFurniture(latestRoomRef.current);
  };

  const resetFurniture = () => {
    saveFurniture(cloneFurniture(originalFurnitureRef.current), true);
    setSelectedFurnitureId(null);
  };

  const rotateFurniture = (id: string) => {
    saveFurniture(
      latestRoomRef.current.furniture.map((item) => (
        item.id === id
          ? markUserModified(rotateFurnitureInsideRoom(selectedRoom, item, item.rotationY + Math.PI / 2))
          : item
      )),
      true,
    );
  };

  // /rooms' cards otherwise only have the iOS app's scan-time snapshot to
  // show (a flat, textureless RoomPlan mesh capture — see api/rooms.ts's
  // thumbnailBase64) — this actually-furnished, colored 3D view is a much
  // better thumbnail. The short delay gives the now-hidden walls a couple of
  // render frames to actually disappear before the frame is captured,
  // instead of grabbing the outgoing walls-visible one.
  const captureInteriorThumbnail = () => {
    window.setTimeout(() => {
      const container = viewerContainerRef.current;
      const dataUrl = container && captureCanvasThumbnail(container);

      if (dataUrl) {
        saveRoomThumbnail(selectedRoom.id, dataUrl);
      }
    }, 300);
  };

  const handleToggleInteriorView = (checked: boolean) => {
    setHideEntranceWalls(checked);

    if (checked) {
      captureInteriorThumbnail();
    }
  };

  // Relying on the user remembering to manually flip "내부 보기" made this
  // easy to skip entirely — a room could go all the way to /layout-confirm
  // still showing no real thumbnail on /rooms. Capturing once, right when
  // this room is first opened here (hideEntranceWalls already starts true —
  // see its useState above), means every room gets a real thumbnail before
  // confirming even happens, not just the ones someone happened to click the
  // checkbox for.
  useEffect(() => {
    captureInteriorThumbnail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-[calc(100vh-76px)] bg-[#fbfbfb] text-[#141414]">
      <div
        className="grid min-h-[calc(100vh-76px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_10px_var(--furniture-panel-width)]"
        style={{ "--furniture-panel-width": `${panelWidth}px` } as React.CSSProperties}
      >
        <section className="relative flex min-h-140 flex-col px-6 py-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="ml-2 text-2xl font-extrabold">{selectedRoomMeta.title}</h1>
              <span className="rounded-full bg-[#eeeeee] px-3 py-1 text-xs font-bold text-[#777777]">{selectedRoomMeta.type}</span>
              <span className="rounded-full bg-[#eeeeee] px-3 py-1 text-xs font-bold text-[#777777]">{selectedRoomMeta.size}</span>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#dfdfdf] bg-white px-3 py-2 text-sm font-extrabold text-[#333333] transition-colors hover:bg-[#f6f6f6]">
              <input
                type="checkbox"
                checked={hideEntranceWalls}
                onChange={(event) => handleToggleInteriorView(event.target.checked)}
                className="h-4 w-4 accent-[#111111]"
              />
              내부 보기
            </label>
          </div>

          <RoomDimensionCorrectionPanel
            room={selectedRoom}
            onAdjust={adjustRoomDimension}
          />

          {layoutError && (
            <p role="alert" className="mb-4 rounded-lg bg-[#fff1f1] px-4 py-3 text-sm font-bold text-[#b42318]">
              {layoutError}
            </p>
          )}

          <div className="manage-room flex-1" ref={viewerContainerRef}>
            <RoomViewer
              room={selectedRoom}
              furniture={visibleFurniture}
              selectedFurnitureId={selectedFurnitureId}
              onSelectFurniture={setSelectedFurnitureId}
              onMoveFurniture={moveFurniture}
              onEndMoveFurniture={persistMovedFurniture}
              hideEntranceWalls={hideEntranceWalls}
              alignCameraToEntrance
              showEditingHelpers
              preferredColorTone={preferredColorTone}
            />
          </div>

          <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[#e8e8e8] bg-white px-4 py-3 shadow-[0_10px_25px_rgba(0,0,0,0.08)]">
            <ToolButton label="선택" icon={<span className="text-lg">↖</span>} />
            <ToolButton
              label="90° 회전"
              icon={<span className="text-[11px] font-extrabold leading-none">90°</span>}
              onClick={selectedFurnitureId ? () => rotateFurniture(selectedFurnitureId) : undefined}
            />
            <ToolButton label="초기화" icon={<FiRotateCcw />} onClick={resetFurniture} />
            <ToolButton label="중앙 보기" icon={<span className="text-lg">⊙</span>} />
            <ToolButton label="확대" icon={<FiZoomIn />} />
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="가구 패널 크기 조절"
          onPointerDown={() => setIsResizing(true)}
          className="hidden cursor-col-resize border-l border-[#eeeeee] bg-[#fbfbfb] transition-colors hover:bg-[#eeeeee] lg:block"
        />

        <aside className="border-t border-[#eeeeee] bg-[#fbfbfb] p-5 lg:border-l-0 lg:border-t-0">
          <FurnitureStatusPanel
            items={visibleFurniture}
            selectedFurnitureId={selectedFurnitureId}
            onSelect={setSelectedFurnitureId}
            onRemove={removeFurniture}
            onResize={resizeFurniture}
          />
        </aside>
      </div>
    </main>
  );
}

export function FurnitureStatusPanel({
  items,
  selectedFurnitureId,
  onSelect,
  onRemove,
  onResize,
}: {
  items: Furniture[];
  selectedFurnitureId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onResize?: (id: string, axis: "width" | "depth", delta: number) => void;
}) {
  return (
    <div className="rounded-xl border border-[#e8e8e8] bg-white p-4">
      <h2 className="mb-5 text-base font-extrabold">가구 현황</h2>
      <p className="mb-4 text-xs font-semibold leading-5 text-[#888888]">
        스캔 오차가 있다면 여기서 한 번에 보정하세요. 가로/세로는 스캔값의 ±15% 안에서만 조정할 수 있어요.
      </p>
      <div className="max-h-[calc(100vh-320px)] space-y-4 overflow-y-auto pr-1">
        {items.map((item) => (
          <FurnitureRow
            key={item.id}
            item={item}
            selected={selectedFurnitureId === item.id}
            onSelect={() => onSelect(item.id)}
            onRemove={() => onRemove(item.id)}
            onResize={onResize ? (axis, delta) => onResize(item.id, axis, delta) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function FurnitureRow({
  item,
  selected,
  onSelect,
  onRemove,
  onResize,
}: {
  item: Furniture;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onResize?: (axis: "width" | "depth", delta: number) => void;
}) {
  // Scanned/existing furniture never carries a variantId (that's a catalog/
  // product concept) — this only ever hides the stepper in the rare case an
  // item does resolve to one, as a safety net, not something the common case
  // should need.
  const canResize = Boolean(onResize) && !resolveFurnitureVariant(item.variantId);

  return (
    <div className={`rounded-lg border p-2 transition-colors ${selected ? "border-[#111111] bg-[#fafafa]" : "border-transparent"}`}>
      <div className="flex items-center gap-3">
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0">
          <strong className="block truncate text-sm font-extrabold">{item.name.replace("기존 ", "")}</strong>
          <span className="mt-1 block truncate text-xs font-medium text-[#666666]">{formatDimensionMm(item.dimensions)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${item.name} 삭제`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#888888] hover:bg-[#f1f1f1] hover:text-[#111111]"
      >
        <FiTrash2 className="h-4 w-4" />
      </button>
      </div>

      {canResize && (
        <div className="mt-2 flex flex-wrap gap-2 pl-15">
          <DimensionStepper
            label="가로"
            value={item.dimensions.width}
            onDecrease={() => onResize?.("width", -DIMENSION_STEP_METERS)}
            onIncrease={() => onResize?.("width", DIMENSION_STEP_METERS)}
          />
          <DimensionStepper
            label="세로"
            value={item.dimensions.depth}
            onDecrease={() => onResize?.("depth", -DIMENSION_STEP_METERS)}
            onIncrease={() => onResize?.("depth", DIMENSION_STEP_METERS)}
          />
        </div>
      )}
    </div>
  );
}

function DimensionStepper({
  label,
  value,
  disabled,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex min-h-9 items-center gap-1 rounded-lg border border-[#e2e2e2] bg-white px-2 py-1 text-xs font-extrabold text-[#222222]">
      <span className="text-[#777777]">{label}</span>
      <button
        type="button"
        aria-label={`${label} 줄이기`}
        onClick={onDecrease}
        disabled={disabled}
        className="grid h-6 w-6 place-items-center rounded-md hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FiMinus aria-hidden="true" />
      </button>
      <span className="w-14 text-center tabular-nums">{Math.round(value * 1000)}mm</span>
      <button
        type="button"
        aria-label={`${label} 늘리기`}
        onClick={onIncrease}
        disabled={disabled}
        className="grid h-6 w-6 place-items-center rounded-md hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FiPlus aria-hidden="true" />
      </button>
    </div>
  );
}

function RoomDimensionCorrectionPanel({
  room,
  onAdjust,
}: {
  room: RoomLayout;
  onAdjust: (axis: "width" | "depth" | "height", delta: number) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#e8e8e8] bg-white px-4 py-3">
      <span className="text-xs font-bold text-[#777777]">방 크기 보정</span>
      <DimensionStepper
        label="가로"
        value={room.width}
        onDecrease={() => onAdjust("width", -DIMENSION_STEP_METERS)}
        onIncrease={() => onAdjust("width", DIMENSION_STEP_METERS)}
      />
      <DimensionStepper
        label="세로"
        value={room.depth}
        onDecrease={() => onAdjust("depth", -DIMENSION_STEP_METERS)}
        onIncrease={() => onAdjust("depth", DIMENSION_STEP_METERS)}
      />
      <DimensionStepper
        label="높이"
        value={room.height ?? 2.4}
        onDecrease={() => onAdjust("height", -DIMENSION_STEP_METERS)}
        onIncrease={() => onAdjust("height", DIMENSION_STEP_METERS)}
      />
      <span className="text-xs font-semibold text-[#999999]">스캔값의 ±15% 안에서만 조정할 수 있어요.</span>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={!onClick}
      className="grid h-8 w-8 place-items-center rounded-full text-[#222222] hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
    </button>
  );
}

function getSelectedRoom(): RoomLayout {
  // The live mirror (see confirmedLayouts.ts's getLiveMirrorForSelectedRoom)
  // reflects every edit made in /editor this session, including a just-
  // confirmed final result — id-matched against roomfit:selectedRoomId, and
  // cleared by Rooms.tsx's selectRoom every time a room is freshly (re)
  // selected from /rooms. So this only ever resurrects something within the
  // *same* room session (fixing /manage-furniture appearing to "reset" after
  // confirming and coming back without reselecting the room) — it can never
  // leak a stale scenario into a fresh retest, since picking the room again
  // from /rooms always clears it first.
  //
  // Deliberately NOT the *permanent* confirmedLayouts store here — that one
  // persists forever per room id, so preferring it would carry an old
  // scenario's furniture (different ids, already restyled/rearranged) into
  // what's supposed to be a fresh run. `applyScenario`/`applyNaturalWoodRestRoom`
  // look for the room's *original* furniture ids (e.g. "bed-1") to restyle —
  // if those were already replaced by a previous scenario's own generated
  // furniture, the new scenario silently finds nothing to transform, and
  // every retry (e.g. testing rest-natural-wood, then re-testing the same
  // room as work-modern-gray) ends up looking identical to whatever was
  // confirmed first instead of actually re-applying the newly selected mood.
  const liveMirror = getLiveMirrorForSelectedRoom();
  if (liveMirror) {
    return liveMirror;
  }

  const selectedRoomLayout = localStorage.getItem("roomfit:selectedRoomLayout");
  if (selectedRoomLayout) {
    try {
      return JSON.parse(selectedRoomLayout) as RoomLayout;
    } catch {
      localStorage.removeItem("roomfit:selectedRoomLayout");
    }
  }

  const selectedRoomId = localStorage.getItem("roomfit:selectedRoomId");
  return sampleRoomLayouts.find((room) => room.id === selectedRoomId) ?? sampleRoom;
}

function getSelectedRoomMeta(room: RoomLayout) {
  return {
    title: localStorage.getItem("roomfit:selectedRoomTitle") ?? room.name,
    type: localStorage.getItem("roomfit:selectedRoomType") ?? "원룸",
    size: localStorage.getItem("roomfit:selectedRoomSize") ?? `${Math.round(room.width * room.depth)}㎡`,
  };
}

function cloneFurniture(items: Furniture[]): Furniture[] {
  return items.map((item) => ({ ...item, position: { ...item.position }, dimensions: { ...item.dimensions } }));
}

function markUserModified(item: Furniture): Furniture {
  return item.status === "deleted" ? item : { ...item, status: "user_modified" };
}
