# Phase 144: Notificaciones y bloqueo de vencimiento de membresía/plan - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 9 (5 API modified, 1 API migration new, 2 App new/modified, 1 App mount point)
**Analogs found:** 9 / 9 (every surface has a concrete in-repo molde)

Spans 2 apps: `el-templo-api` (cron + templates + schema + booking validation) and `el-templo-app` (expiry dialog + booking-block dialog). Admin app NOT touched.

> Line numbers below were re-verified against live code on 2026-06-25; several drifted from CONTEXT's `canonical_refs` and are corrected here (notably `autoExpireSubscriptions` is now at §3694, not §3580; the Program Renewal Warning cron block is §346-398 as documented).

---

## File Classification

| New/Modified File                                                                                   | Role         | Data Flow                 | Closest Analog                                                                   | Match Quality |
| --------------------------------------------------------------------------------------------------- | ------------ | ------------------------- | -------------------------------------------------------------------------------- | ------------- |
| `el-templo-api/src/jobs/notification-cron.ts` (MODIFY: new "Plan Renewal Warning" block)            | job/cron     | batch + event-driven      | same file §346-398 "Program Renewal Warning"                                     | exact         |
| `el-templo-api/src/modules/notifications/types.ts` (MODIFY: `planes` category + templates)          | config/seed  | transform                 | same file §3-18 enums, §75-188 `TEMPLATE_SEEDS`                                  | exact         |
| `el-templo-api/src/db/schema/notifications.ts` (MODIFY: enum value)                                 | model/schema | CRUD                      | same file §16 `notificationCategoryEnum`                                         | exact         |
| `el-templo-api/src/db/migrations/XXXX_*.sql` (NEW: alter enum + backfill prefs)                     | migration    | DDL                       | existing enum migrations (Drizzle generate)                                      | role-match    |
| `el-templo-api/src/modules/subscriptions/service.ts` (MODIFY: covered-until derivation)             | service      | CRUD/read                 | same file §568-640 `getMemberSubscription`, §3694-3773 `autoExpireSubscriptions` | exact         |
| `el-templo-api/src/modules/scheduling/booking-service.ts` (MODIFY: `reserve()` coverage check)      | service      | request-response          | same file §82-87 membership gate                                                 | exact         |
| `el-templo-api/src/modules/scheduling/routes.ts` (MODIFY: surface distinguishable code)             | route        | request-response          | same file §160-182 ConflictError structured-payload branch                       | exact         |
| `el-templo-app/src/components/PlanExpiryDialog.vue` (NEW)                                           | component    | event-driven (foreground) | `RatingPromptDialog.vue` (+ `PushPermissionDialog.vue`)                          | exact         |
| `el-templo-app/src/pages/ReservasPage.vue` (MODIFY: booking-block dialog in `confirmReserve` catch) | component    | request-response          | same file §1179-1207 `confirmReserve`, §680-748 WhatsApp CTA                     | exact         |
| `el-templo-app/src/layouts/MainLayout.vue` (MODIFY: mount `<PlanExpiryDialog />`)                   | layout       | n/a                       | same file §135-150 (PushPermission/RatingPrompt mount)                           | exact         |

---

## Pattern Assignments

### `el-templo-api/src/jobs/notification-cron.ts` — new "Plan Renewal Warning" block (D-02, D-03, D-05)

**Analog:** same file, "Program Renewal Warning" block §346-398 (inside the 03:00 AR batch cron). This is THE molde — copy its shape: compute a date window, query subscriptions expiring in that window, loop and `queueNotification`, wrapped in defensive try/catch that logs and never throws.

**Core pattern to replicate** (§346-398):

```typescript
// ── Program Renewal Warning (per D-08, D-16) ──
try {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const sixDaysFromNow = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

  const renewalEnrollments = await db
    .select({
      userId: s.programEnrollments.userId,
      enrollmentId: s.programEnrollments.id,
    })
    .from(s.programEnrollments)
    .innerJoin(s.programs, eq(s.programEnrollments.programId, s.programs.id))
    .where(
      and(
        eq(s.programEnrollments.status, "active"),
        sql`DATE_ADD(${s.programEnrollments.enrolledAt}, INTERVAL ${s.programs.durationWeeks} * 7 DAY) BETWEEN ${sixDaysFromNow} AND ${sevenDaysFromNow}`,
      ),
    );

  let renewalWarnings = 0;
  for (const enrollment of renewalEnrollments) {
    try {
      await notificationService.queueNotification({
        userId: enrollment.userId,
        templateKey: "program_renewal_warning",
      });
      renewalWarnings++;
    } catch (renewErr: unknown) {
      const rMsg =
        renewErr instanceof Error ? renewErr.message : "Unknown error";
      log.warn(
        { err: rMsg, userId: enrollment.userId },
        "Failed to queue renewal warning notification",
      );
    }
  }
  if (renewalWarnings > 0)
    log.info({ renewalWarnings }, "Program renewal warnings queued");
} catch (renewalErr: unknown) {
  const rMsg =
    renewalErr instanceof Error ? renewalErr.message : "Unknown error";
  log.error({ err: rMsg }, "Program renewal warning check failed");
}
```

**Deltas for the planes block:**

- Query `subscriptions` (not `programEnrollments`); expiry metric is `subscriptions.end_date` directly (not `enrolledAt + duration`).
- **Three windows** (7d / 3d / today) instead of one. The analog uses a `BETWEEN sixDaysFromNow AND sevenDaysFromNow` 1-day band — replicate one band per trigger (7d band, 3d band, today band) so each fires exactly once even though the cron runs daily. This 1-day band IS the idempotency-per-threshold mechanism (Claude's Discretion D-03) — no tracking column needed if each band is a tight 24h window and the cron runs once/day at 03:00 AR.
- **Covered-until suppression (D-05):** the query must consider the _chain_ (`active` + `scheduled`). Easiest: compute the max `end_date` across the member's `active`/`scheduled` subs (the covered-until) and band-test THAT, so a member with a `scheduled` successor whose end_date is far out never enters any window. See the subscriptions/service.ts derivation below.
- The cron already imports `notificationService` and `db`/`s` (schema alias) — same call site, no new wiring.

---

### `el-templo-api/src/modules/notifications/types.ts` — new category + templates (D-01, D-04)

**Analog:** same file. Two edits: extend the category union/array (§3-18) and append to `TEMPLATE_SEEDS` (§75-188).

**Category pattern** (§3-18) — add `"planes"` to BOTH the type union and the const array:

```typescript
export type NotificationCategory =
  | "entrenamiento"
  | "programas"
  | "motivacion"
  | "anuncios"; // ← add "planes"

export const NOTIFICATION_CATEGORIES = [
  "entrenamiento",
  "programas",
  "motivacion",
  "anuncios", // ← add "planes"
] as const;
```

**Template seed pattern** (§168-177, closest sibling = `program_renewal_warning`):

```typescript
{
  templateKey: "program_renewal_warning",
  category: "programas",
  title: "Tu programa está por vencer",
  body: "Te quedan 7 días de programa. Hablá con tu coach para renovar.",
  titleFemale: "Tu programa está por vencer",
  bodyFemale: "Te quedan 7 dias de programa. Habla con tu coach para renovar.",
  route: "/mi-camino",
},
```

**Deltas:** add `plan_renewal_warning_7d / _3d / _expired` (3 templates) OR one parametrized template (Claude's Discretion D-04). NOTE: `queueNotification` supports `bodyOverride`/`titleOverride` (service.ts §283-289), so a SINGLE template + `bodyOverride` per trigger is viable and DRY. `titleFemale`/`bodyFemale` are required by the `TemplateSeed` interface (§65-73) — provide ASCII-safe female copy like the analogs. Copy text comes from UI-SPEC §113-121 ("Renová tu membresía" title; per-trigger bodies). `category: "planes"`, `route: "/reservas"` or `/mi-templo` (planner picks; the push deep-links via `push-notifications.ts handleTapNavigation`).

---

### `el-templo-api/src/db/schema/notifications.ts` + migration — enum value `planes` (D-01)

**Analog:** same file §16. The enum is shared by `notification_templates.category` (§63) and `notification_preferences.category` (§85).

```typescript
export const notificationCategoryEnum = mysqlEnum("notification_category", [
  "entrenamiento",
  "programas",
  "motivacion",
  "anuncios", // ← add "planes"
]);
```

**CRITICAL (project rule + CONTEXT D-01/§112):**

- Enum change requires a Drizzle **MIGRATION** via `pnpm db:generate` then `pnpm db:migrate`. This project does **NOT** use `drizzle-kit push` / `drizzle-kit migrate` (CLAUDE.md). The `_migrations` DB table is the source of truth.
- The generated SQL must `ALTER TABLE ... MODIFY COLUMN` the enum on BOTH `notification_templates` and `notification_preferences`.
- **Backfill `notification_preferences`:** every existing member needs a `planes` row seeded `enabled=true` (matching the per-category toggle convention, schema §85-86 default `true`). Do this in the same migration.
- **`reference_drizzle_enum_column_name.md` (MEMORY):** `mysqlEnum` 1st arg = column name `"notification_category"` and MUST match the migration exactly or CI fails with "Unknown column" (tsc won't catch it).
- **No `;` inside SQL `--` comments** in the migration (MEMORY: the runner splits on `;` before stripping `--`).
- **Commit the generated `.sql` file** alongside the schema change (MEMORY).

---

### `el-templo-api/src/modules/subscriptions/service.ts` — covered-until derivation (D-00, D-13)

**Analog:** `getMemberSubscription` §568-640 and `autoExpireSubscriptions` §3694-3773 (was §3580 in CONTEXT — drifted).

**Chain-aware query pattern** (§616-635) — already selects across `active`/`paused`/`scheduled` and orders to pick "current":

```typescript
.where(and(
  eq(schema.subscriptions.userId, userId),
  or(
    eq(schema.subscriptions.status, "active"),
    eq(schema.subscriptions.status, "paused"),
    eq(schema.subscriptions.status, "scheduled"),
  ),
))
.orderBy(
  sql`CASE WHEN ${schema.subscriptions.startDate} <= CURDATE() THEN 0 ELSE 1 END`,
  sql`CASE ${schema.subscriptions.status} WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END`,
  schema.subscriptions.startDate,
)
.limit(1);
```

**Chain semantics** (`autoExpireSubscriptions` §3713-3772): a `scheduled` sub with `previousSubscriptionId` pointing at the expiring active sub is the _successor_ that extends coverage; on expiry it is auto-activated. So the "covered-until" = `MAX(end_date)` over the member's `active` + `scheduled` subs (ignore `end_date IS NULL` per D-14 guard — never block/never-suppress on NULL).

**New helper to add** (planner names it, e.g. `getCoveredUntil(userId): Promise<string | null>`): select `MAX(end_date)` filtered to `userId` + status IN (`active`,`scheduled`), returning the furthest date (or null). Reuse this single helper in all three consumers: cron suppression (D-05), the reserve coverage check (D-13), and whatever feeds the app's expiry dialog (D-00/D-10). DRY — do not re-derive the chain in three places.

---

### `el-templo-api/src/modules/scheduling/booking-service.ts` — `reserve()` coverage check (D-12, D-13, D-14)

**Analog & insertion point:** the membership gate at §82-87:

```typescript
// 5. Check active subscription
const subscription =
  await this.subscriptionService.getMemberSubscription(memberId);
if (!subscription) {
  throw new BadRequestError("No tenes una suscripcion activa");
}
```

**Delta:** immediately after this gate, add the coverage check: compute covered-until via the new subscriptions helper, and if `coveredUntil !== null && bookingDate > coveredUntil` → throw a **distinguishable** error (D-12). The booking date is the `date` param (§57-61). D-14: `coveredUntil === null` ⇒ never block.

**Distinguishable error — two options for the planner:**

- **Option A (recommended):** subclass `BadRequestError` with an extra `code` field, e.g. `class CoverageExpiredError extends BadRequestError { readonly code = "COVERAGE_EXPIRED" }`. Mirrors how `ConflictError` carries `affectedSchedules` (routes.ts §160-181). Throw it here; surface it in routes.ts (below).
- **Option B:** plain `BadRequestError` with a sentinel message and match on the message string in the app. Brittle (message is user-facing copy) — avoid.

`BadRequestError` is at `el-templo-api/src/modules/shared/errors.ts §29-33` (extends `AppError` §8-15, `statusCode` only — no `code` field today, so Option A requires adding one).

---

### `el-templo-api/src/modules/scheduling/routes.ts` — surface the code (D-12)

**Analog:** the ConflictError structured-payload branch §160-182 — the exact precedent for sending more than `{error, message}` from a route catch:

```typescript
} catch (err: unknown) {
  if (err instanceof ConflictError && (err as ...).affectedSchedules !== undefined) {
    return reply.code(409).send({ error: "Conflicto", message: err.message, affectedSchedules });
  }
  handleServiceError(err, reply, request.log, "update activity");
}
```

**Delta — reserve route §718-732** (currently just `handleServiceError`):

```typescript
}>("/reserve", { schema: reserveSchema }, async (request, reply) => {
  try {
    const booking = await bookingService.reserve(/* ... */);
    return reply.code(201).send(booking);
  } catch (err: unknown) {
    handleServiceError(err, reply, request.log, "member reserve");  // ← add a branch before this
  }
});
```

Add a dedicated branch before `handleServiceError`: if `err instanceof CoverageExpiredError` (or `(err as ...).code === "COVERAGE_EXPIRED"`), `reply.code(400).send({ error: "Solicitud invalida", message: err.message, code: "COVERAGE_EXPIRED" })`. The default `handleServiceError` (`shared/error-handler.ts §36-39`) only emits `{error, message}`, so the `code` MUST be added in this branch for the app to read `err.response?.data?.code`.

---

### `el-templo-app/src/components/PlanExpiryDialog.vue` — NEW (D-06..D-10)

**Analog:** clone `RatingPromptDialog.vue` (structure + `<style scoped>` verbatim per UI-SPEC mandate). `PushPermissionDialog.vue` is the secondary reference for the optional leading `q-icon` section and the versioned-Preferences-key pattern.

**Reuse the once-per-trigger + foreground-trigger skeleton** (`RatingPromptDialog.vue` §58-160):

```typescript
import { Preferences } from "@capacitor/preferences";
import { useAuthStore } from "stores/useAuthStore";

const show = ref(false);

async function shouldShow(): Promise<boolean> {
  if (!authStore.isAuthenticated) return false;
  // ... fetch covered-until, gate ≤3 days, check "shown today"
}

watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) void evaluate();
  },
  { immediate: true },
);
```

**Deltas (per UI-SPEC §129-139):**

- `<q-dialog v-model="show">` — **NOT** `persistent` (D-07 skippable; RatingPromptDialog already omits `persistent`, PushPermissionDialog uses it — follow RatingPromptDialog).
- Primary CTA `Renovar por WhatsApp` → `buildWhatsAppUrl(authStore.country, 'Hola, quiero renovar mi membresía 💪')` then open externally. Match the existing external-open mechanism (`ReservasPage.vue` uses `window.open(buildWhatsAppUrl(...), '_blank')` §688/§748).
- Secondary flat `Ahora no` → close + record shown-today.
- **Once-per-DAY persistence** (D-08, different from RatingPrompt's once-ever): store `YYYY-MM-DD` under a versioned Capacitor `Preferences` key (e.g. `plan_expiry_shown_v1`); `shouldShow` returns false if the stored date === today. Versioned-key convention from `PushPermissionDialog.vue §48-50` (`push_permission_asked_v1`).
- Gate (D-06/D-10): authenticated AND covered-until ≤3 days (incl. 0 = vence hoy) AND not shown today. Covered-until source (server endpoint vs derive client-side) is planner's call; persistence of "shown today" is local.
- Copy from UI-SPEC §92-101 (title `Tu membresía está por vencer`, N-day body with `1 día` singular, vence-hoy variant).
- Styles: copy the `.rating-dialog*` scoped block verbatim (§163-237) — charcoal `#2e2a26`, terracotta gradient `linear-gradient(135deg, #96593a 0%, #ad6540 100%)`, `border-top: 2px solid rgba(terracotta,0.6)`, `max-width: 340px`. Do NOT restyle.

**Auth country source:** UI-SPEC says `authStore.country`; ReservasPage uses `userStore.profile?.branchCountry`. Planner must confirm which store exposes the country in this dialog's context — `buildWhatsAppUrl` accepts `'AR' | 'ES' | null | undefined` and defaults to AR (whatsapp.ts §24-25), so a null is safe.

---

### `el-templo-app/src/pages/ReservasPage.vue` — booking-block dialog (D-15)

**Analog:** the `confirmReserve` catch §1200-1206 (generic negative notify) and the existing WhatsApp CTA usage §688/§748.

**Current catch** (§1200-1206):

```typescript
} catch (err: unknown) {
  const message = extractError(err, 'Error al reservar')
  $q.notify({ type: 'negative', message })
  log.warn('Reserve failed', { error: message })
}
```

**WhatsApp open pattern already in this file** (§688, §748):

```typescript
window.open(
  buildWhatsAppUrl(userStore.profile?.branchCountry, message),
  "_blank",
);
```

`buildWhatsAppUrl` already imported §628; `extractError` §618; `isExpectedClientError` available in `extract-error.ts §21`.

**Deltas (UI-SPEC §141-146):**

- Discriminate the D-12 error inside the catch: `if (axios.isAxiosError(err) && err.response?.data?.code === 'COVERAGE_EXPIRED')` → open the new booking-block `q-dialog` instead of the generic `$q.notify`. ALL other errors keep the existing `extractError`/negative-notify path unchanged.
- Add a new `q-dialog` in the template styled identically to the charcoal cards. Existing dialogs in this file are plain `q-dialog ... persistent` (§521-606) — they do NOT carry the charcoal card styling, so reuse the `RatingPromptDialog`/`PushPermissionDialog` scoped classes (duplicate the block or extract a shared style; do NOT invent new styling — UI-SPEC §143).
- Primary CTA `Renovar por WhatsApp` → `window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, 'Hola, quiero renovar mi membresía para reservar una clase 💪'), '_blank')`.
- Secondary flat `Entendido` → close. No persistence (action-scoped, re-shows on every too-late retry).
- Copy from UI-SPEC §103-111.

---

### `el-templo-app/src/layouts/MainLayout.vue` — mount point (D-06)

**Analog:** §135-150 where the sibling dialogs are mounted and imported:

```vue
<PushPermissionDialog />
<RatingPromptDialog />
... import PushPermissionDialog from 'src/components/PushPermissionDialog.vue'
import RatingPromptDialog from 'src/components/RatingPromptDialog.vue'
```

**Delta:** add `<PlanExpiryDialog />` next to them and the matching import. Self-triggering (its own `watch(authStore.isAuthenticated)`), exactly like the siblings — no props.

---

## Shared Patterns

### WhatsApp CTA (D-09, D-15)

**Source:** `el-templo-app/src/utils/whatsapp.ts §28-32` → `buildWhatsAppUrl(country, text)`.
**Apply to:** both new dialog CTAs. Resolves number by country (AR `5492235820521`, ES `34680774331` §19-22), URL-encodes the text. Open with `window.open(url, '_blank')` (existing ReservasPage convention).

```typescript
export function buildWhatsAppUrl(
  country: Country | null | undefined,
  text?: string,
): string {
  const number = getWhatsAppNumber(country);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${query}`;
}
```

**Do NOT break** `el-templo-app/test/whatsapp.test.ts` (validates the numbers).

### Notification enqueue (D-02, D-03)

**Source:** `el-templo-api/src/modules/notifications/service.ts §225-309` `queueNotification`.
**Apply to:** the new cron block. It already handles: template lookup, `isEnabled` skip, **per-category preference check** (§259-267 — this is what makes silencing "Planes" work, D-02), no-device-token skip, gender copy, and insert into `pending_notifications`. The block ONLY enqueues; the existing 15-min queue processor sends via FCM (CONTEXT §107/§111). Supports `bodyOverride`/`titleOverride` (§230-232, §283-289) → enables one parametrized template for the 3 triggers.

### Skippable dark-card dialog (D-07, D-15)

**Source:** `RatingPromptDialog.vue` (no `persistent`, `Ahora no` secondary) + `PushPermissionDialog.vue` (icon section, versioned Preferences key).
**Apply to:** `PlanExpiryDialog.vue` and the ReservasPage booking-block dialog. Charcoal `#2e2a26` card, terracotta gradient primary, flat cream-55 secondary, `max-width 340px`, `border-radius 16px`. Styles copied verbatim per UI-SPEC reuse mandate.

### Structured route error (D-12)

**Source:** `el-templo-api/src/modules/scheduling/routes.ts §160-182` (ConflictError + `affectedSchedules`) — the in-repo precedent for emitting a route response richer than the default `{error, message}` (`shared/error-handler.ts §36-39`).
**Apply to:** the `/reserve` route to emit `code: "COVERAGE_EXPIRED"` so the app can discriminate.

### Defensive cron try/catch + structured logging

**Source:** `notification-cron.ts §346-398` (outer try/catch logs + swallows; inner per-item try/catch `log.warn` + continue).
**Apply to:** the new plan-renewal block. Use `request.log`/`app.log` Pino (`log.info/warn/error`), never `console.log` (CLAUDE.md). `catch (err: unknown)` + `instanceof Error` (CLAUDE.md).

---

## No Analog Found

None. Every surface has a concrete in-repo molde. The only genuinely net-new logic is the `MAX(end_date)` covered-until helper, but it is a thin derivation over the already-existing `active`+`scheduled` chain query in `getMemberSubscription` / `autoExpireSubscriptions`.

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/jobs/`, `src/modules/notifications/`, `src/modules/subscriptions/`, `src/modules/scheduling/`, `src/modules/shared/`, `src/db/schema/`
- `el-templo-app/src/components/`, `src/pages/`, `src/layouts/`, `src/utils/`

**Files scanned:** 14 (10 read in full or targeted ranges; 4 grep-located)
**Pattern extraction date:** 2026-06-25

**Project guardrails carried into the plans (from CLAUDE.md + MEMORY):**

- Drizzle enum change ⇒ migration via `pnpm db:generate`/`db:migrate`, NEVER `drizzle-kit push`/`migrate`; commit the `.sql`.
- `mysqlEnum` 1st arg `"notification_category"` MUST match migration (CI-only failure otherwise).
- No `;` in SQL `--` comments.
- No `any`; `catch (err: unknown)` + `instanceof Error`. Pino logger / `createLogger`, never `console.log`.
- New API route behavior needs integration tests in `el-templo-api/test/` (reserve coverage check, cron windows, prefs backfill); tests run in CI, not locally — local `tsc` only.
