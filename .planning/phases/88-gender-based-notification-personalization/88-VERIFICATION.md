---
phase: 88-gender-based-notification-personalization
verified: 2026-04-03T21:30:00Z
status: gaps_found
score: 9/11 must-haves verified
gaps:
  - truth: "Integration tests verify gender-aware notification queueing"
    status: failed
    reason: "The registerUser() test helper in test/helpers.ts does not include a gender field in its POST /auth/register payload. The register endpoint now requires gender (D-09). Every test file that calls registerUser() fails at setup with: '400 body must have required property gender'. This breaks 24 test files, not just the new gender tests."
    artifacts:
      - path: "el-templo-api/test/helpers.ts"
        issue: "registerUser() payload does not include gender field; endpoint now requires it"
      - path: "el-templo-api/test/notifications.test.ts"
        issue: "All 5 gender-aware tests fail because registerUser() fails, leaving memberId unset"
    missing:
      - "Add gender: 'male' (or any valid enum value) as a default in registerUser() payload in test/helpers.ts"
  - truth: "Integration tests verify send-segment routes female copy to female members"
    status: failed
    reason: "Same root cause as above — the send-segment test also uses registerUser() for both members. The test never reaches the assertion because member setup fails."
    artifacts:
      - path: "el-templo-api/test/notifications.test.ts"
        issue: "send-segment dual-copy test also calls registerUser() without gender, fails at setup"
    missing:
      - "Fix registerUser() in test/helpers.ts (same fix as above — one change fixes all 5 failing gender tests)"
human_verification:
  - test: "Verify RegisterPage.vue gender field renders correctly in the mobile app"
    expected: "A q-select labeled 'Genero' appears between the phone and email fields with 4 options: Femenino, Masculino, Otro, No especificar — in that order"
    why_human: "Cannot run Quasar dev server in this environment"
  - test: "Verify admin template edit dialog shows side-by-side columns"
    expected: "Editing a notification template opens a 700px+ dialog with left column labeled 'Masculino / Default' and right column labeled 'Femenino', each containing title and body fields"
    why_human: "Cannot render admin Vue app for visual verification"
---

# Phase 88: Gender-Based Notification Personalization Verification Report

**Phase Goal:** Infer gender from existing member names (batch script), add gender field to registration page and onboarding flows, make notification templates gender-aware (e.g., "Bienvenido/Bienvenida"), update notification service to resolve gender per user and select appropriate copy variant.

**Verified:** 2026-04-03T21:30:00Z
**Status:** gaps_found — 2 truths failed (1 root cause)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                      | Status   | Evidence                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gender enum supports 'unspecified' as fourth value                         | VERIFIED | `genderEnum = mysqlEnum("gender", ["male", "female", "other", "unspecified"])` — users.ts:28                                                                                    |
| 2   | notification_templates table has titleFemale and bodyFemale columns        | VERIFIED | `titleFemale: varchar("title_female", {length: 200})` and `bodyFemale: text("body_female")` — notifications.ts:66-67                                                            |
| 3   | TEMPLATE_SEEDS has female variants for all 11 templates                    | VERIFIED | 12 occurrences of `titleFemale` in types.ts (1 interface + 11 seeds), all verified present                                                                                      |
| 4   | Member create/update schemas accept 'unspecified'                          | VERIFIED | Create schema: `enum: ["male", "female", "other", "unspecified"]`; update schema: same + null — schemas.ts:185, 219-222                                                         |
| 5   | Registration page has required gender field with 4 Spanish options         | VERIFIED | q-select with `v-model="gender"`, `label="Genero"`, `:rules="[requiredRule]"`, 4 options in correct order (Femenino, Masculino, Otro, No especificar) — RegisterPage.vue:92-105 |
| 6   | Register API endpoint accepts and persists gender to users table           | VERIFIED | `gender` in `required` array, in RegisterBody interface, in destructuring, and in `insert(users).values({...gender...})` — routes.ts:22, 45, 253                                |
| 7   | Admin member form includes 'No especificar' as fourth gender option        | VERIFIED | `{ label: 'No especificar', value: 'unspecified' }` added to genderOptions — MemberFormDialog.vue:585                                                                           |
| 8   | NotificationService resolves user gender and selects correct template copy | VERIFIED | `resolveUseFemale(userId)` queries users.gender; queueNotification uses titleFemale/bodyFemale when female — service.ts:207-280                                                 |
| 9   | Admin template edit shows side-by-side male/female fields                  | VERIFIED | Two `col-6` divs labeled "Masculino / Default" and "Femenino" in edit dialog — NotificacionesPage.vue:169-183                                                                   |
| 10  | Integration tests verify gender-aware notification queueing                | FAILED   | registerUser() helper does not send gender; API now requires it; all 24 test files using registerUser() fail with 400                                                           |
| 11  | Integration tests verify send-segment routes female copy to female members | FAILED   | Same root cause — registerUser() missing gender breaks test setup                                                                                                               |

**Score:** 9/11 truths verified

---

### Required Artifacts

| Artifact                                                                 | Expected                                       | Status   | Details                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/users.ts`                                   | genderEnum with 'unspecified'                  | VERIFIED | Line 28: ["male", "female", "other", "unspecified"]                 |
| `el-templo-api/src/db/schema/notifications.ts`                           | titleFemale and bodyFemale columns             | VERIFIED | Lines 66-67 present and correct                                     |
| `el-templo-api/src/db/migrations/0066_gender_notification_templates.sql` | Migration SQL for both changes                 | VERIFIED | ALTER TABLE users + 2x ALTER TABLE notification_templates           |
| `el-templo-api/src/modules/notifications/types.ts`                       | TemplateSeed with female fields; 11 seeds      | VERIFIED | Interface has titleFemale/bodyFemale; 11 seeds all present          |
| `el-templo-api/src/modules/auth/schemas.ts`                              | gender in required array                       | VERIFIED | gender required, enum: 4 values                                     |
| `el-templo-api/src/modules/auth/routes.ts`                               | gender in RegisterBody and insert              | VERIFIED | Interface, destructuring, insert all include gender                 |
| `el-templo-app/src/pages/RegisterPage.vue`                               | Gender q-select field                          | VERIFIED | q-select with requiredRule, 4 options, correct order                |
| `el-templo-app/src/stores/useAuthStore.ts`                               | gender: string in register param type          | VERIFIED | Line 70: gender: string                                             |
| `el-templo-admin/src/components/MemberFormDialog.vue`                    | No especificar option                          | VERIFIED | Line 585: {label: 'No especificar', value: 'unspecified'}           |
| `el-templo-api/src/modules/notifications/service.ts`                     | resolveUseFemale + gender-aware queueing       | VERIFIED | resolveUseFemale() private method; used in queueNotification()      |
| `el-templo-api/src/modules/notifications/routes.ts`                      | titleFemale/bodyFemale in template CRUD + send | VERIFIED | In GET response, PUT schema/handler, POST send-segment              |
| `el-templo-admin/src/pages/NotificacionesPage.vue`                       | Side-by-side edit + dual-copy send             | VERIFIED | col-6 layout, editForm/sendForm with female fields, saveTemplate    |
| `el-templo-api/backfill-gender.ts`                                       | NAME_GENDER_MAP + idempotent script            | VERIFIED | 170+ names, isNull(users.gender) guard, batch updates, report       |
| `el-templo-api/test/notifications.test.ts`                               | Gender-Aware describe block with 5 tests       | STUB     | Tests exist but all fail due to registerUser() missing gender field |
| `el-templo-api/test/helpers.ts`                                          | registerUser() sends gender in payload         | MISSING  | gender not present in payload; all 24 test files broken             |

---

### Key Link Verification

| From                                      | To                                  | Via                                       | Status | Details                                                         |
| ----------------------------------------- | ----------------------------------- | ----------------------------------------- | ------ | --------------------------------------------------------------- |
| users.ts genderEnum                       | members/schemas.ts                  | 'unspecified' in both create/update enums | WIRED  | Exact match verified                                            |
| notifications.ts titleFemale              | notifications/types.ts TemplateSeed | Interface mirrors DB columns              | WIRED  | Both titleFemale: string fields match                           |
| RegisterPage.vue                          | auth/routes.ts                      | gender in register payload                | WIRED  | authStore.register({...gender.value...}) → API requires gender  |
| auth/routes.ts                            | db/schema/users.ts                  | INSERT includes gender column             | WIRED  | Destructures gender, inserts gender in values({})               |
| notifications/service.ts resolveUseFemale | db/schema/users.ts                  | users.gender lookup                       | WIRED  | schema.users.gender query in resolveUseFemale                   |
| NotificacionesPage.vue                    | notifications/routes.ts             | PUT sends titleFemale/bodyFemale          | WIRED  | saveTemplate() includes both fields; route handler accepts both |
| notifications/routes.ts send-segment      | db/schema/users.ts                  | gender join for per-member copy           | WIRED  | innerJoin on users, member.gender === 'female' check            |

---

### Data-Flow Trace (Level 4)

| Artifact                                     | Data Variable | Source                                         | Produces Real Data | Status  |
| -------------------------------------------- | ------------- | ---------------------------------------------- | ------------------ | ------- |
| `notifications/service.ts` queueNotification | titleFemale   | resolveUseFemale() → users table gender lookup | Yes                | FLOWING |
| `notifications/routes.ts` send-segment       | titleFemale   | per-member gender from users JOIN              | Yes                | FLOWING |
| `NotificacionesPage.vue` editForm            | titleFemale   | GET /admin/templates API response              | Yes                | FLOWING |

---

### Behavioral Spot-Checks

| Behavior                                          | Command / Check                                         | Result                                                                              | Status |
| ------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| API TypeScript compiles clean                     | `cd el-templo-api && npx tsc --noEmit`                  | No output (clean)                                                                   | PASS   |
| backfill script TypeScript (via project tsconfig) | `npx tsc --noEmit` (whole project includes backfill.ts) | Clean (no errors for backfill in project tsc)                                       | PASS   |
| Test suite gender-aware tests                     | `pnpm test` — any test using registerUser()             | FAIL — 400 "body must have required property 'gender'" on every registerUser() call | FAIL   |
| NAME_GENDER_MAP duplicate entries                 | `grep -n "romina\|maximiliano" backfill-gender.ts`      | romina: lines 29+112; maximiliano: lines 135+195 — same gender both times           | WARN   |

---

### Requirements Coverage

| Decision | Source Plan | Description                                                                       | Status                            | Evidence                                                                                          |
| -------- | ----------- | --------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| D-01     | 88-04       | Curated Spanish name dictionary from actual member base                           | SATISFIED                         | NAME_GENDER_MAP with 170+ common Argentine/Spanish names in backfill-gender.ts                    |
| D-02     | 88-04       | Unresolved names set to 'unspecified', not null                                   | SATISFIED                         | Fallback branch: `unspecifiedIds.push(user.id)` with SQL `SET gender = 'unspecified'`             |
| D-03     | 88-04       | Standalone idempotent TypeScript seed script, works against all 3 environments    | SATISFIED                         | `isNull(users.gender)` guard makes it idempotent; uses DATABASE_URL from .env                     |
| D-04     | 88-04       | Report: names mapped to male, female, unspecified                                 | SATISFIED                         | Report section prints "Mapped to male: N (names)", "Mapped to female: N", "Set to unspecified: N" |
| D-05     | 88-01       | ALTER gender enum to add 'unspecified'                                            | SATISFIED                         | users.ts:28 and migration 0066 both present                                                       |
| D-06     | 88-01       | null = legacy never asked; 'unspecified' = explicitly chose not to specify        | SATISFIED                         | Code comments and backfill WHERE isNull guard enforce this distinction                            |
| D-07     | 88-02       | Gender required on registration with 4 options                                    | SATISFIED                         | 'gender' in required array in auth/schemas.ts; q-select with requiredRule in RegisterPage.vue     |
| D-08     | 88-02       | "No especificar" maps to 'unspecified', fallback to masculine copy                | SATISFIED                         | 'unspecified' in enum; notification service falls back to title/body for non-female               |
| D-09     | 88-02       | /auth/register endpoint accepts gender parameter                                  | SATISFIED                         | RegisterBody has gender field, inserted into users table                                          |
| D-10     | 88-01       | ALL 11 templates get male/female variants                                         | SATISFIED                         | All 11 TEMPLATE_SEEDS have titleFemale/bodyFemale (gender-neutral templates duplicate copy)       |
| D-11     | 88-01       | Separate male/female fields per template (not separate rows)                      | SATISFIED                         | titleFemale/bodyFemale columns on same table; TemplateSeed has both fields                        |
| D-12     | 88-03       | Notification service resolves gender per user when sending                        | SATISFIED                         | resolveUseFemale() private method used in queueNotification()                                     |
| D-13     | 88-03/88-04 | Admin segment sends support dual-copy                                             | SATISFIED (code); PARTIAL (tests) | Route accepts titleFemale/bodyFemale, per-member gender join; but tests broken by helpers.ts      |
| D-14     | 88-03       | Template edit UI shows side-by-side male/female fields                            | SATISFIED                         | col-6 layout with "Masculino / Default" and "Femenino" columns                                    |
| D-15     | 88-03       | Template list shows one row per template type                                     | SATISFIED                         | No template duplication; list returns one row per templateKey                                     |
| D-16     | 88-01       | Migration adds titleFemale/bodyFemale; existing title/body stay as male default   | SATISFIED                         | Existing columns unchanged; new nullable columns added                                            |
| D-17     | 88-01       | Template seed data updated with female variants for all 11 types                  | SATISFIED                         | seedTemplates() INSERT now includes title_female, body_female columns                             |
| D-18     | 88-04       | Backfill script runs against local, staging, production independently; idempotent | SATISFIED                         | isNull(users.gender) guard; DATABASE_URL from .env controls target                                |

All 18 decisions are accounted for. D-13's test verification is blocked by the helpers.ts gap.

---

### Anti-Patterns Found

| File                               | Location       | Pattern                                            | Severity | Impact                                                               |
| ---------------------------------- | -------------- | -------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `el-templo-api/test/helpers.ts`    | registerUser() | Missing required field (gender) in API payload     | BLOCKER  | All 24 test files using registerUser() fail with 400 at setup        |
| `el-templo-api/backfill-gender.ts` | Lines 29+112   | Duplicate object literal key `romina: "female"`    | WARNING  | TS strict compile error (harmless at runtime, same value both times) |
| `el-templo-api/backfill-gender.ts` | Lines 135+195  | Duplicate object literal key `maximiliano: "male"` | WARNING  | TS strict compile error (harmless at runtime, same value both times) |

---

### Human Verification Required

#### 1. RegisterPage Gender Field Visual Rendering

**Test:** Build and run el-templo-app in development mode. Navigate to the registration page.
**Expected:** A Quasar q-select labeled "Genero" appears between the phone and email input fields. The dropdown shows exactly 4 options in this order: Femenino, Masculino, Otro, No especificar. Attempting to submit the form without selecting gender shows a validation error.
**Why human:** Cannot run Quasar dev server in this verification environment.

#### 2. Admin Template Edit Dialog Layout

**Test:** Log in as admin, go to Notificaciones, click edit on any template.
**Expected:** A dialog at least 700px wide opens showing two side-by-side columns: left labeled "Masculino / Default" (with Titulo and Cuerpo fields), right labeled "Femenino" (with Titulo femenino and Cuerpo femenino fields). Single "Guardar" button saves all four fields.
**Why human:** Cannot render admin Vue app in this environment.

---

### Gaps Summary

**One root cause, two failing truths:** The test helper `registerUser()` in `el-templo-api/test/helpers.ts` was not updated when gender became a required field on the `/auth/register` endpoint. The fix is a single line — adding `gender: 'male'` (or any valid value) as a default in the payload object at line 77. This one change will unblock all 24 test files and allow the 5 gender-aware tests in notifications.test.ts to run against actual DB behavior.

Everything else in the phase is correctly implemented and wired:

- Schema changes (D-05/D-06/D-11/D-16) are in place with migration SQL.
- Template seeds (D-10/D-17) have all 11 female variants properly defined.
- Registration flow (D-07/D-08/D-09) is complete on both API and frontend.
- Admin UX (D-13/D-14/D-15) shows side-by-side fields with dual-copy segment send.
- Notification service (D-12) resolves gender per user before inserting queue entries.
- Backfill script (D-01/D-02/D-03/D-04/D-18) is idempotent with curated dictionary and produces categorized report.

The two duplicate entries in NAME_GENDER_MAP (romina, maximiliano) are functionally harmless (same gender both times) but should be cleaned up to keep the TS compiler happy under strict settings.

---

_Verified: 2026-04-03T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
