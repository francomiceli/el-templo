---
phase: 140-carga-nica-que-propaga-cobro-suelto-rol-profe
plan: 03
subsystem: admin (coach PoS "Cargar pago" frontend)
tags:
  [
    coach-pos,
    cargar-pago,
    idempotency,
    two-modes,
    rbac,
    mis-cargas,
    quasar,
    vue3,
  ]
requires:
  - "Plan 140-02: the four coach-load endpoints (/renew, /misc, /autocompletar/:userId, /mis-cargas) at /api/admin/finance/coach-load"
  - "Plan 140-01: FINANCE_LOAD_ROLES + recorderRole/idempotencyKey threading (coach loads born pendiente)"
provides:
  - "el-templo-admin /cargar route → CargarPagoPage.vue (coach PoS, two modes, sticky Confirmar, mis cargas, pending=gold)"
  - "useFinanceLoadApi composable: getAutocompletar / renewLoad / miscCharge / listMyLoads + cleanup()"
  - "isLoadRole nav gate in AdminLayout (coach reaches Cargar pago, never /caja saldos)"
affects:
  - "Milestone v5.2 módulo contable: first coach-facing PoS surface; closes CARGA-01 + CARGA-04 end-to-end"
tech-stack:
  added: []
  patterns:
    - "Composable over boot/axios mirroring useTransactionsApi (loading/error refs, extractError, cleanup(); NO Vue unmount hook inside — CLAUDE.md)"
    - "Client idempotency key lifecycle: one crypto.randomUUID() per confirmation attempt, reused on retry, regenerated only after acknowledged success"
    - "Post-success re-fetch of mis-cargas (server source of truth) — naturally de-dupes an idempotent no-op replay, no duplicate row"
    - "Socio typeahead copied from SlotAttendancePanel (q-select use-input @filter, debounce 300, searchMembers)"
key-files:
  created:
    - el-templo-admin/src/composables/useFinanceLoadApi.ts
    - el-templo-admin/src/pages/CargarPagoPage.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
decisions:
  - "Post-success refresh via listMyLoads() instead of optimistic prepend: the POST responses (renew {subscription,transaction}, misc {transaction:detail}) carry a different shape than the mis-cargas list rows (TransactionListItem); re-fetching avoids shape juggling AND satisfies the UI-SPEC de-dupe contract (an idempotent no-op replay returns the existing row, so the list never grows a duplicate)."
  - "currencySymbol/currency derived from the autocompletar response; cobro suelto defaults currency to 'ARS' when no plan context (matches backend /misc default)."
  - "Payment-method buttons restricted to the 3 PoS options (cash/transfer/card) per UI-SPEC; selected=solid primary, others outline (warm-only, no blue selection state)."
metrics:
  duration: ~12min
  completed: 2026-06-24
---

# Phase 140 Plan 03: Coach PoS "Cargar pago" frontend Summary

The first real UI of the v5.2 módulo contable milestone: a mobile-web PoS screen at `/cargar` where a coach (profe) loads a payment once and the admin stops re-typing. `CargarPagoPage.vue` honors `140-UI-SPEC` — single-column max-480px, warm palette (no blue), a `q-btn-toggle` for the two modes (Renovar plan / Cobro suelto), a socio typeahead (copied from `SlotAttendancePanel`), three big payment-method buttons, a sticky full-width Confirmar that shows the amount, and a "Mis cargas de hoy" ticket list with a **gold** "Pendiente" badge (never red). Backed by a new `useFinanceLoadApi` composable over `boot/axios` exposing `cleanup()` (no Vue unmount hook inside). The route `meta.allowedRoles` includes `coach`, and a `point_of_sale` nav item gated by a new `isLoadRole` computed opens the surface to profes while keeping `/caja` (saldos) out of coach reach. Idempotency is client-side: one `crypto.randomUUID()` per confirmation attempt, reused on retry, regenerated only after an acknowledged success; Confirmar disables during submit (double-submit guard). Typecheck + eslint green on all four files.

## What Was Built

- **Task 1 (`3c2061c6`):** `useFinanceLoadApi.ts` — `getAutocompletar(userId)`, `renewLoad(body)`, `miscCharge(body)`, `listMyLoads()` over `/admin/finance/coach-load`, with `loading`/`error` refs, `extractError` messages, typed request bodies (`CoachRenewLoadInput`, `CoachMiscChargeInput`) + `AutocompletarResult`, and `cleanup()`. No `any`, no Vue unmount hook inside, no `console.*`. The composable forwards the page-owned `idempotencyKey`; it does not generate one.
- **Task 2 (`ad1b5bf4`):** `CargarPagoPage.vue` (480 lines) + `/cargar` route + `isLoadRole` nav item.
  - Two modes via `q-btn-toggle`. Renovar: socio pick → `getAutocompletar` pre-fills Plan vigente (readonly) + Monto (editable), `q-skeleton` while loading, inline gold warning + Confirmar disabled when `hasRenewable=false`. Cobro suelto: Monto + required Concepto (`textarea autogrow`).
  - Three `q-btn` payment buttons (Efectivo/Transferencia/Tarjeta), selected=solid primary.
  - Sticky Confirmar (`q-page-sticky`) showing `Confirmar · $monto`; enabled per UI-SPEC per-mode rules.
  - "Mis cargas de hoy" list with skeleton/empty/loaded states; method badge keeps existing color semantics, plus gold "Pendiente" badge.
  - Route added to `routes.ts` (`allowedRoles: ['coach','gestion','admin','owner']`); `AdminLayout.vue` gains `isLoadRole` computed (mirrors backend `FINANCE_LOAD_ROLES`) + a `point_of_sale` "Cargar pago" item under the Gestion header.

## Verification

- `cd el-templo-admin && npx tsc --noEmit` — **zero errors in the four 140-03 files** (the project's tsc surfaces pre-existing errors in unrelated files: vitest test stubs, pdfmake builders, treemap nodes, etc. — none introduced here; CLAUDE.md notes vue-tsc is not installed, so tsc checks `<script>` only, which is the project's capability).
- `npx eslint src/pages/CargarPagoPage.vue src/composables/useFinanceLoadApi.ts` — clean.
- Greps: `crypto.randomUUID` ✓, `Cargar pago` ✓ (CargarPagoPage.vue); `cargar` ✓ (routes.ts); `isLoadRole` ✓ (AdminLayout.vue). No `console.*`, no `any`.
- Idempotency key generated once per confirmation attempt and reused on retry; Confirmar `:disable` during submit.

## Human-Verify Checkpoint — DEFERRED (pending UAT)

Task 3 is a `checkpoint:human-verify` (mobile PoS visual + the 6-step flow). **Franco was away during execution and cannot do the device check now.** Per the orchestrator directive, all code for every task was implemented fully and the available automated checks were run; the visual/flow verification is **DEFERRED to Franco as a pending UAT item** and the plan is completed.

**UAT checklist (do later, as a `coach` user):**

1. `/cargar` on a phone / ~375px window: big buttons, warm palette (no blue), single column, sticky Confirmar reachable one-handed.
2. Renovar plan: search a socio with an active plan → Plan vigente + Monto pre-fill; edit Monto; pick Efectivo; Confirmar → positive notify "pendiente de validación" + a new gold "Pendiente" ticket in Mis cargas de hoy.
3. Double-tap Confirmar / retry on a slow connection → still exactly ONE ticket (idempotency).
4. Cobro suelto: switch mode, pick a socio, enter Monto + Concepto libre, pick Transferencia, Confirmar → ticket shows the concepto, no plan touched.
5. Confirm a coach does NOT see /caja (saldos) in the nav and cannot reach it.
6. Socio with no active plan in Renovar → inline gold warning "Usá Cobro suelto", Confirmar stays disabled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Acceptance-criterion grep false-positive on `onUnmounted`**

- **Found during:** Task 1 (the `! grep -q "onUnmounted"` acceptance check failed).
- **Issue:** A doc comment literally contained the word `onUnmounted` ("NO `onUnmounted` inside"), which the literal grep matched — even though the composable registers no such hook.
- **Fix:** Reworded the comment to "registers NO Vue unmount hook" so the guard passes and the intent stays documented. No behavioral change.
- **Files modified:** `useFinanceLoadApi.ts`
- **Commit:** `3c2061c6`

### Design choice (within UI-SPEC discretion)

- **Post-success refresh instead of optimistic prepend:** the UI-SPEC asks for an optimistic prepend de-duped by ticket id. The three response shapes diverge (`/renew` → `{subscription, transaction}`, `/misc` → `{transaction: detail}`, `/mis-cargas` rows → `TransactionListItem`), so the page re-fetches `listMyLoads()` on success. This is strictly safer for the de-dupe contract: an idempotent no-op replay returns the existing row server-side, so the list can never grow a duplicate, and the coach always sees the authoritative ledger view. Honors UI-SPEC assumption A6/States "Duplicate submit (idempotent no-op)".

## Requirement marking

- **CARGA-01 → Complete:** the dead-simple coach load UI (socio, monto, medio de pago; caja resolved server-side) now exists end-to-end on top of the Wave 2 endpoints.
- **CARGA-04 → Complete:** the profe rol reaches `/cargar` (route + nav gated by `isLoadRole`), loads enter PENDIENTE (backend, proven in 140-02), and the coach cannot validate/anular nor see /caja saldos — the "rol profe con UI de carga" requirement closes with this screen.
- **CARGA-03** was already Complete from 140-02 (cobro suelto backend); its UI ships here too.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/composables/useFinanceLoadApi.ts
- FOUND: el-templo-admin/src/pages/CargarPagoPage.vue
- FOUND commits: 3c2061c6, ad1b5bf4
