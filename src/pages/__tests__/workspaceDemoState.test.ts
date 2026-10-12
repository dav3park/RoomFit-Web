import { describe, expect, it } from 'vitest';
import { addDemoProduct, copyDemoRoom, furnitureDimensionRangeMm, resizeDemoFurniture, createDemoRecommendation, DEMO_PRODUCTS, DEMO_ROOMS } from '../workspaceDemoState';

describe('isolated workspace demo', () => {
  it('adds catalog metadata without modifying the original room', () => {
    const original = copyDemoRoom(DEMO_ROOMS[0]);
    const snapshot = JSON.stringify(original);
    const next = addDemoProduct(original, DEMO_PRODUCTS[0]);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(next.furniture).toHaveLength(original.furniture.length + 1);
    expect(next.furniture.at(-1)?.variantId).toBe(DEMO_PRODUCTS[0].variantId);
  });
  it('retains original correction limits and variant scale after autosave/reload', () => {
    const room = copyDemoRoom(DEMO_ROOMS[0]);
    const product = DEMO_PRODUCTS.find(item => item.furnitureType === 'wardrobe')!;
    const item = addDemoProduct(room, product).furniture.at(-1)!;
    const resized = resizeDemoFurniture(room, item, product.dimensions, 'width', .05);
    const restored = JSON.parse(JSON.stringify(resized));
    const afterReload = resizeDemoFurniture(room, restored, restored.dimensions, 'width', 100);
    expect(afterReload.resizeBaseDimensions).toEqual(product.dimensions);
    expect(afterReload.dimensions.width).toBe(furnitureDimensionRangeMm(product.dimensions.width).max / 1000);
    expect(afterReload.demoVisualScale?.[0]).toBeCloseTo(afterReload.dimensions.width / product.dimensions.width);
    expect(resizeDemoFurniture(room, afterReload, afterReload.dimensions, 'width', -100).dimensions.width)
      .toBe(furnitureDimensionRangeMm(product.dimensions.width).min / 1000);
  });
  it('never creates zero or nonfinite dimensions, and uses whole millimeters', () => {
    const room = copyDemoRoom(DEMO_ROOMS[0]);
    const item = room.furniture[0];
    expect(resizeDemoFurniture(room, item, item.dimensions, 'width', NaN)).toBe(item);
    expect(resizeDemoFurniture(room, item, item.dimensions, 'depth', Infinity)).toBe(item);
    expect(resizeDemoFurniture(room, item, item.dimensions, 'width', -item.dimensions.width).dimensions.width).toBeGreaterThan(0);
    expect(furnitureDimensionRangeMm(.001)).toEqual({min: 1, max: 1});
    expect(furnitureDimensionRangeMm(.125)).toEqual({min: 107, max: 143});
  });
  it('previews only requested sample products while preserving manual edits', () => {
    const room = copyDemoRoom(DEMO_ROOMS[0]);
    const snapshot = JSON.stringify(room);
    const result = createDemoRecommendation(room, [DEMO_PRODUCTS[0].productId]);
    expect(result.furniture).toHaveLength(1);
    expect(result.furniture[0].status).toBe('recommended');
    expect(JSON.stringify(room)).toBe(snapshot);
    expect(createDemoRecommendation(room, ['unknown']).furniture).toEqual([]);
  });
});
