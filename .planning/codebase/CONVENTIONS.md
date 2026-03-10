# Coding Conventions

**Analysis Date:** 2025-03-10

## Naming Patterns

**Files:**

- Services: `service.ts` (e.g., `el-templo-api/src/modules/members/service.ts`)
- Routes: `routes.ts` (e.g., `el-templo-api/src/modules/members/routes.ts`)
- Types: `types.ts` (e.g., `el-templo-api/src/modules/members/types.ts`)
- Schemas: `schemas.ts` (Fastify/Zod validation schemas)
- Stores (Pinia): `use{StoreName}Store.ts` (e.g., `useAuthStore.ts`, `useSessionPlayerStore.ts`)
- Composables: `use{FunctionName}.ts` (e.g., `useMembersApi.ts`, `useSessionPlayer.ts`)
- Utils: Lowercase with hyphens (e.g., `logger.ts`, `format-time.ts`, `week-dates.ts`)
- Tests: `{feature}.test.ts` (e.g., `members.test.ts`, `aura-service.test.ts`)

**Functions:**

- camelCase for all function names (both sync and async)
- Service methods: `async methodName(params): Promise<Type>`
- Composable functions: `export function useFeatureName()` (always prefix with `use`)
- Helper functions: `private helperName()` or `function extractError()`

**Variables:**

- camelCase for all variables, refs, and computed properties
- Ref naming: No special prefix (just `const members = ref(...)`, not `$members`)
- Constants: UPPER_SNAKE_CASE (e.g., `ADMIN_ROLES = ["coach", "admin", "superadmin"]`)

**Types:**

- Interfaces: PascalCase, plural when representing collections (e.g., `MemberListItem`, `MemberProfile`)
- Type aliases: PascalCase (e.g., `type DbInstance = MySql2Database<typeof schema>`)
- Props interfaces: `{ComponentName}Props`
- Enum-like types: PascalCase with specific values (e.g., `type BlockRole = 'INITIUM' | 'NUCLEUS' | 'DEUTEROS_1'`)

## Code Style

**Formatting:**

- Tool: Prettier
- Single quotes: true (all apps use single quotes)
- Semicolons:
  - `el-templo-api`: true (semicolons required)
  - `el-templo-admin`: true
  - `el-templo-app`: false (semicolons omitted)
  - `el-templo-web`: Nuxt defaults (no explicit config)
- Print width: 100 characters
- Trailing commas: es5 style (API and admin apps)
- Arrow function parens: Prettier defaults (always include parens)

**Linting:**

- Tool: ESLint with flat config (eslint.config.js)
- Vue files: `eslint-plugin-vue` with 'flat/essential' preset
- TypeScript files: `@typescript-eslint` with `recommended` preset
- Unused variables: warn with `argsIgnorePattern: '^_'` (leading underscore suppresses)
- No-debugger: error in production, off in development
- No-unused-vars: turned off in favor of TypeScript version

**TypeScript:**

- Target: ES2022 (modern JavaScript features)
- Module: NodeNext (for API), ESM elsewhere
- Strict mode: enabled across all apps
- No `any` types: use `unknown` with type narrowing via `instanceof Error` or type guards

## Import Organization

**Order:**

1. External packages (e.g., `import { ref } from 'vue'`)
2. Absolute imports and aliases (e.g., `import { api } from 'src/boot/axios'`)
3. Relative imports (e.g., `import { MemberService } from './service'`)
4. Type imports with `type` keyword kept separate or inline where convenient

**Path Aliases:**

- `el-templo-api`: No path aliases (uses relative imports, `../../db/schema`)
- `el-templo-admin`: `src` alias in `tsconfig.json` (e.g., `import { api } from 'src/boot/axios'`)
- `el-templo-app`: `src` alias (e.g., `import { useAuthStore } from 'src/stores/useAuthStore'`)
- `el-templo-web`: Nuxt auto-aliases (e.g., `~/assets/css`, `~/components`)

## Error Handling

**Pattern:**

```typescript
catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  // Handle error
}
```

**Custom Error Classes (API):**

- `BadRequestError` — invalid input or operation (status 400)
- `NotFoundError` — resource not found (status 404)
- `ConflictError` — state conflict, e.g., duplicate booking (status 409)
- `InsufficientBalanceError` — AURA spend exceeds balance
- All extend `Error` with `this.name = "ClassName"`

**Frontend Error Extraction:**

```typescript
function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error ?? err.response?.data?.message;
    if (typeof message === "string") return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
```

**Route Error Handling (Fastify):**

- Catch errors in route handlers and return appropriate HTTP status
- Schemas validate request payloads before handler execution
- Use Sentry for error monitoring (configured in `instrument.ts` for API, `boot/sentry.ts` for frontend)

## Logging

**API (Fastify + Pino):**

- Never use `console.log`, `console.warn`, `console.error`
- Use `request.log` (inherited from app logger) or `app.log`
- Log levels: `info`, `warn`, `error`, `debug`
- Example: `app.log.info('Server listening', { port: 3000 })`

**Frontend (Vue apps):**

- Import logger: `import { createLogger } from 'src/utils/logger'`
- Create context-scoped logger: `const log = createLogger('ComponentName')`
- Log levels: `debug()`, `info()`, `warn()`, `error()`
- `error()` automatically sends to Sentry when initialized
- Example: `log.info('Members loaded', { count: 42 })`

**Logging Guidelines:**

- Log at INFO level for major operations (auth, data changes, API calls)
- Log at WARN for recoverable issues or degradation
- Log at ERROR for failures and exceptions (with stack context if available)
- Include structured data: `log.info('message', { key: value })`

## Comments

**When to Comment:**

- Complex algorithms or non-obvious logic
- Business rule explanations (e.g., "overdue subquery: member has subscription where endDate < CURDATE()")
- Public API documentation (JSDoc on service methods, composables)
- Decision rationale in complex conditional branches

**JSDoc/TypeDoc:**

- Use `/** ... */` comment blocks above functions in service/composable modules
- Include `@param` and `@returns` tags for public methods
- `@throws` for error cases
- Example from `AuraService.award()`:
  ```typescript
  /**
   * Award AURA to a user. Creates a ledger entry and atomically updates the cached balance.
   *
   * @param input - Award details (userId, sourceType, referenceType, referenceId, optional amount/description)
   * @returns The user's new total balance
   * @throws On duplicate award (unique constraint violation)
   */
  ```

**File-Level Comments:**

- Include at top of service/route files explaining the module's purpose
- Example: `/** Member Service: Business logic for member CRUD, profile management, etc. */`

## Function Design

**Size:**

- Methods: 20-50 lines typical (shorter for composables, longer for database queries)
- Complex logic: extract into private helpers or separate functions
- Service methods are allowed to be longer (database-heavy operations)

**Parameters:**

- Named object parameters preferred for functions with 3+ parameters
- Type each parameter explicitly
- Use destructuring in function signatures when possible

**Return Values:**

- Always type the return value explicitly: `async method(): Promise<Type>`
- Void functions: use `void` or omit return
- Error-throwing functions should be documented with `@throws`

**Async Pattern:**

- All async operations return `Promise<Type>`
- Use `await` for async calls in functions marked `async`
- Composables return objects with properties and methods (not Promises)

## Module Design

**Exports:**

- Service classes: `export class ServiceName { ... }`
- Service functions (factories): `export function createServiceName(): ServiceName { ... }`
- Composables: `export function useFeatureName() { ... }`
- Types/Interfaces: `export interface/type NameType`
- Constants: `export const CONSTANT_NAME = ...`

**Barrel Files:**

- `el-templo-app/src/modules/training/index.ts` exports route plugin only
- `el-templo-app/src/stores/index.ts` exports all stores
- Not widely used for other modules; most imports are direct

**Directory Organization:**

- Services live in `{module}/service.ts` (singleton instance pattern)
- Routes live in `{module}/routes.ts` (Fastify plugins)
- Composables in `{app}/src/composables/` or `{module}/composables/`
- Stores in `{module}/stores/` (Pinia)
- Types in `{module}/types.ts`
- Schemas in `{module}/schemas.ts` (Fastify validation)

## Special Patterns

**API Routes (Fastify):**

```typescript
export const memberRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateMemberInput }>(
    "/members",
    { schema: createMemberSchema },
    async (req, reply) => {
      // Handler with req.log for logging
    },
  );
};
```

**Vue Composables with Cleanup:**

- Composables must expose a `cleanup()` method if they hold resources
- Example: `useSessionPlayer()` manages timer intervals
- No `onUnmounted` calls inside composable itself (caller manages lifecycle)

**Pinia Stores (Composition API):**

```typescript
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const user = ref<User | null>(null);

  async function login(email: string, password: string) { ... }

  return { token, user, login }; // Explicitly return public API
});
```

**API Axios Instance:**

- Centralized in `boot/axios.ts` (both admin and app)
- Configured with base URL from environment
- Auth token automatically injected on each request

---

_Convention analysis: 2025-03-10_
