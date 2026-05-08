# Phase 113: CRUD admin de Schedules y Activities - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Habilitar al admin a gestionar el catálogo de horarios y actividades sin migraciones manuales. Crear nuevos schedules desde la UI, CRUD completo de activities, y aprovechar los endpoints existentes (toggle, cambiar activity) sin reinventarlos.

**Disparador concreto:** El slot 10:00-11:00 de Constitución quedó activo en DB después de cerrarse hace meses. Se desactivó vía migración 0118 (commit f2792abd). Esta fase elimina la necesidad de migraciones one-off para cambios operativos.

</domain>

<decisions>
## Implementation Decisions

### Scope (locked antes del discuss)

- **D-01:** IN — CREATE schedule nuevo desde admin.
- **D-02:** IN — CRUD completo de activities (crear/editar/desactivar).
- **D-03:** OUT — Branches CRUD (no requerido v1).
- **D-04:** OUT — Bloqueos puntuales por slot+fecha. El toggle existente (desactivar slot completo) cubre los casos prácticos. Anteayer se ejecutó este flujo en producción exitosamente.
- **D-05:** OUT — Fix de "subs huérfanas" (sub fija apuntando a slot inactivo). Verificado empíricamente en prod (2026-05-08): subs fijas tienen `classes_remaining = NULL` (plan ilimitado), por lo que el cron de no-show no las afecta (guard `if classesRemaining > 0`). El modelo es coherente, no hay bug.
- **D-06:** Acceso al CRUD = cualquier usuario admin, sin scope multi-sede para v1.

### Edición de schedules vivos

- **D-07:** **NO se permite editar `start_time`, `end_time` o `day_of_week` de un schedule existente.** Los horarios son inmutables una vez creados. Para cambiar un horario, el admin debe desactivar el slot viejo (toggle existente) y crear uno nuevo. Esto evita toda la complejidad de migrar bookings, notificar miembros, y operaciones atómicas riesgosas.
- **D-08:** Cambiar la `activity` de un schedule vivo SÍ está permitido (endpoint `PATCH /schedules/:id/activity` ya existe — no se toca).
- **D-09:** Toggle `is_active` ya existe (`PUT /schedules/:id/toggle`) y maneja cancelación de bookings futuros + restauración al reactivar — no se toca.

### Validación de conflictos al crear schedule

- **D-10:** Al crear un schedule, **bloquear si existe overlapping de horario en el mismo `branch_id + day_of_week`**, sin importar la activity. Una sucursal no puede tener dos clases físicamente simultáneas (asume una sola sala/grupo por sede). Si en el futuro se introducen múltiples salas, se replantea la regla.
- **D-11:** Definición de "overlapping": dos slots se solapan si `[start_a, end_a)` y `[start_b, end_b)` se intersectan. Slots back-to-back (10-11 y 11-12) NO son conflicto.
- **D-12:** Validación aplica solo entre slots `is_active = 1`. Slots históricos inactivos no bloquean.

### CRUD Activities

- **D-13:** **Desactivar una activity con schedules apuntando a ella → BLOQUEAR + listar los schedules afectados.** El admin debe primero cambiar la activity de esos schedules (vía endpoint existente) o desactivarlos. Mismo patrón que `validateAnchorSet()` usa para subs/schedules inactivos.
- **D-14:** Editar `name` y `description` de una activity existente → permitido sin restricciones. Schedules apuntan por `activity_id`, no por nombre, así que rename es seguro.
- **D-15:** Soft delete via `is_active = 0` (la columna ya existe). NO hard delete.
- **D-16:** No se permite reusar un `name` de activity existente al crear (validación de unicidad sobre activities activas).

### UI shape

- **D-17:** Botón "Crear slot" flotante en `HorariosPage.vue` → abre modal con campos: sede (pre-seleccionada por filtro actual), día, start_time, end_time, activity (dropdown solo de activities activas). Submit → grid se refresca.
- **D-18:** CRUD de activities en pestaña/sección separada DENTRO de `HorariosPage.vue` (tabs "Horarios" / "Actividades"). NO crear página nueva en sidebar.
- **D-19:** No se modifica el `SlotDetailDialog.vue` existente — sigue manejando view/toggle/cambiar-activity como hoy.
- **D-20:** Errores de validación (overlap al crear, activity con schedules al desactivar) se muestran en español, accionables ("Ya existe un slot Lun 10-11 en Constitución", "Cambiar la activity de los siguientes 3 schedules antes de desactivar: ...").

### Claude's Discretion

- Estilo de modales/forms — seguir el patrón Quasar existente del admin.
- Estructura de respuestas de error del backend (códigos HTTP, shape de body) — alinear con el resto del módulo `scheduling`.
- Tests: cubrir casos de validación de overlap, bloqueo por cascade, y CRUD básico de activities.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend

- `el-templo-api/src/modules/scheduling/routes.ts` — Endpoints existentes (`toggle`, `activity`). Nuevo CREATE va aquí.
- `el-templo-api/src/modules/scheduling/booking-service.ts:691` — `cancelAllFutureBookingsForSchedule()` patrón ya usado por toggle.
- `el-templo-api/src/db/schema/schedules.ts` — Shape: id, branch_id, activity_id, day_of_week, start_time, end_time, is_active, inactive_reason, deactivated_at.
- `el-templo-api/src/db/schema/activities.ts` — Shape: id, name, description, is_active.
- `el-templo-api/src/modules/subscriptions/service.ts:3953` (`validateAnchorSet`) — Patrón "rechazar si hay refs activas" a replicar para activity deactivation.

### Frontend

- `el-templo-admin/src/pages/HorariosPage.vue` — Página principal a extender (tabs + botón crear).
- `el-templo-admin/src/components/SlotDetailDialog.vue` — NO se toca, mantenerlo como referencia de patrón.

### Migración relacionada

- `el-templo-api/src/db/migrations/0118_deactivate_constitucion_10am.sql` — Migración disparadora ya commiteada en branch `fix/deactivate-constitucion-10am` (no push). Independiente de esta fase pero contexto del problema.

### Convenciones del proyecto

- `CLAUDE.md` (project root) — Logging (Pino/createLogger), TypeScript (no `any`), tests integración con MySQL real, migraciones via `pnpm db:generate`/`db:migrate`, no `drizzle-kit migrate`.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`PUT /schedules/:id/toggle`** — Maneja desactivar/reactivar + cancelar bookings futuros + restaurar al reactivar. Cubre todo el flujo de "borrar" un slot.
- **`PATCH /schedules/:id/activity`** — Cambiar la activity de un slot vivo. No se toca.
- **`BookingService.cancelAllFutureBookingsForSchedule()`** — Patrón a tomar como referencia si en el futuro se necesita extender.
- **`validateAnchorSet()`** en subscriptions/service.ts — Patrón "rechazar si hay refs activas" — replicar para activity deactivation.
- **`HorariosPage.vue` + `SlotDetailDialog.vue`** — Scaffolding admin existente.

### Established Patterns

- Backend: Fastify routes en `src/modules/<domain>/routes.ts`, service layer en `service.ts`, schemas Drizzle en `src/db/schema/`.
- Frontend admin: Quasar + Vue 3 + Pinia composition API, dialogs como modales, errores con copys en español accionables.
- Migraciones: numeradas secuencialmente, idempotentes, con comentarios de contexto.

### Integration Points

- Nuevo endpoint `POST /schedules` (o similar) en `scheduling/routes.ts`.
- Nuevo módulo o extensión para activities CRUD: `src/modules/activities/routes.ts` (verificar si existe; si no, crear).
- Frontend: nuevo modal de creación de slot, nueva tab/sección de activities en `HorariosPage.vue`.

</code_context>

<specifics>
## Specific Ideas

- El user usó como ejemplo el slot Constitución 10am (cerrado hace meses, quedó activo en DB) — caso real que motivó esta fase.
- "Que no te joda con estas cosas" — la motivación del user es eliminar pedidos de admin manual al desarrollador para cambios de catálogo.
- Patrón mental del user: "los horarios son inmutables, si querés cambiar uno, desactivás y creás" — alinea con el modelo actual sin agregar complejidad.

</specifics>

<deferred>
## Deferred Ideas

- **Editar start_time/end_time/day_of_week de slots vivos** — descartado intencionalmente. Si en el futuro hay caso de uso fuerte (ej: ajuste estacional masivo), se replantea como fase separada con plan de migración de bookings.
- **Branches CRUD desde admin** — fuera de v1. Cuando se necesite (ej: abrir nueva sede), se considera fase aparte.
- **Bloqueos puntuales por slot+fecha** (ej: "este martes 10h no hay clase pero el resto sí") — el toggle existente alcanza para los casos prácticos. Si se requiere granularidad de fecha sin desactivar el slot recurrente, fase aparte con tabla `schedule_exceptions`.
- **Audit/historial de cambios en schedules** — YAGNI para v1. Si en producción aparece necesidad real de "quién cambió qué cuándo", se agrega tabla audit en fase separada.
- **Scope multi-sede en permisos de admin** — todos los admins ven/editan todo. Si crece el equipo y se necesita scope por sede, fase separada.
- **Crear schedule desde celda vacía del grid (UX context-aware)** — descartado a favor del botón flotante por simplicidad. Si los admins crean muchos slots y el flujo se vuelve repetitivo, mejorar UX en iteración futura.

</deferred>

---

_Phase: 113-crud-admin-schedules-activities_
_Context gathered: 2026-05-08_
