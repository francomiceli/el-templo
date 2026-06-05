# Phase 126: Auto-construcción del grafo (DAG) - Discussion Log

> **Audit trail only.** Decisiones canónicas en CONTEXT.md.

**Date:** 2026-06-04
**Phase:** 126-auto-construcción del grafo (DAG) de progresiones
**Areas discussed:** Identidad del nodo, Aristas, Persistencia, Primitiva vecino

---

## Identidad del nodo

| Option                                       | Description                                   | Selected |
| -------------------------------------------- | --------------------------------------------- | -------- |
| Ejercicio canónico, agrupado por sub-familia | Nodo = fila exercises; subfamily = contenedor | ✓        |
| Escalón de sub-familia (subfamily×step)      | Celda que agrupa equivalentes                 |          |

**User's choice:** Ejercicio canónico. Encaja con swap de 131 + exercise-fallback.ts.

---

## Aristas (cuánto auto-deriva 126)

| Option                           | Description                                  | Selected |
| -------------------------------- | -------------------------------------------- | -------- |
| Cadenas lineales por sub-familia | 126 backbone lineal; profes ramifican en 128 | ✓        |
| Inferir también cross-edges      | Heurística especulativa                      |          |

**User's choice:** Cadenas lineales (por subfamily × effort, ver vecino); cross-edges en 128.

---

## Persistencia del grafo

| Option                           | Description                                            | Selected |
| -------------------------------- | ------------------------------------------------------ | -------- |
| Tabla de aristas source-tagged   | `exercise_progressions` (from/to, source=auto\|manual) | ✓        |
| Computado on-the-fly + overrides | Backbone fresco + capa de overrides                    |          |

**User's choice:** Tabla `exercise_progressions`. 126 popula auto, 128 muta manual, re-correr regenera auto sin pisar manual.

---

## Primitiva "vecino" (resolución de la inconsistencia del doc)

| Option                                | Description                                       | Selected |
| ------------------------------------- | ------------------------------------------------- | -------- |
| Fija contracción (alineado ADJUST-02) | Vecino = mismo effort dentro de subfamily, por dl | ✓        |
| Cruza contracción (jerarquía doc)     | Siguiente por dl sin importar effort              |          |

**User's choice:** Fija contracción. Preserva la prescripción del bloque. Backbone se encadena por (subfamily × effort). Resuelve la inconsistencia a favor de ADJUST-02.

## Claude's Discretion

- Nombres/tipos/índices de `exercise_progressions`; firma de la primitiva vecino; nº de migración (~0139); cómo tratar pendientes (excluir del grafo hasta confirmar).

## Deferred Ideas

- Cross-edges/ramificación → 128.
- Cruzar contracción → posible arista manual en 128, no automática.
- Inferencia heurística de cross-edges → descartada.
- % UI (127), editor (128), botones (131) → otras fases.
