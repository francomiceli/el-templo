# Phase 164: Reprogramación y reporte - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning
**Source:** Sesión con Franco (repaso del brief `.docs/sp-auto/brief-fran-automatizacion-sesiones-prueba.md`, punto 5) + mapeos de codebase. Sustituye discuss-phase (corrida autónoma; ver `.planning/AUTONOMOUS-DECISIONS-v5.8.md`).

<domain>
## Phase Boundary

La reprogramación de sesiones de prueba pasa a ser una acción de primera clase en el admin (un paso: cancela el turno viejo + crea el nuevo, transaccional), y el reporte de Sesiones de Prueba expone (a) cuántas veces reprogramó cada lead (derivado de sus bookings de prueba canceladas — retroactivo) y (b) si el estado del lead salió del automatismo o fue pisado a mano (`lead_status_source` de la fase 163), con filtro. NO incluye: teléfono obligatorio ni self-service (fase 165), campañas de recupero (out of scope), vínculo explícito turno viejo→nuevo (`rescheduled_from_id` descartado — la cadena se reconstruye por lead + fechas).

</domain>

<decisions>
## Implementation Decisions

### Acción "Reprogramar" (D-01 a D-03) — LOCKED

- **D-01**: Backend: endpoint admin nuevo de reprogramación en el módulo scheduling (p.ej. `POST /api/admin/scheduling/trials/:bookingId/reschedule` con body `{scheduleId, date, branchId}`), guard `ALL_STAFF_ROLES` como el resto de las rutas de trials. En **una sola transacción DB**: soft-cancel de la booking de prueba vieja (mismo efecto que `adminRemoveBooking`: `status='cancelado'`, `cancelledAt`, waitlist promotion si ocupaba slot) + creación de la booking nueva con las MISMAS validaciones que `bookTrial` (slot existe, fecha válida, sede física, coherencia sede↔schedule). La regla una-prueba-por-vida NO bloquea porque la vieja queda cancelada dentro de la misma transacción.
- **D-02**: El reset de estado de la fase 163 (Perdido → En seguimiento, source `auto`) debe dispararse también en la reprogramación — reusar el mismo código de reset que `bookTrial` (163-03), no duplicarlo.
- **D-03**: Admin UI: botón/acción "Reprogramar" por fila de trial en `SesionesDePruebaDialog.vue` (donde hoy está "quitar"), que abre un picker de fecha+slot (reusar el patrón de selección de slots existente del flujo de agendar trial / `SlotDetailDialog.vue`) y llama al endpoint nuevo. Feedback con notificación Quasar estándar. El flujo viejo (quitar + volver a cargar) sigue existiendo — no se elimina nada.

### Reporte (D-04 a D-06) — LOCKED

- **D-04**: Contador de reprogramaciones por lead en el reporte de Sesiones de Prueba (`ReportsService.getTrialSessionsReport` + export CSV): columna derivada `COUNT` de bookings `is_trial=1 AND status='cancelado'` del member (LEFT JOIN/subquery agregada — cuidado con el patrón de columnas calificadas de Drizzle, ver reference del repo). Retroactivo gratis: las canceladas históricas ya están en la base. Columna CSV nueva "Reprogramaciones" al final de las existentes.
- **D-05**: Indicador auto/manual: exponer `lead_status_source` en las filas del reporte (`leadStatusSource: 'auto'|'manual'|null`; null se muestra como automático/histórico). En la UI (`TrialSessionsReport.vue`): indicador visual discreto (ícono o chip pequeño junto al estado — p.ej. tooltip "Estado puesto a mano" cuando es manual) + columna "Origen estado" en el CSV.
- **D-06**: Filtro por origen del estado en el reporte: query param opcional (`leadStatusSource=auto|manual`) en `GET /api/admin/reports/trial-sessions` (y export), con select en la UI junto a los filtros existentes. Sin filtro = todos.

### Claude's Discretion

- Nombre/forma exacta del endpoint y del schema de validación (seguir `bookTrialSchema`).
- Si el contador de reprogramaciones se calcula con subquery correlacionada o JOIN agregado (elegir lo que rinda y respete el gotcha de Drizzle de columnas sin calificar).
- Detalles visuales del picker y del indicador (seguir componentes/patrones Quasar existentes del admin; sin colores nuevos fuera de la paleta).
- Tests: nombres y estructura, siguiendo los patrones de `test/` de la fase 163 y de scheduling.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Código existente sobre el que se monta

- `el-templo-api/src/modules/scheduling/booking-service.ts` — `adminRemoveBooking` (~753: soft-cancel + waitlist promotion, semántica a REUSAR dentro de la transacción).
- `el-templo-api/src/modules/scheduling/trials-service.ts` — `bookTrial` (~585, validaciones a reusar) + el reset de estado agregado por 163-03.
- `el-templo-api/src/modules/scheduling/routes.ts` — rutas admin de trials (`POST /trials` ~603, guard ALL_STAFF_ROLES ~118-127) y `adminRemoveBookingSchema` (~579).
- `el-templo-api/src/modules/scheduling/schemas.ts` — `bookTrialSchema`, `adminRemoveBookingSchema` (~682).
- `el-templo-api/src/modules/reports/service.ts` — `getTrialSessionsReport` (~1475), `mapTrialSessionRow` (~1495), `exportTrialSessions` (~1624, columnas CSV 1633-1647).
- `el-templo-api/src/modules/reports/routes.ts` — `GET /trial-sessions` (~763) y `/export` (~786), guard CAJA_ROLES plugin-level.
- `el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue` — diálogo operativo de trials del día (acción "quitar" existente).
- `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue` — picker de slots existente (patrón a reusar).
- `el-templo-admin/src/components/reports/TrialSessionsReport.vue` — tabla del reporte con filtros.
- `el-templo-admin/src/composables/useSchedulingApi.ts` y `useReportsApi.ts` — clientes API a extender.
- `.planning/phases/163-m-quina-de-estados-autom-tica-del-lead/163-CONTEXT.md` + SUMMARYs — la fase fundacional (columna source, reset, semántica de "última booking no cancelada").

### Reglas del repo (OBLIGATORIO)

- Memoria/skills: **Drizzle — columnas sin calificar en .select() rompen subqueries correlacionadas** (reference del repo; también en skill el-templo-db-migrations). CI NO typechequea el admin — correr `vue-tsc` local al tocar el frontend.
- Sin migraciones nuevas esperadas en esta fase (todo derivado). Si apareciera una, verificar numeración (0182/0183 tomadas por 163; 0181 por deudas en otra rama).

</canonical_refs>

<specifics>
## Specific Ideas

- El contador cuenta TODAS las bookings de prueba canceladas del lead (self-service canceladas incluidas) — es una proxy de "ruido del lead", no solo de reprogramaciones admin. Documentarlo en el tooltip/header de la columna.
- Tests de integración API: reprogramar mueve la booking en una transacción (vieja cancelada + nueva activa), dispara el reset Perdido→En seguimiento, respeta validaciones de slot; reporte devuelve `reschedules` y `leadStatusSource` correctos y filtra por source.
- `vue-tsc` en el-templo-admin como gate local del frontend (CI no lo cubre).

</specifics>

<deferred>
## Deferred Ideas

- Vínculo explícito `rescheduled_from_id` — descartado en el repaso (schema extra sin consumidor).
- Teléfono en el reporte / acciones de recupero — fase 165 y futuro.

</deferred>

---

*Phase: 164-reprogramaci-n-y-reporte*
*Context gathered: 2026-07-15 (sesión con Franco, corrida autónoma)*
