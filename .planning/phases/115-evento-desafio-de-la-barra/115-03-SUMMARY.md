---
phase: 115-evento-desafio-de-la-barra
plan: 03
subsystem: bar-challenge
tags:
  - frontend
  - canvas
  - composable
  - asset
dependency-graph:
  requires: []
  provides:
    - useImageComposer composable (composeWithFrame photo + frame -> JPEG Blob)
    - marco-placeholder.png self-hosted under public/desafio-barra/
  affects:
    - Plan 115-06 (Resultado.vue will consume useImageComposer)
tech-stack:
  added: []
  patterns:
    - Pure composable (no cleanup needed — no external subscriptions)
    - Offscreen canvas (1080x1920) for photo + frame composition
    - createLogger for structured error reporting
    - Self-hosted static assets in public/ (no CDN)
key-files:
  created:
    - el-templo-app/src/modules/bar-challenge/composables/useImageComposer.ts
    - el-templo-app/public/desafio-barra/marco-placeholder.png
  modified: []
decisions:
  - Used ImageMagick (system convert) — no new pnpm deps installed
  - DejaVu Sans Bold used as system fallback for Montserrat 800 (placeholder only — path conserved for designer replacement)
  - 8-bit RGBA PNG (color-type 6) at 34KB — small enough to inline-fetch without CDN
  - canvas.toBlob wrapped in Promise; rejects on null per defensive contract
  - normalizeBase64 accepts raw base64 OR data URL prefix (Capacitor camera returns the latter)
metrics:
  duration: ~25 minutes
  completed: 2026-05-21
  tasks: 2
  files: 2
requirements:
  - R9
  - D-16
  - D-17
  - D-18
  - D-19
---

# Phase 115 Plan 03: Image Composer + Frame Placeholder Summary

One-liner: Canvas-based photo+frame composer (1080×1920 cover-centered, JPEG 0.85) plus
self-hosted placeholder PNG with gold border, logo and "Desafío de la Barra" text.

## Tasks Completed

| #   | Name                                          | Commit     | Files                                                                     |
| --- | --------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| 1   | useImageComposer composable                   | `3f186035` | `el-templo-app/src/modules/bar-challenge/composables/useImageComposer.ts` |
| 2   | Generate marco placeholder PNG 1080×1920 RGBA | `6d9135e7` | `el-templo-app/public/desafio-barra/marco-placeholder.png`                |

## Composable Signature

```ts
export function useImageComposer(): {
  composeWithFrame(photoBase64: string, framePath: string): Promise<Blob>;
};
```

Behavior:

- Creates an offscreen `<canvas>` at `1080×1920`.
- Loads the photo (accepts raw base64 or `data:` URL via `normalizeBase64`).
- Draws photo `cover`-centered:
  `scale = max(targetW/photoW, targetH/photoH)`; result centered, overflow cropped.
- Loads the frame from `framePath` and overlays at full canvas size.
- Exports via `canvas.toBlob(..., 'image/jpeg', 0.85)`, rejecting on `null`.
- Logs errors via `createLogger('image-composer').error(...)` and rethrows so the
  caller (Plan 06 `Resultado.vue`) can decide UI fallback.

Pure composable per project convention — no internal subscriptions, no `cleanup()`.

## Asset Details

- **Path:** `el-templo-app/public/desafio-barra/marco-placeholder.png`
- **Format:** PNG, 1080×1920, 8-bit RGBA (`TrueColorAlpha` / color-type 6)
- **Size:** 34,370 bytes (~34 KB)
- **Content:**
  - Transparent interior (alpha=0) so the user photo shows through
  - Gold (`#c4956a`) 4px stroke border at 24 px inset
  - "EL TEMPLO" top-center, cream (`#f0e6d6`), DejaVu Sans Bold 72 pt
  - "DESAFÍO DE LA BARRA" bottom-center, cream, DejaVu Sans Bold 64 pt
- **Verification (`identify -verbose`):**
  ```
  Colorspace: sRGB
  Type: TrueColorAlpha
  Depth: 8-bit
  ```
- **Pixel samples (alpha sanity):**
  - Center (540,960): `srgba(0,0,0,0)` — fully transparent
  - Border (24,500): `srgba(196,149,106,1)` — gold `#c4956a`
  - Outside border (10,10): `srgba(0,0,0,0)` — fully transparent

## Tool Choice — Placeholder Generation

Used **ImageMagick (`convert` 6.9.11) already installed on the system**. No new npm/pnpm
dependencies installed. The user's memory rule "never install OR update dependencies
without asking" was honored without needing an approval gate.

Font note: Montserrat 800 is the UI-SPEC font but is not present in the system font
catalogue. Fell back to **DejaVu Sans Bold** for the placeholder. The asset is a
placeholder and the path is conserved for designer replacement — the final
production PNG (when delivered) will use Montserrat 800.

## Deviations from Plan

None — plan executed exactly as written.

Lint-staged pre-commit hook initially failed once due to missing `node_modules` in the
worktree directory (eslint/prettier `ENOENT`). Resolved by symlinking the main repo's
`node_modules` into the worktree at both `node_modules` and `el-templo-app/node_modules`
(symlinks remain untracked). Not a code deviation — purely an environment fix-up so the
project's pre-commit hooks could run without `--no-verify`.

## Acceptance Criteria Audit

Composable:

- [x] `function composeWithFrame` declared (1 occurrence)
- [x] Canvas width set to 1080 (via `TARGET_WIDTH = 1080` constant + `canvas.width = TARGET_WIDTH`)
- [x] `image/jpeg` referenced (5 occurrences incl. comments, constant, JSDoc)
- [x] Zero `: any` annotations
- [x] Composable type-checks with `strict: true` against project `tsconfig.json`
      (verified via isolated `tsc --noEmit` run; only pre-existing `import.meta.env`
      error in `logger.ts` surfaced, which is environmental — Vite types are loaded
      at build time)

Asset:

- [x] File exists at `el-templo-app/public/desafio-barra/marco-placeholder.png`
- [x] `file` reports `PNG image data, 1080 x 1920, 8-bit/color RGBA, non-interlaced`
- [x] `identify` reports `TrueColorAlpha` (= color-type 6 RGBA)
- [x] Size 34,370 bytes (between 1 KB and 500 KB)
- [x] Visible content: gold border + EL TEMPLO + DESAFÍO DE LA BARRA + transparent interior

## Threat-Surface Scan

Plan threat model entries (`T-115-06`, `T-115-07`) were both `accept` dispositions and
their assumptions are honored:

- `T-115-06` (frame tampering): asset is committed to git and self-hosted from `public/`
  — no remote fetch path introduced.
- `T-115-07` (photo composition disclosure): `composeWithFrame` runs client-side on an
  offscreen canvas; no network calls made. Nothing leaves the device unless a later
  `Share.share()` is invoked (out of scope of this plan).

No new threat surface introduced beyond the registered ones.

## Self-Check: PASSED

- [x] `el-templo-app/src/modules/bar-challenge/composables/useImageComposer.ts` — FOUND
- [x] `el-templo-app/public/desafio-barra/marco-placeholder.png` — FOUND
- [x] Commit `3f186035` — FOUND
- [x] Commit `6d9135e7` — FOUND
