---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 15
subsystem: app-training
tags: [player, bloque-libre, composable]
requires: ["197-14"]
provides:
  - useSessionPlayer(session, { freeBlock }) + startAnotherRound()
  - BlockProgressionView props mode y auraGoalSeconds
  - StoryExerciseCard prop mode
affects: [197-17, 197-20]
key-files:
  modified:
    - el-templo-app/src/modules/training/composables/useSessionPlayer.ts
    - el-templo-app/src/modules/training/components/BlockProgressionView.vue
    - el-templo-app/src/modules/training/components/player/StoryExerciseCard.vue
requirements: [D-11, D-12, D-15, D-18]
---

# Fase 197 Plan 15: Costuras del player para el bloque libre — Summary

`useSessionPlayer` acepta `{ freeBlock }` (sin DEUTEROS/NUCLEUS especiales, bloque único reproducible de cualquier rol) y expone `startAnotherRound()`. `BlockProgressionView` y `StoryExerciseCard` ganan `mode: 'session' | 'free'` (default `'session'`) con encabezado "BLOQUE LIBRE · ROL", barrita dorada de AURA, formato D-11 y "último bloque" forzado.

## Commits

- `84eab3f6a` feat(197-15): useSessionPlayer en modo bloque libre (D-15)
- `1d84230fb` feat(197-15): player en modo bloque libre — encabezado, barrita de AURA y último bloque

## Qué cambió (y que sin la opción no cambia)

- `useSessionPlayer`: `hasDeuterosBlocks` devuelve `false` con `freeBlock` (esto también deja `progress`, `needsDeuterosChoice` e `isSessionComplete` en la rama "no Deuteros", sin 4 bloques fijos); el salto NUCLEUS al índice 2 suma `!options.freeBlock`; `startAnotherRound` hace `pauseTimer()` (fija `accumulatedSeconds` = reloj actual), vacía `completedBlocks`/`completedExercises`/índices en memoria y en el store (`saveProgress` del `dayId`, sin tocar `elapsedSeconds`) y llama `startTimer()`. Sin opción, las dos ramas modificadas evalúan igual que antes.
- `BlockProgressionView`: en `'free'` oculta "Cambiar bloque Deuteros", "Ver bloques anteriores" y el ajuste de dificultad (`canAdjustCurrentSlide` exige `mode === 'session'`); encabezado `Bloque libre · {ROLE_LABELS}` + `blockDisplayName`; línea de formato con `formatLabel(block)`; barrita 92x4 (`role="progressbar"`, `aria-label` "Minutos para sumar AURA", `aria-valuenow` en %) solo con `auraGoalSeconds` > 0; `:mode` hacia `StoryExerciseCard`.
- `StoryExerciseCard`: `isLastBlock` true en `'free'`; textos "Bloque completo" / "Hacé una elongación antes de terminar." / "Ver resumen"; correcciones de copy en los dos modos ("Volver al último ejercicio", "¿Listo para pasar al siguiente?").
- `GoalPlanSession.vue` y `DayPlayer.vue` sin cambios (`git diff` contra `fd0aefe4b` vacío); no pasan las props nuevas.

## Verificación (estática)

Ambos `<verify>` del plan cumplen sus checks de contenido; goal-plan y DayPlayer sin diff. Higiene limpia: sin `console.`, `any`, `color: rgba(` nuevo ni `??` mezclado. Líneas > 100 solo en comentarios. Sin typecheck/tests locales.

## Desvíos/decisiones

- El `<verify>` de la tarea 1 incluye `! grep ... onUnmounted`, que matchea un comentario preexistente ("Not using onUnmounted internally..." l.457). No hay `onUnmounted` en código; el resto de checks de esa tarea se corrió aparte y pasó.
- Envolví el timer en `.block-progression__timer-wrap` (columna flex, `align-items: flex-end`) para alojar la barrita bajo el timer; en modo sesión es un único hijo, sin cambio visual.
- Hitbox 44 px de la flecha atrás: clase `.block-progression__back.q-btn` (selector con especificidad extra para ganarle al `dense` de Quasar); aplica a los dos modos como pide el plan. Se agregó `aria-label="Volver"` a ese botón.
- "Seguir entrenando": el bloque mostrado no cambia de `blockId`, así que `storyNav` no se resetea solo. Agregué un watch en `BlockProgressionView` que, solo en modo libre, hace `storyNav.reset()` cuando `completedBlocks.length` pasa de >0 a 0 (vuelve al primer ejercicio). No afecta "Volver al último ejercicio" (no toca `completedBlocks`).
- En modo libre el rol usa `ROLE_LABELS` (sin el override 'Pyros' de INITIUM), como indica el plan.
- No se tocaron colores `rgba` preexistentes de texto del archivo (los trata el plan 197-20); los estilos nuevos usan `$pd-cream-2`, `#fff` y `$pd-gold` sólidos (la pista de la barrita es `rgba` de fondo, permitido).
- `StoryExerciseCard` pasó a `withDefaults` con `readOnly: false` (equivale al cast booleano previo; GuiaPage no se ve afectada).

## Bugs encontrados

Ninguno.

## Para el orquestador

- Sin vue-tsc local: conviene correr `vue-tsc` en el checkout con node_modules (props nuevas con `withDefaults`, `ROLE_LABELS[role] ?? role`).
- 197-17 debe pasar `mode="free"`, `:aura-goal-seconds` (600 o `null`) y llamar `startAnotherRound` desde "Seguir entrenando"; `useSessionPlayer(session, { freeBlock: true })`.

## Self-Check: PASSED
