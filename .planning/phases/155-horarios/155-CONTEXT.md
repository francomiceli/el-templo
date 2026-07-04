# Phase 155: Horarios - Context

**Gathered:** 2026-07-05 (modo `--auto` — decisiones = opción recomendada, autorizado por el usuario)
**Status:** Ready for planning

<domain>
## Phase Boundary

Horarios del admin: clases simultáneas en la misma sucursal (HOR-01), crear clase/actividad directamente desde el slot de la grilla (HOR-02, generaliza el "test de profe" Templo-específico), y capacidad por actividad con fallback al cupo de la sucursal (HOR-03). Requirements: HOR-01..03.

NO incluye: asistencia por QR desde la app del alumno (HOR-F1, out of scope del milestone), cambios al motor de reservas más allá del cupo efectivo, borrado del flujo de sesiones de prueba/test de profe (se conserva), tenants.

**Arrastrado de fases previas (no re-decidir):** 149 D-04 seguridad en la API + UI esconde; Horarios es categoría libre (profe la ve); constraint SaaS sin Templo-ismos nuevos en core; migraciones a mano (runner propio, `db:generate` roto), nunca `;` en comentarios SQL; tests de integración obligatorios; tests corren en CI, no localmente.

</domain>

<decisions>
## Implementation Decisions

### Clases simultáneas (HOR-01)

- **D-01: El check de solape pasa de (sucursal, día) a (sucursal, día, actividad).** `createSchedule` (`scheduling/service.ts:93-114`, lógica de la fase 113 D-10/11/12) hoy bloquea cualquier solape de intervalo en la misma sucursal+día; pasa a bloquear solo cuando la actividad es LA MISMA. Musculación puede convivir con funcional a la misma hora; dos slots de la misma actividad solapados siguen siendo error (mensaje ajustado para nombrar la actividad). La semántica de intervalos `[start, end)` con back-to-back permitido se conserva tal cual.
- **D-02: Cualquier lógica derivada que asuma "un slot por franja"** (render de grilla del admin, agrupación por hora, selección de slot en la app) debe soportar N slots por celda — la grilla muestra las clases simultáneas apiladas/lado a lado en la misma celda. Verificar también la vista de horarios del member app (ReservasPage) que ya agrupa por horario+actividad.

### Crear clase desde el slot (HOR-02)

- **D-03: Click en una celda vacía de la grilla abre el dialog de "Crear horario" prefilleado** con sucursal (la seleccionada), día y hora de la celda. Reusa el flujo/endpoint `createSchedule` existente y el dialog actual (`showCreateSlotDialog`) — se le agrega soporte de valores iniciales. El botón global "Crear horario" se mantiene.
- **D-04: Creación rápida de actividad inline:** si la actividad no existe, el mismo dialog permite crearla al vuelo (nombre; description opcional) sin salir del flujo — generaliza el "test de profe" en "crear clase/actividad desde el slot". El flujo Templo de sesiones de prueba/test de profe NO se toca ni se borra (consistente con NAV-04).

### Capacidad por actividad (HOR-03)

- **D-05: Columna nullable `max_capacity` en `activities`** (migración nueva — verificar numeración; la última es 0166). Cupo efectivo de un slot = `activity.maxCapacity ?? branch.maxCapacity`. NULL = hereda sucursal (default, cero cambio de comportamiento para datos existentes; sin backfill).
- **D-06: Los checks de cupo de reservas usan el cupo efectivo del slot.** `booking-service.ts` valida hoy contra `getBranchCapacity` (~278, ~600, ~1067): esas rutas pasan a resolver el cupo efectivo (actividad del slot ?? sucursal), con un helper único (no triplicar la resolución).
- **D-07: El check de cupo es POR CLASE/SLOT, no agregado por sucursal:** con dos clases simultáneas, cada una tiene su propio cupo independiente. `branch.maxCapacity` funciona como default por-clase, no como techo del edificio (si algún día se necesita techo agregado, es fase futura).
- **D-08: UI del cupo: campo "Cupo" en el alta/edición de actividad** (donde viva el ABM de actividades — si solo se crean inline desde Horarios, el campo va en ese dialog), placeholder/hint "vacío = hereda el cupo de la sucursal".

### Claude's Discretion

- Diseño visual de la celda con múltiples clases (apiladas vs columnas) y del affordance de "click para crear" en celda vacía.
- Naming exacto del helper de cupo efectivo y dónde vive (scheduling service).
- Si el dialog de crear-desde-slot permite ajustar la hora prefilleada (recomendado: sí, es un prefill, no un lock).
- Validaciones del campo cupo (entero positivo, límites razonables).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.docs/saas-multitenancy/Correcciones El Templo.md` — §Horarios (~147-155): "No me permite tener dos clases en simultáneo en una misma sucursal... muchas veces la musculación convive con las actividades especiales" (ítem 1), "poder cargar la clase directamente desde la selección del horario y no solo el test de profe" (ítem 2), capacidad por actividad (ítem 3, image31).
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` — image29-31 → HorariosPage.vue.

### API y schema (scheduling)

- `el-templo-api/src/modules/scheduling/service.ts` — `createSchedule` (~45-120): validación de solape por sucursal+día (fase 113) que pasa a distinguir actividad (D-01); CRUD de slots.
- `el-templo-api/src/modules/scheduling/booking-service.ts` — checks de cupo contra `getBranchCapacity` (~278, ~600, ~1067) → cupo efectivo (D-06).
- `el-templo-api/src/db/schema/activities.ts` — recibe `max_capacity` nullable (D-05).
- `el-templo-api/src/db/schema/schedules.ts` — modelo de slot (branch+activity+day+time, índice branch/day/time).
- `el-templo-api/src/db/schema/branches.ts` — `maxCapacity` (default 22) queda como fallback.
- Migración nueva (ALTER activities ADD max_capacity NULL) — runner propio; verificar numeración (última: 0166).

### Superficie a modificar (admin)

- `el-templo-admin/src/pages/HorariosPage.vue` — grilla semanal (~251+), botón "Crear horario" + `showCreateSlotDialog` (~89-97): celdas con N clases (D-02), click-para-crear con prefill (D-03).
- `el-templo-admin/src/components/scheduling/` — dialog de creación de slot (prefill D-03, actividad inline D-04, campo cupo D-08); `SlotDetailDialog.vue` no cambia de responsabilidad.

### Superficie afectada (member app — verificar, no rediseñar)

- `el-templo-app` ReservasPage / vista de horarios — debe seguir funcionando con N clases por franja (D-02); el cupo mostrado/validado viene de la API (cupo efectivo).

### Contexto de fases previas

- `.planning/phases/149-nav-por-categor-as-rbac/149-CONTEXT.md` — gating/roles (Horarios libre).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Validación de solape existente (fase 113) con semántica `[start,end)` — solo se re-scopea por actividad.
- Dialog "Crear horario" existente (`showCreateSlotDialog`) — gana prefill + actividad inline + cupo.
- `getBranchCapacity` — se envuelve en un helper de cupo efectivo.
- Patrón de migración ALTER + nullable sin backfill (varias del tren v5.2-v5.4).

### Established Patterns

- Tests de integración para las rutas modificadas: crear slots solapados de actividades distintas (OK) y de la misma (400); reserva con cupo de actividad < cupo de sucursal (bloquea en el menor); actividad sin cupo hereda sucursal; creación de actividad inline.
- Gates locales: `tsc --noEmit` (API) + `pnpm lint` (admin); suites en CI.
- Sin `git add -A`; no tocar archivos pre-existentes modificados del working tree.

### Integration Points

- `scheduling/service.ts` (overlap + create), `booking-service.ts` (cupo), `activities` schema + schemas/types del módulo.
- HorariosPage grilla + dialog de creación.
- Endpoints de actividades (si no existe create-activity expuesto, agregarlo con guard de staff correspondiente).

</code_context>

<specifics>
## Specific Ideas

- Nacho: "muchas veces la musculación convive con las actividades especiales que se realizan en el gimnasio" — la simultaneidad es entre actividades distintas (D-01).
- Nacho: "Sería práctico poder cargar la clase directamente desde la selección del horario y no solo el test de profe que... en cualquier otro gimnasio no va a existir" — D-03/D-04.
- Nacho ítem 3 (image31): cada actividad con su cupo — D-05..D-08.

</specifics>

<deferred>
## Deferred Ideas

- **Techo agregado de capacidad por sucursal** (cap del edificio sumando clases simultáneas) — el modelo elegido es cupo por clase; un techo agregado sería fase futura si aparece la necesidad real.
- **Asistencia por QR desde la app** (HOR-F1) — ya out of scope del milestone.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — match 0.6 por keywords genéricas; NO incorporado por séptima vez (149-155): sin relación con Horarios.

</deferred>

---

_Phase: 155-Horarios_
_Context gathered: 2026-07-05 via --auto (recommended options)_
