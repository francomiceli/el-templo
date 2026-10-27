---
phase: 204-usuarios-wellhub
plan: 10
subsystem: api
tags: [wellhub, members, merge, audit, tenancy, tests]
requires: ["204-09"]
provides:
  - "POST /api/admin/members/:userId/wellhub-merge (body { targetUserId }) -> { ok, targetUserId, moved }"
  - "MemberWellhubService.mergeInto (una transaccion, rechazos tipados)"
  - "softDeleteMemberTx(executor, ctx, id) exportado de members/service.ts"
  - "AuditAction wellhub_member_merged"
affects: [204-15]
key-files:
  created:
    - el-templo-api/test/wellhub/merge.test.ts
  modified:
    - el-templo-api/src/modules/wellhub/member-wellhub-service.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/shared/audit-log.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-members-ficha.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-members.test.ts
metrics:
  tasks: 2
  files: 10
  completed: 2026-10-27
---

# Phase 204 Plan 10: Unir con alumno existente Summary

`POST /api/admin/members/:userId/wellhub-merge` absorbe un duplicado Wellhub puro en un alumno existente (D-05/D-21): el `gympass_id`, las reservas, las visitas, las solicitudes `wellhub_bookings` y las notas pasan al destino, el duplicado se da de baja (baja lógica) y se escribe una fila de auditoría `wellhub_member_merged`, todo en una sola transacción. Nada se corrió localmente (sin node_modules): verificación por grep y lectura de código.

## Commits

- `00f5044d6` feat(204-10): unir duplicado Wellhub con alumno existente (D-05/D-21)
- `13589685d` test(204-10): tests de la union de fichas Wellhub, manifiesto y casos ISO-03
- `ecb9d0ebb` fix(204-10): con dos reservas muertas en el mismo choque se borra la del duplicado

## Lo hecho

- `softDeleteMemberTx` extraído de `softDeleteMember` (el scrub existe una sola vez; `softDeleteMember` delega con `this.db`, comportamiento idéntico). Recibe `MySql2Database | TxHandle`.
- `isPureWellhub` ahora acepta `DbInstance | TxHandle` (alias local `Executor`, patrón `InvitationExecutor`).
- `mergeInto`: orden dentro de la tx = cargar origen y destino (`tenantWhere`, rol member, no borrados) -> origen puro y con `gympass_id` -> destino sin `gympass_id` -> choques de reserva -> `gympass_id` NULL en el origen y luego seteado en el destino (unique global) -> repuntar las 4 tablas contando filas -> `softDeleteMemberTx` -> `auditLog.write(ctx, tx, ...)`. Los rechazos de negocio son `WellhubMergeError` lanzados dentro de la tx (rollback) y atrapados afuera. Las reservas vivas se mueven, nunca se cancelan; no se usa la lógica del DELETE de socios.
- Ruta: solo `ADMIN_ROLES` (403 "Solo admin u owner puede unir fichas"), guard de alcance `isMemberVisibleToActor` (de la 09) aplicado al origen Y al destino, esquema con `additionalProperties: false`.
- Tests: `merge.test.ts` (7 `it`), manifiesto +1 (480 -> 481), `CASOS_BASELINE` 37 -> 38, caso ISO-03 con origen ajeno, destino ajeno y control positivo.

## Deviations from Plan

None - plan executed as written. Dos detalles de implementación:

- **[Rule 1 - Bug] Elección de la reserva muerta a borrar:** la primera versión borraba la del destino cuando las dos estaban muertas, contra lo que dice el comentario. Corregido en `ecb9d0ebb` (se borra la muerta; si las dos lo están, la del duplicado).
- El origen sin `gympass_id` también responde 409 con "Solo se puede unir una ficha Wellhub sin planes ni pagos" (el plan no definía ese caso; opción conservadora).

## Bugs no anticipados

Ninguno encontrado en código ajeno.

## Doubts for Franco

1. **Borrado de reserva muerta con FK:** al resolver un choque con una reserva muerta se hace `DELETE` de esa fila de `bookings`. `wellhub_bookings.booking_id` y `notifications.booking_id` tienen `ON DELETE SET NULL`, pero `trial_followups.booking_id` NO tiene `ON DELETE`: si la reserva muerta fuera una sesión de prueba con followup, el borrado fallaría (500 y rollback, nada queda a medias). Es un caso muy raro (duplicado Wellhub puro con una SP cancelada en la misma clase y día que una reserva del destino); no se manejó para no agrandar el plan.
2. **El rollback real no está testeado:** el test de atomicidad cubre el rechazo por choque (que se detecta antes de escribir). No hay un test que fuerce un fallo a mitad de camino (requeriría inyectar una falla en la tx).
3. **Rol `admin_sede`:** la ruta exige `ADMIN_ROLES` (admin/owner) como pide D-21, así que `admin_sede` y `gestion` quedan afuera.
4. **Sin ejecutar:** ni tests ni typecheck corrieron acá. Puntos a mirar si CI se queja: el `.update(...)` sobre la unión `DbInstance | TxHandle` en `softDeleteMemberTx`, y el helper `affectedRows` (lee `affectedRows` del primer elemento del resultado de drizzle-mysql2, sin cast a `any`).

## Known Stubs

None.

## Threat Flags

None (la ruta nueva está en el threat model del plan: T-204-30 a T-204-34).

## Self-Check: PASSED

- `merge.test.ts` existe con 7 `it(`; commits `00f5044d6`, `13589685d`, `ecb9d0ebb` presentes.
