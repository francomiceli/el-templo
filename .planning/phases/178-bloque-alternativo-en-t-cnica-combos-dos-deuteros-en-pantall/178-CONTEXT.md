# Phase 178: Bloque alternativo (técnica/combos) + dos deuteros en pantalla + baja de la rotación - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning
**Source:** DESIGN-SEED (decisiones cerradas con Nacho 2026-08-19). Ver `178-DESIGN-SEED.md` en este mismo directorio — es la referencia canónica y detallada de touchpoints con números de línea verificados contra `origin/master @ 32db2f16`.

<domain>
## Phase Boundary

Una feature única y coherente sobre la generación de sesiones y la pantalla del TV, con tres partes acopladas:

1. **Bloque alternativo (técnica/combos):** en días **técnica** y **combos** generar SIEMPRE un 5º bloque `TECNICA_II_ALT` / `COMBOS_II_ALT` — variante del 2º bloque (`*_II`) con ejercicios distintos, mismo momento/ventana. Editable en el admin como cualquier otro bloque. Estructura fija técnica/combos pasa de **4 → 5** bloques: INITIUM → II_I → II_II → **II_ALT** → STRETCHING.
2. **Deuteros regular 2×2:** en días **regulares**, mostrar los dos DEUTEROS (I y II) juntos en el TV como grilla **2×2 = 4 listas** (2 deuteros × 2 niveles del par), en vez de rotarlos.
3. **Baja de la rotación automática:** eliminar la rotación server-side de deuteros (feature `a0e07140`) — acoplada con el 2×2, **shippean juntas**. Drop de las columnas DB de rotación en la misma migración.

**Fuera de alcance:** back-merge master→staging (deuda separada), jueves-combos del 20/8 (desacoplado), paginación genérica del TV (el toggle del alt es específico del grupo II).
</domain>

<decisions>
## Implementation Decisions (LOCKED — cerradas con Nacho)

### Modelo de datos / generación
- Rol nuevo `COMBOS_II_ALT` / `TECNICA_II_ALT`, **generado desde el arranque** (bloque físico real) → reusa todo el editor y el PDF.
- El alt reusa la **misma ruta y formato forzado** que `*_II_II`, pero con **hash que incluye el rol** (hoy técnica lo excluye a propósito para compartir pool) → selecciona un set de ejercicios DISTINTO al del II.
- `session_blocks.role` es `varchar(20)` sin enum → **el rol nuevo NO necesita migración de schema**; las prescripciones del bloque alt son datos de runtime que crea el generador.
- Etiqueta visible: **"COMBOS II ALT" / "TÉCNICA II ALT"** (larga TV) + badge corto admin.

### TV del alternativo
- Comparte cronómetro → **toggle de vista** sobre la zona del 2º bloque (mostrar principal / mostrar alternativo), **mismo timer**, manejado por el profe.
- Reusa el patrón de `displayRole` efímero que hoy usa la rotación.
- Nuevo estado persistido `show_alternative` (boolean, default false) en `tv_class_state` (una fila por sede). Botón "Ver alternativo" en `TvControlPage`.
- El alt entra al roster como **sibling visual del II** (análogo a `deuterosSibling`/`visualGroupOf`), NO como paso independiente del ANTERIOR/SIGUIENTE.

### Deuteros regular
- **2×2 = 4 listas.** `buildColumns` deja de colapsar los deuteros vía `visualGroupOf`; cuando el grupo activo es DEUTEROS itera DEUTEROS_1 **y** DEUTEROS_2 × el par de niveles.
- Front: `.stage`/`.lista-col` de flex 50/50 → **grid 2×2** + rediseño de escala/tipografía.

### Rotación automática
- Se saca por completo (cálculo, writeState, campos de tipos/schemas, toggle admin, tests de `a0e07140`/`a1db8a4e`).
- **Drop** de `deuteros_auto_rotate` y `deuteros_pinned_at` de `tv_class_state` en la misma migración.

### Editor / validadores (gotchas reales)
- `SessionEditPage.vue` / `EditableBlockCard.vue`: **sin cambios** (agrupan por `role+sortOrder`, el alt aparece como card propia gratis).
- `session-validator.ts`: `isFixedStructureSession`/conteo de bloques **pasa de 4 a 5** para combos/técnica (hoy asume 4 — gotcha).
- `BlockRole` es unión cerrada → agregar los roles obliga a completar todos los mapped types (compatibilidad, intensidad, roleToBlock, blockMap del editor, PDF).

### Claude's Discretion
- Números de wave/dependencias entre plans (respetar orden api-tipos → generador → TV → migración → tests).
- Detalles de tipografía/escala del grid 2×2 (objetivo: legible en el TV real).
- Numeración exacta de la migración (verificar colisión al ejecutar — ver refs).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Referencia de diseño (touchpoints con líneas verificadas)
- `178-DESIGN-SEED.md` — diseño completo, archivos críticos y números de línea contra `origin/master @ 32db2f16`. **Leer primero.**

### Generador de sesiones (api)
- `el-templo-api/src/modules/sessions/combos-generator.ts` — `assembleFixedStructureSession`, `generateCombosSession`.
- `el-templo-api/src/modules/sessions/tecnica-generator.ts` — `generateTecnicaSession`, hash que excluye rol.
- `el-templo-api/src/modules/sessions/types.ts` — `BlockRole` union.
- `el-templo-api/src/modules/sessions/validators/block-validator.ts` — `FORMAT_COMPATIBILITY`.
- `el-templo-api/src/modules/sessions/validators/session-validator.ts` — `INTENSITY_RANGES`, `isFixedStructureSession` (conteo 4→5).
- `el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts` — `roleToBlock`.

### Labels (3 diccionarios espejo, sin propagación automática)
- `el-templo-api/src/modules/shared/role-labels.ts` — `ROLE_LABELS`, `ROLE_BADGE_LABELS`.
- `el-templo-admin/src/constants/roleLabels.ts`.
- `el-templo-app/src/constants/roleLabels.ts`.

### Editor / PDF (admin)
- `el-templo-api/src/modules/admin/edit-service.ts` — `getCompatibleFormats` `blockMap` → mapear alt a `"nucleus"`.
- `el-templo-admin/src/utils/pdf/session-data-transformer.ts` — rama `isCombosTecnica`, agregar página del alt.

### TV (api + admin)
- `el-templo-api/src/modules/tv/service.ts` — `buildClassPayload`, `buildColumns`, cálculo de rotación (a borrar), `writeState`.
- `el-templo-api/src/modules/tv/roster.ts` — alt como sibling visual del II.
- `el-templo-api/src/modules/tv/types.ts`, `el-templo-api/src/modules/tv/schemas.ts`.
- `el-templo-admin/src/pages/TvScreenPage.vue`, `el-templo-admin/src/pages/TvControlPage.vue`.
- `el-templo-admin/src/tv/render.ts` — `paintList`, `COMPACT_OVER`.
- `el-templo-admin/src/composables/useTvApi.ts`.

### Migración + schema
- `el-templo-api/src/db/migrations/` — nueva migración (numerar next-after-master; verificar colisión con trenes 177/aniversarios/alta-prorrateada al ejecutar).
- `el-templo-api/src/db/schema/tv.ts` — reflejar drop de columnas de rotación + add `show_alternative`.

### Reglas del repo (skills)
- `.claude/skills/el-templo-db-migrations/` — numeración a mano, trampa del `;` en comentarios, host compartido staging/prod.
- `CLAUDE.md` — no `any`, logger, tests de rutas nuevas, generación de migraciones.
</canonical_refs>

<specifics>
## Specific Ideas

- Nueva estructura fija técnica/combos (5 bloques): `INITIUM → II_I → II_II → II_ALT → STRETCHING`.
- Migración: `DROP COLUMN deuteros_auto_rotate`, `DROP COLUMN deuteros_pinned_at`, `ADD COLUMN show_alternative BOOLEAN DEFAULT false` sobre `tv_class_state`.
- Tests a producir: generadores emiten el alt (5 bloques, ejercicios distintos del II); validadores aceptan estructura de 5 y roles nuevos; TV deuteros 2×2; toggle `show_alternative` swapea `displayRole` sin tocar el timer; rotación eliminada (borrar sus tests).
</specifics>

<deferred>
## Deferred Ideas

- Back-merge master→staging (deuda grande ya marcada; ordenar al shippear).
- Coordinar push pendiente de `et-kinesis-label`.
- Jueves-combos del 20/8 (desacoplado; "si llega, no pasa nada").
- Paginación genérica del TV (explícitamente NO — el toggle del alt es específico).
</deferred>

---

*Phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall*
*Context derived: 2026-08-19 from 178-DESIGN-SEED.md (decisiones cerradas con Nacho)*
