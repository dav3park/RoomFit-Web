// A hard cap on simultaneous catalog-card WebGL previews, on top of
// FurnitureCatalogCard's IntersectionObserver gating. The observer alone
// still lets a very tall/large viewport show more cards "in view" than a
// browser's WebGL context budget allows (Chrome's default is 16) — and the
// main room viewport's own canvas must always win that budget over catalog
// thumbnails. This is a tiny external store (not React state) so unrelated
// sibling cards can claim/release a slot without a shared parent re-render.
const MAX_CONCURRENT_LIVE_PREVIEWS = 6;

const activeIds = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called whenever a slot frees up, so a waiting card can retry claiming one. */
export function subscribeLivePreviewSlots(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasLivePreviewSlot(id: string): boolean {
  return activeIds.has(id);
}

export function tryClaimLivePreviewSlot(id: string): boolean {
  if (activeIds.has(id)) return true;
  if (activeIds.size >= MAX_CONCURRENT_LIVE_PREVIEWS) return false;
  activeIds.add(id);
  notify();
  return true;
}

export function releaseLivePreviewSlot(id: string): void {
  if (activeIds.delete(id)) notify();
}
