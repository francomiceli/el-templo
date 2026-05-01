# Phase 111: Salvaguardas operativas — Specification

**Created:** 2026-05-01
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 9 locked

## Goal

El sistema previene los 6 modos de falla operativa observados en el caso Soledad Mailland (validación faltante plan↔branch, UX de conversión inexistente, cancelación con plata huérfana, sin detección de duplicados, soft-delete que dejó dangling rows, sin trail forense), y reconcilia atómicamente los datos inconsistentes que ese caso dejó (transaction_link 34 apuntando a sub cancelada, 3 balances huérfanos, enrollment activo de usuario eliminado).

## Background

El 30/04/2026 una alumna (Soledad Mailland) terminó con dos cuentas paralelas en producción tras un intento fallido de conversión online→presencial:

- **Cuenta 5588** (autorregistro 29/03, branch 7 Online) — soft-deleted el 30/04 16:09 con email anonimizado.
- **Cuenta 5912** (creada manualmente el 30/04 16:30, branch 1 Moreno, status `prueba`).

Línea de tiempo del 30/04 (admin: Fernanda Etchepare, id 5707):

- 11:40 — sub 6132 (plan Flex presencial, branch 7 Online) creada + financial_transaction #34 ($65.000 cash). Sub 6132 cancelada 35 min después sin refund.
- 12:16 — sub 6134 (plan Flex, branch 7 otra vez) creada sin tx, cancelada 3.5 hs después → balance huérfano $65.000.
- 15:58 — sub 6381 (plan Flex, branch 1 ✓) creada, cancelada al eliminar usuario 11 min después → otro balance huérfano.
- 16:30 — usuario 5912 creado de cero + sub 6382 (plan Flex, branch 1, status `scheduled`) sin tx → tercer balance huérfano $65.000.

Estado actual del sistema (verificado vía SSH a producción):

- **financial_transactions.id=34**: $65.000 cash linkeado vía transaction_links a sub 6132 (cancelada). Member_id=5588 (eliminado).
- **balances.id=14, 16, 20**: huérfanos, $0/$65.000/$65.000 sobre subs canceladas.
- **balances.id=21**: $65.000 deuda sobre sub 6382 (active scheduled de cuenta 5912). Pero la plata ya entró.
- **program_enrollments.id=1125**: status `active`, user_id=5588 (eliminado).

Causas raíz mapeadas en el código:

1. **`assignPlan()` (subscriptions/service.ts:770-1158)** no valida plan presencial sobre branch virtual. Línea 1137-1158 ya tiene auto-migración de branch virtual→física cuando se asigna plan, pero no se invoca porque el branchId enviado coincide con el actual (virtual).
2. **`AssignPlanDialog.vue:1094`** envía `branchId: props.memberBranchId` sin selector visible — el admin nunca elige branch al asignar plan.
3. **`cancelSubscription()` (subscriptions/service.ts:1881-1955)** no toca financial_transactions ni recalcula balances — los deja huérfanos.
4. **`softDeleteMember()` (members/service.ts:529-562)** scrubéa email/dni pero no cascadea program_enrollments ni guard contra obligaciones financieras.
5. **No hay detección de duplicados** por teléfono ni lookup multi-criterio. Sólo `checkDniUniqueness()` (members/service.ts:607-635) por DNI exacto.
6. **No hay audit log financiero**. `session_edit_logs` es para workouts, `subscription_schedule_changes` es para turnos fijos. Reconstruir el caso de Soledad requirió investigación forense manual.

## Requirements

1. **Validación backend plan↔branch**: `assignPlan()` rechaza la combinación plan presencial + branch virtual.
   - Current: La validación no existe; el backend acepta `plan.planCategory='presencial'` con `branch.isVirtual=true` y crea la sub.
   - Target: Antes del insert, si `plan.planCategory === 'presencial'` y `branch.isVirtual === true`, throw `BadRequestError("Plan presencial requiere sede física. Convertí al alumno primero.")`.
   - Acceptance: Integration test `POST /subscriptions/assign-plan` con planId del plan 1 (Flex) y member en branch 7 (Online) devuelve HTTP 400 con mensaje exacto.

2. **UX de conversión guiada en AssignPlanDialog**: el dialog filtra planes presenciales para alumnos en sede virtual y ofrece CTA inline a la conversión.
   - Current: El dialog muestra todos los planes y envía `branchId: props.memberBranchId`, generando el caso 6132/6134.
   - Target: Si `member.branch.isVirtual === true`, los planes con `plan_category='presencial'` no aparecen en la lista. En el espacio donde estarían, se renderiza una card-banner con texto "Para asignar planes presenciales, convertí a este alumno a una sede física" + botón "Convertir a sede física" que abre `MemberFormDialog` en modo conversión. Tras conversión exitosa, el dialog refresca planes y muestra los presenciales.
   - Acceptance: Manual UAT — abrir AssignPlanDialog para Soledad (5912 está en branch 1, no aplica; usar otra cuenta de test en branch virtual). La lista no muestra plan 1. Aparece banner. Click → MemberFormDialog. Tras guardar conversión, lista refresca y plan 1 aparece.

3. **Bloqueo de cancelación con transactions activas**: `cancelSubscription()` rechaza si hay transaction_links no voided.
   - Current: `cancelSubscription` ignora financial_transactions; cancelar deja `balances` huérfanos y `transaction_links` apuntando a subs cancelados.
   - Target: Antes del update, query `transaction_links` JOIN `financial_transactions` WHERE `target_kind='subscription' AND target_id=sub.id AND voided_at IS NULL`. Si hay match, throw `BadRequestError("Hay transacciones de cobro activas en esta suscripción. Anulalas primero (Detalle Financiero → Anular) y volvé a intentar.")` con array de tx_ids en el body.
   - Acceptance: Integration test cancelar sub con tx no voided → 400 con tx_ids listados; cancelar sub sin tx o con todas voided → 200 (comportamiento actual preservado).

4. **Lookup de duplicados en admin create-member**: `MemberFormDialog` busca duplicados al ingresar DNI o teléfono y redirige al alumno existente.
   - Current: Sólo `checkDniUniqueness()` exacto por DNI. No hay check por teléfono. Trailing spaces en first_name/last_name pasan al insert (caso 5588 tenía `Mailland ` con trailing space).
   - Target: Nuevo endpoint `GET /admin/members/check-duplicates?dni=X&phone=Y` devuelve array de matches con `{id, firstName, lastName, branchId, branchName, isVirtual, status, deletedAt}`. El form llama on-blur de DNI/teléfono. Si hay match con `deletedAt IS NULL`: la fila inferior muestra "Ya existe: [Nombre] ([Sede]) — [Ver alumno]" como link directo al detalle (`/alumnos/:id`), y se deshabilita el botón submit del form.
   - Acceptance: Integration test del endpoint con DNI/phone existentes; manual UAT del lookup en admin UI; first_name y last_name son trimmeados en el insert (no aceptan trailing/leading spaces).

5. **Bloqueo de duplicados en autorregistro**: `/auth/register` rechaza si el teléfono normalizado ya existe en cuenta presencial activa.
   - Current: Autorregistro sólo valida unicidad de email vía constraint MySQL. Soledad pudo crear cuenta 5588 a pesar de tener teléfono que matcheaba (en este caso no había match porque era nueva, pero el bug sigue abierto para el próximo caso).
   - Target: Antes del insert, normalizar phone (sólo dígitos, últimos 10) y query `users WHERE normalize(phone)=X AND deleted_at IS NULL AND branch_id IN (branches físicas)`. Si hay match, devolver HTTP 409 con mensaje "Esta persona ya tiene cuenta. Iniciá sesión o contactanos."
   - Acceptance: Integration test con phone que matchea usuario existente presencial → 409; con phone único → 200/201 normal.

6. **Discontinuación del soft-delete en admin UI**: el botón de eliminar alumno no se expone más.
   - Current: El admin UI tiene un control que dispara `softDeleteMember()`. Fernanda lo usó el 30/04 16:09 sobre Soledad.
   - Target: Quitar el botón/menú item de cualquier pantalla del admin UI. El endpoint queda en backend (`softDeleteMember()` y su route) pero no se invoca desde la UI. Los miembros que dejan de venir quedan en `status='inactivo'` (estado terminal preservado).
   - Acceptance: Manual UAT — recorrer las pantallas del admin (lista de alumnos, detalle, menús contextuales) y verificar que ningún botón dispare delete. Grep del código admin: 0 callers de la función delete.

7. **`audit_log` mínimo + helper + 3 call sites**: trail forense para cancel sub / void tx / plan assigned.
   - Current: No hay tabla de auditoría financiera. Reconstruir el caso de Soledad requirió investigación SQL manual.
   - Target: Nueva tabla `audit_log` con columnas `id`, `actor_id` (FK users), `action` (varchar enum: `subscription_cancelled`, `transaction_voided`, `plan_assigned`), `target_kind` (varchar), `target_id` (int), `payload_json` (JSON con before/after relevante), `reason` (text nullable), `created_at` (timestamp). Helper `auditLog.write(tx, {...})` invocado dentro del `db.transaction` de cada acción. 3 call sites: `cancelSubscription`, `TransactionService.void`, `assignPlan`.
   - Acceptance: Migración SQL crea la tabla. Integration test de cada acción verifica que se inserta una row con campos correctos. Recovery test: rollback de la transacción no deja audit log dangling (si la acción falla, el log no se persiste).

8. **Migración SQL de reconciliación de Soledad** (idempotente):
   - Current: `transaction_links.id=34` apunta a sub 6132 (cancelada, member 5588 eliminado). `balances.id=14, 16, 20` huérfanos. `balances.id=21` muestra $65.000 deuda en sub 6382 (cuando la plata ya entró). `program_enrollments.id=1125` activo en usuario eliminado.
   - Target: SQL que ejecuta atómicamente: (a) `UPDATE financial_transactions SET member_id=5912 WHERE id=34`; (b) `UPDATE transaction_links SET target_id=6382 WHERE transaction_id=34`; (c) `DELETE FROM balances WHERE id IN (14, 16, 20)`; (d) recompute lazy de balance sub 6382 (próximo touch lo deja en 0); (e) `UPDATE program_enrollments SET status='cancelled', cancelled_at=NOW() WHERE id=1125 AND status='active'`; (f) insert audit_log entry con razón "Reconciliación caso Soledad Mailland — phase 111".
   - Acceptance: Re-ejecutar la migración no genera errores ni rows duplicados (cláusulas WHERE con guards). Después de la migración: balance del sub 6382 = 0; financial_transactions.id=34.member_id=5912; ningún balance row para subs 6132/6134/6381; enrollment 1125.status='cancelled'.

9. **Helper `normalizePhone()` compartido + trim de nombres**:
   - Current: No hay normalización de teléfono. `first_name` y `last_name` aceptan trailing/leading spaces.
   - Target: Helper compartido `normalizePhone(input: string): string` (sólo dígitos, últimos 10 — convención AR). Usado en autorregistro, admin create, lookup de duplicados. Insert/update de users aplica `.trim()` a first_name y last_name.
   - Acceptance: Unit tests del helper (inputs típicos: "+54 223 661 4406" → "2236614406", "(0223) 661-4406" → "2236614406", "2236614406" → "2236614406"). Insert con `firstName="  Soledad  "` resulta en `"Soledad"` en DB.

## Boundaries

**In scope:**

- Validación backend plan presencial vs branch virtual (REQ-1)
- UX de filtrado de planes + CTA conversión en AssignPlanDialog (REQ-2)
- Bloqueo de cancel sub con tx activas (REQ-3)
- Endpoint `check-duplicates` + lookup en admin form (REQ-4)
- Bloqueo de autorregistro por teléfono duplicado (REQ-5)
- Sacar el botón de delete del admin UI (REQ-6)
- Tabla `audit_log` + helper + 3 call sites (REQ-7)
- Migración SQL de reconciliación de Soledad (REQ-8)
- Helper `normalizePhone()` + trim de nombres (REQ-9)

**Out of scope:**

- Modos de unwind (refund / reassign / keep_credit) en cancel sub — bloqueamos y derivamos al void manual existente (`TransactionService.void`); evita código nuevo de "mover plata"
- Modal de duplicados elaborado o bulk merge de cuentas duplicadas — sólo lookup directo + redirect al detalle existente; cuentas duplicadas pre-existentes (más allá de Soledad) no se tocan en esta fase
- Validación inversa (plan online sobre branch presencial) — válido el escenario "una sede física que también ofrece clases online"; no se bloquea
- Cambios al endpoint `softDeleteMember()` o cascadas en backend — sólo se oculta el botón en UI; el método queda muerto pero no se borra (sin riesgo)
- Audit log de acciones no-financieras (member_created, branch_changed, login, etc) — sólo las 3 acciones core que cubren el escenario forense
- Confirmación de DOB con la alumna — usamos 1981-11-02 que ya está en cuenta 5912 (fue verificado por Fernanda al cargar DNI)
- Reconciliación de otros casos similares pre-existentes — sólo Soledad; un audit retroactivo de balances huérfanos / cuentas duplicadas se difiere a fase posterior
- Scheduling/cron de auditoría automática del audit_log — sólo se escribe; consultas vía SQL directo o reportes ad-hoc
- Cambios a `users.phone` schema (no se agrega columna `phone_normalized` ni índice) — la normalización es runtime; si más adelante se necesita performance, se evalúa

## Constraints

- **Reuso obligatorio**:
  - `TransactionService.void()` (transaction-service.ts:229-280) en lugar de crear nueva lógica de unwind — ya hace soft-void + reverse balance atómicamente.
  - `checkDniUniqueness()` pattern (members/service.ts:607-635) extendido a multi-criterio.
  - `MemberFormDialog` flujo de conversión (línea 694) invocado desde `AssignPlanDialog`.
  - `subscription_schedule_changes` schema (schema/subscription-schedule-changes.ts:18-51) como modelo del audit_log (mismo patrón actor_id + JSON + reason + timestamp).
  - `db.transaction(...)` wrapping ya existente en `cancelSubscription` y `assignPlan` para incluir el audit_log write.
- **Atomicidad**: cada acción que escribe audit_log lo hace dentro de la misma transacción de la acción principal — si la acción rollbackea, el log no persiste.
- **Idempotencia**: la migración SQL de Soledad debe poder re-ejecutarse sin errores (guards en WHERE, no asumir state inicial).
- **Sin nuevas columnas en `users`**: la normalización de phone es runtime (no se agrega `phone_normalized`); el lookup hace `WHERE normalized_function(phone) = X` en query.
- **Compatibilidad backwards**: la firma de `cancelSubscription(userId, notes?)` no cambia; sólo agrega validación interna que puede tirar 400. Callers existentes siguen funcionando si la sub no tiene tx activas.
- **Migración Drizzle**: la nueva tabla `audit_log` se genera vía `pnpm db:generate` y se aplica vía `pnpm db:migrate` (custom runner — convención del proyecto, no `drizzle-kit migrate`).

## Acceptance Criteria

- [ ] `POST /subscriptions/assign-plan` con plan presencial + branch virtual → HTTP 400 con mensaje "Plan presencial requiere sede física"
- [ ] `AssignPlanDialog` para member en branch virtual no muestra planes con `plan_category='presencial'` en la lista
- [ ] `AssignPlanDialog` para member en branch virtual muestra card-banner con CTA "Convertir a sede física"
- [ ] CTA del banner abre `MemberFormDialog` en modo conversión; tras guardar, la lista de planes refresca y los presenciales aparecen
- [ ] `POST cancel sub` con `transaction_links` activos no voided → HTTP 400 con array de tx_ids pendientes
- [ ] `POST cancel sub` sin tx o con todas voided → HTTP 200 (comportamiento actual preservado)
- [ ] `GET /admin/members/check-duplicates?dni=X` y `?phone=Y` devuelven matches con `{id, firstName, lastName, branchName, isVirtual, status, deletedAt}`
- [ ] `MemberFormDialog` en create mode hace lookup on-blur y muestra link "Ya existe: {nombre} ({sede})" si hay match no-deleted
- [ ] Submit del form de create-member queda deshabilitado si lookup encontró un match
- [ ] `POST /auth/register` con phone normalizado que matchea usuario presencial activo → HTTP 409
- [ ] Admin UI: ningún botón en ninguna pantalla dispara `softDeleteMember`; grep de callers en admin = 0
- [ ] Tabla `audit_log` existe en la nueva migración Drizzle con columnas especificadas
- [ ] Cada `cancelSubscription` exitoso inserta audit_log entry con `action='subscription_cancelled'`
- [ ] Cada `TransactionService.void` exitoso inserta audit_log entry con `action='transaction_voided'`
- [ ] Cada `assignPlan` exitoso inserta audit_log entry con `action='plan_assigned'`
- [ ] Tras migración de Soledad: `financial_transactions.id=34.member_id=5912`
- [ ] Tras migración de Soledad: `transaction_links.id=34.target_id=6382`
- [ ] Tras migración de Soledad: `balances` no tiene rows con `target_id IN (6132, 6134, 6381)`
- [ ] Tras migración de Soledad: `balances` para sub 6382 = 0 ARS (recomputado)
- [ ] Tras migración de Soledad: `program_enrollments.id=1125.status='cancelled'`
- [ ] Tras migración de Soledad: existe entry de `audit_log` con razón "Reconciliación caso Soledad Mailland — phase 111"
- [ ] Re-ejecutar la migración de Soledad → 0 errores, 0 rows duplicados
- [ ] `normalizePhone("+54 223 661 4406")` devuelve `"2236614406"` en unit test
- [ ] Insert de `users` con `firstName="  Soledad  "` resulta en `"Soledad"` en DB

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                   |
| ------------------- | ----- | ----- | ------ | ------------------------------------------------------- |
| Goal Clarity        | 0.90  | 0.75  | ✓      | 9 reqs específicos, outcome medible, datos reales       |
| Boundary Clarity    | 0.85  | 0.70  | ✓      | OUT explícito: sin modos unwind, sin modal, sin DOB ask |
| Constraint Clarity  | 0.85  | 0.65  | ✓      | Reusos forzados, sin nuevas cols en users, idempotencia |
| Acceptance Criteria | 0.78  | 0.70  | ✓      | 23 checkboxes pass/fail con datos concretos             |
| **Ambiguity**       | 0.15  | ≤0.20 | ✓      |                                                         |

## Interview Log

| Round | Perspective | Question summary                                            | Decision locked                                                                  |
| ----- | ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 0     | Researcher  | Codebase scout (pre-interview)                              | Mapped 3 root causes a archivos específicos; identified reusable building blocks |
| 1     | Closer      | DOB de Soledad: 1981 vs 1991                                | 1981-11-02 (la cargada por Fernanda con DNI)                                     |
| 1     | Closer      | UX bloqueo en AssignPlanDialog: banner / disable / 400 only | Filtrar planes presenciales + card-banner con CTA a conversión inline            |
| 1     | Closer      | Audit log incluido o diferido                               | Incluido en 111 (3 acciones core, ~30K rows en 5 años, costo despreciable)       |

---

_Phase: 111-salvaguardas-operativas_
_Spec created: 2026-05-01_
_Origin: investigación caso Soledad Mailland (autorregistro online → conversión presencial fallida → cuenta duplicada con cash huérfano)_
_Next step: /gsd-discuss-phase 111 — implementation decisions (cómo invocar MemberFormDialog desde AssignPlanDialog, schema exacto del payload_json, nombre del nuevo endpoint, etc.)_
