# Roadmap: El Templo Admin App (v2.0)

## Overview

This roadmap delivers the Admin App module for El Templo. The milestone covers:
1. **Session Generation** (Phase 13) - Algorithm review and improvement based on coach examples
2. **Session Management** (Phases 14-16) - Admin UI for reviewing, editing, and creating sessions
3. **Branch Attendance** (Phases 17-19) - Member plans, booking system, and capacity management

## Phases

**Phase Numbering:**
- Continues from v1.0 (ended at Phase 12)
- Phase 13+ is v2.0 Admin App work

- [x] **Phase 13: Session Generation Review & Improvement** - Analyze examples, fix difficulty system, validate algorithm
- [x] **Phase 14: Admin Session Review UI** - List pending sessions, approve/reject workflow, session details view
- [ ] **Phase 15: Admin Session Editing** - Modify exercises, reps, formats in pending sessions
- [ ] **Phase 16: Admin Session Creation** - Build sessions from scratch using exercise database
- [ ] **Phase 17: Branch Attendance Data Model** - Spots, schedules, member plans (awaiting docs)
- [ ] **Phase 18: Admin Member Attendance Management** - Manage bookings, capacity, member plans
- [ ] **Phase 19: Member Booking UI** - Members view availability and reserve training spots

## Phase Details

### Phase 13: Session Generation Review & Improvement
**Goal**: Algorithm produces accurate, SPOM-compliant sessions matching coach-built examples
**Depends on**: v1.0 complete (Phase 12)
**Status**: Complete
**Success Criteria** (what must be TRUE):
  1. Dificultad Lineal column added to Ejercicios.csv with correct mappings
  2. Database exercises table updated with linear difficulty values
  3. Each block (Initium, Nucleus, Deuteros 1/2, Athlos/Epikos) has documented specifications
  4. Exercise count capped at 3 for all blocks except Initium
  5. Algorithm uses linear difficulty scale with "nivel superior" mapping to next level
  6. Block difficulty average validated within +/-0.5 of target
  7. Contraction distribution matches Contraccion rules exactly
  8. Algorithm generates valid sessions that follow patterns observed in 19 example weeks

Plans:
- [x] 13-01-PLAN.md — Difficulty System Foundation
- [x] 13-02-PLAN.md — Block Specifications Documentation
- [x] 13-03-PLAN.md — Validation Suite
- [x] 13-04-PLAN.md — Initium Contextual Enhancement
- [x] 13-05-PLAN.md — Algorithm Integration & Final Validation
- [x] 13-06-PLAN.md — HIGH Priority Format Prescribers
- [x] 13-07-PLAN.md — MEDIUM Priority Format Prescribers
- [x] 13-08-SUMMARY.md — Cross-Route Exercise Selection via SPOM pattern_2

---

### Phase 14: Admin Session Review UI
**Goal**: Coaches can view algorithm-generated sessions and approve them for member visibility
**Depends on**: Phase 13 (algorithm produces valid sessions)
**Status**: Complete
**Plans:** 8 plans
**Success Criteria** (what must be TRUE):
  1. Admin dashboard shows list of pending sessions (by week/day)
  2. Sessions have status: pending_review → approved (approve/revert workflow)
  3. Coach can view full session details (blocks, exercises, formats, prescriptions)
  4. Coach can approve session (moves to approved, visible to members)
  5. Coach can swap blocks from approved session pool (deduplicated by fingerprint)
  6. Members only see approved sessions in their Weekly View
  7. Pending count badge and low-sessions alert in admin UI

Plans:
- [x] 14-01-PLAN.md — Database schema extension (status, approval columns, timezone)
- [x] 14-02-PLAN.md — Admin Quasar app scaffold with authentication
- [x] 14-03-PLAN.md — Admin API endpoints (list, approve, revert, bulk)
- [x] 14-04-PLAN.md — Sessions list page with filters and day tabs
- [x] 14-05-PLAN.md — Session detail page with block cards
- [x] 14-06-PLAN.md — Generation page and regeneration with permanent deletion
- [x] 14-07-PLAN.md — Member visibility filter and pending badge
- [x] 14-08-PLAN.md — Human verification of complete workflow

---

### Phase 15: Admin Session Editing
**Goal**: Coaches can modify pending and approved sessions - swap exercises, adjust prescriptions, change formats, add/remove exercises
**Depends on**: Phase 14 (review UI exists)
**Plans:** 9 plans
**Success Criteria** (what must be TRUE):
  1. Coach can swap exercises within a block (from exercise database)
  2. Coach can modify prescription (reps, sets, rest times)
  3. Coach can change block format
  4. Coach can add/remove exercises from a block
  5. Edit history tracked (who changed what, when)
  6. Validation prevents invalid sessions (e.g., wrong contraction mix)
  7. Preview shows how session will appear to members

Plans:
- [ ] 15-01-PLAN.md — Database schema: edit logs, snapshots, format params
- [ ] 15-02-PLAN.md — PrescribeService and AdminEditService business logic
- [ ] 15-03-PLAN.md — Editing API routes and schemas
- [ ] 15-04-PLAN.md — Frontend types and useEditApi composable
- [ ] 15-05-PLAN.md — Session edit page with editable block cards and exercise rows
- [ ] 15-06-PLAN.md — Exercise swap dialog with filtering
- [ ] 15-07-PLAN.md — Budget bar, validation badges, format dropdown, wiring
- [ ] 15-08-PLAN.md — Member preview dialog
- [ ] 15-09-PLAN.md — Human verification of complete editing workflow

---

### Phase 16: Admin Session Creation
**Goal**: Coaches can build sessions from scratch without algorithm
**Depends on**: Phase 15 (editing infrastructure exists)
**Success Criteria** (what must be TRUE):
  1. Coach can create new session for any date/level
  2. Coach can add blocks with chosen format
  3. Coach can search/filter exercise database and add exercises
  4. Coach can set prescriptions manually
  5. Created sessions follow same approval workflow
  6. Templates: save session as template, create from template
  7. Copy: duplicate existing session to new date

---

### Phase 17: Branch Attendance Data Model
**Goal**: Data structures for managing branch capacity, schedules, and member plans
**Depends on**: Documentation (awaiting from user)
**Success Criteria** (what must be TRUE):
  1. Branch has capacity (max members per time slot)
  2. Schedule defines available time slots per branch per day
  3. Member plans define attendance allowance (days/week, specific days, etc.)
  4. Booking records member reservations for specific slots
  5. Database schema supports multi-branch with different capacities/schedules

---

### Phase 18: Admin Member Attendance Management
**Goal**: Admins/coaches can manage member plans and view attendance
**Depends on**: Phase 17 (data model exists)
**Success Criteria** (what must be TRUE):
  1. Admin can view branch schedule with current bookings
  2. Admin can see capacity utilization per slot
  3. Admin can assign/modify member plans
  4. Admin can manually add/remove bookings for members
  5. Admin can view member attendance history
  6. Waitlist management if slot is full

---

### Phase 19: Member Booking UI
**Goal**: Members can view availability and reserve training spots
**Depends on**: Phase 18 (admin management exists)
**Success Criteria** (what must be TRUE):
  1. Member sees weekly schedule with available slots
  2. Member can book available slot within their plan allowance
  3. Member can cancel booking (with cancellation policy)
  4. Member sees their upcoming bookings
  5. Member sees their plan details (remaining days, restrictions)
  6. Push notification for booking confirmation/reminder

## Progress

**Execution Order:**
Phases 14-16 (Session Management) → Phases 17-19 (Branch Attendance)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Session Generation Review | 8/8 | Complete | 2026-02-05 |
| 14. Admin Session Review UI | 8/8 | Complete | 2026-02-06 |
| 15. Admin Session Editing | 0/9 | In Progress | — |
| 16. Admin Session Creation | 0/? | Not Started | — |
| 17. Branch Attendance Data Model | 0/? | Blocked (docs) | — |
| 18. Admin Member Attendance | 0/? | Not Started | — |
| 19. Member Booking UI | 0/? | Not Started | — |

---
*Roadmap created: 2026-02-04*
*Last updated: 2026-02-06 — Phase 15 planned (9 plans in 5 waves)*
