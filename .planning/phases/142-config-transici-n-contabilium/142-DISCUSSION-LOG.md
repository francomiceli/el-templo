# Phase 142: Config + transición Contabilium - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 142-Config + transición Contabilium
**Areas discussed:** Qué perillas son reales, La casa de config, Corte + transición Contabilium (MIG-02)

---

## Qué perillas son reales

| Option              | Description                                                                                                        | Selected |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| Solo el umbral      | Única perilla = umbral de pendientes. Validación queda "todos", activación "instantánea". Aperturas por migración. | ✓        |
| Umbral + alguna más | Alguna de validación/activación/aperturas también.                                                                 |          |

**User's choice:** Solo el umbral.
**Notes:** Franco preguntó "no entiendo las otras perillas, qué pasa si no hay perillas?" — se explicó: sin perilla cada cosa queda en su comportamiento actual (validar todos, activar al instante), que es lo correcto. "Solo dudosos" necesita reglas automáticas futuras (sin valor hoy); "diferida" sería mala UX (socio no entrena hasta validar). Aperturas = carga única por migración, no perilla. Recorte de scope especulativo del brief (lección cobro suelto). Solo el umbral es real.

---

## La casa de config

| Option                                | Description                                                                                        | Selected |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Mini pantalla "Configuración de Caja" | Página de config dedicada (owner/admin), reusa system_settings, hoy un campo (umbral), extensible. | ✓        |
| Inline en el hub de Caja              | Umbral con engranaje dentro del tab Pendientes, sin pantalla aparte.                               |          |

**User's choice:** Mini pantalla "Configuración de Caja".
**Notes:** Reusar `system_settings` (key-value global existente; la 136-07 borró el módulo settings, NO la tabla). Setting `finance.pending_overdue_days` (default 3, migración 0157). El seam OVERDUE_DAYS (141) pasa a leer de system_settings con fallback 3. Mini pantalla dedicada = "la casa" que pide MIG-01, extensible. Config global (no por sucursal). Patrón espejo de getStreakMilestoneConfig.

---

## Corte + transición Contabilium (MIG-02)

| Option                                  | Description                                                                     | Selected      |
| --------------------------------------- | ------------------------------------------------------------------------------- | ------------- |
| Corte limpio único (todas el mismo día) | Un día X, todas las sucursales arrancan en el Admin.                            | (recomendado) |
| Escalonado por sucursal                 | Cada sucursal su propia fecha.                                                  |               |
| Lo defino después                       | Documentar regla + mecanismo de apertura; la fecha la decide Franco al go-live. | ✓             |

**User's choice:** Lo defino después.
**Notes:** MIG-02 = documento "qué dato manda" (Admin = ingresos+caja desde el corte; Contabilium = solo AFIP, fuera de scope) + criterio de corte limpio (cajas arrancan en apertura, sin backfill — 138 ya) + mecanismo de carga de aperturas por migración al go-live. La fecha/estrategia de corte concreta la define Franco al go-live (142 no la fija). Recomendación documentada: corte único limpio, pero a criterio de Franco. Aperturas por migración (no UI).

## Claude's Discretion

- Estructura del setting + helper de lectura con fallback.
- Dónde vive el doc MIG-02 (.docs/ vs .planning/).
- REST shape del endpoint config + la mini pantalla Quasar.
- Si la mini pantalla necesita UI-SPEC formal (un campo numérico → probablemente mínimo).
- Forma del template de migración de aperturas (placeholder a completar al go-live).

## Deferred Ideas

- Perilla validación (todos/dudosos) + reglas automáticas → futuro.
- Perilla activación (instant/diferida) → descartada.
- Pantalla de edición de aperturas → no (migración).
- Scoping por sucursal → no (global).
- AFIP/ARCA → último escalón, fuera del milestone.
