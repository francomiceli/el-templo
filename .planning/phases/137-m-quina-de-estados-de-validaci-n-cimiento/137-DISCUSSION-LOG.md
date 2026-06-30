# Phase 137: Máquina de estados de validación (cimiento) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 137-Máquina de estados de validación (cimiento)
**Areas discussed:** Alcance UI vs backend-only, Config / perillas, Tabla de eventos de validación, Semántica OBSERVADO→CORREGIDO

---

## Alcance UI vs backend-only

| Option                          | Description                                                                                              | Selected |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| Backend-only puro               | Schema + helper canónico + endpoints validar/observar/anular + tests de regresión. UI en fase posterior. | ✓        |
| Backend + UI mínima de acciones | Además del backend, UI básica para validar/observar/anular a mano.                                       |          |

**User's choice:** Backend-only puro.
**Notes:** Franco preguntó si v5.2 tendría UI de acciones y advirtió "no construir cosas que ya están en v5.0". Se verificó contra el roadmap: la UI de validación (bandeja + botones) es la **fase 141**; carga única del profe = 140; cajas/saldos = 138/139; perillas de config = 142. v5.0 (Métricas) fue backend-only, así que no hay UI de v5.0 que pisar; la única UI existente es CajaPage (v4.8), que el milestone extiende en 140/141. Construir UI en 137 = construirla dos veces. Confirmado backend-only.

---

## Config / perillas

| Option                           | Description                                                          | Selected |
| -------------------------------- | -------------------------------------------------------------------- | -------- |
| Sin settings en 137 (hard-coded) | Comportamiento clavado en código; perillas configurables → fase 142. | ✓        |
| Settings configurables ya        | Adelantar parte de la config de validación/activación a 137.         |          |

**User's choice:** Sin settings en 137.
**Notes:** Franco no tenía modelo mental de "settings/perillas/interruptores" (lo preguntó dos veces) — señal de que no son algo que le importe para 137. Se aclaró en lenguaje llano: las "settings" serían interruptores configurables para cambiar la política sin tocar código (ej: validar-todos vs solo-dudosos, activación instantánea vs diferida). En 137 las respuestas ya están fijas en los requirements (profe→pendiente/admin→validado VAL-02; activación instantánea VAL-07), así que van hard-coded sin pantalla. La "nueva casa" de config es dueña de la fase 142.

---

## Semántica OBSERVADO→CORREGIDO (pago mal cargado)

| Option              | Description                                                               | Selected |
| ------------------- | ------------------------------------------------------------------------- | -------- |
| Observar → corregir | Dos pasos: marcar observado, luego corregir (anular+recrear).             |          |
| Corregir directo    | Un solo paso: corregir = anular+recrear de una, sin "observado".          |          |
| Las dos, ella elige | Puede observar (flaguear para después) O corregir directo, según el caso. | ✓        |

**User's choice:** Las dos, ella elige.
**Notes:** Franco pidió recomendación; se recomendó "las dos" porque los estados `observado`/`corregido` ya están lockeados en el enum, cada uno mapea a una situación real (sabe el dato correcto → corrige; no lo sabe / pregunta al profe → observa), no agrega scope (el costo de UI es de la 141), y hace útil la bandeja de la 141 (observados = problemas sin resolver, corregidos = resueltos con rastro). Mecánica fijada: corregir = anular+recrear (nunca UPDATE); vieja → void + `validation_status='corregido'`; nueva → `validado`; linkeadas vía `transaction_links` (`target_kind='transaction'`).

---

## Tabla de eventos de validación (rastro)

| Option                | Description                                                                                           | Selected |
| --------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Sí, historia completa | Cada transición deja rastro (autor+fecha+motivo); reusar mecanismo de auditoría existente (fase 111). | ✓        |
| Solo lo mínimo        | Registrar solo lo imprescindible (ej: solo anulaciones, como hoy).                                    |          |

**User's choice:** Sí, historia completa.
**Notes:** Es un libro de caja → "nunca se borra, siempre rastro". Se recomendó reusar `audit-log` (fase 111, que `void()` ya usa) agregando action types nuevos (validado/observado/corregido) en vez de crear tabla dedicada — DRY y consistente. La elección final audit-log vs tabla `validation_events` queda como discreción de Claude/researcher según cómo la bandeja 141 consulte el historial.

## Claude's Discretion

- Estructura interna del helper canónico de "dinero firme" y dónde vive en el módulo finance.
- `audit-log` reutilizado vs tabla dedicada de eventos de validación (según necesidad de la bandeja 141).
- Forma exacta (REST shape, naming) de los endpoints siguiendo convenciones del módulo finance.
- Cómo `correct()` arma la transacción nueva (copia + override) dentro de una transacción DB atómica.

## Deferred Ideas

- Perillas configurables de política (validar-todos vs dudosos, activación instantánea vs diferida) → fase 142.
- Bandeja de pendientes + botones validar/observar/anular (UI) → fase 141.
- Popup de decisión de membresía al anular (UI) → fase posterior; en 137 solo el contrato backend `keepMembershipActive`.
- Entidad caja + asociación pago↔caja → fase 138.
- Regla "qué dato manda" durante convivencia con Contabilium → fase 142.
