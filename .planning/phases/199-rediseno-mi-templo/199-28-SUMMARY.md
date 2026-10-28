---
phase: 199-rediseno-mi-templo
plan: 28
subsystem: contraste-entrenar-guia
tags: [contraste, wcag, d-15, gap-closure, uat-d10]
requires: [199-27]
gap_closure: true
gaps: ["UAT D10 (Entrenar, Guía)"]
key-files:
  modified:
    - el-templo-app/src/modules/training/pages/WeeklyView.vue
    - el-templo-app/src/modules/training/components/WeekCarousel.vue
    - el-templo-app/src/modules/training/components/BlockCard.vue
    - el-templo-app/src/modules/training/pages/GuiaPage.vue
status: COMPLETO (0 fallas en Entrenar y Guía en la primera iteración)
completed: 2026-10-16
---

# Phase 199 Plan 28: Contraste de Entrenar y Guía Summary

Entrenar (`/training`) pasa de 30 textos medidos con 7 fallas a 0, y Guía (`/training/guia`) de 24 con 2 fallas a 0 (estado A, 390 px, sobre el fondo real, `contrast.py`). Solo color/peso/opacidad del texto que fallaba, más una pastilla propia para la pista de la Guía; sin cambios de tamaños ni de fondos de las cards. 1 de 3 iteraciones usada.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- `4787c6146` fix(199-28): contraste de Entrenar y Guía con texto sólido y pista sobre fondo propio (UAT D10)

Worktree limpio, sin push. `dist/spa` no se commitea. Nada commiteado ni tocado en el checkout principal salvo este SUMMARY (sin commitear).

## Antes / después

| Página (estado A, 390) | Antes (`antes-gap`)  | Después                  |
| ---------------------- | -------------------- | ------------------------ |
| Entrenar               | 30 medidos, 7 fallan | 30 medidos, **0 fallan** |
| Guía                   | 24 medidos, 2 fallan | 24 medidos, **0 fallan** |

## Cambios (color viejo -> nuevo, fondo medido, ratio p10 después)

### Entrenar

| Texto                                         | Archivo            | Antes                                     | Ahora                                        | Fondo medido | Ratio                |
| --------------------------------------------- | ------------------ | ----------------------------------------- | -------------------------------------------- | ------------ | -------------------- |
| "12 al 18 de Octubre" (`weekly-view__title`)  | `WeeklyView.vue`   | `$primary` `#96593a`                      | `#2c2318`                                    | `#ebe5dc`    | 4.2 -> 11.77         |
| "D" día de descanso (`dot-label`)             | `WeekCarousel.vue` | `rgba($primary, .4)` (alpha en texto)     | `#6b6459` sólido; fondo/borde `--rest` igual | `#e9e1d8`    | 1.67 -> 4.52         |
| "Nucleus" (`block-role-name`)                 | `BlockCard.vue`    | `$primary`                                | `#2c2318`                                    | `#e7dbd1`    | ~3.6 -> 11.24        |
| ícono `help_outline`                          | `BlockCard.vue`    | `color="primary"` + `opacity: .7`         | `color="info"` (`#6b6459`), sin opacity      | `#e9ded3`    | -> 4.37 (umbral 3.0) |
| "6%" (`block-meta__intensity`)                | `BlockCard.vue`    | `$primary`                                | `#2c2318`                                    | `#e1d2c6`    | -> 10.36             |
| "INT" (`block-meta__label`)                   | `BlockCard.vue`    | `rgba($primary, .6)`                      | `#2c2318`                                    | `#e0d1c4`    | 2.08 -> 10.28        |
| "0 ejercicios" (`block-meta__exercises`)      | `BlockCard.vue`    | `color.adjust($secondary, -8%)` `#624934` | `#2c2318`                                    | `#e8ddd3`    | -> 11.36             |
| fila secundaria del meta (ejercicios/formato) | `BlockCard.vue`    | `opacity: .85` sobre el texto             | quitada                                      | n/a          | texto sólido         |

Se usó `#2c2318` (no `#6b6459`) en "INT" porque `#6b6459` sobre `#e0d1c4` rondaría 3.8 (regla 2 del plan).

### Guía

| Texto                                | Antes                                                                                                       | Ahora                                                                                                                                                                   | Fondo            | Ratio         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------- |
| "Tocá para seguir" + `chevron_right` | `$story-dark-accent`/`$story-light-accent` `#d4b896` directo sobre la foto, keyframe con `opacity .55 -> 1` | pastilla `#2c2318` (radio 999, padding 6x12, `width: fit-content; margin-left: auto`), texto `#f0e6d6`, mismo estilo en modo día y noche; keyframe solo con `transform` | `#2c2318` propio | 2.65 -> 12.49 |

## overflowX

| Página   | 360   | 390   | 412   |
| -------- | ----- | ----- | ----- |
| Entrenar | false | false | false |
| Guía     | false | false | false |

## Verificación

- `npx quasar build` (VITE_API_URL staging) OK; `capture.cjs` con `CAPTURE_DIST`/`CAPTURE_PATH`; `capture.log`, `contrast.txt`, `contrast.json` regenerados en `.docs/mi-templo-rediseno/herramientas/despues-pantallas/A-presencial-hoy-{training,training-guia}/` (posteriores al commit). Verify de la Task 2 (suma de `fail` = 0, `contrast.txt` no vacío, worktree limpio) pasa con salida 0.
- `npx vue-tsc --noEmit` = 18 errores (límite 18, preexistentes). `pnpm lint` = 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- `grep -c 'color: rgba(' WeekCarousel.vue BlockCard.vue` = 0 en total; `@keyframes story-tap-hint` sin `opacity`; título de semana sin `color: $primary`.
- No se corrieron tests (cambio solo de estilo; ninguno de los archivos tocados tiene test propio).
- Staging: solo lecturas; bloqueo de no-GET intacto (3 POST de `auth/me/intro-stories` bloqueados localmente en la captura de la Guía, ninguno llegó a staging).
- Captura visual de la Guía revisada (`w390-00.png`): la pastilla queda abajo a la derecha sin tapar el texto.

## Deviations from Plan

1. **[Menor] `border-color: rgba($secondary, 0.2)` -> `border: 2px solid rgba($secondary, 0.2)`** en `&--rest` de `WeekCarousel.vue`. Equivalente visual (el dot ya tenía `border: 2px solid`); se hizo para que el criterio literal `grep -c 'color: rgba('` = 0 sea cierto (la coincidencia era un borde, no un texto).
2. **[Menor] Regla `&--secondary { opacity: .85 }` de `BlockCard.vue` eliminada** (no solo el color): la opacidad caía sobre texto (`__exercises`, `__format`); el `__format` conserva su fondo `rgba($secondary, .15)` y su color, no aparece en la medición A.
3. **[Menor] Guía en modo día / noche no medidos por separado**: la captura A mide el primer slide (modo noche, fondo oscuro). La pastilla usa los mismos colores en ambos modos, por lo que el ratio (12.49) no depende del modo. Los otros `opacity` de `GuiaPage.vue` (:585 footnote .9, :637/:677 .95, :730 CTA secundaria .85) no se tocaron: no estaban en la lista de fallas y los slides medidos (`story-slide__item` a=0.9: 8.10 y 5.11) pasan; no se midieron los slides siguientes (captura solo del primero).

## Dónde más se usa `BlockCard.vue`

`BlockCard.vue` se importa en `DayCard.vue` (Entrenar) y `SessionSummary.vue` (resumen de sesión de `DayPlayer.vue` y `GoalPlanSession.vue`). En todos los usos el fondo viene de las mismas clases `block-bg--*` (degradados terracota/oro translúcidos, claros) y las cards internas fuerzan `$cream`; ningún uso es oscuro, así que `#2c2318` mejora la lectura en todos. `BlockChoiceCard.vue` tiene estilos propios y no se tocó. En `SessionSummary` el fondo detrás es el de la pantalla del reproductor: no se midió (la herramienta captura la pantalla Entrenar); revisar a ojo en el UAT.

## Márgenes más justos que quedan (todos pasan)

- "D" del día de descanso: 4.52 sobre `#e9e1d8` (umbral 4.5). Si Franco quiere más margen, pasar a `#2c2318` (el día sigue distinguiéndose por fondo/borde).
- `day-card__day-name` "Jueves" 4.29 (texto grande, umbral 3.0); íconos del tab bar 4.81+; "Comenzar" 4.20 (texto grande, umbral 3.0).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-199-55 mitigado (herramienta intacta, solo GET). T-199-56 aceptado.

## Dudas

Ninguna bloqueante.

## Self-Check: PASSED

- Commit `4787c6146` existe en el worktree; `git status` limpio.
- `despues-pantallas/A-presencial-hoy-{training,training-guia}/{contrast.json,contrast.txt,capture.log}` existen; 0 filas `fail`.
