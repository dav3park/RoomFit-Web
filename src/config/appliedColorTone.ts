import type { RoomLayout } from "../types";
import {
  normalizePreferredColorToneId,
  readPreferredColorTone,
  type PreferredColorToneId,
} from "./preferredColorTone";
import { getRoomPreferredColorTone } from "./roomPreferences";
import { getAutomaticColorScheme, type AutomaticColorSchemeId } from './automaticColorSchemes';

type PaletteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type PaletteAwareRoomLayout = RoomLayout & {
  appliedPreferredColorTone?: unknown;
};

export function getLayoutAppliedPreferredColorTone(
  layout: RoomLayout,
): PreferredColorToneId | null {
  return normalizePreferredColorToneId(
    (layout as PaletteAwareRoomLayout).appliedPreferredColorTone,
  );
}

export function withAppliedPreferredColorTone(
  layout: RoomLayout,
  preferredColorTone: unknown,
): RoomLayout {
  const normalized = normalizePreferredColorToneId(preferredColorTone);
  const nextLayout: PaletteAwareRoomLayout = { ...layout };
  delete nextLayout.appliedColorSchemeId;

  if (normalized) {
    nextLayout.appliedPreferredColorTone = normalized;
  } else {
    delete nextLayout.appliedPreferredColorTone;
  }

  return nextLayout;
}

export function getLayoutAppliedColorScheme(layout: RoomLayout): AutomaticColorSchemeId | null {
  return getAutomaticColorScheme(layout.appliedColorSchemeId)?.id??null;
}

export function withAppliedColorScheme(layout: RoomLayout, scheme: AutomaticColorSchemeId): RoomLayout {
  return {...withAppliedPreferredColorTone(layout,null),appliedColorSchemeId:scheme};
}

export function resolveRoomLayoutPreferredColorTone(
  layout: RoomLayout,
  storage: PaletteStorage = localStorage,
): PreferredColorToneId | null {
  return getLayoutAppliedPreferredColorTone(layout)
    ?? getRoomPreferredColorTone(layout.id, storage)
    ?? readPreferredColorTone(storage);
}
