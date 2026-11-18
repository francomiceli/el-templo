---
phase: 214-comunidad-anotados-aura
plan: 10
subsystem: aura-attendance
tags: [aura, D-64, attendance, day-cap]
requires: ["214-08"]
provides:
  - "attendanceAuraAmountFor: monto que corresponde a una asistencia (5, o la diferencia hasta 5 si la app ya pagó ese día)"
  - "attendanceAuraCredited: lo que acreditó una asistencia, leído del ledger"
  - "checkIn, forceCheckIn y coachCheckIn aplican la misma regla; removeCheckIn revierte exactamente lo acreditado"
affects: ["214-11"]
key-files:
  modified:
    - el-templo-api/src/modules/aura/day-cap.ts
    - el-templo-api/src/modules/aura/amounts.ts
    - el-templo-api/src/modules/attendance/service.ts
  created:
    - el-templo-api/test/attendance/attendance-day-cap.test.ts
decisions:
  - "attendanceReversal queda exportado en AURA_AMOUNTS con comentario de referencia histórica (lo usa test/unit/aura-amounts.test.ts)"
  - "El 'segundo check-in del día' del test 3 es un forzado (no tiene la regla de una por día), en vez de armar una actividad especial"
  - "El reloj fijo del test es el mismo de attendance.test.ts (miércoles 10:00 AR); el día se deriva de esa constante"
metrics:
  tasks: 2
  completed: 2026-11-17
---

# Phase 214 Plan 10: tope del día del lado de la asistencia Summary

La asistencia acredita la diferencia hasta 5 cuando la app o el plan a medida ya pagaron ese día (app 3 -> asistencia 2), y deshacerla devuelve exactamente lo que el ledger dice que acreditó.

## Commits

- `8d55ad9ad` feat(214-10): tope del día del lado de la asistencia y reversa exacta (D-64)
- `72117b2b0` test(214-10): tope del día del lado de la asistencia

## Detalle

- `attendanceAuraAmountFor`: si hay otra asistencia con Aura ese `session_date` (excluyendo la actual) paga 5; si no, `max(0, 5 - appAuraOnLocalDay)`. Usa las lecturas del plan 08, no escribe otra consulta.
- `attendanceAuraCredited`: suma de las filas `attendance`/`attendance` con `reference_id = attendanceId` (la reversa tiene `source_type = manual_adjustment`, no entra en la suma).
- Los tres premios solo llaman a `award` si el monto es > 0. En la reversa, si lo acreditado es 0 no se llama a `spend` y se loguea `info`; el `try` que no bloquea el deshacer se conservó (ahora también cubre la lectura).
- Test de integración (10 `it`): app primero (2), sin app (5), segunda asistencia (5), plan a medida (2), app que ya cubre el tope (0, sin fila), deshacer de 2 (-2), de 5 (-5), de 0 (sin reversa), forzado (2) y coach (2 y reversa -2). Cada caso verifica el saldo cacheado contra la suma del ledger. La Aura de la app se siembra con `AuraService.award` (mismo INSERT al ledger, deja el saldo coherente).

## Verificación

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` sigue en rojo por deuda ajena (264 contra 263 previos): ese +1 era un `TS2769` de mi test por `branchId` en `activities` (error que `attendance.test.ts` ya tiene en su helper), corregido antes del commit; en el archivo nuevo quedan 0 errores y ninguno en los de producción tocados.
- El test nuevo NO corrió: `test/setup.ts` se cuelga en local (lección del plan 02). Queda para CI.

## Deviations from Plan

None - plan executed exactly as written.

## Supuestos a vigilar

- Deuda conocida (anotada en el docblock del test): el check-in forzado guarda la fecha UTC; de noche puede caer en otro día que el de la app y no absorber su Aura.
- Deshacer una asistencia que absorbió la app NO devuelve los puntos a la app: el día vuelve a valer lo de la app (3), no se recalcula hacia atrás (D-68).
- Plan 11: `auraAwarded` sale del ledger, puede ser 2 (o 0 si el monto es 0).
- Si el test falla en CI, mirar primero `setupMember` (plan + pago por `transaction_links`, copiado de `attendance.test.ts`) y el horario del miércoles 10:00 con reserva de hoy.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 2 commits y los 4 archivos existen.
