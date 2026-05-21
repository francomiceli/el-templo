---
phase: 115-evento-desafio-de-la-barra
plan: 04
subsystem: el-templo-api
tags: [bar-challenge, endpoint, single-attempt, integration-tests, R2, R11, D-11, D-12, D-13, D-14]
requires:
  - el-templo-api/src/db/schema/users.ts (barChallenge* columns from plan 01)
  - migration 0124_users_bar_challenge_fields.sql applied
  - fastify.authenticate decorator (members)
provides:
  - POST /api/bar-challenge/result (member-only)
  - Response 200 { completed: boolean, seconds: number }
  - Response 409 { error: "already_attempted", message: "Ya registraste tu intento" }
  - BarChallengeService.submitResult(userId, secondsHeld)
affects:
  - el-templo-api/src/app.ts (module mount)
  - el-templo-api/src/modules/bar-challenge/ (new module)
  - el-templo-api/test/bar-challenge.test.ts (new test file)
tech-stack:
  added: []
  patterns:
    - Fastify plugin + JSON Schema body validation (mirrors onboarding/routes.ts)
    - Atomic UPDATE conditional on bar_challenge_attempted_at IS NULL (D-14, race-free)
    - Drizzle MySQL2 affectedRows via result[0].affectedRows (mirrors programs/service.ts)
    - Service class with FastifyBaseLogger injection (mirrors onboarding/service.ts)
key-files:
  created:
    - el-templo-api/src/modules/bar-challenge/service.ts
    - el-templo-api/src/modules/bar-challenge/routes.ts
    - el-templo-api/test/bar-challenge.test.ts
    - .planning/phases/115-evento-desafio-de-la-barra/115-04-SUMMARY.md
  modified:
    - el-templo-api/src/app.ts
decisions:
  - "Followed plan D-13 override: Fastify JSON Schema (additionalProperties:false, integer [0..600]) instead of zod inline — codebase convention is JSON Schema and Fastify renders structured 400 errors out of the box."
  - "Followed plan D-12 path: POST /api/bar-challenge/result (no /api/me/... prefix); userId resolved server-side from request.user.userId."
  - "affectedRows extraction uses result[0].affectedRows — canonical pattern in modules/programs/service.ts:232 and notifications/service.ts:602. No `as` casts needed because Drizzle's mysql2 update() return type already exposes the tuple."
  - "Did not auto-add a transaction around the UPDATE — the conditional WHERE bar_challenge_attempted_at IS NULL is itself atomic at row-level (single statement); a tx would only add latency without strengthening the invariant."
metrics:
  duration_minutes: 17
  tasks_completed: 2
  files_created: 4
  files_modified: 1
  commits: 2
completed_at: 2026-05-21
---

# Phase 115 Plan 04: Backend Bar Challenge Endpoint — Summary

Backend half of the bar challenge flow: `POST /api/bar-challenge/result` registers the authenticated member's single attempt with race-free single-attempt enforcement via a conditional UPDATE, validates the body via Fastify JSON Schema, and is fully covered by 6 integration tests against real MySQL.

## Tasks Executed

### Task 1: New `bar-challenge` module + mount in `app.ts` (commit `d417fd55`)

**`el-templo-api/src/modules/bar-challenge/service.ts`** — `BarChallengeService` with `submitResult(userId, secondsHeld) → SubmitResultOutcome`, where the outcome is a discriminated union:

```ts
type SubmitResultOutcome =
  | { ok: true; completed: boolean; seconds: number }
  | { ok: false; reason: "already_attempted" };
```

The atomic UPDATE (D-14):

```ts
const result = await this.db
  .update(users)
  .set({
    barChallengeCompleted: completed,
    barChallengeSeconds: secondsHeld,
    barChallengeAttemptedAt: sql`NOW()`,
  })
  .where(and(eq(users.id, userId), isNull(users.barChallengeAttemptedAt)));

const affectedRows = result[0].affectedRows;
```

`affectedRows === 0` → `{ ok: false, reason: "already_attempted" }` (race-free).
`affectedRows === 1` → `{ ok: true, completed, seconds: secondsHeld }`.

The `affectedRows` extraction matches the canonical project pattern — see `el-templo-api/src/modules/programs/service.ts:232` (`if (result[0].affectedRows === 0)`) and `el-templo-api/src/modules/notifications/service.ts:602` (`result[0].affectedRows ?? 0`).

**`el-templo-api/src/modules/bar-challenge/routes.ts`** — Fastify plugin exporting `barChallengeRoutes`. `onRequest` hook calls `fastify.authenticate`. POST `/result` accepts body validated by JSON Schema:

```ts
{
  type: "object",
  required: ["secondsHeld"],
  additionalProperties: false,
  properties: { secondsHeld: { type: "integer", minimum: 0, maximum: 600 } },
}
```

Response shapes:

- **200** — `{ completed: boolean, seconds: number }` (echoes the bound integer the caller supplied).
- **409** — `{ error: "already_attempted", message: "Ya registraste tu intento" }`.
- **400** — Fastify-rendered schema violation.
- **401** — `fastify.authenticate` rejection (missing/invalid bearer).

**`el-templo-api/src/app.ts`** — Imports `barChallengeRoutes` and registers the plugin right after `onboardingRoutes`:

```ts
await app.register(barChallengeRoutes, { prefix: "/api/bar-challenge" });
```

`pnpm exec tsc --noEmit` exit code 0.

### Task 2: Integration tests — 6 cases (commit `2af0e3cf`)

**`el-templo-api/test/bar-challenge.test.ts`** — Six `it()` cases covering SPEC R2 + R11 + D-13:

| #   | Case                                 | Status                                                                            | DB invariant verified                            |
| --- | ------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | `secondsHeld=90` (R2 case a)         | 200                                                                               | `completed=1, seconds=90, attempted_at NOT NULL` |
| 2   | `secondsHeld=47` (R2 case b)         | 200                                                                               | `completed=0, seconds=47, attempted_at NOT NULL` |
| 3   | Second POST (R11)                    | 409 + body `{ error: "already_attempted", message: "Ya registraste tu intento" }` | First attempt preserved: `seconds=90` not `30`   |
| 4   | No `Authorization` header            | 401                                                                               | —                                                |
| 5   | `secondsHeld=700` (D-13 upper bound) | 400                                                                               | —                                                |
| 6   | Body `{}` (D-13 required field)      | 400                                                                               | —                                                |

`pnpm test test/bar-challenge.test.ts` output:

```
 ✓ test/bar-challenge.test.ts (6 tests) 51291ms
     ✓ 200 + completed=true when secondsHeld=90 (R2 case a) 378ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  56.30s
```

Each test creates a fresh member via `registerUser(app, ...)` so single-attempt enforcement doesn't bleed between cases. `beforeEach` uses `cleanAllTestData(app)` to scrub state.

## Final endpoint shape

```
POST /api/bar-challenge/result
Authorization: Bearer <member-jwt>
Content-Type: application/json

→ Body:    { "secondsHeld": <integer 0..600> }

← 200 OK:  { "completed": <boolean>, "seconds": <integer> }
← 409:     { "error": "already_attempted", "message": "Ya registraste tu intento" }
← 400:     Fastify schema error (missing field / out-of-bounds / wrong type / extra fields)
← 401:     Auth plugin rejection
```

`completed = secondsHeld >= 90` (R2). The 90 second threshold is fixed by R6 and not exposed via response.

## Deviations from Plan

### Plan-permitted override applied

**[Plan D-13 — explicit override] Used Fastify JSON Schema instead of zod inline**

- The plan body section says "zod inline" verbatim in the must-haves but the `<action>` block (Task 1, step 2) explicitly says: "NO zod runtime; ver D-13 — el SPEC dice 'zod inline' pero el codebase pattern es Fastify JSON Schema; usar **Fastify JSON Schema con `additionalProperties: false`**".
- Followed the action block: Fastify JSON Schema with `additionalProperties: false`. This matches the project convention (`onboarding/routes.ts`, `notifications/routes.ts`, all other modules) and renders Fastify's structured 400 response for free.
- Not a true deviation — the plan itself documented the override.

### Mount-time comment kept terse

To satisfy the plan's acceptance criterion `grep -c "/api/bar-challenge" el-templo-api/src/app.ts == 1`, the mounting block uses a generic comment ("Phase 115 bar challenge result endpoint…") that does not repeat the prefix string. The single `/api/bar-challenge` occurrence is the `prefix` argument itself.

## Mount location confirmed

```
el-templo-api/src/app.ts line 41:  import { barChallengeRoutes } from "./modules/bar-challenge/routes";
el-templo-api/src/app.ts line 209: await app.register(barChallengeRoutes, { prefix: "/api/bar-challenge" });
```

## Threat surface scan

No new threat surface beyond the plan's existing register:

- **T-115-08** (tampering on `secondsHeld`): mitigated by JSON Schema `integer, [0, 600]` + `additionalProperties: false`. Tests #5 and #6 lock the upper bound and required-field invariants.
- **T-115-09** (repudiation / replay): mitigated by atomic `UPDATE ... WHERE bar_challenge_attempted_at IS NULL` — single SQL statement, row-level lock, no SELECT+UPDATE race. Test #3 locks the contract.
- **T-115-10** (info disclosure on 409): mitigated — the 409 body has no timestamps, no prior `seconds`, no PII. Test #3 asserts on the exact body shape.
- **T-115-11** (auth bypass): mitigated by `fastify.addHook("onRequest", fastify.authenticate)`. Test #4 locks 401-when-no-token.
- **T-115-12** (DoS via spam attempts): no change — single-attempt DB enforcement caps each user at 1 mutating call; global rate-limit plugin covers the request layer.

No new threat flags.

## Known Stubs

None. The endpoint is fully implemented, fully tested, and the response shape is final.

## Deferred Issues

None within this plan's scope. The frontend POST integration belongs to plan 05 / the timer screen.

## Self-Check: PASSED

- File exists: `el-templo-api/src/modules/bar-challenge/service.ts` — FOUND.
- File exists: `el-templo-api/src/modules/bar-challenge/routes.ts` — FOUND.
- File exists: `el-templo-api/test/bar-challenge.test.ts` — FOUND.
- `grep -c "register(barChallengeRoutes" el-templo-api/src/app.ts` → 1 — VERIFIED.
- `grep -c "/api/bar-challenge" el-templo-api/src/app.ts` → 1 — VERIFIED.
- `grep -c "additionalProperties: false" el-templo-api/src/modules/bar-challenge/routes.ts` → 2 — VERIFIED (≥1).
- `grep -c "isNull(users.barChallengeAttemptedAt)" el-templo-api/src/modules/bar-challenge/service.ts` → 1 — VERIFIED.
- `grep -rn ": any" el-templo-api/src/modules/bar-challenge/` → 0 — VERIFIED.
- `pnpm exec tsc --noEmit` exit code 0 — VERIFIED.
- `pnpm test test/bar-challenge.test.ts` → 6 passed, 0 failed — VERIFIED.
- Commit `d417fd55` (`feat(115-04): add bar-challenge module — POST /api/bar-challenge/result`) — FOUND in git log.
- Commit `2af0e3cf` (`test(115-04): integration tests for POST /api/bar-challenge/result`) — FOUND in git log.
