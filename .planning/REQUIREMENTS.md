# Requirements — v5.8 Sesiones de Prueba — automatización y self-service

Scope derivado de `.docs/sp-auto/brief-fran-automatizacion-sesiones-prueba.md` (brief de
Nacho, 2026-07-15) + repaso punto por punto con Franco (2026-07-15) + 3 mapeos de
codebase de la misma sesión (sesiones de prueba, freemium/reservas, compras).

**Hallazgos que acotan el scope (no se construye lo que ya existe):**

- El matching lead↔compra del punto 4 del brief **ya está resuelto por diseño**: lead =
  `users` con status `prueba` (con FK a sede, email/teléfono/DNI), sesión de prueba =
  `bookings` con `is_trial=1`, y el hook `recomputeUserStatus`
  (`subscriptions/service.ts`) ya marca Ganado + Plan comprado + `convertedAt` al
  comprar cualquier plan, desde los 4 flujos de cobro (assign/change/renew/POS profe).
- Guardrails del punto 6 casi todos existentes: invariante Ganado⇔Plan validada en API
  (409) y UI; "Plan comprado" ya es FK a `subscription_plans`; `lead_notes` ya es texto
  libre sin lógica.
- "Quitar turno" en el admin ya hace soft-cancel (`status='cancelado'`) — el historial
  de reprogramaciones existe en datos, solo falta exponerlo.
- El flujo self-service freemium→prueba **ya existe end-to-end** (Phase 119, en prod
  sin UAT): elegibilidad (`GET /members/scheduling/trial-eligibility`), reserva con
  promoción atómica freemium→prueba, una prueba por vida, grilla en `ReservasPage.vue`.

**Decisiones cerradas (repaso con Franco):** Ganado SIN ventana (cualquier compra marca
Ganado, incluso desde Perdido); X = p90 histórico de días sesión→primera suscripción,
configurable en `system_settings`; teléfono obligatorio en toda reserva de SP; contador
de reprogramaciones derivado (sin schema nuevo); audit de override con columna
`lead_status_source` (no historial completo); backfill con tabla backup (precedente
migración 0170) + dry-run validado contra conteos del brief (211 Perdido / 136 En
seguimiento / 105 Ganado sobre 452).

**Constraint operativo:** staging-first estricto; migraciones con SQL commiteado y
numeración a verificar en plan-phase (última aplicada 0180; ojo con la reserva de
v5.6 aún no ejecutado); tests de integración para rutas nuevas/modificadas.

---

## v5.8 Requirements

### AUTO — Máquina de estados automática del lead

- [ ] **AUTO-01**: Un cron diario (infra `src/jobs/` existente) pasa a Perdido todo lead
      En seguimiento cuya última sesión de prueba no cancelada quedó a más de X días
      sin compra registrada (aplica a asistió y no-asistió por igual).
- [x] **AUTO-02**: X vive en `system_settings` como parámetro configurable; el cron lo
      lee en cada corrida. El valor inicial se siembra desde el p90 del histórico de
      días entre sesión de prueba y primera suscripción de los leads Ganados (con
      default de resguardo si el histórico es insuficiente).
- [ ] **AUTO-03**: Al agendarle una nueva sesión de prueba a un lead Perdido (admin o
      self-service), su estado vuelve a En seguimiento y la ventana X corre desde la
      nueva sesión.
- [x] **AUTO-04**: El sistema distingue estado automático de manual: columna
      `lead_status_source` (`auto`/`manual`) seteada en `auto` por hook/cron/alta y en
      `manual` por el PATCH de edición del lead.
- [ ] **AUTO-05**: Migración de backfill aplica la regla retroactivamente a los leads
      En seguimiento con sesión vencida (≈112), con tabla de backup previa (precedente
      `users_lead_backup_0170`) y dry-run de conteos validado antes de aplicar.

### REPRO — Reprogramación y reporte

- [ ] **REPRO-01**: Gestión puede reprogramar una sesión de prueba en un solo paso
      desde el admin (cancela el turno viejo y crea el nuevo en la misma transacción),
      en lugar de quitar + volver a cargar.
- [ ] **REPRO-02**: El reporte de Sesiones de Prueba muestra cuántas veces reprogramó
      cada lead (derivado de sus bookings de prueba canceladas — retroactivo, sin
      schema nuevo).
- [ ] **REPRO-03**: El reporte de Sesiones de Prueba indica y permite filtrar si el
      estado del lead salió del automatismo o fue pisado a mano
      (`lead_status_source`).

### SELF — Self-service freemium y UX de gestión

- [ ] **SELF-01**: El flujo self-service existente queda verificado end-to-end
      (registro → elegibilidad → reserva de prueba → lead visible en el reporte admin)
      y corregido donde falle.
- [ ] **SELF-02**: Toda alta de sesión de prueba desde el admin exige teléfono del
      lead.
- [ ] **SELF-03**: La reserva self-service de sesión de prueba exige teléfono: si el
      perfil no lo tiene, la app lo pide en el diálogo de confirmación de la reserva.
- [ ] **SELF-04**: Gestión tiene un flujo más directo para programar sesiones de
      prueba y convertir leads en alumnos (fricciones concretas a relevar; mejoras
      acotadas a lo que el propio flujo actual ya evidencia).

## Future Requirements (deferred)

- **AUTO-F1**: Exponer X (`lead_perdido_window_days`) en la UI de configuración del
  admin (por ahora se edita en DB vía `system_settings`).
- **AUTO-F2**: Campaña de recupero de Perdidos (mensajería segmentada por "asistió" —
  el brief la menciona como consumidora de estos datos, no como parte del milestone).
- **AUTO-F3**: Historial completo de transiciones de `lead_status` (descartado por
  sobre-ingeniería para las métricas pedidas; la columna source cubre el brief).

## Out of Scope (this milestone)

- **Matching por nombre/teléfono contra compras** — innecesario: la identidad
  lead↔compra ya es por `userId` (hallazgo del repaso; punto 4 del brief obsoleto).
- **Ventana X como condición del Ganado** — decisión explícita: cualquier compra marca
  Ganado; X solo gobierna el vencimiento a Perdido.
- **Vínculo explícito turno viejo→nuevo (`rescheduled_from_id`)** — la cadena se
  reconstruye por lead + fechas; schema extra sin consumidor.
- **Envío real de campañas / notificaciones a Perdidos** — fuera del milestone.

## Traceability

<!-- Filled by roadmap -->

| Requirement | Phase     | Status  |
| ----------- | --------- | ------- |
| AUTO-01     | Phase 163 | Pending |
| AUTO-02     | Phase 163 | Complete |
| AUTO-03     | Phase 163 | Pending |
| AUTO-04     | Phase 163 | Complete |
| AUTO-05     | Phase 163 | Pending |
| REPRO-01    | Phase 164 | Pending |
| REPRO-02    | Phase 164 | Pending |
| REPRO-03    | Phase 164 | Pending |
| SELF-01     | Phase 165 | Pending |
| SELF-02     | Phase 165 | Pending |
| SELF-03     | Phase 165 | Pending |
| SELF-04     | Phase 165 | Pending |
