---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 11
subsystem: tenancy
tags:
  [
    tenancy,
    ado-07,
    d-14,
    branch-consistency,
    branch-access,
    canAccessBranch,
    tenantWhere,
  ]

# Dependency graph
requires:
  - phase: 173-01
    provides: "worktree et-173 sobre el backmerge, tsconfig.test-check.json y pnpm typecheck:tests (ratchet)"
provides:
  - "shared/branch-consistency.ts: resolveBranchDelGimnasio / assertBranchDelGimnasio — el unico resolvedor de sede validada por gimnasio, consumido por los 16 sitios de escritura de ancla en 173-13/14/15/16/18"
  - "shared/branch-access.ts: canAccessBranch decide por gimnasio (tenantWhere primero), no por pais — cierra el bypass Regla 1 (isVirtual) y el de Regla 3 (pais como aislador alternativo)"
  - "test/tenancy/ancla-branch-consistency.test.ts: 10 tests con 2 gimnasios, mutacion de cierre verificada en vivo"
affects:
  [
    "173-13, 173-14, 173-15, 173-16, 173-18 (consumen resolveBranchDelGimnasio / assertBranchDelGimnasio)",
    "173-30 (el switch: branch-access.ts/branches se suma a la lista de entradas stale a borrar de tenant-lint-allowlist.json)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolver-con-filtro en vez de comparar-despues: el SELECT lleva tenantWhere y la fila ajena simplemente no matchea, cayendo en la rama 'no encontrada' que cada llamador ya tenia (D-06)"
    - "DbOrTx = MySql2Database<typeof schema> | TxHandle como firma del helper, para validar dentro de la misma transaccion de escritura (mismo patron que session-edit-helpers.ts / enrollment-service.ts)"
    - "assertTenant como unico puente entre CountryScope.tenantId (number|null) y TenantContext (number), con catch local que convierte el throw en deny (false) para mantener canAccessBranch como predicado puro que nunca lanza hacia sus 60+ call sites existentes"

key-files:
  created:
    - el-templo-api/src/modules/shared/branch-consistency.ts
    - el-templo-api/test/tenancy/ancla-branch-consistency.test.ts
  modified:
    - el-templo-api/src/modules/shared/branch-access.ts
    - el-templo-api/test/tenancy/iso-03-finance-transacciones.test.ts

key-decisions:
  - "canAccessBranch mantiene su contrato 403 (BRANCH_OUT_OF_SCOPE) pre-existente: D-06 (cero 403) aplica al resolvedor NUEVO del ancla (branch-consistency.ts), no a requireBranchAccess, que es mecanismo de fase 110 anterior al milestone de tenancy y cuyo 403 generico no distingue 'sede de otro gimnasio' de 'sede propia fuera del rol operativo' (no reabre la fuga que D-06 prohibe)"
  - "assertTenant se llama DENTRO de canAccessBranch (no se le exige al caller): el catch local convierte un tenantId nulo (corrupcion de datos) en `false`, preservando la firma y el contrato 'nunca lanza' que sus ~60 call sites (requireBranchAccess, leads-routes.ts, tv/control-routes.ts) ya asumen"
  - "assertBranchDelGimnasio trata branchId===null como 'sede no encontrada' (lanza), a diferencia de resolveBranchDelGimnasio (devuelve null sin consultar): todo call site que necesita el assert esta en un punto donde hace falta una sede concreta"

requirements-completed: [ADO-07]

# Metrics
duration: ~2h (incluye una interrupcion por procesos vitest concurrentes que corrompieron temporalmente la base de test compartida)
completed: 2026-08-08
---

# Phase 173 Plan 11: Guarda de consistencia de anclas (ADO-07 / D-14) — Summary

**Resolvedor único `resolveBranchDelGimnasio`/`assertBranchDelGimnasio` para el invariante `user.tenant_id === branch.tenant_id`, y `canAccessBranch` reescrito para decidir por gimnasio en vez de por país, cerrando los dos bypasses cross-tenant (`isVirtual` y país) con 10 tests nuevos de dos gimnasios y una mutación de cierre verificada en vivo.**

## Performance

- **Tasks:** 3/3
- **Files created:** 2 (`branch-consistency.ts`, `ancla-branch-consistency.test.ts`)
- **Files modified:** 2 (`branch-access.ts`, `iso-03-finance-transacciones.test.ts` — deviation)

## Accomplishments

- `shared/branch-consistency.ts`: los dos exports únicos (`resolveBranchDelGimnasio`, `assertBranchDelGimnasio`) que los 16 sitios de escritura de ancla (planes 173-13/14/15/16/18) van a consumir en vez de escribir la verificación 16 veces.
- `canAccessBranch` (D-14) ya no decide por país: el SELECT reusa `resolveBranchDelGimnasio` con `tenantWhere` primero, cerrando el bypass histórico de la Regla 1 (`isVirtual → true` de una sede ajena) y despojando al país de su rol de "aislador alternativo" en la Regla 3.
- 10 tests nuevos con dos gimnasios, incluida una precondición de mismo país y una mutación de cierre que puso 5 `it` en rojo (≥3 exigidos) al sacar el `tenantWhere`, revertida limpiamente.
- Deviation: un test pre-existente de finance (fase 172) que asumía el bypass de país como "la única barrera que queda" quedó desactualizado por el fix de D-14 y se corrigió en el mismo plan.

## Task Commits

1. **Task 1: Crear shared/branch-consistency.ts — el resolvedor único (D-05a, D-06, D-08)** — `bcffd26d` (feat)
2. **Task 2: canAccessBranch decide por gimnasio, no por país (D-14) — los DOS bypasses** — `f95712b6` (feat, incluye la deviation del test de finance)
3. **Task 3: Tests con 2 gimnasios del helper y de canAccessBranch** — `cfd8483b` (test)

**Plan metadata:** este SUMMARY (sin commit propio adicional — el orquestador hace el commit final de metadata).

## Files Created/Modified

- `el-templo-api/src/modules/shared/branch-consistency.ts` — `resolveBranchDelGimnasio(ctx, branchId, db)` / `assertBranchDelGimnasio(ctx, branchId, db)`, únicos exports, `ctx` primero, `db: DbOrTx`.
- `el-templo-api/src/modules/shared/branch-access.ts` — `canAccessBranch` reescrito: `assertTenant` + `resolveBranchDelGimnasio` primero, después las Reglas 1-6 sin cambios de comportamiento salvo el filtro por gimnasio.
- `el-templo-api/test/tenancy/ancla-branch-consistency.test.ts` — 10 tests: precondición (mismo país), 4 casos de `resolveBranchDelGimnasio` (control positivo, sede ajena, sede virtual ajena, `branchId` null), 2 de `assertBranchDelGimnasio` (throw + control positivo), 3 de `canAccessBranch` (2 aislamiento + 1 control positivo).
- `el-templo-api/test/tenancy/iso-03-finance-transacciones.test.ts` — un `it` actualizado (deviation, ver abajo).

## Decisions Made

- **`canAccessBranch` conserva su 403 (`BRANCH_OUT_OF_SCOPE`).** D-06 ("cero 403, sede ajena = sede inexistente") es el contrato del helper NUEVO del ancla (`branch-consistency.ts`), no de `requireBranchAccess` — un mecanismo de la fase 110, anterior al milestone de tenancy, cuyo 403 genérico ya cubre por igual "sede de otro gimnasio" y "sede propia fuera del rol operativo del actor". Como el mensaje/código no distingue el motivo, no reabre la fuga que D-06 prohíbe (un 403 que SÍ confirmara existencia en otro gimnasio). Migrar `requireBranchAccess` al contrato 404-only de D-06 sería un cambio arquitectónico mayor (afecta ~20 archivos de rutas fuera del ancla) y queda fuera de alcance de D-08.
- **`assertTenant` se resuelve DENTRO de `canAccessBranch`, con `catch` local.** En vez de exigirle a los ~60 call sites de `requireBranchAccess`/`canAccessBranch` que pasen un `TenantContext` ya resuelto, la función narrowea `scope.tenantId` (`number | null`) internamente y convierte el `AppError` de `assertTenant` en `return false` — preserva la firma `(CountryScope, number, db) => Promise<boolean>` y el contrato "nunca lanza" que sus llamadores ya asumen (ninguno tiene try/catch alrededor de un preHandler).
- **`assertBranchDelGimnasio` trata `branchId === null` como "no encontrada" (lanza), a diferencia de `resolveBranchDelGimnasio` (devuelve `null` sin consultar).** Documentado en el docblock: todo call site que use el `assert` está en un punto donde hace falta una sede concreta (alta, edición de ficha).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `iso-03-finance-transacciones.test.ts` quedó desactualizado por el propio fix de D-14**

- **Found during:** Task 2, al correr la verificación `pnpm exec vitest run --no-file-parallelism test/tenancy` exigida por el plan.
- **Issue:** El test `"aislamiento: no puede imputarle un cobro a una sede de El Templo"` (fase 172) fue escrito bajo el supuesto explícito, documentado en su propio comentario, de que `requireBranchAccess` "solo mira el país, y las dos sedes son AR, así que lo pasa" — y que la única barrera real era el guard de `tenantWhere` dentro de `transaction-service.ts`, que respondía 404. Al arreglar D-14, `requireBranchAccess` (vía `canAccessBranch`) ahora frena el intento UN PASO ANTES con un 403 `BRANCH_OUT_OF_SCOPE`, y el guard downstream nunca se ejercita para este caso puntual. El test seguía esperando 404 y se puso en rojo.
- **Por qué no era scope creep:** es una consecuencia DIRECTA y esperada de la corrección que esta misma tarea implementa — el guard más temprano ahora captura lo que antes solo capturaba el guard tardío. La propia verificación del plan (`test/tenancy` completo en verde) obligaba a resolverlo.
- **Fix:** actualizado el `it` para esperar 403 en vez de 404, con el comentario reescrito explicando el nuevo orden de guards. La aserción de "código de rechazo" se cambió de `.code` (`BRANCH_OUT_OF_SCOPE`) a `.message` ("No tenés acceso a esta sede"), porque la ruta serializa sus 403/404 con `errorSchema` (solo `error` + `message`, sin `code` — hallazgo adicional durante la verificación: Fastify/fast-json-stringify descarta silenciosamente propiedades no declaradas en el schema de respuesta). Se mantuvo la aserción de que ninguna transacción se escribió.
- **Files modified:** `el-templo-api/test/tenancy/iso-03-finance-transacciones.test.ts`
- **Commit:** `f95712b6` (parte del commit de Task 2)

**2. [Nota operativa, no deviation de código] Procesos `vitest` concurrentes corrompieron temporalmente la base de test compartida**

- Un `run_in_background` anterior de `pnpm exec vitest run --no-file-parallelism test/tenancy` quedó vivo (sin completar) mientras se lanzaba una segunda corrida en foreground contra la MISMA base MySQL de test. La corrida concurrente produjo errores de esquema (`Unknown column 'tenant_id'`, `Table 'wellhub_bookings' doesn't exist`) que no tenían relación con el código — eran artefactos de dos suites de test corriendo `beforeEach`/DDL-adjacent operations al mismo tiempo sobre la misma base.
- **Resolución:** se identificaron y mataron (`kill -9`) los procesos `vitest`/`node`/`pnpm exec` huérfanos, y se corrió una sola vez, limpio, en foreground. El resultado volvió a los 2 rojos esperados (231/233, luego 241/243 con el archivo de Task 3 sumado).
- **Para los planes siguientes:** evitar lanzar `test/tenancy` en background sin verificar antes que no quede una corrida anterior viva (`ps aux | grep vitest`); dos corridas simultáneas contra la base compartida producen falsos rojos que no reflejan ningún problema de código.

---

**Total deviations:** 1 auto-fix de código (Rule 1) + 1 nota operativa (sin cambio de código).
**Impact on plan:** El auto-fix es consecuencia directa y esperada del propio Task 2; sin scope creep. La nota operativa no tocó código ni tests, solo el proceso de verificación.

## Issues Encountered

Ninguno más allá de lo documentado en Deviations.

## Verification Results

| Verificación                                              | Comando                                                                                                                                                 | Resultado                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck de `src/`                                       | `pnpm exec tsc --noEmit`                                                                                                                                | exit 0                                                                                                                                                                                                                                                              |
| Typecheck de `test/` (ratchet, NO `tsc --noEmit` a secas) | `pnpm typecheck:tests`                                                                                                                                  | exit 0, DISCREPANCIAS: 0 (185 baseline, 0 nuevos, 0 empeorados, 0 obsoletos, TS2554: 0)                                                                                                                                                                             |
| Suite completa de tenancy                                 | `pnpm exec vitest run --no-file-parallelism test/tenancy`                                                                                               | exit 1 (233→243 tests, 2 rojos — ambos los esperados de `con-06-lint.test.ts`, propiedad de 173-30; 0 rojos nuevos)                                                                                                                                                 |
| Archivo nuevo aislado                                     | `pnpm exec vitest run --no-file-parallelism test/tenancy/ancla-branch-consistency.test.ts`                                                              | exit 0, 10/10                                                                                                                                                                                                                                                       |
| `grep -c "403\|Forbidden"` sobre el helper                | `grep -cE "403\|Forbidden" src/modules/shared/branch-consistency.ts`                                                                                    | 0                                                                                                                                                                                                                                                                   |
| `grep -c "toBe(403)\|toEqual(403)"` sobre el test nuevo   | `grep -c "toBe(403)\|toEqual(403)" test/tenancy/ancla-branch-consistency.test.ts`                                                                       | 0                                                                                                                                                                                                                                                                   |
| `grep` de `!`/`?? 1`/`any` sobre ambos archivos de código | `grep -cE "tenantId!\|tenantId\s*\?\?\|: any"`                                                                                                          | 0 en ambos                                                                                                                                                                                                                                                          |
| Mutación de cierre (sacar `tenantWhere`)                  | `vitest run` sobre `ancla-branch-consistency.test.ts` con el `tenantWhere` comentado                                                                    | 5 `it` en rojo (≥3 exigidos); revertido con `git checkout --`, `git status --porcelain` vacío                                                                                                                                                                       |
| Lint de tenancy, sin tocar la allowlist real              | `pnpm lint:tenant`                                                                                                                                      | DISCREPANCIAS: 12 (`staleNoLongerViolating`) — 11 heredadas de planes previos (173-04, 173-10) + 1 nueva de este plan (`branch-access.ts`/`branches`), exactamente el comportamiento diseñado que el brief anticipó ("si tu plan paga más deuda, ese número CRECE") |
| Verificación aislada con copia de trabajo de la allowlist | `pnpm exec tsx src/db/scripts/lint-tenant.ts --allowlist=/tmp/allowlist-173-11.json` (con la entrada `branch-access.ts`/`branches` borrada de la copia) | `unlistedViolations: 0` — el plan no introdujo ninguna violación nueva; `staleNoLongerViolating` bajó de 12 a 11 (exactamente la entrada que este plan paga)                                                                                                        |
| Allowlist real intacta                                    | `git status --short el-templo-api/tenant-lint-allowlist.json`                                                                                           | sin cambios                                                                                                                                                                                                                                                         |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `resolveBranchDelGimnasio` / `assertBranchDelGimnasio` están listos para que los planes 173-13, 173-14, 173-15, 173-16 y 173-18 los consuman en los 16 sitios de escritura de ancla (12 de `branchUpdatedAt` + 4 de `user_branches`).
- `canAccessBranch` ya decide por gimnasio: cualquier ruta protegida por `requireBranchAccess` que hoy dejaba pasar una sede de otro gimnasio del mismo país (o una sede virtual ajena) ahora la rechaza con 403 ANTES de llegar al handler — planes siguientes que agreguen tests de aislamiento sobre rutas con `requireBranchAccess({from: "body.branchId"|"query.branchId"})` deben esperar el rechazo ahí, no más abajo.
- Recordatorio para 173-30 (el switch): la entrada `branch-access.ts`/`branches` de `tenant-lint-allowlist.json` es stale (ya no viola) y debe borrarse junto con las otras 11 heredadas de planes previos de la fase.
- Sin migraciones creadas por este plan (confirmado: 0198/0199 tomadas por aniversarios/membership_kind, la reserva de la fase sigue desde 0200 y la crea el 173-12).

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_

## Self-Check: PASSED

- `el-templo-api/src/modules/shared/branch-consistency.ts` — FOUND
- `el-templo-api/src/modules/shared/branch-access.ts` — FOUND
- `el-templo-api/test/tenancy/ancla-branch-consistency.test.ts` — FOUND
- `el-templo-api/test/tenancy/iso-03-finance-transacciones.test.ts` — FOUND
- `.planning/phases/173-adopci-n-2-members-guarda-de-consistencia-de-anclas/173-11-SUMMARY.md` — FOUND
- Commit `bcffd26d` (Task 1) — FOUND
- Commit `f95712b6` (Task 2 + deviation) — FOUND
- Commit `cfd8483b` (Task 3) — FOUND
