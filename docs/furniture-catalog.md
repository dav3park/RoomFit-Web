# Furniture catalog generation

The checked-in JSON files under `src/data/furniture` are the runtime source for
the Vite application. `catalog.json` and the Backend catalog resource are
deterministic generated views of those files; neither production runtime reads
the workspace-only `_incoming` directory.

Regenerate both manifests from the checked-in runtime assets:

```bash
npm run catalog:generate
```

Import a reviewed incoming archive, copy its runtime assets into the Web
project, and regenerate both manifests:

```bash
node scripts/generateFurnitureCatalog.mjs \
  --source ../_incoming/roomfit-furniture-json \
  --backend-root ../RoomFit-Backend \
  --copy-assets
```

Inputs:

- `materials.json`
- `variants/*.json` for checked-in assets, or `furniture/*.json` for an incoming archive

Outputs:

- `src/data/furniture/materials.json`
- `src/data/furniture/variants/*.json`
- `src/data/furniture/catalog.json`
- `../RoomFit-Backend/src/main/resources/catalog/furniture-catalog.json`

Product IDs are generated as `<variantId>-01`. The four established desk IDs
therefore remain unchanged. The generated `sourceHash` is based on normalized,
sorted JSON content rather than file timestamps or formatting.

## 193-model catalog and installation policies

The 2026-10-18 catalog retains the original 93 variants and adds C001–C100 as
`expansion-c001`–`expansion-c100`. Import the reviewed 100-model archive with:

```sh
node scripts/importExpansionFurniture.mjs --archive /path/to/roomfit-new-100.zip
npm run catalog:generate
```

`expansionMetadata.json` assigns service style/lifestyle tags and existing type
codes. `placementMetadata.json` declares installation modes, role hints, source
dimensions and authored support surfaces; the generator embeds these policies in
both catalogs and includes them in `sourceHash`. Geometry supports mesh, profile
and sweep parts alongside the existing primitives. Runtime and build footprint
calculation share `sculptedFurnitureGeometry.mjs`.

Models are emitted as separate JSON assets and requested only when needed.
Failed requests can be retried without adding furniture or reloading the page.
Glass, chrome and other protected materials retain their original appearance.
