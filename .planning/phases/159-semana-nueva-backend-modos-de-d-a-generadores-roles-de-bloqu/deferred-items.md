# Deferred items — Phase 159

Items descubiertos durante la ejecucion que estan FUERA del alcance de la
tarea que los encontro (scope boundary del executor). No se tocan aca.

## 159-06

- ~~**`stretching-selection.ts` — acceso a `exercises` sin patron de
  tenancy (lint:tenant `unlistedViolations`).**~~ **RESUELTO** (fix de 159-02,
  2026-08-14): `stretching-selection.ts` ahora consume `queryMobilityPool()`
  extraido a `mobility-selection.ts` (el unico archivo con acceso a `exercises`,
  ya allowlisteado). Honra D-12 (reusa el pool de movilidad, no lo reinventa),
  es DRY y deja `lint:tenant` en DISCREPANCIAS: 0 sin tocar la allowlist.

## Verificacion de fase (2026-08-14)

- **Badge del listado de sesiones sin label distintivo para COMBOS/TECNICA
  I vs II.** En el string builder `routesBySession` de `admin/service.ts`,
  COMBOS_I y COMBOS_II caen ambos al fallback generico `role.charAt(0)` =
  `"C"`, y TECNICA_I/II ambos a `"T"` — a diferencia de DEUTEROS que en la
  159 recibio DA/DB (SEM-12). NO fue un must_have declarado en ninguno de los
  6 planes y NO afecta generacion/persistencia/validacion/horarios/TV (todos
  usan el campo `role` real). Cosmetico. La convencion de label (CA/CB? C1/C2?)
  es decision de producto (coach/Franco) → seguimiento en fase 160.
