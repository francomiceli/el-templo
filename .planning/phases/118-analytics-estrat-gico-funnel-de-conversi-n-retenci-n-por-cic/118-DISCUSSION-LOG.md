# Phase 118: Analytics estratégico — funnel de conversión + retención por ciclos + caja vs devengado - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic
**Areas discussed:** Funnel data histórica, Retención gap + reactivaciones, Devengado edge cases + ARPU, Presentación de los 3 tableros

---

## Funnel: data histórica incompleta

| Option                          | Description                                                                                                                | Selected |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| Funnel completo + caveat visual | Aproximar 'activo' histórico con MIN(subscriptions.created_at), con banner de caveat; cohortes nuevas confiables (ramp-up) | ✓        |
| Sólo cohortes confiables        | Forward-only puro; nada pre-deploy                                                                                         |          |
| Funnel completo sin caveat      | Aproximación sin marcar imprecisión                                                                                        |          |

**User's choice:** Funnel completo + caveat visual
**Notes:** Coherente con la filosofía de "representatividad honesta > número bonito" de la 117.

---

## Retención: gap + reactivaciones

| Option                           | Description                                                               | Selected |
| -------------------------------- | ------------------------------------------------------------------------- | -------- |
| Corta racha, no reinicia cohorte | Gap >30d termina la racha; reactivación cuenta aparte, no infla retención | ✓        |
| Abre nueva cohorte               | Miembro reaparece como ciclo 1 en mes de reactivación                     |          |
| Ignora el gap                    | Trata cualquier sub siguiente como ciclo consecutivo                      |          |

**User's choice:** Corta racha, no reinicia cohorte
**Notes:** Gap default 30d configurable como constante exportada del domain service (no env, no columna DB).

---

## Devengado: edge cases + ARPU

| Option                            | Description                                                                 | Selected |
| --------------------------------- | --------------------------------------------------------------------------- | -------- |
| Ventana real start_date..end_date | price_paid × (días-en-mes ÷ días-totales-start..end); captura cancelaciones | ✓        |
| Prorrateo por duration_days fijo  | Literal a la propuesta; ignora cancelaciones tempranas                      |          |

**User's choice:** Ventana real start_date..end_date
**Notes:** Researcher confirma si cancelar/refund actualiza end_date. null/0/end<start se excluyen con caveat. ARPU denom = activos del mes vía activeMemberExists, por moneda.

---

## Presentación de los 3 tableros

| Option                                 | Description                               | Selected |
| -------------------------------------- | ----------------------------------------- | -------- |
| Tab nueva 'Estratégico' (los 3 juntos) | Una tab con funnel + retención + finanzas |          |
| Repartir en tabs existentes            | Finanzas dentro de FinanzasTab            |          |
| 3 tabs nuevas separadas                | Una tab por tablero                       | ✓        |

**User's choice:** 3 tabs nuevas separadas (Funnel / Retención / Finanzas avanzadas) en AnaliticasPage, admin-only, con chart.js + vue-chartjs ya instalados.
**Notes:** No engordar FinanzasTab/MiembrosTab. Además: tarea decidida de borrar las 2 cards de engagement por segmento de AsistenciaTab (NOTES-FROM-117 §🗑️).

---

## Claude's Discretion

- Forma de los endpoints (1 por tablero vs agrupados), shape de tipos de respuesta, estructura
  interna de los domain services, queries SQL concretas, detalles finos de visualización.

## Deferred Ideas

- Propuestas #3/#5 ya implementadas en 117.
- Tracking "habló con coach" (117 D-16).
- Cron de reparación de users.status (117 D-03).
- Split de analytics/service.ts → v4.9.
- Clasificador de segmentación plan-aware para AlumnosPage/Notificaciones.
- Reconstrucción precisa de historial pre-2026-05-26.
