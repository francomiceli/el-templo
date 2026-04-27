# Deferred items — Phase 104

Items discovered during Phase 104 execution that fall OUTSIDE the scope of any
single plan in this phase, and are therefore not auto-fixed. They are logged
here so they can be triaged separately.

## From Plan 104-04 execution (2026-04-27)

Pre-existing typecheck errors in the working tree (NOT caused by Plan 04 changes;
present before Plan 04 started, likely staged by concurrent Plan 02 / 03 work
or unrelated session edits):

1. `el-templo-api/src/modules/sessions/routes.ts:181` — `error TS2694: Namespace
'"...src/db/index"' has no exported member 'Database'.` Looks like a Phase
   104 R7/R8 in-progress addition (`function resolveSessionView` block) that
   imports a non-existent `Database` type from `db/index`.

2. `el-templo-api/src/modules/subscriptions/service.ts:~3146` — `error TS2741:
Property 'grantsAllPrograms' is missing in type '...PlanListItem'`. The
   `grantsAllPrograms` column was added in Plan 01 but `mapToPlanListItem` (or
   equivalent) was not updated to project it. Owner: whichever plan modifies
   subscription-plan listing serialization (likely Plan 02 or 06).

Both should be triaged by their respective owning plans / by the next
end-to-end build before merge.

(Update during Plan 104-02 execution: item #2 was resolved by Plan 02 — `mapPlanRow` now projects `grantsAllPrograms`. Item #1 is still in the
working tree as part of Plan 03's WIP and is not in Plan 02's surface area.)

## From Plan 104-02 execution (2026-04-27)

**Pre-existing test infrastructure failure (vitest 4 + per-worker DB races).**
The integration test harness (`test/setup.ts` + `test/setup-global.ts`) is
broken on master as of branch HEAD before Plan 02 work began. Symptoms when
running ANY test file (verified by stashing all Plan 02 changes and re-running
the previously-passing `dual-subscription.test.ts`):

- First run: `Failed query: select \`name\`, \`description\` from \`formats\``—`Unknown column 'description' in 'field list'`. The `0023_format_descriptions.sql`migration's ALTER TABLE statement is silently tolerated under one of the`tolerated`matchers in`test/setup.ts:155-163`, so `description`never
lands in the freshly-provisioned per-worker test DB. The Fastify app
startup in`sessionRoutes` (`src/modules/sessions/routes.ts:347`) then
fails to load format descriptions and the whole test file aborts
before any `it()` body runs.
- Second run: `Unknown database 'eltemplo_test_1'` mid-migration — the global
  setup's drop-then-recreate flow races with worker provision under vitest
  4.0.18 (which deprecated `poolOptions` and changed isolate defaults; see
  the `[1m DEPRECATED  test.poolOptions was removed in Vitest 4` warning at
  the top of every `pnpm test` invocation).

Recent master commits confirm this is a known flaky-test situation:

- `3aaba08c ci: retrigger master build (flaky test isolation)`
- `8a93f2e1 test: null-safe email cleanup in cleanAllTestData`

Out of scope for Plan 02 per the deviation rules' SCOPE BOUNDARY (failures
in unrelated infrastructure files). Owner: a dedicated test-infra plan to
either pin vitest to 3.x or rewrite the per-worker DB provisioner to
match vitest 4's new pool semantics.

**Update later in execution:** the test infrastructure flake reproduces only
on the FIRST `pnpm test` invocation after a fresh checkout (the first worker
DB provision races with the global drop step). After a manual MySQL
`DROP DATABASE eltemplo_test_*` followed by a re-run, all 88 subscription
tests (including the 9 new bundle tests) pass cleanly. So the new tests
DO run and DO pass — the flake is a transient setup-race, not a permanent
break. Logged here for visibility but not blocking Plan 02 acceptance.

## From Plan 104-06 execution (2026-04-27)

Pre-existing typecheck errors observed in `el-templo-app` while running
`npx vue-tsc --noEmit` after the single-line ReservasPage gating change.
None reference `ReservasPage.vue` and none were introduced by Plan 06.
Listed here for triage by a dedicated app-types cleanup plan:

- `src/boot/sentry.ts:39,41` — `import.meta.env` typed as missing.
- `src/utils/logger.ts:29` — same `import.meta.env` issue.
- `src/pages/IndexPage.vue:78` — same.
- `src/layouts/MainLayout.vue:162` — `displayName` not in `UserProfile`.
- `src/modules/onboarding/components/OnboardingQuestion.vue:4` — `frame`
  prop absent from `QuizQuestion | QuizQuestionV2` union.
- `src/modules/training/components/BlockCard.vue:17` — `BlockGroup` icon
  map missing keys (`ATHLOS`, `DEUTEROS_1/2`, `EPIKOS`, `INITIUM`, `NUCLEUS`).
- `src/pages/ChangePasswordPage.vue:5`, `src/pages/ProfilePage.vue:74` —
  `$router` not on options-API component (likely missing Vue Router augment).
- `src/router/index.ts:1` — `#q-app/wrappers` module declaration missing.
- `src/router/routes.ts:53` — `pages/ErrorNotFound.vue` lacks `.d.ts`.

Lint passes cleanly on `ReservasPage.vue` (one pre-existing warning in
`useSessionPlayer.ts` is unrelated and pre-existing).
