# Phase 135: Árbol del admin — jerarquía visual de hitos y variantes en /tree-map - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 135-rbol-del-admin-jerarqu-a-visual-de-hitos-y-variantes-en-tree
**Areas discussed:** Validar heurística, Estrategia de poblado, Camino a producción, Render jerárquico

---

## Validar heurística

| Option                           | Description                                                                                                     | Selected |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Sí, dry-run obligatorio          | Flag --dry-run imprime el plan completo sin escribir; usuario revisa Front Lever y aprueba antes del apply real | ✓        |
| No, confiar + corregir en drawer | Aplicar directo y arreglar errores en el drawer de 133                                                          |          |

**User's choice:** Sí, dry-run obligatorio
**Notes:** Caso testigo Front Lever debe revisarse en el dry-run antes de poblar.

---

## Estrategia de poblado — alcance auto

| Option                    | Description                                                                | Selected |
| ------------------------- | -------------------------------------------------------------------------- | -------- |
| Todas las propuestas      | Escribir milestone_exercise_id para toda propuesta; drawer corrige después | ✓        |
| Solo alta confianza (≥80) | Auto-aplicar solo confidence>=80; dejar 60/40 como pending para el drawer  |          |

**User's choice:** Todas las propuestas
**Notes:** Coherente con "el drawer es corrección, no carga inicial" (goal del roadmap).

## Estrategia de poblado — mecanismo de escritura + rollback

| Option                             | Description                                                                                                                            | Selected |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Aceptar propuestas (reusar accept) | Apply acepta pending transaccionalmente (status='accepted' + escribe columna); rollback por SQL; libro mayor en la tabla de propuestas | ✓        |
| Escritura directa + columna source | Agregar exercises.milestone_source vía migración; escribir directo marcando 'heuristic'                                                |          |

**User's choice:** Aceptar propuestas (reusar accept)
**Notes:** Evita una migración de schema; reusa el accept del proposal-service.

## Estrategia de poblado — idempotencia

| Option                               | Description                                                 | Selected |
| ------------------------------------ | ----------------------------------------------------------- | -------- |
| Respetar correcciones (solo pending) | Re-run solo toca pending; accepted/rejected quedan intactas | ✓        |
| Re-poblar todo (clobber)             | Cada re-run reescribe todo, pisando correcciones manuales   |          |

**User's choice:** Respetar correcciones (solo pending)

---

## Camino a producción

| Option                                 | Description                                                                                             | Selected |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Migración de datos determinística      | Dry-run+apply local, capturar UPDATEs (exercise_id→milestone_exercise_id) en .sql, aplicar vía pipeline | ✓        |
| CLI bootstrap+apply en prod (pipeline) | Pipeline corre el CLI contra el catálogo real de prod                                                   |          |
| Migración por clave natural (nombre)   | UPDATEs keyeados por nombre de ejercicio para sobrevivir drift de IDs                                   |          |

**User's choice:** Migración de datos determinística (por exercise_id)
**Notes:** Riesgo anotado: verificar paridad de catálogo local↔prod (mismos IDs). Si divergen, fallback a clave natural (la opción 3 queda como plan B condicional).

---

## Render jerárquico — layout

| Option                               | Description                                                                                               | Selected |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------- |
| Colapsable sobre layout actual       | Reusar canvas Vue Flow de bandas; nodo hito gana toggle expand/collapse (patrón chevron de RouteFlowNode) | ✓        |
| Rediseño skill-tree (Vue Flow grafo) | Layout de grafo con aristas hito→variante (el diferido de 133/134)                                        |          |

**User's choice:** Colapsable sobre layout actual
**Notes:** Skill-tree queda diferido, igual que en 133/134.

## Render jerárquico — estado inicial + endpoint

| Option                                       | Description                                                                                                                     | Selected |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Colapsado por defecto + variantes en payload | Endpoint devuelve variants[] (query aparte, no toca backboneNodeConditions); hito arranca colapsado con contador "+N variantes" | ✓        |
| Expandido por defecto                        | Mismo payload pero variantes expandidas de entrada                                                                              |          |

**User's choice:** Colapsado por defecto + variantes agrupadas en payload
**Notes:** Mantiene el canvas limpio en rutas largas; el predicado compartido no se modifica (sin regresión en member-tree/getNeighbor/rebuild).

---

## Claude's Discretion

- Visuales finos del nodo variante (color de banda + dl, orden por dl), chip "+N variantes", toggle.
- Ubicación del helper de apply (extender proposal-service vs script CLI).
- Forma exacta del payload `variants[]`.

## Deferred Ideas

- Rediseño skill-tree (layout de grafo Vue Flow) → fase aparte.
- Auto-aplicar por umbral de confianza (≥80) → descartado para esta fase.
- Columna `milestone_source` en exercises → evitada (audit trail en tabla de propuestas).
