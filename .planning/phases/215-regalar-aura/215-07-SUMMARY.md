---
phase: 215-regalar-aura
plan: 07
subsystem: api-aura
tags: [aura, regalo, profe, tenant_settings]
requires: ["215-06"]
provides:
  - "`getCoachGiftAmount` y `setCoachGiftAmount`: valor del regalo del profe por gimnasio (1 a 10, default 2)"
  - "`AuraGiftService.giveCoachGift` y `coachGiftStatesForSlot`"
affects: [215-08, 215-09]
tech-stack:
  added: []
  patterns:
    [
      parametro por gimnasio en tenant_settings con lectura fail-closed,
      UNIQUE como ultima barrera con 409 en vez de 500,
    ]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-settings.ts
    - el-templo-api/test/aura/gift-settings.test.ts
  modified:
    - el-templo-api/src/modules/aura/gift-service.ts
    - .planning/phases/215-regalar-aura/215-DECISIONES-AUTONOMAS.md
key-decisions:
  - "El valor del profe vive en tenant_settings, no en system_settings"
requirements-completed:
  [SC-3, SC-4, SC-5, D-01, D-03, D-04, D-06, D-07, D-08, D-11, D-13, D-15, D-16]
duration: 25 min
completed: 2026-11-18
---

# Fase 215 Plan 07: regalo del profe del lado servidor Summary

El gimnasio ya tiene un valor propio para el regalo del profe (arranca en 2, solo enteros de 1 a 10) y el servicio sabe darlo y calcular el estado de cada fila del panel de asistencia. Las rutas y el panel son el plan 08.

## Tareas

| Tarea | Commit      | Asunto                                                |
| ----- | ----------- | ----------------------------------------------------- |
| 1     | `87b6b3f90` | feat(215-07): valor del regalo del profe por gimnasio |
| 2     | `55f572164` | feat(215-07): regalo del profe y estado del panel     |

## Qué quedó

- `gift-settings.ts`: `COACH_GIFT_SETTING_KEY = "aura.gift_coach_amount"`, `getCoachGiftAmount(db, ctx, log?)` (sin fila o valor roto devuelve 2, con `warn` si hay logger) y `setCoachGiftAmount(db, ctx, amount)` (valida, upsert con `tenantValues`, `BadRequestError` "Tiene que ser un número entero entre 1 y 10.").
- `giveCoachGift(ctx, coach, { attendanceId, reason }, now)`: rol tipo profe (`REGALO_SIN_PERMISO`), motivo válido, asistencia con horario (`REGALO_NO_ENCONTRADO`), sede dentro de `coach.branchIds` (`REGALO_SIN_PERMISO`), fecha futura (`REGALO_NO_DISPONIBLE`) o fuera de la ventana (`REGALO_VENCIDO`), receptor entre `listEligibleClassmates` con `excludeUserId` del profe, un regalo por día y persona (cualquier estado) y duplicado detectado con `isDuplicateKeyError` (409, no 500). Acredita el valor vigente, guardado en la fila, con `awardInTransaction` (`social`, `GIFT_REFERENCE.gift`). Deja el marcador `// plan 15` para la push.
- `coachGiftStatesForSlot(ctx, viewer, input, now)`: módulo apagado, viewer que no es profe o sede ajena devuelven `coachGiftAmount: null` y todo en null. Si no, una lectura del valor, una consulta de regalos del profe ese día y una llamada de elegibilidad (solo si la fecha está en la ventana): `dado` (con `amount` y `reason` de la fila), `disponible` o `no_participa`; sin asistencia, null.
- `gift-settings.test.ts` (5 `it`): default, round-trip y upsert sin duplicar fila, valores inválidos que no pisan lo guardado, valor roto escrito a mano y aislamiento con el gimnasio 2. Limpia solo su clave (`tenant_settings` no está en `cleanAllTestData`).

## Control posterior

- API `npx tsc --noEmit`: 0 (base 0). `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (heap ampliado): ninguna mención de `gift-settings` ni `gift-service`; la deuda listada es ajena.
- No se corrió ningún test de integración (quedan para CI). App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push.

## Desvíos respecto del plan

Ninguno. `giveCoachGift` no consulta el flag del módulo (lo hará el guard de la ruta del plan 08); `coachGiftStatesForSlot` sí, como pide el plan.

## Decisiones propias

Tres filas nuevas en `215-DECISIONES-AUTONOMAS.md`: suplencias permitidas por sede asignada, regalo del profe anulado sigue como "dado" y ocupa el día, y valor roto cae al default con aviso en el registro.

## Lecciones para los planes siguientes

- Plan 08: la ruta debe pasar `branchIds` desde `request.scope.branchIds` y proteger por rol y por el módulo `templo-gamification`; `giveCoachGift` revalida el rol pero no el flag del módulo.
- `coachGiftStatesForSlot` recibe `members` con `memberId` y `attendanceId` (null si no tiene) y devuelve un `Map` por `memberId`; `timezone` es la de la sede de la clase.
- El estado `dado` sale también para un regalo anulado y para fechas fuera de la ventana; solo `disponible` implica botón.
- Si CI falla en `gift-settings.test.ts`, mirar primero el fixture del segundo gimnasio y que `limpiarSegundoGimnasio` no deje la clave de otro archivo.

## Self-Check: PASSED

Archivos y commits `87b6b3f90` y `55f572164` verificados.
