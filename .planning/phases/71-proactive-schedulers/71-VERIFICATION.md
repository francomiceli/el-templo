---
phase: 71-proactive-schedulers
verified: 2026-03-18T22:41:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 71: Proactive Schedulers Verification Report

**Phase Goal:** Bot proactively sends reminders and follow-ups to members at scheduled times
**Verified:** 2026-03-18T22:41:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                | Status     | Evidence                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Member with a booked class receives a WhatsApp template reminder N hours before class time           | ✓ VERIFIED | `class-reminder.ts` queries `bookings` within `CLASS_REMINDER_HOURS` window; calls `sendTemplateMessage(phone, 'class_reminder', 'es_AR', ...)`                                                                                                  |
| 2   | Trial attendee receives a follow-up message 24-48h after their trial asking how it went              | ✓ VERIFIED | `trial-followup.ts` queries attendance `BETWEEN DATE_SUB(NOW(), 48H) AND DATE_SUB(NOW(), 24H)`; calls `sendTemplateMessage(phone, 'trial_followup', 'es_AR', ...)`                                                                               |
| 3   | Schedulers use Redis distributed locks so duplicate messages are never sent even if process restarts | ✓ VERIFIED | `distributed-lock.ts` uses `redis.set(key, 'locked', 'EX', ttl, 'NX')`. Both schedulers acquire `wa:lock:class-reminder` / `wa:lock:trial-followup` before processing. Per-booking/per-user Redis keys with TTL prevent re-send across restarts. |

**Score:** 3/3 success criteria verified

### Required Artifacts

| Artifact                                           | Expected                                 | Status     | Details                                                                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-bot/src/schedulers/distributed-lock.ts` | Redis distributed lock acquire/release   | ✓ VERIFIED | Exports `acquireLock` (SET NX + TTL) and `releaseLock` (DEL). Handles Redis unavailability gracefully. 68 lines, fully substantive.                                                                           |
| `el-templo-bot/src/whatsapp/client.ts`             | `sendTemplateMessage` function           | ✓ VERIFIED | Exports `sendTemplateMessage(phone, templateName, languageCode, components?)`. Full Meta Graph API POST with auth, error handling, and wamid return.                                                          |
| `el-templo-bot/src/whatsapp/types.ts`              | `TemplateComponent` interface            | ✓ VERIFIED | `TemplateComponent` interface with `type: 'body' \| 'header' \| 'button'` and `parameters` array at line 106.                                                                                                 |
| `el-templo-bot/src/schedulers/class-reminder.ts`   | Class reminder scheduler                 | ✓ VERIFIED | Exports `startClassReminderScheduler` (cron `*/30 * * * *`) and `runClassReminder`. Full SQL query, Redis dedup, sendTemplateMessage call, try/finally lock release.                                          |
| `el-templo-bot/src/schedulers/trial-followup.ts`   | Trial follow-up scheduler                | ✓ VERIFIED | Exports `startTrialFollowupScheduler` (cron `0 * * * *`), `runTrialFollowup`, and `isBusinessHours`. Business hours guard (10-20 Argentina), NOT EXISTS subquery for converted members, Redis dedup (7d TTL). |
| `el-templo-bot/src/index.ts`                       | Bot entry point wiring both schedulers   | ✓ VERIFIED | Imports both schedulers and calls `startClassReminderScheduler(db)` + `startTrialFollowupScheduler(db)` after server listen at lines 47-49.                                                                   |
| `el-templo-bot/test/class-reminder.test.ts`        | Unit tests for class reminder (6 cases)  | ✓ VERIFIED | 6 tests pass: lock not acquired, no bookings, send + Redis key set, already reminded skip, error continues, lock released on query failure.                                                                   |
| `el-templo-bot/test/trial-followup.test.ts`        | Unit tests for trial follow-up (8 cases) | ✓ VERIFIED | 8 tests pass: lock not acquired, business hours guard, no attendees, send + 7d Redis key, already followed up skip, converted filter (empty mock), error continues, lock released on query failure.           |

All artifacts: exists ✓, substantive ✓, wired ✓

### Key Link Verification

| From                | To                                        | Via                       | Status  | Details                                                                                                                    |
| ------------------- | ----------------------------------------- | ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `class-reminder.ts` | `distributed-lock.ts`                     | `acquireLock/releaseLock` | ✓ WIRED | Import at line 22; `acquireLock('wa:lock:class-reminder', 120)` called at line 65; `releaseLock` in `finally` at line 165. |
| `class-reminder.ts` | `client.ts`                               | `sendTemplateMessage`     | ✓ WIRED | Import at line 23; called with `class_reminder` template at line 135.                                                      |
| `class-reminder.ts` | bookings + schedules + users tables       | Drizzle SQL query         | ✓ WIRED | Lines 81-104: raw SQL JOINs `bookings b`, `schedules s`, `users u`, `activities a`, `whatsapp_conversations wc`.           |
| `trial-followup.ts` | `distributed-lock.ts`                     | `acquireLock/releaseLock` | ✓ WIRED | Import at line 24; `acquireLock('wa:lock:trial-followup', 120)` at line 78; `releaseLock` in `finally` at line 175.        |
| `trial-followup.ts` | `client.ts`                               | `sendTemplateMessage`     | ✓ WIRED | Import at line 25; called with `trial_followup` template at line 149.                                                      |
| `index.ts`          | `class-reminder.ts` + `trial-followup.ts` | import + start call       | ✓ WIRED | Imports both at lines 16-17; calls both start functions at lines 47-48 after server listen.                                |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                          | Status      | Evidence                                                                                                                                                                                                                                              |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCHED-01    | 71-01-PLAN  | Class reminder sends WhatsApp template N hours before booked class (node-cron + Redis lock)          | ✓ SATISFIED | `class-reminder.ts` fully implements this. Cron `*/30 * * * *`, distributed lock, `sendTemplateMessage('class_reminder', ...)`, Redis dedup key `wa:reminder:class:{bookingId}` 24h TTL.                                                              |
| SCHED-02    | 71-02-PLAN  | Trial follow-up sends message 24-48h after trial attendance asking how it went + offering membership | ✓ SATISFIED | `trial-followup.ts` fully implements this. Hourly cron, business hours guard, attendance window 24-48h, `sendTemplateMessage('trial_followup', ...)`, Redis dedup key `wa:followup:trial:{userId}` 7d TTL, NOT EXISTS exclusion of converted members. |

Both requirements confirmed Complete in `REQUIREMENTS.md` tracker (lines 95-96).

No orphaned requirements — all Phase 71 requirement IDs (SCHED-01, SCHED-02) are claimed by plans 71-01 and 71-02 respectively.

### Anti-Patterns Found

None. Scanned all scheduler source files:

- No `TODO`, `FIXME`, `PLACEHOLDER` comments
- No `console.log` usage (pino logger used throughout)
- No `any` types
- No stub implementations (`return null`, empty bodies)
- All `catch` blocks use `catch (err: unknown)` with `instanceof Error` narrowing

### Human Verification Required

The following items cannot be verified programmatically:

#### 1. Template Pre-approval in Meta Business Manager

**Test:** Verify that `class_reminder` and `trial_followup` templates are approved and active in Meta Business Manager for the production WhatsApp Business Account.
**Expected:** Both templates exist in Meta's dashboard with status "Approved", use `es_AR` language, and have body components matching the parameter slots used in code (firstName, activityName, startTime for class_reminder; firstName for trial_followup).
**Why human:** Meta template approval status is external to the codebase. The code correctly calls the API by name — but if templates are not pre-approved, all sends will silently fail with a 400 error from Meta.

#### 2. Timezone correctness of SQL reminder window

**Test:** Book a class at a known time in Argentina and trigger the scheduler manually; verify the reminder fires at the right time.
**Expected:** A class starting at 18:00 Argentina time triggers a reminder when the scheduler runs at 16:00 (with `CLASS_REMINDER_HOURS=2`).
**Why human:** The SQL time comparison uses `CONVERT_TZ(NOW(), 'UTC', 'America/Argentina/Buenos_Aires')` which requires the MySQL server's timezone tables to be populated. Cannot verify timezone table state programmatically.

### Test Results

```
Test Files: 2 passed (2)
     Tests: 14 passed (14)
  Duration: 215ms
```

All 14 tests (6 class-reminder + 8 trial-followup) pass. TypeScript type check exits clean with no errors.

---

_Verified: 2026-03-18T22:41:00Z_
_Verifier: Claude (gsd-verifier)_
