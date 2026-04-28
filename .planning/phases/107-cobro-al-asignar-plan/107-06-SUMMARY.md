---
phase: 107-cobro-al-asignar-plan
plan: 06
subsystem: planning/verification
tags: [verification, smoke-test, traceability, sign-off, documentation]

# Dependency graph
requires:
  - phase: 107-01
    provides: "TxHandle export + TransactionService.create accepts optional tx (atomicity foundation)"
  - phase: 107-02
    provides: "Helper recordAssignmentCharge + 4 atomic charge callsites + structured partial log"
  - phase: 107-04
    provides: "AssignPlanInput.amountReceived?: number + RenewSubscriptionInput.amountReceived?: number"
  - phase: 107-05
    provides: "AssignPlanDialog cobro block + banner + cap disable + payload extension"
provides:
  - ".planning/phases/107-cobro-al-asignar-plan/107-VERIFICATION.md (scaffold con matriz + 5 escenarios D-20 PENDING + sign-off D-21)"
affects:
  - "Closure formal de Phase 107 — gating documento para deploy a producción"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verification doc pattern: traceability matrix + plan-status table + smoke skeleton con campos Result/Evidence/Notes vacíos para que el operador llene durante el smoke real"

key-files:
  created:
    - .planning/phases/107-cobro-al-asignar-plan/107-VERIFICATION.md
  modified: []

key-decisions:
  - "Los 5 escenarios D-20 se dejan como PENDING (no se intenta automatizar el smoke) — son verificaciones manuales contra staging UI + DB que requieren al humano"
  - "La traceability matrix marca CHARGE-01 / CHARGE-02 / CHARGE-03 como DONE referenciando los SUMMARY.md de los plans merged (01, 02, 04, 05); CHARGE-03 incluye nota de Plan 03 atomicity test PENDING re-run en el sign-off pre-flight"
  - "La regla D-21 (NO deploy viernes) está documentada explícitamente en pre-flight checklist con verificación `date +%A` ≠ Friday"
  - "Plan 03 (charge-on-assign.test.ts) no tiene SUMMARY.md merged en el momento del scaffolding — se documenta su archivo de test como existente y se requiere re-run en CI/local antes del sign-off"
  - "Task 2 (checkpoint:human-verify para smoke + sign-off) se trata formalmente completo bajo el modo parallel_execution: el scaffold está listo, el humano ejecuta el smoke post-merge fuera del worktree y firma directamente en VERIFICATION.md"

patterns-established:
  - "Status enum en escenarios: PENDING / ✅ / ❌ — placeholders explícitos que el operador swappea durante el smoke real"
  - "Cada escenario incluye: Objetivo · Steps · Expected (UI + DB queries específicas) · Result · Evidence · Notes — formato repetible para futuros VERIFICATION.md de phases con smoke staging"

requirements-completed: []
# Phase 107 cierra CHARGE-01/02/03; este plan documenta el cierre formal pero los requirements
# son completados por los plans 01-05 — no por este. La marca final de "completed" la hace el
# sign-off humano del Production Deploy section dentro del VERIFICATION.md.

# Metrics
duration: ~4min
completed: 2026-04-28
---

# Phase 107 Plan 06: Verification Document Scaffold Summary

**Crea `107-VERIFICATION.md` (242 líneas, español) que captura el cierre formal de Phase 107: matriz de trazabilidad CHARGE-01/02/03 → plans 01-05 con status DONE, plan-status table con todos los plans, skeleton del smoke test D-20 con los 5 escenarios obligatorios como PENDING (cada uno con Steps + Expected UI/DB + Result + Evidence + Notes), atomicity re-run section para Plan 03, y sign-off placeholder con la regla D-21 (NO deploy viernes) explícita en el pre-flight checklist.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-28
- **Completed:** 2026-04-28
- **Tasks:** 2 (Task 1 ejecutado; Task 2 — checkpoint:human-verify — deferido al merge bajo parallel_execution)
- **Files created:** 1

## Tasks Completed

| Task | Name                                                                            | Commit     | Files                                                                  |
| ---- | ------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| 1    | Crear VERIFICATION.md con checklist + traceability matrix                       | `d009ec0f` | `.planning/phases/107-cobro-al-asignar-plan/107-VERIFICATION.md`       |
| 2    | Smoke staging + sign-off para deploy a producción (`checkpoint:human-verify`)   | DEFERRED — el scaffold está listo, el humano ejecuta el smoke post-merge | n/a |

## Implementation Details

### Estructura del VERIFICATION.md (242 líneas)

1. **Header** con date, phase status (Awaiting sign-off), tester, y descripción del propósito del documento.
2. **Traceability Matrix** (tabla):
   - **CHARGE-01** → cubierto por Plan 02 (backend payload accept) + Plan 04 (types frontend) + Plan 05 Task 1 (UI bloque Cobro). Status: DONE. Source: commits `3cd8ca45`, `495f0bbc`, `490919bf`, `23d5cef4`.
   - **CHARGE-02** → cubierto por Plan 05 Task 1 (computed `pendingBalance` + banner amarillo). Status: DONE. Source: commit `23d5cef4`.
   - **CHARGE-03** → cubierto por Plan 01 (`TransactionService.create` acepta `tx?: TxHandle`) + Plan 02 (helper `recordAssignmentCharge` dentro del outer `db.transaction`) + Plan 03 (atomicity test). Status: DONE en código (Plans 01+02), PENDING re-run de Plan 03 atomicity test en CI antes del sign-off.
3. **Plans Status table** con todos los plans 107-01..107-05, su status, tests/verificación ejecutados (números reales: 100/100, 214/214, etc.), y notas resumidas.
4. **Smoke Test (D-20) — Staging** con los 5 escenarios obligatorios, cada uno con:
   - **Objetivo** — qué debe verificar el escenario.
   - **Steps** — pasos manuales en español.
   - **Expected** — comportamiento UI + queries SQL específicas (con WHERE clauses concretas) para validar DB.
   - **Result:** `PENDING` — placeholder.
   - **Evidence:** placeholder con hint de qué capturar.
   - **Notes:** placeholder vacío.
5. **Atomicity (CHARGE-03) — Automated Verification** con comando exacto a ejecutar (`pnpm test --run test/subscriptions/charge-on-assign.test.ts`) y status PENDING.
6. **Production Deploy Sign-Off (D-21)** con:
   - Política operativa: NO deploy viernes (no-negociable).
   - Pre-flight checklist (10 items) incluyendo verificación explícita `date +%A ≠ Friday`.
   - Approval section con campos email + fecha + nota.
   - Production deploy steps con la regla `feedback_ask_before_push` explícita.
7. **Issues Found** tabla vacía con placeholder `PENDING`.
8. **Appendix** con referencias cruzadas a D-20, D-21, CHARGE-01/02/03 en sus archivos canónicos.

### Decisiones tomadas durante el scaffolding

- **Mantener los 5 escenarios como PENDING (no automatizar):** El smoke D-20 requiere UI navigation real, screenshots, queries SQL contra `eltemplo_staging` con `member_id` reales, y verificación visual de banners/leyendas. Automatizarlo sería un proyecto en sí mismo (e2e Playwright + DB seed) y excede el scope de Plan 06. El scaffold deja todo listo para que el humano ejecute paso a paso.
- **CHARGE-03 status: DONE / PENDING híbrido:** El código que cumple CHARGE-03 (atomicidad real via `tx` opcional + helper dentro del outer `db.transaction`) está merged en Plans 01 y 02. El **test directo** (Plan 03 — `charge-on-assign.test.ts`) es lo que demuestra el cumplimiento via mock-failure. Como Plan 03 no tiene SUMMARY.md merged al momento de este scaffold, el documento exige re-ejecutar el test antes del sign-off (PENDING en pre-flight checklist).
- **Plan 03 referenciado por path de archivo, no por commit hash:** El test file (`el-templo-api/test/subscriptions/charge-on-assign.test.ts`) existe en master según depende_on de Plan 06; el SUMMARY.md aún no está merged. La traceability matrix lo cita por archivo y por el comando de re-run.
- **Sign-off NO se firma dentro del scaffold:** Las casillas Approval están vacías. El humano firma post-smoke, post-merge a master, y antes del push a producción. El documento mismo NO autoriza el deploy.
- **Idioma de todo el documento: español** (per `response_language` del plan).

### Estructura del documento — verificación de acceptance

| Check                                                                  | Required | Actual | Pass |
| ---------------------------------------------------------------------- | -------- | ------ | ---- |
| `wc -l` (min_lines)                                                    | ≥80      | 242    | yes  |
| `grep -c "Escenario [1-5]"`                                            | ≥5       | 8      | yes  |
| `grep -c "CHARGE-0[123]"`                                              | ≥3       | 7      | yes  |
| `grep -c "Sign-Off"`                                                   | ≥1       | 1      | yes  |
| `grep -c "PENDING\|✅\|❌"`                                            | ≥10      | 16     | yes  |

## Files Created

- **`.planning/phases/107-cobro-al-asignar-plan/107-VERIFICATION.md`** (242 líneas, español)
  - Header + propósito del documento.
  - Traceability matrix CHARGE-01/02/03 con references a SUMMARY.md de plans 01-05.
  - Plans Status table con tests/verificación reales por plan.
  - 5 escenarios D-20 como PENDING (Cobro completo, Cobro parcial, Cambio con proration, Boarding pass, Logs estructurados).
  - Atomicity test re-run section (Plan 03).
  - Production Deploy Sign-Off section con D-21 (NO viernes) explícito en pre-flight checklist.
  - Issues Found tabla vacía.
  - Appendix con referencias cruzadas.

## Decisions Made

- **Documento como scaffold, no como verificación firmada:** El Plan 06 produce el documento estructurado; la firma humana viene en post-merge cuando el operador ejecuta el smoke contra staging. Esto separa "preparar el formulario" (Claude) de "ejecutar el smoke + firmar" (humano).
- **Granularidad de Steps en cada escenario:** Cada escenario incluye queries SQL concretas con WHERE clauses específicas (member_id, target_kind, target_id, created_at). Esto reduce la fricción del operador — el SQL está listo para copy-paste contra staging DB.
- **D-21 con verificación mecánica:** El pre-flight checklist incluye `date +%A ≠ Friday` como verificación literal — no solo "regla operativa", sino una check ejecutable.
- **Plan 03 sin SUMMARY merged: documentar el gap:** Plan 03 está en flight (test file existente, SUMMARY pendiente). El VERIFICATION.md lo refleja honestamente: status PENDING SUMMARY + comando de re-run obligatorio antes del sign-off. No oculta el gap.

## Deviations from Plan

None — plan executed as written. Task 2 (checkpoint:human-verify) deferido formalmente al merge bajo el modo `parallel_execution` per orchestrator instruction (objetivo del prompt).

## Known Stubs

- **5 escenarios D-20 con `Result: PENDING`** — esto NO es un stub del producto; es el comportamiento intencional del documento (placeholder para que el operador firme durante el smoke real). El scaffold está completo; lo que falta es la ejecución manual del smoke + sign-off humano.
- **`Last run: PENDING` en sección Atomicity** — placeholder para timestamp del re-run.
- **Approval fields vacíos** — placeholder para firma humana.

Estos placeholders son el output esperado del Plan 06 (scaffold con campos para llenar), no stubs de funcionalidad faltante.

## Threat Flags

Ninguno. Plan 06 modifica solo documentación dentro de `.planning/`; no introduce nueva superficie de red, auth, file access, ni cambios de schema.

## User Setup Required

Post-merge del worktree a master, el usuario (ignaciobordon@eltemplo.org) debe:

1. Confirmar que Plans 01-05 están deployados a staging (regla `feedback_staging_first_strict`).
2. Ejecutar los 5 escenarios D-20 contra staging.admin.eltemplo.org siguiendo los Steps del VERIFICATION.md.
3. Capturar evidencia (screenshots + SQL output + log excerpts) y completar la sección Evidence de cada escenario.
4. Re-ejecutar `cd el-templo-api && pnpm test --run test/subscriptions/charge-on-assign.test.ts` y registrar el output en la sección Atomicity.
5. Validar el pre-flight checklist completo. Verificar `date +%A ≠ Friday` antes de cualquier push.
6. Firmar la sección Approval con email + fecha + nota.
7. Pedir confirmación explícita antes de `git push origin master` (regla `feedback_ask_before_push`).

## Next Phase Readiness

- **Phase 107 cierre formal:** El VERIFICATION.md es el documento gating. Una vez firmado (post-smoke), Phase 107 está cerrada y CHARGE-01/02/03 quedan demostrablemente cumplidos.
- **Phase 108 ("Registrar pago"):** Desbloqueada arquitecturalmente — el modelo de cobros parciales ya está en producción tras el deploy de Phase 107. Phase 108 implementa el flow inverso (saldar deudas pendientes generadas por cobros parciales).
- **Auditoría de orphans históricos (potencial):** Per Phase 107 deferred (línea 241 de `107-CONTEXT.md`), si tras el deploy aparece evidencia de subscriptions sin transaction asociada (de antes del refactor de atomicidad), abrir tarea de limpieza. Phase 107 no hace backfill (D-19).

## Self-Check: PASSED

**Files exist:**
- FOUND: `.planning/phases/107-cobro-al-asignar-plan/107-VERIFICATION.md` (242 líneas)
- FOUND: `.planning/phases/107-cobro-al-asignar-plan/107-06-SUMMARY.md` (este archivo)

**Commits exist:**
- FOUND: `d009ec0f` docs(107-06): create VERIFICATION.md scaffold with D-20 smoke matrix

**Acceptance verification (Plan 06 Task 1):**
- `wc -l` → 242 (≥80 required)
- `grep -c "Escenario [1-5]"` → 8 (≥5 required)
- `grep -c "CHARGE-0[123]"` → 7 (≥3 required)
- `grep -c "Sign-Off"` → 1 (≥1 required)
- `grep -c "PENDING\|✅\|❌"` → 16 (≥10 required)

**Idioma:** español (validado por inspección — todos los headers, descripciones, Steps, Expected y notas están en español).

---

_Phase: 107-cobro-al-asignar-plan_
_Completed: 2026-04-28_
_Smoke + sign-off: PENDING (operador humano post-merge)_
