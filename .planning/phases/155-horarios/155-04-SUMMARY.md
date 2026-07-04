---
phase: 155-horarios
plan: 04
subsystem: admin
tags: [scheduling, grid, simultaneous-classes, capacity, quasar, vue]

# Dependency graph
requires:
  - phase: 155-03
    provides: "CreateSlotDialog prop `initial` (prefill branchId/día/hora) + creación de actividad inline con cupo"
  - phase: 155-01
    provides: "cupo efectivo por actividad servido por la API (getWeeklyGrid), consumido en el render de celda"
provides:
  - "HorariosPage grilla admin con N clases simultáneas por celda (slotMap Map<string, WeeklySlotView[]>)"
  - "Click de detalle/borrado por slot puntual (desktop chips + lista mobile), sin round-trip por (hora, día)"
  - "Click-para-crear desde celda vacía con prefill de sucursal/día/hora"
affects: [horarios, capacidad]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Celda con N slots: Map<string, WeeklySlotView[]> (push al array por key en vez de map.set que pisa) + render apilado de chips por clase"
    - "Click slot-aware: el handler recibe el WeeklySlotView concreto (chip desktop con @click.stop, item mobile del v-for :key=slot.id), no re-deriva por (time, day)"
    - "Click-para-crear: prop `initial` opcional del dialog seteado desde la celda; botón global limpia el initial (undefined) para abrir sin prefill"

key-files:
  created: []
  modified:
    - el-templo-admin/src/pages/HorariosPage.vue

key-decisions:
  - "Layout apilado (chips en columna dentro de la celda) en vez de columnas lado a lado: más simple y legible con 2-3 clases; cada chip llena la altura vía flex 1 1 auto"
  - "Coloreo por ocupación se movió de la celda (cellClass) a cada chip (slotChipClass); el contenedor solo distingue vacía (grid-cell--empty) vs con clases (grid-cell--filled)"
  - "onEmptyCellClick guarda con getCellSlots().length>0 → return; los chips usan @click.stop, así el click de crear solo entra en celdas realmente vacías"
  - "Creación desde celda vacía NO se bloquea en feriados: el schedule es recurrente (semanal), el feriado es por fecha; bloquear confundiría más que ayudar"

patterns-established:
  - "Grilla admin multi-slot por celda con desambiguación de click por slot puntual (aplica a detalle y a delete-selection, desktop y mobile)"

requirements-completed: [HOR-01, HOR-02]

# Metrics
duration: ~7min
completed: 2026-07-04
---

# Phase 155 Plan 04: Grilla admin con clases simultáneas + crear desde el slot Summary

**La grilla del admin ahora muestra N clases simultáneas apiladas en la misma celda (la segunda ya no pisa a la primera), desambigua el detalle/borrado por slot puntual tanto en desktop como en mobile, y permite crear un horario clickeando una celda vacía con sucursal/día/hora prefilleados.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-04T21:10Z
- **Completed:** 2026-07-04T21:16:06Z
- **Tasks:** 1 auto + 1 checkpoint (auto-aprobado)
- **Files modified:** 1

## Accomplishments

- **D-02 (N slots por celda):** `slotMap` migró de `Map<string, WeeklySlotView>` a `Map<string, WeeklySlotView[]>` — en vez de `map.set` que pisaba la segunda clase simultánea, se hace push al array de la key. `getCellSlot` → `getCellSlots(): WeeklySlotView[]`. El render de celda desktop itera el array y apila un chip por clase (activityName / ocupación `bookedCount/maxCapacity` / FERIADO / CANCELADA), con el cupo efectivo que sirve la API.
- **Click por slot puntual:** `onCellClick(time, day, date)` (que re-derivaba un único slot) se reemplazó por `onSlotClick(slot, date)` que recibe el `WeeklySlotView` concreto. En desktop cada chip dispara `@click.stop="onSlotClick(slot, day.date)"`; en mobile `onMobileSlotClick` ahora pasa el slot concreto (viene del `v-for` con `:key="slot.id"`) sin round-trip por (hora, día). Aplica tanto al detalle como al modo delete-selection. **`grep onCellClick(slot.startTime` = 0 matches.**
- **D-03 (click-para-crear):** el click en una celda vacía llama `onEmptyCellClick` que abre `CreateSlotDialog` con `initial = { branchId: selectedBranchId, dayOfWeek, startTime }` (reusa el prop `initial` de 155-03). El botón global "Crear horario" (`openBlankCreateDialog`) limpia el `initial` para abrir sin prefill.
- **UI/CSS:** chips coloreados por ocupación/estado (`slotChipClass`, paleta espejada del `slot-row` mobile); celda vacía con affordance sutil de "+" en hover y cursor pointer (antes `cursor: default`); modo borrado resalta cada chip en vez de la celda entera.
- **Member app (verify-only):** sin cambios de código — `ReservasPage.selectedDaySlots` ya renderiza lista por día y el cupo mostrado (`slot.maxCapacity - slot.bookedCount`) sale del cupo efectivo de la API.

## Task Commits

1. **Task 1: HorariosPage — N slots por celda + click por slot + click-para-crear** - `59bc40c3` (feat)

## Files Created/Modified

- `el-templo-admin/src/pages/HorariosPage.vue` - `slotMap` a `WeeklySlotView[]`; `getCellSlots`/`cellContainerClass`/`slotChipClass`; render apilado de chips; `onSlotClick`/`onEmptyCellClick`/`openCreateDialog`/`openBlankCreateDialog`; `onMobileSlotClick` slot-aware; estado `createSlotInitial` + `:initial` en el dialog; CSS de chips + affordance de celda vacía + resalte de borrado por chip.

## Decisions Made

- **Layout apilado (chips en columna):** más legible que columnas lado a lado con 2-3 clases; cada chip usa `flex: 1 1 auto` para repartir la altura de la celda.
- **Coloreo por chip, no por celda:** `slotChipClass` colorea cada clase por ocupación/estado; el contenedor solo distingue vacía vs con clases (`grid-cell--empty` / `grid-cell--filled`), lo que además simplificó el CSS del modo borrado (resalta `.cell-slot`).
- **Guard de creación:** `onEmptyCellClick` corta si `getCellSlots().length > 0` o si no hay sucursal seleccionada; los chips con `@click.stop` garantizan que el click de crear solo entre en celdas vacías.
- **No bloquear creación en feriados:** el schedule es recurrente y el feriado es por fecha; permitir crear evita una restricción confusa.

## Deviations from Plan

None - plan ejecutado tal cual. El fix del plan-checker (migrar `onMobileSlotClick` al entry point slot-aware, sin `onCellClick(slot.startTime, ...)`) se aplicó como parte de la Task 1.

## Checkpoint (auto-mode)

**Task 2 (`checkpoint:human-verify`) — ⚡ Auto-aprobado (auto mode).** Los siguientes ítems quedan PENDIENTES de verificación visual humana (el orquestador los persiste en el HUMAN-UAT de la fase):

1. Admin → Horarios: crear dos clases de actividades DISTINTAS a la misma hora/sucursal (ej. Musculación 10-11 y Funcional 10-11) → ambas deben aparecer apiladas en la misma celda (ninguna desaparece).
2. Intentar crear una segunda clase de la MISMA actividad solapada → debe rechazarse con mensaje que nombra la actividad.
3. Click en una celda VACÍA → abre "Crear horario" con sucursal/día/hora ya precargados y editables; crear una actividad inline con Cupo (ej. 8).
4. Click en una de las clases apiladas → abre el detalle/borrado de ESA clase (no de la otra simultánea).
5. Tab Actividades: editar una actividad y setear/limpiar el campo Cupo (vacío = hereda la sucursal).
6. Member app → Reservas: en un día con dos clases a la misma hora, deben verse las dos cards; el cupo mostrado refleja el cupo de la actividad (menor al de la sucursal si se configuró).
7. VISTA MOBILE del admin (ancho de teléfono / device toolbar): con dos clases simultáneas en el listado por día, tocar cada una abre el detalle de ESA clase; probar también "Eliminar horario" desde mobile y verificar que selecciona el slot correcto.

## Issues Encountered

None - `pnpm lint` verde (0 errores). Los 9 warnings son pre-existentes en archivos no tocados (BandejaPendientesTab, env.d.ts, CobrosPage, session-pdf-builder). El pre-commit de lint-staged (prettier/eslint --fix) corrió sin cambios de lógica.

## Known Stubs

None - toda la funcionalidad está cableada: el render consume `gridSlots` real de la API, el click abre los dialogs reales (SlotDetail/Delete/Create), y el prefill usa el prop `initial` real de `CreateSlotDialog` (155-03).

## User Setup Required

None.

## Next Phase Readiness

- 155 (Horarios) queda con sus 4 planes ejecutados: schema/migración de cupo (01), API + validación de solape por actividad (02), UI de cupo + prefill/inline en el dialog (03) y grilla con simultaneidad + click-para-crear (04).
- Pendiente: UAT visual de los 7 ítems del checkpoint (admin + member app + mobile).

## Self-Check: PASSED

- `el-templo-admin/src/pages/HorariosPage.vue` presente en disco.
- Commit `59bc40c3` verificado en git log.
- Greps de acceptance: `WeeklySlotView[]` presente, `initial` presente, `onCellClick(slot.startTime` = 0 matches, `onCellClick`/`getCellSlot(`/`cellClass(` = 0 matches (migrados).
- `pnpm lint` verde (0 errores).

---

_Phase: 155-horarios_
_Completed: 2026-07-04_
