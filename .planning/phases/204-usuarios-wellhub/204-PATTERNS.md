# Phase 204: Usuarios Wellhub - Pattern Map

**Mapped:** 2026-10-27
**Files analyzed:** 52 (new + modified, API + admin + tests)
**Analogs found:** 50 / 52 (2 sin analogo directo: ver "No Analog Found")

Base: worktree `et-204-wellhub` (`origin/master` `3bf682d95`). Las lineas son de ESTE worktree. Los numeros de linea de `204-RESEARCH.md` fueron verificados, salvo donde se indica.

## File Classification

### API: nuevos

| New File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `el-templo-api/src/modules/shared/wellhub-sources.ts` | utility (SQL fragments) | transform | `src/modules/shared/membership.ts` | exact (mismo estilo: alias cerrado + `tenant-safe`) |
| `el-templo-api/src/modules/wellhub/conversion.ts` | service (hook in-tx) | event-driven (in-tx) | `src/modules/referrals/invitation-conversion.ts` (`attributeInvitationPurchase`) | exact |
| `el-templo-api/src/modules/wellhub/member-wellhub-service.ts` | service (card + merge + app-access) | CRUD / request-response | `src/modules/members/service.ts` (`softDeleteMember`, `resetMemberPassword`) + `shared/audit-log.ts` | role-match |
| `el-templo-api/src/modules/reports/wellhub-report-service.ts` | service (reporte) | batch / aggregate | `src/modules/referrals/invitation-report.ts` | exact |
| `el-templo-api/src/db/migrations/0300_wellhub_usuarios.sql` | migration | DDL | `0286_extra_blocks_completed.sql` (tabla gym-owned) + `0186_wellhub_integration.sql` (enum) | exact |
| `el-templo-api/src/db/schema/wellhub.ts` (+ `wellhubConversions`) | model | CRUD | misma file: `wellhubBookings` | exact |

### API: modificados

| Modified File | Role | Data Flow | Analog / patron | Match |
|---|---|---|---|---|
| `src/db/schema/attendance.ts` (enum += `wellhub_manual`) | model | - | su propio `attendanceSourceEnum` (`:24-28`) | exact |
| `src/jobs/mark-no-shows.ts` (`:149-252`) | job | batch | si mismo + `test/attendance/especial-consumption.test.ts` (4) | exact |
| `src/modules/attendance/service.ts` (`:126`, `:241`, `:292`, `:880`, `:935-1000`, `:1023`, `:1418`, `getSlotAttendance :608`) | service | request-response | si mismo | exact |
| `src/modules/scheduling/booking-service.ts` (`:415`, `:1063`, `:2400`, `:2555`, `:2587`, `cancel :526`, `cancelFutureBookings :2011`, `cancelUpcomingBookingsForMember :1191`) | service | CRUD | si mismo | exact |
| `src/modules/scheduling/service.ts` (`getSlotDetail :587`) + `types.ts :121` + `schemas.ts :115-150` | service / types / schema | request-response | `memberBranchId`/`memberBranchName` (2026-09-26) | exact |
| `src/modules/attendance/schemas.ts` (`slotAttendanceItemSchema :105-140`) | schema | request-response | si mismo | exact |
| `src/modules/wellhub/service.ts` (`:364` guard, `:419-439` todayBooking) | service | event-driven (webhook) | si mismo | exact |
| `src/modules/subscriptions/service.ts` (`recomputeUserStatus :7723`, hook tras `:7894`) | service | CRUD in-tx | `attributeInvitationPurchase` call | exact |
| `src/modules/members/service.ts` (`effectiveMemberStatusSql :123`, `listMembers`, `searchMembers :587`, `exportMembers :2344`, `STATUS_LABELS :2515`) | service | CRUD | `hasActiveInvitationExpr` (`:367-382`, proy. `:468`) | exact |
| `src/modules/members/routes.ts` (list `:495-540`, + 3 rutas nuevas) | route | request-response | `PUT /:userId/password` (`:1628-1700`) | exact |
| `src/modules/members/schemas.ts` (`:28,84,212,259,716,754`) | schema | request-response | si mismo | exact |
| `src/modules/shared/audit-log.ts` (`AuditAction` += `wellhub_member_merged`) | utility | - | su propia union (`:35`) | exact |
| `src/modules/campaigns/audience-service.ts` (`bajasConditions :132`) | service | batch | si mismo | exact |
| `src/modules/reports/{service,schemas,routes,types}.ts` (access log `source`) | service / route | request-response | `source` filter existente (`service.ts:3292`, `schemas.ts:63,81`) | exact |
| `src/modules/reports/routes.ts` (nueva `GET /wellhub`) | route | request-response | `GET /access` (`:111-130`) y `referrals/admin-routes.ts :94-105` | exact |
| `src/modules/analytics/funnel-service.ts` (`entryOrigin='wellhub'`) | service | transform | `funnel-service.ts:119-149` | exact |
| `src/db/tenant-tables.ts` + 4 tests de conteos + `test/helpers.ts` + `test/tenant-manifest.ts` | config / test | - | filas `wellhub_*` existentes | exact |

### API: tests nuevos

| New Test | Role | Analog |
|---|---|---|
| `test/fixtures/wellhub-personas.ts` | test fixture | `test/wellhub/webhook-checkin.test.ts` (helpers `sign`, `stubValidateFetch`, `uniqueToken`) + `test/helpers.ts` (`createTestMember`, `assignTestPlan`) |
| `test/wellhub/plan-separation.test.ts` | test | `test/attendance/especial-consumption.test.ts` (usa `runMarkNoShows(app.db)`) |
| `test/wellhub/manual-presence.test.ts` | test | `test/attendance/especial-consumption.test.ts` (coach check-in `POST /slot/:scheduleId/:date/check-in`, undo) |
| `test/wellhub/members-wellhub.test.ts` | test | `test/tenancy/iso-03-members-listados.test.ts` / `test/campaigns-audience.test.ts` (para `bajas`) |
| `test/wellhub/conversion.test.ts` | test | `test/subscriptions/_helpers.ts` (`assignPlan`) + `test/invitations/*` (conversion de invitacion) |
| `test/wellhub/merge.test.ts` | test | `test/tenancy/iso-03-members-ficha.test.ts` (password route) |
| `test/reports/wellhub-report.test.ts` | test | `test/reports/*` + `test/invitations/*` (report) |
| `test/migrations/0300-wellhub-usuarios.test.ts` | test | `test/migrations/0285-0286-extra-blocks.test.ts` (`enumValues()`, INFORMATION_SCHEMA) |

### Admin: nuevos y modificados

| File | Role | Data Flow | Analog | Match |
|---|---|---|---|---|
| `src/utils/wellhub-label.ts` (+ `__tests__/wellhub-label.test.ts`) | utility | transform | `src/utils/__tests__/novedades-push.test.ts`, `invitation-meta` | role-match |
| `src/components/members/WellhubCard.vue` | component | request-response | `components/MemberSubscriptionTab.vue` / `InvitedByBlock.vue` | role-match |
| `src/components/members/WellhubMergeDialog.vue` | component | CRUD | `components/InvitationCreateDialog.vue` | role-match |
| `src/components/reports/WellhubReport.vue` | component | request-response | `components/reports/InvitationsReport.vue` | exact |
| `src/composables/useWellhubApi.ts` | composable | request-response | `composables/useInvitationReportApi.ts` | exact |
| `src/composables/useStatusBadge.ts`, `types/member.ts :102`, `useMembersApi.ts :55,82` | composable / type | transform | si mismos | exact |
| `src/pages/AlumnosPage.vue` (toggle) | page | request-response | toggle "Solo deudores" (`:90-95`, `:500`, `:863`) | exact |
| `src/pages/AlumnoDetailPage.vue` (card, CTA, dialogos) | page | request-response | `$q.dialog` "¿Cargar membresia?" (`:1466-1475`) + `AssignPlanDialog` (`:728`) | exact |
| `src/pages/CobrosPage.vue` (`buildMemberOption :2005`, `onMemberSelected :2179`, deep link `:2488`) | page | request-response | si mismo | exact |
| `src/components/scheduling/SlotDetailDialog.vue` (chip + boton disabled) | component | request-response | chip "Visita · Sede" (`:322-326`, `isVisitorBooking :1164`) y "PRUEBA" (`:476-481`) | exact |
| `src/types/attendance.ts :8,29`, `components/MemberAttendanceTab.vue :51-55` | type / component | transform | `sourceLabels` | exact |
| `src/pages/ReportesPage.vue` (tab + filtro fuente) | page | request-response | tab `invitaciones` (`:80-86`) | exact |

NOTA: la ruta real de `SlotDetailDialog.vue` es `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue` (RESEARCH/CONTEXT la citan sin el subdirectorio `scheduling/`). Los numeros de linea de este archivo ya corresponden a la ruta correcta.

---

## Pattern Assignments

### `el-templo-api/src/modules/shared/wellhub-sources.ts` (utility, transform)

**Analog:** `el-templo-api/src/modules/shared/membership.ts`

**Imports + alias cerrado** (membership.ts lineas 28-40):
```typescript
import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/** Unión CERRADA: por eso `sql.raw(alias)` es seguro (nunca llega texto del cliente). */
export type SubAlias = "s" | "s2" | "subscriptions";

export function notTrialPlanSql(alias: SubAlias): SQL {
  /* tenant-safe: subquery por PK de plan ..., viaja AND-eada dentro de una query externa ya scopeada por gimnasio (ver docblock de cabecera). */
  return sql`${sql.raw(alias)}.plan_id NOT IN (SELECT id FROM subscription_plans WHERE is_trial = 1)`;
}
```
**Copiar:** docblock de cabecera que explica "los fragmentos NUNCA se ejecutan como query propia" + el comentario `/* tenant-safe: ... */` dentro de cada funcion (lo exige el lint `con-06`). Alias cerrado como union de literales para las variantes raw (`"b"`, `"bookings"`, `"a"`, `"attendance"`).

**Core:** el esbozo de RESEARCH "Pattern 1" (`notWellhubBookingSql`, `notWellhubAttendanceSql`, `WELLHUB_ATTENDANCE_SOURCES`). Trampa NULL: `(source IS NULL OR source <> 'wellhub')`. La columna fisica de attendance es `attendance_source` (no `source`) en SQL crudo.

---

### `el-templo-api/src/modules/wellhub/conversion.ts` (service, in-tx hook)

**Analog:** `el-templo-api/src/modules/referrals/invitation-conversion.ts` (`attributeInvitationPurchase`, lineas 96-170)

**Imports + firma** (lineas 20-31, 96-104):
```typescript
import { and, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { InvitationExecutor } from "./invitation-rules";

export async function attributeInvitationPurchase(
  tx: InvitationExecutor,
  settingsDb: DbInstance,
  ctx: TenantContext,
  userId: number,
  log: FastifyBaseLogger,
): Promise<void> {
  const [invitation] = await tx.select({ id: schema.invitations.id }).from(schema.invitations)
    .where(and(tenantWhere(schema.invitations, ctx), eq(schema.invitations.invitedUserId, userId), ...))
    .limit(1);
  if (!invitation) return;   // "una query barata" y sale
```
**Copiar:** early-return barato (guard `statusAfter==='activo' && statusBefore!=='activo'` + `gympass_id` antes de cualquier query pesada), `tenantWhere` en cada tabla, `log.info({...ids}, "mensaje")` al final. Para el SQL crudo con tenant inline: `tx.execute(sql\`... WHERE s2.tenant_id = ${ctx.tenantId} ... AND ${membershipInEffectSql("s2")}\`)` (lineas 187-195), que es la forma de elegir la suscripcion mas reciente. Insert con `tenantValues(ctx, {...})` (ver `audit-log.ts`).

**Call site (donde se engancha)** `subscriptions/service.ts` 7888-7895:
```typescript
// Con `ctx === null` se saltea: ese caso SOLO llega del cron de vencimiento ...
if (ctx) {
  await attributeInvitationPurchase(tx, this.db, ctx, userId, this.log);
  // Fase 204: await recordWellhubConversion(tx, ctx, userId, statusBefore, statusAfter, this.log);
}
```
`statusBefore` (linea ~7742) y `statusAfter` (7852-7861) ya estan en scope. Tipo de `tx` aqui es `MySql2Database<typeof schema>`; el analog usa `InvitationExecutor`. Elegir el mas laxo que compile.

---

### `el-templo-api/src/modules/wellhub/member-wellhub-service.ts` (service)

**Analogs:** `members/service.ts` `softDeleteMember` (2078-2110), `resetMemberPassword` (2126-2155), `shared/audit-log.ts`.

**Soft delete a replicar con variante `tx`** (members/service.ts 2095-2108):
```typescript
const timestamp = Date.now();
const scrubbedEmail = `deleted-${id}-${timestamp}@deleted.local`;
await this.db.update(schema.users)
  .set({ deletedAt: new Date(), email: scrubbedEmail, dni: null })
  .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, id)));
```
Crear variante que reciba `tx` (hoy usa `this.db`). Preferible extraer un helper compartido en vez de duplicar el scrub (DRY).

**Audit en la misma tx** (audit-log.ts 93-109; call sites reales: `finance/transaction-service.ts:819`, `subscriptions/trial-bookings-on-assign.ts:234`):
```typescript
await auditLog.write(ctx, tx, {
  actorId, action: "wellhub_member_merged", targetKind: "member", targetId: target,
  payload: { absorbedUserId, gympassId, absorbedEmail, moved: { ... } },
});
```
`ctx` PRIMERO, luego `tx`. Agregar `"wellhub_member_merged"` a `AuditAction` (audit-log.ts:35-60); `action` es `varchar(50)`, sin migracion.

**Reset + email (app-access)**, patron de `members/routes.ts:860-875` (best effort, no falla el request):
```typescript
if (member.email) {
  try {
    const emailService = new EmailService(fastify.log);
    await emailService.sendPasswordSetEmail(member.email, member.firstName ?? "", tempPassword);
  } catch (emailErr: unknown) {
    request.log.error({ err: emailErr }, "Error sending password-set email");
  }
}
```
y `resetMemberPassword(ctx, id)` devuelve `{ok:true}|{ok:false, reason:"not_found"|"not_member"|"deleted"}`.

---

### `el-templo-api/src/modules/members/routes.ts` (3 rutas nuevas: card, app-access, merge)

**Analog:** `PUT /:userId/password`, `members/routes.ts` 1628-1700.

**Auth + tenant + params + guard por pais** (1628-1693):
```typescript
fastify.put<{ Params: { userId: number } }>(
  "/:userId/password",
  { schema: resetMemberPasswordSchema },
  async (request, reply) => {
    const ctx = assertTenant(request.scope, "members.password");
    if (!(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({ error: "Acceso denegado", message: "Solo owner, admin o gestión puede ..." });
    }
    const [target] = await fastify.db.select({ id: schema.users.id, role: schema.users.role, deletedAt: schema.users.deletedAt,
        branchCountry: schema.branches.country, branchIsVirtual: schema.branches.isVirtual })
      .from(schema.users)
      .innerJoin(schema.branches, and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, schema.users.branchId)))
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, request.params.userId))).limit(1);
    if (!target || target.deletedAt) return reply.code(404).send({ error: "No encontrado", message: "Miembro no encontrado" });
    if (!request.scope.isOwner && request.scope.country && !target.branchIsVirtual && target.branchCountry !== request.scope.country) {
      return reply.code(404).send({ error: "No encontrado", message: "Miembro no encontrado" });
    }
```
**Copiar para las 3 rutas:** `assertTenant(request.scope, "members.<nombre>")`; 403 inline por rol (`MEMBER_LIFECYCLE_ROLES` para app-access, `ADMIN_ROLES` de `shared/permissions.ts:31` para merge); 404 identico para inexistente / otro tenant / otro pais (ISO-03). Merge repite el guard de pais sobre el `targetUserId` del body. Params schema `userId: {type:"integer"}` (FA-07). **Todo campo nuevo del response va declarado en el response schema** (fast-json-stringify lo descarta si no).

**Listado: pasar el filtro** (routes.ts 495-536): destructurar `wellhubOnly` del `request.query` y meterlo en `MemberListParams`. NO envolver en el chequeo `financeBlind` (el de `debtorOnly` es 403 por plata; `wellhubOnly` no es finanzas).

---

### `el-templo-api/src/modules/members/service.ts` (label rule + filtro + proyecciones)

**Analog:** `hasActiveInvitationExpr` — un fragmento para filtro Y proyeccion (service.ts 367-382, proyeccion 468).

```typescript
const hasActiveInvitationExpr = sql<number>`EXISTS (
  SELECT 1 FROM invitations i
  WHERE i.tenant_id = ${ctx.tenantId}
    AND i.invited_user_id = users.id
    AND i.status = 'active'
)`;
if (origin === "invitacion") { conditions.push(hasActiveInvitationExpr); }
// select: isInvited: sql<number>`(${hasActiveInvitationExpr})`,
```
**Copiar:** tenant INLINE en el SQL crudo (`i.tenant_id = ${ctx.tenantId}`), referencia externa como literal `users.id` (trampa Drizzle de columnas sin calificar), y el mismo fragmento para `conditions.push(...)` y para la columna `isWellhub`/`showWellhubLabel`.

**Estado efectivo** (service.ts 123-138): `effectiveMemberStatusSql(ctx)` devuelve `'activo'|'inactivo'|users.status`. `status='wellhub'` ya pasa tal cual por el `ELSE users.status`. Reusar `effectiveStatusExpr` dentro de `showWellhubLabel` (`users.gympass_id IS NOT NULL AND <effective> <> 'activo'`).

**Filtro de status** (service.ts 350-358): agregar `status === "wellhub"` a la lista de `if`. NO agregar opcion al select (D-07).

**Export** (`exportMembers :2344`) duplica las condiciones del listado (olor DRY existente): reusar los mismos fragmentos. `STATUS_LABELS :2515` + sufijo.

---

### `el-templo-api/src/modules/campaigns/audience-service.ts` (`bajasConditions`)

**Analog:** si mismo (132-144). Agregar un elemento al array:
```typescript
return [
  eq(u.status, "inactivo"),
  isNull(u.gympassId),   // Fase 204 D-12
  sql`EXISTS (SELECT 1 FROM ${s} WHERE ${s.userId} = ${u.id} AND ${s.priceTypeApplied} <> 'zero')`,
];
```
Mantener el comentario `tenant-safe` existente. Test: extender `test/campaigns-audience.test.ts`.

---

### `el-templo-api/src/jobs/mark-no-shows.ts` (D-18 fix #1)

**Analog:** si mismo, 149-252. Agregar `source: bookings.source` al `select` de `toMark` (153-158); seguir marcando `no_show` para TODOS (el reporte necesita los no-shows Wellhub) pero saltar las de origen Wellhub al construir `memberCounts` (loop 189-203):
```typescript
for (const b of toMark) {
  if (b.source === "wellhub") continue; // no descuenta del plan (D-18)
  const isSpecial = !!b.isSpecial;
  ...
```
`bookings.source` es NULL en filas viejas: el `=== "wellhub"` en JS es NULL-safe. El helper SQL solo hace falta en queries.

**Test:** `test/attendance/especial-consumption.test.ts` caso (4) lineas 234-250 usa `runMarkNoShows(app.db)`; copiar su siembra.

---

### `el-templo-api/src/modules/attendance/service.ts` (D-18 #2-#6, D-19)

**Analog:** si mismo. Sitios y patron de exclusion:

- `:126-150` (QR `bookingsInRange`): agregar `notWellhubBookingSql()` al `and(...)`.
- `:241` y `:292` (one-per-day QR) y `:880` (coach): agregar `notWellhubAttendanceSql()` junto a `sameActivityKindSql(...)`. Copiar la forma existente:
```typescript
.where(and(
  tenantWhere(schema.attendance, ctx),
  eq(schema.attendance.memberId, memberId),
  eq(schema.attendance.sessionDate, todayStr),
  sameActivityKindSql(isSpecialActivity, specialLine),
  notWellhubAttendanceSql(),
))
```
- `:1418` `countWeeklyAttendance`: mismo agregado al `and`.
- `coachCheckIn :925-1000`: ANTES del `insert` (linea 927) buscar la reserva `(member, schedule, date)`; si `source==='wellhub'` insertar `source: "wellhub_manual"`, hacer el upsert a `confirmado` de la reserva (el SQL `ON DUPLICATE KEY UPDATE` de 975-986 no toca `source`) y SALTEAR `auraService.award` (942), el decremento (953-968) y `recordPresencialSession` (996). El insert existente a copiar:
```typescript
await this.db.insert(schema.attendance).values(
  tenantValues(ctx, { memberId, branchId: schedule.branchId, scheduleId, sessionDate: date, status: "confirmado", source: "manual" }),
);
```
- `removeCheckIn :1023`: leer `attendance.source` primero; `wellhub_manual` borra fila y revierte reserva a `reservado` usando `session_date` (no el UTC de `checked_in_at`); `wellhub` se rechaza con `ConflictError`/`BadRequestError`.
- `getSlotAttendance :608-650`: sumar `bookingSource: schema.bookings.source` al `select` de `bookingRows` y exponer `isWellhub`. Declarar en `slotAttendanceItemSchema` (`attendance/schemas.ts:105-140`): `isWellhub: { type: "boolean" }`.

---

### `el-templo-api/src/modules/scheduling/booking-service.ts` (D-11, D-18 #7-#9, D-24, D-25)

**Analog:** si mismo.

**Rechazo staff (D-11)** — `adminRemoveBooking :1063`; agregar `source` al `select` (1068-1074) y despues del `NotFoundError`:
```typescript
if (!bookingRow) throw new NotFoundError("Reserva no encontrada");
if (bookingRow.source === "wellhub") {
  throw new ConflictError("Esta reserva se gestiona desde la app de Wellhub");
}
```
`ConflictError` ya esta importado (`booking-service.ts:46`, usado en `:349`, `:405`). Misma guarda en `cancel()` (`:526`, D-24).

**Contadores** (`countWeeklyBookings :2400-2430`, `countFuturePendingBookings :2555`, `countBonusBookings :2587`, regla 8b `:415`): agregar `notWellhubBookingSql()` al `and(...)` existente:
```typescript
.where(and(
  tenantWhere(schema.bookings, ctx),
  eq(schema.bookings.memberId, memberId),
  sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
  ...,
  eq(schema.activities.isSpecial, false),
  notWellhubBookingSql(),
))
```
**Cancelaciones masivas** (`cancelFutureBookings :2011`, `cancelUpcomingBookingsForMember :1191`, bulk del `DELETE /admin/members/:userId` en `members/routes.ts:1570-1588`): excluir con el mismo helper. NO excluir `cancelAllFutureBookingsForSchedule :1141` ni `cancelBookingsFromDateAndGrantCredits :1447` (la clase deja de existir).

**Roster futuro:** `BookingRecord` (`scheduling/types.ts:121`) += `source: string | null`; mapear en `getSlotDetail` (`scheduling/service.ts:587-660`) y declarar en `bookingRecordSchema` (`scheduling/schemas.ts:~115-150`). Precedente del comentario de aviso al declarar campos nuevos: `scheduling/schemas.ts:139-147` (campo `memberBranchName`).

---

### `el-templo-api/src/modules/wellhub/service.ts` (D-18 #10-#11)

**Analog:** si mismo.

- `:364-374` guard uno-por-dia: agregar `inArray(schema.attendance.source, ["wellhub","wellhub_manual"])` (compara solo contra asistencia Wellhub, hallazgo A1). Mantiene el test existente "segundo checkin del dia -> already_checked_in" (`test/wellhub/webhook-checkin.test.ts`).
- `:419-439` `todayBooking`: agregar `eq(schema.bookings.source, "wellhub")` al `and(...)` junto a `inArray(schema.bookings.status, ["reservado","qr_escaneado"])`.

---

### `el-templo-api/src/db/schema/wellhub.ts` (+ `wellhubConversions`)

**Analog:** `wellhubBookings` en el mismo archivo (lineas 82-120).

```typescript
export const wellhubBookings = mysqlTable("wellhub_bookings", {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    userId: int("user_id").references(() => users.id).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [ index("idx_wellhub_bookings_user").on(table.userId) ],
);
```
**Copiar:** `tenantIdColumn()` con el comentario de una linea, `.references(() => ...)`, indices con prefijo `idx_wellhub_conversions_*`. La `uniqueIndex` va **compuesta con `tenantId` primero** (`tenantId, userId, subscriptionId`): las tres unique existentes del archivo son globales por excepcion M8 (ids externos) y NO son modelo para esta. Agregar `import { subscriptions } from "./subscriptions"; import { subscriptionPlans } ...` y relaciones al final como las demas.

**Enum attendance** (`schema/attendance.ts:24-28`): agregar `"wellhub_manual"` ULTIMO, byte-identico al `MODIFY COLUMN` de la 0300. Actualizar el comentario de arriba del enum.

---

### `el-templo-api/src/db/migrations/0300_wellhub_usuarios.sql`

**Analog:** `0286_extra_blocks_completed.sql` (cabecera + `CREATE TABLE`) y `0186_wellhub_integration.sql` (ALTER del enum).

**Cabecera** (0286, lineas 1-33): nombre de archivo, fase/decision, "Cero datos de prueba (staging y prod comparten servidor MySQL)", "Hand-written: nunca drizzle-kit push/migrate", razon de la numeracion, y:
```sql
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.
```
**Reglas:** ningun `;` dentro de un `--`; sin comentarios `--` en linea dentro del `CREATE TABLE` (RESEARCH los muestra "ilustrativos"); `tenant_id int NOT NULL DEFAULT 1`; FK `fk_wellhub_conversions_tenant`. Re-verificar el numero contra TODAS las refs antes de commitear (`feat/201-conquer` tiene 0298/0299; master y staging llegan a 0297):
```bash
git ls-tree -r --name-only origin/master origin/staging feat/201-conquer -- el-templo-api/src/db/migrations | sort | tail
```

---

### `el-templo-api/src/db/tenant-tables.ts` + conteos de tenancy

**Analog:** las filas `wellhub_*` ya presentes.

- `tenant-tables.ts` ~181-184: insertar `"wellhub_conversions",` en `GYM_OWNED_TABLES` en orden alfabetico (entre `wellhub_classes` y `wellhub_events`).
- `tenant-tables.ts` 686-690: agregar al array `wellhub: [...]` de `TENANT_STRICT_MODULES` (el array actual es `wellhub_bookings, wellhub_classes, wellhub_events, wellhub_slots`).
- `test/helpers.ts` `TABLES_TO_CLEAN` (~196): agregar `schema.wellhubConversions` ANTES de `schema.wellhubBookings`... y antes de `users`/`subscriptions` (FK).
- Conteos: `test/db/tenant-tables.test.ts:124,129` (104->105, 109->110), `test/migrations/0192-0195-tenant-columns.test.ts:182` (104->105), `test/migrations/0196-tenant-unique-contracts.test.ts:643-644` (conteo + texto del mensaje). Hacer todo en el MISMO commit que la tabla.
- Rutas nuevas: `test/tenant-manifest.ts` (agregar entradas `"GET /api/admin/members/:userId/wellhub"`, `"POST /api/admin/members/:userId/app-access"`, `"POST /api/admin/members/:userId/wellhub-merge"`, `"GET /api/admin/reports/wellhub": { categoria: "tenant-scoped" }`, con comentario de fase como el de `referrals/invitations/report` en `:649-655`), `ENTRADAS_BASELINE` (`iso-01-manifiesto.test.ts:349`, 478 -> 482) y el titulo del `it`; `CASOS_BASELINE` (`iso-03-cobertura-members.test.ts:192`, 35 -> 38) mas un caso ISO-03 por ruta de members en `iso-03-members-ficha.test.ts` (dos `it` por caso: aislamiento 404 + control positivo; ver cabecera del archivo).

---

### `el-templo-api/src/modules/reports/wellhub-report-service.ts` + ruta `GET /wellhub`

**Analog:** `referrals/invitation-report.ts` (cabecera 1-45) y `referrals/admin-routes.ts:94-105`.

**Imports y cabecera** (invitation-report.ts 24-36):
```typescript
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, shiftMonth, todayInTz } from "../shared/date-utils";
import { BadRequestError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { CountryCode } from "../shared/country-scope";
type DbInstance = MySql2Database<typeof schema>;
```
Docblock de cabecera con "AISLAMIENTO: `tenantWhere` en cada tabla de cada statement" y el bloque de MES (fecha local de la sede, no `DATE_FORMAT` del servidor). Validar `month` con `BadRequestError` (patron `^\d{4}-\d{2}$`). `wellhub_conversions.local_date` ya viene en tz de la sede; `attendance.session_date` y `bookings.booking_date` tambien son locales.

**Ruta** (admin-routes.ts 94-105): `fastify.get<{ Querystring: ... }>("/wellhub", { schema: ..., preHandler: [requireBranchAccess({from:"query.branchId", optional:true}), enforceBranchScope({from:"query.branchId"})] }, async (request) => { const ctx = assertTenant(request.scope, "reports.wellhub"); return service.getReport(ctx, {...}); })`. Los preHandlers vienen de `reports/routes.ts:111-130` (`GET /access`); el plugin ya aplica `CAJA_ROLES` + `attachCountryScope` (`:94-103`).

**Filtro `source` del log de accesos** (D-14): `reports/service.ts:3292`:
```typescript
if (filters.source) { conditions.push(eq(schema.attendance.source, filters.source)); }
```
pasa a `filters.source === "wellhub" ? inArray(schema.attendance.source, ["wellhub","wellhub_manual"]) : eq(...)`. Actualizar los enums de `reports/schemas.ts:63` (query) y `:81` (response, `["qr","manual","wellhub","wellhub_manual"]`), el tipo en `routes.ts:117`/`types.ts`, el export xlsx "Fuente" (`service.ts:654`).

---

### `el-templo-admin/src/composables/useStatusBadge.ts` (+ tipos)

**Analog:** si mismo (lineas 21-34). Las dos `Record<UserStatus, string>` fuerzan exhaustividad por tipo, asi que `tsc` marca cada mapa que falte:
```typescript
const STATUS_COLOR: Record<UserStatus, string> = {
  freemium: 'info', prueba: 'warning', activo: 'positive', inactivo: 'grey',
  wellhub: 'secondary',   // Clay, calido, sin azul (reference_brand_palette)
};
const STATUS_LABEL: Record<UserStatus, string> = { ..., wellhub: 'Wellhub' };
```
`getLabel(status, hasUsedTrial?)` (linea 47) recibe un segundo parametro posicional: agregar un tercero `showWellhubLabel?` o, mejor, un helper puro en `utils/wellhub-label.ts` que devuelva `"Inactivo · Wellhub"` (testeable sin Vue). Cambiar `UserStatus` en `types/member.ts:102` y `useMembersApi.ts:55,82` (tsc/`vue-tsc` marca el resto; CI NO typechequea el admin, correr `vue-tsc` local).

---

### `el-templo-admin/src/pages/AlumnosPage.vue` (toggle "Solo Wellhub")

**Analog:** toggle "Solo deudores" (lineas 90-95), estado `filters.debtorOnly` (500), query (863).

```vue
<div v-if="!financeBlind" class="col-6 col-sm-3 col-md-3 items-center">
  <q-toggle v-model="filters.debtorOnly" label="Solo deudores" color="negative"
    @update:model-value="onFilterChange" />
</div>
```
**Copiar:** mismo `q-toggle` + `@update:model-value="onFilterChange"`, `filters.wellhubOnly: false as boolean` (como 500), y `wellhubOnly: filters.wellhubOnly || undefined` en los params (como 863). **NO** heredar el `v-if="!financeBlind"` (el toggle debe verse para roles sin plata). Ponerlo en una columna propia al lado. La columna Estado del listado usa el helper de label.

---

### `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue` (chip + boton)

**Analog:** el badge "Visita · Sede" (lineas 322-326) y "PRUEBA" (476-481) junto al boton de borrar (338-346, 528-536).

```vue
<q-badge v-if="isVisitorBooking(booking)" color="warning"
  :label="`Visita · ${booking.memberBranchName}`" class="q-ml-xs" />
...
<q-btn flat dense round icon="delete" color="negative" size="sm" @click="onRemoveBooking(booking.id)">
  <q-tooltip>Eliminar reserva</q-tooltip>
</q-btn>
```
**Copiar:** `<q-badge color="secondary" label="Wellhub" class="q-ml-xs" />` con `v-if="booking.source === 'wellhub'"` (lista futura) o `member.isWellhub` (lista de hoy); en cada boton `delete` (343, 392, 442, 530) agregar `:disable="isWellhubBooking(...)"` y cambiar el `<q-tooltip>` por "Se gestiona desde la app de Wellhub". El boton "Marcar asistencia" (521) queda habilitado. Tipos: `types/attendance.ts:36-50` `SlotAttendanceItem` += `isWellhub: boolean`; tipo del booking de `scheduling` += `source`.

---

### `el-templo-admin/src/pages/CobrosPage.vue` (D-09)

**Analog:** `buildMemberOption` (2005-2034) y `onMemberSelected` (2179).

**Copiar** el shape `MemberSearchOption` y agregar `isWellhub: m.showWellhubLabel === true` al return; en `onMemberSelected` y en el prefill `?memberId=` (2488-2500) abrir `$q.dialog({ title, message, ok: { label: 'Ir a la ficha' }, cancel })` y `router.push('/alumnos/' + id)` + limpiar la seleccion (mismo `$q.dialog` que `AlumnoDetailPage.vue:1466-1475`). Bloquea los tres modos (alta/renovacion/suelto).

---

### `el-templo-admin/src/pages/AlumnoDetailPage.vue` + `components/members/WellhubCard.vue`

**Analog (flujo post-conversion):** `AlumnoDetailPage.vue` 1466-1480 y `AssignPlanDialog` (725-735).

```typescript
$q.dialog({
  title: '¿Cargar membresía?',
  message: `${nombre} pasó a legajo. ¿Querés cargarle la membresía ahora?`,
  cancel: { flat: true, label: 'Más tarde' },
  ok: { color: 'primary', label: 'Cargar membresía' },
}).onOk(() => { postConvertAssignTarget.value = updated; showAssignFromConvert.value = true; });
```
**Copiar:** CTA "Asociar al templo" abre `AssignPlanDialog` con los mismos props (`:userId`, `:memberBranchId`, `:memberBranchName`, `:boardingPassUsed="false"`, `:memberBranchIsVirtual`), gateado con `!financeBlind`. En `@assigned`, si `!card.hasLoggedIn`, segundo `$q.dialog` "¿Enviarle el acceso a la app?" que llama a `POST /admin/members/:id/app-access`. La card va ARRIBA de `<q-tabs>` (371), dentro del `<template v-if="memberProfile.status !== 'prueba'">` (la ficha Wellhub tiene status `wellhub`, asi que los tabs se ven; ocultar/atenuar los que requieren plan con `v-if="!financeBlind"` ya presente en 374/387/389).

**Composable:** `composables/useWellhubApi.ts` copiando `useInvitationReportApi.ts` (refs `loading`/`error`, `api.get<T>(...)`, `extractError`, `createLogger`, `log.warn`, rethrow, `cleanup()` sin `onUnmounted`).

---

### `el-templo-admin/src/components/reports/WellhubReport.vue` + `ReportesPage.vue`

**Analog:** `components/reports/InvitationsReport.vue` (selectores de mes 1-35, `KpiCard` 40-52, `q-table` 57-75, script 164-190) y el tab en `ReportesPage.vue:80-86`:
```vue
<q-tab v-if="invitationsTabVisible" name="invitaciones" label="Invitaciones" icon="card_giftcard" />
```
**Copiar:** `import KpiCard from 'src/components/comunicaciones/KpiCard.vue'`, `import { createLogger } ...`, `extractError`, `formatDate`, selector de mes con `q-select`, `<q-tab name="wellhub" label="Wellhub" icon="..."/>` y su `<q-tab-panel>`. Selector de sede para el filtro `branchId` (reuso de las opciones que ya arma `InvitationsReport`). Para el filtro de fuente del log de accesos: `ReportesPage.vue:1047-1051, 1141-1145, 1165, 1194` y `types/report.ts:17,75`; `types/attendance.ts:8,29-32` (`AttendanceSource` += `'wellhub' | 'wellhub_manual'`, `sourceLabels` += `Wellhub` / `Wellhub (a mano)`); `MemberAttendanceTab.vue:51-55` (el `:color` hoy es `source === 'qr' ? 'info' : 'grey-7'`, agregar rama Wellhub).

---

## Shared Patterns

### Aislamiento de tenant (toda query y todo insert nuevo)
**Fuente:** `src/modules/shared/tenant.ts` (`tenantWhere`, `tenantValues`, `assertTenant`); ejemplo en `invitation-conversion.ts:104-135`.
**Aplica a:** conversion.ts, member-wellhub-service.ts, wellhub-report-service.ts, las 4 rutas nuevas, y cada tabla que toque el merge.
```typescript
.where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, id)))
```
SQL crudo: `x.tenant_id = ${ctx.tenantId}` INLINE en el mismo `sql` que nombra la tabla; en tests, `tenantWhere(table, TEMPLO_CTX)` (el sentinel lanza). Nunca tocar `tenant-lint-allowlist.json`.

### Filtro y proyeccion con un unico fragmento
**Fuente:** `members/service.ts:367-382` + `:468`. **Aplica a:** `wellhubOnly`, `showWellhubLabel`, `isWellhub` en list/search/export/detail. Lo que filtra es lo que se marca.

### NULL-safety de `bookings.source`
**Fuente:** nuevo helper `wellhub-sources.ts`. **Aplica a:** los 8 sitios de contadores/QR del API. Jamas `ne(bookings.source, 'wellhub')`.

### Response schemas declaran todo campo nuevo
**Fuente:** `attendance/schemas.ts:105-140`, `scheduling/schemas.ts:139-147`, `members/schemas.ts:28,84,259`. **Aplica a:** `source`, `isWellhub`, `showWellhubLabel`, card, report. Cada campo nuevo lleva su aserción en un test `app.inject` (no llamada de servicio).

### Params numericos con `type: integer`
**Fuente:** `resetMemberPasswordSchema` (members/schemas.ts). **Aplica a:** `:userId`, `targetUserId` del body (FA-07).

### Logging y errores
`request.log.info/error`, `this.log.info({ids}, "mensaje en castellano")`; `catch (err: unknown)`. Errores de dominio: `NotFoundError`, `ConflictError`, `BadRequestError` de `shared/errors`. Admin: `createLogger('nombre')`, `extractError(err, 'fallback')`.

### Audit
`auditLog.write(ctx, tx, {...})` SIEMPRE dentro de `db.transaction`; actor explicito desde `request.user.userId`.

### Migracion + schema en el mismo commit
`.sql` y `schema/*.ts` byte-identicos (enum append-last, nombre fisico `attendance_source`); test de migracion con `enumValues()` de `0285-0286-extra-blocks.test.ts`.

### Tests
- API: integracion contra MySQL real; fixtures nuevos con `createTestMember` / `assignTestPlan` (`test/helpers.ts:555,736`), nunca ids hardcodeados, fechas con `todayInTz(branch.timezone)`.
- Webhook: copiar `sign`, `checkinPayload`, `stubValidateFetch`, `uniqueGymId`, `uniqueToken` de `test/wellhub/webhook-checkin.test.ts:48-125` a `test/fixtures/wellhub-personas.ts` y que los tres archivos los importen (DRY).
- No correr la suite completa local (la corre CI).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `el-templo-admin/src/components/members/WellhubMergeDialog.vue` | component | CRUD (buscar alumno destino + confirmar) | No hay dialogo de "unir/fusionar" en el admin. Usar de base `InvitationCreateDialog.vue` (q-dialog + form + extractError) y un `q-select` con busqueda (typeahead de `CobrosPage.vue` `onMemberSearch`, ~2040). El destino se busca con `GET /admin/members/search`. |
| Transaccion de merge (reapuntar FKs `bookings`, `attendance`, `wellhub_bookings`, `member_notes`) | service | transaccional multi-tabla | No existe merge de usuarios en el API. Se arma con `db.transaction` + `auditLog.write` + variante `tx` de `softDeleteMember`; el orden (NULL en `gympass_id` del origen antes de ponerlo en el destino) y las colisiones del unique `(member_id, schedule_id, booking_date)` (`schema/bookings.ts:67`) estan especificados en RESEARCH Pattern 6. |

## Notas para el planner

1. **Ruta de `SlotDetailDialog.vue`:** `components/scheduling/SlotDetailDialog.vue`. La ruta sin subdirectorio de CONTEXT/RESEARCH no existe.
2. **Orden de tablas en `TABLES_TO_CLEAN`:** `wellhubConversions` referencia `subscriptions` y `users`; el comentario de `helpers.ts` aclara que las FK estan deshabilitadas, pero mantener el orden correcto.
3. **Conflictos de merge con staging:** `origin/staging` tiene otros baselines (`GYM_OWNED_TABLES` 114/119, `ENTRADAS_BASELINE` 516); aplicar los mismos deltas (+1 tabla, +4 entradas, +3 casos) sobre esos numeros al integrar.
4. **`recomputeUserStatus` tiene 11 callers:** el hook solo corre con `ctx !== null` y ya esta acotado por la guarda de transicion `before != activo -> after = activo`; no agregar envio de email ahi (es post-commit).
5. **Lineas de RESEARCH ya confirmadas en este worktree:** `mark-no-shows.ts:149-252`, `attendance/service.ts:126-150/241/292/880/925-1000/1418`, `booking-service.ts:1063/2400`, `members/service.ts:123/367-382/468`, `members/routes.ts:495-540/1628-1700`, `subscriptions/service.ts:7723/7888-7895`, `wellhub/service.ts:364/419-439/1020-1075`. Sin verificar en esta pasada (confiar en RESEARCH y revalidar con grep al ejecutar): `booking-service.ts:415/526/1191/2011/2555/2587`, `reports/service.ts:3292` (confirmado), `attendance/service.ts:1023`, `analytics/funnel-service.ts:119-149`.

## Metadata

**Analog search scope:** `el-templo-api/src/{modules,jobs,db}`, `el-templo-api/test/{wellhub,attendance,tenancy,migrations,fixtures}`, `el-templo-admin/src/{pages,components,composables,types,utils}`
**Files scanned:** ~45 leidos total o parcialmente, mas greps de localizacion
**Pattern extraction date:** 2026-10-27
