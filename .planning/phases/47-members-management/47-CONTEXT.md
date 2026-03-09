# Phase 47: Members Management - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Coaches can fully manage members from el-templo-admin — search/filter the member list (by branch, level, active/inactive), view extended member profiles, create/edit members, deactivate/reactivate accounts, and add internal notes. This phase covers MEMB-01 through MEMB-06.

Subscriptions, payments, attendance, and scheduling are separate phases (48-51). This phase builds the member data foundation they all depend on.

</domain>

<decisions>
## Implementation Decisions

### Member Profile Fields

- Add to users table directly (not a separate member_profiles table): phone, dni, dateOfBirth, gender, emergencyContactName, emergencyContactPhone, emergencyContactRelationship
- DNI is globally unique — enforced at DB level with unique constraint
- Email stays required (NOT NULL) — every member gets an account
- Add `isActive` boolean to users table for deactivation (default true)
- Net-style full field set validated by real gym operations

### Member List

- Columns: name, email, branch, level, status (active/inactive), joined date
- Filters: search by name/email/DNI, filter by branch (dropdown), level (dropdown), status (active/inactive)
- Server-side pagination with QTable
- No "last trained" or subscription columns — those come in later phases when data exists

### Create Member Flow

- Modal/dialog (QDialog) over the member list — not a separate page
- Coach sets a temporary password during creation (member changes later in app)
- Default level: Alfa (coach can change)
- Real-time DNI uniqueness check — debounced API call as coach types, shows warning with existing member's name if duplicate found
- Required fields: firstName, lastName, email, password, dni, phone, branchId
- Optional fields: dateOfBirth, gender, emergencyContact (3 fields)

### Edit Member Flow

- Same modal/dialog as create, pre-filled with current data
- Edit button in the profile header card
- DNI uniqueness re-validated on change (excluding current member)
- Password NOT editable through this form (separate flow if needed later)

### Deactivation

- `isActive` boolean on users table — no enum, just active/inactive
- Deactivate button in profile header card with confirmation dialog
- Deactivated members: can't log into the app, filtered out of "active" list by default, but data preserved
- Reactivate available from the same button (toggles)

### Notes System

- New `member_notes` table: id, userId (FK), authorId (FK to users — the coach/admin), content (text), createdAt, updatedAt
- Timeline display — chronological feed of entries on the Notas tab
- Plain text only — no categories, no tags
- Editable by author (coach who wrote it); admins/superadmins can edit/delete any note
- Each note shows: author name, date/time, text content, edit/delete actions (if authorized)

### Profile Hub Layout

- Header card always visible: member name, branch, level badge (Greek letter), status badge (Activo/Inactivo), Edit button, Deactivate/Reactivate button
- Tabs below header: Perfil | Entrenamiento | Notas
- **Perfil tab**: Read-only display of all profile fields organized in groups (datos personales, sede y nivel, contacto de emergencia). Editing happens through the header Edit button modal.
- **Entrenamiento tab**: Existing journey/training content (active journey, stats, session history) — migrate current AlumnoDetailPage content here
- **Notas tab**: Timeline of internal notes with "Add note" input at top
- Future tabs (Suscripción, Pagos, Asistencia) hidden until those phases ship — no "coming soon" placeholders

### Claude's Discretion

- API module structure (whether to create a dedicated members module or extend existing)
- Exact migration naming and field types (varchar lengths, etc.)
- QDialog form layout and field grouping
- Debounce timing for DNI check
- Notes table indexes
- How to split the existing AlumnoDetailPage into tabs (component extraction)
- Error states and loading patterns

</decisions>

<specifics>
## Specific Ideas

- El-Templo-Net's members CRUD (Hono/PostgreSQL) used as reference for field set and DNI check — features rebuilt in Fastify/MySQL
- Net fields validated by real gym operations: phone, DNI, birthDate, gender, emergencyContact are the proven set
- Modal-based create/edit matches Net's UX pattern and keeps the workflow quick for coaches
- Notes as timeline (not single field) suits multi-coach gym where different coaches interact with the same member across shifts

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `AlumnosPage.vue`: Existing member list with QTable, search, pagination — enhance with branch/level/status filters
- `AlumnoDetailPage.vue`: Existing detail page with journey stats — refactor into tabbed layout, migrate content to Entrenamiento tab
- `useJourneyAdminApi.ts`: Existing composable with getMembers/getMemberDetail — extend or create new composable for member CRUD
- `AdminLayout.vue`: "Alumnos" menu item already wired to /alumnos route

### Established Patterns

- Vue 3 Composition API with `<script setup>` throughout admin app
- QTable with server-side pagination (`@request` handler) for list views
- API composables: export loading/error refs + async methods + cleanup()
- Fastify modules: routes.ts + service.ts + schemas.ts + types.ts with barrel export (index.ts)
- Drizzle schema in `src/db/schema/` with module-prefix naming for new files
- Error handling: `createLogger('PageName')` + `try/catch` with `err instanceof Error`

### Integration Points

- `el-templo-api/src/db/schema/users.ts`: Add new profile fields (phone, dni, etc.) + isActive
- `el-templo-api/src/db/schema/`: New `member-notes.ts` for notes table
- `el-templo-api/src/modules/`: New or extended module for member CRUD + notes endpoints
- `el-templo-admin/src/router/routes.ts`: Routes already exist (/alumnos, /alumnos/:userId)
- `el-templo-admin/src/pages/`: Enhance existing pages, add member form dialog component
- Migration needed for: users table fields + member_notes table + DNI unique constraint

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 47-members-management_
_Context gathered: 2026-03-09_
