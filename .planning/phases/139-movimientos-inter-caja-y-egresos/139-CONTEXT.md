# Phase 139: Movimientos inter-caja y egresos - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

El admin puede **mover plata entre cajas** (movimiento inter-caja: origen+destino, neto sistema 0, capturando esperado-vs-contado) y **registrar egresos** (salida real de dinero, nota libre, sin categoría) que restan del saldo de su caja. Ambos se **anulan con el soft-void ortogonal** de la fase 137 (motivo+autor+fecha), y **ninguno toca los `balances`** del socio (no son deuda). Se monta **reusando `financial_transactions`** (extender `kind` con `cash_transfer` + `expense`), NO una tabla paralela ("un solo libro, una sola fuente de verdad").

**Esta fase es CIMIENTO / backend-only. Depende de 138 (cajas con saldo). Bloquea 140-141 (carga/reportes que muestran movimientos/egresos).**

### En scope (139)

- Extender el enum `financial_transactions.kind` con `cash_transfer` (movimiento) y `expense` (egreso). Migración **0155**.
- **Movimiento inter-caja = asiento de doble entrada (2 filas)**: fila outflow en caja origen + fila inflow en caja destino, ambas `kind='cash_transfer'`, linkeadas vía `transaction_links` (`target_kind='transaction'`), en una sola `db.transaction`, neto sistema 0, ambas nacen `validado` (las hace admin). **Solo entre cajas de igual moneda** (guard).
- **Reconciliación esperado-vs-contado** (MOV-02): el movimiento captura `expected_amount` (saldo derivado de la caja origen al momento) y `counted_amount` (físico); la diferencia se materializa como **registro de reconciliación explícito con rastro** que corrige el saldo de origen para reflejar lo contado (reusa la AuditAction `'reconciliation'` ya existente).
- **Egreso = 1 fila**: `kind='expense', direction='outflow', cash_register_id=origen`, monto + `notes` libre, **sin categoría** en v1. Resta del saldo de su caja.
- `cash_transfer` + `expense` agregados a `KINDS_ALLOWED_WITHOUT_LINKS` (transaction-service.ts:57); NO tocan `balances` (verificar que `applyDelta` los ignora — no llevan links de subscription/debt).
- **`memberId` → NULLABLE** (egreso/movimiento no tienen socio): migración + auditar los JOINs de reportes que asumen member presente (los egresos/movimientos deben quedar fuera de las métricas de socios de todos modos).
- **Extender `getBalance` (138)** para restar outflows (`cash_transfer` saliente + `expense`) — el `// TODO 139` que dejó la 138. El saldo firme = opening + Σ(inflows validados) − Σ(outflows validados), desde el corte.
- **Anular** movimiento/egreso con el `void()`/`_void()` de 137 (al anular un movimiento, anular AMBAS filas atómicamente).
- Integration tests (invariante neto 0, saldo refleja contado, void de par, guard de moneda, applyDelta no-op).

### Fuera de scope (139 — otras fases)

- **Toda UI** (formularios de movimiento/egreso, historial) → **140** (carga) / **141** (reportes).
- **Categoría de egresos** (proveedor/gasto/sueldo) → descartado en v1 (solo nota libre).
- **Conversión FX / movimientos cross-moneda** → descartado en v1 (guard rechaza; marcar gap si alguna vez se necesita).
- **Carga única dead-simple del profe** → fase 140.

</domain>

<decisions>
## Implementation Decisions

### Movimiento inter-caja: doble entrada (2 filas)

- **D-01:** El movimiento se registra como **asiento de doble entrada — DOS filas** `kind='cash_transfer'`: una `outflow` en la caja origen, una `inflow` en la caja destino, **linkeadas entre sí vía `transaction_links`** (`target_kind='transaction'`), en una sola `db.transaction`. Neto sistema = 0. Ambas nacen `validado` (las hace el admin). Razón: reusa el ledger + el `getBalance` con signo de 138 + `transaction_links` **sin schema nuevo en el ledger** y sin bifurcar la lógica de saldo; cada fila mantiene UNA sola caja (uniforme con todo el ledger); es el modelo contable estándar.
- **D-02:** **Discrepancia con el ROADMAP resuelta:** el ROADMAP decía "una sola fila origen+destino" — era simplificación del texto del goal. La invariante real ("una sola operación atómica, neto 0") se cumple con las 2 filas. **Actualizar el criterio MOV-01 del ROADMAP** a "una sola operación (asiento de 2 filas linkeadas)".
- **D-03:** Movimiento **solo entre cajas de igual moneda** (guard `origen.currency === destino.currency`, precedente `applyDelta`). Sin conversión FX en v1. Depósito efectivo→banco de la misma moneda = movimiento válido.

### Reconciliación esperado-vs-contado

- **D-04:** El movimiento **captura `expected_amount`** (saldo derivado de la caja origen al momento) **y `counted_amount`** (conteo físico). La **diferencia se registra explícitamente con rastro** (monto + motivo + autor + fecha) y **corrige el saldo de la caja origen para que refleje lo contado** (la plata real). **NO se arrastra saldo fantasma; NO se ajusta en silencio** — la diferencia queda con nombre y apellido. Reusar la AuditAction `'reconciliation'` (ya existe en audit-log.ts) y/o un `kind='adjustment'`/campo discrepancy (modelado = discreción de Claude/research, pero DEBE afectar el saldo de forma explícita y dejar rastro). Es el control que reemplaza al cierre diario.

### Egreso

- **D-05:** Egreso = **1 sola fila** `kind='expense', direction='outflow', cash_register_id=caja, amount=N, notes=<nota libre>`. **Sin categoría** en v1 (decisión Franco). Resta del saldo de su caja. No tiene destino (no es movimiento).

### memberId nullable

- **D-06:** **`memberId` pasa a NULLABLE** (egreso/movimiento no tienen socio → queda NULL; modelo honesto, sin usuario sentinel "Gimnasio" que ensucie listas/conteos de socios). **Decisión técnica de Claude** (Franco no necesita decidirla — cero impacto en lo que ve). Requiere **auditar los call sites/JOINs de reportes que asumen member presente** (misma disciplina que el blast-radius de 137); los egresos/movimientos deben quedar excluidos de las métricas de socios de todos modos (su `kind` ya no es plan_charge/debt_settlement). Migración que afloja NOT NULL = no destructiva.

### balances intactos + void

- **D-07:** `cash_transfer` + `expense` van a `KINDS_ALLOWED_WITHOUT_LINKS` (transaction-service.ts:57); **NO tocan `balances`** (no son deuda de socio). Como no llevan links de subscription/debt_balance, `applyDelta` los ignora naturalmente — **verificar con test** que es no-op.
- **D-08:** Movimientos y egresos se **anulan con el `void()`/`_void()` ortogonal de 137** (motivo+autor+fecha, nunca delete). **Anular un movimiento anula AMBAS filas atómicamente** (en una `db.transaction`, vía el link). El void revierte su efecto en el saldo de la(s) caja(s).

### getBalance con signo

- **D-09:** **Extender `getBalance` (138)** para restar outflows (el `// TODO 139` que dejó la 138): saldo firme = `opening_balance + Σ(inflows validados) − Σ(outflows validados: cash_transfer saliente + expense)`, todo desde `cutoff_date`, reusando `firmMoneyConditions()`. Los pendientes siguen aparte.

### Alcance (backend-only)

- **D-10:** 139 es **backend-only**, igual que 137/138. NO UI. Los formularios de registrar movimiento/egreso y el historial van en 140 (carga) / 141 (reportes). Se prueba por integration tests.

### Claude's Discretion

- Modelado exacto de la reconciliación (campo `discrepancy`/`expected`/`counted` en la fila del movimiento vs. una fila `kind='adjustment'` separada linkeada) — debe afectar el saldo explícitamente y dejar rastro (`'reconciliation'`).
- Cómo se linkean las 2 filas del movimiento (cada una apunta a la otra vía `transaction_links`, o una "principal" + una "espejo").
- Forma/REST shape de los endpoints (registerMovement / registerExpense / void) siguiendo convenciones del módulo finance.
- Si la reconciliación se captura siempre (obligatoria) o solo cuando hay diferencia.
- Estructura del guard de igual-moneda (en el servicio de movimiento, reusando el patrón de `resolveCashRegister`/`applyDelta`).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone

- `.planning/research/modulo-contable/ARCHITECTURE.md` § "Punto 3 — Movimientos inter-caja y egresos" — patrón doble entrada, extensiones de enum, egreso, reconciliación, el roce de `memberId`. **Lectura obligada.**
- `BRIEF-MODULO-CONTABLE-FRANCO.md` — secciones 6/6-bis (movimiento, egreso, reconciliación física, "sin cierre diario").
- `.planning/research/modulo-contable/PITFALLS.md` — riesgos (balances intactos, moneda).

### Fases previas (de las que depende 139)

- `.planning/phases/138-entidad-caja-saldos/138-CONTEXT.md` + `138-SUMMARY.md` (×3) — cajas, `cash_register_id`, `getBalance` (el `// TODO 139` a completar), guard de moneda, resolver.
- `.planning/phases/137-.../137-SUMMARY.md` (×3) — `void()`/`_void(tx)`, soft-void ortogonal, `firm-money.ts`, audit-log.

### Roadmap / requirements

- `.planning/ROADMAP.md` § Phase 139 (goal, MOV-01..04). **NOTA D-02: el criterio MOV-01 dice "una sola fila" — actualizar a "asiento de 2 filas".**
- `.planning/REQUIREMENTS.md` — MOV-01..MOV-04.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/db/schema/financial-transactions.ts` — `kind` enum (líneas 27-33) a extender con `cash_transfer`+`expense`; `memberId` (línea 24) a hacer nullable; `cash_register_id` (de 138); `direction` ya tiene inflow/outflow.
- `el-templo-api/src/modules/finance/transaction-service.ts` — `KINDS_ALLOWED_WITHOUT_LINKS` (líneas 57-60, sumar los 2 kinds); `create()` (el único insert site, ~223); `void()`/`_void(tx)` (137, reusar para anular). `applyDelta` se llama en create — verificar no-op para estos kinds.
- `el-templo-api/src/modules/finance/cash-register-service.ts` — `getBalance` (extender con outflows, el `// TODO 139`); patrón del guard de moneda en `resolveCashRegister` a reusar para el guard igual-moneda del movimiento.
- `el-templo-api/src/db/schema/transaction-links.ts` — `target_kind='transaction'` (ya existe, lo usó `correct()` en 137): linkea las 2 filas del movimiento.
- `el-templo-api/src/modules/shared/audit-log.ts` — AuditAction `'reconciliation'` (línea 28, ya existe): rastro de la diferencia esperado-vs-contado.
- `el-templo-api/src/modules/finance/balance-service.ts` — `applyDelta` itera sobre links; sin links de subscription/debt = no-op (verificar para cash_transfer/expense).

### Established Patterns

- **Doble entrada / inmutabilidad**: 137 ya hace anular+recrear; el movimiento usa 2 filas linkeadas + void atómico del par.
- **Soft-void ortogonal** (137): anular = `voided_at` + rastro, nunca delete; el void revierte el efecto en el saldo.
- **Guard de moneda** (138 `resolveCashRegister`, balance-service `applyDelta`): `BadRequestError "Moneda inconsistente"` — el guard igual-moneda del movimiento lo espeja.
- **Saldo derivado con signo** (138 `getBalance`): ya suma inflows; 139 agrega la resta de outflows.

### Integration Points

- **`memberId` nullable — auditar blast radius**: todos los reads/JOINs que asumen `member_id` NOT NULL (analytics, reports). Los egresos/movimientos no deben aparecer en métricas de socios (su `kind` ya las excluye, pero confirmar). Análogo al audit de call sites de 137.
- **`getBalance` con outflows**: una vez que resta cash_transfer/expense, re-verificar que los tests de saldo de 138 siguen verdes (un movimiento no cambia la suma total de cajas de igual moneda — invariante neto 0).
- **`applyDelta` no-op**: confirmar por test que insertar un cash_transfer/expense NO mueve `balances`.

</code_context>

<specifics>
## Specific Ideas

- Movimiento = asiento de doble entrada (2 filas, neto 0), reusa `transaction_links`. Egreso = 1 fila (sin destino).
- Los 3 tipos de plata en el libro: **pago** (entra, tiene socio) / **egreso** (sale, sin socio) / **movimiento** (cambia de caja, neto 0). Un solo libro (`financial_transactions`).
- "El movimiento ES el punto de reconciliación" (no hay cierre diario): captura esperado vs contado, la diferencia queda con rastro y el saldo refleja lo contado.
- `memberId` NULL para egreso/movimiento — sin usuario sentinel.

</specifics>

<deferred>
## Deferred Ideas

- **Categoría de egresos** (proveedor/sueldo/gasto) → post-v1; v1 solo nota libre.
- **Conversión FX / movimiento cross-moneda** → descartado v1 (guard rechaza).
- **UI de movimiento/egreso + historial** → fase 140 (carga) / 141 (reportes).
- **Materialización del saldo** (cache) → diferido (heredado de 138 D-08).

</deferred>

---

_Phase: 139-Movimientos inter-caja y egresos_
_Context gathered: 2026-06-24_
