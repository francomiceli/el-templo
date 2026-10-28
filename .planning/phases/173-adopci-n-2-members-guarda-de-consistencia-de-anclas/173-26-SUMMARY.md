---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 26
subsystem: testing
tags: [tenancy, multitenancy, drizzle, vitest, exceljs, members, sepa]

# Dependency graph
requires:
  - phase: 173-21..25
    provides: "sonda de members utilizable (auth/routes.ts sobrevive al throw), test/tenancy y test/db endurecidos"
  - phase: 172 (piloto finance)
    provides: "idioma completo de la bateria ISO-03 (iso-03-finance-cajas.test.ts), fixtures 2-tenant (second-tenant.ts)"
provides:
  - "test/fixtures/members-gimnasio-dos.ts: ficha completa (perfil, notas, historial, logins, SEPA, deuda, sesiones, sede virtual, actor owner) del gimnasio 2 y de El Templo — reusable por 173-27/28"
  - "test/tenancy/iso-03-members-listados.test.ts: las 9 rutas de listado/busqueda/export de /api/admin/members con caso de aislamiento + control positivo cada una"
affects: [173-27, 173-28, 173-29, 173-30]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixture de ficha completa (perfil+notas+historial+logins+SEPA+deuda+sesiones) sembrado en una sola llamada por gimnasio, gemelo de finance-gimnasio-dos.ts"
    - "Actor owner dedicado para bypassear el gate de pais de export-sepa sin tocar la precondicion de 'mismo pais' de la bateria"
    - "Conteo independiente (no literal) para la asercion de `total` de un listado paginado"

key-files:
  created:
    - el-templo-api/test/fixtures/members-gimnasio-dos.ts
    - el-templo-api/test/tenancy/iso-03-members-listados.test.ts
  modified: []

key-decisions:
  - "El Templo y el gimnasio 2 comparten a proposito el mismo apellido (Aislado173) en sus fichas de prueba, para ejercer el caso mas caro del piloto (un nombre que cualquier gimnasio puede tener)."
  - "export-sepa se prueba con un actor owner dedicado (no el admin de seedSecondTenant): esa ruta exige scope.country==='ES' para cualquier actor no-owner, y la precondicion #1 de la bateria fija ambas sedes principales en AR."
  - "Se agrego la sede virtual 'Templo Online' del gimnasio 2 (ausente en second-tenant.ts) como insumo de onboarding (doc 07 S1.4), aunque ninguna de las 9 rutas de este plan la ejercite."
  - "balances y completed_sessions se sembraron en el mismo fixture (mas alla de la letra literal del plan) porque son indispensables para las aserciones de totalDebtByCurrency y session-levels que esta bateria exige."

requirements-completed: [ADO-02]

# Metrics
duration: ~55min
completed: 2026-08-09
---

# Phase 173 Plan 26: Fixture + batería de listados de `members` Summary

**Fixture completo del gimnasio 2 (perfil, notas, historial, logins, SEPA, deuda y sesiones) más la batería de aislamiento de las 9 rutas de listado/búsqueda/export de `/api/admin/members`, con las 3 queries del listado (filas/total/deuda) afirmadas por separado y cero `403` esperados.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-09
- **Tasks:** 2/2 completadas
- **Files modified:** 2 (ambos nuevos)

## Accomplishments

- `test/fixtures/members-gimnasio-dos.ts`: gemelo de `finance-gimnasio-dos.ts` para `members`. Siembra, por gimnasio, una ficha completa (socio + `member_profiles` + `member_notes` + `user_status_history` + `member_logins` + `user_sepa_details`) más `balances` (deuda) y `completed_sessions` (para `session-levels`), y — solo para el gimnasio 2 — una sede ES + un actor `owner` dedicados a `export-sepa` y la sede virtual "Templo Online" que faltaba (onboarding).
- `test/tenancy/iso-03-members-listados.test.ts`: 9 `describe` (uno por ruta), cada uno con su clave del manifiesto LITERAL en el nombre, 2 `it` (aislamiento + control) y 4 precondiciones. **22/22 tests verdes** en la primera corrida real contra MySQL, sin necesidad de tocar código de producción — las 9 rutas de `members/service.ts` y `members/routes.ts` ya estaban completamente migradas por planes anteriores de la fase (173-05/173-17/173-19/173-20).
- Mutación de cierre ejecutada y documentada (ver "Hallazgos" abajo): un hallazgo real sobre por qué el aislamiento de `listMembers` sobrevive incluso sacando su primer filtro explícito.

## Task Commits

Cada tarea se commiteó atómicamente en el worktree `/home/franco/projects/et-173` (rama `feat/173-adopcion-members`):

1. **Task 1: El fixture members-gimnasio-dos.ts** — `3d9dd88f` (feat)
2. **Task 2: iso-03-members-listados.test.ts — las 9 rutas** — `08bffb2d` (feat)

No hay commit de metadata en este worktree (STATE.md/ROADMAP.md viven en el checkout principal y no se tocan desde acá, por instrucción explícita).

## Files Created/Modified

- `el-templo-api/test/fixtures/members-gimnasio-dos.ts` — siembra/limpieza de la ficha del gimnasio 2 y de El Templo; `tenantDeLaFila`/`campoDeLaFila` genéricos sobre 7 tablas del módulo + `branches`.
- `el-templo-api/test/tenancy/iso-03-members-listados.test.ts` — batería de aislamiento de las 9 rutas.

## Decisions Made

1. **Apellido compartido a propósito** (`Aislado173`) entre la ficha de El Templo y la del gimnasio 2 — es el caso que el piloto encontró más caro para `search` (un apellido que cualquier gimnasio puede tener), y con apellidos distintos el caso de aislamiento habría sido más débil.
2. **Actor `owner` dedicado para `export-sepa`.** Esa ruta exige `MEMBER_LIFECYCLE_ROLES` y, para cualquier actor no-owner, `scope.country === 'ES'` (`members/routes.ts:377`) — el `admin` de `seedSecondTenant` tiene su sede en AR (precondición #1 de la batería: las dos sedes comparten país), así que no servía. Un `owner` nuevo, creado en el propio fixture, bypassea ese gate sin tocar la precondición.
3. **`total` del listado afirmado contra un conteo independiente** (`contarMiembrosVisibles`, replicando el mismo filtro tenant+role+país que `listMembers`) en vez de un número literal — más robusto ante cambios futuros en la composición del fixture.
4. **`totalDebtByCurrency` afirmado con el valor EXACTO sembrado** (777777 para el gimnasio 2, no "mayor que 0"): si la agregación sumara la fila ajena (111), el resultado sería 777888 — un número evidentemente distinto, no un "de más" sutil.
5. **`balances` y `completed_sessions` sembrados en el fixture**, más allá de la letra literal de la Task 1 (que solo nombra notas/perfil/historial/logins/SEPA): son indispensables para que `totalDebtByCurrency` y `session-levels` tengan algo real que aislar. Documentado en el docblock del fixture como decisión deliberada, no como scope creep silencioso.
6. **Sede virtual "Templo Online" del gimnasio 2** agregada al fixture (ausente en `second-tenant.ts`) — insumo de onboarding (doc 07 §1.4) que ninguna de las 9 rutas de este plan ejercita, pero que el propio plan pedía dejar resuelto acá.

## Deviations from Plan

### Auto-fixed Issues

Ninguna — las 9 rutas de `members/service.ts`/`routes.ts` ya estaban migradas por planes anteriores (173-05/173-17/173-19/173-20), así que no hizo falta ningún fix de producción para que la batería pasara. La única "desviación" es de alcance del fixture (balances/completed_sessions/sede-ES/owner/sede-virtual), documentada arriba como decisión deliberada — no un bug ni una arquitectura nueva.

## Hallazgos (mutación de cierre)

Siguiendo el procedimiento del doc 07 y el criterio de cierre de la fase, se rompió temporalmente (sin commitear, revertido al final) el primer filtro del constructor de condiciones de `listMembers`:

```ts
// conditions.push(tenantWhere(schema.users, ctx));  ← comentado
```

**Resultado: los 22 tests siguieron en VERDE**, incluidos los 2 de `GET /api/admin/members`. **Causa identificada:** las tres queries de `listMembers` (`countPromise`/`rowsPromise`/`totalDebtPromise`) hacen `innerJoin(schema.branches, and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, schema.users.branchId)))`. Como el socio ajeno de El Templo tiene `branchId` de una sede del tenant 1, ese INNER JOIN — filtrado por `tenant_id` del lado de `branches` — nunca matchea contra las sedes del gimnasio 2, así que la fila ajena se descarta en el JOIN aunque el filtro directo sobre `users` esté ausente. Es exactamente el caso "dos filtros independientes sosteniendo el aislamiento" que el propio plan advertía.

**Por qué esto NO es un hallazgo despreciable:** la protección real, en este caso, depende de que `users.branch_id` apunte SIEMPRE a una sede del MISMO gimnasio que el usuario — el invariante `user.tenant_id === branch.tenant_id` que ADO-07 (D-05 del CONTEXT de la fase, la guarda de anclas que viene en 173-29/30) fuerza a nivel app y DB. Si ese invariante se rompiera (un socio con `branchId` apuntando a una sede de OTRO gimnasio, el escenario que la migración 0198+ y el helper de D-05 existen para impedir), el JOIN dejaría de proteger y el filtro directo sobre `users` sería la ÚNICA barrera — pero ese filtro está comentado en la mutación. Conclusión operativa: la robustez de `listMembers` frente a un futuro bug de ADO-07 depende de que el filtro directo sobre `users` (línea 141) exista, aunque hoy sea redundante con el JOIN. **No se recomienda quitarlo** — se documenta acá para que quien revise el switch (173-30) entienda que ambas capas son necesarias, no solo la que "se ve" en la mutación.

Mutación revertida con `cp` del backup (`/tmp/service.ts.bak`) inmediatamente después de la corrida; `git status --porcelain src/modules/members/service.ts` vacío, verificado antes de continuar.

## Verificaciones

| Comando                                                                                                                                       | Exit code                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `cd el-templo-api && pnpm exec tsc -p tsconfig.test-check.json --noEmit`                                                                      | 0 (175 errores preexistentes del baseline, sin cambio — verificado antes y después de escribir ambos archivos) |
| `pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-listados.test.ts`                                                     | 0 — 22/22 tests verdes (corrida real, ~150s)                                                                   |
| Repetición de la misma corrida con el constructor de `listMembers` mutado                                                                     | 0 — 22/22 verdes igual (hallazgo documentado arriba)                                                           |
| `grep -c "toBe(403)\|toEqual(403)\|403"` sobre el archivo de test                                                                             | 0                                                                                                              |
| `grep -n "^describe("` — 10 describes (1 precondiciones + 9 rutas), cada uno de rutas con la clave literal del manifiesto al final del título | confirmado por grep, ver detalle abajo                                                                         |
| `git status --porcelain` tras revertir la mutación                                                                                            | vacío                                                                                                          |

Claves del manifiesto verificadas (una por describe, `grep -c` = 1 cada una): `GET /api/admin/members`, `GET /api/admin/members/search`, `GET /api/admin/members/branches`, `GET /api/admin/members/check-dni`, `GET /api/admin/members/check-duplicates`, `GET /api/admin/members/export`, `GET /api/admin/members/export-sepa`, `GET /api/admin/members/:userId`, `GET /api/admin/members/:userId/session-levels`.

## Rol usado en cada describe (D-10)

Las 8 rutas GET/lista/search/branches/check-dni/check-duplicates/export/get-by-id/session-levels se ejercen con `gym2.adminToken` (rol `admin`, el más barato que acepta `MEMBER_ROLES` para todas ellas salvo el gate de `includeTotalDebt`, que el propio caso de lista necesita ejercer con `ADMIN_ROLES`). `GET /export-sepa` se ejerce con `dos.sepa.ownerToken` (rol `owner`, dedicado — ver Decisión 2).

## Known Stubs

Ninguno — las 9 rutas están completamente implementadas y probadas; no hay datos mock ni placeholders en el camino ejercitado por este plan.

## Threat Flags

Ninguno — las 9 rutas ya estaban dentro del `threat_model` del plan (T-173-26-01..07) y no se detectó superficie nueva no contemplada.

## Self-Check: PASSED

- `test -f el-templo-api/test/fixtures/members-gimnasio-dos.ts` → FOUND
- `test -f el-templo-api/test/tenancy/iso-03-members-listados.test.ts` → FOUND
- `git log --oneline --all | grep 3d9dd88f` → FOUND
- `git log --oneline --all | grep 08bffb2d` → FOUND
