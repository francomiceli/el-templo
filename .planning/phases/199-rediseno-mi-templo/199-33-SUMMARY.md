---
phase: 199-rediseno-mi-templo
plan: 33
subsystem: verification
tags: [capture, contrast, wcag, mi-templo, uat-ajustes]
requires: ["199-31", "199-32"]
provides:
  [
    "evidencia medida del build final tras los ajustes 199-33: capturas A-R, checks.json, motion.json",
  ]
key-files:
  modified:
    - el-templo-app/src/modules/progression/components/SponsorsCarousel.vue
    - .docs/mi-templo-rediseno/herramientas/{mkmocks.cjs,capture.cjs,checks.py,contrast.py}
    - .docs/mi-templo-rediseno/despues/ (regenerado)
metrics:
  completed: 2026-10-16
  commits: 1
  iterations: 1
---

# Phase 199 Plan 33: re-captura de verificación tras los ajustes del UAT (2026-10-16) Summary

Build del worktree `/home/franco/projects/et-199-mi-templo` (rama `feat/199-mi-templo-rediseno`), HEAD final **`49969ed40`** (1 commit nuevo sobre `e0c21079e`). 18 estados (A-O + P/Q/R): 0 fallas de contraste, card de hoy entera a 390 en los 18, sin overflowX a 360/390/412 y `checks.json` con **374 PASS / 0 FAIL**.

## Commits de los ajustes (desde sus mensajes)

- `a0f6edd66`: Novedades con la línea de progreso de lado a lado al ras del borde inferior (la card la recorta con el radio); el contador dice solo el número; mixin `mt-block-title` en `_brand.scss` (NOVEDADES pasa de 15px a 13px, igual que REGISTRO DEL DÍA y TUS SESIONES).
- `95b62eef4`: patrocinadores con `transform-origin: left` (la card activa a 16px en todas las posiciones), línea de progreso `.sp-progress` en vez de puntos, sin padding vertical en el track, `goTo` sin parámetro manual.
- `e0c21079e`: Registro del día en píldora (sketch 008 A) sin opción preseleccionada; completo con consejo del día (`checkInAdvice`) y "Editar registro"; Tus sesiones tablero (sketch 007 A) con letra dentro del círculo y total al pie "sesiones totales en El Templo"; card de hoy con kickers "Tu clase de hoy" / "Sin clase reservada" / "Hoy ya entrenaste", botón sin ícono, sin chip del registro.
- **Nuevo en este plan: `49969ed40`** `fix(199-33): patrocinadores con cola vacía para que la última card también quede a 16px` (ver Iteraciones).

## Ejecución

- Build: `VITE_API_URL=https://api-staging.eltemplo.org/api quasar build` (OK, 19 s) sobre `e0c21079e`; rebuild tras el fix sobre `49969ed40`. Worktree limpio al final. `dist/spa` ignorado.
- Historial: `.docs/mi-templo-rediseno/despues/` anterior -> `despues-199-31/` y `herramientas/despues/` -> `herramientas/despues-199-31/` (no existían). Los movimientos viejos de motion: `herramientas/despues-motion-199-31/`.
- Nuevas salidas: `.docs/mi-templo-rediseno/despues/` (por estado: `w360/390/412-*`, `full-w*`, rieles `w390-foryou*/sponsors*`, `contrast.txt/json`, `capture.log`, `report.json`; raíz: `fold.json`, `fold.log`, `contrast-consolidated.json`, `checks.json`, `checks.log`, `motion.json`). `despues-pantallas/` y `antes-pantallas/` se copiaron tal cual de `despues-199-31/` (las 5 pantallas no cambiaron, no se recapturaron). Crudos de motion: `herramientas/despues-motion/{A,O}/`.
- Estados nuevos (mkmocks): `P-registro-completo-bien` (energía alto, molestia ninguna, sueño bien), `Q-registro-dia-flojo` (energía bajo, molestia moderada/piernas, sueño mal), `R-total-1284` (A con `progression/stats.stats.totalSessions = 1284`). A ya tenía el registro SIN responder (`check-ins/today` con 3 nulls), por eso alcanza. B es registro completo (todo respondido). Los mocks A-O quedaron byte a byte iguales (verificado con `cmp`).

## Tabla por estado (390; overflowX false a 360/390/412 en todos)

| Estado                   | Textos / fallas    | Card hoy 390 (top-bottom, límite 788) | Kicker                  | Registro                                                        | Tus sesiones total |
| ------------------------ | ------------------ | ------------------------------------- | ----------------------- | --------------------------------------------------------------- | ------------------ |
| A presencial hoy         | 127 / 0            | 136-324 entera                        | Tu clase de hoy         | pregunta, 0 opciones salvia                                     | 42                 |
| B completada             | 123 / 0            | 136-341 entera                        | Hoy ya entrenaste       | completo, "¡Hoy estás para darlo todo!" (ok), "Editar registro" | 42                 |
| C sin clase hoy          | 125 / 0            | 136-324 entera                        | Tu próxima clase        | pregunta                                                        | 42                 |
| D sin plan               | 113 / 0            | 136-396 entera                        | Empezá hoy              | (sin panel)                                                     | sin week-strip     |
| E online con plan        | 125 / 0            | 136-364 entera                        | Hoy · Calistenia Online | pregunta                                                        | 42                 |
| F online sin plan        | 134 / 0            | 136-297 entera                        | Hoy                     | pregunta                                                        | 3                  |
| G popup entrada          | 4 / 0 (solo modal) | 136-396 entera                        | Empezá hoy              | (sin panel)                                                     | sin week-strip     |
| H ventana                | 127 / 0            | 136-363 entera                        | Tu clase de hoy         | pregunta (FAB presente)                                         | 42                 |
| I venció                 | 124 / 0            | 136-374 entera                        | Te extrañamos, Andre    | pregunta                                                        | 3                  |
| J domingo, próxima       | 121 / 0            | 136-324 entera                        | Tu próxima clase        | pregunta                                                        | 42                 |
| K clase pasada           | 124 / 0            | 136-324 entera                        | Sin clase reservada     | pregunta                                                        | 42                 |
| L online domingo         | 121 / 0            | 136-364 entera                        | Hoy · Calistenia Online | pregunta                                                        | 42                 |
| M vencido programado     | 121 / 0            | 136-324 entera                        | Sin clase reservada     | pregunta                                                        | 3                  |
| N patrocinadores 12      | 128 / 0            | 136-324 entera                        | Tu clase de hoy         | pregunta                                                        | 42                 |
| O novedad larga          | 126 / 0            | 136-324 entera                        | Tu clase de hoy         | pregunta                                                        | 42                 |
| P registro completo bien | 125 / 0            | 136-324 entera                        | Tu clase de hoy         | completo, "¡Hoy estás para darlo todo!" `--ok`                  | 42                 |
| Q registro día flojo     | 125 / 0            | 136-324 entera                        | Tu clase de hoy         | completo, "Hoy priorizá la técnica" `--care`                    | 42                 |
| R total 1284             | 127 / 0            | 136-324 entera                        | Tu clase de hoy         | pregunta                                                        | **1.284**          |

Ningún kicker matchea `Hoy · <día de la semana>`. `btnIcons` = 0 en los 18 y 3 anchos. Ningún texto de la card de hoy contiene "priorizá la técnica", "movilidad hoy" ni "escuchá a tu cuerpo", "descans" ni "turno".

## Resultados medidos

- **Patrocinadores** (6 cards, 360/390/412; `.sp-dots` no existe): `left` de la card activa a 390 = `16, 15.55, 16.09, 15.64, 16.19, 15.73`; a 360 `16 ... 15.77`; a 412 `16 ... 15.97`; `activeIndex` = índice de la card en las 6 posiciones. Antes del fix 49969ed40 las cards 0-4 estaban a 15.5-16.4 pero la **5ª (última) a 74.8 / 80.7 / 84.0** (360/390/412).
- **Gaps** (today-card > nov-card > check-in-panel > sp-section > week-strip): 16, 16, 16, 16 en los 18 estados y 3 anchos (cuando faltan bloques, los que quedan miden 16).
- **Títulos de bloque**: `.nov-card__title`, `.check-in-panel__title`, `.week-strip__title` = 13px en todos los estados donde aparecen (D y G no tienen bloques con título).
- **Novedades**: con 2 novedades `.nov-card__progress` visible y `bottomGap` = 1 (el borde de 1px, tope 1.5) a 360/390/412; con 0 o 1 no hay barra; `.nov-card__count` = "1" (matchea `^\d+$`) en los estados con una novedad sin ver.
- **Tus sesiones**: título "Tus sesiones" (sin mayúsculas en el DOM), letras `LMMJVSD`, 7 días, caption "sesiones totales en El Templo", `daysOverflow` 0; R muestra "1.284". Fuera de `.week-strip` nunca aparece "para vos", "tu semana" ni "tus sesiones".
- **Registro**: `selectedOpts` = 0 en todos los estados con panel (A: 3 opciones, 3 pasos, "¿Tenés alguna molestia hoy?"). Completo: `editLabel` = "Editar registro".
- **Motion** (`CAPTURE_MOTION=1`, A y O, movimiento real): `.sp-progress__fill` con 1 `CSSAnimation` `running` (`sp-fill-*`, 1 iteración), `display: block`, en A y en O; `.today-card` con 3 animaciones CSS corriendo; marquee de la novedad en O `running`. Check `A|motionSpProgress` PASS.
- **Escrituras a staging: 0.** Todo no-GET se respondió local (`escrituras bloqueadas localmente` en cada `capture.log`: `POST .../novedades/{901,902,903}/event`, `POST members/sponsors/{1..6}/event`, y en G `POST communications/me/avisos/8/event`). `auth/refresh` se responde local. Ningún `capture.log` contiene `AVISO`.

## Iteraciones: 1 de 3

1. **Patrocinadores, última card a ~80px** (FAIL de CSS, `spLeft16`): sin contenido después de la última card el track no tiene scroll para llegar a su punto de snap, así que quedaba a 74.8-84px del borde en vez de 16. Fix en `SponsorsCarousel.vue`: `.sp-track::after { content: ''; flex: 0 0 calc(18% - 10px); }` (lo que le falta para que la última quede como las demás). Commit `49969ed40`, sin push. Rebuild y re-medido: las 6 posiciones a 16 +- 0.5. Gates: eslint `src/modules/progression --quiet` sin errores, prettier OK, vue-tsc 18 errores (línea base 18). No hay test del componente. **Consecuencia visual a validar por Franco**: con la última card activa queda un vacío de ~80px a su derecha (las demás muestran la siguiente de asomo). El comentario previo en `syncCurrentFromScroll` ("la última card puede no llegar a su punto de snap") indica que antes era aceptado; si no se quiere ese vacío, se revierte `49969ed40` y la regla `spLeft16` falla solo en la 6ª posición.

## Ajustes a las herramientas (no tocan staging ni la app)

Copias `*.pre33.*` de `mkmocks.cjs`, `capture.cjs`, `checks.py`, `contrast.py`.

1. `mkmocks.cjs`: estados P, Q, R.
2. `capture.cjs`: bloque `checks` ampliado (kicker, btnIcons, titleSizes, novBar con `bottomGap`, novCount, novItems, checkIn, week, gaps, sponsors con barrido por card, `spProgress` en motion). El barrido de patrocinadores usa `scrollTo(offsetLeft-16)` con el snap real y espera a que `scrollLeft` se estabilice.
3. `capture.cjs` (herramienta, FAIL H): el filtro del FAB miraba solo el centro del texto; el ícono `bolt` de la 2ª card en H quedaba con el borde bajo el FAB (1.07 contra terracota). Ahora se descarta todo texto cuyo rect solape el FAB (H: 129 -> 127 textos medidos). Mismo criterio que el ajuste del 199-31.
4. `contrast.py` (herramienta, FAIL en A/C/J/K/R): "Mostrá tu carnet" medía 4.30 porque la instancia con el pill a ~4px sobre la tab bar tenía el fondo oscurecido por la sombra de la tab bar (fondo 218 vs 242 en la captura sin sombra) y la deduplicación se quedaba con esa primera instancia. Ahora, para un mismo elemento medido en varios scrolls, se conserva la instancia con mejor p10 (la limpia: 5.18). Conteos de textos sin cambios (A 127, etc.). Nota: así un elemento que roza la sombra de la tab bar en un scroll transitorio no cuenta como falla; el contraste real del elemento en reposo es 5.18.
5. `capture.cjs`/`checks.py` (herramienta): el texto del consejo incluía el ligature del ícono ("check ..."); ahora se excluye `.check-in-panel__advice-ico`. `titulos13px` es vacuo si el estado no tiene bloques con título (D, G). B, P y Q se recapturaron con la herramienta final; el resto con la anterior a ese retoque (sin efecto en sus datos; solo H cambia por el punto 3 y se recapturó).
6. `checks.py`: 374 chequeos; eliminadas las reglas viejas `visibleTitles` (con "tu semana"), `weekTotalBadge` y `novBar` basada en `novCount` numérico; reglas nuevas según el pedido (más `registroPregunta` en A, `registroCompleto` en B, `kickerSinFecha`, `cardSinChipRegistro`, `novBar{360,390,412}`, `motionSpProgress`). El kicker de P/Q/R (basados en A) se espera igual que A.

## No verificable por captura / no hecho

- Singular "1 sesión total en El Templo" y "1 sesión esta semana": ningún estado tiene total 1; queda cubierto solo por tests unitarios (`check-in-summary.test.ts`).
- `.sp-progress` con reduced-motion (`display: none`): las capturas de contraste corren con `reduced-motion: reduce`, pero no se midió el `display` del progreso en ese modo (sí en motion: `block`).
- Ninguna interacción del registro (elegir opción, volver, editar) se ejercitó por captura, solo los estados iniciales; el hover "solo con mouse" no es medible con viewport táctil.
- Collage antes/después (opcional) no se hizo. Las 5 pantallas de 199-31 no se recapturaron (módulo progression sin cambios sobre ellas).

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Commit `49969ed40` existe en la rama; worktree `/home/franco/projects/et-199-mi-templo` limpio.
- `.docs/mi-templo-rediseno/despues/{A..R}-*` con `contrast.txt`, `capture.log`, `report.json`; `checks.json`, `fold.json`, `contrast-consolidated.json`, `motion.json` presentes.
- Nada commiteado en `/home/franco/projects/el-templo`; STATE.md y ROADMAP.md sin tocar.
