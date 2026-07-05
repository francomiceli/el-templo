# Phase 156: Planes de pago vs Rutinas de entrenamiento - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-07-05
**Phase:** 156-Planes de pago vs Rutinas de entrenamiento
**Mode:** `--auto` — usuario ausente, autorizó opción recomendada.
**Areas (auto):** Separación de nombres/superficie, Zero a config, Multi-programa, Garantía de precio histórico

---

## Separación Planes de pago / Rutinas (PLAN-01)

[auto] Q: "¿Rename de qué profundidad?" → Selected: **labels de superficie (nav + títulos), rutas y código intactos** (recommended). Alternativa: renombrar rutas/identificadores (churn sin valor, riesgo de links rotos).

[auto] Q: "¿Cómo se gatea Rutinas?" → Selected: **flag de superficie Templo (patrón TEMPLO_GREEK_LEVELS) además del dueño-only de 149** (recommended). Alternativa: dejar solo dueño-only (no cumple "subcategoría gateada como Templo").

## Zero a config (PLAN-02)

[auto] Q: "¿Mecanismo?" → Selected: **key `pricing.zero_price_enabled` en el módulo settings de 154, default OFF, seed ON Templo, gate en resolvePriceType + UI** (recommended — réplica del patrón card_surcharge, incluida la lección WR-04 de renovaciones). Alternativa: borrar Zero (rompe El Templo), config por plan (granularidad no pedida).

## Multi-programa (PLAN-03)

[auto] Q: "¿Modelo de datos?" → Selected: **join table `plan_programs` + conservar `grants_all_programs` con prioridad all>lista** (recommended). Alternativa: JSON column (anti-patrón relacional), reemplazar grants_all (migración de datos innecesaria).

## Precio sin romper históricos (PLAN-04)

[auto] Q: "¿Alcance?" → Selected: **verificación + test de integración de regresión; fix solo si aparece bug** (recommended — `pricePaid` ya se copia al asignar). Alternativa: versionado de precios (sobre-ingeniería).

## Todos

[auto] `v51-milestone-data-rollout.md` (0.6) → NO incorporado (8ª vez).

## Claude's Discretion

- Naming del flag de rutinas; copy de labels; shape del multi-select; payload embebido vs endpoints propios; layout de los toggles.

## Deferred Ideas

- Rutinas por objetivos + IA (NO-MVP explícito); configuración de días del plan; regla "plan limita la app del cliente".
