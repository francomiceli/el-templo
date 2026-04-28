# Phase 107: Cobro al Asignar Plan - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 107-cobro-al-asignar-plan
**Areas discussed:** UX del bloque Cobro + default del monto, Comportamiento si recibido ≠ pricePaid, Multi-method split + pricePaid=0, Backend (assignPlan refactor + modo change/renew), changePlan con proration

---

## Gray Area Selection

| Area                                              | Selected |
| ------------------------------------------------- | -------- |
| UX del bloque Cobro + default del monto           | ✓        |
| Comportamiento si recibido ≠ pricePaid            | ✓        |
| Multi-method split + pricePaid=0                  | ✓        |
| Backend (assignPlan refactor + modo change/renew) | ✓        |

**Contexto adicional aportado por el usuario al seleccionar:**

> "Barcelona y Chapadmalal ya usan la aplicación con membresías y cobros reales, tenemos que tener esto en cuenta, todavía no se usó lo de deuda pero ya tenemos uso real."

→ Locked como D-19 en CONTEXT.md (backward compat no-negociable).

---

## UX del bloque Cobro

### ¿Dónde vive el bloque "Cobro" en AssignPlanDialog?

| Option                                                           | Description                                                                          | Selected |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| En el step Confirmar, debajo del summary de precio (Recomendado) | El step final muestra pricing + Cobro. Mover paymentMethod del step 2 hacia acá.     | ✓        |
| En step 2 'Configurar', donde ya vive payment method             | Agrupa todo en un step pero el finalPrice se computa con AURA/override en este step. |          |
| Step propio nuevo 'Cobro' antes de Confirmar                     | Stepper crece a 4-5 steps. Más clicks operativos.                                    |          |

### ¿Cómo se pre-llena 'Monto recibido' al abrir el step?

| Option                                                           | Description                                                         | Selected |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| Pre-llenar con finalPrice (cobro completo asumido) (Recomendado) | Optimiza el caso 90% (cobro completo) y reduce clicks.              | ✓        |
| Arrancar en 0 / vacío (forzar tipear)                            | Previene errores de 'olvidar verificar' pero tipea el mismo número. |          |

---

## Comportamiento si recibido ≠ pricePaid

### Cuando recibido < pricePaid: ¿cuánta fricción adicional?

| Option                                                            | Description                                                         | Selected |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| Solo preview + label dinámico en el botón Confirmar (Recomendado) | Botón cambia a 'Confirmar (saldo $X)'. Cero fricción extra.         |          |
| Preview + warning banner amarillo above-the-fold                  | Banner '⚠ Plan se asigna con saldo pendiente'. Visible y educativo. | ✓        |
| Preview + checkbox 'Confirmo cobro parcial' obligatorio           | Máxima protección pero 1 click extra cada vez que hay parcial.      |          |

### Cuando recibido > pricePaid (pago anticipado / saldo a favor): ¿qué hace v1?

| Option                                                               | Description                                                                | Selected |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| Bloquear: cap superior = pricePaid (Recomendado)                     | Mantén Phase 107 simple. Phase 108 cubre overpayments con flujo explícito. | ✓        |
| Permitir: genera 2 transacciones (plan_charge + advance_payment)     | Cubre el caso pero agrega complejidad backend + frontend.                  |          |
| Permitir: 1 sola transacción con balance negativo en la subscription | Conceptualmente raro: 'esta subscription debe -$5k'.                       |          |

---

## Multi-method split + pricePaid=0

### ¿V1 soporta cobrar con dos métodos en una sola asignación?

| Option                                                   | Description                                                  | Selected |
| -------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| No: un solo método, el resto vía Phase 108 (Recomendado) | Cero complejidad extra en 107, semantically clean.           | ✓        |
| Sí: dos métodos en el form                               | Form crece, más edge cases. Frecuencia real estimada 10-20%. |          |

### Cuando finalPrice=0: ¿qué muestra el dialog?

| Option                                                                                  | Description                                                        | Selected |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Bloque visible pero deshabilitado con leyenda 'Plan gratuito - sin cobro' (Recomendado) | Consistencia visual. Inputs disabled, texto explica.               | ✓        |
| Ocultar el bloque entero                                                                | UI más limpia pero el admin puede olvidar verificar que es gratis. |          |
| Mostrar bloque con monto recibido editable, transacción se omite si queda en 0          | Confunde — admin podría tipear un monto sin contexto.              |          |

---

## Backend (assignPlan refactor + modo change/renew)

### Atomicidad: ¿cómo resolvemos?

**Pregunta inicial del usuario:** "¿cómo podría fallar el paso 2?"

**Respuesta dada:**

1. Connection drop entre paso 1 y paso 2.
2. App muere mid-flight (deploy/OOM).
3. Lock timeout en `balances`.
4. Constraint violation latente por bug futuro.
5. balance-service tira por edge case.

| Option                                                                                         | Description                                                                  | Selected |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| Refactor: TransactionService acepta tx opcional, todo en una sola db.transaction (Recomendado) | Cumple CHARGE-03 literal. Refactor de transaction-service + balance-service. | ✓        |
| Aceptar el riesgo: dejar como está, log + alerta a Sentry si paso 2 falla                      | Cero refactor pero NO cumple CHARGE-03. Compensación manual.                 |          |
| Two-phase: crear primero la transaction, luego la subscription en su propia tx                 | Más complejo, no resuelve el problema de fondo.                              |          |

### Cobertura: ¿qué modos cubre Phase 107?

| Option                                                     | Description                                                               | Selected |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| Cobertura completa: assign + change + renew (Recomendado)  | Cumple CHARGE-01 literal ('asignar o renovar plan').                      | ✓        |
| Solo 'assign' en v1, change/renew mantienen cobro completo | Defer parcial-on-renew a fase futura. Riesgo: 30-50% del flow sigue roto. |          |

---

## changePlan con proration

### En mode='change' + startMode='now' (proration activa), ¿contra qué monto se compara amountReceived en el preview?

| Option                                                                                             | Description                                                      | Selected |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| Contra netAmount (lo que efectivamente queda por cobrar) (Recomendado)                             | Match con la semántica operativa: 'le cobro la diferencia'.      |          |
| Contra el precio entero del plan nuevo                                                             | Conceptualmente complejo, expone proration como número negativo. |          |
| Mostrar ambos: 'Plan: $100k, Crédito proration: -$30k, Neto a cobrar: $70k' y comparar contra neto | Igual que A pero con desglose visible.                           | ✓        |

**Notas del usuario:** "todo en español". Adicional: "no sé si al cobrar un plan nuevo en el medio de un viejo se asume que hay crédito" — flagueado como deferred idea (revisar regla automática de crédito por proration en changePlan, escapa scope de 107).

**También aportado:** "vi que pusiste algo de Zod, no usamos Zod en este repositorio" → corrección crítica capturada en D-15 (no Zod, Fastify JSON Schema). Corrige nota stale en 106-CONTEXT.md.

---

## Claude's Discretion

- Texto exacto del banner amarillo (mensaje del warning).
- Posición exacta del bloque dentro del step Confirmar (gap, separator).
- Estilo del desglose proration (cards anidadas vs lines de q-list).
- Naming de tests y archivos.
- Granularity exacta de los logs estructurados.
- Estructura de la `db.transaction` nested en drizzle-orm.
- Notas de la transaction (autogeneradas vs reuso del `notes` del form).

---

## Deferred Ideas

- Multi-method split (50k cash + 30k transferencia) en una sola asignación.
- Pago anticipado / saldo a favor desde el dialog de asignación.
- Revisar regla de crédito automático por proration en changePlan.
- Notas separadas plan vs cobro.
- Backfill / regeneración de transactions post-deploy.
- Auditoría de orphans históricos potenciales.
