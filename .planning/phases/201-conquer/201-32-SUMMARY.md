---
phase: 201-conquer
plan: 32
subsystem: app/conquer (Progreso, variante B)
tags: [conquer, estetica-b, progreso, scss, vue]
requires: [201-31]
provides:
  - Progreso en el templo clásico (KPIs oscuros, "Hoy toca subir" con cabecera oscura, detalle por escalón claro)
  - CqSparkline con puntos circulares que no se ovalan en pantallas anchas (S12-9)
affects: [201-33, 201-34, 201-35]
key-files:
  modified:
    - el-templo-app/src/modules/conquer/components/progress/CqSubirCard.vue
    - el-templo-app/src/modules/conquer/components/progress/CqExerciseProgress.vue
    - el-templo-app/src/modules/conquer/components/progress/CqSparkline.vue
    - el-templo-app/src/modules/conquer/pages/ConquerProgressPage.vue
metrics:
  tasks: 2
  commits: 2
---

# Phase 201 Plan 32: Progreso (variante B) Summary

Quinta parte del hallazgo 2: Progreso con la página y las cards del app. Las piezas oscuras son los dos KPIs y la cabecera de "Hoy toca subir"; Subir es salvia sólido (`CqButton variant="subir"`, el único verde junto al chip SUBIR); el detalle por escalón va en claro con disco griego, peldaño, "última → **siguiente**" y chip. Solo template y estilos: props, emits, `useConquerProgress`, `progressView.ts`, `sparklinePoints`, los Notify y la carga en frío quedaron como estaban.

## Commits

| Tarea | Commit | Mensaje |
| --- | --- | --- |
| 1 | `d3c77531b` | `feat(201-32): componentes de Progreso en el templo clásico (Subir, escalones, curva)` |
| 2 | `d836e08e1` | `feat(201-32): Progreso de Conquer en el templo clásico (hallazgo 2)` |

El SUMMARY se commitea aparte con `docs(201-32)`.

## Qué quedó

- **`CqSubirCard`**: `.cq-card` (`&.cq-card { gap: 0 }`) con cabecera `.cq-subir__head.cq-dark` pegada arriba (`margin: -16px -16px 0`, sin sombra ni borde, como `CqExerciseCard`): `.cq-kicker` "Hoy toca subir" + `h3` Montserrat 700 17 en `--cq-on-night`. Filas con "{ejercicio} · E{n}" (600) y "de → a" en `.cq-sub`; `CqButton variant="subir" small` con `:disabled="busyKey !== null"` y `:loading="busyKey === <clave de la fila>"` (T-201-112). Tope sin destino: el texto de hoy, sin botón. Se quitó `.cq-card--sel`.
- **`CqExerciseProgress`**: `h3` Montserrat 700 15 `--cq-text` (con `font-size/weight/line-height/letter-spacing/margin` fijados por los estilos globales de Quasar); filas `.cq-pe__row` de 44 px: `CqGreek size="sm"` + "E{n} · {peldaño}" + "{última} → **{siguiente}**" (`.cq-num` 15 px) + chip `cq-chip--*` a la derecha (tonos sin cambios); el texto con `min-width: 0` y `overflow-wrap: anywhere`, el chip ya trae `flex: none`. Curva + "Escalón 1, últimas N sesiones" (`.cq-sub` 12).
- **`CqSparkline`**: línea `stroke: var(--cq-night)` 2 px y techo punteado `--cq-edge`, ambos con `vector-effect: non-scaling-stroke`, en un `<svg preserveAspectRatio="none" aria-hidden>`. Los puntos ya no son `<circle>`: son `span` redondos (9 px, relleno `--cq-deco-gold`, borde 1.2 px `--cq-night`) posicionados en % (`x/WIDTH`, `y/HEIGHT`) sobre el mismo contenedor. `role="img"` y `aria-label` pasaron al `div` contenedor. `sparklinePoints` no cambió.
- **`ConquerProgressPage`**: raíz `CqScreen`; `CqPageHeader` "Progreso" con subtítulo "Semana N del bloque"; dos KPIs `.cq-progress__kpi.cq-dark` (radio 16, padding 14 16, número `.cq-num` 36 px en `--cq-on-night-hi`, rótulo y Δ `.cq-sub`); vacío en `.cq-card` con `router-link` `.cq-textlink`; calibraciones en `.cq-card` clara con `.cq-kicker` y `CqButton` small Aceptar (primary, `:loading`) / Ahora no (secondary); "Tu semana" = `h2.cq-block-title` + `.cq-card` clara con `CqBodyMap` (figura sobre fondo claro, DA-33) o el vacío; cada día es una `.cq-card` con `.cq-progress__dayh` (nombre en `.cq-block-title` y "N sesiones" en `.cq-sub`). Error de carga: `.cq-notice` + `CqButton` "Reintentar". Se fueron `CqSky`, `.cq-caps`, `.cq-rule`, `.cq-display`, `.cq-small` y el alto mínimo del cielo.

## Gates

- Tarea 1 y 2: ambos `<automated>` imprimen `OK` (greps de estructura, regex LEGADO y FUENTES/COLORES vacías, `pnpm lint` 0 errores con los 2 warnings preexistentes ajenos de `boot/axios.ts` y `useSessionPlayer.ts`, `vue-tsc` sin nada en `src/modules/conquer`).
- Los 4 bloques `<style>` compilan con `sass` (extraídos al scratchpad). `prettier --check` limpio sobre los 4 archivos. Sin `fonts.googleapis/gstatic`, `console.*` ni `any`. `git diff origin/staging -- el-templo-app/src/css el-templo-app/src/components/anatomy` vacío. `git status --porcelain` vacío al cerrar.
- Tests de vitest: NO corridos (regla del proyecto). El plan no agrega ni cambia tests y ningún test importa estos componentes (grep sobre `src/modules/conquer`), así que no hay mutantes que probar con node.

## Deviations from Plan

Ninguno de fondo. Decisiones chicas donde el plan dejaba margen (las más simples que cumplen la spec):

1. **Puntos de la curva como `span` HTML, no `<circle>` en un segundo `<svg>`** (el plan lo dejaba a criterio): un segundo SVG sin estirar no tiene forma simple de ubicar los puntos en proporción al ancho; un `span` con `left/top` en % queda siempre circular y es la alternativa más simple con el mismo resultado. Alto de la curva 48 px (el sketch usa 46).
2. **Subtítulo "Semana N del bloque" leído del store sin cargarlo**: `GET /progress` no trae la semana del bloque; se lee `conquerStore.state?.member?.blockWeek` (sumó un `computed` y el import del store al script, que el plan quería "solo imports"). Si la página se abre en frío y el store todavía no tiene el estado, no hay subtítulo (no se dispara ninguna carga, para no tocar la lógica de carga). Si Franco lo quiere siempre, sumar `loadState()` como en `ConquerBodyCheckPage`.
3. **Título de "Hoy toca subir"**: "Un escalón listo" / "N listos para subir" como pide DA-35, más "Un combo listo" cuando lo único pendiente es un combo (un `computed` de presentación; el total sale de `steps + combos`).
4. **Spinner**: el spinner de la carga de página usa `--cq-edge-gold` (el que quedó en Hoy); los de los botones los trae `CqButton`.

Ninguna ambigüedad de producto nueva.

## Trampas para los planes 33-35

1. **`CqButton` con `class`**: la clase del padre cae en el `<button>` raíz y los estilos scoped le llegan (usado para `flex: none; min-width: 88px`). `CqButton` deshabilitado baja a `opacity .55`: mientras corre una acción, los otros Subir se ven apagados (comportamiento de 201-28, no lo toques acá).
2. **Empate de especificidad otra vez**: `.cq-sub` (0,2,0) vs `.mi-clase` scoped (0,2,0): para pisar tamaño o margen de un `.cq-sub` usar `&__curve.cq-sub` (dos clases en el mismo elemento) o `.padre .cq-sub` (los hijos del propio template llevan el atributo `data-v`, así que `.mi-padre .cq-sub` mide 0,3,0).
3. **Número grande dentro de `.cq-dark`**: `.cq-root .cq-dark .cq-num` (0,3,0) fija el color; el tamaño no lo toca, así que `.mi-kpi.cq-dark .cq-num { font-size }` sirve sin pelear.
4. **`.cq-dark` suelto como KPI**: `.mi-clase.cq-dark` pisa radio y padding; la sombra y el borde de la pieza oscura quedan (como pide el sketch para los KPIs).
5. **Puntos o marcas encima de un SVG estirado**: no usar `<circle>` si el SVG tiene `preserveAspectRatio="none"`: ovala. Línea en el SVG con `vector-effect: non-scaling-stroke` y las marcas en HTML con `%`.
6. 201-34 (borrado del LEGADO): Progreso y sus 3 componentes ya no usan ninguna clase ni token legado (regex LEGADO vacía sobre los 4 archivos).

## Qué mirar a ojo en 201-35

- KPIs a 390 y 360 px: "82 %" a 36 px en una columna de ~170 px y el Δ en una línea ("Δ +0,4 en promedio" puede bajar a dos renglones, es esperado).
- "Hoy toca subir": cabecera oscura sin cortar el borde superior de la card (radio 16), línea luminosa de abajo dentro de la cabecera, y fila con nombre largo de peldaño ("Subir" de 88 px a la derecha; el texto envuelve).
- Fila de escalón a 360 px: disco griego sm con su aro, "E1 · {peldaño largo}" y el chip ("Subir de progresión" es el más ancho) sin cortarse.
- Curva en pantallas anchas (tablet/escritorio): puntos redondos, línea fina, sin ovalarse (hallazgo S12-9); con un solo punto, queda centrado y sin línea.
- Figura de la semana: azul noche/dorado legibles sobre la card blanca y sobre el músculo sin trabajar.
- Día sin sesiones o alumno sin datos: vacío con "Ir a Hoy" como enlace de texto de 44 px.

## Para el orquestador

- No hay migración, dependencias nuevas ni tests nuevos; no se tocó STATE.md, ROADMAP.md ni memorias.
- Pendiente de CI: nada propio del plan.
- Decisión opcional de Franco: el subtítulo "Semana N del bloque" solo aparece si el store ya cargó el estado (desvío 2).

## Lecciones nuevas

- Para validar el SCSS de un componente sin levantar nada: `awk '/<style/{f=1;next}/<\/style>/{f=0}f' archivo.vue > x.scss` y `el-templo-app/node_modules/.bin/sass --no-source-map x.scss` (los tokens son `var()`, no hacen falta imports).
- `prettier --write` sobre los 4 archivos reescritos dejó todo sin cambios: el formato a mano (sin `;`, comillas simples, ancho 100) alcanzó.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin rutas ni superficies nuevas. T-201-112 (doble toque en Subir) mitigado: `busyKey` de `useConquerProgress` sin cambios, todos los botones se deshabilitan mientras hay una acción y `CqButton` muestra `:loading` en el activo.

## Self-Check: PASSED
