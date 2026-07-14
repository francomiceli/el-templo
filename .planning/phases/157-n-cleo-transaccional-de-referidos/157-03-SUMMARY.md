---
phase: 157-n-cleo-transaccional-de-referidos
plan: 03
subsystem: referrals-attribution
tags:
  [referrals, attribution, register, alta-admin, anti-fraud, eager-code, tdd]
requires:
  - "tabla referrals + users.referralCode/referredBy (157-01)"
  - "ReferralService.resolveReferralCode/generateReferralCode (157-02)"
provides:
  - "canal self-service ?ref=CODE en POST /register → referrals(pending, self_service) + users.referred_by"
  - "canal asistido referredBy en POST /admin/members → referrals(pending, assisted, createdBy=<admin>)"
  - "generación eager del referralCode del socio nuevo en ambos canales (D-25)"
  - "antifraude: auto-referido guardado, doble-reclamo UNIQUE, dedup DNI reusado"
affects:
  - el-templo-api/src/modules/auth
  - el-templo-api/src/modules/members
tech-stack:
  added: []
  patterns:
    [
      server-side-referrer-resolution,
      graceful-degradation-try-catch,
      eager-code-generation,
      attribution-before-assignplan,
    ]
key-files:
  created:
    - el-templo-api/test/referrals/anti-fraud.test.ts
  modified:
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/auth/schemas.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/test/auth/register.test.ts
decisions: [D-08, D-13, D-14, D-15, D-25]
metrics:
  duration: ~30min
  completed: 2026-07-10
requirements: [REF-01, REF-02, REF-03, REF-04]
---

# Phase 157 Plan 03: Atribución de referidos (dos canales) Summary

Los dos canales de atribución del sistema de referidos: self-service `?ref=CODE` en `POST /register` y asistido `referredBy` en el alta admin (`POST /admin/members`). Ambos resuelven/validan el referidor server-side (nunca crudo del body), escriben `users.referred_by` + un vínculo `referrals(pending)`, generan EAGER el `referralCode` del socio nuevo (D-25) y degradan con gracia — ninguna falla de atribución ni de código bloquea el signup/alta. Antifraude cubierto: auto-referido guardado (D-13), doble-reclamo bloqueado por el UNIQUE de `referred_id` (D-14), dedup por DNI de fase 148 reusado (D-15).

## What Was Built

- **Canal self-service** (`auth/routes.ts` + `schemas.ts`) — `ref?: string` agregado a `RegisterBody` y `registerSchema`. Tras el insert del user: (1) bloque try/catch que resuelve el code con `resolveReferralCode`, y si el referrer existe y `!== newUserId` (guard D-13), escribe `users.referred_by` + `INSERT referrals(pending, self_service)`; el UNIQUE de `referred_id` (D-14) y cualquier fallo se tragan (registro exitoso). (2) bloque try/catch independiente que llama `generateReferralCode(newUserId)` (D-25). Nunca se lee el referidor crudo — solo el `ref` (code), resuelto server-side (T-157-08).
- **Canal asistido** (`members/routes.ts` + `service.ts` + `schemas.ts` + `types.ts`) — `referredBy?: number` agregado a `CreateMemberInput`/`createMemberSchema` + nuevo `CreateMemberServiceInput` (extiende con `createdBy`). El route valida el referrer server-side (socio real, no borrado); si es inválido lo omite gracefully (sin bloquear el alta). `createMember` persiste `referred_by` en el insert del user y, DENTRO de createMember pero FUERA de la tx del user (para no romper el alta ante fallo) y ANTES del `assignPlan` del route, hace `INSERT referrals(pending, assisted, createdBy=<admin JWT>)` + `generateReferralCode(newMemberId)` (D-25), ambos best-effort.
- **Ordering crítico** — el vínculo assisted se escribe dentro de `createMember`, que retorna antes de que el route llame `assignPlan` (routes.ts). Así la cualificación del plan 04 encuentra el `pending` en el mismo request.

## Verification

- `pnpm build` (tsc) exit 0.
- `pnpm test auth/register` → **9/9** verdes (6 preexistentes + 3 nuevos: ?ref válido, sin ?ref con código, ?ref inexistente graceful).
- `pnpm test referrals/anti-fraud` → **6/6** verdes (a: assisted+createdBy; b: referrer inexistente graceful; c: doble-reclamo UNIQUE; d: sin referredBy + código; e: dedup DNI 409; f: código eager).
- `pnpm test members/members.test.ts` → **76/76** verdes (sin regresión en el path de createMember).
- Acceptance greps: `generateReferralCode` en auth/routes.ts=1, en members/service.ts=1; `referredBy` en members/schemas.ts=1; `attributionChannel` en members/service.ts=1.

## Deviations from Plan

### Aclaraciones (no requieren acción)

**1. Criterio de aceptación `additionalProperties` en `auth/routes.ts` — misfire del plan**

- **Found during:** Task 1 (verificación de aceptación)
- **Issue:** El plan pedía `grep -c "additionalProperties" el-templo-api/src/modules/auth/routes.ts` >= 1. El `registerSchema` vive en `auth/schemas.ts` (no en routes.ts) y **nunca tuvo** `additionalProperties`. El grep da 0 tanto antes como después del cambio.
- **Resolución:** El intent del criterio ("no relajar el schema") se honra: `ref` se agregó como propiedad tipada explícita (`{ type: "string", maxLength: 32 }`), no aflojando el schema. Con la config AJV default de Fastify, las props desconocidas no llegan al handler tipado. No se tocó la política de validación.

**2. Auto-referido (D-13) es estructuralmente imposible de disparar por HTTP para un socio nuevo**

- **Found during:** Task 1 y 2 (diseño de tests)
- **Issue:** En ambos canales el socio se está CREANDO — su `newUserId` no existe antes del insert, así que un referrer existente nunca puede igualar el id futuro. El guard `referrerId !== newUserId` / `input.referredBy !== userId` queda como defensa en profundidad (verificable por source), pero no es gatillable end-to-end.
- **Resolución:** Los tests cubren el caso equivalente y sí gatillable: referrer **inexistente** → sin vínculo, alta/registro 2xx (graceful). El guard de auto-referido queda en el código. La barrera real anti-doble-referidor (D-14) se testea concretamente contra el UNIQUE de `referred_id`.

**3. Interpretación de "la ruta rechaza con toast negativo" (behavior Task 2)**

- **Found during:** Task 2
- **Issue:** El `<behavior>` decía que un referrer inválido "la ruta rechaza con toast negativo" pero también "el alta puede seguir sin atribución" y las must_haves exigen que la atribución **nunca** bloquee el alta (UI-SPEC hard rule).
- **Resolución:** Se priorizó la must_have canónica (graceful): referrer inválido → se omite la atribución (sin vínculo) y el alta **sí** se completa (201). Consistente con el canal self-service y con T-157-11.

## Notes

- **`createdBy` server-side:** el `createMember` ahora recibe `createdBy` desde `request.user.userId` (JWT), nunca del body — mismo guard anti-spoof que `createTrialMember`. El schema `createMemberSchema` no expone `createdBy`.
- **Downstream:** el plan 04 (hook en `assignPlan`) consume los vínculos `pending` creados acá (`qualifyFirstPayment` + `computeReferralDiscountPercent`), sin cambios adicionales en atribución.
- **Corrida amplia con paralelismo:** correr `pnpm test members/members` (glob de 4 archivos) dio falsos rojos por colisión en la DB de test compartida entre archivos concurrentes; cada archivo corrido aislado pasa. Los comandos `<verify>` del plan (por archivo) están verdes.

## Commits

- 2c8fc3dd: test(157-03): failing tests para atribución self_service ?ref + código eager
- 40bbf674: feat(157-03): atribución self_service ?ref + código eager en POST /register
- a468134e: test(157-03): failing tests para canal asistido + antifraude
- 54e7f586: feat(157-03): canal asistido '¿Quién lo trajo?' + código eager en alta admin

## TDD Gate Compliance

- Task 1: RED (2c8fc3dd, `test`) → GREEN (40bbf674, `feat`).
- Task 2: RED (a468134e, `test`) → GREEN (54e7f586, `feat`).
- Ambas tareas honran el orden test-antes-de-feat a nivel commit.

## Self-Check: PASSED
