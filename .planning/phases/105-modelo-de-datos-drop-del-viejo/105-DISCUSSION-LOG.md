# Phase 105: Modelo de Datos + Drop del Viejo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 105-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 105-modelo-de-datos-drop-del-viejo
**Areas discussed:** Blast radius (analytics/reports/jobs), Estructura del módulo nuevo, Lifecycle de balances rows, Strategy de tests + scope frontend

---

## Selección de Áreas a Discutir

| Opción                               | Selected |
| ------------------------------------ | -------- |
| Blast radius: analytics/reports/jobs | ✓        |
| Estructura del módulo nuevo          | ✓        |
| Lifecycle de `balances` rows         | ✓        |
| Strategy de tests + scope frontend   | ✓        |

**User's choice:** Las 4 áreas.

---

## Blast Radius: analytics / reports / jobs

### Q1: Analytics (monthlyRevenue, revenueByMethod) y reports queryan `payments` directamente. ¿Cómo manejarlo?

| Opción                                                | Descripción                                                                                                                                        | Selected |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Reescribir todo contra `financial_transactions` ahora | Cambiar todos los queries a `WHERE kind IN ('plan_charge', 'debt_settlement') AND voided_at IS NULL`. Más scope en 105 pero todo verde end-to-end. | ✓        |
| Stub-out con queries vacíos + TODO de phase 109       | Funciones existen pero retornan vacío hasta 109. Riesgo: dashboards en 0 entre 105-109.                                                            |          |
| Mover esos queries a Phase 109 explícitamente         | Borrar funciones, agregar a deferred. Admin pierde revenue summary entre 105→109.                                                                  |          |

**User's choice:** Reescribir todo contra `financial_transactions` ahora.
**Notas:** Permite mantener admin operativo entre fases.

### Q2: subscriptions/service.ts y job auto-resume llaman `paymentService.recordPayment`. ¿Cómo encarar el dropeo?

| Opción                                                                  | Descripción                                                          | Selected |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| Reemplazar inline con `transactionService.create({kind:'plan_charge'})` | Mantiene contrato funcional. 107 reemplaza después con UI explícita. | ✓        |
| Sacar el auto-cobro de subscriptions/jobs en 105                        | Asignar plan no genera payment auto entre 105 y 107.                 |          |
| Hybrid: mantener inline en subscriptions, dropear job                   | Compromiso: path principal ok, paths laterales se difieren.          |          |

**User's choice:** Reemplazar inline con `transactionService.create({kind:'plan_charge'})`.
**Notas:** No romper el flow actual de asignación de plan.

---

## Estructura del Módulo Nuevo

### Q3: Nombre del directorio del nuevo módulo

| Opción                 | Descripción                                                                                          | Selected |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| finance/ (Recommended) | Umbrella amplio. Soporta a futuro reportes/caja/aging. Convención del proyecto: dominio, no entidad. | ✓        |
| transactions/          | Directo y descriptivo, pero estrecho.                                                                |          |
| Reusar `payments/`     | Liberado al borrar; riesgo de confusión histórica.                                                   |          |

**User's choice:** finance/

### Q4: Service único o facade pattern

| Opción                                                            | Descripción                                                                     | Selected |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Facade pattern: TransactionService + BalanceService (Recommended) | Sigue el patrón de `edit-service.ts` (CLAUDE.md). Testeable independientemente. | ✓        |
| Service único TransactionService                                  | Una clase con todo. Phase 109 lo va a tener que partir igual.                   |          |
| Facade más granular (3 services)                                  | Over-engineering temprano.                                                      |          |

**User's choice:** Facade pattern: TransactionService + BalanceService.

### Q5: Dónde van los enums

| Opción                               | Descripción                                      | Selected |
| ------------------------------------ | ------------------------------------------------ | -------- |
| Solo en Drizzle schema (Recommended) | Single source of truth. Convención del proyecto. | ✓        |
| Drizzle + duplicado en types.ts      | Riesgo de drift.                                 |          |

**User's choice:** Solo en Drizzle schema.

---

## Lifecycle de `balances` Rows

### Q6: Cuándo se crea el row en `balances` para una subscription

| Opción                                               | Descripción                                             | Selected |
| ---------------------------------------------------- | ------------------------------------------------------- | -------- |
| Lazy: solo si hay actividad financiera (Recommended) | Row aparece la primera vez que una transacción lo toca. | ✓        |
| Eager: crear row al crear subscription               | Acopla subscriptions/service.ts. Beneficio dudoso.      |          |

**User's choice:** Lazy.

### Q7: Cuando un saldo llega a cero, qué hacer con el row

| Opción                              | Descripción                                      | Selected |
| ----------------------------------- | ------------------------------------------------ | -------- |
| Mantener con amount=0 (Recommended) | Auditoría directa. Simplifica void.              | ✓        |
| DELETE el row al llegar a 0         | Edge cases más complejos. Ahorro insignificante. |          |

**User's choice:** Mantener con amount=0.

### Q8: Cuando hay saldo a favor (amount negativo), dónde se modela

| Opción                                               | Descripción           | Selected              |
| ---------------------------------------------------- | --------------------- | --------------------- |
| Permitir amount negativo en `balances` (Recommended) | Consistente con SPEC. | ✓ (con clarificación) |
| Forzar amount >= 0; usar advance_payment             | Contradice SPEC.      |                       |

**User's choice inicial:** "imagino el 1 pero no imagino en que casos el miembro tiene saldo a favor"
**Clarificación dada:** Casos reales: cobro con redondeo cash sin vuelto, pago duplicado pre-void, refund parcial, advance_payment con link a mes futuro.

### Q8b: Confirmación post-clarificación

| Opción                 | Descripción               | Selected |
| ---------------------- | ------------------------- | -------- |
| Sí, confirmar opción 1 | Permitir amount negativo. | ✓        |
| Forzar amount >= 0     | Re-abre el SPEC.          |          |

**User's choice:** Sí, confirmar opción 1.

---

## Strategy de Tests + Scope Frontend

### Q9: Style de tests

| Opción                                            | Descripción                                                              | Selected |
| ------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Integration tests contra MySQL real (Recommended) | Convención post-Phase 19 (CLAUDE.md). Verifica invariantes con SQL real. | ✓        |
| Mix: unit in-memory + integration para cache      | Riesgo: mocks divergen del comportamiento real de Drizzle/MySQL.         |          |
| Solo integration, mínimo viable                   | 5-7 tests, no exhaustivo. 106 completa la cobertura.                     |          |

**User's choice:** Integration tests contra MySQL real.

### Q10: Scope frontend de Phase 105

| Opción                                                           | Descripción                                                                               | Selected |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| 105 incluye endpoint nuevo + AlumnosPage funcional (Recommended) | 105 reescribe el endpoint existente para que AlumnosPage no rompa. 106 agrega los nuevos. | ✓        |
| 105 solo backend; AlumnosPage queda roto hasta 106               | Inaceptable para producción.                                                              |          |
| 105 reescribe en members/service.ts pero sin endpoint dedicado   | Cambio quirúrgico interno.                                                                |          |

**User's choice:** 105 incluye endpoint nuevo + AlumnosPage funcional.

### Q11: Eliminación de UI "Deuda" en MemberFormDialog

| Opción                                              | Descripción                                                      | Selected |
| --------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| Eliminar sección + campos del payload (Recommended) | Endpoint con additionalProperties:false rechaza payloads viejos. | ✓        |
| Eliminar UI pero mantener acepta-y-descarta en API  | Riesgo: campos zombies en payload sin nadie dándose cuenta.      |          |

**User's choice:** Eliminar sección + campos del payload.

---

## Claude's Discretion

Áreas explícitamente delegadas a planning/execution:

- Naming exacto de métodos del service (`create` vs `record`, `void` vs `cancel`).
- Estructura interna del facade (DI por constructor, factory, etc.).
- Cómo expresar el invariante "Σ allocated = amount" — service layer (recomendado) vs CHECK constraint en MySQL.
- Mensajes de error exactos.
- Helper `tx` brand type para BalanceService.applyDelta.

## Deferred Ideas

Ideas mencionadas durante la discusión, anotadas para no perderlas:

- Reconciliation cron de cache `balances` (ya en deferred-items.md, no re-abrir).
- CHECK constraints en MySQL como defensa en profundidad.
- Brand type para `tx` parameter.
- Refactor de subscriptions/service.ts para que `transactionService` no sea opcional.
- Endpoint dedicado `/admin/members/with-balances` — solo si el actual no permite expresar "balance > 0" sin romper contrato.
