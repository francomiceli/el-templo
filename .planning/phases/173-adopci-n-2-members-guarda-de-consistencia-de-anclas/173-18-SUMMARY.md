---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 18
subsystem: members (escrituras) + guarda de consistencia de anclas (D-05/D-06)
tags: [tenancy, members, ancla, tenantValues, tenantWhere, branch-consistency]
dependency-graph:
  requires:
    - 173-11 (helper `assertBranchDelGimnasio` / `resolveBranchDelGimnasio` en `shared/branch-consistency.ts`)
    - 173-12
    - 173-17 (firmas con `ctx: TenantContext` PRIMERO en los 23 métodos de `members/service.ts`, incluidos los 12 de este plan)
  provides:
    - "12 métodos de escritura de `members/service.ts` con `tenantValues`/`tenantWhere` y las anclas de sede validadas (D-05)"
  affects:
    - "el-templo-api/src/modules/members/service.ts"
tech-stack:
  added: []
  patterns:
    - "assertBranchDelGimnasio(ctx, branchId, tx) DENTRO de la misma tx del alta/edición; se escribe `branch.id` (fila resuelta), nunca el número crudo del payload"
    - "tenantValues(ctx, {...}) en todo insert de tablas propias del módulo (users, user_status_history, member_notes, user_sepa_details)"
    - "tenantWhere(tabla, ctx) inline, primer término del and(...), en todo select/update/delete"
    - "filtro de tabla joineada en el ON del LEFT/INNER JOIN, nunca en el WHERE"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/service.ts
decisions:
  - "convertFreemiumToTrial no estaba en la lista de '4 sitios de ancla' de PATTERNS §0.2 (esa lista se armó grepeando `branchUpdatedAt =`, y este método no lo seteaba), pero SÍ reescribe `users.branch_id` desde `input.branchId` sin validar — se trató como ancla igual, por instrucción explícita del Task 1 ('cada una de las 3 altas Y LA CONVERSIÓN')."
  - "`getMemberById` NO se tocó (fuera del alcance de este plan, dueño 173-19/20) — se agregó una guarda de tenant dedicada al principio de `updateMember` para no depender de un existence-check sin filtro."
  - "El insert de `referrals` dentro de `createMember` se dejó SIN tenantValues a propósito: el Task 1 enumera explícitamente qué tablas llevan el estampado (`member_profiles`, `user_status_history`, `user_sepa_details`, `member_notes`, `user_branches`) y `referrals` no está — pertenece al alcance de la fase de referidos (174/175), aunque la tabla física tenga columna `tenant_id`."
metrics:
  duration: "~2.5h"
  completed: "2026-08-08"
---

# Phase 173 Plan 18: Members — escrituras (altas, conversión, edición, baja, password, foto, notas) + guarda de ancla D-05 Summary

Se migraron los 12 métodos de escritura de `members/service.ts` al patrón de tenancy (`tenantValues`/`tenantWhere`), y se cerraron los 4 sitios de ancla del archivo que reescriben `users.branch_id` desde un payload sin validar el gimnasio de la sede, usando `assertBranchDelGimnasio` del helper compartido (173-11).

## Qué se migró (Task 1 — altas y conversión)

Commit `3b445e7b`.

| Método                   | Línea        | Qué se le puso                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createMember`           | `:729-796`   | `insert(users)` y `insert(userStatusHistory)` con `tenantValues(ctx, {...})`. `input.branchId` resuelto con `assertBranchDelGimnasio(ctx, input.branchId, tx)` en `:752` (dentro de la tx del alta) — se escribe `branch.id`, no el payload.                                                                                                                                                                                                |
| `createTrialMember`      | `:894-966`   | SELECT de unicidad de teléfono (`:912-919`) con `tenantWhere(schema.users, ctx)` inline (sin él, un teléfono de otro gimnasio bloqueaba el alta con un 409 que delataba su existencia — T-173-18-04). `assertBranchDelGimnasio` en `:940`. Ambos inserts con `tenantValues`.                                                                                                                                                                |
| `createMinimalMember`    | `:1011-1070` | `assertBranchDelGimnasio` en `:1029`. Ambos inserts (`users`, `userStatusHistory`) con `tenantValues`. El catch de `isDuplicateKeyError` sigue delegando a `checkDuplicates` (método de lectura, fuera de alcance).                                                                                                                                                                                                                         |
| `convertFreemiumToTrial` | `:1116-1215` | SELECT inicial de `user` (`:1122-1131`) con `tenantWhere` inline — antes leía por `id` crudo, sin filtro. La validación de sede (existencia + `isVirtual`) se movió de ANTES de la tx a DENTRO de la tx (`:1173`, `assertBranchDelGimnasio`), mismo mensaje "Sede no encontrada" que ya usaba el método (sin cambio de contrato para el cliente). UPDATE (`:1191`) y `userStatusHistory` insert (`:1195`) con `tenantWhere`/`tenantValues`. |

## Qué se migró (Task 2 — edición, baja, password, foto, notas)

Commit `0585b1e3`.

| Método                  | Línea        | Qué se le puso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wasEverLead` (privado) | `:1236-1259` | Tenía `ctx` sin usar (trampa (a)) — `tenantWhere(schema.bookings, ctx)` inline en `:1254`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `updateLead`            | `:1264-1414` | SELECT inicial de `user` (`:1281`) con `tenantWhere`. SELECT de `subscriptionPlans` (plan comprado, `:1306`) con `tenantWhere` — un plan de otro gimnasio se rechaza igual que uno inexistente. UPDATE (`:1361`) con `tenantWhere`. Re-fetch del snapshot (`:1397`): `tenantWhere` en el `FROM users`, y el filtro de las dos tablas joineadas (`creator` alias de `users`, `subscriptionPlans`) va en el **ON** de sus `leftJoin` (`:1387-1393`), no en el WHERE, para no convertir el LEFT en INNER en silencio y perder la fila cuando `createdBy`/`purchasedPlanId` son NULL. |
| `getLeadBranchId`       | `:1426-1437` | `tenantWhere` en el SELECT (`:1436`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `updateMember`          | `:1448-1758` | Ver detalle abajo (el más grande del plan).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `softDeleteMember`      | `:1760-1786` | `tenantWhere` en el SELECT de existencia (`:1776`) y en el UPDATE (`:1793`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `resetMemberPassword`   | `:1808-1832` | `tenantWhere` en el SELECT (`:1824`) y en el UPDATE (`:1836`) — el caso más crítico (T-173-18-03, EoP): sin esto, un `id` de otro gimnasio permitía tomar control de esa cuenta reseteando su password.                                                                                                                                                                                                                                                                                                                                                                           |
| `updatePhoto`           | `:1965-1976` | `tenantWhere` en el UPDATE (`:1975`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `createNote`            | `:2283-2320` | Se agregó una verificación previa (`:2293-2299`, `NotFoundError` si el socio no es del propio gimnasio) — antes cualquier `userId` podía recibir una nota sin chequeo alguno. Insert con `tenantValues` (`:2304`).                                                                                                                                                                                                                                                                                                                                                                |
| `updateNote`            | `:2325-2358` | `tenantWhere(schema.memberNotes, ctx)` en el SELECT (`:2340`) y en el UPDATE (`:2352`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `deleteNote`            | `:2364-2388` | `tenantWhere` en el SELECT (`:2372`) y en el DELETE (`:2383`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### `updateMember` en detalle (sitio de ancla `:1471` original → hoy resuelto dentro de la tx)

- **Guarda de tenant al inicio del método** (`:1454-1462`): `getMemberById` (fuera del alcance de este plan — 173-19/20) todavía no filtra por gimnasio. Sin esta guarda, un `id` de otro gimnasio pasaba el check de "existe" y las cascadas de sede de más abajo (subscriptions/bookings/subscription_schedules) tocaban filas ajenas aunque el UPDATE de `users` llevara `tenantWhere` (0 filas afectadas ahí, pero el resto de la cascada corría igual sobre el socio ajeno). Se agregó un SELECT dedicado con `tenantWhere` que corta con `return null` (mismo contrato 404 que el resto).
- **`branchChanged` recalculado antes del gate `if (Object.keys(updateData).length > 0 …)`** (`:1548-1555`): como `updateData.branchId` ya no se puebla fuera de la tx, si el ÚNICO campo que cambia es la sede, `updateData` de los campos "simples" queda vacío — el gate ahora también entra cuando `branchChanged` es `true`.
- **Ancla D-05** (`:1618-1626`, dentro de `this.db.transaction`): cuando la sede cambió, `assertBranchDelGimnasio(ctx, input.branchId ?? null, tx)` resuelve la sede y `updateData.branchId = branch.id` (no el payload). `branchUpdatedAt`/`branchSource` se siguen escribiendo junto (trío intacto).
- **UPDATE de `users`** (`:1630`): `tenantWhere` inline.
- **Cascada de sede** (cuando `branchChanged`): `liveSubs` SELECT con `innerJoin(subscriptionPlans, and(tenantWhere(...), eq(...)))` (`:1636-1640`, filtro en el ON del INNER JOIN) y `tenantWhere(subscriptions, ctx)` en el WHERE (`:1644`); UPDATE de `subscriptions.branchId` (`:1662`, ahora escribe `resolvedBranchId` = `branch.id`, no `input.branchId as number`) con `tenantWhere`; UPDATE de `bookings` (cancelación de reservas futuras, `:1684`) con `tenantWhere`; DELETE de `subscriptionSchedules` (`:1696`) con `tenantWhere`.
- **SELECT de choque de email** (`:1553`): `tenantWhere` inline — un email de otro gimnasio ya no bloquea la edición ni delata que ese socio existe.
- **Upsert de `userSepaDetails`** (`:1732`): `tenantValues(ctx, { userId: id, ...sepaData })`.

## Verificación

| Comando                                                                                                                                                                                                                         | Resultado                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit` (build, `src/`)                                                                                                                                                                                        | exit 0                                                                                                                             |
| `pnpm typecheck:tests` (ratchet sobre `test/`)                                                                                                                                                                                  | exit 0 — 185 errores totales, 185 de baseline, **0 nuevos, 0 empeorados, 0 discrepancias**                                         |
| `pnpm exec vitest run --no-file-parallelism test/members`                                                                                                                                                                       | **10 archivos / 167 tests, todos verdes** (Task 1 verify)                                                                          |
| `pnpm exec vitest run --no-file-parallelism test/members test/admin-leads-patch.test.ts test/lead-status-transitions.test.ts test/leads-perdido-window.test.ts test/expire-lost-leads.test.ts test/backfill-lost-leads.test.ts` | **15 archivos / 207 tests, todos verdes** (Task 2 verify, corrida repetida dos veces con el mismo resultado)                       |
| `grep -c "assertBranchDelGimnasio\|resolveBranchDelGimnasio" service.ts`                                                                                                                                                        | **11** (≥3 requerido)                                                                                                              |
| `grep -cE "403\|Forbidden" service.ts`                                                                                                                                                                                          | **1**, igual que en la base `c07527dc` (0 aumento — el único match es un comentario de docblock preexistente en `:465`, no código) |
| `grep -rnE "tenantId!\|tenantId\s*\?\?" service.ts`                                                                                                                                                                             | sin líneas                                                                                                                         |
| `pnpm lint:tenant --allowlist=/tmp/allowlist-173-18.json` (copia de trabajo, **no comiteada**)                                                                                                                                  | `unlistedViolations: 0` antes y después de sacar las 2 entradas confirmadas — **0 violaciones nuevas introducidas**                |

### Entradas de la allowlist de trabajo que bajaron (verificadas statement-por-statement, no solo por conteo)

De las 14 entradas de `members/service.ts` en `/tmp/allowlist-173-18.json` (copia de trabajo, arranca igual a la allowlist real committeada), **2 quedaron demostrablemente sin ninguna violación** tras este plan:

- **`user_status_history`** — las 4 escrituras del archivo (`createMember :803`, `createTrialMember :969`, `createMinimalMember :1057`, `convertFreemiumToTrial :1195`) llevan `tenantValues`.
- **`subscription_schedules`** — el único acceso del archivo (`updateMember :1696`, el DELETE de la cascada de sede) lleva `tenantWhere`.

Las otras 12 entradas (`attendance`, `bookings`, `branches`, `completed_sessions`, `member_notes`, `member_profiles`, `referrals`, `schedules`, `subscription_plans`, `subscriptions`, `user_sepa_details`, `users`) siguen vivas porque tienen accesos en métodos de **lectura** de este mismo archivo (`listMembers`, `searchMembers`, `getMemberById`, `exportMembers`, `exportSepaMembers`, `checkDuplicates`, `checkDniUniqueness`, `getNotes`) que este plan **no toca** (son el otro corte del paso 4 de la receta — planes 173-19/20). Verificado con `pnpm exec tsx src/db/scripts/lint-tenant.ts --allowlist=/tmp/allowlist-173-18.json`: tras sacar esas 2 entradas de la copia de trabajo, `members/service.ts` **no aparece ni en `unlistedViolations` ni en `staleNoLongerViolating`** — ni una violación nueva, ni ninguna otra entrada lista para bajar todavía.

**El archivo real `el-templo-api/tenant-lint-allowlist.json` NO se tocó** (verificado con `git status`/`git diff` sobre ese archivo: sin cambios). El achique real de esas entradas es responsabilidad del plan del switch (dueño anunciado: 173-30), que borra las 90 entradas del módulo en un solo commit antes de activar `TENANT_STRICT_MODULES.members`.

### Rojos esperados NO tocados (dueño 173-30)

`pnpm exec vitest run --no-file-parallelism test/tenancy/con-06-lint.test.ts` → **36 passed, 2 failed** (confirmado, corrida completa):

- `"ve los archivos que importan el schema EN PROFUNDIDAD"` — cuenta tablas gym-owned con deuda vía el lint estático; baja con cada plan de adopción que cierra escrituras (diseñado, no es este plan quien lo arregla).
- `"el repo real con el baseline del plan 07 sale 0"` — compara el repo real contra la allowlist **committeada** (no la copia de `/tmp`); mis 2 entradas recién confirmadas como "ya no violan" (`user_status_history`, `subscription_schedules`) se suman a las discrepancias que ya venían acumulándose de planes anteriores (173-07, 173-14, etc.) — exactamente el comportamiento "autodestructivo por diseño" descripto en el brief. Ninguno de los dos tests se tocó ni se intentó arreglar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/EoP] `updateMember` podía operar sobre un socio de otro gimnasio a través de una cascada de sede**

- **Found during:** Task 2, al migrar `updateMember`.
- **Issue:** el check de "existe" del método usa `getMemberById(ctx, id)`, que todavía no filtra por gimnasio (fuera del alcance de este plan). Sin una guarda adicional, un `id` de otro gimnasio pasaba ese check y, si el request además mandaba un `branchId` distinto al que ya tenía la fila ajena, la cascada de sede (sync de `subscriptions.branchId`, cancelación de `bookings` futuros, borrado de `subscriptionSchedules`) se ejecutaba sobre las filas de ESE socio ajeno — aunque el `UPDATE` de `users` en sí mismo (ya protegido con `tenantWhere`) no tocara ni una fila.
- **Fix:** SELECT dedicado con `tenantWhere(schema.users, ctx)` al principio del método; `return null` (mismo 404 que ya usa el resto del método) si el socio no es del propio gimnasio.
- **Files modified:** `el-templo-api/src/modules/members/service.ts:1454-1462`.
- **Commit:** `0585b1e3`.

**2. [Rule 2 - Missing critical functionality] `convertFreemiumToTrial` validaba la sede de destino ANTES de la transacción, sin filtro de gimnasio**

- **Found during:** Task 1.
- **Issue:** la sede de destino se leía con `this.db.select(...).from(schema.branches).where(eq(schema.branches.id, input.branchId))` sin `tenantWhere`, y el resultado se usaba para escribir `users.branch_id` sin más validación — exactamente el patrón que D-05 vino a cerrar, aunque este sitio no apareciera en la lista de "4 sitios de ancla" de PATTERNS (esa lista se armó grepeando el patrón `branchUpdatedAt =`, y este `set({...})` no lo tenía).
- **Fix:** la validación se movió DENTRO de `this.db.transaction`, usando `assertBranchDelGimnasio(ctx, input.branchId, tx)` — mismo mensaje de error ("Sede no encontrada") que ya devolvía el método, sin cambio de contrato observable para el cliente.
- **Files modified:** `el-templo-api/src/modules/members/service.ts:1173-1178`.
- **Commit:** `3b445e7b`.

**3. [Rule 2 - Missing critical functionality] `createNote` no verificaba que el socio destino fuera del propio gimnasio**

- **Issue:** cualquier `userId` (de cualquier gimnasio) podía recibir una nota — el insert no chequeaba pertenencia.
- **Fix:** SELECT previo con `tenantWhere(schema.users, ctx)`; `NotFoundError("Alumno no encontrado")` si no matchea (mismo contrato 404 que el resto, D-06).
- **Files modified:** `el-templo-api/src/modules/members/service.ts:2293-2299`.
- **Commit:** `0585b1e3`.

### Scope boundary respetado (NO auto-fixed, documentado y no tocado)

- El insert de `referrals` dentro de `createMember` (`:833` aprox.) sigue sin `tenantValues`. La tabla física tiene columna `tenant_id`, pero el Task 1 enumera explícitamente qué tablas llevan el estampado en las 3 altas (`member_profiles`, `user_status_history`, `user_sepa_details`, `member_notes`, `user_branches`) y `referrals` no está en esa lista — pertenece al alcance de la fase de referidos (174/175). Documentado, no arreglado, no es un stub (el alta funciona igual que antes).

## Known Stubs

Ninguno — este plan no agrega UI ni deja datos vacíos hardcodeados.

## Threat Flags

Ninguno — todas las superficies tocadas ya estaban cubiertas por el `threat_model` del plan (T-173-18-01 a T-173-18-06).

## Self-Check: PASSED

- `el-templo-api/src/modules/members/service.ts` — FOUND (modificado, no creado).
- Commit `3b445e7b` — FOUND en `git log --oneline --all`.
- Commit `0585b1e3` — FOUND en `git log --oneline --all`.
- `el-templo-api/tenant-lint-allowlist.json` — sin cambios (`git status`/`git diff` vacíos sobre ese archivo).
