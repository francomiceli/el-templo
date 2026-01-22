---
phase: 01-foundation
plan: 03
subsystem: database
tags: [drizzle, mysql, argon2, seeding, migrations]

# Dependency graph
requires:
  - phase: 01-02
    provides: API foundation with Fastify and Drizzle ORM setup
provides:
  - Database schema for branches and users tables
  - Role enum (member, coach, admin, superadmin)
  - Level enum (alfa, delta, sigma, omega, spartan)
  - Migration infrastructure with Drizzle Kit
  - Seed script with 5 branches and 26 test users
affects: [02-authentication, 03-member-dashboard, 04-training, 05-timer]

# Tech tracking
tech-stack:
  added: [argon2, drizzle-kit migrations]
  patterns: [seed script pattern, role-based user model, branch-user relationship]

key-files:
  created:
    - el-templo-api/src/db/schema/branches.ts
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/migrations/0000_fancy_golden_guardian.sql
    - el-templo-api/src/db/seed.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/package.json

key-decisions:
  - "argon2 for password hashing (industry-standard, resistant to GPU attacks)"
  - "Drizzle migrations over Prisma (already using Drizzle ORM)"
  - "Branch-first user model (branchId required, supports multi-location gym)"
  - "Seed with 26 users: 1 superadmin, 5 coaches (1 per branch), 20 members (4 per branch)"

patterns-established:
  - "Role enum hierarchy: member < coach < admin < superadmin"
  - "Level progression: alfa < delta < sigma < omega < spartan"
  - "Seed script clears existing data before insertion for idempotency"
  - "Test users follow pattern: admin@, coach1-5@, member1-20@ with domain eltemplo.com"

# Metrics
duration: 5min
completed: 2026-01-22
---

# Phase 1 Plan 3: Database Schema Summary

**MySQL database with branches/users tables, role/level enums, argon2 password hashing, and 26 seeded test users**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-22T16:55:45Z
- **Completed:** 2026-01-22T17:00:33Z
- **Tasks:** 3 (continued from checkpoint)
- **Files modified:** 10

## Accomplishments
- Created branches table with 5 El Templo locations (Centro, Alem, Constitución, Jujuy, Mogotes)
- Created users table with role enum (member, coach, admin, superadmin) and level enum (alfa through spartan)
- Generated and applied Drizzle migration with foreign key constraint
- Built seed script with argon2 password hashing
- Seeded database: 1 superadmin (spartan), 5 coaches (omega), 20 members (distributed across levels)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Drizzle schema for branches and users** - `2018ff4` (feat) - *completed in previous session*
2. **Task 2: Generate and apply database migrations** - `5a38957` (feat)
3. **Task 3: Create seed script with branches and test users** - `c86d50d` (feat)

**Plan metadata:** `fc1a253` (chore: lockfile and migration metadata)

## Files Created/Modified
- `el-templo-api/src/db/schema/branches.ts` - Branch table schema (id, name, code, isActive, timestamps)
- `el-templo-api/src/db/schema/users.ts` - User table schema with role/level enums, branchId FK
- `el-templo-api/src/db/schema/index.ts` - Schema exports for Drizzle
- `el-templo-api/src/db/migrations/0000_fancy_golden_guardian.sql` - Initial migration creating tables
- `el-templo-api/src/db/seed.ts` - Seed script with argon2 hashing, creates 5 branches + 26 users
- `el-templo-api/package.json` - Added db:seed and db:reset scripts
- `el-templo-api/.npmrc` - Enabled build scripts for argon2 native module

## Decisions Made

1. **Manual migration application:** Drizzle Kit push failed to read DB_PASSWORD from .env.development. Applied migration manually via MySQL CLI. Created .env symlink from .env.development for future script usage.

2. **Test user credentials:**
   - Superadmin: admin@eltemplo.com / admin123
   - Coaches: coach1-5@eltemplo.com / templo123
   - Members: member1-20@eltemplo.com / templo123

3. **Branch distribution:** Each of 5 branches has 1 coach and 4 members (one per level: alfa, delta, sigma, omega)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created .env file for seed script**
- **Found during:** Task 3 (Running seed script)
- **Issue:** Seed script uses dotenv/config which requires .env file, but project uses .env.development
- **Fix:** Created .env by copying .env.development
- **Files modified:** el-templo-api/.env
- **Verification:** Seed script loaded DB credentials successfully
- **Committed in:** c86d50d (excluded from git, properly gitignored)

**2. [Rule 3 - Blocking] Enabled argon2 native build scripts**
- **Found during:** Task 3 (Installing argon2)
- **Issue:** pnpm blocked argon2 build scripts by default
- **Fix:** Added enable-pre-post-scripts=true to .npmrc
- **Files modified:** el-templo-api/.npmrc
- **Verification:** argon2 module loaded successfully in Node
- **Committed in:** c86d50d

**3. [Rule 3 - Blocking] Applied migration manually via MySQL CLI**
- **Found during:** Task 2 (Applying migration)
- **Issue:** drizzle-kit push failed to read DB_PASSWORD, migration SQL contained drizzle-specific comment syntax
- **Fix:** Filtered comments and applied migration directly via mysql CLI
- **Files modified:** None (database state only)
- **Verification:** Both tables created with correct structure and foreign key constraint
- **Committed in:** 5a38957

---

**Total deviations:** 3 auto-fixed (3 blocking issues)
**Impact on plan:** All fixes were necessary to unblock execution. No scope changes, just tooling configuration.

## Issues Encountered

- **Drizzle Kit environment loading:** drizzle-kit commands don't respect .env.development files, only .env. Created .env symlink for development workflow.
- **pnpm security model:** Default behavior blocks build scripts. Added .npmrc config to allow argon2 native compilation.

## User Setup Required

None - database is seeded and ready for Phase 2 authentication development.

## Next Phase Readiness

**Ready for Phase 2 (Authentication):**
- User table exists with password_hash field
- Test users available at all permission levels
- Branch context established for multi-location support

**Test credentials documented:**
- Superadmin: admin@eltemplo.com / admin123 (level: spartan)
- Coach example: coach1@eltemplo.com / templo123 (level: omega, branch: Centro)
- Member example: member1@eltemplo.com / templo123 (level: alfa, branch: Centro)

**No blockers.** Authentication can proceed with login/registration endpoints.

---
*Phase: 01-foundation*
*Completed: 2026-01-22*
