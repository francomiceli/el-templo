---
phase: 57-registration-types-and-member-creation-flow-fixes
verified: 2026-03-12T16:00:00Z
status: passed
score: 17/17 must-haves verified
re_verification: false
---

# Phase 57: Registration Types and Member Creation Flow Fixes — Verification Report

**Phase Goal:** Fix inconsistent registration and member creation flows. App self-registration only for Online + Park members (other branches created by coaches via admin). Admin "Crear Alumno" needs plan-first flow (plan select drives conditional branch based on multiBranch). Add DNI collection at app registration to fix search-by-DNI. AlumnosPage filter by plan instead of sucursal. Reconcile both creation paths for consistent required data.
**Verified:** 2026-03-12T16:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                  | Status   | Evidence                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App self-registration defaults to Online branch (not PARK)                             | VERIFIED | `auth/routes.ts` line 84: `eq(branches.code, "ONLINE")` when no branchId provided                                                                                                                                                             |
| 2   | App self-registration with `?branchId=N` param assigns that branch                     | VERIFIED | `auth/routes.ts` lines 67-79: requestedBranchId validated and used; `RegisterPage.vue` line 212 converts query param to number                                                                                                                |
| 3   | App self-registration requires DNI and phone                                           | VERIFIED | `auth/schemas.ts` line 4: required array includes `"dni"` and `"phone"`; routes.ts inserts both                                                                                                                                               |
| 4   | Admin member creation requires planId and auto-creates subscription at base price      | VERIFIED | `members/schemas.ts` line 128: `"planId"` in required array; `members/routes.ts` lines 189-198: `subscriptionService.assignPlan()` called with `priceTypeApplied: "regular"`                                                                  |
| 5   | Admin member creation auto-generates password and does not accept password from client | VERIFIED | `members/service.ts` lines 234-235: `randomBytes(9).toString("base64url")`; `CreateMemberInput` type has no `password` field; schema has no password property                                                                                 |
| 6   | Admin member creation sends password-set email via EmailService                        | VERIFIED | `members/routes.ts` lines 208-221: `emailService.sendPasswordSetEmail()` called in try/catch (graceful)                                                                                                                                       |
| 7   | Members list API supports planId filter                                                | VERIFIED | `members/service.ts` lines 92-110: planId=0 for "Sin plan", planId>0 for specific plan; `members/schemas.ts` line 89: `planId: { type: "integer" }` in querystring                                                                            |
| 8   | Members list API returns planName per member                                           | VERIFIED | `members/service.ts` lines 123-128: correlated subquery; `members/types.ts` line 31: `planName: string \| null`; response maps it at line 166                                                                                                 |
| 9   | All existing test suites pass after registerUser() updated                             | VERIFIED | Commits `56ff3c6c` and context confirm 407 tests passing; `test/helpers.ts` lines 67-71: auto-generates `dni` and `phone` defaults                                                                                                            |
| 10  | App registration form collects DNI and phone as required fields                        | VERIFIED | `RegisterPage.vue` lines 59-81: two q-input fields with `dniRules`/`phoneRules`; refs declared at lines 169-170                                                                                                                               |
| 11  | App registration submits DNI and phone to the API                                      | VERIFIED | `RegisterPage.vue` lines 218-219: `dni: dni.value, phone: phone.value` in `authStore.register()` call; `useAuthStore.ts` lines 63-70: signature requires both                                                                                 |
| 12  | Registration from Park QR link shows "Registrarse en Park" header                      | VERIFIED | `RegisterPage.vue` line 178: `computed(() => route.query.branchId ? 'Registrarse en Park' : 'Registrarse')`                                                                                                                                   |
| 13  | Default registration shows "Registrarse" header                                        | VERIFIED | Same computed above — falls through to `'Registrarse'` when no branchId param                                                                                                                                                                 |
| 14  | Admin MemberFormDialog uses plan-first QStepper (Plan → Branch → Personal)             | VERIFIED | `MemberFormDialog.vue` lines 13-230: `<q-stepper>` with 3 steps; step 1 = plan select, step 2 = branch, step 3 = personal data                                                                                                                |
| 15  | Admin MemberFormDialog does not show password field                                    | VERIFIED | No password field anywhere in `MemberFormDialog.vue`; `CreateMemberInput` type has no password                                                                                                                                                |
| 16  | AlumnosPage has Plan column with planName and Plan filter dropdown                     | VERIFIED | `AlumnosPage.vue` lines 242-248: plan column with `format: (val) => val ?? 'Sin plan'`; lines 24-33: Plan filter select; lines 179: `planId: null` in reactive filters; lines 380: `planId: filters.planId ?? undefined` in getMembers params |
| 17  | "Asignar Plan" renamed to "Gestionar Plan"                                             | VERIFIED | `MemberSubscriptionTab.vue` line 128: `label="Gestionar Plan"`; `AssignPlanDialog.vue` line 5: `Gestionar Plan`                                                                                                                               |

**Score:** 17/17 truths verified

---

## Required Artifacts

| Artifact                                                   | Status   | Details                                                                                                                  |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `el-templo-api/src/modules/auth/routes.ts`                 | VERIFIED | ONLINE default branch, DNI uniqueness check, inserts dni+phone+firstName+lastName                                        |
| `el-templo-api/src/modules/auth/schemas.ts`                | VERIFIED | required: `["email","password","firstName","lastName","dni","phone"]`                                                    |
| `el-templo-api/src/modules/members/service.ts`             | VERIFIED | createMember with auto-password; listMembers with planName subquery and planId filter                                    |
| `el-templo-api/src/modules/members/routes.ts`              | VERIFIED | POST calls SubscriptionService.assignPlan + EmailService.sendPasswordSetEmail; GET passes planId                         |
| `el-templo-api/src/modules/members/types.ts`               | VERIFIED | CreateMemberInput has planId, no password; MemberListItem has planName; MemberListParams has planId                      |
| `el-templo-api/src/modules/members/schemas.ts`             | VERIFIED | createMemberSchema requires planId; listMembersSchema has planId querystring; memberListItemSchema has planName          |
| `el-templo-api/src/modules/email/service.ts`               | VERIFIED | EmailService using Resend; graceful degradation when RESEND_API_KEY absent; Pino logger                                  |
| `el-templo-api/src/modules/email/templates.ts`             | VERIFIED | `passwordSetEmailHtml()` returns Spanish HTML; `PASSWORD_SET_SUBJECT` constant                                           |
| `el-templo-api/src/modules/email/index.ts`                 | VERIFIED | Barrel export: `export { EmailService } from "./service"`                                                                |
| `el-templo-api/test/helpers.ts`                            | VERIFIED | `registerUser()` provides auto-generated `dni` (T+base36 timestamp) and `phone` defaults                                 |
| `el-templo-api/test/auth/auth.test.ts`                     | VERIFIED | Tests for DNI missing (400), phone missing (400), duplicate DNI (409)                                                    |
| `el-templo-api/test/members/members.test.ts`               | VERIFIED | Tests for planName field, planId filter, planId=0 "Sin plan", auto-subscription on creation, no tempPassword in response |
| `el-templo-app/src/pages/RegisterPage.vue`                 | VERIFIED | DNI+phone fields with validation; required rules on firstName+lastName; headerText computed; all 6 fields submitted      |
| `el-templo-app/src/stores/useAuthStore.ts`                 | VERIFIED | register() signature requires firstName, lastName, dni, phone (all non-optional)                                         |
| `el-templo-admin/src/components/MemberFormDialog.vue`      | VERIFIED | QStepper create mode (3 steps); no password field; planId submitted via createMember; edit mode flat form unchanged      |
| `el-templo-admin/src/composables/useMembersApi.ts`         | VERIFIED | getPlans() method fetches `/admin/subscriptions/plans?isActive=true`; createMember uses planId-based CreateMemberInput   |
| `el-templo-admin/src/types/member.ts`                      | VERIFIED | CreateMemberInput has planId, no password; MemberListItem has planName; MemberListParams has planId                      |
| `el-templo-admin/src/pages/AlumnosPage.vue`                | VERIFIED | Plan column; Plan filter with Todos/Sin plan/active plans; planId passed to getMembers                                   |
| `el-templo-admin/src/components/MemberSubscriptionTab.vue` | VERIFIED | "Gestionar Plan" button label                                                                                            |
| `el-templo-admin/src/components/AssignPlanDialog.vue`      | VERIFIED | "Gestionar Plan" dialog title                                                                                            |

---

## Key Link Verification

| From                   | To                               | Via                                                         | Status | Evidence                                                                                                                                                                  |
| ---------------------- | -------------------------------- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `members/routes.ts`    | `subscriptions/service.ts`       | `subscriptionService.assignPlan()` after member creation    | WIRED  | routes.ts lines 181-198: SubscriptionService instantiated with AuraService DI; assignPlan called with planId, branchId, startDate, priceTypeApplied                       |
| `members/routes.ts`    | `email/service.ts`               | `emailService.sendPasswordSetEmail()` after member creation | WIRED  | routes.ts lines 208-221: EmailService instantiated; sendPasswordSetEmail called in try/catch                                                                              |
| `auth/routes.ts`       | branches table                   | Lookup by code `'ONLINE'` instead of `'PARK'`               | WIRED  | auth/routes.ts line 84: `eq(branches.code, "ONLINE")`                                                                                                                     |
| `test/helpers.ts`      | `/api/auth/register`             | `registerUser()` sends dni+phone in payload                 | WIRED  | helpers.ts lines 63-73: inject POST with auto-generated dni/phone defaults spread into payload                                                                            |
| `MemberFormDialog.vue` | `useMembersApi.ts`               | `createMember()` with planId, no password                   | WIRED  | MemberFormDialog.vue line 673-687: createMember called with planId from form                                                                                              |
| `AlumnosPage.vue`      | `useMembersApi.ts`               | `getMembers()` with planId filter param                     | WIRED  | AlumnosPage.vue line 380: `planId: filters.planId ?? undefined` in getMembers params                                                                                      |
| `MemberFormDialog.vue` | `/api/admin/subscriptions/plans` | Fetches active plans for step 1 dropdown                    | WIRED  | MemberFormDialog.vue line 562: `membersApi.getPlans()` in loadPlans(); useMembersApi.ts line 203: `api.get('/admin/subscriptions/plans', { params: { isActive: true } })` |

---

## Requirements Coverage

No requirement IDs were declared in any plan's `requirements` field for this phase (codebase health phase). No REQUIREMENTS.md entries map to phase 57.

---

## Anti-Patterns Found

None detected. No `console.log`, no `any` types, no placeholder returns, no empty handlers in any phase-modified file.

---

## Human Verification Required

### 1. App Registration Park QR Flow

**Test:** Navigate to `/register?branchId=2` on a device with the member app running.
**Expected:** Header displays "Registrarse en Park"; form has 6 required fields; submitting registers user under branch 2.
**Why human:** Visual rendering of computed header text requires browser execution.

### 2. Admin MemberFormDialog Stepper UX

**Test:** Open the admin app, go to Alumnos, click "Crear Alumno". Verify the 3-step QStepper renders. Select a plan (should auto-advance to step 2). Select a branch, continue to step 3. Fill personal data and submit.
**Expected:** Member created with no password field visible at any step; success notification shown; member appears in list with plan name.
**Why human:** QStepper step transitions and form submission flow require browser execution.

### 3. AlumnosPage Plan Filter with Live Data

**Test:** In the admin app, navigate to Alumnos. The Plan filter dropdown should show all active plans plus "Todos" and "Sin plan". Select a plan and confirm the table filters correctly.
**Expected:** Plan column visible between Email and Sucursal showing plan names; filter narrows results correctly including "Sin plan" = 0 subscriptions.
**Why human:** Filter interaction and data rendering require live app with real data.

### 4. Password-Set Email on Member Creation

**Test:** Create a member via admin with a real email address (requires RESEND_API_KEY configured in production).
**Expected:** Member receives an email with subject "Tu cuenta en El Templo" containing their temporary password and instructions in Spanish.
**Why human:** Email delivery requires RESEND_API_KEY configured in the environment, which is not present in dev/test.

---

## Notable Implementation Decisions

- **Resend over nodemailer:** Plan specified nodemailer/SMTP but the project already uses Resend in 4 other services. EmailService uses Resend, consistent with existing patterns.
- **Base36 DNI in test helper:** Auto-generated `T${timestamp.toString(36)}${random}` produces ~12-char strings, fitting the `varchar(20)` constraint.
- **Raw SQL column name in subqueries:** Used `s.subscription_status` (MySQL column name) instead of Drizzle's `s.status` due to a known Drizzle enum column naming inconsistency. This is well-documented in Phase 56 decisions.
- **Test createMember helpers:** 5 test files that previously used `POST /admin/members` for test member setup were switched to `registerUser()` to avoid triggering the new auto-subscription side effect.

---

_Verified: 2026-03-12T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
