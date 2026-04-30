# Phase 110: Admin users por país + multi-sede staff — Specification

**Created:** 2026-04-30
**Ambiguity score:** 0.17
**Requirements:** 12 locked

## Goal

Refactorizar el modelo de permisos del staff: admin/gestion/owner pasan a tener alcance por país (nueva columna `users.country`), coach/recepción pasan a multi-sede (nueva tabla `user_branches`). `users.branch_id` se mantiene NOT NULL para todos como sede personal de entrenamiento. El backend valida acceso a sedes via middleware (`canAccessBranch`) que retorna 403 ante violaciones de scope. Templo Online (`branches.isVirtual=true`) queda accesible globalmente.

## Background

Hoy todos los users tienen `branch_id` NOT NULL apuntando a una única sede, sin distinción semántica entre "sede personal de entrenamiento" y "sede de trabajo/gestión". Esto provoca tres problemas: (1) un admin de Argentina y un admin de Uruguay tienen el mismo modelo y solo se diferencian por la sede de su `branch_id` — no hay un alcance de país explícito; (2) los coaches que operativamente trabajan en varias sedes están forzados a tener `branch_id` apuntando a una sola, perdiendo trazabilidad real; (3) el flag de "multisucursal" solo existe a nivel `subscription_plans.multi_branch`, así que el staff que entra a la app de miembros tiene que tener un plan con ese flag para reservar fuera de su sede.

Infra existente que se reutiliza: hook `attachCountryScope` en `el-templo-api/src/modules/shared/country-scope.ts` que hoy resuelve el país por JOIN `users → branches` en cada request y popula `request.scope = { country, isOwner }`. Tipo `CountryCode = "AR" | "ES"` hardcoded. JWT carga solo `{ userId, email, role }` (decisión deliberada para que cambios de permisos tomen efecto sin re-login). Constantes de roles en `el-templo-api/src/modules/shared/permissions.ts` (`OWNER_ROLES = ["owner"]`, `ADMIN_ROLES = ["admin","owner"]`, etc.). `branches.isVirtual` ya existe.

## Requirements

1. **Schema users.country**: Nueva columna nullable de país de gestión.
   - Current: `users` no tiene columna `country`. La derivación de país se hace por JOIN `users → branches`.
   - Target: `users.country` varchar(2) ISO, nullable. NOT NULL conceptualmente para admin/gestion (validado a nivel servicio); NULL para owner (acceso global por rol), member, coach, recepción.
   - Acceptance: Schema Drizzle incluye la columna; migración SQL la agrega; query `SELECT country FROM users WHERE role IN ('admin','gestion')` retorna no-NULL para todos los registros tras backfill.

2. **Schema user_branches**: Nueva tabla join para staff multi-sede.
   - Current: No existe tabla; `users.branch_id` única referencia a sede.
   - Target: Tabla `user_branches(user_id INT, branch_id INT, PRIMARY KEY (user_id, branch_id))` con FKs `ON DELETE CASCADE` a `users.id` y `branches.id`. Aplica solo a coach/recepción.
   - Acceptance: Migración crea la tabla; query `SELECT COUNT(*) FROM user_branches ub JOIN users u ON u.id=ub.user_id WHERE u.role IN ('coach','recepcion')` retorna ≥ N (donde N = cantidad de coach/recepción existentes pre-migración).

3. **Backfill atómico**: La migración llena los nuevos campos con datos derivados.
   - Current: No hay datos en columna nueva ni tabla nueva.
   - Target: Misma migración SQL ejecuta: `UPDATE users SET country = (SELECT country FROM branches WHERE id = users.branch_id) WHERE role IN ('admin','gestion')` y `INSERT INTO user_branches (user_id, branch_id) SELECT id, branch_id FROM users WHERE role IN ('coach','recepcion')`. Owner queda con `country = NULL`.
   - Acceptance: Tras correr `pnpm db:migrate` en local con datos de seed: 0 admins/gestions con `country IS NULL`; cada coach/recepción tiene exactamente 1 fila en `user_branches` con su sede actual; owners tienen `country = NULL`.

4. **branch_id semantics**: `users.branch_id` se mantiene NOT NULL para todos los roles.
   - Current: NOT NULL, semántica ambigua (¿sede de trabajo? ¿de entrenamiento?).
   - Target: NOT NULL, semántica documentada como "sede personal de entrenamiento". Aplica a member y a staff que también entrena.
   - Acceptance: Schema sigue declarando `branch_id` NOT NULL; comentario en `el-templo-api/src/db/schema/users.ts` documenta la nueva semántica.

5. **Hook country-scope extendido**: `attachCountryScope` lee `users.country` directamente y popula `branchIds`.
   - Current: Resuelve `country` por JOIN `users → branches`. Solo expone `{ country, isOwner }`.
   - Target: Para admin/gestion lee `users.country` directamente (sin JOIN). Para owner mantiene toggle `?country=`. Para coach/recepción carga lista de `branchIds` desde `user_branches`. `request.scope` pasa a `{ country, branchIds, isOwner, role }`.
   - Acceptance: Test unitario del hook: admin con `country='AR'` produce `scope.country='AR'`; coach con 2 filas en `user_branches` produce `scope.branchIds=[id1,id2]`; owner produce `scope.isOwner=true`.

6. **Middleware canAccessBranch**: Función reutilizable de autorización por sede.
   - Current: No existe función central; algunas rutas (ej. `finance/routes.ts`) hacen check ad-hoc comparando `branchRow.country` con `request.scope.country`.
   - Target: Helper `canAccessBranch(scope, branchId): Promise<boolean>` con reglas: virtual → true; owner → true; admin/gestion → `branch.country === scope.country`; coach/recepción → `branchId in scope.branchIds`; member → `branchId === user.branchId`.
   - Acceptance: Helper con tests unitarios cubriendo las 5 categorías + caso virtual + caso branch inexistente (retorna false).

7. **Endpoints scope-eados**: Aplicar `canAccessBranch` en endpoints admin que reciben/operan sobre `branchId`.
   - Current: Endpoints de admin/finance/scheduling reciben `?branchId=` y confían en que el frontend filtró bien.
   - Target: Todo endpoint bajo `/api/admin/*`, `/api/finance/*`, `/api/reports/*` (si existe), `/api/scheduling/*` (rutas admin) que reciba un `branchId` (query, body o path) llama `canAccessBranch` antes de operar. Falla → 403 con código `BRANCH_OUT_OF_SCOPE` y log estructurado (`request.log.warn({ userId, role, branchId, scope }, ...)`).
   - Acceptance: Lista explícita de endpoints afectados generada en plan-phase. Para cada uno: test integración que confirma 403 cuando user del país A pide sede del país B; 200 en caso válido; 200 en caso de Templo Online (virtual).

8. **Multisucursal por rol staff**: Staff puede reservar en cualquier sede sin requerir plan multiBranch.
   - Current: `el-templo-api/src/modules/scheduling/booking-service.ts:142` valida `plan?.multiBranch` para reservas fuera de la sede del miembro.
   - Target: Antes de esa validación, si `user.role !== 'member'`, permitir. Sólo members siguen sujetos al flag del plan.
   - Acceptance: Test integración: coach sin subscription crea reserva en sede distinta a su `branch_id` y obtiene 200; member sin plan multiBranch en la misma situación obtiene el error existente.

9. **Validación de cardinalidad por rol**: El servicio de usuarios valida que cada rol tenga el shape correcto al crear/editar.
   - Current: No hay validación de combinación rol/country/user_branches porque las dimensiones no existían.
   - Target: Servicio rechaza con 400 al crear/editar: admin/gestion sin `country`; coach/recepción con 0 filas en `user_branches`; member con cualquier fila en `user_branches`; owner con `country` no-NULL.
   - Acceptance: Test integración cubre los 4 escenarios de rechazo + 4 escenarios de éxito (uno por rol válido).

10. **Templo Online global**: Sedes virtuales son accesibles desde cualquier scope.
    - Current: `branches.isVirtual` ya existe pero no hay regla central de bypass.
    - Target: `canAccessBranch` retorna `true` cuando `branch.isVirtual === true`, sin importar role/country/branchIds.
    - Acceptance: Test integración: admin de país AR consulta endpoint con `branchId` correspondiente a una sede virtual y obtiene 200, independientemente del país de origen.

11. **Admin UI — formulario de staff**: Formulario de crear/editar staff pide país (admin/gestion) o sedes (coach/recepción).
    - Current: Formulario de usuarios en `el-templo-admin/src/pages/UsuariosPage.vue` (y dialog asociado) pide `branchId` único para todos los roles.
    - Target: Según rol seleccionado, el formulario muestra: campo "País" (select AR/ES) para admin/gestion; multi-select de sedes para coach/recepción; nada extra para owner; campo "Sede" como sede personal de entrenamiento para todos. Validación frontend antes de submit.
    - Acceptance: Crear admin sin país en el form muestra error inline y no hace submit. Crear coach sin marcar al menos una sede operativa muestra error inline. UI passes manual UAT (operador real puede crear los 4 tipos de staff).

12. **Admin UI — selectores de sede filtrados por scope**: Los selectores de sede en páginas admin solo muestran sedes accesibles.
    - Current: Selectores de sede en `CajaPage.vue`, `ReportesPage.vue`, `AlumnosPage.vue`, `AnaliticasPage.vue`, etc. cargan todas las sedes visibles (con toggle país para owner).
    - Target: Los selectores cargan únicamente las sedes que el usuario tiene en su scope (sedes del país para admin/gestion; sedes en `user_branches` + virtuales para coach/recepción; todas para owner). Endpoint backend `GET /api/branches` (o equivalente) retorna sedes filtradas por scope.
    - Acceptance: Loguearse como admin de AR: el selector de sede en CajaPage muestra solo sedes AR + Templo Online, no sedes ES. Loguearse como coach con 2 sedes: el selector muestra esas 2 + Templo Online.

## Boundaries

**In scope:**

- Schema: nueva columna `users.country`, nueva tabla `user_branches`, migration con backfill atómico
- `country-scope.ts`: extensión a `{ country, branchIds, isOwner, role }` y lectura directa de `users.country`
- Helper central `canAccessBranch(scope, branchId)` con reglas role-based
- Aplicación del middleware en endpoints `/api/admin/*`, `/api/finance/*`, `/api/reports/*`, `/api/scheduling/*` admin
- Multisucursal implícita por rol staff en `booking-service.ts`
- Validación de cardinalidad rol/country/user_branches en service de usuarios
- Bypass de `canAccessBranch` para sedes virtuales (Templo Online)
- 403 con código `BRANCH_OUT_OF_SCOPE` + log estructurado en violaciones
- UI admin: form de crear/editar staff con país o multi-sede según rol
- UI admin: selectores de sede filtrados por scope del usuario logueado
- Tests integración cubriendo: 5 categorías de access (owner, admin/gestion, coach/recepción, member, virtual), 4 errores de cardinalidad, multisucursal por rol staff

**Out of scope:**

- Tabla `countries` con metadata (nombre, moneda, timezone) — `varchar(2)` ISO alcanza para esta fase; si hace falta metadata se hace en fase posterior
- Multi-país para admin/gestion — solo owner soporta múltiples países; futuro feature si surge necesidad real
- Cambio del JWT payload — `{ userId, email, role }` se mantiene; agregar más fields rompería la convención de "permisos cambian sin re-login"
- Repensar `users.branch_id` como concepto opcional — sigue NOT NULL como sede personal; eliminarlo es refactor enorme y no hace falta
- Optimización de performance (cache de scope, JWT con scope embebido) — la query JOIN actual es 1 por request, ok para escala actual; si a futuro pega, separate phase
- Endpoints member-facing scope-eados por país — los members usan su propio `branch_id`; no aplica el middleware nuevo
- Migración del tipo `CountryCode = "AR" | "ES"` a algo dinámico — sigue hardcoded; si suma país se cambia el type en una línea
- Migración de coaches "qué sede atendió cada clase" históricamente — los registros existentes se quedan con `branch_id` actual del coach, sin reescribir history
- Reorganización del menú admin por scope (ej. ocultar items que no aplican) — separate UX phase si se justifica

## Constraints

- **Migración con backfill atómico**: el SQL que agrega columna/tabla y rellena datos corre en una única migration tracked por el `_migrations` table existente (`pnpm db:migrate`). Local y producción usan el mismo runner.
- **JWT inalterado**: el payload sigue `{ userId, email, role }`. Resolver scope por request mantiene la propiedad de "cambios de permisos toman efecto sin re-login".
- **Compatibilidad con `attachCountryScope` actual**: rutas que ya leen `request.scope.country` (subscriptions, finance, member-routes) deben seguir funcionando sin cambios — la extensión agrega `branchIds` y `role` al objeto, no rompe el contrato existente.
- **Sin downtime mayor**: la migration corre en segundos para la escala actual (decenas de staff). Aceptable que las requests admin durante esos segundos vean errores transitorios; member app no se afecta porque sus queries no dependen del schema nuevo.
- **Tests obligatorios**: nuevas rutas/middleware exigen tests integración en `el-templo-api/test/` (estándar establecido en Phase 19).

## Acceptance Criteria

- [ ] Migration SQL aplicada en local y staging sin errores (`pnpm db:migrate` exit 0)
- [ ] Tras migración: `SELECT COUNT(*) FROM users WHERE role IN ('admin','gestion') AND country IS NULL` = 0
- [ ] Tras migración: cada coach/recepción tiene ≥ 1 fila en `user_branches` con su sede actual
- [ ] Tras migración: owners siguen accesibles con `country IS NULL`
- [ ] `request.scope` incluye `country`, `branchIds`, `isOwner`, `role` en rutas con `attachCountryScope`
- [ ] `canAccessBranch` con admin AR pidiendo sede ES retorna `false`
- [ ] `canAccessBranch` con sede `isVirtual=true` retorna `true` para cualquier rol/scope
- [ ] `GET /api/admin/members?branchId=X` con admin de país distinto retorna 403 con body `{ code: "BRANCH_OUT_OF_SCOPE" }`
- [ ] `GET /api/admin/<endpoint>` para sede de Templo Online retorna 200 desde admin AR y desde admin ES
- [ ] Coach con 2 filas en `user_branches` puede operar sobre esas 2 sedes; obtiene 403 sobre una tercera
- [ ] Staff (cualquier rol no-member) entrando a la app de miembros puede crear reserva en sede distinta a `branch_id` sin necesidad de plan `multiBranch`
- [ ] Service de usuarios rechaza con 400 al crear admin sin `country`
- [ ] Service de usuarios rechaza con 400 al crear coach con 0 filas en `user_branches`
- [ ] Form de UI admin (UsuariosPage) muestra campo país para admin/gestion y multi-select de sedes para coach/recepción según rol seleccionado
- [ ] Selector de sede en `CajaPage.vue` muestra solo sedes accesibles para el usuario logueado (verificable manualmente con admin AR vs admin ES)
- [ ] Tests integración nuevos pasan en `el-templo-api/test/` cubriendo: scope hook, canAccessBranch, 403 cross-country, virtual bypass, multisucursal staff, validación cardinalidad

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                               |
| ------------------- | ----- | ----- | ------ | --------------------------------------------------- |
| Goal Clarity        | 0.90  | 0.75  | ✓      | Refactor de modelo de permisos con shape claro      |
| Boundary Clarity    | 0.80  | 0.70  | ✓      | In/out scope explícitos; lista de endpoints en plan |
| Constraint Clarity  | 0.78  | 0.65  | ✓      | Migration atómica; JWT inalterado; backwards-compat |
| Acceptance Criteria | 0.78  | 0.70  | ✓      | 16 checkboxes pass/fail                             |
| **Ambiguity**       | 0.17  | ≤0.20 | ✓      |                                                     |

## Interview Log

| Round | Perspective      | Question summary                         | Decision locked                                                                            |
| ----- | ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0     | Pre-spec discuss | Scope de roles                           | Inicialmente "todo el staff"; tras analizar coach multi-sede se diferenció.                |
| 0     | Pre-spec discuss | Multiplicidad de país                    | Owner única excepción multi-país; resuelto vía `country=NULL` + bypass por rol.            |
| 0     | Pre-spec discuss | ¿branch_id nullable?                     | NO: `branch_id` se redefine como sede personal de entrenamiento (NOT NULL).                |
| 0     | Pre-spec discuss | Schema países                            | Columna `users.country` varchar(2); sin tabla join `user_countries`.                       |
| 0     | Pre-spec discuss | Coach multi-sede                         | Incluido: nueva tabla `user_branches` para coach/recepción.                                |
| 0     | Pre-spec discuss | Staff usando app de miembros             | Multisucursal implícita por rol; bypass del flag `plan.multiBranch`.                       |
| 0     | Pre-spec discuss | Templo Online                            | `branches.isVirtual=true` accesible globalmente vía bypass en `canAccessBranch`.           |
| 0     | Pre-spec discuss | JWT                                      | Sin cambios — sigue `{userId,email,role}`. Scope se resuelve por request.                  |
| 0     | Pre-spec discuss | Catálogo país                            | `varchar(2)` ISO; sin tabla `countries`.                                                   |
| 1     | Boundary Keeper  | ¿Comportamiento ante violación de scope? | 403 con código `BRANCH_OUT_OF_SCOPE` + log estructurado.                                   |
| 1     | Boundary Keeper  | ¿Endpoints en scope?                     | Todos los `/api/admin/*` + finance + reports + scheduling admin.                           |
| 1     | Failure Analyst  | ¿Cómo se hace la migración / backfill?   | Atómica en una sola migration SQL (ALTER + UPDATE + INSERT) corrida por `pnpm db:migrate`. |

---

_Phase: 110-admin-users-by-country-multi-branch-staff_
_Spec created: 2026-04-30_
_Next step: /gsd-discuss-phase 110 — implementation decisions (lista exacta de endpoints scope-eados, shape exacto de `canAccessBranch`, dónde inyectar el middleware, naming de error codes, UI patterns para multi-select de sedes)_
