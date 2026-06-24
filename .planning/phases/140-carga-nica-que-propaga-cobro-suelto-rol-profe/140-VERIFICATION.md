---
phase: 140-carga-nica-que-propaga-cobro-suelto-rol-profe
verified: 2026-06-24T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Coach PoS mobile visual + 6-step flow check on /cargar (Plan 03 deferred checkpoint:human-verify)"
    expected: "Big buttons, warm palette (no blue), single column ~375px, sticky Confirmar one-handed; renovar autocompletar pre-fill; double-tap = ONE ticket; cobro suelto shows concepto; coach cannot reach /caja saldos; no-plan socio shows gold warning + disabled Confirmar"
    why_human: "Visual/UX appearance and real-device interaction cannot be grep-verified; Franco was away during the UI-SPEC, so a real-device sanity check was deliberately deferred to end-of-phase UAT"
---

# Phase 140: Carga única que propaga + cobro suelto + rol profe Verification Report

**Phase Goal:** El coach registra un pago desde una UI dead-simple PoS mobile en pocos toques; un solo registro propaga atómicamente (activa/renueva membresía + impacta caja) idempotente; la misma pantalla soporta cobro suelto (socio + concepto, no-plan); el rol coach existe con permisos acotados (carga PENDIENTE, no valida/observa/anula/ve saldos).
**Verified:** 2026-06-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria CARGA-01..04)

| #            | Truth                                                                                                                                | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 (CARGA-01) | El coach registra un pago desde una pantalla dead-simple en pocos toques (socio, monto, medio de pago, caja con default server-side) | ✓ VERIFIED | `CargarPagoPage.vue` (475 lines) at route `/cargar`: q-btn-toggle two modes, socio typeahead (`searchMembers`, line 299), `getAutocompletar` pre-fill (line 365), 3 big payment buttons, sticky Confirmar (`q-page-sticky` line 184). `useFinanceLoadApi.ts` exposes the 4 methods + `cleanup()`. Caja never rendered (grep: NONE_caja_in_page). Backend `autocompletar` reuses `getMemberSubscription` (coach-load-routes.ts:291).                                                                                                                                                  |
| 2 (CARGA-02) | Un solo registro propaga atómicamente en una db.transaction idempotente; doble click/retry no duplica                                | ✓ VERIFIED | recorderRole threaded: `renewSubscription` forwards `input.recorderRole` (service.ts:3488) → `recordAssignmentCharge` derives `validationStatus = recorderRole==="coach" ? "pendiente":"validado"` (service.ts:288) → into `transactionService.create`. Idempotency: nullable UNIQUE `idempotency_key` (migration 0156 + schema:90/114); endpoint catches `isDuplicateKeyError` → `findByIdempotencyKey` re-read on fresh `this.db` → returns existing 200 (coach-load-routes.ts:201-224, 266-278). Test proves same-key-twice = ONE row + id equality (coach-load.test.ts:337-411). |
| 3 (CARGA-03) | La misma UI soporta cobros sueltos (no-plan) reusando el modelo sin schema nuevo                                                     | ✓ VERIFIED | `/misc` uses `kind:"advance_payment"` (∈ KINDS_ALLOWED_WITHOUT_LINKS, transaction-service.ts:58-59), `links:[]`, `concepto`→`notes`, branchId server-resolved, `validationStatus` by role (coach-load-routes.ts:247-264). NO enum migration. Pitfall 2: pendiente advance_payment excluded from firm revenue by `firmMoneyConditions()` requiring `validation_status='validado'` (firm-money.ts); test asserts monthlyRevenue unchanged + revenueByKind.advance_payment=0 (coach-load.test.ts:482-518).                                                                              |
| 4 (CARGA-04) | El rol coach existe con permisos acotados: carga PENDIENTE, NO valida/observa/anula/ve saldos; test de autorización lo confirma      | ✓ VERIFIED | `FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, "coach"]` (permissions.ts:117); coach ABSENT from VOID/ADJUSTMENT/READ (grep: CLEAN_coach_absent_from_restricted). SEPARATE `coach-load-routes.ts` plugin with own `onRequest` FINANCE_LOAD_ROLES guard (lines 136-147) — not under finance/routes.ts FINANCE_READ_ROLES hook. mis-cargas forces `recordedBy=request.user.userId` server-side (line 322). Test: coach 403 on validate/observe/void/list/summary, member 403 on plugin (coach-load.test.ts:198-274); mis-cargas own-only (522-567).                                    |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                                   | Expected                                                  | Status     | Details                                                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/migrations/0156_idempotency_key.sql` | nullable UNIQUE idempotency_key                           | ✓ VERIFIED | Column + UNIQUE INDEX ALTERs; no `;` in comments (CLEAN); applied per SUMMARY                               |
| `el-templo-api/src/db/schema/financial-transactions.ts`    | idempotencyKey column + uniqueIndex                       | ✓ VERIFIED | `varchar("idempotency_key",{length:64})` line 90; `uniqueIndex("uq_financial_tx_idempotency_key")` line 114 |
| `el-templo-api/src/modules/shared/permissions.ts`          | FINANCE_LOAD_ROLES = WRITE+coach                          | ✓ VERIFIED | Line 117; VOID/ADJUSTMENT/READ unchanged                                                                    |
| `el-templo-api/src/modules/finance/coach-load-routes.ts`   | coach load plugin (4 routes, own guard)                   | ✓ VERIFIED | 334 lines; renew/misc/autocompletar/mis-cargas + idempotency dedup                                          |
| `el-templo-api/test/finance/coach-load.test.ts`            | auth + idempotency + renew + autocompletar + cobro-suelto | ✓ VERIFIED | 569 lines; all 6 focus cases present; SUMMARY reports 16/16 green                                           |
| `el-templo-admin/src/composables/useFinanceLoadApi.ts`     | 4 methods + cleanup() no onUnmounted                      | ✓ VERIFIED | cleanup() line 157; no onUnmounted; typed bodies, no any                                                    |
| `el-templo-admin/src/pages/CargarPagoPage.vue`             | PoS two modes, sticky Confirmar, mis cargas               | ✓ VERIFIED | 475 lines; honors UI-SPEC; crypto.randomUUID idempotency lifecycle                                          |

### Key Link Verification

| From                     | To                                     | Via                                                            | Status  | Details                                                                                 |
| ------------------------ | -------------------------------------- | -------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------- |
| subscriptions/service.ts | recordAssignmentCharge recorderRole    | renewSubscription forwards input.recorderRole                  | ✓ WIRED | service.ts:3488 + derivation 288                                                        |
| transaction-service.ts   | financial_transactions.idempotency_key | INSERT persists input.idempotencyKey                           | ✓ WIRED | create() line 275 `idempotencyKey: input.idempotencyKey ?? null`                        |
| coach-load-routes.ts     | subscriptionService.renewSubscription  | renew forwards recorderRole=request.user.role + idempotencyKey | ✓ WIRED | lines 185-196 (recorderRole from session role, line 192)                                |
| coach-load-routes.ts     | transactionService.create              | cobro suelto kind='advance_payment', links=[]                  | ✓ WIRED | lines 247-264                                                                           |
| app.ts                   | coachLoadRoutes plugin                 | register at /api/admin/finance/coach-load                      | ✓ WIRED | app.ts:42 import, 225 register                                                          |
| router/routes.ts         | CargarPagoPage.vue                     | route /cargar allowedRoles incl coach                          | ✓ WIRED | routes.ts:75-80, allowedRoles ['coach','gestion','admin','owner']                       |
| AdminLayout.vue          | /cargar                                | nav q-item gated by isLoadRole                                 | ✓ WIRED | line 66 `v-if="isLoadRole"`, computed line 244; /caja stays isCajaRole (coach excluded) |

### Status-Spoofing Guard (verification focus #5)

| Check                                                                    | Status     | Evidence                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| validation_status derived server-side from session role, never from body | ✓ VERIFIED | renew: `recorderRole: request.user.role` (coach-load-routes.ts:192); misc: status from `request.user.role` (241-245); route schemas `additionalProperties:false` reject validationStatus/cashRegisterId (schemas 68-102) |
| recorderRole→pendiente derivation centralized                            | ✓ VERIFIED | service.ts:288 single derivation point                                                                                                                                                                                   |

### Behavioral Spot-Checks

| Behavior                                            | Command                                           | Result                                                                                   | Status |
| --------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| API typecheck clean                                 | `cd el-templo-api && npx tsc --noEmit`            | EXIT=0                                                                                   | ✓ PASS |
| Admin typecheck — no phase-140 errors               | `cd el-templo-admin && npx tsc --noEmit` filtered | NO_ERRORS_IN_PHASE140_FILES (pre-existing errors only in axios test stub + pdf builders) | ✓ PASS |
| No `;` in migration SQL comments                    | `grep -nE '^\s*--.*;' 0156`                       | CLEAN                                                                                    | ✓ PASS |
| coach absent from VOID/ADJUSTMENT/READ              | grep                                              | CLEAN_coach_absent                                                                       | ✓ PASS |
| advance_payment in KINDS_ALLOWED_WITHOUT_LINKS      | grep                                              | present (line 59)                                                                        | ✓ PASS |
| firmMoneyConditions excludes pendientes (Pitfall 2) | read firm-money.ts                                | requires validation_status='validado'                                                    | ✓ PASS |
| No debt markers (TBD/FIXME/XXX) in phase files      | grep                                              | DONE_debt_scan (none)                                                                    | ✓ PASS |
| Commits exist                                       | `git cat-file -t`                                 | ALL_COMMITS_EXIST (8157fe3d, 56fae3b1, ad1b5bf4)                                         | ✓ PASS |

### Probe Execution

| Probe             | Command                                      | Result                                                                   | Status      |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------ | ----------- |
| Integration tests | (project rule: run in CI on push, not local) | coach-load.test.ts exists + compiles + reads correct (16/16 per SUMMARY) | ? SKIP (CI) |

Per project rule (MEMORY: "tests run in CI not local"), the integration suite executes in CI on push to staging. Test EXISTENCE + CORRECTNESS verified by reading (all 6 focus cases present and asserting the right invariants) and tsc cleanliness. Not run locally by design.

### Requirements Coverage

| Requirement | Source Plan  | Description                          | Status      | Evidence |
| ----------- | ------------ | ------------------------------------ | ----------- | -------- |
| CARGA-01    | 140-01/02/03 | UI dead-simple carga + autocompletar | ✓ SATISFIED | Truth 1  |
| CARGA-02    | 140-01/02    | Atomic + idempotent propagation      | ✓ SATISFIED | Truth 2  |
| CARGA-03    | 140-01/02    | Cobro suelto no-plan, no schema      | ✓ SATISFIED | Truth 3  |
| CARGA-04    | 140-01/02/03 | Coach scoped permission + auth test  | ✓ SATISFIED | Truth 4  |

REQUIREMENTS.md marks all four Complete (lines 53-56, 123-126) — consistent with code evidence.

### Anti-Patterns Found

None. No `any`, no `console.*`, no `onUnmounted` inside the composable, no debt markers, no `;` in SQL comments, warm palette only (no blue selection state). CLAUDE.md standards honored.

### Human Verification Required

#### 1. Coach PoS mobile visual + flow (DEFERRED checkpoint from Plan 03 Task 3)

**Test:** As a `coach` user, run the admin dev server, open `/cargar` on a phone (or ~375px window). Walk the 6-step flow:

1. Big buttons, warm palette (no blue), single column, sticky Confirmar reachable one-handed.
2. Renovar plan: search socio with active plan → plan vigente + monto pre-fill; edit monto; pick Efectivo; Confirmar → positive notify "pendiente de validación" + gold "Pendiente" ticket.
3. Double-tap Confirmar / retry on slow connection → still exactly ONE ticket.
4. Cobro suelto: pick socio, monto + concepto libre, Transferencia, Confirmar → ticket shows concepto, no plan touched.
5. Coach does NOT see /caja (saldos) in nav and cannot reach it.
6. Socio with no active plan in Renovar → inline gold warning "Usá Cobro suelto", Confirmar disabled.

**Expected:** All 6 steps behave as described; mobile PoS feels one-handed and uncluttered.

**Why human:** Visual appearance, warm-palette correctness, real-device one-handed reachability, and live double-tap timing cannot be grep-verified. Franco was away during the UI-SPEC, so this was a deliberately deferred end-of-phase UAT — NOT a phase failure (all code exists and every automated check passes).

### Gaps Summary

No gaps. All 4 ROADMAP success criteria (CARGA-01..04) are observably true in the live codebase:

- **CARGA-02 (scrutinized hardest):** The recorderRole→pendiente chain is fully wired through three hops (renewSubscription → recordAssignmentCharge derivation → transactionService.create) with admin call sites deliberately left untouched (validado). Idempotency is enforced at the DB (nullable UNIQUE) AND deduped at the endpoint with a fresh-connection re-read after the renewal tx rolls back wholesale (Pitfall 3) — the test proves same-key-twice yields exactly ONE row with id equality.
- **CARGA-04 (scrutinized hardest):** Coach cannot escalate — a SEPARATE plugin gates LOAD only; coach is absent from VOID/ADJUSTMENT/READ; route schemas reject validationStatus/cashRegisterId; mis-cargas forces recordedBy=self; status derives from session role, never the body. Auth-403 proven across 5 restricted endpoints + member-on-plugin.

The phase is functionally complete and goal-achieved in code. Status is `human_needed` solely because the Plan-03 mobile PoS visual UAT was deferred (Franco away) — it is a pending UAT item, not a blocker.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
