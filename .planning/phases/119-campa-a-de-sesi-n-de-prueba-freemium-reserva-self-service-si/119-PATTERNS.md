# Phase 119: Campaña de sesión de prueba freemium - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 23 (new + modified)
**Analogs found:** 21 / 23

> Concrete pattern assignments for the planner. Each new/modified file points at the
> closest existing analog with line-referenced excerpts to copy. Cross-cutting
> conventions are in **Shared Patterns**. Read this alongside CONTEXT (D-01..D-27),
> RESEARCH, and UI-SPEC.

---

## File Classification

### API (`el-templo-api`)

| New/Modified File                                                                  | Role      | Data Flow        | Closest Analog                                             | Match Quality                 |
| ---------------------------------------------------------------------------------- | --------- | ---------------- | ---------------------------------------------------------- | ----------------------------- |
| `src/db/schema/branches.ts` (MODIFY: + `address`)                                  | model     | CRUD             | self (`branches.ts`)                                       | exact (extend)                |
| `src/db/schema/bookings.ts` (MODIFY: + `source`)                                   | model     | CRUD             | self (`bookings.ts`)                                       | exact (extend)                |
| `src/db/schema/campaigns.ts` (NEW: campaigns + sends + events + unsubscribes)      | model     | CRUD/event       | `src/db/schema/user-status-history.ts`                     | role-match (foundation table) |
| `src/db/migrations/01XX_add_branches_address.sql` (NEW)                            | migration | —                | recent `.sql` (e.g. 0128)                                  | role-match                    |
| `src/db/migrations/01XX_add_bookings_source.sql` (NEW)                             | migration | —                | recent `.sql`                                              | role-match                    |
| `src/db/migrations/01XX_create_campaign_tables.sql` (NEW)                          | migration | —                | `0128_create_user_status_history.sql`                      | exact                         |
| `src/modules/scheduling/trials-service.ts` (MODIFY: promote-and-book)              | service   | request-response | self + `members/service.ts:convertFreemiumToTrial`         | exact                         |
| `src/modules/scheduling/booking-service.ts` (MODIFY: 30d window for trials)        | service   | request-response | self (lines 65-75)                                         | exact (extend)                |
| `src/modules/scheduling/routes.ts` (MODIFY: `reserve-trial` + `trial-eligibility`) | route     | request-response | self (`/reserve` ~708, `/trials` ~499, `/branches` ~766)   | exact                         |
| `src/modules/campaigns/service.ts` (NEW: CampaignService facade)                   | service   | batch            | `src/modules/admin/edit-service.ts` (facade)               | role-match                    |
| `src/modules/campaigns/token-service.ts` (NEW: HMAC sign/validate)                 | utility   | transform        | `src/modules/shared/qr-token.ts`                           | exact                         |
| `src/modules/campaigns/tracking-service.ts` (NEW: open/click/unsub)                | service   | event-driven     | `src/modules/scheduling/trials-service.ts` (service shape) | partial                       |
| `src/modules/campaigns/templates.ts` (NEW: MJML→HTML render)                       | utility   | transform        | `src/modules/email/templates.ts`                           | role-match                    |
| `src/modules/campaigns/routes.ts` (NEW: admin + public tracking/unsub)             | route     | request-response | `src/modules/franchise/routes.ts` (mixed public/auth)      | exact                         |
| `src/modules/campaigns/schemas.ts` (NEW: Fastify validation)                       | config    | —                | existing `*Schema` consts in scheduling/routes.ts          | role-match                    |
| `src/modules/email/service.ts` (MODIFY: batch send method)                         | service   | batch            | self                                                       | exact (extend)                |
| `src/app.ts` (MODIFY: register campaign routes)                                    | config    | —                | self (lines 114-218)                                       | exact                         |
| `.env.example` (MODIFY: Resend vars)                                               | config    | —                | self                                                       | exact                         |

### App (`el-templo-app`)

| New/Modified File                                                                | Role      | Data Flow        | Closest Analog                   | Match Quality      |
| -------------------------------------------------------------------------------- | --------- | ---------------- | -------------------------------- | ------------------ |
| `src/pages/ReservasPage.vue` (MODIFY: 3rd state)                                 | component | request-response | self (lines 9-22, 24-48, 50-61)  | exact              |
| `src/composables/useSchedulingApi.ts` (MODIFY: eligibility + reserveTrial)       | hook      | request-response | self (lines 49-63)               | exact              |
| `src/boot/deep-links.ts` (NEW: appUrlOpen listener)                              | provider  | event-driven     | `src/boot/push-notifications.ts` | role-match         |
| `src-capacitor/android/app/src/main/AndroidManifest.xml` (MODIFY: intent-filter) | config    | —                | self                             | exact (greenfield) |
| `src-capacitor/ios/App/App/App.entitlements` (MODIFY: associated-domains)        | config    | —                | self                             | exact (greenfield) |

### Admin (`el-templo-admin`)

| New/Modified File                                    | Role      | Data Flow        | Closest Analog                              | Match Quality |
| ---------------------------------------------------- | --------- | ---------------- | ------------------------------------------- | ------------- |
| `src/pages/CampaniasPage.vue` (NEW)                  | component | request-response | `src/pages/ReportesPage.vue`                | exact         |
| `src/components/campaigns/CampaignFunnel.vue` (NEW)  | component | request-response | `src/components/analytics/FunnelTab.vue`    | exact         |
| `src/composables/useCampaignsApi.ts` (NEW)           | hook      | request-response | `src/composables/useAnalyticsApi.ts`        | exact         |
| `src/router/routes.ts` (MODIFY: `path: 'campanias'`) | route     | —                | self (lines 84-90, `reportes`/`analiticas`) | exact         |

### Web (`el-templo-web`)

| New/Modified File                                           | Role   | Data Flow | Closest Analog             | Match Quality |
| ----------------------------------------------------------- | ------ | --------- | -------------------------- | ------------- |
| `public/email/*` (NEW: logo + hero images)                  | config | file-I/O  | existing `public/images/`  | exact         |
| `public/.well-known/assetlinks.json` (NEW)                  | config | —         | no analog                  | none          |
| `public/.well-known/apple-app-site-association` (NEW)       | config | —         | no analog                  | none          |
| `data/sedes.ts` (REFERENCE for branch addresses, D-13/D-24) | model  | —         | self (canonical addresses) | exact         |

---

## Pattern Assignments

### `src/db/schema/branches.ts` — add `address` (D-24)

**Analog:** self. The table has `name/code/timezone/country/maxCapacity/...` but no `address`.

**Add column** (after `country`, lines 19):

```typescript
country: varchar("country", { length: 2 }).default("AR").notNull(),
address: varchar("address", { length: 255 }),   // D-24: street address for email (D-13) + reuse
```

Nullable (existing rows backfilled by migration from `el-templo-web/data/sedes.ts` canonical addresses: 7 Mar del Plata + Barcelona "Eixample, Av. Diagonal 368").

---

### `src/db/schema/bookings.ts` — add `source` (D-02)

**Analog:** self + the `source` precedent in `user-status-history.ts:47` (`varchar(16) NOT NULL DEFAULT`).

**Add column** (after `isTrial`, line 40):

```typescript
isTrial: boolean("is_trial").notNull().default(false),
source: varchar("source", { length: 16 }),   // D-02: 'self_service' | 'admin' | NULL (legacy=admin)
```

Nullable so existing rows = historical admin bookings. Self-service `reserve-trial` writes `'self_service'`; admin `bookTrial` writes `'admin'` (or leaves NULL). Drives funnel attribution (D-18).

---

### `src/db/schema/campaigns.ts` (NEW) — 4 tables (Claude's Discretion, RESEARCH §Schema)

**Analog:** `src/db/schema/user-status-history.ts` — the canonical foundation-table pattern (mysqlTable, int autoincrement PK, FK `.references(() => users.id, { onDelete: "cascade" })`, `index(...)` array form, `varchar(16)` for soft-enum `source`/`status`, `relations()` export, module header comment documenting purpose + index rationale).

**Imports pattern** (mirror user-status-history.ts:1-11):

```typescript
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  index,
  uniqueIndex,
  json,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
```

**Table shape** (apply to all 4; RESEARCH §"Schema de Campañas Reutilizable" defines columns):

```typescript
export const campaignSends = mysqlTable(
  "campaign_sends",
  {
    id: int("id").primaryKey().autoincrement(),
    campaignId: int("campaign_id")
      .references(() => campaigns.id, { onDelete: "cascade" })
      .notNull(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(), // snapshot
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    resendMessageId: varchar("resend_message_id", { length: 64 }),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uniq_campaign_user").on(table.campaignId, table.userId), // audience idempotency
  ],
);
```

`campaign_events` = forward-only (`type` varchar 'open'|'click'|'bounce', `index(sendId, type)`), mirroring user-status-history's forward-only ethos. `campaign_unsubscribes` = `uniqueIndex` on `email` (D-15 suppression). Register all in `src/db/schema/index.ts` (alphabetical-ish append, like line 29-40 aura/member modules).

---

### Migrations (`src/db/migrations/01XX_*.sql`) — 3 files

**Analog:** `src/db/migrations/0128_create_user_status_history.sql` (verbatim conventions).

**Mandatory conventions (copy exactly):**

- Hand-written SQL, `CREATE TABLE` **without** `IF NOT EXISTS` (project pattern, 0125/0128 precedent).
- FK constraint name follows Drizzle auto-gen convention so a future `pnpm db:generate` converges: `campaign_sends_user_id_users_id_fk`.
- **NEVER a `;` inside any `--` comment line** (runner splits on `;` before stripping comments — breaks the whole migration). This is a hard project rule.
- Header comment block documenting purpose + idempotency rationale (see 0128:1-32).
- Generate via `pnpm db:generate`, **commit the `.sql`**, apply via `pnpm db:migrate` (custom `_migrations` runner). NEVER `drizzle-kit migrate`/`push`.

**ALTER pattern** (branches.address / bookings.source):

```sql
ALTER TABLE branches ADD COLUMN address VARCHAR(255) NULL;
```

Numbering: next free after `0131` (the current tip migration). Use 3 sequential files or fold related ALTERs; keep one concern per file as the existing set does.

---

### `src/modules/scheduling/trials-service.ts` + `reserve-trial` (D-01, D-02, D-26)

**Analog (atomic promote+book):** `src/modules/members/service.ts:convertFreemiumToTrial` (lines 817-892) — the EXACT blueprint. **Analog (one-per-lifetime guard + cancelled-row reactivation):** `trials-service.ts:bookTrial` lines 149-209.

**Promote-and-book transaction** (combine convertFreemiumToTrial:863-885 with the booking insert — all in ONE `db.transaction`):

```typescript
// from convertFreemiumToTrial — the 409 guards run BEFORE the tx:
if (user.status !== "freemium") throw new ConflictError("...");
if (branch.isVirtual)
  throw new ConflictError(
    "La sesión de prueba debe asignarse a una sede física",
  );

const statusBefore = user.status; // 'freemium'
await this.db.transaction(async (tx) => {
  await tx
    .update(schema.users)
    .set({
      status: "prueba" as const,
      leadStatus: "en_seguimiento" as const,
      createdBy: null, // D-02: self-service has no admin
      branchId: chosenPhysicalBranchId, // D-06
    })
    .where(eq(schema.users.id, userId));

  await tx.insert(schema.userStatusHistory).values({
    userId,
    fromStatus: statusBefore,
    toStatus: "prueba",
    source: "self_service", // D-02 (varchar(16), fits)
  });

  // booking — reuse bookTrial's reactivate-or-insert (trials-service.ts:189-208)
  await tx.insert(schema.bookings).values({
    memberId: userId,
    scheduleId,
    bookingDate,
    status: "reservado",
    isTrial: true,
    source: "self_service",
  });
});
```

**Critical ordering note (RESEARCH Pattern 1):** `bookTrial` today (lines 136, 143) hard-requires `status==='prueba'` AND `user.branchId===schedule.branchId` BEFORE booking. The planner must either (a) add a `promoteAndBook` mode that runs the promotion inside the same tx, or (b) keep the standalone `reserve-trial` flow that reuses ONLY the one-per-lifetime guard (149-169) and the cancelled-row reactivation (176-209). Do NOT call the existing `bookTrial` as-is from freemium.

**Eligibility endpoint** `GET /members/scheduling/trial-eligibility` — same predicate as campaign audience (D-08) minus email/unsubscribe: `status==='freemium'` + no active/paused/scheduled sub + no non-cancelled `is_trial` booking. Returns `{ eligible, alreadyBooked, booking? }` (`/me` does NOT expose `status`, so this is required).

---

### `src/modules/scheduling/booking-service.ts` — 30-day window for trials (D-05)

**Analog:** self, lines 65-75 (the hardcoded `today..+2d` window).

**Current** (lines 69-74):

```typescript
const today = todayInTz(tz);
const maxDate = addDays(today, 2);
if (date < today || date > maxDate) {
  throw new BadRequestError(
    "Solo podes reservar desde hoy hasta 2 dias en adelante",
  );
}
```

**Change:** branch the window by an `isTrial`/`windowDays` parameter → `addDays(today, isTrial ? 30 : 2)`. Keep the `isWithinBookingWindow` (77-79), `dayOfWeek` (81-87) and holiday (89-110) checks intact (Pitfall 2). The `reserve-trial` path must NOT hit the subscription check (lines 112-117) — that's why it's a separate endpoint, not `/reserve`.

---

### `src/modules/scheduling/routes.ts` — `reserve-trial` + `trial-eligibility`

**Analog:** the member-scoped plugin section starting line 654 (second `addHook("onRequest", authenticate)` block); `/reserve` POST (708-721), `/trials` admin POST (499-512), `/branches` GET (766-793).

**Member route shape** (copy /reserve 708-721 + handleServiceError):

```typescript
fastify.post<{ Body: { scheduleId: number; date: string; branchId: number } }>(
  "/reserve-trial",
  { schema: reserveTrialSchema },
  async (request, reply) => {
    try {
      const result = await trialService.reserveTrialSelfService(
        request.user.id,
        request.body,
      );
      return reply.code(201).send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "member reserve trial");
    }
  },
);
```

`/branches` (766-793) already filters active + non-virtual + user's country — reuse verbatim for D-06's physical-branch selector. Register both under the existing `/api/members/scheduling` member plugin (auth already applied by the section-level hook at 654).

---

### `src/modules/campaigns/service.ts` (NEW) — CampaignService facade

**Analog:** `src/modules/admin/edit-service.ts` (facade orchestrating domain sub-services) for the class shape + delegation; `trials-service.ts:92-96` for the `constructor(private db, private log)` convention.

**Facade shape** (mirror edit-service header + constructor):

```typescript
export class CampaignService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private email: EmailService, // reuse, do NOT new Resend() (Pitfall 3)
    private tokens: CampaignTokenService,
  ) {}
  // listEligible() — audience query (D-08/09/10)
  // send()         — create sends, render, resend.batch.send (≤100/req)
  // funnel()       — cross sends/events × bookings × attendance × user_status_history
}
```

Audience query (D-08): `status='freemium'` + NOT EXISTS active/paused/scheduled sub + NOT EXISTS non-cancelled `is_trial` booking + `email IS NOT NULL` + NOT EXISTS unsubscribe + `created_at < NOW() - INTERVAL 3 DAY` (D-10).

---

### `src/modules/campaigns/token-service.ts` (NEW) — HMAC token

**Analog:** `src/modules/shared/qr-token.ts` — copy the HMAC-SHA256 + base64url structure verbatim, extend payload (D-04/D-21).

**Pattern** (qr-token.ts:15-30 adapted):

```typescript
import { createHmac } from "crypto";
interface CampaignTokenPayload {
  userId: number;
  campaignId: number;
  sendId: number;
  exp: number;
}

function signCampaignToken(p: CampaignTokenPayload): string {
  const b64 = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", process.env.JWT_SECRET!)
    .update(b64)
    .digest("base64url");
  return `${b64}.${sig}`;
}
```

`validate` mirrors qr-token.ts:32-58 (split on `.`, recompute sig, compare, parse, check `exp > now`). **D-21: the token NEVER authorizes** — `reserve-trial` ignores it and revalidates state server-side. Token only identifies `sendId` for tracking + carries `exp` (30d, D-04).

---

### `src/modules/campaigns/tracking-service.ts` (NEW) — open/click/unsubscribe

**Analog:** service constructor from `trials-service.ts`; insert-event pattern from `userStatusHistory` inserts (members/service.ts:875-880).

`recordOpen(sendId)` → insert `campaign_events{type:'open'}`. `recordClick(sendId)` → insert `{type:'click'}`. `recordUnsubscribe(userId|email)` → insert `campaign_unsubscribes` (idempotent on unique email).

---

### `src/modules/campaigns/templates.ts` (NEW) — MJML render (D-23)

**Analog:** `src/modules/email/templates.ts` — same "function returns HTML string + exported subject const" shape, but using MJML (approved dep D-23) compiled to bulletproof table HTML. Inline interpolation of merge vars server-side (do NOT use Resend-hosted templates).

```typescript
export const TRIAL_CAMPAIGN_SUBJECT = "..."; // user-supplied copy
export function trialCampaignHtml(vars: {
  headline: string;
  body: string;
  trackingPixelUrl: string;
  ctaAppUrl: string;
  whatsappUrl: string;
  sedes: BranchAddress[];
  unsubscribeUrl: string;
}): string {
  /* MJML → HTML */
}
```

UI-SPEC §"Email Layout Contract" is the structural authority: pixel first, hero (self-hosted logo+image from `el-templo-web/public/email/`), headline (Georgia 28/700 `#3D3732`), dual CTA (Terracotta `#C07A56` primary + WhatsApp `#25D366`), sedes table (name + `branches.address`), footer with unsubscribe. Web-safe fonts only, all CSS inline, VML buttons for Outlook, NO CDN.

---

### `src/modules/campaigns/routes.ts` (NEW) — mixed public + admin

**Analog:** `src/modules/franchise/routes.ts:162-243` — the canonical "public route + per-route `preHandler: [fastify.authenticate]`" plugin (NO global `onRequest` auth hook).

**Pattern** (franchise:162-180 for public, 187-189 for admin):

```typescript
export const campaignRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new CampaignService(fastify.db, fastify.log, ...);

  // ---- Public (no auth): pixel / click / unsubscribe ----
  fastify.get<{ Querystring: { t: string } }>("/track/open", async (req, reply) => {
    const p = validateCampaignToken(req.query.t);
    if (p) await tracking.recordOpen(p.sendId);
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    return reply.header("Content-Type", "image/gif").header("Cache-Control", "no-store").send(gif);
  });
  // /track/click → 302 redirect (ALLOWLIST destinations, Pitfall 4 open-redirect)
  // /unsubscribe → insert + confirmation HTML page

  // ---- Admin (owner) ----
  fastify.post<{ Params: { id: number } }>("/admin/:id/send",
    { preHandler: [fastify.authenticate] }, async (req, reply) => { ... });
};
```

Register in `app.ts` (alongside lines 114-218): `await app.register(campaignRoutes, { prefix: "/api/campaigns" });` — public tracking lives under `/api/campaigns/track|unsubscribe`, admin under `/api/campaigns/admin`.

---

### `src/modules/email/service.ts` — batch method (Pitfall 3)

**Analog:** self (lines 22-46) — the graceful-degradation + `new Resend(apiKey)` pattern.

**Extend** with a batch method (reuse the `if (!apiKey) { log; return }` guard at 27-34):

```typescript
async sendCampaignBatch(messages: { to: string; subject: string; html: string }[],
  idempotencyKey: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { this.log.info("RESEND_API_KEY not configured, skipping campaign batch"); return; }
  const resend = new Resend(apiKey);
  await resend.batch.send(messages.map(m => ({ from: CAMPAIGN_FROM, ...m })), { idempotencyKey });
}
```

`CAMPAIGN_FROM` = subdomain `from` (e.g. `El Templo <hola@send.eltemplo.org>`, D-17). Resend batch ≤100/req. Do NOT instantiate `new Resend()` in the campaigns module — extend this service (CONTEXT anti-pattern).

---

### `src/pages/ReservasPage.vue` — 3rd state (D-20, D-22)

**Analog:** self. State 1 = existing empty/muro (lines 9-22). Branch selector = lines 26-44. Banner family = `bonus-banner` (50-61). Next-class card (state 3 confirmation) = `next-class-card` (63+).

**State branching:** add a `trialEligibility` ref (from `GET /members/scheduling/trial-eligibility`) and:

- `!hasPresencialPlan && !eligible && !alreadyBooked` → existing muro (UNCHANGED, lines 9-22).
- `eligible && !alreadyBooked` → trial mode: trial banner (reuse `bonus-banner` styling, lines 51-61), branch selector ALWAYS shown (reuse `q-select` lines 26-44; freemium is virtual → must pick physical branch first), 30d grid (reuse existing `day-strip`/`slot-card`, limit `changeWeek` to +30d), reserve dialog with trial copy, NO cancel affordance (D-03).
- `alreadyBooked` → confirmation card (reuse `next-class-card` family, lines 63+): "Tu sesión de prueba está reservada", no reserve/cancel.

Copy is fixed in UI-SPEC §Copywriting Contract. WhatsApp button reuses the existing `color="positive"` + `img:/icons/whatsapp.svg` pattern at lines 13-21.

---

### `src/composables/useSchedulingApi.ts` — eligibility + reserveTrial (D-22)

**Analog:** self, lines 49-63 (`getBranches`, `reserve`).

**Add** (mirror `reserve` 56-63 and `getBranches` 49-54):

```typescript
async function getTrialEligibility(): Promise<TrialEligibility> {
  const r = await api.get("/members/scheduling/trial-eligibility", {
    signal: getSignal(),
  });
  return r.data;
}
async function reserveTrial(
  scheduleId: number,
  date: string,
  branchId: number,
): Promise<BookingRecord> {
  const r = await api.post(
    "/members/scheduling/reserve-trial",
    { scheduleId, date, branchId },
    { signal: getSignal() },
  );
  return r.data;
}
```

Keep the `getSignal()`/`cleanup()` AbortController convention (lines 32-37, 87-90).

---

### `src/boot/deep-links.ts` (NEW) — appUrlOpen listener (D-25)

**Analog:** `src/boot/push-notifications.ts` (lines 1-45) — the `boot(async ({ router }) => {...})` wrapper, `Capacitor.isNativePlatform()` guard, `createLogger()`, and tap→`router.push` navigation pattern (`handleTapNavigation`).

```typescript
import { boot } from "quasar/wrappers";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createLogger } from "src/utils/logger";
const log = createLogger("DeepLinksBoot");

export default boot(async ({ router }) => {
  if (!Capacitor.isNativePlatform()) return;
  await App.addListener("appUrlOpen", ({ url }) => {
    // parse https://eltemplo.org/r/trial?t=... → router.push('/reservas?trial=1')
    // token ignored for auth (D-21); if logged out, store intended route + resume post-login
  });
});
```

Register in `el-templo-app/quasar.config.ts` boot array (currently `['sentry', 'axios', 'auth', 'modules', 'push-notifications']`) → add `'deep-links'`.

---

### `src-capacitor/android/app/src/main/AndroidManifest.xml` — App Links (D-25)

**Analog:** self (greenfield — only MAIN/LAUNCHER today, lines 19-22). Add a SECOND `<intent-filter android:autoVerify="true">` inside the same `<activity>` (which already has `launchMode="singleTask"` `exported="true"`):

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="eltemplo.org" android:pathPrefix="/r/trial" />
</intent-filter>
```

Note staging vs prod app IDs (`com.eltemplo.app` / `.staging`) → distinct SHA-256 in `assetlinks.json`.

---

### `src-capacitor/ios/App/App/App.entitlements` — Universal Links (D-25)

**Analog:** self (only `aps-environment` today). Add:

```xml
<key>com.apple.developer.associated-domains</key>
<array><string>applinks:eltemplo.org</string></array>
```

Requires `https://eltemplo.org/.well-known/apple-app-site-association` hosted by `el-templo-web`.

---

### `src/pages/CampaniasPage.vue` (NEW) + route (D-18, D-19)

**Analog:** `el-templo-admin/src/pages/ReportesPage.vue` — copy the page skeleton verbatim: header `text-h5` + `text-caption text-grey-7` (lines 6-13), country (owner-only) + branch filters (lines 18-45), `q-tabs` with `active-color="primary" indicator-color="primary"` (lines 50-66), `q-tab-panels` (line 68). Icons `campaign` / `trending_up`.

**Route** (`src/router/routes.ts`, mirror lines 84-90 `analiticas`/`reportes`):

```typescript
{ path: 'campanias', component: () => import('pages/CampaniasPage.vue') },
```

---

### `src/components/campaigns/CampaignFunnel.vue` (NEW)

**Analog:** `el-templo-admin/src/components/analytics/FunnelTab.vue` — copy: the props-driven `loading`/`data`/skeleton/empty pattern (lines 46-55), chart.js card (line 58+), and the **`q-banner bg-orange-2 text-orange-10`** caveat banner (lines 21-28) for the "Abierto aproximado — Apple Mail Privacy" note (D-18, UI-SPEC). Stages: enviado → abierto → click → reservó → asistió → convirtió. (Note: `FunnelTab.vue` currently gates behind a `comingSoon` flag at lines 8-17 — the campaign funnel does NOT need that gate; it shows live per-campaign data.)

---

### `src/composables/useCampaignsApi.ts` (NEW)

**Analog:** `el-templo-admin/src/composables/useAnalyticsApi.ts` — copy: `import { api } from 'src/boot/axios'` + `extractError`, the `buildParams(filters)` helper (lines 24-32), and `ref`-based loading/error state. Methods: `listCampaigns()`, `getCampaignFunnel(id)`, `sendCampaign(id)`, `getEligibleCount()`.

---

## Shared Patterns

### Resend client (centralize, do NOT duplicate)

**Source:** `src/modules/email/service.ts:27-43`
**Apply to:** campaign sending.

```typescript
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  this.log.info("RESEND_API_KEY not configured, skipping ...");
  return;
}
const resend = new Resend(apiKey);
```

CONTEXT marks `new Resend()` scattered in franchise/gladius/academy/app-landing as an anti-pattern to NOT replicate. Extend `EmailService`.

### Atomic status transition + history

**Source:** `src/modules/members/service.ts:863-885` (`convertFreemiumToTrial`)
**Apply to:** `reserve-trial` (freemium→prueba), any status flip.
UPDATE `users.status` + INSERT `userStatusHistory` inside one `db.transaction` → rolls back together. `source` is `varchar(16)` (fits `'self_service'`).

### HMAC stateless token

**Source:** `src/modules/shared/qr-token.ts` (full file)
**Apply to:** campaign tracking token (sign/validate with `JWT_SECRET`, base64url payload + `.` + sig). Token never authorizes (D-21).

### Public vs authed routes in one plugin

**Source:** `src/modules/franchise/routes.ts:162-189`
**Apply to:** campaign routes. NO global `onRequest` auth hook; public routes plain, protected routes get `preHandler: [fastify.authenticate]` + owner-role check (`OWNER_ROLES`, franchise:191-193).

### Error handling (API)

**Source:** `scheduling/routes.ts` `handleServiceError(err, reply, request.log, "...")` + `ConflictError`/`NotFoundError`/`BadRequestError` from `modules/shared/errors`.
**Apply to:** all new API routes/services. `catch (err: unknown)`, no `any`.

### Migration discipline

**Source:** `src/db/migrations/0128_create_user_status_history.sql`
**Apply to:** all 3 new migrations. Hand-written SQL, no `IF NOT EXISTS`, Drizzle-convention FK names, NO `;` in `--` comments, commit the `.sql`, `pnpm db:migrate` (custom runner), never `drizzle-kit migrate/push`.

### Admin page skeleton + filters + tabs

**Source:** `el-templo-admin/src/pages/ReportesPage.vue:6-68`
**Apply to:** `CampaniasPage.vue`. Header + country(owner)/branch filters + `q-tabs`/`q-tab-panels`, `active-color="primary"`.

### Frontend API composable

**Source:** `el-templo-admin/src/composables/useAnalyticsApi.ts:7-32` (admin); `el-templo-app/src/composables/useSchedulingApi.ts:31-90` (app, with `cleanup()`/AbortController).
**Apply to:** `useCampaignsApi.ts` (admin), additions to `useSchedulingApi.ts` (app). `createLogger()`/`extractError`, never `console.log`, no `any`.

### Boot file (Capacitor native-guarded)

**Source:** `el-templo-app/src/boot/push-notifications.ts:21-28`
**Apply to:** `deep-links.ts`. `boot(async ({ router }) => {...})`, `if (!Capacitor.isNativePlatform()) return`, `createLogger()`.

### Brand tokens (UI-SPEC override)

**Source:** UI-SPEC §Design System. **WARM palette, NO blue.** Marble Cream `#F2EDE5`, Terracotta `#C07A56` (email) / `#96593a` (app/admin AA), Deep Charcoal `#3D3732`, WhatsApp green `#25D366`. The orchestrator's "Navy/Bronze" reference is STALE — do not use.

---

## No Analog Found

| File                                                          | Role   | Data Flow | Reason                                                                                                                             |
| ------------------------------------------------------------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-web/public/.well-known/assetlinks.json`            | config | —         | No App Links config exists anywhere; greenfield (RESEARCH §Deep Linking). SHA-256 from APK signing key (distinct prod vs staging). |
| `el-templo-web/public/.well-known/apple-app-site-association` | config | —         | No Universal Links config exists; greenfield. JSON with `<TeamID>.com.eltemplo.app`.                                               |

> Both are greenfield infra files. Planner should use RESEARCH §"Deep Linking en Capacitor" as the authority. `branches.address` backfill values come from the canonical `el-templo-web/data/sedes.ts` (8 sedes, address strings already present).

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{scheduling,members,email,campaigns,franchise,admin,shared}`, `el-templo-api/src/db/{schema,migrations}`, `el-templo-app/src/{pages,composables,boot}`, `el-templo-app/src-capacitor/{android,ios}`, `el-templo-admin/src/{pages,components,composables,router}`, `el-templo-web/{public,data}`.
**Files scanned:** ~30 read/grepped.
**Pattern extraction date:** 2026-06-01
