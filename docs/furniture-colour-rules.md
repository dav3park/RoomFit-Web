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

## Automatic colour combinations

The workspace offers **선택 안 함 · 자동 색 조합** alongside the original eight manual tones. New rooms without an applied colour default to automatic selection; existing manual selections retain their value. `automaticColorSchemes.ts` contains six curated combinations: linen blue, sage cream, blush navy, teal sand, mint peach and olive ochre. Rank them deterministically by interior style (+5), lifestyle (+2) and floor undertone (+1). The floor is classified as warm when red exceeds blue by 20 in the supplied 6-digit RGB value; missing floor data uses the existing sample wood tone. These are adjustable RoomFit heuristics, not psychophysical measurements.

Automatic palettes use the original declared part roles. Large storage/table fronts receive the dominant finish; bed/sofa/chair/rug roles use the supporting hue; small furniture and pots use accents. Neutrals, natural timber and protected glass/hardware/leaves remain distinct. This adapts analogous/complementary palettes and dominant/support/accent balance; it does not measure projected pixel area or guarantee a whole-room 60/30/10 ratio. Walls and floors are not repainted.

Moving modes keep their required structural diversity. A fixed-pose restyle can also offer three colour-only alternatives if no additional valid product combination exists; these are explicitly named colour combinations. Each card shows the resolved scheme name and swatches. Preview does not save; Apply stores `appliedColorSchemeId` in the layout. The worker, renderer, workspace reload, final preview and thumbnail all use that resolved scheme. Selecting a manual tone clears the automatic scheme only when the new recommendation is applied. Unknown scheme IDs cannot inject arbitrary colours and fall back to the existing tone path.

The API colour enum remains the existing eight values. `auto` and scheme IDs are browser recommendation metadata and are not sent as unsupported colour enum values. No external palette/AI API or new dependency was added. Automated coverage checks every part of all 93 catalog models in every automatic scheme, protected materials/PBR preservation, role differences, deterministic ranking, mode semantics and stored scheme round trips.
