# Phase 100: Games format, exercise route overhaul, and session editor route UX — Specification

**Created:** 2026-04-21
**Ambiguity score:** 0.14
**Requirements:** 5 locked

## Goal

Coaches can author sessions that include games-style warmup blocks with custom titles and games-route exercises, while the existing exercise route codes become easier to read across all surfaces via friendly Spanish display labels.

## Background

The session authoring pipeline today has a fixed set of formats in the `formats` table (name, type, description — e.g. "Acropolis" from migration 0028), INITIUM-role blocks that render with a static "Warm Up" label in the PDF (`session-pdf-builder.ts:336`, `buildInitiumPage`), and 30 route codes listed in `el-templo-admin/src/pages/ExercisesPage.vue:648` (`createRouteOptions`). These short codes (PL, FL, HT, HSPU, MU, TTB, OAP, OAR, PLPU, PIKE, etc.) are referenced by hardcoded string in `seed-spom.ts`, `exercise-swap-service.ts`, `goal-plans/constants.ts`, and `rom-generator.ts` — they are canonical identifiers, not labels.

Triggers: the head coach requested the ability to run warmup games with free-form titles, track games-specific exercises as a category, and surface route names that are easier for staff to remember than two-letter codes.

## Requirements

1. **New `games` format**: A new row in the `formats` table, selectable from the admin session editor's format picker, with three independently optional parameters.
   - Current: The `formats` table contains existing entries (Acropolis, etc.) each enforcing type-specific params. No format permits all-optional parameters.
   - Target: A `games` format exists with `name='games'` (exact casing TBD in discuss-phase), usable in any block role. In the session editor, selecting `games` exposes three inputs — reps, time, rounds — all optional. The block persists whichever of the three the coach fills in (including none) via `format_params` JSON.
   - Acceptance: Creating a session block with format=`games` and only a `rounds` value stored round-trips correctly (DB → editor reload → PDF). Creating a block with all three fields empty also persists and reloads without error.

2. **INITIUM block custom title**: INITIUM-role blocks accept a per-block free-text title that replaces the default "Warm Up" label across the PDF and admin editor.
   - Current: INITIUM blocks have no `custom_title` column; the PDF builder hardcodes the "Warm Up" heading (`session-pdf-builder.ts:336`). The editor shows "Warm Up" fixed.
   - Target: A new optional `custom_title` column exists on `session_blocks` (migration). When set and role=INITIUM, the PDF heading renders `Initium - {custom_title}`; when null/empty, existing "Warm Up"/Initium default is preserved. Editor exposes a text input on INITIUM blocks.
   - Acceptance: Setting `custom_title='Flow Tag'` on an INITIUM block produces a PDF heading reading `Initium - Flow Tag`. Leaving it null produces the current default output byte-for-byte unchanged.

3. **New `games` exercise route**: `games` is added to the route options available both in the admin exercises catalog and in the session editor's route picker.
   - Current: `createRouteOptions` (ExercisesPage.vue:648) enumerates 30 routes with no `games` entry. The session editor block-creation route picker reads the same (or parallel) list.
   - Target: `games` appears in both admin surfaces. Exercises can be created/edited with `route='games'` without any block-role restriction. Existing backend validation (JSON-schema/Zod) accepts `games` as a valid route value.
   - Acceptance: Creating an exercise with route=`games` via the admin exercises page succeeds and the exercise appears filtered under the `games` route. Creating a session block with route=`games` in any role (INITIUM, NUCLEUS, etc.) succeeds.

4. **Friendly Spanish route labels (dual-display in admin)**: A mapping from every current route code to a friendly Spanish display label exists and is applied across all user-facing surfaces, without altering the canonical code stored in the DB or referenced in code.
   - Current: Route codes are shown as raw short codes in admin (filter dropdown, table column, create dialog), session editor, session PDF, and the member app. No mapping layer exists.
   - Target: A single mapping dictionary (e.g. `routeLabels: Record<RouteCode, string>`) is defined once and consumed by: (a) admin exercises page, (b) admin session editor, (c) session PDF builder, (d) member app. In the **admin** surfaces the display renders as `{SpanishLabel} ({CODE})` (both visible). In the **PDF and member app** only the Spanish label is shown. The mapping includes an entry for `games`.
   - Acceptance: For any existing route code, the admin exercises page filter dropdown shows both the Spanish label and the short code in parens. The PDF and member-app renderings show only the Spanish label. DB queries and API payloads still use short codes — no canonical identifier changed.

5. **Session editor route picker includes all routes + games**: The route dropdown in the admin session editor shows the same set of routes as the admin exercises page, including the new `games` route and the Spanish labels.
   - Current: The session editor route picker's option source may differ from `createRouteOptions`; the new `games` route and the new label mapping need to be wired.
   - Target: The session editor route picker reads from the canonical route list (including `games`) and renders via the same label mapping as the rest of admin. Selecting any route, including `games`, creates a valid session block.
   - Acceptance: Opening the session editor, the route picker shows all existing routes plus `games`, each rendered as `{SpanishLabel} ({CODE})`. Saving a block with any selected route persists correctly.

## Boundaries

**In scope:**

- New `games` row in `formats` table + migration
- New `custom_title` optional column on `session_blocks` + migration
- New `games` entry in the route options list
- Route label mapping (short code → Spanish) as a shared constants/module
- Admin exercises page consumes the mapping (filter, table, create/edit dialog) with dual display
- Admin session editor consumes the mapping with dual display; route picker includes `games`
- Session PDF builder consumes the mapping (Spanish label only) and renders `Initium - {custom_title}` when set
- Member app consumes the mapping (Spanish label only) wherever exercise routes are shown
- Games format params persistence (reps/time/rounds optional, JSON via existing `format_params`)
- Games route available in all session block roles (no role restriction)

**Out of scope:**

- Renaming the canonical route codes stored in DB or code — the codes stay as-is; only display labels change
- Changing the existing format definitions (EMOM, AMRAP, Acropolis, etc.) — games is additive
- A picker/preset list for INITIUM custom titles — title is free text only
- Consolidating or splitting route codes (e.g. PL+PLPU → "Plancha") — each code gets its own label
- Games-specific exercise pool or routing logic in the generator/SPOM — games is only a category for manual session authoring
- Admin UI to create/edit formats — `games` is seeded via migration like other formats
- Analytics/tracking on games-format usage — not a deliverable of this phase
- Backfilling the Spanish mapping to already-generated session PDFs — the mapping applies to newly-rendered PDFs only (existing cached PDFs unchanged)

## Constraints

- Short code values in `exercises.route`, `session_blocks.route`, SPOM seed, goal-plans constants, ROM generator, and exercise-swap service are immutable in this phase — any change there is out of scope
- Label mapping must be defined in one location and imported; duplicating the dictionary across apps is rejected
- `format_params` JSON structure for games must be backward-compatible with the existing per-format param convention (do not introduce a new column)
- `custom_title` column must be nullable — existing INITIUM blocks (all of them) must render identically when the field is null
- If the PDF has an existing test snapshot, the null-`custom_title` case must match the prior snapshot byte-for-byte

## Acceptance Criteria

- [ ] `games` format exists in the `formats` table after migration; selectable in session editor
- [ ] Session block with format=`games` persists any subset of {reps, time, rounds} (including none) and round-trips through DB → editor → PDF
- [ ] `custom_title` column exists on `session_blocks`, nullable, defaulting to NULL
- [ ] INITIUM block with `custom_title='X'` renders PDF heading `Initium - X`; with null renders identical to pre-phase output
- [ ] `games` appears in admin exercises route filter and create dialog
- [ ] Exercise can be created with `route='games'` and listed under the games filter
- [ ] Session block can be created with `route='games'` in any role
- [ ] Route label mapping is defined in exactly one source-of-truth module
- [ ] Admin exercises page and session editor render routes as `{SpanishLabel} ({CODE})`
- [ ] Session PDF and member app render routes as `{SpanishLabel}` only (no short code)
- [ ] DB queries, API request bodies, and API responses continue to use short codes (no identifier change on the wire)
- [ ] Integration tests for the exercises and scheduling modules pass (existing + new tests for games format, route=games, custom_title)

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                     |
| ------------------- | ----- | ----- | ------ | --------------------------------------------------------- |
| Goal Clarity        | 0.90  | 0.75  | ✓      | 5 parts explicitly scoped; rename clarified as label-only |
| Boundary Clarity    | 0.90  | 0.70  | ✓      | Out-of-scope list explicit; canonical codes locked        |
| Constraint Clarity  | 0.85  | 0.65  | ✓      | Mapping single-source; null custom_title byte-identical   |
| Acceptance Criteria | 0.75  | 0.70  | ✓      | 12 pass/fail criteria                                     |
| **Ambiguity**       | 0.14  | ≤0.20 | ✓      |                                                           |

## Interview Log

| Round | Perspective     | Question summary                                      | Decision locked                                                                |
| ----- | --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1     | Researcher      | Keep 5 parts bundled or split route rename?           | All 5 in phase 100                                                             |
| 1     | Researcher      | Coach has Spanish mapping ready?                      | Rename is display-only; canonical short codes stay; mapping is friendly labels |
| 2     | Boundary Keeper | Which surfaces show Spanish labels?                   | Admin (with short code), session editor, PDF, member app; admin shows both     |
| 2     | Simplifier      | INITIUM title: per-block free text vs preset list?    | Per-block free text, rendered as `Initium - {text}`                            |
| 3     | Boundary Keeper | Games route restricted to warmup or available all?    | Available in all block roles (no restriction)                                  |
| 3     | Simplifier      | Games format — which params editable, which required? | All 3 (reps, time, rounds) optional; any combination including none is valid   |

---

_Phase: 100-games-format-exercise-route-overhaul-and-session-editor-rout_
_Spec created: 2026-04-21_
_Next step: /gsd-discuss-phase 100 — implementation decisions (mapping location, column type for custom_title, validation layer for games format params, member-app consumer strategy, etc.)_
