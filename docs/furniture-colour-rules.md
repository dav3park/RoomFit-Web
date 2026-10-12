# Furniture colour rules

All 93 catalog variants now declare a role for every real part in `src/config/furnitureThemeTargets.ts`. This includes deliberate `preserve` assignments, not just surfaces that change. `furnitureBehaviorPolicy.ts` retains the existing palettes and physical/exclusivity flags and now exposes the wood palette as an explicit role. The material resolver still replaces only colour, keeping roughness, metalness, transparency, opacity and emitted light intact.

## Composition

| Role | Use |
| --- | --- |
| Primary | Upholstery, headboards, cabinet doors, painted shelf boards and table tops |
| Secondary | Cushions, small ceramics, selected desk tops and inset surfaces |
| Accent | Bedding runners, seams, powder-coated frames, small dark details |
| Neutral | Mattresses, large cabinet carcasses, some rug fields and lamp shade fabric |
| Wood | Light/dark natural timber structure, trestles, legs and slats |
| Preserve | Glass, reflective mirror panels, screen displays, leaves/stems/soil, chrome/brass fittings, bulbs and diffusers |

Large paired surfaces use related finishes instead of random per-part colour hashing. Multi-colour designs retain multiple roles. Timber pieces can remain timber-coloured while selected fronts/shelves carry the preferred hue. A green room combines soft sage, olive, forest accents, warm cream and natural brown timber. The colour tag is a coordinated visual scheme, not a command to paint everything the same hue.

Existing beds gained missing headboard/frame/front roles. Curtains, painted metal shelving, media consoles, hangers, nightstands, mirror/monitor frames, tables and plant pots now have explicit policies. Generic scan furniture and existing collector-scene renderers receive the same roles through optional `colors` props, preserving their geometry, item data and unthemed appearance. Plants change pots without changing leaves. Glass-topped tables retain glass. Unknown external GLTF assets have no current catalog part metadata and retain their source materials.

The recommendation workflow is unchanged: choosing a palette configures the next recommendation; generation previews it and application stores the palette with the layout. No SKU, dimensions, positions, collision rules or commercial product colour availability are changed by this visual theme.

## Validation

Catalog coverage tests require exactly the actual part IDs for all 93 models. Every selectable palette must change at least one visible surface of every model. Tests also enforce protected materials, stable colour assignments and unchanged PBR properties. Existing renderer tests check palette forwarding to scan furniture without mutating product metadata.

Visual review used a temporary single-canvas gallery for all 93 models in green and representative models in all eight palettes. Workspace before/after captures use the same scene at 1440×900 and 390×844. The gallery is development-only and was removed before the production build. Screenshots and verification records are under workspace `docs/ui-tooling/verification/`.

Design references and the limits of their use are recorded in `design-references/furniture-colour/README.md`.
