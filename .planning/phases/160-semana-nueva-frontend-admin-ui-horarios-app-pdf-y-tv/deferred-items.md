# Deferred items — Phase 160

Items discovered during plan execution that are out of scope for the plan that found them (SCOPE BOUNDARY rule — not fixed, just logged).

## 160-02

- **`el-templo-admin/src/utils/pdf/session-pdf-builder.ts:991`** — `const exerciseGap = 32;` inside `buildRomBlockPage` is unused (`@typescript-eslint/no-unused-vars` warning). Pre-existing, unrelated to this plan's changes (not touched by the 160-02 diff — confirmed via `git diff`). Found while running `eslint` as a sanity check beyond the plan's mandated `vue-tsc` gate.
- **`el-templo-admin`: `pnpm exec vue-tsc --noEmit` does not resolve** — `vue-tsc` is not a `devDependency` (documented gap since phases 132/143-05 per `.planning/STATE.md`/`RESUME-NEXT-SESSION.md`). Worked around this plan via `pnpm --package=vue-tsc@3.2.5 --package=typescript@5.9.3 dlx vue-tsc --noEmit` (documented as a deviation in `160-02-SUMMARY.md`). Adding `vue-tsc` as a real devDependency (pinned to 5.9.x-compatible typescript) so `pnpm exec vue-tsc` works out of the box is a candidate for a future infra/tooling plan — out of scope here (would require a dependency install, which this plan is not authorized to do unprompted).
