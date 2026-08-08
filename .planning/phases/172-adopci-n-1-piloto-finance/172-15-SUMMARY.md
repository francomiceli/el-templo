---
phase: 172-adopci-n-1-piloto-finance
plan: 15
subsystem: testing
tags:
  [
    tenancy,
    finance,
    suscripciones,
    reportes,
    socios,
    coach,
    programas,
    sentinel,
    sonda-revertida,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues)"
  - phase: 170-sentinel-lint
    provides: "src/db/sentinel/ — analyzeSql y el throw de TenantSentinelError"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (TENANT_TEMPLO)"
  - plan: 172-13
    provides: "regla exención-vs-filtro para SQL crudo (global a propósito → exención; acotable → filtro)"
  - plan: 172-14
    provides: "test/finance entero verde con el throw encendido — este plan extiende la garantía a los consumidores"
provides:
  - "20 archivos de test de suscripciones, reportes, socios, coach y programas listos para el throw: 115 sitios migrados (69 + 46), cero expectativas tocadas"
  - "HALLAZGO: la ruta POST /admin/users/:userId/program-addons tenía una regresión real (assertTenant sin attachCountryScope montado → TypeError → 500) que la sonda destapó pero NO causó — probada por aislamiento contra origin/master"
  - "Evidencia en caliente sobre el superconjunto: 54 archivos / 639 tests verdes (2 todo) con `finance` en TENANT_STRICT_MODULES y CERO throws del sentinel"
affects: [172-16, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El patrón per-ruta de campaigns/routes.ts:181 (attachCountryScope en el preHandler de la ruta) es el fix canónico cuando un módulo usa assertTenant sin montar el scope en un hook global"
    - "Un rojo nuevo durante la corrida en caliente NO se atribuye al sentinel por reflejo: se discrimina por aislamiento (src/ en master vs HEAD, sonda ON vs OFF) — acá el 100% de los 13 rojos era una regresión propia, no la sonda"

key-files:
  created: []
  modified:
    - el-templo-api/test/subscriptions/charge-on-assign.test.ts
    - el-templo-api/test/subscriptions/impute-advance-on-assign.test.ts
    - el-templo-api/test/subscriptions/lifecycle.test.ts
    - el-templo-api/test/subscriptions/change-plan.test.ts
    - el-templo-api/test/subscriptions/renewal.test.ts
    - el-templo-api/test/subscriptions/plans-crud.test.ts
    - el-templo-api/test/subscriptions-conversion-hook.test.ts
    - el-templo-api/test/programs/admin-addons.test.ts
    - el-templo-api/test/programs/enrollment-lifecycle.test.ts
    - el-templo-api/test/reports/debt-management.test.ts
    - el-templo-api/test/reports/outstanding-balances.test.ts
    - el-templo-api/test/reports/outstanding-balances-export.test.ts
    - el-templo-api/test/reports/expired-members.test.ts
    - el-templo-api/test/reports/reports.test.ts
    - el-templo-api/test/members/members.test.ts
    - el-templo-api/test/members/outstanding-concepts.test.ts
    - el-templo-api/test/coach/outstanding-balances.test.ts
    - el-templo-api/src/modules/programs/routes.ts

key-decisions:
  - "Los 16 DELETE crudos de reportes/socios/coach se ACOTARON con placeholder parametrizado (WHERE tenant_id = ?), no se eximieron: ninguno de esos archivos siembra en el gimnasio 2 (regla del 172-13)"
  - "3 de los 12 archivos de la Task 1 (user-status-history, user-status-transitions, branch-access) resultaron ya limpios: no tienen una sola query directa sobre las 6 tablas strict, solo instancian services — quedan en el inventario con conteo 0"
  - "El fix de programs/routes.ts viaja en la rama del plan (deviación justificada): sin él, 13 tests de add-ons daban 500 con CUALQUIER suscripción activa. Probado por aislamiento que es regresión de la fase (assertTenant agregado sin scope montado) y no efecto de la sonda"
  - "Cierre del plan por safe-resume: la sesión anterior se cortó tras los 3 commits, con la sonda viva y sin SUMMARY. El cierre re-corrió la verificación en caliente completa, revirtió la sonda y verificó cero expects tocados sobre los 3 commits juntos"

patterns-established: []

requirements-completed: []

# Metrics
duration: ~55min (sesión original) + ~15min (cierre safe-resume con re-verificación)
completed: 2026-07-31
---

# Phase 172 Plan 15: Tests de módulos consumidores de finance Summary

**Los 20 archivos de suscripciones, reportes, socios, coach y programas —115 sitios sobre las 6 tablas strict— pasan con el sentinel en modo throw, sin tocar una sola expectativa. La verificación en caliente corrió sobre el superconjunto que matchean los directorios del plan: 54 archivos, 639 tests verdes (2 todo), con `finance` puesto a mano en `TENANT_STRICT_MODULES` y CERO throws del sentinel. El plan destapó una regresión real de la fase (no de la sonda): la ruta de add-ons de programas usaba `assertTenant` sin `attachCountryScope` montado y devolvía 500 para todo request con suscripción activa — 13 tests rojos, root-causeada por aislamiento contra `origin/master` y arreglada con el patrón per-ruta de campaigns.**

## Performance

- **Duration:** ~55 min (commits de la sesión 2026-07-30) + ~15 min de cierre (re-verificación 571,9 s contra MySQL real, revert de sonda, SUMMARY)
- **Completed:** 2026-07-31
- **Tasks:** 2/2 (las dos `auto`) + 1 deviación justificada (fix de regresión)
- **Files modified:** 17 archivos de test (+ `programs/routes.ts` con el fix)

## Task Commits

| Task | Nombre                                        | Commit     | Archivos                          |
| ---- | --------------------------------------------- | ---------- | --------------------------------- |
| 1    | suscripciones y programas                     | `a40c900a` | 9 con cambios (3 ya limpios = 12) |
| 2    | reportes, socios y coach + strict en caliente | `cb568be9` | 8 archivos                        |
| dev  | fix regresión scope en add-ons de programas   | `4c252510` | `src/modules/programs/routes.ts`  |

Los tres commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `f3fa12ad` del plan 14). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Inventario de sitios migrados por archivo

Total según commits: **69 (Task 1) + 46 (Task 2) = 115 sitios**. El conteo por archivo
de abajo es el inventario auditable por grep (`git diff <commit>^..<commit> -- <archivo> |
grep -cE '^\+.*(tenantWhere|tenantValues|tenant_id)'` — cuenta líneas agregadas que llevan
el filtro; las cadenas multilínea pueden aportar más de una línea por sitio, por eso la
suma de líneas (136) supera los 115 sitios).

| Archivo                                             | Líneas con filtro | Commit     |
| --------------------------------------------------- | ----------------- | ---------- |
| test/subscriptions/charge-on-assign.test.ts         | 23                | `a40c900a` |
| test/subscriptions/impute-advance-on-assign.test.ts | 13                | `a40c900a` |
| test/subscriptions/lifecycle.test.ts                | 13                | `a40c900a` |
| test/subscriptions/change-plan.test.ts              | 6                 | `a40c900a` |
| test/subscriptions/renewal.test.ts                  | 5                 | `a40c900a` |
| test/subscriptions/plans-crud.test.ts               | 3                 | `a40c900a` |
| test/subscriptions-conversion-hook.test.ts          | 4                 | `a40c900a` |
| test/programs/admin-addons.test.ts                  | 8                 | `a40c900a` |
| test/programs/enrollment-lifecycle.test.ts          | 3                 | `a40c900a` |
| test/subscriptions/user-status-history.test.ts      | 0 (ya limpio)     | —          |
| test/users/user-status-transitions.test.ts          | 0 (ya limpio)     | —          |
| test/branch-access.test.ts                          | 0 (ya limpio)     | —          |
| test/reports/debt-management.test.ts                | 14                | `cb568be9` |
| test/reports/outstanding-balances.test.ts           | 13                | `cb568be9` |
| test/reports/outstanding-balances-export.test.ts    | 6                 | `cb568be9` |
| test/reports/expired-members.test.ts                | 6                 | `cb568be9` |
| test/reports/reports.test.ts                        | 3                 | `cb568be9` |
| test/members/members.test.ts                        | 4                 | `cb568be9` |
| test/members/outstanding-concepts.test.ts           | 6                 | `cb568be9` |
| test/coach/outstanding-balances.test.ts             | 6                 | `cb568be9` |

## Verificación en caliente (criterio de aceptación)

Comando del plan, con `finance` (6 tablas) agregado a mano en `TENANT_STRICT_MODULES`:

```
pnpm exec vitest run test/subscriptions test/reports test/members test/coach \
  test/programs test/users test/branch-access.test.ts \
  test/subscriptions-conversion-hook.test.ts --hookTimeout=900000

 Test Files  54 passed (54)
      Tests  639 passed | 2 todo (641)
   Duration  571.90s
```

- CERO throws de `TenantSentinelError` en toda la corrida.
- Sonda revertida al terminar: `git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío ✓
- `git diff a40c900a^..4c252510 -- el-templo-api/test | grep -c "^[-+].*expect("` = **0** ✓
- `pnpm exec tsc --noEmit` = exit 0 ✓

## Deviación: regresión de scope en add-ons de programas (`4c252510`)

`POST /admin/users/:userId/program-addons` devolvía 500 para TODO request con
suscripción activa desde que la fase le agregó `assertTenant`: el módulo `programs`
no monta `attachCountryScope` en ningún hook, así que `request.scope` llegaba
`undefined` y `assertTenant` tiraba un `TypeError` en vez de su 403.

Discriminación por aislamiento (misma metodología del 172-14): con `src/` en
`a6272df0` (= `origin/master`) los 2 archivos afectados dan 17/17; con `src/` en
HEAD dan 4/17; y la sonda estaba APAGADA en las dos corridas. No es el sentinel —
es una regresión propia de la fase. Fix: el patrón per-ruta de
`campaigns/routes.ts:181` (montar el scope en el preHandler de la ruta).

## Próximo

El 172-16 (wave 11) cierra la cadena serializada 13→16 sobre la misma sonda.
Regla intacta: antes de encender la sonda, verificar
`git -C /home/franco/projects/et-172 status --porcelain el-templo-api/src/db/tenant-tables.ts`
vacío.
