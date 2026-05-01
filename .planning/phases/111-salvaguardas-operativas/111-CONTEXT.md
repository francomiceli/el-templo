# Phase 111: Salvaguardas operativas - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Salvaguardas operativas + reconciliación de datos del caso Soledad Mailland. Tres causas raíz consolidadas en una fase única reducida: (1) validación dura plan↔branch + UX guiada de conversión, (2) integridad financiera al cancelar subscriptions con transactions activas, (3) detección de duplicados por DNI/teléfono con redirect al alumno existente. Sumado: discontinuar soft-delete del admin UI, audit_log mínimo (3 acciones core), migración SQL idempotente que reconcilia los datos de Soledad. La fase NO inventa flujos nuevos — reusa al máximo `TransactionService.void`, `MemberFormDialog` mode=edit, `checkDniUniqueness` pattern, `subscription_schedule_changes` audit pattern.

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**9 requirements lockeados.** Ver `111-SPEC.md` para requirements completos, boundaries y acceptance criteria.

Downstream agents DEBEN leer `111-SPEC.md` antes de planificar o implementar. Requirements no se duplican aquí.

**In scope (resumen de SPEC.md):**

- REQ-1: Validación backend `assignPlan` rechaza plan presencial sobre branch virtual
- REQ-2: UX en `AssignPlanDialog` filtra planes presenciales para alumnos virtuales + CTA banner a conversión
- REQ-3: Bloqueo de `cancelSubscription` si hay transaction_links no voided
- REQ-4: Endpoint `/admin/members/check-duplicates` + lookup en `MemberFormDialog`
- REQ-5: Bloqueo de `/auth/register` por phone duplicado
- REQ-6: Discontinuar botón soft-delete del admin UI
- REQ-7: Tabla `audit_log` + helper + 3 call sites (cancel sub / void tx / plan assigned)
- REQ-8: Migración SQL idempotente reconciliando datos de Soledad
- REQ-9: Helper `normalizePhone()` + trim de first_name/last_name

**Out of scope (resumen):**

- Modos de unwind (refund/reassign/keep_credit) — el bloqueo simple deriva al void manual existente
- Modal de duplicados elaborado o bulk merge — solo lookup directo + redirect al detalle
- Validación inversa (plan online sobre branch presencial) — válido escenario, no se bloquea
- Cambios al endpoint backend `softDeleteMember()` — solo se oculta el botón en UI
- Audit log de acciones no-financieras — solo las 3 acciones core
- Confirmación de DOB con la alumna — usamos 1981-11-02 que ya está en cuenta 5912
- Reconciliación de otros casos similares pre-existentes — solo Soledad
- Cambios a `users.phone` schema (sin nueva columna ni índice)

</spec_lock>

<decisions>
## Implementation Decisions

### UX del handoff Assign→Convert (REQ-2)

- **D-01:** El usuario clarificó que **no hay modo "convertir" dedicado** — el flujo de "Editar alumno" ya permite cambiar la sede de cualquiera a cualquiera, incluyendo virtual→física (`MemberFormDialog.vue:694-750` ya detecta `oldBranch.isVirtual && newBranch.isVirtual !== true` y valida required fields DNI/document_type/dateOfBirth). La conversión es: editar alumno → cambiar sede → guardar.
- **D-02:** En `AssignPlanDialog`, cuando `member.branch.isVirtual === true`: filtrar la lista de planes para esconder los `plan_category='presencial'`. En el espacio donde estarían, renderizar un `q-banner` con texto "Para asignar planes presenciales, primero cambiá la sede del alumno" + botón "Editar alumno". El click abre `MemberFormDialog` mode='edit' como **dialog overlay encima del AssignPlanDialog** (Quasar soporta dialog stack nativamente — sin event bus, sin store coordinado).
- **D-03:** Al guardar el edit con `branch.isVirtual === false`, MemberFormDialog se cierra. AssignPlanDialog detecta el cambio en `member.branchId` (vía prop reactivo o emit del padre) y **automáticamente refetch planes** llamando a `subsApi.getPlans(true, { branchId: nuevoBranchId })` — los presenciales aparecen sin clicks extra. El estado del AssignPlanDialog (form values) se preserva.
- **D-04:** Si el admin cancela el edit sin cambiar la sede, AssignPlanDialog queda abierto con el banner — el admin puede cerrar el dialog o hacer otra acción.

### Lookup de duplicados (REQ-4, REQ-5)

- **D-05:** **Phone match: exact últimos 10 dígitos.** Helper `normalizePhone(input: string): string` strips non-digit characters y devuelve `slice(-10)`. Convención AR (móvil sin código país = 10 dígitos). Cero false positives. Decisión simple — no fuzzy, no partial.
- **D-06:** Endpoint nuevo `GET /admin/members/check-duplicates?dni=X&phone=Y` (en `el-templo-api/src/modules/members/routes.ts`). Soporta query por DNI exacto, phone normalizado, o ambos (independientes — devuelve unión). Response: `{ matches: [{ id, firstName, lastName, branchId, branchName, isVirtual, status, deletedAt, matchedField: 'dni' | 'phone' }] }`. Excluye `deletedAt IS NOT NULL`. Reusa pattern de `checkDniUniqueness` (members/service.ts:607-635).
- **D-07:** En `MemberFormDialog` (create mode): al `@blur` de input DNI o teléfono, llamar al endpoint con valor normalizado. Si el response.matches.length > 0 (any non-deleted): renderizar fila debajo del input con texto "Ya existe: {firstName} {lastName} ({branchName}) — [Ver alumno]" como link directo a `/alumnos/:id`. **Submit del form deshabilitado** mientras haya match. Sin modal — solo el banner inline. Debounce 300ms para no spamear el endpoint mientras el admin tipea.
- **D-08:** **Autorregistro `/auth/register`**: antes del insert, query `users WHERE normalizePhone(phone) = X AND deleted_at IS NULL`. Si match, devolver HTTP 409 con `{ error: 'Conflict', message: 'Esta persona ya tiene cuenta. Iniciá sesión o contactanos.', code: 'PHONE_ALREADY_REGISTERED' }`. Match contra **cualquier cuenta no-deleted** (incluye virtual y presencial — el caso de Soledad lo cubre y previene un ghost twin via cualquier flujo).

### Cancel sub con tx activas (REQ-3)

- **D-09:** En `cancelSubscription` (subscriptions/service.ts:1881-1955), antes del update: query `transaction_links` JOIN `financial_transactions` WHERE `target_kind='subscription' AND target_id = sub.id AND voided_at IS NULL`. Si match, throw `BadRequestError` con body estructurado:
  ```json
  {
    "error": "Bad Request",
    "message": "Hay transacciones de cobro activas en esta suscripción. Anulalas primero (Detalle Financiero → Anular) y volvé a intentar.",
    "code": "SUB_HAS_ACTIVE_TRANSACTIONS",
    "details": {
      "transactionIds": [34],
      "totalAmount": 65000,
      "currency": "ARS"
    }
  }
  ```
- **D-10:** Sigue patrón Phase 110 D-05 (error code estructurado, mensaje en español). El frontend admin lee `code` para match exacto y `details.transactionIds` para mostrar links a cada tx en el dialog de cancelación.
- **D-11:** No se crean modos de unwind nuevos. El admin debe usar `TransactionService.void()` existente (ya hace soft-void + reverse balance) en la pantalla Detalle Financiero, y luego reintentar cancel.

### Audit log (REQ-7)

- **D-12:** Schema de la tabla `audit_log`:
  ```ts
  {
    id: int PRIMARY KEY AUTO_INCREMENT,
    actorId: int NOT NULL FK→users.id,
    action: varchar(50) NOT NULL,  // 'subscription_cancelled' | 'transaction_voided' | 'plan_assigned'
    targetKind: varchar(30) NOT NULL,  // 'subscription' | 'transaction'
    targetId: int NOT NULL,
    payloadJson: json NOT NULL,
    reason: text NULL,
    createdAt: timestamp DEFAULT now()
  }
  ```
  Índices: `(action, createdAt)`, `(targetKind, targetId)`, `(actorId, createdAt)`. Drizzle migration committeada (convención del proyecto).
- **D-13:** **Payload shape: campos clave por acción** (no snapshot completo, no delta). Cada acción define un shape específico:
  - `subscription_cancelled`: `{ subId, prevStatus, newStatus, cancelledAt, notes, hasActiveTx }`
  - `transaction_voided`: `{ txId, amount, currency, voidedAt, voidReason, links: [{ targetKind, targetId, allocatedAmount }] }`
  - `plan_assigned`: `{ subId, planId, branchId, pricePaid, paymentMethod, hasChargeTx, startDate, endDate }`
    Tradeoff aceptado: forensia suficiente con noise mínimo. Storage estimado ~30MB en 5 años.
- **D-14:** Helper `auditLog.write(tx, { actorId, action, targetKind, targetId, payload, reason? })` en `el-templo-api/src/modules/shared/audit-log.ts` (sigue convención Phase 110 D-01 de helpers compartidos en `modules/shared/`). Acepta `tx` como Drizzle transaction handle — la escritura del log corre dentro de la misma transacción que la acción principal. Si la acción rollbackea, el log no persiste (atomicidad garantizada).
- **D-15:** Call sites:
  - `subscriptionService.cancelSubscription` (después del update, dentro del `db.transaction` en línea 1914)
  - `TransactionService.void` (después del soft-void, dentro del `db.transaction` en transaction-service.ts:234)
  - `subscriptionService.assignPlan` (al final del happy path, dentro del `db.transaction`)
- **D-16:** `actorId` viene del JWT (`request.user.id` en Fastify). Para el caso de la migración de Soledad (no hay actor real), usar el ID del usuario "owner" / system actor (TBD en plan-phase si no existe ya).

### Reconciliación SQL de Soledad (REQ-8)

- **D-17:** **Drizzle migration committeada** en `el-templo-api/src/db/migrations/` con número secuencial. NO un script ad-hoc. Esto cumple memoria personal: "Prod data changes go through migrations, not seed re-runs". Se aplica vía `pnpm db:migrate` (custom runner del proyecto, single source of truth en `_migrations` table).
- **D-18:** Migración idempotente con guards en cada step:

  ```sql
  -- Step 1: Reasignar tx 34
  UPDATE financial_transactions SET member_id=5912
  WHERE id=34 AND member_id=5588;

  -- Step 2: Mover transaction_link
  UPDATE transaction_links SET target_id=6382
  WHERE transaction_id=34 AND target_id=6132;

  -- Step 3: Limpiar balances huérfanos
  DELETE FROM balances WHERE id IN (14, 16, 20)
  AND member_id IN (5588, 5912);

  -- Step 4: Cerrar enrollment dangling
  UPDATE program_enrollments SET status='cancelled', cancelled_at=NOW()
  WHERE id=1125 AND status='active';

  -- Step 5: Insertar audit_log entry
  INSERT INTO audit_log (actor_id, action, target_kind, target_id, payload_json, reason, created_at)
  VALUES (
    /* TBD owner id */, 'reconciliation', 'member', 5912,
    '{ "originalMember": 5588, "actions": ["tx_reassigned", "balances_cleared", "enrollment_cancelled"] }',
    'Reconciliación caso Soledad Mailland — phase 111',
    NOW()
  );
  ```

  Re-ejecutar la migración: 0 errores, 0 cambios (rows ya en estado target → WHERE clause no matchea).

- **D-19:** El balance del sub 6382 no se UPDATE-ea explícitamente. El recompute lazy (vía `applyDelta` la próxima vez que se toque) lo deja en 0 automáticamente porque tras la reasignación hay una tx de $65.000 inflow linkeada al sub. Si esto resulta inseguro durante planning, agregar Step 4b: `UPDATE balances SET amount=0 WHERE target_id=6382 AND target_kind='subscription'`.
- **D-20:** Ejecutar la migración en staging primero, verificar las 5 acceptance criteria de REQ-8 manualmente, luego producción. Sin backfill automático en CI — la migración corre sola via `pnpm db:migrate`.

### Discontinuar soft-delete UI (REQ-6)

- **D-21:** Quitar el botón "Eliminar" en `AlumnoDetailPage.vue:102-110` (entre líneas 102 y 110, dentro del column items-end). También sacar `canDeleteMember`, `showDeleteDialog`, `deleting` refs y todas sus refs en el script. **Lo borramos directamente** (no comentado, no `v-if="false"`) — sin backwards-compatibility shim.
- **D-22:** Si hay otros call sites del soft-delete en admin UI (otras pantallas, menús contextuales), también se sacan. Grep target: `softDelete`, `deleteMember`, `useMembersApi.delete`. El composable `useMembersApi.deleteMember` queda (sin callers desde admin) por si lo necesitamos en backoffice futuro — es zero cost mantenerlo.
- **D-23:** El endpoint backend `DELETE /admin/members/:id` y `softDeleteMember` service quedan intactos. Si en el futuro hace falta exponerlo (ej: violation de privacidad GDPR), está disponible. Phase 111 solo retira el acceso desde la UI.

### Normalize phone helper + trim de nombres (REQ-9)

- **D-24:** Helper `normalizePhone(input: string): string` en `el-templo-api/src/modules/shared/phone.ts`:
  ```ts
  export function normalizePhone(input: string): string {
    return input.replace(/\D/g, "").slice(-10);
  }
  ```
  Unit tests cubren: "+54 223 661 4406" → "2236614406", "(0223) 661-4406" → "2236614406", "2236614406" → "2236614406", "" → "".
- **D-25:** El admin tiene también un consumer del helper en frontend (en `useMembersApi.ts` para normalizar antes de mandar al check-duplicates). Para evitar duplicar la lógica, se publica desde un módulo compartido del backend. Si compartir TS entre apps requiere setup nuevo, el frontend tiene su propio `normalizePhone()` 1:1 con tests sincrónicos. Decisión: que el plan-phase decida exactamente cómo compartir según patrón existente.
- **D-26:** Trim de `firstName` / `lastName`: aplicar `.trim()` en el service de members (create + update) antes del insert/update, no en route. Patrón consistente — la validación en route deja pasar el trailing space, el service normaliza. Aplica también al endpoint `/auth/register`.

### UI polish (folded del comentario del usuario)

- **D-27:** En `AlumnoDetailPage.vue` (alumno detalle, no edit dialog — la confusión del usuario): mover el badge de `segment` (que muestra "Ghost", "Whale", etc — `q-badge` actualmente en líneas 71-83 dentro del `column items-end` derecha) al row después del status badge (líneas 54-58, junto al nombre). Resultado: "Freemium Ghost" pegados, en ese orden, izquierda del header. El badge de `avatarType` (líneas 84-92) también puede acompañar — discutir en plan-phase si va junto o queda en column items-end.
- **D-28:** Es un cambio puramente CSS/layout (mover el `<q-badge>` de un wrapper a otro). Cero lógica nueva.

### Claude's Discretion

- Naming exacto del helper file (`phone.ts` vs `normalize.ts` siguiendo CONVENTIONS).
- Debounce timing exacto del lookup (300ms es propuesta, plan-phase puede ajustar).
- Si el banner CTA del AssignPlanDialog (D-02) debería decir "Editar alumno" o "Cambiar sede" — UX wording que se decide al implementar.
- Forma exacta del `actorId` para la migración de Soledad (D-16) — depende de si existe un user "system" o se usa el owner real.
- Si los índices del audit_log (D-12) son los óptimos — open a evaluar en plan-phase si el query patterns esperados sugieren otros.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Specs y planning de esta fase

- `.planning/phases/111-salvaguardas-operativas/111-SPEC.md` — Locked requirements (9 reqs, 23 acceptance checkboxes) — MUST read before planning
- `.planning/phases/110-admin-users-by-country-multi-branch-staff/110-CONTEXT.md` — Patrón de error responses estructurados (D-04, D-05) y helpers compartidos en `modules/shared/` (D-01)
- `.planning/phases/108-pago-de-saldo-historial-financiero/108-CONTEXT.md` — Patrón del flujo financial (TransactionService.void, balance recompute) que reusamos en REQ-3 y REQ-8

### Convenciones del proyecto

- `CLAUDE.md` (raíz) — Logging conventions (Pino API, createLogger frontend), no `any`, integration tests, Drizzle migrations via `pnpm db:migrate` ONLY (never `drizzle-kit migrate`), env vars en `.env.example`
- `.planning/codebase/CONVENTIONS.md` — Service file naming, error handling, async/await patterns

### Código clave a leer (paths con líneas)

- `el-templo-api/src/modules/subscriptions/service.ts:770-1158` — `assignPlan` (REQ-1 inserta validación acá; REQ-7 audit_log call site)
- `el-templo-api/src/modules/subscriptions/service.ts:1881-1955` — `cancelSubscription` (REQ-3 inserta guard acá; REQ-7 audit_log call site)
- `el-templo-api/src/modules/finance/transaction-service.ts:229-280` — `TransactionService.void` (REQ-7 audit_log call site; reusa para REQ-3 unwind manual)
- `el-templo-api/src/modules/finance/balance-service.ts:79-130` — `applyDelta` (REQ-8 reconcile depende del recompute lazy)
- `el-templo-api/src/modules/members/service.ts:607-635` — `checkDniUniqueness` (REQ-4 extiende este patrón)
- `el-templo-api/src/modules/members/service.ts:529-562` — `softDeleteMember` (REQ-6: queda intacto, solo retiramos UI)
- `el-templo-admin/src/components/AssignPlanDialog.vue:1080-1130` — Payload assembly (REQ-2 modifica el filtrado de planes acá)
- `el-templo-admin/src/components/AssignPlanDialog.vue:976` — `getPlans({branchId})` call (REQ-2 refetch tras conversión)
- `el-templo-admin/src/components/MemberFormDialog.vue:694-750` — Detección virtual→física existente (REQ-2 reusa este flow)
- `el-templo-admin/src/composables/useMembersApi.ts:107-119` — `checkDniUniqueness` composable (REQ-4 extiende)
- `el-templo-admin/src/pages/AlumnoDetailPage.vue:54-92` — Badges layout (REQ-6 + D-27 UI polish)
- `el-templo-admin/src/pages/AlumnoDetailPage.vue:102-110` — Botón Eliminar (REQ-6 lo quita)
- `el-templo-api/src/db/schema/subscription-schedule-changes.ts:18-51` — Patrón de auditoría a replicar para `audit_log` (REQ-7)
- `el-templo-api/src/db/schema/financial-transactions.ts:19-67` — Schema del ledger (REQ-3 query, REQ-7 payload shape)
- `el-templo-api/src/db/schema/transaction-links.ts:17-41` — Pivot (REQ-3 query, REQ-8 update)
- `el-templo-api/src/db/schema/balances.ts:22-52` — Cache table (REQ-8 cleanup)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`TransactionService.void()`** (transaction-service.ts:229-280) — Ya hace soft-void + reverse balance dentro de `db.transaction`. REQ-3 NO crea código nuevo de "mover plata"; el admin usa este endpoint manualmente cuando le bloqueamos el cancel.
- **`balanceService.applyDelta()`** (balance-service.ts:79-130) — Atómico, signo configurable. REQ-8 confía en el recompute lazy para dejar balance en 0.
- **`checkDniUniqueness()`** (members/service.ts:607-635) — Patrón de uniqueness check + endpoint expuesto (`/admin/members/check-dni`). REQ-4 extiende a `check-duplicates` siguiendo este shape.
- **`MemberFormDialog` flujo de edit con conversión virtual→física** (línea 694-750) — Ya valida DNI/document_type/dateOfBirth required cuando se cambia a sede física. REQ-2 reusa esto sin modo nuevo.
- **`isOnlinePlan(category)`** (subscriptions/types.ts:30-32) — Source of truth para discriminar planes online vs presencial. REQ-1 invierte la lógica para validar plan_category vs branch.isVirtual.
- **`subscription_schedule_changes` schema** (schema/subscription-schedule-changes.ts:18-51) — Patrón de tabla de auditoría (actor_id + JSON + reason + timestamp). REQ-7 replica el mismo shape para `audit_log`.
- **`AssignPlanDialog.getPlans({branchId})`** (línea 976) — Ya filtra planes por branch — el filter de plan_category=presencial cuando branch.isVirtual se puede agregar al endpoint o al component (decisión de plan-phase).

### Established Patterns

- **Error response shape** (Phase 110 D-05): `{ error, message, code, details? }` con código estructurado en español. REQ-3 lo sigue (`SUB_HAS_ACTIVE_TRANSACTIONS`); REQ-5 lo sigue (`PHONE_ALREADY_REGISTERED`).
- **Helpers compartidos** en `el-templo-api/src/modules/shared/` (Phase 110 D-01). REQ-7 audit_log helper y REQ-9 normalizePhone siguen este patrón.
- **Migrations via Drizzle + custom runner** (`pnpm db:migrate` en `_migrations` table — CLAUDE.md). REQ-7 nuevo schema y REQ-8 reconcile SQL siguen.
- **Service layer encapsula transactions** — `cancelSubscription` y `assignPlan` ya envuelven en `db.transaction`. REQ-7 audit_log writes corren dentro de las mismas transactions (atomicidad garantizada).
- **Logging 4xx**: `request.log.warn({...}, 'CODE')` — Phase 110 D-06 establece que 4xx no van a Sentry, solo a logs estructurados. REQ-3 y REQ-5 siguen.

### Integration Points

- **Schema migration** (REQ-7 + REQ-8): genera vía `pnpm db:generate`, aplica vía `pnpm db:migrate`. Audit_log es una migration separada de la reconcile de Soledad — primero el schema, después el data fix.
- **Frontend dialog stack** (REQ-2 D-02): Quasar `q-dialog` permite anidar dialogs nativamente. `MemberFormDialog` se abre encima sin event bus.
- **Lookup endpoint frontend integration** (REQ-4): `useMembersApi.checkDniUniqueness` ya existe — extender a `checkDuplicates` (multi-criterio).
- **Audit log invocation** (REQ-7): cada call site recibe `tx` (Drizzle transaction handle) y `actorId` (de `request.user.id`). El helper se importa de `modules/shared/audit-log.ts`.

</code_context>

<specifics>
## Specific Ideas

- El usuario clarificó durante el discuss que **no inventamos un modo "convertir" en MemberFormDialog** — la conversión es simplemente "editar alumno → cambiar sede". El SPEC menciona "modo conversión" pero en realidad es el flujo edit existente con la sede cambiada. Plan-phase debe interpretar REQ-2 acceptance "abre `MemberFormDialog` en modo conversión" como "abre `MemberFormDialog` mode='edit' que ya tiene detección virtual→física en línea 694".
- El badge fix (D-27) fue agregado durante el discuss del usuario pero NO está en SPEC.md. Es UI polish menor (mover un `<q-badge>` de un wrapper a otro). Plan-phase puede incluirlo como una tarea micro dentro del plan de REQ-6 (ambos tocan `AlumnoDetailPage.vue`).
- El usuario tiene preferencia explícita por **respuestas concisas** y **soluciones simples** — la fase fue reducida de 4 fases a 1, con OUT explícito de modos de unwind, modal de duplicados, y soft-delete cascadas. Plan-phase debe respetar ese minimalismo: no agregar abstracciones especulativas, no introducir helpers que no estén estrictamente requeridos por los reqs.
- Plan-phase tiene que decidir el orden de waves dado que hay dependencias internas: REQ-7 (audit_log schema) antes de REQ-3, REQ-8, REQ-1 que escriben en él. REQ-9 (normalizePhone) antes de REQ-4 y REQ-5 que la consumen. REQ-1 puede ir paralelo con REQ-2 frontend. REQ-8 (reconcile Soledad) corre AL FINAL, después de que toda la lógica nueva esté deployada a staging y verificada.

</specifics>

<deferred>
## Deferred Ideas

- **Refund / reassign / keep_credit modes** en cancel sub — explícitamente OUT del SPEC (boundaries). Si en el futuro un caso real requiere "mover plata" sin pasar por void manual, queda como fase aparte.
- **Bulk merge de cuentas duplicadas existentes** (más allá de Soledad) — phase 111 NO hace audit retroactivo de toda la base. Si surge la necesidad, fase aparte con análisis de patrones similares al de Soledad.
- **Audit log de acciones no-financieras** (member_created, branch_changed, login, etc) — solo las 3 acciones core en phase 111. Una fase futura puede expandir.
- **Schedule de auditoría automática del audit_log** (cron que detecte anomalías) — fuera de scope. El audit_log es write-only en esta fase; consultas vía SQL ad-hoc o reportes manuales.
- **Confirmación con la alumna del DOB de Soledad** — usamos 1981-11-02 (cargado por Fernanda con DNI). Si más adelante surge que es 1991, se actualiza vía edit normal.
- **Reorganización del header del alumno** (badges, botones, layout) — más allá del fix puntual de "Freemium Ghost" pegados, el resto de polish queda fuera. Si emerge un patrón sistemático de problemas con badges, fase de UX dedicada.
- **Index en `users.phone`** o columna generada `phone_normalized` — phase 111 hace match en runtime con expresión SQL. Si el volumen de check-duplicates se vuelve performance bottleneck, fase aparte.

</deferred>

---

_Phase: 111-salvaguardas-operativas_
_Context gathered: 2026-05-01_
_Next step: /gsd-plan-phase 111 — drafts task plan based on locked SPEC.md + CONTEXT.md decisions_
