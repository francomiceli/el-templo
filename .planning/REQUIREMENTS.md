# Requirements: El Templo v5.2 — Módulo Contable / Libro de Caja

**Defined:** 2026-06-23
**Core Value:** El registro de un pago se carga **una sola vez** en el Administrador (fuente de verdad) y propaga solo: activa la membresía al instante e impacta la caja. Se elimina el triple tipeo (Forms + Contabilium + Admin). El Administrador pasa a ser el **libro de caja** del negocio (cajas de efectivo por sucursal + central + banco por moneda), con validación de pagos, movimientos entre cajas y egresos.

**Reference:** `BRIEF-MODULO-CONTABLE-FRANCO.md` (brief de diseño consolidado) + `.planning/research/modulo-contable/` (FEATURES / ARCHITECTURE / PITFALLS / STACK, con contraste vs. brief).

**Se monta sobre v4.8 (modelo financiero existente) — ~60% ya existe, se construye ENCIMA:** `financial_transactions` (paymentMethod, branchId, soft-void), `transaction_links` (M:N, pago≠membresía), `balances`, `subscriptions`, `recordAssignmentCharge` (activa membresía+cobro+saldo atómicamente), aislamiento de moneda. **Cero dependencias nuevas.**

**Decisiones ya tomadas (no se re-litigan):**

- **Carga única = fuente de verdad.** El profe carga una vez; la admin deja de re-tipear y pasa a **validar**.
- **Activar membresía ≠ validar pago.** Membresía instantánea; pago entra PENDIENTE (profe) o VALIDADO (admin).
- **ANULADO es ortogonal**, NO un estado del enum de validación. "Dinero firme" = `status='validado' AND voided_at IS NULL`. No se reescribe `void()`.
- **"Corregir" un OBSERVADO = anular+recrear**, no UPDATE (preserva inmutabilidad del ledger).
- **Banco por moneda:** caja banco ARS + caja banco EUR (cada caja tiene `currency` fija). Ninguna caja mezcla monedas.
- **Movimiento inter-caja = una sola fila** (origen+destino, neto 0); **egreso = misma fila con destino NULL** (salida real). Reusan `financial_transactions` extendiendo `kind`.
- **Saldo de caja derivado** (suma) en v1; materializar solo con evidencia de performance.
- **No hay cierre de caja diario;** reconciliación física = el momento del movimiento/retiro (esperado vs. contado).
- **Contabilium: reemplazo progresivo** (facturación AFIP último, fuera de scope).
- **Refunds:** ANULADO con rastro, solo admin; popup decide membresía 1-a-1 (default activa).
- **Egresos sin categoría por ahora** (salida + nota libre).

**Decisiones abiertas (se resuelven en el `discuss-phase` de cada fase, NO ahora):**

- Estrategia de idempotencia de la carga única (clave de deduplicación).
- `status` como columna en `financial_transactions` (tabla caliente) vs. tabla satélite de eventos.
- `memberId` para egresos: member-sentinel vs. columna nullable.
- Casa de las perillas de config tras la eliminación del subsistema de settings (fase 136-07).
- Umbral de antigüedad del pendiente + destinatario de la alerta.
- Corte limpio vs. convivencia con Contabilium + asientos de apertura por caja; regla de "qué dato manda" por etapa.
- Si el rol profe ya existe en el admin con permisos, o hay que crearlo/ajustarlo.
- Unidad de `amount` (centavos vs. entero) — confirmar contra el schema.

---

## v5.2 Requirements

25 requirements en 6 categorías. La **validación (VAL) es el cimiento** (blast radius sobre métricas v5.0) y se construye primero; la **carga única (CARGA) es el corazón** del valor.

### Validación de pagos (VAL) · cimiento

- [x] **VAL-01**: Una transacción de cobro tiene un `validation_status` (pendiente / observado / corregido / validado) separado y **ortogonal** al soft-void existente (ANULADO); el estado y la anulación coexisten sin reescribir `void()`.
- [x] **VAL-02**: Un pago cargado por un profe entra en estado **PENDIENTE**; un pago cargado por un admin entra **VALIDADO** directamente.
- [x] **VAL-03**: El admin puede **validar** un pago pendiente, confirmándolo como dinero firme.
- [x] **VAL-04**: El admin puede marcar un pago como **OBSERVADO** y corregirlo mediante **anular+recrear** (no UPDATE), preservando la inmutabilidad del ledger.
- [x] **VAL-05**: El filtro canónico de ingresos/saldo cuenta **solo VALIDADOS**, con migración `DEFAULT 'validado'` + backfill, **sin romper las 6 métricas de gestión de v5.0** (todos los call sites auditados y verdes).
- [x] **VAL-06**: Solo el admin puede **anular** un pago (ANULADO con rastro: motivo + autor + fecha); al anular un pago con membresía asociada, un popup deja decidir 1-a-1 si la membresía sigue activa (default: activa).
- [x] **VAL-07**: La **membresía se activa al instante** al cargar el pago, independiente del estado de validación del pago.

### Carga única que propaga (CARGA) · corazón

- [x] **CARGA-01**: El profe registra un pago desde una UI **dead-simple** en el admin en pocos toques (socio, monto, medio de pago, caja), sin re-tipear en ningún otro sistema.
- [x] **CARGA-02**: Un solo registro del pago **propaga atómicamente** en una transacción DB (idempotente): activa/renueva la membresía + impacta el saldo de la caja correspondiente.
- [x] **CARGA-03**: El sistema soporta **cobros sueltos** (pago no atado a membresía) desde la misma UI.
- [x] **CARGA-04**: El rol **profe** existe en el admin con permisos acotados: puede cargar pagos (entran PENDIENTE), no puede validar ni anular.

### Cajas y saldos (CAJA)

- [x] **CAJA-01**: Existen cajas como entidad: **efectivo por sucursal**, **efectivo central**, y **banco por moneda** (banco ARS + banco EUR). Cada caja tiene una `currency` fija.
- [x] **CAJA-02**: Cada pago se asocia a una **caja** (`cash_register_id`), conceptualmente distinta de `branchId` (dónde se cobró ≠ adónde fue la plata).
- [x] **CAJA-03**: El **saldo firme** de cada caja = suma de operaciones VALIDADAS (derivado en v1); los PENDIENTES se muestran aparte y **no suman** al saldo firme.
- [x] **CAJA-04**: Una caja **nunca mezcla monedas**: rechaza montos de una moneda distinta a la suya (hereda el aislamiento del ledger).

### Movimientos inter-caja y egresos (MOV)

- [x] **MOV-01**: El admin registra un **movimiento inter-caja** (ej. efectivo Jujuy → efectivo central) como una sola operación con origen+destino; neto del sistema = 0.
- [x] **MOV-02**: El movimiento registra el **saldo esperado vs. contado** en el origen, dejando rastro de diferencias físicas (reconciliación = momento del retiro, sin cierre diario).
- [x] **MOV-03**: El admin registra un **egreso** (salida real de dinero) desde una caja, con monto + nota libre (sin categoría); resta del saldo de esa caja.
- [x] **MOV-04**: Movimientos y egresos pueden **anularse con rastro** (void ortogonal), igual que los pagos.

### Reportes para la admin (REP)

- [x] **REP-01**: La admin ve una **bandeja de pendientes** ordenada por antigüedad, con alerta configurable cuando un pendiente supera cierto tiempo (junto a los observados).
- [x] **REP-02**: La admin ve el **saldo firme y pendiente por caja** (efectivo por sucursal, central, banco por moneda).
- [x] **REP-03**: La admin ve el **historial de movimientos inter-caja y egresos** por caja/período.
- [x] **REP-04**: Los reportes nuevos se **exportan reusando** el export Excel/PDF existente.

### Transición Contabilium y configuración (MIG)

- [x] **MIG-01**: Las **perillas de configuración** (política de validación: todos vs. dudosos; activación de membresía instantánea vs. diferida) tienen una casa de configuración definida y funcional.
- [ ] **MIG-02**: Está **documentada la regla de "qué dato manda"** durante la convivencia con Contabilium por etapa de reemplazo (registro de ingresos primero; facturación AFIP último, fuera de scope).

---

## Future Requirements (deferred)

- Facturación electrónica AFIP/ARCA (último escalón del reemplazo de Contabilium).
- Categorización de egresos (proveedor / dueño / gasto / depósito).
- Validación selectiva "solo dudosos" con reglas automáticas (montos fuera de rango, socio nuevo, efectivo alto) — la perilla existe (MIG-01); las reglas son futuras.
- Conciliación del banco contra extracto bancario.

## Out of Scope (con razón)

- **Gateway de pago automático / integración con medio de pago** — todo es carga manual; el medio de pago es un dato, no una integración que crea el pago.
- **Cierre de turno / caja con float** — anti-feature; el modelo es acumulación + reconciliación al retiro.
- **Sync bidireccional con Contabilium** — reemplazo progresivo, no integración permanente.
- **Reestructuración financiera en Google Sheets** (plan de cuentas, márgenes por sucursal, proyección) — otro documento.

---

## Traceability

<!-- Filled by roadmap: REQ-ID → Phase -->

| Requirement | Phase                                          | Status   |
| ----------- | ---------------------------------------------- | -------- |
| VAL-01      | Phase 137 — Validación (cimiento)              | Complete |
| VAL-02      | Phase 137 — Validación (cimiento)              | Complete |
| VAL-03      | Phase 137 — Validación (cimiento)              | Complete |
| VAL-04      | Phase 137 — Validación (cimiento)              | Complete |
| VAL-05      | Phase 137 — Validación (cimiento)              | Complete |
| VAL-06      | Phase 137 — Validación (cimiento)              | Complete |
| VAL-07      | Phase 137 — Validación (cimiento)              | Complete |
| CAJA-01     | Phase 138 — Entidad caja + saldos              | Complete |
| CAJA-02     | Phase 138 — Entidad caja + saldos              | Complete |
| CAJA-03     | Phase 138 — Entidad caja + saldos              | Complete |
| CAJA-04     | Phase 138 — Entidad caja + saldos              | Complete |
| MOV-01      | Phase 139 — Movimientos inter-caja y egresos   | Complete |
| MOV-02      | Phase 139 — Movimientos inter-caja y egresos   | Complete |
| MOV-03      | Phase 139 — Movimientos inter-caja y egresos   | Complete |
| MOV-04      | Phase 139 — Movimientos inter-caja y egresos   | Complete |
| CARGA-01    | Phase 140 — Carga única + cobro suelto + profe | Complete |
| CARGA-02    | Phase 140 — Carga única + cobro suelto + profe | Complete |
| CARGA-03    | Phase 140 — Carga única + cobro suelto + profe | Complete |
| CARGA-04    | Phase 140 — Carga única + cobro suelto + profe | Complete |
| REP-01      | Phase 141 — Reportes para la admin             | Complete |
| REP-02      | Phase 141 — Reportes para la admin             | Complete |
| REP-03      | Phase 141 — Reportes para la admin             | Complete |
| REP-04      | Phase 141 — Reportes para la admin             | Complete |
| MIG-01      | Phase 142 — Config + transición Contabilium    | Complete |
| MIG-02      | Phase 142 — Config + transición Contabilium    | Pending  |

**Coverage:** 25/25 v5.2 requirements mapped → exactly one phase each. No orphans, no duplicates.
