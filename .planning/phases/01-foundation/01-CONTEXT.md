# Phase 1: Foundation - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish project skeleton with working backend, frontend, and database ready for feature development. This includes project scaffolding, database schema for core entities (users, branches, roles), and development tooling setup.

</domain>

<decisions>
## Implementation Decisions

### Repository Structure
- **Separate repos**: `el-templo-app` (frontend) + `el-templo-api` (backend)
- **Package manager**: pnpm for both repos
- **Shared types**: Copy manually between repos as needed (no shared package or generated types)

### Database Seeding
- **Approach**: Seed scripts that run on fresh database
- **Branches to seed**: Centro, Alem, Constitucion, Jujuy, Mogotes (5 real El Templo locations)
- **Admin user**: Seeded superadmin account (admin@eltemplo.com with known dev password)
- **Test users**: Seed test members and coaches for each branch (for development/testing)

### Development Workflow
- **Database**: Local MySQL installation (Docker to be added later)
- **Dev scripts**: Standard set — dev, build, test, seed, migrate
- **Linting/formatting**: ESLint + Prettier with auto-format on save

### Environment Handling
- **Environments**: Dev + Prod only (no staging for now)
- **Config files**: .env files — .env.development, .env.production, .env.example (gitignored)
- **Hosting**: Not decided yet — keep configs flexible for VPS or cloud
- **Secrets**: Environment variables in .env files (gitignored)

### Claude's Discretion
- Exact folder structure within each repo
- ESLint/Prettier rule configuration
- Database migration tooling (Drizzle Kit per STACK.md)
- Test user data (names, emails, levels distribution)
- .env.example contents and documentation

</decisions>

<specifics>
## Specific Ideas

- Branch names are real locations: Centro, Alem, Constitucion, Jujuy, Mogotes
- Keep Docker out of initial setup to reduce complexity — add later when needed
- Frontend repo follows Quasar CLI conventions
- Backend repo follows Fastify plugin patterns per ARCHITECTURE.md research

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-01-22*
