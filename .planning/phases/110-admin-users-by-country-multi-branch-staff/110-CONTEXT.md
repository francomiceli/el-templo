# Phase 110: Admin users por país + multi-sede staff - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor del modelo de permisos del staff: introducir scoping por país (admin/gestion/owner) y multi-sede (coach/recepción), con middleware central de autorización (`canAccessBranch`). `users.branch_id` se mantiene NOT NULL como sede personal de entrenamiento. Templo Online (`branches.isVirtual=true`) accesible globalmente. Owner mantiene bypass por rol.

Esta fase NO inventa capacidades nuevas — solo formaliza permisos que hoy son implícitos (cualquier staff puede operar sobre cualquier sede). Sí refactoriza UI (form de crear staff, selectores de sede filtrados por scope).
</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**12 requirements lockeados.** Ver `110-SPEC.md` para requirements completos, boundaries y acceptance criteria.

Downstream agents DEBEN leer `110-SPEC.md` antes de planificar o implementar. Requirements no se duplican aquí.

**In scope (resumen de SPEC.md):**

- Schema: `users.country` varchar(2) nullable + tabla `user_branches` + migration con backfill atómico
- Hook `country-scope.ts` extendido a `{ country, branchIds, isOwner, role }` con lectura directa de `users.country`
- Helper central `canAccessBranch(scope, branchId)` con reglas por rol
- Aplicación del middleware en `/api/admin/*`, `/api/finance/*`, `/api/reports/*`, `/api/scheduling/*` admin
- Multisucursal por rol staff en `booking-service.ts`
- Validación de cardinalidad rol/country/user_branches en service de usuarios
- 403 con código `BRANCH_OUT_OF_SCOPE` + log estructurado
- UI admin: form de staff con país o multi-sede según rol; selectores filtrados por scope
- Tests integración cubriendo 5 categorías de access + 4 errores de cardinalidad + multisucursal staff

**Out of scope (resumen):**

- Tabla `countries` con metadata
- Multi-país para admin/gestion (solo owner)
- Cambio de JWT payload
- `users.branch_id` nullable
- Optimizaciones de performance (cache scope, JWT con scope embebido)
- Endpoints member-facing scope-eados
- Migración del tipo `CountryCode` a algo dinámico
- Reorganización del menú admin por scope
  </spec_lock>

<decisions>
## Implementation Decisions

### Inyección del middleware

- **D-01:** `canAccessBranch(scope, branchId): Promise<boolean>` es una función pura testeable en `el-templo-api/src/modules/shared/branch-access.ts` (nuevo archivo). Reglas (en orden de evaluación): branch.isVirtual → true; scope.isOwner → true; admin/gestion → branch.country === scope.country; coach/recepción → branchIds.includes(branchId); member → branchId === user.branchId; default → false.
- **D-02:** preHandler `requireBranchAccess({ from })` se aplica explícitamente por ruta. El parámetro `from` declara dónde leer el branchId: `from: 'query.branchId'`, `'params.id'`, `'body.branchId'`. Sin auto-detección. Ruta sin `requireBranchAccess` no hace check (decisión consciente del autor de la ruta).
- **D-03:** Writes que validan plan-country contra branch-country mantienen su validación de **datos** en service (Phase 98 D-03, retorna 400). El nuevo preHandler valida **permiso** (retorna 403). Los dos coexisten: una request puede pasar el preHandler (tiene acceso a la sede) y fallar en el service (los datos del request son inconsistentes).

### Códigos HTTP y errores

- **D-04:** Coexisten: **403** para violaciones de permiso (preHandler `canAccessBranch` falla — actor no tiene acceso al recurso); **400** para violaciones de datos (business rule cross-country, ej. asignar plan ARS a member ES — Phase 98 D-03 mantiene). Semánticamente correcto.
- **D-05:** Body 403: `{ error: 'Forbidden', message: 'No tenés acceso a esta sede', code: 'BRANCH_OUT_OF_SCOPE' }`. Mensaje en español. `code` estructurado para match exacto en frontend (otros 403 del sistema podrían usar otros códigos en el futuro).
- **D-06:** Logging: `request.log.warn({ userId, role, branchId, scope }, 'BRANCH_OUT_OF_SCOPE')` en cada violación. Sigue D-17 Phase 98 (4xx no van a Sentry, son client errors esperados). Útil para detectar bugs de UI y intentos sistemáticos.

### Endpoint de sedes accesibles

- **D-07:** Modificar `GET /admin/members/branches` (en `el-templo-api/src/modules/members/routes.ts:120`) para filtrar por `request.scope`. owner: todas (con toggle `?country=` opcional); admin/gestion: sedes del `scope.country`; coach/recepción: sedes en `scope.branchIds`; + sedes con `isVirtual=true` siempre incluidas. Cambio breaking pero alineado con el rediseño — todos los consumidores actuales pasan a recibir lista filtrada automáticamente.
- **D-08:** Owner respeta `?country=AR|ES` igual que en Phase 98 D-02 (PlanesPage owner toggle). Sin `?country`, owner ve todas. Con `?country=AR`, owner ve solo AR + virtuales.
- **D-09:** Sedes con `isVirtual=true` se concatenan al final de la lista filtrada para todos los roles. Consistente con la regla `if (branch.isVirtual) allow` en `canAccessBranch`.

### Permisos para gestionar staff

- **D-10:** Crear/editar/desactivar staff (roles admin, gestion, coach, recepción) es operación exclusiva de **owner**. UsuariosPage en admin queda accesible solo con `OWNER_ROLES`. Consistente con `/api/users` actual (ya protegido por `OWNER_ROLES` en `el-templo-api/src/modules/users/routes.ts:28`).
- **D-11:** Form de staff (`UsuariosPage.vue` + dialog asociado): el owner selecciona primero el rol, luego el país. Para coach/recepción aparece multi-select de sedes filtrado al país elegido (más Templo Online opcional como sede operativa). Para admin/gestion no aparece multi-select (alcance es por país completo). El owner se crea con `country = NULL` = acceso global.
- **D-12:** Owner: `country = NULL` modela acceso global por rol. Sin tabla `user_countries`. Si en el futuro hace falta owner restringido a N países, refactor separado.

### Modelo (re-confirmado durante discusión)

- **D-13:** `user_branches` ES restricción de seguridad — define qué sedes puede acceder un coach/recepción dentro de su país. NO es metadata operativa. Coach con `user_branches=[Palermo, Belgrano]` recibe 403 al intentar operar sobre Caballito (aunque sea sede AR). Si el owner necesita habilitarle Caballito, agrega la fila a `user_branches`.

### Claude's Discretion

- Naming exacto del archivo del helper (`branch-access.ts`, `authz.ts`, `scope-guards.ts` — Claude decide siguiendo CONVENTIONS).
- Forma exacta del API del helper Drizzle (qué firma exporta, si retorna `boolean` o tira `BranchAccessError`).
- Componente Quasar exacto del multi-select de sedes (q-select multiple vs q-checkbox group — Claude decide en plan-phase con UI-researcher si aplica).
- Si `requireBranchAccess` se exporta como named export desde `branch-access.ts` o como Fastify plugin separado.
- Estructura del file `el-templo-api/src/modules/shared/branch-access.ts` — exports concretos.
- Logging key exacto (`'BRANCH_OUT_OF_SCOPE'` como string vs constante exportada — Claude decide).
- Cómo se invoca desde el handler cuando no se usa preHandler (en endpoints que validan branchId derivado de un row de DB, no del request).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents DEBEN leer estos antes de planificar o implementar.**

### Phase 110 lockeado

- `.planning/phases/110-admin-users-by-country-multi-branch-staff/110-SPEC.md` — Locked requirements (12 requirements + boundaries + 16 acceptance criteria). MUST READ.

### Precedente directo: Phase 98 (multi-currency country-scoped plans)

- `.planning/phases/98-multi-currency-and-country-scoped-plans/98-CONTEXT.md` — Decisions D-01 a D-19. **D-01** define el patrón `attachCountryScope` preHandler que Phase 110 extiende. **D-02** define el toggle owner `?country=` que Phase 110 mantiene. **D-03** define la validación cross-country en service con 400 — Phase 110 D-03/D-04 dice que coexiste con el 403 nuevo. **D-14/D-15** definen el patrón de migration atómica con SQL manual + schema Drizzle en mismo PR. **D-17** define el patrón log.warn (no Sentry) para 4xx — Phase 110 D-06 lo aplica. **D-18** define cambios additive en response shapes.
- `.planning/phases/98-multi-currency-and-country-scoped-plans/98-SPEC.md` — Contexto adicional sobre country scope.

### Codebase contracts

- `el-templo-api/src/modules/shared/country-scope.ts` — Hook `attachCountryScope` actual. Phase 110 lo extiende para leer `users.country` directamente y popular `branchIds` para coach/recepción.
- `el-templo-api/src/modules/shared/permissions.ts` — Constantes de roles (`OWNER_ROLES`, `ADMIN_ROLES`, `COACH_ROLES`, `TRAINING_ROLES`, `CAJA_ROLES`, `ATTENDANCE_ROLES`, `MEMBER_ROLES`, `ALL_STAFF_ROLES`). Reutilizar; agregar nuevas si hace falta.
- `el-templo-api/src/db/schema/users.ts` — Schema actual de users. Phase 110 agrega `country` columna y documenta nueva semántica de `branch_id`.
- `el-templo-api/src/db/schema/branches.ts` — Schema branches. Mantiene `country varchar(2)` y `isVirtual`.
- `el-templo-api/src/modules/users/routes.ts` — Routes de users (gestión de staff). Hoy protegida por `OWNER_ROLES`. Phase 110 extiende para incluir country/user_branches en payload.
- `el-templo-api/src/modules/members/routes.ts:115-130` — `GET /admin/members/branches` actual. Phase 110 D-07 lo modifica para filtrar por scope.
- `el-templo-api/src/modules/scheduling/booking-service.ts:142` — Multi-branch check actual. Phase 110 REQ-8 agrega bypass por `role !== 'member'`.

### Codebase maps

- `.planning/codebase/CONVENTIONS.md` — Naming patterns (services, routes, types, schemas), code style, TypeScript rules. Aplicar en archivos nuevos.
- `.planning/codebase/STRUCTURE.md` — Estructura del monorepo y módulos.
- `.planning/codebase/TESTING.md` — Patrones de testing en `el-templo-api/test/`. Phase 19 estableció tests de integración obligatorios para nuevas rutas.

### Project-level

- `CLAUDE.md` (project root) — Development standards: structured logging (Fastify Pino + createLogger), no `any` types, integration tests obligatorios, migration handling vía `db:migrate` (NUNCA `drizzle-kit migrate`), commit migration SQL alongside schema changes.
- `.planning/PROJECT.md` — Vision y principles del proyecto.
- `.planning/STATE.md` — Roadmap evolution + decisiones acumuladas.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`attachCountryScope` hook** (`el-templo-api/src/modules/shared/country-scope.ts`): Phase 110 lo extiende — agrega lectura directa de `users.country` para admin/gestion (sin JOIN a branches), populación de `branchIds` para coach/recepción desde `user_branches`, y exposición de `role` en el scope.
- **Constantes de roles** (`el-templo-api/src/modules/shared/permissions.ts`): `OWNER_ROLES`, `ADMIN_ROLES`, `COACH_ROLES`, etc. son la fuente única de verdad. Reutilizar en `canAccessBranch` y en validación de cardinalidad. Si Phase 110 introduce nuevos groupings, agregar acá.
- **Migration runner** (`el-templo-api/src/db/run-migrations.ts`): tracked via `_migrations` table. Single source of truth en local y prod. Phase 110 SQL corre vía `pnpm db:migrate`.
- **Error helper** (`el-templo-admin/src/utils/extract-error.ts`): `isExpectedClientError(err)` y `extractError(err)` para distinguir 4xx de 5xx en frontend (Phase 98 D-17).
- **Schema Drizzle de branches** ya tiene `isVirtual` y `country` — no requieren cambios.

### Established Patterns

- **Fastify preHandler chains:** `attachCountryScope` ya se registra como preHandler por módulo (subscriptions, finance, member-routes). Phase 110 sigue el mismo patrón con `requireBranchAccess`. Per-route: `{ onRequest: [fastify.authenticate], preHandler: [requireBranchAccess({ from: 'query.branchId' })] }`.
- **Service-level validations:** Cross-country data validation vive en services (Phase 98 D-03), retorna 400 con shape `{ error, message }`. Phase 110 mantiene esto.
- **Migration + schema en mismo PR:** Phase 98 D-15. SQL manual escrito a mano (no `drizzle-kit generate`). Phase 110 sigue.
- **Tests integración en `el-templo-api/test/`** contra MySQL real (`eltemplo_test`). Helpers en `test/helpers.ts`. Phase 19 estableció esto.
- **Pinia composition API + composables con cleanup()** en frontend (CLAUDE.md).
- **Quasar Q\* components** en admin app: `q-select`, `q-checkbox`, `q-form`, `q-dialog`, etc. Plan-phase decidirá multi-select pattern para sedes.

### Integration Points

- `request.scope` ya consumido en `el-templo-api/src/modules/subscriptions/`, `finance/routes.ts`, `members/member-routes.ts`. Phase 110 extiende el shape — agregar `branchIds` y `role` debe ser additive (no romper consumers existentes).
- `el-templo-admin/src/composables/useMembersApi.ts:287` — `loadBranches()` consume `GET /admin/members/branches`. Phase 110 modifica el endpoint, el composable no cambia.
- `UsuariosPage.vue` — punto de entrada para D-10/D-11.
- Selectores de sede en `CajaPage.vue`, `ReportesPage.vue`, `AlumnosPage.vue`, `AnaliticasPage.vue`, `ChangeFixedSchedulesDialog.vue`, etc. — todos consumen el mismo composable `loadBranches()`. Filtrado central en endpoint = update transparente para todas estas vistas.

</code_context>

<specifics>
## Specific Ideas

- El patrón "owner toggle ?country=AR|ES" debe quedar idéntico al de Phase 98 — mismo shape, mismo nombre de query param, mismo scope.country resolution.
- Mensaje del 403 en español: "No tenés acceso a esta sede" (sigue convención Phase 98 que usa español en mensajes user-facing).
- `code: 'BRANCH_OUT_OF_SCOPE'` como string literal estable — el frontend puede hacer match exacto sin parsear el message.
- Helper `canAccessBranch` debe ser pure function (no side effects, fácil de testear unitariamente). El signature: `async canAccessBranch(scope: CountryScope, branchId: number, db: MySql2Database<typeof schema>): Promise<boolean>` o variante similar — plan-phase decide si el branch lookup vive dentro o si recibe la branch ya cargada.
- Para coach/recepción: el form pide rol → país → multi-select de sedes (filtrado al país). El multi-select acepta marcar Templo Online (virtual) si aplica para ese rol.

</specifics>

<deferred>
## Deferred Ideas

- **Tabla `countries` con metadata** (nombre, moneda, timezone default): si surge necesidad real, fase posterior. Por ahora `varchar(2)` ISO alcanza.
- **Multi-país para admin/gestion**: hoy solo owner. Si en el futuro un admin gestiona varios países sin ser owner, refactor separado (probable: tabla `user_countries` + migración del campo `country`).
- **Owner restringido a N países** (no global): si surge la figura "owner regional" que no debe ver otros países, refactor separado (introduce tabla `user_countries`).
- **Cache de scope o JWT con scope embebido**: optimización de performance. Hoy no es necesario (escala chica, 1 query JOIN por request). Si pega en métricas, fase de optimización.
- **Reorganización del menú admin por scope** (ocultar items que no aplican según rol/scope): UX adicional. Hoy se filtra a nivel componente individual.
- **Migración histórica de "qué sede atendió cada coach en cada clase"**: los registros existentes se quedan con su `branch_id` actual del coach. Reescribir history es out of scope.
- **Modelo `user_branches` como metadata operativa** (no restricción): considerada y descartada. Re-confirmado durante discusión que `user_branches` ES restricción de seguridad.

</deferred>

---

_Phase: 110-admin-users-by-country-multi-branch-staff_
_Context gathered: 2026-04-30_
_Next step: /clear then /gsd-plan-phase 110_
