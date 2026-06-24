# Phase 143: Profesor por clase + Puntuación post clase presencial - Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 17 new/modified files (8 backend, 5 admin, 4 member app)
**Analogs found:** 17 / 17 (every file has a concrete in-repo analog)

> No RESEARCH.md — file list derived from `143-CONTEXT.md` (decisions D-M*/D-P*/D-A*/D-Q*/D-O\*) and `143-UI-SPEC.md` (3 surfaces).
> This is a mature brownfield codebase. Every analog below is REAL code in the repo, cited with line ranges. Copy the patterns, do not invent new ones.

---

## File Classification

| New/Modified File                          | App   | Role                  | Data Flow                 | Closest Analog                                                                  | Match Quality                                   |
| ------------------------------------------ | ----- | --------------------- | ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/db/schema/class-coach-assignments.ts` | api   | model (schema)        | CRUD                      | `src/db/schema/schedules.ts` + `user-branches.ts`                               | exact (composite-key weekly junction)           |
| `src/db/schema/coach-ratings.ts`           | api   | model (schema)        | event-driven (append log) | `src/db/schema/attendance.ts`                                                   | exact (append-only, branch/member/session-date) |
| `src/db/schema/index.ts`                   | api   | config (barrel)       | n/a                       | `src/db/schema/index.ts` (self)                                                 | exact (add 2 `export *` lines)                  |
| `src/db/migrations/0152_*.sql`             | api   | migration             | n/a                       | `src/db/migrations/0142_create_exercise_adjustments.sql`                        | exact (additive CREATE TABLE)                   |
| `src/modules/ratings/service.ts`           | api   | service               | CRUD + attribution query  | `src/modules/coach/service.ts`                                                  | role-match (scoped read + write service)        |
| `src/modules/ratings/routes.ts`            | api   | route                 | request-response          | `src/modules/attendance/routes.ts` (admin + member plugins) + `coach/routes.ts` | exact                                           |
| `src/modules/ratings/schemas.ts`           | api   | config (validation)   | n/a                       | `src/modules/coach/schemas.ts`                                                  | exact                                           |
| `src/modules/ratings/types.ts`             | api   | model (types)         | n/a                       | `src/modules/coach/types.ts`                                                    | exact                                           |
| `src/modules/ratings/index.ts`             | api   | config (barrel)       | n/a                       | `src/modules/coach/index.ts`                                                    | exact                                           |
| `src/app.ts` (modify)                      | api   | config (registration) | n/a                       | `src/app.ts` lines 168–206                                                      | exact                                           |
| `test/ratings/*.test.ts`                   | api   | test                  | n/a                       | `test/coach/outstanding-balances.test.ts`                                       | exact                                           |
| `HorariosPage.vue` (modify)                | admin | component             | CRUD                      | `HorariosPage.vue` (self — extend week/branch grid)                             | exact                                           |
| `composables/useRatingsApi.ts`             | admin | service (api client)  | CRUD                      | `composables/useCoachApi.ts`                                                    | exact                                           |
| `pages/PuntuacionesPage.vue`               | admin | component             | CRUD (read)               | `pages/DeudasPage.vue`                                                          | exact (QTable list + average)                   |
| `components/RatingPromptDialog.vue`        | app   | component             | event-driven (trigger)    | `components/PushPermissionDialog.vue`                                           | exact (self-mounting one-shot dialog)           |
| `MainLayout.vue` (modify)                  | app   | component             | n/a                       | `MainLayout.vue` line 135 (mount dialog)                                        | exact                                           |
| `composables/useRatingsApi.ts`             | app   | service (api client)  | request-response          | `composables/useAttendanceApi.ts`                                               | exact                                           |
| coach QR self-scan                         | app   | flow (reuse)          | request-response          | `pages/CheckInPage.vue` + `useAttendanceApi.checkIn`                            | reuse as-is                                     |

---

## Pattern Assignments

### `src/db/schema/class-coach-assignments.ts` (model, weekly junction)

**Analog:** `src/db/schema/schedules.ts` (lines 16–42) + `src/db/schema/user-branches.ts` (lines 24–40)

The roster table is a per-week assignment: `(branchId, weekStartDate, dayOfWeek, slot 'morning'|'afternoon') → coachId`. Use `schedules.ts`'s `mysqlTable(name, {cols}, (table) => [index(...)])` shape and `dayOfWeek` as `tinyint` (line 26 comment: `1=Monday..6=Saturday (ISO)`). Use `user-branches.ts`'s `uniqueIndex` for the composite natural key so one coach per slot per week is enforced at the DB level.

**Schema style to copy** (schedules.ts lines 16–42):

```typescript
export const schedules = mysqlTable(
  "schedules",
  {
    id: int("id").primaryKey().autoincrement(),
    branchId: int("branch_id").references(() => branches.id).notNull(),
    activityId: int("activity_id").references(() => activities.id).notNull(),
    dayOfWeek: tinyint("day_of_week").notNull(), // 1=Monday..6=Saturday (ISO)
    startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
    ...
  },
  (table) => [
    index("idx_schedules_branch_day_time").on(table.branchId, table.dayOfWeek, table.startTime),
  ],
);
```

**Composite unique key to copy** (user-branches.ts lines 35–39):

```typescript
(table) => [
  uniqueIndex("user_branch_unique").on(table.userId, table.branchId),
  index("idx_user_branches_user_id").on(table.userId),
  index("idx_user_branches_branch_id").on(table.branchId),
],
```

→ For the roster: `uniqueIndex("class_coach_assignment_unique").on(branchId, weekStartDate, dayOfWeek, slot)`.

**`slot` enum (LOCKED rule, D-A1):** use `mysqlEnum` like attendance.ts (lines 15–22). **CRITICAL — `mysqlEnum` 1st arg = physical column name** (see `reference_drizzle_enum_column_name`): `slot: mysqlEnum("slot", ["morning", "afternoon"]).notNull()`. The migration's `enum('morning','afternoon')` must match exactly or CI fails (tsc won't catch it).

**`weekStartDate`:** model as `date("week_start_date", { mode: "string" })` (mirror attendance.ts line 35 `sessionDate`). Keeps per-week rows so past ratings stay attributable (D-A1 / Integration Points in CONTEXT). Do NOT mutate a single "current" row.

**Relations block:** copy schedules.ts lines 44–54 (`relations(...)` with `one(branches)`, `one(users)` for the coach FK).

---

### `src/db/schema/coach-ratings.ts` (model, append-only event log)

**Analog:** `src/db/schema/attendance.ts` (lines 24–70)

Ratings are an append-only log (one row per member rating one class). Mirror `attendance` exactly: `memberId`/`branchId`/`scheduleId` FKs (lines 28–34), `sessionDate: date("session_date", {mode:"string"})` (line 35), `createdAt` timestamp (line 39), and the `(table) => [index(...)]` block (lines 41–54).

Columns to add per CONTEXT D-M1/D-M2 + Discretion: `coachId` (FK users, the attributed coach from roster), `memberId`, `branchId` + `activityId` (or `scheduleId`), `sessionDate`, `stars: tinyint("stars").notNull()` (1–5), `comment: varchar("comment", { length: 500 })` nullable (optional free text, D-M2), `createdAt`.

**Append-log convention (no UNIQUE on natural key, indexes for reads):** see migration 0142 header lines 24–27 — "No UNIQUE constraint... Indexes on member_id and exercise_id back those reads." Apply same: index on `coachId` (for owner average), index on `(memberId, sessionDate)` (for "did this member already rate this class" one-shot check, D-P2).

**Qualified columns in `.select()`** (see `reference_drizzle_select_unqualified_columns`): always prefix `schema.coachRatings.col` in aggregate queries to avoid breaking correlated subqueries (Phase 121 lesson).

---

### `src/db/schema/index.ts` (barrel, modify)

**Analog:** self (lines 1–62, flat list of `export *`).

Append two lines at the end:

```typescript
export * from "./class-coach-assignments";
export * from "./coach-ratings";
```

---

### `src/db/migrations/0152_*.sql` (migration, additive)

**Analog:** `src/db/migrations/0142_create_exercise_adjustments.sql` (lines 55–73)

Hand-written or `pnpm db:generate`'d additive `CREATE TABLE` per new table. Follow 0142's structure exactly:

```sql
CREATE TABLE coach_ratings (
  id INT NOT NULL AUTO_INCREMENT,
  coach_id INT NOT NULL,
  member_id INT NOT NULL,
  ...
  stars TINYINT NOT NULL,
  comment VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT (now()),
  PRIMARY KEY (id),
  INDEX coach_ratings_coach_idx (coach_id),
  CONSTRAINT coach_ratings_coach_id_users_id_fk FOREIGN KEY (coach_id) REFERENCES users(id),
  ...
);
```

**LOCKED migration rules (from CONTEXT + MEMORY):**

- Apply via `pnpm db:migrate` (custom runner, `_migrations` table = source of truth). **NEVER `drizzle-kit migrate`/`push`** for committed work (CLAUDE.md).
- **No `;` inside SQL comment lines** — runner splits on `;` BEFORE stripping `--` comments (`reference`/MEMORY `feedback_no_semicolon_in_sql_comments`). 0142 header lines 39–42 document this invariant.
- `enum(...)` literals MUST match the Drizzle `mysqlEnum` first-arg/values exactly (0142 lines 43–46).
- **Commit the migration SQL alongside the schema change** (MEMORY — executors miss this). Next number after 0151 → `0152`.

---

### `src/modules/ratings/service.ts` (service, CRUD + attribution)

**Analog:** `src/modules/coach/service.ts` (lines 19–96)

Copy the class shape exactly: `import { MySql2Database } from "drizzle-orm/mysql2"`, `import * as schema from "../../db/schema"`, `constructor(private readonly db: MySql2Database<typeof schema>) {}` (lines 19–37). Build `SQL[]` condition arrays and `and(...conds)` (lines 47–63). Use `.groupBy(...)` + `sql<string>\`SUM(...)\``/`AVG(...)` for the per-coach average (owner view, D-O1) — mirror lines 65–84.

**Three service methods to implement** (the three decoupled flows in CONTEXT lines 141–146):

1. `upsertRosterAssignment(branchId, weekStartDate, dayOfWeek, slot, coachId)` — roster write (D-A1). Immediate persist (UI-SPEC Surface 1 "no Save button").
2. `submitRating({ memberId, sessionDate, stars, comment })` — resolves `coachId` from roster by `(branchId, sessionDate→dayOfWeek, slot derived from startTime<12:00)`, then inserts. If no coach assigned → reject / no-op (D-Q3). One-shot guard: reject if a row already exists for this member+class (D-P2).
3. `getOwnerRatings(scope)` — per-coach average + recent individual list (D-O1). Owner-only.

**Turno derivation (LOCKED, D-A1):** `slot = startTime < "12:00" ? "morning" : "afternoon"` — same split as `ReservasPage` `morningSlots`/`afternoonSlots`. Reuse string compare on `HH:MM`.

**Date helpers:** import from `../shared/date-utils` (attendance service line 14–20 shows `todayInTz`, `getWeekRange`). For `sessionDate → dayOfWeek` use the branch-tz-aware helpers, not raw JS `Date`.

**Errors:** throw `BadRequestError` from `../shared/errors` (attendance service line 13), NOT raw `Error`. Routes convert these via `handleServiceError`.

---

### `src/modules/ratings/routes.ts` (route, request-response)

**Analog:** `src/modules/attendance/routes.ts` (two-plugin split, lines 34–228) + `src/modules/coach/routes.ts` (guard, lines 21–33)

This module needs both an **admin plugin** (roster CRUD + owner ratings view) and a **member plugin** (submit rating). Export both like attendance does (`attendanceAdminRoutes` + `attendanceMemberRoutes`).

**Guard pattern (copy attendance routes lines 58–67 / coach routes lines 24–33):**

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(SOME_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({ error: "Acceso denegado", message: "..." });
  }
  await attachCountryScope(request, fastify.db);
});
```

- Roster write + owner view: gate on roles from `../shared/permissions`. Owner-only ratings view (D-M3, D-O1) → use `OWNER_ROLES`. Roster assignment from Horarios → `TRAINING_ROLES` (`["coach","owner"]`) or `ADMIN_ROLES` depending on who edits Horarios (verify against existing Horarios access).
- Member submit plugin: only `await fastify.authenticate(request, reply)` (attendance member plugin lines 193–195).

**Branch-scoped write preHandler** (scheduling routes lines 199–203): `preHandler: [requireBranchAccess({ from: "body.branchId" })]` on the roster assignment route so a coach can only assign within their `user_branches`.

**Route handler shape (copy attendance routes lines 88–107):** typed `fastify.post<{ Body: {...} }>`, `{ schema: someSchema }`, `try { ... return reply.code(201).send(record) } catch (err: unknown) { handleServiceError(err, reply, request.log, "context") }`.

**Member submit endpoint** mirrors attendance member check-in (lines 198–212): `fastify.post<{ Body: {...} }>("/", { schema }, async (request, reply) => { ... await ratingsService.submitRating(request.user.userId, request.body) ... })`.

---

### `src/modules/ratings/schemas.ts` (validation) + `types.ts` + `index.ts`

**Analogs:** `coach/schemas.ts` (lines 5–40), `coach/types.ts` (lines 10–26), `coach/index.ts`.

Fastify JSON schemas with `querystring`/`body`/`response` objects (coach/schemas.ts shape). Plain TS interfaces in `types.ts` (no `any` — CLAUDE.md). `index.ts` re-exports the route plugins (`export * from "./routes"`).

**`stars` validation:** body schema `stars: { type: "integer", minimum: 1, maximum: 5 }`; `comment: { type: "string", maxLength: 500 }` optional.

---

### `src/app.ts` (registration, modify)

**Analog:** self, lines 168–206 (attendance + coach registration blocks).

Import the route plugins (mirror line 31–32 / 40), then register:

```typescript
await app.register(ratingsAdminRoutes, { prefix: "/api/admin/ratings" });
await app.register(ratingsMemberRoutes, { prefix: "/api/members/ratings" });
```

Roster assignment can live under `/api/admin/scheduling` or a new `/api/admin/ratings` prefix — match the surface (UI lives in HorariosPage, so the admin api composable can call either; prefer a dedicated `/ratings` admin prefix for cohesion).

---

### `test/ratings/*.test.ts` (integration tests)

**Analog:** `test/coach/outstanding-balances.test.ts` (lines 16–69)

Vitest against the per-worker test MySQL DB. Copy the harness: `import { createTestApp, cleanAllTestData, createStaffUser, getAuthToken, registerUser } from "../helpers"`, `import * as schema from "../../src/db/schema"`, seed via `app.db.insert(schema.branches).values({...}).$returningId()` (lines 48–58). Cover (per CONTEXT + UI-SPEC): roster upsert one-per-slot, attribution resolution (sessionDate→coach), one-shot guard (D-P2), no-coach → no rating (D-Q3), owner-only access (403 for member/coach), average computation. **Tests run in CI on push to staging — do NOT run the full suite locally** (MEMORY); local `typecheck` is fine.

---

### `el-templo-admin/src/pages/HorariosPage.vue` (component, modify — Surface 1)

**Analog:** self (lines 300–640) — extend, don't replace.

Reuse the EXISTING branch selector (`selectedBranchId`, lines 324/507–521), week nav (`prevWeek`/`nextWeek`/`weekRangeLabel`, lines 402–410/552–562), and mobile day picker (`selectedDay`/`isMobile`, lines 356–368). **Do NOT add a second branch/week picker** (UI-SPEC Surface 1).

Add a per-`(día, turno)` coach `QSelect` grid driven by `weekStartDate.value` + `selectedBranchId.value`. Load via a new `useRatingsApi`. On change → call `assignCoach(...)` immediately + positive toast "Profe asignado" (copy the `$q.notify({ type: 'positive'/'negative', ... })` pattern at lines 544/594). Data-loading wrapper copies `loadWeeklyGrid` shape (lines 523–548): `loading` ref + `try/catch (err: unknown)` with `err instanceof Error` + `log.error(...)`.

**Coach options:** fetch users with `role='coach'` filtered to the selected branch via `user_branches` (new api endpoint). Display label = `firstName lastName`. Placeholder when unassigned: `"Sin profe asignado"`.

**Logger:** `const log = createLogger('HorariosPage')` already exists (line 317). No `console.log`.

---

### `el-templo-admin/src/composables/useRatingsApi.ts` (api client)

**Analog:** `el-templo-admin/src/composables/useCoachApi.ts` (lines 1–57)

Copy verbatim shape: `import { api } from 'src/boot/axios'`, `import { extractError } from 'src/utils/extract-error'`, exported interfaces, `loading`/`error` refs, async methods that `await api.get/post('/admin/...')`, `catch (err: unknown) { error.value = extractError(err, '...'); throw err }`, `finally { loading.value = false }`. Methods: `getRosterWeek(branchId, weekStart)`, `assignCoach(payload)`, `getCoachesForBranch(branchId)`, `getOwnerRatings()`.

---

### `el-templo-admin/src/pages/PuntuacionesPage.vue` (component, read-only — Surface 3)

**Analog:** `el-templo-admin/src/pages/DeudasPage.vue` (lines 1–113)

Near-exact structural copy: `<q-page padding>`, `text-h5` title ("Puntuaciones de profes"), `QTable` with `:rows`/`:columns`/`:loading`/`flat bordered`/`:no-data-label` (lines 30–46), `<script setup lang="ts">` with `useRatingsApi`, `createLogger('PuntuacionesPage')`, `columns` array, `reload()` in `onMounted` (lines 91–112).

Add per-coach **average** column rendered as read-only `QRating readonly` + numeric (UI-SPEC Surface 3) and a recent-ratings `QList`/`QTable` below. Empty state copy: "Todavía no hay puntuaciones" + body (UI-SPEC Copywriting). **Owner-only** route guard (D-M3) — check how router/role-gating is done for owner pages (e.g. DeudasPage is coach; this one is stricter).

---

### `el-templo-app/src/components/RatingPromptDialog.vue` (component, self-triggering — Surface 2)

**Analog:** `el-templo-app/src/components/PushPermissionDialog.vue` (lines 1–205)

This is the closest structural twin in the entire member app. Copy its self-contained pattern wholesale:

- **Template (lines 1–37):** `<q-dialog v-model="show">` (BUT `persistent` REMOVED — D-P1 skippable, UI-SPEC says `persistent="false"`) → `<q-card>` → icon section → body section → `<q-card-actions>` with primary `QBtn` + flat secondary "Ahora no" `QBtn`.
- **`<script setup>` lifecycle (lines 39–130):** `show`/`requesting`(→`submitting`) refs, a `shouldShow()` gate, `evaluate()`, and the `watch(() => authStore.isAuthenticated, ..., { immediate: true })` trigger (lines 112–118). `createLogger('RatingPromptDialog')` (line 52). `err instanceof Error` handling (lines 89–92).
- **One-shot persistence (D-P2):** PushPermissionDialog uses `Preferences` with a versioned `ASKED_KEY` (lines 50, 64–82). Apply the SAME mechanism keyed per-class to mark a class resolved when skipped or submitted, so it's never re-asked. 48h expiry (D-P3) and "only the LAST unrated class" (D-P4) logic lives in `shouldShow()`.

**Content (class-framed, coach NEVER shown — D-A3, UI-SPEC Surface 2):**

- Title: `"¿Cómo estuvo tu clase de {Actividad}?"` (activity name + day, no coach).
- **`QRating`** (NEW component this phase, first use — UI-SPEC §Design System): `size="2.5em"`, `color="primary"` (Terracotta), `icon="star"`, `icon-selected="star"`, no half-stars. Primary CTA disabled until ≥1 star.
- Optional `QInput type="textarea" autogrow` max ~280, label "Comentario (opcional)".
- States: submitting → CTA `loading`; success → close + positive toast "¡Gracias por tu puntuación!"; error → keep open + negative toast (copy in UI-SPEC).

**Mount point:** add `<RatingPromptDialog />` to `MainLayout.vue` next to the existing `<PushPermissionDialog />` (line 135), import at line ~146. The dialog manages its own visibility — no parent state needed (same as PushPermissionDialog).

**Brand colors:** pull from SCSS (`$primary` Terracotta for filled stars), never hardcode hex (UI-SPEC §Color; CLAUDE.md Phase 39 warm palette).

---

### `el-templo-app/src/composables/useRatingsApi.ts` (api client, member)

**Analog:** `el-templo-app/src/composables/useAttendanceApi.ts` (lines 1–40)

Copy the lean member-app composable shape: `import { api } from 'src/boot/axios'`, exported interfaces, async methods `await api.post('/members/ratings', {...})` / `await api.get('/members/ratings/pending')`, and a `cleanup()` no-op (lines 35–37 — required by CLAUDE.md composable convention). Methods: `getPendingRating()` (returns last unrated completed in-person class within 48h with assigned coach, or null) and `submitRating({ stars, comment, ... })`.

---

### Coach QR self-scan (flow reuse — D-Q2)

**Analog:** `el-templo-app/src/pages/CheckInPage.vue` + `useAttendanceApi.checkIn` (lines 21–26) → `POST /api/members/attendance/check-in`.

**No new UI.** A coach (role `coach`) uses the EXISTING member-app check-in flow to register their own attendance. The only backend work is **branch validation against `user_branches`**: when the scanning user is a coach, validate the QR's `branchId` (from `validateQrToken`, `shared/qr-token.ts` lines 32–59) is in their `user_branches` rows before recording attendance. This is independent of rating attribution (D-Q1/D-Q2). Add this branch-validation branch inside `attendance/service.ts` `checkIn` (lines 49–97 already do member branch enforcement — add a coach path that reads `user_branches` instead of the member subscription/plan path).

---

## Shared Patterns

### Service class skeleton

**Source:** `src/modules/coach/service.ts` lines 19–37
**Apply to:** `ratings/service.ts`

```typescript
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

export class RatingsService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}
}
```

### Route guard + country scope

**Source:** `src/modules/attendance/routes.ts` lines 58–67; `src/modules/coach/routes.ts` lines 24–33
**Apply to:** every plugin in `ratings/routes.ts`

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({ error: "Acceso denegado", message: "..." });
  }
  await attachCountryScope(request, fastify.db);
});
```

Roles come from `../shared/permissions` (`OWNER_ROLES` for ratings view per D-M3; `TRAINING_ROLES`/`ADMIN_ROLES` for roster).

### Branch-scoped write

**Source:** `src/modules/scheduling/routes.ts` lines 199–203
**Apply to:** roster assignment route + coach QR self-scan validation

```typescript
preHandler: [requireBranchAccess({ from: "body.branchId" })],
```

Import from `../shared/branch-access`.

### Error handling in routes

**Source:** `src/modules/attendance/routes.ts` lines 97–106 (and throughout)
**Apply to:** all `ratings/routes.ts` handlers

```typescript
try {
  const record = await service.method(...);
  return reply.code(201).send(record);
} catch (err: unknown) {
  handleServiceError(err, reply, request.log, "context label");
}
```

Service throws `BadRequestError` from `../shared/errors`.

### Frontend api composable (both apps)

**Source:** `el-templo-admin/src/composables/useCoachApi.ts` lines 29–57; `el-templo-app/src/composables/useAttendanceApi.ts` lines 20–40
**Apply to:** both `useRatingsApi.ts`

- Admin: `loading`/`error` refs + `extractError(err, '...')` + `throw err` in catch.
- App: lean, returns named methods + `cleanup()` no-op (CLAUDE.md composable rule).

### Self-mounting one-shot dialog

**Source:** `el-templo-app/src/components/PushPermissionDialog.vue` lines 39–130
**Apply to:** `RatingPromptDialog.vue`
Manages its own `show` via `watch(authStore.isAuthenticated, ..., {immediate:true})` + a `shouldShow()` gate + `Preferences` one-shot key. Mounted once in `MainLayout.vue` (line 135).

### Logging & TS discipline (LOCKED, CLAUDE.md)

**Apply to:** every new file

- API: `request.log` / `app.log` (Pino). Never `console.log`.
- Frontend: `createLogger('ComponentName')` from `src/utils/logger`. Never `console.*`.
- No `any`. `catch (err: unknown)` + `instanceof Error` narrowing.

---

## No Analog Found

None. Every file has a concrete in-repo analog. The only genuinely NEW UI element is the `QRating` Quasar component (UI-SPEC §Design System confirms it's unused anywhere in either app), but it is a first-party Quasar component requiring no registry/scaffold — its usage contract is fully specified in UI-SPEC Surface 2.

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/db/schema/` (schedules, attendance, user-branches, index)
- `el-templo-api/src/modules/` (coach, attendance, scheduling, shared/permissions, shared/qr-token)
- `el-templo-api/src/db/migrations/` (0142, 0151)
- `el-templo-api/test/` (coach, helpers)
- `el-templo-admin/src/` (pages: HorariosPage, DeudasPage; composables: useCoachApi)
- `el-templo-app/src/` (components: PushPermissionDialog; composables: useAttendanceApi; CheckInPage; App/MainLayout)

**Files scanned:** ~25 read in full or targeted
**Pattern extraction date:** 2026-06-23
