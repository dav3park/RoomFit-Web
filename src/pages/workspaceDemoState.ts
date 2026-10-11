import catalog from '../data/furniture/catalog.json';
import { sampleRoom } from '../mock/sampleRoom';
import { sampleRoomLayouts } from '../mock/interiorPlacementMock';
import { findFreePlacement } from '../geometry/placement';
import { resizeFurnitureInsideRoom, resizeRoomInsideBounds } from '../components/room/furnitureBoundary';
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

export function correctDemoRoom(room: RoomLayout, baseline: RoomLayout, axis: 'width' | 'depth' | 'height', delta: number): RoomLayout {
  const original = baseline[axis] ?? 2.4;
  const value = Math.min(original * 1.15, Math.max(original * .85, (room[axis] ?? 2.4) + delta));
  return resizeRoomInsideBounds(room, { [axis]: value });
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
  const dimensions={...item.dimensions,[axis]:Math.min(base[axis]*1.15,Math.max(base[axis]*.85,item.dimensions[axis]+delta))};
  const scaled={...item,dimensions,demoVisualScale:item.variantId ? [dimensions.width/base.width,1,dimensions.depth/base.depth] as [number,number,number] : undefined};
  return resizeFurnitureInsideRoom(room,scaled,dimensions);
}
