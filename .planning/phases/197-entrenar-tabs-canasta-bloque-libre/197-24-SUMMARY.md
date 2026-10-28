---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 24
subsystem: app-training
tags: [gap-closure, contraste, d-16, hallazgos-197-22]
requires: ["197-22"]
provides:
  - Cierre de los 10 hallazgos de la verificación medida (197-22)
key-files:
  modified:
    - el-templo-app/src/modules/training/pages/GuiaPage.vue
    - el-templo-app/src/modules/training/pages/SessionSummaryPage.vue
    - el-templo-app/src/modules/training/pages/FreeBlockPlayer.vue
    - el-templo-app/src/modules/training/components/semana/SemanaHero.vue
    - el-templo-app/src/modules/training/components/semana/BlockChipStack.vue
    - el-templo-app/src/modules/training/components/libre/LibreTab.vue
    - el-templo-app/src/modules/training/components/libre/FreeBlockCard.vue
    - el-templo-app/src/modules/training/components/BlockProgressionView.vue
    - el-templo-app/src/modules/training/components/player/FreeBlockSplash.vue
    - el-templo-app/src/modules/training/components/player/FreeBlockSummary.vue
    - el-templo-app/src/modules/training/stores/freeBlocksStore.ts
    - el-templo-app/src/modules/training/utils/blockMeta.ts
    - el-templo-app/src/modules/training/utils/__tests__/blockMeta.test.ts
requirements: [D-04, D-09, D-15, D-16, D-17]
---

# Fase 197 Plan 24: Gap closure de la verificación medida — Summary

Sin instalar, correr tests ni typecheck (reglas de la fase). Verificación estática: greps de higiene limpios (sin `console.*`, sin `any`, sin `color: rgba(`/`$grey`). Todo a re-medir con la herramienta de 197-22.

## Hallazgo -> fix

| # | Fix | Archivos | Esperado |
|---|-----|----------|----------|
| 1 | Guía: `$story-dark-muted` pasa de `$pd-cream-2` (#e3c9a8) a `$cream` (#f2ede5, el sólido más claro); `$story-light-muted` de `$pd-ink-2` a `$accent` (#3d3732, equivale al `.88` que pasaba). Sin rgba. | `GuiaPage.vue` | 3 textos de 4,26-4,49 a >= 7:1 |
| 2 | `SessionSummaryPage` pide `fetchStats` (la acción de Mi Templo, `useProgressionApi`) en el setup si `progressionStore.todaySession` está vacío; `loading` ya es true en el primer render (sin parpadeo del vacío). Vacío: ícono y texto en `$pd-ink-2` en vez de `grey-4`/`grey-6`. | `SessionSummaryPage.vue` | "Ver resumen" con carga directa muestra la sesión; vacío 2,30/1,13 a ~6,2 / >= 3 |
| 3 | Links de 13 px: `$pd-terra-ink` a `$pd-kicker-ink` (#7e4529). | `SemanaHero.vue` (`__link`), `LibreTab.vue` (`__link`) | 4,27-4,32 a ~6:1 en S1b, S3, S3b, S3c, S10, S1c |
| 4 | Libre: figura 210 a 188 px, `__stage` sin padding vertical, halo 280x170. Mismo orden y layout. | `LibreTab.vue` | -30 px: "Empezar" de la 1ª card ~757-793 a ~727-763 (<= 788) a 360/390 |
| 5 | Player libre: `header-left--free` con `min-width:0`/`flex:1`, y kicker y nombre en una línea con elipsis (máx. 2 líneas). Solo modo libre; la sesión completa no cambia. | `BlockProgressionView.vue` | Sin 3ª línea ni choque con el check a 360 |
| 6 | `keepHyphenWords()` (WORD JOINER U+2060 tras el guion de Buy-in/Cash-out) aplicado al mostrar: título y meta de la card, meta del splash, formato en el player, meta del resumen. Los `aria-label` y los datos quedan intactos. Test unitario agregado. | `blockMeta.ts`, `FreeBlockCard.vue`, `FreeBlockSplash.vue`, `FreeBlockSummary.vue`, `BlockProgressionView.vue`, test | Sin corte "Buy-/in" ni "Cash-/out"; sin desborde (se sigue cortando en espacios) |
| 7 | `LOAD_ERROR = 'No pudimos cargar los bloques. Probá de nuevo.'` fijo para las 3 cargas; el detalle técnico (`extractError`) va a `createLogger()`. `extractError` global sin tocar. | `freeBlocksStore.ts` | S3d muestra el texto en español |
| 8 | Ícono 404 `event_busy`: clase con `$pd-ink-2` en vez de `grey-4`. | `FreeBlockPlayer.vue` | 1,13 a >= 3:1 (~6:1) |
| 9 | `blockDisplayName` para `ROM_*` devuelve "Movilidad · ROM" (la zona ya la da el rol del chip; sigue el "Ruta · Formato" del título del API, "Tren Inferior · ROM"); rol del chip en una línea con elipsis. Test actualizado. | `blockMeta.ts`, `BlockChipStack.vue`, test | Chip "TREN INFERIOR / Movilidad · ROM"; alturas parejas a 360 |
| 10 | "Salir": sin `color:'negative'`; clase `free-block-exit-ok` con `$pd-neg-b` (#8f3434) en un `<style>` no-scoped (el diálogo se monta en body). | `FreeBlockPlayer.vue` | 4,43 a ~7:1 |

## Decisiones ante ambigüedad

- Hallazgo 9: se eligió "Movilidad · ROM" (ruta + formato, como el título del API) en lugar de "Movilidad · {zona}", porque la zona ya está arriba en el rol del chip y repetirla reproduciría el problema. Al cambiar `blockDisplayName` también cambia el h2 de `BlockExercisesCard` y el nombre en el player libre / resumen para bloques ROM (consistente).
- Hallazgo 5: el nombre del bloque (línea 2) también queda en una línea con elipsis para garantizar <= 2 líneas; rutas muy largas se truncan con "…".
- Hallazgo 6: WORD JOINER en vez de un guion no separable (U+2011), para no depender de que Montserrat tenga ese glifo.
- Hallazgo 2: se hidrata en el setup de la página con la acción existente; no se duplicó lógica ni se tocó `EntrenarView`.

## A re-medir

Guía (S8, contraste a 390), S1b/S3/S3b/S3c/S10/S1c (links), Libre primer viewport a 360/390 (posición del "Empezar"), S5c a 360 (encabezado), S3 (títulos con Buy-in/Cash-out), S3d (texto de error), S5d (ícono), S5c (diálogo "Salir"), S1-08 sábado Movilidad a 360 (chips ROM), S7b (carga directa de "Ver resumen").

## Deviations from Plan

Ninguna.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los 9 commits `fix(197-gap)` existen en la rama; los archivos listados fueron modificados; greps de higiene sin salida.
