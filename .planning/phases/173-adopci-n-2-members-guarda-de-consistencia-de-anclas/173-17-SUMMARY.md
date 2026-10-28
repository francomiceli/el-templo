---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 17
subsystem: api
tags:
  [tenancy, multitenancy, drizzle, members, assertTenant, ctx-first, ratchet]

requires:
  - phase: 173-05
    provides: "buildMemberNameSearchCondition(ctx, search, options) y memberCoveredUntilSql(ctx) — helpers ya scopeados de shared/member-search.ts y shared/covered-until.ts"
  - phase: 173-02
    provides: "inventario de mocks posicionales (0 sobre los 23 métodos) y tsconfig.test-check.json"
provides:
  - "Los 23 métodos públicos/privados de members/service.ts reciben ctx: TenantContext como PRIMER parámetro — ningún call site viejo compila"
  - "searchMembers y exportMembers (T-173-05-01, la búsqueda por nombre sin filtro) migradas PRIMERO: usan los helpers ya scopeados en vez de la copia local legacyUnscopedNameSearchCondition, que se elimina"
  - "assertTenant en el borde de las 24 rutas de members/routes.ts y la única ruta de leads-routes.ts (25 handlers, 1 assertTenant cada uno)"
  - "3 assertTenant preexistentes con etiqueta de 2 puntos (members.create.assignPlan, members.update.cancelSubscription, members.delete.cancelSubscription) y 2 con prefijo referrals. se unifican al formato members.<operación>, hoisteados a un solo const ctx por handler"
  - "coach-load-routes.ts propaga el ctx que el handler ya resolvía a checkDuplicates/createMinimalMember"
affects:
  [
    "173-18 (lecturas de members/service.ts): recibe las 23 firmas con ctx listas para filtrar",
    "173-19 (más lecturas/exports)",
    "173-20 (queries directas de members/routes.ts, incluido GET /branches)",
    "173-30 (el switch): 0 tenantWhere/tenantValues nuevos en este plan — la allowlist real no cambia",
  ]

tech-stack:
  added: []
  patterns:
    - "Cuando un plan de plomería encuentra un duplicado local sin gimnasio (legacyUnscopedNameSearchCondition) que un plan anterior dejó documentado como HALLAZGO de prioridad, migrar ese call site PRIMERO y reemplazar por el helper ya scopeado en vez de esperar al plan de queries — el diff sigue siendo cero tenantWhere NUEVO porque el filtro ya vivía en el helper, solo cambia QUIÉN lo llama"
    - "assertTenant hoisteado: cuando un handler ya tenía un assertTenant inline como argumento de una sola llamada (ej. subscriptionService.assignPlan), se extrae a `const ctx` al inicio del handler y se reusa en todas las llamadas a memberService/otros services del mismo handler — 'un solo assertTenant por handler' incluye los que ya existían, no solo los nuevos"
    - "Un handler sin llamada a service (GET /branches) igual recibe su assertTenant si el plan lo etiqueta explícitamente — el guard corre por su efecto de fail-closed (403 si el gimnasio no resuelve), aunque el ctx devuelto todavía no se use en ninguna query (esa migración es de 173-20)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/leads-routes.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts

key-decisions:
  - "Prioridad del 173-05 aplicada: searchMembers y exportMembers se migraron PRIMERO (antes que el resto de los 22 métodos), reemplazando legacyUnscopedNameSearchCondition (T-173-05-01) por buildMemberNameSearchCondition/memberCoveredUntilSql. El duplicado local se eliminó del archivo — no quedan dos copias de la lógica de búsqueda."
  - "convertFreemiumToTrial no tenía etiqueta en la lista fija del plan (18 etiquetas para 24 rutas): se usó 'members.convertToTrial', seleccionada por el planner porque el criterio de aceptación es el FORMATO (members.<operación>), no la lista literal."
  - "GET /branches recibe assertTenant(request.scope, 'members.branches') aunque no llama a memberService: cumple el 'uno por handler' que el plan pide para las 25 rutas y deja el gate de cobertura (grep -c >= 24) satisfecho sin inventar un uso prematuro del ctx. El filtro de esa query directa es del plan 173-20."
  - "Los 3 assertTenant preexistentes con etiqueta de 2 puntos (members.create.assignPlan, members.update.cancelSubscription, members.delete.cancelSubscription) se hoistearon a un const ctx único por handler y se renombraron a members.create/members.update/members.delete — ningún test asertaba sobre el string literal (verificado por grep antes de tocarlo)."
  - "Las 2 rutas de referidos de la ficha (GET/POST /:userId/referrals) tenían assertTenant con prefijo 'referrals.' en vez de 'members.': se renombraron a 'members.referrals' para cumplir el formato uniforme exigido por la acceptance criteria de este plan, aunque llaman a ReferralService (no a MemberService) — viven físicamente en members/routes.ts."
  - "trials-service.ts y tracking-service.ts NO se tocaron: verificado con grep que solo mencionan 'members/service.ts' en comentarios explicativos, ningún call site real a MemberService."
  - "Docblock de listMembers reescrito: ya no dice que las tablas del listado 'se migran en su propia fase' — declara EN MAYÚSCULAS qué recibe (ctx) pero todavía no usa (el .from(schema.users) principal, innerJoin(branches), subqueries de subscriptions/subscription_plans/member_profiles/bookings), y nombra los planes dueños (173-18/19/20) en vez de una fase genérica."

requirements-touched: [ADO-02]
# ADO-02 NO se marca completo (mismo criterio que 173-02-SUMMARY): "members
# migrado al patrón completo" es cierto recién después del switch de 173-30.
# Este plan es plomería de firmas — cero tenantWhere/tenantValues nuevo.

duration: ~140min
completed: 2026-08-08
---

# Phase 173 Plan 17: Plomería de firmas de members/service.ts + assertTenant en el borde Summary

**Los 23 métodos de `members/service.ts` reciben `ctx: TenantContext` como primer parámetro y las 25 rutas del módulo (`members/routes.ts` + `leads-routes.ts`) resuelven su gimnasio en el borde con `assertTenant` — sin filtrar una sola query, salvo el arreglo de prioridad heredado de 173-05: `searchMembers`/`exportMembers` (la búsqueda por nombre sin gimnasio, T-173-05-01) se migran primero y dejan de usar la copia local duplicada.**

## Performance

- **Duration:** ~140 min
- **Completed:** 2026-08-08
- **Tasks:** 2/2
- **Files modified:** 4

## Task Commits

1. **Task 1: ctx primero en los 23 métodos de members/service.ts** — `39b0f34d`
2. **Task 2: assertTenant en el borde de las 25 rutas y propagación externa** — `eed55605`

---

## Task 1 — `members/service.ts`

Los 22 métodos que no tenían `ctx` (`listMembers` ya lo tenía desde 172) reciben `ctx: TenantContext` como **primer** parámetro:

`searchMembers`, `getMemberById`, `createMember`, `createTrialMember`, `createMinimalMember`, `convertFreemiumToTrial`, `updateLead`, `getLeadBranchId`, `updateMember`, `softDeleteMember`, `resetMemberPassword`, `checkDniUniqueness`, `checkDuplicates`, `updatePhoto`, `exportMembers`, `exportSepaMembers`, `getNotes`, `createNote`, `updateNote`, `deleteNote`, `getSessionLevelCounts`, y el privado `wasEverLead`.

Todos los call sites **internos** de la clase (`this.getMemberById`, `this.checkDuplicates`, `this.wasEverLead`, `this.getNotes`) se actualizaron para pasar `ctx`.

### Prioridad del 173-05, aplicada primero

`searchMembers` y `exportMembers` se migraron **antes** que el resto — el propio docblock que 173-05 dejó en el archivo lo pedía explícitamente ("Debería ser lo PRIMERO que 173-17 migra, no lo último"). Ambos dejaron de llamar a `legacyUnscopedNameSearchCondition` (la copia local sin gimnasio) y pasaron a usar:

- `buildMemberNameSearchCondition(ctx, search)` (`shared/member-search.ts`) para la búsqueda por nombre/DNI.
- `memberCoveredUntilSql(ctx)` (`shared/covered-until.ts`) para la fecha de cobertura del export (reemplaza la subquery duplicada sin filtro).

La función `legacyUnscopedNameSearchCondition` (y su docblock, que documentaba la deuda) se **eliminó** del archivo — no quedan dos copias de la lógica de búsqueda.

### El docblock de `listMembers`

Reescrito: ya no dice "el resto de las tablas del listado... se migra en su propia fase" (una frase que un lector futuro leería como "ya está resuelto"). Ahora declara en mayúsculas qué el método RECIBE (`ctx`) pero TODAVÍA NO USA para el `.from(schema.users)` principal, el `innerJoin(branches)` y las subqueries de `subscriptions`/`subscription_plans`/`member_profiles`/`bookings`, y nombra los planes dueños de esa migración (173-18/173-19/173-20).

### Verificación de Task 1

| Comando                                                                                    | Resultado                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grep -c "ctx: TenantContext" service.ts`                                                  | **23**                                                                                                                                                                                  |
| `git diff service.ts \| grep -c "tenantWhere\|tenantValues"` (solo líneas agregadas)       | **0**                                                                                                                                                                                   |
| `grep -rnE "tenantId!\|tenantId\s*\?\?\|: any" service.ts`                                 | 0 líneas                                                                                                                                                                                |
| Barrido de mocks posicionales (`grep -rn "\.<método> = async" test/`) sobre los 23 métodos | **0** hits — confirma el inventario 173-02                                                                                                                                              |
| `pnpm exec tsc -p tsconfig.test-check.json --noEmit` (justo tras Task 1, antes de Task 2)  | **26 TS2554** — esperado: son los call sites de `routes.ts`/`leads-routes.ts`/`coach-load-routes.ts` que Task 2 resuelve en el mismo plan (doc 07 §3, corte 2: dos commits a propósito) |

---

## Task 2 — `assertTenant` en el borde

### `members/routes.ts` — 24 handlers, 24 `assertTenant`

Un `const ctx = assertTenant(request.scope, "members.<operación>")` por handler. Etiquetas usadas (verificadas con `grep -oE`):

`members.branches`, `members.checkDni`, `members.checkDuplicates`, `members.export`, `members.exportSepa`, `members.list` (ya existía), `members.search`, `members.get`, `members.create`, `members.createTrial`, `members.convertToTrial`, `members.update`, `members.delete`, `members.password`, `members.photo`, `members.sessionLevels`, `members.notes` (×4: GET/POST/PUT/DELETE), `members.referrals` (×2: GET/POST). Más `members.financial-history` / `members.outstanding-concepts`, preexistentes de la 172 (llaman a `transactionService`, no a `memberService` — sin cambios).

**3 `assertTenant` preexistentes con etiqueta de 2 puntos se hoistearon y renombraron** (verificado por grep que ningún test asertaba sobre el string literal):

- `members.create.assignPlan` → `members.create` (handler `POST /`, reusado también para `createMember` y el `getMemberById` de refresco).
- `members.update.cancelSubscription` → `members.update` (handler `PUT /:userId`, reusado para `updateMember` y los 2 `getMemberById` de refresco).
- `members.delete.cancelSubscription` → `members.delete` (handler `DELETE /:userId`, reusado para `softDeleteMember`).

**2 rutas de referidos renombradas de `referrals.*` a `members.referrals`** (viven en `members/routes.ts`, aunque llaman a `ReferralService`): `GET /:userId/referrals` y `POST /:userId/referrals`.

**`GET /branches`** recibe `assertTenant(request.scope, "members.branches")` sin usar el `ctx` retornado todavía — no llama a `memberService`, así que no hay a quién pasarle `ctx`; el guard corre igual por su efecto fail-closed (403 si el gimnasio no resuelve). El filtro de esa query directa (`schema.branches`) es del plan 173-20.

### `members/leads-routes.ts` — 1 handler, 1 `assertTenant`

`const ctx = assertTenant(request.scope, "leads.update")`, propagado a `getLeadBranchId` y `updateLead`.

### `finance/coach-load-routes.ts` — propagación, sin segundo `assertTenant`

El handler `POST /coach-load/alta` ya resolvía `const ctx = assertTenant(request.scope, "coach-load.alta")` (de la fase 172). Se propagó ese mismo `ctx` a `memberService.checkDuplicates(ctx, {...})` y `memberService.createMinimalMember(ctx, {...})` — sin agregar un segundo `assertTenant`.

### `trials-service.ts` / `tracking-service.ts` — verificado, sin cambios

`grep -n "members"` sobre ambos archivos solo encuentra menciones a `members/service.ts` en **comentarios** explicativos ("replica el flujo de creación de members/service.ts createMember"), ningún `import` ni llamada real a `MemberService`. No se tocaron.

### Verificación de Task 2

| Comando                                                                                                                                                                | Resultado                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grep -c "assertTenant(request.scope" members/routes.ts`                                                                                                               | **24**                                                                                                                                                                                                       |
| `grep -c "assertTenant(request.scope" leads-routes.ts`                                                                                                                 | **1**                                                                                                                                                                                                        |
| Doble `assertTenant` por handler (verificado línea por línea con `grep -n`)                                                                                            | 0 handlers con 2                                                                                                                                                                                             |
| `grep -oE 'assertTenant\(request\.scope, "[^"]+"'` — todas las etiquetas                                                                                               | todas `members.<op>` / `leads.<op>`                                                                                                                                                                          |
| `pnpm exec tsc -p tsconfig.test-check.json --noEmit` (raw, tras Task 2)                                                                                                | **limpio** (0 TS2554, 0 errores en `members/`, `leads-routes.ts`, `coach-load-routes.ts`)                                                                                                                    |
| `pnpm exec tsc --noEmit` (build, `src/` solo)                                                                                                                          | limpio                                                                                                                                                                                                       |
| `pnpm typecheck:tests` (ratchet — regla dura del prompt, no `tsc --noEmit` a secas)                                                                                    | **DISCREPANCIAS: 0** — 185/185 = baseline exacto, 0 nuevos, 0 empeorados, 0 obsoletos, **TS2554: 0**                                                                                                         |
| `pnpm exec vitest run --no-file-parallelism test/members test/leads`                                                                                                   | **172/172** (11 archivos)                                                                                                                                                                                    |
| `pnpm exec vitest run --no-file-parallelism test/admin-leads-patch.test.ts` (extra — el glob `test/leads` del plan no lo capturaba)                                    | **18/18**                                                                                                                                                                                                    |
| `pnpm exec vitest run --no-file-parallelism test/finance/coach-load*.test.ts test/tenancy/iso-03-finance-coach-load.test.ts` (extra, por tocar `coach-load-routes.ts`) | **92/92**                                                                                                                                                                                                    |
| `pnpm lint:tenant --allowlist=/tmp/allowlist-173-17.json` (copia de trabajo, no commiteada)                                                                            | `unlistedViolations: 0`; 65 `staleNoLongerViolating` preexistentes de otros planes (ninguno en `members/service.ts`, `members/routes.ts`, `leads-routes.ts` ni `coach-load-routes.ts` — verificado con grep) |
| `git diff` de los 4 archivos, líneas agregadas que contienen `tenantWhere`/`tenantValues`                                                                              | **0**                                                                                                                                                                                                        |
| `git status --porcelain` (worktree, tras cada commit)                                                                                                                  | vacío                                                                                                                                                                                                        |

---

## Deviations from Plan

### [Ejecutado según hallazgo del 173-05, no una desviación] Prioridad de `searchMembers`/`exportMembers`

El plan (objective + Task 1) ya pedía esta prioridad explícitamente, heredada del hallazgo de 173-05. Se ejecutó tal cual: ambos métodos se migraron primero, y el duplicado `legacyUnscopedNameSearchCondition` se eliminó reemplazando por los helpers scopeados. Documentado arriba, no como desviación sino como cumplimiento directo del objetivo.

### [Rule 1 — ajuste menor] El docblock nuevo de `listMembers` mencionaba `tenantWhere` literalmente

- **Found during:** Task 1, verificación del criterio "diff sin `tenantWhere`/`tenantValues` nuevo".
- **Issue:** la primera redacción del docblock decía "...que embeben su propio `tenantWhere`", lo cual hacía que `git diff | grep -c "tenantWhere\|tenantValues"` diera 1 (una mención en comentario, no código) en vez de 0.
- **Fix:** se reescribió la frase sin el término literal ("ya filtran por gimnasio puertas adentro, sin que este método tenga que duplicar nada"), preservando el significado.
- **Files:** `el-templo-api/src/modules/members/service.ts`.
- **Commit:** `39b0f34d`.

### [Hallazgo de plan, no bloqueante] `convertFreemiumToTrial` sin etiqueta en la lista fija

- El plan lista 18 etiquetas para las 24 rutas (varias comparten etiqueta: notas ×4, referidos ×2), pero no incluye una para `POST /:userId/convert-to-trial`. Se usó `members.convertToTrial`, consistente con el formato exigido por la acceptance criteria (`members.<operación>`), no con la lista literal (que el propio plan no declara exhaustiva).

### [Hallazgo de plan, no bloqueante] 3 `assertTenant` preexistentes con formato distinto

- `members.create.assignPlan`, `members.update.cancelSubscription`, `members.delete.cancelSubscription` (dos puntos) y `referrals.overview`/`referrals.assignReferrer` (prefijo distinto) no cumplían el formato `members.<operación>` que la acceptance criteria de este plan exige para el archivo. Se renombraron y hoistearon a un único `const ctx` por handler, verificando primero (grep) que ningún test dependía del string literal.

## Known Stubs

Ninguno. Este plan es plomería de firmas: ningún componente de UI ni endpoint queda sirviendo datos vacíos/mock.

## Threat Flags

Ninguno nuevo. Las 4 mitigaciones del `<threat_model>` del plan quedaron verificadas:

| Threat ID   | Mitigación                                                                                         | Evidencia                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| T-173-17-01 | `assertTenant` único puente `CountryScope`→`TenantContext`; prohibidos `!`/`?? 1`/literal numérico | `grep -rnE "tenantId!\|tenantId\s*\?\?\|: any"` sobre los 4 archivos → 0 líneas                                       |
| T-173-17-02 | `ctx` PRIMERO en la firma — call site olvidado no compila                                          | `pnpm typecheck:tests` → `TS2554: 0` tras Task 2 (26 esperados y resueltos entre Task 1 y Task 2)                     |
| T-173-17-03 | Mocks posicionales de test                                                                         | 0 hits sobre los 23 métodos, confirma inventario 173-02                                                               |
| T-173-17-04 | `attachCountryScope` montado en hook `onRequest` de los 2 archivos de rutas                        | Verificado leyendo `members/routes.ts:106-115` y `leads-routes.ts:38-47` — ambos lo llaman antes de cualquier handler |

Adicionalmente, este plan **cierra** (no abre) la superficie que 173-02 había marcado con `threat_flag: information-disclosure` sobre `searchMembers` (servía `/api/admin/members/search` sin gimnasio) — queda mitigada por la migración de prioridad, aunque su cierre COMPLETO (con `tenantWhere` real en la query subyacente que `buildMemberNameSearchCondition` ejecuta) ya estaba resuelto desde 173-05 puertas adentro del helper; este plan solo conecta `searchMembers`/`exportMembers` a esa protección ya existente.

## Self-Check: PASSED

- `el-templo-api/src/modules/members/service.ts` — FOUND, 23 `ctx: TenantContext`, `legacyUnscopedNameSearchCondition` ausente
- `el-templo-api/src/modules/members/routes.ts` — FOUND, 24 `assertTenant(request.scope`
- `el-templo-api/src/modules/members/leads-routes.ts` — FOUND, 1 `assertTenant(request.scope`
- `el-templo-api/src/modules/finance/coach-load-routes.ts` — FOUND, 2 call sites con `ctx` propagado
- Commit `39b0f34d` — FOUND (`git log --oneline`)
- Commit `eed55605` — FOUND (`git log --oneline`)
- `pnpm typecheck:tests` → `DISCREPANCIAS: 0`
- `pnpm exec vitest run --no-file-parallelism test/members test/leads` → 172/172
- `pnpm exec vitest run --no-file-parallelism test/admin-leads-patch.test.ts` → 18/18
- `pnpm exec vitest run --no-file-parallelism test/finance/coach-load*.test.ts test/tenancy/iso-03-finance-coach-load.test.ts` → 92/92
- `pnpm lint:tenant --allowlist=/tmp/allowlist-173-17.json` → `unlistedViolations: 0`
- `git status --porcelain` (worktree `et-173`) — vacío tras cada commit
