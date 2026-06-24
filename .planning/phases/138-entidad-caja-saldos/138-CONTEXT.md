# Phase 138: Entidad caja + saldos - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

La **caja** pasa a ser entidad de primera clase (`cash_registers`): efectivo por sucursal + efectivo central + banco por moneda (banco ARS + banco EUR). Cada pago se asocia a una caja (`cash_register_id`) **conceptualmente distinta de su `branchId`** (dónde se cobró ≠ adónde fue la plata: una transferencia cobrada en Jujuy cae en la caja Banco). `CashRegisterService.getBalance` devuelve el **saldo firme derivado** (Σ VALIDADOS de esa caja, reusando el filtro "dinero firme" de la fase 137) + los PENDIENTES por separado. Una caja **nunca mezcla monedas** (guard espejo del de `applyDelta`).

**Esta fase es CIMIENTO / backend-only. Depende de 137 (el saldo firme filtra por `validado`). Bloquea 139.**

### En scope (138)

- Tabla nueva `cash_registers` (type efectivo/banco, `branch_id` NULL para central y banco, `currency` NOT NULL fija, `is_active`, + saldo de apertura — ver decisiones) + migración **0154** + seed (efectivo×sucursal AR, efectivo central, banco ARS, banco EUR).
- Columna `cash_register_id` (NULLABLE, FK `cash_registers`) en `financial_transactions`; `branchId` se queda NOT NULL.
- **Resolver de caja automático** `resolveCashRegister(paymentMethod, branchId, currency)` (reutilizable; lo consume la carga única de 140).
- Poblar `cash_register_id` en el path de create de pagos (vía el resolver) + **backfill** de transacciones históricas (etiqueta para historial, NO suma al saldo — ver decisión D-05/D-06).
- `CashRegisterService.getBalance(cashRegisterId)` → saldo firme derivado + pendientes aparte.
- **Guard de moneda**: rechaza asociar a una caja un monto de moneda distinta a la suya.
- Integration tests (incl. invariante de aislamiento de moneda y que pendientes no suman al firme).

### Fuera de scope (138 — otras fases del milestone)

- **Toda UI** (vista de saldo por caja, bandeja) → **fase 141**. UI para editar saldo de apertura, si hace falta → **fase 142**.
- **Movimientos inter-caja (`cash_transfer`) y egresos (`expense`)** → **fase 139** (138 solo crea la entidad y el saldo de ingresos validados).
- **Carga única dead-simple del profe** (reusa el resolver) → **fase 140**.
- **Override manual de la caja** del pago → descartado (no en este milestone salvo nueva decisión).
- **Materialización del saldo** (cache tipo `balances`) → diferido; v1 es derivado (`SUM` con índice).

</domain>

<decisions>
## Implementation Decisions

### Asignación de caja al cobrar (resolver automático)

- **D-01:** La caja de cada pago se **deriva 100% automáticamente de la forma de pago** (`paymentMethod`), sin selector ni override manual. Regla:
  - `cash` → caja **efectivo de la sucursal** (`type='efectivo', branch_id = tx.branchId`, moneda de la sucursal).
  - `transfer` / `card` → caja **banco de la moneda** (`type='banco', currency = tx.currency`).
  - `aura_credit` / `internal` → **ninguna caja** (`cash_register_id = NULL`; no es plata firme de caja).
    Razón: mantiene la carga dead-simple (objetivo del milestone), elimina error humano, y la caja es consecuencia de cómo se cobró, no una decisión aparte.
- **D-02:** El resolver vive en **138** como función reutilizable `resolveCashRegister(paymentMethod, branchId, currency)`. La fase 140 (carga única) lo **reusa**, no lo reinventa. Necesario en 138 porque el backfill lo usa y `getBalance` no significa nada sin `cash_register_id` poblado.
- **D-03:** **Sin override manual** en 138. Si aparece un caso raro (ej: efectivo que va directo al banco), se modela como corrección/excepción en una fase futura, no acá.

### Caja ≠ sucursal (modelado)

- **D-04:** `branchId` (NOT NULL) = dónde ocurrió el cobro; `cash_register_id` (NULL) = adónde fue la plata. NO mapean 1:1. Caja efectivo sucursal = `type='efectivo', branch_id=X`; caja efectivo central = `type='efectivo', branch_id=NULL`; caja banco = `type='banco', branch_id=NULL`, **una por moneda** (ARS y EUR — NO una sola global; el aislamiento de moneda hereda del ledger). La moneda se deriva del `country` de la sucursal (AR→ARS, ES→EUR).

### Saldo inicial: limpias desde fecha de corte + apertura

- **D-05:** Las cajas **arrancan limpias desde una fecha de corte** (go-live del módulo), NO con backfill completo de toda la historia. Razón crítica (Franco, dueño del gimnasio): backfillear todo el efectivo histórico inflaría el saldo enormemente porque esa plata **ya se movió/depositó/gastó** y esos retiros **nunca se registraron** (movimientos/egresos recién arrancan en 139). Un saldo inflado el día 1 rompe la confianza del libro de caja.
- **D-06:** Modelo del saldo: cada caja tiene un **saldo de apertura** (conteo físico inicial por caja, default 0, cargable por seed/migración cuando se prenda el módulo). `getBalance` = saldo de apertura + Σ validados de esa caja **desde la fecha de corte**. Las transacciones históricas (antes del corte) **se etiquetan con su `cash_register_id` derivado solo para historial/reportes**, pero quedan **excluidas del saldo** (vía la fecha de corte). Fecha de corte = **única global del módulo**; saldo de apertura = **por caja**.
- **D-07:** Datos de prod (saldos de apertura reales) se cargan **por migración**, no por seed re-run, cuando Franco haga el conteo físico al prender el módulo. En 138 la columna arranca en 0.

### Saldo derivado (no materializado)

- **D-08:** Saldo **derivado** en v1 (`SUM` de validados con índice), NO materializado (NO replicar el cache `applyDelta` de `balances` todavía — deuda prematura; volumen bajo: 8 sedes). La firma de `CashRegisterService.getBalance` debe ocultar si es derivado o cacheado, para poder materializar después sin tocar callers. El saldo reusa el filtro "dinero firme" de la fase 137 (`firmMoneyConditions()` / `firm-money.ts`).

### Guard de moneda

- **D-09:** Una caja **nunca mezcla monedas**: asociar a una caja un monto de moneda distinta a su `currency` lanza error (espejo del guard de `applyDelta` en `balance-service.ts`, que ya tira `BadRequestError` "Moneda inconsistente"). Ningún saldo ni reporte suma monedas distintas.

### Alcance (backend-only)

- **D-10:** 138 es **backend-only**, igual que 137. NO UI. El display del saldo por caja es la **fase 141**; la UI de editar saldo de apertura (si hace falta) es **fase 142**. Construir UI en 138 que 141 reemplaza = trabajo tirado. Se prueba por integration tests.

### Claude's Discretion

- Forma exacta del schema del saldo de apertura (columna `opening_balance` + `opening_date` en `cash_registers`, vs. una tx de apertura tipo adjustment). Recomendación: columnas en `cash_registers` para mantener el saldo "derivado + constante de apertura".
- Cómo el `getBalance` expresa la fecha de corte en el `SUM` (filtro `transaction_date >= cutoff` vs. flag por caja).
- Estructura interna de `CashRegisterService` (facade pattern del módulo finance) y dónde vive el resolver.
- Si el seed de cajas efectivo×sucursal cubre solo sucursales activas AR o también la virtual/Barcelona (Barcelona = EUR, su efectivo es caja EUR).
- Naming/REST shape de cualquier endpoint `getBalance` siguiendo convenciones del módulo finance.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (módulo contable)

- `BRIEF-MODULO-CONTABLE-FRANCO.md` — brief de diseño consolidado (raíz). Sección 6-bis: fórmula del saldo de caja.
- `.planning/research/modulo-contable/ARCHITECTURE.md` § "Punto 2 — Entidad caja (cash_registers)" — schema exacto propuesto, relación caja↔branchId, saldo derivado vs materializado. **Lectura obligada para esta fase.**
- `.planning/research/modulo-contable/PITFALLS.md` — riesgos (aislamiento de moneda, saldo derivado).
- `.planning/research/modulo-contable/FEATURES.md` y `STACK.md` — features del milestone, cero dependencias nuevas.

### Fase previa (cimiento del que depende 138)

- `.planning/phases/137-m-quina-de-estados-de-validaci-n-cimiento/137-CONTEXT.md` y `137-SUMMARY.md` (×3) — el filtro "dinero firme" (`firm-money.ts`), `validation_status`. El saldo por caja se calcula con ese filtro.

### Roadmap / requirements

- `.planning/ROADMAP.md` § Phase 138 (goal, success criteria, CAJA-01..04) + § Phase 139 (para respetar el límite: movimientos/egresos NO son de 138).
- `.planning/REQUIREMENTS.md` — texto de CAJA-01..CAJA-04.
- `.planning/PROJECT.md` § Current Milestone v5.2 — decisiones clave (banco POR MONEDA, no global).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/db/schema/financial-transactions.ts` — tabla a extender con `cash_register_id` (nullable FK). Ya tiene `validation_status` (137), `currency`, `branchId`, `paymentMethod` (cash/transfer/card/aura_credit/internal — base del resolver D-01).
- `el-templo-api/src/db/schema/branches.ts` — `branches` tiene `country` (AR/ES) → deriva la moneda de la caja efectivo de cada sucursal y del seed.
- `el-templo-api/src/modules/finance/firm-money.ts` — `firmMoneyConditions()` (de 137): el `getBalance` lo reusa para "Σ VALIDADOS".
- `el-templo-api/src/modules/finance/balance-service.ts` — patrón del **guard de moneda** a espejar (líneas ~154-158: `BadRequestError` "Moneda inconsistente") y referencia del cache `applyDelta` (NO replicar aún, D-08).
- `el-templo-api/src/modules/finance/transaction-service.ts` — `getSummary` (filtro firm-money) es el análogo de `getBalance`; el path de create es donde se setea `cash_register_id` vía el resolver.
- `el-templo-api/src/modules/subscriptions/service.ts` — `recordAssignmentCharge` (el create que dispara membresía+cobro): debe poblar `cash_register_id` vía el resolver (igual que en 137 sumó `recorderRole`).

### Established Patterns

- **Facade pattern** en `modules/finance/` (servicios de dominio) — `CashRegisterService` sigue ese estilo.
- **Aislamiento de moneda**: el ledger ya nunca mezcla monedas; la caja hereda con su `currency` fija + guard.
- **Saldo derivado**: `getSummary` ya hace `SUM` con índice sobre el filtro firm-money; `getBalance` es el mismo patrón por caja.
- **Inmutabilidad + soft-void ortogonal** (137): el saldo cuenta solo `validado AND voided_at IS NULL`.

### Integration Points

- El resolver `resolveCashRegister` se engancha en TODOS los paths de create de `financial_transactions` (directo + `recordAssignmentCharge`). Auditar que ningún create de inflow quede sin `cash_register_id` cuando corresponde (cash/transfer/card).
- `getBalance` reusa `firm-money.ts` → si el filtro canónico cambia, la caja hereda automáticamente (single source of truth de 137).
- Seed de cajas debe correr antes de cualquier backfill de `cash_register_id` (las cajas deben existir para referenciarlas).

</code_context>

<specifics>
## Specific Ideas

- Regla del resolver (D-01) textual: efectivo→caja de la sucursal; transferencia/tarjeta→banco de la moneda; AURA/interno→ninguna caja.
- "Caja ≠ sucursal" es la distinción conceptual central: `branchId`=dónde se cobró, `cash_register_id`=adónde fue la plata.
- El saldo significa "cuánto **debería haber** de verdad" → por eso arranca desde conteo de apertura, no desde el histórico inflado (D-05).
- Banco es **por moneda** (ARS + EUR), no una sola caja global (el brief decía "global" pensando solo AR; corregido en PROJECT.md).

</specifics>

<deferred>
## Deferred Ideas

- **Movimientos inter-caja (`cash_transfer`) y egresos (`expense`)** → **fase 139**. NOTA para 139: la arquitectura (`ARCHITECTURE.md` Punto 3) modela el movimiento como **dos filas** (doble entrada, neto 0) pero el ROADMAP de la 139 dice "**una sola fila** origen+destino" — discrepancia a resolver en discuss-phase 139.
- **Vista de saldo por caja + bandeja** (UI) → **fase 141**.
- **UI para cargar/editar saldo de apertura** → **fase 142** (config). En 138 se carga por seed/migración.
- **Materialización del saldo** (cache tipo `applyDelta`) → diferido hasta evidencia de performance (D-08).
- **Override manual de la caja del pago** → descartado salvo nueva decisión.
- **Carga única dead-simple del profe** (reusa `resolveCashRegister`) → **fase 140**.

</deferred>

---

_Phase: 138-Entidad caja + saldos_
_Context gathered: 2026-06-24_
