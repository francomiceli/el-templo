---
phase: 163-m-quina-de-estados-autom-tica-del-lead
plan: 02
subsystem: jobs
tags: [node-cron, drizzle, mysql, leads, state-machine, pino]

# Dependency graph
requires:
  - phase: 163-01
    provides: "users.lead_status_source column, leads.perdido_window_days seed (mig 0182), SettingsService.getPerdidoWindowDays()"
  - phase: 114-leads-report
    provides: "lead_status enum + última-booking-is_trial-no-cancelada derivation reused from 0170"
provides:
  - "src/jobs/expire-lost-leads.ts — runExpireLostLeads(db) invocable + startExpireLostLeadsJob(db) cron 04:00 AR"
  - "Daily sweep flips en_seguimiento/NULL leads → perdido when last non-cancelled trial booking is older than X days, skipping manual (D-04)"
  - "index.ts wiring: startExpireLostLeadsJob(app.db) at boot"
affects: [163-03, 163-04, trial-sessions-report, backfill]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cron job = pure invocable runXxx(db) + startXxxJob(db) wrapper (mismo patrón que mark-no-shows/auto-approve)"
    - "UPDATE...JOIN a la subquery MAX(id) de última booking vía db.execute(sql``), affectedRows leído en [0]"
    - "Ventana X interpolada como entero validado en DATE_ADD(booking_date, INTERVAL x DAY) — todo el date-math en el dominio DATE de SQL"

key-files:
  created:
    - el-templo-api/src/jobs/expire-lost-leads.ts
    - el-templo-api/test/expire-lost-leads.test.ts
  modified:
    - el-templo-api/src/index.ts

key-decisions:
  - "Cron a las 04:00 hora AR (discreción D), batch de una sola timezone (el estado del lead no depende de la sede — a diferencia de mark-no-shows que itera por branch tz)"
  - "Sin guard de asistencia (D-02): vence asistió y no-asistió por igual, a diferencia de la migración 0170 que sí filtraba attendance"
  - "skippedManual se cuenta con un COUNT separado que reusa el mismo fragmento SQL (DRY); el UPDATE nunca toca filas 'manual' así que el conteo es estable"

patterns-established:
  - "lastTrialBookingJoin + candidateBaseConditions como fragmentos sql`` compartidos entre el flip y el conteo para que cron/reporte/backfill cuenten lo mismo"

requirements-completed: [AUTO-01, AUTO-04]

# Metrics
duration: ~12min
completed: 2026-07-15
---

# Phase 163 Plan 02: Cron diario que vence leads En seguimiento → Perdido — Summary

**Nuevo `src/jobs/expire-lost-leads.ts` (runExpireLostLeads invocable + startExpireLostLeadsJob a las 04:00 AR) que lee la ventana X de settings cada corrida y vence leads no-manuales cuya última sesión de prueba no cancelada quedó fuera de la ventana, wired en index.ts, con 5 tests de integración verdes**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Creé `expire-lost-leads.ts` espejando `mark-no-shows.ts`: `runExpireLostLeads(db): Promise<{ expired, skippedManual }>` invocable + `startExpireLostLeadsJob(db)` que agenda `cron.schedule("0 4 * * *", ..., { timezone: "America/Argentina/Buenos_Aires" })`.
- El barrido lee X **primero** vía `new SettingsService(db, log).getPerdidoWindowDays()` (reader canónico de 163-01, sin lectura bespoke — D-05), identifica candidatos con la derivación MAX(id) de última booking `is_trial=1 AND booking_status <> 'cancelado'` (idéntica a 0170:95-118 y al reporte), gateada en `status IN ('prueba','freemium')`, `lead_status en_seguimiento OR NULL`, `converted_at IS NULL`, `purchased_plan_id IS NULL`, `deleted_at IS NULL`, y `DATE_ADD(b.booking_date, INTERVAL x DAY) < CURDATE()` (todo el date-math en el dominio DATE de SQL).
- El flip UPDATE setea `lead_status='perdido', lead_status_source='auto'` y guarda `(lead_status_source <> 'manual' OR lead_status_source IS NULL)` (NULL tratado como auto, D-07) → NUNCA pisa un estado manual (D-04). Un COUNT separado tallya los candidatos que hubieran vencido pero son `manual` → `skippedManual`, logueado aparte con Pino.
- Wired `startExpireLostLeadsJob(app.db)` sincrónico en `index.ts` tras `startAutoResumePausesJob(app.db)` (batch interno, sin await).
- 5 tests de integración contra `eltemplo_test`: vence-básico, no-vence-en-ventana, no-pisa-manual (skippedManual), lee-X-de-settings (borde se corre con ventana 7), y guard-convertido (convertedAt + purchasedPlanId nunca se pisan).

## Task Commits
1. **Task 1: Cron job + wiring en index.ts** — `b42d38bb` (feat)
2. **Task 2: Tests de integración del barrido** — `447633c5` (test)

**Plan metadata:** committed separately con SUMMARY.md + STATE.md + ROADMAP.md.

## Files Created/Modified
- `el-templo-api/src/jobs/expire-lost-leads.ts` — job nuevo (runExpireLostLeads + startExpireLostLeadsJob + fragmentos SQL compartidos).
- `el-templo-api/src/index.ts` — import + call sincrónico de `startExpireLostLeadsJob(app.db)`.
- `el-templo-api/test/expire-lost-leads.test.ts` — 5 casos de integración.

## Decisions Made
- **04:00 hora AR, single-timezone batch.** A diferencia de `mark-no-shows` (que itera por timezone de branch porque el "hoy" del no-show depende de la sede), el estado del lead es global — un solo `cron.schedule` con TZ AR alcanza. Madrugada AR según discreción de D.
- **Sin guard de asistencia (D-02).** La migración 0170 filtraba `attendance ... a.id IS NULL`; acá se omite adrede porque "el campo Asistió NO toca el estado" — vence asistió y no-asistió por igual.
- **`skippedManual` vía COUNT separado que reusa `candidateBaseConditions` + `lastTrialBookingJoin`.** El UPDATE nunca toca filas `manual`, así que el conteo es estable corra antes o después; se factorizaron los fragmentos SQL para que flip y conteo no diverjan (DRY).

## Deviations from Plan
None - plan executed exactly as written. La ventana X se interpola como entero (garantizado positivo por `getPerdidoWindowDays`: `Math.trunc` + guard `> 0`, default 14), así que `INTERVAL ${x} DAY` es seguro.

## Issues Encountered
- El suite completo NO se corrió (regla del repo: tests corren en CI). Sólo `test/expire-lost-leads.test.ts` (5/5 verde, ~59s) + `tsc --noEmit` limpio.

## Threat Flags
None nuevo. T-163-04 (flip pega en filas equivocadas) mitigado por el WHERE estricto (status prueba/freemium, en_seguimiento/NULL, converted_at NULL, purchased_plan_id NULL, deleted_at NULL). T-163-05 (pisa manual) mitigado por el guard `lead_status_source <> 'manual' OR NULL` + aserción del Caso 3. Sin endpoint HTTP nuevo (T-163-07), sin dependencias nuevas (T-163-SC).

## User Setup Required
None. El valor efectivo de `leads.perdido_window_days` sigue siendo ítem de verificación humana de deploy (D-06, heredado de 163-01) — el cron lo lee de prod en cada corrida.

## Next Phase Readiness
- 163-03 (reset Perdido → En seguimiento al re-agendar + writes source='auto'/'manual') puede montarse: la columna source y el reader existen, y el cron ya honra el guard manual.
- 163-04 (backfill retroactivo) reusará `lastTrialBookingJoin` / `candidateBaseConditions` — misma derivación que el cron.
- No blockers.

## Self-Check: PASSED

Files present (src/jobs/expire-lost-leads.ts, test/expire-lost-leads.test.ts, index.ts modificado); commits b42d38bb + 447633c5 en git log.

---
*Phase: 163-m-quina-de-estados-autom-tica-del-lead*
*Completed: 2026-07-15*
