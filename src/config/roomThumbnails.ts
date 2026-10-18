// Locally-captured room thumbnails, keyed by room layout id — persisted the
// same way as confirmedLayouts.ts (there's no backend endpoint to upload a
// web-captured screenshot back onto a room; see api/rooms.ts's
// thumbnailBase64, which only ever comes from the iOS app's own scan-time
// snapshot). Captured from /manage-furniture's 3D view (see
// ManageFurniture.tsx) since that actually shows the room's real furniture
// with color/materials, unlike the iOS snapshot which is a flat, textureless
// RoomPlan mesh capture.
import { getActiveRequestClientId } from "./clientScope";

const ROOM_THUMBNAILS_KEY = "roomfit:roomThumbnailsByLayoutId";

function readAll(): Record<string, string> {
  const raw = localStorage.getItem(ROOM_THUMBNAILS_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveRoomThumbnail(roomLayoutId: string, dataUrl: string): void {
  const all = readAll();
  all[toScopedThumbnailKey(roomLayoutId, readActiveOwner())] = dataUrl;
  localStorage.setItem(ROOM_THUMBNAILS_KEY, JSON.stringify(all));
}

export function getRoomThumbnail(
  roomLayoutId: string,
  ownerKey?: string | null,
): string | undefined {
  const all = readAll();
  if (ownerKey !== undefined) return all[toScopedThumbnailKey(roomLayoutId, ownerKey)];
  return all[toScopedThumbnailKey(roomLayoutId, readActiveOwner())] ?? all[roomLayoutId];
}

function toScopedThumbnailKey(roomLayoutId: string, ownerKey: string | null): string {
  return `${ownerKey ?? "LEGACY"}:${roomLayoutId}`;
}

function readActiveOwner(): string | null {
  try {
    return getActiveRequestClientId();
  } catch {
    return null;
  }
}

// Downscales whatever <canvas> is inside `container` to a list-thumbnail-
// sized JPEG data URL. Downscaling (rather than storing the full, often
// device-pixel-ratio-doubled, canvas resolution) keeps this well under
// localStorage's per-origin quota even across a handful of rooms.
export function captureCanvasThumbnail(
  container: HTMLElement,
  maxWidth = 480,
  maxHeight = 360,
  quality = 0.82,
): string | null {
  const canvas = container.querySelector("canvas");

  if (!canvas) {
    return null;
  }

  // The room-viewer's <Canvas> has no explicit scene background, so
  // anything outside the isometric room shape is transparent, not white —
  // an isometric room only fills part of its rectangular canvas, leaving
  // sizeable transparent margins. Read those pixels back to find the
  // rendered room's actual bounding box so the crop below can fill the
  // thumbnail with the room itself instead of mostly empty margin.
  const probe = document.createElement("canvas");
  probe.width = canvas.width;
  probe.height = canvas.height;
  const probeCtx = probe.getContext("2d");

  let cropX = 0;
  let cropY = 0;
  let cropWidth = canvas.width;
  let cropHeight = canvas.height;

  if (probeCtx) {
    probeCtx.drawImage(canvas, 0, 0);
    const { data } = probeCtx.getImageData(0, 0, canvas.width, canvas.height);
    const alphaThreshold = 10;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;

    // Every-other-pixel sampling is plenty precise for a bounding box and
    // keeps this fast — it only runs once, right when "벽 투명하게" is toggled on.
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        if (data[(y * canvas.width + x) * 4 + 3] > alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX > minX && maxY > minY) {
      // A little breathing room around the tight crop so furniture isn't
      // sitting flush against the thumbnail's edge.
      const padX = (maxX - minX) * 0.08;
      const padY = (maxY - minY) * 0.08;
      cropX = Math.max(0, minX - padX);
      cropY = Math.max(0, minY - padY);
      cropWidth = Math.min(canvas.width - cropX, maxX - minX + padX * 2);
      cropHeight = Math.min(canvas.height - cropY, maxY - minY + padY * 2);
    }
  }

  const scale = Math.min(maxWidth / cropWidth, maxHeight / cropHeight);
  const outputWidth = Math.round(cropWidth * scale);
  const outputHeight = Math.round(cropHeight * scale);

  const offscreen = document.createElement("canvas");
  offscreen.width = outputWidth;
  offscreen.height = outputHeight;

  const ctx = offscreen.getContext("2d");

  if (!ctx) {
    return null;
  }

  // JPEG has no alpha channel — without an explicit fill first, browsers
  // flatten the canvas's transparent margin to solid black instead of
  // leaving it a clean white background.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outputWidth, outputHeight);
  ctx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);

  return offscreen.toDataURL("image/jpeg", quality);
}
