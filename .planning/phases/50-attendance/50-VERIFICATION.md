---
phase: 50-attendance
verified: 2026-03-10T00:09:35Z
status: gaps_found
score: 14/17 must-haves verified
gaps:
  - truth: "Coach sees today's check-ins for a branch and can batch-confirm them"
    status: partial
    reason: "Admin composable getTodayAttendance expects response key 'data' but API returns 'records' -- attendanceList will be undefined/empty"
    artifacts:
      - path: "el-templo-admin/src/composables/useAttendanceApi.ts"
        issue: "Line 47: api.get<{ data: AttendanceRecord[] }> should be <{ records: AttendanceRecord[] }>, and line 50: return data.data should be data.records"
    missing:
      - "Fix response shape in getTodayAttendance: expect { records: [] } not { data: [] }"
  - truth: "Admin can view attendance history for any member in their profile"
    status: partial
    reason: "Admin composable getMemberAttendance expects response key 'data' but API returns 'records'"
    artifacts:
      - path: "el-templo-admin/src/composables/useAttendanceApi.ts"
        issue: "Line 130: response expects { data: [] } but API returns { records: [] }. getMemberAttendance and listAttendance both have the same mismatch"
    missing:
      - "Fix response shape in getMemberAttendance and listAttendance: expect { records: [] } not { data: [] }"
  - truth: "Error states (overdue, no subscription, already checked in) show clear Spanish messages"
    status: partial
    reason: "CheckInPage reads .error ('Bad Request') instead of .message (the descriptive Spanish text) from API error response"
    artifacts:
      - path: "el-templo-app/src/pages/CheckInPage.vue"
        issue: "Line 132: reads axiosError.response?.data?.error which is 'Bad Request', should read .message for the descriptive Spanish error"
    missing:
      - "Change error extraction to read .message instead of .error from API response, or .message falling back to .error"
---

# Phase 50: Attendance Verification Report

**Phase Goal:** Members check in at branches by scanning a QR code, earn AURA for attending, and coaches can view/manage attendance records
**Verified:** 2026-03-10T00:09:35Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | QR token for a branch is generated with HMAC signature and validated on check-in | VERIFIED | service.ts uses createHmac('sha256') with JWT_SECRET, validateQrToken verifies signature (lines 65-113) |
| 2 | Member scanning QR creates an attendance record with status registrado | VERIFIED | checkIn() method validates QR, enforces constraints, inserts with status "registrado" (lines 124-181) |
| 3 | Coach batch-confirms attendance records, changing status to confirmado and awarding AURA | VERIFIED | batchConfirm() updates status, awards AURA via auraService.award() per record (lines 256-314) |
| 4 | Manual check-in by coach creates auto-confirmed attendance record | VERIFIED | manualCheckIn() inserts with status "confirmado", confirmedAt set, AURA awarded immediately (lines 190-246) |
| 5 | Overdue or subscription-less members are blocked from checking in | VERIFIED | checkIn() calls getMemberSubscription (null = blocked) and getMemberBalance (isOverdue = blocked) with Spanish error messages |
| 6 | One check-in per member per day enforced | VERIFIED | checkOncePerDay() queries DATE(checkedInAt) = CURDATE() and throws BadRequestError (lines 448-463) |
| 7 | Single-branch plan members can only check in at their assigned branch | VERIFIED | checkIn() queries subscriptionPlans.multiBranch, compares QR branchId to user's branchId (lines 149-166) |
| 8 | Admin can view attendance records for any member or date | VERIFIED | listAttendance() with branchId/date/dateFrom/dateTo/status/memberId filters, paginated, joins for names (lines 321-395). Route GET / exposed |
| 9 | Admin can generate and download a QR code image for any branch | VERIFIED | AsistenciaHoyPage.vue: onGenerateQr calls API, renders with qrcode package toDataURL, downloadQr creates anchor element (lines 415-448) |
| 10 | Coach sees today's check-ins for a branch and can batch-confirm them | PARTIAL | AsistenciaHoyPage UI fully built with table, checkboxes, confirm button -- BUT admin composable getTodayAttendance has data shape mismatch (expects `data` key, API returns `records`) |
| 11 | Coach can manually add a member to today's attendance list | VERIFIED | Manual dialog with QSelect member search, onManualCheckIn calls API, refreshes list (lines 454-510) |
| 12 | Admin can view attendance history for any member in their profile | PARTIAL | MemberAttendanceTab.vue fully built and wired to AlumnoDetailPage -- BUT admin composable getMemberAttendance has same data shape mismatch |
| 13 | Asistencia sidebar item is visible to coaches and admins | VERIFIED | AdminLayout.vue: q-item with how_to_reg icon, to="/asistencia" (line 58-63) |
| 14 | Member can tap a button on the home screen to open the QR scanner | VERIFIED | MainLayout.vue: FAB with qr_code_scanner icon, @click="router.push('/check-in')" (lines 73-83) |
| 15 | Member scans a branch QR code and sees a success confirmation | VERIFIED | CheckInPage.vue: Html5Qrcode scanner, onScanSuccess calls checkIn, shows "Asistencia registrada" with branch name (lines 35-41) |
| 16 | Members assigned to virtual Templo Online branch do not see the check-in button | VERIFIED | showCheckInFab computed checks !userStore.profile.branchIsVirtual (line 130). branchIsVirtual added to auth API login+me responses |
| 17 | Error states (overdue, no subscription, already checked in) show clear Spanish messages | PARTIAL | CheckInPage reads .error ("Bad Request") instead of .message (descriptive Spanish text) from API error response |

**Score:** 14/17 truths verified (3 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `el-templo-api/src/db/schema/attendance.ts` | Attendance table schema with status/source enums, FKs | VERIFIED | 60 lines, registrado/confirmado enum, qr/manual source, indexes, relations |
| `el-templo-api/src/db/migrations/0034_attendance.sql` | DDL migration | VERIFIED | 22 lines, CREATE TABLE with FKs and indexes |
| `el-templo-api/src/modules/attendance/service.ts` | AttendanceService (min 100 lines) | VERIFIED | 526 lines, full business logic |
| `el-templo-api/src/modules/attendance/routes.ts` | Admin + member routes (exports attendanceAdminRoutes, attendanceMemberRoutes) | VERIFIED | 250 lines, both plugins exported |
| `el-templo-api/src/modules/attendance/types.ts` | Type definitions | VERIFIED | 47 lines, all interfaces |
| `el-templo-api/src/modules/attendance/schemas.ts` | Fastify JSON schemas | VERIFIED | 204 lines, all endpoints |
| `el-templo-api/src/modules/attendance/index.ts` | Barrel export | VERIFIED | 11 lines, routes + service + types exported |
| `el-templo-api/test/attendance/attendance.test.ts` | Integration tests (min 100 lines) | VERIFIED | 839 lines, 18 test cases |
| `el-templo-admin/src/pages/AsistenciaHoyPage.vue` | Batch confirm page (min 80 lines) | VERIFIED | 551 lines, full page with table, dialogs, polling |
| `el-templo-admin/src/components/MemberAttendanceTab.vue` | Attendance history tab (min 30 lines) | VERIFIED | 188 lines, paginated table with status/source badges |
| `el-templo-admin/src/composables/useAttendanceApi.ts` | API composable (min 30 lines) | VERIFIED (with data shape bug) | 161 lines, all methods present but 3 have wrong response key |
| `el-templo-admin/src/types/attendance.ts` | Types, labels, colors | VERIFIED | 50 lines |
| `el-templo-app/src/pages/CheckInPage.vue` | QR scanner page (min 50 lines) | VERIFIED (with error msg bug) | 305 lines, full scanner with states |
| `el-templo-app/src/composables/useAttendanceApi.ts` | Member API composable (min 15 lines) | VERIFIED | 40 lines, checkIn + getHistory + cleanup |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| attendance/service.ts | payments/service.ts | PaymentService.getMemberBalance() | WIRED | Line 141: `this.paymentService.getMemberBalance(memberId)` with isOverdue check |
| attendance/service.ts | aura/service.ts | AuraService.award() | WIRED | Lines 226, 292: `this.auraService.award({...sourceType:"attendance"...})` |
| attendance/service.ts | subscriptions/service.ts | SubscriptionService.getMemberSubscription() | WIRED | Lines 135, 197: `this.subscriptionService.getMemberSubscription(memberId)` |
| app.ts | attendance/index.ts | Import and register both route plugins | WIRED | Lines 26-28 import, lines 109-116 register at /api/admin/attendance and /api/members/attendance |
| AsistenciaHoyPage.vue | /api/admin/attendance/today | useAttendanceApi composable | PARTIAL | API call made but response key mismatch: expects `data`, API returns `records` |
| AsistenciaHoyPage.vue | /api/admin/attendance/confirm | batchConfirm call on button click | WIRED | Line 396: `attendanceApi.batchConfirm(selectedIds.value)` |
| MemberAttendanceTab.vue | /api/admin/attendance/member/:userId | useAttendanceApi composable | PARTIAL | API call made but response key mismatch |
| CheckInPage.vue | /api/members/attendance/check-in | useAttendanceApi composable POST with qrToken | WIRED | Line 126: `checkIn(decodedText)` calls POST with qrToken |
| MainLayout.vue | CheckInPage.vue | FAB button navigates to /check-in route | WIRED | Line 80: `router.push('/check-in')` |
| auth/routes.ts | UserProfile.branchIsVirtual | Added isVirtual to login+me responses | WIRED | Lines 160, 166, 186 (login) and 226, 232, 243 (me) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ATTN-01 | 50-01, 50-02 | Branch displays a QR code that members scan to check in | VERIFIED | QR token generation via HMAC-SHA256, admin QR download dialog with qrcode package |
| ATTN-02 | 50-01, 50-03 | Member scans QR code via the app to record attendance at the branch | VERIFIED | CheckInPage with html5-qrcode scanner, POST /check-in with qrToken |
| ATTN-03 | 50-01, 50-03 | Check-in records attendance event and awards AURA to the member | VERIFIED | Two-step model: QR scan creates registrado, coach batch-confirm awards AURA. Manual = immediate AURA |
| ATTN-04 | 50-01, 50-02 | Admin can manually check in a member as fallback | VERIFIED | Manual check-in dialog with member search, POST /manual auto-confirms with AURA |
| ATTN-05 | 50-01, 50-02 | Admin can view attendance records for any member or date | PARTIAL | API fully implemented with filters. Admin UI has data shape mismatch that would return empty results |

No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| el-templo-admin/src/composables/useAttendanceApi.ts | 47 | Response shape mismatch: expects `{ data: [] }`, API returns `{ records: [] }` | BLOCKER | getTodayAttendance returns undefined -- batch confirm page shows empty list |
| el-templo-admin/src/composables/useAttendanceApi.ts | 130 | Same mismatch in getMemberAttendance | BLOCKER | Member attendance tab shows empty list |
| el-templo-admin/src/composables/useAttendanceApi.ts | 104 | Same mismatch in listAttendance | BLOCKER | List attendance query returns no results |
| el-templo-app/src/pages/CheckInPage.vue | 132 | Reads `.error` ("Bad Request") instead of `.message` (Spanish description) | WARNING | Member sees "Bad Request" instead of descriptive error like "Tu suscripcion tiene un pago pendiente" |

### Human Verification Required

### 1. QR Scanner Camera Flow

**Test:** Open the member app on a phone, tap the FAB, grant camera permission, and scan a branch QR code
**Expected:** Camera viewfinder opens with corner guides, scanning a valid QR shows "Asistencia registrada" with branch name
**Why human:** Camera access, real-time QR scanning, and visual scanner overlay cannot be verified programmatically

### 2. QR Code Download and Scan Compatibility

**Test:** Generate a QR in admin app, download the PNG, print it, then scan it with the member app
**Expected:** The QR image contains the HMAC token string, and the member app scanner reads it successfully
**Why human:** End-to-end QR encode/decode fidelity requires physical testing

### 3. Batch Confirmation Workflow (after data shape fix)

**Test:** Have a member scan QR, then as coach open AsistenciaHoyPage, verify member appears with checkbox, click Confirmar Asistencia
**Expected:** Member's status changes to Confirmado, AURA balance increases
**Why human:** Two-user workflow spanning two apps requires manual coordination

### 4. FAB Visibility for Virtual Branch Members

**Test:** Log in as a member assigned to Templo Online (virtual branch)
**Expected:** The "Registrar asistencia" FAB button should NOT appear on the home screen
**Why human:** Requires testing with specific user profile data in the live app

### Gaps Summary

Three data shape mismatches in the admin composable `useAttendanceApi.ts` form the primary gap. The API consistently returns attendance arrays under the `records` key, but the composable destructures them as `data.data` (expecting a `data` key). This means:

1. **AsistenciaHoyPage** would show an empty table (no today's records visible) -- blocking the core batch confirmation workflow
2. **MemberAttendanceTab** would show an empty table on the member profile -- blocking attendance history viewing
3. **listAttendance** would similarly fail

These are straightforward fixes -- change `data.data` to `data.records` in three methods.

Additionally, the **CheckInPage** error extraction reads the wrong response field (`.error` = "Bad Request" instead of `.message` = Spanish description). This means error messages shown to members would be generic "Bad Request" instead of descriptive messages like "Tu suscripcion tiene un pago pendiente."

Root cause: The composable was likely written assuming the API would use `data` as the array key (common convention), but the API was implemented using `records` as the key. The error handling assumed the descriptive text would be in `.error` but the API uses the pattern `{ error: "Bad Request", message: "descriptive text" }`.

---

_Verified: 2026-03-10T00:09:35Z_
_Verifier: Claude (gsd-verifier)_
