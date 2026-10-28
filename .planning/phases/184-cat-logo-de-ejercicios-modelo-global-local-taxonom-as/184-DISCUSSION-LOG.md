# Phase 184: Catálogo de ejercicios — modelo global/local + taxonomías - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 184-Catálogo de ejercicios — modelo global/local + taxonomías
**Areas discussed:** Alcance de la ficha, Estados en la práctica, UI y roles del ABM, Base de ejecución

---

## Alcance de la ficha

| Option                   | Description                                                                                                    | Selected |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | -------- |
| Schema completo en 184   | Una sola migración crea toda la ficha §2.2, video/imagen previstos vacíos; 185/189 solo agregan comportamiento | ✓        |
| Subset mínimo del doc 08 | Solo las columnas del doc 08; alias/variantes/alternativas con ALTER en la 185                                 |          |
| Vos decidí (Claude)      | Lo resuelve el planner con criterio de mínimo retrabajo                                                        |          |

| Option                           | Description                                                                         | Selected |
| -------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Local→global sí, global→local no | Un propio referencia globales o propios del mismo gimnasio; un global solo globales | ✓        |
| Solo dentro del mismo scope      | Globales↔globales, propios↔propios — empobrece los propios                          |          |
| Vos decidí (Claude)              | La fija el planner sin romper aislamiento                                           |          |

| Option                       | Description                                                                                | Selected |
| ---------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Brief tal cual: obligatorios | Descripción/ejecución/errores obligatorios para todos (recomendación de Claude)            |          |
| Relajado para propios        | Textos largos opcionales en ejercicios del gimnasio; el global curado exige ficha completa | ✓        |
| Vos decidí (Claude)          | —                                                                                          |          |

**User's choice:** Schema completo; cruces local→global; obligatoriedad relajada para propios (contra la recomendación — desviación consciente del §2.2 para reducir fricción del profe).

---

## Estados en la práctica

| Option                        | Description                                                                    | Selected |
| ----------------------------- | ------------------------------------------------------------------------------ | -------- |
| Nace publicado                | Sin paso editorial en el gimnasio; borrador reservado al pipeline curado (186) | ✓        |
| Borrador → publicar explícito | Control editorial, pero sin superficie de ciclo de vida hasta la 185           |          |
| Vos decidí (Claude)           | —                                                                              |          |

| Option                              | Description                                      | Selected |
| ----------------------------------- | ------------------------------------------------ | -------- |
| Solo crear/editar en 184            | Cero transiciones de estado; CAT-05 es de la 185 | ✓        |
| Adelantar 'desactivar' para propios | Escape hatch que adelanta parte de CAT-05        |          |
| Vos decidí (Claude)                 | —                                                |          |

**Notes:** Confirmado al cerrar el área: editar un GLOBAL desde el gimnasio queda bloqueado en la 184 (la copia local CAT-03 es de la 185).

---

## UI y roles del ABM

| Option                 | Description                                                                                             | Selected |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Listado + alta/edición | Sección Catálogo gateada por module.gimnasio.enabled; listado plano + form de ficha; sin buscador (185) | ✓        |
| Solo API en 184        | Toda la UI con el buscador en la 185 — contradice el UI hint del roadmap                                |          |
| Vos decidí (Claude)    | —                                                                                                       |          |

| Option                | Description                                         | Selected |
| --------------------- | --------------------------------------------------- | -------- |
| Coach + admin + owner | Crean y editan; gestión/recepción no ven la sección | ✓        |
| Coach solo lectura    | Solo admin/owner con ABM                            |          |
| Vos decidí (Claude)   | —                                                   |          |

---

## Base de ejecución

| Option                              | Description                                                                             | Selected |
| ----------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Push 182+183 primero                | Revisión + push staging-first, 184 desde origin/master fresco (recomendación de Claude) |          |
| Encadenar sobre et-182              | Rama desde feat/183-panel-tenants sin esperar el push                                   | ✓        |
| 184 en paralelo desde origin/master | Conflictos garantizados en modules.ts/manifiesto + colisión de mig 0216                 |          |

**User's choice:** Encadenar — "no puedo revisar 182 ni 183 ahora, tenemos que usar lo que hay hecho de base". Migraciones desde 0217; el push eventual es el tren 182+183+184 con OK explícito.

---

## Claude's Discretion

- Modelado físico de alias/secundarios/variantes/alternativas (tabla hija vs JSON vs self-FK) — con criterio de que la 185 indexe alias sin ALTER.
- Empty state del catálogo global vacío pre-186.
- Forma exacta de los mensajes de error de validación (en español, entendibles).
- Mecánica de los renames H-2 (checklist del doc 08).

## Deferred Ideas

- Adelantar 'desactivar' para ejercicios propios — descartado; CAT-05 completo en la 185.
- Todo `v51-milestone-data-rollout.md` — re-matcheó y se re-descartó (ya revisado en la 181, sin relación).
