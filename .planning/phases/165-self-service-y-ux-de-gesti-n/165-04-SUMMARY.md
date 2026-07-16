---
phase: 165-self-service-y-ux-de-gesti-n
plan: 04
subsystem: member-app
tags: [scheduling, trials, phone, self-service, quasar, vue]

# Dependency graph
requires:
  - phase: 165-self-service-y-ux-de-gesti-n
    provides: "Plan 01 backend — phoneRequired en eligibility, phone opcional en reserve-trial, code PHONE_REQUIRED (400)"
provides:
  - "TrialEligibility.phoneRequired en el composable de la app"
  - "reserveTrial acepta y envía phone opcional en el body"
  - "Diálogo de reserva de prueba pide teléfono cuando phoneRequired (input tel, no-vacío)"
affects: [165-05 E2E/UAT del milestone]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Spread condicional en el body del POST: ...(phone ? { phone } : {})"
    - "Input condicional en diálogo Quasar por flag de eligibility + botón deshabilitado hasta cumplir la regla"

key-files:
  created: []
  modified:
    - el-templo-app/src/composables/useSchedulingApi.ts
    - el-templo-app/src/pages/ReservasPage.vue

key-decisions:
  - "El teléfono se pide recién en el diálogo de reserva de prueba (no en signup): cero fricción extra en el registro (D-05)"
  - "Guard doble: front bloquea el submit vacío (evita round-trip inútil) pero el backend sigue siendo la frontera de confianza (PHONE_REQUIRED); el catch extractError existente surfacea el mensaje del server"
  - "Regla inline no-vacío en el q-input (no hay input de teléfono con reglas para espejar en el archivo)"

requirements-completed: [SELF-03]

# Metrics
duration: ~8min
completed: 2026-07-16
---

# Phase 165 Plan 04: Teléfono obligatorio en la reserva de prueba (member app) Summary

**Cuando la eligibility devuelve `phoneRequired`, el diálogo de confirmación de reserva de sesión de prueba en la member app muestra un input de teléfono requerido (teclado tel, validación no-vacío) que viaja en el body del reserve-trial; el registro no cambia.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-16
- **Completed:** 2026-07-16
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `TrialEligibility` del composable expone ahora `phoneRequired: boolean` (espejo del contrato del backend Plan 01).
- `reserveTrial` acepta un 4to parámetro `phone?` y lo incluye en el body del POST solo cuando viene (`...(phone ? { phone } : {})`).
- El diálogo de reserva de prueba en `ReservasPage.vue` muestra un `q-input` de teléfono (`type/inputmode="tel"`, regla no-vacío `Ingresá tu teléfono`, hint en español) **solo** cuando `phoneRequired`.
- `trialDialog.phone` agregado al state y reseteado al abrir el diálogo; `confirmTrialReserve` pasa `phone.trim() || undefined` como 4to arg y trae un guard que bloquea el submit con teléfono vacío. El botón Confirmar queda deshabilitado hasta que haya teléfono.
- El registro/signup NO se tocó (cero fricción extra en el alta). El catch `extractError` existente ya surfacea `PHONE_REQUIRED` del backend.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: useSchedulingApi — phoneRequired + reserveTrial(phone) (D-04/D-05)** - `528a6f66` (feat)
2. **Task 2: ReservasPage — input de teléfono condicional en el diálogo (D-05)** - `a2cce717` (feat)

## Files Created/Modified
- `el-templo-app/src/composables/useSchedulingApi.ts` - `phoneRequired` en `TrialEligibility`; `reserveTrial` con `phone?` opcional en firma y body.
- `el-templo-app/src/pages/ReservasPage.vue` - `q-input` de teléfono condicional en el diálogo de prueba, `trialPhoneRequired` computed, `trialDialog.phone` en el state, guard + 4to arg en `confirmTrialReserve`, botón Confirmar deshabilitado si falta teléfono.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito.

## Verification
- `pnpm exec eslint src/composables/useSchedulingApi.ts` → limpio.
- `pnpm exec eslint src/pages/ReservasPage.vue` → 0 errores. 1 warning preexistente (`canReservePresencial` unused, línea 842) fuera de scope — no causado por este plan, no tocado.
- Acceptance greps OK: `phoneRequired` en ambos archivos, `trialDialog.phone` bindeado.
- `vue-tsc` no instalado en el worktree (regla del repo — NO instalar); eslint es el gate. Sin dependencias nuevas. Nada pusheado; staging por ruta explícita.
- Verificación visual (UAT app real en staging) queda como human verification del milestone — fuera de este plan.

## Threat Flags

Ninguno. Las superficies tocadas (teléfono ingresado en el diálogo, phone en el body de reserve-trial) están cubiertas por el threat model del plan (T-165-08/SC): la validación no-vacío del front es UX, la frontera de confianza real es server-side (AJV + normalizePhone del Plan 01); sin dependencias nuevas (solo componentes Quasar existentes).

## Self-Check: PASSED
