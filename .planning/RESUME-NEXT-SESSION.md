# Resume — Phase 98 / 99 / 100 / 101 review

**Captured:** end of 2026-04-21 AFK chain run.
**Status:** Four phases fully executed on local `master`. Nothing pushed, nothing deployed, nothing SSH'd.

---

## Prompt to paste at the start of next session

```
Resume from .planning/RESUME-NEXT-SESSION.md. I ran phases 98, 99, 100, 101 unattended yesterday — nothing is pushed. Walk me through the review and UAT checklist so we can decide what ships.
```

That's all it needs. Claude will:

1. Re-read this file.
2. Re-read `.planning/phases/POST-98-EXECUTION-CHAIN.md` for the run log.
3. Re-read `.planning/phases/98-multi-currency-and-country-scoped-plans/PICKUP-NOTES.md` for the mid-flight scale fix.
4. Re-read `.planning/phases/98-multi-currency-and-country-scoped-plans/98-UAT.md` for the non-negotiable D-19 gate.
5. Pull up per-phase SUMMARY files on demand.

---

## Commits on master since `8774ae48` (pre-AFK baseline)

86 commits across four phases. `git log --oneline master ^8774ae48` shows the full list. Grouped:

| Phase                      | First commit | Last commit |
| -------------------------- | ------------ | ----------- |
| 98 (multi-currency)        | `b875258c`   | `1ccda822`  |
| 98 handoff log             | `512d5c31`   | `512d5c31`  |
| 99 (level selection)       | `97901772`   | `c7ba36ab`  |
| 100 (PDF + games overhaul) | `ebd518c6`   | `c4977936`  |
| 101 plans commit           | `d0a3209c`   | `d0a3209c`  |
| 101 (debt tracking)        | `18bad2bf`   | `d6511f5b`  |

Plus a few docs-only commits for STATE.md / ROADMAP.md updates woven throughout.

## Migrations applied to local dev DB

`_migrations` now has rows for: 0083-0090 (back-catch-up), 0091, 0092, 0093, 0094, 0095, 0096.

| Mig  | Phase | What                                                                                            |
| ---- | ----- | ----------------------------------------------------------------------------------------------- |
| 0091 | 98    | multi-currency columns + AR/ARS backfill + 12 ES plan seeds + unique index                      |
| 0092 | 98    | normalize ES plan prices from cents → whole euros (user clarified mid-phase: no cents anywhere) |
| 0093 | 99    | rename `completed_sessions.level_at_completion` → `session_level`                               |
| 0094 | 100   | add `session_blocks.custom_title` nullable column                                               |
| 0095 | 100   | insert 'games' format row                                                                       |
| 0096 | 101   | create `debts` table                                                                            |

Test DB uses `drizzle-kit push --force` per `test/setup.ts` — schema auto-materializes; no migration runs against `eltemplo_test`.

## Test status at end of run

- API: 769/769 passing (Phase 98 added integration tests; Phase 99 added cross-level tests; Phase 100 added custom-title + games format tests; Phase 101 added 14 debt service tests)
- el-templo-app: 55/55 passing
- el-templo-admin: build green, `vue-tsc --noEmit` green on all files touched this chain (3 pre-existing PDF builder errors + some Program wizard / Session-page errors remain — flagged as out of scope per Phase 100-04 SUMMARY)

## Manual UAT gates still owed (in priority order)

### 1. Phase 98 — iOS + Android deployed-build forward-compat (NON-NEGOTIABLE, D-19)

Document: `.planning/phases/98-multi-currency-and-country-scoped-plans/98-UAT.md`
What: install the current App Store iOS build + current Play Store Android build, point them at the staging API (which must have 0091 + 0092 applied), exercise every price screen.
Expectation: zero crashes. If the deployed builds can't be pointed at staging (no dev menu, no proxy), Phase 98 **halts** — per the SPEC, no substitution allowed.

### 2. Phase 101 — admin UI walkthrough

On `/alumnos`:

- Two-row filter bar (Row 1: search + Export + Nuevo; Row 2: Plan/Sucursal/Nivel/Estado/Segmento/Avatar + "Solo deudores" toggle)
- Flip "Solo deudores" → banner `Deuda total: ARS $X · USD $Y` appears, Deuda column appears
- Open a member → edit dialog → bottom Deuda section
- Toggle Deudor ON, enter 20000 ARS + note, Guardar
- MySQL: `SELECT id, amount, currency, is_cancelled FROM debts WHERE user_id=<id>;` returns one active row
- Toggle Deudor OFF, Guardar; `is_cancelled=1, cancelled_at=NOW()`; member disappears from "Solo deudores"
- Optional: log in as `recepcion` account, confirm the toggle submit produces a Spanish 403 toast

### 3. Phase 100 — PDF visual diff

- Generate a PDF for an existing session (no custom title set)
- INITIUM page should read PYROS heading unchanged + subtitle `INITIUM  ·  {formatName}` with the middle-dot and double spaces
- Set a custom title on an INITIUM block, regenerate; subtitle should be the custom title alone
- NUCLEUS/DEUTEROS pages should show Spanish route labels ("Plancha", "Empuje de cadera", etc. — not English short codes)

### 4. Phase 99 — on-device dropdown + persistence

- `/mi-templo` on desktop and mobile: level badge tap opens q-menu with 5 rows (Alfa/Delta/Sigma/Omega/Spartan)
- Pick a level → cold-restart the app → selection persists (Capacitor Preferences on native, localStorage on web)
- Logout → selection wipes
- Start a session → tick an exercise → change level mid-session → confirm the guard dialog copy is exact
- Admin: open `/alumnos/<id>` for a member with mixed completions → chip row placement + colours sight-check

## Mid-flight decisions to rubber-stamp

1. **No cents anywhere** (Phase 98 mid-flight): commit `0477da3a` normalizes ES prices (migration 0092) and changes `formatPrice` to pass amounts through. You chose this during the run. Documented in `PICKUP-NOTES.md`.
2. **Phase 98 Plan 11 gaps** (fixed in commit `826c6cf7`): AR admin could read ES member (SPEC AC-7 leak), member-app endpoints missed currency/country. All 3 closed; 733/733 green.
3. **Phase 99 cross-country bypass** (fixed inside Plan 99-04): `changePlanAfterCurrent` (scheduled path) needed the same guard as `changePlanNow`. Auto-applied.
4. **Migration renumbering**: every phase after 98 had planned migration numbers that collided. I renumbered as I went: Phase 99→0093, Phase 100→0094+0095, Phase 101→0096. All plans in `.planning/phases/**/??-??-PLAN.md` still reference the _original_ numbers — the actual SQL files on disk use the new numbers. Plan SUMMARY files document each renumber.

## Files to open when you're deciding what to ship

| File                                                                                                  | Why                                                              |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `.planning/phases/POST-98-EXECUTION-CHAIN.md`                                                         | Full run log, one entry per phase + final "chain complete" block |
| `.planning/phases/98-multi-currency-and-country-scoped-plans/PICKUP-NOTES.md`                         | Scale convention decision                                        |
| `.planning/phases/98-multi-currency-and-country-scoped-plans/98-UAT.md`                               | iOS + Android gate                                               |
| `.planning/phases/98-multi-currency-and-country-scoped-plans/98-11-SUMMARY.md`                        | Integration test coverage + Gap 4 JSON-schema finding            |
| `.planning/phases/99-member-selectable-training-level/99-03-SUMMARY.md`                               | Why no Vue-SFC tests (no harness in member app)                  |
| `.planning/phases/100-games-format-exercise-route-overhaul-and-session-editor-rout/100-05-SUMMARY.md` | PDF byte-identical-fallback logic                                |
| `.planning/phases/101-debt-tracking-flag-members-with-outstanding-debt/101-02-SUMMARY.md`             | Debt service contract + 14 new tests                             |

## Ship strategy (your call — nothing done without your signal)

Per your standing rules: staging-first strict, no auto-push, v4.4 is local-only. Options when you're ready:

- **Phase 98 first** (hotfix-shaped, well-tested, highest value): go through the UAT, then push to `origin/staging`, then `origin/master` per the hotfix convention. Normal CI/CD deploys.
- **Phases 99, 100, 101** can ship separately — none of them cross-depend functionally, though they all sit in local-only v4.4 work per the milestone memory.
- **All four together** if you want one big staging cycle.

I held off everything. Give the word when you want to push.

## Known non-blocking noise

- `.claude/worktrees/` is untracked (pre-existing)
- Several pre-existing untracked files at the repo root (`REP_COUNT_DIAGNOSIS.md`, `SESSION_PIPELINE_ADMIN_EDIT_REFACTOR_PLAN.md`, `VERSION_SKEW_MITIGATIONS.md`, etc.) — not from this run
- `pnpm-workspace.yaml` at each app's root is untracked — pre-existing, same as when we started
- A few type errors in admin PDF builder + Program wizard are pre-existing and explicitly out of scope per Phase 100 SUMMARIES
