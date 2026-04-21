# Phase 100: Games format, exercise route overhaul, and session editor route UX — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 100-games-format-exercise-route-overhaul-and-session-editor-rout
**Areas discussed:** Route label mapping distribution, Spanish label surfacing, Games format params UI, INITIUM custom_title UX, PDF rendering of custom_title

---

## Gray Area Selection

| Option                                       | Description                                                      | Selected |
| -------------------------------------------- | ---------------------------------------------------------------- | -------- |
| Route label mapping — storage & distribution | Dictionary consumed by 4 surfaces; no shared package today       | ✓        |
| Games format params UI pattern               | FormatParamsEditor extension vs dedicated component              | ✓        |
| INITIUM custom_title UX placement            | Always-visible input vs pencil icon vs inside FormatParamsEditor | ✓        |
| PDF rendering of 'Initium - {title}'         | Replace pattern entirely, subtitle, or merge                     | ✓        |

**User's choice:** All four.
**User notes:** "I feel spanish names should appear in members app only, and as a hint for admins but let admins still use english names in admin app"

This note prompted a SPEC-level amendment: Spanish labels are no longer applied everywhere as originally locked in SPEC.md #4. Member app and PDF use Spanish only; admin uses short codes with Spanish surfaced as a hint in specific places.

---

## Spanish Label Surfacing (refinement from user note)

| Option                                 | Description                                | Selected |
| -------------------------------------- | ------------------------------------------ | -------- |
| Tooltip on hover                       | Short code primary, Spanish on hover       |          |
| Subtitle / parenthetical under code    | Both visible always                        |          |
| Only in create/edit dialogs, not lists | Lists stay short-code; dropdowns show both |          |

**User's choice:** Custom — "exercises list keeps short codes; sessions list keeps short codes; edit sessions show the tooltip on hover"
**Notes:** Admin exercises list and sessions list are NOT mapping consumers. Only the admin session editor (when building a session) shows the Spanish tooltip. PDF and member app get Spanish labels only.

---

## PDF Label Convention

| Option                                       | Description                           | Selected |
| -------------------------------------------- | ------------------------------------- | -------- |
| Spanish only in PDF (member-facing)          | PDF matches member app convention     | ✓        |
| Short codes only in PDF (admin-facing)       | Coaches use PDF as internal reference |          |
| Both in PDF — code primary, Spanish subtitle | Hybrid                                |          |

**User's choice:** Spanish only in PDF.
**Notes:** PDF is member-facing; member-app and PDF conventions aligned.

---

## Route Label Dictionary — Storage & Distribution

| Option                                         | Description                                          | Selected |
| ---------------------------------------------- | ---------------------------------------------------- | -------- |
| Duplicated per app with code-review discipline | Two files, admin + member, same object               | ✓        |
| Shared file + TS path alias                    | Single file in API, imported via tsconfig path alias |          |
| API-served endpoint                            | `GET /api/meta/route-labels`, cached client-side     |          |

**User's choice:** Duplicated per app.
**Notes:** Pragmatic for a 30-entry static dictionary. No infra changes. Drift prevented by PR review.

---

## Games Format Params UI

| Option                                                        | Description                            | Selected |
| ------------------------------------------------------------- | -------------------------------------- | -------- |
| Extend existing FormatParamsEditor with new defaultsMap entry | Consistent with how other formats work | ✓        |
| Dedicated GamesParamsInput component                          | Isolated games logic                   |          |
| Skip UI — use exercise notes                                  | No structured params                   |          |

**User's choice:** Extend existing FormatParamsEditor.
**Notes:** `games: { reps: null, time: null, rounds: null }` in the defaultsMap. All optional numeric inputs.

---

## INITIUM custom_title UX Placement

| Option                                                 | Description              | Selected |
| ------------------------------------------------------ | ------------------------ | -------- |
| Always-visible text field at top of INITIUM block card | Zero clicks to discover  | ✓        |
| Pencil icon next to role label                         | Inline edit on click     |          |
| Inside FormatParamsEditor as pseudo-param              | Mixed with format params |          |

**User's choice:** Always-visible text field at top of INITIUM block card.
**Notes:** Placeholder suggestion: "Título del juego (opcional)". Text to be refined during implementation.

---

## PDF Rendering with custom_title

| Option                                                              | Description                                       | Selected       |
| ------------------------------------------------------------------- | ------------------------------------------------- | -------------- |
| Merge into 'Initium - {custom_title}', drop PYROS + format subtitle | Literal coach phrasing                            |                |
| Replace only the huge PYROS with custom_title, keep subtitle        | Preserves two-line layout but changes big heading |                |
| Keep PYROS + replace subtitle with 'Initium - {custom_title}'       | Preserves big visual, changes subtitle            | ✓ (with tweak) |

**User's choice:** Option 3 with a tweak — "subtitle without Initium, only custom title"
**Notes:** Final rendering: huge 'PYROS' heading unchanged; subtitle becomes just `{custom_title}` alone when set (NOT `Initium - {custom_title}`). When null, subtitle reverts to `INITIUM · {formatName}` byte-identical to today.

---

## Claude's Discretion

- Exact Spanish placeholder text for the custom_title input
- Tooltip component/styling in the admin session editor route picker (use Quasar q-tooltip)
- Typography of custom_title subtitle in PDF (keep consistent with existing subtitle visual weight)
- varchar length for `custom_title` column (recommended 100)
- Backend validation layer for accepting `games` route value
- Whether `games` format row is inserted via migration or seed (recommended migration, following 0028 precedent)

## Deferred Ideas

- Shared package infrastructure (pnpm workspaces) — `pnpm-workspace.yaml` files exist but untracked; separate infra phase
- Games-specific exercise pool / generator routing
- Custom_title preset list (instead of free text)
- Analytics on games format usage
- Backend-served route labels (API endpoint) — future if duplication cost exceeds deploy cost
- Extending Spanish tooltip to admin exercises/sessions lists — if coaches later request it

---

_Log generated: 2026-04-21_
