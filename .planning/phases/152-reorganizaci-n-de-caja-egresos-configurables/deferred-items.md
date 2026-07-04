# Phase 152 — Deferred Items

Out-of-scope discoveries logged during execution. NOT fixed (belong to a different
plan/task or are pre-existing).

## From 152-04 (ABM de centros de costo)

- **`test/finance/cost-centers.test.ts` referencia nombres de seed viejos** —
  las aserciones ~174-176 esperan `"Alquiler Constitución"` y `"Viáticos profes"`,
  pero la migración **0165 (plan 152-01)** renombró esos seeds a `"Alquiler"` y
  `"Viáticos"` (D-09). Ese test fallará en CI hasta que se actualicen los dos
  literales. Causa: sibling plan 152-01 (rename de seeds), NO el plan 152-04.
  Fuera del scope de este plan (archivo distinto, task distinta). Fix trivial:
  cambiar los dos `expect(names).toContain(...)` a los nombres nuevos.
  Ubicación: `el-templo-api/test/finance/cost-centers.test.ts:174-176`.
