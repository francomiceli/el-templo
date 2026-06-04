# Phase 123 — Discussion Log

**Date:** 2026-06-04
**Mode:** discuss (default)
**Areas discussed:** 4/4 (todas las gray areas seleccionadas)

> Registro humano de la discusión (auditoría/retro). NO lo consumen los agentes downstream — esos leen CONTEXT.md.

## Pregunta del usuario (fuera de gray areas)

- **"¿En qué parte de este milestone se trabajó la UI para los admin?"** → Respuesta: en NINGUNA. v5.0 es backend-first (fases 120-123 = servicios+endpoints+tests). La UI del panel de gestión es una fase de frontend POSTERIOR, fuera del milestone. D-09 (fase 121) y la deprecación de ARPU (fase 122) dejan las métricas viejas presentes justamente para no romper el dashboard actual hasta esa fase de UI.

## Área 1 — FREQ-06: alcance del batch de segmentación

- **Opciones:** A) refactor completo · B) diferir refactor · C) intermedio
- **Hallazgo decisivo (scout):** el batch nightly YA existe (`notification-cron.ts`, 03:00 AR, bypassea cooldown). El caveat #8 ya está en gran parte resuelto.
- **Elección:** **C) Intermedio** — frecuencia como un insumo más del batch existente, sin reescribir el login-recalc. → D-123-01.

## Área 2 — FREQ-05: mapeo banda↔segmento

- **Opciones:** A) mapeo conservador completo · B) solo caso de oro · C) diferir todo
- **Elección:** **B) Solo el caso de oro** — activo con 0 visitas / enfriándose → `en_riesgo` (umbral en system_settings). Mapeo fino multi-banda diferido al dueño del módulo. → D-123-02.

## Área 3 — Funnel: qué cuenta como asistió/compró

- **Opciones (asistió):** bookings.status · tabla attendance · ambas
- **Hallazgo decisivo (scout):** el check-in QR exige sub activa; trials no la tienen → no generan fila en attendance.
- **Elección:** **bookings.status IN (qr_escaneado, confirmado)**. → D-123-07. Reservó = todos los trial bookings de lead nuevo; compró = primera sub paga ≤21d; lead nuevo = sin sub paga previa. → D-123-08/09/10.

## Área 4 — Funnel: breakdown por turno + ventana

- **Opciones (turno):** A) mañana/tarde/noche · B) hora exacta · C) diferir
- **Aclaración del usuario:** turnos reales = mañana 07:00–10:00 y tarde 17:00–20:00, en hora local de cada sede.
- **Elección:** **A) bandas**, con cortes concretos mañana 07–10 / tarde 17–20 (TZ de la sede) + fallback "otro". → D-123-13. Ventana de atribución 21d configurable. → D-123-12.

## Deferred

- Mapeo fino multi-banda↔segmento; refactor completo de segmentación; UI de admin; reactivación como métrica propia.
