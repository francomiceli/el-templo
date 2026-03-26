# Phase 84: Push Notifications Foundation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up push notification infrastructure using Capacitor push plugin + Firebase Cloud Messaging (FCM) with a backend NotificationService powered by firebase-admin. Includes: daily cron for batch segment recalculation and transition-driven notifications, real-time event notifications (program lifecycle, post-session soreness), a notification queue (pending_notifications table) with 15-min polling, admin-configurable templates with manual segment sends, member notification preferences (4 categories) on ProfilePage, FCM token management, delivery tracking (counters only), and deep link routing via payload route field. Firebase project created new with one project + two Android apps (staging/production).

</domain>

<decisions>
## Implementation Decisions

### Notification Types (v1)

- **D-01:** Four notification type families ship in v1: segment re-engagement, check-in reminders via push, program lifecycle, weekly summary.
- **D-02:** Segment re-engagement is **transition-driven** — notifications fire when a member's segment changes (e.g., Intermitente -> En Riesgo), not on a recurring schedule. The daily cron recalculates all segments and compares old vs new to detect transitions.
- **D-03:** Segment transitions that trigger notifications:
  - Any -> En Riesgo: "Te extranamos — volve a entrenar"
  - En Riesgo -> Ghost: "Tu cuerpo te espera"
  - En Riesgo/Ghost -> Intermitente/Espartano: "Bienvenido de vuelta" (positive reinforcement)
  - Any -> Espartano: "Semana increible — segui asi"
- **D-04:** Ghost monthly re-attempt: Ghost members get one reminder per month, max 3 total. After 3 unanswered, stop permanently. Tracks re-attempt count per member.
- **D-05:** Check-in reminders: morning energy at 08:00 daily, post-training soreness 2h after session completion. Both deep link to Tu Dia (MiTemplo page). Only send if member hasn't already answered today's check-in.
- **D-06:** Progressive check-in unlocking was removed — all check-in questions available to all members. Send reminders to everyone.
- **D-07:** Weekly summary: Saturday ~15:00 (social sharing timing — members can show peers on weekend). Content: sessions this week, current streak, AURA earned, segment-aware motivational closer.
- **D-08:** Program lifecycle notifications are real-time events: enrollment confirmation (immediate on admin enrollment), week unlock (when cron detects conditions met), renewal 7-day warning (from Phase 83 D-16 logic).

### Scheduling Architecture

- **D-09:** Daily cron job batch-recalculates ALL member segments (fixes the Phase 79 gap where inactive members' segments go stale since they don't log in). On-login recalculation from Phase 79 stays as-is for instant freshness when a member opens the app.
- **D-10:** All notifications flow through a `pending_notifications` queue table. Immediate notifications set scheduledAt=now. Delayed ones (soreness 2h) set scheduledAt=now+2h. A cron polls every 15 minutes for due notifications and sends them.
- **D-11:** Queue auto-purge: sent/failed rows deleted after 24 hours. Table stays tiny — only pending + recent items.
- **D-12:** No notification_logs table — delivery tracking uses counters only (sent_count, opened_count on notification templates table). No per-member delivery history.

### Admin Configuration

- **D-13:** Notification templates are admin-configurable — admin can edit template text, enable/disable notification types, and set timing. Changes take effect without deploys.
- **D-14:** New "Notificaciones" sidebar item in admin panel with:
  - **Automated templates section**: list of all notification templates with enable/disable toggles, edit buttons, per-template stats (sent count, opened count, open rate %).
  - **Send to segment section**: compose a one-off notification, select target segment(s), send. These are "Anuncios" category notifications.
- **D-15:** Permissions: Owner + Admin only can manage notification templates and send segment notifications.
- **D-16:** Single template per transition type — no message rotation or personalization with onboarding data for v1.
- **D-17:** Text-only notifications for v1 — title + body text, no images, no action buttons.

### Member Notification Preferences

- **D-18:** 4 notification categories with per-category toggles:
  - **Entrenamiento**: check-in reminders, weekly summary
  - **Programas**: enrollment confirmation, week unlock, renewal warning
  - **Motivacion**: segment re-engagement, celebrations
  - **Anuncios**: admin-initiated manual segment sends
- **D-19:** All categories ON by default for new members.
- **D-20:** Preferences stored backend-side in a `notification_preferences` table (userId, category, enabled). Backend checks preferences before sending. Survives device reinstalls.
- **D-21:** Preferences UI: new "Notificaciones" section on existing ProfilePage with 4 toggles. Also move "Cambiar contrasena" into the same area to create a settings grouping.
- **D-22:** Admin-sent segment notifications ("Anuncios") respect member preferences — if member disabled Anuncios, they don't receive admin blasts.
- **D-23:** OS permission prompt fires after onboarding completion (Phase 78). Brief value prop shown before the OS dialog.
- **D-24:** If member denies OS permission: persistent banner on MiTemplo page above "registro del dia" saying "Activa las notificaciones para no perderte tu resumen semanal" with button to open OS settings. Banner stays until permission is granted — not dismissable.
- **D-25:** Multi-device support: store all FCM tokens per member in a `device_tokens` table. Send to all registered devices.

### FCM Token Lifecycle

- **D-26:** App sends FCM token to backend on every app launch. Backend upserts — if token changed, it updates; if same, no-op. Handles token refreshes automatically.
- **D-27:** Auto-cleanup on FCM error: when FCM returns "token not registered" error, automatically delete that token from device_tokens table.

### Deep Link Routing

- **D-28:** Each notification carries a `route` field in its FCM data payload. App reads it and navigates to that route. Default: Tu Dia (MiTemplo). Admin can set destination per template.
- **D-29:** Foreground notifications suppressed — if the app is in foreground when a notification arrives, don't show anything.
- **D-30:** Cold start (app killed): normal auth flow first (JWT check, session verify), then navigate to the notification's target route. If not logged in, show login (notification intent lost).

### Delivery Tracking

- **D-31:** Track sent + opened. "Sent" increments counter on template when cron processes queue. "Opened" increments counter when app reports back via dedicated POST endpoint.
- **D-32:** Dedicated `POST /notifications/:id/opened` endpoint called by app when Capacitor pushNotificationActionPerformed listener fires.
- **D-33:** Admin sees per-template stats: total sent, total opened, open rate %. Displayed on the Notificaciones admin page.

### Firebase Project Setup

- **D-34:** Create new Firebase project. One project with two Android apps: com.eltemplo.app (production) and com.eltemplo.app.staging (staging).
- **D-35:** google-services.json stored as base64 in GitHub Secrets. CI workflow decodes during Android build step (same pattern as keystore from Phase 75). File is gitignored locally.
- **D-36:** Firebase service account key (for firebase-admin on backend) stored as base64 in GitHub Secrets. Decoded at deploy time.
- **D-37:** FCM is the mandatory transport — required by Android. Single firebase-admin sender for both Android and iOS (FCM proxies to APNs for iOS).

### Error Handling

- **D-38:** Single retry with backoff on FCM send failure. If still fails, mark as 'failed' in pending_notifications, log via Pino. Sentry catches repeated failures. Don't block other notifications in the queue.

### Testing

- **D-39:** DRY_RUN env var on NotificationService. When true, notifications are logged but not sent to FCM. Used in development and CI.
- **D-40:** Integration tests mock the FCM client — inject a mock that records calls without sending. Assert notifications are queued/sent correctly.
- **D-41:** Real device testing on staging with actual FCM sends to developer's personal device.

### Claude's Discretion

- NotificationService architecture (constructor DI pattern, module structure)
- Notification queue processing logic (batch vs one-by-one, concurrency)
- Database schema design for pending_notifications, notification_templates, notification_preferences, device_tokens tables
- Cron job organization (extend existing jobs pattern or new dedicated notification cron)
- Admin Notificaciones page layout and component design
- ProfilePage notification preferences section layout
- MiTemplo permission banner component design
- FCM data payload structure and route encoding
- Capacitor push plugin initialization and listener setup
- Firebase admin SDK initialization approach

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS-v4.4.md` — ENG-22 (push infra), ENG-23 (segment-driven notifications), ENG-24 (user preferences)

### Prior Phase Context

- `.planning/phases/79-behavioral-segmentation/79-CONTEXT.md` — 6 segments (D-01/D-02), on-login recalculation (D-05), segment column on member_profiles (D-11/D-12), configurable thresholds (D-13)
- `.planning/phases/82-progressive-profiling-check-ins/82-CONTEXT.md` — Check-in questions (D-01), check_in_responses table (D-13), Tu Dia impact messaging (D-10-D-12). Note: progressive unlocking was removed post-context.
- `.planning/phases/83-micro-program-upsells/83-CONTEXT.md` — Program enrollment (D-25-D-30), renewal 7-day warning (D-16/D-30), AURA bonuses (D-31-D-33)
- `.planning/phases/78-onboarding-user-profiling/78-CONTEXT.md` — Onboarding completion flow (integration point for permission prompt)

### Existing Code (integration points)

- `el-templo-api/src/db/schema/member-profiles.ts` — memberSegmentEnum, segment column, segmentUpdatedAt
- `el-templo-api/src/modules/auth/routes.ts` — /auth/me endpoint (existing on-login segment recalculation)
- `el-templo-api/src/jobs/auto-approve.ts` — Existing cron job pattern (node-cron + pino logger)
- `el-templo-api/src/jobs/mark-no-shows.ts` — Second cron job pattern reference
- `el-templo-api/src/index.ts` — Cron job registration at startup (lines 32-34)
- `el-templo-app/src/modules/progression/pages/MiTemplo.vue` — MiTemplo page (permission banner placement, deep link target)
- `el-templo-app/src/pages/ProfilePage.vue` — Profile page (notification preferences section + move Cambiar contrasena)
- `el-templo-app/src-capacitor/android/app/build.gradle` — Conditional google-services.json support already in place (lines 76-81)
- `el-templo-app/src-capacitor/android/build.gradle` — google-services classpath already declared (line 11)
- `.github/workflows/build-android-production.yml` — CI workflow for Android builds (add google-services.json decode step)
- `.github/workflows/deploy.yml` — Deploy workflow (add firebase service account key decode)

### Existing Patterns

- `el-templo-api/src/modules/aura/service.ts` — Service class pattern with constructor DI
- `el-templo-api/src/modules/streaks/service.ts` — Streak service (reference for engagement service patterns)
- `el-templo-api/src/db/schema/system-settings.ts` — system_settings table (reference for notification config if needed)
- `el-templo-admin/src/pages/AlumnosPage.vue` — Admin list page pattern with q-table
- Phase 66 role permissions — `el-templo-api/src/shared/permissions.ts`

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Cron job infrastructure**: node-cron already a dependency, two existing cron jobs in `src/jobs/` with established patterns (pino logger, db injection, error handling). Notification cron follows same pattern.
- **Android Firebase readiness**: build.gradle already has conditional google-services.json detection and plugin application. Just needs the file.
- **Segment data**: member_profiles table already has segment enum column and segmentUpdatedAt. Cron can read/update directly.
- **Session completion events**: existing session completion flow in sessions/routes.ts (lines 362-478) — integration point for triggering post-session soreness notification.
- **AURA service pattern**: constructor DI, graceful degradation on failure — same pattern for NotificationService.
- **Admin role permissions**: centralized registry in shared/permissions.ts. Add NOTIFICATION_MANAGE to ADMIN_ROLES.

### Established Patterns

- **Constructor DI** for all services (Phase 56 convention)
- **node-cron** for scheduled jobs with pino logging
- **GitHub Secrets** for all sensitive config (base64 encode/decode pattern from Phase 75)
- **Capacitor plugins** with `@capacitor/*` packages + src-capacitor Android project
- **Pinia composition stores** for frontend state
- **q-table** with server-side filtering for admin lists

### Integration Points

- `/auth/me` handler — existing segment recalculation point (stays, cron adds batch recalculation)
- Session completion handler — triggers post-session soreness notification (write to pending_notifications with 2h delay)
- Program enrollment handler (Phase 83) — triggers enrollment confirmation notification
- Program week advance logic (Phase 83) — triggers week unlock notification
- Admin sidebar — new "Notificaciones" nav item
- ProfilePage — new notification preferences section
- MiTemplo page — permission denial banner placement

</code_context>

<specifics>
## Specific Ideas

- Weekly summary timed for Saturday 15:00 specifically for social sharing — members show peers their stats over the weekend
- Segment transition notifications feel more meaningful than recurring nudges — "you just became at-risk" vs "you're still at-risk (day 15)"
- Ghost monthly re-attempt (max 3) gives inactive members multiple chances without being spammy
- Permission denial banner is persistent on MiTemplo (not dismissable) — ensures members eventually enable notifications
- Firebase project walkthrough will be provided as a manual step during/after execution — user does console setup with Claude's guidance
- All notification text in Spanish (app language)

</specifics>

<deferred>
## Deferred Ideas

- **Rich notifications** (images, action buttons) — text-only for v1, revisit when engagement data shows what templates need visual enhancement
- **Actionable notification replies** — answer check-in questions directly from the notification without opening app. Requires Capacitor notification actions plugin.
- **Per-member delivery history** — currently counters only. Add detailed notification_logs table when per-member debugging is needed.
- **Notification content personalization** — use onboarding data (goal, focus) to personalize message templates. E.g., strength-focused member gets different re-engagement copy.
- **Message template rotation** — pool of 2-3 templates per transition type for variety. Currently single template per type.
- **Full analytics dashboard** — charts showing open rates over time, per-segment engagement, best performing templates.
- **iOS push setup** — APNs configuration, iOS provisioning profile with push entitlement. Deferred until iOS App Store launch.
- **Notification scheduling admin UI** — let admin configure exact cron times for each notification type instead of hardcoded.
- **Ad-hoc send to individual member** — currently only segment sends. Individual targeting for future.

</deferred>

---

_Phase: 84-push-notifications_
_Context gathered: 2026-03-26_
