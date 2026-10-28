---
phase: 199-rediseno-mi-templo
plan: 18
subsystem: app-sponsors-carousel
tags:
  [sponsors, carousel, store, mi-templo, scroll-snap, d-20, d-21, d-23, d-25]
requires: [199-17]
provides:
  - useSponsorsStore (feed, canRedeem, markSeen/markTapped/markRedeem fail-open, reset)
  - utils/sponsors.ts (SPONSOR_ADVANCE_MS, SPONSOR_TOUCH_PAUSE_MS, monogram, sponsorRedeemPill)
  - SponsorsCarousel.vue (carrusel de marcas con auto-avance, pausa y puntos con progreso)
  - Reset del store al desloguear y carrusel insertado en Mi Templo
affects: [199-19, 199-20, 199-21]
key-files:
  created:
    - el-templo-app/src/stores/useSponsorsStore.ts
    - el-templo-app/src/stores/__tests__/sponsors-store.test.ts
    - el-templo-app/src/modules/progression/utils/sponsors.ts
    - el-templo-app/src/modules/progression/utils/__tests__/sponsors.test.ts
    - el-templo-app/src/modules/progression/components/SponsorsCarousel.vue
  modified:
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
requirements-completed: [D-20, D-21, D-23, D-25]
completed: 2026-10-15
---

# Phase 199 Plan 18: Carrusel de patrocinadores (app, parte 1) Summary

Store con el feed del socio y eventos fail-open, y `SponsorsCarousel` con scroll-snap nativo, auto-avance constante de 2 s (una sola constante), pausa de 3 s al tocar, puntos con barra de progreso y reduced-motion, insertado en Mi Templo debajo del registro del día. El tap emite `open`; la hoja de detalle y el carnet son del plan 19.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `f48874877` feat(199-18): store de patrocinadores con eventos fail-open, constantes del carrusel y reset en logout (D-20, D-21, D-25)
- Task 2: `ccebb03bd` feat(199-18): carrusel de patrocinadores en Mi Templo con auto-avance, pausa y métricas de vista (D-20, D-23, D-25)

(Dos commits, uno por task; el plan pedía uno solo al final.)

## Qué se hizo

- **`useSponsorsStore`** (molde `useNovedadesStore`): tipo `Sponsor` calcado de `SponsorMemberItem` del server (L15, sin `redeemCode` inventado: es `string | null`). `load()` con `generation` (descarta respuestas tras `reset()` o de un `load()` más viejo), fail-open con `log.warn`. `markSeen(id)` deduplica por sesión con un `Set` y lo revierte si el POST falla; `markTapped`/`markRedeem` sin dedupe. `reportEvent` nunca lanza ni reintenta.
- **`utils/sponsors.ts`**: `SPONSOR_ADVANCE_MS = 2000` (comentario "se decide en UAT con Franco"), `SPONSOR_TOUCH_PAUSE_MS = 3000`, `monogram` (misma regla que el admin) y `sponsorRedeemPill(sponsor, canRedeem)` que decide icono y texto de la pastilla (`sell`+código, `card_membership`+"Mostrá tu carnet", `lock`+"Socios con plan").
- **`SponsorsCarousel.vue`**:
  - Estilos del sketch 005 / `SponsorCardPreview` del admin (L49): track `scroll-snap`, card `flex: 0 0 82%`, `scale(.94)` → 1 la activa, logo invertido 44x44, beneficio Montserrat 800 30 `nowrap`, pastilla sólida invertida, marca de agua 140 px a `opacity: .13` (único `opacity` del archivo). Margen de la pila 16.
  - Auto-avance con un único `setTimeout` rearmado por `watch([running, current, count])`; `running = count>1 && pageVisible && !paused && !reducedMotion && inViewport`. Pausa al `pointerdown` (reinicia los 3 s si ya estaba pausado). `visibilitychange`, `matchMedia('(prefers-reduced-motion)')` (con listener de cambio) y `useInViewport({ threshold: .5, once: false })` con su `cleanup()`.
  - Barra de progreso del punto activo re-keyada por `cycle` (se incrementa al rearmar el timer) para que barra y timer queden siempre sincronizados tras una pausa. En reduced-motion la barra queda llena y estática, sin transición de escala.
  - `seen` (D-25) cuando cambia la card activa / entra al viewport / vuelve la pestaña, vía `store.markSeen` (una vez por marca por sesión). Tap vs. swipe por variación de `scrollLeft` > 8 px; `open()` llama `markTapped` + `emit('open')`; Enter en la card también abre.
  - Sin marcas (`v-if="count > 0"` en el root) no renderiza nada (L50). Sin `v-html`, colores solo como CSS vars.
- **`MainLayout.vue`**: `sponsorsStore.reset()` en la rama de logout. **`MiTemplo.vue`**: `void sponsorsStore.load()` en `onMounted`, `<SponsorsCarousel @open="openSponsor" />` justo bajo `CheckInPanel`, `selectedSponsor` + `openSponsor` (solo asigna).

## Verificación

- Task 1: `vue-tsc` sin errores en `useSponsorsStore`, `sponsors-store`, `utils/sponsors` (el único match de `MainLayout` es el `displayName` preexistente de la línea 324). `SPONSOR_ADVANCE_MS = 2000` = 1, `SPONSOR_TOUCH_PAUSE_MS = 3000` = 1, `/members/sponsors` en el store ≥ 2, `sponsorsStore.reset()` en MainLayout = 1.
- Task 2: `vue-tsc` = 18 errores totales (límite 18, todos preexistentes, ninguno en archivos del plan). `pnpm lint`: 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`). Greps: `SPONSOR_ADVANCE_MS` 4, `SPONSOR_TOUCH_PAUSE_MS` 4, `flex: 0 0 82%` 1, `scale(0.94)` 1, `nowrap` 2, `opacity` 1 (marca de agua), `markSeen(` 1, `markTapped(` 1, `<SponsorsCarousel` 1 en MiTemplo, `v-html` 0, `console.` 0, `prefers-reduced-motion` 3. El bloque SCSS compila con `sass` (comprobado fuera del build).
- **Tests de app corridos** (foreground, uno por uno): `src/stores/__tests__/sponsors-store.test.ts` 12/12 verdes; `src/modules/progression/utils/__tests__/sponsors.test.ts` 8/8 verdes. No hay test del componente (el repo no tiene `@vue/test-utils`); el comportamiento del carrusel (timers, scroll, viewport) NO tiene cobertura automática: queda para el UAT/plan 21.

## Deviations from Plan

1. **[Menor] Dos commits** (uno por task).
2. **[Menor] Archivos extra**: se creó `utils/__tests__/sponsors.test.ts` y se agregó `sponsorRedeemPill` en `utils/sponsors.ts` (lógica pura de la pastilla, testeable sin `test-utils`). El plan solo pedía `monogram` y las constantes.
3. **[Menor] Fórmula del scroll**: el plan decía `card.offsetLeft - track.offsetLeft - 16`. Con el track `position: relative` el `offsetLeft` de la card ya es relativo al track, así que se usa `card.offsetLeft - 16` (con el track estático hubiera restado un offset de más).
4. **[Menor] Vuelta de la última a la primera sin animar** (`behavior: 'auto'`) para no recorrer todas las cards; durante un scroll programático (600 ms) se ignora el índice que dicta el scroll, así `seen` no se dispara en las cards intermedias.
5. **[Menor] Área táctil de los puntos**: 44 px de alto pero solo ~13 px de ancho (7 px del punto + 3 px por lado); 44 de ancho por punto rompía el espaciado del sketch.
6. **[Menor] Retomar tras el toque**: pausa 3 s y luego el intervalo completo de 2 s (≈5 s hasta la siguiente card), para que la barra de progreso y el timer queden sincronizados. El sketch usaba `setInterval` continuo (la siguiente card llegaba entre 3 y 5 s después).
7. **[Menor] `aria-live="off"`** en el track (buena práctica en carruseles que rotan solos) y `referrerpolicy="no-referrer"` en el `<img>` del logo.
8. **[Menor] Beneficio largo** con `text-overflow: ellipsis` además de `nowrap` (L49), y `max-width: 100%` en el bloque de texto para que la elipsis actúe.
9. El hook lint-staged hizo su backup interno con `git stash` en ambos commits (automático, no manual).

## Bugs reales encontrados

Ninguno en código previo.

## Known Stubs

- `selectedSponsor` en `MiTemplo.vue` se asigna pero todavía nada lo consume (la hoja de detalle y el carnet son el plan 19). Intencional y declarado en el plan.

## Dudas abiertas (no bloqueantes)

- Intervalo definitivo 2 s vs 4 s: se decide en UAT (cambiar solo `SPONSOR_ADVANCE_MS`).
- Arrastrar con el mouse en escritorio no hace scroll del track (el scroll nativo es táctil/trackpad/rueda); los puntos y el auto-avance sí funcionan. Mi Templo es mobile-first; sin cambios.
- El orden final del carrusel dentro de Mi Templo lo decide el plan 20; hoy está debajo del registro del día y, si ese se oculta (`sin-plan-nunca`), queda justo bajo "Para vos".
- Largo del beneficio (duda de 199-09): ahora se corta con elipsis en la app; el límite del API sigue en 16 caracteres.
- Validación visual (capturas, asomo a escala .94, igualdad con la vista previa del admin) pendiente del plan 21.

## Threat Flags

Ninguno fuera del threat_model. T-199-47 (`{{ }}`, sin `v-html`, colores como CSS vars), T-199-48 (la app renderiza `<img>` del R2 propio, validado en el server; sin referrer) y T-199-49 (dedupe por sesión + fail-open sin reintentos) cubiertos.

## Self-Check: PASSED

- Archivos existen: los 5 creados y los 2 modificados; commits `f48874877` y `ccebb03bd` presentes en el worktree; `git status --porcelain` del worktree vacío; nada commiteado ni tocado en `/home/franco/projects/el-templo` salvo este SUMMARY sin commitear.
