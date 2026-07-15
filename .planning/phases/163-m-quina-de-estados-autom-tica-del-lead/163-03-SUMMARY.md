---
phase: 163-m-quina-de-estados-autom-tica-del-lead
plan: 03
subsystem: leads
tags: [drizzle, mysql, leads, state-machine, trials, subscriptions, source-of-truth]

# Dependency graph
requires:
  - phase: 163-01
    provides: "users.lead_status_source column (mig 0182) + enum auto|manual"
  - phase: 163-02
    provides: "expire-lost-leads cron que lee lead_status_source para saltear manuales (D-04)"
provides:
  - "reset Perdido -> en_seguimiento (source 'auto') en ambos sitios de booking (bookTrial admin + reserveTrialSelfService)"
  - "recomputeUserStatus estampa lead_status_source='auto' en la conversion (D-07), gateado en la misma condicion converted_at IS NULL"
  - "updateLead PATCH estampa lead_status_source='manual' (edicion directa + auto-promocion a ganado)"
  - "alta de lead (createTrialMember + convertFreemiumToTrial) estampa lead_status_source='auto'"
affects: [163-04, expire-lost-leads-cron, trial-sessions-report]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El write de source se agrega en el mismo .set()/.values()/UPDATE existente — sin queries extra ni cambios de flujo"
    - "En recomputeUserStatus la nueva asignacion respeta el orden LEFT-TO-RIGHT de MySQL: se ubica junto a u.lead_status y ANTES del write de u.converted_at, con la misma condicion de conversion"

key-files:
  created:
    - el-templo-api/test/lead-status-transitions.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/members/service.ts

key-decisions:
  - "En bookTrial el update de users se ubica dentro de la tx existente, justo tras cerrar las pruebas stale y ANTES de la rama insert/reactivate — un unico update que cubre ambos caminos de retorno"
  - "El comentario de ordenamiento LEFT-TO-RIGHT (5627-5634) se extendio para nombrar explicitamente la nueva rama lead_status_source, preservando el rationale del gate converted_at IS NULL"
  - "El test de reset se sembro desde source='manual' (el caso mas exigente): prueba que el automatismo legitimo SI puede pisar un Perdido manual (D-07), no solo un auto"

patterns-established:
  - "auto = automatismo legitimo (compra/reset/alta) puede pisar; manual = solo el PATCH humano, intocable por el cron (D-04/D-07)"

requirements-completed: [AUTO-03, AUTO-04]

# Metrics
duration: ~30min
completed: 2026-07-15
---

# Phase 163 Plan 03: Writes de la máquina de estados (source auto/manual) — Summary

**Los writes source-of-truth de `lead_status_source` cableados en los 3 módulos que mutan estado del lead: reset Perdido → En seguimiento (source auto) al re-agendar prueba (bookTrial + self-service), 'auto' en el hook de compra `recomputeUserStatus` y en el alta de lead, 'manual' en el PATCH `updateLead` — todo cubierto por 4 tests de integración verdes**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- **Reset (AUTO-03):** `reserveTrialSelfService` suma `leadStatusSource: "auto"` a su `.set()` existente; `bookTrial` hace un `tx.update(users).set({ leadStatus: "en_seguimiento", leadStatusSource: "auto" })` dentro de su tx (tras cerrar pruebas stale, antes de la rama insert/reactivate). El guard una-prueba-por-vida quedó intacto (D-03).
- **Hook de compra (D-07):** en `recomputeUserStatus`, dentro del MISMO `tx.execute(sql\`UPDATE users u SET ...\`)`, se agregó `u.lead_status_source = CASE WHEN <misma condición de conversión> THEN 'auto' ELSE u.lead_status_source END`, ubicada junto a `u.lead_status` y ANTES del write de `u.converted_at` para respetar el orden LEFT-TO-RIGHT de MySQL (el gate es `converted_at IS NULL`). El comentario de ordenamiento se extendió para nombrar la nueva rama.
- **PATCH manual (D-04):** `updateLead` setea `leadStatusSource = "manual"` cuando el caller toca `leadStatus`, y también en la auto-promoción a `'ganado'` del invariante ganado⇔plan (ese cambio también originó en el PATCH manual). El invariante en sí quedó sin cambios de lógica.
- **Alta de lead (D-07):** ambos sitios de creación (`createTrialMember` ~869 y `convertFreemiumToTrial` ~1061) suman `leadStatusSource: "auto"` a su insert/update.
- **Tests:** `test/lead-status-transitions.test.ts` con 4 casos de integración (reset bookTrial, reset self-service, PATCH manual, alta auto), 4/4 verde contra `eltemplo_test`.

## Task Commits
1. **Task 1: Reset Perdido → en_seguimiento (source auto) al re-agendar** — `6a90cbee` (feat)
2. **Task 2: source auto en compra/alta, manual en PATCH** — `381fd184` (feat)
3. **Task 3: tests de integración de las transiciones** — `c44749b8` (test)

**Plan metadata:** committed por separado con SUMMARY.md + STATE.md + ROADMAP.md.

## Files Created/Modified
- `el-templo-api/src/modules/scheduling/trials-service.ts` — reset auto en ambos sitios de booking.
- `el-templo-api/src/modules/subscriptions/service.ts` — `u.lead_status_source='auto'` en la conversión + comentario de orden extendido.
- `el-templo-api/src/modules/members/service.ts` — `leadStatusSource='manual'` en updateLead (edición + auto-promoción), `'auto'` en los dos sitios de alta.
- `el-templo-api/test/lead-status-transitions.test.ts` — 4 casos de integración (NEW).

## Decisions Made
- **bookTrial: un solo update dentro de la tx.** Se ubicó tras cerrar las pruebas stale y antes de la rama `if (existing) { ... return } / insert`, así cubre ambos caminos de retorno con un único write sin duplicar.
- **recomputeUserStatus: rama espejo de la del `ganado`.** La condición del CASE de `lead_status_source` es idéntica (converted_at IS NULL + sub active/paused vigente + booking is_trial EXISTS) — se conserva el gate de primera-conversión y el orden de asignaciones existente no se tocó.
- **Test de reset desde `manual`.** Se sembró el Perdido con `source='manual'` (caso más exigente) para probar que el automatismo legítimo del re-agende sí puede pisar un manual (D-07), no solo un auto.

## Deviations from Plan
None - plan ejecutado exactamente como fue escrito. (Se extendió el comentario de ordenamiento en subscriptions/service.ts para nombrar la nueva rama — mejora de documentación, sin cambio de comportamiento.)

## Issues Encountered
- El suite completo NO se corrió (regla del repo: los tests corren en CI). Sólo `test/lead-status-transitions.test.ts` (4/4 verde, ~53s de tests) + `tsc --noEmit` limpio.

## Threat Flags
None nuevo. T-163-08 (reorder del SQL rompe el gate de conversión) mitigado: la nueva asignación va antes de `converted_at`, gateada en la misma `converted_at IS NULL`, sin reordenar las existentes (verificado por review + typecheck). T-163-09 (PATCH sin role guard) mitigado: se reusa la ruta existente `PATCH /api/admin/leads/:userId` con su guard CAJA_ROLES + country-scope; el test autentica con token owner. T-163-10 (auto/manual indistinguibles) mitigado: el PATCH estampa `manual` dando trazabilidad. T-163-SC: sin dependencias nuevas.

## User Setup Required
None. El valor efectivo de `leads.perdido_window_days` sigue siendo ítem de verificación humana de deploy (D-06, heredado de 163-01).

## Next Phase Readiness
- 163-04 (backfill retroactivo) puede montarse: los writes de source ya están completos, así que el backfill puede estampar `'auto'` sobre los históricos con la misma semántica que el cron y el reset.
- No blockers.

## Self-Check: PASSED

Archivos presentes (trials-service.ts, subscriptions/service.ts, members/service.ts modificados; test/lead-status-transitions.test.ts creado); commits 6a90cbee, 381fd184, c44749b8 en git log.

---
*Phase: 163-m-quina-de-estados-autom-tica-del-lead*
*Completed: 2026-07-15*
