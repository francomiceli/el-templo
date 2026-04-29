# Phase 109: Caja v2 + Reportes — Verification

**Date:** 2026-04-29
**Phase status:** Awaiting sign-off (smoke staging pendiente — los 6 escenarios están como PENDING hasta que el operador los ejecute)
**Verified by:** Claude (scaffold + automated checks de Plans 01-05) + ignaciobordon@eltemplo.org (smoke manual pendiente)

Este documento captura:

1. La matriz de trazabilidad de los requirements **CAJA-01 / CAJA-02 / CAJA-03 / CAJA-04** contra los plans 01-05 que los cubrieron.
2. El status de cada plan de Phase 109 (referenciando los SUMMARY.md ya merged).
3. La cobertura de las **22 decisiones D-01..D-22** del CONTEXT.
4. El skeleton del **smoke test** con los 6 escenarios obligatorios — todos en estado `PENDING` hasta que el operador ejecute el smoke contra staging real.
5. El **sign-off para deploy a producción** con la regla operativa **NO desplegar viernes** (locked como invariante operativa de Phase 107/108 y heredada acá).

---

## Smoke Pendiente — Handoff al Operador

El usuario decidió ejecutar los 6 escenarios de smoke contra staging de forma independiente, fuera del scope del executor. Este documento queda como scaffold listo para que el operador (`ignaciobordon@eltemplo.org`) marque los Result/Evidence al ir corriendo cada escenario.

Mismo patrón que cierre de Phase 107/108: el código está mergeado, los tests automatizados pasan, y el smoke staging se completa offline antes del sign-off de producción. Phase 109 NO se considera 100% completa hasta que los 6 escenarios estén en estado `PASS` y el sign-off esté firmado.

---

## Traceability Matrix

| Requirement | Description                                                                                                                                                       | Covered by                                                                                         | Source files                                                                                                                                                                                                                                                                                 | Status                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **CAJA-01** | `CajaPage` summary segmentado por `kind` (cobros de plan, saldos de deuda, ajustes, reembolsos, pagos anticipados) además del corte actual por método y sucursal. | Plan 01 (backend `revenueByKind` aggregation) + Plan 03 (frontend "Por tipo de transacción" block) | `109-01-SUMMARY.md` (commits `0c02ce2e`, `a65e4ff1`) · `109-03-SUMMARY.md` (commit `47f54656`) — `el-templo-api/src/modules/finance/transaction-service.ts`, `el-templo-admin/src/pages/CajaPage.vue`, `el-templo-admin/src/types/transaction.ts`                                            | DONE (smoke staging PENDING) |
| **CAJA-02** | `CajaPage` tabla muestra columna `kind` y filtro por tipo de transacción.                                                                                         | Plan 03 (frontend Tipo filter + badge column)                                                      | `109-03-SUMMARY.md` (commit `c4092ed4`) — `el-templo-admin/src/pages/CajaPage.vue`                                                                                                                                                                                                           | DONE (smoke staging PENDING) |
| **CAJA-03** | Reporte de antigüedad de deudas pendientes ("Deudas"): lista de saldos abiertos agrupable por sucursal, plan, antigüedad (0-30, 31-60, 61-90, 90+ días), miembro. | Plan 02 (backend endpoint + service + 17 tests) + Plan 04 (frontend DeudasReport en ReportesPage)  | `109-02-SUMMARY.md` (commits `bf8af20d`, `a5171f99`, `33a46447`) · `109-04-SUMMARY.md` (commits `fbd6f15e`, `93fc0257`) — `el-templo-api/src/modules/reports/service.ts`, `el-templo-api/src/modules/reports/routes.ts`, `el-templo-admin/src/pages/ReportesPage.vue`, `DeudasReport.vue`    | DONE (smoke staging PENDING) |
| **CAJA-04** | Excel export del CajaPage y del reporte de aging actualizado para reflejar el modelo nuevo (columnas: kind, allocated amounts, target del link).                  | Plan 03 (CajaPage server-side export) + Plan 04 (Deudas server-side export)                        | `109-03-SUMMARY.md` (commit `21c5a8d0`) · `109-04-SUMMARY.md` (commit `4f148eb3`) — `el-templo-api/src/modules/finance/routes.ts`, `el-templo-api/src/modules/reports/routes.ts`, `el-templo-api/src/modules/finance/transaction-service.ts`, `el-templo-api/src/modules/reports/service.ts` | DONE (smoke staging PENDING) |

**Nota:** Los endpoints `GET /api/admin/finance/transactions/summary` (Phase 106) y `GET /api/admin/finance/transactions` con filtro `?kind=` (Phase 106) son preexistentes — Phase 109 los **extiende** (additive — D-11) sin breaking changes. El endpoint nuevo `GET /api/admin/reports/outstanding-balances` se agrega como sub-recurso bajo el módulo reports siguiendo el patrón de los 4 reportes existentes (Phase 65).

---

## Plans Status

| Plan   | Status                     | Tests / Verificación                                                                                                               | Notes                                                                                                                                                                                  |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 109-01 | DONE (`109-01-SUMMARY.md`) | `pnpm test summary-by-kind` → 8/8 PASS (RBK1-RBK8) · `tsc --noEmit` clean                                                          | `revenueByKind: Record<TransactionKind, number>` agregado additively al endpoint summary; refund=0 by design (W4 negative assertion); backward-compat con monthlyRevenue/method/branch |
| 109-02 | DONE (`109-02-SUMMARY.md`) | `pnpm test outstanding-balances` → 17/17 PASS (happy + RBAC + cross-country + paginación + buckets + multi-currency)               | Endpoint `GET /api/admin/reports/outstanding-balances` montado en `reports/routes.ts` con `attachCountryScope`; bucket math en JS (clamp ageInDays>=0); shape flex per-currency owner  |
| 109-03 | DONE (`109-03-SUMMARY.md`) | `tsc --noEmit` clean en 8 archivos · grep checks PASS · server-side export endpoint con tests integración                          | CajaPage extendida con bloque "Por tipo de transacción" (5 cards), filtro Tipo single-select, columna Tipo con badge color-coded, export Excel server-side `caja-YYYY-MM-DD.xlsx`      |
| 109-04 | DONE (`109-04-SUMMARY.md`) | `tsc --noEmit` clean · backend export endpoint con tests · DeudasReport.vue self-contained con bucket cards + tabla + filtros      | 5to tab "Deudas" en ReportesPage; cards bucket arriba (4 horizontal × N currencies para owner); tabla server-side paginada con "Cargar más"; export Excel `deudas-YYYY-MM-DD.xlsx`     |
| 109-05 | EN CURSO (este SUMMARY)    | `pnpm test summary-sanity` → 5/5 PASS (SAN1-SAN5: I1, I2, I3/W7, voided excluded, dateRange consistent) · scaffold VERIFICATION.md | Operador ejecuta los 6 escenarios contra staging real y firma el sign-off. Smoke staging es handoff humano (mismo patrón Phase 107/108).                                               |

---

## Decisions Coverage (D-01..D-22)

Las 22 decisiones del `109-CONTEXT.md` están mapeadas a su plan de cobertura.

| Decision | Description                                                                                                                                                                                                     | Plan(s)                      | Status                                                                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-01** | "aging" es naming SOLO interno; en UI siempre "Deudas" / "Antigüedad" / "Hasta 30 días / 31-60 / 61-90 / 90+". Si "aging" aparece visible al admin es bug.                                                      | 03, 04                       | DONE (smoke PENDING — escenario 6a verifica grep en UI rendered de CajaPage y DeudasReport)                                                                                                                          |
| **D-02** | Reporte "Deudas" como 5to en ReportesPage (junto a accesos / cobros / vencimientos / inactivos), patrón filtros + tabla + Exportar Excel.                                                                       | 04                           | DONE (5to tab montado, smoke PENDING — escenario 4)                                                                                                                                                                  |
| **D-03** | Naming en menú/UI = "Deudas" (sin jerga, sin "aging").                                                                                                                                                          | 04                           | DONE (smoke PENDING — escenario 4 verifica label literal)                                                                                                                                                            |
| **D-04** | Scope = TODOS los saldos pendientes en cache `balances WHERE amount > 0` sin filtrar por target_kind (incluye 'subscription' Y 'debt_balance').                                                                 | 02                           | DONE (verificado en test outstanding-balances OB1 + OB6 — happy path con ambos target_kinds)                                                                                                                         |
| **D-05** | Estructura UI: cards de totales por bucket arriba (4 cards × N currencies si owner) + tabla detallada abajo con default sort antigüedad DESC + filtros sucursal/moneda/search.                                  | 04                           | DONE (cards horizontal + tabla con sort desc + 3 filtros, smoke PENDING — escenario 4)                                                                                                                               |
| **D-06** | Multi-currency: non-owner ve solo moneda de su país (scope automático); owner ve cards separadas por moneda; NUNCA sumar monedas distintas.                                                                     | 02 (backend) + 04 (frontend) | DONE (bucketTotals shape flex `BucketTotals \| Record<string, BucketTotals>`, smoke PENDING — escenario 6c verifica para owner)                                                                                      |
| **D-07** | Paginación + filtros server-side con `PaginatedResult<DebtRow>`. Default `page=1, pageSize=50`. Botón "Cargar más" en pie. Filtros van en query params.                                                         | 02 + 04                      | DONE (PaginatedResult contract idéntico a CajaPage / FinancialHistoryTab; "Cargar más" implementado, smoke PENDING — escenario 4)                                                                                    |
| **D-08** | Endpoint dedicado `GET /api/admin/reports/outstanding-balances` (naming inglés en código). Query: `balances WHERE amount > 0` LEFT JOIN subscriptions + plans + branches + users + bucket CASE.                 | 02                           | DONE (montado en reports/routes.ts; bucket math en JS por consistencia con Phase 108 future-date clamp)                                                                                                              |
| **D-09** | RBAC: reusa `FINANCE_READ_ROLES` (Phase 106 D-04). Coach NO puede ver el reporte. Cross-country filtradas por `attachCountryScope`.                                                                             | 02                           | DONE (verificado en test outstanding-balances RBAC1-5: owner/admin/gestion/recepcion permitidos, coach 403, smoke PENDING — escenario 6b)                                                                            |
| **D-10** | Visualización CajaPage: bloque existente intacto + bloque nuevo "Por tipo de transacción" debajo con 5 cards (cobro plan verde / pago saldo azul / reembolso rojo / ajuste amarillo / pago anticipado violeta). | 03                           | DONE (5 cards con classes color-coded, smoke PENDING — escenario 1)                                                                                                                                                  |
| **D-11** | Backend: extender `GET /api/admin/finance/transactions/summary` agregando `revenueByKind: Record<TransactionKind, number>`. Additive only — backward-compat preservada.                                         | 01                           | DONE (verificado en test summary-by-kind RBK8 — backward-compat shape + sanity test SAN2 confirma `Σ revenueByKind === monthlyRevenue`)                                                                              |
| **D-12** | Filtro nuevo "Tipo" q-select single-select con "Todos" + 5 kinds en español. Combina con filtros existentes (fecha, sucursal, método).                                                                          | 03                           | DONE (filtro single-select con composable wired al listing endpoint, smoke PENDING — escenario 2)                                                                                                                    |
| **D-13** | Columna "Tipo" en tabla CajaPage: badge color-coded con label español. Reusa pattern del badge "Anulado" de Phase 108. Colores definidos en D-10.                                                               | 03                           | DONE (badge color-coded reutilizando KIND_LABELS_ES, smoke PENDING — escenario 2)                                                                                                                                    |
| **D-14** | Backend listing endpoint (`GET /api/admin/finance/transactions`) ya soporta filtro `?kind=` desde Phase 106. Frontend solo agrega el dropdown.                                                                  | 03                           | DONE (verificado por re-uso del composable existente — Phase 106 P03 ya cubrió el backend; Phase 109 P03 agregó solo UI)                                                                                             |
| **D-15** | CajaPage export: una row por transaction (NO inflación con N links). Columnas: Fecha, Tipo, Monto, Moneda, Método, Sucursal, Miembro, Conceptos (concat ", "), Notas, Anulado, Razón.                           | 03                           | DONE (server-side export endpoint `/api/admin/finance/transactions/export.xlsx`, conceptos concatenados con ", ", smoke PENDING — escenario 3)                                                                       |
| **D-16** | Reporte Deudas export: una row por concepto pendiente individual. Columnas: Miembro, Plan/Concepto, Sucursal, Monto, Moneda, Antigüedad (días), Bucket, Fecha devengo, Tipo.                                    | 04                           | DONE (server-side export endpoint `/api/admin/reports/outstanding-balances/export.xlsx` con 9 columnas granulares, smoke PENDING — escenario 5)                                                                      |
| **D-17** | Reusar patrón existente de ReportesPage: `xlsx` library + `downloadBlob` helper. Naming archivos: `caja-YYYY-MM-DD.xlsx` y `deudas-YYYY-MM-DD.xlsx`.                                                            | 03 + 04                      | DONE (export server-side con `exceljs` library — redirección desde plan template documentada en SUMMARY 109-03 / 109-04 porque `xlsx` no está instalado en admin; net result: filenames idénticos al naming de plan) |
| **D-18** | KIND_LABELS_ES y PAYMENT_METHOD_LABELS_ES ya existen en Phase 108. Reusar; completar keys faltantes si aplica.                                                                                                  | 03                           | DONE (KIND_LABELS_ES extendido con 5 keys completos: plan_charge / debt_settlement / refund / adjustment / advance_payment)                                                                                          |
| **D-19** | Currency formatting: reusar `formatPrice(amount, currency)` de `format-price.ts`.                                                                                                                               | 03 + 04                      | DONE (formatPrice reutilizado en cards CajaPage + cards bucket DeudasReport + tabla)                                                                                                                                 |
| **D-20** | Date formatting: reusar `formatDate` de `format-date.ts`.                                                                                                                                                       | 03 + 04                      | DONE (formatDate reutilizado en columna Fecha CajaPage + columna Fecha devengo DeudasReport)                                                                                                                         |
| **D-21** | Indexes a verificar: `balances(member_id, amount)`, `balances(target_kind, target_id)`, `subscriptions(branch_id, start_date)` — mostly already exist desde Phase 105.                                          | 02                           | DONE (indexes verificados en `balances` schema desde Phase 105-01: idx_balances_target compound + member_id implicit por FK)                                                                                         |
| **D-22** | Query usa `LIMIT/OFFSET` (no cursor-based). Consistente con resto del codebase. Si performance baja a futuro, optimizar entonces.                                                                               | 02                           | DONE (LIMIT/OFFSET en getOutstandingBalances; pattern idéntico a CajaPage / FinancialHistoryTab — performance accept-and-monitor)                                                                                    |

---

## Smoke Test — Staging

**Environment:** `staging.admin.eltemplo.org` (frontend admin) + staging API
**Tester:** ignaciobordon@eltemplo.org
**Smoke date:** PENDING — fecha al ejecutar
**Pre-condición:** Plans 01-05 deployados a staging (verificar último commit en branch `staging`).

### Escenario 1 — CajaPage bloque "Por tipo de transacción"

**Objetivo:** Verificar que CajaPage renderiza el bloque nuevo "Por tipo de transacción" debajo del bloque existente, con 5 cards mostrando totales correctos por kind para el período filtrado (CAJA-01 / D-10).

**Setup:**

- Período con transacciones reales en staging que incluyan al menos 3 kinds distintos.
- Login como admin.

**Steps:**

1. Navegar a `CajaPage`.
2. Verificar que el bloque existente "Por método de pago" sigue visible intacto (cash / transferencia / tarjeta / mensual).
3. Verificar que debajo aparece el bloque nuevo "Por tipo de transacción" con 5 cards.
4. Verificar los labels de las 5 cards en español: "Cobro de plan", "Pago de saldo", "Reembolso", "Ajuste", "Pago anticipado".
5. Verificar los colores de las cards: verde / azul / rojo / amarillo / violeta (D-10).
6. Cross-check: tomar el período filtrado, correr en MySQL `SELECT kind, SUM(amount) FROM financial_transactions WHERE direction='inflow' AND voided_at IS NULL AND transaction_date BETWEEN <from> AND <to> GROUP BY kind` y verificar que los totales coinciden con los cards.

**Expected:**

- Bloque "Por tipo de transacción" visible con 5 cards.
- Cards muestran montos correctos en la moneda activa del filtro (formatPrice).
- Cards con colores correctos por kind.
- Suma de las 5 cards coincide con el `monthlyRevenue` del bloque existente (sanity invariante I2 del test SAN2).
- NINGUNA card muestra la palabra "aging" o "Aging" (D-01 guard).

**Result:** `PENDING`
**Evidence:** [screenshot bloque + DevTools network response | SQL output cross-check]
**Notes:** —

---

### Escenario 2 — CajaPage filtro Tipo + columna badge

**Objetivo:** Verificar que el filtro "Tipo" funciona como single-select server-side y que la tabla muestra la columna "Tipo" con badge color-coded por kind (CAJA-02 / D-12 / D-13).

**Setup:**

- Período con ≥10 transacciones distribuidas en al menos 3 kinds distintos.
- Login como admin.

**Steps:**

1. Navegar a `CajaPage`.
2. Verificar que el filtro nuevo "Tipo" aparece junto a los filtros existentes (fecha, sucursal, método).
3. Verificar que el dropdown contiene "Todos" + los 5 kinds en español.
4. Seleccionar "Cobro de plan" → tabla se actualiza, solo aparecen rows con badge verde "Cobro de plan".
5. Seleccionar "Pago de saldo" → tabla se actualiza, solo aparecen rows con badge azul "Pago de saldo".
6. Repetir con "Reembolso", "Ajuste", "Pago anticipado".
7. Volver a "Todos" → todas las rows aparecen, columna "Tipo" muestra el badge correspondiente para cada row.
8. DevTools network: verificar que cada cambio dispara `GET /api/admin/finance/transactions?kind=<value>` con el kind correcto.

**Expected:**

- Filtro server-side: cada cambio dispara request al backend.
- Tabla refleja el filtro correctamente sin filas erróneas.
- Columna "Tipo" siempre visible con badge color-coded per D-13.
- Labels en español según KIND_LABELS_ES (D-18).

**Result:** `PENDING`
**Evidence:** [screenshot tabla con cada filtro aplicado | network requests]
**Notes:** —

---

### Escenario 3 — CajaPage Excel export

**Objetivo:** Verificar que el botón "Exportar Excel" descarga `caja-YYYY-MM-DD.xlsx` con todas las columnas correctas, una row por transaction (NO inflación con N links), y conceptos concatenados con ", " (CAJA-04 / D-15).

**Setup:**

- Período con ≥5 transacciones, al menos una con N>1 links (debt_settlement con split allocation).
- Login como admin.

**Steps:**

1. Navegar a `CajaPage`.
2. Aplicar un filtro (ej: kind="Pago de saldo") para tener un set acotado.
3. Click "Exportar Excel".
4. Verificar descarga de archivo `caja-YYYY-MM-DD.xlsx` (fecha = hoy).
5. Abrir el archivo en LibreOffice / Excel.
6. Verificar columnas en orden: Fecha, Tipo, Monto, Moneda, Método de pago, Sucursal, Miembro, Conceptos, Notas, Anulado (Sí/No), Razón anulación.
7. Verificar count de rows == count de transacciones del filtro (NO inflado).
8. Para una transacción con 2 links, verificar que la columna "Conceptos" muestra ambos targets concatenados con ", " (ej: "Mensualidad Marzo 2026, Mensualidad Abril 2026").
9. Sumar la columna Monto en Excel y comparar contra `monthlyRevenue` del bloque summary — deben coincidir si el filtro es coherente.

**Expected:**

- Archivo descargado con naming `caja-YYYY-MM-DD.xlsx`.
- Columnas en orden D-15.
- Una row por transaction (NO N rows por N links).
- Conceptos concatenados con ", ".
- Sum coincide con summary card del mismo filtro.

**Result:** `PENDING`
**Evidence:** [archivo .xlsx adjunto + screenshot del cross-check de sum]
**Notes:** —

---

### Escenario 4 — Reporte Deudas (cards + tabla + filtros)

**Objetivo:** Verificar que el 5to tab "Deudas" en ReportesPage carga correctamente con cards bucket arriba, tabla con sort por antigüedad DESC, filtros server-side funcionando, y paginación "Cargar más" (CAJA-03 / D-02 / D-05 / D-07).

**Setup:**

- Staging con ≥20 saldos abiertos en `balances WHERE amount > 0` distribuidos en ≥2 buckets de antigüedad y ≥2 sucursales.
- Login como admin.

**Steps:**

1. Navegar a `ReportesPage` → click tab "Deudas" (5to tab).
2. Verificar que el label es "Deudas" — NO "Aging" ni "Antigüedad de deudas" (D-01 / D-03).
3. Verificar 4 cards horizontales arriba: "Hasta 30 días" / "31-60 días" / "61-90 días" / "90+ días" con totales monetarios.
4. Verificar tabla detallada abajo con columnas: Miembro, Plan/Concepto, Sucursal, Monto, Antigüedad (días), Bucket, Moneda.
5. Verificar default sort: antigüedad DESC (más viejo primero).
6. Aplicar filtro de sucursal → tabla refresca server-side; cards bucket también se recalculan al scope filtrado.
7. Aplicar filtro búsqueda por nombre → tabla refresca con miembros que matchean.
8. Verificar que aparece botón "Cargar más" si total > 50 rows; click → append next page.
9. Cross-check: correr en MySQL `SELECT COUNT(*) FROM balances WHERE amount > 0` y comparar contra el total reportado.

**Expected:**

- Tab "Deudas" funcional, label literal correcto (D-01 guard pasa).
- 4 cards bucket con totales correctos por moneda.
- Tabla sort DESC, filtros server-side, paginación append.
- Cards y tabla recalculan juntas al cambiar filtros.

**Result:** `PENDING`
**Evidence:** [screenshot cards + tabla con cada filtro aplicado | SQL output cross-check]
**Notes:** —

---

### Escenario 5 — Reporte Deudas Excel export

**Objetivo:** Verificar que el botón "Exportar Excel" del tab Deudas descarga `deudas-YYYY-MM-DD.xlsx` con 9 columnas granulares, una row por concepto pendiente individual, y que el loop paginado completa todos los rows del filtro (no se trunca por debajo de `total` salvo hard cap 10.000) (CAJA-04 / D-16).

**Setup:**

- Tab Deudas cargado con ≥20 saldos pendientes (mismo setup que Escenario 4).
- Login como admin.

**Steps:**

1. Aplicar un filtro (ej: sucursal=MdP) para tener un set acotado.
2. Click "Exportar Excel".
3. Verificar descarga `deudas-YYYY-MM-DD.xlsx`.
4. Abrir archivo.
5. Verificar columnas en orden: Miembro, Plan/Concepto, Sucursal, Monto, Moneda, Antigüedad (días), Bucket, Fecha devengo, Tipo (subscription / debt_balance).
6. Count de rows == count de saldos pendientes con el filtro aplicado (granular: una row por concepto, NO una row por miembro).
7. Si el filtro tiene >50 rows, verificar que el archivo contiene TODOS los rows (no solo la primera página) — backend itera paginadamente hasta completar el `total`.
8. Sumar la columna Monto y comparar contra la suma de las 4 cards bucket — deben coincidir.

**Expected:**

- Archivo descargado con naming `deudas-YYYY-MM-DD.xlsx`.
- 9 columnas según D-16.
- Una row por concepto pendiente (granular).
- Loop paginado completa total rows del filtro.
- Sum coincide con cards bucket.

**Result:** `PENDING`
**Evidence:** [archivo .xlsx adjunto + cross-check de sum vs cards]
**Notes:** —

---

### Escenario 6 — D-01 guard + RBAC + multi-currency

**Objetivo:** Verificar 3 invariantes operativas en una sola pasada: (a) la palabra "aging" NUNCA aparece visible al admin (D-01); (b) coach es 403 en endpoint Deudas y NO ve el tab (D-09); (c) owner con datos en ARS y EUR ve sets separados de cards, NUNCA un total mixto (D-06).

**Setup:**

- Login alternativo: admin, coach, owner.
- Para 6c: staging con saldos abiertos en al menos 2 monedas (ARS + EUR) — si no es reproducible, marcar 6c como SKIP con justificación.

**Steps (6a — D-01 guard):**

1. Login como admin.
2. Abrir CajaPage → DevTools → buscar literal "aging" / "Aging" / "AGING" en el DOM rendered (Ctrl+F en HTML inspect).
3. Esperado: 0 matches en strings visibles al usuario.
4. Repetir en ReportesPage tab Deudas: 0 matches.

**Steps (6b — RBAC):**

5. Logout, login como `coach`.
6. Navegar a `ReportesPage` → verificar que el tab "Deudas" NO aparece (o aparece pero da 403 al cargar — backend FINANCE_READ_ROLES no incluye coach per D-09).
7. Manual: `GET /api/admin/reports/outstanding-balances` con token de coach → backend retorna 403.

**Steps (6c — multi-currency owner):**

8. Logout, login como owner.
9. Navegar a tab Deudas.
10. Verificar que aparecen 2 sets de 4 cards bucket — uno para ARS, uno para EUR — con headers/labels diferenciados por moneda.
11. NINGÚN total mixto (NO suma de ARS + EUR juntos en una sola card).
12. Si el ambiente NO tiene saldos en EUR, marcar 6c como `SKIP — anomaly not reproducible in staging` y dejar la verificación al code review (`grep "Object.prototype.hasOwnProperty.call(bt, '0-30')"` en DeudasReport.vue confirma el discriminator de shape per Plan 109-04 SUMMARY).

**Expected:**

- 6a: 0 matches de "aging" en UI rendered.
- 6b: coach no ve tab Deudas + endpoint retorna 403.
- 6c: owner ve sets separados por moneda, sin total mixto.

**Result:** `PENDING`
**Evidence:** [screenshots de UI con 0 matches "aging" | network 403 para coach | screenshot owner con 2 sets de cards]
**Notes:** —

---

## Status Summary

| Item                                                | Status                               |
| --------------------------------------------------- | ------------------------------------ |
| Plan 01 (backend revenueByKind + tests)             | DONE                                 |
| Plan 02 (backend outstanding-balances + 17 tests)   | DONE                                 |
| Plan 03 (CajaPage v2 + filtro Tipo + Excel export)  | DONE                                 |
| Plan 04 (DeudasReport + backend Excel export)       | DONE                                 |
| Plan 05 (sanity test + VERIFICATION.md scaffold)    | DONE (este documento)                |
| Smoke Escenario 1 (CajaPage bloque "Por tipo")      | PENDING                              |
| Smoke Escenario 2 (CajaPage filtro Tipo + badge)    | PENDING                              |
| Smoke Escenario 3 (CajaPage Excel export)           | PENDING                              |
| Smoke Escenario 4 (Deudas cards + tabla + filtros)  | PENDING                              |
| Smoke Escenario 5 (Deudas Excel export)             | PENDING                              |
| Smoke Escenario 6 (D-01 guard + RBAC + multi-curr.) | PENDING                              |
| Sign-off para deploy a producción                   | PENDING (bloqueado por smoke + D-21) |

---

## Gaps

_Vacío hasta que se identifiquen gaps durante la verificación._

Cuando el operador ejecute el smoke, cualquier escenario que falle se documenta acá con:

- ID del escenario.
- Descripción concreta del fallo (qué se observó vs lo esperado).
- Severity (blocker / high / medium / low).
- Plan de cierre propuesto: `/gsd-plan-phase 109 --gaps` para abrir un gap closure plan.

---

## Sign-off para Producción

**Pre-flight checks (todos obligatorios):**

- [ ] Los 6 escenarios smoke en estado `PASS` (sin gaps abiertos blocker/high).
- [ ] `pnpm test summary-by-kind` verde en CI antes del deploy (Plan 01 — 8/8 PASS).
- [ ] `pnpm test outstanding-balances` verde en CI antes del deploy (Plan 02 — 17/17 PASS).
- [ ] `pnpm test summary-sanity` verde en CI antes del deploy (Plan 05 — 5/5 PASS).
- [ ] `pnpm test finance` verde en CI antes del deploy (sin regresión sobre tests existentes).
- [ ] `pnpm exec tsc --noEmit` repo-wide clean (api + admin).
- [ ] `pnpm exec eslint .` repo-wide clean.
- [ ] **NO desplegar viernes ni vísperas de feriado**. Si el smoke termina jueves o más tarde, el deploy se posterga al lunes siguiente. Esta regla es operativa estricta — la justificación es que un bug regresivo en finanzas detectado un sábado tiene ventana de respuesta nula y bloquea operaciones (registrar pagos / consultar caja / consultar deudas) durante todo el fin de semana. Heredada como invariante de Phase 107/108.
- [ ] Backup de las 3 tablas finance (`financial_transactions`, `transaction_links`, `balances`) tomado pre-deploy en EC2 (rollback path conocido — Phase 109 NO toca schema, solo extiende endpoint summary additively + agrega un endpoint nuevo).
- [ ] Plan de rollback documentado: revertir el deploy admin (no hay schema changes en Phase 109 — el rollback es solo de assets frontend admin + un endpoint nuevo backend que se puede deshabilitar via feature flag o revert simple del PR).

**Día de deploy (cuando los pre-flight checks están todos en verde):**

| Acción                                                                       | Owner                       | Timestamp |
| ---------------------------------------------------------------------------- | --------------------------- | --------- |
| Mergear branch de Phase 109 a `staging` (si no estaba ya)                    | Claude (PR) + ignaciobordon | PENDING   |
| Smoke staging completo (los 6 escenarios) — con evidencia adjunta a este doc | ignaciobordon               | PENDING   |
| Sign-off para producción (firmar abajo)                                      | ignaciobordon               | PENDING   |
| Deploy a producción vía CI/CD pipeline standard                              | CI/CD                       | PENDING   |
| Smoke post-deploy en producción (escenarios 1, 4, 5 mínimo — golden path)    | ignaciobordon               | PENDING   |

**Sign-off:**

- **Smoke staging completo:** PENDING — fecha y firma al ejecutar.
- **Día y hora del deploy a producción:** PENDING — recordar regla NO viernes / víspera de feriado.
- **Operador firmante:** ignaciobordon@eltemplo.org

```
[ ] Yo, _________________________, confirmo que los 6 escenarios smoke pasaron en staging,
    los pre-flight checks están en verde, y autorizo el deploy a producción.

    Fecha de sign-off: ____________________
    Día del deploy:    ____________________  (verificar: NO viernes)
    Firma:             ____________________
```

---

## Notes

- Todos los plans 01-05 están deployables independientemente, pero el smoke debe correrse con los 5 mergeados juntos para reflejar el estado end-to-end del usuario final.
- Si algún escenario falla, abrir gap closure plan vía `/gsd-plan-phase 109 --gaps` antes del sign-off.
- Backend tests (Plans 01, 02, 05) son automáticos y corren en CI — no requieren navegador.
- Los escenarios 1-5 requieren navegador en staging real con data válida; escenario 6c puede ser SKIP si la anomalía multi-currency no es reproducible (verificación por code review aceptable como fallback).
- Phase 109 NO toca schema DB — el rollback es solo de assets frontend admin + un endpoint nuevo backend (sin migración a revertir).
- **Deferred ideas** (CONTEXT.md sección Deferred): Pivot table export, predicciones / cohort retention, drilldown desde card a tabla pre-filtrada, comparativas mes-vs-mes, export PDF, doc operacional para admins (CAJA-05 movido fuera del milestone), notificaciones automáticas a alumnos con deudas viejas. Si operaciones lo pide, abrir nueva fase.
- **Convergencia operativa con Phase 108:** el reporte Deudas y el dialog "Registrar pago" comparten data fuente (`balances WHERE amount > 0`). Flujo end-to-end: admin abre Deudas → ve a Juan con $50k abiertos → click en Juan → AlumnoDetailPage → tab Finanzas → "Registrar pago" del Phase 108. Coherente y sin duplicación de fuente.
