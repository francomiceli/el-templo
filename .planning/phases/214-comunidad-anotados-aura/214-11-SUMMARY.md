---
phase: 214-comunidad-anotados-aura
plan: 11
subsystem: aura-api
tags: [aura, earned, auth-me, attendance, D-02, D-12, D-40, D-56]
requires: ["214-10"]
provides:
  - "earned.ts: earnedRowsFilter, earnedAuraByUsers, earnedAuraForUser, auraAwardedForReference"
  - "GET /api/auth/me devuelve auraEarned (propio, por JWT, sin distinción por rol)"
  - "POST /api/members/attendance/check-in devuelve auraAwarded y auraTotal (nullable)"
affects: ["214-17", "214-18"]
key-files:
  created:
    - el-templo-api/src/modules/aura/earned.ts
    - el-templo-api/test/aura/earned-aura.test.ts
  modified:
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/attendance/schemas.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/test/attendance/attendance.test.ts
decisions:
  - "auraAwardedForReference recibe sourceType: AuraSourceType (no string) para que compile contra la columna enum"
  - "earnedRowsFilter lleva una exención tenant-safe de bloque: el linter lo marcaba como acceso sin tenantWhere, pero es solo un fragmento de WHERE que siempre se combina con tenantWhere"
  - "Un único test del canje real usa AuraService.spend (referenceType subscription) además del canje sembrado a mano"
metrics:
  tasks: 3
  completed: 2026-11-17
---

# Phase 214 Plan 11: Aura ganada en /me y en el check-in Summary

Una sola definición de "Aura ganada" (ledger sin canjes ni `subscription_discount`, dejando pasar `reference_type` NULL), el número propio en `/auth/me` y el dato de la celebración en la respuesta del check-in del socio.

## Commits

- `2bbf39b00` feat(214-11): Aura ganada en /auth/me (D-02, D-12)
- `63a5bf130` feat(214-11): el check-in informa Aura sumada y total cuando acreditó (D-40, D-56)
- `c4dbd5e1a` test(214-11): Aura ganada en /me y en el check-in

## Detalle

- `earnedRowsFilter()` usa SQL explícito con `<=>`: `NOT (source_type = 'subscription_discount' OR (source_type = 'manual_adjustment' AND reference_type <=> 'subscription'))`. Un `ne()` suelto descartaría las filas con `reference_type` NULL (onboarding, reversas).
- `earnedAuraByUsers` hace UNA consulta con `GROUP BY` para N usuarios; ids sin filas valen 0; lista vacía no consulta. Lo reusan los planes 17 (anotados) y 18 (movimientos).
- `/me`: `auraEarned` es número, o `null` solo si `templo-gamification` está apagado o falla la lectura (`request.log.warn`). No mira el rol; no existe `auraVisible`.
- Check-in del socio: `memberCheckInResponseSchema` (propio) con `auraAwarded`/`auraTotal` `["integer","null"]`. `attendanceRecordSchema` intacto, forzado y admin no cambian. Se deciden por lo que el ledger registró para esa asistencia (`source_type attendance`, `reference_id = record.id`): 5, 2 por el tope del día (D-64), o null si no acreditó. La lectura va en `try/catch` y nunca rompe el check-in.
- El auto-registro del profe (`coachSelfScan`) NO acredita Aura: es el camino real del caso `null` por la ruta del socio, y el test lo usa (más el caso de módulo apagado).

## Tests

- `test/aura/earned-aura.test.ts` (carpeta nueva, 7 `it`): suma sin canje (65), dos alumnos distintos (D-37), socio sin movimientos (0), staff con su número, conciliación con el saldo (D-38), canje real por `spend` (baja el saldo, no la ganada) y módulo apagado en el gimnasio 2 (null, y con el módulo prendido el mismo socio ve su número).
- `test/attendance/attendance.test.ts` (5 `it` nuevos, en un `describe` anidado con `afterEach(restoreTemploFlags)`): dos asistencias previas (5 y total = previo + 5), app ya sumó 3 (2, D-64), profe auto-registro (null/null), módulo apagado (null/null y asistencia igual registrada), forzado sin los campos. El "previo" se lee de `/me`, no se hardcodea.
- NO corrieron: `test/setup.ts` se cuelga en local (lección del plan 02). Quedan para CI.

## Verificación

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0; `tenant-lint-allowlist.json` sin cambios.
- `pnpm typecheck:tests` sigue en rojo por deuda ajena (18 discrepancias de baseline); en `earned-aura.test.ts` 0 errores, en `attendance.test.ts` solo los previos (TS2300 `appBranchName` duplicado, TS2769 `branchId` en `activities`). Un `TS2304 afterEach` que introduje se corrigió antes del commit.
- `test/unit/aura-amounts.test.ts` 6 de 6 en verde (config unitaria).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `lint:tenant` marcaba `earned.ts`**
- **Found during:** Task 1
- **Issue:** `earnedRowsFilter` nombra columnas de `aura_transactions` sin `tenantWhere`; el linter lo contó como violación no listada.
- **Fix:** exención `tenant-safe` de bloque pegada al sitio (no se toca la allowlist). Explica que el fragmento siempre se combina con `tenantWhere(schema.auraTransactions, ctx)`.
- **Commit:** `2bbf39b00`

**2. [Rule 3 - Blocking] tipo de `sourceType`**
- `auraAwardedForReference` tipa `sourceType` como `AuraSourceType` en vez de `string` (el plan decía `string`): con `string` no compila contra la columna enum.

## Supuestos a vigilar

- Si un test falla en CI, mirar primero: el caso del profe (`createStaffUser` + `user_branches` en `testBranchId`), el reloj fijo (`TODAY_REF_ID = 20260311`) y el caso del gimnasio 2 (`setModuleFlag` con `gym2.tenantId`).
- Plan 17 y 18: reusar `earnedRowsFilter()` y `earnedAuraByUsers`; siempre con `tenantWhere(schema.auraTransactions, ctx)` como primer término.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 3 commits y los 6 archivos existen.
