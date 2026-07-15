---
phase: 162-superficie-member-app-y-reporte-de-reparto
plan: 02
subsystem: subscriptions
tags: [member-api, especial-pass, idor, aura]
requires:
  - "getMemberSubscriptions plural (service.ts:963) — 161"
  - "getPlanById(...).requiresPresencial (mapPlanRow) — 161-02"
  - "categoryGroup(planCategory) (types.ts:39) — 161"
provides:
  - "GET /api/members/subscription/me/especial-pass — pase especial + saldo + isSocio del member autenticado"
  - "especialPassSchema (response schema whitelisted)"
affects:
  - "el-templo-app loadEspecialPass (store, 162-04) — consume este endpoint"
tech-stack:
  added: []
  patterns:
    - "IDOR: userId server-derived de request.user (espejo de /coverage)"
    - "categoryGroup para rutear categoría especial (NO isOnlinePlan)"
    - "response schema whitelisted contra strip de fast-json-stringify"
key-files:
  created:
    - el-templo-api/test/subscriptions/especial-pass-member.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
decisions:
  - "Endpoint aditivo nuevo en vez de extender /me/subscription a array (cero regresión sobre la superficie singular que consume media app)"
  - "Filtro por categoryGroup==='especial' + status active/paused; isSocio derivado de plan.requiresPresencial"
metrics:
  duration: ~14min
  completed: 2026-07-15
  tasks: 2
  files: 3
---

# Phase 162 Plan 02: Endpoint member del pase especial Summary

Endpoint aditivo `GET /me/especial-pass` que expone el pase "Actividades con Aura" del member (classesRemaining/classesBudget/endDate + discriminador `isSocio`), IDOR-safe con userId server-derived, alimentando el contador x/2 (APP-02) sin tocar la semántica del `/me/subscription` singular.

## What Was Built

- **Endpoint `GET /me/especial-pass`** (`member-routes.ts`): usa `getMemberSubscriptions(request.user.userId)` plural, busca el primer sub con `categoryGroup(planCategory) === "especial"` y status `active`/`paused`. Sin pase → `{ hasPass:false }`. Con pase → `{ hasPass:true, classesRemaining, classesBudget, endDate, isSocio }`, donde `isSocio = plan.requiresPresencial`. Guard heredado del plugin (auth + country scope), sin re-declarar.
- **`especialPassSchema`** (`schemas.ts`): response schema con las 5 props whitelisted — sin él fast-json-stringify strippearía `classesRemaining`/`isSocio` y el contador del app mentiría.
- **Test de integración** (`especial-pass-member.test.ts`, MySQL real, 5 casos): sin-pase, Socio (isSocio:true + balance), Externo (isSocio:false), IDOR (member A solo ve su pase), 401 sin token. Subs especiales seedeadas por Drizzle directo (patrón 161-02).

## Tasks Completed

| Task | Name                                              | Commit   | Files                        |
| ---- | ------------------------------------------------- | -------- | ---------------------------- |
| 1    | Endpoint GET /me/especial-pass + response schema  | e76108db | member-routes.ts, schemas.ts |
| 2    | Test de integración socio/externo/sin-pase + IDOR | f7d600f4 | especial-pass-member.test.ts |

## Verification

- `npx tsc --noEmit` verde.
- `npx vitest run test/subscriptions/especial-pass-member.test.ts` → 5/5 verde.
- Regresión: `/me/subscription` singular intacto (no se tocó).

## Threat Model

- **T-162-02-01 (IDOR)** mitigado: userId siempre de `request.user.userId`, el endpoint no lee ningún param/query/body. Test dedicado (member A ↔ B) lo fija.
- **T-162-02-02 (auth)** mitigado: guard heredado del plugin cubre la ruta nueva. Test de 401.
- **T-162-SC (installs)**: cero paquetes nuevos.

## Deviations from Plan

### Auto-fixed Issues

Ninguno.

### Notas

**1. [Formato - Prettier] Llamada a `getMemberSubscriptions` en multilínea.** El acceptance criterion sugería `grep 'getMemberSubscriptions(request.user.userId)'` en una sola línea, pero prettier (printWidth 80, sin config custom) envuelve el argumento a línea propia dentro del handler anidado. La semántica es idéntica: userId es server-derived de `request.user`. No se forzó el one-line por no pelear con el pre-commit hook (lint-staged reformatea igual). El must_have real ("userId sale SIEMPRE de request.user") se cumple y el test IDOR lo valida.

## Known Stubs

Ninguno.

## Self-Check: PASSED
