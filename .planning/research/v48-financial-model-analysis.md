# v4.8 — Modelo Financiero: Análisis y Propuesta de Milestone

**Fecha:** 2026-04-27
**Status:** Análisis pre-spec. Decisiones clave tomadas con el usuario en conversación previa.

---

## Decisiones del usuario (locked antes de spec)

1. **Empezamos de cero**: NO se migran datos existentes de `payments` ni `debts`.
2. **Drop completo** de las tablas `payments` y `debts` en Fase 1. Datos históricos se descartan.
3. **No hay deudas activas** que preservar.
4. **Fuera del milestone**: Mercado Pago / Stripe (es Phase 7 del ecosistema, milestone aparte).

---

## 1 — Estado actual: qué hay y qué se descarta

### Tablas a descartar (DROP en Fase 1)

| Tabla      | Origen    | Limitación que motiva el reemplazo                                                                                                                   |
| ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments` | Phase 49  | Cobros siempre atados a `subscription_id` (NOT NULL). No modela pagos de saldo, ajustes, reembolsos, señales, transferencias.                        |
| `debts`    | Phase 101 | Sin FK a payments ni subscriptions. Editable a mano. Pisa en silencio (upsert). Decisión D-05 explícita: "no integration with payments table in v1". |

### Tablas que se mantienen (impacto en spec)

| Tabla           | Impacto                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscriptions` | El campo `pricePaid` deja de significar "lo que cobramos" y pasa a significar "precio acordado del plan". Los descuentos AURA, boarding pass y `priceOverrideAmount` siguen siendo legítimos para descuentos reales (no para deuda implícita). |

### UX a reescribir/eliminar

| Componente                                          | Acción                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `MemberFormDialog` (sección "Deuda" líneas 420-464) | **Eliminar** — la deuda deja de ser editable a mano.                             |
| `AssignPlanDialog`                                  | **Reescribir** — incluir sección "Cobro" con monto/método/fecha al asignar plan. |
| `MemberSubscriptionTab`                             | **Reescribir** — flujo de "registrar pago" sobre conceptos pendientes.           |
| `CajaPage` (637 líneas)                             | **Reescribir** — summary y tabla contra el modelo nuevo.                         |

### Endpoints a eliminar

- `POST /members/:userId/payments`
- `POST /payments/:paymentId/void`
- `GET /members/:userId/payments`
- `GET /payments`
- `GET /payments/summary`
- Todo `members/debts-service.ts` y endpoints relacionados.

---

## 2 — Inventario de agujeros del modelo viejo (para checklist de aceptación del nuevo)

| #   | Agujero                                                | Cubierto por                                                        |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| A   | Cobrar saldo de deuda no deja huella en payments.      | `kind='debt_settlement'`                                            |
| B   | Cargar nueva deuda pisa la existente.                  | Las deudas son derivadas, no editables.                             |
| C   | "De qué membresía es la deuda" en texto libre.         | `transaction_links.target_kind='subscription'`                      |
| D   | `priceOverrideAmount` y deuda inconsistentes entre sí. | Override = descuento real; deuda = cobro parcial. Convención clara. |
| E   | Anular pago no cancela deuda asociada.                 | Void revierte automáticamente los links.                            |
| F   | No hay reembolso ni saldo a favor.                     | `kind='refund'`, saldo a favor en versiones futuras.                |
| G   | No hay señal/pago anticipado.                          | `kind='advance_payment'`, sin link inicial.                         |
| H   | No hay transferencias inter-miembros.                  | Out of scope este milestone.                                        |
| I   | Caja agrega sin distinguir devengado vs. cobrado.      | `transaction_date` vs `effective_date`.                             |
| J   | Multi-moneda guard estricto.                           | Una moneda por transacción, sigue siendo regla.                     |

---

## 3 — Modelo objetivo

### Schema

```
financial_transactions
├── id
├── member_id (FK users) — quién
├── kind: enum('plan_charge', 'debt_settlement', 'refund', 'adjustment',
│              'advance_payment')
├── direction: enum('inflow', 'outflow')
├── amount, currency
├── payment_method: enum('cash', 'transfer', 'card', 'aura_credit', 'internal')
├── transaction_date — fecha del movimiento real (caja)
├── effective_date — fecha que devenga (decisión spec: ¿separadas o una sola?)
├── branch_id — para reportes por sede
├── recorded_by, voided_at, voided_by, void_reason — auditoría
├── notes
└── created_at, updated_at

transaction_links (pivot — qué se está pagando)
├── id
├── transaction_id (FK)
├── target_kind: enum('subscription', 'debt_balance', 'transaction')
├── target_id
├── allocated_amount — cuánto de la transacción aplica a este target
└── (UNIQUE: transaction_id + target_kind + target_id)
```

### Por qué pivot y no FK directa

Un solo cobro de 50k puede aplicar 30k a una membresía nueva + 20k a saldar deuda anterior. FK directa no lo soporta; pivot sí, y permite balance correcto.

### Deudas: derivadas, no almacenadas

`saldo_de_un_concepto = sum(plan_charge cargado contra ese concepto) - sum(inflows aplicados a ese concepto)`.

Decisión a tomar en spec: ¿query derivado puro vs. cache reconciliado vía trigger/job? Recomendación: cache para soportar el listado "Solo deudores" sobre todos los miembros sin penalizar performance. La cache se valida con reconciliation job nocturno.

---

## 4 — Casos de uso (criterios de aceptación)

1. ✅ **Cobro completo de plan**: cargar membresía, pagar 100% al toque.
2. ✅ **Cobro parcial al cargar membresía**: pagar 90k de 100k, generar saldo pendiente 10k.
3. ✅ **Saldar deuda existente**: registrar 10k de inflow aplicado al saldo, dejando huella en caja.
4. ✅ **Pago de deuda parcial**: paga 5k de los 10k, saldo baja a 5k, caja registra los 5k.
5. ✅ **Pago split** (1 cobro = N conceptos): pagas 50k, 30k a plan nuevo + 20k a saldo viejo.
6. ✅ **Anular cobro de plan**: revierte transacción + reabre el saldo si correspondía.
7. ✅ **Anular pago de saldo**: el saldo se reabre por el monto anulado.
8. ✅ **Ajuste manual auditable**: `kind='adjustment'` con motivo obligatorio.
9. ✅ **Reembolso**: outflow contra una transacción anterior.
10. ✅ **Señal / pago anticipado**: cargar inflow sin subscription, después aplicar.
11. ✅ **Caja del mes correcta**: ingreso real = todos los inflows no anulados, segmentable por kind.
12. ✅ **Reporte deudas pendientes**: aging por antigüedad, sucursal, plan.
13. ✅ **Histórico por miembro**: timeline financiero completo.

### Fuera de scope del milestone

- Mercado Pago / Stripe (Phase 7 ecosistema).
- Multi-moneda mezcladas en una transacción.
- Conciliación bancaria automática.
- Cierre diario formal con Z report.
- Transferencias inter-miembros como flujo primario.

---

## 5 — Propuesta de fases

### Fase 1 — Modelo de datos + drop del viejo

- Crear `financial_transactions` + `transaction_links` con migration.
- DROP TABLE `payments` y `debts`.
- Servicios CRUD a nivel API (sin exponer rutas todavía).
- Eliminar `payments` module, `debts-service.ts`, schemas relacionados.
- Tests unitarios.
- **Goal-backward**: schema nuevo en sync, viejo desaparece, nada de UX cambia todavía (queda rota a propósito hasta Fase 3).

### Fase 2 — Endpoints transaccionales

- `POST /transactions` con links.
- `POST /transactions/:id/void` con motivo.
- `GET /members/:id/financial-history` (timeline).
- `GET /transactions` lista filtrable.
- Tests integración.
- **Goal-backward**: API completa, lista para que el frontend la consuma.

### Fase 3 — UX: carga de membresía con cobro integrado

- Reescribir `AssignPlanDialog` con sección "Cobro": monto, método, fecha, preview de saldo si parcial.
- Eliminar sección "Deuda" de `MemberFormDialog`.
- Endpoint atómico subscription+transaction+link en una transacción DB.
- **Goal-backward**: Iñaki carga membresía con deuda como pidió (caso original). Casos 1, 2 funcionan.

### Fase 4 — UX: pago de saldo + historial financiero

- Botón "Registrar pago" en perfil del miembro: monto, método, distribución entre conceptos pendientes.
- Tab "Historial financiero" en perfil del miembro.
- **Goal-backward**: casos 3, 4, 5, 6, 7, 8 por UI.

### Fase 5 — CajaPage v2 + reportes

- Reescribir summary contra `financial_transactions`.
- Tabla con columna `kind` y filtros por tipo.
- Reporte de **deudas pendientes** (aging).
- Export Excel actualizado.
- Doc de operación para admins.
- **Goal-backward**: casos 11, 12, 13. Caja refleja realidad financiera.

### Potenciales fases v4.6+

- Reembolsos como flujo de UX (caso 9).
- Señales / pagos anticipados como flujo de UX (caso 10).
- Cierre de caja diario / Z report.
- Conciliación bancaria.

---

## 6 — Gray areas para `/gsd-spec-phase`

Decisiones a explicitar en spec. Mi voto incluido para acelerar la conversación.

1. **`transaction_date` vs `effective_date`**: ¿separadas o una sola?
   - **Voto:** separadas. Caja reportea por `transaction_date`; reportes financieros pueden usar `effective_date`.

2. **¿Deuda se origina automáticamente al cargar membresía con cobro parcial?**
   - **Voto:** sí, automática, con preview en la UI antes de confirmar.

3. **¿Saldo derivado: query puro vs. cache reconciliada?**
   - **Voto:** cache, para soportar "solo deudores" con buen performance. Job nocturno valida.

4. **`subscriptions.priceOverrideAmount` con motivo "deuda" en el modelo viejo**: dado que se descartan datos viejos, no aplica. Las suscripciones existentes que sigan vivas con esos overrides quedan tal cual.

5. **¿Transacciones admiten edición o solo void+recreate?**
   - **Voto:** solo void+recreate, mantiene auditoría limpia.

6. **RBAC para `kind=adjustment`**: ¿solo owner? ¿coaches?
   - **Voto:** owner-only por riesgo de abuso. Coach ve, no crea.

7. **Pagos sin `branch_id`** (member online sin sucursal):
   - **Voto:** virtual branch "Templo Online" del ecosistema lo cubre. Confirmar que ya existe en seed.

8. **Multi-moneda**: ¿se mantiene "una moneda por transacción"?
   - **Voto:** sí, regla intacta. Pagos en múltiples monedas = múltiples transacciones.

9. **¿Las transacciones pueden no tener `transaction_links`?**
   - **Voto:** sí, casos válidos: `advance_payment` sin destino aún, `adjustment` puro. Los links se agregan después si corresponde.

10. **¿Anulación de transacción con links debe ser cascada o por link?**
    - **Voto:** cascada por defecto (anular toda la transacción anula todos los links). Caso edge "anular solo un link" no entra en este milestone.

---

## 7 — Riesgos del milestone

- **CajaPage queda rota entre Fase 1 y Fase 5**. Mitigación: la Fase 1 puede dejarla mostrando un mensaje "en migración" si ese gap molesta. O priorizar Fase 5 antes que 4 si la operación lo necesita.
- **El usuario carga membresías hoy**. Si Fase 3 demora, AssignPlanDialog queda sin forma de cobrar. Decisión: ¿dejamos AssignPlanDialog roto entre fases o un parche temporal?
- **Phase 101 fue diseñada explícitamente como "v1, sin payments link"**. Estamos rompiendo esa decisión a conciencia, porque el contexto cambió (Maman empuja por integración con caja). Documentar el por qué.

---

## Próximos pasos

1. ✅ Análisis persistido (este documento).
2. ⏭️ `/gsd-new-milestone` para crear v4.8.
3. ⏭️ `/gsd-spec-phase` para Fase 1.
