# Phase 117: Analytics — correcciones de exactitud + métrica de miembros únicos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico
**Areas discussed:** Alcance (ampliación con PROPUESTAS + split en 2 fases), Predicado canónico de "activo", Historial de status, Estructura/split del service, Flags de renovación, Reuso de segmentación, Multi-moneda, Miembros únicos vs engagement

---

## Ampliación de alcance

El usuario pidió incorporar `PROPUESTAS_ANALYTICS.md` (5 propuestas profundas) además
del `FINDINGS.md` original, y reescribir el contexto acorde. Por tamaño (milestone-sized),
se acordó dividir en 2 fases.

| Option                                        | Description                                                                                                                     | Selected |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 117 Correctitud+Operativo / 118 Estratégico   | Bugs+helper activo+applyScope+user_status_history+únicos+engagement+vencimientos en 117; funnel+retención+caja/devengado en 118 | ✓        |
| 117 Fundaciones+Bugs / 118 Todas las features | 117 mínima; las 5 propuestas a 118                                                                                              |          |
| No dividir, una sola fase                     | Todo en 117 con ~8 planes                                                                                                       |          |

**User's choice:** "lo que vos recomiendes" → Opción A (recomendada).

---

## Predicado canónico de "activo" (bugs #1/#5)

| Option                                   | Description                                                                       | Selected |
| ---------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Helper EXISTS en vivo (excluye drift)    | Helper SQL compartido, analytics calcula en vivo, excluye ~48 fantasmas, sin cron | ✓        |
| Helper EXISTS + cron diario              | Igual + cron que repara users.status para otros consumidores                      |          |
| Solo cron, analytics sigue leyendo campo | Mantener users.status como fuente + cron                                          |          |

**User's choice:** "hacer lo recomendado y en lo posible no agregar más código o entidades, usar lo que hay".
**Notes:** Reforzó el criterio de mínima superficie nueva (motivó también D-12 reuso de segmentación).

---

## Historial de status (para funnel/retención de Fase 118)

| Option                              | Description                                                                 | Selected |
| ----------------------------------- | --------------------------------------------------------------------------- | -------- |
| Agregar tabla + backfill aproximado | user_status_history + hooks forward + backfill desde created_at/primera sub | ✓        |
| Sin tabla, aproximar todo           | Solo created_at + subscriptions.created_at                                  |          |
| Tabla solo forward (sin backfill)   | Sin datos históricos                                                        |          |

**User's choice:** Agregar tabla + backfill aproximado. La tabla se crea en 117 (fundación), se consume en 118.

---

## Estructura / split del service

| Option                                    | Description                                               | Selected |
| ----------------------------------------- | --------------------------------------------------------- | -------- |
| Domain services nuevos + applyScope ahora | Lo nuevo nace limpio; split del monolito existente → v4.9 | ✓        |
| Split completo del monolito ahora         | Mover todo, adelanta v4.9                                 |          |
| Todo en service.ts, split en v4.9         | Monolito de ~2000 LOC                                     |          |

**User's choice:** Domain services nuevos + applyScope ahora.

---

## Flags de renovación (panel de vencimientos #5)

| Option                                              | Description                                                         | Selected |
| --------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| Derivar de transacciones, diferir 'habló con coach' | ya pagó/no pagó de financial_transactions; habló con coach diferido | ✓        |
| Agregar campos para trackear contacto               | Schema nuevo, incluye habló con coach                               |          |
| Solo tasa + buckets, sin flags individuales         | Sin estado por miembro                                              |          |

**User's choice:** Derivar de transacciones, diferir 'habló con coach'.

---

## Umbrales de engagement → Reuso de segmentación existente

| Option                            | Description                                             | Selected |
| --------------------------------- | ------------------------------------------------------- | -------- |
| Defaults de PROPUESTAS            | engaged ≥2/7d, at-risk 0/14d, ghost 0/30d, warning <50% |          |
| Mismos segmentos, ajustar números | —                                                       |          |

**User's choice:** "no tenemos estos segmentos ya en alumnos? analizar los módulos existentes para reutilizar".
**Notes:** Análisis del codebase reveló módulo `segmentation` completo (6 segmentos en
`member_profiles.segment`, umbrales en `system_settings`, badges en AlumnosPage). Decisión:
engagement #3 REUTILIZA esos segmentos en vez de inventar umbrales nuevos (D-12). Confirmado
con "que recomendás?" → enfoque recomendado: reutilizar segmentos + KPI de únicos.

---

## Multi-moneda + plan distribution (vista owner)

| Option                                        | Description                                             | Selected |
| --------------------------------------------- | ------------------------------------------------------- | -------- |
| Separar por moneda + plan por (name, country) | Cards/series separadas ARS/EUR; 'Flex (AR)'/'Flex (ES)' | ✓        |
| Separar moneda, plan por id                   | Plan distribution por subscription_plans.id             |          |

**User's choice:** Separar por moneda + plan por (name, country).

---

## Miembros únicos vs engagement (tab Asistencias)

| Option                                     | Description                                                          | Selected |
| ------------------------------------------ | -------------------------------------------------------------------- | -------- |
| Ambas: KPI únicos arriba + segmentos abajo | KPI distinct check-ins + segmentación reutilizada + warning adopción | ✓        |
| Solo reutilizar segmentos                  | Sin KPI separado                                                     |          |
| Solo KPI únicos en 117, engagement a 118   | —                                                                    |          |

**User's choice:** "no entiendo" → se reexplicó la diferencia (cuántos vinieron vs quiénes en riesgo);
luego "que recomendás?" → enfoque recomendado: KPI de únicos + reuso de segmentos.

---

## Claude's Discretion

- Nombres exactos de domain services nuevos y firma de `applyScope`.
- Esquema exacto de `user_status_history`.
- Layout fino de la tab de Asistencias.

## Deferred Ideas

- Fase 118: funnel de conversión, retención por ciclos de plan, caja vs devengado + ARPU.
- Tracking de "habló con coach" en renovaciones (requiere schema/UI).
- Cron de reparación de `users.status` (innecesario si consumidores migran al helper).
- Split del monolito `analytics/service.ts` → v4.9.
- Migrar `reports/service.ts` y app al helper canónico de "activo".
