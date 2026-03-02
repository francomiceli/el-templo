# Phase 38: Franchise Application Management - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin panel in el-templo-admin for managing franchise applications submitted via eltemplo.org/franquicias. View/filter/sort applications, track status through a pipeline, manage notes, and use a suite of 4 AI agents (powered by Claude API) to generate conversion strategies and outreach documents based on applicant profiles. Agents produce document outputs only — no server side effects.

</domain>

<decisions>
## Implementation Decisions

### Application List

- Card grid layout for the applications list page
- Card info at a glance: Claude's discretion (key qualifying fields)
- Filtering and sorting: Claude's discretion (status, search, and relevant filters)
- Clicking a card navigates to a dedicated detail page (`/franquicias/:id` pattern, like AlumnoDetailPage)

### Status Pipeline

- 4 statuses: `new` → `contacted` → `negotiating` → `closed`
- Free-form transitions: any status can change to any other status (no sequential enforcement)
- Status displayed as colored chips/badges on cards and detail page

### Detail Page

- Full application data displayed
- Simple notes text field for admin to write/update notes
- WhatsApp quick-action button (pre-filled with applicant phone number) + copy-email-to-clipboard button
- Status dropdown to change status freely
- Tabbed AI agent panel (see AI section below)

### Access Control

- Superadmin only — not visible to admin or coach roles
- Route guarded with `meta: { allowedRoles: ['superadmin'] }`

### AI Agent Suite

- **4 agents**, each in its own tab on the detail page:
  1. **Intake/Strategy Agent** — Analyzes investor profile, generates conversion strategy with strengths/risks/approach/talking points
  2. **Outreach Agent** — Drafts personalized first-contact message (WhatsApp/email) based on applicant profile
  3. **Follow-up Agent** — Drafts follow-up messages for non-responsive applicants
  4. **Negotiation Agent** — Generates counter-arguments, pitch points, financial projections tailored to applicant's capital/experience
- **Trigger:** Manual "Generate" button per agent tab
- **Re-generation:** Re-generate button with warning that previous output will be lost
- **AI input:** Original form data only (nombre, email, telefono, ciudadPais, modelo, experiencia, capital, origen, mensaje). Admin notes are NOT sent to the AI
- **AI model:** Best available Claude model (Sonnet 4.6 / Opus), all agents use the same tier
- **Execution:** Server-side — API route in el-templo-api calls Claude API. ANTHROPIC_API_KEY env var on backend. Admin app just hits a POST endpoint
- **System prompt:** Brand-aware — includes El Templo franchise models (activa/pasiva), investment ranges, value propositions, competitor positioning
- **Output format:** Claude's discretion (structured strategy brief recommended)
- **Safety:** Agents produce document/text outputs ONLY. No email sending, no data mutations, no external API calls beyond Claude
- **UI:** Tabbed panel on detail page with tabs: Strategy | Outreach | Follow-up | Negotiation
- **Tutorial:** Inline description per tab explaining what the agent does, what to expect, and tips for best results. No separate help page
- **Separation:** AI-generated content in its own dedicated section/card, separate from manual notes field

### Notifications

- No in-admin alerts or badge counts
- Existing Resend email notification on new applications is sufficient

### Claude's Discretion

- Card grid visual design and information density
- Filter/sort implementation details
- AI output format and structure per agent
- Detail page layout and section ordering
- Loading states and error handling for AI generation

</decisions>

<specifics>
## Specific Ideas

- WhatsApp button should pre-fill with the applicant's phone number for one-click outreach
- AI agents should feel like having a franchise sales consultant available on demand
- The tutorial/inline descriptions should make it clear that agents produce drafts for human review, not automated actions
- Re-generate warning: "This will replace the current strategy. Save any important information elsewhere before regenerating."

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `franchise_applications` DB schema: id, nombre, email, telefono, ciudadPais, modelo, experiencia, capital, origen, mensaje, status, createdAt
- `FranchiseService` class in `el-templo-api/src/modules/franchise/service.ts`: handles application submission and email notification
- `POST /franchise/apply` route already exists
- Admin app has established q-table, q-chip, q-badge, q-select patterns (BlogListPage, AlumnosPage)
- Admin router uses `meta: { allowedRoles: [...] }` for role-based access
- Resend email integration already in franchise service

### Established Patterns

- Admin pages: Quasar q-page with q-pa-md padding, header row with title + action buttons, filter bar, content area
- Admin stores: Pinia composition API (`defineStore` with setup function)
- API modules: FastifyPluginAsync with schema validation, service class pattern
- Error handling: `catch (err: unknown)` with `instanceof Error` checks
- Logging: Fastify Pino logger (request.log, app.log)

### Integration Points

- New admin route: `/franquicias` (list) and `/franquicias/:id` (detail) in admin router
- New API routes needed: GET /franchise/applications (list), GET /franchise/applications/:id (detail), PATCH /franchise/applications/:id (update status/notes), POST /franchise/applications/:id/generate (AI agent)
- Nav item in AdminLayout sidebar for "Franquicias"
- New env var: ANTHROPIC_API_KEY for Claude API access
- DB migration: add `notes` column and `ai_strategy` (or similar) columns to franchise_applications table

</code_context>

<deferred>
## Deferred Ideas

- **Agent-to-agent automated pipeline** — Agents feeding outputs to each other automatically (intake → outreach → follow-up), auto-drafting and auto-following up with minimal human intervention. Build on top of Phase 38's manual agent foundation
- **In-admin notification badges** — Count of "new" applications on the nav item. Skipped for now since email notifications are sufficient
- **Applicant email responses** — Sending emails directly to applicants from the admin panel

</deferred>

---

_Phase: 38-franchise-application-management_
_Context gathered: 2026-03-02_
