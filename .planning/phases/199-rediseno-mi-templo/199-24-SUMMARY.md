---
phase: 199-rediseno-mi-templo
plan: 24
subsystem: app-mi-templo
tags: [novedades, progress-bar, marquee, reduced-motion, gap-closure]
requires: [199-23]
provides:
  - "novedades-rotation.ts: NOVEDAD_ROTATE_MS, MARQUEE_HOLD_MS, MARQUEE_PX_PER_S, marqueeOverflowPx, novedadDwellMs, marqueeKeyframes"
  - "NovedadesCard con barra visible, desplazamiento sincronizado y modo reduced-motion"
affects: [199-31]
tech-stack:
  added: []
  patterns:
    [
      "un solo reloj (dwellMs) para timer + barra + desplazamiento",
      "Web Animations API sobre span interno",
    ]
key-files:
  created:
    - el-templo-app/src/modules/progression/utils/novedades-rotation.ts
    - el-templo-app/src/modules/progression/utils/__tests__/novedades-rotation.test.ts
  modified:
    - el-templo-app/src/modules/progression/components/NovedadesCard.vue
key-decisions:
  - "dwellMs = max(4500, 2*900 + ceil(overflow/45*1000)) gobierna setTimeout, animation-duration de la barra y duración del desplazamiento (C3)"
  - "Barra con riel #e5dbcd de 3 px + relleno $primary sólido, en flujo (margen 0 16px 10px), sin opacity"
  - "Reduced motion por clase nov-card--reduced (matchMedia + listener), stage de 82 px fijo"
gaps_closed: ["UAT D13", "UAT D19"]
requirements: [D-08]
duration: n/a
completed: 2026-10-15
---

# Phase 199 Plan 24: Novedades con barra visible y texto que se desplaza Summary

Novedades muestra una barra de progreso sólida ligada al mismo reloj que la rotación y, cuando el texto no entra en la línea, lo desplaza hasta el final (sin "…") durante un tiempo de exhibición que se estira según el largo.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

| Task | Commit      | Descripción                                                |
| ---- | ----------- | ---------------------------------------------------------- |
| 1    | `1909769f1` | util puro `novedades-rotation.ts` + test (13 tests)        |
| 2    | `ba098c628` | `NovedadesCard.vue`: barra, desplazamiento, reduced-motion |

## Qué se hizo

- **Util puro:** `marqueeOverflowPx` (tolerancia 1 px, ceil), `novedadDwellMs` (mínimo 4500; con desborde `2*900 + ceil(px/45*1000)`), `marqueeKeyframes` (pausa, recorrido, pausa; `[]` sin desborde).
- **Componente:**
  - `dwellMs` es un computed sobre `overflowPx`; alimenta `setTimeout`, `animationDuration` del relleno y la duración de `el.animate(...)`.
  - `restart()` (siempre con el DOM actualizado, watchers `flush: 'post'`): limpia timer, cancela desplazamiento, mide, `cycle++` (reinicia la barra por `:key="cycle"`), rearma timer y crea la animación. Se dispara por cambio de slide / largo de lista / reduced-motion, al volver de pausa, en `onMounted`, y desde `remeasure()` cuando el desborde cambia (ResizeObserver del stage solo reacciona a cambios de ANCHO, L23; `document.fonts.ready` una vez).
  - Pausa (`animating` = página visible y sin dedo apoyado): se limpia el timer, `marquee.pause()` y la barra queda congelada con `animation-play-state: paused`. Al reanudar, todo desde cero.
  - Con 1 sola novedad: sin timer ni barra; si desborda, el desplazamiento se repite (`iterations: Infinity`) con el mismo `dwellMs`.
  - Reduced motion: clase `nov-card--reduced`; no se mide ni se anima; `.nov-item__line` pasa a `display: inline; white-space: normal`, `.nov-item__text` a clamp de 2 líneas, stage de 82 px fijo, barra llena y estática (`transform: scaleX(1)`, sin animación); la rotación sigue con 4500.
  - Se quitó `text-overflow: ellipsis`, `opacity: .55`, el `--paused` con `opacity: .2` y el `display: none` de la barra en reduced-motion.
  - La barra conserva la clase `.nov-card__progress` (riel) con el relleno `.nov-card__progress-fill` dentro; `aria-hidden="true"`.
  - Texto completo en el DOM dentro de `.nov-item__line` (sin `aria-hidden`), interpolado con `{{ }}`; sin `v-html`.
  - L43: los watchers de `markSeen`/`markClicked`/NUEVO no se tocaron.

## Verificación

- `npx vitest run src/modules/progression/utils/__tests__/novedades-rotation.test.ts`: 13/13 verdes. (No se tocó el store, no se corrió `novedades-store.test.ts`.)
- **Mutantes** sobre el util (todos matados por el test, revertidos con `git checkout -- <archivo>`): (M1) tolerancia `<=` → `<`; (M2) `Math.max` → `Math.min` en `novedadDwellMs`; (M3) `ceil` → `floor` en el overflow; (M4) offset `1 - hold` → `hold`; (M5) `2 * MARQUEE_HOLD_MS` → `MARQUEE_HOLD_MS`.
- `npx vue-tsc --noEmit`: 18 errores (todos preexistentes), 0 en `NovedadesCard`.
- `pnpm lint`: 0 errores, 2 warnings preexistentes (`Capacitor` en `boot/axios.ts`, `watch` en `useSessionPlayer.ts`).
- Greps de aceptación Task 2: elipsis 0, `novedadDwellMs(` 1, `marqueeKeyframes(` 1, `const ROTATE_MS` 0, `:key="cycle"` 1, `:key="current"` 0, ResizeObserver 3, `disconnect()` 2, fonts 1, `prefers-reduced-motion` 3, `nov-card--reduced` 5, reglas del span 2/2, `line-clamp: 2` 2, `height: 82px` 1, `nov-card__progress` 7, opacity 0, `#e5dbcd` 1, `animation-play-state: paused` 1, `v-html` 0, `color: rgba(` 0 (base `0dc7b8e3b`: 0).
- Worktree limpio al terminar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, durante la implementación] Timer vivo durante la pausa**

- **Found during:** Task 2 (revisión previa al commit)
- **Issue:** al reemplazar el watch `[running, ...]` por dos watchers (cambio de slide / pausa), la rama "pausa" solo pausaba el desplazamiento y dejaba vivo el `setTimeout` de rotación con el dedo apoyado.
- **Fix:** la rama de pausa de `animating` también hace `clearTimer()`.
- **Commit:** incluido en `ba098c628`.

### Ajustes menores respecto al texto del plan

- El span se localiza con `data-key` + `querySelectorAll` dentro del stage (en vez de ref por función): evita el orden null→el de los refs con `<Transition>`, donde conviven dos `.nov-item`.
- Al cambiar de slide no se cancela la animación del slide que se va (se deja terminar durante el leave de 0,45 s para que no salte a la posición inicial); solo se cancela la del slide actual.
- Se reescribieron dos comentarios para que los greps de aceptación (`:key="cycle"` = 1, `v-html` = 0) cuenten solo el código real; el comentario de cabecera ya mencionaba `v-html` desde antes.
- `dwellMs` es un `computed` sobre `overflowPx` (el plan hablaba de ref actualizada): mismo efecto, sin estado duplicado.
- Los dos watchers de rearmado usan `flush: 'post'` (el plan no lo especificaba): hace falta el DOM nuevo para medir el texto del slide que entra y así evitar un doble armado (primero con el desborde viejo y luego con el nuevo).

## Decisiones [discreción] para el UAT humano abierto en 199-21

- `MARQUEE_HOLD_MS = 900` y `MARQUEE_PX_PER_S = 45` (C3 pide ~45 px/s).
- Con 1 sola novedad que desborda, el desplazamiento se repite en loop.
- Barra en flujo (alto 3 px + margen inferior 10): la card con 2+ novedades es ~13 px más alta que con 1; no cambia al rotar.
- Resumen de duración: 200 caracteres (máximo del API) ~ 1000-1500 px de desborde en un móvil angosto, es decir hasta ~25-35 s de exhibición con 45 px/s. Es la consecuencia directa de C3; si en el UAT se siente largo, el ajuste es subir `MARQUEE_PX_PER_S`.

## Límites conocidos

- Reduced motion: una novedad que en 2 líneas no entra (el API admite 200 caracteres) cae al clamp con "…" como último recurso.
- La clase `nov-card--reduced` depende de JS (`matchMedia` en `onMounted`): puede haber un frame en layout normal antes de aplicarse.
- La vista previa del admin (`NovedadPreview.vue`) sigue con elipsis; posible ajuste para otra tanda.
- No hay test de componente (el entorno de vitest de la app es `node`, sin vue-test-utils ni jsdom, y no se instalan dependencias): la integración (timer + barra + desplazamiento + reduced-motion) queda para la verificación con capturas de 199-31.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-199-63: texto interpolado con `{{ }}`, `v-html` = 0. T-199-64: una sola animación viva por novedad actual; observer, listener de `matchMedia`, `visibilitychange`, timer y animación se liberan en `onUnmounted`; duración acotada por el máximo de 200 caracteres.

## Self-Check: PASSED

- Archivos creados y modificados existen en el worktree; commits `1909769f1` y `ba098c628` presentes en `git log`.
