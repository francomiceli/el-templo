# Phase 186: Carga inicial del catálogo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 186-carga-inicial-del-cat-logo
**Areas discussed:** Vehículo de carga y camino a Publicado, Pipeline de generación y formato fuente, Alcance del contenido por ficha, Reversibilidad y regeneración

---

## Vehículo de carga y camino a Publicado

| Option                           | Description                                                                                                       | Selected |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| En DB dev con el panel de la 185 | Generación carga Borradores en dev; revisión con el panel real (dogfooding); lo aprobado va a prod como Publicado | ✓        |
| En archivos del repo (PR-style)  | Revisión de JSON/MD antes de cargar; sin ficha renderizada; Borrador simbólico                                    |          |
| En prod post-carga               | Migración inserta Borradores en prod; publicación desde el panel real                                             |          |

**User's choice:** Revisión en DB dev con el panel de la 185.

| Option                                      | Description                                                                   | Selected |
| ------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Migración SQL generada del dataset aprobado | INSERTs en Publicado, trackeada en `_migrations`, corre en el deploy del tren | ✓        |
| Script TS one-shot corrido a mano           | Flexible pero viola prod-data-via-migrations                                  |          |
| Import por endpoint de plataforma           | Superficie nueva de API para un evento único                                  |          |

**User's choice:** Migración SQL generada del dataset aprobado.

| Option                                   | Description                                                                         | Selected |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Publicar uno por uno en el panel         | Transición real de la 185 por ejercicio; export toma solo Publicados; cero UI nueva | ✓        |
| Acción de publicación masiva en el panel | Feature nueva de UI para ahorrar ~10 min una vez                                    |          |
| Checklist fuera de la DB                 | Script flipea aprobados; transición scriptada, no clickeada                         |          |

**User's choice:** Publicar uno por uno en el panel.

| Option                           | Description                                                                        | Selected |
| -------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Corregir la fuente y regenerar   | Dataset fuente siempre = lo cargado; lo no aprobado queda Borrador y no se exporta | ✓        |
| Editar a mano en la DB/UI de dev | Dataset desincronizado; regeneración pisa arreglos                                 |          |
| Anotar y corregir todo al final  | Dos rondas completas de revisión                                                   |          |

**User's choice:** Corregir la fuente y regenerar.

---

## Pipeline de generación y formato fuente

| Option                          | Description                                                | Selected |
| ------------------------------- | ---------------------------------------------------------- | -------- |
| Dataset versionado en el repo   | JSON commiteados; loader a dev; export genera la migración | ✓        |
| Generación directa a DB dev     | Sin diff ni historial                                      |          |
| Markdown por ejercicio + parser | Duplica esfuerzo si la revisión es en panel                |          |

**User's choice:** Dataset versionado en el repo.

| Option                                       | Description                                               | Selected |
| -------------------------------------------- | --------------------------------------------------------- | -------- |
| Subagentes en la sesión GSD                  | Sin deps nuevas ni API keys; brief §2.4/§2.5 en el prompt | ✓        |
| Script standalone contra la API de Anthropic | Infra permanente para un evento único                     |          |
| Generación manual asistida                   | Máximo control, mínimo apalancamiento                     |          |

**User's choice:** Subagentes en la sesión GSD.

| Option                            | Description                                                  | Selected |
| --------------------------------- | ------------------------------------------------------------ | -------- |
| Por patrón de movimiento, 9 lotes | Cobertura por construcción; sinónimos se detectan en el lote | ✓        |
| Todo junto en una pasada          | Revisión en bloque; duplicados cruzados al final             |          |
| Por grupo muscular                | 14 lotes; multiarticulares pisan varios grupos               |          |

**User's choice:** Por patrón de movimiento, 9 lotes.

| Option                              | Description                                                        | Selected |
| ----------------------------------- | ------------------------------------------------------------------ | -------- |
| Script gate + test permanente en CI | Validador del dataset como gate del pipeline Y test de CI (sin DB) | ✓        |
| Solo script del pipeline            | Sin protección contra ediciones futuras del dataset                |          |
| Validación en la DB post-carga      | Detecta tarde; no valida la fuente                                 |          |

**User's choice:** Script gate + test permanente en CI.

---

## Alcance del contenido por ficha

| Option                          | Description                                                | Selected |
| ------------------------------- | ---------------------------------------------------------- | -------- |
| Sí, checkpoint de lista primero | OK humano sobre nombres+taxonomías antes de generar fichas | ✓        |
| No, directo a fichas completas  | Un solo checkpoint; trabajo de descartados se tira         |          |

**User's choice:** Checkpoint de lista primero.

| Option                                                 | Description                                                   | Selected |
| ------------------------------------------------------ | ------------------------------------------------------------- | -------- |
| Alternativas 1-3 obligatorias; variantes donde existan | §2.6 instantáneo desde el día uno; validador chequea punteros | ✓        |
| Solo alternativas, sin variantes en v1                 | Menos contenido; progresión útil para la 187 se pierde        |          |
| Relaciones solo donde salgan naturales                 | Sin cuota; rompe la salida manual del §2.6                    |          |

**User's choice:** Alternativas 1-3 obligatorias; variantes donde existan.

| Option                                        | Description                                | Selected |
| --------------------------------------------- | ------------------------------------------ | -------- |
| Español rioplatense + inglés de uso corriente | 2-4 aliases con nombres reales de gimnasio | ✓        |
| Solo español                                  | 'deadlift' no encontraría el peso muerto   |          |
| Exhaustivo                                    | 5-8 aliases; más colisiones y ruido        |          |

**User's choice:** Español rioplatense + inglés de uso corriente.

| Option                              | Description                                                                 | Selected |
| ----------------------------------- | --------------------------------------------------------------------------- | -------- |
| ~60 con sesgo a equipamiento básico | Margen dentro de 40-80; barra/mancuernas/peso corporal/máquinas universales | ✓        |
| Mínimo viable ~45                   | Más curado, menos alternativas internas                                     |          |
| Tope ~80                            | Mucha revisión de una sentada                                               |          |

**User's choice:** ~60 con sesgo a equipamiento básico.

---

## Reversibilidad y regeneración

| Option                                 | Description                                                               | Selected |
| -------------------------------------- | ------------------------------------------------------------------------- | -------- |
| Nombre canónico normalizado como clave | Upsert por clave natural; referencias por slug; unique de la 184 como red | ✓        |
| UUID fijo por ejercicio en el dataset  | Requeriría columna/migración extra                                        |          |
| Sin ancla: wipe & reload en dev        | Pierde el estado de revisión en cada iteración                            |          |

**User's choice:** Nombre canónico normalizado como clave.

| Option                                   | Description                                                                     | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Backup del pipeline + DELETE documentado | INSERT-only sobre tabla vacía; reversión documentada; válida solo sin registros | ✓        |
| Migración de reversión preparada         | El runner no tiene concepto de down                                             |          |
| Solo el backup del deploy                | Restaurar toda la DB por 60 filas (host compartido con staging)                 |          |

**User's choice:** Backup del pipeline + DELETE documentado.

---

## Claude's Discretion

- Estructura interna y esquema exacto del dataset JSON; ubicación bajo `el-templo-api/`.
- IDs explícitos vs resolución por nombre en la migración.
- Formato del reporte de validación y del script de export.
- Selección concreta de los ~60 ejercicios (pasa por el checkpoint de lista igual).
- Prompts de generación por lote.

## Deferred Ideas

- Publicación masiva en el panel de plataforma (si el flujo de revisión se repite a futuro).
- Videos e imágenes por ejercicio (primer opcional post-v1 del brief).
- Todo `v51-milestone-data-rollout` revisado y no plegado (SPOM, frontera A1) — igual que en la 185.
