---
phase: 108-pago-de-saldo-historial-financiero
plan: 03
subsystem: admin-frontend / finance
tags: [phase-108, finance, types, composable, frontend, foundation]
dependency_graph:
  requires:
    - "Phase 106 GET /admin/members/:id/financial-history endpoint (operacional desde 106-04)"
    - "Phase 106 POST /admin/finance/transactions endpoint (operacional desde 106-01)"
    - "Phase 106 POST /admin/finance/transactions/:id/void endpoint (preexistente — no usado en este plan)"
    - "Phase 108-01 backend GET /admin/members/:id/outstanding-concepts (en construcción wave paralela; el composable lo consumirá una vez disponible)"
  provides:
    - "Type OutstandingConcept (D-01 mirror)"
    - "Type FinancialHistoryItem (mirror del backend api/finance/types.ts:126-139)"
    - "Type RegisterPaymentInput (D-22 payload)"
    - "Type CreateTransactionResponse (mirror del backend api/finance/types.ts:143-147)"
    - "Composable methods: getOutstandingConcepts, getFinancialHistory, createTransaction"
  affects:
    - "Plan 108-04 (RegisterPaymentDialog) — importa OutstandingConcept, RegisterPaymentInput, getOutstandingConcepts, createTransaction"
    - "Plan 108-05 (FinancialHistoryTab) — importa FinancialHistoryItem, getFinancialHistory, voidTransaction (preexistente)"
tech-stack:
  added: []
  patterns:
    - "Reuso de PaginatedResult<T> canonical (src/types/report.ts) en lugar de un PaginatedFinancialHistory custom"
    - "Mirror inline del FinancialTransactionRow (Drizzle inferSelect) dentro de FinancialHistoryItem.transaction y CreateTransactionResponse.transaction — evita acoplar el admin al schema Drizzle del backend"
    - "Patrón try/catch/finally con loading + error + extractError (analog directo a voidTransaction:40-58)"
key-files:
  created: []
  modified:
    - "el-templo-admin/src/types/transaction.ts (+135 lines, 5 nuevos exports: OutstandingConcept, FinancialHistoryItem, RegisterPaymentInput, CreateTransactionResponse, plus VoidTransactionInput preexistente)"
    - "el-templo-admin/src/composables/useTransactionsApi.ts (+79 lines, 3 nuevos métodos: getOutstandingConcepts, getFinancialHistory, createTransaction)"
decisions:
  - "Reusar PaginatedResult<T> canonical (shape {rows, total, page, limit}) en vez de inventar PaginatedFinancialHistory con shape {items, hasMore} como sugería el plan — verificación contra src/types/report.ts:52-57 confirmó la canonical shape, evita drift entre admin y backend."
  - "FinancialHistoryItem.transaction modelado como inline shape literal (NO como import del backend) — admin no debe acoplarse al inferSelect de Drizzle; mirror manual con campos explícitos."
  - "RegisterPaymentInput.kind tipado como literal 'debt_settlement' y .direction como literal 'inflow' (NO unión amplia) — la API expuesta es solo para el flujo de pago de saldo del Plan 108-04. Si futuras fases necesitan el genérico, agregar un CreateTransactionInput separado."
  - "CreateTransactionResponse mirror minimal del backend: incluye transaction + links + affectedBalances (los 3 campos del shape backend), pero los rich row types (TransactionLinkRow, BalanceRow) se inlinean en lugar de importarse. Mantiene boundary admin/api claro."
metrics:
  duration: "~25 min"
  completed: "2026-04-28"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
  commits: 2
---

# Phase 108 Plan 03: Composable y Types Frontend Summary

Foundation typing + HTTP wrappers para Plans 108-04 y 108-05. Extiende `useTransactionsApi` con 3 métodos (`getOutstandingConcepts`, `getFinancialHistory`, `createTransaction`) y agrega 4 types canonicales en `transaction.ts` (`OutstandingConcept`, `FinancialHistoryItem`, `RegisterPaymentInput`, `CreateTransactionResponse`) — todos mirror del backend per CONTEXT D-01/D-22 y PATTERNS §6/§7.

## Tasks

### Task 1: Add OutstandingConcept, FinancialHistoryItem, RegisterPaymentInput types
- **Status:** Done
- **Commit:** `a1090d01`
- **Files:** `el-templo-admin/src/types/transaction.ts` (+135 lines)
- **What:** Append-only edit. 4 nuevos exports + comentarios explicativos. NO redefine ni modifica `TargetKind`, `TransactionKind`, `TransactionDirection`, `PaymentMethod`, `TransactionListItem`, `VoidTransactionInput` ni los maps existentes.
- **Decisión clave:** Reusé `PaginatedResult<T>` canonical (de `src/types/report.ts:52-57`, shape `{rows, total, page, limit}`) en lugar del `PaginatedFinancialHistory` con shape `{items, hasMore}` que sugería el plan. La verificación contra el código real confirmó la canonical shape — evita drift entre admin y backend.

### Task 2: Add getOutstandingConcepts, getFinancialHistory, createTransaction methods
- **Status:** Done
- **Commit:** `eefcf6dc`
- **Files:** `el-templo-admin/src/composables/useTransactionsApi.ts` (+79 lines, 0 deletions)
- **What:** 3 nuevos métodos siguiendo el patrón existente `try/catch/finally + loading + error + extractError` (analog directo a `voidTransaction:40-58`). Imports type-only sumados al import block existente. Return object extendido con los 3 nuevos exports — `cleanup` permanece al final como en el original.
- **Verificación:** `git diff --stat` confirma 79 insertions, 0 deletions — los métodos preexistentes (`listTransactions`, `voidTransaction`, `getSummary`, `cleanup`) NO fueron modificados.

## Verification

```
$ grep -nE "^export interface (OutstandingConcept|FinancialHistoryItem|RegisterPaymentInput|CreateTransactionResponse|VoidTransactionInput)" el-templo-admin/src/types/transaction.ts
148:export interface VoidTransactionInput {
159:export interface OutstandingConcept {
184:export interface FinancialHistoryItem {
224:export interface RegisterPaymentInput {
251:export interface CreateTransactionResponse {

$ grep -nE "(getOutstandingConcepts|getFinancialHistory|createTransaction)" el-templo-admin/src/composables/useTransactionsApi.ts
69:  async function getOutstandingConcepts(memberId: number): Promise<OutstandingConcept[]> {
90:  async function getFinancialHistory(
116:  async function createTransaction(
163:    getOutstandingConcepts,
164:    getFinancialHistory,
165:    createTransaction,

$ grep -n "outstanding-concepts" el-templo-admin/src/composables/useTransactionsApi.ts
74:        `/admin/members/${memberId}/outstanding-concepts`

$ grep -nE ":\s*any\b|<any>|as\s+any" el-templo-admin/src/types/transaction.ts el-templo-admin/src/composables/useTransactionsApi.ts
(no matches)
```

- TypeScript: `pnpm exec tsc --noEmit -p tsconfig.json` reporta cero errores en `transaction.ts` y `useTransactionsApi.ts`. (Errores preexistentes en `src/utils/pdf/session-pdf-builder.ts` no relacionados con este plan — fuera de scope per Scope Boundary.)
- ESLint: `pnpm exec eslint src/types/transaction.ts src/composables/useTransactionsApi.ts` reporta cero issues.
- Sin `any` types — cumple CLAUDE.md.

## Acceptance Criteria

| Criterio | Estado |
|----------|--------|
| 4 types nuevos en transaction.ts (OutstandingConcept, FinancialHistoryItem, RegisterPaymentInput, VoidTransactionInput) | ✓ — VoidTransactionInput preexistía; agregué los 3 nuevos + CreateTransactionResponse como bonus |
| 3 métodos nuevos en useTransactionsApi (getOutstandingConcepts, getFinancialHistory, voidTransaction o registerPayment) | ✓ — getOutstandingConcepts, getFinancialHistory, createTransaction. voidTransaction preexistía sin cambios |
| No `any` types | ✓ — cero matches |
| vue-tsc clean en archivos modificados | ✓ — `tsc --noEmit` (vue-tsc no instalado en el repo, usé tsc nativo) cero errores en los 2 archivos |
| Grep acceptance del plan | ✓ — todos los grep checks pasan |
| `RegisterPaymentInput.kind` literal 'debt_settlement' | ✓ — línea 226 del file |
| `RegisterPaymentInput.direction` literal 'inflow' | ✓ — línea 227 del file |
| Existing methods no modificados | ✓ — `git diff --stat` confirma 79 insertions, 0 deletions en composable |
| SUMMARY.md committed | ✓ (este file) |

## Deviations from Plan

### Type-shape adjustments (Rule 1 — match real backend, no fabricar)

**1. Reemplazo de `PaginatedFinancialHistory` por `PaginatedResult<FinancialHistoryItem>`**
- **Found during:** Task 1 — al hacer `read_first` del backend (`api/src/modules/shared/types.ts:10-15`) y del admin (`src/types/report.ts:52-57`).
- **Issue:** El plan describía `PaginatedFinancialHistory { items, total, page, limit, hasMore }`. El shape real canonical (en ambos lados) es `PaginatedResult<T> { rows, total, page, limit }` — no tiene `items` ni `hasMore`.
- **Fix:** Importé `PaginatedResult` ya existente desde `src/types/report.ts` y tipé `getFinancialHistory` como `Promise<PaginatedResult<FinancialHistoryItem>>`. NO definí un nuevo type que hubiera divergido del backend.
- **Files modified:** Composable usa el import preexistente; no agregué nuevo type al transaction.ts.
- **Commit:** Tareas 1 y 2 (a1090d01, eefcf6dc).

**2. Adición de `CreateTransactionResponse` (no requerido pero alineado con backend)**
- **Found during:** Task 2 — al definir el return type de `createTransaction`.
- **Issue:** El plan dejó el return type abierto ("verificar con grep al backend"). El backend (`api/finance/routes.ts:127-132` + `types.ts:143-147`) retorna `{ transaction, links, affectedBalances }` — NO `{ transaction: TransactionListItem }` como pre-asumía el comentario del plan.
- **Fix:** Agregué `CreateTransactionResponse` interface en `transaction.ts` como mirror del shape real, y tipé el return de `createTransaction` con ese type. Evita que Plan 108-04 trate el response como `{ transaction: TransactionListItem }` y se rompa al intentar acceder a `affectedBalances` (que el dialog probablemente quiera mostrar).
- **Files modified:** transaction.ts (Task 1 commit) + useTransactionsApi.ts (Task 2 commit).

Sin desviaciones de Rule 2 (functionality crítica) ni Rule 4 (architectural). Todo el trabajo está dentro del scope del plan.

## Threat Flags

Sin threat flags. Plan agrega solo types y wrappers HTTP del lado admin — no introduce surface nueva (auth, network endpoints, file access ni schema changes). Auth/RBAC se aplican en el backend (Plan 01).

## Self-Check: PASSED

- File `el-templo-admin/src/types/transaction.ts`: FOUND
- File `el-templo-admin/src/composables/useTransactionsApi.ts`: FOUND
- Commit `a1090d01`: FOUND in `git log`
- Commit `eefcf6dc`: FOUND in `git log`
- Plan acceptance grep checks: all PASS (5 type exports, 3 method definitions, 3 return entries, 1 outstanding-concepts URL, 5 /admin/finance/transactions matches)
- Sin `any` types: confirmado
- TypeScript clean en archivos modificados: confirmado
- ESLint clean en archivos modificados: confirmado
