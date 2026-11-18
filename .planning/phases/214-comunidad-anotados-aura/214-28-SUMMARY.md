---
phase: 214-comunidad-anotados-aura
plan: 28
subsystem: app-checkin
tags: [app, check-in, aura, celebracion, D-40, D-56, D-58, D-64, D-69]
requires: ["214-27"]
provides:
  - "countUpSteps(from, to, stepMs, maxMs): pasos enteros del conteo del total de Aura"
  - "CheckInCelebration: Pantalla 6 del UI-SPEC (con Aura y sin Aura)"
  - "CheckInPage: el estado success monta la celebración y actualiza auraEarned antes de volver"
affects: ["214-32"]
key-files:
  created:
    - el-templo-app/src/utils/count-up.ts
    - el-templo-app/src/utils/__tests__/count-up.test.ts
    - el-templo-app/src/components/CheckInCelebration.vue
  modified:
    - el-templo-app/src/pages/CheckInPage.vue
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 28: Celebración de asistencia Summary

El check-in exitoso abre una pantalla completa (`position: fixed`, z-index 9999) sobre `$pd-surface`. Con Aura muestra aro dorado, "ASISTENCIA REGISTRADA", "+{auraAwarded}" (valor del servidor, puede ser menor que 5), "AURA", la pastilla "Tu Aura: ✦ {total}" que cuenta con `countUpSteps` a los 700 ms, y "{Sede} · {HH:mm}" en la zona de la sede. Sin Aura (null o 0) muestra aro salvia, halo neutro y "¡Adentro!". Con movimiento reducido todo aparece de una con los valores finales; el foco va a "Listo", una región `aria-live="polite"` anuncia una vez y Escape o "Listo" ponen `auraEarned` en el store (si hay total) y vuelven.

## Commits

- `63c70d4d2` test(214-28): pasos del conteo de la celebración (rojo)
- `f6e21d9e3` feat(214-28): pasos del conteo
- `10b900805` feat(214-28): celebración de asistencia (D-40, D-56)

## Verificación

- RED confirmado antes de implementar (el módulo no existía); `count-up.test.ts` 5 de 5 en verde con la config del app.
- `pnpm lint` (app): 0 errores, 2 warnings previos ajenos.
- vue-tsc (app): 20 errores contra 21 de base; ninguno en `CheckInCelebration`, `CheckInPage` ni `count-up`.
- `tsc --noEmit` API: 0.
- Greps del plan en verde.
- Sin harness de componentes: la revisión visual queda para el UAT (plan 32).

## Deviations from Plan

None - plan executed exactly as written. (Se sumó un quinto caso al test de `countUpSteps`: tope de tiempo menor que un paso.)

## Decisiones propias

- Halo: `top: 18%` se tomó como el borde superior del halo (320 px, centrado en horizontal), para que quede alrededor del aro y no arriba de la pantalla.
- Respiración del halo: una sola animación de 6 s (.55, 1, .55, 1, .8) en vez de dos ciclos encadenados, para que no haya salto entre ciclos y termine en .8.
- Si hay `auraAwarded` > 0 pero `auraTotal` es null (API vieja a medias), se muestra el monto sin pastilla y el anuncio dice "Sumaste N de Aura." sin total.
- Hora con `Intl.DateTimeFormat('en-GB', hourCycle: 'h23')`; zona inválida cae en `DEFAULT_BRANCH_TZ` y fecha inválida omite la hora (queda solo la sede). La zona viene de `profile.branchTimezone ?? DEFAULT_BRANCH_TZ`.
- Número del total formateado con `formatAura` (miles con punto), igual que el encabezado.
- `onCelebrationDone` tiene un guard para no llamar dos veces a `goBack()` (Escape y clic seguidos).
- Escape se engancha en `document` (no en el botón), así funciona aunque el foco se pierda.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-28-01: la pantalla muestra solo `auraAwarded`/`auraTotal` de la respuesta; no hay montos fijos.

## Self-Check: PASSED
