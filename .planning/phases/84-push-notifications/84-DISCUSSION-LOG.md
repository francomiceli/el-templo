# Phase 84: Push Notifications Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 84-push-notifications
**Areas discussed:** Notification scenarios, Push check-in interaction, Notification preferences UX, Delivery tracking depth, FCM token lifecycle, Notification scheduling architecture, Deep link routing, Firebase project setup, Error handling & retries, Testing strategy

---

## Notification Scenarios

### Notification types for v1

| Option                | Description                                                 | Selected |
| --------------------- | ----------------------------------------------------------- | -------- |
| Segment re-engagement | En Riesgo/Ghost/Intermitente nudges + Espartano celebration |          |
| Check-in via push     | Morning energy reminder, post-training soreness reminder    |          |
| Program lifecycle     | Enrollment confirmation, week unlock, renewal reminder      |          |
| Weekly summary        | End-of-week recap: sessions, streak, AURA                   |          |

**User's choice:** All four types selected
**Notes:** Full notification suite for v1.

### Scheduling approach

| Option                         | Description                                                    | Selected |
| ------------------------------ | -------------------------------------------------------------- | -------- |
| Daily cron job                 | Cron scans segments each morning, sends relevant notifications |          |
| Event-driven on segment change | Notification fires when segment transitions                    |          |
| Hybrid                         | Segment changes trigger immediate + daily cron for recurring   |          |

**User's choice:** Event-driven via cron — daily cron recalculates ALL segments, detects transitions, fires notifications on transition only
**Notes:** User identified that on-login-only segment recalculation (Phase 79 D-05) is flawed for inactive members. Cron solves this by batch-recalculating everyone.

### Ghost re-attempt frequency

| Option                           | Description                                           | Selected |
| -------------------------------- | ----------------------------------------------------- | -------- |
| One transition notification only | Ghost gets one notification on transition, no repeats |          |
| Monthly re-attempt for Ghost     | One reminder per month, max 3 total                   | ✓        |
| Never re-attempt Ghost           | Ghost = churned, only admin/coach outreach            |          |

**User's choice:** Monthly re-attempt for Ghost, max 3 total

### Weekly summary timing

| Option                 | Description                                  | Selected |
| ---------------------- | -------------------------------------------- | -------- |
| Sunday evening recap   | Send Sunday ~20:00 with week's stats         |          |
| Monday morning preview | Send Monday ~08:00 with last week + upcoming |          |
| Both                   | Sunday recap + Monday preview                |          |

**User's choice:** Saturday afternoon ~15:00
**Notes:** User insight: "send them on saturday afternoon so users can share this with their peers when hanging out in the weekend" — social sharing timing.

### Program lifecycle scheduling

| Option                | Description                                                     | Selected |
| --------------------- | --------------------------------------------------------------- | -------- |
| Real-time events      | Enrollment immediate, week unlock on detection, renewal warning | ✓        |
| Batched in daily cron | All program notifications in daily cron                         |          |
| Hybrid                | Enrollment real-time, others via cron                           |          |

**User's choice:** Real-time events

### Template variability

| Option                            | Description                                 | Selected |
| --------------------------------- | ------------------------------------------- | -------- |
| Single template per transition    | One message per transition type             | ✓        |
| Pool of 2-3 per transition        | Rotate templates for variety                |          |
| Personalized with onboarding data | Use member's goal/focus for personalization |          |

**User's choice:** Single template per transition

### Admin configurability

| Option                       | Description                                     | Selected |
| ---------------------------- | ----------------------------------------------- | -------- |
| Hardcoded for v1             | Templates as code-level constants               |          |
| Admin-configurable templates | Admin edits text, toggles types, adjusts timing | ✓        |
| system_settings-based        | Key-value store, no admin UI                    |          |

**User's choice:** Admin-configurable templates

### Admin permissions for notifications

| Option                | Description                        | Selected |
| --------------------- | ---------------------------------- | -------- |
| Owner + Admin only    | Consistent with Phase 66 hierarchy | ✓        |
| Owner only            | Tighter control                    |          |
| Owner + Admin + Coach | Coaches can edit templates         |          |

**User's choice:** Owner + Admin only

### Admin UI placement

| Option                            | Description                              | Selected |
| --------------------------------- | ---------------------------------------- | -------- |
| New "Notificaciones" sidebar item | Dedicated page in admin sidebar          | ✓        |
| Tab on existing Settings page     | Groups with segmentation config          |          |
| Sub-section in Analytics          | Under analytics since engagement-related |          |

**User's choice:** New "Notificaciones" sidebar item

### Ad-hoc sending

| Option                             | Description                           | Selected |
| ---------------------------------- | ------------------------------------- | -------- |
| Automated templates only           | No manual send button                 |          |
| Templates + manual send to segment | Compose and send one-off to segment   | ✓        |
| Templates + manual send to anyone  | Full flexibility including individual |          |

**User's choice:** Templates + manual send to segment

### Rich content

| Option                        | Description                           | Selected |
| ----------------------------- | ------------------------------------- | -------- |
| Text-only for v1              | Title + body text only                | ✓        |
| Title + body + optional image | Allow image URL attachment            |          |
| Rich notifications            | Title + body + image + action buttons |          |

**User's choice:** Text-only for v1

---

## Push Check-in Interaction

### Tap behavior

| Option                               | Description                                  | Selected |
| ------------------------------------ | -------------------------------------------- | -------- |
| Deep link to Tu Dia                  | Opens app, navigates to MiTemplo page        | ✓        |
| Actionable notification with buttons | Answer from notification without opening app |          |
| Just a reminder                      | Opens app to default home screen             |          |

**User's choice:** Deep link to Tu Dia (MiTemplo page)
**Notes:** User corrected: "remember main page of app is now mi-templo"

### Check-in timing

| Option                                  | Description                               | Selected |
| --------------------------------------- | ----------------------------------------- | -------- |
| Energy 08:00, soreness 2h after session | Real-time trigger from session completion | ✓        |
| Energy 08:00, soreness next morning     | Both in morning                           |          |
| All in morning cron                     | Batch everything                          |          |

**User's choice:** Energy 08:00, soreness 2h after session
**Notes:** User asked about server load for 1000 users — confirmed negligible (FCM sends are lightweight HTTP calls, cron finishes in seconds).

### Skip if already answered

| Option                        | Description                             | Selected |
| ----------------------------- | --------------------------------------- | -------- |
| Yes, skip if already answered | Check check_in_responses before sending | ✓        |
| Always send                   | Send regardless                         |          |

**User's choice:** Yes, skip if already answered

### Target audience for check-in reminders

**User's choice:** All members — progressive unlocking was removed, all check-in questions available to everyone.

### Soreness deep link target

| Option                     | Description                        | Selected |
| -------------------------- | ---------------------------------- | -------- |
| Deep link to Tu Dia page   | Same as morning energy, consistent | ✓        |
| Deep link with query param | Auto-scroll to soreness card       |          |

**User's choice:** Deep link to Tu Dia page (consistent behavior)

---

## Notification Preferences UX

### Granularity

| Option                        | Description                             | Selected |
| ----------------------------- | --------------------------------------- | -------- |
| Per-category toggles          | 3-4 categories with on/off toggles      | ✓        |
| Global on/off only            | One master toggle                       |          |
| Per-notification-type toggles | Individual toggle per notification type |          |

**User's choice:** Per-category toggles

### Default state

| Option                       | Description   | Selected |
| ---------------------------- | ------------- | -------- |
| All categories ON by default | Opt-out model | ✓        |
| All OFF, member opts in      | Opt-in model  |          |
| Essential ON, marketing OFF  | Balanced      |          |

**User's choice:** All categories ON by default

### UI placement

**User's choice:** New "Notificaciones" section on existing ProfilePage (not a separate page). Also move "Cambiar contrasena" into the same settings area.

### OS permission timing

| Option                  | Description                         | Selected |
| ----------------------- | ----------------------------------- | -------- |
| After onboarding        | Post-quiz with brief value prop     | ✓        |
| On first login          | Earlier, before onboarding          |          |
| Lazy on settings toggle | Only when member enables a category |          |

**User's choice:** After onboarding completion
**Notes:** User initially asked "aren't notifications allowed by default?" — explained Android 13+ and iOS require runtime permission.

### Permission denial handling

| Option                 | Description                      | Selected |
| ---------------------- | -------------------------------- | -------- |
| Show settings helper   | Banner guiding to OS settings    | ✓        |
| Silently disable       | Grey out toggles, no explanation |          |
| Re-prompt periodically | Periodic in-app prompt           |          |

**User's choice:** Settings helper banner on MiTemplo page (not ProfilePage), above "registro del dia". Persistent — not dismissable until permission granted.

### Preferences storage

| Option       | Description                    | Selected |
| ------------ | ------------------------------ | -------- |
| Backend      | notification_preferences table | ✓        |
| Device-local | Capacitor Preferences          |          |
| Both synced  | Backend + local cache          |          |

**User's choice:** Backend

### Category mapping

| Option                                              | Description               | Selected |
| --------------------------------------------------- | ------------------------- | -------- |
| 3 categories (Entrenamiento, Programas, Motivacion) | Original proposal         |          |
| Different grouping                                  | User provides alternative |          |

**User's choice:** 4 categories — added "Anuncios" for admin-initiated manual segment sends (separate from automated Motivacion).

### Admin bypass of preferences

| Option                            | Description                       | Selected |
| --------------------------------- | --------------------------------- | -------- |
| Respect preferences               | Even admin sends check opt-out    |          |
| Bypass for admin sends            | Admin sends always reach everyone |          |
| Separate "Announcements" category | 4th category for admin blasts     | ✓        |

**User's choice:** Separate Anuncios category — members can opt out of admin blasts independently.

### Multi-device

| Option                  | Description        | Selected |
| ----------------------- | ------------------ | -------- |
| All registered devices  | Send to all tokens | ✓        |
| Most recent device only | Only latest token  |          |

**User's choice:** All registered devices

---

## Delivery Tracking Depth

### Tracking depth

| Option        | Description                    | Selected |
| ------------- | ------------------------------ | -------- |
| Sent + opened | Server-side log + app callback | ✓        |
| Sent only     | Just log sends                 |          |
| Full pipeline | Sent + received + opened       |          |

**User's choice:** Sent + opened

### Admin stats visibility

| Option                    | Description                   | Selected |
| ------------------------- | ----------------------------- | -------- |
| Basic stats on admin page | Per-template sent/opened/rate | ✓        |
| Log only, no admin UI     | Data in table, no display     |          |
| Full analytics dashboard  | Charts over time              |          |

**User's choice:** Basic stats on admin page

### Open tracking endpoint

| Option                    | Description                         | Selected |
| ------------------------- | ----------------------------------- | -------- |
| Dedicated POST endpoint   | POST /notifications/:id/opened      | ✓        |
| Piggyback on navigation   | Log on page load with context param |          |
| Firebase Analytics events | Use Firebase console                |          |

**User's choice:** Dedicated POST endpoint

---

## FCM Token Lifecycle

### Token registration timing

| Option                      | Description                    | Selected |
| --------------------------- | ------------------------------ | -------- |
| On every app launch         | Register + upsert on each open | ✓        |
| After permission grant only | Only after explicit grant      |          |

**User's choice:** On every app launch
**Notes:** Explained what FCM tokens are — user asked "what is a fcm token?"

### Invalid token handling

| Option                          | Description                              | Selected |
| ------------------------------- | ---------------------------------------- | -------- |
| Auto-cleanup on error           | Delete when FCM returns "not registered" | ✓        |
| Mark inactive, cleanup via cron | Conservative approach                    |          |
| Never cleanup                   | Skip failed, table grows                 |          |

**User's choice:** Auto-cleanup on error

---

## Notification Scheduling Architecture

### Delayed notification approach (2h soreness)

| Option                           | Description                                         | Selected |
| -------------------------------- | --------------------------------------------------- | -------- |
| DB scheduled rows + polling cron | pending_notifications table, cron polls every 15min | ✓        |
| setTimeout                       | In-memory timer, lost on restart                    |          |
| FCM scheduled messages           | Offload to Google                                   |          |

**User's choice:** DB scheduled rows
**Notes:** User asked detailed questions about setTimeout impact on event loop (negligible for 1000 users) and reliability tradeoffs. Chose DB for resilience.

### Queue scope

| Option                              | Description                                   | Selected |
| ----------------------------------- | --------------------------------------------- | -------- |
| All notifications through queue     | Unified pipeline, auto-purge after send       | ✓        |
| Queue for delayed only              | Immediate sends go direct                     |          |
| Queue for all + process immediately | Write + send immediately, cron catches misses |          |

**User's choice:** All through queue with auto-purge
**Notes:** User raised bloat concern. Resolved with auto-purge after 24h and counters-only tracking (no notification_logs table).

### Notification logs growth

| Option                        | Description                    | Selected |
| ----------------------------- | ------------------------------ | -------- |
| Keep forever                  | 430K rows/year, fine for MySQL |          |
| 90-day rolling retention      | Purge + aggregate monthly      |          |
| Counters only, no detail logs | Increment on templates table   | ✓        |

**User's choice:** Counters only — no notification_logs table. sent_count/opened_count on templates.

### Queue purge timing

| Option                        | Description                           | Selected |
| ----------------------------- | ------------------------------------- | -------- |
| Delete after 24 hours         | Purge sent/failed rows older than 24h | ✓        |
| Delete immediately after send | Remove right after FCM send           |          |
| Keep 7 days                   | Weekly purge                          |          |

**User's choice:** Delete after 24 hours

### Cron polling interval

**User's choice:** Every 15 minutes (corrected from initial "every 5 minutes" selection)

---

## Deep Link Routing

### Foreground behavior

| Option              | Description                            | Selected |
| ------------------- | -------------------------------------- | -------- |
| In-app toast/banner | Show subtle banner, tap navigates      |          |
| Suppress entirely   | Don't show anything when in foreground | ✓        |
| System notification | Let OS show even in foreground         |          |

**User's choice:** Suppress entirely

### Deep link targets

| Option                                | Description                            | Selected |
| ------------------------------------- | -------------------------------------- | -------- |
| All to Tu Dia for v1                  | Single destination                     |          |
| Type-specific destinations            | Different page per notification type   |          |
| Include route in notification payload | route field in FCM data, app navigates | ✓        |

**User's choice:** Include route in payload — most flexible, admin can set destination per template.

### Cold start handling

| Option                      | Description                                   | Selected |
| --------------------------- | --------------------------------------------- | -------- |
| Auth first, then navigate   | Normal startup, then redirect to target route | ✓        |
| Auth first, preserve intent | Store intent, navigate after login            |          |
| Navigate immediately        | Skip auth, rely on route guards               |          |

**User's choice:** Auth first, then navigate (notification intent lost if not logged in)

---

## Firebase Project Setup

### Existing project

| Option           | Description                  | Selected |
| ---------------- | ---------------------------- | -------- |
| Create new       | No existing Firebase project | ✓        |
| Existing project | Add FCM to existing          |          |

**User's choice:** Create new

### Environment separation

| Option                        | Description                        | Selected |
| ----------------------------- | ---------------------------------- | -------- |
| One project, two Android apps | com.eltemplo.app + staging variant | ✓        |
| Two separate projects         | Complete isolation                 |          |
| Production only               | No staging push                    |          |

**User's choice:** One project, two Android apps

### Service account key storage

**User's choice:** GitHub Secrets (base64 encoded, decoded at deploy time) — same pattern as all other secrets in the project.
**Notes:** User corrected the "env var" suggestion — "we are saving everything in github secrets"

### google-services.json management

| Option                     | Description                            | Selected |
| -------------------------- | -------------------------------------- | -------- |
| GitHub Secrets + CI decode | Base64 in secrets, decode during build | ✓        |
| Committed to repo          | Check in directly                      |          |
| Per-flavor files           | Separate files per build variant       |          |

**User's choice:** GitHub Secrets + CI decode

### Backend firebase-admin initialization

| Option                    | Description                                 | Selected |
| ------------------------- | ------------------------------------------- | -------- |
| NotificationService class | Constructor DI pattern, like other services | ✓        |
| Fastify plugin            | Register on Fastify app                     |          |
| Module-level singleton    | Import where needed                         |          |

**User's choice:** NotificationService class (constructor DI pattern)
**Notes:** User initially said "i really dont know whats best" — re-asked with clearer framing, chose NotificationService.

---

## Error Handling & Retries

### Retry behavior

| Option               | Description                                 | Selected |
| -------------------- | ------------------------------------------- | -------- |
| Retry once, then log | Single retry with backoff, then mark failed | ✓        |
| No retry, log only   | Fail = fail, log and move on                |          |
| You decide           | Claude's discretion                         |          |

**User's choice:** Retry once, then log

---

## Testing Strategy

### Development/staging testing

| Option                             | Description                              | Selected |
| ---------------------------------- | ---------------------------------------- | -------- |
| Dry-run flag + real device testing | DRY_RUN env var + staging device testing | ✓        |
| Test device registry               | Admin registers test devices             |          |
| FCM emulator                       | Firebase local emulator suite            |          |

**User's choice:** Dry-run flag + real device testing

### API integration tests

| Option                       | Description                    | Selected |
| ---------------------------- | ------------------------------ | -------- |
| Mock FCM client              | Inject mock that records calls | ✓        |
| Skip notification assertions | Test business logic only       |          |
| You decide                   | Claude's discretion            |          |

**User's choice:** Mock FCM client

---

## Claude's Discretion

- NotificationService architecture (constructor DI pattern, module structure)
- Notification queue processing logic
- Database schema design for all notification tables
- Cron job organization
- Admin and member app UI component design
- FCM data payload structure
- Capacitor push plugin initialization

## Deferred Ideas

- Rich notifications (images, action buttons)
- Actionable notification replies (answer check-in from notification)
- Per-member delivery history logs
- Notification content personalization with onboarding data
- Message template rotation for variety
- Full analytics dashboard with charts
- iOS push setup (APNs)
- Admin-configurable cron times
- Ad-hoc send to individual member

## Additional Notes

- User requested: after planning and execution, Claude provides a walkthrough for Firebase project creation in the Firebase console (manual step).
- User noted: server load for 1000 active users is negligible for push notification infrastructure.
- User corrected: cron polling interval is 15 minutes (not 5).
