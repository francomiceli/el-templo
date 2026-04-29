---
phase: 108-pago-de-saldo-historial-financiero
plan: 02
subsystem: finance / members
tags: [outstanding-concepts, integration-tests, rbac, fifo, info-leak]
dependency_graph:
  requires:
    - "Plan 108-01: getOutstandingConcepts service + GET /:userId/outstanding-concepts route"
    - "Phase 106: cleanFinanceTables pattern (transactions-api.test.ts:1317-1330) + FINANCE_READ_ROLES + financial-history-api.test.ts seed pattern"
    - "test/helpers.ts: createTestApp, cleanAllTestData, createStaffUser, getAuthToken, registerUser"
  provides:
    - "Integration test coverage for GET /api/admin/members/:userId/outstanding-concepts (17 casos)"
    - "Regression guard sobre invariantes D-01/D-03/D-04/D-06 + RBAC + cross-country 404"
  affects:
    - "Plan 108-04: dialog Registrar pago consumirá el endpoint con confianza en su contrato"
tech_stack:
  added: []
  patterns:
    - "Vitest integration tests contra MySQL real (eltemplo_test_<POOL_ID>)"
    - "Inserción directa en `balances` table para tests del read endpoint (independiza del flow TransactionService)"
    - "cleanFinanceTables explícito (balances/financial_transactions/transaction_links no están en TABLES_TO_CLEAN — patrón de transactions-api.test.ts)"
    - "Pairwise ASC assertion para FIFO (no asserts dependientes de fechas literales que varían con NOW())"
key_files:
  created:
    - el-templo-api/test/members/outstanding-concepts.test.ts
  modified: []
decisions:
  - "Inserción directa en `balances` (no via TransactionService.create) — el endpoint solo lee la cache (D-01); tests más rápidos y aislados de validaciones del write path. Match con transaction-service.test.ts que también lee directo de la tabla."
  - "cleanFinanceTables custom además de cleanAllTestData — replicado verbatim del patrón establecido en transactions-api.test.ts:1317-1330. Las 3 tablas de finance no están en TABLES_TO_CLEAN del helpers.ts compartido."
  - "OC4 (FIFO) usa pairwise ASC en lugar de asserts literales sobre las fechas del debt_balance — la `effectiveDate` del debt_balance fallback se deriva de `balances.createdAt` (NOW()) y varía con la wall-clock; la propiedad robusta es 'orden ASC', no las fechas exactas."
  - "OC-CC3 (virtual branch) verifica explícitamente el short-circuit del cross-country guard — un member en sucursal `isVirtual=true` con país AR es accesible por admin de ES sin disparar 404. Confirma la lógica del route handler en members/routes.ts:836-846."
  - "OC-EDGE3 (filter amount<=0) inserta amount=0 y amount=-1000 en la misma row de test — confirma que `gt(amount, 0)` filtra ambos casos. amount<0 representa saldo a favor (D-08 Phase 105) y NO debe aparecer como concepto pendiente."
metrics:
  duration_min: 4
  completed: 2026-04-28
  tasks_completed: 1
  files_created: 1
  cases_covered: 17
requirements: [PAYMENT-02]
---

# Phase 108 Plan 02: Outstanding Concepts Integration Tests Summary

Integration tests del endpoint `GET /api/admin/members/:userId/outstanding-concepts` (creado en Plan 108-01) contra MySQL real. 17 casos cubren happy paths (D-01/D-03/D-04/D-06), RBAC FINANCE_READ_ROLES (D-04 privacy override), cross-country 404 (info-leak), virtual branch short-circuit y edge cases (soft-delete, no-existe, filter amount<=0, validación de path).

## What Shipped

### Test Suite (Task 1)

**`el-templo-api/test/members/outstanding-concepts.test.ts`** (667 líneas)

- **Setup pattern** (replicado de `test/finance/financial-history-api.test.ts`):
  - `seedFixtures` (1 vez en `beforeAll`): branches AR / ES / virtual con codes únicos vía `nextSuffix`.
  - `seedUsersAndPlan` (per `beforeEach`): owner / admin AR / admin ES / recepcion / coach / 3 members (AR, ES, virtual) + plan + subscription canónica startDate `2026-03-01` para member AR.
  - `cleanFinanceTables`: borra `transaction_links` / `financial_transactions` / `balances` con `FOREIGN_KEY_CHECKS=0` — replicado verbatim de `transactions-api.test.ts:1317-1330` (las 3 tablas no están en `TABLES_TO_CLEAN` del helpers compartido).
  - `insertBalance`: helper para insertar saldos directos (bypassa `TransactionService.create`) — tests del read endpoint solo necesitan la cache poblada.

- **Cobertura (17 casos):**

  | Bloque | Caso | Verifica |
  |---|---|---|
  | Happy | OC1 | `{ concepts: [] }` cuando no hay saldos (D-03) |
  | Happy | OC2 | subscription → `"Mensualidad Marzo 2026 — Performance Mensual"` (D-06), targetKind/targetId/balance/currency/effectiveDate/ageInDays correctos |
  | Happy | OC3 | debt_balance → `"Saldo libre #42"` (D-06 fallback) |
  | Happy | OC4 | FIFO ASC mixed (subscription oldest + debt_balance + subscription newer); pairwise ASC + first concept = oldest sub (D-01) |
  | Happy | OC5 | ageInDays clamp = 0 cuando effectiveDate futuro (D-04) |
  | RBAC | OC-RBAC1 | coach → 403 (D-04 privacy override; FINANCE_READ_ROLES excluye coach) |
  | RBAC | OC-RBAC2 | recepcion → 200 |
  | RBAC | OC-RBAC3 | admin (same country) → 200 |
  | RBAC | OC-RBAC4 | unauthenticated → 401 |
  | RBAC | OC-RBAC5 | member token → 401 ó 403 (rejected at module-level hook) |
  | Cross-country | OC-CC1 | non-owner admin ES leyendo member AR → 404 (info-leak avoid; `error: "No encontrado"`) |
  | Cross-country | OC-CC2 | owner cross-country → 200 |
  | Cross-country | OC-CC3 | virtual branch short-circuit → 200 (admin ES leyendo member en virtual AR branch) |
  | Edge | OC-EDGE1 | userId 99999999 → 404 |
  | Edge | OC-EDGE2 | soft-deleted member (`deletedAt != null`) → 404 |
  | Edge | OC-EDGE3 | filter `amount > 0`: amount=0 y amount=-1000 (saldo a favor) excluidos; solo amount=5000 en respuesta |
  | Edge | OC-EDGE4 | userId no entero (`abc`) → 400 (Fastify schema rejection) |

- **Constraints honored:**
  - Sin `any` types (`grep "as any\|: any" → 0 matches`).
  - response_language: Español (todos los comments y descriptions en castellano).
  - Tests contra MySQL real (`eltemplo_test_<POOL_ID>`) per CLAUDE.md — sin SQLite, sin mocks.

## Verification

```bash
$ cd el-templo-api && pnpm test outstanding-concepts
✓ test/members/outstanding-concepts.test.ts (17 tests) 59112ms
Test Files  1 passed (1)
     Tests  17 passed (17)
  Duration  68.42s
```

```bash
$ cd el-templo-api && pnpm test finance
Test Files  3 passed (3)
     Tests  121 passed (121)
  Duration  184.40s
```

Sin regresión en la suite finance existente.

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree sin `node_modules` ni `.env` — bloqueaba `pnpm test`**

- **Found during:** Task 1 verification (primer intento de `pnpm test outstanding-concepts`).
- **Issue:** El worktree paralelo se creó sin instalar deps ni copiar env files locales (no están en git). `vitest` no encontrado y `Access denied for user 'root'@'localhost'`.
- **Fix:** Symlink `el-templo-api/node_modules` al main repo + copia local de `.env` y `.env.development` (ambos gitignored, no se commiteán). Per user pref "Never install OR update dependencies without asking" — symlink reusa las deps ya aprobadas.
- **Files modified:** None (symlink + env copies son artefactos locales del worktree, no se trackean).
- **Commit:** N/A.

**2. [Rule 3 - Blocking] Path del test analog era `test/finance/financial-history-api.test.ts`, no `test/members/financial-history.test.ts`**

- **Found during:** Task 1 read_first.
- **Issue:** El plan asumía un test analog en `test/members/financial-history.test.ts`. La realidad: Phase 106 lo ubicó en `test/finance/financial-history-api.test.ts` (consistente con que `transaction-service.test.ts` y `transactions-api.test.ts` también viven en `test/finance/`).
- **Fix:** Adopté el patrón del file real (mismo código, mismo helper `cleanFinanceTables`). El nuevo test sigue viviendo en `test/members/outstanding-concepts.test.ts` per `files_modified` del plan, pero el patrón de setup/seed viene de `test/finance/`.
- **Files modified:** None (decisión de path documentada en este SUMMARY).
- **Commit:** N/A.

**3. [Rule 1 - Test pragmatism] OC4 (FIFO) usa pairwise ASC en lugar de fechas literales para la posición del `debt_balance`**

- **Found during:** Diseño del test OC4.
- **Issue:** El `effectiveDate` del fallback `debt_balance` se deriva de `balances.createdAt` (NOW() de MySQL). Una asserción literal `expect(dates).toEqual([...])` con la fecha exacta del debt_balance sería frágil ante timezone drift / clock skew.
- **Fix:** Asserción robusta `pairwise ASC` (`dates[i] <= dates[i+1]`), igual al patrón de FH3 en `financial-history-api.test.ts:445-448`. Adicionalmente, primer concepto = subscription más viejo (literal check sobre `2026-01-15`).
- **Files modified:** `test/members/outstanding-concepts.test.ts` (decisión de diseño documentada en comentario inline).
- **Commit:** Squashed en `c2111176`.

## Known Stubs

None. Todos los tests son end-to-end contra MySQL real con asserciones concretas sobre el shape de la respuesta.

## Threat Flags

None. Test-only change. No introduce nueva surface — verifica RBAC + cross-country guard + soft-delete handling **ya** implementados por Plan 108-01. Es una red de seguridad para Plan 108-04 (UI consumidora) y futuras refactorizaciones del service/route.

## Commits

- `c2111176` — test(108-02): add integration tests for outstanding-concepts endpoint

## Self-Check: PASSED

- Files exist:
  - `el-templo-api/test/members/outstanding-concepts.test.ts` — FOUND (created, 667 líneas, 17 casos)
- Commits exist:
  - `c2111176` — FOUND in `git log`
- Tests verde:
  - `pnpm test outstanding-concepts` → 17/17 passed
  - `pnpm test finance` → 121/121 passed (sin regresión)
- No `any`:
  - `grep "as any\|: any"` → 0 matches
- min_lines artifact requirement (≥150) → 667 (cumple sobradamente)
- describe/it count → 1 describe + 17 it = 18 (≥10 cumplido)
