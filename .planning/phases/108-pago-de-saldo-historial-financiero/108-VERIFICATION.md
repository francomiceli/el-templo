# Phase 108: Pago de Saldo + Historial Financiero — Verification

**Date:** 2026-04-29
**Phase status:** Awaiting sign-off (smoke staging pendiente — los 6 escenarios están como PENDING hasta que el operador los ejecute)
**Verified by:** Claude (scaffold + automated checks de Plans 01-05) + ignaciobordon@eltemplo.org (smoke manual pendiente)

Este documento captura:

1. La matriz de trazabilidad de los requirements **PAYMENT-01 / PAYMENT-02 / PAYMENT-03** contra los plans 01-05 que los cubrieron.
2. El status de cada plan de Phase 108 (referenciando los SUMMARY.md ya merged).
3. La cobertura de las **24 decisiones D-01..D-24** del CONTEXT, con D-20 explícitamente marcado **OUT-OF-SCOPE**.
4. El skeleton del **smoke test** con los 6 escenarios obligatorios — todos en estado `PENDING` hasta que el operador ejecute el smoke contra staging real.
5. El **sign-off para deploy a producción** con la regla operativa **D-21: NO desplegar viernes**.

---

## Traceability Matrix

| Requirement    | Description                                                                                                                                                                                                                  | Covered by                                                                                                                              | Source files                                                                                                                                                                                                                                          | Status                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **PAYMENT-01** | `AlumnoDetailPage` tiene botón "Registrar pago" que abre dialog con monto, método, fecha y notas. Disabled cuando no hay saldos pendientes (D-19), gated por FINANCE_WRITE_ROLES (D-23).                                     | Plan 03 (types `RegisterPaymentInput` + composable `createTransaction`) + Plan 04 (RegisterPaymentDialog + AlumnoDetailPage wiring)     | `108-03-SUMMARY.md` (commits `a1090d01`, `eefcf6dc`) · `108-04-SUMMARY.md` (commits `87eb977d`, `60ea475e`) — `el-templo-admin/src/components/RegisterPaymentDialog.vue`, `el-templo-admin/src/pages/AlumnoDetailPage.vue`                              | DONE (smoke staging PENDING)                      |
| **PAYMENT-02** | Dialog "Registrar pago" lista conceptos pendientes con descripción, saldo y antigüedad. Permite split allocation con validación en vivo `Σ allocated = monto recibido` (frontend) + invariante backend (defensa en profundidad). | Plan 01 (endpoint `outstanding-concepts` + service) + Plan 02 (17 integration tests) + Plan 03 (types + composable) + Plan 04 (split UX) | `108-01-SUMMARY.md` (commits `1c57df31`, `3fcb8025`) · `108-02-SUMMARY.md` (commit `c2111176`) · `108-03-SUMMARY.md` (commits `a1090d01`, `eefcf6dc`) · `108-04-SUMMARY.md` (commits `87eb977d`, `60ea475e`) — backend tests `outstanding-concepts.test.ts` (17/17 PASS) | DONE (backend tests verdes; smoke staging PENDING) |
| **PAYMENT-03** | Tab "Finanzas" en `AlumnoDetailPage` con timeline cronológico de transacciones (q-list + q-expansion-item), paginación append-mode, info de void cuando aplica, botón Anular gated por FINANCE_VOID_ROLES (D-16).            | Plan 03 (types `FinancialHistoryItem` + composable `getFinancialHistory`) + Plan 05 (VoidTransactionDialog + FinancialHistoryTab + 6to tab) | `108-03-SUMMARY.md` (commits `a1090d01`, `eefcf6dc`) · `108-05-SUMMARY.md` (commits `0632c697`, `2b158bac`, `c35ebdde`) — `el-templo-admin/src/components/FinancialHistoryTab.vue`, `el-templo-admin/src/components/VoidTransactionDialog.vue`, `AlumnoDetailPage.vue` | DONE (smoke staging PENDING)                      |

**Nota:** Los endpoints `POST /admin/finance/transactions` (registrar) y `POST /admin/finance/transactions/:id/void` (anular) consumidos por PAYMENT-01/02/03 son preexistentes desde Phase 106 — Phase 108 NO los toca, solo los consume desde el frontend admin.

---

## Plans Status

| Plan   | Status                          | Tests / Verificación                                                                                                                              | Notes                                                                                                                            |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 108-01 | DONE (`108-01-SUMMARY.md`)      | `pnpm exec tsc --noEmit` 0 errors · grep checks PASS · `additionalProperties: true` en response schema (5 matches)                                 | Endpoint `GET /admin/members/:userId/outstanding-concepts` montado · `OutstandingConcept` + `outstandingConceptsSchema` exportados |
| 108-02 | DONE (`108-02-SUMMARY.md`)      | `pnpm test outstanding-concepts` → **17/17 PASS** (68.42s) · `pnpm test finance` → 121/121 PASS (sin regresión)                                    | 17 casos: 5 happy (D-01/D-03/D-04/D-06) + 5 RBAC + 3 cross-country (incluye virtual branch) + 4 edge (filter amount<=0, soft-delete) |
| 108-03 | DONE (`108-03-SUMMARY.md`)      | `tsc --noEmit` clean en `transaction.ts` y `useTransactionsApi.ts` · ESLint 0 issues · grep acceptance PASS                                       | 4 nuevos types + 3 nuevos métodos composable · `RegisterPaymentInput.kind = 'debt_settlement'`, `direction = 'inflow'` literales   |
| 108-04 | DONE (`108-04-SUMMARY.md`)      | `tsc --noEmit` clean en `RegisterPaymentDialog.vue` y `AlumnoDetailPage.vue` · ESLint 0 issues · 21/21 grep checks PASS                            | Auto-FIFO greedy + watch en montoRecibido + "Pagar todo" + Σ live + filter allocations === 0 · multi-currency anomaly via log warn |
| 108-05 | DONE (`108-05-SUMMARY.md`)      | `tsc --noEmit` clean en VoidTransactionDialog.vue + FinancialHistoryTab.vue + AlumnoDetailPage.vue · ESLint 0 issues · 23/23 grep checks PASS      | 6to tab "Finanzas" en AlumnoDetailPage · q-expansion-item + paginación append PAGE_SIZE=50 · `text-strike` + badge ANULADO (D-15) |
| 108-06 | EN CURSO (este SUMMARY)         | Scaffold de VERIFICATION.md generado en modo paralelo autónomo · Smoke staging PENDING                                                            | Operador ejecuta los 6 escenarios contra staging real y firma el sign-off                                                        |

---

## Decisions Coverage (D-01..D-24)

Las 24 decisiones del `108-CONTEXT.md` están mapeadas a su plan de cobertura. **D-20 está marcado OUT-OF-SCOPE explícito** — ventas de merch / donaciones / pagos anticipados quedan fuera de Phase 108 por decisión del usuario.

| Decision  | Description                                                                                                       | Plan(s)                | Status                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| **D-01**  | Endpoint dedicado `outstanding-concepts` retorna `OutstandingConcept[]` ordenado FIFO ASC por `effectiveDate`.    | 01, 02                 | DONE (sort en TS por `localeCompare`; verificado en test OC4)            |
| **D-02**  | Sin paginación — array completo en una sola response.                                                             | 01                     | DONE (sin querystring en schema)                                         |
| **D-03**  | Sin saldos retorna `[]`, no 404.                                                                                  | 01, 02                 | DONE (verificado en test OC1)                                           |
| **D-04**  | `ageInDays` clamp `>= 0` cuando `effectiveDate` es futuro; computado en TS, no SQL DATEDIFF.                       | 01, 02                 | DONE (verificado en test OC5)                                           |
| **D-05**  | `effectiveDate` desde `subscriptions.startDate` (subscription) o `balances.createdAt` (debt_balance fallback).    | 01                     | DONE (LEFT JOIN obligatorio; ver SUMMARY 108-01 decisions)              |
| **D-06**  | Description: `"Mensualidad <Mes> <Año> — <PlanName>"` o `"Saldo libre #<id>"`.                                    | 01, 02                 | DONE (verificado en tests OC2 y OC3)                                    |
| **D-07**  | Auto-FIFO + botón "Pagar todo" + watcher en montoRecibido para re-correr greedy.                                  | 04                     | DONE (smoke PENDING — escenarios 1 y 2)                                 |
| **D-08**  | Allocations === 0 NO se incluyen en payload `links` (filter antes de submit).                                     | 04                     | DONE (verificado por grep `allocatedAmount > 0` en submit handler)       |
| **D-09**  | `Σ allocated DEBE === monto recibido`; Confirmar disabled si no.                                                  | 04                     | DONE (smoke PENDING — escenario 3)                                       |
| **D-10**  | Frontend valida en vivo + backend rechaza con 400 (defensa en profundidad).                                        | 04 (frontend) + 105/106 (backend) | DONE (backend invariante existente desde Phase 105 SPEC §7)        |
| **D-11**  | `Σ allocated > 0` obligatorio (≥1 link con `allocatedAmount > 0`).                                                 | 04                     | DONE (filter D-08 + invariante backend Phase 105)                       |
| **D-12**  | Granularity historial: `q-list` + `q-expansion-item`, una row por transacción expandible para split de links.      | 05                     | DONE (smoke PENDING — escenarios 1, 4)                                  |
| **D-13**  | `q-tabs` en AlumnoDetailPage incluye tab "Finanzas" con FinancialHistoryTab.                                       | 05                     | DONE (6to tab montado junto a perfil/entrenamiento/notas/suscripcion/asistencia) |
| **D-14**  | Paginación append "Cargar más" con `PAGE_SIZE = 50`.                                                                | 05                     | DONE (verificado por grep PAGE_SIZE=50 + Cargar más)                    |
| **D-15**  | Voided rows: strikethrough + badge "ANULADO" + razón visible al expandir.                                          | 05                     | DONE (smoke PENDING — escenario 4)                                      |
| **D-16**  | Botón Anular visible solo para `FINANCE_VOID_ROLES = owner | admin | gestion` (sin recepción ni coach).            | 05                     | DONE (smoke PENDING — escenario 5)                                      |
| **D-17**  | Dialog Anular con razón obligatoria, min 5 chars (computed `isValid` + q-input `:rules`).                          | 05                     | DONE (smoke PENDING — escenario 4)                                      |
| **D-18**  | Anular auditado (`voided_at`, `voided_by`, `void_reason`); balance revierte automáticamente.                       | 05 (frontend) + 105/106 (backend) | DONE (smoke PENDING — escenario 4)                                  |
| **D-19**  | Botón "Registrar pago" disabled con tooltip "Sin saldos pendientes" cuando `outstandingConcepts.length === 0`.     | 04                     | DONE (smoke PENDING — escenario 2)                                      |
| **D-20**  | Ventas de merch / donaciones / pagos anticipados / kind=adjustment libre sin link.                                  | n/a                    | **OUT-OF-SCOPE — diferido a fase futura**. Phase 108 cubre solo "pago de saldo" estricto. |
| **D-21**  | Multi-currency anomaly: log `warn` a Sentry y mostrar solo la moneda mayoritaria; no bloquear UX.                  | 04                     | DONE (smoke PENDING — escenario 6)                                      |
| **D-22**  | `POST /admin/finance/transactions` con `kind='debt_settlement'`, `direction='inflow'`, `links=[...]`.              | 04                     | DONE (verificado por grep `kind: 'debt_settlement'` en submit handler) |
| **D-23**  | Botón "Registrar pago" RBAC `FINANCE_WRITE_ROLES = owner | admin | gestion | recepcion` (sin coach).               | 04                     | DONE (smoke PENDING — escenario 5)                                      |
| **D-24**  | Single payment method per pago (sin multi-method split en una sola transacción).                                    | 04                     | DONE (un solo `paymentMethod` en payload por diseño del dialog)         |

---

## Smoke Test — Staging

**Environment:** `staging.admin.eltemplo.org` (frontend admin) + staging API
**Tester:** ignaciobordon@eltemplo.org
**Smoke date:** PENDING — fecha al ejecutar
**Pre-condición:** Plans 01-05 deployados a staging (verificar último commit en branch `staging`).

### Escenario 1 — Pago completo de 2 saldos con auto-FIFO

**Objetivo:** Verificar que un alumno con 2 saldos abiertos puede pagar todo en una sola transacción, con allocation FIFO automática y registro visible en el historial financiero con expand mostrando los 2 links.

**Setup:**

- Alumno con 2 subscriptions activas, ambas con saldo pendiente:
  - Mensualidad Marzo 2026 — saldo $20.000
  - Mensualidad Abril 2026 — saldo $30.000
- Login como admin (cualquier país de la branch del alumno).

**Steps:**

1. Navegar a `AlumnoDetailPage` del alumno.
2. Verificar que el botón "Registrar pago" está visible y habilitado en el header card.
3. Click "Registrar pago" → dialog se abre.
4. Verificar que los 2 conceptos aparecen en orden FIFO (Marzo primero, Abril segundo).
5. Verificar que cada concepto muestra "Saldo: $X · Hace N días".
6. Tipear `50000` en "Monto recibido".
7. Verificar auto-FIFO: Marzo aloca $20.000, Abril aloca $30.000 automáticamente.
8. Verificar Σ display: `Total asignado: $50.000 / $50.000 ✓` en verde.
9. Click "Confirmar".

**Expected:**

- Dialog cierra con notify "Pago registrado correctamente".
- Botón "Registrar pago" se deshabilita y aparece tooltip "Sin saldos pendientes" on hover.
- Tab "Finanzas" muestra una nueva row "Pago de saldo · $50.000".
- Expandir la row muestra los 2 links: $20.000 → Mensualidad Marzo 2026, $30.000 → Mensualidad Abril 2026.
- DB: `SELECT * FROM balances WHERE member_id = X AND amount > 0` → 0 rows (saldos en 0).
- DB: `SELECT * FROM financial_transactions WHERE member_id = X AND kind = 'debt_settlement' ORDER BY created_at DESC LIMIT 1` → 1 row con `amount = 50000`.

**Result:** `PENDING`
**Evidence:** [screenshot dialog + tab Finanzas | query SQL output | network request body]
**Notes:** —

---

### Escenario 2 — Sin saldos pendientes → botón disabled

**Objetivo:** Verificar que cuando un alumno no tiene saldos abiertos, el botón "Registrar pago" se renderiza disabled con tooltip explicativo (D-19).

**Setup:**

- Alumno sin saldos pendientes (`outstanding-concepts` retorna `[]`).
- Login como admin.

**Steps:**

1. Navegar a `AlumnoDetailPage` del alumno.
2. Verificar que el botón "Registrar pago" está renderizado pero **disabled**.
3. Hover el botón → tooltip "Sin saldos pendientes" visible.
4. (Opcional sanity) Asegurar que el tab "Finanzas" se carga normalmente (puede estar vacío o mostrar historial previo).

**Expected:**

- Botón disabled, no clickeable.
- Tooltip "Sin saldos pendientes" aparece on hover.
- API: `GET /admin/members/:id/outstanding-concepts` retorna `{ concepts: [] }` con 200 (no 404).

**Result:** `PENDING`
**Evidence:** [screenshot del botón disabled + tooltip | network response]
**Notes:** —

---

### Escenario 3 — Σ ≠ monto bloquea Confirmar

**Objetivo:** Verificar que cuando la suma de allocations no coincide con el monto recibido, el botón Confirmar queda disabled y aparece mensaje rojo "Faltan/Sobran $X" (D-09/D-10).

**Setup:** Alumno con saldo $50.000.

**Steps:**

1. Click "Registrar pago".
2. Tipear monto recibido = `40000`.
3. Auto-FIFO debería alocar $40.000 al concepto.
4. Editar manualmente la allocation del concepto a `30000`.
5. Verificar Σ display: `Total asignado: $30.000 / $40.000 · Faltan $10.000` en rojo.
6. Verificar Confirmar **disabled**.
7. Editar allocation a `45000` (over-allocate vs monto recibido).
8. Verificar Σ display: `Total asignado: $45.000 / $40.000 · Sobran $5.000` en rojo.
9. Verificar Confirmar **disabled**.
10. Editar allocation a `40000`.
11. Verificar Σ display verde y Confirmar **enabled**.

**Expected:**

- Confirmar SOLO se habilita cuando `Σ allocated === monto recibido` Y `montoRecibido > 0`.
- Mensajes "Faltan $X" / "Sobran $X" en rojo coinciden con la diferencia exacta.
- Backend NO recibe payload con Σ ≠ amount (frontend lo bloquea antes).

**Result:** `PENDING`
**Evidence:** [screenshot estados rojo/verde + botón Confirmar disabled/enabled]
**Notes:** —

---

### Escenario 4 — Anular transacción → saldo reaparece

**Objetivo:** Verificar que anular una transacción del historial financiero (con razón ≥5 chars) revierte el balance automáticamente, marca la row como ANULADO con strikethrough, y rehabilita el botón "Registrar pago" (D-15/D-17/D-18).

**Setup:** Alumno con un pago de saldo registrado (Escenario 1 o 2 ya completado).

**Steps:**

1. Navegar a tab "Finanzas".
2. Localizar la transacción del pago de saldo.
3. Verificar que el botón "Anular" (icono cancel) es visible en la row (estás logueado como admin, en FINANCE_VOID_ROLES).
4. Click "Anular" → dialog "Anular transacción" abre.
5. Verificar que Confirmar está **disabled** mientras razón está vacía.
6. Tipear `test` (4 chars) → Confirmar sigue **disabled** + rule message "Mínimo 5 caracteres".
7. Tipear `Error de test` (≥5 chars) → Confirmar **habilitado**.
8. Click "Anular".
9. Verificar notify "Transacción anulada".
10. Verificar que la row del historial ahora aparece con `text-strike` + badge rojo `ANULADO`.
11. Expandir la row → verificar que aparece "Información de anulación · Razón: Error de test" + `voided_at` + `voided_by` (operador).
12. Volver al header card → verificar que el botón "Registrar pago" volvió a estar **habilitado** (saldo reapareció en outstanding-concepts).

**Expected:**

- Transacción visible en historial pero anulada visualmente (no se oculta — auditoría requiere verla).
- Saldo revierte automáticamente y outstanding-concepts vuelve a listarlo.
- DB: `financial_transactions` row con `voided_at != NULL`, `voided_by = adminUserId`, `void_reason = 'Error de test'`.
- DB: `balances` row del concepto vuelve a `amount > 0`.

**Result:** `PENDING`
**Evidence:** [screenshot row strikethrough + badge ANULADO + expand con razón | query SQL voided_at]
**Notes:** —

---

### Escenario 5 — RBAC: Recepción NO ve botón Anular; Coach NO ve nada

**Objetivo:** Verificar que el botón "Anular" está gated por FINANCE_VOID_ROLES (D-16), que recepción puede registrar pagos pero no anular (D-23 vs D-16), y que coach no tiene acceso al tab "Finanzas".

**Setup:** Alumno con historial de transacciones (≥1 row no-anulada).

**Steps (recepción):**

1. Login como `recepcion`.
2. Navegar a `AlumnoDetailPage` del alumno.
3. Verificar que el botón "Registrar pago" SÍ está visible (recepción está en FINANCE_WRITE_ROLES per D-23).
4. Click tab "Finanzas".
5. Verificar que las transacciones se muestran (recepción tiene FINANCE_READ_ROLES).
6. Verificar que el botón "Anular" **NO aparece en ninguna row** (recepción NO está en FINANCE_VOID_ROLES per D-16).

**Steps (coach):**

7. Logout, login como `coach`.
8. Navegar a `AlumnoDetailPage` del mismo alumno.
9. Verificar que el botón "Registrar pago" **NO aparece** (coach NO está en FINANCE_WRITE_ROLES).
10. Click tab "Finanzas" (si el tab es visible) → debería responder 403 desde el endpoint (coach NO está en FINANCE_READ_ROLES); el componente debe mostrar estado de error o vacío gracefully.

**Expected:**

- Recepción: registra pagos, ve historial, NO puede anular.
- Coach: no puede registrar, no puede leer historial; el endpoint backend rechaza con 403.
- Ningún privilege escalation visible en el frontend.

**Result:** `PENDING`
**Evidence:** [screenshots header card + tab Finanzas para ambos roles | network 403 para coach en `financial-history`]
**Notes:** —

---

### Escenario 6 — Multi-currency anomaly: log warn + render mayoritaria

**Objetivo:** Verificar que cuando un alumno tiene (por anomalía de data) saldos abiertos en >1 moneda, el dialog "Registrar pago" loguea un `warn` a Sentry y renderiza solo los conceptos de la moneda mayoritaria, sin bloquear UX (D-21).

**Setup:**

- Alumno con saldos en al menos 2 monedas distintas (ej. 2 saldos en ARS + 1 saldo en EUR). Si el ambiente staging no permite construir esta anomalía, este escenario se considera **best-effort**: verificar el branch del código + un test unitario manual con data mockeada en consola.
- Login como admin.

**Steps:**

1. Click "Registrar pago".
2. Verificar que el dialog se abre normalmente (no bloquea).
3. Verificar en DevTools network: la response de `outstanding-concepts` contiene saldos en ≥2 monedas.
4. Verificar que el dialog renderiza solo los saldos de la moneda mayoritaria.
5. Verificar en consola del navegador (modo dev) o en Sentry (staging) que se emitió un log con nivel `warn` desde `RegisterPaymentDialog` mencionando la anomalía.
6. Verificar que NO se emitió ningún log con nivel `error` (el caso es data-quality, no error de runtime).

**Expected:**

- UX no bloqueada: dialog se abre y permite registrar pago en la moneda mayoritaria.
- Log estructurado de nivel `warn` visible en consola (dev) o en el dashboard de Sentry (staging) — pero NO error.
- Operaciones tiene visibilidad para revisar la anomalía data-quality offline.

**Result:** `PENDING`
**Evidence:** [screenshot dialog + DevTools network + console warn line | Sentry warn entry]
**Notes:** Si la anomalía no es reproducible en staging por integridad de data, marcar `SKIP — anomaly not reproducible` y dejar la verificación al code review del branch (`grep "log.warn" RegisterPaymentDialog.vue`).

---

## Status Summary

| Item                                              | Status                              |
| ------------------------------------------------- | ----------------------------------- |
| Plan 01 (backend endpoint + service)              | DONE                                |
| Plan 02 (17 integration tests)                    | DONE (17/17 PASS)                   |
| Plan 03 (composable + types frontend)             | DONE                                |
| Plan 04 (RegisterPaymentDialog + button)          | DONE                                |
| Plan 05 (FinancialHistoryTab + VoidDialog + tab)  | DONE                                |
| Plan 06 (VERIFICATION.md scaffold)                | DONE (este documento)               |
| Smoke Escenario 1 (auto-FIFO 2 saldos)            | PENDING                             |
| Smoke Escenario 2 (sin saldos → disabled)         | PENDING                             |
| Smoke Escenario 3 (Σ ≠ monto bloquea Confirmar)   | PENDING                             |
| Smoke Escenario 4 (anular → saldo reaparece)      | PENDING                             |
| Smoke Escenario 5 (RBAC recepción / coach)        | PENDING                             |
| Smoke Escenario 6 (multi-currency anomaly D-21)   | PENDING                             |
| Sign-off para deploy a producción                 | PENDING (bloqueado por smoke + D-21) |

---

## Gaps

_Vacío hasta que se identifiquen gaps durante la verificación._

Cuando el operador ejecute el smoke, cualquier escenario que falle se documenta acá con:

- ID del escenario.
- Descripción concreta del fallo (qué se observó vs lo esperado).
- Severity (blocker / high / medium / low).
- Plan de cierre propuesto: `/gsd-plan-phase 108 --gaps` para abrir un gap closure plan.

---

## Sign-off para Producción

**Pre-flight checks (todos obligatorios):**

- [ ] Los 6 escenarios smoke en estado `PASS` (sin gaps abiertos blocker/high).
- [ ] `pnpm test outstanding-concepts` verde en CI antes del deploy (Plan 02 — 17/17 PASS).
- [ ] `pnpm test finance` verde en CI antes del deploy (sin regresión sobre 121 tests existentes).
- [ ] `vue-tsc --noEmit` clean en archivos modificados de Plans 04 y 05 (RegisterPaymentDialog.vue, FinancialHistoryTab.vue, VoidTransactionDialog.vue, AlumnoDetailPage.vue).
- [ ] ESLint clean en los archivos anteriores.
- [ ] **D-21 — NO desplegar viernes ni vísperas de feriado**. Si el smoke termina jueves o más tarde, el deploy se posterga al lunes siguiente. Esta regla es operativa estricta — la justificación es que un bug regresivo en finanzas detectado un sábado tiene ventana de respuesta nula y bloquea operaciones (registrar pagos / anular) durante todo el fin de semana.
- [ ] Backup de las 3 tablas finance (`financial_transactions`, `transaction_links`, `balances`) tomado pre-deploy en EC2 (rollback path conocido).
- [ ] Plan de rollback documentado: revertir el deploy admin (no hay schema changes en Phase 108 — el rollback es solo de assets frontend; backend no cambió).

**Día de deploy (cuando los pre-flight checks están todos en verde):**

| Acción                                                                        | Owner                       | Timestamp |
| ----------------------------------------------------------------------------- | --------------------------- | --------- |
| Mergear branch de Phase 108 a `staging` (si no estaba ya)                     | Claude (PR) + ignaciobordon | PENDING   |
| Smoke staging completo (los 6 escenarios) — con evidencia adjunta a este doc  | ignaciobordon               | PENDING   |
| Sign-off para producción (firmar abajo)                                       | ignaciobordon               | PENDING   |
| Deploy a producción vía CI/CD pipeline standard                               | CI/CD                       | PENDING   |
| Smoke post-deploy en producción (escenarios 1, 2, 4 mínimo — golden path)     | ignaciobordon               | PENDING   |

**Sign-off:**

- **Smoke staging completo:** PENDING — fecha y firma al ejecutar.
- **Día y hora del deploy a producción:** PENDING — recordar D-21 (NO viernes / víspera de feriado).
- **Operador firmante:** ignaciobordon@eltemplo.org

```
[ ] Yo, _________________________, confirmo que los 6 escenarios smoke pasaron en staging,
    los pre-flight checks están en verde, y autorizo el deploy a producción.

    Fecha de sign-off: ____________________
    Día del deploy:    ____________________  (verificar D-21: NO viernes)
    Firma:             ____________________
```

---

## Notes

- Todos los plans 01-05 están deployables independientemente, pero el smoke debe correrse con los 5 mergeados juntos para reflejar el estado end-to-end del usuario final.
- Si algún escenario falla, abrir gap closure plan vía `/gsd-plan-phase 108 --gaps` antes del sign-off.
- Backend tests (Plan 02) son automáticos y corren en CI — no requieren navegador.
- Los escenarios 1-5 requieren navegador en staging real con data válida; escenario 6 puede ser SKIP si la anomalía de data no es reproducible (verificación por code review aceptable como fallback).
- Phase 108 NO toca schema DB — el rollback es solo de assets frontend admin (sin migración a revertir).
- D-20 (ventas / donaciones / pagos anticipados) queda **explícitamente fuera de scope** — si operaciones lo necesita, abrir nueva fase con UI de adjustments libres, no parchear Phase 108.
