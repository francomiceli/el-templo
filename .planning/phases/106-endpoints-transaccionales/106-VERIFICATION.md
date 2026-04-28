# Phase 106 Verification

**Date:** 2026-04-28
**Verifier:** gsd-executor (Plan 106-06 Task 1)
**Outcome:** pass

## Requirements Traceability

| Req ID | Spec literal (REQUIREMENTS.md, pre-Task 1b)                                                      | Implemented (CONTEXT D-XX)                                                                                                                                                                                                                                                                                                                | Test Evidence                                                                                                 | Status                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| API-01 | POST /transactions atomic create with N links                                                    | finance/routes.ts L70-145 — handler delegates to TransactionService.create() which wraps in `db.transaction(...)` (transaction-service.ts L70)                                                                                                                                                                                            | transactions-api.test.ts C1..C6 (6/6)                                                                         | PASS                                                                                                                             |
| API-02 | POST /:id/void with reason                                                                       | finance/routes.ts L147-210 — TransactionService.void() L211 wraps in `db.transaction(...)` (L216)                                                                                                                                                                                                                                         | transactions-api.test.ts VC1..VC3 (3/3), VV1..VV4 (4/4)                                                       | PASS                                                                                                                             |
| API-03 | GET /members/:id/financial-history (DESC)                                                        | members/routes.ts L711-718 — handler imports finance service; `orderBy(desc(transactionDate))` at transaction-service.ts L292/394/518                                                                                                                                                                                                     | financial-history-api.test.ts FH1..FH6 (6/6); FH3 explicitly verifies DESC ordering                           | PASS                                                                                                                             |
| API-04 | GET /transactions paginated + filters                                                            | finance/routes.ts L216 (GET /transactions) + L278 (GET /transactions/summary); returns `PaginatedResult<TransactionListItem>` from shared/types.ts L10                                                                                                                                                                                    | transactions-api.test.ts L1..L10 (10/10)                                                                      | PASS                                                                                                                             |
| API-05 | `kind=adjustment` requires `owner`-only; otros kinds requieren `owner \| admin \| recepcionista` | D-01: `owner \| admin \| gestion` (FINANCE_ADJUSTMENT_ROLES, permissions.ts L88); D-02: `owner \| admin \| gestion \| recepcion` (FINANCE_WRITE_ROLES, permissions.ts L80). **DIVERGENCE: gestion added to both** (alineado con CAJA_ROLES existente; gestion ya opera caja). Per-handler check at routes.ts L75-80 (kind-discriminated). | transactions-api.test.ts D2 (recepcion + kind=adjustment → 403 ✓) + C2/C3/C5 (gestion + recepcion happy path) | Implemented per CONTEXT (locked decision) — DIVERGES from spec literal — see Spec Divergence Reconciliation below                |
| API-06 | `owner \| admin` (recepcionista excluido)                                                        | D-03: `owner \| admin \| gestion` (FINANCE_VOID_ROLES, permissions.ts L91); per-handler check at routes.ts L155-157.                                                                                                                                                                                                                      | transactions-api.test.ts VD1 (recepcion → 403 ✓), VD2 (coach → 403 ✓)                                         | Implemented per CONTEXT — gestion added (consistente con D-01/D-02 widening) — see Spec Divergence Reconciliation below          |
| API-07 | `owner \| admin \| coach \| recepcionista` con scope sucursal no-owners                          | D-04: `owner \| admin \| gestion \| recepcion` (FINANCE_READ_ROLES, permissions.ts L94); **coach EXCLUDED por privacy**. Module hook at routes.ts L54-65; D-04 override on /financial-history at members/routes.ts L722-727. **DIVERGENCE: scope is country, not branch** (D-05 alignment with reports).                                  | transactions-api.test.ts LD1 (coach → 403 ✓); financial-history-api.test.ts FHD1 (coach → 403 ✓)              | Implemented per CONTEXT — DIVERGES from spec on coach inclusion AND scope granularity — see Spec Divergence Reconciliation below |

## Spec Divergence Reconciliation

Three Phase 106 requirements (API-05, API-06, API-07) DIVERGE from the original REQUIREMENTS.md spec literal. The divergences are intentional and locked by `/gsd-discuss-phase` (CONTEXT.md decisions D-01..D-04). This section is the authoritative reconciliation record.

| Requirement | Spec literal (pre-Task 1b)                                                   | Implemented (D-XX)                                                                                | Divergence                                                       | Rationale                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API-05      | `kind=adjustment` → `owner` only; others → `owner \| admin \| recepcionista` | D-01: `owner \| admin \| gestion`; D-02: `owner \| admin \| gestion \| recepcion`                 | gestion added to BOTH lists                                      | gestion already operates caja in the existing operational model (CAJA_ROLES alignment). Spec literal predates that role widening.                                                                                                                                                                                                              |
| API-06      | `owner \| admin` (recepcionista excluded)                                    | D-03: `owner \| admin \| gestion`                                                                 | gestion added                                                    | Consistent with D-01/D-02 widening. recepcion still excluded for abuse risk per spec intent.                                                                                                                                                                                                                                                   |
| API-07      | `owner \| admin \| coach \| recepcionista`, branch-scoped for non-owners     | D-04: `owner \| admin \| gestion \| recepcion` (coach EXCLUDED); D-05: country scope (not branch) | (a) coach EXCLUDED for privacy; (b) scope is country, not branch | (a) Privacy: coach role serves training, not financial oversight — no business need for member financial history. (b) Country scope aligns with `attachCountryScope` middleware used by reports module; branch scope would require a separate middleware that does not yet exist (deferrable to a future phase if multi-branch admins emerge). |

Implementation status: each implemented row corresponds to a passing integration test (D2 / VD1, VD2 / LD1, FHD1). Reconciliation is complete via Task 1b — REQUIREMENTS.md API-05/06/07 text has been updated to match D-01..D-04 with a footnote pointing back to this section.

## ROADMAP Success Criteria

| #   | Criterion                                                                                                | Evidence                                                                                                                                                                                                                                                                       | Status |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | `POST /transactions` crea transacción + N links atómicamente en una transacción DB                       | finance/routes.ts L70 → transaction-service.ts L70 (`db.transaction`); test C1 verifies response.transaction + response.links + response.affectedBalances; test C6 pins BalanceRow shape                                                                                       | PASS   |
| 2   | `POST /transactions/:id/void` requires reason no vacío, marks audit, reverts links over saldos derivados | finance/routes.ts L147 → transaction-service.ts L211/216 (`db.transaction`); tests VC1..VC3 (happy path), VV1..VV4 (validation incl. empty reason → 400)                                                                                                                       | PASS   |
| 3   | `GET /members/:id/financial-history` chronological DESC                                                  | members/routes.ts L711-718 → transaction-service.ts L292 (`orderBy(desc(transactionDate))`); test FH3 explicitly verifies DESC ordering                                                                                                                                        | PASS   |
| 4   | `GET /transactions` paginated `PaginatedResult<T>` + filters                                             | finance/routes.ts L216, returns shape from shared/types.ts L10; tests L1..L10 cover all filter dimensions (kind, dates, paymentMethod, memberId, search, country, pagination)                                                                                                  | PASS   |
| 5   | RBAC enforced (ajustes / void / reads + scope)                                                           | shared/permissions.ts L80/88/91/94 (4 FINANCE\_\*\_ROLES constants); module hook at routes.ts L54-65 (FINANCE_READ_ROLES floor) + per-handler narrowing for adjustment (L75-80) and void (L155-157); D-04 privacy override on /financial-history at members/routes.ts L722-727 | PASS   |
| 6   | Tests integración cubren happy + RBAC + atomicidad                                                       | API tests: 60 files / 969 passed / 1 skipped (full suite green). Finance test files: transactions-api.test.ts (53 tests), financial-history-api.test.ts (16 tests), transaction-service.test.ts (atomicity coverage from Phase 105 + 106 extensions)                           | PASS   |

Bonus criterion: D-14 production 404 closure. CajaPage migration verified by `grep -rln "/admin/payments/" el-templo-admin/src` returning empty. See Production 404 Closure section.

## Decisions D-01..D-16 Traceability

| Decision                                         | Implementation Location                                                                                                                                                                      | Status |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D-01 FINANCE_ADJUSTMENT_ROLES                    | shared/permissions.ts L88 (`['owner','admin','gestion']`)                                                                                                                                    | PASS   |
| D-02 FINANCE_WRITE_ROLES                         | shared/permissions.ts L80 (`['owner','admin','gestion','recepcion']`)                                                                                                                        | PASS   |
| D-03 FINANCE_VOID_ROLES                          | shared/permissions.ts L91 (`['owner','admin','gestion']`)                                                                                                                                    | PASS   |
| D-04 FINANCE_READ_ROLES                          | shared/permissions.ts L94 (`['owner','admin','gestion','recepcion']`); members/routes.ts L722-727 privacy override (coach excluded)                                                          | PASS   |
| D-05 attachCountryScope reuse                    | finance/routes.ts L64 module hook (`await attachCountryScope(request, fastify.db)`)                                                                                                          | PASS   |
| D-06 branchId country guard on POST              | finance/routes.ts L70-145 (handler resolves branch.country pre-service); test S1 (cross-country POST → 403), S2 (control), S3 (owner bypass), S4 (404 on non-existent)                       | PASS   |
| D-07 target country guard on void                | finance/routes.ts L147-210 (handler resolves target's branch country pre-service); tests VS1 (cross-country → 404 info-leak avoidance), VS2 (owner bypass)                                   | PASS   |
| D-08 /api/admin/finance/ prefix                  | app.ts L155-156 (`app.register(financeRoutes, { prefix: "/api/admin/finance" })`)                                                                                                            | PASS   |
| D-09 /members/:id/financial-history sub-resource | members/routes.ts L711-718 (mounted on members module per D-09 sub-resource convention)                                                                                                      | PASS   |
| D-10 affectedBalances in create response         | finance/routes.ts L70-145 + Plan 02 C6 test (BalanceRow shape pinned: id, userId, targetKind, targetId, currency, amount typed)                                                              | PASS   |
| D-11 void response shape                         | finance/routes.ts L147-210 returns `{ transaction: { ..., voidedAt, voidedBy, voidReason } }`; test VC1 verifies                                                                             | PASS   |
| D-12 list filters                                | finance/transaction-service.ts L450+ (`list()` accepts branchId, kind, dateFrom, dateTo, memberId, paymentMethod, search, country); tests L1..L10                                            | PASS   |
| D-13 financial history conceptLabel              | finance/transaction-service.ts `getFinancialHistory()` (subscription-target JOIN producing conceptLabel); test FH4 explicitly verifies non-empty conceptLabel for target_kind='subscription' | PASS   |
| D-14 CajaPage migration                          | el-templo-admin/src/pages/CajaPage.vue uses `useTransactionsApi`; `grep -rln "/admin/payments/" el-templo-admin/src` returns empty                                                           | PASS   |
| D-15 surgical swap (no UI redesign)              | Plan 05 SUMMARY documents detail-dialog rewrite kept minimal; same q-cards, same table columns. Phase 109 owns redesign.                                                                     | PASS   |
| D-16 summary endpoint preserves legacy shape     | finance/routes.ts L278-... GET /transactions/summary returns `{ monthlyRevenue, revenueByMethod (5 keys), revenueByBranch }`; tests SU1..SU6 (6/6)                                           | PASS   |

## STRIDE Threat Register

| Threat                                | Mitigation                                                                                        | Test Evidence                                                                                                                                                  | Status    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| T-106-01 RBAC bypass                  | module hook (L54-65) + per-handler checks (L75-80, L155-157) + privacy override (members L722)    | D1 (coach POST → 403), D3 (unauth → 401), VD1, VD2, LD1, LD2, FHD1, FHD2                                                                                       | MITIGATED |
| T-106-02 Cross-country read           | scope.country in filters; 404 on cross-country reads                                              | LS1 (non-owner AR excludes ES), LS2 (owner sees both), FHS1 (cross-country → 404), FHS2 (owner bypass), L10 (non-owner override ignored), SU6 (summary scoped) | MITIGATED |
| T-106-03 branchId injection on writes | handler queries branch country pre-service                                                        | S1 (AR admin → ES branch → 403), S2 (control), S3 (owner bypass), S4 (non-existent → 404)                                                                      | MITIGATED |
| T-106-04 Void target injection        | handler queries target's branch country pre-service                                               | VS1 (cross-country → 404 info-leak avoidance), VS2 (owner bypass)                                                                                              | MITIGATED |
| T-106-05 SQL injection                | Drizzle parameterized + JSON Schema enums; NO Zod, NO request-interpolated raw sql template       | LV4 (kind enum), V2 (kind enum on POST), V5 (paymentMethod enum); grep `from "zod"` → 0 in src/modules/finance/; grep `sql\`...\${request.` → 0                | MITIGATED |
| T-106-06 kind=adjustment escalation   | per-handler FINANCE_ADJUSTMENT_ROLES check at L75-80 (after module-hook FINANCE_READ_ROLES floor) | D2 (recepcion + kind=adjustment → 403)                                                                                                                         | MITIGATED |
| T-106-07 Pagination bombing           | JSON Schema max 200 + service-side clamp                                                          | LV1 (limit=300 → 400), FHV1 (limit=300 → 400), LV2 (limit=0 → 400), LV3 (page=0 → 400)                                                                         | MITIGATED |
| T-106-08 Search field abuse           | indexed columns + maxLength=200 in JSON Schema; escaped via Drizzle parameterized like-builder    | accepted (no test for malicious search probe; covered by T-106-05 Drizzle parameterization)                                                                    | ACCEPTED  |

## Test Suite Outcomes

| Suite                                  | Result                                                    | Notes                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| el-templo-api `npx tsc --noEmit`       | PASS (exit 0)                                             | no errors                                                                                                                                                                                                                                                                                                                                       |
| el-templo-api `pnpm test` (full)       | PASS — 60 files / 969 tests passed / 1 skipped / 0 failed | Duration 405s; finance tests inside this count                                                                                                                                                                                                                                                                                                  |
| el-templo-admin `npx vue-tsc --noEmit` | 8 pre-existing errors (out of scope per Plan 06 brief)    | Errors live in: ProgramWizardDialog.vue, SesionesDePruebaDialog.vue, EditableBlockCard.vue, HorariosPage.vue, SessionEditPage.vue, session-pdf-builder.ts (×3). Plan 06 brief explicitly tolerated 3 pre-existing pdfmake errors; actual count is 8 — all unrelated to Phase 106 deliverables. Documented in 105-05 SUMMARY and 105-07 SUMMARY. |
| el-templo-admin `pnpm lint`            | PASS (exit 0) — 0 errors / 6 pre-existing warnings        | Warnings live in env.d.ts (1) + session-pdf-builder.ts (5) — out of scope                                                                                                                                                                                                                                                                       |
| el-templo-admin `pnpm build`           | PASS (exit 0)                                             | quasar build SPA mode, target es2022                                                                                                                                                                                                                                                                                                            |

## Production 404 Closure (D-14)

Pre-Phase 106 path: `GET /admin/payments/payments` → 404 (table dropped in Phase 105-07)
Post-Phase 106 path: `GET /admin/finance/transactions` → 200

grep evidence:

```
$ grep -rln "/admin/payments/" el-templo-admin/src
(no output)

$ grep -rnE '\busePaymentsApi\b' el-templo-admin/src
el-templo-admin/src/composables/useTransactionsApi.ts:2: * Transactions API composable (Phase 106). Replaces usePaymentsApi.

# Only a documentation comment in the new composable references the legacy name. No actual usage.
```

CajaPage.vue uses `useTransactionsApi` exclusively. The legacy `usePaymentsApi.ts` file was deleted in Plan 05 (commit c6be9b6f).

## Wave 4 File-Ownership Confirmation (Blocker #2 mitigation)

The plan-checker flagged a Wave 4 file conflict (Plan 04 and Plan 05 both touched finance/schemas.ts + finance/routes.ts). The revision moved the country querystring + owner-override into Plan 03 (Wave 3) and reduced Plan 05 Task 1 to a grep-only pre-flight verification. Confirmed at verification time:

- Plan 04 (Wave 4) modified: `el-templo-api/src/modules/finance/schemas.ts` (financialHistorySchema only — appended), `el-templo-api/src/modules/members/routes.ts` (mounted /financial-history handler), `el-templo-api/test/finance/financial-history-api.test.ts`.
- Plan 05 (Wave 4) modified: ONLY `el-templo-admin/*` files. ZERO API repo edits at execution time. Confirmed by Plan 05 SUMMARY commit log (`d954e92b`, `c6be9b6f`) — both touch only `el-templo-admin/*` + `.planning/*`.

grep evidence (post-execution):

```
$ grep -cE 'country.*type.*string.*minLength.*2' el-templo-api/src/modules/finance/schemas.ts
2

# Two `country` fields with minLength:2 maxLength:2 — one for GET /transactions (line 163), one for GET /transactions/summary (line 211). Both added by Plan 03, untouched in Wave 4.

$ grep -c "request.scope.isOwner" el-templo-api/src/modules/finance/routes.ts
4

# Four owner-aware code paths: POST /transactions, POST /transactions/:id/void, GET /transactions, GET /transactions/summary. Plan 02 added the writes (2), Plan 03 added the reads (2). Plan 05 SUMMARY canonical evidence (it observed prettier-formatted multi-line code that broke the literal `request.scope.isOwner.*request.query.country` regex; the functional contract IS in place).
```

Wave 4 file-ownership invariant intact. No conflicting overlap between Plan 04 and Plan 05 at execution time.

## Gaps / Follow-ups

None. All 6 ROADMAP success criteria, all 7 requirements, all 16 decisions, and 7 of 8 STRIDE threats are MITIGATED (T-106-08 ACCEPTED via Drizzle parameterization umbrella per T-106-05). All gates pass.

## Sign-off

Automated verification: PASS (Task 1)
REQUIREMENTS.md reconciliation (Task 1b): PASS — see API-05/06/07 reconciled with footnotes pointing here.
Human-verify (Task 2): pending — awaiting human checkpoint per Plan 06 Task 2 (CajaPage.vue smoke test in dev environment).
