# Phase 185: Catálogo — ciclo de vida y buscador - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 185-Catálogo — ciclo de vida y buscador
**Areas discussed:** Copia local, Promoción, Desactivación/transiciones, Buscador

---

## Copia local: convivencia y alcance

| Option                        | Description                                                                         | Selected |
| ----------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Solo la copia (sombrea)       | El global de origen desaparece del buscador de ese gym (NOT EXISTS por copied_from) | ✓        |
| Ambos, con badge 'tu versión' | Global y copia listados, la local marcada                                           |          |

| Option                     | Description                                               | Selected |
| -------------------------- | --------------------------------------------------------- | -------- |
| Todo: aliases + relaciones | Copia ficha + aliases + punteros a variantes/alternativas | ✓        |
| Solo la ficha              | Aliases y relaciones vacíos en la copia                   |          |

| Option                  | Description                                                            | Selected |
| ----------------------- | ---------------------------------------------------------------------- | -------- |
| Diálogo de confirmación | Aviso antes de editar un global: "esto crea la versión de tu gimnasio" | ✓        |
| Banner en el formulario | Form abre directo con banner informativo                               |          |
| Silencioso + toast      | Sin aviso previo                                                       |          |

| Option    | Description                                                     | Selected |
| --------- | --------------------------------------------------------------- | -------- |
| Publicado | La copia nace lista para usar                                   | ✓        |
| Borrador  | Requiere publicación explícita (dejaría hueco por el sombreado) |          |

**User's choice:** Todas las recomendadas.

---

## Promoción: flujo y colisiones

| Option                    | Description                                     | Selected |
| ------------------------- | ----------------------------------------------- | -------- |
| Panel super-owner (183)   | Acción de plataforma en el panel de la fase 183 | ✓        |
| Solo por script/SQL en v1 | Sin UI                                          |          |

| Option                         | Description                                                 | Selected |
| ------------------------------ | ----------------------------------------------------------- | -------- |
| Bloquear con renombre previo   | La promoción falla con mensaje; renombre manual y reintento | ✓        |
| Renombre automático con sufijo | Promueve agregando sufijo al nombre                         |          |

| Option              | Description                           | Selected |
| ------------------- | ------------------------------------- | -------- |
| No: bloquear copias | Filas con copied_from no se promueven | ✓        |
| Sí, con aviso       | Se permite con warning                |          |

| Option                 | Description                 | Selected |
| ---------------------- | --------------------------- | -------- |
| Mantiene su status     | Promoción solo cambia scope | ✓        |
| Pasa a borrador global | Gate extra de publicación   |          |

**User's choice:** Todas las recomendadas.

---

## Desactivación y transiciones de estado

| Option                               | Description                      | Selected |
| ------------------------------------ | -------------------------------- | -------- |
| Las 3: publicar/desactivar/reactivar | Ciclo completo reversible por UI | ✓        |
| Solo publicar y desactivar           | Sin reactivación en v1           |          |

| Option                       | Description                                                        | Selected |
| ---------------------------- | ------------------------------------------------------------------ | -------- |
| Global=plataforma, local=gym | Globales solo super-owner; locales el propio gym (roles de la 184) | ✓        |
| Locales solo admin del gym   | Más restrictivo dentro del gym                                     |          |

| Option             | Description                                   | Selected |
| ------------------ | --------------------------------------------- | -------- |
| Copias no se tocan | Desactivar un global no afecta copias locales | ✓        |
| Cascada con aviso  | Desactiva también las copias derivadas        |          |

| Option              | Description                                                            | Selected |
| ------------------- | ---------------------------------------------------------------------- | -------- |
| Sí, reaparece       | Desactivar la copia re-expone el global (sombreado exige copia activa) | ✓        |
| No, sigue sombreado | La copia desactivada sigue tapando al global                           |          |

**User's choice:** Todas las recomendadas.

---

## Buscador: matching, ranking y UX

| Option                | Description                                                       | Selected |
| --------------------- | ----------------------------------------------------------------- | -------- |
| Substring normalizado | LIKE %term% sobre nombre y alias, normalizando acentos/mayúsculas | ✓        |
| Prefijo normalizado   | LIKE term%                                                        |          |
| Fulltext/fuzzy        | FULLTEXT MySQL o typos                                            |          |

| Option            | Description                                                                         | Selected |
| ----------------- | ----------------------------------------------------------------------------------- | -------- |
| Relevancia simple | Nombre > alias, prefijo > substring, luego alfabético; locales y globales mezclados | ✓        |
| Locales primero   | Propios arriba en bloque separado                                                   |          |

| Option                         | Description                                                                    | Selected |
| ------------------------------ | ------------------------------------------------------------------------------ | -------- |
| Categoría (7) + grupo opcional | Filtro principal por categoría derivada, grupo muscular (14) como refinamiento | ✓        |
| Solo grupo muscular (14)       | Un único select de 14                                                          |          |

| Option                       | Description                                                   | Selected |
| ---------------------------- | ------------------------------------------------------------- | -------- |
| Página + select reutilizable | Listado de la 184 mejorado + QSelect autocomplete para la 187 | ✓        |
| Solo la página del catálogo  | El select lo haría la 187                                     |          |

**User's choice:** Todas las recomendadas.

---

## Claude's Discretion

- Re-editar un global con copia existente → redirigir a editar la copia.
- Debounce, mínimo de caracteres, paginación del autocomplete → patrones existentes del admin.
- Confirmaciones al desactivar y filtro "ver desactivados" en el listado admin.
- Mecánica de normalización del nombre canónico (columna generada vs query).

## Deferred Ideas

- Todo `v51-milestone-data-rollout.md` revisado y NO plegado — SPOM, frontera A1, sin relación con el catálogo nuevo.
