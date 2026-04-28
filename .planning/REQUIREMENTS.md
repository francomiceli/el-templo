# Requirements: El Templo v4.8 — Modelo Financiero

**Defined:** 2026-04-27
**Core Value:** El Templo tiene un modelo transaccional unificado de cobros, deudas y caja: cada movimiento de dinero deja huella auditable, los saldos pendientes son derivados (no editables a mano), las anulaciones revierten correctamente, y la página de Caja refleja la realidad financiera real.

**Reference:** `.planning/research/v48-financial-model-analysis.md` — análisis profundo, schema propuesto, gray areas con voto pre-spec, casos de uso, riesgos.

---

## v4.8 Requirements

24 requirements en 5 categorías mapeadas 1:1 a las 5 fases (105-109). Phase 105 SPEC absorbió CHARGE-04 (UI cleanup del MemberFormDialog) en TXN-04 para evitar romper el form al dropear la tabla `debts`.

### Modelo de Datos (TXN) — Phase 105

- [ ] **TXN-01**: Tabla `financial_transactions` creada con schema completo: `kind` enum (`plan_charge`, `debt_settlement`, `refund`, `adjustment`, `advance_payment`), `direction` enum (`inflow`, `outflow`), `amount`, `currency`, `payment_method` enum (`cash`, `transfer`, `card`, `aura_credit`, `internal`), `transaction_date`, `effective_date`, `branch_id`, `recorded_by`, `voided_at`, `voided_by`, `void_reason`, `notes`, timestamps.
- [ ] **TXN-02**: Tabla pivot `transaction_links` creada con `transaction_id`, `target_kind` enum (`subscription`, `debt_balance`, `transaction`), `target_id`, `allocated_amount`, UNIQUE(`transaction_id`, `target_kind`, `target_id`), índice por `target_kind` + `target_id` para lookups eficientes.
- [ ] **TXN-03**: Tabla `payments` y todo el código relacionado eliminados (módulo `payments/`, schema, types, tests, endpoints).
- [ ] **TXN-04**: Tabla `debts` y todo el código relacionado eliminados (`debts-service.ts`, schema, types, tests, endpoints, UI "Deudor" en `MemberFormDialog`).
- [ ] **TXN-05**: Transacciones inmutables post-creación. Service layer no permite UPDATE de `financial_transactions` excepto sobre los campos `voided_at`, `voided_by`, `void_reason`. Modificaciones reales se hacen vía void + recreate.
- [ ] **TXN-06**: Suma de `allocated_amount` de los links de una transacción = `amount` de la transacción. Service layer rechaza inputs que violen la igualdad. Excepción: transacciones sin links (e.g., `kind='advance_payment'` sin destino aún) son válidas.
- [ ] **TXN-07**: Integridad referencial de links: `transaction_links.target_id` debe apuntar a una entidad existente del `target_kind` correspondiente al momento de creación. Service layer valida explícitamente.

### Endpoints API (API) — Phase 106

- [ ] **API-01**: `POST /transactions` crea transacción + N links atómicamente en una transacción DB. Payload acepta `member_id`, `kind`, `direction`, `amount`, `currency`, `payment_method`, dates, `branch_id`, `notes`, `links[]`.
- [ ] **API-02**: `POST /transactions/:id/void` requiere `reason` no vacío, marca `voided_at`/`voided_by`/`void_reason`, y revierte el efecto de los links sobre el saldo derivado de cada target.
- [ ] **API-03**: `GET /members/:id/financial-history` retorna timeline cronológico de todas las transacciones del miembro (con sus links, info de void, montos). Ordenado por `transaction_date` desc.
- [ ] **API-04**: `GET /transactions` retorna lista paginada y filtrable por `branch_id`, `kind`, `date_from`, `date_to`, `member_id`, `payment_method`, búsqueda por nombre. Reusa el patrón `PaginatedResult<T>` existente.
- [ ] **API-05**: RBAC para crear transacción — `POST /transactions` con `kind=adjustment` requiere rol `owner`; otros `kind` requieren `owner | admin | recepcionista`.
- [ ] **API-06**: RBAC para anular — `POST /transactions/:id/void` requiere rol `owner | admin` (recepcionista excluido por riesgo de abuso).
- [ ] **API-07**: RBAC para lectura — `GET /transactions` y `GET /members/:id/financial-history` siguen las `PAYMENT_READ_ROLES` actuales (`owner | admin | coach | recepcionista`), con scope por sucursal para no-owners.

### Cobro al Asignar Plan (CHARGE) — Phase 107

- [ ] **CHARGE-01**: `AssignPlanDialog` incluye sección "Cobro" con monto recibido, método de pago, fecha al asignar o renovar plan.
- [ ] **CHARGE-02**: `AssignPlanDialog` muestra preview en vivo del saldo resultante cuando el monto recibido es menor al `pricePaid` del plan (ej.: "Saldo pendiente: $10.000 ARS").
- [ ] **CHARGE-03**: Asignar plan + crear `financial_transaction` + crear `transaction_link` es atómico en una transacción DB; fallo en cualquier paso revierte todos.

> _CHARGE-04 (eliminar UI "Deuda" del `MemberFormDialog`) se movió a Phase 105 — la spec de 105 lockeó que la limpieza del UI va junta con el drop de la tabla `debts` para evitar que el form quede enviando campos a un endpoint inexistente. Ver Phase 105 SPEC requirement #5._

### Pago de Saldo + Historial Financiero (PAYMENT) — Phase 108

- [ ] **PAYMENT-01**: Perfil del miembro (`AlumnoDetailPage`) tiene botón "Registrar pago" que abre dialog con monto, método, fecha, notas.
- [ ] **PAYMENT-02**: Dialog "Registrar pago" lista conceptos pendientes del miembro mostrando para cada uno: descripción, saldo actual, antigüedad en días. Permite distribuir el monto entre ellos (split allocation), validando que `Σ allocated = monto total`.
- [ ] **PAYMENT-03**: Perfil del miembro tiene tab "Historial financiero" con timeline cronológico de todas sus transacciones, mostrando para cada concepto pendiente su saldo y antigüedad. Incluye info de void cuando aplica.

### Caja y Reportes (CAJA) — Phase 109

- [ ] **CAJA-01**: `CajaPage` summary segmentado por `kind` (cobros de plan, saldos de deuda, ajustes, reembolsos) además del corte actual por método y sucursal.
- [ ] **CAJA-02**: `CajaPage` tabla muestra columna `kind` y filtro por tipo de transacción.
- [ ] **CAJA-03**: Reporte de **aging de deudas pendientes**: lista de saldos abiertos agrupable por sucursal, plan, antigüedad (0-30, 31-60, 61-90, 90+ días), miembro.
- [ ] **CAJA-04**: Excel export del CajaPage y del reporte de aging actualizado para reflejar el modelo nuevo (columnas: kind, allocated amounts, target del link).

---

## Future Requirements (deferred to v4.9+)

- **Reembolso como flow de UX dedicado** (caso 9 del análisis — el modelo lo soporta vía `kind='refund'` pero la UX dedicada queda fuera).
- **Señales / pagos anticipados como flow de UX dedicado** (caso 10 — modelo lo soporta vía `kind='advance_payment'` sin link inicial; la UX dedicada queda fuera).
- **Cierre de caja diario / Z report** con totales firmados por turno.
- **Conciliación bancaria automática** (matching de transferencias contra extractos).
- **Transferencias inter-miembros** como concepto primario (familiar paga por otro miembro).
- **Doc operacional para admins** — tutorial de cada escenario (cobro completo, parcial, saldo, ajuste, anulación). Originalmente CAJA-05; movido fuera del milestone porque es entregable de docs, no de código.

---

## Out of Scope

- **Mercado Pago / Stripe**: corresponde a Phase 7 del ecosistema (milestone v6.x — Online Model + Payment Gateway). Ese milestone usará este modelo transaccional como base.
- **Multi-moneda mezcladas en una transacción**: regla "una moneda por transacción" se mantiene. Pagos en distintas monedas → múltiples transacciones.
- **Migración de datos históricos** de `payments` y `debts`: explícitamente descartada por decisión del usuario (2026-04-27). Ambas tablas se eliminan en Phase 105 sin backfill.

---

## Traceability

| Phase                                      | Requirements                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 105 — Modelo de Datos + Drop del Viejo     | TXN-01, TXN-02, TXN-03, TXN-04, TXN-05, TXN-06, TXN-07 (TXN-04 absorbe CHARGE-04 — UI cleanup atómico con drop) |
| 106 — Endpoints Transaccionales            | API-01, API-02, API-03, API-04, API-05, API-06, API-07                                                          |
| 107 — Cobro al Asignar Plan                | CHARGE-01, CHARGE-02, CHARGE-03                                                                                 |
| 108 — Pago de Saldo + Historial Financiero | PAYMENT-01, PAYMENT-02, PAYMENT-03                                                                              |
| 109 — Caja v2 + Reportes                   | CAJA-01, CAJA-02, CAJA-03, CAJA-04                                                                              |

**Coverage:** 24 requirements / 5 phases / 100% mapeado.

**Reqs adicionales lockeados a nivel SPEC** (no en REQUIREMENTS.md, pero en el SPEC.md de cada fase):

- Phase 105 SPEC adds: tabla `balances` (cache de saldos pendientes), reescritura de filtro "Solo deudores" en AlumnosPage contra la nueva cache.
