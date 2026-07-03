---
phase: 151-registrar-cobro-pagos-cobros
plan: 03
subsystem: admin-finance-pos
tags: [wizard, cobro, pos, vue, quasar, rename, ui-spec]
requires:
  - "useFinanceLoadApi.listBankAccounts + bankAccountId (Plan 02)"
  - "CobroResumen.vue shared presentational summary (Plan 02)"
provides:
  - "CobrosPage.vue — 4-step cobro wizard (portada + Socio + ¿Qué se cobra? + ¿Cómo se paga? + Resumen)"
  - "/cobros route + /pagos→/cobros redirect + role landing on /cobros"
  - "nav label 'Cobros'; day-grouped historical listado with fecha+hora"
  - ".bg-summary-surface global class (deeper cream secondary surface)"
affects:
  - "Plan 04 (bank-account selector) builds into the step-3 this plan created"
tech-stack:
  added: []
  patterns:
    - "Single-route in-component wizard state (currentStep 0..4), no child routes / no store"
    - "Vue <transition> horizontal slide with prefers-reduced-motion fallback"
    - "Shared CobroResumen mounted twice (desktop sticky panel + step-4 body)"
    - "Secondary surface as a global class (not inline hex) to preserve the staging --q-primary marker"
key-files:
  created: []
  modified:
    - el-templo-admin/src/pages/CobrosPage.vue
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/css/app.scss
decisions:
  - "/pagos renamed to /cobros with a redirect; landing + static fallback point to /cobros (COBRO-01)"
  - "The old PoS 'mode' becomes the step-2 association (renovar/asignar plan/cobro suelto), no upfront toggle (D-01)"
  - "Wizard state lives in the page component (currentStep), single route, no store (D-02)"
  - "Secondary surface #e9e2d6 lives in app.scss as .bg-summary-surface so CobrosPage.vue stays hex-free"
metrics:
  duration: ~13min
  completed: 2026-07-03
---

# Phase 151 Plan 03: Cobros Wizard (Pagos→Cobros rename + 4-step flow) Summary

Renamed the Pagos PoS to Cobros (route, redirect, landing, nav) and rebuilt `PagosPage.vue` as `CobrosPage.vue`: a single-route 4-step wizard (portada → Socio → ¿Qué se cobra? → ¿Cómo se paga? → Resumen) with a two-column desktop layout (active step + sticky accumulated `CobroResumen`) and a collapsed mobile summary, redistributing all prior PoS behavior into the steps with idempotency-per-attempt intact.

## What Was Built

### Task 1 — Rename Pagos → Cobros (commit da7a6eda)

- `git mv PagosPage.vue → CobrosPage.vue` (history preserved).
- `routes.ts`: route record now `path: 'cobros'` → `CobrosPage.vue`; added `{ path: 'pagos', redirect: '/cobros' }` so old bookmarks resolve; `landingForRole()` and the static pre-auth fallback (`{ path: '', redirect }`) both point to `/cobros`.
- `templo-config.ts`: Finanzas nav item → `{ path: '/cobros', label: 'Cobros', icon: 'point_of_sale', roles: PAGOS_ROLES }`. `PAGOS_ROLES` constant kept (rename discretionary, D-09 — avoided churn).
- Page title `Cobros`; logger namespace `createLogger('cobros')`.

### Task 2 — Wizard shell (commit 08093e02)

- `currentStep` reactive state (0=portada, 1..4 steps) held in-component (no child routes, no store, D-02).
- Progress header on the secondary band: desktop numbered `1 Socio · 2 ¿Qué se cobra? · 3 ¿Cómo se paga? · 4 Resumen` (current filled accent, completed `check_circle`, future muted); mobile `Paso n de 4` + `q-linear-progress size="4px"` accent + current label.
- Accessible back button (`aria-label="Volver"`, icon-only mobile / +label desktop); step-1 back returns to portada. Abandon-flow `q-dialog` (`Si salís ahora, se pierden los datos cargados.` — `Salir` negative / `Seguir cargando` primary flat) triggered on back-from-step-1 and `onBeforeRouteLeave`, only when the form has data.
- Vue `<transition>` 200ms horizontal slide (forward-from-right / back-from-left) with a `prefers-reduced-motion: reduce` fade fallback (JS `matchMedia` + CSS media query).
- Two-column desktop (`$q.screen.gt.sm`, 32px xl gap, step body max 560px, sticky 320px summary panel on `.bg-summary-surface`); mobile compact summary header (`q-expansion-item`, socio + running total, tap to expand). `CobroResumen` mounted in the desktop panel, the mobile header, and step 4.
- Added `.bg-summary-surface` to `app.scss` (hex lives there, not in the component).

### Task 3 — Redistribute PoS logic into steps (commit e59e0130)

- **Step 1 (Socio):** socio typeahead + `Nuevo alumno` mini-form (Nombre/Apellido/DNI + Sede select + DNI dedup on-blur) + POS-01 debt banner.
- **Step 2 (¿Qué se cobra?):** three associations surfaced as one question (D-01, no mode toggle) — `Renovar plan vigente` (readonly plan), `Asignar plan nuevo` (plan grid by tier + Zero toggle + `FixedSchedulePicker` for fixed plans), `Cobro suelto` (concepto + obligatory Motivo). No-renewable path offers `Asignarle un plan` inline. `onSelectAssociation` sets the mode and (re)loads branches/plans, preserving socio + debt and nulling the idempotency key.
- **Step 3 (¿Cómo se paga?):** payment-method buttons + `Monto` (currency suffix) + alta partial-payment warning + `Queda pendiente de validación.` hint. Bank-account selector intentionally NOT added (Plan 04).
- **Step 4 (Resumen):** `CobroResumen` read-only + `Confirmar · {monto}`.
- Confirm dispatch (`payPlan`/`miscCharge`/`altaConPlan`) chosen by the step-2 association exactly as the old `mode` branch. Idempotency-key-per-attempt preserved (lazy `crypto.randomUUID()` on first tap, reuse on retry, regenerate only after acknowledged success; nulled on deliberate target change). Success/error copy updated to the UI-SPEC strings (`Cobro registrado — pendiente de validación`, `No se pudo registrar el cobro. Reintentá.`). Every `text-caption` (12px) replaced by 14px `text-subtitle2` forced 400 + `text-grey-7`.

### Task 4 — Portada day-grouped listado (commit d1e4598f)

- `Registrar cobro` accent CTA (size `lg`, up to 560px) at the top; below it the historical listado.
- Rows grouped by day (`groupedLoads` computed) with sticky `Hoy` / `Ayer` / `{ddd d MMM}` (es-AR, periods stripped) headers; each row shows `HH:mm` + socio + concept + method badge + `Pendiente` badge + amount. Data source unchanged (`financeApi.listMyLoads()`).
- Removed the lying `Mis cargas de hoy` title (endpoint returns last 50 historical). Empty state `Todavía no registraste cobros` + fecha/hora hint.

## Verification

- Admin typecheck (`vue-tsc --noEmit`): no errors in `CobrosPage.vue`, `routes.ts`, `templo-config.ts`, or `app.scss`.
- No dangling `PagosPage` reference (0 matches). `/cobros` route + `/pagos→/cobros` redirect present; nav label `Cobros`.
- Per-task acceptance greps all pass: `currentStep`/`q-linear-progress`, `CobroResumen`, `<transition`, `prefers-reduced-motion`, `aria-label="Volver"`, `Si salís ahora`; `currentIdempotencyKey`/`crypto.randomUUID`, `payPlan`/`miscCharge`/`altaConPlan`, `FixedSchedulePicker`, `checkDuplicates`/`onDniBlur`; `Registrar cobro`, `Hoy`/`Ayer`, `Todavía no registraste cobros`.
- Hex count in `CobrosPage.vue` = 0; `text-caption` count = 0; `q-btn-toggle` (old mode toggle) count = 0; `Mis cargas de hoy` count = 0.

## Deviations from Plan

None — plan executed as written. Minor discretionary choices within the plan's stated latitude:

- **[D-09 discretionary]** Kept `PAGOS_ROLES` constant name (did not rename to `COBROS_ROLES`) to avoid cross-file churn — the plan explicitly permits either.
- **Sede select placement:** rendered in the step-1 new-student mini-form only (per UI-SPEC). Existing-socio alta loads the plan catalog with the profe's default branch (`sucursalId`), matching the pre-existing default behavior.
- **Success/error copy:** unified to the UI-SPEC strings (previously `Pago cargado`/`No se pudo cargar el pago`), consistent with the Cobros rename.

## Deferred Issues (out of scope)

- Pre-existing `vue-tsc` errors in unrelated files (`boot/__tests__/axios-refresh-lock.test.ts`, `AssignPlanDialog.vue`, `ProgramWizardDialog.vue`, `caja/BandejaPendientesTab.vue`, `reports/TrialSessionsReport.vue`, `scheduling/SesionesDePruebaDialog.vue`, `utils/pdf/session-pdf-builder.ts`). These exist independent of this plan and were not touched.

## Threat Model Notes

- T-151-07 (Elevation, /cobros route): mitigated — `meta.allowedRoles` (`PAGOS_ROLES`) is unchanged from the /pagos record; the API-side `FINANCE_LOAD_ROLES` gate remains the authority. The redirect carries no new access.
- T-151-08 (Tampering, client charge payload): accepted — the wizard forwards the same fields; no new body field added. Server-side derivation/validation remains authoritative.
- T-151-SC (package installs): accepted — no new dependencies; reuses existing Quasar components/composables.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/pages/CobrosPage.vue
- FOUND: el-templo-admin/src/router/routes.ts (modified)
- FOUND: el-templo-admin/src/config/templo-config.ts (modified)
- FOUND: el-templo-admin/src/css/app.scss (modified)
- FOUND commit: da7a6eda (Task 1)
- FOUND commit: 08093e02 (Task 2)
- FOUND commit: e59e0130 (Task 3)
- FOUND commit: d1e4598f (Task 4)
