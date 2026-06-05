---
phase: 127-de-avance-del-rbol-para-el-miembro
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - el-templo-api/src/modules/tree-progress/category-map.ts
  - el-templo-api/src/modules/tree-progress/service.ts
  - el-templo-api/src/modules/tree-progress/schemas.ts
  - el-templo-api/src/modules/tree-progress/routes.ts
  - el-templo-api/src/modules/tree-progress/index.ts
  - el-templo-api/src/plugins/tree-progress.ts
  - el-templo-api/src/app.ts
  - el-templo-api/test/tree-progress/member-tree.test.ts
  - el-templo-app/src/modules/progression/types.ts
  - el-templo-app/src/modules/progression/stores/treeProgressStore.ts
  - el-templo-app/src/modules/progression/composables/useTreeProgressApi.ts
  - el-templo-app/src/modules/progression/pages/MiArbol.vue
  - el-templo-app/src/modules/progression/components/TreeCategorySection.vue
  - el-templo-app/src/modules/progression/components/SubfamilyProgressRow.vue
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: clean
fix_notes: "WR-01 (unreachable view) and WR-02 (DTO drift) fixed in commits 2a05825f and 2924a7c5. WR-03 (graph-node caching) accepted as documented perf debt for this phase. Info items IN-01..IN-04 accepted as-is (low-risk / optional)."
---

# Phase 127: Code Review Report

**Reviewed:** 2026-06-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the new `el-templo-api/src/modules/tree-progress/` backend module and the
`el-templo-app/src/modules/progression/` member-app additions (types/store/composable/components/page)
delivered across the five Phase 127 commits. The work is well-structured and the
high-risk areas hold up under adversarial inspection:

- **Member-scoping (security):** SOLID. The route reads only `request.user.userId`
  (`routes.ts:27`), never a route/query/body input. `buildMemberTree` takes `userId`
  by parameter and scopes every query to it. The branch-(b) prescription resolution
  harvests prescription ids _only_ from the member's own `completed_sessions` rows
  (`service.ts:139-142`) before joining `session_prescriptions`, so there is no
  cross-user leak even though the second query is not user-filtered. No SQL injection
  surface (all Drizzle parameterized; no raw interpolation). No hardcoded secrets.
- **Division-by-zero / empty categories:** HANDLED. `percentOf` returns 0 when total
  is 0 (`service.ts:125-127`); all 5 categories preallocated and always emitted;
  empty subfamilies render with `percent: 0`. No NaN/500 path found.
- **Node-set fidelity:** MATCHES the 126 predicate — `canonical_exercise_id IS NULL`,
  `effort IN (CON/EXC/ISO)`, and `subfamily_id IS NOT NULL` enforced via the inner
  join (plus a defensive `.filter`). Integration test seeds and excludes all three
  off-graph shapes.
- **Frontend:** Render-only (no client % math; `progressValue` is pure 0..1 scaling),
  no `any`, no `console.log`, composable exposes `cleanup()` and registers no lifecycle
  hooks, warm brand tokens only (no blue/hardcoded hex), loading/error/empty states present.

No Critical issues. Three Warnings concern a shipped-but-unreachable feature, a
DTO drift between backend and frontend, and a perf/scaling concern flagged by the
phase scope. Info items are minor.

## Warnings

### WR-01: "Mi Árbol" view is unreachable — no navigation entry anywhere

**File:** `el-templo-app/src/modules/progression/routes.ts:16-21`
**Issue:** The `mi-arbol` route is registered, but a codebase-wide search finds **zero**
navigation links, buttons, tabs, or `router.push('/mi-arbol')` calls pointing to it
(only doc-comment mentions in the store/composable). `MainLayout.vue` bottom-nav and
desktop rail link to `/mi-templo`, `/reservas`, etc. — never `/mi-arbol`. The entire
backend + frontend feature is dead to users: it can only be reached by manually typing
the URL. This is a functional gap in the deliverable, not just polish — the phase goal
("exponer al miembro un % de avance") is not actually exposed.
**Fix:** Add an entry point. Either a nav item in `MainLayout.vue` (consistent with the
member nav pattern) or a card/link from `MiTemplo.vue` into `mi-arbol`. Confirm with the
intended UX placement before shipping. Example (MainLayout nav array):

```ts
{ to: '/mi-arbol', icon: 'park', label: 'Mi Árbol' },
```

### WR-02: Frontend `TreeProgressResponse` drops the `level` field present in the authoritative DTO

**File:** `el-templo-app/src/modules/progression/types.ts:94-97`
**Issue:** The backend (`service.ts:81-84`, `schemas.ts:45-51`, and the 127-01-SUMMARY
authoritative DTO) returns `{ level, categories }`. The frontend interface declares only
`{ categories }`. The store/components currently never render `level`, so this is not a
runtime bug today — but the summary frames `level` as part of the authoritative shape and
a likely member-facing element ("nivel del miembro"). Silently omitting it means the
type no longer mirrors the contract and a future consumer reading `response.level` gets
no type support / will assume it doesn't exist.
**Fix:** Mirror the contract exactly:

```ts
export interface TreeProgressResponse {
  level: "alfa" | "delta" | "sigma" | "omega" | "spartan";
  categories: TreeCategory[];
}
```

If `level` is intentionally unused in the UI, keep it on the type and add a comment, rather
than dropping it from the contract mirror.

### WR-03: `loadCompletedExerciseIds` re-runs the full catalog scan unconditionally on every request (no caching of the ~1.5k graph)

**File:** `el-templo-api/src/modules/tree-progress/service.ts:177-219`, `135-169`
**Issue:** The phase context (D-05 / Claude's Discretion) explicitly raised caching/perf
of the ~1.5k-row catalog as an open call, and the summary claims it is "on-demand." Every
`GET /me` does: (1) a full `loadGraphNodes` scan of the entire confirmed-canonical exercise
catalog joined to subfamilies, plus (2) a per-member `completed_sessions` scan and an
`inArray` resolution over potentially hundreds/thousands of prescription ids. The graph
node set is identical for _every_ member and changes only when the catalog/126-graph is
rebuilt — recomputing it per request is pure waste. (Per review v1 scope, raw algorithmic
perf is out of scope, but this is flagged because the phase itself called it out as a
decision and the node set is a shared, near-static structure — a maintainability/scaling
concern, not just micro-perf.)
**Fix:** Cache the graph node set (the result of `loadGraphNodes`) in module/app memory with
a coarse TTL or an explicit invalidation hook tied to the 126 rebuild, and keep only the
per-member `reached` computation on the hot path. If deferring, record the decision
explicitly rather than leaving "on-demand" as an implicit default.

## Info

### IN-01: Response JSON schemas have no `required` arrays — null/undefined fields would serialize silently

**File:** `el-templo-api/src/modules/tree-progress/schemas.ts:10-51`
**Issue:** The Fastify response schemas declare `properties` but no `required` and no
`additionalProperties: false`. Fastify response schemas serialize/coerce but do not error
on a missing field; a future regression that drops e.g. `percent` would pass schema
serialization unnoticed. Low risk here because the service builds complete objects, but
the schema provides no contract enforcement.
**Fix:** Add `required: [...]` (and consider `additionalProperties: false`) to each object
schema so the response contract is actually enforced/documented.

### IN-02: `MemberTree.level` typed as `ExerciseLevel` but defensively populated from a possibly-null cast

**File:** `el-templo-api/src/modules/tree-progress/service.ts:237`
**Issue:** `const level: ExerciseLevel = (user?.level as ExerciseLevel | null) ?? "alfa"`.
The schema column is `.notNull()` with default `"alfa"`, and the user must exist (they are
authenticated), so the `user?` and `?? "alfa"` fallbacks are dead defensive code. Harmless,
but the `as ExerciseLevel` cast trusts the DB enum string blindly — fine given the enum
constraint, just note the fallback can never fire in practice.
**Fix:** Optional. Leave the fallback as belt-and-suspenders, or drop the `user?` optional
chaining since an authenticated user row is guaranteed.

### IN-03: Fallback category silently absorbs unmapped patterns into "Movilidad" (operational, by design)

**File:** `el-templo-api/src/modules/tree-progress/category-map.ts:55,93-96` and `service.ts:261-267`
**Issue:** Any future/empty `exercises.pattern` value routes to `Movilidad`. This is
documented (D-01) and the service warns once per distinct unmapped value — good. The residual
concern: the warn fires only when that pattern's node is _processed_, and is keyed per-request
(`warnedPatterns` is request-local), so it logs once per request per distinct unmapped pattern
rather than once globally. Acceptable for drift detection; just be aware it is not a one-time
alert.
**Fix:** None required. If log noise becomes an issue, hoist the warned-set to module scope
or emit a single aggregated warn at the end.

### IN-04: `round()` is a one-line passthrough wrapper around `Math.round`

**File:** `el-templo-api/src/modules/tree-progress/service.ts:121-123`
**Issue:** `function round(n) { return Math.round(n) }` adds an indirection with no added
behavior. Minor; inlining `Math.round` in `percentOf` would be equally clear.
**Fix:** Optional — inline `Math.round` or keep if a future rounding policy is anticipated.

---

_Reviewed: 2026-06-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
