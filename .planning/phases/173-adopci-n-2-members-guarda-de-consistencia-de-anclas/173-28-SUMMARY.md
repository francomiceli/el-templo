---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 28
subsystem: testing
tags:
  [
    tenancy,
    multitenancy,
    drizzle,
    vitest,
    fastify,
    security,
    members,
    users,
    ado-07,
  ]

requires:
  - phase: 173-26
    provides: "test/fixtures/members-gimnasio-dos.ts (ciclo de vida, precondiciones) y iso-03-members-listados.test.ts como plantilla de estilo"
  - phase: 173-27
    provides: "test/tenancy/iso-03-members-ficha.test.ts como idioma de la 'foto' multi-columna, y el precedente de dos-barreras-independientes en password"
provides:
  - "test/tenancy/iso-03-members-altas-y-staff.test.ts: 31 tests, 12 describes, las 11 rutas de escritura de members/leads/users"
  - "Fix: POST /api/admin/users/:userId/program-addons ya no permite inscribir a un socio de otro gimnasio (T-173-28-08)"
  - "Hallazgo documentado: requireBranchAccess/canAccessBranch (fase 110) es una segunda barrera con contrato 403 uniforme, no 404, en 4 rutas de members"
  - "Hallazgo de mutación de cierre: user_branches no tiene la FK compuesta que sí protege a users.branch_id"
affects: [173-29, 173-30, 173-31]

tech-stack:
  added: []
  patterns:
    - "mismaRespuestaQueSedeInexistente: en vez de asumir el status del rechazo de sede ajena, se ejecuta la MISMA operacion con un branchId ajeno y con uno directamente inexistente y se prueba que la respuesta es identica — la indistinguibilidad que D-06 protege, ejercitada en vez de asumida"
    - "Insert directo (tenantValues) para sembrar estados que POST /auth/register no honra (ej. status='prueba' para leads): la ruta de registro fuerza 'freemium' server-side sin importar el body"

key-files:
  created:
    - el-templo-api/test/tenancy/iso-03-members-altas-y-staff.test.ts
  modified:
    - el-templo-api/src/modules/programs/routes.ts

key-decisions:
  - "PATCH /api/admin/leads/:userId NO acepta branchId en el body (verificado leyendo types.ts/schemas.ts) — el plan lo listaba entre las '4 rutas que aceptan branchId', pero la 4ta ruta real es POST /:userId/convert-to-trial. Se corrigio el diseño de los tests para reflejar el codigo real, no la letra del plan, y se documenta la correccion inline en el describe de leads. El analogo cross-tenant que leads SI puede ejercer es purchasedPlanId (tambien resuelto con tenantWhere)."
  - "Hallazgo (documentado, NO corregido): 4 rutas de members (POST /members, POST /members/trial, POST /:userId/convert-to-trial, PUT /:userId) tienen un preHandler previo (requireBranchAccess, fase 110) que intercepta un branchId ajeno con un status de 'prohibido' uniforme ANTES de que assertBranchDelGimnasio (D-05, el 404 del resto del milestone) se evalue. Verificado en vivo. NO es una fuga (el mismo status sale para sede ajena y para sede inexistente — no hay como distinguirlas), pero es un contrato de status distinto al D-06 literal. Se opto por PROBAR la indistinguibilidad en vez de forzar un 404 que no corresponde a la realidad ni de modificar codigo compartido (branch-access.ts, usado por decenas de rutas) fuera del alcance de este plan."
  - "Fix de seguridad real (Rule 2, T-173-28-08): POST /api/admin/users/:userId/program-addons (route en programs/routes.ts, modulo diferido) dejaba inscribir a un socio de OTRO gimnasio en un addon gratis. Se agrego un SELECT users con tenantWhere ANTES del lookup de suscripcion — cirugia minima sobre la tabla strict (D-02), sin tocar el resto del modulo programs."
  - "NO se corrigio: el INSERT de program_enrollments en enrollAddon no usa tenantValues (toda fila nace tenant_id=1 sin importar el gimnasio del actor) — bug preexistente y adyacente, fuera de D-02, documentado en deferred-items.md para 174/175."

requirements-completed: [ADO-02, ADO-07]

duration: ~180min
completed: 2026-08-09
---

# Phase 173 Plan 28: Altas, edición y baja de socios/staff — ADO-07 (criterio 2 de la fase) Summary

**Bateria ISO-03 (31 tests, 12 describes) sobre las 11 rutas de escritura de `members`/`leads`/`users`, con un fix de seguridad real (inscripción de add-on cross-tenant) y dos hallazgos de defensa-en-profundidad descubiertos por mutación de cierre.**

## Performance

- **Duration:** ~180 min (incluye investigación empírica de dos comportamientos no documentados por el plan — ver Deviations — y ~6 corridas completas de ~165-175s cada una)
- **Completed:** 2026-08-09
- **Tasks:** 2/2 completadas
- **Files modified:** 2 (1 creado, 1 modificado)

## Accomplishments

- Las 11 rutas de escritura (6 de `members`/`leads` + 5 de `/api/admin/users`) tienen caso de aislamiento + control positivo, 31/31 verde.
- **Fix de seguridad real:** `POST /api/admin/users/:userId/program-addons` permitía a un staff de otro gimnasio inscribir a un socio ajeno en un add-on gratuito (el camino `pricePaid=0`, que no pasa por el finance ya strict) — verificado en vivo con un probe antes del fix (200 real + fila en `program_enrollments`). Corregido con un chequeo `tenantWhere` mínimo en la ruta.
- **Criterio 2 de la fase probado:** las 4 rutas de `members` que realmente aceptan `branchId` (POST /members, POST /members/trial, POST /:userId/convert-to-trial, PUT /:userId — corrección sobre el texto del plan, que mencionaba `PATCH /leads/:userId` en su lugar) rechazan una sede de otro gimnasio, con la fila verificada sin cambios en la base.
- **`branchIds[]` mixto** (una sede propia + una ajena) en `POST /api/admin/users`: la operación se rechaza ENTERA, con conteo de `users`/`user_branches` antes y después.
- **Mutación de cierre** (Task 2, `assertBranchDelGimnasio` roto en `users/service.ts`, revertida): reveló que la FK compuesta de la migración 0200 (173-12) protege sola el `branchId` primario de `createStaff`/`updateStaff` (aunque con un 500, no el 404 esperado), pero `user_branches` NO tiene esa misma FK — el caso `branchIds[] mixto` es el ÚNICO que se puso rojo.
- Sonda 173-21 corrida sobre el archivo completo (members + 8 tablas en `TENANT_STRICT_MODULES`, sin commitear, revertida): 31/31 verde con el sentinel en throw, cero `TenantSentinelError`.
- `test/tenancy` completo: 331/333 verdes; los 2 rojos son los ya documentados como ajenos (`con-06-lint.test.ts`, dueño 173-30).

## Task Commits

Ambas tareas en el worktree `/home/franco/projects/et-173` (rama `feat/173-adopcion-members`):

1. **Fix T-173-28-08 (program-addons cross-tenant)** — `bc4e34a2` (fix)
2. **Task 1 + Task 2: iso-03-members-altas-y-staff.test.ts (12 describes, 31 tests)** — `08c0ee05` (feat)

_Nota: igual que 173-27, el fix de seguridad se commiteó por separado del archivo de test — son unidades de trabajo independientes (uno es código de producción, el otro es la batería completa)._

No hay commit de metadata en este worktree (STATE.md/ROADMAP.md viven en el checkout principal y no se tocan desde acá, por instrucción explícita).

## Files Created/Modified

- `el-templo-api/test/tenancy/iso-03-members-altas-y-staff.test.ts` — batería de aislamiento + ADO-07 de las 11 rutas de escritura.
- `el-templo-api/src/modules/programs/routes.ts` — `POST /:userId/program-addons` ahora verifica que el socio pertenezca al gimnasio del actor (`tenantWhere`) antes de resolver la suscripción activa; 404 para un socio ajeno.

## Decisions Made

1. **Corrección sobre el texto del plan:** `PATCH /api/admin/leads/:userId` no acepta `branchId` (verificado leyendo `types.ts`/`schemas.ts` antes de escribir el describe) — la 4ta ruta real con `branchId` es `POST /:userId/convert-to-trial`. Se ajustó el diseño de los 4 casos de sede cruzada a las rutas reales, y se documentó la corrección en el docblock del describe de leads. El análogo cross-tenant que leads sí puede ejercer (`purchasedPlanId`) se probó en su lugar.
2. **`mismaRespuestaQueSedeInexistente` (patrón nuevo, ver Hallazgo 1 abajo):** en vez de asumir que el rechazo de sede ajena siempre da 404, el helper ejecuta la MISMA operación con un `branchId` ajeno y con uno directamente inexistente, y prueba que la respuesta es IDÉNTICA — la propiedad real que D-06 protege (indistinguibilidad), sin escribir el status literal en el archivo (mismo criterio que `ancla-branch-consistency.test.ts`, 173-11: "nunca el número, ni en un comentario").
3. **Rol mínimo real para `/api/admin/users`:** las 4 rutas exigen `OWNER_ROLES = ["owner"]` a secas — se reusó `dos.sepa.ownerToken` (el actor `owner` que 173-26 sembró originalmente para `export-sepa`), documentado como el único actor disponible que sirve para este gate.
4. **Insert directo para leads/freemium:** `POST /auth/register` ignora cualquier `status` del body y siempre fuerza `'freemium'` server-side (verificado leyendo `auth/routes.ts`) — para sembrar un lead (`status='prueba'`) hizo falta un INSERT directo con `tenantValues`, no el helper `createTestMember` (que para `tenantId=1` pasa por register).
5. **`ensureEfectivoCaja`** agregado antes de `assignPlan` en el describe de `program-addons`: `assignPlan` con `paymentMethod:"cash"` (default) exige una caja efectivo para la sucursal, y `second-tenant.ts` no la siembra para el gimnasio 2 (es opt-in por archivo).
6. **Control positivo de `program-addons` NO afirma el `tenant_id` de la fila creada:** documentado inline en el test — el INSERT de `enrollAddon` no usa `tenantValues` (bug preexistente adyacente, ver Deviations), afirmarlo daría un falso rojo sobre algo que esta fase no corrige.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical, D-02 cirugía mínima] `POST /:userId/program-addons` permitía inscribir a un socio de otro gimnasio**

- **Found during:** Task 2, lectura de `read_first` (users/service.ts) y del propio código de la ruta (vive en `programs/routes.ts`, no en `users/routes.ts` — el manifiesto la agrupa bajo el prefijo `/api/admin/users`).
- **Issue:** Ni el lookup de `activeSub` en la ruta ni `EnrollmentService.enrollAddon` chequeaban de qué gimnasio era `request.params.userId`. Verificado en vivo con un probe temporal (no commiteado): un staff del gimnasio 2, con `pricePaid` ausente o `0` (el único camino que NO pasa por `transactionService.create`, strict desde la fase 172), obtenía 200 real y una fila nueva en `program_enrollments` para un socio de El Templo.
- **Fix:** `SELECT users` con `tenantWhere(users, ctx)` antes del lookup de `activeSub`; socio ajeno → 404 "Miembro no encontrado" (mismo contrato D-06).
- **Files modified:** `src/modules/programs/routes.ts`.
- **Verification:** Test dedicado (aislamiento: 404 + cero filas nuevas en `program_enrollments`; control: 200 + fila nueva). Ratchet de typecheck limpio (175/175, 0 nuevos). Suite existente `test/programs/admin-addons.test.ts` (13 tests) sigue verde tras el fix.
- **Committed in:** `bc4e34a2`

**Total deviations:** 1 auto-fixed (Rule 2, código de producción real).
**Impact on plan:** El fix cierra un gap de seguridad genuino en una de las 11 rutas explícitamente listadas por este plan. No amplía el alcance de la fase (D-02): la cirugía es una sola query sobre `users`, la tabla strict de esta fase, en un archivo ajeno (permitido por D-02).

## Hallazgos (no son deviations — quedan documentados, no corregidos)

### Hallazgo 1: 4 rutas de `members` tienen una segunda barrera con contrato de status distinto (403 uniforme, no 404)

`POST /members`, `POST /members/trial`, `POST /:userId/convert-to-trial` y `PUT /:userId` registran `preHandler: [requireBranchAccess({from:"body.branchId"})]` (fase 110, no tocado por esta fase), que usa `canAccessBranch` (ya con el filtro de gimnasio de la 173-11, D-14). Verificado en vivo con un probe: un `branchId` ajeno da como respuesta `{"code":"BRANCH_OUT_OF_SCOPE","message":"No tenés acceso a esta sede"}` — el preHandler rechaza ANTES de que `assertBranchDelGimnasio` (el 404 "Sede no encontrada" del resto del milestone) llegue a evaluarse.

**Por qué esto NO es una fuga:** `canAccessBranch` devuelve el MISMO resultado ("no matchea") tanto para una sede que no existe como para una sede de otro gimnasio — no hay forma de distinguir un caso del otro desde afuera, que es exactamente la propiedad que D-06 protege. La letra de D-06 ("cero 403 esperados") no se cumple literalmente en estas 4 rutas, pero el espíritu (indistinguibilidad) sí. El archivo prueba esto directamente con `mismaRespuestaQueSedeInexistente` (ver Decisiones #2) en vez de forzar una aserción de 404 que no corresponde a la realidad del código.

**Por qué no se corrigió:** cambiar el contrato de status de `requireBranchAccess`/`canAccessBranch` tocaría código compartido usado por decenas de rutas fuera del módulo `members` (fuera de `files_modified` y del alcance D-02 de este plan), y el status 403 sigue siendo necesario para su propósito original (RBAC de sede DENTRO del mismo gimnasio — admin/gestión por país, coach/recepción por `branchIds`), no solo para el aislamiento cross-tenant.

### Hallazgo 2 (mutación de cierre Task 2): `user_branches` no tiene la FK compuesta que protege a `users.branch_id`

Ver el registro completo en `deferred-items.md` (2026-08-09, 173-28). Resumen: rompiendo `assertBranchDelGimnasio` en `users/service.ts` (revertido), solo el caso `branchIds[] mixto` de `POST /api/admin/users` se puso rojo — los casos de `branchId` primario de `createStaff`/`updateStaff` siguieron en verde porque la FK compuesta de la migración 0200 (173-12) rechaza el INSERT/UPDATE a nivel de MySQL (aunque con un 500 genérico, no el 404 esperado — la excepción de FK no es una `AppError`). `user_branches` no tiene esa misma FK: con el helper de app mutado, un `branchIds[]` mixto se guardó completo (201 real, con la sede ajena incluida en el body). Bajo el código real (sin mutar) esto es inalcanzable — es un hallazgo de profundidad de defensa, no una vulnerabilidad viva.

## Sonda 173-21

`members` + las 8 tablas de D-01 agregadas a `TENANT_STRICT_MODULES` en `src/db/tenant-tables.ts`, sin commitear. Corrida: `pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-altas-y-staff.test.ts` → **31/31 verde, cero `TenantSentinelError`.** Revertido con `git status --porcelain src/db/tenant-tables.ts` vacío, verificado antes de continuar.

## Verificación

| Criterio                                                                                       | Resultado                                                                                      |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-members-altas-y-staff.test.ts` | ✅ 31/31 (exit 0)                                                                              |
| `pnpm exec vitest run --no-file-parallelism test/tenancy` (directorio completo)                | ✅ 331/333 — los 2 rojos son `con-06-lint.test.ts`, ya documentados como ajenos (dueño 173-30) |
| `grep -c "403" test/tenancy/iso-03-members-altas-y-staff.test.ts`                              | ✅ 0                                                                                           |
| `describe` en el archivo                                                                       | ✅ 12 (1 de precondiciones + 11 de rutas)                                                      |
| Las 11 claves literales del manifiesto presentes                                               | ✅ verificado con `grep -c` por clave, cada una devuelve 2 (declaración + `describe`)          |
| `pnpm typecheck:tests` (ratchet, baseline 175)                                                 | ✅ 0 errores nuevos, 0 empeorados (175/175)                                                    |
| `pnpm exec tsc -p tsconfig.json --noEmit` (código de producción, tras el fix)                  | ✅ 0 errores                                                                                   |
| `test/programs/admin-addons.test.ts` (suite existente, tras el fix)                            | ✅ 13/13 verde                                                                                 |
| `branchIds[]` mixto con conteo `users`/`user_branches` antes/después                           | ✅ implementado y verde                                                                        |
| Mutación de cierre Task 2 (`assertBranchDelGimnasio` en `users/service.ts`)                    | ✅ corrida, documentada (Hallazgo 2), revertida (`git status --porcelain` limpio)              |
| Sonda 173-21                                                                                   | ✅ corrida, 31/31 verde, revertida (`git status --porcelain` limpio)                           |
| `pnpm exec prettier --write` sobre los archivos tocados                                        | ✅ antes de cada commit                                                                        |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Batería ISO-03 de `members`: **3 de 3 archivos completos** (173-26 listados/export, 173-27 ficha, 173-28 altas/edición/baja + staff). El criterio 2 de la fase (ADO-07: ninguna ruta de escritura acepta una sede de otro gimnasio) queda probado con dos gimnasios sobre las 11 rutas.
- El fix de `program-addons` cierra el único gap de seguridad real encontrado en las 11 rutas de este plan.
- Pendiente para 173-29/30/31: el hallazgo de `user_branches` sin FK compuesta (deferred-items.md) es lectura recomendada antes de cerrar el switch, aunque no bloquea el cierre (no es una vulnerabilidad viva). El hallazgo del preHandler 403 en 4 rutas de `members` tampoco bloquea (no hay fuga), pero vale que quien revise el switch (173-30) lo tenga presente si en algún momento se audita el contrato de status del milestone.

## Self-Check: PASSED

- `test -f el-templo-api/test/tenancy/iso-03-members-altas-y-staff.test.ts` → FOUND
- `git log --oneline --all | grep bc4e34a2` → FOUND
- `git log --oneline --all | grep 08c0ee05` → FOUND
- `git status --porcelain` en el worktree → limpio (ambas mutaciones de cierre revertidas)

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-09_
