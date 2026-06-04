# Phase 124: Estructura de datos de las 3 dimensiones + saneo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 124-Estructura de datos de las 3 dimensiones + saneo
**Areas discussed:** Modelado de las 3 dimensiones, Duplicados/sin ruta, Vocabulario de sub-familias, Estrategia de saneo sobre prod

---

## Modelado de las 3 dimensiones

| Option                     | Description                                                                          | Selected      |
| -------------------------- | ------------------------------------------------------------------------------------ | ------------- |
| Híbrido                    | Sub-familia = tabla catálogo; palanca = enum/lookup ordenado; contracción = `effort` | ✓ (reformado) |
| Todo columnas en exercises | 3 columnas nuevas, sub-familia como texto                                            |               |
| Todo tablas catálogo       | Las 3 dimensiones como lookup con FK                                                 |               |

**User's choice:** Híbrido, pero reformado tras una pregunta clave de Franco: "lo de tuck → adv tuck aplica a algunos ejercicios, ¿cómo se representaría en otros que no lo tienen?"
**Notes:** La pregunta desarmó "palanca = enum global". Se acordó que la palanca no es universal en valores, solo en rol; el orden real vive en la cadena de la sub-familia (`dificultadLineal`), y palanca pasa a ser atributo opcional/nullable. Franco pidió analizar las fases 125-131 antes de lockear → análisis cross-fase confirmó compatibilidad y afiló 126 (orden por `dificultadLineal`, no por enum palanca). Lockeado: sub-familia = tabla catálogo; contracción = `effort`; palanca = atributo nullable; orden por `dificultadLineal`.

---

## Duplicados y rutas faltantes

| Option                | Description                                                                 | Selected |
| --------------------- | --------------------------------------------------------------------------- | -------- |
| Solo dupes exactos    | Mismo nombre+dl+ruta+effort = dupe; mismo ej. en distinto nivel se preserva | ✓        |
| Colapsar por nombre   | Un nodo por nombre, nivel/dl como propiedad                                 |          |
| Lo definen los profes | 124 solo detecta/reporta, profes deciden en 128                             |          |

**User's choice:** Solo dupes exactos.

| Option (sin ruta)     | Description                                                     | Selected |
| --------------------- | --------------------------------------------------------------- | -------- |
| Asignar ruta          | 124 detecta y marca; LLM propone (125) + profes confirman (128) | ✓        |
| Cuarentena            | Fuera-de-árbol, bandeja admin, no bloquea                       |          |
| Asignar a mano en 124 | Resolver las ~103 manualmente ahora                             |          |

**User's choice:** Asignar ruta (detectar en 124, proponer/confirmar en 125/128).

| Option (dupes/FK)              | Description                                                | Selected |
| ------------------------------ | ---------------------------------------------------------- | -------- |
| Soft-merge por puntero         | `canonical_exercise_id` self-FK, sin deletes, FKs intactas | ✓        |
| Solo detectar y reportar       | 124 marca, fusión real en 128                              |          |
| Merge con re-apuntado + delete | UPDATE FKs + DELETE dupes                                  |          |

**User's choice:** Soft-merge por puntero.
**Notes:** Verificado que `exercises.id` lo referencian `session_prescriptions.exercise_id` y `program_content_blocks.exercise_id` → delete orfanaría histórico.

---

## Vocabulario de sub-familias

| Option                         | Description                                                             | Selected |
| ------------------------------ | ----------------------------------------------------------------------- | -------- |
| LLM propone, profes normalizan | Bottom-up; LLM (125) → catálogo → profes (128); + paso de normalización | ✓        |
| Semilla + LLM propone nuevas   | Lista corta de familias conocidas + LLM marca nuevas                    |          |
| Lista cerrada curada           | Profes definen lista completa, LLM solo mapea                           |          |

**User's choice:** LLM propone, profes normalizan. Consistente con la decisión de diseño previa (no esperar curaduría).

---

## Estrategia de saneo sobre prod

| Option                      | Description                                                                  | Selected |
| --------------------------- | ---------------------------------------------------------------------------- | -------- |
| Aditivo, `position` intacto | Columnas/tablas nuevas, position legacy, reversible/idempotente, sin pérdida | ✓        |
| Reescribir in-place         | Migrar y descartar position original                                         |          |

**User's choice:** Aditivo, `position` intacto.

## Claude's Discretion

- Nombres/tipos concretos de columnas y tablas, enum vs varchar para `leverage`, índices — a definir en planificación.
- Si la normalización de `effort` (≈30% no limpio) entra en 124 o se difiere.

## Deferred Ideas

- Inconsistencia del doc (jerarquía palanca→contracción vs ADJUST-02 preserva contracción) → resolver en discuss de 126/131.
- `category` (fina) vs `pattern` (gruesa) para agrupación visible → diferido a 127.
- Eje transversal estático/dinámico como atributo/filtro → confirmar con profes en 127.
- Población de dimensiones + normalización de nombres de sub-familia → es 125.
