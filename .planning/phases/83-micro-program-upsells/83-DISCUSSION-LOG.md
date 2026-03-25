# Phase 83: Micro-Program Upsells - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 83-micro-program-upsells
**Areas discussed:** Program definition & catalog, Upsell CTA triggers & placement, Purchase flow, Admin management, AURA integration, Content types detail, Personalizadas interaction, Offline/empty states

---

## Program Definition & Catalog

### What does a micro-program contain?

| Option                | Description                                                                                                                                            | Selected |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Structured guide      | Curated guide with objectives, exercises, tips — supplement not replacement                                                                            |          |
| Own training sessions | SPOM-generated sessions that replace/run alongside regular plan                                                                                        |          |
| Video series          | Series of video lessons, purely educational                                                                                                            |          |
| **User's answer**     | Two upsell tiers: Personalizadas (~20K, personalized sessions) and Personalizadas+Coaching (~50K, sessions + coach companion via calls/messages/video) | ✓        |

**Notes:** Micro-programs are upsell tiers on top of existing subscription, not standalone content programs.

### How should catalog present tiers?

| Option                | Description                                               | Selected |
| --------------------- | --------------------------------------------------------- | -------- |
| Dedicated upsell page | New 'Experiencias a Medida' page with both tiers as cards | ✓        |
| Inline on Mi Camino   | Promotional cards within Tu Dia flow                      |          |
| Simple locked badge   | Minimal locked section                                    |          |

**User's choice:** Dedicated page, but specifically sends to PlanesPage section "Experiencias a Medida"

### Fixed tiers or configurable?

| Option                | Description                         | Selected |
| --------------------- | ----------------------------------- | -------- |
| Two fixed tiers       | Hard-code the two offerings         |          |
| Configurable programs | Admin can create arbitrary programs | ✓        |

### Program fields

| Option                | Description                                                      | Selected |
| --------------------- | ---------------------------------------------------------------- | -------- |
| Core fields only      | Name, description, price, duration, included list, status, order |          |
| Core + targeting      | + segment/goal targeting, minimum sessions                       |          |
| Core + content blocks | + structured content blocks (video, PDF, weekly objectives)      | ✓        |

### Coaching tracking

| Option           | Description                                           | Selected |
| ---------------- | ----------------------------------------------------- | -------- |
| Outside the app  | Coaching via WhatsApp/calls, app shows tier is active | ✓        |
| Light tracking   | Track coach assignments + interaction log             |          |
| In-app messaging | Build chat feature                                    |          |

### Content consumption model

| Option            | Description                                                                                     | Selected |
| ----------------- | ----------------------------------------------------------------------------------------------- | -------- |
| Weekly unlock     | Content organized by week, unlocks when week starts                                             |          |
| All at once       | All content available immediately                                                               |          |
| Progress-gated    | Unlock based on session completion                                                              |          |
| **User's answer** | Hybrid: weekly organization + session gating (X sessions → next week unlocks when week arrives) | ✓        |

### Content types

| Option              | Description               | Selected |
| ------------------- | ------------------------- | -------- |
| Video embed         | YouTube/Vimeo embed       | ✓        |
| Text/markdown       | Rich text content         | ✓        |
| PDF attachment      | Downloadable guides       | ✓        |
| Exercise references | Links to exercise library | ✓        |

**Notes:** All four types supported.

### Catch-up on missed sessions

| Option           | Description                                              | Selected |
| ---------------- | -------------------------------------------------------- | -------- |
| Catch up allowed | Complete sessions later, next week unlocks retroactively | ✓        |
| Grace period     | 3-day grace period                                       |          |
| Strict lockout   | Miss sessions, miss content                              |          |

### Sessions per week threshold

| Option                   | Description                      | Selected |
| ------------------------ | -------------------------------- | -------- |
| Configurable per program | Admin sets threshold per program | ✓        |
| Fixed at plan budget     | Uses subscription plan days      |          |
| Fixed at 3               | All programs require 3/week      |          |

### Program progress view

| Option              | Description                                     | Selected |
| ------------------- | ----------------------------------------------- | -------- |
| Program detail page | Full page with week timeline, progress, content |          |
| Inline on Tu Dia    | Summary card, tap to expand                     | ✓        |
| Both                | Detail page + Tu Dia card                       |          |

**Notes:** Card on Tu Dia is expandable in-place via toggle button to reveal content blocks.

### Tu Dia placement

**User's choice:** Below check-in cards. Also: weekly progress bar removed for regular users, only micro-program members see it.

### Content rendering in expanded card

**User's choice:** No inline video. Compact buttons/links to PDFs, exercises, texts. Opens in appropriate viewer.

### Concurrency

| Option           | Description                   | Selected |
| ---------------- | ----------------------------- | -------- |
| One at a time    | One active program per member | ✓        |
| Multiple allowed | Stack programs independently  |          |

### Program expiry

| Option                   | Description                                | Selected |
| ------------------------ | ------------------------------------------ | -------- |
| Content stays accessible | Unlocked content viewable indefinitely     |          |
| Content expires          | Content locked after program ends          |          |
| Renewable                | Can renew for another cycle, fresh unlocks | ✓        |

### Non-enrolled preview on PlanesPage

| Option               | Description                                                      | Selected |
| -------------------- | ---------------------------------------------------------------- | -------- |
| Rich preview card    | Card with name, description, duration, price, included list, CTA | ✓        |
| Teaser + detail page | Minimal card, tap for full detail                                |          |
| Locked content peek  | Blurred Week 1 content                                           |          |

### Social proof

| Option           | Description                          | Selected |
| ---------------- | ------------------------------------ | -------- |
| None for v1      | No enrollment counts or testimonials | ✓        |
| Enrollment count | Show active member count             |          |

---

## Upsell CTA Triggers & Placement

### Trigger points

**User's choice:** Permanent CTA card on Mi Camino/Tu Dia. No contextual triggers (post-session, post-milestone).

### CTA card placement on Tu Dia

| Option            | Description                 | Selected |
| ----------------- | --------------------------- | -------- |
| Below check-ins   | After check-in cards        | ✓        |
| After session CTA | Below session/booking cards |          |
| Bottom of Tu Dia  | Last card                   |          |

### Additional contextual CTAs

| Option                        | Description                        | Selected |
| ----------------------------- | ---------------------------------- | -------- |
| Post-session + post-milestone | Extra CTAs at high-intent moments  |          |
| Just the permanent card       | Tu Dia card + PlanesPage is enough | ✓        |
| Post-session only             | Only after session completion      |          |

### Segment-aware messaging

| Option                  | Description                 | Selected |
| ----------------------- | --------------------------- | -------- |
| Same for everyone       | One card design for all     |          |
| Segment-aware messaging | Card copy adapts by segment | ✓        |

**Notes:** Specific copy per segment confirmed (see CONTEXT.md D-10).

### CTA card dismissal

| Option                    | Description                    | Selected |
| ------------------------- | ------------------------------ | -------- |
| Always visible            | Permanent, no dismiss          | ✓        |
| Dismissable with cooldown | X button, returns after 7 days |          |

### CTA card copy

**User's choice:** Approved defaults for all 6 segments.

### CTA card tap action

**User's choice:** Always direct to WhatsApp purchase flow (not PlanesPage).

### CTA card style

| Option                   | Description                        | Selected |
| ------------------------ | ---------------------------------- | -------- |
| Same style               | Consistent with other Tu Dia cards |          |
| Accent/promotional style | Subtle gradient/accent border      | ✓        |

### Enrolled member state

| Option                    | Description                            | Selected |
| ------------------------- | -------------------------------------- | -------- |
| Replaced by progress card | CTA slot becomes program progress card | ✓        |
| Both visible              | CTA + progress card                    |          |

### WhatsApp deep link params

**User's choice:** All four: member ID, segment, source identifier, pre-filled greeting.

### PlanesPage program card action

**User's choice:** Follow existing WhatsApp button pattern, replace icon with WhatsApp icon.

### WhatsApp number

| Option                | Description                       | Selected |
| --------------------- | --------------------------------- | -------- |
| Single central number | One number, bot routes internally | ✓        |
| Per-branch number     | Each branch has own number        |          |

---

## Purchase Flow

### How member gets enrolled

**User's choice:** Payment by transfer. Admin confirms payment is correct, then confirmation triggers enrollment.

### Activation speed

**User's choice:** Immediate on next app open + push notification (Phase 84 dependency).

### Billing model

**User's choice:** Separate enrollment record, independent of subscription but gated by active base subscription. When subscription expires, NOTHING accessible.

### Program start date

| Option               | Description                      | Selected |
| -------------------- | -------------------------------- | -------- |
| From enrollment date | Week 1 starts day admin confirms | ✓        |
| Next Monday          | Clean weekly cycles              |          |
| Admin-configured     | Custom start date                |          |

### Renewal flow

**User's choice:** Auto-prompt 7 days before expiry (badge on card + WhatsApp CTA). If no renewal by expiry, admin can re-enroll manually later.

### Expired program state

| Option               | Description                                 | Selected |
| -------------------- | ------------------------------------------- | -------- |
| CTA card returns     | Reverts to upsell CTA, content locked       | ✓        |
| Expired program card | Shows expired card with renewal CTA         |          |
| No card              | Card disappears, CTA returns after cooldown |          |

### Early cancellation

| Option                  | Description                        | Selected |
| ----------------------- | ---------------------------------- | -------- |
| Admin-only cancellation | Member contacts WhatsApp/reception | ✓        |
| Self-service cancel     | Member cancels from app            |          |

### Enrollment history

| Option                  | Description                                       | Selected |
| ----------------------- | ------------------------------------------------- | -------- |
| Full history            | Records never deleted, status transitions tracked | ✓        |
| Current enrollment only | Only active enrollment stored                     |          |

---

## Admin Management

### Navigation

| Option                   | Description                            | Selected |
| ------------------------ | -------------------------------------- | -------- |
| New section under Planes | Sub-section/tab within Planes page     | ✓        |
| Dedicated page           | New top-level nav item                 |          |
| Inside member detail     | Split between member detail and Planes |          |

### Permissions

| Option                       | Description                        | Selected |
| ---------------------------- | ---------------------------------- | -------- |
| Admin + Owner only           | Coaches/receptionists view only    |          |
| Admin + Owner + Coach        | Coaches can manage enrollments     | ✓        |
| Everyone view, admin manages | All roles see, only admin modifies |          |

### Program creation form

| Option      | Description                                    | Selected |
| ----------- | ---------------------------------------------- | -------- |
| All at once | Single form with all fields                    |          |
| Two-step    | Shell then content separately                  |          |
| Wizard flow | Multi-step: info → pricing → content → publish | ✓        |

### Content block editor

| Option               | Description                         | Selected |
| -------------------- | ----------------------------------- | -------- |
| Simple list per week | List with add button, type selector | ✓        |
| Rich text editor     | WYSIWYG per week                    |          |
| Template-based       | Pre-defined content slots           |          |

### Admin preview

| Option            | Description          | Selected |
| ----------------- | -------------------- | -------- |
| No preview for v1 | Trust the format     | ✓        |
| Basic preview     | Simplified rendering |          |

### Enrollment flow

| Option                  | Description                             | Selected |
| ----------------------- | --------------------------------------- | -------- |
| From member detail page | Programas section with Inscribir button | ✓        |
| From program management | Enrolled members list with add          |          |
| Both                    | Two entry points                        |          |

### Enrollment dialog

| Option       | Description                                            | Selected |
| ------------ | ------------------------------------------------------ | -------- |
| Dialog form  | Program selector, payment amount, method, confirmation | ✓        |
| Inline form  | Form on member detail page                             |          |
| Quick action | Select program, confirm (no payment fields)            |          |

### Analytics

**User's choice:** Basic tab on existing analytics page (enrollments, active, completed).

### Edit policy

| Option               | Description                                                           | Selected |
| -------------------- | --------------------------------------------------------------------- | -------- |
| Edit with limits     | Edit name/description/price/future content, not duration/past content | ✓        |
| No edits when active | Lock when enrolled                                                    |          |
| Full edits           | Edit anything anytime                                                 |          |

### Manual override

| Option          | Description             | Selected |
| --------------- | ----------------------- | -------- |
| Simple override | "Avanzar semana" button | ✓        |
| No overrides    | Automatic only          |          |

### Deactivation

| Option                      | Description                                      | Selected |
| --------------------------- | ------------------------------------------------ | -------- |
| Active enrollments continue | Stop new enrollments, existing run to completion | ✓        |
| All enrollments end         | Immediately end all                              |          |

### Enrollment detail view

| Option                        | Description                                               | Selected |
| ----------------------------- | --------------------------------------------------------- | -------- |
| Progress overview             | Name, dates, current week, sessions/week, status, actions | ✓        |
| Progress + content access log | + log of viewed content                                   |          |
| Minimal status                | Just name, status, dates                                  |          |

### History visibility

| Option            | Description                          | Selected |
| ----------------- | ------------------------------------ | -------- |
| List below active | Active at top, history section below | ✓        |
| Separate tab      | Current and history on separate tabs |          |

---

## Additional Gray Areas

### AURA integration

| Option                  | Description                             | Selected |
| ----------------------- | --------------------------------------- | -------- |
| Weekly completion bonus | +15 AURA/week + bigger completion bonus | ✓        |
| Program completion only | Lump sum on finish                      |          |
| No program AURA         | Rely on session/streak AURA             |          |

**Notes:** Both weekly (default 15) and completion (default 100) bonuses configurable per program.

### Video hosting

**User's choice:** R2-hosted exercise videos (existing infrastructure). NOT YouTube. Content blocks reference exercises by ID.

### Exercise references

| Option                       | Description                           | Selected |
| ---------------------------- | ------------------------------------- | -------- |
| Direct exercise ID reference | Reference by ID, show name + R2 video | ✓        |
| Text description only        | Describe exercise in text             |          |
| Defer exercise refs          | Only after Phase 85                   |          |

### Personalizadas interaction

| Option                            | Description                                   | Selected |
| --------------------------------- | --------------------------------------------- | -------- |
| Enrollment enables Personalizadas | Program enrollment IS the Personalizadas gate | ✓        |
| Separate systems                  | Independent tracking                          |          |
| Subscription upgrade              | Auto-upgrade subscription on enrollment       |          |

### Edge states

| Option                | Description                                                                                       | Selected |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Graceful defaults     | Hide when empty, "Proximamente" for no content, "Ya estas inscripto" when enrolled in only option | ✓        |
| Always show something | Show teaser even with no programs                                                                 |          |

---

## Claude's Discretion

- Data model architecture (tables, relations, indexes)
- API endpoint design and route structure
- Migration strategy for existing Personalizadas gating
- WhatsApp deep link encoding format
- AURA source type naming
- Wizard component architecture
- Content block rendering components
- Subscription expiry detection logic

## Deferred Ideas

- WhatsApp bot behavior for program selection conversation
- Push notification on enrollment (Phase 84)
- Admin preview of member-facing view
- Social proof / enrollment counts
- Segment-aware program recommendation
- In-app payment integration
- Advanced analytics (completion rates, revenue, churn)
