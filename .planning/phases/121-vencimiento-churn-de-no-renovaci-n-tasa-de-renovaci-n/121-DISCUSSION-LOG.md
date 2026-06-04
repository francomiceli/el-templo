# Phase 121: Vencimiento — Churn de no renovación + Tasa de renovación - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
**Areas discussed:** Predicado de "vencida" + pausa, Predicado de "retuvo/renovó", N (churn) vs corte 15d, Edge multi-vencimiento + métricas viejas

---

## Predicado de "vencida" + pausa

| Option                           | Description                                                | Selected          |
| -------------------------------- | ---------------------------------------------------------- | ----------------- |
| Sí, se fue = churn               | Baja temprana cuenta; vencimiento = fecha efectiva de baja |                   |
| No, solo no-renovación al vencer | Cohorte solo "llegó al endDate y no renovó"                | ✓ (vía free-text) |
| Vos decidís                      | —                                                          |                   |

**User's choice (baja temprana):** Free-text — "es raro que alguien voluntariamente cancele su suscripción, a lo sumo deja de ir antes del end date y no renueva". → Cohorte por `endDate` natural; la baja voluntaria mid-term no se modela aparte (D-01/D-02).

| Option                             | Description                                    | Selected |
| ---------------------------------- | ---------------------------------------------- | -------- |
| Excluir mientras esté pausada      | Sale de la cohorte hasta reanudar y vencer     | ✓        |
| Correr el vencimiento por la pausa | Ajustar endDate efectivo por duración de pausa |          |
| Vos decidís                        | —                                              |          |

**User's choice (pausa):** Excluir mientras esté pausada (D-03).

---

## Predicado de "retuvo/renovó"

| Option                                   | Description                                      | Selected |
| ---------------------------------------- | ------------------------------------------------ | -------- |
| Sub nueva que arranca dentro de [E, E+N] | Cambio de plan/duración también cuenta           | ✓        |
| Solo si renueva el MISMO plan            | Cambio de plan no contaría (contradice CHURN-04) |          |
| Vos decidís                              | —                                                |          |

**User's choice (renovó):** Sub nueva en [E, E+N], cambio de plan/duración cuenta (D-05).

| Option                          | Description                              | Selected |
| ------------------------------- | ---------------------------------------- | -------- |
| Cuenta sin límite de cuán antes | Cualquier continuidad que arranque ≤ E+N | ✓        |
| Con tope de anticipación        | Solo dentro de X días antes de E         |          |
| Vos decidís                     | —                                        |          |

**User's choice (anticipada):** Cuenta sin límite de cuán antes (D-06).

---

## N (churn) vs corte 15d (renovación/reactivación)

| Option                              | Description                                          | Selected |
| ----------------------------------- | ---------------------------------------------------- | -------- |
| Sí, una única ventana (default 15d) | Define churn@15 y renovado; multi-N solo comparativo | ✓        |
| Independientes                      | Churn N y renovación 15d por separado                |          |
| Vos decidís                         | —                                                    |          |

**User's choice (N vs 15d):** Una única ventana, default 15d (D-07).

| Option                           | Description                               | Selected |
| -------------------------------- | ----------------------------------------- | -------- |
| Queda churneada (no se revierte) | Volver después = reactivación (futuro)    | ✓        |
| Se revierte si vuelve alguna vez | Número inestable, mezcla con reactivación |          |
| Vos decidís                      | —                                         |          |

**User's choice (reactivación):** Queda churneada, no se revierte (D-08).

---

## Edge multi-vencimiento + métricas viejas

| Option                          | Description                                         | Selected |
| ------------------------------- | --------------------------------------------------- | -------- |
| Su ÚLTIMO vencimiento del rango | Refleja estado actual; garantiza personas distintas | ✓        |
| Su PRIMER vencimiento del rango | Más pesimista, menos representativo                 |          |
| Vos decidís                     | —                                                   |          |

**User's choice (multi-venc):** Último vencimiento del rango (D-04).

| Option                            | Description                                                  | Selected |
| --------------------------------- | ------------------------------------------------------------ | -------- |
| Coexistir y retirar en fase de UI | Endpoints nuevos al lado; viejas deprecadas sin romper admin | ✓        |
| Eliminar las viejas ahora         | Cumple criterio literal; deja huecos en admin                |          |
| Vos decidís                       | —                                                            |          |

**User's choice (métricas viejas):** Coexistir y retirar en fase de UI (D-09 — desvío consciente del Success Criterion #1, satisfecho a nivel milestone).

---

## Claude's Discretion

- Shape exacto de salida (multi-N lado a lado, marca de provisorios) reusando helpers nominal+%+n de la Fase 120.
- Valores default del set multi-N comparativo y nombre del parámetro de ventana.
- Extraer o no el motor de cohorte por end_date como helper compartido.
- Granularidad de la serie histórica y cómputo de `en_gracia` para el número vivo.
- Detección de continuidad por filas de subscriptions vs pagos (se prefiere filas).

## Deferred Ideas

- Eliminación física de las métricas viejas → fase de UI del admin.
- Reactivación como métrica propia → futuro.
- Ajuste de endDate efectivo por pausa → descartado por ahora.
- LTV / Kaplan-Meier → Fase 122.
