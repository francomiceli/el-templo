# Phase 59: Schema Extensions & Data Import - Context

**Gathered:** 2026-03-14
**Status:** In progress — 4/7 areas discussed, 3 remaining (Admin UI for new fields, Legacy plan creation strategy, Import ordering & idempotency)

<domain>
## Phase Boundary

Add documentType and address fields to the users table, import 5 branch CSV datasets (~5,755 members across alem, constitucion, jujuy, mogotes, moreno), create subscription records where plan names match, and enable admin editing of new fields.

Requirements: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, MEMBER-04

</domain>

<decisions>
## Implementation Decisions

### CSV Field Mapping

- **Celular → phone** (Teléfono discarded entirely)
- **Tipo de documento → documentType** — enum: DNI, Pasaporte, NIE, NIF, Otro. Default to DNI when blank (~60% are blank)
- **Número de documento → dni** (already exists in users table with unique constraint)
- **Domicilio → address** (new field on users table)
- **Sexo → gender** mapping: Masculino→male, Femenino→female
- **Fecha de nacimiento → dateOfBirth** (DD/MM/YYYY parsing)
- **Fecha de ingreso → createdAt** (preserves real gym join date, not import timestamp)
- **Activo → isActive** (Si→true, No→false) — import ALL members, respect their active/inactive status
- **Observaciones → member_notes entry** with author "Sistema (importación)" — non-blank only
- **Creador del legajo → store it** (admin people, will link names to accounts when those are created later)
- **Número tarjeta → discard** (legacy gym card number, no operational value)
- **Blank emails (6 total, 0 active) → skip those rows**, don't make email nullable
- **Passwords → known temp password** for all imported accounts (e.g., 'eltemplo2026'). Members can't log in until they're told the password or admin triggers password reset.

### Duplicate & Conflict Handling

- **~120 cross-branch duplicates** (same DNI in multiple branch CSVs) — these are members who switched branches, not multi-branch plan holders
- **Branch assignment for duplicates: active branch wins** — if active in one branch and inactive in another, use the active branch. If active in multiple (3 cases) or inactive in all (98 cases), use most recent Fecha de ingreso
- **Data merging for duplicates:** merge best data — for each field, prefer non-blank value. If both CSVs have a value, prefer the active branch's version. Observaciones from all branches combined into one note
- **No deletion of existing DB records** — use UPSERT (INSERT ... ON DUPLICATE KEY UPDATE) by DNI/email
- **Mark orphans:** after import, mark pre-existing members NOT found in any CSV as 'imported=false' so admin can identify and clean up fake test accounts

### Subscription Linking

- **~90 unique legacy plan names** in CSVs vs 6 current plans (Flex, Flex+, Foundation, Foundation+, Performance, Sesión de Prueba)
- **366 active members match current plans** (FLEX, FLEX PLUS, FOUNDATION, FOUNDATION PLUS, PERFORMANCE, Sesión de Prueba) → create proper subscription records linked to real plans, using CSV's Vencimiento as expiry date
- **303 active members have legacy plan names** (PROGRAMA 3 MESES: 177, PROGRAMA 6 MESES: 110, MES INDIVIDUAL: 7, MEMBRESÍA ANUAL: 4, etc.) → create ALL legacy plans as archived subscription_plan records, link subscriptions to them, flag active users with legacy plans for team discussion
- **Create subscriptions for ALL members with a plan name** (both active and inactive) — inactive ones get expired/cancelled subscription records. Preserves full subscription history.

### Import Execution Strategy

- **Run on server** — deploy as part of API codebase, SSH into server, run with NODE_ENV=production. Same pattern as seed-production.ts. CSV files bundled with the build.
- **Dry-run mode by default** — parses all CSVs, resolves duplicates, maps plans, prints summary. Pass --execute to actually write to DB.
- **No deletion** — UPSERT approach, zero data loss risk
- **Console summary + JSON report** — print stats to console (created/updated/skipped/merged counts), write detailed JSON report file with per-member results for audit
- **Safety gate:** CONFIRM_IMPORT=yes env var required for --execute in production

### Claude's Discretion

- Exact migration SQL and field types (varchar lengths for address, enum implementation for documentType)
- CSV parsing library choice
- UPSERT implementation details (ON DUPLICATE KEY UPDATE strategy)
- JSON report file format and location
- Orphan marking implementation (new boolean column vs report-only)
- How to bundle CSV files in the build

</decisions>

<specifics>
## Specific Ideas

- Legacy plan names should be created as archived subscription_plan records — team will decide what to do with active members on legacy plans
- Creador del legajo names will be linked to admin accounts later (not coaches — admin staff)
- Known temp password approach chosen for simplicity — members will be informed separately
- The 6 rows with blank email are all inactive, safe to skip entirely

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `seed-production.ts`: Pattern for production scripts with safety gate (CONFIRM_PRODUCTION_SEED=yes)
- `MemberFormDialog.vue`: QStepper dialog with expansion sections — add documentType and address fields
- `MemberProfileTab.vue`: Read-only profile display — add new fields
- `memberService.updateMember()`: Partial update pattern — extend with new fields
- `memberService.checkDniUniqueness()`: DNI validation — reuse for import duplicate detection
- Migration pattern: SQL files in `src/db/migrations/` with `_migrations` tracking table

### Established Patterns

- Drizzle schema in `src/db/schema/users.ts` — add documentType and address columns
- Constructor DI pattern for services (Phase 56)
- Idempotent seed scripts with ON DUPLICATE KEY UPDATE (Phase 58)
- Member CRUD through `src/modules/members/` (service, routes, schemas, types)

### Integration Points

- `el-templo-api/src/db/schema/users.ts`: Add documentType (enum) and address (varchar) columns
- `el-templo-api/src/modules/members/types.ts`: Add to UpdateMemberInput and MemberProfile types
- `el-templo-api/src/modules/members/schemas.ts`: Add to Fastify validation schemas
- `el-templo-admin/src/components/MemberFormDialog.vue`: Add form fields
- `el-templo-admin/src/components/MemberProfileTab.vue`: Add display fields
- `el-templo-admin/src/types/member.ts`: Add to frontend types
- New migration: 0038 for schema changes
- New import script: `src/db/import-members.ts`

</code_context>

<deferred>
## Deferred Ideas

- Multi-branch member data model (member-branch relationship table) — needed for Phase 60 (Plan Configuration) when multi-branch plans get proper support. Current import assigns one branchId per member using active-branch-wins logic.

</deferred>

---

## Remaining Discussion Areas

3 areas still need discussion before this context is complete:

1. **Admin UI for new fields** — Where documentType and address appear in MemberFormDialog and MemberProfileTab. Field grouping, required vs optional.
2. **Legacy plan creation strategy** — How to create ~90 legacy plans as archived subscription_plan records. Naming, pricing, visibility in admin.
3. **Import ordering & idempotency** — Branch processing order, re-running safely, Creador del legajo linking.

Resume with `/gsd:discuss-phase 59` to continue from these areas.

---

_Phase: 59-schema-extensions-data-import_
_Context gathered: 2026-03-14 (partial)_
