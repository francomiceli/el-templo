---
phase: 199-rediseno-mi-templo
plan: 30
subsystem: app-mi-templo
tags: [todaycard, sketch-006, uat-d12, gap-closure, estilo]
requires: [199-22, 199-29]
provides:
  - "TodayCard con el look del ganador del sketch 006 (C3 + borde A)"
affects: [199-31]
tech-stack:
  added: []
  patterns:
    - "Raíz como marco con borde degradé + superficie interna (`today-card` > `today-card__surface`)"
    - "Decoración aria-hidden / pointer-events none / detrás del texto"
    - "Animaciones solo bajo prefers-reduced-motion: no-preference"
key-files:
  modified:
    - el-templo-app/src/modules/progression/components/TodayCard.vue
    - el-templo-app/src/css/app.scss
decisions:
  - "El ícono del botón se decide en la vista con `PRIMARY_ICON: Record<TodayCardKind, string>` (exhaustivo); el modelo no gana campos"
  - "Alto del botón 48 px (UI-SPEC), no 46 del sketch"
  - "Skeleton sin logo/halo/línea; conserva el marco con borde (sin animación de borde)"
metrics:
  tasks: 1
  commits: 1
  completed: 2026-10-16
---

# Phase 199 Plan 30: Estilo de la card de hoy (sketch 006) Summary

`TodayCard.vue` implementa el ganador del sketch 006: marco con borde degradé que fluye, logo de El Templo ampliado y recortado arriba a la derecha con halo que respira, línea luminosa abajo, kicker en Cinzel y botón CTA terracota con destello e ícono por caso (C5). La lógica no se tocó.

## Commit

- `d4fde3211` feat(199-30): card de hoy con personalidad — columnata del logo, halo, borde que fluye y botón CTA (sketch 006, UAT D12) — `TodayCard.vue` + `src/css/app.scss`

## Qué se hizo

- Template: raíz `<div class="today-card">` (con `today-card--loading` en la rama de carga) que hace de marco; la `<section class="today-card__surface">` conserva `aria-label` / `aria-busy`. Primeros hijos de la superficie: `__halo`, `__mark`, `__line` (los tres `aria-hidden="true"`); texto y acciones en `__content` (z-index 2).
- Estilos con los valores del sketch (`ronda2.html`, variante `syn`): borde 115° a 250% con `border-flow` 7 s, radio 21/20, padding 1.5 px; marca `url('/logo.webp')` 330 px `right:-120px; top:-40px`, opacidad .12 y filtro sepia; halo 220 px con `breathe` 7 s; línea 2 px; kicker Cinzel 12 px `.14em`; título `max-width: 78%`; botón degradé 135° `#a35f3c → #7e4529`, radio 10, Geologica 600 15 px, sombra cálida + highlight, destello `::after` con `sheen` 5 s.
- Ícono del botón (C5) por `model.kind` con `PRIMARY_ICON` exhaustivo: `play_arrow` (presencial-turno, online-programa, online-libre), `event` (presencial-proxima), `add` (presencial-sin-turno), `arrow_forward` (completada, sin-plan-nunca, sin-plan-vencio), `''` (cargando).
- `src/css/app.scss`: `@import '@fontsource/geologica/600.css'` (archivo ya presente en el paquete; no se instaló nada).
- Skeleton: mismo marco (radio 21/20, padding 1.5, `min-height: 180px`), sin logo/halo/línea, pulso existente; el borde no se anima en carga.

## Verificación (`<verify>` / acceptance)

- `today-card.test.ts`: 100/100 verde (sin cambios en lógica ni tests).
- `vue-tsc --noEmit`: 18 errores (todos preexistentes), 0 en `TodayCard`.
- `pnpm lint`: 0 errores (2 warnings preexistentes en `axios.ts` y `useSessionPlayer.ts`).
- Worktree limpio tras el commit.
- Greps de valores del sketch: todos presentes (>=1): `url('/logo.webp')`, `right: -120px`, `top: -40px`, `width: 330px`, `sepia(0.6)`, `rgba(163, 95, 60, 0.38)`, `#f0d2b4`, `background-size: 250% 250%`, `#e9bf9b`, `'Cinzel'`, `letter-spacing: 0.14em`, `#7e4529`, `border-radius: 10px`, `skewX(-18deg)`, `border-radius: 21px`, `max-width: 78%`.
- Contadores: `aria-hidden="true"` = 4, `pointer-events: none` = 4, `today-card--loading` = 3, `PRIMARY_ICON` = 2, íconos entre comillas = 8, `geologica/600.css` = 1, `color: rgba(` = 0, `http` = 0.
- Animaciones: las 4 reglas `animation:` (`border-flow`, `breathe`, `sheen`, `today-card-pulse`) están todas dentro del único `@media (prefers-reduced-motion: no-preference)`. Con reduce: borde en `background-position: 0% 50%`, halo en `opacity .75`, destello fuera de vista (`left: -60%`).
- Script: diff de `defineProps|defineEmits|function onAction|router.push|emit(` sin diferencias (solo se sumaron `PRIMARY_ICON`, `primaryIcon` y el import de tipo `TodayCardKind`).

## Deviations from Plan

1. **[Formato] `app.scss` reformateado por Prettier.** El hook de lint-staged corrió Prettier sobre `src/css/app.scss` y reformateó selectores y gradientes preexistentes (sin cambio de valores: p. ej. `0.10` pasa a `0.1`). El diff de ese archivo es más grande que la línea del import. Es solo formato, requerido por el hook del proyecto.
2. **[Verify] Comparación del bloque `<script>`.** El criterio usa `HEAD~1`; como el commit ya estaba hecho, se comparó contra `HEAD` antes de commitear (equivalente). Resultado idéntico.
3. **Nota:** el hook de lint-staged crea y restaura un backup en `git stash` automáticamente (no fue un `git stash` manual); aparece como `lint-staged automatic backup` en la lista de stashes.

## Dudas / para 199-31

- Contraste, fold a 390 px y overflow de la card con el nuevo look no se midieron acá (los mide 199-31). Punto a mirar: el `max-width: 78%` del título puede sumar una línea en títulos largos ("Renová tu plan"), lo que mueve el fold.
- No se verificó visualmente en navegador (no hay captura en este plan).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno (asset propio de `public/`, sin CDN; animaciones solo bajo `no-preference`).

## Self-Check: PASSED

- `TodayCard.vue` y `app.scss` modificados y commiteados (`d4fde3211`), worktree limpio.
