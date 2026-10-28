# Phase 174 Plan 05: attendance/service.ts — adopción de tenancy Summary

Migración de las ~13 lecturas crudas restantes y los 5 inserts (0/5) de `el-templo-api/src/modules/attendance/service.ts` al patrón `tenantWhere`/`tenantValues` de la fase 169, cerrando la deuda de tenancy del submódulo `attendance` sin cambiar comportamiento para El Templo.

## Qué se migró

**Task 1 (Pattern A — lecturas), commit `47692f25`:**

- `checkIn`: `branches` (resolución de sede por QR), `bookingsInRange` (bookings), `subscriptionPlans` (planRow), `alreadyCheckedIn` y `existingToday` (attendance, dentro y fuera de la tx).
- `coachSelfScan`: `existingToday` (attendance, dentro de la tx).
- `getSlotAttendance`: `prevRows` — query de aniversario de permanencia sobre `attendance` (no tenía tenantWhere; las otras dos queries del método ya lo tenían vía JOIN a `users`/`memberProfiles`, migradas en 173).
- `coachCheckIn`: `schedule` lookup (schedules) y `existingToday` (attendance).
- `listAttendance`: `tenantWhere(attendance, ctx)` insertado como primer elemento del array `conditions`, compartido por la query de `count` y la de `rows` (antes solo la de `rows` estaba cubierta, vía JOIN a `users`).
- `countWeeklyAttendance`: threadeado `ctx` real (PRIMERO) — único caller es `checkIn`, en el mismo archivo, que ya lo tenía. Antes era 100% crudo.
- `removeCheckIn` / `isSpecialSchedule`: **Pattern D** (`ctx` opcional, fallback `isNotNull(tabla.tenantId)`) — ver "Deviations" abajo.

**Task 2 (Pattern B — inserts), commit `730da512`:**

Los 5 inserts, 0/5 → 5/5 con `tenantValues(ctx, {...})`:

1. `checkIn` — insert `attendance` dentro de la tx.
2. `coachSelfScan` — insert `attendance` dentro de la tx.
3. `forceCheckIn` — insert `attendance`.
4. `coachCheckIn` — insert `attendance`.
5. `recordPresencialSession` — insert `completedSessions`.

## Commits

- `47692f25` — `feat(174-05): Pattern A en lecturas crudas de attendance/service.ts (Task 1)`
- `730da512` — `feat(174-05): Pattern B en los 5 inserts de attendance/service.ts (Task 2)`

## Verificación

- `cd el-templo-api && pnpm exec tsc --noEmit` — limpio, 0 errores (corrido 3 veces: tras Task 1, tras el estado combinado, tras el split final de Task 2).
- `pnpm exec vitest run --no-file-parallelism test/attendance test/check-ins` — **5 archivos, 46/46 tests verdes**, sin ajustar ninguna expectativa. Corrido 3 veces (estado combinado inicial, tras commit Task 1, tras commit Task 2 final) — mismos 46/46 las tres veces.
- `grep -c "tenantValues(ctx" el-templo-api/src/modules/attendance/service.ts` → 5.
- Revisión manual: 0 `.from(schema.*)` sobre tabla gym-owned sin `tenantWhere` en su WHERE (ver excepción documentada abajo para `removeCheckIn`/`isSpecialSchedule`).

## Deviations from Plan

### 1. [Scope-driven, no Rule 1-3] Alcance real de "reads crudos" mayor al estimado ~11

El scout de PATTERNS.md estimó "~11 reads crudos restantes" citando solo tablas `attendance`/`users`/`memberProfiles`/`userBranches`. Al recorrer el archivo completo aparecieron también `branches`, `bookings`, `subscriptionPlans` y `schedules` crudos (consistente con las 8 entradas de `tenant-lint-allowlist.json` para este archivo: `activities`, `attendance`, `bookings`, `branches`, `completed_sessions`, `schedules`, `subscription_plans`, `subscriptions`). Se migraron las ~13 lecturas encontradas realmente (todas las que tenían `ctx` disponible o threadeable dentro del archivo), no solo las citadas en el texto del plan — consistente con el `acceptance_criteria` literal ("0 `.from(schema.*)` sobre tabla gym-owned sin `tenantWhere`").

### 2. [Deuda residual documentada, NO Rule 4] `removeCheckIn` / `isSpecialSchedule` — Pattern D en vez de ctx real

`removeCheckIn(attendanceId)` no recibía `ctx` y su único caller es `attendance/routes.ts` (`DELETE /:attendanceId`), que **no** deriva `assertTenant(request.scope, ...)` — a diferencia de todas las demás rutas del mismo archivo que sí lo hacen. Threadear `ctx` real ahí requiere tocar `routes.ts`, fuera del `files_modified` declarado del plan (`el-templo-api/src/modules/attendance/service.ts` únicamente).

Se optó por el **Pattern D** ya establecido en el codebase (`subscriptions/service.ts` `activateScheduledSub`, D-05): `ctx` se agregó como parámetro **opcional y al final** (no "ctx PRIMERO" como el resto del archivo, deliberadamente, para no romper la firma en el call site de `routes.ts` que hoy llama `removeCheckIn(attendanceId)` sin segundo argumento). Con `ctx` ausente, cae a `isNotNull(schema.attendance.tenantId)` — guard provisorio correcto con tenant único activo, pero no aísla si se activara un segundo tenant. `isSpecialSchedule` (único caller: `removeCheckIn`) recibió el mismo tratamiento.

**Impacto:** ninguno para El Templo hoy (single-tenant). **Deuda para 174.1/175:** threadear `assertTenant(request.scope, "attendance.removeCheckIn")` en `attendance/routes.ts:164-172` (handler `DELETE /:attendanceId`) y pasar `ctx` como segundo argumento — ambos parámetros ya están listos para recibirlo. Recomendado registrar en `deferred-items.md` de la fase si no se resuelve en 174.1.

### 3. [Documentado, no auto-fix] Updates/deletes sin tenantWhere en `removeCheckIn` (fuera del alcance de las tasks)

El plan (Task 1 y Task 2) solo pedía Pattern A en lecturas (`.from()`) y Pattern B en los 5 inserts. `removeCheckIn` también hace `update(subscriptions)`, `update(bookings)`, `delete(attendance)`, `delete(completedSessions)` sin `tenantWhere` — no tocados, por ser updates/deletes explícitamente fuera del alcance textual de ambas tasks del plan. Mismo criterio D-05 aplicaría eventualmente si se migra este método completo.

## Known Stubs

Ninguno — no se tocó UI ni se introdujeron datos vacíos/placeholder.

## Threat Flags

Ninguno — no se agregó superficie nueva (endpoints, rutas, accesos) fuera de lo ya mapeado en el `threat_model` del plan (T-174-05-I, T-174-05-T), ambos mitigados.

## Self-Check: PASSED

- `el-templo-api/src/modules/attendance/service.ts` — FOUND (existe, modificado).
- Commit `47692f25` — FOUND en `git log --oneline`.
- Commit `730da512` — FOUND en `git log --oneline`.
- `grep -c "tenantValues(ctx" el-templo-api/src/modules/attendance/service.ts` → 5 — confirmado.
- `pnpm exec tsc --noEmit` → 0 errores — confirmado (3 corridas).
- `pnpm exec vitest run --no-file-parallelism test/attendance test/check-ins` → 46/46 — confirmado (3 corridas).
- `git status --short` en et-173 sin `.planning` staged — confirmado.
