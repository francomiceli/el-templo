# Phase 103: User Status Enum — Research

**Investigado:** 2026-04-25
**Dominio:** Schema migration + service-layer state machine + multi-app contract change
**Confianza global:** ALTA (toda la investigación se basa en lectura del código actual)

---

## User Constraints (from CONTEXT.md)

### Decisiones bloqueadas (D-01..D-15)

Todas las decisiones de implementación de `103-CONTEXT.md` están bloqueadas. Lo más relevante para el planner:

- **D-01..D-04 (Auto-transición):** `recomputeUserStatus(userId, tx)` es la única fuente de verdad post-cambio-de-suscripción. Reemplaza a `markConvertedIfLead`. Se invoca en todos los sitios que insertan/cancelan suscripciones, dentro de la transacción del caller. Cancelación nunca vuelve a `freemium`/`prueba`.
- **D-05..D-07 (Schema/Migración):** Una sola migración SQL atómica. Agrega `users.status ENUM(...) DEFAULT NULL`, agrega `users.staff_disabled BOOLEAN NOT NULL DEFAULT FALSE`, dropea `users.is_active`, dropea `idx_users_is_active`, agrega `idx_users_status`. Backfill = 4 UPDATEs idempotentes (3 secuenciales + override `is_active=FALSE`) + 1 UPDATE para staff. La columna `is_active` se dropea en la MISMA migración.
- **D-08..D-11 (Naming):** Valores DB lowercase: `freemium | prueba | activo | inactivo`. Labels UI capitalizados: `Freemium | En Prueba | Activo | Inactivo`. Colores: info/warning/positive/grey. Endpoint `PATCH /admin/users/:id/status` payload renombra `isActive` → `disabled` (inversión semántica).
- **D-12..D-14 (Default):** `freemium` es el default a nivel DB; `POST /api/admin/trials` overrride a `prueba`; flujos con plan auto-transicionan a `activo` vía `recomputeUserStatus`. Backfill `freemium` solo si `branchId == ONLINE`; el resto va a `inactivo`.
- **D-15 (UI AlumnosPage):** Reusar el `q-select` existente; cambios quirúrgicos enumerados paso a paso (8 ediciones).

### Discreción de Claude

- Nombre del helper (`recomputeUserStatus` vs `syncUserStatusAfterSubscriptionChange`)
- SQL exacto de los UPDATE (EXISTS vs JOIN — recomendación abajo: EXISTS, alineado con migración 0091)
- Layout de tests (un archivo nuevo `test/users/user-status-transitions.test.ts` vs split por módulo)
- Mapping status→color/label inline vs composable compartido entre AlumnosPage y AlumnoDetailPage

### Ideas diferidas (FUERA DE SCOPE)

- UX de freemium en member app (fase 89-91)
- Edición manual del status por admin
- Estados extra (`pausado`, `expirado`, `lapsed`)
- Refactor de reportes (`converted_at IS NULL` queries siguen funcionando)
- Shim backwards-compat de `isActive` en respuesta API

---

## Phase Requirements

| ID  | Descripción                                                    | Soporte de la Investigación                                                                                                                              |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Agregar `users.status` enum (4 valores) + índice               | Migration Mechanics — patrón `mysqlEnum` ya en uso (bookings, subscriptions); SQL `ALTER TABLE ... ADD COLUMN ... ENUM(...)` validado                    |
| R2  | Agregar `users.staff_disabled BOOLEAN NOT NULL DEFAULT FALSE`  | `boolean(...).notNull().default(false)` — patrón idéntico a `bookings.is_trial` (migración 0097)                                                         |
| R3  | Dropear `users.is_active` + `idx_users_is_active`              | El runner customizado (`run-migrations.ts`) maneja `DROP COLUMN/INDEX` idempotentemente vía detección "Can't DROP"                                       |
| R4  | Backfill data: 3+1+1 UPDATEs idempotentes                      | SQL sketch en sección Migration Mechanics — modelo: secciones 2 y 3 de migración 0091                                                                    |
| R5  | Auto-transición a `activo` al crear sub                        | 5 sitios identificados en `subscriptions/service.ts` (líneas 753, 1599, 1985, 2186, 2372) — sección `recomputeUserStatus` enumera todos                  |
| R6  | Auto-transición a `inactivo` al cancelar última sub            | `cancelSubscription:1262` — única ruta de cancelación; `recomputeUserStatus` debe correr antes del commit                                                |
| R7  | Default `freemium` + overrides en trials/promo                 | Default declarativo en schema; `POST /api/admin/trials` override directo; `recomputeUserStatus` cubre el caso plan-asignado-en-mismo-paso                |
| R8  | Filtro API `?status=freemium\|prueba\|activo\|inactivo`        | `members/schemas.ts:147` enum extender; `members/service.ts:196-220` reemplazar EXISTS por `eq(users.status, ...)`                                       |
| R9  | AlumnosPage: dropdown 5 opciones reemplaza `Solo Leads` toggle | Receta concreta D-15; archivos: `AlumnosPage.vue:61-68, 121, 250-251, 344, 348, 500, 676, 681, 717, 721`                                                 |
| R10 | Badge `status` en list/detail                                  | `AlumnosPage.vue:250-251`, `AlumnoDetailPage.vue:54-55, 62`; tipos `MemberListItem.isActive` → agregar `status`, dropear `isActive`                      |
| R11 | Toggle staff escribe `staff_disabled` vía `disabled`           | `users/routes.ts:100-131` (PATCH endpoint), `users/service.ts:204-242` (`toggleActive`), `useUsersApi.ts:97-109`, `UsuariosPage.vue:43-63, 247, 396-409` |
| R12 | Auth no referencia `is_active`                                 | `auth/routes.ts:251, 329, 359, 439, 572` — sección Auth Routes Migration Map detalla cada una                                                            |

---

## 1. Executive Summary

1. **Las "transacciones" en `subscriptions/service.ts` no existen hoy** — el servicio usa `this.db` directo en TODOS los sitios (`createSubscription`, `cancelSubscription`, `renew`, `changePlan`, etc.). El constraint "Atomic transitions" obliga al planner a introducir wrapping con `this.db.transaction(async (tx) => {...})` en al menos los 5 sitios de inserción y la cancelación. Esta es **la sorpresa más grande del fase** — hay refactor estructural, no solo "agregar 1 llamada". Patrón de transaction ya existe en `programs/service.ts:46`, `attendance/service.ts:172`, `scheduling/booking-service.ts:234`. La conversión de `this.db.insert(...)` a `tx.insert(...)` requiere cambiar la firma de varios métodos privados (e.g., `markConvertedIfLead` actual NO está en transacción, ver línea 779).

2. **El número de sitios de inserción de `subscriptions` es 5, no "3-4"** — confirmado por grep: líneas **753 (assignPlan), 1599 (changePlan), 1985 (renewEarly o variant), 2186 (renew), 2372 (bulkMigratePlan)**. Cada uno cambia el estado de un user a `activo`. `bulkMigratePlan` (línea 2352) además dispara cancel + insert; el cancel debe llamar a `recompute` también, pero como itera por usuario, una sola llamada al final por user es suficiente.

3. **Hay 2 referencias a `users.isActive` fuera de los archivos enumerados en CONTEXT.md** que el planner DEBE incluir en el scope:
   - `analytics/service.ts:205` — usa `eq(schema.users.isActive, true)` para `countActiveMembers`. Esto es un cálculo de "miembros activos" para reportes; debe migrar a `eq(schema.users.status, 'activo')`.
   - `members/service.ts:812` (export) — string literal `estado: r.isActive ? "Activo" : "Inactivo"`. La columna `estado` del export ahora debería poder mostrar los 4 valores, no 2.

4. **`SlotAttendancePanel.vue:318` usa `m.isActive`** para search results de miembros (busca alumnos para agregar a un slot). Aunque CONTEXT.md no lo menciona, si la API quita `isActive` de la respuesta, este panel rompe. **Recomendación:** mantener compatibilidad redirigiendo `isActive = (status === 'activo')` en frontend, o migrar el panel a leer `status`.

5. **El runner de migraciones ya maneja idempotencia** — split por `;` o `--> statement-breakpoint`, cada statement se ejecuta secuencialmente, y errores tipo "Duplicate column", "already exists", "Can't DROP" se skipean automáticamente (ver `run-migrations.ts:96-114`). Esto significa que el SQL de la migración no necesita `IF NOT EXISTS` / `IF EXISTS`. **Pero cuidado:** si la migración tiene 8 statements y ya se aplicaron 5 antes (re-corrida después de fallo parcial), el runner skipea los primeros como "Duplicate" y luego intenta el resto. Los UPDATEs de backfill deben ser idempotentes por sí mismos (que ya lo son por el `WHERE status IS NULL`), independientemente del flag del runner.

---

## 2. Migration Mechanics

### Drizzle MySQL ENUM declaration — patrón confirmado

El proyecto declara enums **fuera** del `mysqlTable(...)` y los referencia con `.default(...)`. Patrón vivo en `bookings.ts:16-36` y `subscriptions.ts:18-54`:

```ts
// Patrón actual (subscriptions.ts:18-28)
export const subscriptionStatusEnum = mysqlEnum("subscription_status", [
  "active", "paused", "cancelled", "completed", "scheduled",
]);
// ...usado en la tabla:
status: subscriptionStatusEnum.default("active").notNull(),
```

**Para Phase 103 → users.ts (recomendado):**

```ts
// Agregar al tope del archivo, junto a roleEnum/levelEnum/genderEnum/documentTypeEnum
export const userStatusEnum = mysqlEnum("status", [
  "freemium", "prueba", "activo", "inactivo",
]);

// En la tabla (reemplaza la línea 68 isActive: ...):
status: userStatusEnum,                                  // nullable, sin default → MySQL DEFAULT NULL
staffDisabled: boolean("staff_disabled").notNull().default(false),
// (la columna isActive: boolean("is_active").default(true).notNull() se elimina)

// En el array de índices (reemplaza idx_users_is_active):
index("idx_users_status").on(table.status),
```

**Decisión de default:** La SPEC pide `DEFAULT NULL` a nivel DB pero `freemium` para nuevos members. La forma limpia: declarar el campo Drizzle SIN `.default()` (queda nullable, default NULL en MySQL) y poner `freemium` como default solo en el SQL de migración con `ALTER TABLE ... ADD COLUMN status ENUM(...) DEFAULT 'freemium'`. **Pero la SPEC R1 pide explícitamente `DEFAULT NULL`** ("staff rows stay NULL") — esto es contradictorio con D-12 ("DB column default for new members = freemium").

> **🚩 Conflicto en specs a resolver con el planner:** R1 acceptance dice `DEFAULT NULL`, D-12 dice "DB column default for new members = freemium". Resolución pragmática: el default de la columna ES `freemium` (cualquier `INSERT INTO users (...) VALUES (...)` que omita `status` obtiene `freemium`); para staff (role≠member) los services explícitamente pasan `status: null`. Acceptance R1 puede satisfacerse leyendo `INFORMATION_SCHEMA.COLUMNS` y verificando que el campo es nullable (`IS_NULLABLE='YES'`). Recomiendo confirmar con el usuario cuál interpretación gana antes de escribir SQL.

### Patrón SQL del proyecto (basado en migraciones 0091/0096/0097/0098/0099)

Características recurrentes:

- Sin `IF NOT EXISTS` / `IF EXISTS` — el runner los maneja
- Header comment explica por qué + idempotencia
- Cada `ALTER TABLE` es un statement separado terminado en `;`
- Statements separados por `;` (preferido) o `--> statement-breakpoint` (drizzle-kit generated)
- Los UPDATEs defensivos siguen al `ALTER` (ver migración 0091 secciones 1 y 2)
- `CREATE INDEX` separado del `ALTER TABLE`

### SQL de migración recomendado (sketch para 0100)

```sql
-- Phase 103: User Status Enum + staff_disabled split + drop is_active
-- See .planning/phases/103-user-status-enum/103-SPEC.md for full rationale.
--
-- Idempotency: runner skips Duplicate/already-exists/Can't DROP errors.
-- Backfill UPDATEs are guarded by WHERE status IS NULL so re-runs no-op.
-- Order matters: status backfill MUST run BEFORE dropping is_active because
-- step 5 reads the legacy column.

-- Section 1: Add new columns
ALTER TABLE `users`
  ADD COLUMN `status` ENUM('freemium','prueba','activo','inactivo') DEFAULT 'freemium';

ALTER TABLE `users`
  ADD COLUMN `staff_disabled` BOOLEAN NOT NULL DEFAULT FALSE;

-- Section 2: Backfill data (idempotent — each guarded by status IS NULL where applicable)
-- 2.1 Active subscribers → 'activo'
UPDATE users u
  SET u.status = 'activo'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = u.id
        AND s.subscription_status IN ('active','paused')
        AND (s.end_date IS NULL OR s.end_date >= CURDATE())
    );

-- 2.2 Trial leads → 'prueba'
UPDATE users u
  SET u.status = 'prueba'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.member_id = u.id AND b.is_trial = 1
    );

-- 2.3 Online self-registered without sub/trial → 'freemium'
UPDATE users u
  SET u.status = 'freemium'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND u.branch_id = (SELECT id FROM branches WHERE code = 'ONLINE');

-- 2.4 Everyone else (presential users without sub/trial = ex-alumnos) → 'inactivo'
UPDATE users u
  SET u.status = 'inactivo'
  WHERE u.role = 'member'
    AND u.status IS NULL;

-- 2.5 Override: legacy deactivated members go to 'inactivo'
UPDATE users u
  SET u.status = 'inactivo'
  WHERE u.role = 'member'
    AND u.is_active = FALSE
    AND u.deleted_at IS NULL;

-- 2.6 Staff: status NULL, staff_disabled = NOT is_active
UPDATE users u
  SET u.status = NULL,
      u.staff_disabled = NOT u.is_active
  WHERE u.role != 'member';

-- Section 3: Drop legacy column + index, add new index
DROP INDEX `idx_users_is_active` ON `users`;

ALTER TABLE `users` DROP COLUMN `is_active`;

CREATE INDEX `idx_users_status` ON `users` (`status`);
```

### Notas sobre orden

- **Crítico:** Los UPDATE 2.5 y 2.6 leen `is_active`, así que el `DROP COLUMN` debe ir DESPUÉS de todos los UPDATEs.
- **DROP INDEX antes de DROP COLUMN:** MySQL falla si intentás dropear una columna indexada sin dropear el índice primero. Sin embargo, con `idx_users_is_active` definido sobre la columna `is_active` exclusivamente, MySQL automáticamente dropea el índice al dropear la columna. Es más seguro y explícito hacerlo manualmente como arriba.
- **Re-run safety:** Si la migración corre 2 veces, los UPDATEs no tocan filas (el WHERE no matchea), DROP INDEX falla con "Can't DROP" (skipped por runner), DROP COLUMN falla con "Can't DROP" (skipped), CREATE INDEX falla con "Duplicate key name" (skipped). Todo seguro.

### `pnpm db:generate` (drizzle-kit) — manejo del ENUM

Drizzle-kit autogenera SQL con `--> statement-breakpoint` separators. **PROBABLE problema:** drizzle-kit puede no detectar correctamente `DROP COLUMN is_active` + `ADD COLUMN status ENUM(...)` porque cambian dos cosas a la vez con un campo nuevo. **Recomendación al planner:** generar con `pnpm db:generate`, pero **estar preparado para hand-edit el SQL** — copiar el sketch de arriba sobre lo que genera drizzle-kit. No es seguro asumir que el SQL generado sea correcto.

`drizzle-kit migrate` está EXPLÍCITAMENTE PROHIBIDO por CLAUDE.md ("never use drizzle-kit migrate"). Solo `pnpm db:migrate` (que ejecuta `tsx src/db/run-migrations.ts`).

---

## 3. `recomputeUserStatus` Helper Design

### Sitios que invocan al helper (enumeración exhaustiva en `subscriptions/service.ts`)

| Línea | Método                            | Acción                                   | Estado resultante esperado                                                                                                                |
| ----- | --------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 753   | `assignPlan` (createSubscription) | INSERT subscription `status='active'`    | `activo`                                                                                                                                  |
| 1262  | `cancelSubscription`              | UPDATE subscription `status='cancelled'` | `inactivo` (si era la última) o `activo` (si quedan otras)                                                                                |
| 1599  | `changePlan`                      | INSERT replacement subscription          | `activo`                                                                                                                                  |
| 1985  | `assignNextPlan`/queued plan      | INSERT scheduled subscription            | sin cambio inmediato (queda `activo` si ya lo era) — **OPEN: ¿debería transicionar?** No, queda como está, hasta que el auto-resume corra |
| 2186  | `renewSubscription`               | INSERT renewed subscription              | `activo`                                                                                                                                  |
| 2372  | `bulkMigratePlan` (loop interno)  | UPDATE old + INSERT new                  | `activo` (1 llamada por usuario al final del bloque try)                                                                                  |

**Adicionalmente:**

- `pauseSubscription` (no encontrado en sitios de INSERT pero existe — verificar si UPDATE a `status='paused'` requiere recompute) — `paused` cuenta como activo (R5 dice "active/paused"), así que NO requiere recompute si el user ya era `activo`. Pero por consistencia, el planner puede agregarlo defensivamente.
- `resumeSubscription` (línea ~1240) — UPDATE de `paused` a `active`. Mismo razonamiento — no cambia el status del user.
- `markConvertedIfLead:3122` — **DELETED.** Su única call site (línea 779) reemplazada por `recomputeUserStatus`.

### Diseño SQL del helper

Dos opciones evaluadas:

**Opción A: lógica en TypeScript (3 queries + UPDATE)**

```ts
private async recomputeUserStatus(
  userId: number,
  tx: MySql2Database<typeof schema>,
): Promise<void> {
  // 1. Read current state
  const [user] = await tx
    .select({ id: schema.users.id, status: schema.users.status, convertedAt: schema.users.convertedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user) return;

  // 2. Has any active/paused sub?
  const activeSubs = await tx.execute(sql`
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userId}
      AND s.subscription_status IN ('active','paused')
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
    LIMIT 1
  `);
  const hasActiveSub = activeSubs.length > 0;

  // 3. Compute new status
  let newStatus: 'freemium' | 'prueba' | 'activo' | 'inactivo';
  if (hasActiveSub) {
    newStatus = 'activo';
  } else if (user.status === 'activo' || user.status === 'inactivo') {
    // Was a paying member at some point — never demote to freemium/prueba
    newStatus = 'inactivo';
  } else {
    // Still freemium or prueba — sub creation didn't happen or was rolled back; keep current
    newStatus = user.status; // unchanged
  }

  // 4. UPDATE only if changed; also fold in markConvertedIfLead
  await tx.execute(sql`
    UPDATE users u
    SET u.status = ${newStatus},
        u.converted_at = CASE
          WHEN u.converted_at IS NULL
            AND ${newStatus === 'activo' ? 1 : 0} = 1
            AND EXISTS (SELECT 1 FROM bookings b WHERE b.member_id = u.id AND b.is_trial = 1)
          THEN CURRENT_TIMESTAMP
          ELSE u.converted_at
        END
    WHERE u.id = ${userId}
  `);
}
```

**Opción B: SQL puro (1 statement)**

```ts
private async recomputeUserStatus(
  userId: number,
  tx: MySql2Database<typeof schema>,
): Promise<void> {
  await tx.execute(sql`
    UPDATE users u
    SET
      u.status = CASE
        WHEN EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.user_id = u.id
            AND s.subscription_status IN ('active','paused')
            AND (s.end_date IS NULL OR s.end_date >= CURDATE())
        ) THEN 'activo'
        WHEN u.status IN ('activo','inactivo') THEN 'inactivo'
        ELSE u.status
      END,
      u.converted_at = CASE
        WHEN u.converted_at IS NULL
          AND EXISTS (SELECT 1 FROM bookings b WHERE b.member_id = u.id AND b.is_trial = 1)
          AND EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = u.id
              AND s.subscription_status IN ('active','paused')
              AND (s.end_date IS NULL OR s.end_date >= CURDATE())
          )
        THEN CURRENT_TIMESTAMP
        ELSE u.converted_at
      END
    WHERE u.id = ${userId}
  `);
}
```

**Recomendación: Opción B.** Razones:

- 1 round-trip vs 3 — mejor en transacciones donde las locks importan
- Atómico por construcción — no race entre lectura y escritura
- Sigue el patrón del `markConvertedIfLead` actual (línea 3122-3133) que explícitamente comenta "single conditional UPDATE to avoid a read-then-write race"

### Manejo de transacciones — el problema real

**Estado actual (línea 779):** `await this.markConvertedIfLead(userId);` — corre en `this.db`, NO en una transacción explícita. El INSERT de subscription en línea 753 también es directo en `this.db`. **No hay transaction wrapping** en `assignPlan`.

**Estado requerido (Constraint "Atomic transitions"):** `recomputeUserStatus` debe correr dentro de la misma transacción que el INSERT/UPDATE de la suscripción. Si la transacción rollbackea, el status del user también rollbackea.

**Implicación:** El planner debe envolver el cuerpo de cada uno de los 6 métodos (los 5 sitios INSERT + cancelSubscription) en `this.db.transaction(async (tx) => {...})`, y propagar `tx` a todos los `db` calls internos. Esto es un cambio amplio:

- `assignPlan` actual hace ~25 statements `this.db.<op>` entre línea 700 y 900. Todos deberían pasar a `tx.<op>`.
- Lo mismo para los otros 4 métodos.
- El `markConvertedIfLead` actual NO necesitaba `tx` porque el race era manejado por la query SQL atómica. Pero "atomic transitions" requiere el wrapping completo.

**Patrón ya en uso en el repo** (referencias para el planner):

- `programs/service.ts:46` — `return await this.db.transaction(async (tx) => {...})` — retorna valor
- `attendance/service.ts:172` — `const recordId = await this.db.transaction(...)`
- `scheduling/booking-service.ts:234` — patrón idéntico
- `aura/service.ts:52, 113` — incluso doble-transacción para spend

**Costo del cambio:** Considerable pero mecánico. El planner debería crear un plan dedicado para la conversión a transacciones de los 6 métodos antes (o como prerrequisito de) introducir el helper.

**Alternativa pragmática (subóptima pero menor riesgo):** No envolver en transacción y aceptar que en el error path entre INSERT(sub) y recompute(user) podemos quedar inconsistentes. Llamar a `recomputeUserStatus` siguiendo el patrón actual de `markConvertedIfLead` (atómico por SQL pero NO transaccionado). **Recomendación al planner:** Plantear la opción al usuario explícitamente. La SPEC dice "atomic transitions" pero el costo de cumplirlo es alto y el código actual de Phase 102 no lo hace. Si se opta por wrapping completo, debería ser un plan separado.

---

## 4. Members API Migration Map

Sitios en `el-templo-admin/src/` que leen `member.isActive` o `memberProfile.isActive` y necesitan migrar a `status`:

| Archivo                              | Líneas  | Uso actual                                                       | Cambio                                                                                                                                                                                                |
| ------------------------------------ | ------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/AlumnosPage.vue`              | 121     | `v-model="filters.isActive"`                                     | → `filters.status` (D-15.1)                                                                                                                                                                           |
| `pages/AlumnosPage.vue`              | 250-251 | row chip `props.row.isActive ? 'positive' : 'grey'`              | → mapping de `props.row.status` (D-15.7)                                                                                                                                                              |
| `pages/AlumnosPage.vue`              | 344     | `isActive: true as boolean \| null`                              | → `status: null as string \| null` (D-15.5)                                                                                                                                                           |
| `pages/AlumnosPage.vue`              | 348     | `leadsOnly: false as boolean`                                    | → eliminar (D-15.5)                                                                                                                                                                                   |
| `pages/AlumnosPage.vue`              | 500     | column def `field: 'isActive'`                                   | → `field: 'status'` (D-15.8)                                                                                                                                                                          |
| `pages/AlumnosPage.vue`              | 676     | `getMembers({ isActive: filters.isActive ?? undefined })`        | → `status: filters.status ?? undefined` (D-15.6)                                                                                                                                                      |
| `pages/AlumnosPage.vue`              | 681     | `status: filters.leadsOnly ? 'leads' : undefined`                | → eliminado, fusionado arriba                                                                                                                                                                         |
| `pages/AlumnosPage.vue`              | 717     | `exportMembers({ isActive: filters.isActive ?? undefined })`     | → `status: filters.status ?? undefined`                                                                                                                                                               |
| `pages/AlumnosPage.vue`              | 721     | `status: filters.leadsOnly ? 'leads' : undefined`                | → eliminado, fusionado arriba                                                                                                                                                                         |
| `pages/AlumnoDetailPage.vue`         | 54-55   | header chip `memberProfile.isActive ? ...`                       | → mapping de `memberProfile.status`                                                                                                                                                                   |
| `pages/AlumnoDetailPage.vue`         | 62      | `v-if="!memberProfile.isActive"` (trial counter)                 | → `v-if="memberProfile.status !== 'activo'"`                                                                                                                                                          |
| `types/member.ts`                    | 55      | `isActive: boolean` (MemberListItem)                             | → agregar `status: 'freemium'\|'prueba'\|'activo'\|'inactivo'`; **dropear `isActive`**                                                                                                                |
| `types/member.ts`                    | 145     | `isActive?: boolean` (MemberListParams)                          | → dropear `isActive`, agregar `status?: 'todos'\|'freemium'\|'prueba'\|'activo'\|'inactivo'`                                                                                                          |
| `types/member.ts`                    | 151     | `status?: 'todos'\|'alumnos'\|'leads'`                           | → reemplazado por enum 4-valor (D-15)                                                                                                                                                                 |
| `composables/useMembersApi.ts`       | 235     | `params: { isActive: true }` (en `getPlans`)                     | **NO MIGRAR** — esto es `plans.isActive` (subscription_plans), no users. Falsa alarma del grep.                                                                                                       |
| `components/SlotAttendancePanel.vue` | 318     | `if (m.isActive)` para badge "Activa/Inactiva" en search results | **OUT-OF-SCOPE EN CONTEXT.md PERO ROMPE.** Recomendación: planner debe agregar a un plan — o reemplazar `m.isActive` por `m.status === 'activo'`, o exponer un computed boolean compatible en la API. |

**Para staff (UsuariosPage / useUsersApi):**

| Archivo                      | Líneas    | Uso actual                              | Cambio (R11)                                                                                                        |
| ---------------------------- | --------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `composables/useUsersApi.ts` | 12        | `isActive: boolean` en StaffUser        | → `staffDisabled: boolean` (semantic flip)                                                                          |
| `composables/useUsersApi.ts` | 101-102   | `api.patch<{ isActive }>('.../status')` | → `api.patch<{ disabled: boolean }>('.../status', { disabled: !user.staffDisabled })` (semantic inversion per D-11) |
| `pages/UsuariosPage.vue`     | 43-44     | row chip `isActive ? positive : grey`   | → `staffDisabled ? grey : positive`                                                                                 |
| `pages/UsuariosPage.vue`     | 59-60, 63 | toggle button icon/color/tooltip        | mismas inversiones semánticas                                                                                       |
| `pages/UsuariosPage.vue`     | 247       | column field `'isActive'`               | → `'staffDisabled'`                                                                                                 |
| `pages/UsuariosPage.vue`     | 396-409   | toggle confirmation dialog              | invertir todas las verificaciones (`user.staffDisabled` ahora es "está desactivado")                                |

**Otros (NO en CONTEXT pero hay que tocar):**

- `pages/PlanesPage.vue:118-548` — usa `props.row.isActive` para PLANS, no USERS. **NO TOCAR.**
- `pages/ProgramasPage.vue:55-164` — `props.row.isActive` de PROGRAMS. **NO TOCAR.**

---

## 5. Auth Routes Migration Map

Cada referencia a `users.isActive` en `el-templo-api/src/modules/auth/routes.ts`:

| Línea   | Contexto                                           | Acción requerida                                                                                                                                                                                                                                                     |
| ------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 251     | `select({ isActive: users.isActive })` en `/login` | **DROPEAR del select.** Login no necesita leer `isActive` para nada — la única gate de seguridad activa hoy es `user.deletedAt` (línea 266). El campo se devuelve en el payload de respuesta (línea 329) por costumbre, pero ningún cliente lo consume críticamente. |
| 266-271 | `if (user.deletedAt) → 401 "cuenta eliminada"`     | **MANTENER** — esta es la gate universal de soft-delete.                                                                                                                                                                                                             |
| 329     | `isActive: user.isActive` en payload de `/login`   | **DROPEAR del payload.** Cumple R12 acceptance ("auth payload no longer includes `isActive`").                                                                                                                                                                       |
| 359     | `select({ isActive: users.isActive })` en `/me`    | **DROPEAR del select.**                                                                                                                                                                                                                                              |
| 439     | `isActive: user.isActive` en payload de `/me`      | **DROPEAR del payload.**                                                                                                                                                                                                                                             |
| 572     | `isActive: false` en account-delete UPDATE         | **DROPEAR del UPDATE.** El soft-delete real es `deletedAt: now` (línea 573, ya está). El read-side ya filtra por `deletedAt IS NULL` (línea 266 + `members/service.ts:70`), así que setear `isActive=false` es redundante.                                           |

**NUEVA gate de login para staff (R12 explícito):**

> "Login for a staff user with `staff_disabled=true` is rejected with the same error code as the prior `is_active=false` path."

Hoy NO existe gate de `is_active` en login (el código actual en línea 266 solo checkea `deletedAt`). Esto significa que **el comportamiento actual ya está roto**: un staff con `is_active=false` puede loguearse hoy. R12 acceptance pide que con `staff_disabled=true` no pueda. **Implementación recomendada después de leer las contraseñas:**

```ts
// Después de validar password y antes de firmar JWT:
if (user.role !== "member" && user.staffDisabled) {
  return reply.code(401).send({
    error: "No autorizado",
    message: "Cuenta desactivada",
  });
}
```

Esto es un **cambio funcional**, no solo migración de columna. El planner debe documentar explícitamente que está cerrando un loophole pre-existente.

**Fuera de auth/routes.ts pero en scope (de la sección 1, executive summary):**

| Archivo                | Línea                                                                                             | Acción                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ | ----------- |
| `analytics/service.ts` | 205                                                                                               | `eq(schema.users.isActive, true)` → `eq(schema.users.status, 'activo')`                                                                                                                                                                                                                                                                                                                     |
| `members/service.ts`   | 53, 114-124, 247-254, 294, 348, 366-373, 404, 434, 473, 545, 591, 656, 709-718, 775-782, 793, 812 | Reemplazar todo `isActive` filter/projection por `status`. La columna `MemberListParams.isActive` cambia a `status` con valores enum. El subquery `isActiveSubquery` se elimina (proyectar directamente `users.status`). El insert en `createMember:473` (`isActive: true`) se elimina (default DB es `freemium`). Soft-delete en `softDeleteMember:591` también elimina `isActive: false`. |
| `users/service.ts`     | 35, 183, 213, 230, 233, 241                                                                       | `toggleActive` → `toggleDisabled`; selecciona y escribe `staffDisabled` en lugar de `isActive`; el endpoint payload retorna `{ disabled: boolean }`.                                                                                                                                                                                                                                        |
| `users/schemas.ts`     | 27, 111                                                                                           | Schema response `isActive` → `staffDisabled` (o `disabled` para el toggle endpoint).                                                                                                                                                                                                                                                                                                        |
| `members/schemas.ts`   | 130, 147, 320, 33, 80                                                                             | Schema responses `isActive` → `status`; query enum extendido a 5 valores (`todos                                                                                                                                                                                                                                                                                                            | freemium | prueba | activo | inactivo`). |

---

## 6. Test Infrastructure Available

Helpers en `test/helpers.ts` (todos disponibles):

- `createTestApp()` — instancia Fastify contra DB `eltemplo_test`
- `getAuthToken(app, email, password)` — login HTTP, retorna JWT
- `registerUser(app, data)` — POST /api/auth/register, retorna `{ token, user, promoApplied }`
- `cleanAllTestData(app)` — wipe completo en orden FK-safe (mantiene admin@test.com, branches, spom_config). **Llamar en `beforeEach`.**
- `createStaffUser(app, data)` — INSERT directo de coach/admin/owner con `argon2.hash` ya aplicado

**Tests existentes a estudiar como modelos:**

| Test                                        | Cubre                                                           | Patrón útil para 103                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/scheduling/trials.test.ts`            | POST /api/admin/trials, capacity exclusion, one-trial-per-phone | Patrón de fixture para users con trial booking; **fixture para el test de R7 (`POST /api/admin/trials → status='prueba'`)**                                   |
| `test/auth/promo-registration.test.ts`      | self-register con `promoCode` válido + auto-assign plan         | **Patrón directo para test de R7 (`POST /register con valid promoCode → status='activo'`)**                                                                   |
| `test/auth/auth.test.ts`                    | login, /me, account-delete                                      | **Patrón para R12 — validar que login rechaza `staff_disabled=true`, payload no incluye `isActive`**                                                          |
| `test/members/members.test.ts`              | listMembers con filter `?isActive=true`, getMemberById          | **Patrón directo para R8 — replicar las 4 variantes del enum**                                                                                                |
| `test/members/members-leads-filter.test.ts` | Phase 102 R8 leads filter                                       | **Modelo cercano** — solo extender el enum a 5 valores. Líneas 41-44 muestran fixture con 4 escenarios; agregar 5to (freemium = ONLINE branch sin sub/trial). |
| `test/subscriptions/subscriptions.test.ts`  | createSubscription, cancelSubscription                          | **Patrón directo para R5/R6** — los tests de assert post-create/cancel ya existen, agregar assertion de `users.status` después de cada acción.                |
| `test/users/users.test.ts`                  | toggleActive endpoint                                           | **Patrón directo para R11** — renombrar y validar `staff_disabled`                                                                                            |

**Fixture pattern para freemium user** (no existe hoy, hay que crearlo):

```ts
// User en branch ONLINE, sin sub, sin trial → debería tener status='freemium' tras backfill
const onlineBranchId = (
  await app.db.select().from(branches).where(eq(branches.code, "ONLINE"))
)[0].id;
const [user] = await app.db
  .insert(users)
  .values({
    email: "freemium@test.com",
    passwordHash: await argon2.hash("x"),
    branchId: onlineBranchId,
    role: "member",
    level: "alfa",
    // status se rellena del default DB → 'freemium'
  })
  .$returningId();
```

**Recomendación de organización de tests:**

Crear un archivo nuevo `test/users/user-status-transitions.test.ts` con 3 describes:

1. **Backfill / migration** — verificar 4 escenarios de R4 acceptance corriendo la migración 0100 sobre fixtures conocidas
2. **Auto-transitions** — R5/R6/R7 (create → activo, cancel → inactivo, trial endpoint → prueba, etc.)
3. **API contract** — R8/R10/R11 (filter values, response field renames)

R12 (auth) se ajusta más naturalmente en `test/auth/auth.test.ts`.

---

## 7. Schema Push Command

| Comando                   | Propósito                                                                                                                  | Cuándo usar                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm db:generate`        | drizzle-kit autogenera SQL desde schema TS, lo escribe a `src/db/migrations/NNNN_*.sql`                                    | Una vez después de modificar schema TS files                                                |
| `pnpm db:migrate`         | Ejecuta runner customizado (`tsx src/db/run-migrations.ts`) que aplica `.sql` files no aplicados, trackea en `_migrations` | Para migrar dev DB; corre también en CI/CD y producción                                     |
| `pnpm db:push`            | drizzle-kit push (sync directo schema → DB sin SQL files)                                                                  | **PROHIBIDO en commits** (CLAUDE.md). Solo prototyping local descartable.                   |
| **`drizzle-kit migrate`** | drizzle-kit migration runner                                                                                               | **PROHIBIDO** (CLAUDE.md): "meta/\_journal.json is out of sync and not the source of truth" |
| `pnpm db:reset`           | `db:push && db:seed` — wipe + reseed                                                                                       | Solo dev local, destructivo                                                                 |

**Variables de entorno requeridas:**

```bash
DB_HOST=localhost  # default
DB_PORT=3306       # default
DB_USER=root       # default
DB_PASSWORD=
DB_NAME=eltemplo   # default; tests usan eltemplo_test
NODE_ENV=development  # carga .env.development; en prod carga .env.production
```

**Workflow recomendado para Phase 103:**

1. Editar `src/db/schema/users.ts` (agregar `userStatusEnum`, agregar `staffDisabled` field, agregar `status` field, dropear `isActive`, swap index)
2. `pnpm db:generate` → genera `0100_*.sql` (probablemente incompleto/incorrecto para el backfill)
3. **Hand-edit el SQL** sobre el sketch de la sección 2 — drizzle no sabe del backfill data
4. `pnpm db:migrate` localmente para validar
5. Commitear `src/db/schema/users.ts` + `src/db/migrations/0100_*.sql` juntos en el mismo commit

**MySQL local:** El runner asume MySQL corriendo en `localhost:3306` con DB `eltemplo`. Si el dev no la tiene, debe crear DB y correr `pnpm db:reset` + `pnpm db:seed` antes. Para tests, `DB_NAME=eltemplo_test` se hardcodea en `helpers.ts:21`.

---

## 8. Validation Architecture

**Marco:** Vitest 1.x (`pnpm test` → `vitest run`), real MySQL en `eltemplo_test`.

### 3 comportamientos críticos que NO deben driftear

#### 1. Login behavior unchanged (excepto el nuevo gate de staff_disabled)

**Por qué:** Phase 103 toca `/login` y `/me`. Si rompemos login, ningún cliente puede entrar.

**Tests requeridos:**

- ✅ Member con sub activa loguea → 200 + token (debe seguir funcionando)
- ✅ Member soft-deleted (`deleted_at IS NOT NULL`) → 401 (gate existente, debe seguir funcionando)
- ✅ Member con `status='inactivo'` puede loguear → 200 (no es una gate; esos miembros aún pueden entrar a ver "no plan")
- ✅ Member con `status='freemium'` puede loguear → 200
- ✅ **NUEVO:** Coach con `staff_disabled=true` → 401 (NUEVO gate, R12)
- ✅ Coach con `staff_disabled=false` → 200
- ✅ Member con `staff_disabled=false` (default) → 200 (la gate solo aplica a non-member)
- ✅ Payload de `/login` y `/me` NO contiene `isActive`

**Comando rápido:**

```bash
cd el-templo-api && pnpm test test/auth/auth.test.ts
```

#### 2. Member list count consistency through migration

**Por qué:** Si la migración asigna mal el status, el filter `?status=activo` puede devolver counts diferentes a los del filter previo `?isActive=true`. Operativamente, los admins vienen mirando estos counts.

**Tests requeridos:**

- ✅ Pre-migración: contar `users` con sub activa → guardar
- ✅ Aplicar migración
- ✅ Post-migración: `SELECT COUNT(*) FROM users WHERE role='member' AND status='activo' AND deleted_at IS NULL` → mismo número
- ✅ `GET /api/admin/members?status=activo&page=1&limit=100` → `total` matches el COUNT directo
- ✅ Member que era visible bajo "Inactivos" (sub cancelada o nunca tuvo) → sigue visible bajo `?status=inactivo` o `?status=freemium`

**Comando rápido:**

```bash
cd el-templo-api && pnpm test test/members/members.test.ts test/members/members-leads-filter.test.ts
```

#### 3. Subscription create/cancel transactional consistency

**Por qué:** Si el INSERT de subscription corre y el `recomputeUserStatus` falla (o vice-versa), quedamos en un estado roto donde el user tiene sub pero status='inactivo' (o viceversa).

**Tests requeridos:**

- ✅ `assignPlan` happy path → user.status `freemium → activo` (después del commit)
- ✅ `assignPlan` happy path → user.converted_at set si tenía trial booking previo
- ✅ `cancelSubscription` happy path → user.status `activo → inactivo`
- ✅ `cancelSubscription` con 2 subs activas → cancelar 1, user.status sigue `activo`
- ✅ User que era `freemium`, comprá plan, cancelá → status final = `inactivo` (NO regresar a `freemium`)
- ✅ **(Si se opta por wrapping de transaction):** simular fallo de `recomputeUserStatus` → assert que el INSERT también rollbackea (user no tiene sub, status sin cambiar)

**Comando rápido:**

```bash
cd el-templo-api && pnpm test test/subscriptions/subscriptions.test.ts
```

### Sampling rates (Nyquist)

- **Por commit de task:** correr el test file directamente impactado (ej. `vitest run test/subscriptions/subscriptions.test.ts`)
- **Por wave merge:** correr `pnpm test` completo (toda la suite)
- **Phase gate:** suite verde + `grep -rn "users.isActive\|users\.is_active" el-templo-api/src el-templo-admin/src` retorna 0 matches outside de migraciones

---

## 9. Planner Notes

### Sorpresas clave

1. **El wrapping de transacciones no existe en `subscriptions/service.ts`.** El planner debe decidir entre: (a) introducir `db.transaction()` en los 6 métodos como prerrequisito (plan separado, costo medio), (b) seguir el patrón actual (atómico por SQL puro, NO en transacción explícita; aceptar el riesgo en el ~5ms entre INSERT y recompute). La SPEC pide (a) pero el código actual es (b). **Recomendación: discutir con el usuario.** Si se opta por (a), va en el primer plan después de la migración; si por (b), `recomputeUserStatus` se vuelve trivial (1 SQL atómico, igual que `markConvertedIfLead` hoy).

2. **`SlotAttendancePanel.vue:318` usa `m.isActive`** para badge en search results. Si la API quita `isActive` del response de `/api/admin/members`, este panel rompe silenciosamente. **No está en el scope de CONTEXT pero el planner DEBE incluirlo** — sea como tarea explícita (migrar a `m.status === 'activo'`) o como expansión de scope.

3. **`analytics/service.ts:205` también usa `users.isActive`** — no estaba en el inventario de CONTEXT.md. Esto rompe el endpoint de analytics si no se migra. **Inclúyelo en un plan.**

4. **Conflicto entre R1 ("DEFAULT NULL") y D-12 ("DB column default for new members = freemium").** El planner debe resolver con el usuario antes de escribir el SQL. Mi recomendación: el default es `freemium`, pero la columna es nullable; el código de creación de staff explícitamente pasa `status: null`. Acceptance R1 se cumple verificando nullability vía `IS_NULLABLE='YES'`, no el `COLUMN_DEFAULT`.

5. **El gate de login para staff_disabled es nuevo.** Hoy NO existe gate en `/login` para `is_active=false`. R12 lo introduce como if statement post-password-verify. Esto es funcionalidad nueva, no migración.

6. **`drizzle-kit generate` no sabe del backfill.** El SQL autogenerado va a tener solo los `ALTER TABLE` y `CREATE INDEX`/`DROP INDEX`. El planner debe explícitamente programar un paso de "hand-edit la migración generada" para insertar los UPDATEs de backfill. **Riesgo:** un executor que solo corre `db:generate` y no edita el SQL queda con migración incompleta.

7. **MySQL `DROP COLUMN` con índice asociado.** El runner del proyecto skipea "Can't DROP" pero MySQL puede comportarse distinto entre versiones. Recomiendo el `DROP INDEX` explícito antes del `DROP COLUMN` (como en el sketch de la sección 2).

8. **Phase 102 `markConvertedIfLead` es el modelo conceptual.** La línea 3122-3133 muestra exactamente el patrón a seguir: SQL puro, atómico, idempotente, sin race. `recomputeUserStatus` es esencialmente `markConvertedIfLead` extendido.

9. **`PlanesPage.vue` y `ProgramasPage.vue` usan `isActive` para PLANS y PROGRAMS.** Distintos modelos, NO tocar. El grep del acceptance R3 lo indica explícitamente ("matches on unrelated entities like `promo.isActive`, `schedule.isActive`, `plan.isActive` are allowed").

10. **El export de members (`members/service.ts:812`) muestra `Activo|Inactivo` como string.** Con 4 estados, debería mostrar el label completo (`Freemium|En Prueba|Activo|Inactivo`). Esto NO está explícito en R10 pero es la consecuencia natural. Recomendación: incluir en el plan que migra `exportMembers`.

### Orden de plans sugerido (no decidido — el planner gobierna)

1. **Plan A (schema + migration):** Drizzle schema edit + 0100 SQL hand-crafted + tests de migración (idempotencia, backfill correcto). Bloquea todo lo demás.
2. **Plan B (recomputeUserStatus + auto-transitions):** Helper en SubscriptionService + decisión transaction vs no-transaction + tests R5/R6/R7.
3. **Plan C (members API contract):** `members/service.ts` filter + projection + types + schemas + tests R8/R10. Incluye `analytics/service.ts:205` y `members/service.ts:812` (export).
4. **Plan D (auth routes):** R12 + nuevo gate staff_disabled + tests.
5. **Plan E (admin UI — alumnos):** AlumnosPage + AlumnoDetailPage + types + composable mapping helper.
6. **Plan F (admin UI — staff):** UsuariosPage + useUsersApi + users routes/service/schemas (R11).
7. **Plan G (cleanup + grep gate):** SlotAttendancePanel migration, grep validation, MemberListItem type cleanup.

Plans D, E, F pueden correr en paralelo después de A+C.

### Riesgos de regresión

- Login deja de funcionar para alguien (gate equivocado, payload schema rechazado por Fastify).
- Migración corre parcial en prod, deja columnas inconsistentes (mitigado por idempotencia del runner + UPDATEs guarded).
- `recomputeUserStatus` se olvida en uno de los 5 sitios → user con sub queda con status='freemium' o 'inactivo'.
- Frontend tipo desalineado del backend → AlumnosPage muestra "undefined" en chips.
- `SlotAttendancePanel` rompe sin warning porque el grep se enfocó en AlumnosPage/Detail.

### Sources

Toda la información en este documento se obtuvo leyendo código del repo localmente:

- `el-templo-api/src/db/schema/users.ts` — schema actual users
- `el-templo-api/src/db/schema/bookings.ts`, `subscriptions.ts` — patrón mysqlEnum
- `el-templo-api/src/db/migrations/0091_*.sql, 0096-0099*.sql` — convenciones SQL
- `el-templo-api/src/db/run-migrations.ts` — runner customizado, idempotencia
- `el-templo-api/src/modules/subscriptions/service.ts` — sitios INSERT, markConvertedIfLead
- `el-templo-api/src/modules/members/service.ts`, `types.ts`, `schemas.ts`, `routes.ts`
- `el-templo-api/src/modules/auth/routes.ts`, `schemas.ts`
- `el-templo-api/src/modules/users/service.ts`, `schemas.ts`, `routes.ts`
- `el-templo-api/src/modules/analytics/service.ts` — referencia oculta a `isActive`
- `el-templo-api/test/helpers.ts` + tests en `test/scheduling/trials.test.ts`, `test/auth/promo-registration.test.ts`, `test/members/members-leads-filter.test.ts`
- `el-templo-admin/src/pages/AlumnosPage.vue`, `AlumnoDetailPage.vue`, `UsuariosPage.vue`, `PlanesPage.vue`, `ProgramasPage.vue`
- `el-templo-admin/src/composables/useUsersApi.ts`, `useMembersApi.ts`
- `el-templo-admin/src/types/member.ts`
- `el-templo-admin/src/components/SlotAttendancePanel.vue`
- `CLAUDE.md` (project root) — engineering standards

Confianza: **ALTA** en todas las afirmaciones — todas verificadas leyendo el archivo. No se hicieron búsquedas web (per instrucciones).

## RESEARCH COMPLETE
