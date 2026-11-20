---
phase: 215-regalar-aura
plan: 03
subsystem: api-reglas
tags: [aura, regalo, reglas-puras, tdd]
requires: ["215-02"]
provides:
  - "`gift-rules.ts`: motivos, ventana, semana del tope, rango del valor del profe, textos y porcentaje"
  - "`AURA_AMOUNTS.giftMember` = 1"
affects: [215-05, 215-07, 215-11, 215-14]
tech-stack:
  added: []
  patterns: [reglas puras con test unitario sin base]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-rules.ts
    - el-templo-api/test/unit/aura-gift-rules.test.ts
  modified:
    - el-templo-api/src/modules/aura/amounts.ts
    - el-templo-api/test/unit/aura-amounts.test.ts
key-decisions:
  - "Los tipos GiftReason y GiftGiverKind son alias de los del schema aura-gifts (plan 01)"
requirements-completed:
  [SC-1, SC-2, SC-3, SC-4, D-05, D-10, D-11, D-12, D-16, D-19, D-21, D-22]
duration: 10 min
completed: 2026-11-18
---

# Fase 215 Plan 03: reglas puras del regalo Summary

Reglas y textos del regalo de Aura en un solo archivo puro (`gift-rules.ts`), con 32 tests unitarios en verde que corren en menos de un segundo y `giftMember: 1` en la tabla de montos.

## Tareas

| Tarea | Commit rojo                                               | Commit verde                                |
| ----- | --------------------------------------------------------- | ------------------------------------------- |
| 1     | `e67019556` test(215-03): reglas de fechas, tope y montos | `b2d14f808` feat(215-03): reglas de fechas  |
| 2     | `021222946` test(215-03): textos del regalo (rojo)        | `9ac5350dd` feat(215-03): textos del regalo |

## Qué quedó

- `GIFT_REASONS` (4 motivos en orden), `isGiftReason`, `giftReasonLabel`.
- `isWithinGiftWindow(classDate, today)`: el mismo día o el día anterior; fecha futura nunca; cruces de mes y año cubiertos. `giftExpiresOn` = día siguiente.
- `giftWeekRange` usa `isoWeekStart` y `addDays` (no reimplementa la semana): `{ start: lunes, end: domingo }`. `GIFT_WEEKLY_CAP` = 2.
- `COACH_GIFT_AMOUNT` `{ default: 2, min: 1, max: 10 }` e `isValidCoachGiftAmount` (solo enteros 1 a 10; rechaza NaN, Infinity, strings y null).
- `GIFT_REFERENCE`, `GIFT_ROUTE`, `GIFT_VOID_LABEL`, `giversPct` (0 sin base).
- Textos: `giftPersonName`, `giftPushText`, `giftMovementLabel` (con `null` da "Regalo de Aura") y el tipo `GiftLabelInput`. El profe va solo con nombre de pila. Un test recorre todos los textos y todos los motivos y afirma que ninguno contiene "privad" (D-22).

## Control posterior

- API `npx tsc --noEmit`: 0 (base 0). `pnpm lint:tenant`: DISCREPANCIAS 0.
- `vitest.config.unit.ts` sobre los dos archivos: 32 de 32 en verde (RED confirmado antes: 7 y 1 fallos).
- App y admin: no tocados. Sin cambios en dependencias, sin push, sin bump.

## Desvíos respecto del plan

Ninguno de fondo. El docblock de `gift-rules.ts` no puede nombrar la palabra "privad" porque el verify del plan hace `grep -i` sobre el archivo; D-22 se describe como "ningún texto promete discreción".

## Decisiones propias

- `giftPersonName` toma solo la primera letra de la inicial (evita "M.." si llega "M.") y devuelve "Alguien" también cuando falta el nombre aunque haya inicial.
- Con profe sin nombre el texto es "Tu profe te dio Aura" (sin inventar un nombre).
- `giftReasonLabel` devuelve cadena vacía ante un código fuera de la lista (no ocurre con el tipo, es defensivo).

## Lecciones para los planes siguientes

- Todo texto del regalo sale de `giftPushText` / `giftMovementLabel` con un `GiftLabelInput`; el motivo se lee de `GIFT_REASONS`, nunca se duplica el texto.
- `isWithinGiftWindow` recibe fechas `YYYY-MM-DD` del día local de la sede: el servicio calcula "hoy" con `todayInTz(sede)`, no con UTC.
- `giftWeekRange(date)` da el rango para contar el tope; el rango incluye ambos extremos.
- Test puro: `npx vitest run --config vitest.config.unit.ts test/unit/aura-gift-rules.test.ts`.

## Self-Check: PASSED

Archivos creados y commits verificados.
