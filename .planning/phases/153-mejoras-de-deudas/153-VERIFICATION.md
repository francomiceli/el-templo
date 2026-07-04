---
phase: 153-mejoras-de-deudas
verified: 2026-07-04T21:00:00Z
status: human_needed
score: 4/4 must-haves verified (roadmap Success Criteria) — 0 blockers, 0 gaps
overrides_applied: 0
human_verification:
  - test: "Gating visual del hub de Deudas por rol"
    expected: "Coach ve SOLO el tab 'Por socio'. gestion/admin/owner ven los 3 tabs (Por socio/Por deuda/Vencidos), con 'Por socio' como tab por defecto al entrar a /deudas."
    why_human: "El grep confirma el cómputo `canSeeDetail`/`visibleTabs` en el código, pero la UX real (login como cada rol, click en tabs, fallback cuando se fuerza ?tab=porDeuda como coach) requiere navegador."
  - test: "Columnas nuevas del tab 'Por deuda' (Motivo/Fecha de registro/Período/tooltip de nota)"
    expected: "Cada fila muestra 'Cuota {plan}' o 'Sin plan'/'Otro' en Motivo, el período dd/mm–dd/mm como subtítulo cuando aplica, la fecha de registro, y la nota libre aparece en un tooltip al pasar el mouse sobre el ícono junto al Motivo (solo si notes existe)."
    why_human: "Verificado a nivel de código (bindings correctos), pero el layout final (subtítulo, tooltip, truncamiento de texto largo) es visual."
  - test: "Export Excel de 'Por deuda' con las 3 columnas nuevas"
    expected: "El archivo .xlsx descargado incluye 'Motivo', 'Período' y 'Fecha de registro' con valores legibles (no vacío, no '[object Object]')."
    why_human: "Cubierto por test automatizado EXPORT-COLUMNS (corre en CI), pero abrir el archivo real y verificar formato humano-legible es una revisión visual."
  - test: "Tab 'Vencidos': orden, ausencia de monto, mensaje de tabla vacía"
    expected: "Lista ordenada por vencimiento más reciente primero, sin columna de monto/moneda, mensaje 'No hay socios con plan vencido sin renovar' cuando el cohorte está vacío."
    why_human: "Confirmado en código (grep de columnas y ausencia de amount/currency), pero el render final y el mensaje de estado vacío requieren inspección visual."
  - test: "ReportesPage sin el reporte de Deudas — no quedan links rotos"
    expected: "Navegar a /reportes?tab=deudas no rompe la página (degrada a 'accesos' u otro tab válido); el tab 'Deudas' ya no aparece en Reportes."
    why_human: "Confirmado por grep (0 referencias a DeudasReport en ReportesPage.vue), pero la navegación real con el query param forzado es un caso de UX a click-test."
  - test: "Suite de tests nuevos/extendidos pasa en CI (vitest run)"
    expected: "outstanding-balances.test.ts (incluye REASON-CUOTA/SIN-PLAN/OTRO/ORPHAN/REGISTERED-AT/MULTI-ORIGIN/VOIDED-ORIGIN/EXPORT-COLUMNS) y expired-members.test.ts (incluye ventana 60d/RBAC/RENEWED-SCHEDULED/SOFT-DELETED/BOUNDARY-60/BRANCH-FILTER/OWNER-COUNTRY/PAGINATION) pasan en verde en CI."
    why_human: "Por preferencia explícita del usuario, el suite NO se corre localmente (corre en CI al pushear). No hay evidencia de una corrida de CI para el estado actual del branch — se verificó que ambos archivos de test compilan (tsc aislado sin errores propios) y que los nombres de los casos declarados en 153-REVIEW.md/WR-08 existen en el archivo, pero la ejecución real queda pendiente de CI."
---

# Phase 153: Mejoras de Deudas Verification Report

**Phase Goal:** Cada deuda muestra fecha de registro, motivo y pago/plan asociado, y la vista de Deudas incluye también a los socios con plan vencido sin renovar, para gestionar el negocio desde una sola pantalla. End state: la lista de Deudas gana fecha de registro, motivo (reutilizando el campo de v5.3), y la asociación a plan+período; y suma la cohorte de no-renovaciones.

**Verified:** 2026-07-04
**Status:** human_needed
**Re-verification:** No — initial verification (nota: existía un 153-REVIEW.md de code-review adversarial con 8 warnings, TODOS marcados como fixed en commits de seguimiento; esta verificación confirma esos fixes contra el estado ACTUAL del código, no solo contra la narrativa del REVIEW).

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| #   | Truth                                                                                     | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Cada deuda muestra la fecha desde que se registró (DEUDA-01)                              | ✓ VERIFIED | `service.ts` calcula `registeredAt` = date-portion de `balances.createdAt` para TODAS las filas (helper `isoDatePortionOB`); mapeado en `getOutstandingBalances` y `exportOutstandingBalances`. Columna "Fecha de registro" renderizada en `PorDeudaTab.vue:126` y en el Excel export (`routes.ts`). Test `REGISTERED-AT` en `outstanding-balances.test.ts`.                         |
| 2   | Cada deuda muestra su motivo, reutilizando `misc_reason` de v5.3, sin duplicar (DEUDA-02) | ✓ VERIFIED | `reasonLabel` derivado: "Cuota {plan}" para subscription, "Sin plan"/"Otro" desde `financialTransactions.miscReason` (enum existente, fase 145) vía `buildDebtOriginTxSubquery`, "Saldo a regularizar" para huérfanos. Sin campo nuevo en DB — 100% derivado. Tests REASON-CUOTA/REASON-SIN-PLAN/REASON-OTRO/REASON-ORPHAN. Nota libre en tooltip (`PorDeudaTab.vue:107-109`, D-11). |
| 3   | Cada deuda muestra a qué pago/plan está asociada — plan y período (DEUDA-03)              | ✓ VERIFIED | `periodStart`/`periodEnd` = `subscriptions.startDate`/`endDate` para deudas de cuota, `null` para cobros sueltos. Renderizado como subtítulo `dd/mm–dd/mm` en `PorDeudaTab.vue` y como columna "Período" en el Excel (`formatPeriodDDMM`).                                                                                                                                           |
| 4   | La vista de Deudas incluye a los socios con plan vencido sin renovar (DEUDA-04)           | ✓ VERIFIED | `GET /api/admin/reports/expired-members` implementado (`getExpiredMembers`, ventana 60d, exclusión de dato sucio `end_date >= start_date`, negación de `activeMemberExists`, dedup por miembro). Tab "Vencidos" wireado en `DeudasPage.vue` con `VencidosTab.vue` (sin monto, D-06). Guard `CAJA_ROLES` heredado — coach/recepción 403.                                              |

**Score:** 4/4 truths verified.

### Required Artifacts

| Artifact                                                  | Expected                                                                                | Status     | Details                                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/reports/service.ts`            | `getOutstandingBalances`/`exportOutstandingBalances` enriquecidos + `getExpiredMembers` | ✓ VERIFIED | Ambos métodos presentes, helper de derivación único (`deriveEffectiveDateAndLabelOB` superset), `buildDebtOriginTxSubquery` compartida. |
| `el-templo-api/src/modules/reports/types.ts`              | `OutstandingBalanceRow` con 5 campos + trío `ExpiredMember*`                            | ✓ VERIFIED | `reasonLabel`/`periodStart`/`periodEnd`/`registeredAt`/`notes` presentes; `ExpiredMemberRow` sin `amount`/`currency`.                   |
| `el-templo-api/src/modules/reports/routes.ts`             | ruta `/expired-members` + columnas Excel nuevas                                         | ✓ VERIFIED | Ruta dentro de `reportsRoutes` (hereda guard), sin preHandler de rol propio. Excel gana "Motivo"/"Período"/"Fecha de registro".         |
| `el-templo-api/test/reports/outstanding-balances.test.ts` | cobertura motivo/período/fecha + WR-04/WR-08                                            | ✓ VERIFIED | Casos REASON-\*, REGISTERED-AT, MULTI-ORIGIN, VOIDED-ORIGIN, EXPORT-COLUMNS presentes.                                                  |
| `el-templo-api/test/reports/expired-members.test.ts`      | cobertura ventana/RBAC/scope + WR-01/02/03/08                                           | ✓ VERIFIED | RENEWED-SCHEDULED, SOFT-DELETED, BOUNDARY-60, BRANCH-FILTER, OWNER-COUNTRY, PAGINATION presentes.                                       |
| `el-templo-admin/src/constants/deudas.ts`                 | `DEUDAS_TABS`/`DEUDAS_DEFAULT_TAB`/`DEUDAS_TAB_NAMES`                                   | ✓ VERIFIED | Contrato de tabs correcto (`porSocio` default), incluye `vencidos`.                                                                     |
| `el-templo-admin/src/pages/DeudasPage.vue`                | hub de 3 tabs con `?tab=` sync + gating                                                 | ✓ VERIFIED | `q-tabs`/`q-tab-panels`, `canSeeDetail`/`visibleTabs`, `tabFromQuery` cae al default.                                                   |
| `el-templo-admin/src/components/deudas/PorSocioTab.vue`   | extracción verbatim (useCoachApi)                                                       | ✓ VERIFIED | Usa `useCoachApi`, no `useTransactionsApi` (D-01 respetado).                                                                            |
| `el-templo-admin/src/components/deudas/PorDeudaTab.vue`   | Motivo/Fecha de registro/período/tooltip                                                | ✓ VERIFIED | `reasonLabel`, `registeredAt`, `q-tooltip` con `notes` presentes; consume `/admin/reports/outstanding-balances`.                        |
| `el-templo-admin/src/components/deudas/VencidosTab.vue`   | tabla read-only sin monto                                                               | ✓ VERIFIED | `expiryDate`/`daysOverdue` presentes; 0 ocurrencias de `amount`/`currency`/whatsapp.                                                    |
| `el-templo-admin/src/components/DeudasReport.vue`         | debe estar borrado                                                                      | ✓ VERIFIED | Archivo no existe (`ls` confirma).                                                                                                      |
| `el-templo-admin/src/pages/ReportesPage.vue`              | sin referencias a Deudas                                                                | ✓ VERIFIED | 0 matches de `DeudasReport`/`deudas` en el archivo.                                                                                     |

### Key Link Verification

| From                          | To                                                    | Via                                                             | Status  | Details                                                                                                                  |
| ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `service.ts`                  | `transaction_links → financial_transactions`          | `buildDebtOriginTxSubquery`                                     | ✓ WIRED | Join gateado por `targetKind='debt_balance'`, filtra `kind='advance_payment'` y `voidedAt IS NULL` (WR-04 fix aplicado). |
| `getOutstandingBalances`      | `exportOutstandingBalances`                           | helper de derivación compartido                                 | ✓ WIRED | Ambos invocan el mismo helper superset — DRY confirmado.                                                                 |
| `getExpiredMembers`           | `activeMemberExists`                                  | negación del predicado canónico + exclusión `scheduled` (WR-01) | ✓ WIRED | `NOT activeMemberExists(...)` + `NOT EXISTS (... IN ('active','paused','scheduled') ...)` presentes.                     |
| `reports/routes.ts onRequest` | `CAJA_ROLES`                                          | guard plugin-level                                              | ✓ WIRED | Ruta `/expired-members` no declara preHandler de rol propio; tests RBAC1/RBAC2 confirman 403 para coach/recepción.       |
| `DeudasPage.vue`              | `PorSocioTab.vue`/`PorDeudaTab.vue`/`VencidosTab.vue` | `q-tab-panels` + componentes hijos                              | ✓ WIRED | Los 3 componentes importados y renderizados condicionalmente por `canSeeDetail`.                                         |
| `PorDeudaTab.vue`             | `/admin/reports/outstanding-balances`                 | `useTransactionsApi.getOutstandingBalances`                     | ✓ WIRED | Confirmado por grep + tipo `OutstandingBalanceRow` extendido en `types/transaction.ts`.                                  |
| `VencidosTab.vue`             | `/admin/reports/expired-members`                      | `useTransactionsApi.getExpiredMembers`                          | ✓ WIRED | Composable + endpoint confirmados.                                                                                       |

### Data-Flow Trace (Level 4)

| Artifact          | Data Variable  | Source                                                                                                                                            | Produces Real Data               | Status    |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| `PorDeudaTab.vue` | `items` (rows) | `useTransactionsApi.getOutstandingBalances()` → `service.getOutstandingBalances()` → SQL real sobre `balances`+`subscriptions`+derived table      | Sí (join real, no static return) | ✓ FLOWING |
| `VencidosTab.vue` | `items` (rows) | `useTransactionsApi.getExpiredMembers()` → `service.getExpiredMembers()` → SQL real sobre `subscriptions`+`users`+`branches`+`activeMemberExists` | Sí                               | ✓ FLOWING |

### Post-Review Fix Verification (153-REVIEW.md, 8 Warnings)

Todos los 8 warnings del code-review adversarial fueron verificados contra el código ACTUAL (no solo contra la narrativa de resolución del REVIEW):

| ID    | Descripción                                          | Commit     | Verificado en código actual                                                                                             |
| ----- | ---------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------- |
| WR-01 | Excluir socios con renovación `scheduled`            | `4dea399e` | ✓ `NOT EXISTS (... IN ('active','paused','scheduled') ...)` en `service.ts` + test `RENEWED-SCHEDULED`                  |
| WR-02 | Excluir socios soft-deleted                          | `4a82abce` | ✓ `isNull(schema.users.deletedAt)` en conds + test `SOFT-DELETED`                                                       |
| WR-03 | Paginación determinística (tiebreaker)               | `ea4d23a4` | ✓ `a.daysOverdue - b.daysOverdue                                                                                        |     | a.userId - b.userId`(JS) +`balances.id ASC`(SQL) + test`PAGINATION` |
| WR-04 | Excluir advance_payment anulado en origen del motivo | `e3b8d4b1` | ✓ `isNull(schema.financialTransactions.voidedAt)` en `buildDebtOriginTxSubquery` + tests `MULTI-ORIGIN`/`VOIDED-ORIGIN` |
| WR-05 | Fail-closed ante `scope.country === null`            | `6405f280` | ✓ Guard 403 "Scope de país no resuelto" en 3 handlers (`routes.ts:274,338,654`)                                         |
| WR-06 | Moneda correcta en totales flat (no ARS hardcode)    | `0b659d83` | ✓ `flatCurrency` derivado de `items.value[0]?.currency` en `PorDeudaTab.vue`                                            |
| WR-07 | Race condition entre `load(true)`/`load(false)`      | `66d11ade` | ✓ `requestSeq` token en `PorDeudaTab.vue` y `VencidosTab.vue`                                                           |
| WR-08 | Gaps de cobertura de tests                           | `d3977ca4` | ✓ Todos los casos nombrados existen en ambos archivos de test                                                           |

Todos los commits de fix existen en el historial de git y el contenido resultante está presente en el árbol de trabajo actual.

### Automated Gates

| Gate                                           | Command                                             | Result                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API typecheck                                  | `cd el-templo-api && pnpm exec tsc --noEmit`        | ✓ PASS (sin errores)                                                                                                                                                    |
| Admin lint                                     | `cd el-templo-admin && pnpm lint`                   | ✓ PASS (0 errores; 9 warnings pre-existentes en archivos ajenos a la fase)                                                                                              |
| Test files aislados (fuera del include de tsc) | `tsc --noEmit` directo sobre los 2 archivos de test | ✓ PASS (0 errores propios de los archivos de la fase; errores encontrados son pre-existentes en `campaigns/templates.ts` y `test/helpers.ts`, no tocados por esta fase) |

### Requirements Coverage

| Requirement | Source Plan    | Description                            | Status      | Evidence                                           |
| ----------- | -------------- | -------------------------------------- | ----------- | -------------------------------------------------- |
| DEUDA-01    | 153-01, 153-03 | Fecha desde que se registró la deuda   | ✓ SATISFIED | `registeredAt` derivado y renderizado              |
| DEUDA-02    | 153-01, 153-03 | Motivo reutilizando `misc_reason` v5.3 | ✓ SATISFIED | `reasonLabel` derivado, sin campo nuevo en DB      |
| DEUDA-03    | 153-01, 153-03 | Plan + período asociado                | ✓ SATISFIED | `periodStart`/`periodEnd` derivados y renderizados |
| DEUDA-04    | 153-02, 153-04 | Cohorte de vencidos sin renovar (60d)  | ✓ SATISFIED | `/expired-members` + tab "Vencidos"                |

No hay requirements huérfanos: los 4 IDs de REQUIREMENTS.md (DEUDA-01..04) están mapeados a Phase 153 y cubiertos por al menos un plan.

### Anti-Patterns Found

Ninguno. Escaneados los 15 archivos tocados (según `153-REVIEW.md files_reviewed_list`) por `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|console\.(log|warn|error)` — 0 resultados relevantes (un falso positivo: la palabra española "TODO" en un comentario de `types.ts` no relacionado con esta fase).

### Human Verification Required

Ver bloque YAML de frontmatter `human_verification`. Resumen: 4 checks visuales de UX (gating por rol, columnas/tooltip de "Por deuda", tabla "Vencidos", no-links-rotos en Reportes) + 1 check de confirmación de que el suite de tests extendido efectivamente pasa en CI (no se corrió localmente por preferencia explícita del usuario, y no hay evidencia de una corrida de CI reciente contra este estado del código).

### Gaps Summary

No se encontraron gaps de código. Los 4 truths del roadmap (DEUDA-01..04) están verificados con evidencia directa en el código actual, incluyendo la confirmación de que los 8 warnings del code-review adversarial (153-REVIEW.md) fueron efectivamente corregidos en el HEAD actual (no solo declarados como fixed en el reporte). El único motivo por el que el status no es `passed` es la presencia de ítems que requieren verificación humana (visual/UX + confirmación de CI), lo cual — por la matriz de decisión del proceso de verificación — obliga a `human_needed` incluso con score 4/4 y 0 blockers.

---

_Verified: 2026-07-04_
_Verifier: Claude (gsd-verifier)_
