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
