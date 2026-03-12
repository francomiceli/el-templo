# Phase 57: Registration Types and Member Creation Flow Fixes - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix inconsistent registration and member creation flows. App self-registration restricted to Online + Park branches (other branches created by coaches via admin). Admin "Crear Alumno" becomes plan-first with auto-subscription. Add DNI + phone collection at app registration. Add plan filter/column to AlumnosPage alongside existing branch filter. Implement transactional email system for auto-generated passwords. Reconcile both creation paths for consistent required data.

</domain>

<decisions>
## Implementation Decisions

### App Registration Restriction

- Self-registration defaults to **Online branch** (change from current PARK default)
- Park branch assigned via **QR registration link** with branch param (e.g., `?branch=park`)
- Other branch QR codes are for **attendance only** — completely separate behavior
- Other branches' members created exclusively via admin
- Same registration form for both paths; header changes: "Registrarse en Park" vs "Registrarse"
- Registration now collects: first name, last name, email, password, **DNI (required)**, **phone (required)**
- Park QR registration link is a **placeholder** for now (QR generation not yet built)

### Admin Plan-First Creation Flow

- **Step 1:** Select plan — flat dropdown of all active plans (plans are NOT branch-specific; they are single-branch or multi-branch)
- **Step 2:** Coach picks branch manually (always, regardless of plan type). Label: "Sede principal" for multi-branch plans, "Sede" for single-branch. Sede principal = where registration occurs
- **Step 3:** Personal data (name, email, DNI, phone, level, optional fields)
- Creating member **auto-creates subscription** at plan's base price (no pricing preview — new members have no AURA balance or boarding pass)
- **Password auto-generated** — member receives "set your password" email (requires email system)
- Password field removed from admin creation form
- Rename "Asignar Plan" → "Gestionar Plan" throughout admin (members always start with a plan)

### Email System

- Implement transactional email sending for password-set emails on admin member creation
- Required for the auto-generated password flow to work

### DNI at App Registration

- DNI **required** for all self-registering members
- **No format validation** — accept any string, enforce uniqueness only
- Works for both Argentina (numeric DNI) and Spain (NIE/NIF with letters)
- DNI uniqueness check reuses existing `check-dni` endpoint pattern

### Members List Filtering (AlumnosPage)

- **Both** Plan and Sucursal filters (not replacing branch)
- Filters: [Search] [Plan] [Sucursal] [Nivel] [Estado] [Morosos]
- Table columns: Nombre, Email, **Plan**, Sucursal, Nivel, Estado, Fecha, Acciones
- Plan column shows active subscription plan name, or **"Sin plan"** if no active subscription
- Plan filter dropdown includes all active plans + **"Sin plan"** option
- Multi-branch plan members show **sede principal** in Sucursal column

### Claude's Discretion

- Email service implementation details (provider, templating approach)
- Park QR placeholder implementation (route param handling)
- API schema changes for new required fields on registration endpoint
- Migration strategy for existing members without DNI/phone

</decisions>

<specifics>
## Specific Ideas

- "Assign plan does not make sense — members always start with a plan; should be 'manage plan' to change it, approve requested discounts, etc."
- Park is free, no subscription needed — Park is like Online but we can track who uses the park location and award AURA for daily QR scans
- Sede principal = where the registration occurs (for multi-branch plan members)

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `MemberFormDialog.vue`: Existing QStepper-based dialog — restructure steps from branch-first to plan-first
- `useMembersApi.ts`: Has `createMember()`, `checkDni()`, `getBranches()` — extend with plan-related params
- `RegisterPage.vue`: Existing registration form — add DNI and phone fields
- `useAuthStore.ts`: `register()` method — extend payload with DNI + phone
- `subscription-plans` schema: Already has `multiBranch` boolean field
- DNI uniqueness check: `GET /admin/members/check-dni` endpoint exists — reuse pattern for app-side

### Established Patterns

- QStepper pattern used in subscription assignment dialog (Phase 48) — reuse for plan-first creation
- Constructor DI pattern for services (Phase 56) — use for any new email service
- Expire-on-read pattern for subscriptions (Phase 48) — subscription auto-created at base price

### Integration Points

- `POST /auth/register` — needs new required fields (DNI, phone), default branch change (PARK → Online), branch param support
- `POST /admin/members` — needs plan-first flow, auto-subscription creation, auto-password generation
- `GET /admin/members` — needs plan filter param, plan info in response
- AlumnosPage filters — add plan dropdown (needs plans list endpoint or reuse from subscriptions module)
- Subscription plans API — may need a public endpoint for plan list in creation dialog

</code_context>

<deferred>
## Deferred Ideas

- **Discount approval workflow** — coach approves AURA discounts requested by members. New capability, separate phase.
- **Full plan management UI** — "Gestionar Plan" with change plan, pause, upgrade/downgrade flows. Phase 57 only renames the label; full management is a future feature.

</deferred>

---

_Phase: 57-registration-types-and-member-creation-flow-fixes_
_Context gathered: 2026-03-12_
