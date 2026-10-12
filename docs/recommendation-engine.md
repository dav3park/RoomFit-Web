# Rule-based workspace recommendations

The workspace uses `src/recommendation/engine.ts` in a Web Worker. It consumes the current browser draft, never calls an AI endpoint, and returns up to three distinct validated proposals. Preview is separate from autosave; only applying a proposal changes the edited layout. Editing the draft or changing preferences cancels stale calculations. Final confirmation remains the existing next step.

## Selection and preservation

- Preserve: retain types/count, dimensions, positions and rotations. Replace only with catalog products of the same dimensions (1 mm tolerance); keep originals and explain when no replacement exists.
- Rearrange: retain types/count; optionally retain dimensions. Products use their real catalog dimensions.
- New design: derive required functional furniture from lifestyle (rest, study, hobby, storage), retain sleeping furniture for studios, and add optional pieces only when feasible. Type/count and size preservation can also be selected.
- Locked furniture keeps its product, dimensions, position and rotation in every mode. The chosen room color palette still applies. Window-mounted blinds retain their existing anchor and model.
- Product candidates rank style tags, lifestyle tags and material compatibility. Color uses the existing renderer's palette system. These are catalog matches, not an AI model's judgment.

## Search and validation

A bounded beam search tries orthogonal rotations and wall/interior grid positions, with nine searches weighted toward circulation, lifestyle matching or balance. Include smaller alternatives so a large matching product does not exhaust the search. Optional pieces may be omitted with a reason. Diversity considers products, positions and rotations; duplicate solutions are not advertised as three choices.

Hard checks use actual rendered footprints: body collisions, floor/wall boundaries, ceiling height, assumed door swing and cabinet opening rectangles. Existing rug/stacked monitor/TV and functional desk/chair exceptions remain. Door swing assumes inward 90° with radius equal to door width; wardrobe front opening uses half its width; drawers reuse catalog clearance. No product hinge/drawer-travel metadata is available.

Movement uses a grid eroded by a 30 cm person radius plus discretization margin. Flood fill starts at the entrance and must reach each furniture's use side and all other doors. The working rule is a minimum 60 cm passage; it is not a building-code/accessibility certification. Missing door data produces a warning and uses the largest connected free component. Concave floors and wall crossings are checked. Partial layouts are also checked before extending the beam.

The finite search does not prove global infeasibility or find a global optimum. If fewer than three valid distinct proposals are found, return only those. If none are found, preserve the draft and ask the user to loosen constraints. Catalog tags and assumed opening geometry may differ from real products; caution messages stay visible with each proposal.

## Verification

`npm run test:run` includes recommendation fixtures for valid catalog proposals, all four lifestyles, source immutability, preserved sizes/poses, locked items in new designs, connected walking access, missing-door warnings and invalid/tiny rooms. Browser verification covers the worker, comparison, keyboard activation, preview versus autosave, application, reload and final confirmation at desktop and mobile sizes. Existing backend API functions are unchanged.
