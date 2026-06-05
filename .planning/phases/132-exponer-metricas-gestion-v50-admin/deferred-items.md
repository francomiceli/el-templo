# Phase 132 — Deferred / Out-of-Scope Items

Discovered during execution; NOT caused by this phase's changes. Logged per the
scope boundary (do not fix here).

## Pre-existing `tsc --noEmit` errors in el-templo-admin (unrelated to analytics)

Discovered while verifying plan 132-03 (the only typecheck tool present in the
admin app is `tsc`; `vue-tsc` is not installed — see deviation below). The full
`tsc --noEmit` surfaces two pre-existing errors in files this phase never touches:

- `src/boot/__tests__/axios-refresh-lock.test.ts` — type error in a refresh-lock test.
- `src/utils/pdf/session-pdf-builder.ts` — `Margins` tuple incompatibility (`number[]`
  not assignable to `[number, number] | [number, number, number, number]`).

Both are outside the analytics surface (no import of `types/analytics.ts` or
`useAnalyticsApi.ts`). Not fixed — out of scope for phase 132.

### Note on verification tooling

`132-03-PLAN.md` specifies `pnpm exec vue-tsc --noEmit` as the verify command, but
`vue-tsc` is not a dependency of `el-templo-admin`. The plan-touched files are
pure `.ts` (`types/analytics.ts`, `composables/useAnalyticsApi.ts`), so `tsc
--noEmit` is the correct and sufficient typecheck. Full `.vue` SFC typechecking
runs in CI / the Quasar build pipeline (`quasar build`).
