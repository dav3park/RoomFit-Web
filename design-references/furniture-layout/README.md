# Furniture layout references

Reviewed 2026-10-12. These sources inform placement objectives only; no external visual branding, assets or dependencies were imported.

| Primary source | Rule used in RoomFit | Limit |
| --- | --- | --- |
| [Merrell et al., Interactive Furniture Layout Using Interior Design Guidelines (Stanford/UC Berkeley, SIGGRAPH 2011)](https://paulmerrell.org/furnitureLayout2.pdf), §§2–3 | Combine clearance/circulation, pairwise distance and direction, wall alignment and visual balance; diversify good candidates rather than return near duplicates. | The paper uses GPU Monte Carlo sampling and MMR. RoomFit uses a bounded beam and pose-distance selection; weights and thresholds are ours. The paper's clearance figures are not copied into building-code claims. |
| [OSHA Computer Workstations — Workstation Environment](https://www.osha.gov/etools/computer-workstations/workstation-environment), Lighting/Glare | Prefer window light from the side of a desk/screen. | A preference, not proof of glare: screen use, glazing, blinds and solar orientation are unknown. |
| [IKEA — How should the bedroom be placed?](https://www.ikea.com.tr/en/ideas/how-should-the-bedroom-be-placed) | Prefer a quiet sleeping area; protect natural light; keep tall storage away from windows. | Search-index text verified; direct fetch timed out. Used as a qualitative design reference, not a source of clearance measurements. |
| [IKEA — Bedroom furniture and finishing details](https://www.ikea.com.cy/en/ideas/bedroom/ideas-to-decorate-a-bedroom-from-furniture-to-the-finishing-details/) | Prefer a bed headboard by a wall with access beside the bed. | Search-index text verified; direct page unavailable to the tool. Wall preference is a soft rule; layouts and local customs vary. |

Implementation: `src/recommendation/designGuidelines.ts`, `engine.ts`, `layoutValidation.ts`. Pane protection (60 cm strip, sill +5 cm threshold), functional chair pairing and structural-diversity cutoffs are explicit RoomFit working rules. Manufacturer window hinges and clearance metadata are unavailable, so recommendations do not claim exact window operability or an accessibility certification.
