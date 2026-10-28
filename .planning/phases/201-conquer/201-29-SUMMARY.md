---
phase: 201-conquer
plan: 29
subsystem: app/conquer (guía "¿Cómo funciona?")
tags: [conquer, guia, estetica-b, router, vue]
requires: [201-27, 201-28]
provides:
  - ConquerGuidePage (ruta conquer-guia) y CqGuideArt / CqGuideRuns
  - vista 'guia' en resolveConquerView y redirect desde ConquerTab
affects: [201-30, 201-35]
key-files:
  created:
    - el-templo-app/src/modules/conquer/pages/ConquerGuidePage.vue
    - el-templo-app/src/modules/conquer/components/guide/CqGuideArt.vue
    - el-templo-app/src/modules/conquer/components/guide/CqGuideRuns.vue
  modified:
    - el-templo-app/src/modules/training/routes.ts
    - el-templo-app/src/modules/conquer/utils/conquerView.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/conquerView.test.ts
    - el-templo-app/src/modules/conquer/components/ConquerTab.vue
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 29: guía "¿Cómo funciona?" (pantalla, ruta y disparo único) Summary

Segunda parte del hallazgo 1 del UAT: la guía de 6 pantallas (5 para Ternero y Novillo) como pieza oscura a pantalla completa
(sketch 022 B), su ruta `training/conquer/como-funciona` (`conquer-guia`) y el disparo una sola vez después del día 0. El acceso
fijo desde Inicio queda para 201-30.

## Commits

| Tarea | Commit | Mensaje |
| --- | --- | --- |
| 1 | `9ae41df4d` | `feat(201-29): ilustraciones de la guía de Conquer (DA-28)` |
| 2 | `d9f7fc686` | `feat(201-29): pantalla de la guía ¿Cómo funciona? (DA-23, DA-26, DA-27)` |
| 3 | `4d3c5fc68` | `feat(201-29): la guía aparece una vez después del día 0 (DA-22)` (incluye el test) |

El SUMMARY se commitea aparte con `docs(201-29)`.

## Qué quedó

- **`CqGuideArt`** (`components/guide/`): props `{ screen: GuideKey; level: Level | null }`, un `<template v-if>` por pantalla, raíz
  `aria-hidden`. Rótulos de escalones, series, cadena Press/Push/Hold y escala 0..10 son del dibujo; todo texto del método sale de
  `CQ_TEXTOS`, `GUIDE_*`, `guideLevelLine`, `estadoChip` y `GREEK_STEP`. El 5 de "anotás la peor" se calcula (`Math.min` de las series
  del ejemplo). El "Subir" es un `<span class="cq-btn cq-btn--subir cq-btn--small">`, sin `<button>`.
- **`CqGuideRuns`** (nuevo, no estaba en el plan): `<p>` que pinta un `GuideRun[]` con `<strong v-if="run.strong">`. Existe para no duplicar
  el `v-for` de lead, foot y la nota "La volvés a ver…" (DRY). El énfasis va en `--cq-on-night-hi`: es solo para la pantalla oscura.
- **`ConquerGuidePage`**: raíz `<div class="cq-root cq-guide" role="region" aria-label="Cómo funciona Conquer">`, barras de progreso
  (`aria-hidden`), "Saltar" (visibility hidden en la última), kicker, `h2 tabindex="-1"` (recibe el foco y el scroll vuelve arriba al cambiar
  de pantalla), lead, la card blanca con `role="img"` + `artLabel`, foot (no se pinta si `foot.length === 0`) y, en la última, la nota de
  dónde volver a verla. Abajo `Atrás` (ghost-night, oculto en la primera) y `Siguiente` / `Listo, a entrenar` (on-night) en grilla `1fr 1.6fr`.
- **`finish()`** (Listo y Saltar): `finishing` bloquea el doble toque; `if (member.guideSeen === false) await store.markGuideSeen()` y
  `router.replace('/training?tab=conquer')`. Entrando desde Inicio (guía ya vista) no llama al API.
- **Carga en frío**: si no hay `store.state` hace `loadState()`; si la vista es `bloqueado`, `pedido` o `cargando` (falló la carga) vuelve a la tab.
  Mientras tanto se pinta un spinner (`role="status"`), para que la pantalla no parpadee con 5 pantallas y después pase a 6 (Toro).
- **`resolveConquerView`**: `activo` + `mustPromptDay0` → `dia0`; `activo` + `member?.guideSeen === false` → `guia`; si no `inicio`. Se usa
  `=== false` (no `!guideSeen`) para que un `activo` sin `member` siga yendo a `inicio` como antes.
- **`ConquerTab`**: `else if (view === 'guia') router.replace({ name: 'conquer-guia' })` en el mismo watch inmediato que `dia0`.
- **Consumidores de `store.view`** revisados con grep: `ConquerBodyCheckPage` y `ConquerEvolutionPage` solo redirigen con `bloqueado`/`pedido`; la
  plantilla de la tab muestra Inicio solo con `inicio` y cae al spinner con `guia` (igual que con `dia0`). Nada exige `inicio`.
- **Día 0 → guía**: `ConquerBodyCheckPage` ya vuelve a la tab (`TAB_ROUTE`) tras guardar y tras "Lo hago después" (`applyBodyCheck` antes), así que
  la guía aparece sin tocar esa página.

## Gates

- Tarea 1, 2 y 3: los tres `<automated>` imprimen `OK` (greps, `pnpm lint` 0 errores con los 2 warnings preexistentes ajenos, `vue-tsc` sin nada en
  `src/modules/conquer` ni `modules/training/routes`).
- Higiene sobre los archivos nuevos (`console.*`, `any`, `fonts.g*`, `rgba` como `color:`, `v-html`): sin hallazgos (la única mención de `v-html`
  es un comentario de `CqGuideRuns`).
- `prettier` aplicado por ruta explícita sobre los 6 archivos. `git status --porcelain` vacío al cerrar.
- Tests de vitest: NO corridos (regla del proyecto). Escrito: casos nuevos en `conquerView.test.ts`.

## Mutation testing (tarea 3)

Replicado en node (`--experimental-strip-types`) con una copia de `conquerView.ts` en el scratchpad y un script que replica los 8 casos del
test; base `OK`. El repo no se tocó. RED previo: con el código viejo falla el caso 2 (`inicio != guia`).

| # | Mutante | Resultado | `expect` de CI que lo atrapa |
| --- | --- | --- | --- |
| 1 | `guia` antes que `dia0` | falla el caso 1 (`guia != dia0`) | `conquerView.test.ts:88` (fila "día 0 pendiente y guía sin ver") |
| 2 | ignorar `guideSeen` (siempre `inicio`) | falla el caso 2 (`inicio != guia`) | `:88` (fila "día 0 resuelto y guía sin ver") |
| 3 | `!guideSeen` en vez de `=== false` | falla el `activo` sin `member` (`guia != inicio`) | `:66` (`['activo', 'inicio']` con `stateWith`) |
| 4 | `guia` siempre | falla la guía vista y el `activo` sin `member` | `:88` (fila "guía vista") y `:66` |

## Deviations from Plan

1. **`CqGuideRuns.vue` extra** (ver arriba): una pieza chica que el plan no listaba, para no repetir el pintado de `GuideRun[]` tres veces.
2. **`height` y no `min-height` en la raíz de la guía.** DA-27 dice "alto mínimo como `ConquerLevelsPage`", pero con el cuerpo en
   `overflow-y: auto` hace falta un alto fijo (si no, el cuerpo crece y los botones se van debajo del pliegue). Misma fórmula:
   `calc(var(--app-vh) - 50px - var(--mobile-tabs-height))`. Si en el UAT el alto no cuadra con el layout, mirar ahí.
3. **El comentario del componente no nombra `q-dialog`**: el `<automated>` de la tarea 2 hace `! grep q-dialog` sobre el archivo, y los
   comentarios también matchean (lección 201-28). Dice "diálogo de Quasar".
4. **Spinner mientras se carga el estado** (no estaba en el plan; ver arriba).
5. Los rótulos de los escalones van en dos líneas ("Escalón 1" / "el más difícil") como en el sketch, no en una línea con "·".
6. En la pantalla 3 la nota de fallo se arma `{ejemplos} {regla}` en un solo `<span>` (sin el `<em>` del sketch): lo más simple que cumple la spec.

Ninguna ambigüedad de producto nueva.

## Trampas para los planes 30-35

1. **Cualquier pantalla que abra la guía desde Inicio (201-30)** hace `router.push({ name: 'conquer-guia' })`. Con `guideSeen === true` la página no
   llama al API y al terminar hace `router.replace('/training?tab=conquer')` (no vuelve atrás en el historial). Si 201-30 quiere que "Listo" vuelva
   a Inicio sin recargar, ya lo hace: la tab lee el estado en memoria.
2. **`loadState()` pisa `guideSeen`**: `markGuideSeen()` marca en memoria aunque el API falle, pero la tab vuelve a pedir el estado al montarse y,
   si el API NO lo guardó (500 solo en `/guide-seen` con el resto sano), el servidor dice `false` y la tab manda otra vez a la guía. Con el API
   caído del todo `loadState` falla y conserva el estado en memoria (sin bucle). Se aceptó (DA-21: "la próxima carga se la vuelve a ofrecer").
3. **Orden de los hooks**: la página usa `onBeforeUnmount(store.cleanup)`; el `cleanup` de la página saliente corre antes del `onMounted` de la tab
   que entra, así que no cancela su `loadState`. Una página nueva que abra la tab con `replace` puede usar el mismo patrón.
4. **`.cq-root :focus-visible` es azul noche**: sobre fondo oscuro el aro no se ve. La guía lo cambia con `.cq-guide :deep(:focus-visible)`. Cualquier
   otra pieza oscura de 201-30..33 (el pórtico ya lo cubre dentro de `.cq-dark`) con controles propios necesita lo mismo.
5. **"Atrás" oculto en la primera pantalla**: se envolvió el `CqButton` en un `div` con `visibility: hidden` (no se tocó `CqButton`). Oculto así no
   se enfoca ni lo lee el lector de pantalla, y la grilla `1fr 1.6fr` no se mueve.
6. `CqGuideArt` depende de `.cq-chip`, `.cq-btn--subir` y `.cq-num` de `conquer.scss`: si 201-34 toca esas utilidades, la guía las usa.

## Qué mirar a ojo en 201-35

- Las 6 pantallas (5 de Ternero/Novillo) a 390 y 360 px: sin scroll horizontal; los 4 escalones y la escala de 11 fichas entran a 360.
- Alto de la página: que el cuerpo haga scroll adentro y "Atrás/Siguiente" queden siempre visibles (ver desvío 2).
- Foco al título al cambiar de pantalla con lector de pantalla (VoiceOver/TalkBack) y que el aro de foco de los botones se vea sobre el azul noche.
- La guía NO aparece antes del día 0, y con "Lo hago después" aparece al volver a la tab. Con la base local de Franco (user 28, ya activado) debería
  verse una vez después de aplicar la 0294.
- Que "Saltar" y "Listo, a entrenar" no la vuelven a mostrar al reabrir la tab (y que con el API caído no hay bucle en la misma sesión).
- La pantalla "Apertura y sábado" solo para Toro; el "Subir" del dibujo no responde al toque.

## Para el orquestador

- No hay migración ni dependencias nuevas; no se tocó STATE.md, ROADMAP.md ni memorias. Falta aplicar la 0294 en la base LOCAL (lo dejó dicho 201-27).
- Pendiente de CI: `conquerView.test.ts` (casos nuevos). Corrido solo con un shim en node.

## Lecciones nuevas

- Un comentario que nombra algo prohibido por un grep de verify rompe el gate (como en 201-28): redactar el comentario sin la palabra.
- Para probar en node una util pura que solo importa tipos basta copiarla al scratchpad y correr con `--experimental-strip-types`; no hace falta el shim de vitest.
- Con `defineProps` + atributos fallthrough, una clase puesta en la raíz de un componente hijo (`<CqGuideRuns class="…">`) recibe el atributo de scope
  del padre, así que los estilos `scoped` del padre le aplican sin `:deep`; los elementos internos del hijo (el `strong`) sí necesitan el estilo del hijo.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin rutas ni superficies nuevas. T-201-106 (bucle tab ↔ guía) mitigado con `applyGuideSeen()` en memoria antes de volver a la tab (ver trampa 2 por
el caso parcial); T-201-107 con `finishing` + `:loading`; T-201-108 aceptado (textos constantes, sin `v-html`).

## Self-Check: PASSED
