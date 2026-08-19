# Bloque alternativo (técnica/combos) + dos deuteros en pantalla + baja de la rotación

## Context

En días **técnica** y **combos** los coaches necesitan tener siempre a mano un **bloque alternativo al 2º bloque** (variante de `TECNICA_II`/`COMBOS_II`) "para quien lo requiera": mismo momento/ventana de tiempo de la clase, ejercicios distintos. Hoy esos días generan una estructura fija de 4 bloques (INITIUM → II_I → II_II → STRETCHING) sin lugar para esa variante.

En paralelo, en días **regulares** los dos DEUTEROS (I y II) hoy **rotan automáticamente** en la pantalla del TV (feature `a0e07140`, server-side). Nacho quiere en cambio **verlos a los dos juntos** en pantalla. Con eso, la rotación automática se vuelve innecesaria y se saca.

Objetivo: una feature única y coherente que (1) agrega el bloque alternativo generado + editable + visible en el TV como "página aparte" que comparte cronómetro, (2) muestra los dos deuteros juntos (2×2) en días regulares, y (3) elimina la rotación automática. Base de trabajo: worktree `et-bloque-alt` (`feat/tv-bloque-alternativo`, salido de `origin/master` @ `32db2f16`).

## Decisiones cerradas (con Nacho)

- **Modelo:** rol nuevo `COMBOS_II_ALT` / `TECNICA_II_ALT`, **generado desde el arranque** (bloque físico) → reusa todo el editor. Etiqueta visible: **"COMBOS II ALT" / "TÉCNICA II ALT"**.
- **TV del alternativo:** comparte cronómetro → **toggle de vista** sobre el 2º bloque (mostrar principal / mostrar alternativo), mismo timer, manejado por el profe. Reusa el patrón de `displayRole` efímero que hoy usa la rotación.
- **Deuteros regular:** **2×2 = 4 listas** (2 deuteros × 2 niveles del par). Requiere rediseño de tipografía/escala.
- **Rotación:** se saca (acoplada con el 2×2, shippean juntas). **Drop de las columnas DB** en la misma migración.

## Diseño

### 1. Generador (api) — el alternativo como 5º bloque
`el-templo-api/src/modules/sessions/`:
- `combos-generator.ts` (`assembleFixedStructureSession` ~L90-215 toma hoy una **tupla de 2 specs**; `generateCombosSession` ~L240-284) y `tecnica-generator.ts` (`generateTecnicaSession` ~L55-92): extender para emitir **siempre** el bloque alternativo. Nueva estructura fija técnica/combos: INITIUM → II_I → II_II → **II_ALT** → STRETCHING (5 bloques).
- El alt reusa la **misma ruta y formato forzado** que el II_II, pero con **hash que incluye el rol** (hoy técnica lo excluye a propósito para compartir pool, `tecnica-generator.ts` ~L77-79) → selecciona un set de ejercicios distinto. Es un alternativo real, editable después.

### 2. Sistema de tipos y validadores (api) — tocar por rol nuevo
- `sessions/types.ts` (`BlockRole` union, ~L43-58): agregar `COMBOS_II_ALT`, `TECNICA_II_ALT` (unión cerrada → TS obliga a completar los mapped types de abajo).
- `validators/block-validator.ts` (`FORMAT_COMPATIBILITY` ~L20-53): entradas iguales a II (`["Combos"]` / `["For Quality","Cluster","Accumulate X"]`).
- `validators/session-validator.ts`: `INTENSITY_RANGES` (~L25-40) entradas nuevas; **y `isFixedStructureSession`/conteo de bloques (~L71-89): pasar de 4 a 5 bloques fijos para combos/técnica** (gotcha real, hoy asume 4).
- `pipeline/stage-5-format.ts` (`roleToBlock` ~L26-52): fallback muerto para los roles nuevos (bypassean stage 5 vía `forcedFormat`, pero el tipo exhaustivo lo exige).

### 3. Labels — 3 diccionarios espejo (obligatorio, sin propagación automática)
Agregar `COMBOS_II_ALT`/`TECNICA_II_ALT` a los tres:
- `el-templo-api/src/modules/shared/role-labels.ts` (`ROLE_LABELS` larga TV → "COMBOS II ALT"/"TÉCNICA II ALT"; `ROLE_BADGE_LABELS` corta admin).
- `el-templo-admin/src/constants/roleLabels.ts`.
- `el-templo-app/src/constants/roleLabels.ts`.

### 4. Editor del admin — reusa la card, más 2 toques
- `SessionEditPage.vue` / `EditableBlockCard.vue`: **sin cambios** — agrupa por `role+sortOrder`, así que el bloque alt aparece como su propia card con tabs por nivel y swap de ejercicios/formato gratis. (No se toca el toggle ATHLOS↔EPIKOS; el alt no cambia de rol.)
- `el-templo-api/src/modules/admin/edit-service.ts` (`getCompatibleFormats` `blockMap` ~L661-676): mapear `COMBOS_II_ALT`/`TECNICA_II_ALT` → `"nucleus"` (igual que II) para que el selector de formato del editor funcione.
- PDF `el-templo-admin/src/utils/pdf/session-data-transformer.ts` (rama `isCombosTecnica` ~L464-527, roles hardcodeados uno por uno con `buildGridPage`): agregar la página del bloque alternativo.

### 5. TV — refactor de la "zona del 2º bloque" (`el-templo-admin` + `el-templo-api/src/modules/tv`)
Un solo refactor coherente sobre `tv/service.ts:buildClassPayload` (~L893-1023) y `tv/roster.ts`:
- **Deuteros regular → 2×2:** `buildColumns` (`service.ts` ~L830-891) deja de colapsar los deuteros vía `visualGroupOf`; cuando el grupo activo es DEUTEROS itera DEUTEROS_1 **y** DEUTEROS_2 × el par de niveles (2×2=4 columnas). En el front, `TvScreenPage.vue` `.stage`/`.lista-col` (~L766-786) pasa de flex 50/50 a **grid 2×2** + rediseño de escala/tipografía (`render.ts:paintList` ~L460-527, `COMPACT_OVER` ~L53).
- **Alt técnica/combos → toggle de vista:** el alt entra en el roster como **sibling visual del II** (análogo a `deuterosSibling`/`visualGroupOf`, no como paso independiente del ANTERIOR/SIGUIENTE). Nuevo estado persistido en `tv_class_state` (una fila por sede) tipo `showAlternative` boolean; el control (`TvControlPage.vue`) suma un botón "Ver alternativo". `buildClassPayload` elige `displayRole = II_ALT` cuando el toggle está on y el bloque activo es el grupo II — **cronómetro intacto** (mismo mecanismo efímero que la rotación).
- **Sacar la rotación:** borrar el cálculo de rotación en `service.ts` (~L900-933), su manejo en `writeState` (~L448-450, ~L469-482), campos en `types.ts` (~L258-261, ~L300) y `schemas.ts` (~L249-250), el toggle en `TvControlPage.vue` (~L211-227, ~L662-663, ~L882-883) y `useTvApi.ts` (~L83-86, ~L122). Borrar los tests de rotación de `a0e07140`/`a1db8a4e`.

### 6. Migración (api)
`el-templo-api/src/db/migrations/` — **numerar a mano el siguiente después de master** (hoy master llega a `0205_tv_deuteros_auto_rotate`; probable `0206`, **verificar colisión** con trenes pendientes 177/aniversarios/alta-prorrateada al momento de ejecutar — regla del skill de migraciones):
- `DROP COLUMN deuteros_auto_rotate`, `DROP COLUMN deuteros_pinned_at` de `tv_class_state`.
- `ADD COLUMN show_alternative` boolean default false a `tv_class_state`.
- `session_blocks.role` es `varchar(20)` sin enum → **el rol nuevo no necesita migración de schema**; las prescripciones del bloque alt son datos de runtime (las crea el generador).

### 7. Tests
- Unit: `test/unit/combos-generator.test.ts`, `tecnica-generator.test.ts` → emiten el alt (5 bloques, ejercicios distintos del II).
- Validadores: estructura fija de 5 bloques pasa; roles nuevos en compatibilidad/intensidad.
- Integración: `test/sessions/generate-modes.test.ts` → día combos/técnica trae el alt.
- TV: `test/tv/tv-service.test.ts` → deuteros 2×2; toggle `showAlternative` swapea `displayRole` sin tocar el timer; rotación eliminada (borrar sus tests). `tv-control.test.ts` → botón "Ver alternativo".

## Archivos críticos (representativos)
- Generador: `sessions/combos-generator.ts`, `sessions/tecnica-generator.ts`.
- Tipos/validadores: `sessions/types.ts`, `sessions/validators/{block,session}-validator.ts`.
- Labels: `shared/role-labels.ts` + `el-templo-admin/src/constants/roleLabels.ts` + `el-templo-app/src/constants/roleLabels.ts`.
- Editor/PDF: `admin/edit-service.ts`, `el-templo-admin/src/utils/pdf/session-data-transformer.ts`.
- TV: `tv/service.ts`, `tv/roster.ts`, `tv/{types,schemas}.ts`, `el-templo-admin/src/pages/{TvScreenPage,TvControlPage}.vue`, `el-templo-admin/src/tv/render.ts`, `el-templo-admin/src/composables/useTvApi.ts`.
- Migración + schema: `db/migrations/02xx_*.sql`, `db/schema/tv.ts`.

## Verificación (end-to-end)
1. Typecheck: `el-templo-api` (tsc), `el-templo-admin` y `el-templo-app` (**vue-tsc local — CI no typechequea los frontends**).
2. Tests api (generador + validadores + TV) — corren en CI; localmente los unit/integración clave.
3. Generar una semana combos y una técnica local → confirmar 5 bloques con el alt y ejercicios distintos.
4. Driving manual del TV: día regular muestra deuteros 2×2 legibles; día combos muestra II + botón "Ver alternativo" con cronómetro compartido; rotación ya no existe; el editor edita el bloque alt como cualquier otro; el PDF trae la página del alt.

## Ejecución y gobernanza
- **Tamaño = fase.** Recomiendo ejecutarla como **fase GSD** (plan-phase detallado → `gsd-executor` en sonnet, opus orquesta/verifica), método validado en fases 173/174. Toca api + admin + app + migración + tests.
- **Base:** `feat/tv-bloque-alternativo` desde `origin/master`. Contiene el código de rotación a remover.
- **Staging rezagado:** `origin/staging` no tiene nada del tren TV/159/160. Al shippear, **ordenar el back-merge master→staging** (deuda ya marcada) y coordinar el push pendiente de `et-kinesis-label`.
- **Mañana (jueves combos):** desacoplado — Nacho: "si llega, no pasa nada". No bloquea la feature.
