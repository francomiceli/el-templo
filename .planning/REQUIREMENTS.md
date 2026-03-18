# Requirements: El Templo v4.1 — Admin Consolidation & Data Migration

**Defined:** 2026-03-14
**Core Value:** The admin app is fully operational for physical branches — real member data imported, access control with soft verification, cash box tracking, enhanced payments with discounts and debt management, and role-based permissions for branch staff.

## v4.1 Requirements

Requirements for admin consolidation milestone. Each maps to roadmap phases.

### Deploy

- [ ] **DEPLOY-01**: All three apps (API, admin, member app) and database migrations are deployed to production matching current staging state

### Data Migration

- [x] **DATA-01**: Users table supports document type field (DNI, Pasaporte, etc.)
- [x] **DATA-02**: Users table supports home address field
- [x] **DATA-03**: Import script processes 5 branch CSV files with field mapping (DD/MM/YYYY dates, Masculino/Femenino→male/female, Si/No→boolean, Celular→phone)
- [x] **DATA-04**: Import handles duplicate detection by DNI and email with configurable strategy (skip, update, or error)
- [x] **DATA-05**: Import creates subscription records from plan name lookups when "Último servicio/membresía vigente" is present
- [x] **DATA-06**: Import runs against local, staging, and production databases with branch mapping from filename

### Access Control

- [x] ~~**ACCESS-01**: Branch entrance has a kiosk welcome screen~~ — Replaced by physical QR per branch
- [x] ~~**ACCESS-02**: Kiosk performs soft verification~~ — Replaced by physical QR per branch
- [x] ~~**ACCESS-03**: Admin panel shows real-time access log~~ — Replaced by physical QR per branch
- [x] **ACCESS-04**: Recepcionista can manually check in a member by search from the admin panel
- [x] **ACCESS-05**: Access log records member details, subscription info, and any warnings at time of check-in
- [x] **ACCESS-06**: Admin can generate and download a physical QR code per branch for members to scan with the app

### Plan Configuration

- [x] **PLANS-01**: Admin can configure turnos-per-week limits on subscription plans
- [x] **PLANS-02**: Admin can configure class-based plans where membership includes X classes to spend
- [x] **PLANS-03**: Admin can mark a plan as multi-branch (grants access to all branches)
- [x] **PLANS-04**: Admin can mark a plan as trial (excluded from statistics)
- [x] **PLANS-05**: Admin can configure grace period per branch for membership renewals
- [x] **PLANS-06**: System tracks remaining classes for class-based plans and decrements on confirmed check-in

### Cash Box

- [x] **CASH-02**: System tracks all cash movements organized by payment method (cash, transfer, card)
- [x] **CASH-03**: Recepcionista can view cash box summary showing collected vs spent amounts by payment method

### Payments

- [x] **PAY-01**: ~~Admin can apply discounts when recording payment~~ — N/A: discounts handled at subscription assignment (Zero pricing engine)
- [x] **PAY-02**: ~~Cancel charge frees booking slots~~ — N/A: Phase 61 handles booking cleanup on subscription cancellation
- [x] **PAY-03**: ~~Cuenta corriente debt tracking~~ — N/A: El Templo has no partial payment model
- [x] **PAY-04**: ~~Cobrar deuda action~~ — N/A: no debt tracking needed

### Reports

- [ ] **REPORT-01**: Dashboard shows access log report with filters (period, member, access status) and Excel export
- [ ] **REPORT-02**: Dashboard shows charge history report with filters (period, payment method, member, concept) and Excel export
- [ ] **REPORT-03**: Dashboard shows member debt report listing all members with outstanding balances, contact info, and WhatsApp shortcut
- [ ] **REPORT-04**: Dashboard shows expiring memberships report (members with expired or soon-to-expire subscriptions within configurable window)
- [ ] **REPORT-05**: Dashboard shows inactive member report (active subscription but no check-ins within configurable days threshold)

### Roles & Permissions

- [ ] **ROLES-01**: System supports predefined roles: admin, coach, recepcionista, owner
- [ ] **ROLES-02**: Each role has predefined permission set controlling feature/page access
- [ ] **ROLES-03**: Admin can assign roles to system users
- [ ] **ROLES-04**: Admin UI shows/hides features and actions based on user's assigned role

### Member Management

- [x] **MEMBER-01**: Admin can upload or capture a member photo (webcam or file upload)
- [ ] **MEMBER-02**: Admin can change a member's active subscription to a different plan with price difference calculation
- [ ] **MEMBER-03**: Admin can export filtered member list as Excel file
- [x] **MEMBER-04**: Admin can view and edit member's document type and home address

## Future Requirements (v4.2+)

### Cash Box Expansion

- **CASH-01**: Recepcionista can set daily cash float (fondo de caja) at start of shift
- **CASH-04**: Cash box displays difference tracking between system records and actual cash on hand

### Payment Expansion

- **PAY-05**: System supports receipt types (non-fiscal receipt, manual invoice)
- **PAY-06**: System supports automatic monthly renewal (non-Mercado Pago)
- **PAY-07**: Admin can modify imputation date (accounting date) on charges

### Advanced Membership

- **PLANS-07**: Admin can configure multi-disciplina services spanning multiple activities
- **PLANS-08**: System verifies medical/health pass requirements before granting access

## Out of Scope

| Feature                             | Reason                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Electronic invoices (AFIP)          | Argentina-only regulatory integration, complex, defer to v6.0+                           |
| Mercado Pago auto-renewal           | Payment gateway is v6.0+ scope                                                           |
| Turnstile/door lock integration     | Hardware integration, defer indefinitely                                                 |
| IP-based access restrictions        | Low priority, branches don't need this now                                               |
| Per-user configurable permissions   | Predefined roles sufficient; configurable permissions adds complexity without clear need |
| Member geographic map               | Novel feature, not operationally critical                                                |
| Group plan charges                  | Complex multi-member billing, defer to payment expansion                                 |
| Welcome screen webcam photo capture | Kiosk doesn't need webcam — admin uploads photo separately                               |

## Traceability

<!-- Updated during roadmap creation -->

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| DEPLOY-01   | Phase 58 | Complete |
| DATA-01     | Phase 59 | Complete |
| DATA-02     | Phase 59 | Complete |
| DATA-03     | Phase 59 | Complete |
| DATA-04     | Phase 59 | Complete |
| DATA-05     | Phase 59 | Complete |
| DATA-06     | Phase 59 | Complete |
| MEMBER-04   | Phase 59 | Complete |
| PLANS-01    | Phase 60 | Complete |
| PLANS-02    | Phase 60 | Complete |
| PLANS-03    | Phase 60 | Complete |
| PLANS-04    | Phase 60 | Complete |
| PLANS-05    | Phase 60 | Complete |
| PLANS-06    | Phase 60 | Complete |
| ACCESS-01   | Phase 61 | Removed  |
| ACCESS-02   | Phase 61 | Removed  |
| ACCESS-03   | Phase 61 | Removed  |
| ACCESS-04   | Phase 61 | Complete |
| ACCESS-05   | Phase 61 | Complete |
| ACCESS-06   | Phase 61 | Complete |
| PAY-01      | Phase 62 | N/A      |
| PAY-02      | Phase 62 | N/A      |
| PAY-03      | Phase 62 | N/A      |
| PAY-04      | Phase 62 | N/A      |
| CASH-02     | Phase 63 | Complete |
| CASH-03     | Phase 63 | Complete |
| MEMBER-01   | Phase 64 | Complete |
| MEMBER-02   | Phase 64 | Pending  |
| MEMBER-03   | Phase 64 | Pending  |
| REPORT-01   | Phase 65 | Pending  |
| REPORT-02   | Phase 65 | Pending  |
| REPORT-03   | Phase 65 | Pending  |
| REPORT-04   | Phase 65 | Pending  |
| REPORT-05   | Phase 65 | Pending  |
| ROLES-01    | Phase 66 | Pending  |
| ROLES-02    | Phase 66 | Pending  |
| ROLES-03    | Phase 66 | Pending  |
| ROLES-04    | Phase 66 | Pending  |

**Coverage:**

- v4.1 requirements: 38 total (ACCESS-06 added, ACCESS-01/02/03 removed → kiosk replaced by physical QR)
- Mapped to phases: 38
- Unmapped: 0

---

_Requirements defined: 2026-03-14_
_Last updated: 2026-03-18 — kiosk (ACCESS-01/02/03) replaced with physical branch QR (ACCESS-06); DEPLOY-01 marked complete; PAY-01-04 marked N/A_
