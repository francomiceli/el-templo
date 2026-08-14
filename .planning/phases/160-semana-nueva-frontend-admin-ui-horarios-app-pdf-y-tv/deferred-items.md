# Deferred items — Phase 160

Items discovered during plan execution that are out of scope for the plan that found them (SCOPE BOUNDARY rule — not fixed, just logged).

## 160-02

- **`el-templo-admin/src/utils/pdf/session-pdf-builder.ts:991`** — `const exerciseGap = 32;` inside `buildRomBlockPage` is unused (`@typescript-eslint/no-unused-vars` warning). Pre-existing, unrelated to this plan's changes (not touched by the 160-02 diff — confirmed via `git diff`). Found while running `eslint` as a sanity check beyond the plan's mandated `vue-tsc` gate.
- **`el-templo-admin`: `pnpm exec vue-tsc --noEmit` does not resolve** — `vue-tsc` is not a `devDependency` (documented gap since phases 132/143-05 per `.planning/STATE.md`/`RESUME-NEXT-SESSION.md`). Worked around this plan via `pnpm --package=vue-tsc@3.2.5 --package=typescript@5.9.3 dlx vue-tsc --noEmit` (documented as a deviation in `160-02-SUMMARY.md`). Adding `vue-tsc` as a real devDependency (pinned to 5.9.x-compatible typescript) so `pnpm exec vue-tsc` works out of the box is a candidate for a future infra/tooling plan — out of scope here (would require a dependency install, which this plan is not authorized to do unprompted).

## 160-04

- **`el-templo-app`: same `vue-tsc` gap as the admin (160-02)** — not a `devDependency` either. Same workaround (`dlx` pinned to `vue-tsc@3.2.5`/`typescript@5.9.3` per `STACK.md`). Same future-infra candidate noted above applies to the app too.
- **`el-templo-app`: `node_modules` was empty at the start of this plan** (fresh worktree checkout, never `pnpm install`ed). Ran `pnpm install --frozen-lockfile --offline` (local store, no network, zero changes to `package.json`/`pnpm-lock.yaml`) per the plan's explicit fallback instructions, purely to make `vue-tsc`/`eslint`/`prettier` resolve imports. Not a deviation — instructed by the executor prompt.
- **20 pre-existing `vue-tsc` baseline errors in `el-templo-app`, unrelated to this plan's diff** (confirmed: none touch `session.ts`/`blockColors.ts`/`roleLabels.ts`/`BlockCard.vue`) — mostly `import.meta.env` typing gaps (`boot/axios.ts`, `boot/sentry.ts`, `boot/staging-marker.ts`, `pages/IndexPage.vue`, `utils/logger.ts`), missing `$router`/`$api` augmentation on some Options-API pages (`ChangePasswordPage.vue`, `ProfilePage.vue`), a `QuizQuestion`/`QuizQuestionV2` union narrowing gap (`OnboardingQuestion.vue`), an axios mock typing issue in a test file, and 2 module-resolution errors (`#q-app/wrappers`, `ErrorNotFound.vue` implicit any) likely tied to the `.quasar` generated dir. Not fixed (out of scope — SCOPE BOUNDARY rule; none of these files are in this plan's `files_modified`). Full list in the plan's SUMMARY.

## 160-05

- **`el-templo-app/test/level-display.test.ts` fails on `pnpm vitest run` (full suite)** — 2 assertions expect `TRAINING_LEVELS` to have exactly 5 entries (`['alfa','delta','sigma','omega','spartan']`), but `level-display.ts` was extended to 6 entries (`'kairos'` prepended) by an unrelated prior commit (`a669156e feat(kairos): completar soporte del nivel kairos...`). Pre-existing baseline failure, confirmed via `git show HEAD~1:.../level-display.ts` (kairos already present before this plan's commits) — the test file itself was never updated when kairos landed. Not touched by 160-05's `files_modified`; out of scope (SCOPE BOUNDARY rule). `test/session-player-combos.test.ts` (this plan's new test) passes cleanly in isolation and does not interact with this file. Candidate for a small standalone fix (update the 2 assertions to 6 entries / add 'kairos') in a future plan.
