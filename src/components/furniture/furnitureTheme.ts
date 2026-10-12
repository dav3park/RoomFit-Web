import { getFurnitureThemePalette, type ThemePalette } from '../../config/furnitureBehaviorPolicy';
import type { Furniture } from '../../types';

export interface FurnitureRenderProps { item: Furniture; colors?: ThemePalette }
export function furnitureThemeColors(tone: unknown, furnitureType?: string): ThemePalette | undefined {
  return getFurnitureThemePalette(tone,furnitureType);
}
