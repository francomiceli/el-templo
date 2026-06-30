# Phase 148: PoS profe — alta de alumno + plan en el cobro - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Source:** Decisiones cerradas en conversación con el usuario + `BRIEF-POS-PROFE-ALTA-ALUMNO.md` (raíz)

<domain>
## Phase Boundary

El profe carga el plan **directamente en el momento del cobro**, creando al alumno si es nuevo, reemplazando el flujo actual Google Form ("Cajas Diarias") → Excel → admin que carga a mano. Extiende el PoS existente `CargarPagoPage.vue` (Fase 140) y reusa la infra de validación (Fase 137/141) y de caja sugerida (Fase 146).

**NO es un clon del Google Form.** Se aprovecha estar dentro del admin para linkear contra catálogo real (planes, sucursales, alumnos existentes) en lugar de texto libre. Filosofía **PoS rápido**: botones grandes, mínimos pasos.

**En scope:**

- Crear alumno nuevo mínimo (nombre + DNI + sucursal) desde el PoS, con dedup por DNI.
- Selección explícita de sucursal (default sede del profe, editable).
- Selección de plan con toggle Zero (precio con descuento) + precio según medio de pago + pago parcial (deja deuda).
- Selector de turnos estructurado para planes `fixed` (reusa `FixedSchedulePicker.vue`).
- Endpoint backend nuevo que orquesta crear/resolver alumno + asignar plan (+ scheduleIds) + transacción financiera `pendiente`, atómico e idempotente.
- Cascade en `void` para cargas de alumno-nuevo.

**Fuera de scope:**

- ABM de planes / sucursales (ya existen).
- Asignar turnos a planes `flexible` (reservan semana a semana, sin picker).
- Completar email/teléfono del alumno en el PoS (lo hace gestión al validar).
- Cambiar el motor de reservas/bookings (se reusa `assignPlan(scheduleIds)` tal cual).

</domain>

<decisions>
## Implementation Decisions

### Modelo de validación (DECISIÓN CENTRAL — cerrada con el usuario)

- **Crear-en-vivo + validar-después** (opción 1). Al confirmar, el alumno + membresía + turnos se crean **al instante** (puede entrenar/check-in ya mismo).
- El **pago** nace `validation_status = 'pendiente'` y va a la bandeja de gestión. Reusa la infra existente de Fase 137/141: `validate` / `observe` / `correct` / `void`.
- Descartado: retener todo en borrador hasta aprobación (digitalizaría el Excel pero mantendría el bottleneck de la admin; el alumno nuevo no podría entrenar hasta ser procesado).

### Dedup por DNI (refuerzo A)

- Antes de crear un alumno nuevo se consulta `GET /admin/members/check-duplicates?dni=` (endpoint existente, busca DNI exacto o últimos-10 del teléfono).
- Si hay match por DNI → se carga contra el alumno **existente**, no se duplica.

### Cascade en void (refuerzo B)

- Anular (`void`) una carga que **creó un alumno nuevo** debe **desactivar la membresía** asociada y dejar al alumno **inactivo**.
- El alumno **NO se borra** (rompería FKs). Queda como inactivo/lead.
- Para alumnos preexistentes, `void` se comporta como hoy (solo anula el pago/membresía de esa carga).

### Sucursal

- Chip arriba de la pantalla, **default = sede donde el profe da clase**, editable con el mismo select (puede cargar para otra sede, como el Excel global).
- Revisar `requireBranchAccess({ from: 'body.branchId' })` para permitir la sede elegida.

### Precio según medio de pago (cerrada: auto-aplicar)

- `subscription_plans` tiene `priceRegular`, `priceZero`, `priceCreditCard` en la misma fila ("Zero" NO es plan aparte, es columna de precio).
- Efectivo / Transferencia → `priceRegular` (o `priceZero` si el toggle Zero está activo).
- Tarjeta → `priceCreditCard` (recargo).
- Monto siempre **editable** a mano; si paga menos que el precio → deja **deuda** (settle parcial).

### Turnos (cerrada: estructurado)

- Selector estructurado, **solo** para planes `bookingMode = 'fixed'`. Reusa/simplifica `FixedSchedulePicker.vue` (admin ya lo usa en `AssignPlanDialog`).
- Planes `flexible` no muestran picker.
- Backend ya asigna `subscription_schedules` + genera bookings recurrentes vía `assignPlan(scheduleIds)` + `generateFixedBookings()`.

### Crear alumno mínimo

- Patrón ya soportado: `POST /admin/members/trial` crea con 4 campos (firstName, lastName, phone, branchId), email/DNI null ("Phase 102: trial users have email=null").
- Para el PoS se usa un path mínimo propio: **nombre + DNI + sucursal** (sin email/teléfono). Gestión completa email/teléfono al validar en la bandeja.
- Riesgo aceptado: alumno sin email no puede loguearse a la app móvil hasta que gestión lo complete (aceptable para walk-in que paga en mostrador).

### Backend (orquestación atómica e idempotente)

- Endpoint nuevo en `coach-load-routes.ts` que:
  1. Resuelve alumno: si viene `userId` lo usa; si viene `{nombre, dni}` → dedup por DNI → existente o crea mínimo.
  2. `assignPlan(plan, scheduleIds?)` con precio según Zero/medio de pago; pago parcial deja deuda.
  3. Crea la transacción financiera `pendiente` con caja sugerida = sede elegida (reusa CAJA-01 de Fase 146).
- Reusa `idempotency_key` (migración 0156) para que doble-submit no duplique alumno/pago.

### Roles / permisos

- `FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, 'coach']` (`shared/permissions.ts:143`). El profe ya puede usar el PoS.

### Claude's Discretion

- Forma exacta del payload del nuevo endpoint y nombres de campos.
- Cómo se modela el "alumno inactivo" tras void (status existente vs flag) — elegir lo que menos toque el resto del sistema, sin borrar.
- Estructura de componentes Vue del nuevo modo "Nuevo alumno" dentro de `CargarPagoPage.vue` (panel vs dialog).
- Detalle de cómo se simplifica `FixedSchedulePicker` para el contexto PoS.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brief y decisiones

- `BRIEF-POS-PROFE-ALTA-ALUMNO.md` — fuente de verdad de todas las decisiones cerradas y hallazgos de código.

### PoS existente (Fase 140) a extender

- `el-templo-admin/src/pages/CargarPagoPage.vue` — pantalla PoS actual (renovar / cobro suelto, botones grandes 56px).
- `el-templo-admin/src/composables/useFinanceLoadApi.ts` — composable de los endpoints coach-load.
- `el-templo-api/src/modules/finance/coach-load-routes.ts` — rutas `pay-plan`, `misc`, `autocompletar`, `mis-cargas` (acá va el endpoint nuevo).

### Validación / bandeja (Fase 137/141)

- `el-templo-api/src/db/schema/financial-transactions.ts` — enum `validation_status` (pendiente/observado/corregido/validado).
- `el-templo-api/src/modules/finance/routes.ts` — `validate`/`observe`/`correct`/`void` (acá va el cascade en void).

### Members

- `el-templo-api/src/modules/members/routes.ts` — `POST /admin/members` (createMember), `POST /admin/members/trial` (mínimo), `GET /admin/members/check-duplicates`.
- `el-templo-api/src/modules/members/schemas.ts` — `createMemberSchema` (required email/phone/dni/branchId).
- `el-templo-api/src/modules/members/types.ts` — `CreateMemberInput`, `CreateTrialMemberInput`.

### Planes y precios

- `el-templo-api/src/db/schema/subscription-plans.ts` — `priceRegular`/`priceZero`/`priceCreditCard`, `bookingMode` (fixed/flexible).

### Turnos / asignación de plan

- `el-templo-admin/src/components/scheduling/FixedSchedulePicker.vue` — selector de turnos fijos (reusar).
- `el-templo-admin/src/components/AssignPlanDialog.vue` — flujo actual de asignación con picker.
- `el-templo-api/src/modules/subscriptions/service.ts` — `assignPlan` (subscription_schedules + imputación de anticipo Fase 146).
- `el-templo-api/src/modules/scheduling/booking-service.ts` — `generateFixedBookings()`, `reserve()`.

### Caja sugerida (Fase 146)

- Lógica CAJA-01: el cobro del profe nace con caja sugerida = sede del profe (reusar para la sede elegida).

### Permisos

- `el-templo-api/src/modules/shared/permissions.ts` — `FINANCE_LOAD_ROLES`, `requireBranchAccess`.

</canonical_refs>

<specifics>
## Specific Ideas

Campos del Google Form actual (referencia de qué reemplazamos): Sucursal, Nombre y Apellido, Documento (DNI sin separadores), Membresía (planes + versiones Zero + "salda deuda"), Medio de Pago (efectivo/transferencia/tarjeta), Monto (parcial permitido), paso 2: Turnos (texto libre), Comentarios.

Mapeo a la solución PoS:

- Sucursal → chip/select (catálogo real).
- Nombre+DNI → typeahead alumno existente o "+ Nuevo alumno".
- Membresía → grilla de botones de planes + toggle Zero + botón "Saldar deuda".
- Medio de pago → 3 botones grandes (ya existen).
- Monto → autocalculado del plan, editable.
- Turnos → selector estructurado (solo fixed).
- Comentarios → nota libre opcional.

</specifics>

<deferred>
## Deferred Ideas

- Completar email/teléfono del alumno desde el PoS (queda para gestión en la bandeja).
- Asignación de turnos para planes `flexible`.
- Cualquier rediseño del motor de bookings.

</deferred>

---

## Suggested Requirements (a confirmar/derivar por el planner)

- **ALTA-01** — Crear alumno mínimo (nombre + DNI + sucursal) desde el PoS, con dedup por DNI (`check-duplicates`) antes de crear; match → carga contra existente.
- **ALTA-02** — Selección explícita de sucursal (default sede del profe, editable; `requireBranchAccess` permite la sede elegida).
- **ALTA-03** — Selección de plan con toggle Zero + precio según medio de pago (tarjeta→`priceCreditCard`, resto→`priceRegular`/`priceZero`); monto editable, parcial deja deuda.
- **ALTA-04** — Selector de turnos estructurado para planes `fixed` (reusa `FixedSchedulePicker`); flexible no muestra picker.
- **ALTA-05** — Endpoint backend atómico e idempotente (resolver/crear alumno + `assignPlan(scheduleIds)` + transacción `pendiente` con caja sugerida).
- **ALTA-06** — Cascade en `void`: anular carga de alumno-nuevo desactiva la membresía y deja al alumno inactivo (no borra); preexistente se comporta como hoy.
- **ALTA-07** — El pago nace `pendiente` → bandeja de gestión (reusa Fase 137/141); gestión valida/observa/anula y completa datos del alumno nuevo.
- **ALTA-08** — Tests de integración: crear nuevo, dedup contra existente, parcial→deuda, fixed con scheduleIds, void→cascade, idempotencia (doble-submit).

---

_Phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro_
_Context gathered: 2026-06-26 — decisiones cerradas con el usuario_
