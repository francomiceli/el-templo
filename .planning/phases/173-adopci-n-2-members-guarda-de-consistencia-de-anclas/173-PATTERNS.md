# Phase 173: Adopción 2 — `members` + guarda de consistencia de anclas — Mapa de patrones

**Mapeado:** 2026-08-04
**Base de lectura:** `origin/staging` (`git show origin/staging:<path>`) — **NO** el working tree ni `origin/master`.
`origin/master` no tiene la 172: su `TENANT_STRICT_MODULES` está vacío.
**Archivos analizados:** ~90 destinos (creación/modificación) agrupados en 10 grupos
**Analogías encontradas:** 9 de 10 grupos tienen gemelo de la 172 · 1 grupo sin analog (`tsconfig.test-check.json`)

---

## 0. Números REMEDIDOS (drift contra el CONTEXT)

El CONTEXT midió en `et-172`. Estos números se remidieron sobre `origin/staging` hoy.
**Tres divergencias, las tres son señal de planificación, no errores.**

| Dato                                                           | CONTEXT | Medido HOY en `origin/staging`       | Veredicto                                                                                                                                                                           |
| -------------------------------------------------------------- | ------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entradas de allowlist **por tabla del módulo**                 | 79      | **79** ✅                            | exacto (`users` 50, `member_profiles` 13, `user_status_history` 7, `user_branches` 4, `member_notes` 2, `user_sepa_details` 1, `member_logins` 1, `audit_log` 1)                    |
| Archivos que las contienen                                     | 52      | **52** ✅                            | exacto                                                                                                                                                                              |
| Entradas que **la definición §0.3 del doc 07 obliga a borrar** | 79      | **90** ⚠️                            | **+11.** Ver §0.1 — el criterio es tabla **O** archivo, no tabla sola.                                                                                                              |
| Rutas `tenant-scoped` de los 3 prefijos                        | 29      | **30** ⚠️                            | **+1:** `POST /api/admin/members/:userId/referrals` (`e1952606`, ya EN staging).                                                                                                    |
| Total del manifiesto                                           | 372     | **372 rutas / 224 tenant-scoped** ⚠️ | el header del archivo dice "223 tenant-scoped" — **quedó stale** al entrar `e1952606`. Confirmar si `iso-01-manifiesto.test.ts` tiene un baseline numérico que también quedó stale. |
| Sitios que reescriben `branchUpdatedAt`                        | 12      | **12** ✅                            | exacto, lista completa en §0.2                                                                                                                                                      |
| Escrituras de `user_branches`                                  | 4       | **4** ✅                             | exacto (`users/service.ts:186, 211, 324, 328`)                                                                                                                                      |
| Migraciones aplicadas                                          | 0197    | **0197 es la última en staging** ✅  | `0198` libre. Prod llega a 0196.                                                                                                                                                    |

### 0.1 ⚠️ La allowlist a borrar son **90**, no 79

El doc 07 §0 punto 3 define adoptado como:

> `tenant-lint-allowlist.json` no tiene **una sola** entrada con `file` bajo el módulo **ni** con `table` entre sus tablas strict.

Son **dos** criterios unidos por O. Las 79 son solo el criterio de tabla. El criterio de archivo suma 11 más:

| Tabla                    | Archivo                          |
| ------------------------ | -------------------------------- |
| `bookings`               | `src/modules/members/routes.ts`  |
| `branches`               | `src/modules/members/routes.ts`  |
| `attendance`             | `src/modules/members/service.ts` |
| `bookings`               | `src/modules/members/service.ts` |
| `branches`               | `src/modules/members/service.ts` |
| `completed_sessions`     | `src/modules/members/service.ts` |
| `referrals`              | `src/modules/members/service.ts` |
| `schedules`              | `src/modules/members/service.ts` |
| `subscription_plans`     | `src/modules/members/service.ts` |
| `subscription_schedules` | `src/modules/members/service.ts` |
| `subscriptions`          | `src/modules/members/service.ts` |

Total del módulo: `members/routes.ts` 5 entradas, `members/service.ts` 14 entradas (esos SON los "5 y 14" del CONTEXT: son totales de archivo, no de tabla del módulo).

**Consecuencia para el planner:** el objetivo del plan del switch es **450 → ≤360**, y hay que esperar **más de 90** — el piloto planeó 47 y borró 51 por tablas joineadas que el motor del lint cuenta como accesos propios (doc 07 §7 corrección 2). Y ojo: borrar esas 11 significa que `members/service.ts` migra también sus queries de `subscriptions`, `subscription_plans`, `schedules`, `bookings`, `attendance`, `completed_sessions`, `referrals` y `branches` — **eso sí está dentro del alcance** porque son queries de un archivo del módulo, y **no** contradice D-02 (D-02 protege los archivos AJENOS).

### 0.2 Los 12 sitios de `branchUpdatedAt` (D-05), con `file:line` verificado

| #   | `file:line`                                 | Forma                                   | Origen de la sede                        |
| --- | ------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| 1   | `src/modules/members/service.ts:727`        | `insert(users).values`                  | `input.branchId` (payload)               |
| 2   | `src/modules/members/service.ts:893`        | `insert(users).values`                  | payload (trial)                          |
| 3   | `src/modules/members/service.ts:976`        | `insert(users).values`                  | payload (minimal)                        |
| 4   | `src/modules/members/service.ts:1471`       | `updateData.branchUpdatedAt =`          | `input.branchId` (edición de ficha)      |
| 5   | `src/modules/subscriptions/service.ts:1669` | `update(users).set`                     | sede de la sub                           |
| 6   | `src/modules/subscriptions/service.ts:3595` | `update(users).set`                     | sede de la sub                           |
| 7   | `src/modules/subscriptions/service.ts:4981` | `update(users).set`                     | sede de la sub                           |
| 8   | `src/modules/users/service.ts:178`          | `update(users).set` (promoción a staff) | `input.branchId` (payload)               |
| 9   | `src/modules/users/service.ts:199`          | `insert(users).values` (alta staff)     | `input.branchId` (payload)               |
| 10  | `src/modules/auth/routes.ts:218`            | `insert(users).values`                  | sede elegida / default (**+ WR-01**)     |
| 11  | `src/modules/wellhub/service.ts:947`        | `update(users).set`                     | sede del gym de Wellhub                  |
| 12  | `src/jobs/reassign-multibranch.ts:292`      | `update(users).set` (cron)              | sede dominante por asistencia (**D-07**) |

Más 4 escrituras de `user_branches`, **las 4 en el mismo archivo**:
`src/modules/users/service.ts:186` (delete), `:211` (insert), `:324` (delete), `:328` (insert) — todas con `branchIds` que **vienen del payload**.

> Lectura para el planner: 10 de los 16 sitios están en 3 archivos (`members/service.ts`, `users/service.ts`, `subscriptions/service.ts`). El helper de D-05 se puede introducir en un plan y consumir en 3, no en 12.

### 0.3 Baselines a registrar ANTES de tocar una línea (doc 07 §1.2)

| Baseline                                        | Valor medido hoy                                                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entradas de allowlist                           | **450**                                                                                                                                                                                            |
| Manifiesto                                      | **372 rutas / 224 `tenant-scoped` / 141 `templo-module` / 7 `global` + `OPTIONS *`**                                                                                                               |
| `TENANT_STRICT_MODULES`                         | **1 entrada** (`finance`, 6 tablas)                                                                                                                                                                |
| Exenciones `tenant-safe` en `src/` + `scripts/` | 14 archivos las contienen (varios son el propio motor del lint / del sentinel). **Registrar la lista exacta**: si al cerrar hay una NUEVA dentro de `src/modules/members/`, alguien tomó un atajo. |
| `tsconfig.test-check.json`                      | **NO EXISTE en el repo** — ver §7.3                                                                                                                                                                |

---

## 1. Clasificación de archivos y analogía más cercana

| Destino (crear/modificar)                                            | Rol           | Flujo de datos         | Analogía más cercana                                                                                                   | Calidad                                                    |
| -------------------------------------------------------------------- | ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/scripts/snapshot-members-endpoints.ts` (NUEVO)                  | script CLI    | request-response/batch | `src/scripts/snapshot-finance-endpoints.ts`                                                                            | **exacta** (copiar cambiando 1 constante)                  |
| `src/scripts/snapshot-finance-endpoints.ts` (MOD, IN-02)             | script CLI    | batch                  | sí mismo, `:398-427`                                                                                                   | **exacta**                                                 |
| `src/modules/members/service.ts` (MOD, 23 métodos, 2.204 líneas)     | service       | CRUD                   | `src/modules/finance/cash-register-service.ts` + `transaction-service.ts`                                              | **exacta**                                                 |
| `src/modules/members/routes.ts` (MOD, 1.867 líneas)                  | route plugin  | request-response       | `src/modules/finance/coach-load-routes.ts`                                                                             | **exacta**                                                 |
| `src/modules/members/leads-routes.ts` (MOD)                          | route plugin  | request-response       | `src/modules/finance/coach-load-routes.ts` (versión chica)                                                             | **exacta**                                                 |
| `src/modules/users/service.ts` (MOD — staff + `user_branches`)       | service       | CRUD                   | `src/modules/finance/cash-register-service.ts`                                                                         | rol-match                                                  |
| 50 archivos ajenos (§3)                                              | mixto         | mixto                  | los 6 archivos ajenos que la 172 tocó con cirugía mínima                                                               | **exacta**                                                 |
| `src/modules/shared/branch-consistency.ts` (NUEVO, D-05)             | utility/guard | request-response       | `src/modules/finance/coach-load-routes.ts:293-321` (`resolveUserBranchId`)                                             | rol-match                                                  |
| `src/modules/shared/branch-access.ts` (MOD, D-14)                    | middleware    | request-response       | sí mismo + `src/modules/shared/country-scope.ts`                                                                       | **exacta**                                                 |
| `src/db/schema/branches.ts` (MOD — unique `(tenant_id, id)`)         | schema        | DDL                    | `uq_branches_tenant_code` en el mismo archivo `:62-69`                                                                 | **exacta**                                                 |
| `src/db/schema/users.ts` (MOD — FK compuesta)                        | schema        | DDL                    | `fk_users_tenant` (fase 166) + `tenant-column.ts`                                                                      | rol-match                                                  |
| `src/db/migrations/0198_*.sql` (NUEVO)                               | migration     | DDL                    | `0197_payment_method_direct_debit.sql` (hand-written)                                                                  | **exacta**                                                 |
| `src/jobs/reassign-multibranch.ts` (MOD, D-07)                       | job/cron      | batch                  | `src/jobs/notification-cron.ts` + `forEachActiveTenant`                                                                | rol-match                                                  |
| `src/jobs/notification-cron.ts`, `expire-lost-leads.ts` (MOD)        | job/cron      | batch                  | ídem                                                                                                                   | rol-match                                                  |
| 6 scripts CLI (§6)                                                   | script CLI    | batch/file-I/O         | `src/db/scripts/require-tenant.ts` + `scripts/seed-onboarding-aura.ts` + `src/scripts/backfill-historical-payments.ts` | **exacta**                                                 |
| `src/modules/auth/routes.ts` (MOD, D-12 / WR-01)                     | route plugin  | request-response       | `:152-200` del propio archivo (la resolución de `branchTenantId` ya está escrita)                                      | **exacta**                                                 |
| `src/modules/subscriptions/service.ts` (MOD, D-13/D-15 acotado)      | service       | CRUD                   | `cancelSubscription` `:2879` del propio archivo                                                                        | **exacta**                                                 |
| `test/fixtures/members-gimnasio-dos.ts` (NUEVO)                      | test fixture  | —                      | `test/fixtures/finance-gimnasio-dos.ts`                                                                                | **exacta**                                                 |
| `test/tenancy/iso-03-members-*.test.ts` (NUEVOS, ~3)                 | test          | request-response       | `test/tenancy/iso-03-finance-cajas.test.ts` (1.153 líneas)                                                             | **exacta**                                                 |
| `test/tenancy/iso-03-cobertura-members.test.ts` (NUEVO)              | test/gate     | file-I/O               | `test/tenancy/iso-03-cobertura.test.ts` (470 líneas)                                                                   | **exacta** (⚠️ ver §8.2 — el prefijo NO se copia tal cual) |
| `test/tenancy/iso-03-finance-coach-load.test.ts:1326` (MOD)          | test          | —                      | el propio `it` — es autodestructivo por diseño                                                                         | **exacta**                                                 |
| Endurecimiento de `test/` (`helpers.ts`, `setup.ts`, N `beforeEach`) | test infra    | —                      | los planes 172-13…172-16                                                                                               | rol-match                                                  |
| `tenant-lint-allowlist.json` (MOD — borrar 90)                       | config        | —                      | el borrado de las 51 de finance en 172-21                                                                              | **exacta**                                                 |
| `src/db/tenant-tables.ts` (MOD — entrada `members`)                  | config        | —                      | la entrada `finance` `:524-533`                                                                                        | **exacta**                                                 |
| `test/db/tenant-tables.test.ts` (MOD — gate de forma)                | test/gate     | —                      | `:379` (`it` "declara exactamente los módulos ya adoptados")                                                           | **exacta**                                                 |
| `tsconfig.test-check.json` (NUEVO)                                   | config        | —                      | **NO EXISTE ANALOG** — ver §7.3                                                                                        | **ninguna**                                                |

---

## 2. Patrones del módulo `members` — el idioma que hay que copiar

### 2.1 Punto de partida real: `members` NO está migrado (trampa (a) en vivo)

`src/modules/members/service.ts` tiene **3** referencias a tenancy en 2.204 líneas, y las 3 son de la 172:

`src/modules/members/service.ts:80-98`

```ts
  /**
   * List members with search, filters, and pagination.
   * …
   * Fase 172 (ADO-01): `ctx` es el PRIMER parámetro y llega desde
   * `assertTenant(request.scope, "members.list")`. Sólo scopea los DOS accesos a
   * `balances` de este método (el filtro `debtorOnly` y el agregado de deuda),
   * que son las únicas tablas strict de `finance` que toca. El resto de las
   * tablas del listado (`users`, `subscriptions`, `branches`, …) se migra en su
   * propia fase (D-07).
   */
  async listMembers(
    ctx: TenantContext,
    params: MemberListParams,
  ): Promise<{ … }> {
```

> **Este docblock es la trampa (a) escrita por el piloto y dirigida a esta fase.** `listMembers` **tiene `ctx`** y **no está migrado**: solo filtra `balances`. Regla del doc 07 §3.2: al migrarlo hay que **reescribir el docblock**, porque un docblock que dice "todavía no filtra" sobre un archivo ya migrado es peor que no tener docblock.
> Los otros **22** métodos públicos del service (`searchMembers`, `getMemberById`, `createMember`, `createTrialMember`, `createMinimalMember`, `convertFreemiumToTrial`, `updateLead`, `getLeadBranchId`, `updateMember`, `softDeleteMember`, `resetMemberPassword`, `checkDniUniqueness`, `checkDuplicates`, `updatePhoto`, `exportMembers`, `exportSepaMembers`, `getNotes`, `createNote`, `updateNote`, `deleteNote`, `getSessionLevelCounts`, + el privado `wasEverLead`) **no tienen `ctx` ni siquiera en la firma**.

### 2.2 Firma migrada — copiar de `cash-register-service.ts`

`src/modules/finance/cash-register-service.ts:505-525`

```ts
  async listActiveCostCenters(
    ctx: TenantContext,
    country: string | null,
    …
  ) {
    …
      .where(and(tenantWhere(schema.costCenters, ctx), ...conditions))
```

`src/modules/finance/cash-register-service.ts:623-637` (escritura)

```ts
  async createCostCenter(
    ctx: TenantContext,
    …
  ) {
    …
      // `tenantValues` estampa el gimnasio DESPUÉS del objeto, así que un
      // `tenantId` que viniera adentro no gana.
      .values(tenantValues(ctx, { name: trimmed, country }));
```

**Reglas lockeadas que estos dos ejemplos materializan:** `ctx` PRIMERO (antes del `tx` y de los ids); `tenantWhere` como primer término del `and(...)`; `tenantValues` después del spread. Prohibidos `!` y `?? 1` (criterio de cierre: `grep -nE "tenantId!|tenantId\s*\?\?"` sin líneas).

### 2.3 ⚠️ El filtro de una tabla joineada va en el `ON`, también en INNER (mordió 4×)

`src/modules/finance/cash-register-service.ts:446-465` — **el ejemplar de manual**, con el porqué escrito adentro:

```ts
      .from(schema.cashRegisters)
      .leftJoin(
        schema.branches,
        // El filtro de gimnasio de `branches` va en el ON y JAMÁS en el WHERE
        // (hallazgo 172-03): en el WHERE, `NULL = 1` es falso para las cajas
        // central/banco (branch_id NULL) y el LEFT se vuelve INNER — esas cajas
        // desaparecerían del listado de saldos en silencio, y el lint saldría
        // verde igual. `branches` no es tabla strict, pero se scopea igual
        // porque el país de la sucursal decide qué ve un no-owner.
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.cashRegisters.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.cashRegisters, ctx),
          eq(schema.cashRegisters.isActive, true),
        ),
      );
```

**Por qué esta fase es la que más lo va a pagar:** `users` es la tabla más joineada del sistema. Cada LEFT JOIN a `users` / `member_profiles` en analytics, campaigns, reports y scheduling es un candidato a borrar filas en silencio. El lint queda verde de las dos formas.

### 2.4 Las closures de rutas reciben `ctx` como primer parámetro (trampa (c))

`src/modules/finance/coach-load-routes.ts:288-321` — **y la query que este helper hace es sobre `users`, o sea que esta fase la vuelve a tocar**:

```ts
  // Fase 172 (ADO-01): `ctx` PRIMERO. El `userId` llega del body/params, así que
  // sin filtro un socio de OTRO gimnasio resolvía su sede y el cobro nacía con
  // ella (T-172-11-02). Con el filtro la fila ajena no matchea y cae en el
  // fallback "Templo Online" DEL PROPIO gimnasio …
  const resolveUserBranchId = async (
    ctx: TenantContext,
    userId: number,
  ): Promise<number> => {
    const [branchRow] = await fastify.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);
    if (branchRow?.branchId) return branchRow.branchId;
    const [virtualBranch] = await fastify.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      // La sede virtual es POR gimnasio: sin el filtro, el fallback devolvía la
      // "Templo Online" del primer gimnasio que la tuviera, no la del cobro.
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.name, "Templo Online"),
        ),
      )
      .limit(1);
```

> **La query más peligrosa del piloto fue la que busca por NOMBRE.** Con un solo tenant es invisible. Al inventariar `members/routes.ts` (§2.5) hay que barrer específicamente por búsquedas por `name` / `email` / `dni` sin `tenantWhere`.

`src/modules/finance/coach-load-routes.ts:478-480` — el idioma del borde:

```ts
// …un solo assertTenant deja un unico
const ctx = assertTenant(request.scope, "coach-load.pay-plan");
```

Etiqueta = `"<módulo>.<operación>"`. Para esta fase: `"members.list"`, `"members.create"`, `"members.update"`, `"members.export"`, `"leads.update"`, `"users.createStaff"`.

### 2.5 `members/routes.ts` hace queries DIRECTAS en los handlers

`grep -n "fastify.db"` sobre `src/modules/members/routes.ts` da queries en handlers en (al menos) las líneas **133, 545, 576, 638, 881, 914, 1194, 1310, 1377**, además de los 5 `assertTenant` ya existentes (`:491, 685, 1002, 1257`). Cada una es un statement que hay que migrar **inline** (§2.6). El archivo hoy importa `assertTenant` pero **no** `tenantWhere` (`:35`).

`src/modules/members/leads-routes.ts` es chico: 1 ruta (`PATCH /api/admin/leads/:userId`) y **cero** entradas de allowlist propias — pero delega en `memberService.updateLead`, que sí migra.

### 2.6 ⚠️ El gimnasio se nombra INLINE en el statement (mordió 5×)

Un `const conditions = [...]` de arriba **no cuenta**, ni siquiera si es un ternario de una línea. `cash-register-service.ts:749` lo dice explícito en un comentario del propio código:

```ts
// El `tenantWhere` va INLINE en la query y no como primer elemento de
```

Excepción reconocida por el doc 07 §4(b): un helper que devuelve `SQL[]` **puede** llevar el `tenantWhere` como primer elemento del array (`buildListConditions` de `transaction-service.ts`) — y entonces **no se duplica en el llamador**. Los dos candidatos de esta fase son los constructores de filtros de `listMembers` y `exportMembers`.

---

## 3. Cirugía mínima en los 50 archivos ajenos (D-02) — inventario medido

Solo se toca **la query sobre la tabla strict**. Nada más del archivo.

| Entradas | Archivo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Tablas                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 3        | `src/modules/attendance/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `member_profiles`, `user_branches`, `users`   |
| 3        | `src/modules/segmentation/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `member_logins`, `member_profiles`, `users`   |
| 2        | `src/jobs/notification-cron.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `member_profiles`, `users`                    |
| 2        | `src/modules/analytics/engagement-service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `member_profiles`, `users`                    |
| 2        | `src/modules/analytics/funnel-service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `user_status_history`, `users`                |
| 2        | `src/modules/analytics/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `member_profiles`, `users`                    |
| 2        | `src/modules/auth/routes.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `member_profiles`, `users`                    |
| 2        | `src/modules/campaigns/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `user_status_history`, `users`                |
| 2        | `src/modules/notifications/routes.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `member_profiles`, `users`                    |
| 2        | `src/modules/onboarding/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `member_profiles`, `users`                    |
| 2        | `src/modules/progression/routes.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `member_profiles`, `users`                    |
| 2        | `src/modules/ratings/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `user_branches`, `users`                      |
| 2        | `src/modules/scheduling/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `member_profiles`, `users`                    |
| 2        | `src/modules/scheduling/trials-service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `user_status_history`, `users`                |
| 2        | `src/modules/shared/country-scope.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `user_branches`, `users`                      |
| 2        | `src/modules/subscriptions/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `user_status_history`, `users`                |
| 2        | `src/modules/users/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `user_branches`, `users`                      |
| 2        | `src/modules/wellhub/service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `user_status_history`, `users`                |
| 2        | `src/db/import-members.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `member_notes`, `users`                       |
| 1        | `src/db/import-fecha-ingreso.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `users`                                       |
| 1        | `src/db/import-turnos.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `users`                                       |
| 1        | `src/db/import-vigentes.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `users`                                       |
| 1        | `src/db/seed-staging.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `users`                                       |
| 1        | `src/jobs/expire-lost-leads.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `users`                                       |
| 1        | `src/jobs/reassign-multibranch.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `users`                                       |
| 1 c/u    | `admin/service.ts`, `analytics/advanced-finance-service.ts`, `analytics/frequency-service.ts`, `analytics/member-flows-service.ts`, `bar-challenge/service.ts`, `check-ins/admin-service.ts`, `goal-plans/routes.ts`, `goal-plans/service.ts`, `improvement-proposals/service.ts`, `notifications/service.ts`, `onboarding/routes.ts`, `programs/enrollment-service.ts`, `programs/service.ts`, `referrals/service.ts`, `reports/service.ts`, `scheduling/booking-service.ts`, `scheduling/routes.ts`, `sessions/routes.ts`, `shared/covered-until.ts`, `shared/member-search.ts`, `streaks/service.ts`, `tree-progress/service.ts`, `scripts/backfill-historical-payments.ts`, `scripts/backfill-referral-codes.ts` | `users` (salvo `streaks` → `member_profiles`) |
| 1        | `src/modules/shared/audit-log.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `audit_log`                                   |

**Dos anomalías que merecen su propio plan chico:**

- `src/modules/shared/member-search.ts` y `src/modules/shared/covered-until.ts` son **helpers compartidos** — migrarlos cambia la firma para todos sus llamadores. Son el equivalente de `buildOutstandingScope` del piloto: candidatos a "scope único que estampa el `tenantWhere`" (doc 07 §4(b)).
- `src/modules/shared/audit-log.ts` es la ÚNICA entrada de `audit_log`, y la escribe **todo el sistema**. Si `audit_log` entra a strict (D-01 lo dice), esa función es un cuello de botella de firmas: `ctx` primero, y el compilador va a nombrar todos los call sites de un saque.

---

## 4. ADO-07 — el helper de anclas y la migración 0198

### 4.1 El estado hoy: el payload elige la sede, nadie verifica el gimnasio

`src/modules/users/service.ts:169-213` (los sitios #8, #9 y 2 de las 4 escrituras de `user_branches`):

```ts
        await tx
          .update(schema.users)
          .set({
            …
            branchId: input.branchId,          // ← del payload, sin validar gimnasio
            branchUpdatedAt: new Date(),
            branchSource: "manual" as const,
            country,
          })
          .where(eq(schema.users.id, existing.id));   // ← sin tenantWhere
        …
        await tx
          .delete(schema.userBranches)
          .where(eq(schema.userBranches.userId, userId));   // ← sin tenantWhere
      } else {
        const [result] = await tx
          .insert(schema.users)
          .values({ … branchId: input.branchId … })   // ← sin tenantValues
      …
      if (branchIds.length > 0) {
        await tx
          .insert(schema.userBranches)
          .values(branchIds.map((bid) => ({ userId, branchId: bid })));  // ← sin tenantValues
      }
```

### 4.2 Forma del helper (Claude's Discretion — la analogía dice "resolvedor")

El único analog vivo de "resolver una sede validada por gimnasio" es `resolveUserBranchId` de §2.4: **resuelve leyendo con `tenantWhere` y deja que la fila ajena simplemente no matchee**. Ese comportamiento es exactamente lo que D-06 pide (404 / sede inexistente, cero 403).

Contrastar con `canAccessBranch` (`src/modules/shared/branch-access.ts:76-95`), que hoy hace lo opuesto — lee `branches` **sin ningún filtro**:

```ts
export async function canAccessBranch(
  scope: CountryScope,
  branchId: number,
  db: MySql2Database<typeof schema>,
): Promise<boolean> {
  // Single SELECT — branch row carries the data needed for all rules.
  const [branch] = await db
    .select({ id: …, country: …, isVirtual: … })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))   // ← sin tenantWhere
    .limit(1);
  …
  if (branch.isVirtual) return true;           // ⚠️ Regla 1: una sede virtual de OTRO gimnasio
                                               //    da true HOY, antes de mirar el país
  …
  if (scope.role === "admin" || scope.role === "gestion") {
    return scope.country !== null && branch.country === scope.country;   // ← D-14: decide por PAÍS
  }
```

**D-14 en concreto:** la Regla 1 (`isVirtual → true`) es hoy un bypass cross-tenant, y la Regla 3 decide por país. El doc 07 §5 nombra al país como _"el aislador alternativo que nadie nombra"_: mientras siga decidiendo, la batería puede dar verde sin ejercer la tenancy. El cambio mínimo es un `tenantWhere(schema.branches, ctx)` en ese SELECT (la sede ajena deja de existir → `!branch` → `false`), **antes** de tocar las reglas.

⚠️ **Trampa de firma:** `canAccessBranch(scope, branchId, db)` recibe `CountryScope`, que es estructuralmente compatible con `TenantContext` (`shared/tenant.ts:97-107` lo dice explícito: _"`{ tenantId }` plano a propósito: `CountryScope` lo satisface estructuralmente"_), **pero su `tenantId` es `number | null`**. Hay que pasar por `assertTenant` o el filtro no compila — y esa fricción es la mitigación, no un obstáculo.

### 4.3 La migración 0198 — schema

`src/db/schema/branches.ts:62-69` (lo que ya hay):

```ts
  (table) => [
    …
    index("idx_branches_tenant_id").on(table.tenantId),
    …
    uniqueIndex("uq_branches_tenant_code").on(table.tenantId, table.code),
```

Falta `uniqueIndex("uq_branches_tenant_id_id").on(table.tenantId, table.id)` para que `users(tenant_id, branch_id)` pueda referenciarla.

Idioma del `.sql` hand-written a copiar — `src/db/migrations/0197_payment_method_direct_debit.sql`: prosa larga arriba (QUÉ ARREGLA / POR QUÉ / ALCANCE), **sin un solo `;` en los comentarios**, y el DDL al final. Aplicar `pnpm db:migrate` (nunca `drizzle-kit migrate`), y el `.sql` se commitea junto al schema.

⚠️ **Precondición del ALTER (D-18):** verificar 0 divergencias `user.tenant_id != branch.tenant_id` antes del ALTER. Hoy es imposible que las haya (todo es gimnasio 1), pero la verificación tiene que quedar escrita — es lo que va a fallar el día del segundo gimnasio.

### 4.4 El cron (D-07) — trampa (a) en su forma más pura

`src/jobs/reassign-multibranch.ts:110-125` ya barre por gimnasio:

```ts
  await forEachActiveTenant(db, log, "reassign-multibranch", async (ctx) => {
    const r = await runReassignMultibranchForTenant(db, ctx, opts);
```

…y `runReassignMultibranchForTenant(db, ctx, opts)` **recibe `ctx` y no lo usa en NINGUNA de sus 4 queries**:

```ts
  // 1. Candidatos
  const candidateRows = await db.selectDistinct({ … }).from(schema.subscriptions)
    .innerJoin(schema.subscriptionPlans, eq(…))
    .where(and(eq(schema.subscriptions.status, "active"),
               eq(schema.subscriptionPlans.multiBranch, true)));   // ← sin tenant

  // 2. Estado actual
  const members = await db.select({ … }).from(schema.users)
    .where(inArray(schema.users.id, candidateIds));                // ← sin tenant

  // 3. Mapa de sedes → país
  const branchRows = await db.select({ … }).from(schema.branches); // ← TODAS las sedes de TODOS los gimnasios
```

y el UPDATE (`:287-296`) está en un helper que **ni siquiera recibe `ctx`**:

```ts
async function reassignMemberBranch(
  db: MySql2Database<typeof schema>,
  memberId: number,
  branchId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ branchId, branchUpdatedAt: new Date(), branchSource: "auto" })
      .where(eq(schema.users.id, memberId));
```

**El único ejemplar bueno del archivo es el log** (`:130-136`), que ya sigue la regla del `tenantId` como campo estructurado y jamás interpolado:

```ts
log.info(
  { tenantId: ctx.tenantId, dryRun },
  "Recategorización multisucursal para un gimnasio",
);
```

D-07 pide: sedes candidatas por `tenantWhere`, **y además** el UPDATE por el helper de §4.2 — si la sede no es del gimnasio, saltea al socio, lo loguea con `tenantId` estructurado y **sigue** (nunca aborta el barrido). Test SC3 análogo al idioma de `test/tenancy/con-04-crons-per-tenant.test.ts` (Tests 1-5, `describe("criterio 3 — el cuerpo del cron corre una vez por gimnasio ACTIVO")`).

---

## 5. Deudas heredadas de la 172 (D-12 / D-13 / D-15) — todas con `file:line`

### 5.1 WR-01 (D-12) — el `tenantId` ya está resuelto tres líneas arriba

`src/modules/auth/routes.ts`: `branchTenantId` se declara en `:152`, se asigna en `:167` (sede elegida) y `:182` (sede default), y `:191` tiene el guard fail-closed con el comentario correcto (_"un gimnasio no resoluble es DENY, nunca un default numérico al tenant 1"_). Y después:

```ts
      const result = await fastify.db.insert(users).values({   // :212
        email,
        passwordHash,
        branchId,
        branchUpdatedAt: new Date(),                            // :218 — sitio #10 de §0.2
        …
        status: "freemium" as const,
      });                                                       // ← sin tenantId, sin tenantValues
```

Prueba de que el valor está a mano: `:288` ya lo usa para otra cosa — `const ctx: TenantContext = { tenantId: branchTenantId };`. **Es la opción A del review: una línea.** Más el test dirigido de D-12 (sede del gimnasio 2 → el usuario nace en el gimnasio 2 y el promo se aplica), **con evidencia leída de la base**, no del status.

Analog canónico de la forma "ruta pública sin `request.scope`": doc 07 §4(f) — el `id` de la sede sale de la **fila leída**, no del número del body.

### 5.2 WR-02 (D-15) — el `tenantWhere` que falta va en el `ON`

`src/modules/subscriptions/service.ts:2859-2882` (guard `SUB_HAS_ACTIVE_TRANSACTIONS`):

```ts
      const activeLinks = await tx
        .select({
          txId: schema.financialTransactions.id,
          amount: schema.financialTransactions.amount,        // ← se serializa en el body del 409
          currency: schema.financialTransactions.currency,    // ← idem
        })
        .from(schema.transactionLinks)
        .innerJoin(
          schema.financialTransactions,
          eq(
            schema.transactionLinks.transactionId,
            schema.financialTransactions.id,
          ),                                    // ← ⚠️ falta tenantWhere(financialTransactions, ctx) ACÁ
        )
        .where(
          and(
            tenantWhere(schema.transactionLinks, ctx),   // ← solo UNA de las dos tablas strict
            …
```

Es el caso de manual de la trampa (h): **el sentinel da verde porque la query nombra `tenant_id` en algún lado**; la lente por-tabla del lint es la que lo ve. Y los campos de la tabla NO filtrada terminan en el cuerpo del 409.

### 5.3 D-13 — `getMemberSubscription` no tiene `ctx` ni en la firma

`src/modules/subscriptions/service.ts:919-921`

```ts
  async getMemberSubscription(
    userId: number,
  ): Promise<SubscriptionDetail | null> {
```

Usada por `/api/admin/finance/coach-load/autocompletar/:userId`. Y `assignPlan` (`:1253`) inserta en `:1592` `tx.insert(schema.subscriptions).values({…})` **sin `tenantValues`** (hay 5 inserts a `subscriptions` en el archivo: `:1592, :3434, :3876, :4333, :4587` — solo el de `:624` usa `tenantValues`). **Ojo:** D-13 acota el alcance a estos dos; el resto de `subscriptions` es de la 174.

### 5.4 El ancla autodestructiva que hay que desmarcar

`test/tenancy/iso-03-finance-coach-load.test.ts:1302-1343` — el comentario nombra a esta fase por número y el `it` afirma **404 + "Concepto enlazado no existe"**:

```ts
  // ⚠️⚠️ LIMITACION CONOCIDA DE LA ADOPCION — DUEÑO: FASE 173 ⚠️⚠️
  // … `assignPlan` inserta la fila de `subscriptions` SIN `tenantValues`
  // (src/modules/subscriptions/service.ts, ~L1592) …
  // El dia que la fase 173 estampe el gimnasio, el rechazo desaparece, este `it` se
  // pone en ROJO y quien lo arregle tiene que convertirlo en el control positivo
  // que hoy no se puede escribir (201 + sub y charge en el gimnasio 2).
  it("limitacion conocida (dueño: fase 173): con recursos PROPIOS el alta se corta en el charge, sin escribir nada", async () => {
    …
    ).toBe(404);
    …
    ).toContain("Concepto enlazado no existe");
```

**Al arreglar D-13 este `it` se pone rojo y hay que convertirlo en el control positivo** (201 + `tenant_id = TENANT_DOS` en la sub y en el charge) y **borrar la nota**. El propio mensaje de error del `expect` da la instrucción.

### 5.5 IN-02 (D-15) — dos `break` sin marcar el truncado

`src/scripts/snapshot-finance-endpoints.ts:398-421`:

```ts
  let truncado = false;
  while (filas.length < total) {
    if (pagina >= MAX_PAGINAS) { truncado = true; … break; }     // ✅ marca
    …
    if (siguiente.status !== 200) { return { …, truncado: true, … }; }  // ✅ marca
    const cuerpo = siguiente.body;
    if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.rows)) break;  // ❌ :419 — NO marca
    if (cuerpo.rows.length === 0) break;                          // ❌ :420 — NO marca
    filas.push(...cuerpo.rows);
  }
```

Fix: los dos setean `truncado = true` **si** `filas.length < total`. Sin esto el `antes.json` de esta fase puede ser parcial y el diff compararía contra una base incompleta **en silencio** — sobre datos de socios, no de plata.

---

## 6. Scripts CLI (D-03) — receta completa, exenciones CERO

**Analog:** `src/db/scripts/require-tenant.ts` (docblock canónico) + `scripts/seed-onboarding-aura.ts` (ejemplar) + `src/scripts/backfill-historical-payments.ts` (el retrofit que hizo la 172).

Contrato copiable (`require-tenant.ts`, docblock de cabecera):

````ts
 * ```ts
 * const { db, connection } = await createSingleConnection();
 * const ctx = await requireTenant(queryFnFromConnection(connection));
 * // ...recién ahora, cualquier query:
 * await db.insert(tabla).values(tenantValues(ctx, { ... }));
 * ...
 * main().catch((err: unknown) => failTenantArg(err, "mi-script"));
 * ```
````

Reglas que trae el helper y que NO hay que reinventar:

- Exit **2** = error de USO (flag ausente / id inválido / gimnasio inexistente). Exit **1** = datos. Exit **0** = OK.
- Verifica contra la DB que el gimnasio exista → un typo corta **antes** de escribir.
- Un gimnasio no `active` **AVISA por stderr y sigue** (D-07 de la 169: el CLI es tooling de operador). _"Que nadie 'unifique' esto después con el criterio de los crons: la diferencia es la decisión, no un olvido."_
- `console.*` está permitido en scripts CLI (excepción explícita a la regla de logging del CLAUDE.md).

**Los 6 destinos:** `src/db/import-members.ts`, `src/db/import-fecha-ingreso.ts`, `src/db/import-turnos.ts`, `src/db/import-vigentes.ts`, `src/db/seed-staging.ts`, `src/scripts/backfill-referral-codes.ts`.
**D-03 es explícito: cero exenciones `tenant-safe` nuevas por esta vía.** El baseline de exenciones (§0.3) es lo que lo verifica.

---

## 7. Endurecimiento de `test/` — presupuestar como bloque propio

Doc 07 §7: **entre un cuarto y un tercio del trabajo**, un plan de endurecimiento cada 3-4 de migración. Con `users` strict el impacto es **mayor** que en el piloto (finance tocaba 6 tablas de nicho; `users` la toca todo `beforeEach` que cree un socio).

### 7.1 La regla de decisión (doc 07 §4(d))

> Si el statement lee o borra **a propósito** de todos los gimnasios → **exención** con motivo. Si se puede acotar sin cambiar lo que el test prueba → **filtro**.

- `cleanAllTestData` (`test/helpers.ts`) → **exención**, y va **ADENTRO DEL SQL**, entre el verbo y el `FROM`:
  `DELETE /* tenant-safe: limpieza global de la base de test (todos los gimnasios) */ FROM …`
  Es el **único** canal que el sentinel lee. Una entrada de allowlist **no calla** un throw de runtime: son dos canales distintos.
- `DELETE` de conveniencia en `beforeEach` → **filtro** `WHERE tenant_id = ?` parametrizado (el piloto acotó 34 sitios en un plan, con **0** exenciones).
- Lecturas de **evidencia** (`tenantDeLaFila`) → **exención**: leer el `tenant_id` de la fila **es** la aserción.
- Statements sobre tablas que **todavía no** son strict → **no se anotan**. Anotarlas "por las dudas" apaga el tripwire del que migre ese módulo.

### 7.2 Los 3 puntos ciegos del inventario por grep

1. `.from(schema.X)` de Drizzle — el que todo el mundo busca.
2. **SQL crudo con backticks**: `conn.query("DELETE FROM \`users\`")` — 15 sitios en el piloto que ninguna regex de Drizzle vio y que el sentinel cazó al primer intento (50 tests rojos de 61).
3. **Nombre de tabla que no está en el fuente** (`sql.raw(tabla)`) — se clasifica a mano contra el `.sql` que ejecuta.

### 7.3 ⚠️ `tsconfig.test-check.json` NO EXISTE en el repo

Verificado: `git ls-tree -r origin/staging | grep tsconfig` devuelve solo los 5 `tsconfig.json` de las apps. El piloto lo creó **ad hoc en el worktree y nunca lo commiteó**.

Consecuencia: `pnpm exec tsc --noEmit` **no typechequea `test/`** (`tsconfig.json` tiene `include: ["src/**/*"]`), así que un call site de test desactualizado no da rojo hasta que el test corre. Hace falta un `tsconfig.test-check.json` **dentro de `el-templo-api/`** y con `rootDir: "."` — con el `rootDir` heredado el compilador tira `TS6059` por cada archivo de test, deja de chequearlos y devuelve un **`TS2554: 0` falso**.

**Sin analog en el repo.** Recomendación al planner: esta vez **commitearlo**, porque 174 y 175 lo van a necesitar igual y redescubrirlo cuesta un plan.

### 7.4 Mocks posicionales — antes de cambiar CUALQUIER firma

```bash
grep -rn "\.<metodo> = async" test/
```

Un mock `(tx, row, links, sign)` con el `ctx` agregado adelante **rompe en silencio**: el test sigue verde probando nada. Con 23 métodos de `members/service.ts` cambiando de firma, este barrido no es opcional.

### 7.5 Notas de corrida

- **`--no-file-parallelism` es MÁS RÁPIDO** (una base MySQL por worker cuesta ~96 s; con un worker se paga una sola vez).
- Correr `prettier --write` **ANTES** de la corrida larga, no después.
- **Agregar archivos de test re-baraja qué archivos comparten base por worker en CI**: una bomba FK latente puede explotar en un archivo que la fase no tocó (`ER_ROW_IS_REFERENCED_2`). **No es el sentinel** — mirar el patrón de limpieza (conexión única + `FOREIGN_KEY_CHECKS = 0`).
- **El throw llega envuelto en `DrizzleQueryError.cause`.** `expect(...).rejects.toBeInstanceOf(TenantSentinelError)` **no entra nunca**. `TenantSentinelError` lleva `sql` y `tables` como campos propios.

---

## 8. La batería ISO-03 y su gate de cobertura

### 8.1 Idioma de la batería — `test/tenancy/iso-03-finance-cajas.test.ts` (1.153 líneas, copiable)

**Ciclo de vida** (`:132-162`) — el orden es obligado, no cosmético:

```ts
beforeEach(async () => {
  await cleanAllTestData(app);
  await limpiarFinanzasDeLaBateria(app); // ANTES de seedSecondTenant: ese arranca borrando
  gym2 = await seedSecondTenant(app); //   la fila de `tenants` del gimnasio 2
  templo = await sembrarFinanzasTemplo(app);
  dos = await sembrarFinanzasGimnasioDos(app, gym2);
});

afterAll(async () => {
  // obligatorio: la base la comparten los archivos del worker (isolate: false)
  await cleanAllTestData(app);
  await limpiarFinanzasDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});
```

**Las 4 precondiciones** (`:242-310`), cada una mata un falso verde distinto — y la primera es la que D-14 vuelve crítica:

```ts
describe("precondiciones de la bateria", () => {
  it("las dos sedes son del MISMO pais, asi que el aislamiento no lo puede estar dando el country scope", async () => {
    // …Si la sede del gimnasio 2 fuera ES y la de El Templo AR, TODOS los casos
    // de aislamiento de abajo pasarian en verde sin que la capa de tenancy
    // hiciera absolutamente nada.
    …).toEqual(["AR", "AR"]);
```

| Precondición                           | Falso verde que mata                                                     |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Las dos sedes comparten **país**       | el aislamiento lo daría el country scope y la tenancy no se ejerce       |
| El gimnasio 1 tiene recursos vivos     | sin recurso ajeno, "no ve nada ajeno" es trivialmente cierto             |
| Las filas del gimnasio 2 nacieron ahí  | si la siembra cayera en el `DEFAULT 1`, los controles miran datos ajenos |
| Los valores sembrados son irrepetibles | un total contaminado puede dar el mismo número que el correcto           |

**Dos `it` por `describe`** — aislamiento + control positivo (`:365-405` es el par canónico), y los mensajes de rojo **nombran el archivo y el método a mirar**:

```ts
function porQueImportaElListado(ruta: string, filaId: number): string {
  return (
    `${ruta} le devolvio al staff del gimnasio ${TENANT_DOS} la fila ${filaId}, que NO es suya. ` +
    `Eso es una fuga de datos entre gimnasios (T-172-17-01): el listado perdio su ` +
    `\`tenantWhere(tabla, ctx)\`, o el \`ctx\` no salio de \`assertTenant(request.scope, …)\`. ` +
    `Empezar por el metodo que sirve esa ruta en src/modules/finance/cash-register-service.ts …`
  );
}
```

**La evidencia se lee de la BASE** (`:225-236`), y el barrido se hace sobre **cada fila devuelta**, no sobre "no aparece el id que sembré":

```ts
async function afirmarQueTodasSonDelGimnasioDos(ruta, tabla, ids) {
  for (const id of ids) {
    expect(
      await tenantDeLaFila(app, tabla, id),
      porQueImportaElListado(ruta, id),
    ).toBe(TENANT_DOS);
  }
}
```

**Reglas de aserción que salieron de casos reales** (doc 07 §5, todas aplican a members):

- El **`total`** de un listado paginado se afirma **aparte** de las filas: son dos queries. `GET /api/admin/members` devuelve `{ members, total, totalDebtByCurrency }` → **tres** aserciones, no una.
- Los **exports** se parsean con `exceljs` y se afirman por contenido, columnas por índice fijo (`iso-03-finance-cajas.test.ts:459-470`). `/members/export` y `/members/export-sepa` son las rutas que más datos entregan de una vez.
- Un **agregado** se afirma con números exactos sobre valores irrepetibles y de otro orden de magnitud. `totalDebtByCurrency` es el agregado de members.
- **El MOTIVO del rechazo se afirma junto con el status** (`:1349` lo hace con `.toContain("Concepto enlazado no existe")`).
- **Cero `403` esperados** — el criterio de aceptación es un `grep -c` de esa aserción dando CERO. ⚠️ Y **no lo "aclares" escribiendo el número en un comentario**: un gate por substring no distingue código de comentario (el piloto lo pagó en `test/setup.ts`). Describilo en castellano.

**Rol mínimo real (D-10):** el actor de cada `describe` es el rol **más barato que la ruta acepta y que el fixture puede crear**, explícito en cada call site. En el piloto, las 7 rutas con token de **coach** destaparon los 2 hallazgos de seguridad — ninguna de las 27 anteriores los podía ver. Para members: `/api/admin/members/search`, `/members/check-dni` y `/members/check-duplicates` casi seguro aceptan `recepcion`/`coach`; `seedSecondTenant` (`test/fixtures/second-tenant.ts`) provee **`adminToken`** y **`coachToken`**, `branchId`, `planId` y **2 socios con token** (`SegundoGimnasio` `:155-166`, `TENANT_DOS = 90671`, `TENANT_TEMPLO = 1`).

**Fixture nuevo:** `test/fixtures/members-gimnasio-dos.ts`, gemelo de `test/fixtures/finance-gimnasio-dos.ts` (`tenantDeLaFila`, `campoDeLaFila`, `sembrar…`, `limpiar…`, constantes irrepetibles). Los 2 socios que `seedSecondTenant` ya crea alcanzan para "el otro socio del MISMO gimnasio tampoco", pero la ficha necesita además notas, perfil, historial de estado y (para `export-sepa`) `user_sepa_details`.

**Mutation testing como cierre**, y **hay que leer también los negativos**: apuntarle a un solo `tenantWhere` y no ver ningún rojo **no** significa que el test no muerda — puede haber dos filtros independientes sosteniendo el aislamiento (le pasó al piloto con `buildListConditions`).

### 8.2 ⚠️ El gate de cobertura: la plantilla **NO** se copia cambiando una constante

`test/tenancy/iso-03-cobertura.test.ts` (470 líneas) es la plantilla, y sus 5 piezas son:

```ts
const PREFIJO_FINANCE = "/api/admin/finance/";        // :118
export const EXCEPCIONES_NOMBRADAS: Readonly<Record<string, string>> = { … };  // :136
const CASOS_BASELINE = 38;                             // :172
const ARCHIVOS_BATERIA = [ … ] as const;               // :175
export function sinComentarios(fuente: string): string { … }        // :198 — borra comentarios ANTES de buscar
export function clavesDeLosDescribe(fuente: string): string[] { … } // :218 — .skip/.todo NO cuentan
const RUTAS_FINANCE = Object.entries(TENANT_MANIFEST)
  .filter(([clave, entrada]) => {
    if (entrada.categoria !== "tenant-scoped") return false;
    const url = clave.slice(clave.indexOf(" ") + 1);
    return url.startsWith(PREFIJO_FINANCE);            // :239
  })…
```

**El CONTEXT dice "cambiando una constante". Medido, son TRES cambios, y el primero es una trampa:**

1. **El prefijo de finance tiene barra final; el de members no puede tenerla.** `GET /api/admin/members` y `POST /api/admin/members` **no llevan `/` después de `members`** → `startsWith("/api/admin/members/")` **las perdería silenciosamente**, y el gate quedaría verde con 2 rutas menos. El criterio tiene que ser `url === P || url.startsWith(P + "/")`.
2. **Son TRES prefijos, no uno**: `/api/admin/members`, `/api/admin/users`, `/api/admin/leads` (24 + 5 + 1 = **30**). Verificado que no hay colisiones de prefijo (`/api/admin/member-*` no existe) y que `/api/members/*` (app-facing) **no** matchea porque el ancla es `/api/admin/`.
3. `CASOS_BASELINE = 30` y `ARCHIVOS_BATERIA` con los archivos nuevos.

Las 4 piezas no obvias que **sí** se copian tal cual: el chequeo **bidireccional** (`faltantes` + `fantasmas`), el **borrado de comentarios antes de buscar** (sin él el gate mide los docblocks y da verde con la batería vacía), el **motor probado con fixtures sintéticos** (4 `it`, ~2 ms), y el **gate sobre la lista de excepciones** (existe en el manifiesto + está FUERA del prefijo + motivo ≥ 20 chars sin marcador de trabajo pendiente).

`describe.skip` / `.todo` **no cuentan** como cobertura, y el gate **no toca la base**: lee texto con `readFileSync` y corre en ~10 ms.

---

## 9. El switch — dos commits, en este orden (§0.1 corrige el número)

`src/db/tenant-tables.ts:524-533` — la única entrada de hoy:

```ts
export const TENANT_STRICT_MODULES: Record<string, readonly string[]> = {
  finance: [
    "balances",
    "cash_registers",
    "cost_centers",
    "debt_management",
    "financial_transactions",
    "transaction_links",
  ],
};
```

La entrada de esta fase, con los nombres **FÍSICOS** de MySQL y en orden alfabético (los mismos 8 que suman las 79 entradas de §0):

```ts
  members: [
    "audit_log",
    "member_logins",
    "member_notes",
    "member_profiles",
    "user_branches",
    "user_sepa_details",
    "user_status_history",
    "users",
  ],
```

**Commit 1** — `chore(173-XX): la allowlist se queda sin una sola excusa de members` (borrar las **90**; el criterio del plan es un PISO, borrar de más siempre es legal en el ratchet).
**Commit 2** — `feat(173-XX): members entra a TENANT_STRICT_MODULES`.

Al revés, el gate D-15 ("ninguna tabla strict con entradas vivas en la allowlist") tumba el commit intermedio. Durante los pasos 2-4, allowlist de trabajo en `/tmp/allowlist-173-<NN>.json` — el archivo real tiene **un solo dueño** (el plan del switch) y queda rojo contra la rama hasta entonces: **eso es esperado, no una regresión**, y es lo que bloquea el merge antes de tiempo.

**Gate de forma** — `test/db/tenant-tables.test.ts:379`:

```ts
  it("declara exactamente los módulos ya adoptados, con sus tablas exactas (172-21: finance es el primero)", () => {
    …
      normalizar(TENANT_STRICT_MODULES),
```

Se compara contra una **SEGUNDA COPIA escrita a mano en el test** — no contra sí mismo, y no "el módulo está presente". Hay que agregar `members` a esa copia a mano, y el nombre del `it` (que hoy dice "finance es el primero") queda stale.

**Demo del fail-closed, en vivo:** sonda revertida sin commitear, sobre una query de **UNA SOLA TABLA** de un método que **algún test ejercite** (el sentinel evalúa por query, el lint por tabla — trampa (h); el piloto perdió un intento sobre `getById`, que no tiene un solo call site en `src/`). Transcribir la salida real del `TenantSentinelError` (SQL + cadena de `cause`) en el SUMMARY, y cerrar con `git status --porcelain` vacío.

---

## 10. Patrones compartidos (aplican a todos los planes)

### Autenticación / borde

**Fuente:** `src/modules/shared/tenant.ts` (`assertTenant`, `:178-190`) · **Aplicar a:** todo route handler de `members/routes.ts`, `leads-routes.ts`, `users`
`const ctx = assertTenant(request.scope, "<módulo>.<operación>");` — **un solo `assertTenant` por handler, una sola etiqueta** (`coach-load-routes.ts:478`). Es el ÚNICO puente permitido entre `CountryScope.tenantId` (`number | null`) y la firma lockeada de los helpers (`number`). Prohibido resolverlo con `!` o con un default numérico: _"un gimnasio no resoluble es DENY, jamás 'el tenant 1' y jamás 'todos los gimnasios'"_.

### Filtro de lectura

**Fuente:** `tenantWhere` (`shared/tenant.ts:149`) · **Aplicar a:** todo `select` / `update` / `delete`
Primer término de todo `and(...)`, **inline** en el statement que nombra la tabla. En ` sql` crudo: `WHERE tenant_id = ${ctx.tenantId}`. En joins: **en el `ON`**, también en INNER.

### Estampado de escritura

**Fuente:** `tenantValues` (`shared/tenant.ts:170`) · **Aplicar a:** todo `insert`
El `tenantId` va **DESPUÉS** del spread y pisa cualquier `tenantId` que viniera adentro — mitigación de mass-assignment a nivel de tipo y de runtime. `tenant_id` **jamás** de payload/JWT.

### Barrido por gimnasio en jobs

**Fuente:** `forEachActiveTenant` (`shared/tenant.ts`) · **Aplicar a:** los 3 jobs de §4.4
Ya está puesto en los 7 jobs (169/171). **Tener `ctx` ≠ estar migrado.** El log lleva `tenantId` como **campo estructurado**, nunca interpolado en el mensaje.

### Exenciones

**Fuente:** doc 07 §4(d) · **Dos canales distintos, no intercambiables:**

- `tenant-lint-allowlist.json` → solo `src/` + `scripts/`, y **solo se achica**.
- `/* tenant-safe: <motivo> */` → comentario de **bloque aparte**; en SQL crudo va **ADENTRO del SQL**, entre el verbo y el `FROM`. Es el **único** canal que el sentinel lee. Motivo OBLIGATORIO.

### Errores y logging (CLAUDE.md)

`request.log` / `app.log` (Pino), nunca `console.log` — **salvo en scripts CLI**, donde está permitido por precedente (`require-tenant.ts`). `catch (err: unknown)` con `instanceof Error`. Sin `any`.

---

## 11. Sin analogía en el codebase

| Archivo                                  | Rol       | Motivo                                                                                                                                                                                                                                                 |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `el-templo-api/tsconfig.test-check.json` | config    | **No existe en el repo.** El piloto lo creó en el worktree y no lo commiteó. Necesita `rootDir: "."` (ver §7.3).                                                                                                                                       |
| Migración con **FK compuesta** (`0198`)  | migration | Ninguna migración existente crea una FK compuesta `(tenant_id, col)`. `0191_tenant_anchors.sql` es lo más parecido (crea `fk_users_tenant`), pero es FK simple. El DDL hay que escribirlo desde cero; el **formato** del `.sql` sí se copia de `0197`. |
| Helper `assertBranchDelGimnasio`         | utility   | Analogía **parcial**: `resolveUserBranchId` (§2.4) resuelve-con-filtro, pero es un closure de rutas de finance, no un helper compartido de `src/modules/shared/`. La forma exacta es Claude's Discretion.                                              |

---

## 12. Metadata

**Alcance de la búsqueda de analogías:** `el-templo-api/src/modules/{finance,members,users,subscriptions,auth,shared,wellhub}/`, `el-templo-api/src/db/{schema,scripts,migrations}/`, `el-templo-api/src/jobs/`, `el-templo-api/src/scripts/`, `el-templo-api/test/{tenancy,fixtures,db}/`
**Revisión leída:** `origin/staging` (contiene la 172; `e1952606` = gemelo de `f77e05b4`)
**Divergencia master/staging al mapear:** master tiene **4** commits que staging no (`6724f46e`, `0661f987`, `a36b759d`, `f77e05b4`) — **D-16: backmerge ANTES del worktree.**
⚠️ `f77e05b4` y su gemelo `e1952606` **ya están los dos** (uno en cada rama): el backmerge va a ver el mismo cambio por dos caminos sobre `members/routes.ts` y `members/schemas.ts`. Los otros 3 sí son código nuevo, y `a36b759d` (_"acotar al gimnasio el chequeo de primer pago"_) toca tenancy de referidos — **revisarlo contra §5 antes de asumir que no colisiona.**
**Archivos escaneados:** ~450 (`src/` completo vía `git ls-tree` + los 13 archivos de `test/tenancy/`)
**Fecha de extracción:** 2026-08-04
**Documento de referencia operativa:** `.docs/saas-multitenancy/07-receta-adopcion.md` (NO versionado — vive solo en `/home/franco/projects/el-templo`)
