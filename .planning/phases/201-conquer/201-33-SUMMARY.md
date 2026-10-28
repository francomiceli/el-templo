---
phase: 201-conquer
plan: 33
subsystem: app/conquer (Control físico y Evolución, variante B)
tags: [conquer, estetica-b, control-fisico, evolucion, scss, vue]
requires: [201-32]
provides:
  - Control físico en el templo clásico (cabecera oscura con la consigna, poses en cards claras, campos nativos claros)
  - Evolución con la hornacina como pieza oscura, segmentado claro, tabla clara y permiso con casillas claras
affects: [201-34, 201-35]
key-files:
  modified:
    - el-templo-app/src/modules/conquer/components/evolution/CqPoseCapture.vue
    - el-templo-app/src/modules/conquer/pages/ConquerBodyCheckPage.vue
    - el-templo-app/src/modules/conquer/components/evolution/CqCheckPhoto.vue
    - el-templo-app/src/modules/conquer/components/evolution/CqCompare.vue
    - el-templo-app/src/modules/conquer/components/evolution/CqPublishPermission.vue
    - el-templo-app/src/modules/conquer/pages/ConquerEvolutionPage.vue
metrics:
  tasks: 2
  commits: 2
---

# Phase 201 Plan 33: Control físico y Evolución (variante B) Summary

Las dos últimas pantallas del alumno (Control físico y Evolución) pasaron a `CqScreen` con el lenguaje del app y UNA pieza oscura
por pantalla. Solo template y estilos: en los `<script>` cambiaron únicamente imports (`CqSky`/`CqCloudButton` por
`CqScreen`/`CqButton`) y dos comentarios. La lógica (control perezoso, foto en memoria para reintentar, `skipDay0`,
`applyBodyCheck`, `TAB_ROUTE`, carga en frío, URL firmada local en `CqCheckPhoto`) está intacta (T-201-113).

## Commits

- `001113f8e` feat(201-33): control físico en el templo clásico (hallazgo 2) — `CqPoseCapture`, `ConquerBodyCheckPage`
- `c755be054` feat(201-33): Evolución en el templo clásico (hallazgo 2) — `CqCheckPhoto`, `CqCompare`, `CqPublishPermission`, `ConquerEvolutionPage`

## Qué quedó

- **Control físico:** `CqPageHeader` "Control físico" con la vuelta de hoy (al día 0 va a `/training`); cabecera `.cq-dark` (kicker
  "Control físico", título Montserrat 700 20 `--cq-on-night-hi` con "Día 0" o "Control de la semana N", y la consigna "Tres fotos y
  cuatro medidas. Te lleva menos de 3 minutos y podés hacerlo en otro momento."). Las 3 poses en `.cq-card` fila: recuadro de 64 px
  radio 12 (letra, spinner o ✓ en azul noche), borde 1.5px dashed `--cq-edge-gold` vacía / sólido al subir, `.cq-chip--hecha`
  "Foto guardada", error como `.cq-notice` con prefijo "!" (incluye el 503), "Sacar foto"/"Volver a sacar"/"Reintentar" como
  `CqButton secondary small` (el `aria-label` cae al `<button>`). Medidas en `.cq-card` con `<label>` visible y `input.cq-field`
  (16 px, `inputmode="decimal"`); error en `--cq-text` con "!" y borde `--cq-text-gold`. "Guardar control" `CqButton` primary con
  `:loading`; "Lo hago después" `.cq-textlink` de 13 px debajo (D-15).
- **Evolución:** `CqPageHeader`; `CqCompare` con `.cq-seg` (`role="tablist"`, botones `role="tab"` con `aria-selected` y
  `cq-seg__opt--on`, 44 px); UN `.cq-dark` (padding 10 10 14, gap 8, radio 16, línea dorada de la utilidad) con las dos hornacinas
  de 226 px radio 12 sobre `--cq-night-2` y rótulos `.cq-kicker` (oro claro por estar en oscuro); tabla en `.cq-card` con
  encabezados `.cq-kicker` 11 px, valores `.cq-num` 15 px `--cq-text`, cambio `--cq-text-2`, filas con borde `--cq-line` y primera
  columna con `overflow-wrap: anywhere`. `CqCheckPhoto`: "Cargando…"/"Sin foto"/error en `--cq-on-night-2` y "Reintentar" como
  `CqButton on-night small`. `CqPublishPermission` en `.cq-card`, casillas de 24 px `accent-color: var(--cq-night)`, filas de
  44 px y los textos de hoy. "Publicación" como `h2.cq-block-title`; "Hacer el control" `CqButton secondary`.

## Gates

- Tarea 1 y tarea 2: grep del `<automated>` (CqScreen, cq-dark, cq-field, inputmode, TAB_ROUTE, skipDay0, aria-selected, accent-color,
  regex LEGADO, FUENTES/COLORES, `console.`/`any`) OK; `pnpm lint` 0 errores (los 2 warnings preexistentes y ajenos de siempre);
  `vue-tsc` sin nada en `src/modules/conquer`. Extra: `prettier --check` OK sobre los 6 archivos y el `<style>` de cada uno compila
  con `sass` (extraído con `awk`).
- Criterio de aceptación de la tarea 2: `grep -rlE "CqSky|CqSun|CqCloudButton" src/modules/conquer --include=*.vue` lista SOLO
  `components/brand/CqSun.vue` (un comentario que nombra a `CqSky`). Los otros dos (`CqSky.vue`, `CqCloudButton.vue`) ya no se
  nombran a sí mismos. Ningún archivo fuera de `components/brand/` los importa ni los nombra (grep sobre todo `src`).
- Regex LEGADO de clases y tokens sobre todo `src/modules/conquer`: solo `CqSky.vue`, `CqSun.vue`, `CqCloudButton.vue` y el test
  `conquer-tokens.test.ts` (que nombra los tokens legados para medirlos). Es decir: **ningún archivo de pantalla ni de componente
  de feature sigue usando LEGADO.** Los consumidores del bloque LEGADO de `conquer.scss` son ahora solo esos tres componentes de
  marca viejos y el test.
- No se corrió vitest (corre en CI). Estas dos pantallas no tienen tests propios.

## Deviations from Plan

Ninguno de fondo. Decisiones chicas donde el plan dejaba margen (las más simples que cumplen la spec):

1. **Sin miniatura en la card de la pose.** DA-36 dice "con foto la miniatura con radio 12", pero la pantalla del control no tiene la
   foto en pantalla (se sube directo al bucket privado, la foto en memoria no se renderiza y la lógica no se toca). El recuadro de
   64 px (radio 12) muestra la letra / spinner / ✓ como hasta hoy con la hornacina. Si Franco quiere miniatura real hace falta un
   plan de lógica (guardar un object URL local), no de estilos.
2. **Título duplicado:** `CqPageHeader` dice "Control físico" y el kicker de la cabecera oscura también (el plan pide ambos). Si en el
   UAT molesta, cambiar el kicker a "Tus fotos y medidas" en una línea.
3. **Cabecera de Evolución:** `CqPageHeader` conserva el subtítulo "Día 0 contra el último control"; título en minúsculas con
   mayúscula inicial ("Antes y después") en vez de `ANTES Y DESPUÉS` (`.cq-title` no pone mayúsculas).
4. **Sin `cq-grow`:** con la utilidad legada fuera, el botón queda justo después del último bloque (no pegado abajo). El aire lo da el
   `gap` de `CqScreen`.
5. **Hornacina sin arco:** el plan pide radio 12 en la foto; se dejó rectangular con radio 12 (el arco de 120 px del cielo era parte
   de la variante vieja).
6. **Pestañas:** ahora son `role="tablist"` + `role="tab"` + `aria-selected` (antes `role="group"` + `aria-pressed`) y suman la clase
   `cq-seg__opt--on`, porque `.cq-seg` solo reconoce `aria-pressed`, `aria-checked` o la clase. Sin `tabpanel` asociado (el
   contenido es la misma sección que cambia de pose); es la mínima lectura de "como hoy" que cumple el verify.
7. **"Sin cara" apagada:** pasa de `opacity: .5` a `color: --cq-text-2` (regla de texto sólido); la casilla deshabilitada la
   atenúa el navegador.

Ninguna ambigüedad de producto nueva.

## Trampas para los planes 34-35

1. **Borrado del LEGADO (34):** además de `CqSky`, `CqSun`, `CqCloudButton` y el bloque LEGADO de `conquer.scss`, el test
   `styles/__tests__/conquer-tokens.test.ts` nombra los tokens legados (los mide): hay que ajustarlo en el mismo commit o se rompe.
   Ningún archivo de pantalla o componente de feature depende ya de clases ni tokens legados (regex vacía).
2. **`CqSun.vue` tiene un comentario que nombra `CqSky`** (línea 33): desaparece con el borrado, pero un grep del criterio de 34
   lo va a mostrar antes de borrar.
3. **`.cq-seg` solo marca la opción elegida con `aria-pressed`, `aria-checked` o `--on`**: `aria-selected` NO alcanza; por eso
   `CqCompare` suma la clase.
4. **Hijos de `CqButton` con `class` o atributos:** `aria-label` cae al `<button>` raíz (lo usa `CqPoseCapture`); `CqButton` no tiene slot.
5. **`.cq-notice` dentro de una `.cq-card`** (el error de la pose) funciona si se le baja el padding y se le pone `margin: 0` con
   un selector de mayor especificidad (`.cq-pose .cq-pose__notice`); la utilidad es `flex-wrap`, así que el texto largo del 503
   necesita `overflow-wrap: anywhere`.
6. **Primera columna de la tabla de Evolución:** `.cq-compare__label` con `min-width: 0` + `overflow-wrap: anywhere`; las otras
   tres siguen en 60/60/78 px (sin cambio de grilla).

## Qué mirar a ojo en 201-35

- **Control físico (390 y 360 px):** cabecera oscura (el título "Control físico" aparece dos veces: header y kicker), cards de pose en
  fila con el recuadro de 64 px y los dos botones ("Reintentar" + "Sacar foto") bajando limpio a 360 px; borde punteado dorado de la
  card vacía y sólido al subir.
- **Aviso 503** ("Las fotos no están disponibles por ahora..."): `.cq-notice` dentro de la card, legible y sin cortarse; las medidas
  se guardan igual.
- **Campos en iOS:** `input.cq-field` de 16 px (sin zoom al enfocar), `inputmode="decimal"` abre el teclado numérico con coma;
  campo con error con borde `--cq-text-gold` de 1.5 px + 1 px de sombra y texto "! ..." debajo; la unidad ("cm"/"kg") a la derecha.
- **"Lo hago después":** chico y a la vista debajo de "Guardar control" solo con el día 0 pendiente; el botón de guardar deshabilita
  mientras sube una foto ("Esperá a que termine la foto").
- **Evolución a 360 px:** hornacinas de 226 px en dos columnas dentro del marco oscuro (ancho ≈ 140 px cada una), rótulos "Día 0 /
  Semana N" en oro claro, línea dorada de abajo sin cortar el rótulo; tabla de medidas con nombres largos (los rótulos vienen del API) partiendo la palabra y "−0,5 cm"/"+10,5 cm" entrando en 78 px.
- **Casillas del permiso:** 24 px azul noche, fila de 44 px, "Publicar sin mi cara" apagada (texto más suave) hasta autorizar; que al
  fallar el API la casilla vuelve atrás.
- **Pestañas Frente/Perfil/Espalda:** segmentado claro con la elegida en azul noche; foco con aro azul noche sobre claro.
- **Sin control hecho:** la card de "Todavía no hiciste ningún control." y el botón "Hacer el control" (secundario) al final.

## Para el orquestador

- No hay migración, dependencias nuevas ni tests nuevos; no se tocó STATE.md, ROADMAP.md ni memorias.
- Pendiente de CI: nada propio del plan.
- Con 201-33 ninguna pantalla del alumno usa cielo, sol ni nubes: 201-34 puede borrar `CqSky`, `CqSun`, `CqCloudButton` y el bloque
  LEGADO sin migrar nada más (ajustando el test de tokens).
- Decisión opcional de Franco: miniatura real de la foto en la card de la pose (desvío 1, requiere lógica).

## Lecciones nuevas

- Un componente cuya raíz es `.cq-card` y necesita fila o borde propio: poner las dos clases en el mismo elemento
  (`class="cq-pose cq-card"`) y escribir `.cq-pose.cq-card { ... }` en el scoped (0,3,0 con el atributo) en vez de pelear con `:deep`.
- `.cq-dark` suelto como marco de una grilla (`.mi-clase.cq-dark { display: grid; padding }`) conserva la línea luminosa `::after`:
  dejar `padding-bottom` mayor para que no pise el rótulo de abajo.
- `prettier --check` sobre los `.vue` reescritos enteros dio limpio a la primera con el formato a mano.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno (sin cambios de lógica, red ni almacenamiento; la URL firmada sigue en una variable local de `CqCheckPhoto` y no se loguea).

## Self-Check: PASSED

- Los 6 archivos modificados existen; los commits `001113f8e` y `c755be054` existen en la rama `feat/201-conquer`.
