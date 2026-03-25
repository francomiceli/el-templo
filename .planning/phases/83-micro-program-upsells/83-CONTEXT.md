# Phase 83: Micro-Program Upsells ("Experiencias a Medida") - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Create admin-configurable purchasable micro-programs (starting with two tiers: Personalizadas and Personalizadas+Coaching) with structured content blocks organized by week, session-gated weekly unlocks, and a WhatsApp-mediated purchase flow. Member app shows a permanent segment-aware CTA card on Tu Dia (below check-ins) for non-enrolled members, an expandable progress card for enrolled members, and an "Experiencias a Medida" section on PlanesPage. Admin creates programs via wizard flow, enrolls members via dialog on member detail page, and sees basic program analytics. Program enrollment IS the gate for Personalizadas session access. Weekly progress bar removed for regular users — only program-enrolled members see weekly progress.

</domain>

<decisions>
## Implementation Decisions

### Program Definition

- **D-01:** Micro-programs are upsell tiers layered on top of the member's existing subscription. The two initial tiers: Personalizadas (~20K extra, personalized SPOM sessions) and Personalizadas+Coaching (~50K extra, personalized sessions + coach companion via calls/messages/video outside the app).
- **D-02:** Programs are admin-configurable — the two tiers are just the first entries. Admin can create arbitrary programs with custom names, descriptions, pricing, duration, and content.
- **D-03:** Programs have structured content blocks organized by week. Supported content types: video (R2-hosted exercise videos, NOT YouTube), text/markdown, PDF attachment, exercise references (by ID from existing exercises table — shows name + R2 video).
- **D-04:** Weekly unlock with session gating: content organized by week, next week unlocks only when (a) the member completed X sessions that week (configurable per program) AND (b) the calendar week has arrived.
- **D-05:** Catch-up allowed — if member completes required sessions later, next week unlocks retroactively. Program extends naturally.
- **D-06:** One program at a time — member can only have one active micro-program. Must complete, expire, or cancel before enrolling in another.
- **D-07:** Renewable — after program ends, member can renew for another cycle with fresh weekly unlocks. Content from previous cycles stays accessible (gated by active subscription).
- **D-08:** Program enrollment IS the Personalizadas gate — enrolling in a Personalizadas-tier program enables personalized sessions for that member. The micro-program system becomes the access control mechanism for Personalizadas.

### Tu Dia Integration (Member App)

- **D-09:** Non-enrolled members: permanent CTA card on Tu Dia below check-in cards with accent/promotional visual style (subtle gradient or accent border). Links directly to WhatsApp purchase flow.
- **D-10:** CTA card is segment-aware with different messaging:
  - Espartano: "Potencia tu entrenamiento con un plan a medida"
  - Intermitente: "Entrena con un plan disenado para vos"
  - En Riesgo: "Retoma con un plan personalizado"
  - Nuevo Guerrero: "Acelera tu progreso con un plan a medida"
  - Digital Warrior: "Tu proximo paso: un plan personalizado"
  - Ghost: "Volve con un plan disenado para vos"
- **D-11:** CTA card is always visible for non-enrolled members — no dismiss button, no cooldown. It's an integral part of the page.
- **D-12:** No contextual CTAs at other moments (post-session, post-milestone). Just the permanent Tu Dia card + PlanesPage catalog.
- **D-13:** Enrolled members: CTA card slot is replaced by expandable program progress card. Shows "Semana X de Y", sessions done this week (e.g., "2/3"), progress bar. Toggle button expands the card in-place to reveal the current week's content blocks as compact buttons/links (PDFs, exercises, text — no inline video embeds).
- **D-14:** Program progress card placed below check-in cards (same slot as CTA card for non-enrolled).
- **D-15:** Weekly progress bar removed for regular users — only micro-program enrolled members see weekly progress (inside their program card).
- **D-16:** Renewal prompt: 7 days before program expiry, the progress card gets an accent badge "Tu experiencia vence en X dias — Renova". Tapping badge opens WhatsApp.
- **D-17:** On program expiry without renewal: CTA card returns (as if never enrolled). All content locked.

### PlanesPage Catalog

- **D-18:** New "Experiencias a Medida" section on existing PlanesPage. Rich preview cards showing: program name, short description, duration, price, what's included list, and a WhatsApp icon button (follows existing PlanesPage WhatsApp button pattern for regular plans).
- **D-19:** No social proof for v1 (no enrollment counts, no testimonials).

### WhatsApp Purchase Flow

- **D-20:** Purchase is WhatsApp-mediated via bot. CTA card and PlanesPage WhatsApp button open a wa.me link with encoded deep link.
- **D-21:** Deep link params: member ID, segment, source identifier (e.g., "tu_dia_cta" or "planes_page"), pre-filled greeting message. Bot matches phone number to member and has full context.
- **D-22:** Single central WhatsApp number for all branches. Bot handles routing internally.
- **D-23:** Bot behavior for program selection and purchase flow deferred to separate WhatsApp bot discussion.
- **D-24:** Payment by transfer. Admin confirms payment is correct in admin panel, which triggers enrollment.

### Enrollment & Billing

- **D-25:** Separate enrollment record (new table: program_enrollments). Independent of regular subscription but gated by active base subscription.
- **D-26:** When base subscription expires, NOTHING is accessible (content, progress — all locked). Must renew subscription first.
- **D-27:** Week 1 starts from enrollment date (day admin confirms payment).
- **D-28:** Enrollment history preserved — records are never deleted. Status transitions: active -> completed/expired/cancelled. Admin sees full history per member.
- **D-29:** Admin-only cancellation — member contacts WhatsApp/reception, admin deactivates enrollment.
- **D-30:** On expiry without renewal: auto-prompt 7 days before (badge on card + WhatsApp CTA). If no renewal by expiry, admin can re-enroll manually later.

### AURA Integration

- **D-31:** Weekly completion bonus: configurable per program, default +15 AURA per completed week.
- **D-32:** Program completion bonus: configurable per program, default +100 AURA on finishing the full program.
- **D-33:** Uses existing AURA ledger system with new source types for program bonuses.

### Admin Management

- **D-34:** Program management lives under Planes page as new "Experiencias a Medida" sub-section/tab.
- **D-35:** Permissions: Admin + Owner can create/edit programs. Admin + Owner + Coach can manage enrollments (coaches can enroll members they coach).
- **D-36:** Program creation via wizard flow: basic info (name, description) -> pricing (price, duration weeks, sessions/week to advance) -> content per week (simple list with add button, select type, fill details) -> publish.
- **D-37:** Content block editor: simple list per week. Admin clicks "Agregar contenido", selects type (video/text/PDF/exercise), fills in details. Reorder via drag/arrows.
- **D-38:** No admin preview of member-facing view for v1.
- **D-39:** Enrollment from member detail page: new "Programas" section showing current/past enrollments. "Inscribir" button opens dialog with: program selector, payment amount (pre-filled), payment method, payment confirmation checkbox.
- **D-40:** Basic program analytics as new tab on existing analytics page: total enrollments, active enrollments, completed count.
- **D-41:** Edit policy: admin can edit name, description, price (for future enrollments), and add content to future weeks. Cannot change duration or past weeks' content when active enrollments exist.
- **D-42:** Manual override: admin can manually advance a member to the next week ("Avanzar semana" button on enrollment detail).
- **D-43:** Deactivation: deactivated programs stop appearing in catalog/can't get new enrollments, but existing active enrollments run to completion.
- **D-44:** Enrollment detail view on member page: program name, enrollment date, current week, sessions completed per week, weeks unlocked vs total, status, action buttons (advance week, cancel). History section below with past enrollments.

### Edge States

- **D-45:** No programs exist: CTA card hidden on Tu Dia, PlanesPage section hidden.
- **D-46:** Program created but no content: shows in catalog marked "Proximamente".
- **D-47:** Member enrolled in only available program: CTA card becomes progress card, PlanesPage shows "Ya estas inscripto".

### Claude's Discretion

- Data model architecture (separate tables vs extending existing models)
- API endpoint design and route structure
- Migration strategy for existing Personalizadas gating (currently subscription-based)
- WhatsApp deep link encoding format
- AURA source type naming for program bonuses
- Wizard step component architecture in admin
- Content block rendering component design in member app

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data Model

- `el-templo-api/src/db/schema/subscription-plans.ts` — Existing plan/subscription schema, reference for micro-program table design
- `el-templo-api/src/db/schema/aura-transactions.ts` — AURA ledger model, need new source types for program bonuses
- `el-templo-api/src/db/schema/aura-balances.ts` — AURA balance caching
- `el-templo-api/src/db/schema/aura-config.ts` — AURA configuration

### Session Completion & Streaks

- `el-templo-api/src/modules/sessions/routes.ts` — Session completion flow (lines 362-478), integration point for weekly session counting
- `el-templo-api/src/modules/streaks/service.ts` — Streak service with plan-aware logic, reference for session counting patterns
- `el-templo-api/src/modules/aura/service.ts` — AURA award/spend service, extends with program bonus source types

### Member App - Tu Dia

- `el-templo-app/src/modules/plan/pages/MiCamino.vue` — Tu Dia home page, integration point for CTA/progress card
- `el-templo-app/src/modules/plan/pages/PlanesPage.vue` — Existing planes page with WhatsApp CTA pattern, add Experiencias section
- `el-templo-app/src/modules/onboarding/components/OnboardingResult.vue` — AURA celebration/reward display pattern

### Admin App

- `el-templo-admin/src/pages/PlanesPage.vue` — Admin plan management, reference for program CRUD
- `el-templo-admin/src/components/PlanFormDialog.vue` — Dialog form pattern for enrollment dialog

### Prior Phase Context

- `.planning/phases/78-onboarding-user-profiling/78-CONTEXT.md` — Member profiles (goal, experience, focus, motivation)
- `.planning/phases/79-behavioral-segmentation/79-CONTEXT.md` — Segment system (drives CTA messaging)
- `.planning/phases/80-tu-dia-daily-game-plan/80-CONTEXT.md` — Tu Dia card architecture and ordering
- `.planning/phases/81-streaks-engagement-mechanics/81-CONTEXT.md` — Streak milestones and AURA rewards pattern
- `.planning/phases/82-progressive-profiling-check-ins/82-CONTEXT.md` — Check-in cards (placement reference)

### Requirements

- `.planning/REQUIREMENTS-v4.4.md` — ENG-18 through ENG-21 (upselling requirements)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **AURA service** (`el-templo-api/src/modules/aura/service.ts`): Mature ledger-based economy with award/spend methods. Extend with new source types (`program_week_completion`, `program_completion`).
- **WhatsApp pattern** (`el-templo-app/src/modules/plan/pages/PlanesPage.vue`): Existing `wa.me` deep link with URL-encoded messages. Extend with member ID, segment, source params.
- **PlanFormDialog pattern**: Dialog-based CRUD for enrollments follows existing admin pattern.
- **R2 video hosting**: Existing exercise videos on Cloudflare R2. Content blocks reference exercises by ID to get video URLs.
- **Exercises table**: Existing exercises with R2 video URLs, referenceable from content blocks without Phase 85.

### Established Patterns

- **Pinia composition stores** for frontend state management
- **Fastify route modules** with service layer for API
- **QTable + dialog form** pattern for admin CRUD
- **Quasar cards** for member app UI components
- **Drizzle ORM** for schema definition and migrations

### Integration Points

- **Tu Dia card stack** (MiCamino.vue): New card slot below check-ins for CTA/progress card
- **PlanesPage**: New section for Experiencias a Medida catalog
- **Session completion chain**: Count sessions per week for program progression
- **Member detail page** (admin): New Programas section for enrollment management
- **Analytics page** (admin): New tab for program analytics
- **Subscription gating**: Program enrollment replaces/extends current Personalizadas access control

</code_context>

<specifics>
## Specific Ideas

- Weekly progress bar removed for regular users — only micro-program enrolled members see it (inside program card)
- Program progress card is expandable in-place (toggle, not navigation) to show week's content as buttons/links
- CTA card uses accent/promotional style (gradient/accent border) to distinguish from regular Tu Dia cards
- Exercise content blocks reference existing exercises by ID — shows name + R2 video without needing Phase 85 (Guia)
- Segment CTA copy confirmed in Spanish (see D-10)
- Renewal badge approach: accent badge on existing progress card, not a separate card

</specifics>

<deferred>
## Deferred Ideas

- WhatsApp bot behavior for program selection and enrollment conversation (separate WhatsApp bot project)
- Push notification on enrollment (depends on Phase 84)
- Admin preview of member-facing program view
- Social proof / enrollment counts on program cards
- Segment-aware program recommendation (showing most relevant program per member profile)
- In-app payment integration (future, currently WhatsApp + transfer)
- Program analytics beyond basic counts (completion rates, revenue tracking, churn)

</deferred>

---

_Phase: 83-micro-program-upsells_
_Context gathered: 2026-03-25_
