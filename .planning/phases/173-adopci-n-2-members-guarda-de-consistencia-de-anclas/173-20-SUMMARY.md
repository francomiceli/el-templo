---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 20
subsystem: tenancy
tags: [tenancy, ado-02, members, routes, tenantWhere, tenantValues, closures]

# Dependency graph
requires:
  - phase: 173-17
    provides: "assertTenant en el borde de las 25 rutas de members/routes.ts + leads-routes.ts (ctx ya resuelto por handler)"
  - phase: 173-11
    provides: "resolveBranchDelGimnasio/assertBranchDelGimnasio (D-05) — ya consumidos dentro de members/service.ts por 173-18, no por este plan"
provides:
  - "members/routes.ts: las ~18 queries directas de los handlers (incluidas 2 escrituras via db.transaction) filtran por gimnasio; GET /branches (selector de sedes de toda la UI de socios) deja de ofrecer sedes ajenas"
  - "assertReferralTargetInScope (closure del cuerpo del plugin) recibe ctx como PRIMER parametro — cierra la trampa (c) para este archivo"
  - "leads-routes.ts verificado: 0 queries directas, 0 entradas de allowlist propias, sin branchId en el body (nada que resolver con el helper de 173-11)"
affects:
  [
    "173-30 (el switch): members/routes.ts y leads-routes.ts quedan en 0 entradas de allowlist por CUALQUIER criterio (tabla o archivo); members/service.ts sigue con 12 entradas vivas (dueño: 173-19, no ejecutado todavia en esta corrida)",
  ]

tech-stack:
  added: []
  patterns:
    - "El grep de 'fastify.db' NO ve las queries hechas via `await fastify.db.transaction(async (tx) => { tx.update(...) })` — el lint de tenancy si las ve. Verificar SIEMPRE con el lint antes de dar un archivo por cerrado, no solo con el grep de arqueologia inicial."
    - "assertReferralTargetInScope (closure declarada en el cuerpo del plugin) recibe ctx PRIMERO; los 2 call sites (GET/POST /:userId/referrals) le pasan el que su propio handler ya resolvio con assertTenant — mismo patron que resolveUserBranchId de coach-load-routes.ts (172)."
    - "financial-history y outstanding-concepts hoisteaban `assertTenant` INLINE como argumento de la llamada al service — se hoistearon a `const ctx` al inicio del handler porque la query directa de target (users+branches join) tambien necesita ese ctx antes de llegar al service."

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/routes.ts

key-decisions:
  - "El chequeo de sede destino en la conversion online->presencial (PUT /:userId, ~linea 940) recibe tenantWhere pero NO el helper assertBranchDelGimnasio de 173-11: es una lectura previa de UX (detectar si hay que exigir campos presenciales), no la escritura del ancla — esa validacion real ya vive DENTRO de memberService.updateMember (173-18) usando el helper. Duplicarla acá violaria D-02 (cirugia minima) sin agregar proteccion nueva."
  - "leads-routes.ts no necesita ningun cambio de codigo: UpdateLeadInput no acepta branchId (verificado en schemas.ts/types.ts), así que la advertencia condicional del plan ('si acepta branchId, resolverlo con el helper de 173-11') no aplica. getLeadBranchId y updateLead en members/service.ts ya llegan con tenantWhere inline (trabajo de un plan anterior a este)."
  - "El criterio de aceptacion 'CERO entradas bajo src/modules/members/' se cumple para los DOS archivos que este plan modifica (routes.ts, leads-routes.ts: 0 y 0), pero NO para el modulo completo — members/service.ts todavia tiene 12 entradas vivas (de 14; 2 ya estaban stale antes de este plan). El plan 173-19, dueño de esa migracion, no se habia ejecutado todavia en esta corrida (depends_on de este plan es solo 173-17, no 173-19)."

requirements-touched: [ADO-02]
# ADO-02 no se marca completo: "members migrado al patron completo" recien es
# cierto despues del switch de 173-30 (mismo criterio que 173-17/173-19).

duration: ~75min
completed: 2026-08-08
---

# Phase 173 Plan 20: Queries directas de members/routes.ts + selector de sedes Summary

**Las ~18 queries directas de los handlers de `members/routes.ts` (incluidas 2 escrituras hechas dentro de una transacción, que el grep inicial de `fastify.db` no detectó) reciben `tenantWhere`/`tenantValues` inline, el selector de sedes `GET /branches` deja de ofrecer sedes de otro gimnasio, y la closure `assertReferralTargetInScope` cierra la trampa (c) recibiendo `ctx` como primer parámetro; `leads-routes.ts` se verificó sin cambios de código (cero queries directas, sin `branchId` en el body).**

## Performance

- **Tasks:** 2/2
- **Files modified:** 1 (`el-templo-api/src/modules/members/routes.ts`)
- **Duration:** ~75 min

## Task Commits

1. **Task 1: Las queries directas de los handlers y el selector de sedes** — `d5a2c3cb` (feat)
2. **Fix (Rule 1, hallado durante la verificación de Task 2 — ver Deviations)** — `cb7c712c` (fix)
3. **Task 2: leads-routes.ts y cierre del criterio tabla-O-archivo** — sin commit propio: `leads-routes.ts` no requirió ningún cambio de código (ver abajo). Verificado contra la allowlist de trabajo y con la batería de tests.

---

## Task 1 — `members/routes.ts`

Re-derivada la lista con `grep -n "fastify.db"` sobre el archivo actual (las líneas del CONTEXT/PATTERNS habían quedado stale por los planes 173-17/18, que ya movieron línea). Se migraron 12 bloques de query directa:

| #   | Handler                                                | Tabla(s)                                         | Forma                                                             |
| --- | ------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------- |
| 1   | `GET /branches` (T-173-20-01)                          | `branches`                                       | `tenantWhere` inline en el `where`                                |
| 2   | `GET /:userId` — cross-country guard                   | `branches`                                       | `tenantWhere` inline                                              |
| 3   | `GET /:userId` — fetch de perfil                       | `member_profiles`                                | `tenantWhere` inline                                              |
| 4   | `POST /` — validación de `referredBy`                  | `users`                                          | `tenantWhere` inline                                              |
| 5   | `PUT /:userId` — lectura `current`                     | `users` (where) + `branches` (ON del INNER JOIN) | `tenantWhere` en ambos                                            |
| 6   | `PUT /:userId` — sede destino de la conversión         | `branches`                                       | `tenantWhere` inline (lectura de UX, no el ancla — ver Decisions) |
| 7   | `DELETE /:userId` — lectura `target`                   | `users` (where) + `branches` (ON)                | `tenantWhere` en ambos                                            |
| 8   | `DELETE /:userId` — cancelar bookings futuros          | `bookings`                                       | `tenantWhere` inline                                              |
| 9   | `PUT /:userId/password` — lectura `target`             | `users` (where) + `branches` (ON)                | `tenantWhere` en ambos                                            |
| 10  | `GET /:userId/financial-history` — lectura `target`    | `users` (where) + `branches` (ON)                | `tenantWhere` en ambos; `ctx` hoisteado                           |
| 11  | `GET /:userId/outstanding-concepts` — lectura `target` | `users` (where) + `branches` (ON)                | `tenantWhere` en ambos; `ctx` hoisteado                           |
| 12  | `assertReferralTargetInScope` (closure, trampa (c))    | `users` (where) + `branches` (ON)                | `tenantWhere` en ambos; `ctx` como PRIMER parámetro               |

Todos los joins llevan el filtro de `branches` en el **ON**, nunca en el WHERE (ninguno de estos es un LEFT JOIN, pero se mantuvo la convención igual).

`GET /branches` (T-173-20-01): la query que alimenta el selector de sedes de toda la UI de socios pasó de `.where(eq(schema.branches.isActive, true))` a `.where(and(tenantWhere(schema.branches, ctx), eq(schema.branches.isActive, true)))`. Es la mitigación completa del threat del plan: el staff de un gimnasio deja de ver — y de poder elegir — sedes del otro.

`assertReferralTargetInScope`: cambió de `(request) => Promise<number>` a `(ctx: TenantContext, request) => Promise<number>`; los 2 call sites (`GET`/`POST /:userId/referrals`) le pasan el `ctx` que su propio handler ya había resuelto con `assertTenant`.

### Hallazgo durante la verificación de Task 2 (Rule 1 — bug, commit `cb7c712c`)

Al correr `pnpm lint:tenant` para preparar la allowlist de trabajo de Task 2, aparecieron 2 tablas de `members/routes.ts` que **seguían siendo violación real** (`users`, `user_status_history`) pese a que el grep inicial de Task 1 no las había señalado. Causa: dos bloques dentro de `PUT /:userId` (la conversión online→presencial y la auto-promoción SP→legajo) escriben `users`/`user_status_history` **a través de `await fastify.db.transaction(async (tx) => { ... })`** — el grep de `"fastify.db"` solo encontró el `.transaction(` en sí, nunca las queries de `tx` que viven adentro del callback. Se agregó `tenantWhere(schema.users, ctx)` a los 2 `tx.update(schema.users)` y `tenantValues(ctx, {...})` a los 2 `tx.insert(schema.userStatusHistory)`. Verificado con `test/members/user-status-history-hooks.test.ts` (ejercita ambas ramas) — sigue en verde.

### Verificación de Task 1 + el fix

| Comando                                                         | Resultado                                                                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grep -c "tenantWhere" members/routes.ts`                       | **21** (≥ 9 exigido)                                                                                                                                                 |
| `grep -n "fastify.db" members/routes.ts \| wc -l`               | 34 (incluye instanciaciones de servicios, no todas son queries)                                                                                                      |
| `pnpm exec tsc --noEmit` (src/)                                 | limpio                                                                                                                                                               |
| `pnpm typecheck:tests` (ratchet — NO `tsc --noEmit` a secas)    | **DISCREPANCIAS: 0** — 185/185 baseline exacto, 0 nuevos, 0 empeorados, TS2554: 0                                                                                    |
| `pnpm exec vitest run --no-file-parallelism test/members`       | **167/167** (antes del fix) → **185/185** (11 archivos, después del fix — el archivo `admin-leads-patch.test.ts` se corrió junto en la verificación final de Task 2) |
| `grep -nE "tenantId!\|tenantId\s*\?\?\|: any"` sobre el archivo | 0 líneas                                                                                                                                                             |
| `grep -cE "403\|Forbidden"` antes (`0585b1e3`) vs después       | `21`/`4` → `21`/`4` (sin cambio, D-06)                                                                                                                               |

---

## Task 2 — `leads-routes.ts` y cierre del criterio tabla-O-archivo

`leads-routes.ts` se leyó completo: su único handler (`PATCH /:userId`) ya resuelve `const ctx = assertTenant(request.scope, "leads.update")` (173-17) y delega TODO en `memberService.getLeadBranchId`/`updateLead`, que ya llegan con `tenantWhere` inline (trabajo de un plan anterior). **No hace ninguna query directa** — cero cambios de código necesarios.

`UpdateLeadInput`/`updateLeadSchema` (`schemas.ts`, `additionalProperties: false`) **no aceptan `branchId`** — la advertencia condicional del plan ("si la ruta acepta un `branchId` en el body, resolverlo con el helper de 173-11 antes de pasarlo al service") no aplica: no hay tal campo.

### Cierre del criterio §0.3 (tabla O archivo) — solo para los 2 archivos de este plan

Copia de trabajo `/tmp/allowlist-173-20.json` (copia del real, con las 5 entradas de `members/routes.ts` y las 0 de `members/leads-routes.ts` removidas):

```
pnpm exec tsx src/db/scripts/lint-tenant.ts --allowlist=/tmp/allowlist-173-20.json
  Violaciones NO listadas en la allowlist (unlistedViolations): 0
  grep -c "members/routes.ts\|members/leads-routes.ts" /tmp/allowlist-173-20.json → 0
```

**Cero entradas de allowlist bajo `members/routes.ts` o `members/leads-routes.ts`, por ninguna tabla, con `unlistedViolations: 0`** — el fix del `.transaction()` no dejó ninguna violación nueva sin listar.

⚠️ **Desviación respecto del comando literal del plan:** el plan escribe `pnpm lint:tenant --allowlist /tmp/allowlist-173-20.json` (con espacio). El parser de `lint-tenant.ts` solo reconoce `--allowlist=<ruta>` (con `=`); con espacio el flag se ignora en silencio y el script corre contra la allowlist real. Se usó `--allowlist=/tmp/allowlist-173-20.json` (con `=`), consistente con el uso real de 173-11/173-17 (`pnpm lint:tenant --allowlist=/tmp/allowlist-173-XX.json` en sus SUMMARYs). Rule 3 (bug bloqueante menor en el propio texto del plan).

### Balance contra el objetivo del switch (insumo para 173-30)

- **Objetivo total del módulo (patterns doc §0.1):** 90 entradas (79 por tabla + 11 por archivo, estas últimas solo en `members/routes.ts` y `members/service.ts`).
- **Este plan cierra sus 5 entradas propias** (`members/routes.ts`: `bookings`, `branches`, `member_profiles`, `user_status_history`, `users`) — confirmado stale en `pnpm lint:tenant` (sin `--allowlist`, contra la allowlist REAL sin tocar): las 5 aparecen en `staleNoLongerViolating`.
- **`members/leads-routes.ts`: 0 entradas propias** — nada que cerrar, confirmado.
- **`members/service.ts` (dueño: plan 173-19, NO ejecutado todavía en esta corrida — `depends_on` de este plan es solo `173-17`): 14 entradas, de las cuales 2 ya aparecen stale** (`subscription_schedules`, `user_status_history` — efecto colateral de trabajo de 173-17/18) **y 12 siguen siendo violación real** (`attendance`, `bookings`, `branches`, `completed_sessions`, `member_notes`, `member_profiles`, `referrals`, `schedules`, `subscription_plans`, `subscriptions`, `user_sepa_details`, `users`). Esas 12 son el trabajo pendiente de 173-19.
- **Total codebase-wide `staleNoLongerViolating` tras este plan:** 89 (sobre 450 entradas reales, allowlist SIN tocar — su achique es del plan 173-30). Antes de este plan (tip `0585b1e3`): 84 (contando solo lo que aportaron planes anteriores de la fase). **Este plan aporta +5.**
- **Conclusión para 173-30:** el criterio "CERO entradas bajo `src/modules/members/`" se cumple para `routes.ts` y `leads-routes.ts` (los 2 archivos de este plan) pero NO para el módulo completo — `service.ts` sigue con 12 entradas vivas hasta que 173-19 corra.

### Verificación de Task 2

| Comando                                                                                                                                                                                                                                               | Resultado                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsx src/db/scripts/lint-tenant.ts --allowlist=/tmp/allowlist-173-20.json`                                                                                                                                                                  | `unlistedViolations: 0`; 0 entradas bajo `members/` en la copia                                                                                                                   |
| `pnpm exec vitest run --no-file-parallelism test/members test/admin-leads-patch.test.ts`                                                                                                                                                              | **185/185** (11 archivos) — `test/leads` (glob literal del plan) no existe como directorio; se usó `test/admin-leads-patch.test.ts`, el mismo ajuste que documentó 173-17-SUMMARY |
| `pnpm exec vitest run --no-file-parallelism test/branch-access.test.ts test/referrals/admin-assign-referrer.test.ts test/referrals/admin-referrals-endpoint.test.ts` (extra, por `GET /branches` y los 2 call sites de `assertReferralTargetInScope`) | referrals: **27/27** OK. `branch-access.test.ts`: **5 tests fallan — pre-existentes, NO causados por este plan** (ver Deviations / Known Issues)                                  |
| `grep -cE "403\|Forbidden"` antes/después                                                                                                                                                                                                             | sin cambio (21/4)                                                                                                                                                                 |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tx.update(schema.users)` / `tx.insert(schema.userStatusHistory)` sin tenant, invisibles al grep inicial**

- **Found during:** verificación de Task 2 (`pnpm lint:tenant`), no durante Task 1.
- **Issue:** 2 bloques de `PUT /:userId` (conversión online→presencial y auto-promoción SP→legajo) escriben `users`/`user_status_history` dentro de `await fastify.db.transaction(async (tx) => {...})`. El `grep -n "fastify.db"` de Task 1 encontró el `.transaction(` pero no las queries de `tx` adentro — 2 escrituras quedaron sin filtrar.
- **Fix:** `tenantWhere(schema.users, ctx)` en los 2 `tx.update`, `tenantValues(ctx, {...})` en los 2 `tx.insert(schema.userStatusHistory)`.
- **Files:** `el-templo-api/src/modules/members/routes.ts`.
- **Commit:** `cb7c712c`.

**2. [Rule 3 - bloqueante menor] Flag `--allowlist` del comando de verificación literal del plan no funciona con espacio**

- **Found during:** intento de correr `pnpm lint:tenant --allowlist /tmp/allowlist-173-20.json` tal como está escrito en el plan.
- **Issue:** `lint-tenant.ts` solo parsea `--allowlist=<ruta>` (con `=`); con espacio, el argumento se ignora en silencio y corre contra la allowlist real del repo.
- **Fix:** se usó `--allowlist=/tmp/allowlist-173-20.json` (con `=`), el mismo formato usado en los SUMMARYs de 173-11 y 173-17.
- **Files:** ninguno (solo el comando de verificación).

### Deferred (fuera de alcance — NO corregido)

**`test/branch-access.test.ts` — 5 tests de `canAccessBranch — unit` rotos, causados por 173-11 (no por este plan).**

Detalle completo en `deferred-items.md` (mismo directorio de fase). Resumen: `canAccessBranch` (173-11, D-14) ahora exige `scope.tenantId` vía `assertTenant` internamente; los 10 objetos de scope que ese test construye a mano no tienen `tenantId`, así que los 5 casos que esperaban `true` devuelven `false` (denegados por falta de `tenantId`, no por la regla bajo prueba) y los 5 casos que esperaban `false` "pasan" por el motivo equivocado. Ni `members/routes.ts` ni `members/leads-routes.ts` importan `canAccessBranch` de forma que mi diff pueda afectarlo, y `branch-access.ts`/su test no están en `files_modified` de este plan (D-02, cirugía mínima) — confirmado que ningún commit de este plan toca esos 2 archivos.

## Known Stubs

Ninguno. Este plan solo agrega filtros de tenancy a queries ya existentes — no cambia UI ni introduce datos mock.

## Threat Flags

Ninguno nuevo. Las 5 mitigaciones del `<threat_model>` del plan quedaron verificadas:

| Threat ID   | Mitigación                                                                       | Evidencia                                                                      |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-173-20-01 | `tenantWhere(schema.branches, ctx)` inline en `GET /branches`                    | Verificado leyendo el statement; `grep -c tenantWhere` ≥ 9                     |
| T-173-20-02 | `tenantWhere` inline en las ~12 queries directas re-derivadas con grep           | Tabla de arriba, cada bloque con su tabla y su filtro                          |
| T-173-20-03 | `ctx` primer parámetro de `assertReferralTargetInScope`                          | `git diff` de la firma + los 2 call sites actualizados                         |
| T-173-20-04 | `branchId` en el body de `PATCH /leads/:userId` resuelto con el helper de anclas | No aplica: `UpdateLeadInput` no acepta `branchId` (verificado en schema/types) |
| T-173-20-05 | Barrido específico de búsquedas por nombre/email/dni sin `tenantWhere`           | `grep -nE "\.(name                                                             | email | dni)"`sobre las queries directas de`routes.ts`— ninguna busca por esos campos sin`tenantWhere`(la única búsqueda por nombre del módulo,`searchMembers`, ya fue migrada por 173-17 dentro del service) |

## Self-Check: PASSED

- `el-templo-api/src/modules/members/routes.ts` — FOUND, 21 `tenantWhere`, `assertReferralTargetInScope(ctx, request)` en ambos call sites
- Commit `d5a2c3cb` — FOUND (`git log --oneline`)
- Commit `cb7c712c` — FOUND (`git log --oneline`)
- `.planning/phases/173-adopci-n-2-members-guarda-de-consistencia-de-anclas/deferred-items.md` — FOUND
- `pnpm typecheck:tests` → `DISCREPANCIAS: 0`
- `pnpm exec vitest run --no-file-parallelism test/members test/admin-leads-patch.test.ts` → 185/185
- `pnpm exec vitest run --no-file-parallelism test/referrals/admin-assign-referrer.test.ts test/referrals/admin-referrals-endpoint.test.ts` → 27/27
- `pnpm exec tsx src/db/scripts/lint-tenant.ts --allowlist=/tmp/allowlist-173-20.json` → `unlistedViolations: 0`, 0 entradas bajo `members/`
- `git status --porcelain` (worktree `et-173`) — vacío tras cada commit

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_
