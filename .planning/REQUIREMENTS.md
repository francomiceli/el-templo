# Requirements: El Templo v4.0 — Ecosystem Foundation

**Defined:** 2026-03-08
**Core Value:** The operational backbone works — coaches manage from one admin, members check in and reserve spots, architecture ready for AURA/lifestyle/social.

## v4.0 Requirements

Requirements for ecosystem foundation milestone. Each maps to roadmap phases.

### Restructure

- [x] **RSTRC-01**: System supports a virtual "Templo Online" branch for online-only members
- [x] **RSTRC-02**: AURA transaction ledger records all earning/spending events with source, amount, and timestamp
- [x] **RSTRC-03**: AURA balance is maintained per user and updated atomically on each transaction
- [x] **RSTRC-04**: API modules have explicit boundaries with defined inter-module interfaces
- [x] **RSTRC-05**: Lifestyle content (habits, journal questions, challenges, philosophical tools, factos, revelations) is extracted from Arete and adapted to El Templo brand voice

### Members Management

- [ ] **MEMB-01**: Admin can view list of all members with search, filters (branch, level, status), and pagination
- [ ] **MEMB-02**: Admin can view extended member profile (personal info, subscription, payment history, attendance, notes)
- [ ] **MEMB-03**: Admin can create a new member with profile details and branch/level assignment
- [ ] **MEMB-04**: Admin can edit member profile, branch, and level
- [ ] **MEMB-05**: Admin can deactivate/reactivate a member
- [ ] **MEMB-06**: Admin can add internal notes to a member's profile

### Subscriptions

- [ ] **SUBS-01**: Admin can create and manage subscription plans (name, price, frequency limits)
- [ ] **SUBS-02**: Admin can assign a plan to a member with start date and billing cycle
- [ ] **SUBS-03**: System auto-calculates adjusted price when member has active AURA discount milestones
- [ ] **SUBS-04**: Admin can view subscription status (active, expired, cancelled) for any member
- [ ] **SUBS-05**: Member can view their current plan and subscription status in the app

### Payments

- [ ] **PAY-01**: Admin can record a payment for a member (amount, date, method: cash/transfer/card)
- [ ] **PAY-02**: Admin can view payment history for any member
- [ ] **PAY-03**: System flags members with overdue payments
- [ ] **PAY-04**: Admin can view financial summary report (revenue by period, by branch, by payment method)

### Analytics

- [ ] **ANLT-01**: Admin can view member analytics (total active, new/churned per period, retention rate)
- [ ] **ANLT-02**: Admin can view attendance analytics (check-ins per day/week, peak hours, occupancy by slot)
- [ ] **ANLT-03**: Admin can view financial analytics (revenue trends, outstanding balances, collection rate)
- [ ] **ANLT-04**: Analytics can be filtered by branch and date range

### Attendance

- [ ] **ATTN-01**: Branch displays a QR code that members scan to check in
- [ ] **ATTN-02**: Member scans QR code via the app to record attendance at the branch
- [ ] **ATTN-03**: Check-in records attendance event and awards AURA to the member
- [ ] **ATTN-04**: Admin can manually check in a member as fallback
- [ ] **ATTN-05**: Admin can view attendance records for any member or date

### Scheduling

- [ ] **SCHD-01**: Admin can create activities (e.g., "Sesion Grupal", "Open Gym") with descriptions
- [ ] **SCHD-02**: Admin can create weekly recurring time slots for activities with capacity limits
- [ ] **SCHD-03**: Member can view available class slots and capacity in the app
- [ ] **SCHD-04**: Member can reserve a spot in a class slot
- [ ] **SCHD-05**: Member can cancel a reservation
- [ ] **SCHD-06**: System enforces capacity limits — full slots cannot be booked

## Future Requirements (v5.0+)

### Lifestyle / Mi Camino

- **LIFE-01**: Member can track daily habits across 6 areas (Mente, Cuerpo, Coherencia, Accion, Vinculo, Reflexion)
- **LIFE-02**: Member can write journal entries with guided prompts
- **LIFE-03**: Member can participate in weekly challenges
- **LIFE-04**: Member can use philosophical tools (Premeditatio Malorum, Examen Nocturno, etc.)
- **LIFE-05**: Member sees lifestyle module prominently on home screen as "Mi Camino"

### AURA Economy

- **AURA-01**: Member earns AURA from training, attendance, habits, social, referrals
- **AURA-02**: Lifetime AURA milestones auto-unlock tangible rewards (discounts, guest passes, free months)
- **AURA-03**: Mini store where members browse and spend AURA on extras
- **AURA-04**: Member loses AURA automatically when streak breaks

### Social / Agora

- **SOCL-01**: Branch-scoped feed + global feed
- **SOCL-02**: Auto-generated + coach-created missions
- **SOCL-03**: Custom reactions (Respect/Strength/Inspiration)
- **SOCL-04**: Movement milestones auto-post
- **SOCL-05**: Career path (Promoter -> Ambassador -> Temple Talent)

### Online Model

- **ONLN-01**: Freemium access with premium gate
- **ONLN-02**: Payment gateway integration (Mercado Pago/Stripe)
- **ONLN-03**: Video submission for online level evaluations

## Out of Scope

| Feature                               | Reason                                      |
| ------------------------------------- | ------------------------------------------- |
| Payment gateway (Mercado Pago/Stripe) | v6.0+ — build with online model when needed |
| Physical merch store                  | Start digital rewards, add physical later   |
| Multi-tenancy / SaaS                  | Not a goal — El Templo only                 |
| DeportNet import                      | One-time migration, already done            |
| Coach mode in member app              | Coach Console lives in admin app only       |
| Theme picker (dark/light)             | Nice-to-have, maybe later                   |
| Dual brand (Aurea Virtus/Arete)       | Abandoned as gendered concept               |
| APK signing / Play Store              | Deferred from v2.0, pick up later           |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| RSTRC-01    | Phase 45 | Complete |
| RSTRC-02    | Phase 45 | Complete |
| RSTRC-03    | Phase 45 | Complete |
| RSTRC-04    | Phase 45 | Complete |
| RSTRC-05    | Phase 46 | Complete |
| MEMB-01     | Phase 47 | Pending  |
| MEMB-02     | Phase 47 | Pending  |
| MEMB-03     | Phase 47 | Pending  |
| MEMB-04     | Phase 47 | Pending  |
| MEMB-05     | Phase 47 | Pending  |
| MEMB-06     | Phase 47 | Pending  |
| SUBS-01     | Phase 48 | Pending  |
| SUBS-02     | Phase 48 | Pending  |
| SUBS-03     | Phase 48 | Pending  |
| SUBS-04     | Phase 48 | Pending  |
| SUBS-05     | Phase 48 | Pending  |
| PAY-01      | Phase 49 | Pending  |
| PAY-02      | Phase 49 | Pending  |
| PAY-03      | Phase 49 | Pending  |
| PAY-04      | Phase 49 | Pending  |
| ATTN-01     | Phase 50 | Pending  |
| ATTN-02     | Phase 50 | Pending  |
| ATTN-03     | Phase 50 | Pending  |
| ATTN-04     | Phase 50 | Pending  |
| ATTN-05     | Phase 50 | Pending  |
| SCHD-01     | Phase 51 | Pending  |
| SCHD-02     | Phase 51 | Pending  |
| SCHD-03     | Phase 51 | Pending  |
| SCHD-04     | Phase 51 | Pending  |
| SCHD-05     | Phase 51 | Pending  |
| SCHD-06     | Phase 51 | Pending  |
| ANLT-01     | Phase 52 | Pending  |
| ANLT-02     | Phase 52 | Pending  |
| ANLT-03     | Phase 52 | Pending  |
| ANLT-04     | Phase 52 | Pending  |

**Coverage:**

- v4.0 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---

_Requirements defined: 2026-03-08_
_Last updated: 2026-03-08 after roadmap creation — all 32 requirements mapped to phases 45-52_
