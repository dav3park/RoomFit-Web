# Rule-based workspace recommendations

The browser Web Worker consumes the edited draft and returns up to three validated alternatives. Preview never saves over the draft; Apply does. Preference edits or cancellation terminate stale calculations. No AI/API call or backend change is involved.

## Mode contract

- **현재 배치 유지 / preserve:** keep each ID, type, count, position and rotation. Select style/lifestyle-matching products with their real catalog dimensions. Different sizes are permitted only after validation; optional size preservation still requires an exact dimensional match. Fall back to the original with an explanation when replacement is not feasible.
- **가구 재배치 / rearrange:** clone each existing model, variant, dimensions and metadata. Move/rotate it; never replace/add/delete it. Lifestyle informs zoning and the chosen palette applies to the models. Style does not cause a product swap in this mode. The engine enforces this even if a caller sends unchecked preservation flags.
- **새로운 디자인 / new:** derive required/optional functional furniture from lifestyle. Type/count and size preservation remain optional. Sleeping furniture is included for studio rooms. An optional item can be omitted with a reason.
- Locks preserve model, size, position and rotation in every mode. Palette may change. Window-mounted blinds keep their model/anchor.

## Feasibility and design are separate

Hard checks retain actual rendered footprints, body collision, floor/wall/ceiling bounds, door swing, storage opening zones and connected 60 cm walking access to use positions. The grid is eroded by a 30 cm radius plus discretization margin and flood-filled from the entrance. Floor/wall erosion is computed once and reused across a generation request.

Windows now retain API `sillHeight`, including upload round trips. Wall cuts, panes, blind anchors and checks use the same clamped vertical position. A body taller than the sill plus 5 cm is rejected if its envelope intersects a strip 60 cm into the room, with 6 cm frame margin at each end. Low furniture can fit below a pane. The legacy bed's raised headboard is accounted for. Older drafts without sill data use the renderer's existing estimated height and disclose that limitation. This is conservative pane protection, not a measured casement swing or a daylight simulation.

`designGuidelines.ts` scores accessible approach areas, desk/chair pairing, bed/nightstand and sofa/table relationships, sofa/screen direction, wall alignment, distributed visual mass, quiet sleeping placement, separation of work/sleep areas, and desks with window light to the side. Bed headboards and storage backs prefer nearby walls; balance has a tolerance so it does not drag beds into the middle of the room. Weights are RoomFit heuristics, not legal standards or a professionally calibrated beauty score.

## Search and diversity

Selection and spatial placement use different paths. Rearrangement has exactly one model candidate per slot. Restyling considers catalog replacements at the original poses. New designs consider tagged products and smaller real alternatives. Anchors are tried along actual wall segments and on a bounded grid; related pieces also get function-specific poses. A beam retains up to eight partial layouts, with hard/circulation checks before expansion. Six seed searches vary wall anchors and design emphasis; preserve mode uses three fixed-pose searches.

Final candidates share a comparable quality score. Selection balances quality with pose distance (MMR-inspired). For moving layouts, product IDs are excluded from diversity. A main furniture item must change wall with at least 75 cm movement, move more than 1.2 m, or turn about 90 degrees; the aggregate distance must also exceed 0.16. Decoration-only changes and tiny shifts do not count. Fixed-pose restyles instead compare product combinations, which is intentional for that mode. Fewer than three is an honest result; identical layouts are never padded into three choices.

This is bounded heuristic search, not the research paper's GPU MCMC implementation. It cannot prove global infeasibility or guarantee a designer's preferred composition. Door hinges, window operation, exact drawer travel, sightlines above model envelopes and solar orientation remain unmeasured. Missing door metadata also produces a warning.

## Evidence and checks

See [furniture-layout references](../design-references/furniture-layout/README.md) for sources and adaptations. Regression coverage includes the deployed sample with two beds, desk, chair and wardrobe; unchanged rearranged identities/sizes; changed-size fixed-pose swaps; real spatial diversity; sill/rotated-wall window protection; chair direction; balance; failed locked layouts; all lifestyles; concave floors; connected paths; locks and source immutability. Browser checks exercise the worker, comparison, keyboard preview, Apply/autosave/reload and the final step at desktop/mobile sizes.

## Automatic colour choice

`palette: 'auto'` does not change the furniture preservation/placement contract. After feasible spatial candidates are chosen, the engine ranks curated schemes by style, lifestyle and floor undertone and assigns a different resolved scheme to each recommendation. In preserve mode only, colour-only alternatives are legitimate when inventory/poses are fixed; moving modes continue to reject geometry duplicates regardless of colour. The stored scheme ID drives the same material roles across preview, Apply/autosave, reload and final preview. See `docs/furniture-colour-rules.md` for scheme/part rules and API boundaries.

## Installation-aware variants (193-model catalog)

Candidate search includes role-specific placements and a bounded selection of
installation modes (at most eight product candidates per slot). Curtains and
blinds attach to an actual window and respect its dimensions, orientation and
wall thickness. Partitions prefer positions between living areas. Tabletop
variants use an authored support surface; wall and floor/ceiling fixtures have
separate installation checks. Complete snapshots resolve all supports before
validation, regardless of array order. Every final proposal still passes the
independent confirmed-condition audit and geometric/circulation validation.
