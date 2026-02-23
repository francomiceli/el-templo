# El Templo - Development Guidelines

## Project Structure

Monorepo with 3 apps:

- `el-templo-api/` — Fastify + Drizzle ORM + MySQL (backend)
- `el-templo-app/` — Quasar + Vue 3 + Capacitor (member app)
- `el-templo-admin/` — Quasar + Vue 3 (admin/coach app, web-only)

## Development Standards (Post Phase 19)

### Logging

- **API:** Use Fastify's built-in Pino logger (`request.log`, `app.log`). Never `console.log`.
- **Frontend apps:** Use `createLogger()` from `src/utils/logger.ts`. Never `console.log/warn/error`.

### TypeScript

- No `any` types. Use `unknown` + type narrowing, or define proper interfaces.
- Error handling: `catch (err: unknown)` with `instanceof Error` checks.

### API Tests

- New API routes must include integration tests in `el-templo-api/test/`.
- Tests run against real MySQL (`eltemplo_test` database). See `test/helpers.ts` for auth/request utilities.
- Run tests: `cd el-templo-api && pnpm test`

### Environment Variables

- When adding a new env var, update the corresponding `.env.example` file.

### Pre-commit Hooks

- Husky + lint-staged runs automatically on commit (Prettier formatting).
- If a commit fails due to lint-staged, fix the issue and create a new commit (don't amend).

### CI/CD

- CI runs on every push: type check, lint, security audit, integration tests, build.
- Deploy pipeline: build all 3 → backup current → rsync to EC2 → migrate → restart → smoke test → auto-rollback on failure.

## Patterns

- **API services:** Facade pattern for complex services (see `edit-service.ts` → domain services).
- **Frontend stores:** Pinia composition API (`defineStore` with `setup` function).
- **Frontend composables:** Expose `cleanup()` method, no `onUnmounted` inside composables.
- **Error monitoring (Sentry):**
  - API: `@sentry/node` in `instrument.ts` (first import in `index.ts`). Guarded by `SENTRY_DSN` env var. Password fields scrubbed via `beforeSend`.
  - Frontend: `@sentry/vue` in `src/boot/sentry.ts` (first boot file). Guarded by `VITE_SENTRY_DSN` env var. `createLogger().error()` sends to Sentry automatically.
  - GitHub Issues integration: Not available. Errors go to Sentry dashboard only.

## Plan Mode Review

When entering plan mode, review the plan thoroughly before making any code changes. For every issue or recommendation, explain the concrete tradeoffs, give an opinionated recommendation, and ask for user input before assuming a direction.

### Engineering Preferences

- **DRY:** Flag repetition aggressively.
- **Testing:** Well-tested code is non-negotiable; err on the side of too many tests.
- **Engineering balance:** "Engineered enough" — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity).
- **Edge cases:** Handle more, not fewer; thoughtfulness > speed.
- **Explicit over clever.**

### Review Sections

Work through these four sections in order:

1. **Architecture** — System design, component boundaries, dependency graph, coupling, data flow, bottlenecks, scaling, single points of failure, security (auth, data access, API boundaries).
2. **Code Quality** — Organization, module structure, DRY violations (aggressive), error handling and missing edge cases (explicit), tech debt hotspots, over/under-engineering.
3. **Tests** — Coverage gaps (unit, integration, e2e), assertion strength, missing edge case coverage, untested failure modes and error paths.
4. **Performance** — N+1 queries, database access patterns, memory usage, caching opportunities, slow/high-complexity code paths.

### Issue Format

For every specific issue (bug, smell, design concern, risk):

- Describe the problem concretely with file and line references.
- Present 2-3 options (including "do nothing" where reasonable).
- For each option: implementation effort, risk, impact on other code, maintenance burden.
- Give an opinionated recommended option mapped to the engineering preferences above.
- Explicitly ask whether the user agrees before proceeding.

### Workflow

**Before starting**, ask which mode:

1. **BIG CHANGE** — Interactive, one section at a time, at most 4 top issues per section.
2. **SMALL CHANGE** — Interactive, one question per review section.

For each section: output explanation, pros/cons, and opinionated recommendation, then use `AskUserQuestion`. Number issues (1, 2, 3...) and letter options (A, B, C...). Recommended option is always the first option. After each section, pause for feedback before moving on.
