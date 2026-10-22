---
phase: 201-conquer
plan: 31
subsystem: app/conquer (Hoy, hoja de guardado y Sábado)
tags: [conquer, estetica-b, hoy, sabado, hoja-de-guardado, vue]
requires: [201-28, 201-30]
provides:
  - Hoy y Sábado sobre CqScreen con cabeceras oscuras por ejercicio y por combo
  - Controles de Hoy (día, contador, escalón) en el templo clásico
  - Hoja de guardado clara con raíz .cq-root propia, scroll interno y "Listo" fijo
  - CqBodyMap en azul noche y dorado sobre claro (solo :deep)
affects: [201-32, 201-33, 201-34, 201-35]
key-files:
  modified:
    - el-templo-app/src/modules/conquer/components/today/{CqDayPicker,CqCounter,CqStepRow,CqExerciseCard,CqComboCard,CqSaveSheet}.vue
    - el-templo-app/src/modules/conquer/components/CqBodyMap.vue
    - el-templo-app/src/modules/conquer/pages/{ConquerTodayPage,ConquerSaturdayPage}.vue
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 31: Hoy, hoja de guardado y Sábado (variante B) Summary

Cuarta parte del hallazgo 2: la pantalla de uso diario con el ritmo de cabeceras oscuras (una por ejercicio y por combo) sobre cards claras, la hoja de guardado clara y el Sábado de Toro con el mismo lenguaje. Solo template y estilos: props, emits, `useConquerToday`, `CQ_TEXTOS`, `modes`, `holdRungs`, `techo`, la carga por `?day=`, el redirect al sábado, `rejected` y el `cleanup` quedan como estaban. Sin API, migraciones ni tests nuevos.

## Commits

| Tarea | Commit | Mensaje |
| --- | --- | --- |
| 1 | `82a71592c` | `feat(201-31): controles de Hoy en el templo clásico (día, contador, escalón)` |
| 2 | `8e437cc89` | `feat(201-31): cards de ejercicio y combo con cabecera oscura, hoja de guardado clara y figura dorada sobre claro` |
| 3 | `0874e53c3` | `feat(201-31): Hoy y Sábado de Conquer en el templo clásico (hallazgo 2)` |

El SUMMARY se commitea aparte con `docs(201-31)`.

## Qué quedó

- **`CqDayPicker`**: ficha blanca por día (borde `--cq-edge`, radio 14, alto mín. 56), estado arriba ("Hecho" en `--cq-sage`, "Te toca" en `--cq-text-2`, o vacío con alto fijo) y día abajo (12 px, 600, `overflow-wrap: anywhere`). La elegida va en `--cq-night` con `--cq-on-night-hi` (día) y `--cq-on-night` (estado) y sombra. Grilla `repeat(auto-fit, minmax(60px, 1fr))`, gap 6: 5 fichas = 324 px, caben en 358 px (390) y en 328 px (360). "Semana completa..." pasa a `.cq-notice`.
- **`CqCounter`**: botones 48x48, radio 12, borde 1.5 px `--cq-edge-gold`, blanco, "−"/"+" 22 px `--cq-night`; deshabilitado con `--cq-text-2` y borde `--cq-line` (sin opacidad); valor `.cq-num` 26 px, ancho mín. 68, unidad 12 px `--cq-text-2`.
- **`CqStepRow`**: `CqGreek` md + "Escalón N"/"Hold final" (600 15) + objetivo (`.cq-sub`) + chip `cq-chip--{tono}`; `<select class="cq-select">` en grilla `minmax(0,1.4fr) minmax(0,1fr)` (hold en una columna con `--one`); ayuda `.cq-sub` a la izquierda y `CqCounter` a la derecha. El desplegable de modo sigue listando `step.modes` y se deshabilita con un solo modo; el de peldaño usa `rungs`.
- **`CqExerciseCard`**: `.cq-card` con la cabecera `.cq-ex__head.cq-dark` pegada arriba (`margin: -16px -16px 0`, radio 16 16 0 0, padding 14 16, sin sombra ni borde): título Montserrat 700 17 `--cq-on-night` ("N · Nombre") y `CqTemple` a la derecha. Pie con las tres notas de 201-26 (`ayuda_carga`, `holdHelp(level)`, `ayuda_unilateral` si hay por lado) en 13.5 px `--cq-text-2`.
- **`CqComboCard`**: cabecera oscura (kicker + título), secuencia "Press X (sube y baja) → Push Y → Hold Z" en Geologica 14 (nombres 600 `--cq-night`, flechas `--cq-text-gold`, sin itálica), `hint`, líneas con el `<select>` de arranque (150 px) y el contador de series con "objetivo N", y el Subir como `CqButton variant="subir" small` a la derecha.
- **`CqSaveSheet`**: `q-dialog` desde abajo con su propia raíz `.cq-root.cq-sheet` clara (`--cq-surface-2`, radio 20 20 0 0), importa `conquer.scss`. Zona con scroll (`__scroll`) con kicker "Guardado", `.cq-title` "Sesión guardada", figura en una `.cq-card` (montada con `v-if="figureReady && zones > 0"`, intacto), "Hoy trabajaste N zonas", un `.cq-notice` por `techo` y la calibración (`CqButton` small "Aceptar" primary y "Ahora no" secondary); "Listo" (primary) vive en `__foot`, FUERA del scroll, así que nunca queda tapado. `max-height: 90vh`.
- **`CqBodyMap`**: principal `fill: var(--cq-night)`, secundaria `fill: var(--cq-edge-gold)` + `stroke: var(--cq-text-gold)`, leyenda `--cq-text-2`. Mismos selectores `:deep()`. `src/components/anatomy/*` y `src/css` sin cambios.
- **`ConquerTodayPage`**: raíz `CqScreen`, `CqPageHeader` "Hoy" con "{fecha} · {día}", avisos (`alreadySaved`, error + "Reintentar" con `CqButton` secondary small) como `.cq-notice`, finisher y molestia en una `.cq-card`, Guardar = `CqButton :loading="saving"` + `.cq-sub` centrado con fecha y día. Script: solo imports.
- **`ConquerSaturdayPage`**: mismo lenguaje; entrada en calor en una `.cq-card` con `.cq-kicker`, `sabado_combo` como `.cq-sub`, dos `CqComboCard` (máx. 13), molestia, "Guardar sábado" + `.cq-sub` ("Si algo cae..."). Sin mapa muscular. Script: solo imports.

## Gates

- Los tres `<automated>` imprimen `OK` (greps de estructura, regex LEGADO y FUENTES/COLORES vacías, `pnpm lint` 0 errores con los 2 warnings preexistentes de `boot/axios.ts` y `useSessionPlayer.ts`, `vue-tsc` sin nada en `src/modules/conquer`).
- `prettier --check` limpio sobre los 9 archivos. Los 9 bloques `<style>` compilan con `sass` (extraídos al scratchpad). Higiene (`console.*`, `any`, Google Fonts) sin hallazgos. `git diff origin/staging -- el-templo-app/src/components/anatomy el-templo-app/src/css` vacío. `git status --porcelain` vacío al cerrar.
- Tests de vitest: NO corridos (regla del proyecto). El plan no agrega ni cambia tests (solo template y estilos) y ningún test importa estos componentes, así que no hay mutantes que probar con node.

## Deviations from Plan

Ninguno de fondo. Decisiones chicas donde el plan dejaba margen (las más simples que cumplen la spec):

1. **Título y rótulo del combo**: `CqComboCard` mantiene la prop `title` ("Combo de apertura · al fallo", "Combo push · 3 máx + 10 drops") y la parte en la cabecera oscura: lo anterior a " · " va como kicker y lo posterior como título (primera letra en mayúscula: "Al fallo", "3 máx + 10 drops"). Sin " · " el título entero queda de kicker. Son dos `computed` de presentación; no cambia la API del componente.
2. **Cabecera de ejercicio sin kicker ni meta**: el API no trae meta del ejercicio (el sketch usaba un dato de maqueta). Quedó "N · Nombre" + templo, como el título que ya tenía.
3. **Sin énfasis `--cq-night` en la nota "la peor de tus 3 series"**: `CQ_TEXTOS.ayuda_carga` es un string plano y partirlo para poner un `<b>` duplicaría copy del anexo. La nota va entera en `--cq-text-2`.
4. **Título de la hoja**: "Sesión guardada" (`.cq-title`) con el kicker "Guardado"; "Hoy trabajaste N zonas" / "Tu sesión quedó registrada." va como línea debajo de la figura (como pide DA-32). Copy nuevo mínimo, igual al `aria-label` que ya tenía el diálogo.
5. **Techos como `.cq-notice`** (borde dorado de control) en vez de `.cq-sub` suelto, para que se lean como aviso.
6. **Chip neutro**: `cq-chip--neutro` siempre (antes el tono neutro no llevaba modificador); ahora se ve con el borde punteado del sketch (`.chip.sin`).
7. **Subir del combo alineado a la derecha** (`align-self: flex-end`, `max-width: 100%`): los nombres largos de peldaño envuelven dentro del botón.
8. `.cq-sheet` mantiene `padding` repartido: 16 16 4 en la zona con scroll y 12 16 24 en el pie, para que "Listo" quede fijo. Equivale al 16 16 24 de DA-32.

## Trampas para los planes 32-35

1. **`ConquerProgressPage` todavía usa `CqBodyMap`** (y `CqCounter`/`CqDayPicker` no). La figura ahora es azul noche y dorado PENSADA PARA FONDO CLARO: sobre el cielo oscuro del Progreso sin migrar el principal (`--cq-night`) se pierde. No "arreglarlo" en este plan; al migrar Progreso en 201-32/33 hay que ponerla en una `.cq-card` clara.
2. **Empates de especificidad otra vez** (la lección de 201-30 se aplica a utilidades tipo `.cq-card`/`.cq-select`, no solo a `.cq-dark`): `.cq-root .cq-card { gap: 12px }` y `.cq-root .cq-select { width: 100% }` valen (0,2,0), igual que `.mi-clase[data-v]`. Se resolvió con `.cq-ex.cq-card { gap: 0 }` (dos clases en el mismo elemento, SCSS `&.cq-card`) y `.cq-combo .cq-combo__select { width: 150px }` (padre delante). Y una sola clase con `.cq-dark`: `.mi-clase.cq-dark` (0,3,0 con el atributo) le gana a `.cq-root .cq-dark` para pisar `box-shadow`/`border`/`margin` de la pieza oscura suelta.
3. **Una cabecera `.cq-dark` dentro de una card** necesita `box-shadow: none`, `border: 0` y `margin: -16px -16px 0` propios (la pieza oscura suelta trae sombra 0 14px 30px y borde); la línea luminosa `::after` ya queda bien dentro de la cabecera.
4. **Un `h3` hay que fijarle `font-size`, `font-weight`, `line-height`, `letter-spacing` y `margin`**: Quasar tiene estilos globales de h1-h6.
5. **`CqButton` no tiene slot**: el texto de apoyo ("22/10 · Vertical") va en un `.cq-sub` debajo, en un contenedor columna con `gap: 8px`. Para un botón de ancho completo junto a otro, `class` en `CqButton` cae en el `<button>` raíz (los estilos scoped del padre le llegan).
6. **Hoja de diálogo con "botón siempre visible"**: raíz `.cq-root` con `display: flex; flex-direction: column; max-height: 90vh; overflow: hidden`, zona `flex: 1 1 auto; min-height: 0; overflow-y: auto` y pie `flex: none` fuera de la zona.
7. Si en 201-34 se borra el bloque LEGADO: Hoy, Sábado y sus seis componentes ya no usan ninguna clase ni token legado (regex LEGADO y FUENTES/COLORES vacías sobre los 9 archivos).

## Qué mirar a ojo en 201-35

- Picker de 5 días de Toro a 390 px en UNA fila y a 360 px (puede bajar la quinta): ficha de 56 px, estado arriba con alto fijo, label con `overflow-wrap: anywhere` ("Empuje"/"Tracción" largos).
- `<select>` nativos claros en iOS (apariencia propia con flecha dorada, 44 px, zoom de foco: 14 px, no 16, como el sketch; si iOS hace zoom al enfocar, subir a 16 px).
- Cabecera oscura con el templo: que el templo se llene con los escalones cargados y que la línea luminosa de abajo no corte la primera fila (Α).
- Aro de la letra griega (sobresale 3 px) a la izquierda de cada escalón; chip de estado a la derecha a 360 px con "Subir de progresión" (nowrap) junto a un título largo.
- Nombres largos de peldaño en el `<select>` del escalón (grilla 1.4fr/1fr a 360 px) y en el combo (150 px) junto al botón "Subir a {nombre}".
- Hoja de guardado: figura + techos + calibración con scroll interno y "Listo" fijo, a 360 px de ancho y con teclado cerrado; figura azul noche/dorada legible sobre el músculo sin trabajar.
- Sábado: sin mapa muscular (D-13) y la entrada en calor en una card.
- Guardar sin tocar nada sigue contando como cumplido (S12-2): contadores precargados con el objetivo.

## Para el orquestador

- No hay migración, dependencias nuevas ni tests nuevos; no se tocó STATE.md, ROADMAP.md ni memorias.
- Pendiente de CI: nada propio del plan (no hay tests que cubran estos componentes).
- Al planificar 201-32/33, ver la trampa 1 (Progreso usa `CqBodyMap` sobre fondo oscuro).

## Lecciones nuevas

- Para detectar empates de especificidad sin mirar el celular: compilar el `<style>` del componente (extraído con `awk` al scratchpad, `sass` de `el-templo-app/node_modules/.bin`) y comparar a mano contra las utilidades de `.cq-root` de `conquer.scss`. Un selector scoped de UNA clase (`.x[data-v]`) mide (0,2,0) y empata con `.cq-root .cq-card`/`.cq-select`; con dos clases mide (0,3,0) y gana.
- `prettier --write` sobre un `.vue` reescrito entero es seguro y reacomoda mustaches largos (`CqDayPicker`).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin rutas ni superficies nuevas. T-201-110 (doble Guardar) mitigado con `CqButton :loading="saving"` (deshabilita el botón) y el `saving` del composable, sin cambios de lógica. T-201-111 (componentes compartidos de anatomía) mitigado: solo `:deep()` desde `.cq-fig`; `git diff origin/staging -- el-templo-app/src/components/anatomy` vacío.

## Self-Check: PASSED
