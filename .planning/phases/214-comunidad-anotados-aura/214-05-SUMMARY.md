---
phase: 214-comunidad-anotados-aura
plan: 05
subsystem: api-sessions
tags: [aura, stretch, free-blocks, response-schema]
requires: ["214-04"]
provides:
  - "auraAmount en el cierre del estiramiento (AURA_AMOUNTS.stretch)"
  - "auraAmount en el cierre del bloque libre (AURA_AMOUNTS.extraBlock)"
affects: [214-06]
key-files:
  modified:
    - el-templo-api/src/modules/sessions/stretch-service.ts
    - el-templo-api/src/modules/sessions/stretch-schemas.ts
    - el-templo-api/test/sessions/stretch-complete.test.ts
    - el-templo-api/src/modules/sessions/free-blocks-routes.ts
    - el-templo-api/src/modules/sessions/schemas.ts
    - el-templo-api/test/sessions/free-blocks-complete.test.ts
decisions:
  - "El monto del estiramiento se arma en el servicio (tipo StretchCompleteView) y el del bloque libre en el handler de la ruta, como pedía el plan"
metrics:
  tasks: 2
  completed: 2026-11-17
---

# Phase 214 Plan 05: auraAmount en los cierres de estirar y bloque libre Summary

Los cierres de estiramiento y de bloque libre devuelven `auraAmount` (lo que paga su fuente, 1 y 2), declarado en el schema de respuesta y afirmado por un test de cada uno, para que la app deje de tener el monto fijo (plan 06).

## Commits

- `15ab5b7d3` feat(214-05): auraAmount en el cierre del estiramiento
- `b0fdb1c56` feat(214-05): auraAmount en el cierre del bloque libre

## Detalle

- Estiramiento: `StretchCompleteView.auraAmount` se devuelve en los dos caminos de éxito (completado nuevo y `toCompleteView`, que cubre `alreadyCompleted`). Schema 200 con `auraAmount: integer`. Caso "(a)" afirma `AURA_AMOUNTS.stretch`.
- Bloque libre: el handler suma `auraAmount: AURA_AMOUNTS.extraBlock`; `completeFreeBlockResponse` (en `sessions/schemas.ts`) lo declara como `integer`. El caso "10' sí" lo afirma.
- Es el monto que PAGA la fuente: la app lo muestra solo si `auraAwarded` es true.

## Verificación

- API `tsc --noEmit`: 0. `pnpm lint:tenant`: 0.
- `pnpm typecheck:tests`: ningún error en los archivos tocados.
- Los tests de integración NO se corrieron en local: quedan para CI.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 2 commits (`15ab5b7d3`, `b0fdb1c56`) y los 6 archivos existen.
