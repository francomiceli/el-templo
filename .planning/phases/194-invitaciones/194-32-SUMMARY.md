---
phase: 194-invitaciones
plan: 32
subsystem: api/referrals
tags: [refactor, invitaciones]
requires: [194-10]
provides:
  - "InvitationRules (referrals/invitation-rules.ts): reglas anti-abuso de invitaciones"
key-files:
  created:
    - el-templo-api/src/modules/referrals/invitation-rules.ts
  modified:
    - el-templo-api/src/modules/referrals/invitation-service.ts
metrics:
  commit: 42db3521c
  completed: 2026-10-06
---

# Phase 194 Plan 32: partir invitation-service (reglas vs orquestación) Summary

Refactor puro: las reglas de invitación pasan a `InvitationRules`; `InvitationService` las compone y delega, sin cambiar firmas, queries ni mensajes.

## Mapa de archivos

| Archivo | Líneas | Contenido |
|---|---|---|
| `referrals/invitation-rules.ts` (nuevo) | 474 | `InvitationRules(db, log)`: `getInviterQuota`, `assertInviterCanInvite`, `computeQuota` (priv), `evaluateInviteeEligibility`, `assertInviteeEligible`, `assertIdentityNotTaken`, `findIneligibleReason` (público para `previewActivation`), `findIdentityReason`, `findHistoryReason`, `hasRecentInvitation` (priv), `loadUserWithTimezone` y `resolveTimezone` (priv, las usan solo las reglas). Exporta `subtractMonths` y el tipo `InvitationExecutor`. No importa `invitation-service`. |
| `referrals/invitation-service.ts` | 959 (antes 1330) | Constructor igual (4 args) + `this.rules`; 5 métodos públicos delegantes; `previewActivation`, `activate`, `voidInvitation`, `compensateFailedActivation`, `applyInviteeData`, `loadBranch`, `resolveInviterId`, `maxSubscriptionId`, `findInvitationSubsAbove`. Re-exporta `subtractMonths` e `InvitationExecutor` (los tests los importan de acá). |

Diff del commit: solo esos 2 archivos (+513 / -409). Ningún test ni ruta modificado.

## Deviations from Plan

**1. [Criterio no cumplido] `invitation-service.ts` queda en 959 líneas (criterio: < 800).**
- Causa: el plan estimaba que sacar las reglas dejaba el servicio por debajo de 800, pero las reglas son ~420 líneas de código y la orquestación (`previewActivation` ~120, `activate` ~230, `voidInvitation` ~100, compensación ~110, `applyInviteeData` ~75) ya suma más.
- No se cumplió porque el plan prohíbe tocar más archivos que los 2 de `files_modified` (criterio de `git diff --stat`) y manda dejar compensación y aplicación de datos en el servicio. Cumplir < 800 exigiría un tercer archivo.
- Opción si se quiere cerrar: extraer `applyInviteeData` + `compensateFailedActivation` + `maxSubscriptionId` + `findInvitationSubsAbove` + `InviteeSnapshot` (~270 líneas) a un tercer archivo; el servicio bajaría a ~690. Decisión del orquestador.

**2. [Interpretación] `loadUserWithTimezone` y `resolveTimezone` se movieron a rules.** El plan las listaba como "carga de sede/usuario/tz" de la orquestación, pero las reglas las llaman directamente y rules no puede importar service. `loadBranch` (que solo usa la orquestación) quedó en el servicio.

Sin otros desvíos.

## Verificación

- `pnpm exec tsc --noEmit`: OK.
- `pnpm lint:tenant`: exit 0, `DISCREPANCIAS: 0`.
- `grep invitation-service invitation-rules.ts`: solo la mención en un comentario, sin import.
- `quota` + `eligibility` + `activate`: 3 archivos, 77 tests verdes (363 s).
- `void` + `access-usage` + `member-routes`: 3 archivos, 47 tests verdes (540 s).
- Sin reintentos por provisioning.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `invitation-rules.ts` existe; commit `42db3521c` presente.
