import { describe, expect, it } from 'vitest';
import { addDemoProduct, copyDemoRoom, correctDemoRoom, createDemoRecommendation, DEMO_PRODUCTS, DEMO_ROOMS } from '../workspaceDemoState';

describe('isolated workspace demo', () => {
  it('adds catalog metadata without modifying the original room', () => {
    const original = copyDemoRoom(DEMO_ROOMS[0]);
    const snapshot = JSON.stringify(original);
    const next = addDemoProduct(original, DEMO_PRODUCTS[0]);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(next.furniture).toHaveLength(original.furniture.length + 1);
    expect(next.furniture.at(-1)?.variantId).toBe(DEMO_PRODUCTS[0].variantId);
  });
  it('bounds scan correction to 15 percent and rescales walls', () => {
    const room = copyDemoRoom(DEMO_ROOMS[0]);
    const next = correctDemoRoom(room, room, 'width', 100);
    expect(next.width).toBeCloseTo(room.width * 1.15);
    expect(next.walls[0].start.x).toBeCloseTo(room.walls[0].start.x * 1.15);
    expect(correctDemoRoom(room, room, 'depth', -100).depth).toBeCloseTo(room.depth * .85);
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
