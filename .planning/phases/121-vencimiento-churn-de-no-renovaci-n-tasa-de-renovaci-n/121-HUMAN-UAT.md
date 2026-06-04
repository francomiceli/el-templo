---
status: partial
phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
source: [121-VERIFICATION.md]
started: "2026-06-04T00:00:00Z"
updated: "2026-06-04T00:00:00Z"
---

## Current Test

[awaiting human testing]

## Tests

### 1. CI verde en staging (suite de la fase)

expected: Los 3 archivos de test (churn.test.ts, renewal.test.ts, expiry-cohort.test.ts) pasan contra MySQL real en CI. Confirma especialmente que los fixes CR-01 (continuidad end_date > E) y CR-02 (scope same-branch) producen los resultados esperados — el caso D-04 (churn.test.ts:187) debe dar churn.nominal=1.
result: [pending]

### 2. Shape de respuesta GET /api/admin/analytics/churn

expected: Con datos reales en staging, el endpoint devuelve window (windowDays, churn{nominal,percentage,n}), comparison [5,10,15], enGracia, series con marca provisional, y breakdowns por branch/country/duration/plan. Acceso solo ADMIN (gestion → 403).
result: [pending]

### 3. Shape de respuesta GET /api/admin/analytics/renewal

expected: Con datos reales, devuelve renewal{nominal,percentage,n}, enGracia (número vivo), windowDays=15 por defecto (configurable vía ?window), y breakdowns 4 ejes. Acceso solo ADMIN.
result: [pending]

### 4. RENOV-01 — denominador compartido en datos reales

expected: Para filtros idénticos, renewal.renewal.n === churn.window.churn.n (misma cohorte de vencidos maduros). Verificar en staging con datos reales.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
