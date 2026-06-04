# Phase 121 — Vencimiento (Churn + Renovación) — HANDOFF 2026-06-04

**Milestone:** v5.0 Métricas de Gestión · **Fase 121 de 4** (120 ✓, 121 acá, 122 LTV, 123 Frecuencia+Funnel)

## Estado: CÓDIGO COMPLETO + VERIFICADO (human_needed). SIN PUSH.

Los 3 planes ejecutados, code review aplicado (2 blockers arreglados), verificación 10/10
must-haves en código. Todo commiteado en `staging` **local**. Nada pusheado a `origin`.

## Lo que se construyó (backend-only, `el-templo-api/src/modules/analytics/`)

- **121-01** `expiry-cohort.ts` (motor compartido): `expiryCohortConditions`, `lastExpiryPerPersonExpr`,
  `retainedExpr`, `maturedExpr`, `RENOVATION_WINDOW_DEFAULT_DAYS=15`, `CHURN_COMPARISON_WINDOWS=[5,10,15]`
  - tipos `ChurnAnalytics`/`RenewalAnalytics` en `types.ts`.
- **121-02** `churn-service.ts` (`ChurnService.getChurn`): churn person-based, multi-N 5/10/15, madurez D-08,
  serie mensual provisoria, breakdowns 4 ejes. `GET /api/admin/analytics/churn` (ADMIN). Deprecación D-09
  de `countChurnedMembers` + `computeRetentionRate`.
- **121-03** `renewal-service.ts` (`RenewalService.getRenewal`): renovados÷vencidos sobre la MISMA cohorte
  (RENOV-01), número vivo `enGracia`, breakdowns. `GET /api/admin/analytics/renewal` (ADMIN). Deprecación
  D-09 de `getRenewalRate`.

## Code review — 2 BLOCKERS arreglados (commit `70967c7d`)

- **CR-01**: `retainedExpr` no tenía continuidad → un ciclo previo del mismo socio lo marcaba "retenido"
  (contradecía `churn.test.ts:187` D-04, HABRÍA ROTO CI). Fix: `AND s_next.end_date > E` (la continuación
  debe extender el vencimiento; early renewal sigue contando por el techo `<= E+window`). + excluye paused.
- **CR-02**: subqueries correlacionados (`retainedExpr`, `lastExpiryPerPersonExpr`) sin filtro de scope →
  fuga cross-sede. Fix: `AND s*.branch_id = E.branch_id` (regla **misma sede**, decisión del usuario).
- Verificado contra los 4 tests de retención/renovación (D-04 churned, duration-change, early-renewal,
  RENOV-01) — todos consistentes con el fix. `tsc --noEmit` limpio.

## Warnings/Info ABIERTOS (no críticos, no rompen CI — diferidos a decisión)

Ver `.planning/phases/121-.../121-REVIEW.md`:

- WR-01: eje country agrupa por país del plan vs país de sucursal del scope.
- WR-02: `select userId` muerto (dedup JS inexistente).
- WR-03: coerción implícita `Number(r.matured)===1` de expr boolean SQL (tests lo envuelven en CASE WHEN).
- WR-04: reconciliación serie/headline sin pin de test.
- - 3 info (4x cohort scans redundantes, test faltante del caso CR-01, literal mágico 15).

## PRÓXIMOS PASOS (mañana)

1. **Paso 0 — pushear a `origin/staging` para disparar CI** (REQUIERE CONFIRMACIÓN). Los 3 tests son
   CI-only (MySQL real); confirman la correctitud real de CR-01/CR-02.
   - Branch actual: `staging`. Commits relevantes desde `7459b4e4`: planes 121-01/02/03 + fix `70967c7d`
     - docs review/UAT.
2. **Si CI verde → UAT manual** de los 4 ítems en `121-HUMAN-UAT.md`:
   shape de `GET /churn`, shape de `GET /renewal`, RENOV-01 (`renewal.n === churn.window.churn.n`).
3. **Marcar fase completa**: la verificación quedó `human_needed`; al aprobar UAT, correr el cierre
   (ROADMAP/STATE ya fueron marcados Complete por los executors — consistente al pasar UAT).
4. **(Opcional)** decidir si arreglar las warnings WR-01..04 antes o después.
5. Luego: `/gsd-plan-phase 122` (LTV — depende del churn de esta fase).

## Verificación / referencia

- `.planning/phases/121-.../121-VERIFICATION.md` (status human_needed, 10/10)
- `.planning/phases/121-.../121-HUMAN-UAT.md` (4 ítems pending)
- `.planning/phases/121-.../121-REVIEW.md` (2 críticos resueltos, 4 warn + 3 info abiertos)
