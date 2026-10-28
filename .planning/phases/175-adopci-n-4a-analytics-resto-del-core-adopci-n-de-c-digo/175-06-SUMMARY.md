---
phase: 175-adopci-n-4a-analytics-resto-del-core-adopci-n-de-c-digo
plan: 06
subsystem: tenancy (improvement-proposals, auth, analytics)
tags:
  [
    tenancy,
    con-06,
    allowlist,
    improvement-proposals,
    auth,
    refresh-tokens,
    analytics,
  ]
dependency-graph:
  requires: ["175-01", "175-02", "175-03", "175-04", "175-05"]
  provides:
    ["ADO-06 (improvement-proposals + auth + analytics unique-members scoped)"]
  affects:
    [
      "el-templo-api/src/modules/improvement-proposals",
      "el-templo-api/src/modules/auth",
      "el-templo-api/src/modules/analytics",
    ]
tech-stack:
  added: []
  patterns:
    [
      "tenantWhere/tenantValues (Pattern A/B)",
      "tenant-safe embedded-in-sql annotation for STRICT tables (users)",
      "tenant-safe TS-comment annotation for non-strict tables",
    ]
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/improvement-proposals/service.ts
    - el-templo-api/src/modules/improvement-proposals/routes.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/auth/refresh-token-service.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/attendance-metrics-service.ts
    - el-templo-api/test/analytics/attendance-metrics.test.ts
    - el-templo-api/tenant-lint-allowlist.json
decisions:
  - "resolveTenantId en refresh-token-service.ts deriva tenant_id de users.tenant_id (query nueva) en vez de threadear ctx desde los 3 call-sites de issue(); users ya es tabla STRICT, asi que la exencion del lookup pre-scope va embebida en el SQL (no solo TS comment) para que el sentinel de runtime la reconozca"
  - "issueReplacementFor (rotacion) hereda row.tenantId en vez de re-derivar por userId (evita query extra, preserva procedencia de la cadena) — extension de Rule 2 mas alla del alcance literal del plan, necesaria para poder remover la entrada de allowlist de refresh_tokens completa"
  - "auth/routes.ts branches (lineas 191/206 del registro) resultaron YA compliant (el select incluye .tenantId como columna, matchea el marker de texto del lint) — la entrada de allowlist routes.ts/branches se mantiene SOLO por otros 3 accesos fuera de alcance de este plan (lineas 442/572/804), no se toco"
metrics:
  duration: "~2.5h"
  completed: "2026-08-14"
---

# Phase 175 Plan 06: improvement-proposals + auth + analytics unique-members + settings Summary

Cierra el ultimo plan de la fase 175: scopea por tenant `improvement-proposals` (casi sin adoptar), cierra 2 gaps puntuales de `auth` (bug post-168 en `promo_plans` + `referrals`/`refresh_tokens` sin estampar), corrige el unico fix real pendiente de `analytics` (`GET /attendance/unique-members` sin `assertTenant`), confirma `system_settings` como tabla global por diseño, y salda el allowlist (174 -> 167 entradas).

## Que se hizo

### Task 1 — improvement-proposals

- `submitProposal`: INSERT con `tenantValues`, count anti-spam con `tenantWhere(schema.improvementProposals, ctx)`.
- `getPromptStatus`: threadeado `ctx` (antes global, cualquier socio de cualquier gimnasio contaba para el "quiet period" de otro).
- `getAdminProposals`/`getExportRows`/`buildConditions`/`fetchRows`: threadeado `ctx` desde los handlers admin (`assertTenant`) y agregado `tenantWhere(schema.improvementProposals, ctx)` como primer termino del WHERE — cierra el leak cross-tenant (antes solo filtraba por `branches.country`, un admin de un gimnasio AR veia propuestas de OTRO gimnasio AR).
- Anotaciones `tenant-safe` en 4 sitios donde el `whereClause`/`conds` llega por variable (indireccion que el lint no ve en el propio statement): countRow de `getAdminProposals`, sub-lookup de `branches` por pais, los 2 fragmentos `sql` de rango de fechas, y el query de `fetchRows`.

### Task 2 — auth

- `routes.ts` registro: `promo_plans` lookup por `promoCode` (bug post-168, `(tenant_id, promo_code)` compuesto — sin filtro podia resolver la promo de OTRO gimnasio) + el UPDATE de `redemptionCount`, ambos con `tenantWhere(promoPlans, ctx)`.
- `routes.ts` registro: INSERT de `referrals` (atribucion self-service) con `tenantValues`.
- `refresh-token-service.ts`:
  - `issue(userId)` estampa `tenant_id`, derivado via una query nueva `resolveTenantId(userId)` sobre `users.tenant_id`. Como `users` ya es tabla **STRICT** (sentinel de runtime activo), la exencion pre-scope de ese lookup va **embebida en el SQL** (`sql\`/_ tenant-safe: ... _/ ${eq(...)}\``), no solo como comentario TS — el sentinel solo lee el SQL final, nunca comentarios de fuente (mismo idioma que T-173-22 en `auth/routes.ts`). Este fue el unico bug real encontrado en ejecucion (ver Deviations).
  - `issueReplacementFor` (rotacion) ahora hereda `row.tenantId` en vez de nacer sin tenant.
  - `findByPlain`/`revoke` (lookup/update por hash opaco del token, M8) y los updates/selects por PK de `chainTip`/`revokeChain`/`issueReplacementFor` (fila ya resuelta, ancla derivada) y `revokeAllForUser` (filtro por `userId` propio) anotados `tenant-safe` — todos accesos genuinamente pre-scope o PK-anchored, sin filtro de tenant posible/necesario.

### Task 3 — analytics unique-members + settings

- `routes.ts`: `GET /attendance/unique-members` ahora resuelve `assertTenant(request.scope, "analytics.uniqueMembers")` y lo pasa al service (era el unico endpoint de `analytics` sin el guard).
- `attendance-metrics-service.ts`: `uniqueMembers` recibe `ctx` primero (mismo orden que `checkInAdoptionByBranch`) y agrega `tenantWhere(schema.attendance, ctx)` como primer termino de `conditions` — antes el `COUNT(DISTINCT attendance.member_id)` mezclaba asistencia de TODOS los tenants. 2 anotaciones `tenant-safe` (indireccion via `conditions` en el `.select().from()` previo al `.where()` y en la rama del ternario `needsBranchJoin`).
- `test/analytics/attendance-metrics.test.ts`: las 3 llamadas directas a `svc.uniqueMembers(filters)` se actualizaron a `svc.uniqueMembers(CTX, filters)` usando el `CTX` ya existente en el archivo (precedente de 174.1-03 para `checkInAdoptionByBranch`).
- **settings**: confirmado que `system_settings` (`src/db/schema/system-settings.ts`) NO tiene columna `tenant_id` — key-value global por diseño (usado por streaks). Sin cambios de codigo.

### Task 4 — allowlist

Removidas 7 entradas de `tenant-lint-allowlist.json` (174 -> 167): `improvement-proposals/service.ts` (branches, improvement_proposals), `auth/refresh-token-service.ts` (refresh_tokens), `auth/routes.ts` (promo_plans, referrals), `analytics/attendance-metrics-service.ts` (attendance, branches). NO se tocaron: `auth/routes.ts/branches` (cubre 3 accesos fuera de alcance, lineas 442/572/804) ni las 15 entradas restantes de `analytics` `branches`-por-pais (patron derivado tolerado, se saldan en 175.1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug real encontrado en ejecucion] `resolveTenantId` sobre `users` (tabla STRICT) rompia TODO registro con `TenantSentinelError`**

- **Found during:** Task 2, primera corrida de `test/auth` (36/51 tests rojos, incluyendo registro basico sin promo/ref).
- **Issue:** Al implementar `issue(userId)` con una query nueva sobre `users.tenant_id`, la anote como `tenant-safe` SOLO con un comentario TS (siguiendo el patron usado en el resto del archivo para `refresh_tokens`, tabla NO strict). `users` ya esta en `TENANT_STRICT_MODULES` desde la fase 166 — el sentinel de runtime intercepta cada query real a esa tabla y solo reconoce la exencion si esta **embebida en el SQL** (Drizzle nunca emite comentarios TS en el texto que llega al pool), asi que la query moria con `TenantSentinelError` en TODO registro (`POST /auth/register`), no solo en los casos con promo.
- **Fix:** Reescribi el `.where(...)` para embeber el mismo motivo dentro de un fragmento `sql\`/_ tenant-safe: ... _/ ${eq(...)}\``(mismo idioma que T-173-22, ya usado 5 veces en`auth/routes.ts`).
- **Files modified:** `el-templo-api/src/modules/auth/refresh-token-service.ts`.
- **Commit:** `28ceebaa` (mismo commit de Task 2, el bug se encontro y arreglo antes de commitear).

No hubo deviations tipo Rule 2/3/4 adicionales.

## Auth Gates

Ninguno.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno — todo el trabajo de este plan es _mitigacion_ de los 3 threats ya registrados en el `<threat_model>` del PLAN (T-175-06-I/E/T), sin superficie nueva.

## Verificacion final (worktree `et-173`, HEAD `e77232d0`)

- `pnpm exec tsc --noEmit` → **0 errores**.
- `pnpm lint:tenant` → `DISCREPANCIAS: 0` (`unlistedViolations` 0, `staleMissingFile` 0, `staleNoLongerViolating` 0, `gainedEntries` 0 sin `--base` local, `strictWithAllowlist` 0). Allowlist: **174 → 167** entradas.
- `pnpm exec vitest run --no-file-parallelism test/improvement-proposals test/auth test/analytics` → **297/312 verdes**. Los 15 rojos restantes son **PRE-EXISTENTES (D6)**: fixtures/asserts de test que hacen SQL crudo sobre `subscriptions` (tabla STRICT desde 172/173) sin `tenantWhere` — NINGUNO de esos archivos fue tocado por este plan (`test/analytics/analytics.test.ts` 3, `breakdowns-cohorts.test.ts` 2, `expiry-cohort.test.ts` 3, `internal-exclusion.test.ts` 2, `member-flows.test.ts` 3, `test/auth/promo-registration.test.ts` 2). Reproducido de forma consistente en 2 corridas completas separadas.
  - `test/improvement-proposals`: 16/16 verde.
  - `test/auth`: 49/51 verde (2 D6).
  - `test/analytics`: 232/245 verde (13 D6).
- **NO se corrio `test/tenancy`** (regla dura del prompt — lo corre el orquestador).

## Self-Check: PASSED

- `el-templo-api/src/modules/improvement-proposals/service.ts` → FOUND, contiene `tenantValues`.
- `el-templo-api/src/modules/auth/routes.ts` → FOUND, contiene `tenantWhere`.
- `el-templo-api/src/modules/analytics/attendance-metrics-service.ts` → FOUND, contiene `tenantWhere(schema.attendance`.
- `el-templo-api/tenant-lint-allowlist.json` → FOUND, entradas scopeadas removidas (174→167).
- Commits verificados en `git log --oneline` de `et-173` (`feat/173-adopcion-members`): `b335d569`, `d89a8c57`, `28ceebaa`, `48a6ca90`, `e77232d0` — todos presentes.
