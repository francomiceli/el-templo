# Phase 100: Games format, exercise route overhaul, and session editor route UX — Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Coach-driven session authoring additions: a new permissive `games` format, a per-INITIUM-block `custom_title`, a new `games` exercise route, and friendly Spanish route labels surfaced on member-facing surfaces (PDF + member app) plus as a hover tooltip in the admin session editor. Admin exercises list and sessions list remain short-code only. Canonical short codes in DB and code are not changed.

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `100-SPEC.md` for full requirements, boundaries, and acceptance criteria.

SPEC.md was amended during this discussion to reflect two refinements (requirements #2 and #4, plus #5, plus in-scope/constraints/acceptance-criteria sections):

- **Requirement #2 (INITIUM custom title):** PDF rendering clarified — big 'PYROS' heading preserved; subtitle becomes just `{custom_title}` when set, else `INITIUM · {formatName}` unchanged. The "Initium - {text}" phrasing from the original coach ask was dropped in favor of standalone custom_title as subtitle.
- **Requirement #4 (Spanish route labels):** Scope narrowed. Spanish labels surface on **member app**, **session PDF**, and **admin session editor route picker (as hover tooltip)** only. Admin exercises list and admin sessions list stay short-code only. Dictionary is duplicated per app (admin + member), not single-source.
- **Requirement #5 (session editor route picker):** Tooltip rendering of Spanish label instead of inline `{SpanishLabel} ({CODE})`.

Downstream agents MUST read `100-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**

- New `games` row in `formats` table + migration
- New `custom_title` optional column on `session_blocks` + migration
- New `games` entry in the route options list
- Route label mapping (short code → Spanish) duplicated per consuming app (admin + member), maintained via code-review discipline
- Admin session editor route picker: short codes + Spanish label as hover tooltip; includes `games`
- Session PDF builder: Spanish labels only; INITIUM subtitle = `{custom_title}` when set, else `INITIUM · {formatName}`; big 'PYROS' heading unchanged
- Member app: Spanish labels only
- Admin exercises list and admin sessions list: short-code only, unchanged
- Games format params (reps/time/rounds all optional) wired via existing `FormatParamsEditor` `defaultsMap`
- Custom_title input: always-visible text field at the top of INITIUM block card
- Games route available in all session block roles

**Out of scope (from SPEC.md):**

- Renaming canonical route codes stored in DB or code
- Changing existing format definitions (EMOM, AMRAP, Acropolis, etc.)
- Picker/preset list for INITIUM custom titles — free text only
- Consolidating/splitting route codes
- Games-specific exercise pool or routing logic in the generator/SPOM
- Admin UI to create/edit formats — `games` is seeded via migration
- Analytics/tracking on games-format usage
- Backfilling Spanish mapping to already-generated PDFs

</spec_lock>

<decisions>
## Implementation Decisions

### Spanish label surfacing

- **D-01:** Member app = Spanish only. Session PDF = Spanish only. Admin session editor route picker = short code primary label, Spanish label as **hover tooltip**. Admin exercises list (filter, table, create dialog) and admin sessions list are unchanged — short codes only, no mapping consumed there.

### Route label dictionary distribution

- **D-02:** Dictionary duplicated per consuming app. Two files: `el-templo-admin/src/constants/route-labels.ts` and `el-templo-app/src/constants/route-labels.ts`. Same ~30-entry object. No shared package / no pnpm workspace adoption. Drift prevented by PR review. Rationale: dictionary changes rarely; API round-trip or tsconfig path alias is over-engineering for a 30-entry static map.

### Games format UI

- **D-03:** Extend existing `el-templo-admin/src/components/sessions/FormatParamsEditor.vue` `defaultsMap` with a new entry for `games`: `{ reps: null, time: null, rounds: null }`. Three numeric inputs render, all optional, null means empty. Consistent with how Acropolis/EMOM/AMRAP are handled today. No new component.

### INITIUM custom_title UX in session editor

- **D-04:** Always-visible free-text input at the top of the INITIUM block card (above format picker). Placeholder text TBD during implementation (suggested: "Título del juego (opcional)"). Zero clicks to discover or edit. Persists to `session_blocks.custom_title` (nullable VARCHAR, length TBD — planner to pick, recommended 100 to match `pattern` conventions but shorter is fine).

### PDF rendering of INITIUM with custom_title

- **D-05:** When `custom_title` is set on an INITIUM block, the PDF page renders:
  - Huge 'PYROS' heading: **unchanged** (still literally 'PYROS')
  - Subtitle line: just `{custom_title}` alone — replacing the default `${block.role}  ·  ${block.formatName}` (`session-pdf-builder.ts:354`)

  When `custom_title` is null/empty, the subtitle stays `INITIUM · {formatName}` byte-identical to pre-phase output. The "Initium - " prefix from the coach's original phrasing is dropped per explicit user decision ("subtitle without Initium, only custom title").

### Claude's Discretion

- Exact placeholder text for the `custom_title` input (Spanish copy) — executor picks during implementation
- Tooltip component/styling for the admin session editor route picker (Quasar has `q-tooltip`; use whatever matches existing hover patterns in admin)
- Typography of the custom_title subtitle in PDF (font size, color, margins — keep consistent with the existing subtitle visual weight in `buildInitiumPage`)
- Column type for `custom_title` (varchar length) — recommended `VARCHAR(100)` nullable
- Backend validation layer where `games` is added as a valid route value — depends on whether validation uses JSON schema, Zod, or plain type assertion; planner/executor inspects and extends accordingly
- Whether the `games` format row is inserted via migration or by extending an existing seed — recommend migration for auditability and consistency with prior format seeding (0028_format_params_rename_types.sql precedent)
- Member-app surfaces where routes currently render — planner/executor audits the member app for all render sites

### Folded Todos

None — no pending todos matched this phase's scope.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec

- `.planning/phases/100-games-format-exercise-route-overhaul-and-session-editor-rout/100-SPEC.md` — **Locked requirements — MUST read before planning**

### Schema (backend)

- `el-templo-api/src/db/schema/formats.ts` — formats table; `games` row is added here
- `el-templo-api/src/db/schema/session-blocks.ts` — `custom_title` column is added here
- `el-templo-api/src/db/migrations/0028_format_params_rename_types.sql` — precedent for seeding a format row via migration

### Session authoring (admin frontend)

- `el-templo-admin/src/components/sessions/FormatParamsEditor.vue` — defaultsMap pattern; games format entry added here
- `el-templo-admin/src/components/sessions/EditableBlockCard.vue` — INITIUM custom_title input lives here
- `el-templo-admin/src/pages/ExercisesPage.vue:648` — `createRouteOptions`; `games` added here
- `el-templo-admin/src/pages/ExercisesPage.vue:648-679` — canonical list of 30 existing route short codes

### PDF rendering (admin frontend)

- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts:336` `buildInitiumPage` — INITIUM page construction; subtitle customization lands here
- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts:344` — hardcoded 'PYROS' (preserved)
- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts:353-356` — current subtitle construction
- `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — block transformation pipeline; custom_title flows through here
- `el-templo-admin/src/utils/pdf/pdf-types.ts:32` — `blockName?: string` field; extend/replace with custom_title where appropriate

### Route label mapping (new files)

- `el-templo-admin/src/constants/route-labels.ts` — **new file**, admin copy of the dictionary
- `el-templo-app/src/constants/route-labels.ts` — **new file**, member app copy of the dictionary

### Codebase maps (structural context)

- `.planning/codebase/STRUCTURE.md` — monorepo layout; no shared package today
- `.planning/codebase/CONVENTIONS.md` — code conventions
- `.planning/codebase/STACK.md` — tech stack per app

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **FormatParamsEditor.vue `defaultsMap`** (`el-templo-admin/src/components/sessions/FormatParamsEditor.vue:723`) — add `games: { reps: null, time: null, rounds: null }` entry; existing param-rendering logic handles all-optional nullable numeric inputs
- **EditableBlockCard.vue** — already owns per-block editing; natural home for the custom_title input above the format picker
- **pdf-types.ts `blockName?`** — existing optional field pattern; can carry custom_title through the render pipeline
- **Quasar `q-tooltip`** — already used elsewhere in admin for hover hints; fits the route picker tooltip requirement

### Established Patterns

- **Monorepo without pnpm workspace adoption** — `pnpm-workspace.yaml` files are untracked across admin/api/app; no shared package exists. Duplicate constants per app is the pragmatic current pattern
- **Format row seeding via migration** — `0028_format_params_rename_types.sql` inserts `Acropolis`. New `games` row should follow the same pattern (migration, not seed script)
- **Format params as JSON on session_blocks** (`format_params json`) — games params use the same JSON shape
- **Nullable column extension pattern for backward compat** — established in Phase 59 per STATE.md; applies to `custom_title` on session_blocks

### Integration Points

- `el-templo-api/src/modules/admin/video-schemas.ts` (or equivalent for exercises route validation) — `games` added to whatever enum/schema validates `exercises.route`
- Session block save path (API → DB) — accepts new `custom_title` field (nullable); requires a new or extended schema entry
- Session PDF generation trigger (admin) — already calls `buildInitiumPage`; no new trigger needed
- Member app exercise render sites — planner audits `el-templo-app/src/` for places that currently render `route` and wires them through the new mapping

</code_context>

<specifics>
## Specific Ideas

- Coach's original ask in Spanish: "Formato games: incluye libertad de agregar repes, tiempos o rondas de ser necesario. Posibilidad de agregar un título reemplazando 'warm up'. Aparecería Initium - Flow Tag (nombre del juego). Creación de una nueva ruta de ejercicios llamada games."
- User refinement on PDF: subtitle shows just `{custom_title}`, NOT `Initium - {custom_title}` — explicit divergence from the coach's original phrasing
- User refinement on admin surfaces: short codes stay primary, Spanish only as hint in the session editor — admin exercises/sessions lists stay exactly as they are today
- "Flow Tag" in the coach's ask was an example, not a literal fixed value — custom_title is free text

</specifics>

<deferred>
## Deferred Ideas

- **Shared package for cross-app constants** — `pnpm-workspace.yaml` files are staged-but-untracked in all three apps. Adopting pnpm workspaces and migrating shared constants (including `route-labels.ts`) into a `packages/` directory is its own infra phase. Not blocking phase 100.
- **Games-specific exercise pool or generator routing** — if the generator ever needs to emit `games`-route exercises automatically (SPOM integration, ROM-style warmup generation), it belongs in a follow-up phase.
- **Custom_title preset list / picker** — if coaches want a curated list of game names (Flow Tag, Pyros, etc.) instead of free text, a follow-up phase can add that UI layer.
- **Analytics on games format usage** — tracking how often coaches use `games` and which route+format combos appear can inform product decisions. Out of scope here.
- **Backend-served route labels** — if eventually multiple clients or automation consume the mapping, moving to `GET /api/meta/route-labels` (with a client cache) is a natural follow-up when the duplication cost exceeds the deploy cost.
- **Extending the tooltip pattern to admin exercises/sessions lists** — if admins later ask for the Spanish hint on those lists too, flipping the switch is a tiny change once the dictionary is in place.

### Reviewed Todos (not folded)

None.

</deferred>

---

_Phase: 100-games-format-exercise-route-overhaul-and-session-editor-rout_
_Context gathered: 2026-04-21_
_Next step: /gsd-plan-phase 100 — implementation plan_
