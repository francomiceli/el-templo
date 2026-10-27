---
phase: 202-conquer-tutoriales-correcciones
plan: 12
subsystem: app
tags: [conquer, app, tutorials, video-sheet]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: store con tutoriales (202-11) y GET /tutorials (202-07)
provides:
  - CqVideoSheet, hoja de video reusable (tutoriales y correcciones)
  - CqTutorialButton, "Ver cómo se hace" que se esconde solo sin tutorial
  - el botón en Hoy, Progreso y combos (apertura y sábado), con carga de tutoriales al montar
affects: [202-13, 202-14, 202-15]
key-files:
  created:
    - el-templo-app/src/modules/conquer/components/media/CqVideoSheet.vue
    - el-templo-app/src/modules/conquer/components/media/CqTutorialButton.vue
  modified:
    - el-templo-app/src/modules/conquer/components/today/CqExerciseCard.vue
    - el-templo-app/src/modules/conquer/components/today/CqComboCard.vue
    - el-templo-app/src/modules/conquer/components/progress/CqExerciseProgress.vue
    - el-templo-app/src/modules/conquer/pages/ConquerTodayPage.vue
    - el-templo-app/src/modules/conquer/pages/ConquerProgressPage.vue
    - el-templo-app/src/modules/conquer/pages/ConquerSaturdayPage.vue
    - el-templo-app/src/modules/conquer/styles/conquer.scss
key-decisions:
  - "El botón vive en un contenedor propio con la hoja adentro; sin URL no renderiza ni el contenedor"
  - "Una URL vacía con loading=false se trata como 'Video no disponible'"
duration: 20min
completed: 2026-10-27
---

# Phase 202 Plan 12: "Ver cómo se hace" en el app Summary

**Hoja de video reusable `CqVideoSheet` (raíz `.cq-root` propia, `<video playsinline controls preload="metadata">`, "Video no disponible") y botón `CqTutorialButton` que lee el store y desaparece sin tutorial, puesto en el ejercicio de Hoy, el de Progreso y el combo (apertura y sábado).**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `996d90cdf` | feat(202-12): hoja de video y botón "Ver cómo se hace" de Conquer (D-25) |
| 2 | `6d2d89b22` | feat(202-12): "Ver cómo se hace" en Hoy, Progreso y combos (D-25) |

## Contrato de `CqVideoSheet` (para 202-13)

Props: `modelValue: boolean`, `title: string`, `url: string | null`, `loading?: boolean` (default `false`), `unavailable?: boolean` (default
`false`). Emit: `update:modelValue` (`v-model`). Importa `conquer.scss` y lleva su propia raíz `.cq-root.cq-vsheet`.

- `loading` -> spinner y "Cargando el video". Tiene prioridad sobre el resto.
- `unavailable`, error del `<video>` o `url` nula -> "Video no disponible" (sin rojo). Para correcciones: el padre abre la hoja con
  `loading` mientras pide `getCorrectionVideoUrl(id, who)`, pasa la `url` firmada al llegar y `unavailable` si vino `available: false`.
  El texto es siempre "Video no disponible"; si 202-13 quiere "Este video ya no está disponible" (D-28) para el caso borrado, hay que sumar
  una prop de mensaje o resolverlo en la pantalla (hoy el texto es fijo).
- Pausa el video cuando `modelValue` pasa a `false`; al abrir de nuevo (o al cambiar `url`) se limpia el estado de error. No hay autoplay.
- Loguea `log.warn('tutorial video failed')` sin URL ni datos. El mensaje dice "tutorial" aunque la hoja la use también 202-13.

`CqTutorialButton` props: `exerciseId?: number`, `comboKey?: ComboKey`, `name: string`. Título de la hoja: `Cómo se hace: {name}`.

## Desvíos del plan

- Los estilos de la hoja están **scoped en `CqVideoSheet.vue`**, no en `conquer.scss`: la raíz de la hoja es el mismo elemento que `.cq-root`, y
  un selector anidado `.cq-root .cq-vsheet` (descendiente) no lo matchea. Es el molde de `CqSaveSheet`. En `conquer.scss` (dentro de
  `.cq-root`) quedaron `.cq-tutorial`, `.cq-tutorial__btn` y `.cq-tutorial__icon`, compartidos por los tres lugares.
- El verify de la tarea 2 incluye `git diff --name-only origin/staging -- el-templo-app/src/css ...` vacío: **da `el-templo-app/src/css/app.scss`**
  por los commits de master ya mergeados en la rama (`4b40dbba0`, `aa5a92861`), no por este plan (`git diff HEAD -- el-templo-app/src/css` vacío).
  Ese gate no se puede cumplir tal cual en esta rama; contra `HEAD` sí.
- El verify de la tarea 1 tiene `! grep "autoplay"` sin filtrar comentarios (trampa 8 de 202-02): reescribí un comentario que la nombraba.
- Sin tests: el plan no los pide y el app no tiene `@vue/test-utils` ni tests de componentes. Sin mutantes.

## Ambigüedades nuevas (opción más simple)

1. En `CqExerciseCard` el botón va dentro de la cabecera oscura (debajo del nombre, el templo queda a la derecha): se envolvió el nombre en un
   `div.cq-ex__title` en columna. En `CqComboCard` va dentro de la cabecera oscura, después del título. En `CqExerciseProgress`, entre el nombre
   y las filas, sobre fondo claro.
2. `aria-label` del botón: `Ver cómo se hace: {name}` (empieza por el texto visible).
3. El ícono de play es un SVG inline con `fill: currentColor` (hereda el color claro en la cabecera oscura y el azul noche afuera).

## Gates

`pnpm lint` 0 errores (2 warnings preexistentes ajenos en `boot/axios.ts` y `useSessionPlayer.ts`); `vue-tsc` filtrado por `src/modules/conquer` y
`modules/training` vacío; prettier OK sobre los 9 archivos; greps de higiene (`console.*`, `any`, `v-html`, CDN, `font-family` literal) vacíos;
`src/css`, `components/anatomy` y `package.json` sin cambios propios.

## Trampas para 202-13 y 202-14

1. Reusar `CqVideoSheet` tal cual (en `components/media/`). No pide la URL: el padre tiene su propia instancia de `useConquerApi()` y llama
   `api.cleanup()` al desmontar. No guardar ni loguear la URL firmada.
2. `CqTutorialButton` no se puede reusar para correcciones (lee el store). Si hace falta un botón "Ver mi video"/"Ver la respuesta", armarlo
   en 202-13 con `.cq-textlink` (44 px) y abrir `CqVideoSheet` con `loading` hasta que llegue la URL.
3. La hoja es `position="bottom"` con `max-height: 90vh` y el video a `max-height: 70vh`; un video vertical de teléfono (9:16) en 390 px de ancho
   queda a `70vh` de alto con barras laterales oscuras (`object-fit: contain`): es lo esperado.
4. El `<video>` solo se monta cuando hay URL y no hay `loading`/`unavailable`. Al cerrar el `q-dialog` se destruye al terminar la transición y
   el `pause()` corre en el mismo instante en que `modelValue` pasa a `false`.
5. `loadTutorials()` ya corre en Hoy, Progreso y Sábado: otras pantallas que quieran el botón deben llamarla al montar (idempotente).
6. Tocar el botón dentro de la cabecera oscura de `CqExerciseCard`/`CqComboCard`: no hay handler de click en la cabecera, no hace falta
   `.stop`. Si 202-13 mete algo clickeable en una cabecera, mantener la misma estructura.
7. Los estilos globales del botón (`.cq-tutorial*`) viven en `conquer.scss`; los de la hoja son scoped. Una hoja nueva de 202-13 (formulario
   de subida) sigue el molde de `CqSaveSheet`/`CqVideoSheet`: raíz `.cq-root`, scoped.

## Para mirar a ojo en el UAT (202-15)

- Con tutorial cargado y sin él, en Hoy, Progreso, apertura y sábado: sin tutorial no debe haber botón ni hueco extra.
- Altura de la cabecera oscura de Hoy con el botón (44 px) y que el templo no se corra ni quede centrado raro; título largo a 390 px.
- Reproducción en línea en iPhone (que no se abra a pantalla completa sola; `playsinline`) y en Android; un video que no baja -> "Video no
  disponible".
- Cerrar la hoja con "Cerrar", con el fondo y con el botón atrás de Android: el audio se corta.
- Un video vertical y uno horizontal dentro de la hoja; la hoja con el teclado de gestos de iOS (`safe-area-inset-bottom`).
- Que la hoja se vea con los tokens de Conquer (azul noche, Montserrat en el título) y no con el estilo por defecto de Quasar.
- Pestaña Network: un solo `GET /tutorials` al navegar entre Hoy, Sábado y Progreso.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Los 2 archivos nuevos y los 7 modificados presentes; commits `996d90cdf` y `6d2d89b22` en `git log`.
