---
phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro
plan: 03
subsystem: backend (finance — void cascade + transaction surfacing)
tags: [pos-profe, alta-alumno, void-cascade, createdMemberId, userStatusHistory]
requires:
  - "financial_transactions.created_member_id (148-01, FK nullable a users.id)"
  - "_void privado + SubscriptionCanceller (Fase 137 VAL-06)"
  - "status flip + userStatusHistory pattern (members/routes.ts L847-869)"
provides:
  - "_void cascade: flip del alumno creado → status='inactivo' + userStatusHistory cuando createdMemberId no-null"
  - "TransactionDetail.createdMemberName (join a users por createdMemberId)"
  - "PendingTrayItem.createdMemberId + createdMemberName (copy de advertencia de la bandeja)"
affects:
  - "148-06 (frontend bandeja — pinta la copy de advertencia al anular con createdMemberName)"
  - "148-04 (tests — cubre void→cascade member inactivo + sub cancelada + preexistente intacto)"
tech-stack:
  added: []
  patterns:
    - "Cascade gateado por columna FK nullable (createdMemberId no-null) dentro de la tx de _void — atómico con el soft-void + sub cancel"
    - "Status flip + userStatusHistory read-before/write-after con dedupe from==to (espejo de members/routes.ts)"
    - "leftJoin alias a users por createdMemberId para surfacar el nombre (null cuando no aplica)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/types.ts
decisions:
  - "El cascade va DENTRO de _void (no en void()) para que voidPair/voidInTx/correct lo hereden y sea atómico con el soft-void + sub cancel ante cualquier throw posterior."
  - "El alumno NUNCA se borra — solo UPDATE status='inactivo' + history (FK safety, CONTEXT L48-50). Preexistente (createdMemberId null) = no-op exacto."
  - "routes.ts NO requirió cambios: void y pending-tray no tienen schema de respuesta 2xx (solo 4xx/5xx), así que los campos aditivos fluyen sin stripping de Fastify."
  - "void() return NO se enriqueció con createdMemberName: la copy de la bandeja se muestra ANTES de anular (desde listPendingTray), no del response del void."
metrics:
  duration: ~8min
  completed: 2026-06-26
---

# Phase 148 Plan 03: Cascade en void + surfacing del alumno creado Summary

**One-liner:** Refuerzo B (ALTA-06) — cuando gestión anula en la bandeja una carga que creó un alumno nuevo (`createdMemberId` no-null), `_void` ahora además flipea ese alumno a `'inactivo'` (sin borrarlo) + escribe `userStatusHistory` dentro de la misma tx del soft-void/sub-cancel; y el detalle (`getById`) + el listado de pendientes (`listPendingTray`) exponen `createdMemberId` + `createdMemberName` para que la bandeja (148-06) pinte la copy de advertencia.

## What Was Built

### Task 1 — Cascade en `_void` (flip member→inactivo) — `55ce6d71`

- Dentro de la tx de `_void` (`transaction-service.ts`), después del soft-void + balance rollback + (eventual) cancelación de subscription, se agregó un bloque gateado por `existing.createdMemberId !== null`:
  - Lee el status del alumno **antes** del flip (`SELECT status FROM users WHERE id = createdMemberId`) para registrar el `fromStatus` real (read-before/write-after, espejo de `members/routes.ts` L847-869).
  - `UPDATE users SET status='inactivo'` para `createdMemberId`.
  - `INSERT userStatusHistory (fromStatus=<previo>, toStatus='inactivo', source='admin')` **con dedupe `from==to`**: solo si el status previo no era ya `'inactivo'` (no acumula filas en re-void / alumno ya inactivo).
- El alumno **NUNCA se borra** (sin `DELETE` de users — FK safety). Para `createdMemberId` null (preexistente / path admin) el bloque es no-op → el void se comporta exactamente como antes.
- Todo dentro de la **misma tx** de `_void` → rollback en bloque junto al soft-void + sub-cancel ante cualquier throw posterior (T-148-14, atomicidad).
- La membresía ya la cancela el `SubscriptionCanceller` (rama `keepMembershipActive=false`); el flip del alumno es el único paso genuinamente nuevo.

### Task 2 — Surfacar `createdMemberId` + `createdMemberName` — `dac4be0f`

- `getById` (detalle): `leftJoin` a `users` (alias `created_member`) por `createdMemberId` → arma `createdMemberName` = `firstName + lastName` (trim), `null` cuando `createdMemberId` es null. Se agrega al payload `TransactionDetail`.
- `listPendingTray` (listado de la bandeja): `leftJoin` al mismo alias + se agregan `createdMemberId`, `createdMemberFirstName`, `createdMemberLastName` al `SELECT`, y el `map` expone `createdMemberId` + `createdMemberName` en cada `PendingTrayItem`.
- Tipos: `TransactionDetail.createdMemberName?: string | null` (aditivo/opcional) y `PendingTrayItem.createdMemberId: number | null` + `createdMemberName: string | null` (los produce el único constructor, `listPendingTray`).
- Campos **aditivos** — no se tocó el filtro de "dinero firme" ni las métricas; `null` para cargas de alumno preexistente.

## Verification Results

- `pnpm exec tsc --noEmit` verde tras cada task.
- `grep -c "createdMemberId" transaction-service.ts` == 8 (≥1, Task 1); `grep -c "createdMemberName\|createdMemberId" transaction-service.ts` == 16 (≥2, Task 2).
- Sin `DELETE` de `users` en el cascade (`grep` confirmado).
- El flip a `'inactivo'` + `userStatusHistory` ocurre dentro de la tx de `_void`, gateado por `createdMemberId` no-null.
- `listPendingTray`/void no tienen schema de respuesta 2xx → los campos aditivos no se strippean.

## Deviations from Plan

### Minor — `routes.ts` no requirió cambios

- **Found during:** Task 2.
- **Issue:** El plan listaba `el-templo-api/src/modules/finance/routes.ts` en `files_modified` para Task 2.
- **Resolución:** Los endpoints `GET /pending-tray` y `POST /transactions/:id/void` definen **solo** schemas de respuesta `4xx/5xx` (sin schema 2xx), por lo que Fastify NO strippea propiedades aditivas del payload de éxito y el output del servicio fluye tal cual. No hizo falta tocar `routes.ts` ni `schemas.ts`. Cambio puramente de servicio + tipos, sin regresión.
- **Files modified:** ninguno (decisión de no-cambio documentada).

## TDD Gate Compliance

- Task 1 está marcada `tdd="true"`, pero su `acceptance_criteria` indica explícitamente que la cobertura vive en **148-04** ("Cubierto por el test void→cascade de 148-04") — mismo patrón que 148-01 (tests diferidos a 148-04). Por política del repo (CLAUDE.md / MEMORY) los tests corren en CI contra MySQL `eltemplo_test`, no localmente. No se escribieron tests RED/GREEN en este plan; la implementación queda verificada por `tsc` + grep y se valida en CI vía 148-04. Sin commit `test(...)` en este plan por diseño del wave.

## Known Stubs

None — el cascade y el surfacing están completamente cableados; `createdMemberName` se resuelve por join real, sin valores hardcodeados.

## Notes for Downstream Plans

- **148-06 (frontend bandeja):** leer `createdMemberId` + `createdMemberName` del item de `listPendingTray`; cuando `createdMemberId` no-null, mostrar la copy de advertencia al anular ("Esta carga creó al alumno {createdMemberName}. Al anular, también se desactivará su membresía…"). El void server-side ya hace el flip — el frontend solo informa.
- **148-04 (tests):** cubrir void→cascade (alumno `inactivo` + sub cancelada + `userStatusHistory` con `fromStatus` real), el caso preexistente (`createdMemberId` null → status sin cambios), y la idempotencia del dedupe (re-void de alumno ya inactivo no duplica history).

## Self-Check: PASSED

- FOUND commit 55ce6d71, dac4be0f
- FOUND: el-templo-api/src/modules/finance/transaction-service.ts (cascade + getById/listPendingTray surfacing)
- FOUND: el-templo-api/src/modules/finance/types.ts (TransactionDetail.createdMemberName + PendingTrayItem.createdMemberId/Name)
