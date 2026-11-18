---
phase: 214-comunidad-anotados-aura
plan: 06
subsystem: app-aura-texts
tags: [aura, app, stretch, free-blocks, onboarding, D-23]
requires: ["214-05"]
provides:
  - "La app no promete ni muestra montos de Aura fijos: celebraciones con auraAmount del servidor"
affects: []
key-files:
  modified:
    - el-templo-app/src/modules/training/types/stretch.ts
    - el-templo-app/src/modules/training/pages/StretchPlayer.vue
    - el-templo-app/src/modules/training/components/player/StretchDone.vue
    - el-templo-app/src/modules/training/types/free-blocks.ts
    - el-templo-app/src/modules/training/pages/FreeBlockPlayer.vue
    - el-templo-app/src/modules/training/components/player/FreeBlockCelebration.vue
    - el-templo-app/src/modules/training/components/player/FreeBlockSummary.vue
    - el-templo-app/src/modules/training/components/libre/LibreTab.vue
    - el-templo-app/src/modules/onboarding/components/OnboardingResult.vue
    - el-templo-app/src/modules/onboarding/components/OnboardingRecommendation.vue
    - el-templo-app/src/modules/training/utils/stretchSession.ts
decisions:
  - "El monto del resumen del bloque libre sale de un ref propio (awardedAmount) que guarda el auraAmount del cierre que acreditó, no de lastResult"
metrics:
  tasks: 2
  completed: 2026-11-17
---

# Phase 214 Plan 06: la app deja de tener montos de Aura fijos Summary

Estirar, bloque libre y onboarding muestran el monto que manda el servidor (solo si acreditó) y los textos previos a la acción ("Ya sumás AURA al terminar", "Sumás AURA con el primero de hoy") no llevan número.

## Commits

- `946f06120` fix(214-06): estiramiento sin monto de Aura fijo (D-23)
- `81409c9c7` fix(214-06): bloque libre y onboarding sin montos de Aura fijos (D-23)

## Detalle

- `StretchDone`, `FreeBlockCelebration` y `FreeBlockSummary`: prop `auraAmount?: number | null`; el bloque dorado solo aparece con `auraAwarded && auraAmount`. Un servidor viejo (sin `auraAmount`) no muestra el bloque en vez de mostrar un número inventado.
- Onboarding: `+{{ auraAwarded }}` sin respaldo de 50 y el bloque de recompensa con `v-if="auraAwarded > 0"`.
- Barrido `+5|+50|5 AURA||| 50` en `src` (.vue/.ts): sin textos de Aura. Quedan `mockup.html` y `ONBOARDING_NARRATIVE_REDESIGN.md` (docs, no código) con "+50 AURA", y `playerCuerpo.ts` con "+5" que es un músculo, no Aura.

## Verificación

- `pnpm lint`: 0 errores (2 warnings previos). vue-tsc: 21 errores, igual que la línea de base; ninguno en los archivos tocados.

## Deviations from Plan

**1. [Rule 1 - Bug] Monto del resumen del bloque libre desde `awardedAmount`**
- **Issue:** el resumen decide `auraAwarded` con `awardedInRun` (acumula entre vueltas, "Seguir entrenando"), pero `lastResult` es el último cierre, que puede no haber acreditado. Con `lastResult?.auraAmount` la línea "Sumaste N AURA" habría desaparecido en una segunda vuelta.
- **Fix:** ref `awardedAmount` en `FreeBlockPlayer.vue`, seteado junto con `awardedInRun`. La celebración sigue usando `lastResult?.auraAmount` como pide el plan.
- **Commit:** 81409c9c7
- Además se reescribió el comentario de `utils/stretchSession.ts:22` (tenía "+5 AURA"), fuera de la lista de archivos.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 2 commits y los 11 archivos existen.
