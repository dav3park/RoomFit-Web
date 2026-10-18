import { normalizePreferredColorToneId, type PreferredColorToneId } from "./preferredColorTone";
import { automaticFurniturePalette, getAutomaticColorScheme, type AutomaticColorSchemeId } from './automaticColorSchemes';
import { FURNITURE_THEME_TARGETS } from "./furnitureThemeTargets";

export type ThemeColorSlot = "primary" | "secondary" | "accent" | "neutral" | "wood" | "emissive" | "preserve";
export type FurnitureCollisionMode = "SOLID" | "FLOOR_OVERLAY";
export type FurnitureAnchorMode = "FREE" | "WINDOW";

export interface ThemePalette {
  primary: readonly string[];
  secondary: readonly string[];
  accent: readonly string[];
  neutral: readonly string[];
  wood: readonly string[];
  emissive: readonly string[];
}
export type FurnitureColorThemeId = PreferredColorToneId | AutomaticColorSchemeId;

export interface ThemeTarget {
  slot: ThemeColorSlot;
  /** A stable palette entry; omitted entries use a stable part-name hash. */
  index?: number;
}

export interface FurnitureBehaviorPolicy {
  variantId: string;
  targets?: Readonly<Record<string, ThemeTarget>>;
  exclusiveWith?: { canonicalTypes?: readonly string[]; variantIds?: readonly string[] };
  collisionMode?: FurnitureCollisionMode;
  anchorMode?: FurnitureAnchorMode;
}

// Palette entries deliberately have close value/chroma so a room feels coherent
// while still allowing the fabric parts to read as separate materials.
export const THEME_PALETTES: Readonly<Record<PreferredColorToneId, ThemePalette>> = {
  ivory: {
    primary: ["#F3EEE4", "#E9E1D5"], secondary: ["#D9CCBB", "#C9C5BD"],
    accent: ["#4B4B4A", "#817A70"], neutral: ["#F7F5F0", "#D5D2CC"],
    wood: ["#B08A64", "#826247"], emissive: ["#FFE4A8"],
  },
  beige: {
    primary: ["#D8C5A7", "#CDB18A"], secondary: ["#E9DCC7", "#B99C78"],
    accent: ["#70533D", "#9B7250"], neutral: ["#F1E8DB", "#C8B8A5"],
    wood: ["#A9784D", "#70492F"], emissive: ["#FFD9A0"],
  },
  gray: {
    primary: ["#B9B8B3", "#9FA3A2"], secondary: ["#D1CFCA", "#7E8586"],
    accent: ["#454A4C", "#687176"], neutral: ["#EEEDE9", "#BFC0BC"],
    wood: ["#8A7867", "#5E544C"], emissive: ["#F5D9A7"],
  },
  brown: {
    primary: ["#9B7253", "#B58A5D"], secondary: ["#D2B98D", "#E5D6C2"],
    accent: ["#573D2D", "#704B34"], neutral: ["#EDE2D2", "#B9A896"],
    wood: ["#8A5A36", "#4D3427"], emissive: ["#FFE0A3"],
  },
  green: {
    primary: ["#83977B", "#657A63"], secondary: ["#A8AD7E", "#76928E"],
    accent: ["#3E5540", "#59643A"], neutral: ["#E6DDCB", "#C9C3AE"],
    wood: ["#805E3E", "#4C392D"], emissive: ["#F8DCA1"],
  },
  blue: {
    primary: ["#4E6382", "#7089A0"], secondary: ["#9DB4C3", "#687C96"],
    accent: ["#28394F", "#465563"], neutral: ["#EEE9DF", "#C4C7C8"],
    wood: ["#805E43", "#4A3B34"], emissive: ["#FFE1AA"],
  },
  pink: {
    primary: ["#C98F9A", "#D9A9AF"], secondary: ["#E6C1B9", "#B57B83"],
    accent: ["#8A5962", "#A85F57"], neutral: ["#F0E3DD", "#CDBDB8"],
    wood: ["#91674B", "#533E31"], emissive: ["#FFDAAB"],
  },
  black: {
    primary: ["#36383A", "#4A4744"], secondary: ["#74706B", "#96918B"],
    accent: ["#17191C", "#5C4638"], neutral: ["#DDD8D0", "#AAA7A1"],
    wood: ["#684B36", "#382D29"], emissive: ["#F4D49A"],
  },
};

const behaviorOverrides: Readonly<Record<string, Omit<FurnitureBehaviorPolicy, "variantId" | "targets">>> = {
  "bed-loft-desk": {exclusiveWith: {canonicalTypes: ["desk"]}},
  "rug-rectangular": {collisionMode: "FLOOR_OVERLAY"},
  "rug-round": {collisionMode: "FLOOR_OVERLAY"},
  "rug-runner": {collisionMode: "FLOOR_OVERLAY"},
  "rug-geometric": {collisionMode: "FLOOR_OVERLAY"},
  "blind-roller": {anchorMode: "WINDOW"},
  "blind-wood": {anchorMode: "WINDOW"},
  "curtain-blackout": {anchorMode: "WINDOW"},
  "curtain-fabric": {anchorMode: "WINDOW"},
};
export const FURNITURE_BEHAVIOR_POLICIES: Readonly<Record<string, FurnitureBehaviorPolicy>> = Object.fromEntries(
  Object.entries(FURNITURE_THEME_TARGETS).map(([variantId, targets]) => [variantId, {variantId, targets, ...behaviorOverrides[variantId]}]),
);

export function getFurnitureBehaviorPolicy(variantId: string | null | undefined): FurnitureBehaviorPolicy | null {
  return variantId ? FURNITURE_BEHAVIOR_POLICIES[variantId] ?? null : null;
}

export function getThemeTarget(variantId: string, partId: string): ThemeTarget | null {
  return getFurnitureBehaviorPolicy(variantId)?.targets?.[partId] ?? null;
}

export function getThemeColor(
  tone: FurnitureColorThemeId,
  target: ThemeTarget,
  stableKey: string,
  furnitureType?: string,
): string | null {
  if (target.slot === "preserve") return null;
  const palette = getFurnitureThemePalette(tone,furnitureType);
  if (!palette) return null;
  const colors = target.slot === "emissive"
    ? palette.emissive
    : palette[target.slot];
  if (!colors?.length) return null;
  const index = target.index ?? stableIndex(stableKey, colors.length);
  return colors[index % colors.length];
}

export function getFurnitureThemePalette(tone: unknown, furnitureType?: string): ThemePalette | undefined {
  const scheme=getAutomaticColorScheme(tone);
  if(scheme) return automaticFurniturePalette(scheme.id,furnitureType);
  const normalized=normalizePreferredColorToneId(tone);
  return normalized?THEME_PALETTES[normalized]:undefined;
}

export function resolveFurnitureCollisionMode(variantId: string | null | undefined, category?: string): FurnitureCollisionMode {
  return getFurnitureBehaviorPolicy(variantId)?.collisionMode ?? (category === "rug" ? "FLOOR_OVERLAY" : "SOLID");
}

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}
