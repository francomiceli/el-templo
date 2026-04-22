---
phase: 100
plan: 5
subsystem: admin / pdf-pipeline
tags: [admin, pdf, custom-title, route-labels, initium, session-builder]
requires:
  - 100-01 (session_blocks.custom_title column + games format row)
  - 100-03 (PATCH /admin/sessions/:sid/blocks/:bid/custom-title endpoint)
  - 100-04 (admin getRouteLabel dictionary + SessionBlock.customTitle TS field)
provides:
  - pdf-initium-customTitle-subtitle
  - pdf-spanish-route-labels-on-level-headers
  - PdfBlockPage.customTitle-field
  - PdfLevelBlock.routeLabel-field
affects:
  - el-templo-admin/src/utils/pdf/pdf-types.ts (via PdfBlockPage + PdfLevelBlock extensions)
  - el-templo-admin/src/utils/pdf/session-data-transformer.ts (via customTitle propagation + routeLabel pre-resolution)
  - el-templo-admin/src/utils/pdf/session-pdf-builder.ts (via conditional subtitle + getRouteLabel consumption)
tech-stack:
  added: []
  patterns:
    - conditional-subtitle-with-byte-identical-fallback
    - pre-resolved-display-label-on-transformer-boundary
    - dead-code-removal-after-dictionary-consolidation
key-files:
  created: []
  modified:
    - el-templo-admin/src/utils/pdf/pdf-types.ts
    - el-templo-admin/src/utils/pdf/session-data-transformer.ts
    - el-templo-admin/src/utils/pdf/session-pdf-builder.ts
decisions:
  - Chose the "routeLabel field on PdfLevelBlock" approach over inline getRouteLabel() at every render site. Rationale: mirrors the member-app pattern (translation at the display boundary, once), keeps the rendering code declarative, and makes the pipeline self-documenting. PdfLevelBlock.route still carries the canonical short code for any non-display consumer.
  - Removed the legacy English ROUTE_NAMES map + getRouteName() helper from session-pdf-builder.ts — it's now dead code since every call site consumes the Spanish routeLabel. Keeping it would have introduced a silent fork (English vs Spanish dictionaries) that the next refactor would have to untangle.
  - DeuterosLevelCol preserves the "collapse-to-short-code when the name is very long" behavior, but uses 18 chars as the threshold for the Spanish labels (vs. the old 10-char threshold tuned for English names like "Nordic Curl"). The longest Spanish label is "Hefesto / Fondo imposible" (25 chars); most fit well under 18.
  - customTitle fallback expression copied verbatim from the pre-phase file to guarantee byte-identical null output (U+00B7 middle-dot, double spaces, same fontSize/margin/characterSpacing/font/color).
  - customTitle propagated with `?? null` to normalize undefined/null/"" into a single null sentinel — keeps the PdfBlockPage surface predictable for downstream consumers.
metrics:
  duration_minutes: ~18
  tasks_completed: 1
  files_created: 0
  files_modified: 3
  completed: 2026-04-21
---

# Phase 100 Plan 05: PDF customTitle Subtitle + Spanish Route Labels — Summary

## One-liner

Wired `custom_title` end-to-end into the PDF pipeline (INITIUM subtitle renders the title alone when set, byte-identical INITIUM · format fallback when null) and consolidated PDF route labels onto the Spanish `getRouteLabel` dictionary by pre-resolving `routeLabel` on `PdfLevelBlock` at the transformer boundary; removed the legacy English ROUTE_NAMES local helper.

## Outcome

- `PdfBlockPage.customTitle?: string | null` added. JSDoc calls out the Phase 100 semantics.
- `PdfLevelBlock.routeLabel: string` added as a non-optional, pre-resolved display label. `PdfLevelBlock.route` remains for any non-display consumer.
- `session-data-transformer.ts` imports `getRouteLabel` once and pre-resolves `routeLabel` inside `blockToLevelBlock`. Both INITIUM push sites (ROM and non-ROM) propagate `customTitle: initium.customTitle ?? null`.
- `session-pdf-builder.ts buildInitiumPage` subtitle is a ternary: `block.customTitle && block.customTitle.length > 0 ? block.customTitle : `${block.role} · ${block.formatName}``. Font size 130, bold, color GOLD, margin `[260, 24, 0, 0]`, characterSpacing 6, font NunitoSans — all preserved verbatim. The fallback expression was copied byte-for-byte from the pre-phase file (U+00B7 middle-dot, two spaces each side, same interpolation order).
- `buildLevelBox` consumes `lb.routeLabel || getRouteLabel(lb.route)` for the "NIVEL α | Route Intensity%" header.
- `buildDeuterosLevelCol` consumes `lb.routeLabel` with a length>18 fallback to the short code (preserves the "long name collapses to code" behavior, tuned for Spanish label lengths).
- Legacy `ROUTE_NAMES` map and `getRouteName()` helper removed from `session-pdf-builder.ts` — no more English-label drift risk.
- PYROS heading (fontSize 260, Cinzel, NAVY, margin [250, 0, 0, 0], characterSpacing 20) — unchanged.
- NIVEL row (α Δ Σ Ω), exercise list, format params, mobility row, grid page header, DEUTEROS headers, closing quote page — all untouched.
- Import added: `import { getRouteLabel } from 'src/constants/route-labels';` in both `session-data-transformer.ts` and `session-pdf-builder.ts`.

## PDF Sites Updated (Route Label Translation)

| Site                           | Function                                        | Before                                                        | After                                                                                    |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Grid page level box header     | `buildLevelBox` (line ~439)                     | `getRouteName(lb.route)` (English)                            | `lb.routeLabel \|\| getRouteLabel(lb.route)`                                             |
| DEUTEROS 4-column level header | `buildDeuterosLevelCol` (line ~642)             | `getRouteName(lb.route)`, fallback to `lb.route` at >10 chars | `lb.routeLabel` (Spanish), fallback at >18 chars                                         |
| ROM zone columns               | `buildRomBlockPage` via transformer (line ~360) | no route text rendered per-tier (tier label only)             | unchanged — ROM tier labels stay Spanish-Basico/Avanzado; route text isn't rendered here |

**Sites NOT updated (intentional):**

- INITIUM simple exercise list — no route text, renders `• {exerciseName}  ·  {prescription}` per member pattern.
- Block header (`${block.role}  ·  ${block.formatName}` on grid/deuteros pages) — this is role+format, not route. Unchanged.
- Mobility row — renders mobility exercise name, not route code. Unchanged.

## Tasks Executed

| Task | Description                                                                                                                                                                  | Commit     | Files                                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Extend PdfBlockPage + PdfLevelBlock; propagate customTitle at both INITIUM sites; conditional subtitle; Spanish route labels via routeLabel field; remove legacy ROUTE_NAMES | `d0bf51ac` | `el-templo-admin/src/utils/pdf/pdf-types.ts`, `el-templo-admin/src/utils/pdf/session-data-transformer.ts`, `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` |

## Acceptance Criteria — Verification

- [x] `grep -c "customTitle" el-templo-admin/src/utils/pdf/pdf-types.ts` → `1` (single field declaration with JSDoc)
- [x] `grep -c "customTitle: initium.customTitle" el-templo-admin/src/utils/pdf/session-data-transformer.ts` → `2` (ROM + non-ROM)
- [x] `grep -c "block.customTitle" el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `2` (ternary condition + comment)
- [x] `grep -cE '\$\{block\.role\}  ·  \$\{block\.formatName\}' el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `3` (INITIUM fallback + grid page header + DEUTEROS half header — all three use the same U+00B7 middle-dot double-space pattern; ≥1 required). INITIUM fallback verified byte-identical against the pre-phase file line 354.
- [x] `grep -c "text: 'PYROS'" el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `1` (PYROS heading preserved)
- [x] `grep -c "fontSize: 260" el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `1` (PYROS fontSize preserved)
- [x] `grep -c "fontSize: 130" el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `2` (subtitle + grid page block header — unchanged pre-phase count)
- [x] `grep -c "margin: \[260, 24, 0, 0\]" el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `1` (subtitle margin preserved verbatim)
- [x] `grep -c "characterSpacing: 6" el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `6` (subtitle + 5 other pre-existing sites, ≥1 required)
- [x] `grep -c "getRouteLabel" el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `5` (1 import + 2 render calls + 2 comments, ≥1 required)
- [x] `grep -c "from 'src/constants/route-labels'" el-templo-admin/src/utils/pdf/session-pdf-builder.ts` → `1` (1 import; a second comment hit is a substring match but the exact-literal count is 1)
- [x] Clean-approach branch: `grep -c "routeLabel" el-templo-admin/src/utils/pdf/pdf-types.ts` → `1` AND `grep -c "routeLabel" el-templo-admin/src/utils/pdf/session-data-transformer.ts` → `1` (routeLabel field + pre-resolution)
- [x] No new `any` types introduced.
- [x] `cd el-templo-admin && pnpm lint` → 0 errors, 6 pre-existing warnings (Plan 04 baseline +0).
- [x] `cd el-templo-admin && npx vue-tsc --noEmit` → no new errors. All 3 remaining errors in session-pdf-builder.ts (pdfMake.vfs, 2× Content-margin tuple narrowing) are the pre-existing, out-of-scope errors Plan 04 already enumerated.
- [x] `cd el-templo-admin && pnpm build` → Build succeeded. SPA dist emitted.

## Must-Haves — Truth Checks

- [x] "PDF INITIUM page with customTitle='X' renders subtitle 'X' (alone) while PYROS heading is unchanged" — Verified via source inspection: the ternary returns `block.customTitle` when non-empty. PYROS literal, fontSize 260, margin [250,0,0,0], characterSpacing 20, font Cinzel — all untouched.
- [x] "PDF INITIUM page with customTitle=null renders subtitle 'INITIUM · {formatName}' byte-identical to pre-phase" — Verified via source inspection: fallback expression is `${block.role}  ·  ${block.formatName}` with U+00B7 middle-dot, two spaces each side, same interpolation order. All subtitle text-node properties (fontSize 130, bold, color GOLD, margin [260,24,0,0], characterSpacing 6, font NunitoSans) preserved.
- [x] "PDF exercise route labels show Spanish text from route-labels.ts mapping (not short codes)" — Verified via source inspection: buildLevelBox uses `lb.routeLabel || getRouteLabel(lb.route)`; buildDeuterosLevelCol uses `lb.routeLabel` with long-name collapse.
- [x] "Member-app route rendering and PDF route rendering use the identical Spanish label strings" — Both apps' dictionaries are byte-identical on keys and values (Plan 04 SUMMARY verified this via diff). PDF now consumes the admin-side dictionary, which shares the same string values with the member-app dictionary.

## Deviations from Plan

### 1. [Rule 3 — Cleanup] Removed legacy `ROUTE_NAMES` + `getRouteName` from session-pdf-builder.ts

**Found during:** Task 1, post-lint.

**Issue:** After replacing both call sites (`buildLevelBox`, `buildDeuterosLevelCol`) with `routeLabel`-based reads, the local `ROUTE_NAMES` map (24 entries, English) and the `getRouteName()` helper had zero references. ESLint flagged `getRouteName` as unused. Leaving it would:

- Fork the route-label dictionary (admin has 2: English in session-pdf-builder + Spanish in route-labels.ts).
- Invite the next refactor to accidentally re-introduce English labels.
- Violate CLAUDE.md's DRY preference ("Flag repetition aggressively").

**Fix:** Removed the map and the helper (27 lines deleted, replaced with a 4-line comment explaining why they're gone and where to read the Spanish dictionary instead).

**Files modified:** `el-templo-admin/src/utils/pdf/session-pdf-builder.ts`

**Commit:** `d0bf51ac`

**Impact:** Net -27 LoC; no behavior change because both call sites already use `routeLabel`. The single source of truth for PDF route labels is now `el-templo-admin/src/constants/route-labels.ts`.

### 2. [Rule 2 — Correctness] DEUTEROS long-name collapse threshold retuned for Spanish labels

**Found during:** Task 1, Step 4.

**Issue:** The pre-phase `buildDeuterosLevelCol` had this guard:

```typescript
text: `  |  ${getRouteName(lb.route).length > 10 ? lb.route : getRouteName(lb.route)} ${lb.intensity}%`,
```

It collapsed to the short code when the English label exceeded 10 chars (e.g., "Nordic Curl" = 11 chars → collapsed to "NC"). Keeping the 10-char threshold with the Spanish dictionary would collapse almost every label — "Front Lever" = 11, "Plancha" = 7 (OK), "Dominadas a pecho" = 17, etc. That would regress Requirement 4 (Spanish labels on PDF) back toward short codes for most routes.

**Fix:** Raised the threshold to 18 chars and refactored the ternary into a named `routeDisplay` variable for readability. This keeps short-code fallback ONLY for the genuinely long multi-route labels (e.g., "Manna / Planche invertida" = 25 chars, "Hefesto / Fondo imposible" = 25 chars) where collapsing to "MN/RP" or "HD/ID" is actually the right layout call.

**Files modified:** `el-templo-admin/src/utils/pdf/session-pdf-builder.ts`

**Commit:** `d0bf51ac`

**Impact:** ~28 of 31 routes now render their full Spanish label on the 4-column DEUTEROS page; only compound "A / B" labels >18 chars collapse to short codes.

## Approach Notes

**Route translation approach chosen:** routeLabel field on PdfLevelBlock (the "clean" option per the plan). Rationale:

- Mirrors the member-app pattern: resolve the display label once at the data→view boundary, not per render call.
- Makes the PDF builder self-documenting: `lb.routeLabel` is obviously the display string; `lb.route` is obviously the canonical code.
- Keeps `getRouteLabel` imports minimal — one in the transformer for pre-resolution, one in the builder for the buildLevelBox safety fallback.
- Removes the need for per-site import of route-labels in the builder's multiple render functions.

The "inline getRouteLabel at every render site" alternative was considered and rejected: it would have scattered 2–4 import sites, required every future render function to remember to translate, and coupled the rendering code to the dictionary's identity.

## Visual Regressions Observed

**Checkpoint auto-accepted (AFK chain).** Source-level byte-identical verification of the null case passes:

- The fallback template literal matches the pre-phase file at the token level.
- Every adjacent text-node property (fontSize 130, bold, color GOLD, margin [260,24,0,0], characterSpacing 6, font 'NunitoSans') is preserved in source.
- PYROS heading (fontSize 260, Cinzel, NAVY, margin [250,0,0,0], characterSpacing 20) is untouched.
- NIVEL row, exercise list, format params — unchanged.

A visual regression pass would require a running browser + a pre-phase-saved PDF; those artifacts aren't available in the autonomous chain. If a discrepancy surfaces in manual verification, the single load-bearing change is the ternary on lines ~329–335 of session-pdf-builder.ts — any drift would trace back to that ternary's fallback branch.

## Known Stubs

None.

## Threat Flags

None. This plan is additive to the PDF render pipeline. No new network surface, no new auth paths, no schema changes.

## Plan 05 ↔ Downstream

Phase 100 has no Plan 06. This plan closes Requirement 2 (INITIUM custom title in PDF) and Requirement 4 (Spanish labels on PDF) — both required for the phase-level acceptance criteria.

## Self-Check: PASSED

Files verified to exist:

- FOUND: `el-templo-admin/src/utils/pdf/pdf-types.ts`
- FOUND: `el-templo-admin/src/utils/pdf/session-data-transformer.ts`
- FOUND: `el-templo-admin/src/utils/pdf/session-pdf-builder.ts`

Commit verified via `git log --oneline`:

- FOUND: `d0bf51ac` feat(100-05): PDF customTitle subtitle + Spanish route labels
