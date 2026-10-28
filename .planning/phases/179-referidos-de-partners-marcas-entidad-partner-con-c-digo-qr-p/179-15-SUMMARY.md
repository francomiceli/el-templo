---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 15
subsystem: ui
tags: [vue3, quasar, pinia, app, register, referrals, partners]

# Dependency graph
requires:
  - phase: 179-04
    provides: "POST /api/auth/register con campo unificado `code` (D-02/D-03) y respuesta extendida con partnerBenefit: {partnerName, benefitType, benefitValue} | null"
provides:
  - "normalizeSignupCode (el-templo-app/src/utils/signup-code.ts) — normalización cliente del código, espejo de la del servidor"
  - "useAuthStore.register acepta code?: string y tipa la respuesta con partnerBenefit"
  - "RegisterPage.vue: campo manual '¿Tenés un código?' con pre-llenado desde ?code=/?ref=/?promo= y feedback de beneficio en el notify de éxito"
affects: [179-16, 179-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Normalización client-side espejo de la del servidor (upper + strip no-alfanumérico + clamp 24) para que el usuario vea exactamente lo que el servidor va a resolver, evitando falsos 'código no reconocido' por espacios/casing"
    - "Campo opcional sin :rules bloqueantes: un código inválido nunca impide el submit ni el alta (T-179-60)"
    - "code se SUMA al payload existente (promoCode/ref intactos) — back-compat total con builds viejas de tienda que no mandan code"

key-files:
  created:
    - el-templo-app/src/utils/signup-code.ts
    - el-templo-app/test/signup-code.test.ts
  modified:
    - el-templo-app/src/stores/useAuthStore.ts
    - el-templo-app/src/pages/RegisterPage.vue

key-decisions:
  - "Prioridad de pre-llenado del campo: ?code= > ?ref= > ?promo= — code es el más específico si viniera de un link ya orientado al campo unificado, ref/promo son el comportamiento heredado"
  - "buildSuccessMessage() centraliza la lógica de mensaje (partner discount_percent / free_pass / promoApplied / default) en una función pura testeable por inspección, en vez de un árbol de v-if inline en el notify"

requirements-completed: [D-01, D-02, D-03]

# Metrics
duration: ~35min
completed: 2026-08-23
---

# Phase 179 Plan 15: Campo unificado de código en el registro de la app Summary

**RegisterPage.vue suma un campo opcional "¿Tenés un código?" (pre-llenado desde `?code=`/`?ref=`/`?promo=`, normalizado en vivo) que viaja como `code` junto a `promoCode`/`ref` en el alta, con el notify de éxito reflejando el beneficio de partner que resuelve el servidor (179-04).**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2/2
- **Files modified:** 4 (2 nuevos: `signup-code.ts` + su test; 2 modificados: `useAuthStore.ts`, `RegisterPage.vue`)

## Accomplishments

- `normalizeSignupCode(raw: string): string` — upper + strip `[^A-Z0-9]` + clamp a 24 chars, espejo exacto de la normalización del servidor (179-02); 5 tests unitarios cubren el bloque `<behavior>` del plan
- `useAuthStore.register` acepta `code?: string` en el parámetro y tipa la respuesta con `partnerBenefit: PartnerBenefit | null` (interfaz nueva exportada, shape congelado por 179-04)
- `RegisterPage.vue`: `q-input` "¿Tenés un código?" al final del formulario, mismas props (`dark`, `outlined`, `label-color="cream"`, `color="primary"`) que el resto de los campos, sin `:rules`; se normaliza en cada tecla vía `onSignupCodeInput`
- Pre-llenado con prioridad `code` → `ref` → `promo` desde `route.query`, reusando los computeds existentes `promoCode`/`refCode` sin tocar los badges actuales
- Submit manda `code` **además de** `promoCode` y `ref` (back-compat total — las builds de tienda viejas siguen mandando lo mismo que hoy)
- `buildSuccessMessage()`: 2 mensajes nuevos según `partnerBenefit.benefitType` (`discount_percent` / `free_pass`) + fallback al mensaje actual (`promoApplied` / genérico) cuando `partnerBenefit` es `null` — un código inválido nunca se ve como error

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: Helper de normalización del código + `code` en el store de auth** - `3a545ca6` (feat)
2. **Task 2: Campo manual de código y feedback del beneficio en RegisterPage.vue** - `45c9c1c2` (feat)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-app/src/utils/signup-code.ts` - `normalizeSignupCode`, normalización cliente del código
- `el-templo-app/test/signup-code.test.ts` - 5 tests unitarios (vitest)
- `el-templo-app/src/stores/useAuthStore.ts` - `code?: string` en el parámetro de `register`, `PartnerBenefit` exportada, respuesta tipada con `partnerBenefit`
- `el-templo-app/src/pages/RegisterPage.vue` - campo `q-input` nuevo, `signupCode`/`onSignupCodeInput`/`initialSignupCode`, `buildSuccessMessage`, `code` sumado al payload del submit

## Decisions Made

Ver `key-decisions` en el frontmatter.

## Deviations from Plan

None - plan ejecutado tal cual estaba escrito. No hizo falta ningún auto-fix de Rule 1/2/3 en el código de este plan.

## Issues Encountered

**Ruido pre-existente y fuera de alcance en `vue-tsc`/`vitest` (no bloqueante, no relacionado con este plan):**

- `vue-tsc --noEmit` offline (`pnpm dlx --package vue-tsc@2.2.12 --package typescript@5.9.3`) reporta ~20 errores pre-existentes en archivos no tocados por este plan (`src/boot/*.ts`, `src/pages/ProfilePage.vue`, `src/router/index.ts`, etc. — mayormente `ImportMeta.env` y `#q-app/wrappers` no resueltos porque el checkout offline no tiene el `.quasar/` generado por `quasar dev`/`build`). Verificado con `grep` que ninguno de esos errores menciona `RegisterPage.vue`, `useAuthStore.ts` ni `signup-code.ts` — cero errores introducidos por este plan.
- `pnpm exec vitest run --no-watch` (suite completa) reporta 2 tests rojos en `test/level-display.test.ts` (sistema de niveles de entrenamiento, fase 99 — `TRAINING_LEVELS` tiene 6 entradas incluyendo `kairos` pero el test espera 5), sin relación con el campo de código. Confirmado pre-existente y fuera de alcance: el resto de la suite (70 tests, 8 archivos, incluidos los 5 tests nuevos de `signup-code.test.ts`) pasa en verde excluyendo ese archivo. Documentado en `.planning/phases/179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p/deferred-items.md` (no committeado, por instrucción de no tocar `.planning/**` en el commit del worktree).

Ninguno de los dos bloquea el plan ni requiere fix bajo la regla de scope boundary del ejecutor (archivos no tocados por esta plan).

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- El campo de código llega al backend de 179-04 sin cambios adicionales del lado API — la fase completa el camino físico del código (D-02) de punta a punta: tarjeta → campo manual → resolución server-side → beneficio confirmado.
- Este cambio NO llega a los usuarios hasta el build de tiendas (179-16 bump de versión + 179-17 checkpoint de builds) — nada más que hacer acá.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-app/src/utils/signup-code.ts`
- FOUND: `el-templo-app/test/signup-code.test.ts`
- FOUND: commit `3a545ca6` (Task 1)
- FOUND: commit `45c9c1c2` (Task 2)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
