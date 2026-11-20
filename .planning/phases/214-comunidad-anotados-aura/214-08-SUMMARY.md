---
phase: 214-comunidad-anotados-aura
plan: 08
subsystem: aura-api
tags: [aura, D-20, D-64, sessions, goal-plans, tdd]
requires: ["214-07"]
provides:
  - "Regla de tiempo de D-20 en el servidor: proposed-time.ts (puro) conectado en /sessions/complete y en el cierre del plan a medida"
  - "aura/day-cap.ts: lecturas del tope del día de D-64 (attendanceAuraOnLocalDay, appAuraOnLocalDay) que reusa el plan 10"
affects: ["214-09", "214-10"]
key-files:
  created:
    - el-templo-api/src/modules/sessions/proposed-time.ts
    - el-templo-api/test/unit/proposed-time.test.ts
    - el-templo-api/src/modules/aura/day-cap.ts
  modified:
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/goal-plans/routes.ts
decisions:
  - "Una sesión cuyos únicos bloques son alternativos (ALT) cuenta como sin_bloques"
  - "durationSec se calcula siempre que las fechas sean finitas (también con inicio inválido) para que el log sea útil, aunque el motivo sea inicio_invalido"
  - "day-cap.ts parte de attendance (tabla strict) con tenantWhere como primer término y une aura_transactions por reference_id"
metrics:
  tasks: 2
  completed: 2026-11-17
---

# Phase 214 Plan 08: regla de tiempo de Aura (D-20) y tope del día (D-64) Summary

La app y el plan a medida acreditan 3 Aura solo si están todos los bloques que el alumno juega, la duración medida por el servidor llega al 80 % del tiempo propuesto y ese día local no hubo asistencia con Aura ni la otra fuente de la app. La regla condiciona solo el Aura: sesión, racha y programa quedan igual.

## Commits

- `627bf3239` test(214-08): regla de tiempo de D-20 (rojo)
- `77c317466` feat(214-08): tiempo propuesto y regla de Aura de D-20 (funciones puras)
- `67fa316d4` feat(214-08): regla de tiempo de D-20 en los cierres de sesión

## Detalle

- `proposed-time.ts` exporta `requiredBlockRoles`, `proposedSecondsForBlock`, `proposedSecondsForSession`, `evaluateTrainingAura` y las 5 constantes. Sin acceso a base. Los bloques `ALTERNATIVE_BLOCK_ROLES` se descartan primero. Orden de chequeo: sin_bloques, inicio_invalido, bloques_incompletos, asistio_hoy, ya_sumo_hoy, tiempo_insuficiente, ok.
- Tiempo propuesto: formatos con tope opcional toman `min(estimación, tope)`; el resto pasa por `toTimerSpec` (countdown, work_rest, interval) y `countup` usa la estimación por repeticiones (`seconds` o `reps x 3`, más descanso, por `rounds`/`totalRounds` leídos de forma defensiva). Mínimo 60 s por bloque.
- `day-cap.ts`: `attendanceAuraOnLocalDay` (suma de Aura de asistencias cuya fila de `attendance` sigue existiendo ese día; `excludeAttendanceId` opcional) y `appAuraOnLocalDay` (ledger de las dos fuentes de la app con `reference_id = YYYYMMDD`, `onlySource` opcional). Ambas con `tenantWhere`.
- `/sessions/complete` mira como "otra fuente" el plan a medida; el cierre del plan a medida mira el entrenamiento. En ambos, `awardOncePerLocalDay` solo corre dentro de `if (rule.awarded)`, todo dentro del `try/catch` del premio, con el log `Regla de Aura de la sesión`.
- El plan a medida ahora guarda `duration` (segundos) en `completed_sessions`. `goal-plans/routes.ts` ya tenía `sessionGeneratorService`, no hizo falta instanciar otro.

## Verificación

- `npx vitest run --config vitest.config.unit.ts test/unit/proposed-time.test.ts`: 30 de 30 (el rojo se confirmó antes: falla por módulo inexistente).
- `npx tsc --noEmit` API: 0 errores (base 0). `pnpm lint:tenant`: sale 0. `pnpm typecheck:tests`: sin errores en los archivos tocados (el total ya venía en rojo por archivos ajenos).
- La API no tiene eslint: `lint` se cubre con `lint:tenant` y prettier sobre los archivos tocados.
- Tests de integración: no se corrieron (quedan para CI). Los de cierre que esta regla rompe se arreglan en el plan 09.

## Deviations from Plan

None - plan executed exactly as written.

## Supuestos a vigilar

- `completed_sessions.duration` está en segundos (aunque el comentario del schema diga minutos); la regla usa segundos.
- Consulta 08 de calibración (`SECONDS_PER_REP`, mínimo por bloque) no se corrió: si muestra muchas sesiones reales bajo el 80 %, ajustar las constantes de `proposed-time.ts`.
- Residual aceptado (T-214-08-01): un `startedAt` falso de `ahora - 0,8 x propuesto` pasa; es la regla estricta diferida.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 3 commits y los 5 archivos existen.
