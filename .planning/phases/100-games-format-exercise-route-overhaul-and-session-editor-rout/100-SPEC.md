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

2. **INITIUM block custom title**: INITIUM-role blocks accept a per-block free-text title that customizes the PDF subtitle.
   - Current: INITIUM blocks have no `custom_title` column. The PDF page for an INITIUM block shows a huge literal 'PYROS' title (`session-pdf-builder.ts:344`) followed by a subtitle `INITIUM · {formatName}` (`:353-356`). The subtitle is what coaches informally call the "warm up" label.
   - Target: A new optional `custom_title` column exists on `session_blocks` (migration). When set and role=INITIUM, the PDF subtitle renders as just `{custom_title}` alone, replacing the default `INITIUM · {formatName}` subtitle. The huge 'PYROS' heading is unchanged. When `custom_title` is null/empty, the subtitle remains `INITIUM · {formatName}` byte-identical to pre-phase output. Editor exposes an always-visible free-text input at the top of each INITIUM block card.
   - Acceptance: Setting `custom_title='Flow Tag'` on an INITIUM block produces a PDF subtitle of just `Flow Tag` with the big 'PYROS' heading unchanged. Leaving `custom_title` null produces the pre-phase output byte-for-byte.

3. **New `games` exercise route**: `games` is added to the route options available both in the admin exercises catalog and in the session editor's route picker.
   - Current: `createRouteOptions` (ExercisesPage.vue:648) enumerates 30 routes with no `games` entry. The session editor block-creation route picker reads the same (or parallel) list.
   - Target: `games` appears in both admin surfaces. Exercises can be created/edited with `route='games'` without any block-role restriction. Existing backend validation (JSON-schema/Zod) accepts `games` as a valid route value.
   - Acceptance: Creating an exercise with route=`games` via the admin exercises page succeeds and the exercise appears filtered under the `games` route. Creating a session block with route=`games` in any role (INITIUM, NUCLEUS, etc.) succeeds.

4. **Friendly Spanish route labels (scoped to member-facing surfaces + admin editor hint)**: A mapping from every current route code to a friendly Spanish display label exists and is applied to member-facing surfaces and as a hover hint in the admin session editor, without altering the canonical code stored in the DB or referenced in code.
   - Current: Route codes are shown as raw short codes everywhere — admin exercises list/filter, admin session editor, session PDF, and member app. No mapping layer exists.
   - Target: A mapping dictionary (short code → Spanish label) is consumed by: (a) **session PDF builder** — renders Spanish label only; (b) **member app** — renders Spanish label only; (c) **admin session editor route picker** — renders short code as primary label with the Spanish label surfaced as a tooltip on hover. The admin exercises page (filter, table, create/edit dialog) and the admin sessions list render short codes only, unchanged from today. The mapping includes an entry for `games`. It is duplicated per consuming app (admin + member) with code-review discipline to catch drift; no shared package.
   - Acceptance: PDF and member-app renderings show only the Spanish label. Admin exercises page and admin sessions list show only the short code (no visible mapping). Admin session editor route picker shows short codes with the Spanish label surfaced as a tooltip on hover. DB queries and API request/response payloads continue to use short codes — no canonical identifier changed.

5. **Session editor route picker includes all routes + games (with Spanish tooltip)**: The route dropdown in the admin session editor shows the same set of routes as the admin exercises page, including the new `games` route, with a Spanish tooltip on hover.
   - Current: The session editor route picker renders short codes only without any label hint. No `games` option.
   - Target: The session editor route picker reads from the canonical route list (including `games`). Each option renders the short code as the visible label; hovering exposes a tooltip with the Spanish label from the mapping. Selecting any route, including `games`, creates a valid session block.
   - Acceptance: Opening the session editor, the route picker shows all existing routes plus `games`, each rendered with the short code as label and the Spanish label on hover. Saving a block with any selected route persists correctly.

## Boundaries

**In scope:**

- New `games` row in `formats` table + migration
- New `custom_title` optional column on `session_blocks` + migration
- New `games` entry in the route options list
- Route label mapping (short code → Spanish) duplicated per consuming app (admin + member), maintained via code-review discipline
- Admin session editor route picker renders short codes + Spanish label as hover tooltip; picker includes `games`
- Session PDF builder consumes the mapping (Spanish label only). INITIUM block: huge 'PYROS' heading unchanged; subtitle becomes just `{custom_title}` when set, else `INITIUM · {formatName}` unchanged
- Member app consumes the mapping (Spanish label only) wherever exercise routes are shown
- Admin exercises list and admin sessions list remain short-code only (no mapping consumed there) — unchanged from today
- Games format params persistence (reps/time/rounds optional, JSON via existing `format_params`) — wired into existing `FormatParamsEditor` via new `defaultsMap` entry
- Custom_title input: always-visible free-text field at the top of the INITIUM block card
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
- Route label mapping is duplicated per consuming app (admin + member). Each copy must contain the same keys and same Spanish labels; drift between copies is prevented by PR review, not infra
- `format_params` JSON structure for games must be backward-compatible with the existing per-format param convention (do not introduce a new column)
- `custom_title` column must be nullable — existing INITIUM blocks (all of them) must render identically when the field is null
- If the PDF has an existing test snapshot, the null-`custom_title` case must match the prior snapshot byte-for-byte

## Acceptance Criteria

- [ ] `games` format exists in the `formats` table after migration; selectable in session editor
- [ ] Session block with format=`games` persists any subset of {reps, time, rounds} (including none) and round-trips through DB → editor → PDF
- [ ] `custom_title` column exists on `session_blocks`, nullable, defaulting to NULL
- [ ] INITIUM block with `custom_title='X'` renders PDF subtitle `X` (alone) with 'PYROS' heading unchanged; with null renders `INITIUM · {formatName}` subtitle byte-identical to pre-phase output
- [ ] INITIUM block card in the session editor exposes an always-visible free-text input for `custom_title`
- [ ] `games` appears in admin exercises route filter and create dialog
- [ ] Exercise can be created with `route='games'` and listed under the games filter
- [ ] Session block can be created with `route='games'` in any role
- [ ] Route label mapping duplicated in `el-templo-admin/src/constants/route-labels.ts` and `el-templo-app/src/constants/route-labels.ts` with identical keys and values
- [ ] Admin exercises list and admin sessions list render routes as short codes only (no Spanish label visible)
- [ ] Admin session editor route picker renders short codes with Spanish label surfaced as a tooltip on hover
- [ ] Session PDF and member app render routes as `{SpanishLabel}` only (no short code visible)
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
