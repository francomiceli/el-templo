---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 16
subsystem: app-training
tags: [player, bloque-libre, presentacional]
requires: ["197-15"]
provides:
  - FreeBlockSplash (props block, level, auraAvailable, quote; emits start, back)
  - FreeBlockCelebration (props auraAwarded, quote; emit view-summary)
  - FreeBlockSummary (props block, completedExerciseIds, durationSeconds, auraAwarded, canEarnAura, dayLabel; emits done, pick-another, keep-training)
affects: [197-17]
key-files:
  created:
    - el-templo-app/src/modules/training/components/player/FreeBlockSplash.vue
    - el-templo-app/src/modules/training/components/player/FreeBlockCelebration.vue
    - el-templo-app/src/modules/training/components/player/FreeBlockSummary.vue
requirements: [D-12, D-15, D-16, D-18]
---

# Fase 197 Plan 16: Pantallas del modo bloque libre — Summary

Tres componentes presentacionales nuevos (inicio, celebración, resumen) del modo bloque libre. No se tocó ningún componente compartido (`SplashScreen`, `CelebrationScreen`, `SessionSummary`, `TransitionScreen`), así `GoalPlanSession.vue` queda intacto.

## Commits

- `6fc52df5c` feat(197-16): inicio y celebración del bloque libre
- `9e16dbb6e` feat(197-16): resumen del bloque libre

## Qué se hizo

- **FreeBlockSplash / FreeBlockCelebration**: overlay fijo z 9999 (`rgba(30,24,18,.82)` + blur 16) con `PremiumDialogCard` dark; `role="dialog"`, `aria-modal`, `aria-labelledby` con `useId()`, foco inicial en el CTA. El `pd-cta` y `pd-acts` salen de los estilos `:slotted` del marco (sin copiar CSS). Chip de AURA con `pd-chip-aura(dark, ...)`. "+5" en `$pd-gold` sólo con `auraAwarded` (T-197-38), pulso sólo `transform: scale` dentro de `prefers-reduced-motion: no-preference`. Cita: tramo destacado en crema 600 (no dorado).
- **FreeBlockSummary**: página crema con kicker `pd-kicker-light`, card `pd-surface-light` con lista de ejercicios (tildado salvia / círculo vacío), grilla de 2 stats, franja dorada "Sumaste 5 AURA", aviso "Para sumar AURA hacen falta 10 minutos" + "Seguir entrenando" (`pd-cta` + `pd-cta-secondary-light`), y al pie "Listo" y link "Elegir otro bloque". Sin RPE, notas, "Repetir" ni contadores.

## Verificación (estática)

Ambos `<verify>` del plan imprimen `OK`. Sin `console.`, `any`, `color: rgba(` ni opacidad en texto; sin mezcla `??` con `||`/`&&`; ninguna línea > 100 columnas. Sin typecheck/lint/tests locales.

## Desvíos/decisiones

- **Dosis en pirámides**: `formatDose` no es consciente de pirámides (su doc lo dice), así que el resumen usa `formatQuickDose(ex, true)` cuando `isPyramidBlock(block)` y `formatDose` en el resto.
- **Autor de la cita**: `Quote.author` ya sale con `displayAuthor` aplicado desde `segmentsToQuote`; no se vuelve a aplicar.
- **Kicker de los overlays**: `PremiumDialogCard` lo alinea a la izquierda; se centra con `:deep(.pd-kicker)` (sketch centrado).
- **Franja "Sumaste 5 AURA" en 16 px** (el sketch usa 14, fuera de la escala 28/17/16/13/11).
- **Aviso de 10'**: se muestra con `canEarnAura && !auraAwarded` (defensivo: nunca junto a "Sumaste 5 AURA").
- **Ejercicios hechos** (stat) = ejercicios del bloque cuyo `exerciseId` está en `completedExerciseIds` (no el largo del array crudo, por si trae ids ajenos o repetidos).
- Separadores de la lista usan `$pd-light-line` en vez del hex suelto del sketch.
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador

- 197-17 debe calcular `canEarnAura` (`durationSeconds < 600 && auraAvailableToday`) y pasar `dayLabel` ("viernes 16"), `level` y `quote`. `FreeBlockSplash`/`Celebration` se montan como overlay propio (no dentro de `q-dialog`).
- `vue-tsc` conviene en un checkout con dependencias (`ROLE_LABELS[props.block.role] ?? props.block.role`, `useId`).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Los tres archivos existen y los commits están en `feat/197-entrenar`.
