---
phase: 162-superficie-member-app-y-reporte-de-reparto
plan: 04
subsystem: member-app-store
tags: [member-app, especial-pass, pinia, capabilities, aura]
requires:
  - "GET /members/subscription/me/especial-pass — endpoint del pase (162-02)"
  - "WeeklySlotView.isSpecial del backend (162-01)"
provides:
  - "WeeklySlotView.isSpecial en el type mirror del frontend (162-05 badge)"
  - "useUserStore.especialPass ref + loadEspecialPass() action"
  - "capabilities hasEspecialPass / especialClassesRemaining / especialClassesBudget / hasOnlyEspecialPass"
affects:
  - "162-05 (grilla member, gate y contador x/2) — consume estas capabilities"
tech-stack:
  added: []
  patterns:
    - "capabilities aditivas (D-06): el pase NO altera hasPresencialReservationAccess ni el subscription singular"
    - "loadEspecialPass espeja loadSubscription (try/catch, null en error/204)"
    - "test unitario Pinia+axios mock (patrón user-store-level-selection)"
key-files:
  created:
    - el-templo-app/test/user-store-especial-pass.test.ts
  modified:
    - el-templo-app/src/types/scheduling.ts
    - el-templo-app/src/stores/useUserStore.ts
decisions:
  - "especialPass como ref aislado (no derivado del singular) para no romper el modelo del subscription singular que consume media app"
  - "loadEspecialPass normaliza { hasPass:false } / 204 / error a especialPass=null"
metrics:
  duration: ~5min
  completed: 2026-07-15
  tasks: 3
  files: 3
requirements: [APP-01, APP-02]
---

# Phase 162 Plan 04: Estado del cliente del pase especial (useUserStore) Summary

`useUserStore` ahora conoce el pase "Actividades con Aura" mediante un ref aislado (`especialPass`) y capabilities aditivas (`hasEspecialPass`, `especialClassesRemaining`, `especialClassesBudget`, `hasOnlyEspecialPass`) alimentadas por `loadEspecialPass()` contra `GET /me/especial-pass`, sin tocar la semántica del `subscription` singular ni `hasPresencialReservationAccess` (D-06) — corrigiendo la latencia de modelo del cliente (Pitfall 1) para que un socio con presencial+pase no quede bloqueado de la grilla. Suma el mirror `isSpecial` al type del frontend para el badge de 162-05.

## What Was Built

- **`WeeklySlotView.isSpecial: boolean`** (`scheduling.ts`): mirror del backend (162-01) para que el badge de clase especial de 162-05 tenga tipo. Único cambio del archivo.
- **`especialPass` ref + `EspecialPass` interface** (`useUserStore.ts`): ref `EspecialPass | null` aislado del singular. Contrato del endpoint 162-02 (`hasPass` + saldo x/budget + `endDate` + `isSocio`).
- **`loadEspecialPass()` action**: pega a `/members/subscription/me/especial-pass` con el patrón exacto de `loadSubscription` (try/catch). Normaliza `{ hasPass:false }` / 204 / error de red a `especialPass = null`.
- **Capabilities (computeds)**: `hasEspecialPass` (pase presente), `especialClassesRemaining` (`?? 0`), `especialClassesBudget` (`?? 2`), `hasOnlyEspecialPass` (`hasEspecialPass && !hasPresencialReservationAccess` — distingue externo-solo-pase del socio-con-pase). Todas derivan SOLO de `especialPass`.
- **`clearProfile`** resetea `especialPass = null` junto al singular.
- **Test unitario** (`user-store-especial-pass.test.ts`, 7 casos): pase socio, sin-pase, 204/error, INDEPENDENCIA del singular (singular con sub especial → capabilities del pase siguen derivando de `especialPass`), socio con presencial+pase (`hasPresencialReservationAccess` intacto + `hasOnlyEspecialPass=false`), externo-solo-pase (`hasOnlyEspecialPass=true`), y `clearProfile` limpia el pase.

## Tasks Completed

| Task | Name                                                     | Commit   | Files                            |
| ---- | -------------------------------------------------------- | -------- | -------------------------------- |
| 1    | Mirror isSpecial en el type del frontend                 | 37ceda86 | scheduling.ts                    |
| 2    | Capabilities del pase + loadEspecialPass en useUserStore | bd6529ac | useUserStore.ts                  |
| 3    | Test unitario — capabilities independientes del singular | b7715f24 | user-store-especial-pass.test.ts |

## Verification

- `cd el-templo-app && npx vue-tsc --noEmit`: cero errores NUEVOS (26 errores baseline preexistentes = 26 después; ninguno menciona `scheduling.ts`/`useUserStore.ts`/`isSpecial`). El baseline preexistente es de config (import.meta.env, module resolution) — CI NO typechequea el app.
- `cd el-templo-app && npx vitest run test/user-store-especial-pass.test.ts`: 7/7 verde.
- Regresión: `hasPresencialReservationAccess` y el `subscription` singular sin cambios (solo se agregaron computeds/refs nuevos; el test de independencia lo fija).

## Threat Model

- **T-162-04-01 / T-162-04-02 (EoP / Tampering)**: accept — las capabilities del store son sólo UX de pantalla; el backend (161-06 / GATE-04) es la autoridad de la reserva. Manipular el ref no otorga acceso.
- **T-162-SC (installs)**: mitigado — cero paquetes nuevos (Pinia/axios ya presentes).

## Deviations from Plan

### Auto-fixed Issues

Ninguno — el plan se ejecutó tal cual.

### Notas

**1. [Formato - Prettier] test reformateado por lint-staged.** El pre-commit hook (prettier) envolvió los objetos `data` del mock a multilínea. Semántica idéntica; 7/7 verde tras el reformateo.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- FOUND: el-templo-app/src/types/scheduling.ts (isSpecial)
- FOUND: el-templo-app/src/stores/useUserStore.ts (loadEspecialPass, capabilities)
- FOUND: el-templo-app/test/user-store-especial-pass.test.ts
- FOUND commits: 37ceda86, bd6529ac, b7715f24
