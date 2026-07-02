---
phase: 149-nav-por-categor-as-rbac
plan: 01
subsystem: api-rbac
tags: [rbac, permissions, security, white-label, subscriptions, programs]
requires:
  - "SUBSCRIPTION_ROLES / ADMIN_ROLES / CAJA_ROLES / COACH_DEBTS_ROLES existentes en shared/permissions.ts"
provides:
  - "TEMPLO_RBAC_OVERRIDES (reportes/deudas) — composición override→core (D-06)"
  - "PLANES_WRITE_ROLES (Dueño-only), PLANES_READ_ROLES (staff), PROGRAMAS_ROLES (Dueño-only)"
  - "Guards per-handler en los 7 writes de plans/promo-plans"
  - "CRUD admin de programs cerrado Dueño-only"
affects:
  - "el-templo-api/src/modules/subscriptions/routes.ts"
  - "el-templo-api/src/modules/programs/routes.ts"
  - "el-templo-api/src/modules/shared/permissions.ts"
tech-stack:
  added: []
  patterns:
    - "RBAC core white-label + override Templo (dirección override→core, D-06)"
    - "Guard per-handler 403 (patrón finance/routes.ts:1047) para angostar dentro de un módulo con guard module-wide más ancho"
key-files:
  created:
    - "el-templo-api/test/rbac-sets.test.ts"
  modified:
    - "el-templo-api/src/modules/shared/permissions.ts"
    - "el-templo-api/src/modules/subscriptions/routes.ts"
    - "el-templo-api/src/modules/programs/routes.ts"
    - "el-templo-api/test/subscriptions/plans-crud.test.ts"
    - "el-templo-api/test/programs.test.ts"
decisions:
  - "PLANES_WRITE_ROLES / PROGRAMAS_ROLES = ADMIN_ROLES (owner+admin), NO solo owner: admin también es Dueño (D-01)"
  - "Guard per-handler (no en el hook module-wide) para no romper el PoS coach (assign/renew/pause, SUBSCRIPTION_ROLES)"
  - "CAJA_ROLES conserva su valor byte-idéntico; programs deja de consumirlo pero reports/leads siguen igual"
metrics:
  duration: ~18min
  completed: 2026-07-02
  tasks: 3
  files: 6
  commits: 5
---

# Phase 149 Plan 01: Nav por categorías + RBAC — Endurecimiento del RBAC de la API Summary

Endurecimiento del RBAC de la API para la reforma del admin white-label: sets re-expresados como "core white-label + override Templo", cierre de la escalación de privilegios de coach sobre Planes (D-11) y cierre de la puerta trasera de gestion sobre Programas por API (D-15/D-04).

## What Was Built

- **`permissions.ts`:** nuevo `TEMPLO_RBAC_OVERRIDES = { reportes: ["gestion"], deudas: ["coach","gestion"] }` con JSDoc que documenta la regla de dirección override→core (nunca core→Templo, D-06 + `.docs/saas-multitenancy/04-mecanismo-modulos.md`). `CAJA_ROLES` y `COACH_DEBTS_ROLES` re-expresados como composición `[...override, ...ADMIN_ROLES]`, preservando el orden exacto para valor byte-idéntico. Tres sets nuevos: `PLANES_WRITE_ROLES = ADMIN_ROLES`, `PLANES_READ_ROLES = SUBSCRIPTION_ROLES`, `PROGRAMAS_ROLES = ADMIN_ROLES`.
- **`subscriptions/routes.ts`:** guard per-handler `PLANES_WRITE_ROLES` (owner/admin) como primera línea de los 7 writes (POST /plans, PUT /plans/:planId, PATCH /plans/:planId/deactivate, POST /bulk-migrate, POST /promo-plans, PATCH /promo-plans/:promoId, PATCH /promo-plans/:promoId/deactivate). El hook module-wide sigue con `SUBSCRIPTION_ROLES` (PoS coach intacto). GET no tocados.
- **`programs/routes.ts`:** los 7 handlers de CRUD admin pasan de `CAJA_ROLES` a `PROGRAMAS_ROLES` (owner/admin); import de `CAJA_ROLES` removido. Enrollments (`COACH_ROLES`, D-35) y program-addons (`FINANCE_WRITE_ROLES`, D-22) intactos. Comentarios de cabecera actualizados.
- **Tests:** `rbac-sets.test.ts` (unit, sin app/MySQL) con 6 tests de deep-equal (no-regresión de sets efectivos + sets nuevos); casos coach→403 en los 7 writes + coach→200 en GET /plans en `plans-crud.test.ts`; caso gestion→403 en el CRUD admin de programs en `programs.test.ts`.

## Task Commits

| Task      | Name                                                         | Commit     | Files                             |
| --------- | ------------------------------------------------------------ | ---------- | --------------------------------- |
| 1         | Sets core + overrides + PLANES/PROGRAMAS + test no-regresión | `1baf16bd` | permissions.ts, rbac-sets.test.ts |
| 2 (RED)   | coach 403 en writes + 200 en GET /plans                      | `1324b90b` | subscriptions/plans-crud.test.ts  |
| 2 (GREEN) | guards per-handler en los 7 writes (D-11)                    | `3fda41ca` | subscriptions/routes.ts           |
| 3 (RED)   | gestion 403 en CRUD admin de programs                        | `81920540` | programs.test.ts                  |
| 3 (GREEN) | CRUD admin de programs Dueño-only (D-15)                     | `418b0a03` | programs/routes.ts                |

## Verification

- `pnpm test rbac-sets` → 6/6 verde.
- `pnpm test subscriptions/plans-crud` → 14/14 verde (coach 403 en los 7 writes, coach 200 en GET /plans, admin sigue creando).
- `pnpm test test/programs.test.ts` → 17/17 verde (gestion 403 en CRUD admin, admin/owner operan).
- `pnpm exec tsc --noEmit` → sin errores.
- Sin cambios en reports/routes.ts, coach/routes.ts, members/leads-routes.ts (git status limpio para esos archivos).

**Nota de infra (no bloqueante):** correr `pnpm test programs` (matcher greedy) lanza 5 archivos en paralelo y falló una vez con un error de provisioning de la DB de worker (`Login failed for admin@test.com` / `provisionWorkerDB`), no relacionado con estos cambios — al correr `test/programs.test.ts` solo pasa 17/17. La suite completa corre en CI al pushear.

## Deviations from Plan

None - plan ejecutado exactamente como fue escrito. Los guards per-handler viven dentro del handler (patrón finance/routes.ts:1047), por lo que corren después de la validación de schema: los tests de 403 usan payloads válidos a propósito para que la petición alcance el guard.

## Threat Model Coverage

- **T-149-01** (EoP, coach escribe planes): mitigado — guard `PLANES_WRITE_ROLES` en los 7 writes, test coach→403.
- **T-149-02** (regresión de CAJA_ROLES/COACH_DEBTS_ROLES): mitigado — no-regresión byte-idéntica en `rbac-sets.test.ts`.
- **T-149-03** (rotura del PoS): aceptado y respetado — el hook `onRequest` con `SUBSCRIPTION_ROLES` no se tocó.
- **T-149-13** (EoP, gestion opera Programas): mitigado — swap a `PROGRAMAS_ROLES`, test gestion→403.
- **T-149-SC** (supply chain): sin superficie — no se instalaron paquetes.

## Manual UAT / Follow-up (D-05)

Antes de shippear, verificar (pedir OK para SSH, nunca autónomo) qué usuarios reales tienen rol `gestion`/`recepcion` en prod. Para El Templo los sets efectivos de Reportes/Deudas NO cambian (override); el único cambio de acceso real es que gestion pierde el CRUD de Programas (Dueño-only, D-15) — impacto operativo esperado: nulo.

## Self-Check: PASSED

- FOUND: el-templo-api/test/rbac-sets.test.ts
- FOUND commit 1baf16bd, 1324b90b, 3fda41ca, 81920540, 418b0a03
