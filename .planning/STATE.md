---
gsd_state_version: 1.0
milestone: v5.2
milestone_name: Módulo Contable — Libro de Caja
status: executing
stopped_at: Completed 140-01-PLAN.md
last_updated: "2026-06-24T20:47:01.943Z"
last_activity: 2026-06-24
progress:
  total_phases: 13
  completed_phases: 8
  total_plans: 44
  completed_plans: 42
  percent: 62
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-04)

**Core value:** El registro de un pago se carga **una sola vez** en el Administrador (fuente de verdad) y propaga solo: activa la membresía al instante e impacta la caja. Se elimina el triple tipeo (Forms + Contabilium + Admin). El Administrador pasa a ser el **libro de caja** del negocio (efectivo×sucursal + central + banco×moneda), con validación de pagos (PENDIENTE→VALIDADO), movimientos inter-caja y egresos. Se monta sobre el modelo financiero transaccional v4.8 (~60% existe). Backend-heavy, brownfield.
**Current focus:** Phase 140 — Carga única que propaga + cobro suelto + rol profe

## Current Position

Phase: 140 (Carga única que propaga + cobro suelto + rol profe) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-06-24
Next: Phase 140 (carga única del profe) / 141 (reportes/UI). Phase 141 caja history DEBE LEFT JOIN users (filas NULL-member de movimientos/egresos).

## Performance Metrics

**Velocity:**

- Total plans completed: 28 (v4.1)
- Average duration: ~11min
- Total execution time: ~122min

**By Phase:**

| Phase | Plans | Total  | Avg/Plan |
| ----- | ----- | ------ | -------- |
| 58    | 2/2   | ~30min | ~15min   |
| 59    | 4/4   | ~34min | ~9min    |
| 60    | 3/3   | ~52min | ~17min   |
| 97    | 3     | -      | -        |
| 127   | 2     | -      | -        |
| 128   | 3     | -      | -        |
| 129   | 2     | -      | -        |
| 130   | 4     | -      | -        |
| 131   | 3     | -      | -        |

**Recent Trend (from v4.0):**

- Last 5 plans: 63-02 (6min), 63-03 (4min), 63-01 (39min), 61-02 (25min), 61-01 (23min)
- Trend: Stable

_Updated after each plan completion_
| Phase 59 P02 | 4min | 2 tasks | 3 files |
| Phase 59 P03 | 15min | 2 tasks | 2 files |
| Phase 59 P04 | 6min | 2 tasks | 7 files |
| Phase 60 P01 | 25min | 2 tasks | 17 files |
| Phase 60 P02 | 22min | 2 tasks | 11 files |
| Phase 60 P03 | 5min | 2 tasks | 7 files |
| Phase 61 P01 | 23min | 2 tasks | 20 files |
| Phase 61 P02 | 25min | 2 tasks | 17 files |
| Phase 63 P01 | 39min | 2 tasks | 29 files |
| Phase 63 P02 | 6min | 2 tasks | 13 files |
| Phase 63 P03 | 4min | 2 tasks | 4 files |
| Phase 64 P01 | 26min | 2 tasks | 11 files |
| Phase 64 P03 | 47min | 2 tasks | 8 files |
| Phase 65 P01 | 7min | 2 tasks | 7 files |
| Phase 65 P02 | 3min | 2 tasks | 5 files |
| Phase 66 P01 | 11min | 2 tasks | 38 files |
| Phase 66 P02 | 4min | 2 tasks | 8 files |
| Phase 67 P01 | 6min | 2 tasks | 14 files |
| Phase 67 P02 | 9min | 2 tasks | 13 files |
| Phase 68 P01 | 6min | 2 tasks | 8 files |
| Phase 68 P02 | 9min | 2 tasks | 18 files |
| Phase 69 P01 | 13min | 2 tasks | 11 files |
| Phase 69 P02 | 2min | 2 tasks | 3 files |
| Phase 70 P01 | 6min | 2 tasks | 5 files |
| Phase 70 P02 | 4min | 2 tasks | 5 files |
| Phase 71 P02 | 5min | 2 tasks | 8 files |
| Phase 71 P01 | 15min | 2 tasks | 7 files |
| Phase 72 P01 | 4min | 2 tasks | 2 files |
| Phase 73 P01 | 3min | 2 tasks | 2 files |
| Phase 72 P03 | 3min | 2 tasks | 2 files |
| Phase 72 P02 | 5min | 2 tasks | 4 files |
| Phase 73 P02 | 4min | 2 tasks | 5 files |
| Phase 74 P01 | 2min | 2 tasks | 7 files |
| Phase 74 P02 | 2min | 2 tasks | 7 files |
| Phase 75 P01 | 4min | 2 tasks | 3 files |
| Phase 75 P02 | 2min | 2 tasks | 1 files |
| Phase 78 P01 | 13min | 2 tasks | 17 files |
| Phase 78 P02 | 7min | 2 tasks | 13 files |
| Phase 78 P03 | 5min | 1 tasks | 5 files |
| Phase 80 P03 | 2min | 2 tasks | 2 files |
| Phase 80 P01 | 6min | 2 tasks | 7 files |
| Phase 80 P02 | 6min | 2 tasks | 11 files |
| Phase 81 P01 | 14min | 2 tasks | 14 files |
| Phase 81 P02 | 2min | 1 tasks | 3 files |
| Phase 82 P01 | 16min | 2 tasks | 12 files |
| Phase 82 P02 | 4min | 2 tasks | 5 files |
| Phase 82 P03 | 2 | 1 tasks | 2 files |
| Phase 83 P01 | 8min | 2 tasks | 8 files |
| Phase 83 P02 | 4min | 2 tasks | 4 files |
| Phase 83 P04 | 5min | 2 tasks | 7 files |
| Phase 83 P03 | 7min | 2 tasks | 7 files |
| Phase 83 P05 | 16min | 2 tasks | 5 files |
| Phase 84 P02 | 2min | 2 tasks | 6 files |
| Phase 84 P01 | 5min | 2 tasks | 8 files |
| Phase 84 P03 | 4min | 2 tasks | 3 files |
| Phase 84 P04 | 4min | 2 tasks | 4 files |
| Phase 84 P06 | 2min | 2 tasks | 3 files |
| Phase 84 P05 | 3min | 2 tasks | 3 files |
| Phase 84 P07 | 6min | 2 tasks | 7 files |
| Phase 86 P03 | 2min | 2 tasks | 4 files |
| Phase 86 P02 | 2min | 2 tasks | 4 files |
| Phase 86 P01 | 5min | 2 tasks | 7 files |
| Phase 86 P04 | 2min | 2 tasks | 2 files |
| Phase 86 P05 | 6min | 2 tasks | 8 files |
| Phase 86 P06 | 7min | 2 tasks | 3 files |
| Phase 89 P07 | 6min | 2 tasks | 2 files |
| Phase 90 P01 | 12min | 2 tasks | 9 files |
| Phase 90 P03 | 13min | 3 tasks | 8 files |
| Phase 99 P02 | 20 | 2 tasks | 8 files |
| Phase 100 P04 | ~12m | 2 tasks | 7 files |
| Phase 100 P05 | 18m | 1 tasks | 3 files |
| Phase 101 P01 | 1min | 3 tasks | 3 files |
| Phase 101 P03 | 299 | 4 tasks | 4 files |
| Phase 102 P03 | 35m | 2 tasks | 4 files |
| Phase 102 P04 | ~20m | 4 tasks | 5 files |
| Phase 102 P05 | ~15m | 3 tasks | 3 files |
| Phase 103 P01 | ~25m | 2 tasks | 3 files |
| Phase 103 P02 | 30min | 3 tasks | 3 files |
| Phase 103 P03 | 10min | 2 tasks | 3 files |
| Phase 103 P06 | 8min | 3 tasks | 8 files |
| Phase 103 P04 | 30min | 2 tasks | 11 files |
| Phase 103 P07 | 5min | 3 tasks | 3 files |
| Phase 103 P05 | 3 | 2 tasks | 3 files |
| Phase 104 P04 | 23 min | 3 tasks | 6 files |
| Phase 105 P01 | 12min | 3 tasks | 5 files |
| Phase 105 P02 | 7min | 3 tasks | 5 files |
| Phase 105 P03 | 4min | 2 tasks | 4 files |
| Phase 105 P04 | 6min | 2 tasks | 2 files |
| Phase 105 P05 | 10min | 2 tasks | 4 files |
| Phase 105 P06 | 67min | 2 tasks | 13 files |
| Phase Phase 105 PP07 | 5min | 2 tasks tasks | 3 files files |
| Phase 106 P01 | 10min | 3 tasks | 7 files |
| Phase Phase 106 PP02 | 25min | 3 tasks tasks | 5 files files |
| Phase 106 P03 | 50min | 4 tasks | 7 files |
| Phase Phase 106 PP04 | 21min | 3 tasks tasks | 3 files files |
| Phase 106 P05 | 7min | 3 tasks | 9 files |
| Phase 109 P01 | 22min | 2 tasks tasks | 4 files files |
| Phase 109 P02 | 20min | 3 tasks tasks | 5 files files |
| Phase 109 P03 | 50min | 3 tasks tasks | 8 files files |
| Phase 109 P04 | 9min | 3 tasks | 8 files |
| Phase 109 P05 | 10min | 2 tasks | 2 files |
| Phase 110 P02 | 109 | 3 tasks | 1 files |
| Phase 110 P06 | 25m | 3 tasks | 6 files |
| Phase 111 P01 | 5min | 3 tasks | 6 files |
| Phase 111 P02 | 6min | 3 tasks | 6 files |
| Phase 111 P03 | 58min | 3 tasks | 10 files |
| Phase 111 P04 | 21min | 2 tasks | 8 files |
| Phase 112 P01 | 19min | 3 tasks | 6 files |
| Phase 112 P02 | 24min | 3 tasks | 9 files |
| Phase 112 P03 | 30min | 3 tasks | 3 files |
| Phase 112 P04 | 26min | 5 tasks | 8 files |
| Phase 113 P01 | 25min | 3 tasks | 6 files |
| Phase 113 P02 | 7min | 3 tasks | 4 files |
| Phase 114 P03 | 11min | 2 tasks | 2 files |
| Phase 114 P04 | 12min | 3 tasks | 6 files |
| Phase 116 P01 | 3min | 3 tasks | 6 files |
| Phase 116 P02 | 3min | 3 tasks | 1 files |
| Phase 116 P03 | 5min | 3 tasks | 6 files |
| Phase 116 P04 | 3min | 2 tasks | 3 files |
| Phase 116 P05 | 16min | 2 tasks | 2 files |
| Phase 117 P01 | 75min | 2 tasks | 7 files |
| Phase 117 P03 | ~30min | 2 tasks | 5 files |
| Phase 117 P04 | ~20min | 2 tasks | 5 files |
| Phase 117 P05 | 25min | 2 tasks | 4 files |
| Phase 117 P06 | ~40min | 3 tasks | 14 files |
| Phase 118 P01 | 25min | 2 tasks | 3 files |
| Phase 118 P02 | 18min | 2 tasks | 5 files |
| Phase 118 P05 | ~10min | 2 tasks | 2 files |
| Phase 118 P03 | ~12min | 2 tasks | 5 files |
| Phase 118 P04 | 5min | 2 tasks | 5 files |
| Phase 119 P01 | ~14min | 3 tasks | 16 files |
| Phase 119 P02 | 12 | 2 tasks | 8 files |
| Phase 119 P03 | ~22min | 2 tasks | 6 files |
| Phase 119 P04 | ~9min | 3 tasks | 12 files |
| Phase 119 P06 | ~12min | 2 tasks | 6 files |
| Phase 120 P01 | 2min | 3 tasks | 3 files |
| Phase 120 P02 | ~6min | 3 tasks | 3 files |
| Phase 120 P03 | ~3min | 3 tasks | 3 files |
| Phase 120 P04 | 6min | 3 tasks | 5 files |
| Phase 121 P01 | 5min | 3 tasks | 3 files |
| Phase 121 P02 | 6min | 3 tasks | 5 files |
| Phase 121 P03 | 4min | 3 tasks | 5 files |
| Phase 122 P01 | 7min | 2 tasks | 3 files |
| Phase 122 P02 | 18min | 2 tasks | 4 files |
| Phase 122 P03 | ~9min | 1 tasks | 1 files |
| Phase 123 P01 | 12min | 3 tasks | 5 files |
| Phase 123 P02 | 7 | 3 tasks | 5 files |
| Phase 123 P03 | ~5min | 3 tasks | 5 files |
| Phase 124 P01 | 6min | 2 tasks | 4 files |
| Phase 124 P02 | 12min | 2 tasks | 2 files |
| Phase 125 P02 | ~25min | 2 tasks | 4 files |
| Phase 125 P03 | 30min | 2 tasks | 5 files |
| Phase 126 P01 | 2min | 2 tasks | 3 files |
| Phase 126 P02 | 6min | 2 tasks | 2 files |
| Phase 126 P03 | 5min | 2 tasks | 2 files |
| Phase 127 P01 | 22min | 3 tasks | 8 files |
| Phase 127 P02 | ~25min | 2 tasks | 7 files |
| Phase 128 P01 | 6min | 2 tasks | 2 files |
| Phase 128 P02 | ~12min | 2 tasks | 7 files |
| Phase 128 P03 | ~15min | 2 tasks | 5 files |
| Phase 129 P01 | ~35min | 2 tasks | 18 files |
| Phase 129 P02 | ~25min | 2 tasks | 7 files |
| Phase 130 P03 | ~2min | 2 tasks | 3 files |
| Phase 130 P04 | ~10min | 1 task | 1 file |
| Phase 131 P02 | ~35m | 2 tasks | 17 files |
| Phase 132 P01 | ~25min | 2 tasks | 11 files |
| Phase 132 P02 | 20min | 2 tasks | 5 files |
| Phase 132 P3 | 12 | 2 tasks | 2 files |
| Phase 132 P04 | ~2min | 2 tasks | 2 files |
| Phase 132 P5 | ~8min | 2 tasks | 2 files |
| Phase 132 P06 | 15min | 3 tasks | 4 files |
| Phase 133 P01 | 7min | 2 tasks tasks | 5 files files |
| Phase 133 P02 | 6min | 2 tasks | 7 files |
| Phase 133 P03 | 20min | 3 tasks | 6 files |
| Phase 133 P04 | ~32min | 2 tasks | 9 files |
| Phase 133 P05 | 19min | 3 tasks | 5 files |
| Phase 133 P06 | 22min | 3 tasks | 4 files |
| Phase 133 P07 | ~8min | 2 tasks | 4 files |
| Phase 134 P01 | ~14min | 3 tasks | 3 files |
| Phase 134 P03 | 10min | 1 tasks | 1 files |
| Phase 134 P02 | ~3min | 2 tasks | 4 files |
| Phase 135 P01 | 5min | 3 tasks | 2 files |
| Phase 135 P03 | ~8min | 3 tasks | 3 files |
| Phase 135 P04 | ~12min | 2 tasks | 4 files |
| Phase 143 P01 | 5min | 2 tasks | 4 files |
| Phase 143 P02 | ~7min | 2 tasks | 7 files |
| Phase 143 P03 | ~8min | 2 tasks | 2 files |
| Phase 143 P05 | ~6min | 2 tasks | 3 files |
| Phase 137 P01 | ~12min | 3 tasks | 6 files |
| Phase 137 P02 | ~40min | 3 tasks | 6 files |
| Phase 137 P03 | ~18min | 3 tasks | 9 files |
| Phase 138 P01 | 10min | 3 tasks | 5 files |
| Phase 138 P138-02 | ~75min | 3 tasks | 13 files |
| Phase 138 P138-03 | ~30min | 2 tasks | 3 files |
| Phase 139 P139-01 | 13min | 3 tasks | 9 files |
| Phase 139 P139-02 | 4min | 2 tasks | 2 files |
| Phase 139 P139-03 | 7min | 3 tasks | 6 files |
| Phase 140 P140-01 | ~9min | 3 tasks | 7 files |
| Phase 140 P02 | 6min | 3 tasks | 6 files |

## Accumulated Context

### Roadmap Evolution

- Phase 144 added (standalone app/api/admin, numerada después de 143, NO depende de ella ni del Módulo Contable v5.2): Notificaciones y bloqueo de vencimiento de membresía/plan — 3 entregables: (1) notificación push de vencimiento de plan ~7d antes, réplica del cron "Program Renewal Warning" pero sobre `subscriptions.end_date` + nuevo template `plan_renewal_warning` en `notifications/types.ts`; (2) pop-up in-app a 7 y 3 días del vencimiento con botón a WhatsApp (`buildWhatsAppUrl`); (3) bloqueo de reserva cuando `booking_date > subscription.end_date` en `booking-service.ts reserve()` (hoy ese check NO existe — bug latente) + pop-up en `ReservasPage.vue` con botón a WhatsApp. Reutiliza `pending_notifications`+FCM+`notification-cron` y `el-templo-app/src/utils/whatsapp.ts`. Decisiones abiertas (categoría entrenamiento vs programas, copy 7 vs 3d, anti-repetición del pop-up, salteable vs bloqueante, planes sin end_date, alcance presencial vs online) → discuss-phase. (PLAN-NOTIF, PLAN-POPUP, BOOK-BLOCK)
- Phase 143 added (standalone app/admin, numerada después de v5.2 Módulo Contable 137-142, NO depende de ella): Profesor por clase + Puntuación post clase presencial — construir la cadena profe↔clase inexistente (asignación owner profe↔sucursal en Horarios, profe se marca como dictante escaneando el QR de la instancia validado contra su sucursal, app muestra el profe) + rating del profesor estilo Uber vía pop-up al volver a la app tras una clase presencial. Solo presencial; puntúa al profesor (no RPE). Reutiliza role `coach`+`user_branches`. Brief: `BRIEF-PUNTUACION-PROFES.md`. Decisiones abiertas (escala, salteable, co-dictado, fallback sin scan, reporte owner) → discuss-phase.
- Phase 137 added (nueva milestone v5.2 Módulo Contable): Máquina de estados de validación — CIMIENTO. `validation_status` (pendiente/observado/corregido/validado) ORTOGONAL al soft-void existente (ANULADO); el filtro canónico de "dinero firme" pasa a `validation_status='validado' AND voided_at IS NULL`, sin romper las 6 métricas v5.0 (migración DEFAULT 'validado' + backfill + auditar call sites). Profe→PENDIENTE / admin→VALIDADO; corregir=anular+recrear; membresía se activa al instante. Bloquea 138-142. (VAL-01..07)
- Phase 138 added: Entidad caja + saldos — tabla `cash_registers` (efectivo×sucursal + central + banco×moneda, `currency` fija) + `cash_register_id` en el ledger (≠ branchId) + saldo firme derivado (solo VALIDADOS, pendientes aparte) + aislamiento de moneda. (CAJA-01..04)
- Phase 139 added: Movimientos inter-caja y egresos — movimiento=una fila (origen+destino, neto 0) con esperado-vs-contado; egreso=destino NULL + nota libre (sin categoría); ambos void ortogonal; no contaminan `balances`; `cash_transfer`/`expense` en KINDS_ALLOWED_WITHOUT_LINKS. (MOV-01..04)
- Phase 140 added: Carga única que propaga + cobro suelto + rol profe (CORAZÓN) — extender `recordAssignmentCharge` (cashRegisterId + validationStatus por rol), UI dead-simple idempotente, cobro suelto sin membresía, rol profe acotado (carga PENDIENTE, no valida/anula/ve saldos). (CARGA-01..04)
- Phase 141 added: Reportes para la admin — bandeja de pendientes por antigüedad (+ observados + alerta configurable), saldo firme/pendiente por caja, historial de movimientos/egresos, reusando export Excel/PDF existente. (REP-01..04)
- Phase 142 added: Config + transición Contabilium — perillas de config (política de validación; activación instantánea/diferida) con casa definida (`finance_settings` tras borrado del subsistema en 136-07) + regla documentada de "qué dato manda" en la convivencia con Contabilium (corte limpio + asientos de apertura). (MIG-01, MIG-02)
- Phase 133 added: Calidad del árbol — hitos canónicos + variantes (milestone_exercise_id), bandas de dificultad con kairos, sub-grupos por category fina, prereqs cross-ruta (R1-R4 de tree-quality-research.md; decisiones cerradas 2026-06-07)
- Phase 134 added: Árbol del miembro — estados de nodo Bloqueado/Disponible/Dominado + criterio de avance objetivo 3×8/3×30s en player (R5-R6)
- Phase 135 added: Árbol del admin — jerarquía visual de hitos/variantes en /tree-map (auto-poblar milestone_exercise_id con la heurística de 133 + render hito colapsable con variantes; hoy Front Lever se ve plano porque los hitos nunca se poblaron)
- Phase 70 added: Personalizadas Cycle Config — configurable cycle length per plan, progress bars in member app
- Phase 86 added: QR Promo — Free Month Campaign
- Phase 88 (was 89): Gender-Based Notification Personalization — gender inference, registration field, gendered notification copy
- Phase 88 (old): Reservation Rules — Per-Plan Booking Configuration — removed from v4.4
- Phase 98 added: Multi-currency and country-scoped plans — AR/ES plan segregation with EUR pricing, owner country toggle, branch-scoped filtering
- Phase 100 added: Games format, exercise route overhaul, and session editor route UX — coach-driven session authoring changes (new format, INITIUM block titles, new games route, Spanish route renaming)
- Phase 101 added: Debt tracking — flag members with outstanding debt via new `debts` table (one active per user, soft-cancel for history), admin AlumnosPage filter + total debt banner grouped by currency, MemberFormDialog deudor toggle + amount + note; intentionally not integrated with payments table in this phase
- Phase 102 added: Trial Classes (Sesiones de Prueba) — admins register potential members for a single free trial via SlotDetailDialog; `bookings.is_trial` excludes trials from capacity; one-trial-per-phone guard; "Clases de prueba" counter on alumno detail; Leads filter inferred from booking history (no `users.status` column — Option B); conversion to member reuses existing edit + Gestionar Plan flows
- Phase 104 added: Planes vs Programas + Bundle "Todos los Programas" — separar conceptualmente plan presencial de programa virtual; nueva columna `subscription_plans.grants_all_programs` para el bundle; nueva columna `users.current_program_enrollment_id` para programa activo cuando hay múltiples enrollments; gating de `/sessions/*` por tipo de dayId (presencial vs enrollment); selector de programa en weekly view del member app; reemplazo de gating frágil de ReservasPage por `hasPresencialPlan`; seed del nuevo plan bundle ($20.000 ARS, 30 días)
- Phase 110 added: Admin users por país + multi-sede staff — admin/gestion/owner alcance por país (`users.country`), coach/recepción multi-sede (`user_branches`), `branch_id` NOT NULL como sede personal, staff multisucursal por rol en app de miembros, Templo Online global, owner bypass; extiende `country-scope.ts` para usar `users.country` directamente y agregar branchIds para coach/recepción
- Phase 114 added: Reporte tabular de sesiones de prueba — reemplaza el CSV manual de Google Sheets por reporte filtrable en módulo Reportes del admin (11 columnas: Lead, Fecha, Hora, Sucursal, Asistió, Estado del Lead, Gestiona, Comentarios, Turno, Periodo, Semana); nuevos campos `users.lead_status` (enum), `users.lead_notes` (TEXT), `bookings.created_by` (FK); hooks de subscription para auto-cerrar lead + prefijar plan en comentarios; descarta Rep./Asistió post rep./Asistencia Final/Profe1/Profe2 del CSV original
- Phase 116 added: Refresh tokens auth — reemplaza JWT único de 7d por access (30m) + refresh token (30d sliding) con rotación obligatoria y reuse detection; nueva tabla `refresh_tokens` (hash, expires_at, revoked_at); endpoints `/auth/refresh` y `/auth/logout` reales; interceptor de axios en app+admin con lock compartido para evitar refresh storms; API backwards-compatible (devuelve `{ token, accessToken, refreshToken }`) para no romper apps viejas en Play Store. Origen: bug recurrente de logout cada 7d en app de miembros. SPEC creado originalmente como Phase 115 (commit huérfano 8be596bf), renumerado a 116 porque 115 quedó asignado a "Evento Desafío de la Barra"
- Phase 117 added: Analytics — correcciones de exactitud + métrica de miembros únicos. Corrige 4 bugs descubiertos analizando prod (2026-05-26): KPI de activos lee `users.status` obsoleto (~48 fantasmas, sin cron), no-show rate usa enum inexistente `'confirmed'` (→ siempre 100%/0), revenue suma ARS+EUR en vista owner, trend de activos circular mezcla freemium/prueba. Arquitectura: centralizar la definición de "activo" (hoy triplicada en recomputeUserStatus/analytics/reports), filtrar `is_archived` en plan distribution, split del service de 1112 LOC (facade) + `applyScope`. Feature: miembros únicos últimos 7/14/30 días en tab Asistencias. Detalle completo con refs archivo:línea en FINDINGS.md del directorio de la fase
- Phase 132 added (nueva milestone v5.2): UI de Métricas de Gestión — exponer en el admin las 6 métricas de gestión de v5.0 (ticket promedio, churn de no-renovación, tasa de renovación, LTV, frecuencia de asistencia, funnel de sesiones) que hoy existen solo en backend (endpoints `/admin/analytics/{ticket,churn,renewal,ltv,frequency,trial-funnel}`), cableando `useAnalyticsApi.ts` + tipos + tabs nuevos en `AnaliticasPage.vue`, y eliminando físicamente las métricas viejas/ARPU deprecadas. Frontend-only, sin migraciones. Milestone separada para no mezclar con el Nuevo Sistema de Entrenamiento (v5.1, en curso)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Merge admin apps: Net features rebuilt in Vue/Quasar within existing el-templo-admin
- Modular monolith: formalize src/modules/ pattern with explicit boundaries
- Constructor DI pattern for services (established in Phase 56)
- Resend over nodemailer for EmailService (Phase 57)
- Plan-first admin member creation with auto-subscription (Phase 57)
- Production seed uses CONFIRM_PRODUCTION_SEED=yes safety gate (Phase 58)
- Nullable column extension pattern for backward-compatible schema changes (Phase 59)
- [Phase 59]: documentType required in create mode only, optional in edit mode for backward compatibility
- [Phase 59]: CSV import script uses static imports for drizzle-orm to avoid dynamic import type mismatches
- [Phase 59]: 84 unique legacy plan names found, all created as archived subscription_plans on import
- [Phase 59]: Bulk migration sets pricePaid=0 for legacy-to-current plan migrations (admin adjusts later)
- [Phase 60]: system_settings key-value table for global config (grace period, future settings)
- [Phase 60]: Budget pre-calculated at subscription creation: ceil(durationDays/7) \* classesPerWeek
- [Phase 60]: fixedDays stored as JSON array on subscription record for per-subscription flexibility
- [Phase 60]: DAY_LABELS shared constant in subscription types for UI day display
- [Phase 60]: Conditional stepper step pattern using computed confirmStep for dynamic step count
- [Phase 60]: Grace period intercept bypasses auto-expire; getSubscriptionWithGracePeriod queries raw status
- [Phase 60]: SettingsService optional on SubscriptionService for backward-compatible grace-period-aware auto-expire
- [Phase 60]: Force check-in decrements budget to maintain accuracy despite bypassing all other checks
- [Phase 61]: Grace period fully removed -- expired subscription = immediate hard block
- [Phase 61]: QR scan immediately creates "confirmado" status and awards 10 AURA (no two-step model)
- [Phase 61]: subscription_schedules junction table for fixed-plan schedule slot references (replaces fixedDays JSON)
- [Phase 61]: SettingsService kept as empty shell for future settings extensibility
- [Phase 61]: Setter DI pattern (setBookingService) for SubscriptionService<->BookingService circular dependency
- [Phase 61]: Coach check-in from slot always allows action but returns subscription warnings
- [Phase 61]: Attendance undo uses AURA spend for reversal (graceful if insufficient balance)
- [Phase 63]: Subscription renewal extends existing record (same ID) rather than creating new subscription
- [Phase 63]: Auto-payment recording on assign/change/renew via PaymentService DI in SubscriptionService
- [Phase 63]: Morosos/balance/overdue concept fully removed from payments, members, analytics, attendance, booking
- [Phase 63]: Renewal end date preview computed client-side from subscription duration; actual calculation server-side
- [Phase 63]: Payment method selector pattern: QSelect with PAYMENT_METHOD_OPTIONS, emit-value, map-options
- [Phase 63]: Recepcionista added to AdminRole type for caja route access
- [Phase 63]: Morosos/overdue UI fully removed from sidebar, AlumnosPage, AlumnoDetailPage
- [Phase 64]: Reused blog image presigned URL pattern for member photos (PutObjectCommand + getSignedUrl)
- [Phase 64]: [Phase 64]: exceljs for server-side Excel export with styled headers; drizzle-kit push replaces raw SQL migration parsing in test setup
- [Phase 64]: Proration credit uses pricePaid (actual amount paid) not priceRegular; applied via priceOverrideAmount to reuse assignPlan logic
- [Phase 64]: Preview endpoint pattern: GET /change-plan-preview returns mutation preview before POST confirmation
- [Phase 65]: Raw SQL for charge history recorder self-join (drizzle lacks multi-alias on same table)
- [Phase 65]: Export methods reuse query methods with high limit for DRY
- [Phase 65]: Paginated report pattern: PaginatedResult<T> with rows/total/page/limit
- [Phase 65]: Single-file ReportesPage with inline tabs for data table simplicity; per-tab independent date ranges
- [Phase 66]: Centralized role permission registry in shared/permissions.ts; all modules import role groups, never define local arrays
- [Phase 66]: Owner replaces superadmin throughout API; four-role hierarchy: owner > admin > coach = recepcionista (parallel)
- [Phase 66]: Cast pattern (ROLES as readonly string[]).includes() for const array TypeScript compatibility
- [Phase 66]: Permission-aware sidebar with isCoachRole/isAdminRole/isCajaRole/isOwnerRole computed props
- [Phase 66]: Role-based route redirect: recepcionista -> /alumnos, all others -> /sessions
- [Phase 67]: DayId prefix changed from J- to P- for personalizada sessions
- [Phase 67]: API response keys renamed: journey -> personalizada, journeys -> personalizadas
- [Phase 67]: Spanish error messages updated to use personalizada terminology
- [Phase 68]: BlockProgressionView props updated to match current interface in PersonalizadaSession.vue
- [Phase 69]: checkSubscription queries active/paused subscriptions joined to plans where isPersonalizada=true
- [Phase 69]: AURA award failure on personalizada completion is logged but does not fail the completion (graceful degradation)
- [Phase 69]: Used q-tooltip on toggle instead of hint prop for cleaner UI
- [Phase 70]: cycleWeeks derived from ceil(durationDays/7) -- no new DB column, all data from existing tables
- [Phase 70]: Change button hidden when wrap-up card shows (wrap-up has own CTA); fetchPersonalizadaData awaited to set default tab
- [Phase 71]: Removed selectPersonalizada from store and API composable since only deleted pages used it
- [Phase 71]: PersonalizadasService instantiated in SubscriptionService constructor (no circular dependency)
- [Phase 72]: Secondary plan query pattern in member-routes handler for plan-level fields, avoiding shared SubscriptionDetail type modification
- [Phase 73]: No new types needed -- member plan response shape derived inline with field filtering
- [Phase 72]: Three-mode Mi Camino layout: unified personalizada view (no tabs), archived tabs with renewal banner, and unchanged regular member view
- [Phase 72]: Context-aware /training page branches on hasActivePersonalizada/hasActiveSubscription; post-session flows unified to /mi-camino
- [Phase 73]: Inline MemberPlan interface in PlanesPage -- no shared type for single-use response shape
- [Phase 74]: Capacitor v8 requires Node >=22; used nvm to switch during cap sync/doctor
- [Phase 74]: minSdkVersion raised from 23 to 24 per Capacitor 8 requirements; versionName set to 1.0.0
- [Phase 74]: Production-only ProGuard via androidComponents API (staging unminified for readable stack traces)
- [Phase 74]: Cleartext traffic controlled via flavor manifest overlays (staging enables, production disables)
- [Phase 75]: Variant-scoped signing via applicationVariants.configureEach (not buildTypes.release conditional) to ensure only productionRelease gets signing
- [Phase 75]: Key alias hardcoded as 'upload' in build.gradle (not secret, not configurable) for simplicity
- [Phase 75]: Master branch guard as explicit shell check (not branch filter) so workflow_dispatch from non-master fails with clear error
- [Phase 78]: onboarding_completion added to both aura_transactions and aura_config source type enums for consistency
- [Phase 78]: GET /onboarding/profile returns 204 No Content (not 404) for not-yet-completed onboarding
- [Phase 78]: AURA award failure gracefully degraded on onboarding -- profile creation succeeds regardless
- [Phase 78]: Onboarding route registered as top-level (not under layout) for full-screen quiz without bottom tabs
- [Phase 78]: Router guard checks role===member before redirecting to onboarding; coaches/admins/owners skip onboarding
- [Phase 78]: Added OnboardingProfileSummary type to admin MemberProfile for TypeScript safety (plan said dynamic access, CLAUDE.md no-any rule requires proper typing)
- [Phase 80]: RPE contextual message uses hasInteracted ref + watcher pattern in SessionSummary for clean component boundary
- [Phase 80]: TIMESTAMPDIFF for weekly summary duration calculation; MemberSegment type duplicated in member app (same as admin pattern)
- [Phase 80]: useRouter() import instead of template $router for vue-tsc type safety in card components
- [Phase 80]: Segment-driven card ordering via computed CardId array with template v-for for dynamic reordering
- [Phase 81]: Created member_profiles table from scratch (Phase 78 reverted) with streak columns; future phases add onboarding/segmentation columns
- [Phase 81]: StreakService owns milestone config reading (not SettingsService) to avoid cross-module dependency
- [Phase 81]: Used $primary (terracotta) for StreakRow background tint, $accent (charcoal) for text — matches brand palette
- [Phase 82]: Drizzle wraps MySQL errors in err.cause -- duplicate key detection must check cause.code/cause.sqlMessage
- [Phase 82]: Body area forced to null for soreness='ninguna' regardless of client input
- [Phase 82]: Check-in row placed between welcome header and GeneralContent (adapted from plan due to missing StreakRow/card-loop)
- [Phase 82]: Check-in feedback loop: advisory messages above subtitle with priority order energy > soreness > sleep (D-10)
- [Phase 83]: Polymorphic content blocks via single table with block_type enum and nullable type-specific columns
- [Phase 83]: Program enrollment tracks sessions_completed_this_week as counter with week_unlocked_at timestamp for session-gated weekly unlocks
- [Phase 83]: Per-route auth instead of onRequest hook for mixed ADMIN_ROLES/COACH_ROLES permissions within programs plugin
- [Phase 83]: hasActivePersonalizada migrated from subscription.isPersonalizada to hasActiveProgramEnrollment ref (per D-08)
- [Phase 83]: WeeklySummaryCard gated to program-enrolled members only (per D-15)
- [Phase 83]: Vertical QStepper wizard for multi-step program creation; payment confirmation checkbox as hard gate on enrollment per D-39; program analytics on AnaliticasPage per D-40
- [Phase 83]: Calendar-week gating: nextWeekStartDate = enrolledAt + (currentWeek \* 7 days), compared against current date for dual-condition advancement
- [Phase 83]: AURA program bonuses use independent try/catch blocks -- weekly and completion awards fail independently with graceful degradation
- [Phase 84]: Logger error() second arg must be LogData object not plain string; boot order: push-notifications after modules in quasar.config.js
- [Phase 84]: FcmMessaging interface + dynamic import for compile-time safety without firebase-admin dependency
- [Phase 84]: Queue-based notification delivery: all notifications flow through pending_notifications table with 15-min cron polling
- [Phase 84]: Inline JSON schemas in notification routes.ts for module self-containment; MemberSegment type cast for drizzle enum inArray queries
- [Phase 84]: Direct calculateSegment() call in batch cron bypasses 1-hour cooldown; program renewal warning in daily batch cron
- [Phase 84]: Logger error() uses LogData object as second arg per Phase 84 convention
- [Phase 84]: DRY_RUN=true in test file and CI env for FCM mocking; FIREBASE_SERVICE_ACCOUNT_BASE64 in .env.production for production FCM sends
- [Phase 86]: Reservas tab always visible for all users; online users see empty state instead of booking grid
- [Phase 86]: 302 (temporary) redirects for promo QR URLs since campaigns are time-limited
- [Phase 86]: QR codes encode eltemplo.org redirect URLs (not final destination) for future-proof redirect changes
- [Phase 86]: AssignPlan called with branchId from user's resolved branch (ONLINE) and paymentMethod='cash' since pricePaid=0 skips payment recording
- [Phase 86]: Manual migration SQL instead of drizzle-kit generate to avoid interactive prompts in non-interactive execution
- [Phase 86]: Used underscore prefix (\_promoApplied) for unused destructured response field to avoid lint warnings
- [Phase 86]: Promo routes registered inside existing subscriptionRoutes plugin, sharing the SUBSCRIPTION_ROLES auth guard hook
- [Phase 86]: promoPlans deletion placed in Layer 3 of cleanAllTestData before subscriptionPlans for FK ordering
- [Phase 89]: Ladder prescriber divides by LADDER_ROUNDS=5 for per-round reps (production: 25 edits, -15.1 avg delta)
- [Phase 89]: Pyramid gets dedicated prescriber with PYRAMID_VOLUME_FACTOR=2 (production: 10 edits, -28.5 avg delta)
- [Phase 89]: Multi-round format audit: all 16 prescribers checked, only Ladder+Pyramid needed fixing
- [Phase 90]: Manual migration SQL (0068) for avatar profiling schema — consistent with Phase 86 precedent to avoid interactive drizzle-kit prompts
- [Phase 90]: V2 onboarding service method alongside V1 for backward compatibility; old columns nullable, new columns nullable
- [Phase 90]: Server-side gender read from users table in /complete handler — never trust client-provided gender for avatar resolution (T-90-02)
- [Phase 90]: avatarType filter uses NOT EXISTS subquery for 'none' to catch both missing profiles and null avatar_type
- 100-04: Admin route-labels dictionary duplicated byte-for-byte from member-app copy; D-01 preserved (admin exercises + sessions lists unchanged)
- Phase 100-05: PDF pipeline consumes Spanish route labels via pre-resolved PdfLevelBlock.routeLabel field; customTitle flows through PdfBlockPage with byte-identical null fallback
- Phase 101-01: debts table migration renumbered from 0094 to 0096 because Phase 100 claimed 0094/0095
- Phase 101-01: one-active-debt-per-user invariant enforced at service layer (MySQL lacks partial unique indexes); idx_debts_user_active composite index backs the service lookup
- Phase 101-01: FK fk_debts_user_id has no ON DELETE/UPDATE — users are soft-deleted via users.deleted_at so no cascade needed
- Plan 102-03: EXISTS subquery for hasUsedTrial (no new index); reused isActiveSubquery pattern for leads filter.
- Plan 102-05: Trial counter placed in header q-card-section (NOT SubscriptionCard) so it renders for sub-less leads; `Tipo` filter label chosen to avoid clashing with existing `Estado` (Activo/Inactivo) label; filters.status default = null so axios serializer omits the key, matching level/segment/avatarType convention.
- Plan 103-01: Single atomic SQL migration (0100) adds users.status ENUM(freemium/prueba/activo/inactivo) DEFAULT NULL + users.staff_disabled, drops users.is_active and idx_users_is_active, swaps in idx_users_status; backfill is 6 sequential UPDATEs guarded by `WHERE status IS NULL` (idempotent). Hand-written SQL (not drizzle-kit generate) because the runner cannot produce backfill UPDATEs. CRITICAL: SQL comments must not contain inline `;` because run-migrations.ts splits on `;` BEFORE stripping `--` comments.
- Plan 103-03: Per-endpoint explicit status at /register (freemium) and /api/admin/trials (prueba). Folded the leftover trials-service.ts isActive: true into the same edit (Rule 3). Test file uses real clock — vi.useFakeTimers desyncs from MySQL CURDATE() in Plan 02 recomputeUserStatus.
- Plan 103-06: PATCH /api/admin/users/:id/status payload renamed isActive→disabled with additionalProperties:false rejecting legacy shape (T-103-09 mitigated end-to-end); UserService.toggleDisabled is an explicit-value setter (no server-side toggle) so concurrent admin clicks converge instead of fighting; createStaff insert path explicitly writes status:null (BLOCKER 1 fix per CONTEXT D-12); admin-app UsuariosPage UX wording preserved while underlying boolean flips from isActive to staffDisabled
- Plan 103-04: Members API contract migration — drop derived isActiveSubquery (3 sites in service.ts) and project users.status directly; createMember insert is single-owner (status='prueba' as const, BLOCKER 3); analytics countActiveMembers + SlotAttendancePanel hidden refs migrated; legacy ?status=leads/alumnos returns 400 (no shim); admin types/SlotAttendancePanel migrated in lockstep; AlumnosPage/AlumnoDetailPage explicitly deferred to Plan 05.
- Plan 103-07: New staff_disabled login gate at POST /login closes pre-existing security loophole — non-member roles with staff_disabled=true are now rejected with 401 Cuenta desactivada (was previously enforced only at the column level, never at runtime). staffDisabled is projected ONLY in /login SELECT (sole consumer); /me deliberately omits it to keep auth response surface minimal. Phase 103 R3 grep gate satisfied: only 2 doc-comment matches remain (analytics/users service.ts), no runtime users.isActive references.
- Plan 103-05: Shared useStatusBadge composable (named exports getColor/getLabel) reused by both AlumnosPage row chip and AlumnoDetailPage header chip; trial counter v-if uses status !== 'activo' to preserve original semantic (visible for freemium/prueba/inactivo, hidden for activo); no shim — single status param replaces dual isActive+leadsOnly logic at all 4 API call sites.
- Plan 105-01: financial_transactions enums declared inline via mysqlEnum (D-05); TS literals derived via $inferSelect downstream; circular schema imports between financial-transactions.ts and transaction-links.ts work via Drizzle thunks
- Plan 105-01: transaction_links.target_id has no DB-level FK; service layer enforces heterogeneous integrity by target_kind per SPEC §7. balances.amount is signed int (negatives allowed for saldo a favor per D-08)
- Plan 105-01: Migration 0106 ordering CREATE×3 then DROP×2 protects against partial-failure data loss; MySQL \_migrations table column is name not filename so verification SQL must use WHERE name=…
- Plan 105-02: Sign convention LOCKED — balances.amount > 0 = miembro debe; = 0 = saldado; < 0 = saldo a favor (D-08). Inflow REDUCES outstanding; outflow INCREASES; sign multiplier (+1/-1) handles create/void in one code path.
- Plan 105-02: Lazy seed from subscriptions.pricePaid is two-step (SELECT existing → INSERT-with-seed OR UPDATE delta) inside db.transaction, NOT a single ON DUPLICATE KEY UPDATE. The seed value depends on a per-target lookup which a single upsert cannot express.
- Plan 105-02: TXN-05 immutability enforced by TS surface — TransactionService deliberately exposes no update() method. Test K probes via cast: (txService as Record<string, unknown>).update is undefined.
- Plan 105-02: Tests seed subscriptions directly via Drizzle insert (not the /assign API) because /assign still calls paymentService.recordPayment against the dropped payments table — that path is repaired by Plan 03.
- Plan 105-03: Renew callsite (RenewSubscriptionInput has no branchId) resolves branchId via users.branchId lookup with fallback to 'Templo Online' virtual branch — throws if neither resolves; SPEC §1 NOT NULL invariant maintained
- Plan 105-03: All 4 transactionService.create callsites pass amount===allocatedAmount (preserves legacy full-payment assumption); transactionDate===effectiveDate (legacy paymentDate semantics)
- Plan 105-03: SubscriptionService takes transactionService?: TransactionService via 4th positional constructor arg; type-only import at consumer, concrete-class import at 3 DI sites (auth/routes, subscriptions/routes, auto-resume-pauses)
- Plan 105-04: D-01 canonical revenue filter (kind IN ('plan_charge','debt_settlement') AND direction='inflow' AND voided_at IS NULL) applied across 4 analytics methods + 4 reports query blocks; getRevenueByBranch dropped users join (branch_id is first-class on financial_transactions); paymentDate alias preserved (sourced from ft.transaction_date) so frontend ChargeReportRow consumers stay unchanged
- Plan 105-04: getChargeHistory queries (Drizzle count + raw SQL row fetch) join through transaction_links pivot (target_kind='subscription') because financial_transactions has no direct subscription_id; 4-table → 5-table chain preserves response semantics
- Plan 105-04: getRevenueByMethod tightened payment-method type guard from 'as' cast to literal-union check (T-105-17 defense-in-depth — kind/direction filter already excludes aura_credit/internal but the cast would silently misroute leakage)
- Plan 105-05: MemberListItem.debt field DELETED (not renamed) — Plan 07 admin frontend must drop AlumnosPage Deuda column + MemberFormDialog Deuda section. TotalDebtRow[] banner contract preserved with new 'outstanding balance' semantics from balances cache.
- Plan 105-05: PATCH /api/admin/members/:userId hardened with Fastify additionalProperties:false (NOT Zod .strict()) — module convention is Fastify schemas; legacy clients posting isDebtor/debtAmount/debtCurrency/debtNote/debt get HTTP 400 (T-105-18 mitigation).
- Plan 105-06: pure-deletion plan with regex-based grep gate; usePaymentsApi.ts admin composable deferred to Plan 07 because CajaPage.vue still consumes it; subscriptions/types.ts inline import('../payments/types').PaymentMethod replaced with top-level import from '../finance/types' (Rule 3 fix); 7 test files migrated from PaymentService DI / schema.payments queries / /api/admin/payments POST helpers to TransactionService + BalanceService DI / financialTransactions+transactionLinks queries / direct ft+tl inserts
- Plan 105-06: helpers.ts TABLES_TO_CLEAN had stale schema.payments + schema.debts entries that crashed cleanAllTestData with getTableName(undefined) after schema files deleted — both lines removed (Rule 3); test suite recovered from 21/58 file-pass to 58/58
- Plan 105-06: 1 reports.test.ts assertion negated from toBeDefined→toBeUndefined for voided-row visibility because Plan 04 D-01 canonical revenue filter (voided_at IS NULL) excludes voided rows from /charges by design; legacy test asserted contradictory behavior (Rule 1 — bug)
- Plan 105-07: AlumnosPage per-row Deuda column DELETED (not stubbed) — backend Plan 05 removed MemberListItem.debt; banner aggregate (totalDebtByCurrency) preserves admin prioritization signal at list level; per-member saldo detail returns in Phase 108 via dedicated /financial-history endpoint
- Plan 105-07: usePaymentsApi.ts NOT deleted — Option A selected over Option B (stub CajaPage). Phase 106 owns CajaPage migration to /api/admin/transactions + new useTransactionsApi composable; deleting now would force a stub-and-rewrite-twice pattern. Cost during gap: CajaPage shows 404 banner (admin-staging-only)
- Plan 106-01: PaginatedResult<T> relocated to shared/types.ts (finance is the second consumer); reports/types.ts re-exports for zero callsite churn
- Plan 106-01: Drizzle alias() pattern for recorder self-join in TransactionService.list — first non-raw-SQL recorder join in the codebase
- Plan 106-01: TransactionService.list pagination clamped server-side (max=200) as defense-in-depth (T-106-LISTSIZE) even though route layer also caps via Fastify schema
- Plan 106-01: Test fixture bug fixes — branch.code <= 20 chars (Rule 1); kind='refund' with empty links forbidden, used 'advance_payment' instead (Rule 1)
- Plan 106-02: country gate uses !request.scope.isOwner (request.scope.country always populated by attachCountryScope default 'AR'); plan-template's if (request.scope.country) check would have run cross-country guard for owners and broken S3/VS2 (Rule 1)
- Plan 106-02: V3/V4 retargeted from extra-property rejection (plan template) to wrong-type rejection (project reality) because Fastify default AJV STRIPS extra props silently — documented project-wide in current-program.test.ts:340 + trials.test.ts:1116; V3b pins the strip behavior (Rule 1)
- Owner-aware country resolution: owner without ?country sees ALL countries (no filter); owner with ?country=XX filters; non-owners locked to scope.country (T-106-02 mitigation per Phase 106-03)
- Plan 106-04: financialHistorySchema response uses additionalProperties:true on loose-passthrough objects (transaction, links, voidInfo) — Fastify fast-json-stringify strips unlisted fields by default, so Warning #6 idiom requires the explicit escape hatch (Rule 1 fix). Phase 109 audit can flip to strict by replacing with full property listings.
- Plan 106-04: GET /api/admin/members/:userId/financial-history mounted on members/routes.ts (D-09 sub-resource) with per-handler FINANCE_READ_ROLES privacy override placed BEFORE target lookup so coach denials don't disclose membership existence. Cross-country guard uses !request.scope.isOwner (NOT scope.country) per Plan 02 SUMMARY lesson.
- Plan 124-01: leverage modeled as nullable varchar(50), NOT a global enum (D-03/D-05); palanca is structured-but-optional. Contracción reuses the existing effort field (D-02). Gesto is a first-class catalog table exercise_subfamilies (D-01).
- Plan 124-01: canonical_exercise_id + route_pending added as schema only in 124; saneo data writes (canonical pointers + route-pending flags) deferred to Plan 02 TS script (detect/report before mutating, analog backfill-gender.ts).
- Plan 124-01: migration 0137 is pure additive DDL (zero row mutations) so historical FKs from session_prescriptions/program_content_blocks stay intact (D-07 soft-merge, no deletes); additive/idempotent/reversible.
- Plan 106-05: backward-compat aliases (PAYMENT_METHOD_OPTIONS as alias of PAYMENT_METHOD_FILTER_OPTIONS, LegacyPaymentMethod 3-key narrow type) avoid renaming churn across unrelated callsites; only CajaPage business logic changed. Phase 109 widens.
- Plan 106-05: kind='plan_charge' bind on listTransactions in CajaPage preserves legacy /payments cobros semantics during Phase 106 (D-14 closure scope); debt_settlement surfaces via Plan 04 financial-history. Phase 109 adds UI kind dropdown.
- Plan 106-05: Task 1 grep regex for owner-override was overly strict (Prettier formatted across multiple lines); used Plan 03 SUMMARY canonical evidence (grep -c 'request.scope.isOwner' routes.ts === 4) as verification gate. No Plan 03 file modifications — Wave 4 conflict-free invariant intact.
- Plan 109-01: revenueByKind extended FinanceSummary additively (D-11); refund=0 by design (W4 negative assertion in RBK3); placeholder zeros in Task 1 commit kept tsc clean before Task 2 wired real groupBy
- Plan 109-02: getOutstandingBalances service lives in ReportsService (not finance/transaction-service) — D-08 path is /api/admin/reports/outstanding-balances and reports module already mounts CAJA_ROLES + attachCountryScope; finance counterpart getOutstandingConcepts stays per-member because /financial-history is mounted under members/
- Plan 109-02: bucket math in JS (computeAgeInDaysOB / computeBucketOB), not SQL CASE — preserves Phase 108 future-date clamp at 0, portable across DB session timezones, ~150 timestamp diffs per request is negligible
- Plan 109-02: owner without ?country sees ALL countries (no filter); owner with ?country=AR|ES filters; non-owner locked to scope.country — mirrors GET /api/admin/finance/transactions/summary, NOT the simpler /access etc. pattern, because Deudas is the one report that surfaces multi-currency totals (D-06)
- Plan 109-02: bucketTotals schema typed as object with additionalProperties:true — needed because shape flips between flat BucketTotals (non-owner) and per-currency keyed map (owner); fast-json-stringify would otherwise strip the EUR/ARS keys
- Plan 109-03: Task 3 redirected from client-side xlsx to server-side exceljs (xlsx not installed in admin; Phase 64 P03 reports pattern is server-side; net result is simpler client + single-source-of-truth filter semantics)
- Plan 109-03: TransactionExportRow extends TransactionListItem with voidReason — minimal additive contract for 'Razon anulacion' column without leaking the field into the standard listing
- Plan 109-03: Conceptos column rendered as '<TARGET_KIND_LABEL_ES> #<targetId>' joined by ', ' (W5 stub — granular labels deferred until ops requests)
- Plan 109-04: Excel export redirected from client-side xlsx (not installed in admin) to backend endpoint /api/admin/reports/outstanding-balances/export — mirrors Plan 109-03 redirection precedent; net result is simpler client + single-source-of-truth filter semantics + integration tests against real MySQL
- Plan 109-04: DeudasReport encapsulates own load lifecycle on mount + filter/countryScope watches; ReportesPage.fetchTabData switch unchanged (no case 'deudas' needed) — keeps component self-contained and avoids two competing data flows when owner toggles country
- Plan 119-05: CODE-COMPLETE con verificación humana DIFERIDA. Tasks 1-2 commiteados (f3abcbb9 composable + 3-state ReservasPage; cc0a015a deep links + App Links/Universal Links). El checkpoint blocking Task 3 (3 estados + reserve flow + deep link + warm-brand sobre device/emulator) NO se ejecutó por decisión del usuario; los 6 ítems quedan persistidos en 119-05-HUMAN-UAT.md (status: partial, todos [pending], blocked_by: physical-device). Dos TODOs del deployer gatean producción (no el UAT): SHA-256 fingerprints reales en assetlinks.json desde Play App Signing, y servir /.well-known/\* como JSON estático excluido del SPA catch-all de app.eltemplo.org.
- Plan 109-04: bucketTotals shape discriminator at runtime (Object.prototype.hasOwnProperty.call(bt, '0-30')) — gracefully handles flat BucketTotals (non-owner) vs per-currency keyed map (owner) without runtime assertion
- Plan 109-05: cross-aggregation sanity test asserts Σ revenueByMethod = Σ revenueByKind = Σ revenueByBranch = monthlyRevenue over a single mixed-scenario seed (10 rows incl. 1 voided + 1 outflow refund); 5/5 cases PASS; W7 symmetric branch invariant covered explicitly
- Plan 109-05: VERIFICATION.md scaffold mirrors Phase 108 pattern + adds prominent "Smoke Pendiente — Handoff al Operador" section at top because skip_checkpoints mode (Phase 107/108 precedent); 6 smoke escenarios PENDING, 22/22 D-XX decisions covered, "NO viernes" appears 4× in sign-off pre-flight
- Plan 109-05: country=AR query param applied to all 5 sanity test requests to bypass owner-no-country wide-open behavior (Phase 106 P03 invariant) and keep tests deterministic against eltemplo_test leftover rows
- Plan 110-02: Migration 0107 applied to local DB; users.country populated for admin (1 row, AR), 7 user_branches rows inserted for coaches; owner stays NULL per D-12.
- Plan 110-06: Wired requireBranchAccess into 25 admin endpoints across 6 modules; added module-level attachCountryScope to scheduling-admin and attendance-admin (Rule 3); harmonized 2 inline 403 bodies to BRANCH_OUT_OF_SCOPE shape; documented 4 audit-table drifts surfaced by Warning 7 grep pre-step.
- Plan 111-01: normalizePhone helper landed at backend (modules/shared/phone.ts) and admin frontend (utils/phone.ts) as 1:1 mirror with sync-warning JSDoc — D-25 path B (no shared workspace package) chosen for minimum effort. createMember + updateMember now apply .trim() to firstName/lastName before db.insert/update (D-26) closing the Soledad Mailland trailing-space bug class.
- Plan 111-02: Hand-wrote 0108_create_audit_log.sql instead of pnpm db:generate — drizzle-kit meta/\_journal.json snapshot is at 0059 while DB is at 0107 so generate either prompts interactively or pollutes the file (Phase 86 / 90 / 103-01 precedent). Drizzle schema in src/db/schema/audit-log.ts is canonical.
- Plan 111-02: auditLog.write helper takes REQUIRED tx handle (not optional). Helper does NOT open its own transaction — atomicity owned by caller. Test 2 verifies rollback removes the row. T-111-09 mitigation is structural, not runtime.
- Plan 111-02: TxHandle imported from finance/balance-service (canonical export site) rather than redefined locally. AuditTargetKind union includes 'member' to support REQ-8 reconciliation entries.
- Phase 111-03: cancelSubscription signature gained required actorId param; 3 internal callers updated to source from request.user.userId (T-111-14/15 mitigation)
- Phase 111-03: Structured 4xx body emitted by route layer via JSON.parse on BadRequestError.message — preserves global handleServiceError pipeline; cancelErrorSchema whitelists code+details for Fastify response serializer
- Plan 120-02: subscriptions.price_regular_snapshot (nullable int, migration 0136, ONLY migration in Phase 120 per D-06) captures the plan's priceRegular at the 4 real-charge insert sites (assign/change-now/change-after/renew). The 5th bulkMigratePlan insert (pricePaid:0, no plan_charge) is deliberately left NULL — grep count == 4 by design. No backfill (list price was never stored); historical discount falls back to current priceRegular with disclaimer in Plan 04.
- Plan 111-04: phone match runs at SQL level via RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) — no schema change, no index. Reused for both /admin/members/check-duplicates and /auth/register phone block (single source of normalization in shared/phone.ts).

Plan 111-04: helpers.ts registerUser default phone now per-call unique via timestamp-tail + in-process counter (Rule 3 fix unblocking dozens of legacy callers under the new uniqueness check). Mirrors existing dni randomization pattern.
Plan 111-04: 400 MISSING_QUERY enforced at route handler (not schema required:[]) so the structured 4xx body carries explicit code per Phase 110 D-05.
Plan 111-04: dedup by user id with matchedField='dni' preferred when both criteria match the same row — admin sees the stronger identifier first.

- Plan 113-01: half-open interval overlap (`a.start < b.end AND a.end > b.start`) on HH:MM strings via drizzle `lt`/`gt` — strict inequality makes back-to-back boundaries non-overlapping; `is_active=1` filter so historic deactivated rows (Constitución 10am case) don't block reuse.
- Plan 113-01: ConflictError payload extension idiom — TS intersection cast (`ConflictError & { affectedSchedules?: AffectedScheduleRef[] }`) attached at service layer, route handler bypasses shared `handleServiceError` for one specific 409 shape; Fastify `fast-json-stringify` requires explicit declaration of `affectedSchedules` in `updateActivitySchema.response[409]` or it would silently strip the rich payload.
- Plan 113-01: activity name uniqueness on rename uses `ne(id)` to exclude self — no-op renames (same name) are allowed and never query, idempotent.
- Plan 113-02: ActivitiesDialog.vue refactored from `<q-dialog>` floating modal into an embedded panel (props `:active` instead of `:show`, no `update:show` emit) — file kept by name, parent imports under alias `ActivitiesPanel` to minimize git history churn while honoring the tabbed layout (D-18). HorariosPage gained q-tabs (Horarios | Actividades), a `Crear horario` header button gated by `v-if="activeTab === 'horarios'"` and `:disable="!selectedBranchId"`, and an `onCascadeError` toast that lists up to 5 affected schedules using `DAY_SHORT_LABELS[dow] HH:MM-HH:MM (branchName)` plus "y N más" overflow. SlotDetailDialog.vue intentionally untouched (D-19).
- Plan 113-02: Slot creation 4xx errors render INLINE on the form (text-negative caption) instead of as a toast — UX rationale is the admin keeps the form open and corrects the conflicting time/branch immediately. Cascade-error from activity deactivation DOES use a toast (no form to preserve).
- Plan 113-02: Tasks 2 and 3 committed together (Rule 3) because Task 3 changed ActivitiesDialog's props/emit contract spanning HorariosPage; splitting would have left an intermediate state failing tsc. 3 pre-existing tsc errors in `pdf/session-pdf-builder.ts` (pdfmake @types drift) deferred to a future housekeeping plan; verified by stash that they were not introduced by this plan.
- Plan 119-01: campaign schema foundation — 4 reusable tables (campaigns/campaign_sends/campaign_events/campaign_unsubscribes) mirroring user-status-history.ts; UNIQUE(campaign_id,user_id) for audience idempotency (D-12), UNIQUE(email) for unsubscribe suppression (D-15); branches.address + bookings.source nullable columns. Migration backfill matches sedes by name LIKE (not code) because branch codes drift across environments — each UPDATE is an idempotent no-op where the sede is absent. 8 Wave 0 RED scaffolds use it.todo (compile-valid, no DB execution) honoring the project rule to not run the full suite locally.

- Plan 111-06: data-fix migrations use defensive WHERE-on-BEFORE-state guards + DELETE by id + INSERT … SELECT … WHERE NOT EXISTS — re-runnable as 0-row no-op (verified by Tests 2 and 3)
- Plan 111-06: refactored run-migrations.ts to export splitSqlStatements + guarded auto-run with require.main check, so integration tests share the production parser without triggering a real migration on import
- Plan 111-06: balance for sub 6382 zeroed explicitly in step 4 (D-19 — eliminates the inseguro lazy applyDelta path)
- Plan 112-01: deferred-NOT-NULL pattern for source enum — column added NULL-tolerant first, backfilled in 3 priority steps (plan_linked → plan_bundle → admin_addon fallback), then ALTER … MODIFY tightens to NOT NULL in Step 5 (fails fast if any row remained NULL, surfaces partial-backfill bugs as hard failures)
- Plan 112-01: WHERE source IS NULL guards on every backfill UPDATE so a manual replay outside the runner is a 0-row no-op (defense in depth on top of the \_migrations tracker)
- Plan 112-01: Drizzle schema source enum has no .default(...) — callers must pass explicit source value; Plan 02 EnrollmentService owns that responsibility (the 6 existing inserts in subscriptions/service.ts wired with explicit source + subscription_id directly under Rule 3 to compile, will be replaced by EnrollmentService.enrollFromPlan in Plan 02)
- Plan 112-02: Plan-flag preconditions wrap requireEnrollmentService() calls — chokepoint skipped for plans without linkedProgramId/grantsAllPrograms; preserves test instantiations omitting EnrollmentService and avoids spurious DI errors on flows with no enrollment work
- Plan 112-02: tearDownForSubscription dual-lookup strategy — (a) rows with subscription_id = subId AND (b) user-scoped rows with subscription_id IS NULL matching the cancelled sub's plan binding; preserves R4 protection regression test for direct-DB-inserted bundle rows AND backward-compat for ambiguous Plan-01-backfill leftovers
- Plan 112-02: Renewal + activateScheduledSub call sites preserve legacy 'skip if active enrollment exists' guard around enrollFromPlan — enrollFromPlan's linked-program branch is unconditionally cancel-then-insert (assignPlan/changePlan need it), so the guard prevents resetting currentWeek=1 on a still-running mid-program enrollment
- Plan 112-03: tearDownForSubscription gained optional excludeSources param so admin_addon survives the changePlanNow teardown step and can be relocated by transferAddons inside the new-sub tx; default empty preserves D-18 cancel/expire teardown across all sources
- Plan 112-03: pause/resume cascades use optional-chaining (this.enrollmentService?.) instead of requireEnrollmentService — preserves legacy direct-instantiation tests in lifecycle.test.ts; mirrors Plan 02 plan-flag precondition pattern for routes that don't wire EnrollmentService
- Plan 112-03: changePlanNow keeps tearDownForSubscription OUTSIDE the new-sub tx (Plan 02 placement) — moving it inside causes the new sub to act as a protector for the OLD plan's enrollments via tearDown's protection-program logic, which broke the bundle changePlanNow test
- Plan 112-03: activateScheduledSub places transferAddons unconditionally at top of method (right after status flip), BEFORE the conditional predecessor tearDown — admin_addons relocate ahead of any cancel; idempotent via no-op when 0 rows match (D-20)
- Plan 112-04: D-13 LOCKED — extend transaction_links.target_kind with 'enrollment' (NOT extend kind enum); kind='plan_charge' reused so Phase 105-04 D-01 canonical revenue filter stays unchanged; granular trazability lives at the link layer
- Plan 112-04: D-22 LOCKED — RBAC = FINANCE_WRITE_ROLES (owner|admin|gestion|recepcion); recepcion already creates kind='plan_charge' transactions via assignPlan today (Phase 107)
- Plan 112-04: BalanceService.applyDelta gained early-skip for target_kind='enrollment' (Rule 1) — admin add-on charges are one-shot, no running obligation; mirrors existing 'transaction' precedent in the same method
- Plan 112-04: EnrollmentService constructor takes optional 3rd-arg transactionService — only the new admin route wires it; Plan 02's 11 DI sites unchanged because they never call enrollAddon
- Plan 112-04: cancel audit reuses action='plan_assigned' with payload.cancelledByAdmin=true rather than extending the AuditAction enum — minimal-surface, defer enum widening
- Phase 114-03: SET clause ordering matters in recomputeUserStatus — lead_status/lead_notes BEFORE converted_at to respect MySQL's left-to-right SET evaluation semantics
- Plan 114-04: branch-scope via canAccessBranch inline (lead branchId on users row, not request payload)
- [Phase ?]: Plan 116-01: refresh tokens persist sha256 hex only; plaintext never stored (T-116-01)
- [Phase ?]: Plan 116-01: rotate() returns { newToken, userId } chaining old->new via replaced_by_id self-FK; reuse of a revoked token revokes the whole family (T-116-02)
- [Phase ?]: Plan 116-01: 30m access expiry exposed via fastify.accessTokenExpiresIn decorator + JWT_ACCESS_EXPIRES_IN env; legacy token sign stays 7d, fastify.authenticate unchanged (Req 8)
- [Phase ?]: Plan 116-02: migracion 0125 aplicada a DB local (eltemplo); checkpoint humano reservado para staging/prod
- [Phase ?]: Plan 116-02: /auth/refresh y /auth/logout publicos body-based (D-04); rotate() devuelve userId, la ruta consulta users para firmar el access JWT
- [Phase ?]: Plan 116-02: login/register devuelven { token, accessToken, refreshToken } (token legacy 7d intacto, Req 7); change-password revoca todos + emite par nuevo (D-01); delete-account revoca explicito (D-05)
- [Phase ?]: Plan 116-03: refresh lock en boot/axios.ts (refreshPromise module-scope); createAuthErrorHandler exportado para testeo (D-02)
- [Phase ?]: Plan 116-03: useTokenStorage dual-key con lectura legacy authToken como access + cleanup diferido en setTokens; aliases getToken/removeToken backwards-compat (D-03)
- [Phase ?]: Plan 116-03: authStore login/register persisten via setTokens (BLOCKER); boot refresh silencioso si access expiro antes de /auth/me, legacy va directo (Req 11)
- [Phase ?]: Plan 116-04: authStore admin login persiste ambos tokens (BLOCKER), logout borra las 3 keys, checkAuth lee adminAccessToken con fallback
- [Phase ?]: Plan 116-04: interceptor admin con lock (refreshPromise module-scope) + dual-key localStorage (adminAccessToken/adminRefreshToken) + cleanup diferido del adminToken legacy (D-02/D-03)
- [Phase ?]: Plan 116-04: test del lock admin escrito pero NO ejecutado — vitest ausente en admin; checkpoint blocking-human, no se instalo ninguna dependencia
- [Phase ?]: Plan 116-05: suite de integración refresh/rotación/reuse/revocación/dual-access verde contra eltemplo_test (Req 14); refresh_tokens en TABLES_TO_CLEAN
- [Phase ?]: Plan 116-05: el test DB auto-provisiona migración 0125 desde src/db/migrations en cada worker fresco (setup.ts); fixtures via registerUser por el phone-block de Phase 111
- Plan 117-03: AttendanceMetricsService nuevo (D-09, NO toca el monolito service.ts) — uniqueMembers COUNT(DISTINCT member_id) por ventana half-open (D-08) + checkInAdoptionByBranch vía LEFT JOIN attendance ON (member+schedule+date) porque attendance no tiene booking_id FK; ratio 0..1 (warning <50% es frontend, Plan 05); applyScope reutilizado sobre attendance.branchId / schedules.branchId
- Plan 117-03: el módulo analytics está gateado a ADMIN_ROLES=[admin,owner] — coach/recepción reciben 403 en el onRequest hook antes del scope de sede, así que el test de no-fuga T-117-01 usa un admin AR denegado (403, cross-country Rule 3) en una sede ES, no un coach
- Plan 117-04: EngagementService nuevo (D-09/D-12) reutiliza segmentation — countActiveBySegment lee member_profiles.segment vía LEFT JOIN + COALESCE(segment,'sinSegmento') + activeMemberExists (NUNCA users.status); bucket sinSegmento para activos sin segment calculado; getEngagementNominalList (en_riesgo/ghost activos) usa subquery correlacionada para planName (sin fan-out); applyScope sobre users.branchId; GET /engagement devuelve { counts, nominalList } con phone gated por ADMIN_ROLES + scope (T-117-01/T-117-06)
- [Phase ?]: 117-05: attentionList completo (overdue buckets + daysOverdue real + yaPago + segment), renewalRate 7/14/30, habló-con-coach diferido (D-14/15/16/17)
- Plan 117-06: frontend admin completo (D-11..D-17): AsistenciaTab (únicos 7/14/30 + segmentos + worklist en_riesgo/ghost con WhatsApp + warning ratio <50%), MiembrosTab (vencidos buckets + daysOverdue real + renewalRate + flag ya-pagó + priorización por segmento), FinanzasTab (revenue ARS/EUR separado). Checkpoint visual APROBADO. Follow-ups misma fase: tab Asistencia MOVIDA de AnaliticasPage a ReportesPage para habilitar rol gestion + nuevo ANALYTICS_OPERATIONAL_ROLES (gestion+admin+owner) en el onRequest hook con guard per-route requireAdminAnalytics en los 3 endpoints admin-only (/, /members, /financial) + test de RBAC (gestion 200 operacionales / 403 admin-only); ocultar bucket "Sin segmento" + tooltips de segmento; rename display-only Digital Warrior→Digital, Ghost→Fantasma en SEGMENT_LABELS (claves DB sin cambios). Sin dependencias nuevas (T-117-SC). Phase 117 ejecutada 6/6.
- [Phase ?]: Plan 118-01: hooks de user_status_history en members/service.ts (3 sitios 'prueba', from=null en altas, read-before/write-after en convertFreemiumToTrial) y members/routes.ts (2 sitios admin 'inactivo'), todos con source='admin' y dedupe from==to dentro de la tx del UPDATE; recomputeUserStatus intacto (source='recompute'). Test real-MySQL 6/6. Donde el guard de TS prueba que el status siempre cambia se omite el branch de dedupe (TS2367).
- [Phase ?]: Plan 118-02: RetentionService nuevo (D-09, no toca analytics/service.ts); CONSECUTIVE_CYCLE_GAP_DAYS=30 (D-04); gap >30d corta racha sin reiniciar cohorte (D-05); cohorte=mes de primera sub valida + distribucion de ciclos sobre activeMemberExists (D-06); GET /retention admin-only requireAdminAnalytics, gestion 403 (D-11); ventanas invalidas contadas en invalidWindowSubs y salteadas (T-118-05); test real-MySQL 14/14
- [Phase 118]: Plan 118-05: D-09 borrado del display las 2 cards de engagement por segmento (AsistenciaTab) + fetch/prop en ReportesPage; backend, EngagementService, engagement.test.ts, getEngagement del composable y modulo segmentation INTACTOS
- [Phase 118]: Plan 118-03: AdvancedFinanceService nuevo (D-09, no toca analytics/service.ts); caja replica el filtro canonico de getRevenueTrend (kind plan_charge/debt_settlement, inflow, voided_at NULL) por moneda; devengado prorratea pricePaid sobre ventana efectiva [start, MIN(end, cancelledAt)] porque cancelSubscription NO acorta end_date (D-07); ARPU = devengado/mes / activeMemberExists (NUNCA users.status) con guard div-by-zero -> ARPU 0 (D-08); ARS/EUR jamas sumadas; /advanced-finance ADMIN_ROLES-only requireAdminAnalytics, gestion 403 (D-11); ventanas invalidas (null/0/end<start) excluidas + excludedInvalidWindow (T-118-08); test real-MySQL 14/14 (D-12)
- [Phase ?]: Plan 118-04: FunnelService nuevo (D-09, monolito intacto); cohorte=mes de users.created_at (D-03); activo histórico aproximado con MIN(subscriptions.created_at) (D-01); medianas por etapa null-safe; /funnel admin-only (D-11)
- [Phase 119]: Plan 119-02: instalado mjml@5.2.2 (D-23, única dep aprobada); mjml v5 es async → trialCampaignHtml devuelve Promise<string>; añadido src/types/mjml.d.ts (v5 sin types); EmailService.sendCampaignBatch con idempotencyKey + degradación silenciosa (D-12); CAMPAIGN_EMAIL_FROM como placeholder TBD (Plan 07, D-17); template MJML bulletproof con VML roundrect, paleta cálida (sin azul), imágenes self-hosted en eltemplo.org/email (D-27)
- [Phase ?]: Plan 119-03: standalone reserveTrialSelfService promotes freemium→prueba + history + booking in ONE tx; one-per-lifetime + cancelled-row reactivation inline (D-01/D-26).
- [Phase ?]: Plan 119-03: booking window parameterized via assertDateWithinWindow(windowDays) — reserve=+2d, validateTrialBookingDate=+30d (D-05); trial path skips the subscription check.
- [Phase ?]: Plan 119-03: BookingService injected into TrialService as optional 3rd ctor arg; reserveTrialSchema additionalProperties:false rejects forged token — server-side state is sole authorization (D-21).
- [Phase ?]: Plan 119-04: HMAC campaign token identifies sendId only, never authorizes (D-21); exp now+30d epoch seconds (D-04).
- [Phase ?]: Plan 119-04: /track/click derives its 302 destination via CampaignService.trialDeepLink against a fixed allowlisted host (app.eltemplo.org, D-25) with a fail-closed host assertion — never echoes raw query input (anti open-redirect).
- [Phase ?]: Plan 119-04: send() enrolls idempotently via ON DUPLICATE KEY on UNIQUE(campaign_id,user_id), chunks ≤100 to EmailService.sendCampaignBatch with idempotencyKey, degrades without RESEND_API_KEY (no new Resend in module, Pitfall 3).
- [Phase ?]: Plan 119-04: campaign funnel 'convirtió' = user_status_history toStatus='activo' after sent_at, aligned with funnel-service.ts (A6); attendance/conversion join on userId within the sent_at + self_service window.
- [Phase 119]: Plan 119-06: CODE-COMPLETE con verificación humana DIFERIDA por decisión del usuario (2026-06-02). Tasks 1-2 commiteados (812f9c82 useCampaignsApi + CampaignFunnel; 2d718bcc CampaniasPage + route + nav + create dialog + send confirmation). El checkpoint blocking Task 3 (nav por rol, sección standalone /campanias, crear borrador, filas de lista, funnel 6 etapas + caveat Apple-Mail-Privacy, confirmación de envío con conteo de destinatarios, warm-brand sin azul) NO se ejecutó ni se auto-aprobó; los 7 ítems quedan persistidos en 119-06-HUMAN-UAT.md (status: partial, todos [pending], blocked_by: admin-staging-build). Correr contra admin-staging antes del envío en vivo de la campaña (Plan 07). Fase avanza a plan 7/7.
- [Phase 119]: Plan 119-07: HUMAN-GATE-PENDING (2026-06-02). Plan no-autónomo: sólo Task 1 era automatizable y quedó commiteado (2a9dcbc4 — finaliza .env.example del sender de campañas: RESEND_API_KEY prod-required + degradación silenciosa, CAMPAIGN_EMAIL_FROM con sender send.eltemplo.org + pasos humanos de verificación de dominio Resend/DNS SPF/DKIM/Envelope-From/MX que conviven con Google Workspace, D-17). Tasks 2-4 son gates humanos bloqueantes que el usuario ejecuta externamente (NO auto-aprobados, NO se disparó ningún envío real, NO se pushea): (A) verificar dominio Resend, (B) setear secrets prod, (C) copy + imágenes logo/hero + números WhatsApp, (D) arreglar serving de .well-known, (E) crear campaña + preview cross-client + "Enviar campaña" irreversible (D-11). Verificación .well-known en app.eltemplo.org: ambos paths devuelven el index.html del SPA (HTTP 200 pero content-type text/html), NO el JSON — los deep-link files de Plan 05 NO se sirven correctamente todavía → follow-up dependiente de deploy (sin deploy no solicitado, MEMORY). Checklist humano completo A-E en 119-07-SUMMARY.md.
- [Phase ?]: 120-01: deriveDurationTier derives tier from durationDays (named constants 1/31), not planTier enum — rename-robust, no migration (D-01/D-02)
- [Phase ?]: 120-01: metricShape { nominal, percentage, n } envelope + verbatim median; div-by-zero guard returns 0/null, never NaN (FUND-02)
- [Phase 120]: Plan 120-04: Ticket value + discount numerator from subscriptions.price_paid, NOT financial_transactions.amount (cash received can be partial → would misreport partials as discounts); FT is universe/period filter ONLY (kind='plan_charge' only, half-open [from,to), currency-isolated)
- [Phase 120]: Plan 120-04: excludedNoLink (mandatory) = in-period plan_charge universe minus matched-subscription count per currency; INNER join on target_kind='subscription' excludes enrollment-only charges, surfaced not dropped
- [Phase 120]: Plan 120-04: Cohort split listPrice (price_paid==listBase AND no override) vs discounted (below base OR override); listBase = priceRegularSnapshot ?? plan.priceRegular, snapshot-null counted in historicalFallbackCount; $0 charges in neither cohort
- [Phase ?]: Phase 121 Plan 01: extracted shared expiry-cohort engine (expiry-cohort.ts) — churn + renovación consume one cohort definition (RENOV-01 DRY)
- [Phase ?]: Phase 121: CHURN_COMPARISON_WINDOWS=[5,10,15], RENOVATION_WINDOW_DEFAULT_DAYS=15 (D-07)
- [Phase ?]: Churn person-based via JS folding over per-person cohort rows; identical maturity+retention gating across official/multi-N/series/breakdown paths
- [Phase ?]: Legacy churn/retention metrics annotated @deprecated (D-09); physical removal deferred to admin-UI phase
- [Phase ?]: Renovación = matured AND retained over the SAME per-person cohort churn uses; renewal.n equals churn's denominator (RENOV-01), asserted in renewal.test.ts
- [Phase ?]: enGracia exposed as the número vivo (RENOV-03/D-07); renov%+churn% reconcile only over the matured cohort, grace residual surfaced not folded
- [Phase ?]: getRenewalRate annotated @deprecated Phase 121 D-09 pointing to GET /renewal; behavior + callers unchanged, removal deferred to admin-UI phase
- [Phase ?]: Plan 122-01: KM median = first event time S(t)<=0.5; ties collapse to one step; censored customers stay in at-risk denominator (D-122-05)
- [Phase ?]: Plan 122-01: LtvMonetary keeps ARS/EUR as separate LtvCurrencyBlock (never summed, D-122-09); projected vs observed LTV both real-payment based (D-122-07)
- [Phase ?]: Plan 122-03: ltv.test.ts asserts headline derives from churn.window.churn.percentage for identical filters (both services instantiated); cohort n includes censored lives (=== churn n, D-122-05); observed monetary = exact real-payment sum seeded below list price (D-122-08); ARS/EUR never summed (D-122-09); gestion 403 / admin 200; voidedAt marker from MySQL NOW() keeps grep 'new Date()' literal at 0 for TZ-flake safety.
- [Phase ?]: 123-01: Frequency bands as named constants BAJO_MAX=1.5/MEDIO_MAX=2.5 visits/week; membership age on users.createdAt clamped [1,4] weeks (D-123-03/04)
- [Phase ?]: 123-01: getFrequency scoped; coolingOrInactiveUserIds scope-unaware (global nightly batch); checkInAdoption reused from AttendanceMetricsService (D-123-06)
- [Phase ?]: TrialFunnelService (123-02): asistió desde bookings.status (no attendance, D-123-07); compró = primera sub paga en [sesión, sesión+window) vía DATE_ADD; leads nuevos vía NOT EXISTS sub paga previa; subqueries correlacionadas con prefijo explícito schema.bookings.\* (lección 121/122)
- [Phase ?]: Plan 123-03: Frequency golden-case override forces en_riesgo for active members with 0 visits in tuneable system_settings window (default 28d); fed into existing 03:00 batch via single batched query, no new cron, login path unchanged (D-123-01/02)
- [Phase ?]: 124-02: saneo en script TS (no SQL) reporta conteos antes de mutar; soft-merge a canonical MIN(id) sin deletes; route_pending por route='' (D-06/D-07/D-08)
- [Phase ?]: 125-01: heuristic bootstrap (no LLM/API) writes pending proposals to exercise_dimension_proposals; UNIQUE(exercise_id) + INSERT...WHERE NOT EXISTS idempotent; route guess only for route_pending; never writes truth columns (TREE-02)
- [Phase ?]: 125-02: accept es transaccional (resolve-or-create subfamilia + truth columns + status flip atómico); reject solo status; nunca contracción ni delete
- [Phase ?]: 125-02: TREE-03 (API revisión de profes) completo — /admin/exercises/proposals\* bajo hook TRAINING_ROLES; tests CI deferidos
- [Phase ?]: 125-03: TREE-03 frontend (ProposalReviewPage + useProposalsApi) consumiendo /admin/exercises/proposals\*; tabla agrupada por ruta con inline-edit + accept/reject + aceptar-grupo; nav y ruta /proposals (coach/owner)
- [Phase ?]: Plan 126-01: exercise_progressions edge table — source enum (auto|manual) partitions regenerable auto backbone from preserved manual overrides (D-03); both endpoint FKs ON DELETE CASCADE (T-126-01); edge UNIQUE backs Plan 02 dedupe; hand-written migration 0139.
- [Phase ?]: Plan 126-02: graph constructor regenerates only source='auto' edges (DELETE WHERE source='auto' + bulk INSERT in a transaction), never touching manual profe overrides (D-03)
- [Phase ?]: Plan 126-02: backbone partitioned by composite subfamilyId|effort so effort is never crossed (D-04); chains ordered by dl with stable id tiebreak (D-05); strictly consecutive, no cross-edges (D-02)
- [Phase ?]: 127-01: reached proxy = (dl <= level ceiling) OR (exerciseId in completed sessions via session_prescriptions); branch b active, replaceable by 131 dominado registry
- [Phase ?]: 127-01: tree grouping by exercises.pattern collapsed to 5 categories (Traccion/Empuje/Piernas/Core/Movilidad); KL/CARDIO/PLYO->Piernas, FLOW->Movilidad, empty->Movilidad fallback with warn log
- [Phase ?]: 127-01: GET /api/tree-progress/me member-scoped to request.user.userId; node set = 126 DAG scope predicate; all 5 categories always render
- [Phase ?]: 127-02: Mi Árbol member view (/mi-arbol) renders GET /tree-progress/me verbatim — render-only, server % (D-05); local gate = lint+quasar build (no vue-tsc in app); human-verify DEFERRED to HUMAN-UAT
- [Phase 129]: 129-01 (KAIROS-01): kairos added FIRST to users.level enum (order kairos,alfa,delta,sigma,omega,spartan), DEFAULT stays alfa (default change = phase 130); migration 0140 byte-identical to TS schema (enum-drift lesson 125/126), no `;` in SQL comments
- [Phase 129]: 129-01: kairos->levelGroup alfa_delta via explicit switch case (D-02), no new LevelGroup; kairos reuses Alfa difficulty cap (3) + Alfa glyph (α) since it inherits Alfa content (D-03)
- [Phase 129]: 129-01: introduced `ContentLevel = Exclude<ExerciseLevel,'kairos'>` + `toContentLevel()` (kairos->alfa) to separate member levels from the kairos-less exercises.level enum; encodes the D-03 inheritance once for Plan 02. completed_sessions.session_level widened in lock-step (presencial check-in snapshots users.level)
- [Phase 129]: 129-01: local gates = API tsc + app/admin lint+build (vue-tsc absent); selector/preview UI NOT touched (deferred to phase 130). Executed on staging, NOT pushed
- [Phase 129]: 129-02 (KAIROS-02/03): kairos generation gated behind isKairos(ctx.memberLevel) at 4 minimal pipeline points (stage-3 budget 2/block, stage-5 + INITIUM linear format Singlet/For Quality, stage-6 alfa-only dificultadLineal=1, INITIUM size 2); all branches pure-additive, non-kairos paths byte-identical (D-07). New queryFormatByName() in format-fallback.ts.
- [Phase 129]: 129-02 Task 2 = Option B (orchestrator decision): full SPOM-seeded end-to-end generation is NOT CI-runnable here (SPOM CSVs git-ignored under .docs/, seedSPOM() mis-pathed), so the gate is proven at the unit level (mock DB + fallback modules, real gated functions) mirroring rom-generator.test.ts. test/unit/kairos-gate.test.ts covers isKairos + stage-3/5/6 + INITIUM + D-07 regression. tsc green. Executed on staging, NOT pushed — push to staging for CI to run the suite.
- [Phase 130]: 130-03 (KAIROS-07 admin half, D-04): Kairos added FIRST to every admin level option array (MemberFormDialog levelOptions, AlumnosPage levelFilterOptions) matching constants/levels.ts LEVEL_ORDER; both MemberFormDialog form defaults flipped alfa→kairos (D-01). Display maps on AlumnosPage + AlumnoDetailPage gained kairos → glyph 'α' (reuses Alfa's, member-app parity), name 'Kairos', warm color amber-6 (lighter than alfa's amber-8, entry tier; no blue, no hex). No markup change — q-select dropdown holds 6 entries natively. Local gate = admin lint (0 errors) + quasar build (succeeded, vue-tsc clean). human-verify checkpoint DEFERRED (overnight); visual UAT pending. staging, not pushed.
- [Phase ?]: 131-02: coach dominado/bajado view in a separate /api/admin/exercise-adjustments plugin (TRAINING_ROLES, 403 for members); member POST untouched
- [Phase ?]: 131-02: tree-% reached AUGMENTED with latest-dominado per node (latest-per-node wins); level/SPOM untouched (D-06)
- [Phase 131]: 131-03 (CAPSTONE v5.1): in-session adjustment is a member-facing surface on BlockProgressionView (detail row, not ExerciseCard). useExerciseAdjustment composable returns {neighbor,message} from POST /exercise-adjustments; PARENT (DayPlayer) owns the swap — mutates the SOURCE session.blocks[*].exercises[i] (playableBlocks computed re-derives), replacing ONLY exerciseId/exerciseName/contraction + clearing videoUrl (endpoint serves none, refetched next load), preserving reps/seconds/format/dose/sortOrder/rest (D-03). isSubmitting guard + :disable = one-tap-one-step. neighbor null → q.notify message, no change. Never touches level/SPOM (D-06). Local gate = app lint (0 errors) + vue-tsc clean on the 3 files (no pnpm typecheck script). human-verify visual UAT DEFERRED (overnight). staging, not pushed.
- [Phase ?]: [Phase 132]: planId threaded via shared subscriptionPlanFilter() in expiry-cohort.ts (DRY across churn/renewal/ltv); ticket excludedNoLink suppressed under planId
- [Phase ?]: [Phase 132]: TrialTurno literal moved to types.ts (no circular import); trial-funnel-service re-exports; new-lead exclusion stays planId-unrestricted
- [Phase ?]: [Phase 132]: frequency coolingDown[] enriched with name+phone reusing the existing users join (D-12, export-ready in one call)
- [Phase ?]: [Phase 132]: frequency turno filter applied in SQL (join schedules + hour range) not in-memory, since frequency aggregates visit counts in the DB
- [Phase ?]: 132-03: frontend contract layer — 6 mirrored analytics interfaces + MetricShape + 6 typed fetch methods + turno/window filters
- [Phase ?]: [Phase 132]: .vue verified via eslint (type-aware); vue-tsc not installed, full SFC typecheck in CI
- [Phase ?]: [Phase 132]: ConversionTab + IngresosTab presentational (props-in); page 132-06 owns fetch
- [Phase ?]: 132-06: 6 v5.0 metrics wired into AnaliticasPage across 4 thematic tabs + Plan/Turno filters; deprecated FunnelTab/ARPU/Renovación/Tasa-de-retención deleted (D-15/16/17/18)
- [Phase ?]: [Phase 133]: Opción A confirmada — tabla exercise_milestone_proposals separada del truth (espejo de 0138); milestone_exercise_id solo se escribe en el accept transaccional del profe
- [Phase ?]: [Phase 133]: FK proposed_milestone_exercise_id con nombre acortado (62 chars) por límite de 64 de MySQL en nombres de constraint
- [Phase ?]: [Phase 133]: levelColor consolidada en constants/levels.ts + DL_BANDS locked (kairos 1-2/alfa 3/delta 4-6/sigma 7-8/omega 9-10/spartan 11-12); dlBand+bandTextClass como API de bandas para planes 06/07
- [Phase ?]: [Phase 133]: stripe de banda via colors.getPaletteColor() de Quasar (token como fuente de verdad, sin hex hardcodeado); contraste charcoal sobre amber (kairos/alfa)
- [Phase ?]: 133-03: matching de movimiento por ORDEN DECLARADO del MOVEMENT_VOCAB (no sort por longitud) — OA gana a TTB en nombres 'OA TTB ...'
- [Phase ?]: 133-03: proposeMilestones corre sobre el catálogo COMPLETO y particiona internamente; exclusión de ya-propuestos solo en el INSERT
- [Phase ?]: 133-03: ejercicios sin movimiento detectado no se agrupan — cada uno propuesto como hito con confidence 40
- [Phase 133]: 133-04: filtro de variantes con helper compartido backboneNodeConditions() + espejo crudo testeado; subGroup dominante en memoria con tie-break por code-points; readBackboneNodes() exportado para el test de consistencia
- [Phase 133]: 133-05: acceptInTransaction extraído de ProposalService.accept — el accept de hito/variante embebe el accept de dimensión en SU transacción (una pasada del profe = una tx)
- [Phase 133]: 133-05: validaciones de variante corren DENTRO de la tx después del accept de dimensión — un fallo tardío rollbackea todo (atomicidad observable por test)
- [Phase 133]: 133-05: extra props en bodies se STRIPPEAN (Ajv removeAdditional + additionalProperties:false), no rechazan 400 — contrato de plataforma existente
- [Phase ?]: 133-06: Reject 'análogo' = dispatch — fila con propuesta de hito rechaza solo ese eje (rejectMilestoneReview); la dimensión queda pendiente y revisable
- [Phase ?]: 133-06: MilestoneReviewList extraído como componente presentacional con emits granulares (evita vue/no-mutating-props); TreeMapPage conserva estado y mutaciones
- [Phase ?]: 133-06: 'Aceptar todas' saltea variantes sin hito elegido y acepta secuencialmente los dos ejes por fila (una tx backend c/u) + bulkAccept para solo-dimensión
- [Phase 133]: 133-07: arista agregada prereq-agg usa routes.code; click en R4 manual conserva la baja existente con el copy LOCKED en el diálogo; búsqueda scopeada al filtro de sub-grupo
- [Phase ?]: [Phase 134]: member tree node state/band server-computed in buildMemberTree (D-05); separate layer from reached/percent
- [Phase ?]: [Phase 134]: dominado is evidence-only (adjustments=dominado OR completed session); dl<=ceiling never dominates (D-01)
- [Phase ?]: [Phase 134]: disponible/bloqueado use D-06 hybrid gating; en_progreso frontier computed in a second per-route pass (D-02)
- [Phase ?]: 134-03 advance criterion
- [Phase ?]: [Phase 135]: bootstrap-milestones --apply milestone-only by contract (aborts on pending dimension proposals, exit 2); reuses acceptMilestoneReview as the only milestone_exercise_id writer, hitos before variantes, idempotent (pending-only)
- [Phase ?]: [Phase 143-01]: class_coach_assignments uniqueIndex natural-key (branch,week,day,slot) impide doble profe por slot/semana a nivel DB (D-A2)
- [Phase ?]: [Phase 143-01]: coach_ratings append-only sin unique; guard one-shot miembro+clase en service layer (D-P2)
- [Phase 143-05]: RatingPromptDialog (Surface 2) class-framed estilo Uber: salteable (sin persistent, D-P1) + one-shot por clase vía Capacitor Preferences (D-P2); nunca expone al profe (D-A3); estrellas Terracotta color=primary
- [Phase 143-05]: el-templo-app sin script typecheck ni vue-tsc; verificación canónica de frontend = ESLint (plugin vue); tsc reporta errores pre-existentes de resolución .vue fuera de scope
- [Phase ?]: [Phase 137]: Migration 0153 hand-written (not drizzle-kit generate) — runner reads .sql by name + \_migrations table is source of truth; generate prompted for unrelated sessions.goal_plan_type drift
- [Phase ?]: 137-03: 13 firm-money call sites centralized through firm-money.ts with validation_status='validado'; subscriptions cancel guard kept as deliberate integrity exception — VAL-05 blast-radius closed; backfill keeps the 6 v5.0 metrics identical
- [Phase 138]: [Phase 138]: cutoff_date is a per-caja column seeded with one global value (no settings-table dependency); cash_registers seed is SELECT-driven off branches (8 on prod baseline, scales with branch count)
- [Phase 138]: 138-02: resolveCashRegister (single reusable caja resolver, D-01) + currency guard (D-09) live in CashRegisterService; wired at the single create() insert site so all 9 create paths auto-stamp cash_register_id server-side (CAJA-02/04). Reused by phase 140.
- [Phase 138]: 138-03: CashRegisterService.getBalance = saldo DERIVADO (no materializado, D-08) = opening_balance + Σ validados de la caja DESDE cutoff_date, reusando firmMoneyConditions() (filtro canónico 137, nunca inlineado). PENDIENTES en SUM separada, nunca sumados al firme (CAJA-03). inflow-only en 138 con marker // TODO 139 (egresos firmados). Suite de integración CAJA-01..04 (18 tests). Backend-only (D-10, sin REST/UI). Phase 138 COMPLETE.
- [Phase ?]: [Phase 139]: branch_id NULLABLE (extends D-06) — movimientos/egresos branch-less almacenan NULL; aggregations branchId INNER JOIN branches
- [Phase ?]: [Phase 139]: getSummary excluye cash_transfer/expense + applyDelta no-op en links vacíos — movimiento no infla revenue ni toca balances
- [Phase 139]: 139-03: MovementService facade — movimiento = asiento 2 filas cash_transfer (outflow origen + inflow destino) linkeadas both-ways vía transaction_links, en una db.transaction, neto 0; guard same-currency antes de escribir; reconciliación D-04 = fila kind='adjustment' separada en origen SOLO si counted!=expected (el getBalance firmado auto-corrige el saldo a lo contado) + audit 'reconciliation' SIEMPRE (expected/counted/diff); egreso = 1 fila expense outflow; void-the-pair vía voidPair descubre ambas patas + ajuste desde cualquier leg id (transaction_links en ambas direcciones). 4 rutas admin-only (FINANCE_VOID_ROLES server-side, rol nunca del body) + country scope por caja→branch (branch-less = owner-only, 404 cross-country). 10 tests MOV-01..04 + RBAC verdes. Backend-only. Phase 139 COMPLETE.
- [Phase ?]: [Phase 140-01] idempotency_key as nullable UNIQUE column on financial_transactions (not separate table) — D-09; MySQL allows unlimited NULLs so admin/historical rows never collide
- [Phase ?]: [Phase 140-01] FINANCE_LOAD_ROLES = FINANCE_WRITE_ROLES + coach (load-only); coach stays out of VOID/ADJUSTMENT/READ — D-06/D-08
- [Phase ?]: [Phase 140-01] ER_DUP_ENTRY return-existing handling deferred to Wave 2 (Pitfall 3: renewal tx rolls back before re-read)
- [Phase ?]: Phase 140-02: coach load endpoints in a SEPARATE plugin with its own FINANCE_LOAD_ROLES guard (finance module's FINANCE_READ_ROLES hook excludes coach); idempotency dedup at endpoint layer (ER_DUP_ENTRY -> re-read existing on fresh connection, Pitfall 3)

### Pending Todos

- [x] **Phase 112 Plan 01: Schema migration** — completed 2026-05-04 (4 add-on columns + paused enum + backfill applied locally, idempotent, tsc clean)
- [ ] **Phase 112 Plan 02: EnrollmentService extraction** — wave 2, depends on Plan 01 (next)
- [ ] **Phase 112 Plans 03-06** — lifecycle hooks, admin add-on API, admin UI, member-app verification
- [ ] **Rollout de datos v5.1** — poblar milestone_exercise_id (local + prod) — `.planning/todos/pending/v51-milestone-data-rollout.md`
- [x] **Compensar días (pausa retroactiva) en admin** — implementado 2026-06-10 (endpoint + modal + tests, pendiente CI/UAT) — `.planning/todos/completed/2026-06-10-compensar-d-as-pausa-retroactiva-en-admin.md`

### Blockers/Concerns

- Plan 111-06 task 3 awaiting staging + production runs of migration 0109_reconcile_soledad_mailland.sql (human checkpoint — operator must run pnpm db:migrate on staging then approve prod)
- Plan 112-01 awaiting staging + production runs of migration 0111_program_enrollments_addon_columns.sql (human checkpoint — operator must run pnpm db:migrate on staging, sanity-check `SELECT COUNT(*) FROM program_enrollments WHERE source IS NULL` returns 0, then approve prod)
- Plan 112-01 deferred item: pre-existing test-DB provisioning bug (per-worker setup mis-tolerates Unknown-table errors at migration 0070, blocks `pnpm test` boot via `formats.description` schema drift). Documented in `.planning/phases/112-enrollment-service-admin-add-ons/deferred-items.md`. Out of scope for v4.85; recommend a future housekeeping plan.
- Plan 112-04 awaiting staging+prod runs of migration 0112_transaction_links_target_kind_enrollment.sql (human checkpoint — operator must run pnpm db:migrate on staging, verify SHOW COLUMNS shows the new 4-value enum + \_migrations row, then approve prod)
- Plan 116-02 awaiting staging + production runs of migration 0125_create_refresh_tokens.sql (human checkpoint — operator must run pnpm db:migrate on staging, verify SHOW COLUMNS FROM refresh_tokens + fila en \_migrations, then approve prod)
- Plan 116-04: vitest+jsdom no instalados en el admin — test del lock escrito y commiteado pero sin correr; requiere decision del usuario (instalar devDeps o aceptar cobertura del test de la member app)
- Plan 117-02: migraciones 0128_create_user_status_history.sql + 0129_backfill_user_status_history.sql APROBADAS y aplicadas LOCALMENTE (checkpoint humano approved). Pendiente: aplicación en staging + producción vía pipeline (operator corre pnpm db:migrate on staging, verifica 0128/0129 en \_migrations + SELECT COUNT(\*) FROM user_status_history > 0, confirma re-run no-op, luego aprueba prod). Staging-first STRICT, no merge to master ni push sin confirmación.
- Plan 122-02: LTV headline reuses ChurnService (1÷churn pct), never recomputed; churn 0 → null (never NaN/∞)
- Plan 122-02: survival cohort closed=matured&&!retained (event), active/in-grace=censored (kept); life span first-start..last-expiry (closed) / first-start..today (censored), months=days÷30; first-start as correlated MIN(start_date) subquery (same user+branch, non-paused)
- Plan 122-02: monetary LTV from financial_transactions canonical filter (never list price); observed=mean closed totals, monthlyRealRevenue=mean(total÷months), projected=headline×monthlyRealRevenue; ARS/EUR never summed; ft upper bound EXCLUSIVE to match half-open cohort
- Plan 122-02: ARPU annotated @deprecated D-122-01 (math/schema/type byte-unchanged) — LTV monetary is canonical replacement, physical removal deferred to admin-UI phase (Phase 121 D-09 precedent)
- Plan 122-02: no integration test in this plan — test/analytics/ltv.test.ts owned by Plan 03, runs in CI only
- Plan 130-01: migration 0141 flips users.level DEFAULT alfa→kairos (additive, existing rows untouched) + ADD COLUMN level_override BOOLEAN DEFAULT 0; enum order byte-identical to schema/0140; both statements in one file, no `;` in comments
- Plan 130-01: new-member level=kairos at every creation path (auth/register insert+echo, createMember default ||"kairos", createTrialMember); explicit input.level still honored; legacy import-members.ts deliberately kept "alfa" (historical levels)
- Plan 130-01: updateMember sets level_override=true ONLY on a level change → sticky coach decision. Contract for Plan 02: auto-graduation MUST skip members with level_override=true. Non-level edits leave level + flag untouched (D-05)
- Plan 130-02 (KAIROS-05, D-02/D-03): KAIROS_GRADUATION_THRESHOLD=12 lives in shared/training-constants.ts (single source, no inline literal). GraduationService.maybeGraduateKairos(userId): one-way kairos→alfa at threshold, early-returns on non-kairos OR level_override=true, guarded `UPDATE ... WHERE id=? AND level='kairos'` (idempotent/race-safe). Count is TOTAL completed_sessions (all levels)
- Plan 130-02: graduation is event-driven (NO cron), wired as a guarded try/catch side effect into all 3 completed-session insert paths — sessions/routes.ts + goal-plans/routes.ts (after AURA award), attendance/service.ts (inline inside recordPresencialSession after the presencial mirror insert). 5 tests in test/kairos/kairos-graduation.test.ts (CI). API tsc green. staging, not pushed
- Plan 130-04 (KAIROS-07 app half, D-04): decision pre-resolved include-kairos (overnight). Prepended `{ value: 'kairos', label: 'α Kairos' }` FIRST in LEVEL_SELECTOR_QUESTION.options (onboarding/types.ts) → self-pick now kairos→alfa→delta→sigma→omega (5 boxes; spartan still excluded — earned, not claimed). 5 boxes is below OnboardingQuestion's `>5` scrollable threshold → no layout break. HeaderLevelDropdown.vue already v-for's TRAINING_LEVELS (kairos first since 129) → VERIFIED, no change. Gate = app lint (0 errs) + quasar build (succeeded; vue-tsc not a runnable script here, build covers full tsc). human-verify (visual UAT) DEFERRED. KAIROS-07 now complete app+admin. staging, not pushed. Phase 130 ready_for_verification.

## Session Continuity

Last session: 2026-06-24T20:46:43.724Z
Stopped at: Completed 140-01-PLAN.md
Resume file: None

**Planned Phase:** 114 (Reporte tabular de sesiones de prueba) — 7 plans — 2026-05-12T18:39:04.628Z
