# Roadmap: El Templo Admin App (v2.0)

## Overview

This roadmap delivers the Admin App module for El Templo. The milestone covers:

1. **Session Generation** (Phase 13) - Algorithm review and improvement based on coach examples
2. **Session Management** (Phases 14-16) - Admin UI for reviewing, editing, creating sessions + PDF generation
3. **Mobility Exercises** (Phase 17) - Per-block mobility exercise integration across full stack
4. **Domain Deployment** (Phase 18) - eltemplo.org subdomains, SSL, Nginx, deploy pipeline
5. **Technical Debt** (Phase 19) - Audit and repair accumulated tech debt
6. **APK Handling** (Phase 20) - Android keystore, signing, Play Store submission
7. **Admin Session Creation** (Phase 21) - Build sessions from scratch
8. **Branch Attendance** (Phases 22-24) - Member plans, booking system, and capacity management
9. **Exercise Videos** (Phases 25-27) - Video processing pipeline, hosting, and app integration (independent track)

## Phases

**Phase Numbering:**

- Continues from v1.0 (ended at Phase 12)
- Phase 13+ is v2.0 Admin App work

- [x] **Phase 13: Session Generation Review & Improvement** - Analyze examples, fix difficulty system, validate algorithm
- [x] **Phase 14: Admin Session Review UI** - List pending sessions, approve/reject workflow, session details view
- [x] **Phase 15: Admin Session Editing** - Modify exercises, reps, formats in pending sessions
- [x] **Phase 16: PDF Generation, Format Config & App Exercise Tracking** - PDF session sheets, format parameter config, per-exercise completion
- [x] **Phase 17: Per-Block Mobility Exercises** - Route-based mobility exercise across pipeline, DB, admin, member app, PDF
- [x] **Phase 18: Domain/Subdomain Deployment** - eltemplo.org subdomains, SSL, Nginx, CORS, deploy pipeline for admin app
- [x] **Phase 19: Technical Debt Audit** - Audit and repair accumulated tech debt across codebase
- [ ] **Phase 20: APK Handling** - Android keystore creation, signed release build, Play Store submission
- [ ] **Phase 21: Admin Session Creation** - Build sessions from scratch using exercise database
- [ ] **Phase 22: Branch Attendance Data Model** - Spots, schedules, member plans (awaiting docs)
- [ ] **Phase 23: Admin Member Attendance Management** - Manage bookings, capacity, member plans
- [ ] **Phase 24: Member Booking UI** - Members view availability and reserve training spots
- [ ] **Phase 25: Exercise Video Sourcing & Processing Pipeline** - Web video sourcing + Python pipeline for background removal + Greek silhouette styling
- [ ] **Phase 26: Video Hosting & Content Tooling** - Cloudflare R2 setup, upload scripts, manifest generator
- [x] **Phase 27: App Video Integration** - DB schema, API propagation, frontend DayPlayer wiring

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
**Status**: Complete
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

- [x] 15-01-PLAN.md — Database schema: edit logs, snapshots, format params
- [x] 15-02-PLAN.md — PrescribeService and AdminEditService business logic
- [x] 15-03-PLAN.md — Editing API routes and schemas
- [x] 15-04-PLAN.md — Frontend types and useEditApi composable
- [x] 15-05-PLAN.md — Session edit page with editable block cards and exercise rows
- [x] 15-06-PLAN.md — Exercise swap dialog with filtering
- [x] 15-07-PLAN.md — Budget bar, validation badges, format dropdown, wiring
- [x] 15-08-PLAN.md — Member preview dialog
- [x] 15-09-PLAN.md — Human verification of complete editing workflow

---

### Phase 16: PDF Generation, Format Config & App Exercise Tracking

**Goal**: Generate PDF session sheets for approved sessions matching a provided design template; configure format-specific parameters (rounds, minutes, etc.) for high/medium importance formats during session generation/editing; improve exercise swap UX; implement per-exercise completion tracking in the member app
**Depends on**: Phase 15 (editing infrastructure exists)
**Plans:** 10 plans
**Success Criteria** (what must be TRUE):

1. Button on approved sessions generates a PDF file matching the provided example design
2. Pipeline: example PDF → page images → HTML/CSS skeleton → dynamic session data → final PDF
3. Generated PDF respects the original design while containing session-specific data
4. High and medium importance formats have configurable parameters discussed and set (e.g., rounds for Complex, minutes for AMRAP, intervals for EMOM, etc.)
5. Format parameters are settable during session generation and editing
6. Exercise swap dialog uses category instead of pattern for fewer, cleaner pill selections
7. Member app tracks completion per exercise (not per block)
8. All exercises completed in a block = block complete, auto-advance to next block
9. Exercise completion state reflected consistently across all app views (DayPlayer, Weekly View, etc.)
10. Coach can save an approved session block with a custom name for reuse via "intercambiar bloque" (full block data shown alongside custom name)
11. Inline prescription edits (reps, rest, notes) update without page reload or scroll reset — feedback via green success toast only

Plans:

- [x] 16-01-PLAN.md — FormatParams type system and generation pipeline integration
- [x] 16-02-PLAN.md — Format params editing UI and API endpoint
- [x] 16-03-PLAN.md — Exercise swap UX: category-based filtering
- [x] 16-04-PLAN.md — Inline prescription edit fix (no reload/scroll reset)
- [x] 16-05-PLAN.md — Per-exercise completion: store and composable layer
- [x] 16-06-PLAN.md — Per-exercise completion: UI, API, and cross-view consistency
- [x] 16-07-PLAN.md — Saved blocks for coach reuse
- [x] 16-08-PLAN.md — Client-side PDF generation with pdfmake
- [x] 16-09-PLAN.md — PDF download buttons on sessions page
- [x] 16-10-PLAN.md — End-to-end human verification

---

### Phase 17: Per-Block Mobility Exercises

**Goal**: Add 1 route-based mobility exercise per non-INITIUM block across the full stack — session generation pipeline, DB schema, API response, admin editing UI, member app display, and PDF output
**Depends on**: Phase 16 (session editing and exercise tracking infrastructure)
**Success Criteria** (what must be TRUE):

1. Pipeline selects 1 mobility exercise per non-INITIUM block based on block route via ROUTE_TO_MOBILITY_ROUTES
2. Mobility exercises stored with `exercise_type = 'mobility'` discriminator in session_prescriptions
3. Mobility exercises generated with sensible defaults (reps/seconds) that coaches can edit
4. Admin block cards show mobility exercise in separate "Descanso Activo" section at block end
5. Admin exercise swap dialog shows relevant mobility exercises filtered by block route
6. Coaches can swap mobility exercises (exactly 1 per non-INITIUM block, not removable)
7. Member app DayPlayer shows mobility as separate section at end of block with distinct styling
8. Mobility exercise completion is optional — does not block auto-advance or block completion
9. PDF output populates existing `mobility` field and renders it separately from main exercises
10. All 4 non-INITIUM blocks (NUCLEUS, DEUTEROS_1, DEUTEROS_2, ATHLOS/EPIKOS) get mobility exercises

Plans:

- [x] 17-01-PLAN.md — DB migration + mobility selection pipeline + types
- [x] 17-02-PLAN.md — API response separation + admin mobility endpoints
- [x] 17-03-PLAN.md — Admin UI: Descanso Activo section + swap dialog mobility mode
- [x] 17-04-PLAN.md — Member app display + PDF data population

---

### Phase 18: Domain/Subdomain Deployment

**Goal**: Configure eltemplo.org subdomains (app/admin/api) on EC2 with SSL, fix domain mismatch in codebase, extend deploy pipeline for admin app, update CORS and environment config
**Depends on**: Phase 17 (mobility exercises complete)
**Plans:** 3 plans

Plans:

- [x] 18-01-PLAN.md — Domain mismatch fix (.com->.org), CORS/env config, secrets docs
- [x] 18-02-PLAN.md — Nginx subdomain configs, deploy pipeline admin app build
- [x] 18-03-PLAN.md — Deployment guide update, manual DNS/SSL/secrets setup checkpoint

---

### Phase 19: Technical Debt Audit

**Goal**: Production-robust 3-app ecosystem with zero CVEs, error monitoring, test coverage, CI quality gates, deploy rollback, refactored god objects, structured logging, and automated database backups
**Depends on**: Phase 18 (deployment complete)
**Status**: Complete
**Plans:** 9 plans

Plans:

- [x] 19-01-PLAN.md — Security fixes (CVEs) + .env cleanup + .env.example templates
- [x] 19-02-PLAN.md — Sentry API error monitoring + frontend logger wrappers
- [x] 19-03-PLAN.md — Test infrastructure (Vitest + MySQL) + API integration tests
- [x] 19-04-PLAN.md — CI quality gates (lint/test/audit) + deploy safety (backup/rollback)
- [x] 19-05-PLAN.md — Pre-commit hooks (Husky + lint-staged) + root README
- [x] 19-06-PLAN.md — Refactor DayPlayer.vue god object (900 -> <350 LOC)
- [x] 19-07-PLAN.md — Refactor edit-service.ts god object (1232 -> <350 LOC) + eliminate any types
- [x] 19-08-PLAN.md — Replace console.log with structured logger across all apps
- [x] 19-09-PLAN.md — Database backups + production runbook + external service setup

---

### Phase 20: APK Handling

**Goal**: Create Android signing keystore, build signed release APK/AAB with production HTTPS URLs, submit to Google Play Store
**Depends on**: Phase 18 (production HTTPS URLs required for APK)

Plans:

- [ ] TBD (run /gsd:plan-phase 20 to break down)

---

### Phase 21: Admin Session Creation

**Goal**: Coaches can build sessions from scratch without algorithm
**Depends on**: Phase 19
**Success Criteria** (what must be TRUE):

1. Coach can create new session for any date/level
2. Coach can add blocks with chosen format
3. Coach can search/filter exercise database and add exercises
4. Coach can set prescriptions manually
5. Created sessions follow same approval workflow
6. Templates: save session as template, create from template
7. Copy: duplicate existing session to new date

---

### Phase 22: Branch Attendance Data Model

**Goal**: Data structures for managing branch capacity, schedules, and member plans
**Depends on**: Documentation (awaiting from user)
**Success Criteria** (what must be TRUE):

1. Branch has capacity (max members per time slot)
2. Schedule defines available time slots per branch per day
3. Member plans define attendance allowance (days/week, specific days, etc.)
4. Booking records member reservations for specific slots
5. Database schema supports multi-branch with different capacities/schedules

---

### Phase 23: Admin Member Attendance Management

**Goal**: Admins/coaches can manage member plans and view attendance
**Depends on**: Phase 22 (data model exists)
**Success Criteria** (what must be TRUE):

1. Admin can view branch schedule with current bookings
2. Admin can see capacity utilization per slot
3. Admin can assign/modify member plans
4. Admin can manually add/remove bookings for members
5. Admin can view member attendance history
6. Waitlist management if slot is full

---

### Phase 24: Member Booking UI

**Goal**: Members can view availability and reserve training spots
**Depends on**: Phase 23 (admin management exists)
**Success Criteria** (what must be TRUE):

1. Member sees weekly schedule with available slots
2. Member can book available slot within their plan allowance
3. Member can cancel booking (with cancellation policy)
4. Member sees their upcoming bookings
5. Member sees their plan details (remaining days, restrictions)
6. Push notification for booking confirmation/reminder

---

### Phase 25: Exercise Video Sourcing & Processing Pipeline

**Goal**: Source exercise demonstration videos from the web and transform them into a uniform Greek-themed visual style (bronze silhouette on navy background with cream edge glow) using MediaPipe and FFmpeg
**Depends on**: None (independent, can run in parallel with other phases)
**Success Criteria** (what must be TRUE):

1. Video sourcing tool searches YouTube (curated channels + broad) and stock sites for exercise demos by name
2. Sourcing runs as automated batch job with rate limiting and skip-and-log for missing exercises
3. Python project with MediaPipe Selfie Segmentation for background removal
4. Silhouette styler produces warm golden-bronze figure with cream edge glow on navy background
5. Smart crop detects person and reframes landscape sources to portrait 720x1280
6. Videos normalized to portrait 720x1280, 30fps, H.264, yuv420p, faststart, no audio
7. Auto-trim via movement detection to extract 5-10 second exercise demo clips
8. Batch processing with resume capability (progress.json checkpoints)
9. Pipeline handles 1300+ videos with error tracking, retry, and summary report
10. Thumbnail PNG generated from middle frame for each processed video
11. Output clips loop (hard cut) if source is too short

**Plans:** 5 plans

Plans:

- [ ] 25-01-PLAN.md — Python project setup, MediaPipe segmenter, Greek-themed styler
- [ ] 25-02-PLAN.md — Video sourcing tool (YouTube curated channels + stock sites)
- [ ] 25-03-PLAN.md — Encoder, smart cropper, movement trimmer, single-video processor
- [ ] 25-04-PLAN.md — Batch runner, CLI entry point, progress checkpointing, report
- [ ] 25-05-PLAN.md — End-to-end test and visual QA checkpoint

---

### Phase 26: Video Hosting & Content Tooling

**Goal**: Set up Cloudflare R2 for free video hosting, build manifest generator to map exercises to source videos, and create upload/population scripts
**Depends on**: Phase 25 (processed videos exist to upload)
**Success Criteria** (what must be TRUE):

1. Cloudflare R2 bucket configured with public access and direct MP4 URLs
2. Manifest generator exports all 1300 exercises from DB for source video mapping
3. Upload script batch-uploads processed videos to R2 via S3-compatible API
4. DB population script sets video_url for each exercise based on manifest
5. Incremental workflow supported (process/upload batches, add more later)

Plans:

- [ ] TBD (run /gsd:plan-phase 26 to break down)

---

### Phase 27: App Video Integration

**Goal**: Wire video URLs from the exercises table through the session API to the frontend DayPlayer, replacing the current placeholder with real exercise demonstration videos
**Depends on**: Phase 26 (videos hosted and URLs populated in DB)
**Status**: Complete
**Plans:** 2 plans
**Success Criteria** (what must be TRUE):

1. exercises table has video_url VARCHAR column (migration applied)
2. videoUrl included in ExercisePrescription type and selected in exercise queries
3. Session API response includes videoUrl per exercise prescription
4. DayPlayer.vue currentExerciseVideoUrl computed reads from exercise data
5. VideoPlaceholder shows video when URL exists, placeholder when null
6. Videos autoplay, loop, and display correctly on both web and Capacitor mobile

Plans:

- [x] 27-01-PLAN.md — Add videoUrl to session API response and admin exercise pool queries
- [x] 27-02-PLAN.md — Wire videoUrl through frontend types, DayPlayer video display, and admin video badge

---

## Progress

**Execution Order:**
Phases 14-16 (Session Management) → Phase 17 (Mobility) → Phase 18 (Deployment) → Phase 19 (Tech Debt) → Phase 20 (APK) → Phase 21 (Session Creation) → Phases 22-24 (Branch Attendance)
Phases 25-27 (Exercise Videos) — Independent, can run in parallel

| Phase                                              | Plans Complete | Status         | Completed  |
| -------------------------------------------------- | -------------- | -------------- | ---------- |
| 13. Session Generation Review                      | 8/8            | Complete       | 2026-02-05 |
| 14. Admin Session Review UI                        | 8/8            | Complete       | 2026-02-06 |
| 15. Admin Session Editing                          | 9/9            | Complete       | 2026-02-10 |
| 16. PDF Gen, Format Config & App Exercise Tracking | 10/10          | Complete       | 2026-02-12 |
| 17. Per-Block Mobility Exercises                   | 4/4            | Complete       | 2026-02-12 |
| 18. Domain/Subdomain Deployment                    | 3/3            | Complete       | 2026-02-13 |
| 19. Technical Debt Audit                           | 9/9            | Complete       | 2026-02-14 |
| 20. APK Handling                                   | 0/?            | Not Started    | —          |
| 21. Admin Session Creation                         | 0/?            | Not Started    | —          |
| 22. Branch Attendance Data Model                   | 0/?            | Blocked (docs) | —          |
| 23. Admin Member Attendance                        | 0/?            | Not Started    | —          |
| 24. Member Booking UI                              | 0/?            | Not Started    | —          |
| 25. Exercise Video Processing Pipeline             | 0/?            | Not Started    | —          |
| 26. Video Hosting & Content Tooling                | 3/3            | Complete       | 2026-02-15 |
| 27. App Video Integration                          | 2/2            | Complete       | 2026-02-15 |

### Phase 28: Member App Staging Environment

**Goal:** Full staging environment for all 3 apps on EC2 with separate database, CI/CD pipeline, staging subdomains, and mobile build workflows (Android APK + iOS TestFlight)
**Depends on:** Phase 27
**Plans:** 5 plans

Plans:

- [ ] 28-01-PLAN.md — Staging seed script, Nginx configs, weekly reset script
- [ ] 28-02-PLAN.md — Staging deploy workflow (deploy-staging.yml) + CI branch triggers
- [ ] 28-03-PLAN.md — Android staging APK build workflow + Capacitor/Gradle staging config
- [ ] 28-04-PLAN.md — iOS staging TestFlight build workflow
- [ ] 28-05-PLAN.md — Server/DNS setup checkpoint + end-to-end verification

---

_Roadmap created: 2026-02-04_
_Last updated: 2026-02-15 — Phase 28 planned (5 plans: staging infrastructure, CI/CD, Android APK, iOS TestFlight, verification)_
