---
phase: 134-rbol-del-miembro-estados-de-nodo-y-criterio-de-avance-objeti
plan: 01
subsystem: tree-progress (backend contract)
tags: [member-tree, node-states, difficulty-band, graph-gating, D-06]
requires:
  - tree-progress/service.ts buildMemberTree (phase 127)
  - exercise_progressions edges (phase 126/128/133)
  - exercise_adjustments dominado/bajado registry (phase 131)
  - LEVEL_LINEAR_MIN single source (sessions/pipeline/utils/level-mapping.ts)
provides:
  - "GET /api/tree-progress/me node.state ∈ {dominado, en_progreso, disponible, bloqueado}"
  - "GET /api/tree-progress/me node.band ∈ {alfa, delta, sigma, omega, spartan}"
  - exported bandForDl(dl) helper + NodeState type
affects:
  - "plan 134-02 (member-app render of state + band, verbatim)"
tech-stack:
  added: []
  patterns:
    - "server-computes-everything (D-05 fase 127): state/band derived in buildMemberTree, client renders verbatim"
    - "schema-gates-the-response: treeNodeSchema must declare new props or Fastify strips them"
    - "two-pass frontier: provisional state in node loop, en_progreso promoted in a second per-route pass over sorted nodes"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/tree-progress/service.ts
    - el-templo-api/src/modules/tree-progress/schemas.ts
    - el-templo-api/test/tree-progress/member-tree.test.ts
decisions:
  - "D-01 dominado is evidence-only: dominatedExerciseIds OR completedExerciseIds; dl<=ceiling never dominates"
  - "D-02 en_progreso = first non-dominado disponible node per sorted route (computed in a second pass)"
  - "D-06 hybrid gating: disponible-base = dl<=ceiling OR all in-tree graph prereqs dominated; bloqueado otherwise"
  - "D-08 band = highest LEVEL_LINEAR_MIN floor <= dl; never emit 'kairos' for a node band"
  - "D-05 reached formula and percent byte-for-byte unchanged (state is a separate layer)"
metrics:
  duration: ~14min
  completed: 2026-06-08
---

# Phase 134 Plan 01: Estados de nodo + bandas en el contrato del member tree — Summary

Server-computed `state` (dominado/en_progreso/disponible/bloqueado) and `band` (alfa→spartan) per node in `GET /api/tree-progress/me`, derived inside `buildMemberTree` from evidence + the progression graph — `reached`/`percent` unchanged.

## What was built

- **Edge load + prereq map (Task 1):** `loadEdges(db)` reads every `exercise_progressions` row (auto + manual) as `from → to` pairs, added as a 4th entry in the existing `Promise.all`. `buildPrereqMap(nodes, edges)` builds `node id → Set<in-tree prereq ids>`, filtering out off-backbone prereqs so a non-visible exercise never blocks a member-visible node (D-06 graceful degradation).
- **State + band derivation (Task 2):** `TreeNode` extended with `state: NodeState` and `band: ContentLevel`. `bandForDl(dl)` picks the highest `LEVEL_LINEAR_MIN` floor ≤ dl (DRY — thresholds read from the single source, not hardcoded). The node loop computes a provisional state (`dominado` evidence-only, else `disponible`/`bloqueado` via the D-06 hybrid gate). A **second per-route pass** over the dl-sorted nodes promotes the first `disponible` node to `en_progreso` (the frontier, max one per route). `treeNodeSchema` declares `state` + `band` so Fastify does not strip them.
- **Integration coverage (Task 3):** 8 new cases (S1–S8) covering: dl≤ceiling never dominates, one frontier per route, bloqueado gating, D-06 unlock-by-dominated-prereq, latest-adjustment wins (dominado→bajado un-dominates), dominado by completed session (prescription→exercise FK chain), band-by-dl, and reached/percent invariance.

## Key implementation details

- **Frontier is a second pass, not the first loop** (PATTERNS.md risk note): "first non-dominado disponible" depends on the full route order, which only exists after nodes are accumulated and sorted by `dificultadLineal` then `exerciseId`.
- **dominado uses the same two signals as `reached` branches (b)+(c)** but explicitly excludes the ceiling branch (a) — that is the whole point of D-01/R5 (mastery is falsable, not granted by level).
- **`reached` formula and `percent` untouched** — verified by S8 reproducing the legacy 50% assertion with the state layer active.

## Deviations from Plan

None — plan executed exactly as written. The three server layers in scope (TreeNode interface + Fastify schema) were kept in sync; the member-app `types.ts` mirror is correctly out of scope (that is plan 134-02).

## Tests

- 8 new integration cases added to `test/tree-progress/member-tree.test.ts`. Per project policy the suite is NOT run locally — typecheck only. `pnpm exec tsc --noEmit` is clean across the whole `el-templo-api` project (0 errors). The suite should run in CI on a staging push.

## Verification status

- `cd el-templo-api && pnpm exec tsc --noEmit` → 0 errors (service.ts, schemas.ts, member-tree.test.ts, and project-wide).
- `treeNodeSchema` declares `state` and `band` (grep confirmed).
- `bandForDl` reads `LEVEL_LINEAR_MIN`; no hardcoded thresholds.

## Follow-ups for the human

- **Run the suite in CI:** push `staging` to `origin/staging` (ask first per MEMORY policy) so CI runs the ~8 new tree-progress cases against real MySQL.
- **Plan 134-02** renders `state` + `band` in the member app (`SubfamilyProgressRow.vue`, `types.ts` mirror) verbatim.

## Self-Check: PASSED

- service.ts, schemas.ts, member-tree.test.ts all present and modified (FOUND).
- Commits 874c87f0, 55ce23c8, 8ceab4b0 present in git log (FOUND).
