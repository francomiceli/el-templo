---
phase: 165-self-service-y-ux-de-gesti-n
plan: 01
subsystem: api
tags: [scheduling, trials, phone, self-service, ajv, drizzle, vitest]

# Dependency graph
requires:
  - phase: 163-m-quina-de-estados-autom-tica-del-lead
    provides: "reset de leadStatus/source en reserva y rebooking de prueba (atomic write dentro de la tx)"
provides:
  - "PhoneRequiredError (code PHONE_REQUIRED, extends BadRequestError → 400)"
  - "reserveTrialSelfService acepta phone opcional y lo persiste normalizado en la misma tx"
  - "getTrialEligibility expone phoneRequired:boolean en todos los retornos"
  - "bookTrial rechaza con 409 accionable si el lead no tiene teléfono"
  - "createEligibleFreemium acepta override phone (helper de tests)"
affects: [165-04 diálogo de la app, 165-05 E2E, recupero segmentado de Perdidos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error tipado con code distinguible surface-eado explícitamente en la ruta (espejo de PASS_REQUIRED/COVERAGE_EXPIRED)"
    - "Atomic write condicional dentro de la tx existente vía spread (...(x ? {phone} : {}))"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/shared/errors.ts
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/scheduling-reserve-trial.test.ts
    - el-templo-api/test/scheduling-trial-eligibility.test.ts
    - el-templo-api/test/scheduling/trials.test.ts

key-decisions:
  - "reserve-trial self-service usa PhoneRequiredError (400 + code) para que la app abra el input; bookTrial admin usa ConflictError (409) porque el admin trata 409 como error de cliente esperado (extract-error, sin ruido Sentry)"
  - "Persistencia del phone solo cuando el perfil no tenía uno (no re-valida ni pisa un teléfono existente); normalización laxa vía normalizePhone (últimos 10 dígitos), sin validador estricto (D-04)"
  - "phoneRequired se computa una vez tras el select del user y viaja en todos los retornos de eligibility; en el camino user-not-found/deleted es false (no hay perfil)"

patterns-established:
  - "Seed de phone por defecto en los helpers freemiumToken de los tests de scheduling para mantener verdes los happy paths (reserve ahora exige teléfono); los negativos optan out con phone:null"

requirements-completed: [SELF-02, SELF-03]

# Metrics
duration: ~35min
completed: 2026-07-16
---

# Phase 165 Plan 01: Teléfono obligatorio en reserva/alta de sesión de prueba (backend) Summary

**Toda reserva o alta de sesión de prueba exige ahora el teléfono del lead: la reserva self-service lo captura y persiste atómicamente (o rechaza con `PHONE_REQUIRED`), la eligibility informa `phoneRequired` de antemano, y el alta admin (`bookTrial`) rechaza con 409 accionable si falta.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-16
- **Completed:** 2026-07-16
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- `PhoneRequiredError` tipado (code `PHONE_REQUIRED`, extends `BadRequestError` → 400) espejando `PassRequiredError`, con surface explícito en `/reserve-trial`.
- `reserveTrialSelfService` acepta `phone` opcional en el body: guard 400 si el perfil no lo tiene ni el body lo trae; si viene, se persiste normalizado (últimos 10 dígitos) dentro de la MISMA tx que flipea status→'prueba' (sin round-trip extra).
- `getTrialEligibility` expone `phoneRequired:boolean` en todos los caminos de retorno + schema AJV actualizado (requerido en response.200).
- `bookTrial` (alta admin de SP a lead existente) rechaza con `ConflictError` 409 accionable ("Cargale el teléfono al lead en su ficha…") si el lead no tiene teléfono; la reprogramación (164) queda exenta.
- Cobertura de integración nueva (5 casos) + adaptación de los helpers/tests existentes al nuevo requisito de teléfono.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: PhoneRequiredError + reserveTrialSelfService phone + schema + surface de ruta** - `f7a508f4` (feat)
2. **Task 2: getTrialEligibility.phoneRequired + bookTrial 409 sin teléfono** - `319dd3a5` (feat)
3. **Task 3: Tests de integración (PHONE_REQUIRED, persistencia, phoneRequired, bookTrial 409)** - `a66e3e87` (test)

## Files Created/Modified
- `el-templo-api/src/modules/shared/errors.ts` - Agrega `PhoneRequiredError`.
- `el-templo-api/src/modules/scheduling/trials-service.ts` - `phone?` en `ReserveTrialSelfServiceInput`, guard + persistencia atómica en `reserveTrialSelfService`, `phoneRequired` en `TrialEligibility`/`getTrialEligibility`, guard 409 en `bookTrial`.
- `el-templo-api/src/modules/scheduling/schemas.ts` - `phone` opcional en `reserveTrialSchema.body`, `phoneRequired` requerido en `trialEligibilitySchema.response.200`.
- `el-templo-api/src/modules/scheduling/routes.ts` - Import + surface de `PhoneRequiredError` → `{ code: "PHONE_REQUIRED" }`, `phone?` en el Body genérico.
- `el-templo-api/test/helpers.ts` - `createEligibleFreemium` acepta override `phone`.
- `el-templo-api/test/scheduling-reserve-trial.test.ts` - `freemiumToken` seedea phone por defecto; 2 casos nuevos (400 PHONE_REQUIRED, 201 + persistencia normalizada).
- `el-templo-api/test/scheduling-trial-eligibility.test.ts` - `freemiumToken` con phone por defecto; 2 casos de `phoneRequired`.
- `el-templo-api/test/scheduling/trials.test.ts` - 1 caso de `bookTrial` 409 sin teléfono.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tests existentes de reserve/eligibility rompían por el nuevo requisito de teléfono**
- **Found during:** Task 3
- **Issue:** `createEligibleFreemium` no seedea teléfono, así que los happy paths existentes de `reserve-trial` y el caso `alreadyBooked` de eligibility habrían empezado a devolver 400 `PHONE_REQUIRED` tras el cambio (consecuencia directa del scope).
- **Fix:** Se agregó un override `phone` a `createEligibleFreemium` (default: null, no altera otros consumidores como campañas) y se hizo que los helpers locales `freemiumToken` de ambos archivos de test seedeen un teléfono por defecto; los negativos optan out con `phone: null`.
- **Files modified:** `test/helpers.ts`, `test/scheduling-reserve-trial.test.ts`, `test/scheduling-trial-eligibility.test.ts`
- **Commit:** `a66e3e87`

## Verification
- `pnpm tsc --noEmit` (el-templo-api) limpio tras Task 1 y Task 2.
- `pnpm vitest run test/scheduling-reserve-trial.test.ts test/scheduling-trial-eligibility.test.ts test/scheduling/trials.test.ts` → **40 passed (3 files)**.
- Sin migraciones nuevas (phone ya existe en users). Sin dependencias nuevas. Nada pusheado; staging por ruta explícita.

## Threat Flags

Ninguno. Las superficies tocadas (`phone` en el body de reserve-trial, respuesta `phoneRequired`, guard admin) están cubiertas por el threat model del plan (T-165-01/02/03/SC): AJV `minLength:1 maxLength:30` + `additionalProperties:false`, `normalizePhone` antes de persistir, el valor solo se escribe en `users.phone`, scope de user propio (token), y sin cambios de autorización en `bookTrial`.

## Self-Check: PASSED
