# Deferred items — Fase 176

## 176-01: baseline de `pnpm typecheck:tests` desactualizado (fuera de alcance)

Al correr `pnpm typecheck:tests` en el worktree `et-176` (base `2a4f5c92`) tras
Task 3, el ratchet reporta 9 errores nuevos + 1 empeorado + 1 entrada
obsoleta, ninguno en archivos tocados por este plan:

- `test/check-ins/check-ins-roster.test.ts` (TS2769, x2)
- `test/unit/combos-generator.test.ts` (TS2835 x11, TS7006 x15)
- `test/unit/full-body-selection.test.ts` (TS2835 x5, TS7006 x9)
- `test/unit/stretching-selection.test.ts` (TS2835 x7, TS7006 x4)
- `test/unit/tecnica-generator.test.ts` (TS2835 x8, TS7006 x12)
- `test/analytics/analytics.test.ts` (TS2769, empeoró 2→4)
- `test/attendance/attendance.test.ts` (TS2769, mejoró 2→1, baseline quedó obsoleto)

Ninguno de estos archivos fue leído ni modificado por el plan 176-01. Es
drift preexistente del baseline `tenant-lint-allowlist`/`test-check` respecto
del estado real de `2a4f5c92` — probablemente el baseline se generó en un
commit distinto del tren. NO se tocó (scope boundary de la regla de
desviaciones del executor). Queda para quien retome la deuda de
`typecheck:tests` en la fase (o antes del merge a master, re-generar el
baseline con `pnpm typecheck:tests -- --update` en un commit dedicado).
