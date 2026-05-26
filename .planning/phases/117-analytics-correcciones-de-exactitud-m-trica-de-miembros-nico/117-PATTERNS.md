# Phase 117: Analytics — correcciones de exactitud + miembros únicos - Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 14 (8 nuevos, 6 modificados)
**Analogs found:** 14 / 14

> Todos los paths son absolutos desde la raíz del repo. Backend en
> `el-templo-api/`, frontend admin en `el-templo-admin/`. Las decisiones (D-01…D-18)
> referencian `117-CONTEXT.md`.

---

## File Classification

| Archivo nuevo/modificado                                                                                            | Rol                            | Data Flow        | Analog más cercano                                                                       | Calidad de match       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| `el-templo-api/src/modules/shared/active-member.ts` (NUEVO)                                                         | utility (SQL predicate helper) | transform        | `subscriptions/service.ts:4115` `recomputeUserStatus` EXISTS                             | exact (misma lógica)   |
| `el-templo-api/src/modules/analytics/scope.ts` (NUEVO)                                                              | utility (query helper)         | transform        | bloques `branchId/country + innerJoin branches` repetidos ~15x en `analytics/service.ts` | exact (extracción)     |
| `el-templo-api/src/modules/analytics/engagement-service.ts` (NUEVO)                                                 | service (domain)               | CRUD/read-agg    | `analytics/service.ts` AnalyticsService + `segmentation/service.ts`                      | role-match             |
| `el-templo-api/src/modules/analytics/attendance-metrics-service.ts` (NUEVO)                                         | service (domain)               | CRUD/read-agg    | `analytics/service.ts` métodos de attendance                                             | role-match             |
| `el-templo-api/src/modules/analytics/finance-metrics-service.ts` (NUEVO)                                            | service (domain)               | CRUD/read-agg    | `getOutstandingByCurrency` (`analytics/service.ts:929`)                                  | exact (patrón moneda)  |
| `el-templo-api/src/db/schema/user-status-history.ts` (NUEVO)                                                        | model (schema)                 | event-driven     | `el-templo-api/src/db/schema/refresh-tokens.ts`                                          | exact                  |
| `el-templo-api/src/db/migrations/0128_create_user_status_history.sql` (NUEVO)                                       | migration (DDL)                | —                | `0125_create_refresh_tokens.sql`                                                         | exact                  |
| `el-templo-api/src/db/migrations/0129_backfill_user_status_history.sql` (NUEVO)                                     | migration (data)               | batch            | `0127_fix_legacy_plan_duration_days.sql`                                                 | role-match (data prod) |
| `el-templo-api/src/modules/analytics/service.ts` (MODIF)                                                            | service                        | CRUD/read-agg    | sí mismo (correcciones in-place)                                                         | self                   |
| `el-templo-api/src/modules/analytics/types.ts` (MODIF)                                                              | model (types)                  | —                | sí mismo                                                                                 | self                   |
| `el-templo-api/src/modules/analytics/routes.ts` (MODIF)                                                             | route                          | request-response | sí mismo (4 GET existentes)                                                              | self                   |
| `el-templo-api/src/modules/subscriptions/service.ts` (MODIF)                                                        | service (hook)                 | event-driven     | `recomputeUserStatus` (`:4115`)                                                          | self                   |
| `el-templo-api/test/analytics/analytics.test.ts` (MODIF)                                                            | test                           | —                | sí mismo                                                                                 | self                   |
| `el-templo-admin/src/components/analytics/AsistenciaTab.vue` + `MiembrosTab.vue` + `src/types/analytics.ts` (MODIF) | component                      | request-response | sí mismos + `MiembrosTab` attentionList                                                  | self                   |

---

## Shared Patterns

### Predicado canónico de "activo" (D-01, D-02, D-06)

**Fuente:** `el-templo-api/src/modules/subscriptions/service.ts:4119-4125` (dentro de `recomputeUserStatus`)
**Aplicar a:** `countActiveMembers` (`:191`), `getPlanDistribution` (`:396`), `countNewMembers` "nuevos activos" (`:269`), engagement-service, finance-metrics (devengado en 118).

El EXISTS canónico — copiar tal cual al nuevo helper:

```sql
EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.user_id = u.id
    AND s.subscription_status IN ('active','paused')
    AND s.start_date <= CURDATE()
    AND (s.end_date IS NULL OR s.end_date >= CURDATE())
)
```

**Forma del helper nuevo** (`shared/active-member.ts`): exportar un fragmento `sql` reusable de Drizzle (no una entidad). Patrón de import del módulo (de `analytics/service.ts:9-12`):

```typescript
import { sql } from "drizzle-orm";
import * as schema from "../../db/schema";
// activeMemberExists(userIdColumn) => SQL`EXISTS ( ... s.user_id = ${userIdColumn} ... )`
```

Reemplaza `eq(schema.users.status, "activo")` (`analytics/service.ts:201`) por el EXISTS → excluye los ~48 fantasmas (692 vs 749). Mantener `eq(schema.users.role, "member")`.

### Separación por moneda (D-05, D-17)

**Fuente:** `el-templo-api/src/modules/analytics/service.ts:929-969` `getOutstandingByCurrency` y el doc-comment de `types.ts:82-88` ("Currencies are NEVER summed across").
**Aplicar a:** `sumRevenue` (`:975`), `getRevenueTrend` (`:773`), `getRevenueByMethod` (`:822`), `getRevenueByBranch` (`:873`).

Patrón exacto a replicar (groupBy currency, mapear a objeto `{ ARS: 0, EUR: 0 }`):

```typescript
const rows = await this.db
  .select({
    currency: schema.balances.currency,
    total: sql<number>`COALESCE(SUM(${schema.balances.amount}), 0)`,
  })
  .from(...)
  .where(and(...conditions))
  .groupBy(schema.balances.currency);

const result: OutstandingByCurrency = { ARS: 0, EUR: 0 };
for (const row of rows) {
  if (row.currency === "ARS" || row.currency === "EUR") {
    result[row.currency] = Number(row.total);
  }
}
```

Para revenue la columna de moneda vive en `financial_transactions` (verificar nombre exacto en `db/schema/financial-transactions.ts` durante planning). El tipo `revenueTrend`/`revenueByMethod`/`revenueByBranch` en `types.ts:74-89` debe cambiar de `number` a una forma por-moneda (decisión de tipos para el planner).

### Scope branch/país → `applyScope` (D-09)

**Fuente:** el bloque repetido en `analytics/service.ts` (ej. `:199-214`, `:275-292`, `:512-544`, `:728-760`). Hoy son dos sabores:

1. condiciones simples + `innerJoin(branches)` siempre (ej. `countActiveMembers`).
2. join condicional: `country !== undefined ? base.innerJoin(branches)...where(...) : base.where(...)` (ej. `getDailyCheckins` `:531-544`, `getNoShowRate` `:752-760`).

El helper `applyScope(query, { branchId, country, branchColumn })` debe absorber ambos. Scope real proviene de `request.scope` (`shared/country-scope.ts`: `country: "AR"|"ES"|null`, `branchIds: number[]`, `isOwner`). Firma exacta → discreción del planner (D-09).

### Lista nominal con WhatsApp (D-12, D-14, D-16)

**Fuente backend:** `getAttentionList` (`analytics/service.ts:434-500`) — select de `userId/firstName/lastName/planName/phone`, map a `AttentionMember`, sort por urgencia, `slice(0,20)`.
**Fuente frontend:** `el-templo-admin/src/components/analytics/MiembrosTab.vue` — tabla `attentionList` (`:78-79`), label vence/mora (`:103-104`), botón WhatsApp `openWhatsApp` (`:299-301`):

```typescript
const cleaned = member.phone.replace(/\D/g, "");
window.open(`https://wa.me/${cleaned}`, "_blank");
```

Las listas de engagement (`en_riesgo`/`ghost`) y de vencidos reutilizan este mismo tipo + render.

### Convenciones de proyecto (CLAUDE.md)

- **Logging:** `this.log` (FastifyBaseLogger inyectado por constructor) en services; nunca `console.log`. Frontend: `createLogger()` de `el-templo-admin/src/utils/logger.ts`.
- **TypeScript:** sin `any`; `catch (err: unknown)` con narrowing. Las rutas usan `handleServiceError(err, reply, request.log, "...")` (`analytics/routes.ts:62-64`).
- **DI:** services con `constructor(private db, private log)` (`analytics/service.ts:27-31`, `segmentation/service.ts:24-28`).

---

## Pattern Assignments

### `shared/active-member.ts` (utility, NUEVO)

**Analog:** `subscriptions/service.ts:4115` (predicado). Ver "Shared Patterns → Predicado canónico". Exportar fragmento `sql` parametrizado por la columna user_id; sin clase ni DI. Tests: caso "activo con sub vigente" / "fantasma con sub vencida excluido" (D-18).

---

### `analytics/scope.ts` (utility, NUEVO)

**Analog:** los ~15 bloques de `analytics/service.ts`. Extraer ambos sabores (join siempre / join condicional). Ver "Shared Patterns → applyScope".

---

### `analytics/engagement-service.ts` (service, NUEVO — D-12, D-13)

**Analog estructural:** `segmentation/service.ts:24-28` (DI) + lectura de `member_profiles.segment`.

**REUTILIZA, no recalcula.** El segmento ya está persistido en `member_profiles.segment`
(`db/schema/member-profiles.ts:67`, enum `memberSegmentEnum` `:40`; 6 valores en
`segmentation/types.ts:10-18`). Engagement solo **agrega**:

- Conteo de **activos** (helper canónico) por `segment`, agrupado.
- Lista nominal de `en_riesgo`/`ghost` (mismo select que `getAttentionList`).
- Ratio de check-in por sede (Parte B, D-13): `confirmados con check-in ÷ total confirmados`. El enum de booking correcto es `'confirmado'` (ver D-04). Warning <50% es lógica de frontend.

Patrón de lectura de segmento (de `segmentation/service.ts:279-283`):

```typescript
.select({ segment: schema.memberProfiles.segment, ... })
.from(schema.memberProfiles)
.where(eq(schema.memberProfiles.userId, userId))
```

---

### `analytics/attendance-metrics-service.ts` (service, NUEVO — D-11)

**Analog:** `getDailyCheckins` (`analytics/service.ts:506-550`) y la extensión de
`getAttendanceAnalytics` (`:109-125`).

**Miembros únicos 7/14/30:** `COUNT(DISTINCT member_id)` sobre `attendance` por ventana,
respetando scope vía `applyScope`. Reemplazar `DATE(checked_in_at)` por rangos
`>= dateFrom AND < dateTo+1` (D-08, evita anular el índice; hoy en `:513`, `:1021`).

---

### `analytics/finance-metrics-service.ts` (service, NUEVO — D-05, prep 118)

**Analog:** `getOutstandingByCurrency` (`:929`). Ver "Shared Patterns → Separación por moneda".

---

### `db/schema/user-status-history.ts` (model, NUEVO — D-10)

**Analog:** `el-templo-api/src/db/schema/refresh-tokens.ts` (tabla nueva, FK a users
ON DELETE CASCADE, índice por user_id, header comment con fase).

Patrón a copiar (de `refresh-tokens.ts:32-49`):

```typescript
export const userStatusHistory = mysqlTable(
  "user_status_history",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // fromStatus / toStatus: usar userStatusEnum (users.ts:49: freemium/prueba/activo/inactivo)
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => [index("idx_user_status_history_user_id").on(table.userId)],
);
```

Columnas exactas e índices → discreción del planner (D-10). Recordar registrarla en
`db/schema/index.ts`. El enum de status: importar `userStatusEnum` de `./users` (`users.ts:49`).

---

### `db/migrations/0128_create_user_status_history.sql` (migration DDL, NUEVO — D-10)

**Analog:** `0125_create_refresh_tokens.sql`. `CREATE TABLE` sin `IF NOT EXISTS` (patrón
del proyecto), nombres de constraint Drizzle-convergentes, header con rationale.
**CRÍTICO (memoria + 0125:14-18):** NUNCA `;` dentro de comentarios `--` — el runner
splittea por `;` antes de strippear comentarios. Flujo: `pnpm db:generate` para inspirar,
pero la SQL se escribe a mano y se aplica con `pnpm db:migrate` (NUNCA `drizzle-kit migrate`;
`_migrations` table es la fuente de verdad).

### `db/migrations/0129_backfill_user_status_history.sql` (migration data, NUEVO — D-10)

**Analog:** `0127_fix_legacy_plan_duration_days.sql` (cambio de datos prod, idempotente,
header explicando seguridad). Backfill aproximado desde `users.created_at` + primera
`subscriptions.created_at`. Mismas reglas de `;` en comentarios. Commitear junto al schema.

---

### `analytics/service.ts` (MODIF — bugs in-place)

| Bug          | Línea                       | Fix                                                                         |
| ------------ | --------------------------- | --------------------------------------------------------------------------- |
| D-04 no-show | `getNoShowRate:731`         | `'confirmed'` → `'confirmado'` (enum real `bookingStatusEnum`)              |
| D-02 activos | `countActiveMembers:201`    | usar helper canónico en vez de `users.status='activo'`                      |
| D-06 trend   | `countNewMembers:269`       | contar solo nuevos **activos** (predicado canónico)                         |
| D-07 planes  | `getPlanDistribution:396`   | filtrar `is_archived` + groupBy `(name, country)` (hoy `:426` groupBy name) |
| D-05 revenue | `:773/:822/:873/:975/:1001` | separar por moneda (patrón `getOutstandingByCurrency`)                      |
| D-08 perf    | `:277, :513, :1021`         | `DATE(col)` → rangos `>= dateFrom AND < dateTo+1`                           |

El split del monolito existente queda para v4.9 (NO en 117). Los domain services nuevos son
solo para lo nuevo (D-09).

### `analytics/routes.ts` (MODIF — request-response)

**Analog:** los 4 GET existentes (`:42-147`). Mismo guard `onRequest` (ADMIN_ROLES +
`attachCountryScope`), mismo `requireBranchAccess({ from: "query.branchId", optional: true })`,
mismo `try/catch` + `handleServiceError`. Nuevos endpoints (únicos/engagement/ratio) instancian
los domain services nuevos junto a `AnalyticsService` (`:25`).

### `analytics/types.ts` (MODIF — D-14)

Completar `AttentionMember` (`:25-34`): `type` pasa de `"expiring"` a unión
`"expiring" | "overdue"`, `daysOverdue` deja de ser siempre `null`. Agregar tipos de
engagement (segmento + lista) y de únicos. Tipos de revenue → por moneda (ver D-05).

### `subscriptions/service.ts` (MODIF — hook D-10)

**Analog:** el propio `recomputeUserStatus` (`:4115`). Agregar hook **forward-only** que
inserte en `user_status_history` cuando el status transiciona. Cuidado con el orden de
asignación LEFT-TO-RIGHT documentado en `:4107-4114`.

### Frontend admin (MODIF)

**Analogs:**

- `AsistenciaTab.vue:1-70` — patrón de stat card destacada (no-show `:24-34`) → reusar para
  KPI de únicos 7/14/30; warning visual de ratio <50% (D-13).
- `MiembrosTab.vue` — tabla attentionList (`:78`), label vence/mora (`:103-104`), WhatsApp
  (`:299-301`) → reusar para vencidos con buckets (D-14) y listas engagement (D-12).
- `src/types/analytics.ts` — espejo de los tipos backend (`AttentionMember:23`, etc.).
- Página contenedora: `el-templo-admin/src/pages/AnaliticasPage.vue` (orquesta tabs).
- Badges de segmento: NO duplicar — `el-templo-admin/src/pages/AlumnosPage.vue` ya los tiene.

Logging frontend con `createLogger()` de `src/utils/logger.ts`.

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{analytics,subscriptions,segmentation,admin,shared}`, `el-templo-api/src/db/{schema,migrations}`, `el-templo-api/test/analytics`, `el-templo-admin/src/{components/analytics,pages,types}`
**Files scanned:** ~25
**Pattern extraction date:** 2026-05-26
