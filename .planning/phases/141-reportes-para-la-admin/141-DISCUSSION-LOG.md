# Phase 141: Reportes para la admin - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 141-Reportes para la admin
**Areas discussed:** Estructura/navegación, Bandeja de pendientes, Saldo por caja, Umbral de alerta

---

## Estructura / navegación

| Option                                   | Description                                                                                | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Pestañas en /caja (hub), bandeja landing | /caja reorganizada en pestañas: Pendientes (landing) / Saldos / Movimientos / Mov-Egresos. | ✓        |
| Páginas nuevas separadas                 | Dejar /caja y agregar rutas/páginas nuevas.                                                |          |
| Mix (caja + /reportes)                   | Bandeja+saldos en /caja; historial en /reportes.                                           |          |

**User's choice:** Pestañas en /caja (hub), bandeja de pendientes como landing.
**Notes:** Todo es una superficie operativa (la caja) → pestañas más coherente que páginas sueltas. Bandeja de pendientes como landing = el control diario primero. Reusa CajaPage v4.8 (summary+tabla+export), reacomodada.

---

## Bandeja de pendientes (control diario)

| Option                                           | Description                                                                                                | Selected |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------- |
| Validar prominente + menú, observados con filtro | Lista por antigüedad; Validar a un toque + menú (Observar/Corregir/Anular); observados con badge + filtro. | ✓        |
| Todas las acciones visibles por fila             | Los 4 botones por fila, sin menú.                                                                          |          |
| Fila → detalle con acciones                      | Fila resumen → panel detalle con acciones.                                                                 |          |

**User's choice:** Validar prominente + menú, observados con filtro.
**Notes:** El camino rápido (validar) a un toque; las acciones raras (observar/corregir/anular) en menú "⋮". Observados en la misma bandeja con badge + filtro Pendientes/Observados/Todos. Anular → popup membresía 1-a-1 (137 D-10); corregir = anular+recrear (137 D-05). Reusa endpoints 137. Filas vencidas (umbral) con alerta visual.

---

## Saldo por caja

| Option                             | Description                                                                                            | Selected |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| Cards por caja, agrupadas por tipo | Secciones Efectivo sucursales / Central / Banco; card con firme+pendiente+moneda; subtotal por moneda. | ✓        |
| Tabla de cajas                     | Filas=cajas, columnas=firme/pendiente/moneda.                                                          |          |
| Agrupado por moneda                | Sección ARS + sección EUR.                                                                             |          |

**User's choice:** Cards por caja, agrupadas por tipo.
**Notes:** Cards visuales para vistazo rápido; agrupar por tipo refleja cómo se piensa la caja; moneda siempre al lado + subtotal solo por moneda → imposible mezclar ARS+EUR. Necesita endpoint REST nuevo de saldos (getBalance 138 quedó como método de servicio).

---

## Umbral de alerta de pendientes

| Option                              | Description                                         | Selected   |
| ----------------------------------- | --------------------------------------------------- | ---------- |
| Default 7 días, configurable en 142 | Umbral hard-codeado 7 días en 141; editable en 142. |            |
| Otro default (ej: 3 días)           | Mismo enfoque, otro número.                         | ✓ (3 días) |
| Configurable ya en 141              | Adelantar la config del umbral a 141.               |            |

**User's choice:** 3 días, configurable en 142.
**Notes:** Umbral default 3 días hard-codeado en 141 (la alerta funciona ya: color/badge en filas vencidas + contador arriba). Editable por la admin = fase 142 (la casa de config; 136-07 borró settings, 142 lo reconstruye). 141 solo consume el umbral (constante; si 142 lo persiste, 141 lo lee). Como la lista está ordenada por antigüedad, los vencidos quedan arriba.

## Claude's Discretion

- Forma de los endpoints read nuevos (bandeja/saldos/historial) + reuso de TransactionListFilters.
- Cómo se computa "antigüedad" (server vs front).
- Componentes Quasar de las pestañas (q-tabs/q-table/q-card existentes) — se fija en UI-SPEC.
- Qué reportes exportan y en qué formato (Excel/PDF).
- Umbral como constante compartida (para que 142 lo reemplace sin tocar UI).

## Deferred Ideas

- Umbral configurable por la admin → fase 142.
- Config / regla Contabilium → fase 142.
- Métricas v5.0 (UI diferida) → otro frontend, fuera del milestone.
