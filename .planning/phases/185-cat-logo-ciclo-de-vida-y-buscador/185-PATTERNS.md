# Phase 185: Catálogo — ciclo de vida y buscador - Pattern Map

**Mapped:** 2026-09-01
**Files analyzed:** 24 (6 nuevos backend, 5 editados backend, 4 nuevos frontend, 4 editados frontend, 5 tests)
**Analogs found:** 24 / 24

**Codebase fuente:** worktree `/home/franco/projects/et-182` (rama `feat/184-catalogo-ejercicios`, HEAD `b6e81311`). **Todos los paths abajo son relativos a la raíz del repo tal como existen en ese worktree** (`el-templo-api/...`, `el-templo-admin/...`) — la 185 se ramifica de ahí, NO del checkout principal (`/home/franco/projects/el-templo`, que no tiene el código de la 184). Los ejecutores de esta fase trabajan DENTRO de `et-182`.

**⚠ Lectura obligatoria antes de planificar, NO reproducida acá completa:**

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (vive en `origin/master`, `git show origin/master:.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — no está en `et-182` ni en el checkout principal) — Definición 2 (ciclo de vida completo CAT-03/04/05/07), Definición 6.
- `.planning/phases/184-.../184-CONTEXT.md` — D-01..D-10 de la 184, en particular D-05 (cero transiciones en la 184) y D-06 (edición de global bloqueada, esta fase la reemplaza por copia local).
- Migración `0217_gym_catalog.sql` y `el-templo-api/src/db/schema/gym-exercises.ts` — YA leídos completos abajo, no releer.

**Verificado 2026-09-01:** `origin/master` y `origin/staging` topean en `0215_referral_partners.sql`. `et-182` local tomó `0216_platform_core.sql` (fase 182/183) y `0217_gym_catalog.sql` (fase 184). **`0218` es el siguiente número libre real** para cualquier migración de esta fase.

---

## File Classification

| New/Modified File                                                                                                          | Role                       | Data Flow                                | Closest Analog                                                                                                                                                                         | Match Quality                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/gimnasio/service.ts` (editar — nuevos métodos)                                                  | service                    | CRUD + transiciones de estado            | el propio archivo (`GymCatalogService`, ya completo, 624 líneas)                                                                                                                       | exact (extender la misma clase)                                                                          |
| `el-templo-api/src/modules/gimnasio/admin-routes.ts` (editar — nuevas rutas)                                               | route/controller           | request-response                         | el propio archivo (129 líneas)                                                                                                                                                         | exact                                                                                                    |
| `el-templo-api/src/modules/gimnasio/schemas.ts` (editar — filtros + copy + status)                                         | validation                 | request-response                         | el propio archivo (139 líneas)                                                                                                                                                         | exact                                                                                                    |
| `el-templo-api/src/modules/gimnasio/types.ts` (editar)                                                                     | model (tipos TS)           | —                                        | el propio archivo (114 líneas)                                                                                                                                                         | exact                                                                                                    |
| `el-templo-api/src/modules/platform/gym-catalog-status-service.ts` (nuevo)                                                 | service                    | transiciones de estado, scope plataforma | `el-templo-api/src/modules/platform/tenant-status-service.ts` (177 líneas, leído completo)                                                                                             | exact (misma forma: guard previo + `TRANSICIONES_VALIDAS` + `db.transaction` + auditoría en el mismo tx) |
| `el-templo-api/src/modules/platform/gym-catalog-promotion-service.ts` (nuevo, o mismo archivo que arriba)                  | service                    | CRUD (UPDATE de scope)                   | `el-templo-api/src/modules/platform/provisioning-service.ts` (transaccional, no releído en detalle — mismo criterio de separar "escribir" de "loguear" que `tenant-status-service.ts`) | role-match                                                                                               |
| `el-templo-api/src/modules/platform/gym-catalog-routes.ts` (nuevo)                                                         | route/controller           | request-response                         | `el-templo-api/src/modules/platform/tenant-routes.ts` (245 líneas, leído completo)                                                                                                     | exact                                                                                                    |
| `el-templo-api/src/modules/platform/schemas.ts` (editar — schemas de promote/status)                                       | validation                 | request-response                         | el propio archivo (patrón ya usado por `changeTenantStatusSchema`, no releído completo — mismo criterio)                                                                               | role-match                                                                                               |
| `el-templo-api/src/modules/platform/index.ts` (editar — export de las rutas nuevas)                                        | route (barrel)             | —                                        | el propio archivo (leído completo, 18 líneas)                                                                                                                                          | exact                                                                                                    |
| `el-templo-api/src/db/schema/gym-exercises.ts` (editar — columna `nombreCanonicoNormalizado`, si se elige esa vía de D-12) | model (schema Drizzle)     | —                                        | el propio archivo, columna `aliasNormalized` (líneas 218-219, ya leídas: "Minúsculas + trim, lo escribe la aplicación — nunca MySQL")                                                  | exact                                                                                                    |
| `el-templo-api/src/db/migrations/0218_*.sql` (nuevo, si D-12 usa columna espejo)                                           | migration                  | DDL                                      | `el-templo-api/src/db/migrations/0217_gym_catalog.sql` (99 líneas, leído completo)                                                                                                     | exact                                                                                                    |
| `el-templo-admin/src/pages/gimnasio/CatalogoPage.vue` (editar — buscador + filtros + acciones de estado)                   | component (page)           | request-response, paginado server-side   | el propio archivo (231 líneas, leído completo)                                                                                                                                         | exact                                                                                                    |
| `el-templo-admin/src/components/gimnasio/EjercicioFichaDialog.vue` (editar — diálogo de copia local D-03)                  | component (dialog form)    | request-response                         | el propio archivo, bloque `confirmDiscard`/`$q.dialog` (líneas 958-999, ya leídas)                                                                                                     | exact                                                                                                    |
| `el-templo-admin/src/components/gimnasio/EjercicioSelect.vue` (nuevo)                                                      | component (autocomplete)   | request-response                         | `el-templo-admin/src/components/ReferrerSelect.vue` (111 líneas, leído completo)                                                                                                       | exact                                                                                                    |
| `el-templo-admin/src/composables/useGymCatalogApi.ts` (editar — copyExercise, changeStatus, filtros del listado)           | hook/composable            | request-response                         | el propio archivo (237 líneas, leído completo)                                                                                                                                         | exact                                                                                                    |
| `el-templo-admin/src/pages/plataforma/GymCatalogPlatformPage.vue` (nuevo, o sección de página existente)                   | component (page)           | request-response, paginado               | `el-templo-admin/src/pages/plataforma/TenantsPage.vue` (patrón de tabla + botones de acción por fila condicionados por estado — grep líneas 47-99, no releído completo)                | role-match                                                                                               |
| `el-templo-admin/src/components/plataforma/PromoteExerciseDialog.vue` (nuevo)                                              | component (confirm dialog) | request-response                         | `el-templo-admin/src/components/plataforma/TenantStatusDialog.vue` (137 líneas, leído completo)                                                                                        | exact                                                                                                    |
| `el-templo-admin/src/components/plataforma/GymExerciseStatusDialog.vue` (nuevo)                                            | component (confirm dialog) | request-response                         | `el-templo-admin/src/components/plataforma/TenantStatusDialog.vue` (mismo analog, reusado)                                                                                             | exact                                                                                                    |
| `el-templo-api/test/gimnasio/catalog-copy.test.ts` (nuevo, CAT-03)                                                         | test                       | integration/HTTP                         | `el-templo-api/test/gimnasio/catalog-scope-isolation.test.ts` (418 líneas, leído completo)                                                                                             | exact                                                                                                    |
| `el-templo-api/test/gimnasio/catalog-status-transitions.test.ts` (nuevo, CAT-05 tenant-scope)                              | test                       | integration/HTTP                         | `el-templo-api/test/gimnasio/catalog-scope-isolation.test.ts`                                                                                                                          | exact                                                                                                    |
| `el-templo-api/test/gimnasio/catalog-search.test.ts` (nuevo, CAT-07)                                                       | test                       | integration/HTTP                         | `el-templo-api/test/gimnasio/catalog-scope-isolation.test.ts` (describe "listado — GET .../exercises")                                                                                 | exact                                                                                                    |
| `el-templo-api/test/platform/gym-catalog-promotion.test.ts` (nuevo, CAT-04 + CAT-05 global)                                | test                       | integration/HTTP                         | `el-templo-api/test/platform/tenant-status.test.ts` (leído parcial, 70 líneas — patrón de fixtures `seedGimnasioAprovisionado`/`getPlatformAuthToken`)                                 | exact                                                                                                    |
| `el-templo-api/test/tenancy/iso-03-cobertura-gimnasio.test.ts` (editar — `CASOS_BASELINE` sube de 4 a N)                   | test-gate                  | —                                        | el propio archivo (428 líneas, leído completo)                                                                                                                                         | exact                                                                                                    |
| `el-templo-api/test/tenant-manifest.ts` (editar — nuevas entradas `modulo: "gimnasio"`)                                    | test-config                | —                                        | ya editado en la 184 (rename mecánico), patrón de entrada ya establecido                                                                                                               | exact                                                                                                    |

---

## Pattern Assignments

### Grupo 1 — Copia local automática (CAT-03, D-01..D-04)

#### `el-templo-api/src/modules/gimnasio/service.ts` (editar)

**Analog:** el propio archivo — `createExercise` (líneas 239-330) y `updateExercise` (líneas 347-499), ya leídos completos arriba.

**Nuevo método `copyExerciseAsLocal(ctx, globalId, userId)`** — sigue el mismo esqueleto que `createExercise`, pero el INSERT copia TODOS los campos de la fila global leída (D-02: "se copia todo — ficha completa, aliases, y punteros a variantes y alternativas apuntando a los mismos ejercicios de destino"):

```typescript
// Esqueleto — mismo criterio transaccional que createExercise (líneas 269-317)
async copyExerciseAsLocal(ctx: TenantContext, globalId: number, userId: number): Promise<ExerciseDetail> {
  // 1. Leer la fila global CON tenantOrGlobalWhere + tenantId === null explícito
  //    (si no es global, error — D-03 solo aplica a editar un GLOBAL).
  // 2. D-06 de la 184 sigue vigente para el UPDATE directo; la copia es el
  //    reemplazo: nunca escribe sobre el global.
  // 3. D-04: status SIEMPRE 'publicado' al nacer la copia (no el default de
  //    columna) — mismo patrón que createExercise línea 289.
  // 4. copiedFromExerciseId = globalId (activa el sombreado D-01).
  // 5. INSERT de la fila + alias + variantes/alternativas (mismos ids de
  //    destino que el global, D-02) en una transacción — mismo bloque
  //    try/catch de ER_DUP_ENTRY que createExercise (líneas 318-323):
  //    si YA existe una copia (unique de scope), ConflictError.
}
```

**Bloqueo de re-copia:** el CONTEXT (Claude's Discretion) resuelve "re-editar un global con copia ya existente → redirigir a editar la copia". El service puede resolverlo con un `SELECT ... WHERE copiedFromExerciseId = globalId AND tenantScopeKey = ctx.tenantId` antes del INSERT, devolviendo la copia existente en vez de fallar — evita depender solo del `ER_DUP_ENTRY` para esta rama (UX: la copy del diálogo D-03 debe poder decir "ya tenés una copia, te llevamos a editarla" en vez de un error genérico).

#### `el-templo-api/src/modules/gimnasio/admin-routes.ts` (editar)

**Analog:** el propio archivo, ruta `POST /exercises` (líneas 93-109), ya leída completa.

**Nueva ruta `POST /exercises/:id/copy`:**

```typescript
fastify.post<{ Params: { id: number } }>(
  "/exercises/:id/copy",
  { schema: copyExerciseParamsSchema },
  async (request, reply) => {
    try {
      const ctx = assertTenant(request.scope, "gimnasio.copyExerciseAsLocal");
      const result = await service.copyExerciseAsLocal(
        ctx,
        request.params.id,
        request.user.userId,
      );
      return reply.code(201).send(result);
    } catch (err: unknown) {
      handleServiceError(
        err,
        reply,
        request.log,
        "copy global exercise to local",
      );
    }
  },
);
```

#### `el-templo-admin/src/components/gimnasio/EjercicioFichaDialog.vue` (editar)

**Analog:** el propio archivo, bloque `confirmDiscard()`/`attemptClose()` (líneas 958-999, ya leídas) — mismo patrón `$q.dialog({...}).onOk(...).onCancel(...)`.

**Diálogo de confirmación D-03** ("esto crea la versión de tu gimnasio; el ejercicio global no cambia"), disparado ANTES de entrar en modo edición sobre un global desde un gym:

```typescript
// Mismo patrón que confirmDiscard (líneas 965-984), invertido: se dispara
// AL ABRIR en modo edit sobre un ejercicio con scope==='global', antes de
// mostrar el form editable.
function confirmCopyLocal(exerciseId: number): void {
  $q.dialog({
    title: "Crear tu versión de este ejercicio",
    message:
      "Esto crea la versión de tu gimnasio; el ejercicio global no cambia.",
    ok: { label: "Crear mi versión", color: "primary" },
    cancel: { label: "Cancelar", flat: true },
    persistent: true,
  }).onOk(async () => {
    const copy = await catalogApi.copyExerciseAsLocal(exerciseId);
    // reabrir el diálogo en modo edit sobre el id de la COPIA, no del global
  });
}
```

**Sin analog exacto en el repo** para "diálogo previo a abrir OTRO diálogo con el resultado" — combinación nueva de `Dialog.create` + reapertura, seguir el UI-SPEC de esta fase como fuente primaria de copy y timing exactos.

---

### Grupo 2 — Promoción local→global (CAT-04, D-05..D-08)

#### `el-templo-api/src/modules/platform/gym-catalog-promotion-service.ts` (nuevo)

**Analog:** `el-templo-api/src/modules/platform/tenant-status-service.ts` (177 líneas, leído completo arriba) — mismo criterio transaccional y de separación "escribir"/"loguear".

**Patrón completo a portar** (constantes de código + errores de dominio + función pura con guard-antes-de-tx):

```typescript
// Mismo esqueleto que changeTenantStatus (líneas 114-176 de tenant-status-service.ts)
export class EjercicioNoEsPropioError extends Error {}   // 409, D-07: copied_from_exercise_id !== null
export class NombreGlobalDuplicadoError extends Error {} // 409, D-06: choque de nombre_canonico en scope global

export async function promoteExerciseToGlobal(
  db: Db,
  input: { exerciseId: number; actorPlatformUserId: number },
): Promise<PromoteResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(gymExercises).where(eq(gymExercises.id, input.exerciseId)).limit(1);
    if (!row) throw new NotFoundError(...);
    if (row.tenantId === null) throw new /* ya es global */;
    if (row.copiedFromExerciseId !== null) throw new EjercicioNoEsPropioError(...); // D-07

    // D-06: colisión de nombre contra otro global — SELECT dentro del mismo tx
    // por tenantScopeKey=0 + nombreCanonico, EXCLUYENDO la propia fila.
    const [colision] = await tx.select({ id: gymExercises.id }).from(gymExercises)
      .where(and(eq(gymExercises.tenantScopeKey, 0), eq(gymExercises.nombreCanonico, row.nombreCanonico)))
      .limit(1);
    if (colision) throw new NombreGlobalDuplicadoError(...);

    // D-08: SOLO cambia tenantId → NULL. id preservado, status intacto.
    await tx.update(gymExercises).set({ tenantId: null }).where(eq(gymExercises.id, input.exerciseId));

    await platformAudit.write(tx, { actorId: input.actorPlatformUserId, action: "gym_exercise_promoted", ... });
    return { exerciseId: input.exerciseId, previousTenantId: row.tenantId };
  });
}
```

**Nota crítica de tenancy:** este es el ÚNICO punto de todo el sistema donde una escritura setea `tenant_id = NULL` — el docblock de `service.ts` (líneas 9-12) lo prohíbe explícitamente para rutas de tenant; esta función vive en `modules/platform/`, fuera del contexto de tenant, mismo criterio que `tenant-status-service.ts` vive fuera del contexto de tenant para tocar `tenants.status`.

#### `el-templo-api/src/modules/platform/gym-catalog-routes.ts` (nuevo)

**Analog:** `el-templo-api/src/modules/platform/tenant-routes.ts`, ruta `PATCH /:id/status` (líneas 111-171, ya leída completa) — mismo patrón de traducir cada error de dominio a su código HTTP explícito, todo bajo `preHandler: fastify.requirePlatformAuth`.

```typescript
fastify.post<{ Params: { id: string } }>(
  "/:id/promote",
  { preHandler: fastify.requirePlatformAuth, schema: promoteExerciseSchema },
  async (request, reply) => {
    try {
      const result = await promoteExerciseToGlobal(fastify.db, {
        exerciseId: Number(request.params.id),
        actorPlatformUserId: request.platformUser.platformUserId, // NUNCA del body
      });
      request.log.info({ exerciseId: result.exerciseId }, "promoción de ejercicio a global");
      return reply.send(result);
    } catch (err: unknown) {
      if (err instanceof EjercicioNoEsPropioError) return reply.code(409).send({ code: "EXERCISE_IS_COPY", ... });
      if (err instanceof NombreGlobalDuplicadoError) return reply.code(409).send({ code: "GLOBAL_NAME_TAKEN", ... });
      throw err;
    }
  },
);
```

Sin `moduleScope`/`requireModule`/`attachCountryScope` — mismo criterio que `tenant-routes.ts` (docblock líneas 6-9): el super-owner no pertenece a ningún gimnasio.

#### `el-templo-admin/src/pages/plataforma/GymCatalogPlatformPage.vue` (nuevo)

**Analog:** `el-templo-admin/src/pages/plataforma/TenantsPage.vue` — tabla con botones de acción por fila condicionados por estado (`v-if="props.row.status === 'active'"`, líneas 47-99 vistas por grep). Listar ejercicios LOCALES de todos los tenants (D-05: "listar ejercicios locales de todos los tenants y promover desde ahí") con botón "Promover a global" que abre `PromoteExerciseDialog.vue`, deshabilitado/oculto si `copiedFromExerciseId !== null` (D-07, refuerzo de UX del bloqueo del backend).

#### `el-templo-admin/src/components/plataforma/PromoteExerciseDialog.vue` (nuevo)

**Analog:** `TenantStatusDialog.vue` (137 líneas, leído completo arriba) — copiar el esqueleto entero: `props { modelValue, exerciseId, exerciseName }`, `reason` no aplica acá (D-06 no pide motivo para promover, a diferencia de suspender/archivar tenant — verificar contra UI-SPEC si el planner decide agregarlo), `submitting` ref, `isValid` computed, `$q.notify` de éxito/error, `platformApi.post(...)`.

---

### Grupo 3 — Transiciones de estado (CAT-05, D-09..D-11)

**Dos superficies, mismo verbo de negocio, service distinto:**

#### 3a. Tenant-scope — `el-templo-api/src/modules/gimnasio/service.ts` (editar, D-10 primera mitad)

**Analog:** `updateExercise` (líneas 347-499) para el patrón de bloqueo D-06 (`existing.tenantId === null → ForbiddenError`) + el propio `TRANSICIONES_VALIDAS` de `tenant-status-service.ts` (líneas 95-99) como MOLDE de máquina de estados, portado al enum `borrador/publicado/desactivado`:

```typescript
// Mismo patrón de Record<Status, readonly Status[]> que TRANSICIONES_VALIDAS
const TRANSICIONES_VALIDAS: Record<GymExerciseStatus, readonly GymExerciseStatus[]> = {
  borrador: ["publicado"],
  publicado: ["desactivado"],
  desactivado: ["publicado"], // D-09: reactivar
};

async changeExerciseStatus(ctx: TenantContext, id: number, newStatus: GymExerciseStatus): Promise<ExerciseDetail> {
  // Mismo bloqueo D-06 que updateExercise (líneas 358-366): global → ForbiddenError,
  // ajeno → NotFoundError (nunca revela existencia).
  // D-11: NO toca copiedFromExerciseId ni ninguna fila relacionada — el
  // sombreado se recalcula en LECTURA (listExercises/getExercise ya filtran
  // por status != 'desactivado'), nunca en escritura.
}
```

#### 3b. Plataforma (globales) — `el-templo-api/src/modules/platform/gym-catalog-status-service.ts` (nuevo, D-10 segunda mitad)

**Analog exacto:** `tenant-status-service.ts` completo (177 líneas) — es prácticamente un copy-paste con `gymExercises`/`GymExerciseStatus` en vez de `tenants`/`TenantStatus`, MENOS el guard del tenant 1 (no aplica) y MENOS el caso `slugConfirm` (D-09 no pide confirmación por slug, solo por UI — ver `EjercicioFichaDialog`/panel). La auditoría (`platformAudit.write` dentro del mismo `tx`) SÍ se porta igual.

#### Frontend — botones de transición

**Analog:** `TenantsPage.vue`, botones condicionados por estado (grep líneas 47-99) + `TenantStatusDialog.vue`/`GymExerciseStatusDialog.vue` (mismo componente reusado, ver arriba) — tanto en `CatalogoPage.vue` (D-10, ejercicios propios) como en `GymCatalogPlatformPage.vue` (D-10, globales, super-owner). Filtro/toggle "ver desactivados" (Claude's Discretion del CONTEXT): agregar un `q-toggle` junto al buscador en `CatalogoPage.vue`, sin analog directo — extiende el patrón de filtros de la tabla existente.

---

### Grupo 4 — Buscador (CAT-07, D-12..D-15)

#### `el-templo-api/src/modules/gimnasio/service.ts` (editar `listExercises`)

**Analog:** el propio método `listExercises` (líneas 100-157, ya leído completo) + `el-templo-api/src/modules/shared/member-search.ts` (76 líneas, leído completo) para el patrón de condición LIKE multi-campo.

**D-12 matching:** substring normalizado sobre nombre canónico (columna espejo o normalización en query, Claude's Discretion) MÁS `gym_exercise_aliases.aliasNormalized` (columna YA normalizada por la 184, índice `idx_gym_exercise_aliases_scope_alias` YA existe — ver docblock de `gym-exercises.ts` líneas 40-44). Necesita un JOIN o subquery de aliases que la 184 no tenía.

**Normalización de acentos:** patrón `stripAccents` ya usado en el repo (`el-templo-api/src/db/import-members.ts:98-99`, `import-vigentes.ts:60-61`, `import-turnos.ts:83-84` — los tres idénticos):

```typescript
function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
```

Si D-12 se resuelve con columna espejo (`nombreCanonicoNormalizado`), esta función se llama en `createExercise`/`updateExercise` al escribir (mismo criterio que `aliasNormalized`: "lo escribe la aplicación, nunca MySQL" — MySQL no tiene una función NFD nativa para hacerlo generado). Si se resuelve con normalización en query, la misma función debe aplicarse tanto al término de búsqueda como a una expresión SQL equivalente sobre `nombreCanonico` — MySQL no tiene `NORMALIZE()`, así que la vía de columna espejo es la más simple y la más barata dado "catálogo chico" (nota de Claude's Discretion del CONTEXT).

**D-13 ranking:** relevancia determinista (nombre > alias, prefijo > substring, alfabético). Patrón de `ORDER BY` con `CASE WHEN` (sin precedente exacto en el repo — construir con `sql\`CASE WHEN ... THEN 0 WHEN ... THEN 1 ... END\``de Drizzle, mismo estilo que`escapeLike`/`sql`ya usados en`service.ts` líneas 118-121 y 600-601).

**D-14 filtros combinables en AND:** mismo patrón de `conditions: SQL[]` + `and(...conditions)` que YA usa `listExercises` (líneas 108-116) para `tenantOrGlobalWhere` + `ne(status, 'desactivado')` + `q` — agregar condiciones análogas para `muscleGroupPrimary` (categoría derivada — join contra el mapeo de `taxonomies.ts` o filtro en memoria post-query si el volumen lo permite), `muscleGroupFine`, `equipment` (JSON — `JSON_CONTAINS` o filtro aplicativo), `movementPattern`.

#### `el-templo-api/src/modules/gimnasio/schemas.ts` (editar)

**Analog:** el propio `listExercisesQuerySchema` (líneas 129-139, ya leído completo) — agregar `category`, `muscleGroupFine`, `equipment`, `movementPattern` como propiedades opcionales con `enum` sacado de `taxonomies.ts` (mismo criterio DRY que el resto del archivo, docblock líneas 10-12: "Los enum se construyen SIEMPRE desde taxonomies.ts").

#### `el-templo-admin/src/pages/gimnasio/CatalogoPage.vue` (editar)

**Analog:** el propio archivo — agregar `q-input` de búsqueda (debounce) + `q-select` de filtros por taxonomía junto al header (líneas 14-19), reusando `MUSCLE_GROUPS`/`EQUIPMENT`/`MOVEMENT_PATTERNS` ya importados de `gym-taxonomies.ts` (línea 118). `loadExercises` (líneas 195-207) ya tiene el esqueleto try/catch/log — extender el objeto de params con los filtros nuevos.

#### `el-templo-admin/src/components/gimnasio/EjercicioSelect.vue` (nuevo, D-15b)

**Analog exacto:** `ReferrerSelect.vue` (111 líneas, leído completo arriba) — puerto casi literal:

```vue
<!-- Mismo esqueleto: q-select use-input + input-debounce="300" + @filter -->
<q-select
  :model-value="selected"
  :options="options"
  option-value="id"
  option-label="displayLabel"
  use-input
  input-debounce="300"
  @update:model-value="onSelect"
  @filter="onSearch"
>
  <template #no-option>
    <q-item><q-item-section class="text-grey">No se encontró ningún ejercicio</q-item-section></q-item>
  </template>
</q-select>
```

```typescript
// onSearch: mismo patrón que ReferrerSelect (líneas 82-110), contra
// catalogApi.listExercises({ q: val, limit: 10, ...filtrosOpcionales })
// en vez de membersApi.searchMembers. Mínimo de caracteres: seguir el
// mismo umbral (2) salvo que el UI-SPEC de esta fase fije otro.
```

`defineExpose({ reset })` — mismo contrato que `ReferrerSelect.vue` línea 80, para que la 187 (rutinas) pueda limpiar la selección post-submit sin conocer el shape interno del componente (D-15: "listo para que la 187 lo enchufe sin duplicar lógica").

**Contrato reutilizable para la 187:** el componente NUNCA debe asumir un componente padre específico — mismo `v-model` de `number | null` que `ReferrerSelect.vue`, consumido contra el MISMO endpoint `GET /admin/gym/exercises` (D-15: "componente... contra el mismo endpoint").

#### `el-templo-admin/src/composables/useGymCatalogApi.ts` (editar)

**Analog:** el propio archivo (237 líneas, leído completo) — extender `ListGymExercisesParams` con los filtros de D-14 (mismo criterio de "espejo del API" del docblock, líneas 11-16) y agregar `copyExercise`/`changeExerciseStatus` siguiendo el MISMO bloque try/catch/finally/`isModuleDisabledError` que `createExercise`/`updateExercise` (líneas 187-221).

---

## Shared Patterns

### Autenticación + scope de tenant (backend, tenant-scope)

**Fuente:** `el-templo-api/src/modules/gimnasio/admin-routes.ts` líneas 45-58 (`onRequest` hook completo, ya leído) + `assertTenant` de `tenant.ts` (líneas 232-245, ya leído).
**Aplica a:** toda ruta nueva de `gimnasio/admin-routes.ts` (copia, transición tenant-scope, buscador extendido).

### Autenticación de plataforma (backend, super-owner)

**Fuente:** `el-templo-api/src/modules/platform/tenant-routes.ts` — `preHandler: fastify.requirePlatformAuth`, `request.platformUser.platformUserId` SIEMPRE como actor (líneas 93, 116-129, 176-189, ya leídas).
**Aplica a:** `gym-catalog-routes.ts` (promoción + transiciones de globales).

### Máquina de estados con auditoría en la misma transacción

**Fuente:** `el-templo-api/src/modules/platform/tenant-status-service.ts` completo (177 líneas) — `TRANSICIONES_VALIDAS: Record<Status, readonly Status[]>`, guard antes de abrir tx, `platformAudit.write(tx, ...)` DENTRO del mismo `db.transaction`.
**Aplica a:** `gym-catalog-status-service.ts` (CAT-05 globales) Y como molde conceptual (sin plataforma/auditoría) para `changeExerciseStatus` tenant-scope en `gimnasio/service.ts`.

### Filtro mixto de tenancy (lectura)

**Fuente:** `el-templo-api/src/modules/shared/tenant.ts`, función `tenantOrGlobalWhere` (líneas 189-194, ya leída, docblock completo líneas 156-188).
**Aplica a:** TODA lectura nueva de `gym_exercises`/`gym_exercise_aliases` en esta fase — buscador, copia (leer el global de origen), transiciones (leer antes de bloquear).

### Búsqueda multi-campo con LIKE + normalización de acentos

**Fuente:** `el-templo-api/src/modules/shared/member-search.ts` completo (76 líneas) para el patrón de condición SQL construida con `sql\`...\``de Drizzle +`import-members.ts:98-99`para`stripAccents`(NFD + regex de diacríticos).
**Aplica a:**`listExercises`extendido con`q` (D-12).

### Confirmación con `Dialog.create` / `$q.dialog`

**Fuente:** `EjercicioFichaDialog.vue` líneas 965-984 (`confirmDiscard`) + `TenantStatusDialog.vue` completo (137 líneas, formulario embebido en el dialog con `reason` + validación).
**Aplica a:** diálogo de copia local (D-03, sin campo de texto), diálogos de transición de estado tenant-scope y plataforma (D-09, D-10), diálogo de promoción (D-05).

### Composable API (frontend)

**Fuente:** `useGymCatalogApi.ts` completo (237 líneas) — `loading`/`error`/`moduleDisabled` refs, `extractError`, `throw err`, `finally`, `cleanup()` vacío.
**Aplica a:** toda extensión de `useGymCatalogApi.ts` + un composable nuevo `usePlatformGymCatalogApi.ts` si el planner decide separar el consumo de `/api/platform/*` (ver `platformApi` de `boot/platform-axios`, usado por `TenantStatusDialog.vue` línea 54).

### Autocomplete QSelect contra backend con debounce

**Fuente:** `ReferrerSelect.vue` completo (111 líneas).
**Aplica a:** `EjercicioSelect.vue` — puerto casi literal, ver Grupo 4 arriba.

### Tests de aislamiento por tenant (ISO)

**Fuente:** `el-templo-api/test/gimnasio/catalog-scope-isolation.test.ts` completo (418 líneas) — fixtures `seedSecondTenant`/`TENANT_TEMPLO`/`TENANT_DOS`, siembra por Drizzle directo del global (sin ruta de plataforma en la 184, YA HAY ruta en la 185 — el planner debe decidir si la 185 sigue sembrando por Drizzle directo o usa la nueva ruta de promoción para setup), `describe` con la clave `"<MÉTODO> <url>"` del manifiesto en el nombre, control positivo obligatorio junto al caso de aislamiento.
**Aplica a:** `catalog-copy.test.ts`, `catalog-status-transitions.test.ts`, `catalog-search.test.ts` — CADA ruta nueva necesita su caso acá, Y necesita subir `CASOS_BASELINE` en `iso-03-cobertura-gimnasio.test.ts` (docblock líneas 116-139, ya leído: "sube cuando se agrega una ruta CON su caso").

### Tests de máquina de estados contra la API real (plataforma)

**Fuente:** `el-templo-api/test/platform/tenant-status.test.ts` (70 líneas leídas de cabecera+imports) — fixtures `seedPlatformUser`/`getPlatformAuthToken`/`seedGimnasioAprovisionado`, aserciones de auditoría filtradas por `action` explícita (nunca conteo total), advertencia explícita de correr SOLO el archivo (`pnpm exec vitest run test/platform/gym-catalog-promotion.test.ts`), nunca la suite completa local.
**Aplica a:** `gym-catalog-promotion.test.ts` (D-06 colisión de nombre, D-07 copia no promovible, D-08 status preservado, transiciones de globales D-09/D-10).

---

## No Analog Found

| File                                                                                                          | Role      | Data Flow        | Reason                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | --------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diálogo previo a copia local, con reapertura del form sobre el id de la copia (D-03)                          | component | request-response | Combinación nueva: ningún componente del repo encadena un `Dialog.create` de confirmación con la reapertura de OTRO diálogo de edición sobre un id distinto al que abrió el flujo. El UI-SPEC de esta fase es la fuente primaria del timing exacto.                                                                         |
| Ranking con `ORDER BY CASE WHEN` (D-13: nombre > alias, prefijo > substring, alfabético)                      | transform | —                | Ningún query del repo ordena por relevancia compuesta multi-criterio hoy — los `ORDER BY` existentes son de un solo campo (`orderBy(gymExercises.nombreCanonico)` en `listExercises` actual). Construir con `sql` de Drizzle siguiendo el estilo ya usado en `service.ts` (líneas 118-121), sin precedente de forma exacta. |
| Filtro combinado JSON (`equipment` array) + taxonomía derivada (`category`) en AND con paginación server-side | transform | CRUD             | Ningún listado del repo filtra hoy una columna JSON array combinada con un campo derivado (no columna) en el mismo WHERE — decidir entre `JSON_CONTAINS` en SQL vs. filtro aplicativo post-query es una decisión de volumen (catálogo chico, ya señalada en el CONTEXT) sin precedente de código a copiar.                  |
| Toggle "ver desactivados" en el listado admin                                                                 | component | —                | Ningún `QTable` del admin tiene hoy un toggle de inclusión de filas normalmente ocultas — es contenido nuevo (Claude's Discretion del CONTEXT), construir con primitivas Quasar ya usadas sueltas (`q-toggle`) sin un ejemplo exacto que copiar.                                                                            |

## Metadata

**Analog search scope:** `el-templo-api/src/modules/gimnasio/`, `el-templo-api/src/modules/platform/`, `el-templo-api/src/modules/shared/`, `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/`, `el-templo-api/test/gimnasio/`, `el-templo-api/test/platform/`, `el-templo-api/test/tenancy/`, `el-templo-admin/src/pages/gimnasio/`, `el-templo-admin/src/pages/plataforma/`, `el-templo-admin/src/components/gimnasio/`, `el-templo-admin/src/components/plataforma/`, `el-templo-admin/src/composables/`, `el-templo-admin/src/constants/` — todos dentro del worktree `/home/franco/projects/et-182`. Doc 08 referenciado vía `git show origin/master:...` (no releído completo en esta pasada, ya mapeado en detalle por `184-PATTERNS.md`).
**Files scanned/read in full or targeted ranges:** ~20 archivos de código de `et-182` + `184-CONTEXT.md`/`184-PATTERNS.md` como referencia normativa.
**Pattern extraction date:** 2026-09-01
