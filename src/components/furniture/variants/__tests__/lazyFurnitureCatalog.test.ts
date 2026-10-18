import { describe,it,expect,vi } from 'vitest';
import { retryProductionFurnitureVariant,loadProductionFurnitureVariant,getProductionFurnitureVariantState,getLoadedFurnitureVariant,productionFurnitureRegistry } from '../productionFurnitureCatalog';
describe('lazy furniture models',()=>{
 it('does not parse every model when the catalog module is imported',()=>{
  expect(getLoadedFurnitureVariant('desk-compact')).toBeNull();
  expect(productionFurnitureRegistry.hasFurnitureVariant('lamp-floor')).toBe(false);
 });
 it('shares an in-flight import and loads only the requested model',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch');
  const first=loadProductionFurnitureVariant('desk-compact');
  expect(loadProductionFurnitureVariant('desk-compact')).toBe(first);
  expect((await first).variantId).toBe('desk-compact');
  expect(getProductionFurnitureVariantState('desk-compact')).toBe('ready');
  expect(getLoadedFurnitureVariant('lamp-floor')).toBeNull();
  expect(fetch.mock.calls[0][1]?.cache).toBe('default');
  fetch.mockRestore();
 });
 it('rejects unknown models without silently supplying a different furniture model',async()=>{
  await expect(loadProductionFurnitureVariant('not-a-catalog-model')).rejects.toThrow();
 });
 it('retries a failed JSON request without needing a page reload',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new Error('temporary network failure'));
  await expect(loadProductionFurnitureVariant('expansion-c003')).rejects.toThrow('temporary network failure');
  expect(getProductionFurnitureVariantState('expansion-c003')).toBe('error');
  retryProductionFurnitureVariant('expansion-c003');
  expect((await loadProductionFurnitureVariant('expansion-c003')).variantId).toBe('expansion-c003');
  expect(fetch.mock.calls[1][1]?.cache).toBe('reload');
  expect(getProductionFurnitureVariantState('expansion-c003')).toBe('ready');
  fetch.mockRestore();
 });

});
