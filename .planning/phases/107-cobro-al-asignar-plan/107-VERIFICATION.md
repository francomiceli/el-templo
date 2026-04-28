# Phase 107: Cobro al Asignar Plan — Verification

**Date:** 2026-04-28
**Phase status:** Awaiting sign-off (smoke staging pendiente — los 5 escenarios D-20 están como PENDING hasta que el operador los ejecute)
**Verified by:** Claude (scaffold + automated checks de plans 01-05) + ignaciobordon@eltemplo.org (manual smoke pendiente)

Este documento captura:

1. La matriz de trazabilidad de los requirements **CHARGE-01 / CHARGE-02 / CHARGE-03** contra los plans 01-05 que los cubrieron.
2. El status de cada plan de Phase 107 (referenciando los SUMMARY.md ya merged).
3. El skeleton del **smoke test (D-20)** con los 5 escenarios obligatorios — todos en estado `PENDING` hasta que el operador ejecute el smoke contra staging real.
4. El **sign-off para deploy a producción** con la regla operativa **D-21: NO desplegar viernes**.

---

## Traceability Matrix

| Requirement | Description                                                                                                                | Covered by                                                                                                                | Source files                                                                                                                                                                  | Status |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| CHARGE-01   | `AssignPlanDialog` incluye sección "Cobro" con monto recibido, método de pago y fecha al asignar/renovar plan.             | Plan 02 (backend acepta `amountReceived` en payload) + Plan 04 (types frontend) + Plan 05 Task 1 (UI bloque Cobro)        | `107-02-SUMMARY.md` (commits `3cd8ca45`, `495f0bbc`) · `107-04-SUMMARY.md` (commit `490919bf`) · `107-05-SUMMARY.md` (commit `23d5cef4`)                                      | DONE   |
| CHARGE-02   | `AssignPlanDialog` muestra preview en vivo del saldo resultante cuando `amountReceived < pricePaid` (banner + saldo).      | Plan 05 Task 1 (computed `pendingBalance` + banner amarillo `bg-yellow-1` + leyenda en español)                           | `107-05-SUMMARY.md` (commit `23d5cef4`) — `el-templo-admin/src/components/AssignPlanDialog.vue`                                                                               | DONE   |
| CHARGE-03   | Asignar plan + crear `financial_transaction` + crear `transaction_link` es atómico en una db.transaction; fallo revierte. | Plan 01 (`TransactionService.create` acepta `tx?: TxHandle`) + Plan 02 (helper `recordAssignmentCharge` dentro del outer `db.transaction`) + Plan 03 (atomicity test mock applyDelta failure) | `107-01-SUMMARY.md` (commits `26663b0d`, `e493b13e`) · `107-02-SUMMARY.md` (commits `3cd8ca45`, `495f0bbc`) · `107-03-PLAN.md` (test file `el-templo-api/test/subscriptions/charge-on-assign.test.ts`) | DONE (Plans 01 + 02) / PENDING re-run de Plan 03 atomicity test en CI |

**Nota:** CHARGE-04 fue absorbido en Phase 105 según `107-CONTEXT.md` → no aplica a Phase 107.

---

## Plans Status

| Plan   | Status                                                                                  | Tests / Verificación                                                                                                                                          | Notes                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 107-01 | DONE (`107-01-SUMMARY.md`)                                                              | finance integration tests 100/100 passing (`vitest run test/finance/transaction-service.test.ts test/finance/transactions-api.test.ts`)                       | `TxHandle` exportado desde balance-service · runner pattern aplicado a `TransactionService.create`                              |
| 107-02 | DONE (`107-02-SUMMARY.md`)                                                              | finance + subscriptions integration tests 214/214 passing — backward compat verificada (ninguno de los tests pasa `amountReceived`)                            | Helper `recordAssignmentCharge` extraído · 4 callsites refactorizados (assign / change-now / change-after-current / renew)      |
| 107-03 | PENDING SUMMARY (test file existente — re-run en CI/local antes de sign-off)            | `cd el-templo-api && pnpm test --run test/subscriptions/charge-on-assign.test.ts` → expected PASS (atomicity + happy + sad path matrix D-17)                  | Test directo de atomicidad mockea `BalanceService.applyDelta` → asserts subscription, transaction y balance row no persisten     |
| 107-04 | DONE (`107-04-SUMMARY.md`)                                                              | `vue-tsc --noEmit` filtrado por subscription.ts: 0 errores nuevos                                                                                              | `AssignPlanInput.amountReceived?: number` + `RenewSubscriptionInput.amountReceived?: number` agregados                          |
| 107-05 | DONE (`107-05-SUMMARY.md`) — checkpoint humano deferido al merge (parallel_execution)   | grep acceptance: 16 ocurrencias `amountReceived`, banner `bg-yellow-1` único, "Plan gratuito - sin cobro" único. Typecheck: 0 errores nuevos.                  | Bloque Cobro renderiza en step Confirmar · pre-fill = chargeBase · banner amarillo cuando parcial · disable cuando excede cap   |

---

## Smoke Test (D-20) — Staging

**Environment:** `staging.admin.eltemplo.org` (frontend admin) + staging API
**Tester:** ignaciobordon@eltemplo.org
**Smoke date:** PENDING — fecha al ejecutar
**Pre-condición:** Plans 01-05 deployados a staging (verificar último commit en branch `staging`).

### Escenario 1 — Cobro completo (default, backward compat)

**Objetivo:** Verificar que asignar plan con `amountReceived === finalPrice` (default) genera el cobro completo en CajaPage y NO marca al miembro como deudor.

**Steps:**

1. Login admin staging.
2. AlumnosPage → seleccionar miembro test → "Gestionar Plan" → "Asignar plan".
3. Plan: cualquiera con `priceRegular > 0` (ej. presencial mensual).
4. Step Confirmar: monto recibido pre-llenado = `finalPrice`. **NO modificar.**
5. Confirmar.

**Expected:**

- Asignación 201 OK.
- CajaPage del día muestra la transaction (`kind=plan_charge`, `amount=pricePaid`, `paymentMethod` elegido, branch correcto).
- AlumnosPage NO marca al miembro como deudor (sin tag visual / sin row en `balances`).
- DB: `SELECT * FROM balances WHERE member_id = X AND target_kind = 'subscription' AND target_id = subId` → 0 rows (o 1 row con `amount = 0` según convención Phase 105).
- DB: `SELECT * FROM financial_transactions WHERE member_id = X ORDER BY created_at DESC LIMIT 1` → 1 row con `amount = pricePaid`, `kind = 'plan_charge'`.

**Result:** `PENDING`
**Evidence:** [screenshot CajaPage del día | query SQL output | network request body | log line]
**Notes:** —

---

### Escenario 2 — Cobro parcial

**Objetivo:** Verificar que `amountReceived < pricePaid` genera balance row positivo, marca al miembro como deudor en AlumnosPage, y emite log estructurado.

**Steps:**

1. Login admin staging.
2. AlumnosPage → otro miembro test → "Gestionar Plan" → "Asignar plan".
3. Plan con `priceRegular = 100000` (o equivalente).
4. Step Confirmar: modificar monto recibido a `60000`.
5. Esperado en UI: banner amarillo `bg-yellow-1` con texto "El plan se asigna con saldo pendiente. El miembro quedará como deudor por $40.000 ARS."
6. Confirmar.

**Expected:**

- Asignación 201 OK.
- DB: `SELECT amount FROM balances WHERE member_id = X AND target_kind = 'subscription' AND target_id = subId` → `40000`.
- AlumnosPage marca al miembro como deudor (banner / tag visual según Phase 105 UI).
- CajaPage muestra cobro de `60000` con `kind=plan_charge`.
- DB: `SELECT * FROM financial_transactions WHERE member_id = X` → 1 row con `amount = 60000`.

**Result:** `PENDING`
**Evidence:** [screenshot del banner amarillo | screenshot AlumnosPage deudor | query SQL balances | query SQL financial_transactions]
**Notes:** —

---

### Escenario 3 — Cambio con proration + cobro parcial

**Objetivo:** Verificar que en `mode='change' + startMode='now'` el desglose Plan / Crédito proration / Neto es visible, `chargeBase = netAmount`, y el balance se calcula sobre la NUEVA subscriptionId.

**Steps:**

1. Asignar plan A al miembro test (ej. `priceRegular = 80000`), cobro full.
2. A las pocas horas: "Cambiar plan" → plan B (ej. `priceRegular = 120000`), `startMode='now'`.
3. Step Confirmar: ver desglose en español (Plan / Crédito proration / Neto a cobrar).
4. Asumir `netAmount = 100000` (ejemplo). Modificar monto recibido a `70000`.
5. Confirmar.

**Expected:**

- Cambio 201 OK; vieja subscription cancelada.
- Banner amarillo muestra "deudor por $30.000 ARS" (`netAmount 100000 - 70000 = 30000`).
- DB: balance row sobre la **NUEVA** `subscriptionId` tiene `amount = 30000`.
- DB: `financial_transactions` muestra `notes` autogenerado "Cobro al cambiar a plan {planB.name}" (Plan 02 D-16 flow="change-now").

**Result:** `PENDING`
**Evidence:** [screenshot del desglose proration | screenshot del banner amarillo | query SQL balance row sobre new subId | query SQL financial_transactions notes]
**Notes:** —

---

### Escenario 4 — Boarding pass / chargeBase = 0

**Objetivo:** Verificar que con `priceTypeApplied='zero'` o boarding pass o override = 0 el bloque Cobro queda visible pero deshabilitado, el botón Confirmar permanece habilitado, y NO se crea ni transaction ni balance row.

**Steps:**

1. Asignar plan con boarding pass activado (o `priceTypeApplied='zero'`, o override = 0).
2. Step Confirmar: bloque Cobro visible con leyenda "Plan gratuito - sin cobro" (bloque `bg-grey-2`); inputs deshabilitados.
3. Confirmar (botón debe estar habilitado).

**Expected:**

- Asignación 201 OK.
- DB: `SELECT * FROM financial_transactions WHERE member_id = X AND created_at > {assign_timestamp - 1 minuto}` → 0 rows creados por este assign.
- DB: `SELECT * FROM balances WHERE member_id = X AND target_kind = 'subscription' AND target_id = subId` → 0 rows.
- CajaPage NO muestra ninguna transaction nueva por este assign.

**Result:** `PENDING`
**Evidence:** [screenshot bloque Cobro deshabilitado con leyenda | query SQL financial_transactions | query SQL balances]
**Notes:** —

---

### Escenario 5 — Logs estructurados visibles

**Objetivo:** Verificar que el log estructurado `"Plan asignado con cobro parcial"` (D-16) aparece en server logs / Sentry con todos los campos requeridos para los Escenarios 2 y 3.

**Steps:**

1. Después de Escenarios 2 y 3, verificar logs server (Sentry / CloudWatch / `pm2 logs` / docker logs según el setup de staging).
2. Buscar texto exacto: `"Plan asignado con cobro parcial"`.

**Expected:**

- ≥2 log lines con ese mensaje (uno por cada escenario parcial: 2 y 3).
- Campos del JSON estructurado presentes en cada log: `userId`, `subscriptionId`, `planId`, `pricePaid`, `amountReceived`, `pendingBalance`, `paymentMethod`, `branchId`, `recordedBy`, `flow`.
- Para Escenario 2 → `flow = "assign"`.
- Para Escenario 3 → `flow = "change-now"`.

**Result:** `PENDING`
**Evidence:** [grep result en server logs | log excerpt JSON | Sentry event link]
**Notes:** —

---

## Atomicity (CHARGE-03) — Automated Verification

Plan 03 (107-03-PLAN.md) incluye test directo de atomicidad — mockea `BalanceService.applyDelta` para que tire `Error` durante `assignPlan`, y assertea que ni la subscription, ni el `financial_transaction`, ni la `balance` row quedan persistidos.

**File:** `el-templo-api/test/subscriptions/charge-on-assign.test.ts`
**Run:** `cd el-templo-api && pnpm test --run test/subscriptions/charge-on-assign.test.ts`
**Expected:** PASS — describe "Atomicity (D-11)" assertions verifican rollback completo (subscription rollback + transaction rollback + balance rollback).

**Status:** `PENDING` (re-run obligatorio antes de sign-off)
**Last run:** PENDING — capturar output del comando + timestamp al ejecutar

---

## Production Deploy Sign-Off (D-21)

**Política operativa estándar:** **NO desplegar viernes.** Esta regla es no-negociable.

**Fecha actual de deploy:** PENDING — verificar con `date +%A` al momento del push y abortar si retorna `Friday`.

### Pre-flight checklist

- [ ] Plans 107-01 .. 107-05 con SUMMARY.md presente en `.planning/phases/107-cobro-al-asignar-plan/`
- [ ] Plan 107-03 SUMMARY.md presente (atomicity test ejecutado y verde)
- [ ] `cd el-templo-api && pnpm test` verde — full suite, no solo subscriptions/finance
- [ ] `cd el-templo-api && npx tsc --noEmit` → 0 errores
- [ ] `cd el-templo-admin && npx vue-tsc --noEmit` → 0 errores nuevos (los pre-existentes de SessionsPage / SessionEditPage están fuera de scope per Plan 04 SUMMARY)
- [ ] Smoke staging Escenarios 1-5 con Result = ✅
- [ ] Logs estructurados verificados (Escenario 5)
- [ ] Atomicity test re-run y verde (sección "Atomicity (CHARGE-03)" arriba)
- [ ] **D-21:** Hoy NO es viernes (verificar con `date +%A` al momento del deploy)
- [ ] Branch `staging` mergeado y deployado primero (regla `feedback_staging_first_strict`)
- [ ] No hay deploys frontend manuales pendientes (regla `feedback_no_manual_deploys`)

### Approval

**Sign-off:** ☐ ignaciobordon@eltemplo.org
**Fecha del sign-off:** ____________________
**Nota / observaciones:** ____________________

### Production deploy

Una vez firmado:

1. Verificar `date +%A` ≠ `Friday`.
2. **Pedir confirmación explícita al usuario antes de cualquier `git push`** (regla `feedback_ask_before_push`).
3. Ejecutar el pipeline de deploy estándar: master push → CI/CD → deploy automatizado a producción.
4. Post-deploy: monitorear Sentry + CajaPage por 24h para confirmar que cobros parciales se registran correctamente y que no aparecen orphans (subscription sin transaction).

**Importante:** Claude NO ejecuta el push a master ni el deploy a producción dentro de este plan. El plan termina con el sign-off del documento.

---

## Issues Found

PENDING — durante la ejecución del smoke staging, listar acá cualquier issue + plan de remediation. Si todo verde, dejar "None."

| # | Escenario | Issue | Severity | Remediation plan |
| - | --------- | ----- | -------- | ---------------- |
| — | —         | —     | —        | —                |

---

## Appendix: D-20 / D-21 references

- **D-20** (`107-CONTEXT.md` línea 109-114): Rollout: deploy a staging primero. Smoke test obligatorio del flujo completo: 5 escenarios listados arriba.
- **D-21** (`107-CONTEXT.md` línea 115): Después de smoke test verde en staging, deploy a producción. NO deploy de viernes (regla operativa estándar).
- **CHARGE-01 / CHARGE-02 / CHARGE-03** (`REQUIREMENTS.md` líneas 50-52): definiciones canónicas de los requirements de Phase 107.

---

_Phase: 107-cobro-al-asignar-plan_
_Verification scaffold creado: 2026-04-28_
_Smoke + sign-off: PENDING_
