---
phase: 199-rediseno-mi-templo
plan: 13
subsystem: app-frase-del-dia
tags: [d-12, quotes, useInViewport, daily-quote]
requires: [199-11, 199-12]
provides:
  - SESSION_QUOTES (10 frases activas del TV), rotationIndex, segmentsToQuote, quoteOfTheDay
  - QUOTES adaptado a la interfaz Quote vieja (reproductor de sesión sin cambios)
  - composable useInViewport (IntersectionObserver con cleanup())
  - DailyQuote clara con entrada palabra por palabra
key-files:
  created:
    - el-templo-app/src/composables/useInViewport.ts
    - el-templo-app/src/modules/training/data/__tests__/quotes.test.ts
  modified:
    - el-templo-app/src/modules/training/data/quotes.ts
    - el-templo-app/src/modules/progression/components/DailyQuote.vue
requirements-completed: [D-12]
completed: 2026-10-15
---

# Phase 199 Plan 13: frase del día Summary

Las 10 frases ACTIVAS del TV (con tramos dorados) reemplazan a las 10 viejas; el reproductor de sesión las recibe por un adaptador sin tocar su código; `DailyQuote` pasa a la versión clara de la pantalla diurna del TV con entrada palabra por palabra.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Tasks 1 y 2 (un solo commit, como pide el plan): `2651044fc` feat(199-13): frases activas del TV en la app y frase del día clara con entrada palabra por palabra (D-12)

## Qué se hizo

**quotes.ts:** `SESSION_QUOTES` es copia literal (extraída por script desde `el-templo-admin/src/utils/pdf/quotes.ts` `QUOTES` del worktree; mismos escapes `“/”`, mismos tramos, mismo orden, autores con el punto final del TV). `quoteHash`/`rotationOrder`/`rotationIndex` copiados literalmente. `segmentsToQuote` (text = antes del primer gold, goldText = desde el primer gold; sin gold todo a text). `QUOTES = SESSION_QUOTES.map(segmentsToQuote)`. `quoteOfTheDay(dateStr)` puro: paso = días desde 1970-01-01 por `Date.UTC` sobre `parseDateParts`. `getQuoteForBlock` sin cambios de firma. No hay `RETIRED_QUOTES` (solo se nombra en el comentario de cabecera, que apunta al archivo origen del TV para mantenerlas en sync).

**useInViewport:** `{ isVisible, observe(el), cleanup() }`, threshold 0.4, `once` por defecto (se desconecta tras la primera intersección, así no se reanima al re-entrar/scroll). Sin `IntersectionObserver` -> `isVisible = true` al observar. Sin `onUnmounted` adentro; `observe` llama a `cleanup()` antes de re-observar (no deja observers colgados).

**DailyQuote.vue:** frase del día con `todayInTz(userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ)` (L30). Palabras con `split(/(?<=\s)/)`, delay `i * 0.09s`; el autor entra con `transitionDelay` de la última palabra. Accesibilidad: `<span class="sr-only">` con la frase completa y las palabras animadas con `aria-hidden`. `onMounted(observe)` / `onUnmounted(cleanup)` en el componente. Estilos del sketch `.quote.clara`: sin fondo ni banda ni líneas, Cinzel 700 21/1.5 uppercase `#3d3732`, dorado `#96593a`, autor Nunito Sans 700 11 tracking .3em `#5c5347`, `prefers-reduced-motion` -> estático. Cero `rgba(` en `color`.

## Verificación

- Task 1 `<verify>`: vue-tsc sin errores en quotes/test/5 consumidores (0 coincidencias), `grep -c "export function rotationIndex"` = 1. Aceptación: `gold: true` = 10, `0x9e3779b9` = 1, `RETIRED_QUOTES` = 1 (solo comentario), `git diff --stat` sobre `training/pages`, `goal-plan`, `training/components/player` vacío (L31).
- Task 2 `<verify>`: `npx vue-tsc --noEmit` = 18 errores totales (todos preexistentes; ninguno en archivos del plan, ni quotes, ni useInViewport, ni DailyQuote, ni los 5 consumidores); `pnpm lint` 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`). Greps: Cinzel 1, Nunito Sans 1, `#3d3732` 1, `#96593a` 1, `#5c5347` 1, `prefers-reduced-motion` 1, `color: rgba(` 0, `v-html` 0, `quoteOfTheDay(` 1, `onUnmounted` en useInViewport 0.
- Tests de app corridos (foreground, solo el archivo): `src/modules/training/data/__tests__/quotes.test.ts` 16/16 (corrido antes y después del commit/lint-staged). No existen otros tests que importen `Quote`/`QUOTES` ni consumidores del reproductor con test (grep de tests: solo el nuevo).
- No se corrió `pnpm build`. No se verificó visualmente (plan 21 / UAT).
- Worktree limpio tras el commit.

## Deviations from Plan

1. **[Menor] Un solo commit para las Tasks 1 y 2:** el plan mismo pide "Commit (4 archivos)" al final de la Task 2; se hizo uno solo.
2. **[Menor] Tests de app SÍ corridos** (excepción indicada en el prompt; el plan decía no correr vitest local).
3. **[Menor] Tests extra:** además de lo pedido, se testean `getQuoteForBlock`, la periodicidad/negativos/`n<=0` de `rotationIndex`, que 10 días seguidos recorren las 10 frases y el cambio de mes/año de `quoteOfTheDay`. La aserción de "tanda vieja" usa "LAS CADENAS DE LA DISCIPLINA" (verificado: solo está en `RETIRED_QUOTES` del admin) y "VENI, VIDI, VICI".
4. **[Menor] Aserciones `!` en `SESSION_QUOTES[...]!` y `QUOTES[...]!`** (noUncheckedIndexedAccess) en `quoteOfTheDay`/`getQuoteForBlock`; `.sr-only` definida en el scoped del componente (no hay clase global verificada) y `position: relative` en la raíz para contenerlo.

No se encontraron bugs reales.

## Cambio visible para el reproductor (no es regresión)

Los autores del TV traen punto final ("Virgilio.") y las frases cambiaron: SplashScreen/TransitionScreen/CelebrationScreen ahora muestran las 10 frases nuevas con el autor con punto. Es lo esperado por D-12 (misma tanda que el TV), pero conviene que Franco lo vea en el UAT.

## Dudas abiertas (no bloqueantes)

1. Si al reproductor no le gusta el punto final en el autor, hay que quitarlo en el adaptador (hoy se copia literal del TV, L29).
2. `quoteOfTheDay` usa el paso "días desde 1970", mientras el TV rota por reloj/paso propio: la frase de la app no tiene por qué coincidir con la que muestra el TV ese día (solo comparten permutación). Si se quiere que coincidan hay que acordar el paso con el TV.
3. Si el día de la sede cambia con la pantalla abierta, el texto cambia sin reanimarse (por diseño, L32: solo la primera vez que entra al viewport).
4. Verificar en dispositivo real que el IntersectionObserver dispara con el threshold .4 dentro del scroll de `q-page` de Mi Templo.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model (T-199-37 mitigado: adaptador + test + vue-tsc de los 5 consumidores sin tocar; T-199-38 aceptado).

## Self-Check: PASSED

- Commit `2651044fc` presente en el worktree; los 4 archivos existen; `git status --porcelain` del worktree vacío; nada commiteado ni modificado en `/home/franco/projects/el-templo` salvo este SUMMARY (sin commitear).
