# Requirements: El Templo v4.85 — Enrollment Service + Admin Add-ons

**Defined:** 2026-05-04
**Core Value:** El lifecycle de `programEnrollments` está centralizado en un único servicio (`EnrollmentService`) que sirve tanto a las creaciones automáticas vía suscripción como a las asignaciones manuales del admin (add-ons). El admin puede regalar o cobrar programas adicionales sobre la sub activa de un miembro, y los add-ons heredan el ciclo de vida de la sub principal sin acoplar lógica duplicada.

**Reference:** Conversación 2026-05-04 (transcripts en `.docs/WhatsApp Ptt 2026-05-04 at 14.28.21.txt` y `.docs/WhatsApp Ptt 2026-05-04 at 14.29.51.txt`) + análisis arquitectural en chat principal — diagnóstico del spaghetti `subscriptions/programas` (6 inserts duplicados, fase 111 como síntoma reciente). Inserción entre v4.8 (cerrado) y v4.9 (queued — refactor splits): v4.85 desbloquea v4.9 al sacar la lógica de enrollment fuera de `subscriptions/service.ts`.

**Decisiones clave:**

- **A** — Add-ons se transfieren automáticamente al cambiar de plan (sin recobrar).
- **C** — Add-ons se cancelan cuando muere la sub principal (sin refund automático).
- **A** — `pricePaid` se cobra como `financial_transaction` independiente al asignar (puede ser 0 = regalo).
- **Bloqueo (no alerta)** ante programa duplicado activo — admin debe cancelar el viejo primero.
- Asignación de add-on como acción aparte (no flow combinado con renovación; deferred).

---

## v4.85 Requirements

24 requirements en 6 categorías. Refactor + feature van juntos: extracción de `EnrollmentService` precede al feature de add-ons para evitar empeorar el acoplamiento existente.

### EnrollmentService Refactor (ENROLL)

- [ ] **ENROLL-01**: Toda creación de `programEnrollments` pasa por `EnrollmentService.enrollFromPlan()` — reemplaza los 6 inserts inline en `subscriptions/service.ts` (líneas aproximadas 1204, 1257, 2485, 2536, 3191, 3872).
- [ ] **ENROLL-02**: Todo teardown de `programEnrollments` pasa por `EnrollmentService.tearDownForSubscription()` — reemplaza `tearDownBundleEnrollments` (introducido en fase 111), generalizado para todas las `source` de enrollment.
- [ ] **ENROLL-03**: Métodos mutadores de `EnrollmentService` aceptan parámetro `tx?` opcional para preservar atomicidad cuando son invocados dentro de transacciones existentes en `subscriptions/service.ts`.
- [ ] **ENROLL-04**: Tests existentes de fase 111 (teardown on cancel/expire + recompute `user.status`) pasan sin modificaciones después del refactor — no regresión de comportamiento.
- [ ] **ENROLL-05**: `EnrollmentService` vive en `el-templo-api/src/modules/programs/` y se inyecta a `SubscriptionService` por constructor (DI pattern establecido en fase 56).

### Schema Changes (ADDON-SCHEMA)

- [ ] **ADDON-SCHEMA-01**: `program_enrollments` tiene columna `source` (enum `plan_linked` | `plan_bundle` | `admin_addon`), NOT NULL.
- [ ] **ADDON-SCHEMA-02**: `program_enrollments` tiene columna `price_paid` (int, nullable). Null = no aplica (enrollment automático por plan); 0 = regalo; > 0 = monto cobrado.
- [ ] **ADDON-SCHEMA-03**: `program_enrollments` tiene columna `assigned_by` (FK `users.id`, nullable) — auditoría del admin que asignó el add-on. Null para enrollments automáticos.
- [ ] **ADDON-SCHEMA-04**: `program_enrollments` tiene columna `subscription_id` (FK `subscriptions.id`, nullable) — vincula el enrollment al lifecycle de una sub específica.
- [ ] **ADDON-SCHEMA-05**: Migration backfilea registros existentes — `source` derivado del plan original (plan con `linkedProgramId` → `plan_linked`, plan con `grantsAllPrograms` → `plan_bundle`); `subscription_id` resuelto donde sea unívoco.

### Admin Add-on API (ADDON-API)

- [ ] **ADDON-API-01**: Admin asigna add-on via `POST /api/admin/users/:userId/program-addons` con payload `{ programId, pricePaid?, notes? }`.
- [ ] **ADDON-API-02**: Asignación requiere sub activa del miembro target; sin sub activa → HTTP 400 con código de error explícito.
- [ ] **ADDON-API-03**: `pricePaid > 0` genera `financial_transaction` (kind apropiado del módulo finance v4.8) atómicamente con la creación del enrollment, link via `transaction_links` con `target_kind = enrollment`.
- [ ] **ADDON-API-04**: `pricePaid = 0` o null crea enrollment sin transacción financiera (regalo).
- [ ] **ADDON-API-05**: Programa duplicado activo → HTTP 409 (forzar cancelar el enrollment viejo primero); no se permite tener dos enrollments activas del mismo programa por user.
- [ ] **ADDON-API-06**: Admin/owner puede cancelar un add-on individual via endpoint existente de cancelación de enrollment; el endpoint respeta el rol y emite log de auditoría.

### Lifecycle Hooks (ADDON-LIFE)

- [ ] **ADDON-LIFE-01**: `changePlanNow` transfiere add-ons activos de la sub vieja a la nueva (update de `subscription_id`); no se recobra `pricePaid`.
- [ ] **ADDON-LIFE-02**: `changePlanAfterCurrent` mantiene add-ons en la sub actual hasta que muera; transferencia se aplica al activar la scheduled successor.
- [ ] **ADDON-LIFE-03**: Cancel/expire de sub → `EnrollmentService.tearDownForSubscription()` cancela add-ons asociados (status → `cancelled`).
- [ ] **ADDON-LIFE-04**: Teardown de add-on por cancelación de sub NO genera refund automático (decisión C: el add-on muere con la sub; reembolso es decisión de producto fuera de scope).

### Admin Frontend (ADDON-ADMIN-UI)

- [ ] **ADDON-ADMIN-UI-01**: Detalle del miembro tiene sección "Programas" con lista de enrollments activas, cada una con badge `incluido en plan` o `add-on` según `source`.
- [ ] **ADDON-ADMIN-UI-02**: Cada fila de add-on muestra `pricePaid`, fecha de asignación, y nombre del admin que lo asignó (`assigned_by`).
- [ ] **ADDON-ADMIN-UI-03**: Botón "Asignar programa adicional" abre modal con dropdown de programas activos disponibles, input opcional de precio (default 0), campo de notas opcional.
- [ ] **ADDON-ADMIN-UI-04**: Admin cancela un add-on individual desde la lista con confirmación; UI refleja el estado actualizado tras la respuesta.
- [ ] **ADDON-ADMIN-UI-05**: UI muestra errores accionables del backend — sub inactiva ("Asignar plan primero"), programa duplicado ("Cancelar la inscripción existente primero").

### Member Frontend (ADDON-MEMBER-UI)

- [ ] **ADDON-MEMBER-UI-01**: Dropdown de programas en home del member muestra todas las enrollments activas (linked + add-ons) sin distinción visual; reutiliza el patrón bundle existente.
- [ ] **ADDON-MEMBER-UI-02**: Member alterna entre programas via dropdown; selección dispara contenido del weekly view (comportamiento bundle preservado, sin nueva UI).

---

## Future Requirements (Deferred)

- **Flow combinado "renovar + regalar"**: botón único en `RenewSubscriptionDialog` con checkbox "Regalar programa" + dropdown. Cubierto manualmente por el endpoint actual; se evalúa según fricción operativa.
- **Refund explícito al cancelar add-on**: política de devolución de `pricePaid` al cancelar manualmente un add-on antes de su completion. Decisión de producto pendiente.
- **Add-ons sin sub activa**: caso "ex-alumno vuelve solo por programa puntual" — descartado en v4.85, requiere repensar invariantes.

## Out of Scope (Explicit Exclusions)

- **Add-ons como producto vendible al member en su app**: solo asignación admin en v4.85.
- **Multi-currency en `pricePaid`**: hereda la moneda de la sub activa del miembro; sin override.
- **Pausar add-on independientemente de la sub**: el lifecycle del add-on sigue al de la sub; no hay pausado granular.
- **Reactivación automática de add-ons al re-suscribirse**: si la sub muere y el miembro vuelve a contratar, los add-ons NO reviven (decisión C).
- **Splits mecánicos de archivos largos**: corresponde a v4.9 (Refactor Splits, queued).

---

## Traceability

| REQ-ID                                  | Phase |
| --------------------------------------- | ----- |
| (To be filled by roadmapper in step 10) |       |
