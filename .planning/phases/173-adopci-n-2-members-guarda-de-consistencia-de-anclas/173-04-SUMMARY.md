---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 04
subsystem: tenancy
tags:
  [
    tenancy,
    audit-log,
    country-scope,
    ctx-first,
    tenantValues,
    tenantWhere,
    d-01,
    d-02,
  ]

# Dependency graph
requires:
  - phase: 173-01
    provides: "worktree et-173 sobre el backmerge, tsconfig.test-check.json y pnpm typecheck:tests (ratchet)"
provides:
  - "shared/audit-log.ts: `ctx: TenantContext` PRIMER parametro, insert vía tenantValues(ctx, {...}) — cuello de botella de firmas ya migrado, el compilador nombra los 10 call sites de src/ + 4 de test/"
  - "shared/country-scope.ts: attachScope resuelve un ctx (TenantContext | null) de la propia fila de users y lo aplica sobre la lectura de user_branches y el join de resolveBranchCountry"
  - "test/fixtures/second-tenant.ts: limpiarSegundoGimnasio borra audit_log por tenant_id ANTES de users/tenants (bomba FK que el fix de audit-log destapó)"
affects:
  [
    "173-11 (canAccessBranch, mismo movimiento D-14 sobre branch-access.ts)",
    "173-14 (subscriptions/service.ts, resto del archivo)",
    "173-30 (el switch: audit_log/users/user_branches quedan con 4 entradas más para borrar de tenant-lint-allowlist.json)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ctx: TenantContext | null en un helper que TODAVÍA está resolviendo el scope (country-scope.ts): el guard fail-closed no es un assertTenant en el borde porque el borde es este mismo código — es el propio local var `tenantId` decidiendo si hay o no ctx, nunca `?? 1` ni `!`"
    - "una query que comparte statement con una tabla ajena (resolveBranchCountry: users + branches en el mismo join) hace compliant a las DOS con un solo tenantWhere, porque el lint mide por statement, no por tabla — efecto colateral esperado, no migración de más"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/shared/audit-log.ts
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/programs/enrollment-service.ts
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/test/shared/audit-log.test.ts
    - el-templo-api/src/modules/shared/country-scope.ts
    - el-templo-api/test/fixtures/second-tenant.ts

key-decisions:
  - "compensateDays (subscriptions/service.ts) no tenía ctx en ningún lado — se le agregó como primer parámetro y subscriptions/routes.ts lo resuelve con assertTenant(request.scope, 'subscriptions.compensateDays'), mismo patrón que assignPlan/cancelSubscription en el mismo archivo"
  - "programs/routes.ts (ruta cancel-enrollment) no montaba attachCountryScope — se resuelve en el borde con el mismo patrón ya escrito para enrollAddon (:451) en el mismo archivo"
  - "DESVIACION Rule 1: limpiarSegundoGimnasio no borraba audit_log antes de tenants/users — con auditLog.write ya estampando el gimnasio real (antes cualquier row nacía con tenant_id=1 DEFAULT y nunca chocaba), un void/validate/observe/correct sobre un recurso del gimnasio 2 revienta la limpieza con ER_ROW_IS_REFERENCED_2 (fk_audit_log_tenant / fk_audit_log_actor)"
  - "country-scope.ts: resolveBranchCountry queda compliant también para `branches` como efecto colateral de filtrar `users` en el mismo statement (el lint mide por statement completo, no por tabla puntual) — no es una migración de más, D-02 sigue intacto"

requirements-completed: [ADO-02]

# Metrics
duration: ~140min
completed: 2026-08-07
---

# Phase 173 Plan 04: audit-log.ts + country-scope.ts (2 helpers, guarda de consistencia) — Summary

**Los dos helpers compartidos de mayor alcance del sistema — `audit-log.ts` (10 call sites en `src/` + 4 en `test/`) y `country-scope.ts` (todo el staff autenticado) — migraron a `ctx` primero y `tenantWhere`/`tenantValues`, y en el camino se destapó y arregló una bomba FK latente en la limpieza del fixture de 2 gimnasios que el propio fix de auditoría activó.**

## Performance

- **Duration:** ~140 min
- **Tasks:** 2/2
- **Files modified:** 10 (8 + 2 del fix de test infra)

## Task Commits

1. **Task 1: `audit-log.ts` — ctx primero y tenantValues, 5 call sites** — `22c31254`
2. **Task 2: `country-scope.ts` — users y user_branches filtrados** — `8dd7d194`

---

## Task 1 — `shared/audit-log.ts`

`ctx: TenantContext` pasa a ser el **primer** parámetro de `auditLog.write`, antes de `tx`. El insert corre por `tenantValues(ctx, {...})`, con el tenant estampado después del spread (mass-assignment cerrado a nivel de tipo y de runtime).

`grep -c "tenantValues" audit-log.ts` → **1**. `grep -rnE "tenantId!|tenantId\s*\?\?"` sobre el archivo → **0 líneas**.

### Los call sites — 10 en `src/`, no 5 (el plan contaba archivos, no llamadas)

| Archivo                          | Sitios                                                   | ¿`ctx` ya estaba?                                         |
| -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `finance/movement-service.ts`    | 1 (`reconciliation`)                                     | Sí (fase 172)                                             |
| `finance/transaction-service.ts` | 4 (`voidInTx`, `validate`, `observe`, `correct`)         | Sí (fase 172)                                             |
| `programs/enrollment-service.ts` | 1 (`enrollAddon`)                                        | Sí (fase 172)                                             |
| `programs/routes.ts`             | 1 (ruta cancel-enrollment)                               | **No** — el módulo no monta `attachCountryScope` por hook |
| `subscriptions/service.ts`       | 3 (`assignPlan`, `compensateDays`, `cancelSubscription`) | 2 de 3 sí; `compensateDays` no tenía ninguno              |

Los 8 sitios que ya tenían `ctx` cambiaron una sola línea (`auditLog.write(tx, {` → `auditLog.write(ctx, tx, {`). Los 2 que no lo tenían necesitaron resolverlo en el borde, exactamente como anticipaba la acción del plan ("si alguno no lo tiene, el ctx sale de `assertTenant(request.scope, ...)` en el borde, nunca de un `!` ni de un `?? 1`"):

- **`programs/routes.ts`** (ruta `POST /admin/programs/enrollments/:enrollmentId/cancel`): el módulo `programs` no monta `attachCountryScope` en un hook (cada ruta lo resuelve si lo necesita — mismo patrón ya escrito para `enrollAddon` en el mismo archivo, `:451`). Se agregó `await attachCountryScope(request, fastify.db); const ctx = assertTenant(request.scope, "programs.enrollment.cancel");` antes del bloque que ya tenía la llamada a auditoría.
- **`subscriptions/service.ts` → `compensateDays`**: no tenía `ctx` en ninguna parte de la firma (a diferencia de `assignPlan` y `cancelSubscription`, que ya lo tenían desde la 172). Se le agregó `ctx: TenantContext` como primer parámetro, y `subscriptions/routes.ts` lo resuelve con `assertTenant(request.scope, "subscriptions.compensateDays")` — mismo patrón que las otras 4 rutas de este archivo que ya usan `assertTenant`.

### Test — 4 call sites + 1 fixture nuevo

`test/shared/audit-log.test.ts` tenía sus propios 4 call sites de `auditLog.write(tx, {...})` (Test 1-4, atomicidad/rollback/reason/payload). Se agregó `const CTX: TenantContext = { tenantId: 1 }` (mismo patrón que `test/analytics/ltv.test.ts`, `test/finance/validation-regression.test.ts`, etc.) y los 4 pasan a `auditLog.write(CTX, tx, {...})`.

### D-02 — el diff de los archivos ajenos

Verificado por diff: `movement-service.ts`, `transaction-service.ts`, `enrollment-service.ts` tocan **únicamente** la línea de la llamada a auditoría (los otros 2 argumentos ya estaban armados). `programs/routes.ts` y `subscriptions/service.ts`/`routes.ts` necesitaron 2-4 líneas más para resolver el `ctx` que no existía — exactamente lo que el propio texto del plan preveía como salida válida, no una migración de más.

---

## Task 2 — `shared/country-scope.ts`

`attachScope` resuelve un `ctx: TenantContext | null` de la MISMA fila de `users` que ya proyectaba `tenantId` (línea existente, sin tocar): `null` únicamente en el caso de corrupción de datos (join a `tenants` que no matchea — la FK `fk_users_tenant` lo vuelve imposible en la práctica). Nunca `!` ni `?? 1`.

Con ese `ctx`:

- La lectura de `user_branches` (rol `coach`/`recepcion`) lleva `tenantWhere(schema.userBranches, ctx)` inline como primer término del `and(...)` cuando `ctx` no es null; si es null, queda como estaba (scopeada por `userId`, que es una fila por PK).
- `resolveBranchCountry` (llamada 3 veces: owner, coach/recepcion, member) recibe el `ctx` nullable y lo aplica sobre `users` en su join con `branches`.

`grep -c "tenantWhere" country-scope.ts` → **4**.

### El país sigue filtrando adentro, pero ya no aísla

Dejado explícito en un comentario de bloque (per la acción del plan, mismo movimiento que D-14 hará en `branch-access.ts`, plan 173-11): el aislamiento real de estas dos queries lo da el gimnasio, no el país. El comentario también documenta por qué `tenantWhere` acá es defensa en profundidad y no la única barrera: las dos queries YA scopean por `userId` (una sola fila), así que agregar el filtro de tenant no cambia ningún resultado hoy — cierra la forma estructural para cuando `users` entre a `TENANT_STRICT_MODULES` (switch, 173-30) y el sentinel empiece a exigirlo en runtime.

### Guard fail-closed

`resolveBranchCountry` documenta explícitamente por qué su `ctx` es `TenantContext | null` y no `TenantContext` a secas: a diferencia de un route handler (que siempre puede pasar por `assertTenant` en el borde), acá el llamador es el propio `attachScope` todavía resolviendo el scope — un gimnasio no resoluble es un estado legítimo de este punto (el guard fail-closed ya vive arriba, en el `const ctx = tenantId === null ? null : { tenantId }`), no una excepción de programación.

### Efecto colateral del lint sobre `branches` (no una migración de más)

El lint mide compliance **por statement completo**, no por tabla puntual dentro del statement (`isCompliantText` corre sobre `enclosingStatement(node).getText()`). `resolveBranchCountry` hace `.from(schema.users).innerJoin(schema.branches, ...)` en un solo statement: al agregar `tenantWhere(schema.users, ctx)` en su `.where()`, el statement ENTERO queda compliant — lo que incluye la referencia a `branches` del mismo join. Verificado con `pnpm lint:tenant`: la entrada `country-scope.ts + branches` (que el plan explícitamente NO pedía tocar, D-02) pasó a `staleNoLongerViolating` sola, sin que se escribiera un solo filtro pensado para `branches`. Es un efecto colateral del motor del lint, documentado acá para que 173-30 no se sorprenda con una 4ª entrada de la que este plan no habla en su objetivo.

### El fix de test infra — la bomba FK que el propio Task 1 activó

Al correr `pnpm exec vitest run --no-file-parallelism test/tenancy` completo por primera vez con el fix de audit-log ya aplicado, `iso-03-finance-cajas.test.ts` e `iso-03-finance-transacciones.test.ts` fallaron casi en su totalidad (84 de 87 tests) con:

```
Error: Failed query: DELETE FROM tenants WHERE id = ?
Caused by: Cannot delete or update a parent row: a foreign key constraint fails
  (`eltemplo_test_1`.`audit_log`, CONSTRAINT `fk_audit_log_tenant`
   FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`))
```

**Aislado el origen** (confirmado corriendo el archivo suelto con el código VIEJO vía `git show HEAD:...` temporal — 34/34 verde — y con el código NUEVO — falla): antes de este plan, `auditLog.write` nunca pasaba por `tenantValues`, así que TODA fila de `audit_log` nacía con `tenant_id = 1` (el `DEFAULT` de la columna, fase 167) sin importar sobre qué gimnasio actuara. `limpiarSegundoGimnasio` (`test/fixtures/second-tenant.ts`) nunca necesitó tocar `audit_log` porque ninguna fila la referenciaba. Con el fix de Task 1, un `void`/`validate`/`observe`/`correct` sobre un recurso del gimnasio 2 ahora escribe `tenant_id = 90671` de verdad — exactamente lo que el plan pedía — y `DELETE FROM tenants WHERE id = 90671` revienta si `audit_log` no se limpia antes.

Es la misma "bomba FK latente" que el propio `test/fixtures/second-tenant.ts` ya documenta para `cash_registers` (Pitfall 10 del doc de patrones), por otra tabla. Fix: `limpiarSegundoGimnasio` ahora borra `audit_log WHERE tenant_id = TENANT_DOS` **primero**, antes de `users` (por `fk_audit_log_actor`) y de `tenants` (por `fk_audit_log_tenant`).

Después del fix: `iso-03-finance-cajas.test.ts` + `iso-03-finance-transacciones.test.ts` → **67/67** verde. `test/tenancy` completo → **231/233** (los 2 rojos son de `con-06-lint.test.ts`, ver más abajo).

---

## Verificación

| Comando                                                   | Resultado                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm exec tsc -p tsconfig.test-check.json --noEmit`      | 185 errores (== baseline, 0 nuevos, 0 `TS2554`)                                              |
| `pnpm typecheck:tests`                                    | `DISCREPANCIAS: 0`                                                                           |
| `pnpm lint:tenant --allowlist=/tmp/allowlist-173-04.json` | `DISCREPANCIAS: 0` (447→446 tras sacar además `country-scope.ts+branches`, efecto colateral) |
| `pnpm exec vitest run --no-file-parallelism test/tenancy` | **231/233** — ver "Deferred Issues"                                                          |
| `pnpm exec prettier --check` (10 archivos)                | limpio                                                                                       |

### Deferred Issues — 2 tests de `con-06-lint.test.ts` en rojo (esperado, NO es de este plan)

Los 2 únicos tests que no pasan corren `lint-tenant` contra el `tenant-lint-allowlist.json` **REAL** (los 450 committeados, sin `--allowlist` de trabajo):

1. `"el repo real con el baseline del plan 07 sale 0"` — ahora da `DISCREPANCIAS: 4` (las 4 entradas que este plan dejó sin violación real: `audit-log.ts+audit_log`, `country-scope.ts+users`, `+user_branches`, `+branches`).
2. `"ve los archivos que importan el schema EN PROFUNDIDAD"` — el conteo de tablas gym-owned con deuda (lente estática) bajó de 81 a 80 porque `audit_log` quedó totalmente pago.

**Esto es exactamente lo que el CONTEXT y el PATTERNS de la fase predicen y aceptan explícitamente**: _"este plan NO edita `tenant-lint-allowlist.json` (dueño único: el plan 173-30) ... Que el archivo real quede 'rojo' contra la rama hasta el switch es **esperado**, y es lo que bloquea el merge antes de tiempo"_ (contexto del plan) y _"el archivo real tiene un solo dueño ... y queda rojo contra la rama hasta entonces: eso es esperado, no una regresión"_ (PATTERNS §9). No se tocó `tenant-lint-allowlist.json` en ningún commit de este plan. El plan 173-30 (el switch) tiene que:

- borrar las 4 entradas de `audit-log.ts`/`country-scope.ts` (más las que sumen el resto de la fase),
- y su número de referencia para la lente estática debería partir de **80**, no 81, si corre después de este plan.

### Acceptance criteria — una nota sobre un falso positivo del grep literal

El criterio de Task 2 `grep -rnE "tenantId!|tenantId\s*\?\?|tenantId: 1" country-scope.ts` sin líneas da **1 coincidencia**: la línea preexistente (fase 166, sin tocar por este plan) `tenantId = row.tenantId ?? null;`. No es el patrón que el criterio busca prohibir (un default a un tenant FALSO como `?? 1`) sino la conversión de `undefined`/`null` de la fila leída a un `null` explícito — es decir, el MISMO guard fail-closed que el criterio pide, escrito de otra forma. Es anterior a este plan y fuera del alcance de D-02 (no es ninguna de las dos queries que el plan migra). Documentado acá para que el próximo grep automatizado no lo confunda con deuda nueva.

---

## Deviations from Plan

### **[Rule 1 - Bug] `limpiarSegundoGimnasio` no borraba `audit_log` antes de `users`/`tenants`**

- **Found during:** Task 2, corrida completa de `test/tenancy`
- **Issue:** con `auditLog.write` ya estampando `tenant_id` real (fix de Task 1), un `void`/`validate`/`observe`/`correct` de la batería de finance sobre el gimnasio 2 deja filas de `audit_log` con `tenant_id = 90671`. El `DELETE FROM tenants WHERE id = 90671` de `limpiarSegundoGimnasio` (`test/fixtures/second-tenant.ts`) revienta con `ER_ROW_IS_REFERENCED_2` (`fk_audit_log_tenant`), y en teoría también podría reventar el `DELETE FROM users` de la misma función por `fk_audit_log_actor`.
- **Fix:** `DELETE FROM audit_log WHERE tenant_id = TENANT_DOS` agregado como PRIMER statement de la función, antes de `users` y de `tenants`.
- **Files:** `el-templo-api/test/fixtures/second-tenant.ts`
- **Commit:** `8dd7d194`

### **[Nota, no desviación] `compensateDays` sin `ctx` en ninguna parte**

A diferencia de `assignPlan`/`cancelSubscription` (ya con `ctx` desde la 172), `compensateDays` no lo tenía. Se agregó como primer parámetro y `subscriptions/routes.ts` lo resuelve con `assertTenant` — anticipado literalmente por la acción del plan ("si alguno no lo tiene, el `ctx` sale de `assertTenant(request.scope, ...)` en el borde").

### **[Nota, no desviación] `programs/routes.ts` no montaba `attachCountryScope`**

El módulo `programs` no usa un hook global para el scope (cada ruta lo resuelve si lo necesita, patrón ya escrito en `enrollAddon`). Se replicó el mismo patrón para la ruta de cancelación, que es la única de las 5 ajenas que no tenía `ctx` a mano.

### **[Nota, no desviación] `country-scope.ts + branches` quedó compliant sin que el plan lo pidiera**

Ver sección "Efecto colateral del lint" arriba. No se escribió ningún filtro pensado para `branches`; es consecuencia de que el lint mide por statement y `resolveBranchCountry` comparte un solo statement entre `users` y `branches`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo. Las 4 mitigaciones del threat model del plan quedaron verificadas:

| Threat ID   | Mitigación                                                                                  | Evidencia                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| T-173-04-01 | `ctx` PRIMERO + `tenantValues` en `audit-log.ts`                                            | firma nueva, `grep -c tenantValues` = 1, 10 call sites de `src/` + 4 de `test/` actualizados |
| T-173-04-02 | `tenantId` del scope se lee de la fila de `users`; guard fail-closed (`null`, nunca `?? 1`) | diff de `country-scope.ts`, sin `!`/`?? <número>` nuevos                                     |
| T-173-04-03 | `tenantWhere` inline en `user_branches` y en el join de `resolveBranchCountry`              | `grep -c tenantWhere` = 4                                                                    |
| T-173-04-04 | el valor sale server-side de la fila leída, no de payload/JWT                               | verificado por diff en los 2 archivos                                                        |

## Self-Check: PASSED

- `el-templo-api/src/modules/shared/audit-log.ts` — FOUND, firma con `ctx` primero
- `el-templo-api/src/modules/shared/country-scope.ts` — FOUND, `ctx` resuelto de la fila de `users`
- `el-templo-api/test/fixtures/second-tenant.ts` — FOUND, `DELETE FROM audit_log` agregado
- Commit `22c31254` — FOUND (`git log --oneline`)
- Commit `8dd7d194` — FOUND (`git log --oneline`)
- `pnpm typecheck:tests` → `DISCREPANCIAS: 0`
- `pnpm lint:tenant --allowlist=/tmp/allowlist-173-04.json` → `DISCREPANCIAS: 0`
- `pnpm exec vitest run --no-file-parallelism test/tenancy` → 231/233 (2 rojos documentados como esperados, ver Deferred Issues)
- `git status --porcelain` — vacío
