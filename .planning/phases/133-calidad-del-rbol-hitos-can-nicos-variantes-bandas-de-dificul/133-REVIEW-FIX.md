---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
fixed_at: 2026-06-08T08:38:00Z
fix_scope: critical_warning
findings_in_scope: 9
fixed: 9
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 133: Code Review Fix Report

**Fix scope:** Critical + Warning (CR-01, WR-01 … WR-08)
**Findings in scope:** 9 — **Fixed:** 9 — **Skipped:** 0
**Status:** all_fixed

Each fix is an atomic commit. All API typechecks clean (`tsc --noEmit`, exit 0).
The test suite was **not** run locally per project policy (tests run in CI). The
6 Info findings (IN-01 … IN-06) were intentionally out of scope (no `--all`).

## Fixes applied

| Finding | Commit | Status | Note |
|---|---|---|---|
| CR-01 — editor/canvas auto order ignored `progression_step` | `21562fe4` | fixed | Inlined `stepOf` (NULL → +∞) in `orderNodes`, mirroring the rebuild. |
| CR-01 — regression test (GET /tree step order) | `fa537ea4` | added | Inverse of rebuild test H; written by the orchestrator (the fixer skipped the test the REVIEW asked for). |
| WR-01 — off-backbone via `habilidad` without edge prune | `2b7e345d` | fixed ⚠ | Prune incident edges when accept transitions habilidad NULL → NOT NULL. **Requires human verification.** |
| WR-02 — hito/variante same-partition invariant | `895f79f9` | fixed ⚠ | Guard in `reassignRoute` + `promoteToMilestone`. **Requires human verification.** |
| WR-03 — accept `role=hito` on a truth-variante | `69f13f11` | fixed ⚠ | Reject (steer to "promover a hito"). **Requires human verification.** |
| WR-04 — bootstrap re-proposes truth-variantes | `47c62cd4` | fixed | `AND e.milestone_exercise_id IS NULL` in candidate scope. |
| WR-05 — non-transitive rebuild comparator | `32fcebcf` | already fixed | Landed before this run (total order via `stepOf`). |
| WR-06 — classify on `name` only (broke `position \|\| name`) | `1e065241` | fixed | Select `e.position`, classify with `position \|\| name`. |
| WR-07 — duplicate Vue Flow node ids / partial-partition reorder | `72f858e9` | fixed ⚠ | Group each route under one dominant category. **Requires human verification.** |
| WR-08 — `bulkAccept` aborts on first failure | `ea5015fe` | fixed | Per-proposal try/catch; preserves the accepted count. |

## Requires human verification

Four logic-sensitive fixes (WR-01, WR-02, WR-03, WR-07) passed typecheck but
their semantics — invariant guards, off-backbone edge pruning, route-to-category
grouping — should be confirmed by a developer and exercised by the CI test suite
before shipping.

## Out of scope (Info — not fixed)

IN-01 (precedence-edge race), IN-02 (review drawer race), IN-03 (proposal audit
trail), IN-04 (stale side-panel after move), IN-05 (backbone-scope docblock nits),
IN-06 (bootstrap test cleanup). Re-run with `--all` to address these.

---

_Fixed: 2026-06-08_
_Fixer: Claude (gsd-code-fixer) + orchestrator reconciliation_
_Scope: critical_warning_
