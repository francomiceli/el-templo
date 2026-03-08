# Phase 45: Architecture Foundation - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish explicit module boundaries in the API codebase, create a virtual "Templo Online" branch for online members, and set up AURA transaction ledger + balance tables for tracking from day one. No new API endpoints — just schema, migrations, service layer, and module structure.

</domain>

<decisions>
## Implementation Decisions

### Virtual Branch

- "Templo Online" is a regular row in the branches table with an `is_virtual` boolean column added to the schema
- Migration seeds the Templo Online branch in all environments (inserted by the migration itself, not a separate seed)
- One branch per user — `users.branchId` stays a single NOT NULL FK. If a user goes online, their branch changes
- Online members get the same SPOM-generated training sessions as physical branch members — same algorithm, same progression

### AURA Ledger & Balances

- Full source_type enum defined from day 1: training_completion, attendance, streak_bonus, referral, subscription_discount, manual_adjustment, challenge, social
- `aura_config` DB table maps source_type → default amount. Claude seeds reasonable defaults. Admin can eventually tweak values without code changes
- Ledger supports both positive (earning) and negative (spending/penalties) amounts from day 1. Balance = cached, not computed
- `aura_balances` table with userId + balance column, updated atomically in the same DB transaction as the ledger insert (matches RSTRC-03)
- Polymorphic reference: reference_type (varchar) + reference_id (int) columns trace every transaction back to its source entity
- Unique constraint on (user_id, source_type, reference_type, reference_id) prevents double-awarding at DB level
- Optional nullable description varchar for human-readable context (e.g., "Completed training session Week 12 Day 3")
- Phase 45 creates tables + AuraService (award/spend/getBalance methods) only — no API routes. Later phases call the service internally

### Module Boundaries

- Barrel exports (index.ts) on each module defining its public API. Convention: only import from module/index.ts, never reach into internals. No lint enforcement yet — structure and code review
- Inter-module communication: import the other module's service via its barrel export (e.g., attendance imports UserService.getById() from users/index.ts)
- Formalize ALL existing 12 modules + new ones: add barrel exports, ensure each follows routes/service/schemas/types pattern
- Each module self-registers as a Fastify plugin (registerRoutes). Main app.ts imports and registers each module. Modules own their route prefix (e.g., aura module owns /api/aura/\*)
- Implicit dependency declaration via TypeScript imports — no explicit dependency manifest
- Admin module stays as-is (14 files, all session-related) with barrel export added. Don't split prematurely
- src/modules/shared/ stays as home for cross-cutting code (errors, constants, utilities). Rule: if used by 3+ modules, it's shared

### Schema Organization

- All schema files stay in src/db/schema/ (centralized). Drizzle works best with single schema directory
- New files use module-prefix naming: aura-transactions.ts, aura-balances.ts, aura-config.ts, members-notes.ts, etc.
- Existing 30 files keep current names (no renaming churn). Prefixing applies to new files only
- Users table stays lean — only change is is_virtual on branches table. Module-specific data in dedicated tables
- Each schema file gets a `// Module: {name}` comment header for ownership clarity
- Drizzle relations stay co-located in the same file as the table definition (matches current pattern)

### Claude's Discretion

- Exact AURA default amounts per source type
- AuraService internal implementation (transaction handling, error cases)
- Barrel export structure and what constitutes "public API" per module
- Order of operations for the restructure (which modules to formalize first)
- Migration naming and sequencing

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/modules/shared/errors.ts`: Error handling utilities — will be re-exported via shared barrel
- `src/db/schema/users.ts`: Users table with branchId FK — virtual branch needs is_virtual on branches, not users
- `src/db/schema/branches.ts`: Branches table with name, code, timezone, isActive — add is_virtual here

### Established Patterns

- Drizzle ORM with mysqlTable definitions and relations in same file
- Modules have routes.ts + service.ts at minimum, some have schemas.ts and types.ts
- Admin module uses facade pattern (edit-service.ts delegates to domain services)
- Routes are currently imported centrally — will shift to module self-registration

### Integration Points

- `src/db/schema/index.ts`: Barrel re-exports all schemas — new AURA schemas added here
- `src/modules/`: New aura module created here alongside existing 12 modules
- Migration directory: New migration for is_virtual column + AURA tables + Templo Online branch seed
- Main app registration: Each module will register as Fastify plugin

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 45-architecture-foundation_
_Context gathered: 2026-03-08_
