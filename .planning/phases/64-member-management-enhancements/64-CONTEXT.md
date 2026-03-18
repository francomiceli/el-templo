# Phase 64: Member Management Enhancements - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin has complete member management tools — photo upload/capture from member profile, plan change workflow with prorated price comparison, and bulk Excel export of filtered member lists.

Requirements: MEMBER-01, MEMBER-02, MEMBER-03

</domain>

<decisions>
## Implementation Decisions

### Plan Change with Price Comparison (MEMBER-02)

**Business rules:**

- **Upgrade (new plan priceRegular >= current plan priceRegular):** Allowed mid-cycle. Prorated credit applied, net amount charged and recorded as payment in Caja.
- **Downgrade (new plan priceRegular < current plan priceRegular):** Blocked mid-cycle. Message shows subscription expiry date — admin comes back after expiry to assign the cheaper plan manually.
- Upgrade/downgrade determined by comparing `priceRegular` of current vs new plan (not actual price paid).

**Proration logic:**

- **Class-based plans (classesPerWeek):** Credit = (remainingClasses / totalBudget) \* pricePaid. Uses the existing class budget system.
- **Unlimited plans (no classesPerWeek):** Credit = (daysRemaining / durationDays) \* pricePaid. Falls back to calendar day ratio.

**New subscription timing:**

- Upgrade starts a new full period from today (full durationDays). Member gets full value of the new plan. Prorated credit covers "lost" days/classes from the old plan.

**UI flow:**

- Reuses existing AssignPlanDialog in `mode === 'change'`
- All plans shown (no filtering) — admin sees full list regardless of price
- When admin selects a cheaper plan mid-cycle: confirm step shows block message with expiry date
- When admin selects a same-price or more expensive plan: confirm step shows price comparison summary box:
  - Current plan name + price paid
  - Prorated credit (remaining classes or days)
  - New plan name + price
  - Net amount to charge
- Payment method selector in confirm step (same pattern as Phase 63 AssignPlanDialog)
- Payment auto-recorded on confirmation

### Excel Export (MEMBER-03)

- **Scope:** All members matching current filters (not just current page). API endpoint returns full filtered set without pagination limit.
- **Generation:** Server-side. API returns `.xlsx` binary file. Uses a library like exceljs on the backend.
- **Columns:** Name, email, DNI, phone, branch, level, plan, status (activo/inactivo), subscription end date, date of birth, address.
- **Button placement:** Next to "Crear Alumno" button in the top-right of the AlumnosPage filter bar. Always visible. Icon button with download icon.
- **Filename:** Claude's discretion (e.g., `alumnos-{branch}-{date}.xlsx` or similar)

### Photo Upload (MEMBER-01)

- No specific decisions captured — user deferred to defaults
- Admin can upload a member photo via file upload or capture via webcam from the member profile

### Claude's Discretion

- Photo storage mechanism (R2 presigned URL pattern from BlogImageService is available to reuse)
- Photo display locations (profile header, member list thumbnails, kiosk)
- Webcam capture component implementation
- Users table migration for photo column
- Excel filename convention and spreadsheet formatting/headers
- Plan change: how the price comparison summary box is laid out in the confirm step
- Plan change: how remaining classes are calculated (query attendance records vs budget field)
- Whether to show a visual indicator on member profile when a downgrade is pending (subscription about to expire)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Phase context

- `.planning/REQUIREMENTS.md` — MEMBER-01, MEMBER-02, MEMBER-03 requirements (v4.1 scope)
- `.planning/phases/63-cash-box/63-CONTEXT.md` — Payment recording integrated into plan operations, Caja page, renewal flow
- `.planning/phases/60-plan-configuration/60-CONTEXT.md` — Class budget calculation (ceil(durationDays/7) \* classesPerWeek), plan tiers, pricing engine
- `.planning/phases/48-subscriptions/48-CONTEXT.md` — Subscription lifecycle, pricing preview, AURA discount tiers

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-admin/src/components/AssignPlanDialog.vue`: Already has `mode === 'change'` with stepper. Enhance confirm step with price comparison box.
- `el-templo-admin/src/composables/useSubscriptionsApi.ts`: `changePlan()`, `getPricingPreview()` already exist — extend for proration.
- `el-templo-api/src/modules/subscriptions/service.ts`: `changePlan()` method cancels old + assigns new. Extend with proration credit calculation and upgrade/downgrade validation.
- `el-templo-api/src/modules/blog/image-service.ts`: `BlogImageService` with R2 presigned URL pattern — reusable for member photo uploads.
- `el-templo-admin/src/composables/useBlogImageUpload.ts`: Frontend presigned upload pattern (get URL → PUT to R2 → return public URL).
- `el-templo-admin/src/composables/useMembersApi.ts`: Members CRUD, `getMembers()` with filter params — extend for export endpoint.
- `el-templo-api/src/modules/members/routes.ts`: Member list endpoint with search/filters/pagination — add export variant without pagination.
- `el-templo-admin/src/types/payment.ts`: `PAYMENT_METHOD_LABELS`, `PAYMENT_METHOD_OPTIONS` — reuse in plan change payment method selector.

### Established Patterns

- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts
- Constructor DI for services (Phase 56)
- QStepper for multi-step flows (AssignPlanDialog)
- API composables: loading/error refs + async methods + cleanup()
- Integer pesos, no decimals (Phase 48)
- R2 presigned URL upload: API generates signed URL → frontend PUTs file directly → stores public URL in DB

### Integration Points

- `el-templo-api/src/db/schema/users.ts`: Add `photo` varchar column (migration)
- `el-templo-api/src/modules/subscriptions/service.ts`: Extend `changePlan()` with proration + upgrade/downgrade validation
- `el-templo-api/src/modules/subscriptions/routes.ts`: Extend change-plan endpoint to return proration preview
- `el-templo-api/src/modules/members/routes.ts`: Add export endpoint (GET /admin/members/export)
- `el-templo-admin/src/components/AssignPlanDialog.vue`: Add price comparison box in confirm step for change mode
- `el-templo-admin/src/pages/AlumnosPage.vue`: Add export button next to "Crear Alumno"
- `el-templo-admin/src/pages/AlumnoDetailPage.vue`: Add photo display/upload in header card

</code_context>

<specifics>
## Specific Ideas

- Plan change proration by remaining classes (not calendar days) for class-based plans — aligns with how members think about their subscription value
- Downgrade block message should show the exact expiry date so admin knows when to come back
- Excel export should always reflect current filters — admin sets filters first, then clicks export
- Upgrade payment flows into Caja naturally since Phase 63 integrated payment recording into plan operations

</specifics>

<deferred>
## Deferred Ideas

- Scheduled plan downgrade (auto-assign cheaper plan at expiry) — deferred due to infrastructure complexity (pending_plan_changes table, cron trigger)
- Edit fixed schedule slots independently of plan change — could be a future enhancement
- Bulk plan change for selected members — could extend from existing bulk migration pattern

</deferred>

---

_Phase: 64-member-management-enhancements_
_Context gathered: 2026-03-18_
