---
phase: 127-de-avance-del-rbol-para-el-miembro
plan: 01
subsystem: api / tree-progress
tags: [skill-tree, progression, member-scoped, TREE-06, backend]
requires:
  - "phase 126 DAG (exercise_progressions + confirmed-canonical exercises)"
  - "exercise_subfamilies catalog (phase 124)"
  - "users.level + completed_sessions + session_prescriptions"
provides:
  - "GET /api/tree-progress/me — authenticated member-scoped tree with % per node/subfamily/category"
  - "buildMemberTree(db, userId, log) service"
  - "patternToCategory map (exercises.pattern → 5 thematic categories)"
  - "memberTreeResponseSchema DTO (authoritative shape for Plan 02 member-app view)"
affects:
  - "el-templo-app Plan 02 (consumes the DTO + endpoint)"
  - "phase 131 (replaces the 'reached' proxy with the dominado registry)"
tech-stack:
  added: []
  patterns:
    - "Fastify fp plugin + FastifyPluginAsync routes (mirrors progression module)"
    - "Drizzle read-only SELECTs; explicit interfaces, no any"
key-files:
  created:
    - el-templo-api/src/modules/tree-progress/category-map.ts
    - el-templo-api/src/modules/tree-progress/service.ts
    - el-templo-api/src/modules/tree-progress/schemas.ts
    - el-templo-api/src/modules/tree-progress/routes.ts
    - el-templo-api/src/modules/tree-progress/index.ts
    - el-templo-api/src/plugins/tree-progress.ts
    - el-templo-api/test/tree-progress/member-tree.test.ts
  modified:
    - el-templo-api/src/app.ts
decisions:
  - "reached proxy = (dl <= level ceiling) OR (exerciseId in completed sessions); branch (b) ACTIVE via session_prescriptions"
  - "grouping by exercises.pattern collapsed to 5 categories (D-01); static/dynamic NOT a grouping axis (D-02)"
  - "node set = phase-126 DAG scope predicate (subfamily_id NOT NULL, canonical_exercise_id NULL, effort CON/EXC/ISO)"
  - "all 5 categories always render (percent 0 + empty subfamilies when no nodes)"
metrics:
  duration: ~22min
  completed: 2026-06-05
---

# Phase 127 Plan 01: % de avance del árbol (backend) Summary

Member-scoped skill-tree progress endpoint: `GET /api/tree-progress/me` returns the phase-126 DAG nested as category → subfamily → nodes with a server-computed `reached` % at every level (TREE-06).

## What was built

A new `tree-progress` API module (category map + service + schema + route + plugin) wired into `app.ts`, plus a real-MySQL integration test for CI. All `%` is computed server-side from `users.level` + completed sessions; the client sends nothing that influences the numbers.

## Endpoint + authoritative DTO (for Plan 02)

**`GET /api/tree-progress/me`** — `onRequest: [fastify.authenticate]`. Scopes strictly to `request.user.userId`; never reads a user id from route/search/payload inputs (T-127-01). Responses: `200` = `memberTreeResponseSchema`, `401` = `errorResponseSchema`.

Response shape (`MemberTree`):

```jsonc
{
  "level": "sigma", // member's users.level
  "categories": [
    // always 5, in CATEGORY_ORDER
    {
      "key": "Tracción", // Category union value
      "label": "Tracción",
      "totalNodes": 3,
      "reachedNodes": 3,
      "percent": 100, // round(reached/total*100), 0 when total=0
      "subfamilies": [
        // [] when category has no nodes
        {
          "id": 12,
          "name": "Dominadas",
          "route": "PULLR",
          "totalNodes": 3,
          "reachedNodes": 3,
          "percent": 100,
          "nodes": [
            // sorted by dificultadLineal then exerciseId
            {
              "exerciseId": 101,
              "name": "...",
              "dificultadLineal": 2,
              "reached": true,
            },
          ],
        },
      ],
    },
    // ...Empuje, Piernas, Core, Movilidad
  ],
}
```

Ordering guarantees: categories in `CATEGORY_ORDER` `[Tracción, Empuje, Piernas, Core, Movilidad]`; subfamilies by `exercise_subfamilies.sortOrder` then name; nodes by `dificultadLineal` then `exerciseId`.

## pattern → category map (final)

Distinct `exercises.pattern` values found in the production catalog (`SELECT DISTINCT pattern FROM exercises`): `'' (empty)`, `CARDIO`, `CORE`, `FLOW`, `KL`, `LOWER`, `MOVILIDAD`, `PLYO`, `PULL`, `PUSH`.

| pattern    | category             | rationale                                                                 |
| ---------- | -------------------- | ------------------------------------------------------------------------- |
| PULL       | Tracción             | 1:1                                                                       |
| PUSH       | Empuje               | 1:1                                                                       |
| LOWER      | Piernas              | 1:1                                                                       |
| CORE       | Core                 | 1:1                                                                       |
| MOVILIDAD  | Movilidad            | 1:1                                                                       |
| FLOW       | Movilidad            | animal-flow / locomotion / ground mobility                                |
| KL         | Piernas              | kettlebell swings/snatches: hip-hinge, leg-dominant                       |
| CARDIO     | Piernas              | burpees/jumps/skaters: leg-dominant conditioning                          |
| PLYO       | Piernas              | reactive jumps: leg-dominant plyometrics                                  |
| '' / other | Movilidad (FALLBACK) | explicit fallback; service logs a `warn` once per distinct unmapped value |

The fallback is explicit (`FALLBACK_CATEGORY`) and surfaced operationally: the service emits `request.log.warn({ pattern, exerciseId }, ...)` once per distinct unmapped pattern via `isMappedPattern`. The empty-string placeholder routes through the fallback (and is logged). Mapping is case/whitespace-normalized.

## reached proxy (D-03, replaceable by phase 131)

A node is `reached` iff **either**:

- **(a)** `dificultadLineal <= levelCeiling(member.level)` — ceilings: `alfa→3, delta→6, sigma→8, omega→10, spartan→12`, derived from `LEVEL_LINEAR_MIN` of the next level minus 1, spartan capped at the dl scale max 12. This is the always-available dominant signal.
- **(b)** the node's `exerciseId` appears in the member's completed sessions. **Branch (b) is ACTIVE**: `completed_sessions.exercisesCompleted` stores _prescription_ ids (`{ role: [presId,...] }`), so the service flattens those ids and resolves them to exercise ids via `session_prescriptions.exercise_id`. This is the seam phase 131 replaces with the richer "dominado" registry — the whole `reached` definition lives in `service.ts` and can be swapped without rewriting the view or the DTO.

## Node-scope edge cases

- Node set mirrors `rebuild-progression-graph.ts` exactly: `subfamily_id IS NOT NULL` (enforced by the inner join to `exercise_subfamilies`) AND `canonical_exercise_id IS NULL` AND `effort IN ('CON','EXC','ISO')`. The integration test seeds three off-graph rows (non-canonical dupe, off-effort `''`, NULL subfamily) and asserts none appear.
- Subfamilies with zero graph nodes are omitted; categories with zero subfamilies still render with `percent: 0` and `subfamilies: []`.
- Integer counts are authoritative and aggregate upward (category counts = sum of subfamily counts); rounding only at display.

## Deviations from Plan

None — plan executed as written. (The DB enumeration of `exercises.pattern` was run against the dev `eltemplo` DB, which holds the catalog's `pattern` vocabulary that predates phase 124; the phase-124+ columns aren't applied to that DB but the `pattern` column is, which is all the map needs.)

## Verification

- `pnpm exec tsc --noEmit` (api) exits 0.
- `grep -rn "console.log" el-templo-api/src/modules/tree-progress/` → no code matches (one comment mention only).
- `grep -c "request.user.userId" routes.ts` = 1; `grep -c "params|query|body" routes.ts` = 0.
- `grep -cn "tree-progress" src/app.ts` ≥ 1 (plugin registered).
- Integration test `test/tree-progress/member-tree.test.ts` covers grouping order, per-subfamily %, reached-by-ceiling, off-graph exclusion, 401, and own-scope isolation. **Per project policy the integration suite runs in CI, not locally** — push to `origin/staging` to run it.

## Test status (action needed)

The integration test must run in CI (not run locally per project policy). Push `staging` to `origin/staging` to execute it. Nothing pushed by this plan.

## Self-Check: PASSED

All 7 created files exist on disk; all 3 task commits (`546ca41d`, `afce40f6`, `377aa9e4`) are present in git history.
