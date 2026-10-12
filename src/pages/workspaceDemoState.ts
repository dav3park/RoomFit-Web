import catalog from '../data/furniture/catalog.json';
import { sampleRoom } from '../mock/sampleRoom';
import { sampleRoomLayouts } from '../mock/interiorPlacementMock';
import { findFreePlacement } from '../geometry/placement';
import { resizeFurnitureInsideRoom } from '../components/room/furnitureBoundary';
import type { Furniture, RoomLayout, Size3D } from '../types';

export const DEMO_ROOMS = [...sampleRoomLayouts, sampleRoom];
export type DemoProduct = (typeof catalog.products)[number];
export const DEMO_PRODUCTS = catalog.products;

export function copyDemoRoom(room: RoomLayout): RoomLayout {
  return structuredClone(room);
}

export function addDemoProduct(room: RoomLayout, product: DemoProduct): RoomLayout {
  const category: Furniture['category'] = product.furnitureType === 'bed' || product.furnitureType === 'sofa_bed' ? 'bed'
    : ['desk', 'multi_table', 'side_table'].includes(product.furnitureType) ? 'desk'
    : ['desk_chair', 'sofa'].includes(product.furnitureType) ? 'chair'
    : product.furnitureType === 'rug' ? 'rug' : product.furnitureType === 'mood_lamp' ? 'lighting' : 'cabinet';
  const item: Furniture = {
    id: `demo-${product.productId}-${crypto.randomUUID()}`, name: product.label, category,
    sourceType: product.furnitureType, productId: product.productId, variantId: product.variantId,
    styleTags: product.styleTags, dimensions: { ...product.dimensions },
    position: findFreePlacement(room, product.dimensions, product.variantId, room.furniture),
    rotationY: 0, color: '#c7b299', material: 'wood', status: 'user_modified', removable: true,
  };
  return { ...room, furniture: [...room.furniture, item] };
}

export function readDemoDraft(): RoomLayout | null {
  try {
    const raw = localStorage.getItem('roomfit:workspaceDemoDraft');
    const room = raw ? JSON.parse(raw) as RoomLayout : null;
    return room && Array.isArray(room.furniture) && Array.isArray(room.walls) && DEMO_ROOMS.some(sample => sample.id === room.id) ? room : null;
  } catch { return null; }
}

export function furnitureDimensionRangeMm(base: number) {
  const min = Math.max(1, Math.ceil(base * 850 - 1e-7));
  return { min, max: Math.max(min, Math.floor(base * 1150 + 1e-7)) };
}

// shortcut: this is a local sample composition, replace with the recommendation contract only when real integration is authorized.
export function createDemoRecommendation(room: RoomLayout, productIds: readonly string[]): RoomLayout {
  let candidate = { ...copyDemoRoom(room), furniture: [] as Furniture[] };
  for (const id of productIds) {
    const product = DEMO_PRODUCTS.find(item => item.productId === id);
    if (product) candidate = addDemoProduct(candidate, product);
  }
  return { ...candidate, furniture: candidate.furniture.map(item => ({ ...item, status: 'recommended' })) };
}

// Local-only resizing; keep rendered variants and validation footprints in the same scale.
export function resizeDemoFurniture(room: RoomLayout, item: Furniture, base: Size3D, axis: 'width'|'depth', delta: number): Furniture {
  if (!Number.isFinite(delta)) return item;
  const original = item.resizeBaseDimensions ?? base;
  const { min, max } = furnitureDimensionRangeMm(original[axis]);
  const dimensions={...item.dimensions,[axis]:Math.min(max,Math.max(min,Math.round((item.dimensions[axis]+delta)*1000)))/1000};
  const scaled={...item,dimensions,resizeBaseDimensions:{...original},demoVisualScale:item.variantId ? [dimensions.width/original.width,1,dimensions.depth/original.depth] as [number,number,number] : undefined};
  return resizeFurnitureInsideRoom(room,scaled,dimensions);
}
