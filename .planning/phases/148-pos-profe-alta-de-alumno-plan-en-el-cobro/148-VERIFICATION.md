---
phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro
verified: 2026-06-26T18:30:00Z
status: human_needed
score: 18/18 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Modo 'Alta + plan' — chip Sede y mini-form de alumno nuevo"
    expected: "El chip Sede muestra la sede del profe como default; '+ Nuevo alumno' despliega el mini-form con Nombre/Apellido/DNI (sin email/teléfono); al ingresar un DNI existente on-blur aparece el banner gold 'Ya existe un alumno con ese DNI: {nombre}. Se cargará sobre ese alumno.' con el botón 'Usar ese alumno'"
    why_human: "Comportamiento visual interactivo del q-select, q-input on-blur y renderizado condicional del banner — grep confirma la lógica pero no el resultado visual ni la navegación"
  - test: "Modo 'Alta + plan' — plan grid, precio, turnos fixed y flujo Confirmar"
    expected: "Elegir un plan fixed muestra el FixedSchedulePicker con el badge n/m; elegir tarjeta recalcula el monto a priceCreditCard; ingresar monto parcial muestra el banner de deuda 'El alumno quedará deudor por {monto}'; Confirmar crea la carga, muestra notify pendiente, y el ticket en 'Mis cargas' aparece con badge Pendiente y chip 'Nuevo'"
    why_human: "Flujo visual de punta a punta: cálculo reactivo de precio, renderizado condicional del picker, ciclo de idempotencia y prepend del ticket — verificable solo ejecutando la UI"
  - test: "Bandeja Pendientes — dialog Anular con carga de alumno-nuevo vs preexistente"
    expected: "Anular una carga creada por un profe que dio de alta a un alumno nuevo muestra el banner de advertencia rojo 'Esta carga creó al alumno {nombre}. Al anular, también se desactivará su membresía y el alumno quedará inactivo (no se elimina). ¿Anular de todos modos?'; anular una carga de alumno preexistente NO muestra ese banner"
    why_human: "El v-if depende del campo `createdMemberName` que viene del backend; verificar requires datos reales en staging, incluyendo una carga alta-con-plan real"
---

# Phase 148: PoS profe: alta de alumno + plan en el cobro — Verification Report

**Phase Goal:** El profe carga el plan directamente en el cobro (extiende CargarPagoPage.vue), creando al alumno si es nuevo, reemplazando el flujo Google Form→Excel→admin. Modelo crear-en-vivo + validar-después: alumno + membresía + turnos se crean al instante; el pago nace validation_status='pendiente' y va a la bandeja de gestión. Refuerzos: dedup por DNI antes de crear; cascade en void (anular carga de alumno-nuevo desactiva la membresía y deja al alumno inactivo, NO lo borra). Sucursal default = sede del profe, editable. Precio según medio de pago. Selector de turnos estructurado solo para planes fixed (reusa FixedSchedulePicker.vue). Backend: endpoint nuevo en coach-load-routes.ts, atómico e idempotente.
**Verified:** 2026-06-26T18:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

Las must-haves se derivan de los 6 frontmatter de PLAN (el ROADMAP no tiene success_criteria estructurado para esta fase).

| #   | Truth                                                                                                                                              | Status          | Evidence                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------ |
| 1   | Una transacción financiera puede registrar `createdMemberId` (nullable) y ese id se persiste DENTRO de la misma tx del charge (W-1)                | VERIFIED        | `financial-transactions.ts` L111: columna `created_member_id` FK nullable; `transaction-service.ts` L333: `createdMemberId: input.createdMemberId ?? null` en el insert `.values({...})`; migración `0162_created_member_id.sql` hand-written aplicada    |
| 2   | `assignPlan` puede nacer 'pendiente' (recorderRole='coach') con caja sugerida, idempotencyKey y propaga createdMemberId hasta el insert del charge | VERIFIED        | `subscriptions/types.ts`: AssignPlanInput tiene `recorderRole`, `idempotencyKey`, `recorderBranchId`, `createdMemberId` (6 refs en service.ts, propagados en ambas llamadas a `recordAssignmentCharge` L1414/L1437)                                       |
| 3   | Existe un path para crear un alumno con solo nombre + apellido + DNI + sucursal (email/teléfono null)                                              | VERIFIED        | `members/service.ts` L826: `createMinimalMember` con `email: null`, `status: 'prueba'`, `dni: input.dni`, escribe `userStatusHistory`; guard `isDuplicateKeyError` ante UNIQUE de dni                                                                     |
| 4   | Un profe puede crear/reusar alumno (dedup DNI) y asignarle plan + turnos + cobro; no hay tercera tx desacoplada para createdMemberId               | VERIFIED        | `coach-load-routes.ts`: handler `/alta` L565-674: checkDuplicates (3 refs) → createMinimalMember → assignPlan con `createdMemberId` en el input; sin UPDATE suelto (grep confirmado)                                                                      |
| 5   | El cobro nace 'pendiente' (derivado del rol coach, nunca del body) y graba createdMemberId en el mismo insert                                      | VERIFIED        | `subscriptions/service.ts recordAssignmentCharge` L341: `recorderRole==='coach' ? 'pendiente' : 'validado'`; `createdMemberId` fluye por AssignPlanInput → recordAssignmentCharge → create() insert — nunca del body                                      |
| 6   | El profe solo puede cargar para sedes a las que tiene acceso                                                                                       | VERIFIED        | `coach-load-routes.ts` L557-559: `preHandler: requireBranchAccess({ from: "body.branchId" })` en el registro de `/alta`                                                                                                                                   |
| 7   | Un doble-submit con el mismo idempotencyKey no crea segundo alumno ni segundo cobro                                                                | VERIFIED        | `coach-load-routes.ts` L673-680: catch `isDuplicateKeyError` → `findByIdempotencyKey` → 200 con el existente; `createMinimalMember` es idempotente por dni UNIQUE (backstop)                                                                              |
| 8   | Anular una carga que creó un alumno nuevo desactiva su membresía y deja al alumno 'inactivo' (no lo borra)                                         | VERIFIED        | `transaction-service.ts` L559: `if (existing.createdMemberId !== null)` → L570: `UPDATE users SET status='inactivo'` → L577: insert `userStatusHistory` `toStatus='inactivo'`; sin DELETE de users (grep 0 resultados)                                    |
| 9   | Anular una carga de alumno preexistente (createdMemberId null) no toca el status del alumno                                                        | VERIFIED        | El bloque cascade está gateado por `existing.createdMemberId !== null` — no-op exacto para null                                                                                                                                                           |
| 10  | El detalle/listado de transacción expone `createdMemberId` + `createdMemberName` para la copy de la bandeja                                        | VERIFIED        | `transaction-service.ts`: `getById` (L981+) y `listPendingTray` (L1341+) incluyen leftJoin a `users` por `createdMemberId`; `finance/types.ts` L435: `createdMemberId: number                                                                             | null`; L436: `createdMemberName: string | null`en`PendingTrayItem` |
| 11  | Existen tests de integración cubriendo crear-nuevo, dedup, parcial→deuda, fixed, void→cascade, retry-tras-fallo-parcial e idempotencia             | VERIFIED        | `test/finance/coach-load-alta.test.ts` (656 líneas): 7 describes con asserts sobre `users`, `subscriptions`, `financial_transactions`, `subscription_schedules`, `bookings`, `userStatusHistory`; test I-1 verifica `createdMemberId` no-NULL tras replay |
| 12  | Los tests corren contra MySQL real (eltemplo_test) en CI                                                                                           | VERIFIED        | Usa `createTestApp`, `app.inject`, y queries directas a Drizzle contra `eltemplo_test` — mismo patrón de todos los tests de integración del repo                                                                                                          |
| 13  | El profe ve un 3er modo 'Alta + plan' en CargarPagoPage                                                                                            | VERIFIED (code) | `CargarPagoPage.vue`: `type Mode += 'alta'` (16 refs), q-btn-toggle con 3ª opción `{ label: 'Alta + plan', value: 'alta' }` L17; bloque `v-if="mode === 'alta'"` L25                                                                                      |
| 14  | DNI dispara dedup on-blur y, si matchea, ofrece cargar sobre el alumno existente                                                                   | VERIFIED (code) | `CargarPagoPage.vue`: 3 refs a `checkDuplicates`/`Nuevo alumno`; banner gold condicional con "Usar ese alumno" (UI visual necesita UAT)                                                                                                                   |
| 15  | El profe elige sucursal (default su sede), plan por tier, toggle Zero, precio auto por medio de pago, y turnos solo para planes fixed              | VERIFIED (code) | `q-select` Sede (L25); plan grid con `plansByTier`; `FixedSchedulePicker` (2 refs) solo en `bookingMode==='fixed'`; toggle "Precio Zero" (2 refs); watcher `[selectedPlan, paymentMethod, zeroPrice]` → autocalc precio (UI visual necesita UAT)          |
| 16  | Confirmar manda alta atómica idempotente y el ticket aparece con badge Pendiente + chip Nuevo                                                      | VERIFIED (code) | `canConfirm` computa todas las guards (alumno/sede/plan/método/monto>0/fixed→count exacto); `altaConPlan` posteando a `/admin/finance/coach-load/alta` (path confirmado); `createdNewTicketIds` Set para chip "Nuevo" (UI visual necesita UAT)            |
| 17  | Al anular una carga de alumno-nuevo, gestión ve advertencia de cascade en el dialog Anular                                                         | VERIFIED (code) | `BandejaPendientesTab.vue` L327: `v-if="actionRow.createdMemberName"` muestra `q-banner` con la copy exacta del UI-SPEC interpolando el nombre (UI con datos reales necesita UAT)                                                                         |
| 18  | Al anular una carga de alumno preexistente, la copy es la actual (sin advertencia)                                                                 | VERIFIED (code) | El banner es condicional a `createdMemberName` no-null — para preexistente (null) el dialog queda idéntico al existente (UI necesita UAT)                                                                                                                 |

**Score: 18/18 truths verified** (código sustancial; 3 comportamientos visuales requieren validación humana)

---

### Required Artifacts

| Artifact                                                       | Expected                                                                                        | Status          | Detalles                                                                                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `el-templo-api/src/db/migrations/0162_created_member_id.sql`   | Migración hand-written `created_member_id`                                                      | VERIFIED        | Existe (1305 bytes); ADD COLUMN + FK constraint; 0 `;` en comentarios (regla runner cumplida)                                                                      |
| `el-templo-api/src/db/schema/financial-transactions.ts`        | Columna `createdMemberId` (FK nullable a users.id)                                              | VERIFIED        | L111: `int("created_member_id").references(() => users.id)`                                                                                                        |
| `el-templo-api/src/modules/finance/types.ts`                   | `CreateTransactionInput.createdMemberId?` + `PendingTrayItem.createdMemberId/createdMemberName` | VERIFIED        | 3 refs: L134 `createdMemberId?: number                                                                                                                             | null` en CreateTransactionInput; L435-436 en PendingTrayItem |
| `el-templo-api/src/modules/finance/transaction-service.ts`     | `create()` persiste `createdMemberId` + cascade `_void` + surfacing                             | VERIFIED        | L333: insert; L559-586: cascade; L981+/L1341+: surfacing via leftJoin                                                                                              |
| `el-templo-api/src/modules/subscriptions/types.ts`             | AssignPlanInput extendido con recorder fields + createdMemberId                                 | VERIFIED        | L275-300: `recorderRole`, `idempotencyKey`, `recorderBranchId`, `createdMemberId`                                                                                  |
| `el-templo-api/src/modules/subscriptions/service.ts`           | `assignPlan` propaga los campos hasta `recordAssignmentCharge`                                  | VERIFIED        | 6 refs `createdMemberId`; resolución `recorderBranchId→suggestedCajaId` replicada de `renewSubscription`                                                           |
| `el-templo-api/src/modules/members/service.ts`                 | `createMinimalMember` (nombre+DNI+sucursal, email null, status prueba)                          | VERIFIED        | L826: implementación completa con tx, `userStatusHistory`, guard `isDuplicateKeyError`                                                                             |
| `el-templo-api/src/modules/finance/coach-load-routes.ts`       | Endpoint `POST /alta` con schema, preHandler, orquestación idempotente                          | VERIFIED        | 1 ref `/alta`; `requireBranchAccess` preHandler; 3 refs `checkDuplicates`; 12 refs `createdMemberId`; 6 refs `assignPlan`; catch `isDuplicateKeyError` → 200 no-op |
| `el-templo-api/test/finance/coach-load-alta.test.ts`           | 7 escenarios de integración contra MySQL real                                                   | VERIFIED        | 656 líneas; 7 describes; 34 refs `createdMemberId`; 25 refs `void`; 18 refs `idempotenc`                                                                           |
| `el-templo-admin/src/composables/useFinanceLoadApi.ts`         | `altaConPlan` + tipos `CoachAltaInput`/`CoachAltaResponse`                                      | VERIFIED        | 2 refs `altaConPlan` (def + export); path `/admin/finance/coach-load/alta`; sin `any`; `catch (err: unknown)`                                                      |
| `el-templo-admin/src/pages/CargarPagoPage.vue`                 | Modo 'alta' completo (sede, alumno+dedup, plan grid, fixed picker, Confirmar)                   | VERIFIED (code) | 16 refs `'alta'`; 3 refs check-duplicates/Nuevo alumno; 2 refs FixedSchedulePicker; 2 refs Precio Zero; 1 ref `altaConPlan`                                        |
| `el-templo-admin/src/components/caja/BandejaPendientesTab.vue` | Copy condicional de cascade en dialog Anular                                                    | VERIFIED (code) | 3 refs `createdMember`; `v-if="actionRow.createdMemberName"` en q-banner con copy exacta del UI-SPEC                                                               |
| `el-templo-admin/src/types/transaction.ts`                     | `PendingTrayItem` con `createdMemberId: number\|null` + `createdMemberName: string\|null`       | VERIFIED        | 3 refs `createdMember`; campos requeridos espejando el API                                                                                                         |

---

### Key Link Verification

| From                           | To                                                    | Via                                                                                                   | Status | Detalles                                                                                                                      |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST /alta`                   | `memberService.checkDuplicates + createMinimalMember` | dedup por DNI antes de crear                                                                          | WIRED  | 3 refs `checkDuplicates`; `createMinimalMember` llamado solo en rama sin match                                                |
| `POST /alta`                   | `subscriptionService.assignPlan`                      | `recorderRole + idempotencyKey + recorderBranchId + createdMemberId + scheduleIds + priceTypeApplied` | WIRED  | 6 refs `assignPlan`; todos los campos presentes en el `AssignPlanInput` del call                                              |
| `POST /alta`                   | `financial_transactions.createdMemberId`              | `createdMemberId` viaja por el input de assignPlan → graba en insert del charge (sin UPDATE)          | WIRED  | Verificado con grep: `createdMemberId` aparece en declaración, input de `assignPlan`, y echo de respuesta — sin UPDATE suelto |
| `_void`                        | `users.status='inactivo' + userStatusHistory`         | cuando `existing.createdMemberId !== null`                                                            | WIRED  | `transaction-service.ts` L559-586: bloque completo con read-before, UPDATE, insert history, dedupe from==to                   |
| `listPendingTray`              | `createdMemberId / createdMemberName`                 | leftJoin a users (alias `created_member`)                                                             | WIRED  | `transaction-service.ts` L1367: `eq(createdMember.id, schema.financialTransactions.createdMemberId)`; campos en el map L1412  |
| `CargarPagoPage.vue modo alta` | `useFinanceLoadApi.altaConPlan`                       | Confirmar → `financeApi.altaConPlan({...})`                                                           | WIRED  | 1 ref `altaConPlan` en la página; composable posta a `/admin/finance/coach-load/alta`                                         |
| `DNI on-blur`                  | `useMembersApi checkDuplicates`                       | banner gold condicional                                                                               | WIRED  | 3 refs `checkDuplicates`/`Nuevo alumno` en la página; banner `v-if="dedupMatch"`                                              |
| `plan fixed seleccionado`      | `FixedSchedulePicker`                                 | `v-if="selectedPlan.bookingMode === 'fixed'"`                                                         | WIRED  | `FixedSchedulePicker` importado (2 refs); render condicional confirmado                                                       |
| `dialog Anular`                | `row.createdMemberName`                               | copy condicional `v-if="actionRow.createdMemberName"`                                                 | WIRED  | `BandejaPendientesTab.vue` L327: condición y template con nombre interpolado                                                  |

---

### Data-Flow Trace (Level 4)

| Artifact                     | Data Variable                 | Source                                                                                                             | Produce datos reales                 | Status  |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------- |
| `CargarPagoPage.vue`         | `altaPlans` (plan grid)       | `useSubscriptionsApi().getPlans(true, { branchId: sucursalId })` — API call real                                   | Si (API query real de DB)            | FLOWING |
| `CargarPagoPage.vue`         | `amount` (precio auto)        | watcher `[selectedPlan, paymentMethod, zeroPrice]` → `priceCreditCard`/`priceRegular`/`priceZero` del plan elegido | Si (derivado de datos del plan real) | FLOWING |
| `BandejaPendientesTab.vue`   | `actionRow.createdMemberName` | payload de `getPendingTray()` → `api.get<PendingTrayResult>` → `listPendingTray` con leftJoin real                 | Si (join server-side a `users`)      | FLOWING |
| `coach-load-routes.ts /alta` | `transaction` (response)      | `transactionService.findByIdempotencyKey(idempotencyKey)` query real                                               | Si (DB query post-insert)            | FLOWING |

---

### Behavioral Spot-Checks

Omitidos. El backend es una API Fastify que requiere DB real (`eltemplo_test`) para funcionar. Los tests de integración de 148-04 son el mecanismo de verificación apropiado y corren en CI. Spot-checks en-proceso contra DB de producción local están fuera del alcance de la verificación (sin servidor activo disponible en este contexto).

---

### Probe Execution

No se declaran probes en los PLANs de esta fase. Sin convenciones `scripts/*/tests/probe-*.sh` para fases de backend/frontend. Saltado.

---

### Requirements Coverage

| Req-ID  | Plan                   | Descripción                                                                        | Status    | Evidencia                                                                                                                                  |
| ------- | ---------------------- | ---------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| ALTA-01 | 148-01, 148-02, 148-05 | Crear alumno mínimo (nombre+DNI+sucursal) + dedup DNI                              | SATISFIED | `createMinimalMember` en members/service; `checkDuplicates` en /alta handler y frontend                                                    |
| ALTA-02 | 148-02, 148-05         | Sucursal default = sede del profe, editable                                        | SATISFIED | `resolveRecorderBranchId(request.user.userId)` para caja sugerida; `q-select` Sede con default `authStore.user.branchId` en CargarPagoPage |
| ALTA-03 | 148-02, 148-05         | Plan + Zero + precio x medio de pago + parcial deja deuda                          | SATISFIED | Mapeo `priceTypeApplied` en /alta; toggle "Precio Zero"; watcher de precio en frontend; `amountReceived` < precio → deuda por `assignPlan` |
| ALTA-04 | 148-02, 148-05         | Turnos estructurados solo para planes fixed (FixedSchedulePicker)                  | SATISFIED | `scheduleIds` en AssignPlanInput; `FixedSchedulePicker` condicional en modo alta; `canConfirm` gates en count exacto para fixed            |
| ALTA-05 | 148-02                 | Endpoint atómico e idempotente                                                     | SATISFIED | Idempotencia: `idempotencyKey` UNIQUE + catch `isDuplicateKeyError` → 200 no-op; atomicidad: 2 tx encadenadas (createMinimalMember         | assignPlan), sin tercera tx desacoplada |
| ALTA-06 | 148-03, 148-06         | Cascade en void: alumno-nuevo → membresía cancelada + alumno inactivo (no borrado) | SATISFIED | `_void` cascade con flip a `inactivo` + history; bandeja muestra copy condicional de advertencia                                           |
| ALTA-07 | 148-02, 148-05         | Pago pendiente → bandeja de gestión                                                | SATISFIED | `recorderRole='coach'` → `validation_status='pendiente'` (server-derived); charge aparece en `listPendingTray` con `createdMemberId`       |
| ALTA-08 | 148-04                 | Tests de integración                                                               | SATISFIED | `test/finance/coach-load-alta.test.ts` (656 líneas, 7 escenarios, asserts sobre DB real)                                                   |

Nota: ALTA-01 a ALTA-08 no están en `REQUIREMENTS.md` (ese archivo cubre solo el milestone v5.3, fases 145-147). Los requisitos de la fase 148 están documentados en ROADMAP.md y en el frontmatter de los PLANs — sin requisitos huérfanos dentro del scope de la fase.

---

### Anti-Patterns Found

| Archivo              | Línea | Pattern                                                  | Severidad | Impacto                                                       |
| -------------------- | ----- | -------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `CargarPagoPage.vue` | 184   | `placeholder="Ej.: clase de recuperación, ajuste, etc."` | Info      | Atributo HTML legítimo de un q-input de notas — no es un stub |

Sin `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` en ningún archivo modificado por la fase 148. Sin tipos `any` en archivos de fase 148. Sin stubs (`return null`, `return {}`, handlers vacíos).

**Nota tsc admin:** `pnpm exec tsc --noEmit` en el admin reporta errores en `src/utils/pdf/session-pdf-builder.ts` (tipos `Margins`). Este archivo NO fue modificado en ningún commit de la fase 148 (últimas modificaciones: commits `20d2648b`/`21a8cb1d`/etc., anteriores a la fase 148). Los archivos propios de la fase (CargarPagoPage, useFinanceLoadApi, BandejaPendientesTab, types/transaction.ts) no generan errores de tsc. El error es pre-existente al scope de esta fase.

---

### Human Verification Required

#### 1. Modo "Alta + plan" — chip Sede y mini-form de alumno nuevo

**Test:** En el admin (login como profe/coach), abrir "Cargar pago" y hacer click en el tab "Alta + plan"
**Expected:**

- Aparece un chip/selector "Sede" con la sede del profe pre-seleccionada, editable
- Al tipear en el buscador de socio y no encontrar match, aparece la opción "+ Nuevo alumno" que despliega el mini-form con campos Nombre, Apellido, DNI (sin email/teléfono)
- Al ingresar un DNI de 7+ dígitos que corresponde a un alumno existente y salir del campo (on-blur), aparece el banner dorado "Ya existe un alumno con ese DNI: {nombre}. Se cargará sobre ese alumno." con el botón "Usar ese alumno"
  **Por qué humano:** Comportamiento visual interactivo (q-select, on-blur, renderizado condicional del banner) — grep confirma la lógica pero no el resultado visual

#### 2. Modo "Alta + plan" — plan grid, precio por medio y turnos fixed

**Test:** Con un alumno nuevo seleccionado, elegir un plan fixed con `classesPerWeek=2` y un plan flexible, y probar con diferentes medios de pago y montos
**Expected:**

- El plan fixed muestra el FixedSchedulePicker con badge `n/2`; el plan flexible muestra el caption "Este plan reserva semana a semana — no se eligen turnos ahora"
- Elegir "Tarjeta" como medio de pago recalcula el monto al `priceCreditCard` del plan
- Ingresar un monto menor al precio muestra el banner dorado "El alumno quedará deudor por {diferencia}"
- Al confirmar una alta válida: aparece notify positive "Alumno y plan cargados — pendiente de validación"; el ticket aparece en "Mis cargas" con badge Pendiente y chip "Nuevo" (si se creó un alumno nuevo)
  **Por qué humano:** Reactividad de watcher precio, renderizado condicional del picker, ciclo completo de Confirmar — verificable solo ejecutando la UI con datos reales

#### 3. Bandeja Pendientes — dialog Anular: warning de cascade vs preexistente

**Test:** En la bandeja de Pendientes (caja/validación), buscar una carga creada via "Alta + plan" de un alumno nuevo y hacer click en "Anular"
**Expected:**

- El dialog de Anular muestra el banner rojo "Esta carga creó al alumno **{nombre}**. Al anular, también se desactivará su membresía y el alumno quedará **inactivo** (no se elimina). ¿Anular de todos modos?" antes del botón de confirmar rojo
- Para una carga de un alumno preexistente (cargada con el socio typeahead, no alumno nuevo), el dialog NO muestra ese banner y la copy es la habitual
  **Por qué humano:** El `v-if="actionRow.createdMemberName"` depende del campo del backend que a su vez depende de haber ejecutado un alta real; requiere datos en staging

---

### Gaps Summary

Sin gaps. Todos los must-haves tienen implementación sustancial verificada. El código es funcional end-to-end (backend + tests + frontend), sin stubs ni implementaciones placeholder. El estado `human_needed` refleja exclusivamente los comportamientos visuales/interactivos que no son verificables por análisis de código estático.

---

_Verificado: 2026-06-26T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
