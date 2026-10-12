import type { ThemeTarget, ThemeColorSlot } from "./furnitureBehaviorPolicy";

type Role = "primary0" | "primary1" | "secondary0" | "secondary1" | "accent0" | "accent1" | "neutral0" | "neutral1" | "wood0" | "wood1" | "preserve";

// Explicit part groups: paired panels share a finish; protected surfaces keep their material.
function roles(groups: Partial<Record<Role, readonly string[]>>): Readonly<Record<string, ThemeTarget>> {
  return Object.fromEntries(Object.entries(groups).flatMap(([role, ids]) => ids.map(id => [id, role === "preserve"
    ? {slot: "preserve"} : {slot: role.slice(0, -1) as ThemeColorSlot, index: Number(role.at(-1))}])));
}

export const FURNITURE_THEME_TARGETS: Readonly<Record<string, Readonly<Record<string, ThemeTarget>>>> = {
  "bed-classic-idanaes": roles({
    wood1: ["leg-left-head", "leg-right-head", "leg-left-foot", "leg-right-foot", "tuft-left-upper", "tuft-center-upper", "tuft-right-upper", "tuft-left-lower", "tuft-center-lower", "tuft-right-lower"],
    primary1: ["side-rail-left", "side-rail-right", "foot-rail", "pillow-left"],
    neutral0: ["mattress-support", "mattress"],
    primary0: ["headboard", "headboard-inner"],
    secondary0: ["pillow-right"],
  }),
  "bed-fabric-headboard": roles({
    primary1: ["upholstered-frame", "headboard-inset", "pillow-left"],
    neutral0: ["mattress"],
    primary0: ["fabric-headboard", "blanket"],
    secondary0: ["pillow-right"],
  }),
  "bed-loft-desk": roles({
    neutral0: ["post-left-back", "post-left-front", "post-right-back", "post-right-front", "upper-back-rail", "upper-front-rail", "upper-left-rail", "upper-right-rail", "mattress-support", "loft-mattress", "guard-back", "guard-front", "guard-front-left-support", "guard-front-right-support", "guard-back-left-support", "guard-back-right-support", "wardrobe-body", "desk-left-panel", "desk-right-panel", "desk-top", "desk-back-brace", "shelf-back", "shelf-lower", "shelf-upper"],
    secondary0: ["wardrobe-door"],
    preserve: ["wardrobe-handle", "ladder-left", "ladder-right", "ladder-rung-1", "ladder-rung-2", "ladder-rung-3", "ladder-rung-4"],
    primary1: ["loft-pillow"],
  }),
  "bed-low-platform": roles({
    wood0: ["lower-side-left", "lower-side-right", "lower-head", "lower-foot", "upper-side-left", "upper-side-right", "upper-head", "upper-foot"],
    neutral0: ["mattress-lower", "mattress-upper"],
    primary1: ["pillow"],
    accent0: ["runner"],
  }),
  "bed-midcentury-teal": roles({
    wood1: ["leg-left-head", "leg-right-head", "leg-left-foot", "leg-right-foot", "side-rail-left", "side-rail-right", "head-rail", "foot-rail"],
    neutral0: ["mattress-support", "mattress"],
    primary0: ["teal-headboard"],
    preserve: ["tuft-left-upper", "tuft-center-upper", "tuft-right-upper", "tuft-left-lower", "tuft-center-lower", "tuft-right-lower"],
    primary1: ["pillow-left"],
    secondary0: ["pillow-right"],
    accent0: ["teal-runner"],
  }),
  "bed-storage": roles({
    wood0: ["storage-base", "foot-panel"],
    neutral0: ["mattress"],
    primary0: ["head-panel"],
    secondary0: ["drawer-left", "drawer-right", "pillow-right"],
    preserve: ["handle-left", "handle-right"],
    primary1: ["pillow-left"],
  }),
  "blind-roller": roles({
    primary0: ["roller-panel"],
    preserve: ["roller-bottom-rail", "roller-tube", "roller-bracket-left", "roller-bracket-right", "roller-pull-cord", "roller-pull-weight"],
  }),
  "blind-wood": roles({
    wood1: ["wood-bottom-rail", "wood-headrail"],
    wood0: ["wood-slat-1", "wood-slat-2", "wood-slat-3", "wood-slat-4", "wood-slat-5", "wood-slat-6", "wood-slat-7", "wood-slat-8", "wood-slat-9"],
    accent0: ["wood-cord-left", "wood-cord-right"],
  }),
  "bookshelf-classic-havsta": roles({
    neutral0: ["plinth", "side-left", "side-right", "back-panel", "bottom-panel", "top", "door-rail-bottom", "door-rail-top"],
    primary0: ["shelf-lower", "shelf-middle", "shelf-upper", "door-outer-left", "door-center-left"],
    preserve: ["glass-door-left", "glass-door-right", "handle-left", "handle-right"],
    primary1: ["door-center-right", "door-outer-right"],
  }),
  "bookshelf-double-open": roles({
    wood1: ["base", "top", "center-divider"],
    wood0: ["side-left", "side-right"],
    primary0: ["shelf-lower", "shelf-middle", "shelf-upper"],
  }),
  "bookshelf-high": roles({
    wood1: ["plinth"],
    wood0: ["side-left", "side-right", "top"],
    primary0: ["shelf-1", "shelf-2", "shelf-3", "shelf-4", "shelf-5"],
    neutral0: ["back-panel"],
  }),
  "bookshelf-low": roles({
    wood1: ["plinth"],
    wood0: ["side-left", "side-right", "top"],
    primary0: ["shelf-lower", "shelf-upper"],
    neutral0: ["back-panel"],
  }),
  "bookshelf-midcentury-stockholm": roles({
    preserve: ["floor-rail-front", "floor-rail-back", "post-left-front", "post-left-back", "post-center-front", "post-center-back", "post-right-front", "post-right-back", "rear-brace-lower", "rear-brace-upper"],
    primary0: ["shelf-bottom", "shelf-lower", "shelf-middle", "shelf-upper", "shelf-top"],
  }),
  "chair-armrest": roles({
    preserve: ["base-cross-x", "base-cross-z", "gas-column", "back-support-link-left", "back-support-link-right", "back-support-left", "back-support-right", "arm-support-left", "arm-support-right"],
    primary1: ["seat-base", "arm-pad-left", "arm-pad-right"],
    secondary0: ["mesh-back"],
  }),
  "chair-basic": roles({
    preserve: ["foot-left-front", "foot-left-back", "foot-right-front", "foot-right-back", "leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back", "back-post-left", "back-post-right"],
    primary0: ["seat"],
    secondary0: ["backrest"],
  }),
  "chair-classic-tonstad": roles({
    wood1: ["foot-left-front", "foot-left-back", "foot-right-front", "foot-right-back", "leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back", "back-post-left", "back-post-right"],
    wood0: ["seat-base"],
    primary0: ["seat-cushion"],
    secondary0: ["upholstered-back"],
  }),
  "chair-compact-swivel": roles({
    preserve: ["base-cross-x", "base-cross-z", "gas-column", "back-support-link", "back-support"],
    primary1: ["shell-seat"],
    primary0: ["seat-pad"],
    secondary0: ["shell-back"],
  }),
  "chair-gaming-matchspel": roles({
    preserve: ["base-cross-x", "base-cross-z", "gas-column", "back-support-link", "back-frame", "arm-support-left", "arm-support-right", "headrest-support"],
    primary1: ["seat-base", "lumbar-support", "arm-pad-left", "arm-pad-right", "headrest"],
    primary0: ["seat-pad"],
    secondary0: ["mesh-back"],
  }),
  "chair-midcentury-shell": roles({
    wood1: ["left-front-leg", "right-front-leg", "left-back-leg", "right-back-leg", "back-support-left", "back-support-right"],
    preserve: ["front-stretcher", "back-stretcher"],
    primary0: ["seat-shell", "seat-pad"],
    secondary0: ["curved-back-shell"],
  }),
  "curtain-blackout": roles({
    primary1: ["blackout-panel-left", "blackout-panel-right"],
    preserve: ["blackout-header", "blackout-rod"],
  }),
  "curtain-fabric": roles({
    primary0: ["curtain-panel-left", "curtain-panel-right"],
    primary1: ["curtain-header"],
    preserve: ["curtain-rod"],
  }),
  "desk-compact": roles({
    secondary0: ["top"],
    preserve: ["left-frame-front", "left-frame-back", "right-frame-front", "right-frame-back", "left-foot", "right-foot", "left-upper-rail", "right-upper-rail", "rear-brace", "cable-tray", "cable-tray-bracket-left", "cable-tray-bracket-right"],
  }),
  "desk-corner": roles({
    secondary0: ["corner-desktop"],
    neutral0: ["left-cabinet", "right-side-panel", "rear-support-panel", "cable-tray", "hutch-side-left", "hutch-divider-left", "hutch-divider-right", "hutch-side-right", "hutch-top", "left-shelf-lower", "left-shelf-upper", "right-shelf-lower", "right-shelf-upper"],
    primary0: ["left-cabinet-door"],
    preserve: ["left-door-handle", "cable-bracket-left", "cable-bracket-right", "magnetic-board"],
  }),
  "desk-midcentury-glass": roles({
    preserve: ["glass-top", "brass-cap-left-front", "brass-cap-left-back", "brass-cap-right-front", "brass-cap-right-back"],
    wood1: ["left-runner", "right-runner", "left-leg-front", "left-leg-back", "right-leg-front", "right-leg-back", "left-trestle", "right-trestle", "center-stretcher"],
  }),
  "desk-storage": roles({
    secondary0: ["top"],
    wood0: ["left-panel", "pedestal-body", "open-shelf"],
    primary0: ["drawer-1", "drawer-2", "drawer-3"],
    preserve: ["handle-1", "handle-2", "handle-3"],
    wood1: ["modesty-panel", "front-apron"],
  }),
  "drawer-chest-bedside": roles({
    wood1: ["compact-cabinet-body"],
    wood0: ["compact-top"],
    primary0: ["compact-drawer-upper"],
    primary1: ["compact-drawer-lower"],
    preserve: ["compact-grip-upper", "compact-grip-lower"],
  }),
  "drawer-chest-classic-gullaberg": roles({
    neutral0: ["leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back", "cabinet-body", "top"],
    primary0: ["drawer-1-1", "drawer-1-2", "drawer-2-1", "drawer-2-2"],
    preserve: ["knob-1-1", "knob-1-2", "knob-2-1", "knob-2-2", "knob-3-1", "knob-3-2"],
    primary1: ["drawer-3-1", "drawer-3-2"],
  }),
  "drawer-chest-low-wide": roles({
    wood0: ["cabinet-body", "top"],
    primary0: ["drawer-left-upper", "drawer-right-upper"],
    primary1: ["drawer-left-middle", "drawer-right-middle", "drawer-left-lower", "drawer-right-lower"],
    preserve: ["handle-left-upper", "handle-right-upper", "handle-left-middle", "handle-right-middle", "handle-left-lower", "handle-right-lower"],
  }),
  "drawer-chest-vertical": roles({
    wood0: ["tall-cabinet-body"],
    wood1: ["tall-top"],
    primary0: ["drawer-1", "drawer-2"],
    primary1: ["drawer-3", "drawer-4", "drawer-5"],
    preserve: ["handle-1", "handle-2", "handle-3", "handle-4", "handle-5"],
  }),
  "hanger-basic": roles({
    neutral1: ["foot-left", "foot-right"],
    primary1: ["post-left", "post-right"],
    accent0: ["left-extension", "right-extension", "hanger-rail", "lower-stabilizer", "shoe-rail-front", "shoe-rail-back", "shoe-support-left-front", "shoe-support-right-front", "shoe-support-left-back", "shoe-support-right-back"],
    preserve: ["caster-1-1", "caster-1-2", "caster-2-1", "caster-2-2"],
  }),
  "hanger-corner": roles({
    accent0: ["base-x", "base-z", "post-corner", "post-right", "post-front"],
    preserve: ["rail-x", "rail-z"],
  }),
  "hanger-natural-morsning": roles({
    wood0: ["foot-left", "foot-right", "post-left", "post-right", "lower-bar", "mid-bar", "front-valet-rail", "connector-left", "connector-right"],
    primary0: ["shoulder-rail"],
  }),
  "hanger-shelf": roles({
    primary0: ["base-shelf", "top-shelf", "shoe-shelf"],
    preserve: ["post-left-back", "post-left-front", "post-right-back", "post-right-front", "hanger-rail"],
  }),
  "lamp-floor": roles({
    accent0: ["floor-base"],
    preserve: ["floor-stem", "floor-bulb"],
    neutral1: ["floor-shade"],
  }),
  "lamp-indirect": roles({
    secondary0: ["led-bottom-pad"],
    primary0: ["led-wood-base"],
    preserve: ["led-inner-light", "led-diffuser", "led-top-glow"],
  }),
  "lamp-midcentury-globe": roles({
    primary0: ["globe-base"],
    secondary0: ["globe-neck"],
    preserve: ["globe-light", "globe-diffuser"],
  }),
  "lamp-table": roles({
    accent0: ["table-base"],
    preserve: ["table-stem", "table-bulb"],
    neutral1: ["table-shade"],
  }),
  "media-console-drawer": roles({
    wood1: ["plinth", "back-panel", "console-top"],
    wood0: ["side-left", "side-right", "center-divider"],
    primary0: ["drawer-box-left", "drawer-box-right", "drawer-front-left", "drawer-front-right"],
    preserve: ["pull-left", "pull-right"],
  }),
  "media-console-low": roles({
    wood1: ["leg-left-back", "leg-right-back", "leg-left-front", "leg-right-front"],
    wood0: ["media-shelf", "console-top"],
  }),
  "media-console-midcentury-stockholm": roles({
    preserve: ["foot-left-front", "foot-center-front", "foot-right-front", "foot-left-back", "foot-center-back", "foot-right-back", "post-left-front", "post-center-front", "post-right-front", "post-left-back", "post-center-back", "post-right-back", "door-handle-top-right", "door-handle-bottom-left", "front-rail-bottom", "front-rail-middle", "front-rail-top", "back-rail-bottom", "back-rail-middle", "back-rail-top"],
    primary0: ["bottom-panel", "middle-shelf", "top-panel", "side-left", "side-right", "center-divider", "back-panel", "drop-door-top-right", "drop-door-bottom-left"],
  }),
  "media-console-open": roles({
    preserve: ["foot-left-back", "foot-right-back", "foot-left-front", "foot-right-front"],
    wood1: ["bottom-panel", "back-panel", "top-panel"],
    wood0: ["side-left", "side-right", "center-divider", "shelf-left", "shelf-right"],
  }),
  "mirror-classic-rounded": roles({
    wood1: ["base-foot", "rounded-frame"],
    preserve: ["mirror-panel", "rear-stand"],
  }),
  "mirror-standing": roles({
    accent0: ["base-foot", "frame-left", "frame-right", "frame-top", "frame-bottom", "rear-stand", "ornament-top"],
    preserve: ["mirror-panel", "rear-clothes-rail", "rear-hook-left", "rear-hook-right"],
  }),
  "mirror-storage": roles({
    neutral0: ["bottom-panel", "back-panel", "side-left", "center-divider", "side-right", "top-panel"],
    preserve: ["storage-shelf-lower", "storage-shelf-upper", "storage-mirror-panel", "rear-hook-left", "rear-hook-right"],
  }),
  "mirror-wall": roles({
    accent0: ["wall-frame"],
    preserve: ["wall-mirror-panel", "mounting-bracket-upper", "mounting-bracket-lower"],
  }),
  "monitor-basic": roles({
    accent1: ["base", "stem"],
    accent0: ["frame"],
    preserve: ["display"],
    neutral1: ["lower-bezel"],
  }),
  "monitor-dual": roles({
    accent1: ["base"],
    preserve: ["center-column", "crossbar", "display-left", "display-right"],
    accent0: ["frame-left", "frame-right"],
  }),
  "monitor-gaming-odyssey": roles({
    accent1: ["stand-base", "stand-neck"],
    preserve: ["rear-mount", "gaming-display", "center-mark"],
    accent0: ["gaming-frame"],
    neutral1: ["gaming-lower-bezel"],
  }),
  "monitor-ultrawide": roles({
    accent1: ["base", "stem"],
    accent0: ["wide-frame"],
    preserve: ["wide-display"],
    neutral1: ["wide-lower-bezel"],
  }),
  "multi-table-compact": roles({
    preserve: ["leg-left-back", "leg-right-back", "leg-left-front", "leg-right-front", "brace-back", "brace-front"],
    primary0: ["tabletop"],
  }),
  "multi-table-gateleg": roles({
    wood0: ["center-cabinet", "center-top", "drop-leaf-left", "drop-leaf-right", "gate-rail-1", "gate-cross-brace-1", "gate-rail-2", "gate-cross-brace-2"],
    wood1: ["gate-leg-front-1", "gate-leg-back-1", "gate-leg-front-2", "gate-leg-back-2"],
    primary0: ["drawer-front-1", "drawer-front-2", "drawer-front-3"],
    preserve: ["drawer-pull-1", "drawer-pull-2", "drawer-pull-3"],
  }),
  "multi-table-storage": roles({
    neutral1: ["cabinet-plinth", "side-left", "divider-left", "divider-right", "side-right", "back-panel", "right-shelf"],
    wood1: ["left-shelf", "appliance-shelf"],
    primary0: ["left-door-open", "drawer-center", "drawer-right"],
    preserve: ["left-door-handle", "pull-center", "pull-right"],
    secondary0: ["countertop"],
  }),
  "multi-table-two-seat": roles({
    wood1: ["leg-left-back", "leg-right-back", "leg-left-front", "leg-right-front"],
    wood0: ["apron-back", "apron-front", "apron-left", "apron-right"],
    primary0: ["tabletop"],
  }),
  "nightstand-classic-gullaberg": roles({
    primary0: ["leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back", "lower-shelf", "drawer-front", "top"],
    primary1: ["cabinet-body"],
    preserve: ["drawer-knob"],
  }),
  "nightstand-drawer": roles({
    wood0: ["cabinet-body", "top"],
    primary0: ["drawer-upper", "drawer-lower"],
    preserve: ["grip-upper", "grip-lower"],
  }),
  "nightstand-midcentury-trolley": roles({
    primary1: ["floor-base", "lower-module", "upper-module"],
    primary0: ["center-ring", "top-rim", "lower-sliding-door", "upper-sliding-door", "lower-finger-hole", "upper-finger-hole"],
  }),
  "nightstand-open": roles({
    accent0: ["base-frame", "leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back"],
    secondary0: ["open-shelf", "top"],
  }),
  "nightstand-round": roles({
    accent0: ["foot-left", "foot-right", "leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back"],
    secondary0: ["tray-top", "tray-surface"],
  }),
  "partition-shelf-kallax": roles({
    neutral0: ["top-panel", "bottom-panel", "side-left", "side-right", "vertical-divider-left", "vertical-divider-center", "vertical-divider-right", "horizontal-divider"],
  }),
  "partition-shelf-slim": roles({
    wood1: ["foot-left", "foot-right", "post-left", "post-right", "panel-1-inner-post", "panel-2-inner-post"],
    wood0: ["bottom-rail", "top-rail", "slat-1", "slat-2", "slat-3", "slat-4", "slat-5", "slat-6", "slat-7", "panel-1-slat-1", "panel-1-slat-2", "panel-1-slat-3", "panel-1-slat-4", "panel-1-slat-5", "panel-1-slat-6", "panel-1-slat-7", "panel-2-slat-1", "panel-2-slat-2", "panel-2-slat-3", "panel-2-slat-4", "panel-2-slat-5", "panel-2-slat-6", "panel-2-slat-7"],
    preserve: ["hinge-1", "hinge-2"],
  }),
  "partition-shelf-storage": roles({
    neutral0: ["plinth", "side-left", "side-right", "center-divider", "top-panel"],
    primary0: ["shelf-1", "shelf-2", "shelf-3"],
  }),
  "partition-shelf-translucent": roles({
    accent0: ["foot-left", "foot-right", "post-left", "post-right", "bottom-rail", "middle-rail", "top-rail"],
    primary0: ["panel-left", "panel-right"],
    secondary0: ["panel-center"],
    preserve: ["panel-hinge-1", "panel-hinge-2"],
  }),
  "plant-corner": roles({
    secondary0: ["pot"],
    preserve: ["soil", "stem-1", "leaf-1", "leaf-vein-1", "stem-2", "leaf-2", "leaf-vein-2", "stem-3", "leaf-3", "leaf-vein-3", "stem-4", "leaf-4", "leaf-vein-4", "stem-5", "leaf-5", "leaf-vein-5", "stem-6", "leaf-6", "leaf-vein-6", "stem-7", "leaf-7", "leaf-vein-7", "stem-8", "leaf-8", "leaf-vein-8", "stem-9", "leaf-9", "leaf-vein-9"],
  }),
  "plant-floor": roles({
    secondary0: ["pot"],
    preserve: ["soil", "stem-1", "leaf-1", "leaf-vein-1", "stem-2", "leaf-2", "leaf-vein-2", "stem-3", "leaf-3", "leaf-vein-3", "stem-4", "leaf-4", "leaf-vein-4", "stem-5", "leaf-5", "leaf-vein-5", "stem-6", "leaf-6", "leaf-vein-6", "stem-7", "leaf-7", "leaf-vein-7", "stem-8", "leaf-8", "leaf-vein-8", "stem-9", "leaf-9", "leaf-vein-9", "stem-10", "leaf-10", "leaf-vein-10", "stem-11", "leaf-11", "leaf-vein-11", "stem-12", "leaf-12", "leaf-vein-12", "stem-13", "leaf-13", "leaf-vein-13", "stem-14", "leaf-14", "leaf-vein-14"],
  }),
  "plant-midcentury": roles({
    primary1: ["pot"],
    preserve: ["soil", "stem-1", "leaf-1", "leaf-vein-1", "stem-2", "leaf-2", "leaf-vein-2", "stem-3", "leaf-3", "leaf-vein-3", "stem-4", "leaf-4", "leaf-vein-4", "stem-5", "leaf-5", "leaf-vein-5", "stem-6", "leaf-6", "leaf-vein-6", "stem-7", "leaf-7", "leaf-vein-7", "stem-8", "leaf-8", "leaf-vein-8", "stem-9", "leaf-9", "leaf-vein-9"],
  }),
  "plant-tabletop": roles({
    secondary0: ["pot"],
    preserve: ["soil", "stem-1", "leaf-1", "leaf-vein-1", "stem-2", "leaf-2", "leaf-vein-2", "stem-3", "leaf-3", "leaf-vein-3", "stem-4", "leaf-4", "leaf-vein-4", "stem-5", "leaf-5", "leaf-vein-5"],
  }),
  "rug-geometric": roles({
    neutral0: ["geometric-base"],
    primary0: ["diamond-teal"],
    secondary0: ["diamond-orange"],
    accent0: ["diamond-dark"],
    primary1: ["diamond-warm"],
  }),
  "rug-rectangular": roles({
    primary1: ["rect-base"],
    neutral0: ["rect-inset"],
  }),
  "rug-round": roles({
    primary1: ["round-base"],
    secondary0: ["round-inset"],
  }),
  "rug-runner": roles({
    primary0: ["runner-base"],
    neutral0: ["runner-inset"],
    accent0: ["stripe-front"],
    secondary0: ["stripe-back"],
  }),
  "side-table-coffee": roles({
    wood1: ["leg-left-back", "leg-right-back", "leg-left-front", "leg-right-front"],
    wood0: ["magazine-shelf"],
    primary0: ["tabletop"],
  }),
  "side-table-midcentury-stockholm": roles({
    secondary0: ["floor-base", "sculpted-stem", "neck"],
    primary0: ["round-top"],
  }),
  "side-table-round": roles({
    wood1: ["leg-left", "leg-right", "leg-back", "leg-front"],
    wood0: ["brace-x", "brace-z"],
    primary0: ["tabletop"],
  }),
  "side-table-storage": roles({
    wood1: ["bottom-panel", "top-panel"],
    wood0: ["side-left", "side-right", "partition", "shelf-wide", "shelf-narrow"],
  }),
  "sofa-bed-classic-storage": roles({
    neutral0: ["floor-plinth", "storage-body", "mattress", "end-left", "end-right", "back-lower-rail", "back-top-rail", "back-slat-1", "back-slat-2", "back-slat-3", "back-slat-4", "back-slat-5"],
    primary0: ["drawer-left", "drawer-center", "drawer-right", "mattress-support", "back-cushion-left"],
    preserve: ["handle-left", "handle-center", "handle-right"],
    secondary0: ["back-cushion-right"],
  }),
  "sofa-bed-compact": roles({
    preserve: ["base", "back-support-left", "back-support-right", "rear-crossbar"],
    primary0: ["seat-mattress", "back-mattress", "front-skirt"],
    accent0: ["fold-seam"],
  }),
  "sofa-bed-daybed": roles({
    neutral0: ["platform", "end-left", "end-right", "back-panel", "mattress"],
    primary0: ["drawer-left", "drawer-right"],
    preserve: ["drawer-grip-left", "drawer-grip-right", "pullout-bed-frame", "pullout-mattress"],
    secondary0: ["bolster", "pillow-right"],
    accent0: ["pillow-left"],
  }),
  "sofa-bed-folding": roles({
    preserve: ["platform", "back-frame", "hinge-bar", "side-hinge-left", "side-hinge-right", "rear-support-left", "rear-support-right", "rear-crossbar"],
    primary0: ["seat-mattress", "back-mattress"],
  }),
  "sofa-bed-midcentury-orange": roles({
    wood1: ["leg-left-back", "leg-right-back", "leg-left-front", "leg-right-front", "rear-support-left", "rear-support-right"],
    secondary0: ["base-frame", "front-roll", "side-roll-left", "side-roll-right", "back-frame"],
    preserve: ["click-clack-hinge"],
    primary0: ["seat-cushion"],
    accent0: ["back-seam-1", "back-seam-2", "back-seam-3", "back-seam-4", "back-seam-5", "back-tuft-1", "back-tuft-2", "back-tuft-3", "back-tuft-4", "back-tuft-5", "back-tuft-6", "seat-tuft-1", "seat-tuft-2", "seat-tuft-3", "seat-tuft-4", "seat-tuft-5"],
  }),
  "sofa-classic-ektorp": roles({
    primary1: ["floor-skirt", "back-frame"],
    primary0: ["seat-frame", "seat-cushion-left", "seat-cushion-center", "back-cushion-left", "back-cushion-center"],
    neutral0: ["arm-left", "arm-right"],
    secondary0: ["seat-cushion-right", "back-cushion-right"],
  }),
  "sofa-midcentury-stockholm": roles({
    preserve: ["leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back", "support-left-front", "support-left-back", "support-right-front", "support-right-back", "base-side-left", "base-side-right", "seat-rail-front", "seat-rail-back", "back-upright-left", "back-upright-right", "back-rail-lower", "back-rail-upper", "mount-1-1", "mount-1-2", "mount-1-3", "mount-1-4", "mount-2-1", "mount-2-2", "mount-2-3", "mount-2-4", "mount-2-5", "mount-3-1", "mount-3-2", "mount-3-3", "mount-3-4", "mount-3-5", "mount-4-1", "mount-4-2", "mount-4-3", "mount-4-4"],
    primary1: ["cushion-1-1", "cushion-2-4", "cushion-3-2"],
    secondary0: ["cushion-1-2", "cushion-2-5", "cushion-3-3", "cushion-4-1"],
    primary0: ["cushion-1-3", "cushion-2-1", "cushion-3-4", "cushion-4-2"],
    accent0: ["cushion-1-4", "cushion-2-2", "cushion-3-5", "cushion-4-3"],
    neutral0: ["cushion-2-3", "cushion-3-1", "cushion-4-4"],
  }),
  "sofa-modular": roles({
    primary1: ["base-left", "base-right", "back-support-left", "back-support-right", "back-frame-left", "back-frame-right"],
    primary0: ["storage-front-left", "storage-front-right", "seat-cushion-left", "back-cushion-left"],
    secondary0: ["seat-cushion-right", "back-cushion-right"],
  }),
  "sofa-single": roles({
    preserve: ["leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back"],
    primary1: ["seat-base", "back-support-left", "back-support-right", "back-frame"],
    primary0: ["seat-cushion", "back-cushion"],
  }),
  "sofa-two-seat": roles({
    wood1: ["leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back"],
    primary1: ["seat-base", "arm-left", "arm-right", "back-support-left", "back-support-right", "back-frame"],
    primary0: ["seat-cushion-left", "back-cushion-left"],
    secondary0: ["seat-cushion-right", "back-cushion-right"],
  }),
  "tv-medium": roles({
    accent1: ["foot-left", "foot-right"],
    accent0: ["frame"],
    preserve: ["display"],
    neutral1: ["brand-mark"],
  }),
  "tv-natural-frame": roles({
    accent1: ["foot-left", "foot-right"],
    preserve: ["support-left", "support-right", "art-display"],
    accent0: ["rear-panel"],
    neutral1: ["bezel-top", "bezel-bottom", "bezel-left", "bezel-right"],
  }),
  "tv-small": roles({
    accent1: ["foot-left", "foot-right"],
    accent0: ["frame"],
    preserve: ["display"],
    neutral1: ["brand-mark"],
  }),
  "tv-wide": roles({
    accent1: ["foot-left", "foot-right"],
    accent0: ["frame"],
    preserve: ["display"],
    neutral1: ["brand-mark"],
  }),
  "wardrobe-classic-gullaberg": roles({
    neutral0: ["leg-left-front", "leg-left-back", "leg-right-front", "leg-right-back", "bottom-panel", "side-left", "side-right", "center-divider-left", "center-divider-right", "back-panel", "top-moulding"],
    primary0: ["door-left", "door-center-frame"],
    preserve: ["door-center-mirror", "door-knob-left", "door-knob-center", "door-knob-right", "drawer-knob-left", "drawer-knob-right"],
    primary1: ["door-right"],
    secondary0: ["drawer-left", "drawer-right"],
  }),
  "wardrobe-hinged": roles({
    wood1: ["plinth", "back-panel"],
    wood0: ["side-left", "side-right", "top"],
    primary0: ["door-left"],
    primary1: ["door-right"],
    preserve: ["hinge-left-lower", "hinge-left-upper", "hinge-right-lower", "hinge-right-upper", "handle-left", "handle-right"],
  }),
  "wardrobe-natural-nordkisa": roles({
    wood0: ["base-shelf", "post-left-front", "post-left-back", "post-right-front", "post-right-back", "top-shelf", "center-divider", "shelf-lower", "shelf-middle", "shelf-upper"],
    preserve: ["hanging-rail"],
    primary0: ["door-rail-bottom", "door-rail-top", "door-slat-1", "door-slat-2", "door-slat-3", "door-slat-4", "door-slat-5", "door-slat-6", "door-slat-7"],
  }),
  "wardrobe-open": roles({
    accent0: ["base-frame", "post-left-front", "post-left-back", "post-right-front", "post-right-back", "top-frame"],
    wood0: ["top-shelf", "shelf-lower", "shelf-middle", "shelf-upper"],
    preserve: ["center-divider", "rail-bracket-left", "rail-bracket-right", "hanging-rail"],
  }),
  "wardrobe-sliding": roles({
    wood1: ["plinth", "back-panel"],
    wood0: ["side-left", "side-right", "top"],
    preserve: ["lower-track", "upper-track", "recessed-grip"],
    primary0: ["sliding-door-left"],
    primary1: ["sliding-door-right"],
  }),
};
