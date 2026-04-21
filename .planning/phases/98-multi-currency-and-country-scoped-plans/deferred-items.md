# Phase 98 — Deferred Items

Items discovered during execution but out of scope for the current plan.
Per deviation Rule SCOPE BOUNDARY — document here, do NOT fix.

## Discovered during 98-02 execution (2026-04-21)

### Pre-existing TypeScript errors on `pnpm tsc --noEmit`

Both frontend projects have pre-existing `tsc --noEmit` failures that are
NOT caused by the new `format-price.ts` files (confirmed by filename filter).
These would block the plan's automated verify block if interpreted
literally, but per SCOPE BOUNDARY they remain untouched.

#### `el-templo-admin`

`src/utils/pdf/session-pdf-builder.ts`:

- Line 244: `pdfmake.vfs` property typing mismatch against `@types/pdfmake@0.3.1`
- Lines 501 and 677: `margin: number[]` not assignable to
  `Margins | undefined` (tuple-length mismatch)

These are pdfmake v0.3.1 type-definition mismatches. The runtime
surely works since the file is in use — it's a typing-only issue.
Fix by either widening local types, narrowing the `margin` arrays to
fixed-length tuples, or upgrading `@types/pdfmake` (dependency change
requires explicit user approval per `feedback_no_auto_install_deps`).

#### `el-templo-app`

- `import.meta.env` access in `src/boot/sentry.ts` (lines 39, 41) and
  `src/utils/logger.ts` (line 29) — tsconfig likely missing a Vite
  client type reference.
- `Cannot find module './pages/*.vue'` / `'pages/*.vue'` /
  `'layouts/*.vue'` / `'#q-app/wrappers'` across every module's routes
  file — Quasar CLI/Vite module-alias typings not visible to plain
  `tsc --noEmit`. These errors vanish under `vue-tsc` because vue-tsc
  uses the Quasar-provided module resolver.

These are Quasar/Vite tooling-config issues predating this plan. Likely
fixable by switching the CI check from `tsc --noEmit` to
`vue-tsc --noEmit` and/or adding a `vite-env.d.ts` reference. Cross-app
effort, deserves its own dedicated plan.

### Plan acceptance-criterion arithmetic erratum

`98-02-PLAN.md` acceptance criterion line 219 states:

> `SELECT SUM(price_regular) FROM subscription_plans WHERE country='ES';`
> returns 102000

The actual sum from SPEC Req 4's locked values is
7000 + 9000 + 21000 + 30000 + 50000 + 0 + 2000 + 3000 + 3000 + 3000 + 0 + 3000
= **131000**, not 102000. Each individual seed value matches SPEC
exactly; only the acceptance criterion's summation was wrong. No data
change required — future plans that duplicate this sum-check should
use **131000** as the correct expected total.

### Migration-runner parser fragility

`el-templo-api/src/db/run-migrations.ts` splits SQL on `;` **before**
stripping `--` comment lines. Any `;` inside a narrative `-- comment`
line produces a malformed phantom statement that fails at execution.
Two such typos were fixed in 98-02's Task 0 (commit `8314b225`), but
the underlying fragility remains.

**Proposed fix (future phase):** change the fallback branch in
`run-migrations.ts` to strip comment lines **before** the `;` split so
any semicolons embedded in prose are harmless. Pseudo-code:

```ts
const stripped = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
statements = stripped
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
```

Keep the existing drizzle `--> statement-breakpoint` path untouched.
Low-risk, directly avoids the class of bug that bit 98-02.

### JWT payload missing `branchId`

The current JWT payload (`el-templo-api/src/plugins/auth.ts` lines 5-9)
carries only `{ userId, email, role }`. Every request that needs the
user's `branchId` currently does a lookup (members route, subscription
service, and now `attachCountryScope`). Folding `branchId` into the
JWT payload would save one round-trip per request but invalidates
existing tokens on rollout — **non-trivial deploy coordination**, left
for a dedicated performance-oriented phase if profiling justifies it.
