# Static Assets

Panallet pipes static files (images, fonts, SVGs) through a content-addressed
pipeline: each file lands at `/assets/<stem>.<hash12>.<ext>` at build time,
referenced from components via typed URL constants. No strings. No path chasing.
No runtime resolution.

Two shapes, same machinery.

## Per-component: `assets = [...]`

When an asset is local to one component, declare it alongside the source:

```python
# components/Header/BUILD
react_component(
    name = "Header",
    srcs = ["Header.tsx"],
    assets = ["logo.svg"],
)
```

```tsx
// Header.tsx
import { logoUrl } from "./Header.assets";

export function Header() {
  return <img src={logoUrl} alt="Acme" width={120} height={32} />;
}
```

The macro generates `Header.assets.ts` next to the source, content-hashes
`logo.svg`, and bakes the hashed URL into the `logoUrl` constant. Renaming
`Header.tsx` means the generated file follows — no dangling imports.

## Shared bundle: `asset_library`

For an icon pack or font family shared across multiple components:

```python
asset_library(
    name = "icons",
    srcs = glob(["icons/*.svg"]),
    visibility = ["//my_app:__subpackages__"],
)

react_component(
    name = "Toolbar",
    srcs = ["Toolbar.tsx"],
    deps = [":icons"],
)
```

```tsx
// Toolbar.tsx
import { saveUrl, trashUrl } from "./icons";
```

The library emits `icons.ts` once; every dependent consumer imports from it.
No duplicated codegen, no “which `.assets.ts` owns this icon?”

## Identifier derivation

Filenames become TypeScript export identifiers deterministically:

| Filename | Export |
|---|---|
| `logo.svg` | `logoUrl` |
| `icon-large.png` | `iconLargeUrl` |
| `site_logo.svg` | `siteLogoUrl` |
| `Inter.woff2` | `interUrl` |
| `2024-banner.png` | `_2024BannerUrl` |
| `my photo.jpg` | `myPhotoUrl` |

Rules: drop extension, split on non-alphanumeric runs, camelCase-join, prefix
`_` when starting with a digit, append `Url`. Two filenames that produce the
same identifier (`logo.svg` + `logo.png`) fail the build with a clear error.

## URL scheme + caching

Every asset lands at `/assets/<stem>.<hash12>.<ext>`. The 12-char sha256 prefix
gives ~10⁻¹⁰ collision probability at 1k assets — the safe middle between
Webpack's 20 and common 8-hex conventions that break at scale.

Because the URL changes when the bytes change, prod servers can ship these
with `Cache-Control: public, max-age=31536000, immutable`.

## Dev vs prod

- **`bazel run :app_devserver`** — the devserver reads the app-level asset
  manifest produced by `asset_pipeline` and serves `/assets/*` from a flat
  runfiles dir. MIME types are set for svg/png/webp/woff2 etc.
- **`bazel build :app_bundle`** — esbuild bakes URL strings into the bundle
  (it never sees the binaries as imports). The asset tree rides as a `data`
  dep; deploy it under `/assets/` at the web root.

Both paths serve identical URLs, so a prod smoke test catches anything the
dev server misses.

## Out of scope

- **StyleX `url()`**. Use React-attribute level (`<img src={logoUrl} />`)
  rather than embedding URLs in CSS rules. Supporting `url()` would require
  teaching the StyleX Babel plugin about the asset manifest — tracked as a
  future enhancement.
- **Asset-specific optimization** (image compression, SVG minification,
  font subsetting). Run those upstream before declaring the file.
- **Runtime-loaded assets** (e.g. `import(\`./assets/${locale}.json\`)`).
  The current pipeline is static-only.

## Internals

- `//devtools/build/tools/hash_and_copy` — general Go CLI; reads bytes,
  writes `<stem>.<hash12>.<ext>`, emits per-leaf manifest JSON.
- `_hash_assets` — Bazel rule wrapping the Go tool into a TreeArtifact +
  manifest file.
- `asset_codegen` — emits the typed `.ts` module from a manifest.
- `asset_pipeline` — app-level aggregator over `assets_aspect` +
  `asset_manifest_aspect` (see `_artifact_aspect.bzl`).
