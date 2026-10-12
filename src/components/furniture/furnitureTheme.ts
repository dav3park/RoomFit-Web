import { THEME_PALETTES, type ThemePalette } from '../../config/furnitureBehaviorPolicy';
import { normalizePreferredColorToneId } from '../../config/preferredColorTone';
import type { Furniture } from '../../types';

export interface FurnitureRenderProps { item: Furniture; colors?: ThemePalette }
export function furnitureThemeColors(tone: unknown): ThemePalette | undefined {
  const normalized = normalizePreferredColorToneId(tone);
  return normalized ? THEME_PALETTES[normalized] : undefined;
}
