import type { AutomaticColorSchemeId } from './config/automaticColorSchemes';

export type FurnitureCategory =
  | "bed"
  | "desk"
  | "chair"
  | "cabinet"
  | "rug"
  | "lighting"
  | "unsupported";

export type FurnitureStatus = "existing" | "recommended" | "user_modified" | "deleted";
export type FurnitureGeometry = "box" | "rounded-box" | "cylinder" | "plane" | "model";
export type FurnitureMaterialType = "fabric" | "wood" | "white" | "metal" | "glass" | "accent";

export interface MaterialConfig {
  type: FurnitureMaterialType;
  color: string;
  roughness?: number;
  metalness?: number;
}

export interface Vector2D {
  x: number;
  z: number;
}

export interface Size3D {
  width: number;
  depth: number;
  height: number;
}

export interface Furniture {
  /** Local catalog variant scaling, persisted with workspace drafts. */
  demoVisualScale?: [number, number, number];
  /** Original size retained for local correction limits across autosave/reload. */
  resizeBaseDimensions?: Size3D;
  /** Kept unchanged by all recommendation modes. */
  recommendationLocked?: boolean;
  id: string;
  name: string;
  category: FurnitureCategory;
  sourceType?: string;
  productId?: string | null;
  variantId?: string | null;
  styleTags?: string[];
  dimensions: Size3D;
  position: Vector2D;
  rotationY: number;
  color: string;
  geometry?: FurnitureGeometry;
  model?: string;
  material: FurnitureMaterialType | MaterialConfig;
  status: FurnitureStatus;
  removable: boolean;
  mountHeight?: number;
  // Set by a demo scenario restyle (see config/scenarios.ts) for pieces that
  // have a frame/leg element rendered separately from `color`/`material`
  // (Bed/Table/Chair). Undefined means "기본" — the original hardcoded
  // frame/leg tone, independent of the piece's own (often near-white, scan-
  // derived) color — so an unstyled bed doesn't get an accidentally gray
  // frame just because its mattress fabric happens to be light.
  theme?: "gray" | "wood";
}

export interface WallSegment {
  id: string;
  start: Vector2D;
  end: Vector2D;
  height?: number;
  thickness?: number;
  material?: {
    color: string;
    roughness: number;
  };
}

export interface Opening {
  id: string;
  label: string;
  position: Vector2D;
  dimensions: Size3D;
  rotationY: number;
  /** Measured window bottom above the floor; absent in older browser drafts. */
  sillHeight?: number | null;
  // Which WallSegment.id this opening was snapped to (see snapToWall in
  // api/rooms.ts). When set, Wall.tsx trusts it instead of re-deriving the
  // match with its own distance threshold — two independent geometric checks
  // could pick different walls near corners, cutting the hole into the wrong
  // wall and leaving the door's real wall solid (looking like the door
  // overlaps the wall).
  wallId?: string;
  frame?: {
    color: string;
  };
  glass?: {
    transmission: number;
    opacity: number;
  };
  blind?: {
    enabled: boolean;
    // "curtain" is only ever set by a demo scenario restyle (see
    // config/scenarios.ts via Curtain.tsx) — the default/original rendering
    // always has "wood" and goes through Blind.tsx, untouched by scenarios.
    type: "wood" | "curtain";
    slats: number;
    color?: string;
  };
}

export interface RoomLayout {
  /** Resolved automatic palette; retained through preview, autosave and confirm. */
  appliedColorSchemeId?: AutomaticColorSchemeId;
  id: string;
  name: string;
  description?: string;
  width: number;
  depth: number;
  height?: number;
  unit?: string;
  source?: string;
  createdAt?: string;
  floor?: {
    size: {
      width: number;
      depth: number;
    };
    material: {
      color: string;
      roughness: number;
    };
  };
  camera?: {
    type: "orthographic";
    position: {
      x: number;
      y: number;
      z: number;
    };
    target: {
      x: number;
      y: number;
      z: number;
    };
    zoom: number;
  };
  lighting?: {
    ambient: number;
    sun: {
      intensity: number;
      position: [number, number, number];
    };
    environment: string;
  };
  walls: WallSegment[];
  doors: Opening[];
  windows: Opening[];
  furniture: Furniture[];
}

export interface UserPreference {
  purpose: "study" | "rest" | "balanced";
  style: "minimal-white" | "warm-natural" | "compact-modern";
  requiredItems: FurnitureCategory[];
  inspirationImageIds: string[];
}

export interface InspirationImage {
  id: string;
  title: string;
  tags: string[];
  palette: string;
}

export type ValidationSeverity = "pass" | "warning";

export interface ValidationResult {
  id: string;
  label: string;
  severity: ValidationSeverity;
  message: string;
}

export interface AgentContext {
  room: RoomLayout;
  preference: UserPreference;
  selectedInspirations: InspirationImage[];
}
