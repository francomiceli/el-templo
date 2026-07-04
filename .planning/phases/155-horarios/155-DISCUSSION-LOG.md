# Phase 155: Horarios - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-07-05
**Phase:** 155-Horarios
**Mode:** `--auto` — usuario ausente, autorizó opción recomendada en cada decisión.
**Areas (auto):** Simultaneidad, Crear desde slot, Capacidad por actividad, Interacción cupo×simultaneidad

---

## Simultaneidad (HOR-01)

[auto] Q: "¿Qué solapes se permiten?" → Selected: **bloquear solo misma actividad en misma sucursal+día** (recommended). Alternativas: permitir todo solape (pierde protección contra duplicados), flag por sucursal (complejidad sin pedido).

## Crear clase desde el slot (HOR-02)

[auto] Q: "¿Cómo se crea desde la grilla?" → Selected: **click en celda vacía → dialog existente prefilleado + actividad inline** (recommended). Alternativa: página de alta separada (más fricción).

## Capacidad por actividad (HOR-03)

[auto] Q: "¿Dónde vive el cupo?" → Selected: **`activities.max_capacity` nullable, efectivo = actividad ?? sucursal** (recommended). Alternativas: cupo por slot individual (granularidad no pedida), reemplazar el cupo de sucursal (rompe datos existentes).

[auto] Q: "¿El cupo es por clase o techo del edificio?" → Selected: **por clase/slot** (recommended); techo agregado diferido.

## Todos

[auto] `v51-milestone-data-rollout.md` (0.6) → NO incorporado (7ª vez, falso positivo por keywords).

## Claude's Discretion

- Diseño de celda con múltiples clases; affordance de click-para-crear.
- Helper de cupo efectivo (naming/ubicación).
- Prefill ajustable en el dialog; validaciones del campo cupo.

## Deferred Ideas

- Techo agregado por sucursal; QR de asistencia (HOR-F1).
