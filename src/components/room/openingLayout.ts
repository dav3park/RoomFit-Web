// Shared frame-overhang margins: the door/window frame is drawn slightly
// larger than the raw opening (so it reads as a proper casing, not just a
// hole), and Wall.tsx must cut the *same* amount extra or the frame's edge
// overlaps the neighboring solid wall piece — two meshes occupying the same
// space causes z-fighting (flickering/"sparkly" seams).
export const DOOR_FRAME_MARGIN = { width: 0.05, height: 0.04 };
export const WINDOW_FRAME_MARGIN = { width: 0.12, height: 0.12 };

// Shared between Wall.tsx (cutting the hole) and Window.tsx (placing the mesh)
// so the two always agree on where a window sits vertically.
//
// Older drafts lack sill height. Retain their rendered height as a fallback;
// rendering and recommendation checks must use the same vertical placement.
export function windowCenterY(windowHeight: number, wallHeight: number, sillHeight?: number | null): number {
  const preferred = typeof sillHeight === 'number' && Number.isFinite(sillHeight) && sillHeight >= 0 ? sillHeight + windowHeight / 2 : 1.45;
  const margin = 0.05;
  const maxCenter = wallHeight - windowHeight / 2 - margin;
  const minCenter = windowHeight / 2 + margin;

  if (minCenter > maxCenter) {
    // Window taller than the wall can comfortably fit — center it instead of
    // producing an inverted/negative range.
    return wallHeight / 2;
  }

  return Math.min(Math.max(preferred, minCenter), maxCenter);
}
