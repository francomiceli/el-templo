---
phase: 165-self-service-y-ux-de-gesti-n
plan: 02
subsystem: api
tags: [members, trials, phone, self-service, ajv, drizzle, vitest, admin]

# Dependency graph
requires:
  - phase: 165-self-service-y-ux-de-gesti-n
    provides: "PhoneRequiredError + normalización + helper de tests con phone override (165-01)"
  - phase: 163-m-quina-de-estados-autom-tica-del-lead
    provides: "leadStatus/source='auto' en la conversión (atomic write en la tx)"
provides:
  - "convertFreemiumToTrial rechaza con 409 accionable si el freemium no tiene teléfono y ninguno viene en el body"
  - "convertFreemiumToTrial normaliza y persiste el phone del body en users.phone dentro de la misma tx (últimos 10 dígitos)"
  - "convertToTrialSchema acepta phone opcional (AJV minLength:1 maxLength:30, additionalProperties:false)"
  - "verificación de D-02 alta directa: TrialMemberFormDialog + createTrialMemberSchema ya exigen teléfono"
affects: [recupero segmentado de Perdidos, gestión de leads desde el reporte de SP]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard de teléfono espejando el gate de createTrialMember (ConflictError 409, el admin trata 409 como error de cliente esperado sin ruido Sentry)"
    - "Atomic write condicional dentro de la tx existente vía spread (...(phone ? {phone} : {}))"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/test/convert-freemium-to-trial.test.ts

key-decisions:
  - "convert-to-trial usa ConflictError (409) en lugar de PhoneRequiredError (400): el admin trata 409 como error de cliente esperado (extract-error, sin ruido Sentry), igual que bookTrial de 165-01; la app self-service es la única que usa el 400 tipado para abrir el input"
  - "phone se persiste solo cuando vino en el body (freemium sin teléfono previo); si el freemium ya tiene phone no se pisa. Normalización laxa vía normalizePhone (últimos 10 dígitos), sin validador estricto (D-04)"
  - "phone opcional se agregó al interface base ConvertFreemiumToTrialInput (body) — ConvertFreemiumToTrialServiceInput lo hereda por extends, evitando duplicar el campo (DRY)"
  - "D-02 alta directa (TrialMemberFormDialog + createTrialMember) se verificó como satisfecho por diseño — sin cambios de código: el q-input tiene requiredRule('Teléfono') y createTrialMemberSchema exige phone en required[]"

patterns-established:
  - "Tests de convert-to-trial que necesitan un freemium sin teléfono nulean users.phone por DB-update tras createTestMember (que seedea phone por defecto vía registerUser), simulando el lead legacy sin teléfono"

requirements-completed: [SELF-02]

# Metrics
duration: ~20min
completed: 2026-07-16
---

# Phase 165 Plan 02: Teléfono obligatorio en la conversión admin freemium→prueba Summary

**`convertFreemiumToTrial` (promover un self-registered freemium a `status='prueba'` desde el admin) ahora rechaza con 409 accionable si el lead no tiene teléfono y ninguno viene en el body; si viene, lo normaliza y persiste en `users.phone` dentro de la misma tx. El alta directa (`TrialMemberFormDialog` + `createTrialMember`) se verificó como ya satisfecha sin tocar código.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-16
- **Completed:** 2026-07-16
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `convertFreemiumToTrial`: guard de teléfono tras el freemium guard — `!user.phone && !input.phone?.trim()` → `ConflictError` 409 accionable ("Cargale el teléfono al lead antes de convertirlo a sesión de prueba"). No muta estado.
- Si vino phone en el body, se normaliza (`normalizePhone`, últimos 10 dígitos) y se agrega al `.set()` de la tx UPDATE existente vía spread condicional — sin round-trip extra, atómico con el flip status→'prueba' + leadStatusSource='auto' (163).
- `convertToTrialSchema`: `phone` opcional (AJV `minLength:1 maxLength:30`), `required:["branchId"]` intacto, `additionalProperties:false` mantiene el spoof-guard.
- Route `convert-to-trial`: propaga `request.body.phone` al service; `phone?` agregado al interface base del body.
- 2 casos de integración nuevos (409 sin teléfono + 200 con persistencia normalizada) sobre el scaffold existente.
- D-02 alta directa verificada como satisfecha por diseño (sin cambios): `TrialMemberFormDialog.vue` con `requiredRule('Teléfono')` + `createTrialMemberSchema.required` con `phone`.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: Guard de teléfono en convertFreemiumToTrial (409) + schema/route** - `6827fc85` (feat)
2. **Task 2: Test de integración convert 409/persistencia + verificación del alta directa** - `a766fdb6` (test)

## Files Created/Modified
- `el-templo-api/src/modules/members/types.ts` - `phone?: string` en `ConvertFreemiumToTrialInput` (heredado por el ServiceInput).
- `el-templo-api/src/modules/members/service.ts` - `phone: schema.users.phone` en el select; guard 409; persistencia condicional en la tx.
- `el-templo-api/src/modules/members/schemas.ts` - `phone` opcional en `convertToTrialSchema.body.properties`.
- `el-templo-api/src/modules/members/routes.ts` - `phone: request.body.phone` al objeto pasado a `convertFreemiumToTrial`.
- `el-templo-api/test/convert-freemium-to-trial.test.ts` - 2 casos nuevos (409 sin teléfono, 200 + persistencia normalizada).

## Deviations from Plan

None - plan executed exactly as written.

## Verification
- `pnpm tsc --noEmit` (el-templo-api) limpio tras Task 1.
- `pnpm vitest run test/convert-freemium-to-trial.test.ts` → **8 passed** (6 previos + 2 nuevos).
- `pnpm exec eslint src/components/TrialMemberFormDialog.vue` (el-templo-admin) limpio.
- Sin migraciones nuevas (phone ya existe en users). Sin dependencias nuevas. Nada pusheado; staging por ruta explícita.

## Threat Flags

Ninguno. Las superficies tocadas están cubiertas por el threat model del plan: T-165-04 (tampering del `phone` del body) mitigado con AJV `minLength:1 maxLength:30` + `additionalProperties:false` + `normalizePhone` antes de persistir, escrito solo en `users.phone`; T-165-05 (EoP) sin cambios de autorización — el guard es un 409 previo bajo `requireBranchAccess` + rol admin heredado; T-165-SC sin dependencias nuevas.

## Self-Check: PASSED
