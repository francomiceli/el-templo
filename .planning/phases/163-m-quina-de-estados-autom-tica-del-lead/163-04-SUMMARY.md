---
phase: 163-m-quina-de-estados-autom-tica-del-lead
plan: 04
subsystem: database
tags: [drizzle, mysql, migrations, leads, backfill, state-machine, dry-run]

# Dependency graph
requires:
  - phase: 163-01
    provides: "system_settings.leads.perdido_window_days seed (mig 0182) + users.lead_status_source column"
  - phase: 163-02
    provides: "cron rule (última booking is_trial no cancelada + guard manual + ventana X) que el backfill replica retroactivamente"
provides:
  - "Migración 0183: users_lead_backup_0183 (snapshot pre-mutación) + reclasificación retroactiva En seguimiento/NULL vencidos → perdido (source auto)"
  - "src/db/scripts/0183_backfill_lost_leads_dryrun.sql — preview COUNT-only del impacto (verificación humana pre-deploy)"
  - "migración 0183 aplicada localmente + registrada en _migrations"
affects: [trial-sessions-report, prod-lead-data]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backfill = backup table (CREATE TABLE AS) antes de un UPDATE bulk único, patrón exacto de 0170"
    - "Ventana X leída dentro del UPDATE vía subquery escalar sobre system_settings (mismo valor que el cron, no un literal hardcodeado)"
    - "Test que corre el statement UPDATE REAL de la migración (extraído con splitSqlStatements) sobre filas frescas — prueba el SQL de la migración, no una reimplementación"

key-files:
  created:
    - el-templo-api/src/db/migrations/0183_backfill_lost_leads.sql
    - el-templo-api/src/db/scripts/0183_backfill_lost_leads_dryrun.sql
    - el-templo-api/test/backfill-lost-leads.test.ts
  modified: []

key-decisions:
  - "Backfill = migración (no script ad-hoc): prod data va por migración con audit trail en _migrations; backup en la migración porque el deploy NO respalda la DB"
  - "Ventana X vía subquery GREATEST(CAST(setting_value AS SIGNED),1): usa el mismo valor sembrado que el cron, con guard defensivo contra 0/negativo"
  - "Sin guard de asistencia (D-02): idéntico al cron, distinto de 0170 que sí filtraba attendance"
  - "El test extrae el UPDATE real de 0183 con el parser del runner (splitSqlStatements) y lo corre sobre rows nuevas — prueba el SQL de la migración en aislamiento, no el cron"

patterns-established:
  - "Dry-run COUNT-only en src/db/scripts/ (fuera de migrations/, el runner nunca lo aplica) con el predicado byte-idéntico al UPDATE de la migración"

requirements-completed: [AUTO-05]

# Metrics
duration: ~18min
completed: 2026-07-15
---

# Phase 163 Plan 04: Backfill retroactivo de la máquina de estados del lead — Summary

**Migración 0183 que snapshotea las columnas de lead en `users_lead_backup_0183` y luego aplica una vez la regla del cron a los ~112 leads En seguimiento vencidos → Perdido (source auto), respetando manual/convertido/plan/borrado/activo, con un script dry-run COUNT-only para validación humana pre-deploy y 4 tests de integración verdes**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2
- **Files modified:** 3 (3 created, 0 modified)

## Accomplishments
- Escribí `0183_backfill_lost_leads.sql` (hand-written, header estilo 0170/0182): (1) `CREATE TABLE users_lead_backup_0183 AS SELECT id, status, lead_status, lead_status_source, converted_at, updated_at FROM users WHERE lead_status IS NOT NULL OR converted_at IS NOT NULL` antes de mutar; (2) un `UPDATE ... JOIN` a la derivación MAX(id) de última booking `is_trial=1 AND booking_status <> 'cancelado'` (idéntica a 0170/0182/cron/reporte) que flipa `lead_status` de `en_seguimiento`/NULL a `perdido` y setea `lead_status_source='auto'`, gateado en `converted_at IS NULL`, `purchased_plan_id IS NULL`, `deleted_at IS NULL`, `status IN ('prueba','freemium')`, guard manual `(lead_status_source <> 'manual' OR lead_status_source IS NULL)`, y `DATE_ADD(booking_date, INTERVAL x DAY) < CURDATE()` donde X se lee vía subquery escalar de `system_settings.leads.perdido_window_days` (mismo valor que el cron). Sin guard de asistencia (D-02).
- Creé `src/db/scripts/0183_backfill_lost_leads_dryrun.sql`: un único `SELECT COUNT(*)` con el predicado WHERE byte-idéntico al UPDATE, que vive fuera de `migrations/` para que el runner nunca lo aplique — es el ítem de verificación humana (D-08) antes de que el pipeline corra 0183 (esperado ≈112 flips según el brief del 15/07).
- Apliqué 0183 localmente con `pnpm db:migrate` (runner custom), confirmé la fila `0183_backfill_lost_leads.sql` en `_migrations` y la existencia de `users_lead_backup_0183`.
- Escribí `test/backfill-lost-leads.test.ts` que extrae el statement UPDATE REAL de 0183 con `splitSqlStatements` (el parser del runner) y lo corre sobre filas frescas: (a) vencido→perdido/auto, (b) en-ventana→queda, (c) manual→intacto, (d) convertido→intacto. 4/4 verde, `tsc --noEmit` limpio.

## Task Commits
1. **Task 1: Migración 0183 + dry-run script** — `f65e464e` (feat)
2. **Task 2: Test de integración del backfill** — `a8657e95` (test)

**Plan metadata:** committed separately con SUMMARY.md + STATE.md + ROADMAP.md.

## Files Created/Modified
- `el-templo-api/src/db/migrations/0183_backfill_lost_leads.sql` — backup + reclasificación retroactiva.
- `el-templo-api/src/db/scripts/0183_backfill_lost_leads_dryrun.sql` — preview COUNT-only.
- `el-templo-api/test/backfill-lost-leads.test.ts` — 4 casos de integración corriendo el UPDATE real de la migración.

## Decisions Made
- **Backfill = migración, no script ad-hoc.** Prod data va por migración con audit trail en `_migrations` (skill db-migrations, precedente 0170). El backup vive dentro de la migración porque el deploy NO respalda la DB.
- **X vía subquery escalar `GREATEST(CAST(setting_value AS SIGNED), 1)`.** Lee el mismo valor sembrado por 0182 que consume el cron, sin literal hardcodeado, con guard defensivo contra 0/negativo. Si la key faltara, la subquery devuelve NULL → el UPDATE no toca ninguna fila (fail seguro).
- **Test corre el SQL real de la migración, no una reimplementación.** Extraer el UPDATE con `splitSqlStatements` prueba el statement que efectivamente ejecuta el runner en prod; sembrar rows nuevas tras la migración ya aplicada demuestra la regla en aislamiento.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- El suite completo NO se corrió (regla del repo: tests corren en CI). Sólo `test/backfill-lost-leads.test.ts` (4/4 verde, ~53s) + `tsc --noEmit` limpio.

## Threat Flags
None nuevo. T-163-11 (reclasificación irreversible) mitigado por `users_lead_backup_0183` creado ANTES del UPDATE (rollback/audit). T-163-12 (pega filas equivocadas) mitigado por el predicado estricto (status prueba/freemium, converted_at/purchased_plan_id/deleted_at NULL, guard manual). T-163-13 (impacto no verificado) mitigado por el dry-run COUNT-only commiteado. Sin dependencias nuevas (T-163-SC).

## User Setup Required
**HUMAN VERIFICATION ITEM (D-08):** correr `src/db/scripts/0183_backfill_lost_leads_dryrun.sql` contra staging/prod y confirmar ≈112 filas ANTES de que el pipeline aplique 0183. El valor efectivo de `leads.perdido_window_days` sigue siendo ítem de verificación de deploy (D-06, heredado de 163-01).

## Next Phase Readiness
- Wave 2 completa (163-02/03/04): cron + writes source + backfill retroactivo, todos compartiendo la misma derivación y ventana. Lista para el reporte (fase 164) y self-service/teléfono (fase 165).
- No blockers.

## Self-Check: PASSED

Archivos presentes (0183_backfill_lost_leads.sql, 0183_backfill_lost_leads_dryrun.sql, backfill-lost-leads.test.ts); commits f65e464e + a8657e95 en git log; migración aplicada y en _migrations; backup table presente.

---
*Phase: 163-m-quina-de-estados-autom-tica-del-lead*
*Completed: 2026-07-15*
