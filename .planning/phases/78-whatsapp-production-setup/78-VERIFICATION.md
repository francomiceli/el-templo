---
phase: 78-whatsapp-production-setup
verified: 2026-03-27T00:00:00Z
status: human_needed
score: 3/4 must-haves verified (4th requires live MySQL)
re_verification: false
human_verification:
  - test: "Run the timezone migration against a real MySQL instance and verify CONVERT_TZ returns non-NULL"
    expected: "SELECT CONVERT_TZ('2024-01-01 00:00:00', 'UTC', 'America/Argentina/Buenos_Aires') returns '2023-12-31 21:00:00'"
    why_human: "Cannot execute SQL against a live database during static verification. The migration SQL is correct and idempotent, but whether it actually works depends on the MySQL version and whether the mysql.time_zone tables exist and accept the writes."
---

# Phase 78: WhatsApp Production Setup Verification Report

**Phase Goal:** All WhatsApp production prerequisites are documented and ready so the bot can go live with Meta-approved templates and a registered phone number
**Verified:** 2026-03-27
**Status:** human_needed (all automated checks pass; one item requires live database verification)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                     | Status       | Evidence                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | class_reminder template is documented with exact body text, variable mapping, and submission instructions | VERIFIED     | `docs/deployment/whatsapp-templates.md` lines 7-43: name, category UTILITY, language es_AR, 3-variable body, JSON component structure, code line references                                    |
| 2   | trial_followup template is documented with exact body text, variable mapping, and submission instructions | VERIFIED     | `docs/deployment/whatsapp-templates.md` lines 46-76: name, category MARKETING, language es_AR, 1-variable body, JSON component structure, code line references                                 |
| 3   | WhatsApp Business phone number registration is documented with step-by-step instructions                  | VERIFIED     | `docs/deployment/whatsapp-phone-registration.md`: prerequisites, 6 registration steps, post-registration config, env var mapping table, warnings                                               |
| 4   | MySQL timezone tables are populated so CONVERT_TZ returns non-NULL for America/Argentina/Buenos_Aires     | HUMAN NEEDED | `el-templo-api/src/db/migrations/0043_populate_timezone_tables.sql` exists with correct INSERT IGNORE statements and FLUSH TABLES, but execution against live DB cannot be verified statically |

**Score:** 3/4 truths fully verified; 4th passes static checks, requires live DB confirmation

### Required Artifacts

| Artifact                                                            | Expected                                           | Status   | Details                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/deployment/whatsapp-templates.md`                             | Template message documentation for Meta submission | VERIFIED | 102 lines, contains both templates with full variable tables, JSON structures, submission instructions, and important notes                 |
| `docs/deployment/whatsapp-phone-registration.md`                    | Phone registration step-by-step guide              | VERIFIED | 46 lines, contains prerequisites, 6-step process, post-registration config, env var table, warnings                                         |
| `el-templo-api/src/db/migrations/0043_populate_timezone_tables.sql` | Migration to populate MySQL timezone data          | VERIFIED | 39 lines, America/Argentina/Buenos_Aires at UTC-3 (-10800s), UTC alias, INSERT IGNORE idempotency, FLUSH TABLES, verification query comment |

All three artifacts exist and are substantive. They are documentation/migration files — wiring verification means checking that the documented structures match what the scheduler code actually sends (see Key Links below).

### Key Link Verification

| From                                    | To                                               | Via                               | Status   | Details                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------ | --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/deployment/whatsapp-templates.md` | `el-templo-bot/src/schedulers/class-reminder.ts` | Template name + parameter mapping | VERIFIED | Doc: name=`class_reminder`, 3 body params (first_name, activity_name, start_time). Code line 135: `sendTemplateMessage(booking.phone, "class_reminder", "es_AR", [...])` with exactly 3 text params at lines 139-141 matching `booking.first_name`, `booking.activity_name`, `booking.start_time`. Perfect match. |
| `docs/deployment/whatsapp-templates.md` | `el-templo-bot/src/schedulers/trial-followup.ts` | Template name + parameter mapping | VERIFIED | Doc: name=`trial_followup`, 1 body param (first_name). Code line 149: `sendTemplateMessage(attendee.phone, "trial_followup", "es_AR", [...])` with exactly 1 text param at line 152 matching `attendee.first_name`. Perfect match.                                                                                |

Both key links are fully wired. The template names, language codes, parameter counts, and field mappings documented match the scheduler code exactly.

### Requirements Coverage

| Requirement | Source Plan | Description                                                         | Status                     | Evidence                                                                                                   |
| ----------- | ----------- | ------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| WA-01       | 78-01-PLAN  | Meta template messages documented and ready for submission          | SATISFIED                  | Both templates documented with full structure; code line references verified against actual scheduler code |
| WA-02       | 78-01-PLAN  | WhatsApp phone number registration process documented               | SATISFIED                  | `whatsapp-phone-registration.md` covers all required sections including env var mapping                    |
| WA-03       | 78-01-PLAN  | MySQL timezone tables populated for CONVERT_TZ in scheduler queries | SATISFIED (pending DB run) | Migration SQL is correct and idempotent; actual effect requires live DB confirmation                       |

No orphaned requirements — all three WA-01/WA-02/WA-03 map directly to plans in this phase.

### Anti-Patterns Found

| File                                    | Line | Pattern       | Severity | Impact                                                |
| --------------------------------------- | ---- | ------------- | -------- | ----------------------------------------------------- | ----------- | ----------- | ----------------------------------------- |
| `docs/deployment/whatsapp-templates.md` | 21   | "Placeholder" | Info     | Column header in a table (`                           | Placeholder | Description | `) — legitimate use, not a stub indicator |
| `docs/deployment/whatsapp-templates.md` | 60   | "Placeholder" | Info     | Same — column header in a table, not a stub indicator |

No blockers or warnings. The "Placeholder" matches are column header text in markdown tables describing Meta template variable placeholders (`{{1}}`, `{{2}}`), not code stubs.

### Human Verification Required

#### 1. MySQL Timezone Migration Effectiveness

**Test:** Run the migration against a MySQL 8.x instance (or the production server), then execute the verification query included as a comment at the bottom of the migration file.

**Command to run:**

```sql
SOURCE el-templo-api/src/db/migrations/0043_populate_timezone_tables.sql;
SELECT CONVERT_TZ('2024-01-01 00:00:00', 'UTC', 'America/Argentina/Buenos_Aires');
```

**Expected:** Returns `'2023-12-31 21:00:00'` (not NULL)

**Why human:** Cannot execute SQL against a live database during static verification. The migration SQL is structurally correct (proper table names, INSERT IGNORE for idempotency, correct UTC-3 offset of -10800 seconds, FLUSH TABLES), but actual success depends on whether the MySQL user has SUPER or SYSTEM_VARIABLES_ADMIN privileges to write to `mysql.*` tables, which varies by environment (managed MySQL services like RDS may restrict this).

**Note:** If `CONVERT_TZ` still returns NULL after running the migration, the fallback documented in the migration header applies: `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql` (requires OS-level access to the server).

### Gaps Summary

No gaps found in the documentation deliverables. All three artifacts are substantive and correctly cross-referenced against the scheduler code.

The only outstanding item is live database verification of the timezone migration, which is inherently a runtime concern. The migration SQL is correct; the human verification step above confirms it works.

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
