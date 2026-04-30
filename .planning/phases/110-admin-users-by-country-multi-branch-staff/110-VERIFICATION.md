# Phase 110 — VERIFICATION

**Phase:** 110-admin-users-by-country-multi-branch-staff
**Date scaffolded:** 2026-04-30
**Status:** PENDIENTE
**Verified by:** Claude (scaffold + automated checks de Plans 01-08) + ignaciobordon@eltemplo.org (smoke + UAT pendiente)

**Smoke Pendiente — Handoff al Operador**

Este documento es la puerta de sign-off manual para Phase 110 (Admin users por país + multi-sede staff). Todas las secciones deben estar en estado PASS antes de desplegar a staging y luego a producción. **NO viernes** — NO desplegar esta fase a producción un viernes.

Mismo patrón de cierre que Phase 107/108/109: el código está mergeado, los tests automatizados (Plan 07) pasan, y el smoke + UAT staging se completan offline antes del sign-off de producción. Phase 110 NO se considera 100% completa hasta que todas las secciones de este documento estén firmadas.

---

## 1. Smoke Pendiente — Handoff al Operador

> **Read first:** Plan 07 (`110-07-PLAN.md`) cubre REQ-5/6/7/9/10/12 en tests automatizados. REQ-8 (booking multibranch staff bypass) tiene DOS capas: (a) cobertura mínima service-level YA está automatizada en Plan 07 per Warning 3 (`BookingService.reserve()` invocado directamente con un seed mínimo); (b) los escenarios HTTP-level pesados (POST /api/scheduling/bookings con flujo completo de booking) quedaron como `it.todo` y se verifican manualmente en §3 Smoke Scenarios. REQ-11 (form per role) requiere UAT visual — cubierto en §4.

### 1.1 Pre-flight checklist

- [ ] On a non-master local branch (NOT viernes — staging-first STRICT per memoria)
- [ ] Migration 0107 (Plan 02) aplicada localmente sin errores
- [ ] `cd el-templo-api && pnpm test test/branch-access.test.ts` exits 0 — esperado: 32 passed + 2 todo (Plan 07: incl. REQ-8 service-level + REQ-9 5to caso)
- [ ] `cd el-templo-api && pnpm test test/country-scope.test.ts` exits 0 — regresión Phase 98 D-18 (owner-without-toggle resuelve a own branch country)
- [ ] `cd el-templo-admin && pnpm tsc --noEmit && pnpm build` exits 0 — Plan 08 (3 errores pre-existentes en pdfmake `session-pdf-builder.ts` están documentados y aceptados como out-of-scope; el build debe completar)
- [ ] `cd el-templo-app && pnpm tsc --noEmit` exits 0 — sanity (no hubo cambios member-app esperados en esta fase)

---

## 2. Acceptance Criteria (from SPEC.md)

Copia de los 16 checkboxes del SPEC.md — registrar PASS / FAIL acá.

- [ ] **AC-1**: Migration SQL aplicada en local y staging sin errores (`pnpm db:migrate` exit 0)
- [ ] **AC-2**: `SELECT COUNT(*) FROM users WHERE role IN ('admin','gestion') AND country IS NULL` = 0
- [ ] **AC-3**: Cada coach/recepción tiene ≥ 1 fila en `user_branches` con su sede actual
- [ ] **AC-4**: Owners siguen accesibles con `country IS NULL`
- [ ] **AC-5**: `request.scope` incluye `country`, `branchIds`, `isOwner`, `role`, `userBranchId` (Blocker 2 fix)
- [ ] **AC-6**: `canAccessBranch` con admin AR pidiendo sede ES retorna `false`
- [ ] **AC-7**: `canAccessBranch` con sede `isVirtual=true` retorna `true` para cualquier rol/scope
- [ ] **AC-8**: `GET /api/admin/members?branchId=<ES>` con admin AR retorna 403 con body `{ code: "BRANCH_OUT_OF_SCOPE" }`
- [ ] **AC-9**: Endpoint admin para sede de Templo Online retorna 200 desde admin AR Y desde admin ES
- [ ] **AC-10**: Coach con `user_branches=[A,B]` opera sobre A → 200; sobre B → 200; sobre una tercera C → 403
- [ ] **AC-11**: Staff (rol != member) reserva en sede distinta a `branch_id` sin plan `multiBranch` → 200 (service-level automated en Plan 07; HTTP-level §3 S-1)
- [ ] **AC-12**: Service rechaza con 400 al crear admin sin `country`
- [ ] **AC-13**: Service rechaza con 400 al crear coach con `branchIds=[]`
- [ ] **AC-13b** (REQ-9 4to caso, Blocker 1 fix): Service rechaza con 400 al crear member con `branchIds=[X]`
- [ ] **AC-14**: UsuariosPage muestra país para admin/gestion + multi-select de sedes para coach/recepción según rol seleccionado
- [ ] **AC-15**: Selector de sede en `CajaPage.vue` muestra solo sedes accesibles (verificable manualmente con admin AR vs admin ES)
- [ ] **AC-16**: Tests integración nuevos pasan en `el-templo-api/test/` cubriendo: scope hook, canAccessBranch, 403 cross-country, virtual bypass, multisucursal staff, validación cardinalidad

---

## 3. Smoke Scenarios (manual)

### S-1: REQ-8 booking multibranch staff bypass — HTTP-level (covers AC-11 heavyweight path)

**Goal:** confirmar a nivel HTTP que un coach (o cualquier staff role) usando la app de miembros puede reservar bonus en otra sede sin plan multiBranch — y que los members siguen siendo rechazados. La invariante service-level ya está automatizada en Plan 07 per Warning 3; este escenario valida el flujo completo POST /api/scheduling/bookings end-to-end.

**Setup:**

1. En la DB local, encontrar o crear un usuario coach con `role=coach`, `branchId=<sede A>`.
2. Confirmar que el coach NO tiene subscription activa con `plan.multiBranch=true`. Si tiene alguna subscription, asegurar que `plan.multiBranch=false`.
3. Encontrar o crear un schedule slot en `<sede B>` ≠ `<sede A>`.

**Steps (member app, logueado como el coach):**

1. Abrir la página de bookings.
2. Cambiar a la vista de `<sede B>`.
3. Reservar una clase en esa sede.

**Expected:** 200 + booking row creada en DB.

**Regression check:**

1. Repetir con un usuario member (`role=member`) en un plan sin multiBranch.
2. Reservar de la misma forma.

**Expected:** 400 con mensaje "No podes reservar clases bonus en otra sucursal con tu plan actual".

- [ ] S-1 PASS (staff bypass) + regression PASS (member rechazado)

### S-2: AC-15 CajaPage selector — admin AR vs admin ES

**Setup:** asegurar que la DB local tenga al menos 1 sede AR + 1 sede ES + 1 sede virtual (Templo Online).

**Steps (admin app, ejecutar 2 veces):**

Round A — login como admin con `country='AR'`:

1. Abrir CajaPage.
2. Click en el dropdown de selector de sede.

**Expected:** el dropdown muestra solo sedes AR + Templo Online. NO sedes ES.

Round B — login como admin con `country='ES'`:

1. Mismo procedimiento.

**Expected:** sedes ES + Templo Online. NO sedes AR.

- [ ] S-2 Round A PASS
- [ ] S-2 Round B PASS

### S-3: AC-15 same check — coach con user_branches limitadas

**Setup:** encontrar o crear un coach con `user_branches = [<AR sede 1>, <virtual>]` (NO `<AR sede 2>`).

**Steps (admin app, logueado como ese coach):**

1. Abrir CajaPage.
2. Click en el selector de sede.

**Expected:** el dropdown muestra solo `<AR sede 1>` + `<virtual>`. NO `<AR sede 2>`. NO sedes ES.

- [ ] S-3 PASS

---

## 4. UAT — REQ-11 form per role (covers AC-14)

Logueado como un usuario owner, abrir UsuariosPage y click en "Nuevo usuario".

### 4.1 Admin role

1. Seleccionar role = "Admin".

**Expected:** el form muestra País (select AR/ES) + Sede (single-select). NO muestra Sedes operativas (multi-select).

- [ ] 4.1 PASS

### 4.2 Gestion role

1. Seleccionar role = "Gestion".

**Expected:** el form muestra País + Sede. NO muestra Sedes operativas.

- [ ] 4.2 PASS

### 4.3 Coach role

1. Seleccionar role = "Coach".

**Expected:** el form muestra Sede (single-select para sede personal de entrenamiento) + Sedes operativas (multi-select con chips). NO muestra País.

- [ ] 4.3 PASS

### 4.4 Recepcion role

1. Seleccionar role = "Recepcion".

**Expected:** mismo que coach — Sede + Sedes operativas. NO País.

- [ ] 4.4 PASS

### 4.5 Owner role

1. Seleccionar role = "Owner".

**Expected:** el form muestra Sede solamente. NO País. NO Sedes operativas (D-12: owner.country=NULL acceso global).

- [ ] 4.5 PASS

### 4.6 Validation — submit empty

1. Seleccionar role = "Admin", dejar País vacío, click Guardar.

**Expected:** error inline en el campo País. Form NO submitea.

- [ ] 4.6 PASS

### 4.7 Validation — coach sin sedes operativas

1. Seleccionar role = "Coach", elegir Sede, dejar Sedes operativas vacío, click Guardar.

**Expected:** error inline "Requerido al menos una sede". Form NO submitea.

- [ ] 4.7 PASS

### 4.8 End-to-end create — coach con 2 sedes

1. Crear coach con `branchId=<sede A>`, `branchIds=[<sede A>, <sede B>]`.
2. Confirmar respuesta 201.
3. Ejecutar SQL: `SELECT user_id, branch_id FROM user_branches WHERE user_id = <id>`.

**Expected:** 2 filas.

- [ ] 4.8 PASS

---

## 5. Decision Coverage Matrix

Confirma que cada decisión del CONTEXT.md está implementada en algún plan de la fase.

| Decision                                                        | Implementation                                                                                                            | Plan                      | Status |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------ |
| D-01 canAccessBranch helper                                     | `el-templo-api/src/modules/shared/branch-access.ts` (función pura testeable)                                              | 03 Task 2                 | [ ]    |
| D-02 requireBranchAccess({ from, optional? }) per route         | `requireBranchAccess` factory + per-route registration (sin auto-detección)                                               | 03 Task 2 + 06 Tasks 1-3  | [ ]    |
| D-03 preHandler (403) + service (400) coexistence               | preserved inline 400 guards en finance/members/scheduling                                                                 | 06 Tasks 1-3              | [ ]    |
| D-04 403 (permission) + 400 (data) coexistence                  | both code paths exist                                                                                                     | 03 Task 2 + Phase 98 D-03 | [ ]    |
| D-05 body shape `{ error, message, code: BRANCH_OUT_OF_SCOPE }` | exact constant exported + sent (incl. inline GET /:userId guard harmonized — Warning 2)                                   | 03 Task 2 + 06 Task 1     | [ ]    |
| D-06 structured warn log                                        | `request.log.warn({...}, 'BRANCH_OUT_OF_SCOPE')` en cada violación (no Sentry per Phase 98 D-17)                          | 03 Task 2                 | [ ]    |
| D-07 GET /admin/members/branches scope filter                   | rewrite con virtual concat al final                                                                                       | 06 Task 1                 | [ ]    |
| D-08 owner ?country= toggle                                     | preserved Phase 98 D-02 (incl. owner-without-toggle resuelve a own branch country — Blocker 3 fix) + aplicado a /branches | 03 Task 1 + 06 Task 1     | [ ]    |
| D-09 virtual sedes always included                              | `b.isVirtual` short-circuits filter                                                                                       | 03 Task 2 + 06 Task 1     | [ ]    |
| D-10 staff CRUD owner-only                                      | OWNER_ROLES guard preserved en `/api/users` + `/api/admin/users`                                                          | 05 Task 3                 | [ ]    |
| D-11 form pide rol→país→multi-select                            | UsuariosPage conditional fields (needsCountry / needsOperationalBranches predicates)                                      | 08 Task 2                 | [ ]    |
| D-12 owner.country=NULL                                         | validateStaffCardinality + form esconde País para owner                                                                   | 05 Task 2 + 08 Task 2     | [ ]    |
| D-13 user_branches IS security                                  | canAccessBranch Rule 4 retorna false fuera de scope                                                                       | 03 Task 2 + 07 tests      | [ ]    |

---

## 6. SPEC R2 deviation + Nyquist gate documentation

### 6.1 SPEC R2 — composite PK vs autoincrement on `user_branches`

Plan 01 eligió la convención del codebase (`id` autoincrement PK + `uniqueIndex` sobre `(user_id, branch_id)`) en lugar del texto literal del SPEC R2 (composite PK sobre `(user_id, branch_id)`).

**Justificación:** la unicidad invariante se preserva vía `uniqueIndex`, los FKs `ON DELETE CASCADE` se mantienen, y el patrón se alinea con el resto del schema Drizzle del proyecto (ningún `users.*` o `*_branches` join table del codebase usa composite PK explícito — todos llevan `id` autoincrement + uniqueIndex). El comportamiento observable (rechazar duplicados al INSERT) es idéntico.

- [ ] Operador acknowledges deviation — invariante de unicidad preservada; migración de producción consistente con patrones del codebase.

### 6.2 Nyquist VALIDATION.md NO generado (Blocker 4 dismissal — false positive)

**Status:** N/A para esta fase.

El plan-checker inicialmente flaggeó esta fase como missing `VALIDATION.md`. Per el GSD workflow `plan-phase.md` Step 5.5:

> Nyquist is not applicable for this run when all of the following are true:
>
> - `research_enabled` is false
> - `has_research` is false
> - no `--research` flag was provided
>
> In that case: skip validation-strategy creation entirely.

Phase 110 satisface las tres condiciones:

- `research_enabled = false` (init config para esta corrida)
- `has_research = false` (no existe RESEARCH.md en el phase dir)
- `--research` flag NO fue provisto

Por lo tanto **VALIDATION.md está intencionalmente ausente** y el plan-checker dimension 8e flag fue un falso positivo para esta corrida. No requiere revisión del plan ni regeneración de artefactos.

- [ ] Operador acknowledges que VALIDATION.md es N/A per workflow gate Step 5.5 (NO es un missing artifact).

### 6.3 REQ-8 HTTP-level coverage gap (two-layer split)

REQ-8 tiene DOS capas de tests (Plan 07 SUMMARY documenta el split per Warning 3):

- **Service-level (automated):** `BookingService.reserve()` invocado directamente con seed mínimo — verifica el role-based bypass en `booking-service.ts:142`. Plan 07 lo dejó en estado verde (member → BadRequestError, coach → succeeds).
- **HTTP-level (manual UAT):** flujo completo POST /api/scheduling/bookings con todos los seed prerequisites (capacity, holds, attendance windows, captured-by-trial flows, etc.) — cubierto en §3 S-1 de este documento.

Los 2 `it.todo` placeholders en `test/branch-access.test.ts` capturan explícitamente la deferral al UAT manual.

- [ ] Operador confirma §3 S-1 PASS (HTTP-level scenario completa la coverage de REQ-8).

---

## 7. Sign-off

> Reminder operativo (memoria del usuario):
>
> - **NO viernes** deploy. Staging-first STRICT.
> - Hotfixes go to staging AND master.
> - Always ask before pushing.
> - App version bumps on production builds (feature = minor, bugfix = patch).
> - Migration SQL files commited alongside schema changes (Plan 02 ya cumple).
> - Prod data changes go through migrations, not seed re-runs.

Checklist final antes del staging deploy:

- [ ] §1.1 Pre-flight checklist completo
- [ ] §2 Todos los acceptance criteria (AC-1..AC-16 + AC-13b) PASS
- [ ] §3 Todos los smoke scenarios (S-1, S-2 Round A + B, S-3) PASS
- [ ] §4 Todos los UAT prompts (4.1..4.8) PASS
- [ ] §5 Decision coverage matrix completa (D-01..D-13)
- [ ] §6.1 SPEC R2 deviation acknowledged
- [ ] §6.2 Nyquist VALIDATION.md N/A acknowledged (Blocker 4 dismissal)
- [ ] §6.3 REQ-8 HTTP-level scenario PASS
- [ ] **NO viernes**: la fecha de deploy NO es viernes
- [ ] STATE.md actualizado con entrada de Phase 110
- [ ] CHANGELOG / RETROSPECTIVE entry drafted (si aplica la convención)

**Operator signature:** ********\_\_\_\_********
**Date (NOT viernes):** ********\_\_\_\_********

---

_Phase: 110-admin-users-by-country-multi-branch-staff_
_Verification scaffolded: 2026-04-30_
_Next step: operador ejecuta §1.1 → §3 → §4 → firma §7 antes del staging deploy. **NO viernes**._
