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
