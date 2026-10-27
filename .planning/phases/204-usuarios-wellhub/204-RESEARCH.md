# Phase 204: Usuarios Wellhub como tipo de usuario - Research

**Researched:** 2026-10-27
**Domain:** Brownfield feature over the existing Wellhub integration (Fastify + Drizzle/MySQL API, Quasar/Vue 3 admin). No new libraries.
**Confidence:** HIGH for code locations and fix points (read directly from source in this worktree, base `origin/master` `3bf682d95`). MEDIUM for product-shape recommendations that Franco did not decide (marked as such).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Ya decidido en julio (integración Wellhub, NO re-litigar)
- El visitante Wellhub es un usuario real (`users.status='wellhub'` + `users.gympass_id` único). Si el email ya existe, se vincula a ese usuario poniéndole `gympass_id`.
- La reserva Wellhub es un booking real con `source='wellhub'`, y el cupo es compartido con los socios.
- La visita Wellhub es `attendance.source='wellhub'` y NO consume classesRemaining, AURA ni completed_sessions.
- El visitante Wellhub está FUERA del pipeline de leads/pruebas: sin seguimientos ni campañas de prueba.
- Solo se publica la actividad General (`activities.wellhub_enabled`, mig 0295).

#### Identidad y etiqueta
- **D-01:** El estado de la persona NO cambia por usar Wellhub. Un ex-alumno vinculado sigue `inactivo` y se ve **"Inactivo · Wellhub"**. Un visitante nuevo tiene estado `wellhub`, con label "Wellhub", color propio y entrada en todos los mapas de estado del admin (hoy el badge sale vacío).
- **D-02:** La etiqueta "Wellhub" sale de `gympass_id` y es **permanente**. En la ficha se ve la **última visita Wellhub**.
- **D-03:** Regla única de visibilidad de la etiqueta: **se ve siempre que la persona NO sea socio activo**. Un socio activo, sea convertido o socio que también usa Wellhub, se ve solo "Activo", sin marca. Si a un convertido se le vence el plan y queda inactivo, la etiqueta vuelve a verse.
- **D-04:** La conversión (asociarse al templo) **se hace desde la ficha del alumno** y queda registrada como evento (fecha, sede, plan/suscripción) para el reporte, aunque después no se muestre ninguna marca.
- **D-05:** Ex-alumno que entra por Wellhub con OTRO email, lo que genera un usuario duplicado: en la ficha del Wellhub nuevo, el staff puede **"Unir con alumno existente"**. El `gympass_id`, las reservas, las visitas y las filas Wellhub (`wellhub_bookings`, etc.) pasan a la ficha vieja y el duplicado se da de baja.
- **D-06:** El visitante Wellhub sin plan **NO accede a la app** de El Templo (igual que hoy). Al convertirlo, recibe acceso (ver D-17).

#### Operación del staff
- **D-07:** Listado de alumnos: **toggle "Solo Wellhub"** al lado de "Solo deudores", combinable con el select Estado, que NO cambia ni suma opciones. El toggle muestra:
  - (a) a quienes tienen la etiqueta Wellhub visible (D-03: `gympass_id` y no socio activo);
  - (b) **además** a socios activos que tuvieron una visita o reserva Wellhub en los últimos 30 días.
  El filtro tiene que funcionar en el API (hoy `status=wellhub` da 400).
- **D-08:** Export xlsx: la columna Estado muestra "Wellhub" (hoy vacía). Para la etiqueta, una columna o un sufijo; el planner elige lo más simple.
- **D-09:** Cobros: el Wellhub aparece en el buscador **con badge Wellhub**, y **al seleccionarlo sale un aviso que lo manda a su ficha para convertirlo**. No se cobra desde Cobros sin pasar por la conversión.
- **D-10:** Horarios: **chip "Wellhub" junto al nombre** en la lista de la clase, **desde la reserva** (antes del check-in), según el origen de la reserva o visita. Por eso también marca al socio activo que reservó por Wellhub. Sin contador adicional en el resumen del horario.
- **D-11:** Reserva Wellhub en Horarios: el staff **NO puede cancelarla**. Se gestiona desde Wellhub: botón deshabilitado con texto del tipo "Se gestiona desde la app de Wellhub", y el API también lo rechaza. El staff **SÍ puede marcarle asistencia a mano** (ver D-19).
- **D-12:** Campaña `bajas`: el ex-alumno inactivo con `gympass_id` **sale de la audiencia**. Ya viene, así que la recuperación se hace en persona o desde su ficha.

#### Métricas y reporte
- **D-13:** **Wellhub SUMA a los totales.** Principio rector de Franco: *Wellhub es un dato más; NO llenar las páginas de botones ni toggles de Wellhub; solo donde ya se muestran varias categorías, agregar Wellhub como una más.* Donde hay un número solo, sigue siendo el total. **No se agregan switches "incluir Wellhub".**
- **D-14:** Ejemplos a aplicar: el log de accesos con filtro de fuente (hoy QR/Manual, y las visitas Wellhub salen como "Manual") suma la categoría "Wellhub". Lo mismo en cualquier desglose existente por fuente, segmento o tipo. El planner/researcher identifica qué pantallas ya tienen categorías. Las métricas de número único (check-ins diarios, heatmap, promedio, no-show rate, socios únicos) quedan como total, que incluye Wellhub.
- **D-15:** Embudo de conversión: Wellhub entra como **un origen más** del embudo, con su propia tasa a socio. NO entra al pipeline de leads/pruebas ni a sus seguimientos o campañas.
- **D-16:** **Un único reporte Wellhub** dentro de Reportes, por sede y mes, con:
  1. visitas validadas por Wellhub (check-ins que pasaron por su app, para controlar contra la liquidación de Wellhub);
  2. presentes a mano (visitas Wellhub marcadas por el staff, que Wellhub no ve ni paga);
  3. personas y frecuencia (únicos, nuevos vs ex-alumnos vs socios, visitas por persona);
  4. reservas, cancelaciones, no-shows y conversiones a socio (fecha + plan).

#### Socio activo que usa Wellhub
- **D-18:** **Se permite, separado del plan.** Una reserva o visita Wellhub de un socio activo:
  - no le descuenta clases si es no-show (hoy `el-templo-api/src/jobs/mark-no-shows.ts` descuenta sin mirar `source`: BUG);
  - no consume su límite diario ni semanal (hoy `attendance/service.ts` cuenta la asistencia Wellhub como regular y puede bloquear su check-in propio: BUG).
  Su visita propia del día sigue disponible.

#### Conversión y ficha (Franco: "andá con lo recomendado y más completo")
- **D-17:** "Asociar al templo" en la ficha del Wellhub (CTA visible cuando la etiqueta está visible) **reusa el alta de membresía o cobro existente** del admin, sin flujo paralelo. Al confirmarse el primer plan pago:
  - el estado pasa a `activo` (ya ocurre en `subscriptions/service.ts:~7294`);
  - se registra el evento de conversión: usuario, sede, suscripción/plan, fecha y si era nuevo o ex-alumno;
  - **el alumno recibe acceso a la app** con el mecanismo existente de alta de acceso o invitación. El researcher verifica cuál: invitaciones de la fase 194, set/reset password. Si no hay uno que encaje, mostrar "Enviar acceso a la app" en la ficha como acción explícita.
  - El aviso de Cobros (D-09) lleva a este mismo CTA.
- **D-20:** Ficha del visitante Wellhub (sin plan): mantiene las pestañas que aplican (asistencias, reservas, datos) y agrega **arriba una card "Wellhub"** con: ID de Wellhub, vinculado desde, última visita, visitas del mes y totales, sedes visitadas, próxima reserva Wellhub y el CTA "Asociar al templo". Las pestañas o acciones que solo tienen sentido con plan no deben romper ni confundir ("Sin plan" está bien). El historial de asistencias y reservas muestra el origen "Wellhub" con label (hoy `sourceLabels['wellhub']` no existe y sale un badge vacío).

### Claude's Discretion
(Franco no lo discutió: ir con lo recomendado)
- **D-19 Presente a mano:** cuando el staff marca presente a una reserva Wellhub, la visita **cuenta como visita Wellhub con marca "a mano"**: va al ítem 2 del reporte y NO al 1. Confirma la reserva, así que el job no la convierte en no-show, y no toca el plan del socio. Modelado (columna o valor de `source`): lo decide el planner. Preferir lo explícito y lo que no rompa los conteos existentes.
- **D-21 Unir duplicados (detalle de D-05):**
  - Solo roles admin/owner.
  - Solo cuando la ficha a absorber es un Wellhub "puro": estado `wellhub`, sin suscripciones ni pagos. Nunca se fusionan dos fichas con historia propia.
  - Transaccional, con registro de auditoría.
  - El duplicado se da de baja con el soft-delete existente (`deletedAt`).
  - No hay "deshacer" en UI.
  - Si la ficha destino ya tiene `gympass_id` distinto, se rechaza con un mensaje claro.
- Nombres, colores y textos exactos de badges y chips: dentro de la paleta de marca (cálida, sin azul) y del sistema de badges existente (`useStatusBadge`).
- Cómo se calcula "última visita" y "sedes visitadas" (query vs columna cacheada): lo decide el planner, priorizando lo simple.

### Deferred Ideas (OUT OF SCOPE)
- Acceso limitado a la app para visitantes Wellhub sin plan (ver horarios o rutina como canal de conversión). Franco: "no por ahora".
- Aviso automático de "posible duplicado" por nombre o teléfono. Por ahora la unión es manual (D-05).
- Activar Wellhub en las otras 5 sedes: migración aparte cuando Wellhub las configure. No es parte de esta fase.
</user_constraints>

<phase_requirements>
## Phase Requirements

No formal REQ-IDs exist for this phase (ROADMAP: "Requirements: inventario + decisiones de discuss-phase"). The decisions D-01..D-21 act as requirements.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01/D-02/D-03 | Status `wellhub` badge; permanent label from `gympass_id`, visible iff not socio activo | §Pattern 2 (one SQL fragment `wellhubLabelVisibleSql`), §Members API, §Admin badge |
| D-04/D-17 | Conversion from the ficha, event recorded, app access | §Pattern 4 (hook in `recomputeUserStatus` next to `attributeInvitationPurchase`), §App access (temp password + password-set email) |
| D-05/D-21 | Merge duplicate into existing member | §Pattern 6 (merge transaction), FK inventory, audit_log |
| D-06 | Visitor without plan has no app access | Already true (random password, `wellhub/service.ts:1061`); keep |
| D-07 | Toggle "Solo Wellhub" + API filter | §Pattern 2 SQL (a)+(b); copy `debtorOnly` / `origin=invitacion` patterns |
| D-08 | Export Estado column | `members/service.ts:2515` STATUS_LABELS + suffix |
| D-09 | Cobros badge + redirect dialog | `CobrosPage.vue:2005-2034` `buildMemberOption`, `:2179` `onMemberSelected`, deep-link `:2488` |
| D-10 | Horarios chip from the booking | `attendance/service.ts:581` `getSlotAttendance` + `scheduling/service.ts:587` `getSlotDetail` need `bookings.source`; response schemas must declare it |
| D-11 | Staff cannot cancel Wellhub booking | `booking-service.ts:1063` `adminRemoveBooking` + bulk-path matrix §D-11 |
| D-12 | Exclude from `bajas` | `campaigns/audience-service.ts:132` `bajasConditions` + `isNull(gympassId)` |
| D-13/D-14 | Wellhub as one more category only where categories exist | §Categorical surfaces inventory (verified list) |
| D-15 | Funnel origin | §Funnel finding: the funnel with origins (`entryOrigin`) is API-only/hidden; the visible funnels are trial-only |
| D-16 | Wellhub report by branch/month | §Pattern 7 (new `reports/wellhub-report-service.ts` + `GET /api/admin/reports/wellhub`), data-source table |
| D-18 | No plan side-effects for Wellhub bookings/visits | §D-18 fix-point matrix (9 sites, not 2) |
| D-19 | Manual present on Wellhub booking | §Pattern 5 (`attendance_source` += `wellhub_manual`; branch in `coachCheckIn`/`removeCheckIn`) |
| D-20 | Wellhub card in ficha | §Pattern 3 (`GET /api/admin/members/:userId/wellhub`) |
</phase_requirements>

## Project Constraints (from CLAUDE.md and repo skills)

- API logging: Pino (`request.log`, `app.log`, `pino({name})` in jobs). Never `console.log`. Frontend: `createLogger()` from `src/utils/logger.ts`.
- TypeScript: no `any`; `catch (err: unknown)` + `instanceof Error`.
- New API routes MUST have integration tests in `el-templo-api/test/` against real MySQL; helpers in `test/helpers.ts`.
- Schema changes via `el-templo-api/src/db/schema/`; migrations are **hand-written** (`db:generate` broken by drift). Never `drizzle-kit migrate`; never `db:push` in committed work. Commit the `.sql` in the SAME commit as the schema change.
- Migration SQL: never a `;` inside a `--` comment; append enum values last; `mysqlEnum` first arg = physical column name (attendance source column is `attendance_source`, status column is `attendance_status`).
- No test/mock data in migrations (staging and prod share one MySQL host).
- New env vars: update `.env.example` (none expected in this phase).
- Pinia composition stores; composables expose `cleanup()`, no `onUnmounted` inside composables.
- Sentry: `createLogger().error()` reports automatically; don't add new Sentry wiring.
- Change control: no push without explicit OK; staging-first; `git add` by explicit path, never `-A`/`.`; no version bumps inside GSD phases; no dependency installs without asking.
- Tests: do NOT run the suite locally (CI runs it); writing tests and narrow single-file runs are acceptable only if Franco agrees. Never hardcode `users.id` in tests (resolve `admin@test.com` or create fixtures).
- Executor model guidance (CLAUDE.md): plans are executed sequentially by `gsd-executor` on sonnet in the shared worktree; tests only in foreground with long timeout, no `run_in_background`, no `pgrep` loops; executors must not commit docs in the main checkout.
- Every Fastify route with numeric params gets a params schema with `type: integer` (FA-07: `'3' !== 3` silently broke a cascade).
- Response schemas: fast-json-stringify STRIPS properties not declared in the response schema. Every new field (`source`, `isWellhub`, `showWellhubLabel`, ...) must be added to the route's response schema or it silently disappears.

## Summary

The Wellhub integration already models everything this phase needs at the row level: `users.gympass_id` (global unique), `users.status='wellhub'`, `bookings.source='wellhub'` (free `varchar(16)`, no enum change needed) and `attendance.attendance_source='wellhub'`. What is missing is (1) reading those markers in the admin/API surfaces, (2) excluding Wellhub rows from every plan-consumption path, and (3) three new write flows (conversion event, manual Wellhub presence, merge). No new packages are required.

The most important finding is that the D-18 bug is **broader than the two sites in CONTEXT.md**. Wellhub bookings/visits leak into a socio's plan in **nine** places: the no-show decrement, the QR check-in booking match, the QR daily guard, the weekly attendance count, the coach manual check-in (which also awards AURA and writes `completed_sessions`), the check-in undo (which would *add* +1 class and reverse AURA), and four booking-side counters in `reserve()`/`adminAddBooking()` (same-day rule, weekly limit, future-budget, bonus count). The Wellhub webhook itself also has two cross-contamination points (its one-per-day guard counts the socio's own attendance, and its "today's booking" lookup can confirm the socio's OWN booking instead of the Wellhub one). A single shared SQL helper (`notWellhubBookingSql` / `notWellhubAttendanceSql`) applied at each site is the right shape; the NULL trap (`bookings.source` is nullable, so `source <> 'wellhub'` silently drops legacy NULL rows) must be handled inside the helper.

Second key finding: the next free migration number is **0300**, not 0298. The local unpushed branch `feat/201-conquer` (phase 202) already owns `0298_conquer_corrections.sql` and `0299_conquer_tutorials.sql`. Third: the only "embudo" with origins (`entryOrigin` in `analytics/funnel-service.ts`) is not rendered anywhere in the admin; the visible funnels (Analíticas › Conversión, Reportes › Conversión) are trial-session funnels, i.e. the lead pipeline that D-15 forbids touching. Recommendation: add `entryOrigin='wellhub'` to the API funnel and surface the Wellhub → socio rate inside the new Wellhub report.

**Primary recommendation:** one migration (0300: `attendance_source` += `wellhub_manual`, new gym-owned table `wellhub_conversions`), one shared `shared/wellhub-sources.ts` helper used by every exclusion site, the conversion hook inside `recomputeUserStatus` (copying the phase-194 `attributeInvitationPurchase` pattern), and app access via the existing temp-password + `sendPasswordSetEmail` mechanism exposed as an explicit "Enviar acceso a la app" action.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Label visibility rule (D-03) | API (SQL fragment) | Admin (render only) | Effective status is computed server-side (`effectiveMemberStatusSql`); filter and badge must use the same fragment ("lo que filtra es lo que se marca", phase-194 `isInvited` precedent) |
| Plan-consumption exclusions (D-18) | API (services + job) | — | Business rule; the app is out of scope and must be protected server-side |
| Staff cannot cancel Wellhub booking (D-11) | API (reject) | Admin (disabled button) | D-11 says the API also rejects |
| Manual Wellhub presence (D-19) | API (`coachCheckIn`) | Database (enum value) | Side-effect branching lives in the service |
| Conversion event (D-04/D-17) | API (inside the subscription tx) | Database (new table) | Must be atomic with the status flip; every charge path converges in `recomputeUserStatus` |
| App access on conversion (D-17) | API (reset + email) | Admin (action + prompt) | Email send is post-commit, triggered explicitly |
| Merge duplicates (D-21) | API (single transaction) | Admin (dialog) | Repoints FKs; needs audit row in the same tx |
| Wellhub report (D-16) | API (reports module) | Admin (new Reportes tab component) | Aggregations in SQL, tz-local dates already stored |
| Horarios chip (D-10) | API (expose booking source) | Admin (render) | Roster endpoints currently omit `bookings.source` |
| Cobros redirect (D-09) | Admin | API (search projection) | UX gate; the API only exposes the flag |

## Standard Stack

No new dependencies. Everything uses what the repo already has. `[VERIFIED: codebase]`

### Core (existing, reuse)
| Asset | Location | Purpose |
|-------|----------|---------|
| Drizzle ORM + hand-written SQL migrations | `el-templo-api/src/db/schema/`, `src/db/migrations/` | Schema + migration 0300 |
| `tenantWhere` / `tenantValues` / `assertTenant` | `src/modules/shared/tenant.ts` | Tenancy on every new query/insert |
| `auditLog.write(ctx, tx, …)` | `src/modules/shared/audit-log.ts:93` | Merge audit (append `AuditAction` union value, no migration: `action` is `varchar(50)`) |
| `membershipInEffectSql(alias)` | `src/modules/shared/membership.ts` | Single definition of "membresía vigente" |
| `effectiveMemberStatusSql(ctx)` | `src/modules/members/service.ts:123` | Effective status in list/search |
| `MEMBER_TEMP_PASSWORD` + `resetMemberPassword` + `EmailService.sendPasswordSetEmail` | `members/service.ts:27,2126`; `email/service.ts:30` | App access for converted visitor |
| `useStatusBadge` | `el-templo-admin/src/composables/useStatusBadge.ts` | Status label/color map |
| `AssignPlanDialog` | `el-templo-admin/src/components/AssignPlanDialog.vue` (used at `AlumnoDetailPage.vue:728`) | "Asociar al templo" = existing "Cargar membresía" |
| vitest (API integration tests) | `el-templo-api/vitest.config.ts` | Tests |

**Installation:** none.

## Package Legitimacy Audit

Not applicable: this phase installs no external packages. slopcheck not run (nothing to check). Planner must NOT add packages; if one appears necessary, gate it behind a `checkpoint:human-verify` (memory rule: never install deps without asking).

## Architecture Patterns

### System Architecture Diagram

```
 Wellhub app ──webhook──> /api/webhooks/wellhub ──> WellhubService
   │                                                  │ findOrCreateVisitor (gympass_id / email link / new 'wellhub')
   │                                                  │ booking-requested ─> bookings(source='wellhub') + wellhub_bookings
   │                                                  │ checkin ──────────> attendance(source='wellhub')  [validated, billed]
   │                                                  ▼
   │                                          MySQL rows (users, bookings, attendance, wellhub_*)
   │                                                  │
 Staff (admin) ──────────────────────────────────────┼──────────────────────────────────────────────┐
   │ Horarios roster  ─GET slot / slot detail──> exposes bookings.source ─> chip "Wellhub" (D-10)     │
   │ "Marcar asistencia" ─POST slot check-in──> coachCheckIn ─┬─ booking.source='wellhub'? ─yes─> attendance(source='wellhub_manual'), booking→confirmado, NO aura/classes/completed_sessions (D-19)
   │                                                          └─ no ─> current behavior
   │ "Cancelar reserva" ─DELETE booking──> adminRemoveBooking ─ source='wellhub'? ─> 409 (D-11)
   │ Alumnos list ─GET members?wellhubOnly──> wellhubOnly SQL (a)+(b), showWellhubLabel projection (D-03/D-07)
   │ Ficha ─GET members/:id/wellhub──> card data (D-20)
   │   ├─ "Asociar al templo" ─> AssignPlanDialog ─> assignPlan tx ─> recomputeUserStatus
   │   │                                                        └─> statusBefore≠activo→activo AND gympass AND Wellhub activity ─> INSERT wellhub_conversions (D-04/D-17)
   │   ├─ "Enviar acceso a la app" ─POST members/:id/app-access──> reset temp password + password-set email (D-17)
   │   └─ "Unir con alumno existente" ─POST members/:id/wellhub-merge──> tx: move gympass_id, repoint FKs, soft-delete, audit (D-21)
   │ Cobros typeahead ─search──> isWellhub flag ─> badge + dialog → ficha (D-09)
   │ Reportes ─GET reports/access?source=wellhub──> (D-14) ; ─GET reports/wellhub?branchId&month──> report (D-16)
   │
 Cron 22:00 ─ mark-no-shows ─> bookings 'reservado' past → 'no_show' (all sources) ; decrement classes ONLY for non-Wellhub (D-18)
 Member QR / app reserve ─> checkIn / reserve() counters exclude Wellhub rows (D-18)
```

### Recommended file layout (new files only)
```
el-templo-api/src/
├── modules/shared/wellhub-sources.ts          # constants + SQL fragments (exclusions, label rule)
├── modules/wellhub/conversion.ts              # recordWellhubConversion(tx, ctx, userId, before, after, log)
├── modules/wellhub/member-wellhub-service.ts  # card summary + merge + app access orchestration
├── modules/reports/wellhub-report-service.ts  # D-16 aggregations (keeps reports/service.ts, 3408 lines, from growing)
├── db/schema/wellhub.ts                        # + wellhubConversions table (same module file)
└── db/migrations/0300_wellhub_usuarios.sql
el-templo-api/test/
├── fixtures/wellhub-personas.ts                # the 3 personas + direct-insert helpers
├── wellhub/plan-separation.test.ts             # D-18 (all 9+2 sites)
├── wellhub/manual-presence.test.ts             # D-19 + D-11
├── wellhub/members-wellhub.test.ts             # D-03/D-07/D-08/D-12 + search flag
├── wellhub/conversion.test.ts                  # D-04/D-17 + app-access route
├── wellhub/merge.test.ts                       # D-21
├── reports/wellhub-report.test.ts              # D-16 + access log source
└── migrations/0300-wellhub-usuarios.test.ts    # enum + table shape (copy 0285-0286-extra-blocks.test.ts)
el-templo-admin/src/
├── utils/wellhub-label.ts (+ __tests__)        # pure helpers: label text, chip predicate
├── components/members/WellhubCard.vue
├── components/members/WellhubMergeDialog.vue
└── components/reports/WellhubReport.vue        # copy InvitationsReport.vue shape
```

### Pattern 1: Shared exclusion helper (DRY for D-18/D-11/D-07/D-16)

**What:** One module owns the Wellhub source constants and SQL fragments. Every exclusion site imports it.
**Why:** 11+ call sites across `attendance`, `scheduling`, `jobs`, `members`, `reports`, `wellhub`. Inline copies will drift (FA-13 lesson: centralize a two-source predicate the day the second source appears).
**Where:** `modules/shared/` (scheduling must not import from `modules/wellhub/`, which already imports `BookingService` type: cycle risk).

```typescript
// el-templo-api/src/modules/shared/wellhub-sources.ts (sketch)
import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

export const WELLHUB_BOOKING_SOURCE = "wellhub" as const;
/** 'wellhub' = validated by Wellhub (billed). 'wellhub_manual' = marked by staff (D-19, not billed). */
export const WELLHUB_ATTENDANCE_SOURCES = ["wellhub", "wellhub_manual"] as const;

/** NULL-safe: bookings.source is nullable (legacy rows = NULL = admin). `<>` alone would drop them. */
export function notWellhubBookingSql(): SQL {
  /* tenant-safe: WHERE fragment, composed inside queries already scoped by tenantWhere */
  return sql`(${schema.bookings.source} IS NULL OR ${schema.bookings.source} <> ${WELLHUB_BOOKING_SOURCE})`;
}
export function notWellhubAttendanceSql(): SQL {
  /* tenant-safe: WHERE fragment, composed inside queries already scoped by tenantWhere */
  return sql`${schema.attendance.source} NOT IN ('wellhub','wellhub_manual')`;
}
```
For raw-SQL call sites with aliases (`b.source`, `a.attendance_source`) add alias-taking variants (same closed-union `sql.raw(alias)` approach as `membershipInEffectSql`). Note the physical attendance column is `attendance_source`. `[VERIFIED: codebase]`

### Pattern 2: Label rule + "Solo Wellhub" filter (D-03, D-07) — one fragment for filter and projection

Copy the phase-194 `hasActiveInvitationExpr` pattern (`members/service.ts:367-382` (projection `:468`)): the same fragment drives the filter and the row flag. `[VERIFIED: codebase]`

```sql
-- (a) label visible  (D-03)
users.gympass_id IS NOT NULL AND <effectiveStatusExpr> <> 'activo'

-- (b) active member with Wellhub activity in the last 30 days
<effectiveStatusExpr> = 'activo' AND (
  EXISTS (SELECT 1 FROM bookings b
          WHERE b.tenant_id = :tenant AND b.member_id = users.id
            AND b.source = 'wellhub'
            AND b.booking_date >= (CURDATE() - INTERVAL 30 DAY))
  OR EXISTS (SELECT 1 FROM attendance a
          WHERE a.tenant_id = :tenant AND a.member_id = users.id
            AND a.attendance_source IN ('wellhub','wellhub_manual')
            AND a.session_date >= (CURDATE() - INTERVAL 30 DAY))
)

-- wellhubOnly = users.gympass_id IS NOT NULL AND ( (a-without-gympass) OR (b) )
```
Simplification that is correct: a socio with a Wellhub booking/visit always has `gympass_id` (it is set by `findOrCreateVisitor` on the first webhook, `wellhub/service.ts:1033-1037`), so the whole filter can be prefixed by `gympass_id IS NOT NULL`.

API changes (members): `schemas.ts:212` querystring adds `wellhubOnly: { type: "boolean" }` and adds `"wellhub"` to the `status` enum (removes the 400); `routes.ts:468-536` passes it through; `service.ts:350-358` status condition adds `"wellhub"`; projections add `isWellhub` (`gympass_id IS NOT NULL`) and `showWellhubLabel` ((a)); response schemas at `schemas.ts:28` (list item), `:84` (profile) add `"wellhub"` to the status enum and declare the new booleans. `exportMembers` (`service.ts:2344`) duplicates the list's conditions (DRY smell already present): reuse the same fragment there and in `searchMembers` (`service.ts:587`). Do NOT add a "Wellhub" option to the Estado select (D-07).

`wellhubOnly` should NOT be finance-gated (unlike `debtorOnly`, `routes.ts:515`): it is not financial data, so the toggle is visible to `financeBlind` roles too (AlumnosPage `:89` wraps "Solo deudores" in `v-if="!financeBlind"`; the new toggle must not inherit that wrapper).

### Pattern 3: Wellhub card endpoint (D-20, D-02)

`GET /api/admin/members/:userId/wellhub` → `null` when `gympass_id IS NULL`, else:
`{ gympassId, linkedSince, lastVisitDate, visitsThisMonth, visitsTotal, manualVisitsTotal, branchesVisited: string[], nextWellhubBooking: {date, startTime, activityName, branchName} | null, showLabel, canConvert, hasLoggedIn }`.

- "vinculado desde": NOT stored today for the email-link case (`wellhub/service.ts:1033` only sets `gympass_id`). Derive: `LEAST(MIN(wellhub_bookings.created_at), MIN(attendance.checked_in_at WHERE source IN wellhub sources))`; for new visitors also `user_status_history` row `source='wellhub'`. Edge: a link followed by an invalid-ticket checkin (no attendance, no wellhub_bookings row) leaves no trace → `null` ("sin datos"). Recommended: derive (no column, no backfill). If the planner wants exactness, alternative is a `users.gympass_linked_at` column written in `findOrCreateVisitor` (both branches) + backfill migration from the same MIN().
- "última visita", "sedes visitadas", monthly/total counts: plain aggregates over `attendance` (index `idx_attendance_member_checked_in`) joined to `branches`. Query-time, no cache (volumes are tiny: pilot started 2026-10-27).
- `hasLoggedIn`: `EXISTS member_logins WHERE user_id` (table records each `/auth/me`, `schema/member-logins.ts`). Drives the "Enviar acceso" prompt.
- Separate endpoint (not folded into `getMemberById`, `members/service.ts:752`) keeps the heavy profile query unchanged and lets the card lazy-load. Cost: 1 ISO-01 entry + 1 ISO-03 members case.

### Pattern 4: Conversion event inside `recomputeUserStatus` (D-04, D-17)

Every admin charge path (AssignPlanDialog → `POST /admin/subscriptions/members/:userId/subscription/assign`, Cobros alta/renewal, scheduled-sub activation cron) converges in `SubscriptionService.recomputeUserStatus` (`subscriptions/service.ts:7723`), which already computes `statusBefore`/`statusAfter` inside the subscription transaction and, for `ctx !== null`, calls phase 194's `attributeInvitationPurchase(tx, this.db, ctx, userId, this.log)` (`:7894`). The inventory's "~7294" line reference is stale; the CASE that flips `wellhub → activo` starts at `:7803` (`WHEN membershipGate THEN 'activo' … ELSE u.status`). `[VERIFIED: codebase]`

Add, next to that call: `await recordWellhubConversion(tx, ctx, userId, statusBefore, statusAfter, this.log)` in a new `wellhub/conversion.ts`:
- Fire only if `statusAfter === 'activo' && statusBefore !== 'activo'`, user has `gympass_id`, and (recommended predicate, see Open Question 2) there is Wellhub activity since the last time the user left `activo` (`MAX(user_status_history.changed_at WHERE from_status='activo')`, or ever if none). `statusBefore='wellhub'` trivially qualifies.
- Insert into `wellhub_conversions`: `tenant_id, user_id, subscription_id, plan_id, branch_id (subscription's branch), from_status ('wellhub'|'inactivo'|other → kind 'nuevo'|'ex_alumno'|'otro'), converted_at, local_date (YYYY-MM-DD in the branch tz)`. Pick the subscription with the same subquery as `purchased_plan_id` (`membershipInEffectSql("s2")`, newest `created_at`).
- `local_date` avoids the UTC-vs-sede month boundary problem (memoria `reference_test_shifts_utc_vs_tz_sede`): the report groups by month in the branch timezone.
- Unique `(tenant_id, user_id, subscription_id)` for idempotency (tenant-prefixed, required by `verify-tenant-uniques`).
- `ctx === null` path (cron `autoExpireDueSubscriptions`) never produces a conversion: skip, same as the invitation hook.

Why a table and not columns/audit_log: a person can convert, lapse, reconvert (D-03 says the label comes back); `audit_log.actor_id` is NOT NULL and `recomputeUserStatus` has no actor; `user_status_history` lacks subscription/branch. Explicit > clever. Cost: the 5 tenancy counts (§Tenancy gates).

### Pattern 5: Manual Wellhub presence (D-19) — new enum value `wellhub_manual`

Recommended modeling: append `'wellhub_manual'` to `attendance.attendance_source` (not a flag column). Rationale: existing totals do not filter by source (verified: the only source filters are the access log `reports/service.ts:3292` and none in analytics), so a new value keeps every total intact; the report separates items 1 and 2 with a plain `GROUP BY source`; a boolean flag would let `source='wellhub' AND manual=1` and `source='manual' AND wellhub=1` both exist (ambiguous). `[VERIFIED: codebase]`

Today `coachCheckIn` (`attendance/service.ts:836-1010`) on a Wellhub booking would: insert `source='manual'` (`:935`), award 10 AURA (`:942`), decrement the socio's `classesRemaining` (`:953-968`), upsert the booking to `confirmado` (`:987`, keeps `source` because ON DUPLICATE KEY UPDATE doesn't touch it), and write a presencial `completed_sessions` mirror (`:996`). Change: before inserting, look up the booking `(member, schedule, date)`; if `source='wellhub'` → insert `source='wellhub_manual'`, set booking `confirmado`, skip AURA/decrement/completed_sessions, no subscription warning. The one-per-day guard (`:880`) must compare only within the same "plan vs Wellhub" side (see D-18 matrix).

`removeCheckIn` (`:1023-1135`) is also unsafe for Wellhub rows: it adds `classesRemaining + 1` (`:1067`, a free class for a socio), reverses AURA, and deletes the member's presencial `completed_sessions` for that date (`:1118`, could delete the socio's OWN session mirror). Change: read `attendance.source`; `wellhub_manual` → delete row + revert booking to `reservado` only; `wellhub` (validated, billed by Wellhub) → reject with a clear message (recommended) since it is Wellhub's record.

### Pattern 6: Merge duplicate (D-21) — single transaction

Route: `POST /api/admin/members/:userId/wellhub-merge` body `{ targetUserId: integer }`, params schema with `userId: integer` (FA-07). Roles: `ADMIN_ROLES` (`shared/permissions.ts:31`) checked inline like `PUT /:userId/password` (`members/routes.ts:1628-1641`); the plugin hook already applies `MEMBER_ROLES` + `enforceMemberBranchScope` to `:userId`. Apply the same cross-country guard to the TARGET (password route pattern `:1644-1683`), since the hook only scopes `:userId`.

Preconditions (reject 409/400 with clear Spanish messages):
1. Source: same tenant, `deletedAt IS NULL`, `role='member'`, `status='wellhub'`, `gympass_id IS NOT NULL`, no rows in `subscriptions` (any status), `financial_transactions.member_id`, `balances.member_id`.
2. Target: same tenant, not deleted, `role='member'`, `id ≠ source`; `gympass_id IS NULL` (if not null and different → "Ese alumno ya tiene otro ID de Wellhub"; same is impossible: global unique).
3. Booking collisions on the unique `(member_id, schedule_id, booking_date)` (`schema/bookings.ts:67`): for each colliding pair, delete the dead row (`cancelado`/`no_show`) on either side; if both are live → reject ("ambos tienen reserva para la misma clase").

Transaction body (order matters for the global unique on `gympass_id`):
1. `UPDATE users SET gympass_id = NULL WHERE id = source` → `UPDATE users SET gympass_id = :g WHERE id = target`.
2. Repoint `bookings.member_id`, `attendance.member_id`, `wellhub_bookings.user_id`, `member_notes.user_id` (staff may have written notes). Leave `user_status_history`, `aura_*`, `completed_sessions` on the soft-deleted source (its own history; a pure Wellhub has none after the D-19 fix).
3. Soft-delete source using the existing semantics of `softDeleteMember` (`members/service.ts:2078`: `deletedAt`, scrub email to `deleted-<id>-<ts>@deleted.local`, `dni=NULL`). That method uses `this.db`, not a tx: add a tx-accepting variant rather than calling it after commit.
4. `auditLog.write(ctx, tx, { actorId, action: "wellhub_member_merged", targetKind: "member", targetId: target, payload: { absorbedUserId, gympassId, absorbedEmail, moved: {bookings, attendance, wellhubBookings, notes} } })`. Add `"wellhub_member_merged"` to `AuditAction` (`shared/audit-log.ts:35`).
Do NOT use the existing `DELETE /admin/members/:userId` route: it cancels future bookings (`routes.ts:1570-1588`) and would silently cancel live Wellhub reservations without telling Wellhub.

### Pattern 7: Wellhub report (D-16)

`GET /api/admin/reports/wellhub?branchId=&month=YYYY-MM`, in `reports/routes.ts` (plugin hook = `CAJA_ROLES` + `attachCountryScope`, `routes.ts:94-103`), with `requireBranchAccess({from:"query.branchId", optional:true})` + `enforceBranchScope` like `/access` (`:120-126`). Service in a new `reports/wellhub-report-service.ts` (pattern: `referrals/invitation-report.ts`: month validation, `tenantWhere` on every table). Admin: new `<q-tab name="wellhub">` in `ReportesPage.vue:58-96` + `components/reports/WellhubReport.vue` (copy `InvitationsReport.vue` month picker/branch options).

| Report item | Source | Branch / month key |
|---|---|---|
| 1 validadas | `attendance` `source='wellhub'` | `attendance.branch_id`, `session_date` (already sede-local) |
| 2 a mano | `attendance` `source='wellhub_manual'` | same |
| 3 personas | `COUNT(DISTINCT member_id)` over 1+2; visits/person; classification per person (nuevo = has `user_status_history` row `source='wellhub'`, `to_status='wellhub'`; socio = had a non-trial sub covering the visit date; else ex-alumno) | same |
| 4a reservas / cancel / late cancel | `wellhub_bookings` (`confirmed`, `canceled`, `late_canceled`, `rejected`) → `wellhub_slots.session_date` + `schedules.branch_id` | slot date |
| 4b no-shows | `bookings` `source='wellhub' AND status='no_show'` → `schedules.branch_id` | `booking_date` |
| 4c conversiones | `wellhub_conversions` (+ plan name) | `branch_id`, `local_date` |

`wellhub_bookings.status` values are `pending | confirmed | rejected | canceled | late_canceled` (`wellhub/service.ts:717,740,875`); `pending` should not appear past 15 min (`sync-service.ts:697 expireDeadPendings`).

### Anti-Patterns to Avoid
- **`ne(bookings.source, 'wellhub')`**: drops every legacy `NULL` row (most of prod). Always `source IS NULL OR source <> 'wellhub'` (helper).
- **Adding fields to a service return without the response schema**: fast-json-stringify strips them; the admin gets `undefined`. Precedent comments at `scheduling/schemas.ts:139-147`.
- **Reusing `DELETE /admin/members/:userId` for the merge**: cancels live Wellhub bookings.
- **Counting Wellhub only by `attendance.source='wellhub'`** after D-19: every Wellhub predicate must use BOTH values (`WELLHUB_ATTENDANCE_SOURCES`).
- **Inventing a parallel "convert" endpoint**: D-17 forbids it; the hook in `recomputeUserStatus` captures every existing charge path.
- **New Wellhub toggles on other pages**: D-13. Only the Alumnos toggle is new.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Is this member active today" | a new MAX(end_date) query | `membershipInEffectSql` / `effectiveMemberStatusSql` | FA-10: three near-copies drifted |
| Conversion detection | a new endpoint or trigger | hook in `recomputeUserStatus` (phase-194 precedent) | single choke point for all charge paths, atomic with the flip |
| App access | new invite/magic link | `resetMemberPassword` + `sendPasswordSetEmail` (same email as admin-created members, `members/routes.ts:860-875`) | already in prod, same UX as every new member |
| Audit trail | new log table | `auditLog.write` | write-only, in-tx helper |
| Soft delete | new delete logic | `softDeleteMember` semantics (tx variant) | email/DNI scrub keeps the per-tenant unique email free |
| Month/branch report scaffolding | new pattern | `invitation-report.ts` + `InvitationsReport.vue` | month validation, scope, UI picker already solved |
| Enum value introspection in tests | custom | `test/migrations/0285-0286-extra-blocks.test.ts` `enumValues()` | INFORMATION_SCHEMA helper exists |

## D-18 fix-point matrix (verified)

All in `el-templo-api/src/`. "W-booking" = `bookings.source='wellhub'`; "W-att" = `attendance_source IN ('wellhub','wellhub_manual')`.

| # | Site | Today | Fix |
|---|------|-------|-----|
| 1 | `jobs/mark-no-shows.ts:149-187` select + `:202-252` decrement | marks `no_show` and decrements `classesRemaining` regardless of source | keep marking all (report needs Wellhub no-shows); select `bookings.source`; skip W-bookings when building `memberCounts` |
| 2 | `attendance/service.ts:126-148` `bookingsInRange` (QR check-in) | a W-booking can be the `matchingBooking` → decrements the socio's plan, sets `qr_escaneado`, and later the Wellhub checkin is "already_checked_in" (not billed) | exclude W-bookings |
| 3 | `attendance/service.ts:241` fast-path + `:292` in-tx one-per-day | W-att blocks "Ya registraste asistencia hoy" | exclude W-att |
| 4 | `attendance/service.ts:1418` `countWeeklyAttendance` | W-att consumes weekly limit | exclude W-att |
| 5 | `attendance/service.ts:880` `coachCheckIn` one-per-day | W-att blocks the socio's own manual presence | exclude W-att on the plan side; on the Wellhub side compare only against W-att |
| 6 | `attendance/service.ts:1023` `removeCheckIn` | +1 class / AURA reversal / completed_sessions delete on a Wellhub row | Pattern 5 |
| 7 | `scheduling/booking-service.ts:415` same-day rule (8b) | W-booking blocks the socio's own reservation that day | exclude W-bookings |
| 8 | `booking-service.ts:2400` `countWeeklyBookings` (used at `:370` reserve and `:944` adminAddBooking) | W-bookings consume weekly limit | exclude |
| 9 | `booking-service.ts:2555` `countFuturePendingBookings` (`:293` budget) and `:2587` `countBonusBookings` (`:341`, `:2644`) | W-bookings count as committed/bonus | exclude |
| 10 | `wellhub/service.ts:364` webhook one-per-day guard | socio's own QR attendance makes the Wellhub checkin "already_checked_in" → not validated → not billed | recommended: compare only against W-att (symmetric separation; keeps the existing test "segundo checkin del día → already_checked_in") |
| 11 | `wellhub/service.ts:419-439` `todayBooking` lookup | can pick the socio's OWN booking and confirm it with the Wellhub visit | add `bookings.source='wellhub'` |

Not touched (correct as-is): capacity counts `countActiveBookings` (`:2362`) and the Wellhub booking duplicate check (shared pool, D-locked). The duplicate check on the unique index means a socio can never hold an own booking and a Wellhub booking on the same class/date.

## D-11 cancel-path matrix (verified)

| Path | Caller | Recommendation |
|------|--------|----------------|
| `adminRemoveBooking` `booking-service.ts:1063` | `DELETE /api/admin/scheduling/bookings/:bookingId` (`scheduling/routes.ts:895-910`) | **Reject** `source='wellhub'` with `ConflictError("Esta reserva se gestiona desde la app de Wellhub")` (409). Also covers the "undo no_show" use. |
| `cancel()` (member self-cancel) `:526` | member app | **Recommend reject** too (API-only change; the app is untouched but would otherwise desync Wellhub). See Open Question 3. |
| `cancelFutureBookings` `:2011` | subscription cancel/pause/change (`subscriptions/service.ts:2945,3154,3391,3813,4566`) | **Exclude** W-bookings: plan lifecycle must not touch Wellhub reservations (D-18 spirit). |
| `cancelUpcomingBookingsForMember` `:1191` | invitation void (`referrals/invitation-service.ts:570`) | **Exclude** W-bookings. |
| `DELETE /api/admin/members/:userId` bulk cancel (`members/routes.ts:1570-1588`) | member soft delete | **Exclude** W-bookings, or block deleting a member with live Wellhub bookings. Recommend exclude + log. |
| `cancelAllFutureBookingsForSchedule` `:1141`, `cancelBookingsFromDateAndGrantCredits` `:1447` | class closure / schedule deletion (`scheduling/routes.ts:584,633,741`) | **Keep cancelling** (the class doesn't run) but note: Wellhub is not told. `WellhubClient.cancelBookingByGym` exists (`wellhub/client.ts:269`) and is unused. Out of scope; flag (Open Question 4). |

Admin: `SlotDetailDialog.vue` delete buttons at `:343` (regular), `:392`, `:442` (waitlist/trial lists, future view) and `:533` (today view). Disable with `<q-tooltip>Se gestiona desde la app de Wellhub</q-tooltip>`. "Marcar asistencia" (`:521`) stays enabled.

## D-10 Horarios data (verified)

- Today/past view: `getSlotAttendance` (`attendance/service.ts:581`) selects bookings at `:614-650` without `bookings.source`; add `bookingSource`, expose `isWellhub = bookingSource==='wellhub' || attendance source ∈ W-att`. Response schema `attendance/schemas.ts:105-140` (`slotAttendanceItemSchema`) must declare it. Admin type `types/attendance.ts:36-50`.
- Future view: `getSlotDetail` (`scheduling/service.ts:587-660`) builds `BookingRecord`; add `source` to `BookingRecord` (`scheduling/types.ts:121`), the mapping, and `bookingRecordSchema` (`scheduling/schemas.ts:~115-150`). Making it a required interface field forces `getBookingRecord` (`booking-service.ts:2744`) and my-bookings to set it (tsc catches).
- Render: next to the existing "Visita · <Sede>" badge pattern (`SlotDetailDialog.vue:323,371,422`, `isVisitorBooking` `:1164`) and in the today list next to `PRUEBA` (`:476-481`).

## Categorical surfaces inventory (D-13/D-14) — verified

Surfaces that ALREADY show categories where Wellhub becomes one more:

| Surface | Category today | Change | Files |
|---|---|---|---|
| Reportes › Accesos: source filter, column, xlsx "Fuente" | QR / Manual (everything not `qr` renders as "Manual") | add "Wellhub" (filter `wellhub` → `IN ('wellhub','wellhub_manual')`; row label "Wellhub" / "Wellhub (a mano)") | API `reports/schemas.ts:63,81`, `routes.ts:117,488,521-532`, `types.ts:21,76`, `service.ts:654,3292`; admin `ReportesPage.vue:1047-1051,1141-1145,1165,1194`, `types/report.ts:17,75` |
| Ficha › Asistencia "Fuente" badge | QR / Manual | add labels for `wellhub`, `wellhub_manual` | admin `types/attendance.ts:8,29-32`, `MemberAttendanceTab.vue:51-55` |
| Estado badge (list, ficha, export, Cobros typeahead) | Freemium/En Prueba/Activo/Inactivo | `wellhub` status + "· Wellhub" suffix (D-01) | admin `useStatusBadge.ts:22-34`, `types/member.ts:105`, `useMembersApi.ts:~62,~82`; API export `members/service.ts:2515` |
| Horarios roster chips | PRUEBA, Visita · Sede, segment/seniority | "Wellhub" chip (D-10) | see D-10 |
| Funnel `entryOrigin` | all / directo / freemium | add `wellhub` (API only, see D-15 finding) | `analytics/types.ts:307`, `schemas.ts:397-400,426-429`, `funnel-service.ts:131,~285` |

Verified number-only (NO change, totals include Wellhub): `attendance-metrics-service.ts:71` uniqueMembers, `:149` check-in adoption by branch, `analytics/service.ts` daily check-ins/heatmap/occupancy/no-show/avg, `AsistenciaTab.vue` (charts only), TV/check-ins roster `attendeeCount`. Trial funnels (`trial-funnel-service.ts`, `reports/service.ts:1835` conversion report) have axes branch/country/turno/plan only and are lead-pipeline: do NOT add Wellhub there. `SlotAttendancePanel.vue` is unused: don't touch.

**D-15 finding:** `FunnelService.getFunnel` (`analytics/funnel-service.ts`, the only funnel with an origin selector) is wired in `useAnalyticsApi.ts:174` but no page renders it (grep: zero `.vue` consumers; its own header says "hidden in UI"). Recommendation: add `entryOrigin='wellhub'` (cohort = month of Wellhub entry, stage = first conversion from `wellhub_conversions`, 2-stage wellhub → activo) to keep the API consistent, and make the Wellhub → socio rate visible in the Wellhub report (item 4: conversions ÷ distinct Wellhub persons). Ask Franco if he expected it inside a visible funnel (Open Question 1).

## App access on conversion (D-17) — mechanism verified

| Candidate | Fits? | Evidence |
|---|---|---|
| Phase 194 invitations | No: they grant trial ACCESS inside the lead pipeline (`referrals/invitation-*`), which D-locked rules exclude for Wellhub | `invitation-assisted.ts:1-12`, `invitation-purchase.ts` |
| Self-serve forgot-password (6-digit code) | Works but passive (member must know to use it) | `auth/password-reset-service.ts`, `POST /api/auth/forgot-password` `/reset-password` (`auth/routes.ts:1097,1131`) |
| Admin reset to temp password `eltemplo2026` | Yes, but sends NO email | `PUT /api/admin/members/:userId/password` (`members/routes.ts:1628`), `MEMBER_LIFECYCLE_ROLES` |
| Password-set email with temp password | Yes: the email every admin-created member gets | `EmailService.sendPasswordSetEmail` (`email/service.ts:30`), used at `members/routes.ts:860-875` |

**Recommendation:** new `POST /api/admin/members/:userId/app-access` = `resetMemberPassword` + `sendPasswordSetEmail` (best effort, logs Resend rejection) under `MEMBER_LIFECYCLE_ROLES`. Admin: action "Enviar acceso a la app" in the Wellhub card; after `AssignPlanDialog @assigned` on a Wellhub ficha, if `!hasLoggedIn`, prompt "¿Enviarle el acceso a la app?" (same `$q.dialog` pattern as "¿Cargar membresía?" `AlumnoDetailPage.vue:1466-1475`). Ex-alumnos who already have a password are not reset automatically. Do not auto-send from inside `recomputeUserStatus` (email is post-commit and that method has 11 callers).

## Cobros (D-09)

- API: `searchMembers` (`members/service.ts:587-740`) adds `isWellhub` + `showWellhubLabel` to both projections (own branch and the minimal visitor projection; keep the visitor projection minimal: only `showWellhubLabel`), plus `memberSearchItem` response schema (`members/schemas.ts:259` `searchMembersSchema`).
- Admin: `CobrosPage.vue` `buildMemberOption` (`:2005-2034`) adds a "Wellhub" badge when `showWellhubLabel`; `onMemberSelected` (`:2179`) and the deep-link prefill `?memberId=` (`:2488-2500`) open a dialog "Es un visitante Wellhub: para cobrarle, asocialo desde su ficha" → `router.push('/alumnos/:id')` (optionally `?asociar=1` to auto-open the CTA) and clear the selection. Block all modes (alta/renovación/suelto) per D-09.

## Campaign `bajas` (D-12)

`campaigns/audience-service.ts:132-144` `bajasConditions()`: add `isNull(u.gympassId)`. Only `bajas` contains `inactivo` users with paid history; the other segments already exclude Wellhub visitors (inventory table, verified for `freemium_elegibles` `:103`).

## Tenancy gates (new table + new routes) — verified counts on this branch

New gym-owned table `wellhub_conversions`:
1. `src/db/tenant-tables.ts`: add to `GYM_OWNED_TABLES` (alphabetical, near `:181-184`) and to `TENANT_STRICT_MODULES.wellhub` (`:686-690`).
2. `test/db/tenant-tables.test.ts:124,129`: `104 → 105`, `109 → 110` (+ history comment); `MODULOS_DECLARADOS` wellhub entry.
3. `test/migrations/0192-0195-tenant-columns.test.ts:182`: `gymOwnedChecked 104 → 105`.
4. `test/migrations/0196-tenant-unique-contracts.test.ts:643-644`: count + message text `104 → 105`.
5. `test/helpers.ts` `TABLES_TO_CLEAN` (~`:201`): add `schema.wellhubConversions` BEFORE `users`/`subscriptions`.
6. Unique must start with `tenant_id`; the FK `fk_wellhub_conversions_tenant` provides the tenant-leading index (verifier rule 2).

New routes (each):
- `test/tenant-manifest.ts` entry `"<METHOD> <url>": { categoria: "tenant-scoped" }` + `ENTRADAS_BASELINE` (`test/tenancy/iso-01-manifiesto.test.ts:349`, currently 478) +N and the `it` title.
- Under `/api/admin/members` (card, app-access, merge): one ISO-03 case each in the members family (`iso-03-members-ficha.test.ts` or similar) with two `it` (foreign resource indistinguishable from nonexistent: 404/400 never 403 + DB evidence; positive control) and `CASOS_BASELINE` (`iso-03-cobertura-members.test.ts:192`, currently 35) +3.
- `/api/admin/reports/wellhub`: reports is NOT under an ISO-03 prefix → ISO-01 only.
- No new jobs → `con-04` untouched. Raw SQL must name the tenant inline (`con-06` lint): never add to `tenant-lint-allowlist.json`.
- Test queries against strict tables need `tenantWhere(table, TEMPLO_CTX)` (sentinel throws in tests).

**Merge-time conflict warning:** `origin/staging` has different baselines (`GYM_OWNED_TABLES` 114/119, `ENTRADAS_BASELINE` 516) because of Conquer. These lines WILL conflict when this branch merges into staging; resolve by applying the same +N deltas on staging's numbers. `[VERIFIED: git show origin/staging]`

## Migration

**Number: 0300.** `origin/master` and `origin/staging` top out at `0297_novedades_push.sql`, but local unpushed `feat/201-conquer` already has `0298_conquer_corrections.sql` and `0299_conquer_tutorials.sql`. `[VERIFIED: git ls-tree on all refs]` Re-check right before committing (other branches may move).

Contents of `0300_wellhub_usuarios.sql` (hand-written, header without `;` in comments, follow 0186/0286 style):
```sql
ALTER TABLE `attendance` MODIFY COLUMN `attendance_source` enum('qr','manual','wellhub','wellhub_manual') NOT NULL DEFAULT 'qr';

CREATE TABLE `wellhub_conversions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `subscription_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `from_status` varchar(16) NULL,
  `kind` varchar(16) NOT NULL,          -- nuevo | ex_alumno | otro
  `local_date` varchar(10) NOT NULL,    -- YYYY-MM-DD in the branch tz
  `converted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_wellhub_conversions_tenant_user_sub` (`tenant_id`, `user_id`, `subscription_id`),
  KEY `idx_wellhub_conversions_tenant_branch_date` (`tenant_id`, `branch_id`, `local_date`),
  CONSTRAINT `fk_wellhub_conversions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `wellhub_conversions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `wellhub_conversions_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`)
);
```
(The inline `--` comments above are illustrative for the planner; in the real file put prose in the header and keep statements clean.) Schema: `attendanceSourceEnum` at `schema/attendance.ts:24-28` gets `"wellhub_manual"` appended (byte-identical list). Drizzle table in `schema/wellhub.ts` with `tenantIdColumn()`. No data statements: there are no historical conversions (pilot started 2026-10-27).

## Runtime State Inventory

Not a rename phase; one prod-data check is still worth a human checkpoint:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Possible Wellhub no-show decrements or manual-check-in side effects already applied in prod since 2026-10-27 | Read-only SQL check before shipping (`bookings` `source='wellhub' AND status='no_show'` joined to active members). Needs Franco's OK (SSH rule). Expected: none. |
| Live service config | Wellhub portal (webhook URL, gym 856836) | None: no contract change |
| OS-registered state | None: no new cron | — |
| Secrets/env vars | None new | — |
| Build artifacts | Worktree has NO `node_modules` in `el-templo-api` or `el-templo-admin` | Executors need them (previous worktrees symlinked `node_modules`); ask Franco before installing |

## Common Pitfalls

### Pitfall 1: NULL `bookings.source`
**What goes wrong:** `source <> 'wellhub'` excludes every legacy row (NULL), silently emptying counters.
**How to avoid:** only through `notWellhubBookingSql()`; test with a NULL-source booking.
**Warning signs:** weekly-limit tests pass "too easily".

### Pitfall 2: Response schema stripping
**What goes wrong:** new fields never reach the admin.
**How to avoid:** for each new field, add it to the response schema and assert it in an `app.inject` test (not a service call).

### Pitfall 3: `mysqlEnum` / migration byte drift
**What goes wrong:** `attendance_source` list differs between schema and SQL → CI-only failures (FA-02).
**How to avoid:** append last; migration test reads INFORMATION_SCHEMA.

### Pitfall 4: Global unique `gympass_id` during merge
**What goes wrong:** setting the target first violates the unique key.
**How to avoid:** NULL the source first, same tx.

### Pitfall 5: Wellhub predicates checking only `'wellhub'`
**What goes wrong:** after D-19, manual Wellhub presences fall back into "plan" logic or disappear from Wellhub views.
**How to avoid:** `WELLHUB_ATTENDANCE_SOURCES` everywhere; grep for `"wellhub"` literals at the end of the phase.

### Pitfall 6: Tenancy count asserts and staging conflicts
**What goes wrong:** CI red in 4-5 numeric asserts that `tsc`/lint don't see; textual conflicts on staging merge.
**How to avoid:** update all five in the same commit as the table; note the staging numbers.

### Pitfall 7: Hardcoded user ids / UTC dates in tests
**What goes wrong:** CI-only FK failures; night-time UTC vs sede-date flakiness.
**How to avoid:** create users in fixtures; compute dates with `todayInTz(branch.timezone)` for anything compared to `session_date`/`booking_date`.

### Pitfall 8: `removeCheckIn` uses `checkedInAt` UTC date to revert the booking
**What goes wrong:** existing quirk (`attendance/service.ts:1095-1098`): the booking revert/`completed_sessions` delete use the UTC date of `checked_in_at`, not `session_date`. For a Wellhub-manual undo use `session_date`.

### Pitfall 9: Conversion recorded twice or for lapsed socios
**What goes wrong:** recompute runs several times per flow; a socio who lapses for a day and renews would count as a "Wellhub conversion".
**How to avoid:** transition guard (`before ≠ activo → after = activo`) + unique key + Wellhub-activity-in-window predicate.

## Code Examples

### Conversion hook placement (existing code, `subscriptions/service.ts:7888-7895`)
```typescript
// Fase 194 D-18: conversión explícita de la invitación ...
if (ctx) {
  await attributeInvitationPurchase(tx, this.db, ctx, userId, this.log);
  // Fase 204 (D-04/D-17): add here
  // await recordWellhubConversion(tx, ctx, userId, statusBefore, statusAfter, this.log);
}
```

### Filter + projection from one fragment (existing precedent, `members/service.ts:367-382` (projection `:468`))
```typescript
const hasActiveInvitationExpr = sql<number>`EXISTS (
  SELECT 1 FROM invitations i
  WHERE i.tenant_id = ${ctx.tenantId}
    AND i.invited_user_id = users.id
    AND i.status = 'active'
)`;
if (origin === "invitacion") conditions.push(hasActiveInvitationExpr);
// ... select: isInvited: sql<number>`(${hasActiveInvitationExpr})`
```
Use outer refs as literal `users.id` inside correlated subqueries (FA-01: Drizzle renders unqualified columns in `.select()`).

### Status badge extension (admin)
```typescript
// useStatusBadge.ts: add wellhub to both Records (Record<UserStatus,…> makes tsc enforce completeness)
wellhub: 'secondary',   // Clay #7d5d42 (quasar.variables.scss:8), warm, distinct from primary/positive/grey
// label rule (pure helper, unit-testable):
// status==='wellhub' → 'Wellhub'; showWellhubLabel && status!=='activo' → `${label} · Wellhub`
```
`[ASSUMED]` color choice: `secondary` is not used by any status today; Franco may prefer another warm token (Aged Gold `#B89B5E` would need a custom class).

## State of the Art

| Old (inventory) | Current reality | Impact |
|---|---|---|
| Next migration 0298 | 0300 (0298/0299 taken by local `feat/201-conquer`) | renumbering avoided |
| Status flip at `subscriptions/service.ts:~7294` | CASE at `:7803` inside `recomputeUserStatus` `:7723` | hook location |
| Log de accesos at `reports/service.ts:371`, schema `:48` | `getAccessLog` `:549`, filter `:3292`, schema `:63,81` | file refs |
| D-18 = 2 sites | 11 sites (matrix) | scope of the bug-fix plan |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Wellhub's own one-per-day guard should only consider Wellhub attendance (socio can do own class + Wellhub visit same day, both recorded) | D-18 matrix #10 | If Franco wants "one visit per day total", revert to current guard; billing implications |
| A2 | Member self-cancel (`cancel()`) should also reject Wellhub bookings | D-11 matrix | App shows an error toast on a Wellhub booking; acceptable since the app is out of scope |
| A3 | Removing a validated `source='wellhub'` attendance should be rejected | Pattern 5 | Staff can't correct a mistaken Wellhub validation from our side |
| A4 | Conversion requires Wellhub activity since the user last left `activo` | Pattern 4 | Too strict/lenient counting of conversions in the report |
| A5 | "Socio" classification in report = had non-trial sub covering the visit date; "nuevo" = has `user_status_history` row `source='wellhub'` | Pattern 7 | Mislabeled person categories |
| A6 | Wellhub badge color `secondary` (Clay) | Code Examples | Cosmetic |
| A7 | Visible Wellhub conversion rate lives in the Wellhub report, funnel `entryOrigin='wellhub'` is API-only | D-15 finding | Franco may expect it in Analíticas › Conversión |
| A8 | "Primer plan pago" = membership in effect (same gate that flips `activo`), price stored for the report; 0-price plans still count | Pattern 4 | Bonificado conversions inflate the count |

## Open Questions

1. **Which funnel for D-15?** The origin-aware funnel exists only in the API. Recommendation: API `entryOrigin='wellhub'` + rate in the Wellhub report; confirm with Franco in text, proceed with the recommendation (chain rule: don't block).
2. **Conversion predicate (A4/A8).** Recommend activity-window predicate and record regardless of price, storing `price_paid` so the report can filter.
3. **Member self-cancel (A2).** Recommend reject in API.
4. **Class closures cancel Wellhub bookings without notifying Wellhub.** Pre-existing gap (`cancelBookingByGym` unused). Out of scope; suggest a follow-up.
5. **`DELETE /admin/members/:userId` with live Wellhub bookings.** Recommend exclude them from the bulk cancel.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | API/admin | ✓ | v22.22.0 | — |
| pnpm | scripts | ✓ | 10.28.2 | — |
| MySQL client/server | integration tests (CI runs them) | ✓ client | 8.0.46 | CI |
| `node_modules` in this worktree | typecheck/lint/tests | ✗ | — | symlink from another worktree, ask Franco first |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (API integration, real MySQL `eltemplo_test_<pool>`) |
| Config file | `el-templo-api/vitest.config.ts` (`test/**/*.test.ts`) |
| Quick run command (single file, only if Franco OKs) | `cd el-templo-api && pnpm vitest run test/wellhub/plan-separation.test.ts` |
| Full suite command | CI only (`pnpm test` = `vitest run`); do not run locally |
| Admin pure helpers | `el-templo-admin/src/utils/__tests__/*.test.ts` (vitest style; not wired into CI) |
| Static checks | API `pnpm exec tsc --noEmit`, `pnpm lint:tenant`; admin `vue-tsc --noEmit` (CI doesn't typecheck admin) |

### Fixtures (Wave 0)
`test/fixtures/wellhub-personas.ts` creating, per test, with `tenantValues(TEMPLO_CTX, …)` and fresh users (never hardcoded ids):
- **Visitante nuevo:** `users.status='wellhub'`, `gympass_id`, `user_status_history (null→wellhub, source 'wellhub')`.
- **Ex-alumno (Palladino):** `status='inactivo'`, an expired paid subscription (`price_type_applied <> 'zero'`), `gympass_id`.
- **Socio activo:** `createTestMember` + `assignTestPlan` with `classesRemaining` and `classesPerWeek` set, plus `gympass_id`.
- Helpers to insert `bookings(source='wellhub')`, `attendance(source='wellhub'|'wellhub_manual')`, `wellhub_bookings` rows; reuse `stubWellhubApi`/`sign` from `test/wellhub/webhook-*.test.ts` for webhook-driven cases (extract them to the fixture file for DRY).

### Decision → Test Map
| Dec | Behavior | Type | File | Exists? |
|-----|----------|------|------|---------|
| D-18 | no-show of W-booking: marked `no_show`, `classesRemaining` unchanged; own no-show still decrements | integration (`runMarkNoShows`) | `test/wellhub/plan-separation.test.ts` | ❌ W0 |
| D-18 | socio with W-att today can QR-check-in own class; weekly count ignores W-att; QR never matches a W-booking | integration | same | ❌ |
| D-18 | `reserve()`: W-booking today doesn't trigger same-day 409; doesn't consume weekly/budget/bonus; NULL-source booking still counts | integration | same | ❌ |
| D-18 | webhook checkin after own QR attendance → processed (A1); `todayBooking` confirms only the W-booking | integration (webhook) | same | ❌ |
| D-19 | staff marks W-booking: `attendance_source='wellhub_manual'`, booking `confirmado`, no AURA, no decrement, no completed_sessions; job doesn't no-show it | integration | `test/wellhub/manual-presence.test.ts` | ❌ |
| D-19 | undo `wellhub_manual`: row deleted, booking `reservado`, plan unchanged; undo `wellhub` → rejected | integration | same | ❌ |
| D-11 | `DELETE /api/admin/scheduling/bookings/:id` on W-booking → 409, booking unchanged; own booking still cancellable; sub cancel doesn't cancel W-bookings | integration | same | ❌ |
| D-01/03 | list/search/detail return `showWellhubLabel` true for visitor+ex-alumno, false for socio activo; `status=wellhub` 200 | integration (`app.inject`) | `test/wellhub/members-wellhub.test.ts` | ❌ |
| D-07 | `wellhubOnly=true` returns visitor + ex-alumno + socio with W-activity ≤30d, excludes socio with W-activity >30d and non-Wellhub; combinable with `status` | integration | same | ❌ |
| D-08 | export Estado "Wellhub" / "Inactivo · Wellhub" | integration | same | ❌ |
| D-12 | `bajas` audience excludes ex-alumno with gympass | integration | same (or extend `test/campaigns-audience.test.ts`) | ❌ |
| D-04/17 | assign plan to visitor → `activo` + one `wellhub_conversions` row (kind `nuevo`); ex-alumno → kind `ex_alumno`; socio renewal → no row; idempotent | integration | `test/wellhub/conversion.test.ts` | ❌ |
| D-17 | `POST …/app-access` resets password (login with temp works), roles enforced, 404 cross-tenant | integration | same | ❌ |
| D-20 | `GET …/wellhub` card values (last visit, month/total, branches, next booking, null when no gympass) | integration | same or members-wellhub | ❌ |
| D-21 | merge happy path (gympass moved, rows repointed, source soft-deleted, audit row); rejects: non-admin 403, source not pure, target has other gympass, both live bookings same class; atomic rollback | integration | `test/wellhub/merge.test.ts` | ❌ |
| D-14 | access log `source=wellhub` returns both Wellhub values; response contains `wellhub` | integration | `test/reports/wellhub-report.test.ts` | ❌ |
| D-16 | report items 1-4 per branch/month, sede tz month boundary | integration | same | ❌ |
| D-15 | funnel `entryOrigin=wellhub` 200 + cohort math | integration | same or `test/analytics/…` | ❌ |
| Tenancy | 5 counts + ISO-01 + ISO-03 cases | existing gates | `test/db`, `test/migrations`, `test/tenancy` | ✅ update |
| Migration | enum value present, table + unique shape | integration | `test/migrations/0300-wellhub-usuarios.test.ts` | ❌ |
| Admin | label/chip pure helpers | unit | `el-templo-admin/src/utils/__tests__/wellhub-label.test.ts` | ❌ |
| D-09/10/11 UI | badge, chip, disabled button, Cobros dialog | manual UAT (staging) | — | manual |

### Sampling Rate
- Per task commit: API `tsc --noEmit` + `lint:tenant`; admin `vue-tsc` for touched files (orchestrator check per CLAUDE.md).
- Per wave: push decision is Franco's; CI runs the full suite.
- Phase gate: CI green on staging + UAT with the three personas (Palladino-like ex-alumno, new visitor, socio activo).

### Wave 0 Gaps
- [ ] `test/fixtures/wellhub-personas.ts` (3 personas + insert helpers + extracted webhook stub/sign)
- [ ] `node_modules` available in the worktree (human decision)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (app-access resets a password) | existing `resetMemberPassword` (refuses staff/deleted, tenant-scoped), Resend email, `MEMBER_LIFECYCLE_ROLES` |
| V3 Session Management | no | — |
| V4 Access Control | yes | merge: `ADMIN_ROLES`; plugin `MEMBER_ROLES` + `enforceMemberBranchScope`; target-side cross-country guard; `assertTenant` + `tenantWhere`; ISO-03 cases (foreign id = 404) |
| V5 Input Validation | yes | Fastify JSON schemas with `integer` params (FA-07), `month` pattern `^\d{4}-\d{2}$`, closed enums |
| V6 Cryptography | no new | argon2 via existing service |
| V7 Logging/Audit | yes | `auditLog.write` in the merge tx; Pino `request.log.info` for app-access and merge |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Merge used to hijack a real member's history | Tampering/EoP | source must be pure `wellhub` (no subs/payments), admin/owner only, audit row |
| Cross-tenant id in merge target or card | Info disclosure | `tenantWhere` on both ids; 404 indistinguishable (ISO-03) |
| Password reset on staff via app-access | EoP | `resetMemberPassword` refuses `role !== 'member'` |
| Staff cancelling a Wellhub booking (desync, billing) | Tampering | API 409 (D-11) |
| Webhook payload carrying tenant | Spoofing | unchanged: tenant derived server-side (phase 169) |

## Sources

### Primary (HIGH confidence) — read in this session
- `el-templo-api/src/modules/wellhub/service.ts`, `schema/wellhub.ts`, `schema/attendance.ts`, `schema/bookings.ts`, `schema/users.ts`, `schema/user-status-history.ts`, `schema/audit-log.ts`
- `el-templo-api/src/jobs/mark-no-shows.ts`; `modules/attendance/service.ts`, `schemas.ts`; `modules/scheduling/booking-service.ts`, `service.ts`, `routes.ts`, `schemas.ts`, `types.ts`
- `modules/subscriptions/service.ts:7680-7897`; `modules/referrals/invitation-conversion.ts`; `modules/shared/membership.ts`, `audit-log.ts`, `permissions.ts`
- `modules/members/service.ts`, `routes.ts`, `schemas.ts`; `modules/auth/password-reset-service.ts`; `modules/email/service.ts`, `templates.ts`
- `modules/reports/service.ts`, `routes.ts`, `schemas.ts`; `modules/analytics/funnel-service.ts`, `trial-funnel-service.ts`, `attendance-metrics-service.ts`, `types.ts`, `schemas.ts`; `modules/campaigns/audience-service.ts`
- `src/db/tenant-tables.ts`, `src/db/scripts/verify-tenant-uniques.ts`; tests `test/db/tenant-tables.test.ts`, `test/migrations/0192-0195*`, `0196*`, `test/tenancy/iso-01*`, `iso-03-cobertura-*`, `test/helpers.ts`, `test/wellhub/*`
- Admin: `AlumnosPage.vue`, `AlumnoDetailPage.vue`, `CobrosPage.vue`, `ReportesPage.vue`, `SlotDetailDialog.vue`, `MemberAttendanceTab.vue`, `MemberFormDialog.vue`, `useStatusBadge.ts`, `types/attendance.ts`, `types/member.ts`, `useMembersApi.ts`, `useAnalyticsApi.ts`, `components/reports/InvitationsReport.vue`, `css/quasar.variables.scss`
- `git ls-tree` of every local/remote ref for migration numbering; `git show origin/staging:` for staging baselines
- Repo skills: `el-templo-db-migrations`, `el-templo-change-control`, `el-templo-failure-archaeology`; memory notes on tenancy gates/counts, cancel-future-bookings, tests-in-CI, test-user-ids, brand palette

### Secondary / Tertiary
- None: no web sources needed (no external library behavior in question).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new deps; all reuse verified).
- Fix points / architecture: HIGH (line-level reading of current code).
- Product recommendations (A1-A8): MEDIUM, need Franco's confirmation in text (chain rule: proceed with the recommended option).

**Research date:** 2026-10-27
**Valid until:** ~2026-11-10 (fast-moving repo; re-verify migration number and staging baselines right before execution)
