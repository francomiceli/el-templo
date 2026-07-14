# Phase 161: Núcleo — actividades gateadas, pase mensual y enforcement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 161-Núcleo — actividades gateadas, pase mensual y enforcement
**Areas discussed:** Ciclo de vida socio↔pase, Consumo y reglas de reserva, Externo: estado y alta, Datos de lanzamiento (+ profundización de métricas)

---

## Ciclo de vida socio↔pase

| Option                         | Description                                                                         | Selected |
| ------------------------------ | ----------------------------------------------------------------------------------- | -------- |
| Al asignar Y al renovar        | Cada cobro re-verifica presencial activo; si dejó de ser socio se ofrece el Externo | ✓        |
| Solo al asignar la primera vez | Más simple pero rompe el precio diferencial                                         |          |

| Option                                 | Description                               | Selected |
| -------------------------------------- | ----------------------------------------- | -------- |
| Sigue usable hasta su vencimiento      | Ya pagó el mes; re-evaluación al renovar  | ✓        |
| Se bloquea hasta renovar el presencial | Más estricto, más fricción y lógica extra |          |

| Option                            | Description                                  | Selected |
| --------------------------------- | -------------------------------------------- | -------- |
| 30 días desde la compra (rolling) | Igual que todos los planes (durationDays=30) | ✓        |
| Mes calendario                    | Requiere mecánica de períodos nueva          |          |

---

## Consumo y reglas de reserva

| Option                                       | Description                                                                    | Selected |
| -------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Check-in + reserva valida saldo comprometido | Patrón actual; no se compromete una 3ª clase con 2 reservadas; cancelar libera | ✓        |
| Descuento a la reserva                       | Rompe el patrón existente                                                      |          |

| Option                     | Description                                           | Selected |
| -------------------------- | ----------------------------------------------------- | -------- |
| Mezclables sin restricción | 2 en cualquiera, incluso la misma (literal del audio) | ✓        |
| Máximo 1 por actividad     | Contradice el audio                                   |          |

| Option                            | Description                                                   | Selected |
| --------------------------------- | ------------------------------------------------------------- | -------- |
| Ventana extendida para especiales | Reservable dentro del período del pase; lista de espera igual | ✓        |
| Mismos +2 días que el resto       | No permite planificar el mes                                  |          |

| Option                 | Description                                               | Selected |
| ---------------------- | --------------------------------------------------------- | -------- |
| Staff bypass con aviso | Consistente con bypass existente; advertencia confirmable | ✓        |
| Gating duro para todos | Sin válvula de escape                                     |          |

---

## Externo: estado y alta

| Option                              | Description                                                    | Selected                           |
| ----------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| Sí, activo                          | recomputeUserStatus sin cambios; distinguible por planCategory | ✓ (revisado después, ver Métricas) |
| Estado/flag propio para 'solo pase' | Scope grande en consumidores de userStatus                     |                                    |

| Option                            | Description                                 | Selected |
| --------------------------------- | ------------------------------------------- | -------- |
| No — pases excluidos de referidos | 'especial' no cualifica ni recibe descuento | ✓        |
| Sí, aplican normal                | Abarata un precio ya diferencial            |          |

| Option                                 | Description                             | Selected |
| -------------------------------------- | --------------------------------------- | -------- |
| Alta normal de alumno + pase           | Alta existente o freemium self-register | ✓        |
| Flujo de alta específico para externos | Scope nuevo innecesario                 |          |

---

## Datos de lanzamiento

| Option                                            | Description                                              | Selected |
| ------------------------------------------------- | -------------------------------------------------------- | -------- |
| Planes por migración, actividades/slots por admin | Patrón fase 98 para planes; Nacho carga horarios por ABM | ✓        |
| Todo por migración                                | Horarios aún sin definir                                 |          |

| Option                                    | Description                                            | Selected |
| ----------------------------------------- | ------------------------------------------------------ | -------- |
| Placeholder editable, confirmar con Nacho |                                                        |          |
| Ya sé el nombre (Other)                   | **"Open Gym"** ("OpenShin" era error de transcripción) | ✓        |

| Option                    | Description                     | Selected |
| ------------------------- | ------------------------------- | -------- |
| Solo AR/ARS               | Audios solo en pesos; sedes MdP | ✓        |
| AR + ES desde el arranque | No hay operación en BCN         |          |

---

## Métricas (profundización pedida por el usuario sobre "externo = activo")

El usuario señaló que contar pases como "activos" ensucia métricas (gente activa que paga mucho menos). Se profundizó:

| Option                                      | Description                                                                             | Selected |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Excluir 'especial' de métricas de membresía | Filtrar en miembros activos, altas/bajas, churn, LTV, ticket promedio; plata sí en caja |          |
| Excluir + línea propia en analíticas        | Lo mismo + contador de suscripciones especiales activas (socio/externo)                 | ✓        |
| Estado de usuario propio ('pase')           | Scope grande y frágil                                                                   |          |

**Notes:** El usuario pidió aclarar el término "pase" (jerga interna = suscripción a plan de categoría `especial`; la palabra viene del propio audio de Nacho). Decisión de naming derivada: en analíticas y superficies visibles la solapa/etiqueta se llama **"Especiales" / "Planes especiales"**, nunca "pases".

---

## Claude's Discretion

- Nombre del flag en `activities` y del código de error tipado.
- Forma del budget mensual explícito en el schema de planes.
- Nombres exactos de los 2 planes (sugerencia "Actividades con Aura — Socio/Externo").
- Ubicación del contador "Especiales" (161 vs 162).

## Deferred Ideas

- Reparto con montos calculados por profe (REP-F1) — regla de reparto aún verde.
- Compra del pase in-app con gateway (APP-F1) — v6.0+.
- Pases para España — cuando exista la operación.
