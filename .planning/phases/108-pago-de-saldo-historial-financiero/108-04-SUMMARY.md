---
phase: 108-pago-de-saldo-historial-financiero
plan: 04
subsystem: admin-frontend / finance
tags: [phase-108, finance, frontend, dialog, register-payment, fifo]
dependency_graph:
  requires:
    - "Plan 108-01 — GET /admin/members/:id/outstanding-concepts endpoint (operational)"
    - "Plan 108-03 — types OutstandingConcept, RegisterPaymentInput; composable methods getOutstandingConcepts, createTransaction"
    - "Phase 106 POST /admin/finance/transactions endpoint (operational, atomic)"
  provides:
    - "RegisterPaymentDialog.vue — split allocation dialog with auto-FIFO, Pagar todo, Σ live validation, multi-currency anomaly handling"
    - "AlumnoDetailPage 'Registrar pago' button gated by FINANCE_WRITE_ROLES + outstanding.length"
    - "loadOutstanding() + onPaymentRegistered handler wired into AlumnoDetailPage"
  affects:
    - "Plan 108-05 (Tab Historial financiero) — onPaymentRegistered should also refresh history once that tab exists"
tech-stack:
  added: []
  patterns:
    - "Vue 3 <script setup lang=ts> Composition API (no Options API)"
    - "Quasar q-dialog persistent + q-input v-model.number + q-select emit-value/map-options"
    - "Reactive Record<string, number> for allocations keyed by composite `${targetKind}:${targetId}` (avoids targetId collisions across kinds)"
    - "Watcher on montoRecibido + open trigger for re-running auto-FIFO greedy allocation"
    - "Triple guard isInvalid: typeof + Number.isFinite + <= 0 (covers null/empty-string/NaN from v-model.number)"
    - "Multi-currency anomaly handling: log warn via createLogger().warn() (auto-Sentry on .error only — warn stays local + console)"
key-files:
  created:
    - "el-templo-admin/src/components/RegisterPaymentDialog.vue (395 lines)"
  modified:
    - "el-templo-admin/src/pages/AlumnoDetailPage.vue (+66 lines: imports, transactionsApi instance, outstandingConcepts ref, canRegisterPayment computed, loadOutstanding fn, onPaymentRegistered handler, button in header, dialog mount)"
decisions:
  - "Auto-FIFO uses backend's pre-sorted ordering (effective_date ASC) — no re-sort in frontend per Plan 108-01 contract."
  - "Allocations stored as `reactive<Record<string, number>>` (not ref<Record>) to support direct v-model.number bindings on individual q-input fields without needing per-key getters/setters. Both shapes work in Vue 3, but reactive() avoids the .value indirection that causes v-model edge cases on dynamic keys."
  - "Composite key `${targetKind}:${targetId}` chosen over plain targetId — defensive against future collisions where subscription.id and debt_balance.id namespaces overlap (they currently don't, but the cost is one string template literal)."
  - "Multi-currency anomaly (D-21): mostrar solo la moneda mayoritaria + log warn (NO error). createLogger().error() auto-Sentry-reports as error severity; .warn() stays local. The anomaly is data-quality flag for ops review, not a runtime error."
  - "isInvalid triple guard (typeof + Number.isFinite + <= 0) — `v-model.number` on q-input can leave string '', null, or NaN depending on browser/Quasar version. Plan called for typeof + isFinite; we kept the original `=== null` check too as belt-and-suspenders."
  - "paymentMethod default = `PAYMENT_METHOD_OPTIONS[0]?.value ?? 'cash'` — derived from the array, with 'cash' as defensive fallback (the schema enum includes 'cash', so the fallback can never produce an invalid backend value)."
  - "AssignPlanDialog.vue NOT touched — its Cobro block is for plan_charge flow (Phase 107), distinct from debt_settlement here. No code reuse via shared component because the UX is fundamentally different (fixed amount vs admin-tipea + split)."
  - "loadOutstanding() runs in background (non-blocking) inside loadAll() — does NOT gate page render. The button stays disabled until data arrives, which matches the existing pattern for sessionLevelCounts and goalPlanDetail."
metrics:
  duration: "~50 min"
  completed: "2026-04-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
  commits: 2
---

# Phase 108 Plan 04: Dialog "Registrar pago" + AlumnoDetailPage Wiring Summary

UX completo del flujo "registrar pago de saldo" — dialog con split allocation auto-FIFO + validación Σ allocated = monto recibido en vivo + integración con AlumnoDetailPage. Cubre PAYMENT-01 (botón visible) y PAYMENT-02 (split allocation con invariante Σ = amount).

## Tasks

### Task 1: Create RegisterPaymentDialog.vue

- **Status:** Done
- **Commit:** `87eb977d`
- **Files:** `el-templo-admin/src/components/RegisterPaymentDialog.vue` (NEW, 395 lines)
- **What:** Dialog completo con:
  - Inputs: monto recibido, método de pago, fecha, notas.
  - Lista de conceptos pendientes (FIFO desde backend) con q-input por concepto para alocar.
  - Botón "Pagar todo" que setea `montoRecibido = Σ saldos`.
  - Auto-FIFO greedy: al abrir + on montoRecibido watch, distribuye el monto empezando del concepto más viejo.
  - Display "Total asignado: $X / $Y" con ✓ verde / "Faltan $Z" / "Sobran $Z".
  - Confirmar disabled hasta que `Σ allocated === montoRecibido` y `montoRecibido > 0` (D-09/D-10/D-11).
  - Submit con payload `kind='debt_settlement'`, `direction='inflow'`, `links` filtrados (D-08: allocations === 0 excluidos).
  - Multi-currency anomaly: si > 1 currency, log warn + render mayoritaria (D-21).
- **Decisión clave:** `paymentMethod` default = `PAYMENT_METHOD_OPTIONS[0]?.value ?? 'cash'` — derivado del array, con fallback defensivo a 'cash' (que es valor presente en el schema enum).

### Task 2: Wire RegisterPaymentDialog into AlumnoDetailPage

- **Status:** Done
- **Commit:** `60ea475e`
- **Files:** `el-templo-admin/src/pages/AlumnoDetailPage.vue` (+66 lines)
- **What:**
  - Imports: `RegisterPaymentDialog`, `useTransactionsApi`, `OutstandingConcept`.
  - State: `transactionsApi`, `outstandingConcepts` ref, `showRegisterPaymentDialog` ref.
  - `canRegisterPayment` computed (FINANCE_WRITE_ROLES per D-23).
  - `loadOutstanding()` async fn — fetch + log on error + fallback to `[]`.
  - `onPaymentRegistered()` handler que refresca outstanding tras pago exitoso.
  - Botón "Registrar pago" en header card con `v-if="canRegisterPayment"` + `:disable="outstandingConcepts.length === 0"` + tooltip "Sin saldos pendientes" (D-19).
  - Mount del dialog junto a MemberFormDialog.
  - `loadOutstanding()` agregado a `loadAll()` como llamada background non-blocking.
- **Decisión clave:** `loadOutstanding()` corre en background dentro de `loadAll()` (mismo patrón que `loadSessionLevels` y `loadGoalPlanDetail`) — el botón se queda en estado disabled hasta que llega la data, coherente con el resto de la página.

## Verification

```
$ wc -l el-templo-admin/src/components/RegisterPaymentDialog.vue
395

$ grep -nc "autoFifoAllocate" el-templo-admin/src/components/RegisterPaymentDialog.vue
3

$ grep -nE "kind: 'debt_settlement'" el-templo-admin/src/components/RegisterPaymentDialog.vue
371:      kind: 'debt_settlement',

$ grep -nE "watch\(montoRecibido" el-templo-admin/src/components/RegisterPaymentDialog.vue
310:watch(montoRecibido, (val) => {

$ grep -nc "Pagar todo" el-templo-admin/src/components/RegisterPaymentDialog.vue
1

$ grep -nE "createLogger.*RegisterPaymentDialog" el-templo-admin/src/components/RegisterPaymentDialog.vue
158:const log = createLogger('RegisterPaymentDialog');

$ grep -nE "allocatedAmount > 0" el-templo-admin/src/components/RegisterPaymentDialog.vue
358:      .filter((l) => l.allocatedAmount > 0);

$ grep -nE "PAYMENT_METHOD_OPTIONS\[0\]" el-templo-admin/src/components/RegisterPaymentDialog.vue
169:  PAYMENT_METHOD_OPTIONS[0]?.value ?? 'cash';

$ grep -nE "sumStatus === 'over'" el-templo-admin/src/components/RegisterPaymentDialog.vue
101:          <span v-else-if="sumStatus === 'over'">

$ grep -nE "Number\.isFinite|typeof montoRecibido" el-templo-admin/src/components/RegisterPaymentDialog.vue
251:    typeof montoRecibido.value !== 'number' ||
252:    !Number.isFinite(montoRecibido.value) ||
314:    !Number.isFinite(val) ||

$ grep -nc "console\." el-templo-admin/src/components/RegisterPaymentDialog.vue
0

$ grep -nE ":\s*any\b|<any>|as\s+any" el-templo-admin/src/components/RegisterPaymentDialog.vue
(no matches)

$ grep -nc "RegisterPaymentDialog" el-templo-admin/src/pages/AlumnoDetailPage.vue
5

$ grep -nc "loadOutstanding" el-templo-admin/src/pages/AlumnoDetailPage.vue
3

$ grep -nc "canRegisterPayment" el-templo-admin/src/pages/AlumnoDetailPage.vue
2

$ grep -n "Sin saldos pendientes" el-templo-admin/src/pages/AlumnoDetailPage.vue
102:                  Sin saldos pendientes

$ grep -nc "outstandingConcepts" el-templo-admin/src/pages/AlumnoDetailPage.vue
6
```

- TypeScript: `pnpm exec tsc --noEmit -p tsconfig.json` reports cero errores en RegisterPaymentDialog.vue y AlumnoDetailPage.vue. (3 errores pre-existentes en `src/utils/pdf/session-pdf-builder.ts` no relacionados — fuera de scope per Scope Boundary, ya documentados en SUMMARY 108-03.)
- ESLint: `pnpm exec eslint src/components/RegisterPaymentDialog.vue src/pages/AlumnoDetailPage.vue` cero issues.
- Sin `any` types — cumple CLAUDE.md.
- Sin `console.*` calls — cumple CLAUDE.md (logger structurado vía `createLogger`).
- Texto UI 100% en español per response_language.

## Acceptance Criteria

| Criterio | Estado |
|----------|--------|
| RegisterPaymentDialog.vue creado con ≥250 líneas | ✓ — 395 líneas |
| autoFifoAllocate function definida + invocada (≥1 match) | ✓ — 3 matches (def + 2 callsites) |
| `kind: 'debt_settlement'` literal en payload | ✓ — línea 371 |
| `watch(montoRecibido,...)` re-ejecuta auto-FIFO | ✓ — línea 310 |
| Botón "Pagar todo" en template | ✓ — line 50, label="Pagar todo" |
| `createLogger('RegisterPaymentDialog')` | ✓ — línea 158 |
| Filter allocations === 0 antes de armar payload (D-08) | ✓ — línea 358 |
| Default desde `PAYMENT_METHOD_OPTIONS[0]` (no hardcoded) | ✓ — línea 169 |
| Branch `sumStatus === 'over'` explícito en template | ✓ — línea 101 |
| Triple guard (typeof + Number.isFinite + <=0) | ✓ — líneas 251-252 (isInvalid) + 314 (watcher) |
| No console.* | ✓ — 0 matches |
| No `any` types | ✓ — 0 matches |
| AlumnoDetailPage importa RegisterPaymentDialog (≥3 matches: import + tag + ref) | ✓ — 5 matches |
| `loadOutstanding` definida + invocada (≥2 matches) | ✓ — 3 matches |
| `canRegisterPayment` computed + uso (≥2 matches) | ✓ — 2 matches |
| Tooltip "Sin saldos pendientes" | ✓ — línea 102 |
| `outstandingConcepts` ≥3 referencias | ✓ — 6 matches |
| Botón usa `v-if="canRegisterPayment"` Y `:disable="outstandingConcepts.length === 0"` | ✓ — header card lines 92-103 |
| pnpm typecheck (tsc) clean en archivos modificados | ✓ |
| pnpm lint clean en archivos modificados | ✓ |
| SUMMARY.md committed | ✓ (incluido en final commit) |
| response_language: Español en textos UI | ✓ — todos los strings UI en español |

## Deviations from Plan

### Adaptaciones de implementación (no Rule deviations)

**1. `allocations` modeled as `reactive<Record<string, number>>` (not `ref<Record<string, number>>`)**

- **Found during:** Task 1 — al cablear `v-model.number="allocations[conceptKey(c)]"` en cada q-input del v-for.
- **Issue:** Con `ref<Record<string, number>>`, los q-input necesitan binding via `allocations.value[key]` lo cual es más verboso y tiene edge cases con dynamic keys + Vue reactivity (la mutación `allocations.value[k] = x` puede no triggerar updates en algunos browsers cuando la key es nueva).
- **Fix:** Usé `reactive<Record<string, number>>({})` para soportar binding directo `allocations[key]` y mutaciones `allocations[k] = x` con reactividad garantizada en Vue 3 Proxy. La función `clearAllocations()` itera + `delete` para reset. Trade-off: ligeramente menos funcional (mutación in-place vs reemplazo del ref), pero alineado con cómo el template indexa.
- **Files modified:** RegisterPaymentDialog.vue.
- **Commit:** `87eb977d`.

**Rule 1-4 deviations:** Ninguna. No se encontraron bugs ni functionality crítica faltante durante la implementación. El plan estaba completo y correcto; solo ajustes de implementación táctica como el de allocations.

## Self-Check: PASSED

- File `el-templo-admin/src/components/RegisterPaymentDialog.vue`: FOUND
- File `el-templo-admin/src/pages/AlumnoDetailPage.vue`: FOUND (modificado)
- Commit `87eb977d` (feat 108-04 add RegisterPaymentDialog): FOUND in `git log --oneline`
- Commit `60ea475e` (feat 108-04 wire into AlumnoDetailPage): FOUND in `git log --oneline`
- Plan acceptance grep checks (Task 1 + Task 2): all PASS
- TypeScript clean en archivos modificados: confirmed (3 pre-existing errors in unrelated `session-pdf-builder.ts`, out-of-scope per Scope Boundary)
- ESLint clean en archivos modificados: confirmed
- Sin `any` types: confirmed
- Sin `console.*` calls: confirmed (logger via createLogger)
- response_language Español: confirmed (todos los strings UI)
