---
phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
reviewed: 2026-07-29T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - el-templo-api/src/app.ts
  - el-templo-api/test/fixtures/second-tenant.ts
  - el-templo-api/test/helpers.ts
  - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
  - el-templo-api/test/tenancy/iso-02-fixtures.test.ts
  - el-templo-api/test/tenant-manifest.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: fixed
---

# Phase 171: Code Review Report

**Reviewed:** 2026-07-29
**Depth:** standard
**Files Reviewed:** 6
**Status:** fixed (los 5 hallazgos accionables corregidos el mismo día; los 3 Info quedan advisory)

> **Resolución 2026-07-29:** CR-01 → `51dc9b95` (5º test real-app: `sinMotivo`/`sinModulo`/`categoriaInvalida` = [] sobre las 370 entradas reales) · WR-01 → `b5f8c225` (marcadores con boundaries: `TODO/FIXME/TBD/XXX` case-sensitive + `pendiente` con `\b`, sin falsos positivos de prosa) · WR-02 → `297ef650` (`ensureEfectivoCaja` con `tenantId` + `tenantValues`; `limpiarSegundoGimnasio` borra `cash_registers` antes que `branches`) · WR-03 → `d0b28c6e` (detección real del HEAD manual con GET hermano, no solo docblock) · WR-04 → `fc61a513` (`status`/`gender` honrados en el camino directo; throw accionable ante overrides no soportados). Verificación post-fix: gate iso-01 **11/11**, batería iso-02 **13/13**, `tsc --noEmit` limpio.

## Summary

Reviewed the phase 171 tenant-isolation backstop: the test-only `onRoute` seam in `buildApp`, the 370-entry route manifest + pure comparator, the fail-closed gate (iso-01), the tenant-aware test helpers, the second-gym fixture, and its verification battery (iso-02).

Verified facts (not assumed): the seam is inert in production (`opts.onRoute` is `undefined` from `src/index.ts`, hook only added when provided, before all `register` calls); manifest entry counts reconcile exactly (370 = 221 tenant-scoped + 8 global + 141 templo-module — grep deltas are the type declaration and comparator locals); the 8 `global` motivos currently pass the pending-marker regex; `refresh_tokens.user_id` has `onDelete: cascade` so the fixture's FK-checks-ON `DELETE FROM users` survives login-created tokens; `member_logins` is only written by `GET /api/auth/me` (line 677 sits inside the route at `routes.ts:613`), which neither the fixture nor iso-02 calls; TENANT_DOS 90671 is used by no other test file; legacy `createTestMember`/`createStaffUser` call paths are payload-identical to pre-171.

However, the central fail-closed promise has a hole: **the D-02/D-07 shape validations are never asserted against the real manifest** — the gate's own error messages claim an enforcement that does not exist (CR-01). Additionally, the fixture's documented recipe for finance batteries (`ensureEfectivoCaja` on the gym-2 branch) reproduces the exact T-168-15 trap this phase exists to prevent, and leaves a row that breaks the fixture's own cleanup (WR-02).

## Critical Issues

### CR-01: The gate never asserts `sinMotivo` / `sinModulo` / `categoriaInvalida` against the real manifest — D-02/D-07 are unenforced

**File:** `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts:119-237` (real-app describe block)
**Issue:** The real-app block computes `discrepancias = compararManifiesto(particion.rutas)` in `beforeAll` but only asserts `discrepancias.faltantes` (line 147) and `discrepancias.fantasmas` (line 171). The three shape lists — `sinMotivo` (D-02), `sinModulo` (D-07), `categoriaInvalida` — are only ever exercised against **synthetic fixtures** in the second describe block. Consequences, all green in CI today:

1. Someone adds `"POST /api/nueva": { categoria: "global", motivo: "TODO" }` — `faltantes` is empty (entry exists), `fantasmas` is empty, count moves correctly from 370 to 371. The gate passes. This is precisely the escape valve D-02 was designed to close, and the gate's own failure message (lines 159-161: *"la validación de runtime la reporta en sinMotivo y el gate sigue rojo igual"*) plus the tenant-manifest docblock (line 66, line 77-78) **promise the opposite**.
2. A `templo-module` entry without `modulo` (or with a typo'd module name) enters master silently — the phase-176 `requireModule` enforcement would silently skip that route.
3. A typo'd `categoria: "tenant-scopd"` on a correctly-keyed entry is neither `faltante` nor `fantasma` and passes — and since `tsconfig.json` excludes `test/`, no compiler catches it either (the file's own docblock identifies runtime validation as "la única red que tiene").

The backstop is silently weaker than every piece of its documentation claims.
**Fix:** Add a fifth test to the real-app describe block:

```typescript
it("toda entrada del manifiesto real tiene la forma exigida (D-02 motivo, D-07 módulo, categoría válida)", () => {
  expect(discrepancias.sinMotivo, "Entradas global sin motivo utilizable (D-02): ...").toEqual([]);
  expect(discrepancias.sinModulo, "Entradas templo-module sin módulo válido (D-07): ...").toEqual([]);
  expect(discrepancias.categoriaInvalida, "Entradas con categoría fuera de las tres: ...").toEqual([]);
});
```

Note: `compararManifiesto` only shape-validates entries reachable via `Object.keys(manifiesto)` of the manifest passed in — asserting on the real `discrepancias` covers all 370 real entries, so this one test closes the hole.

## Warnings

### WR-01: `MARCADORES_PENDIENTE` regex false-positives on ordinary Spanish prose ("todo", "independiente")

**File:** `el-templo-api/test/tenant-manifest.ts:1387`
**Issue:** `const MARCADORES_PENDIENTE = /\b(TODO|FIXME|TBD|XXX)\b|pendiente/i;` — the `i` flag makes `\bTODO\b` match the Spanish word "todo" (one of the most common words in the language the motivos are mandated to be written in: a legitimate motivo like "aplica a todo el sistema" is rejected as a pending marker). And `pendiente` has no word boundaries, so "independiente" / "dependiente" also trip it — a motivo like "el endpoint es independiente del gimnasio" would be flagged. The 8 current motivos happen to avoid both words, so nothing is red today — but once CR-01 is fixed (making `sinMotivo` actually enforced), any future global motivo containing "todo" turns CI red with a misleading "motivo inservible" diagnosis.
**Fix:** Match work-markers case-sensitively (they are conventionally uppercase) and word-bound "pendiente":

```typescript
const MARCADORES_PENDIENTE = /\b(TODO|FIXME|TBD|XXX)\b|\bpendiente\b/i;
// mejor aún, separar: /\b(TODO|FIXME|TBD|XXX)\b/ (sin flag i) || /\bpendiente\b/i
```

Splitting into a case-sensitive marker regex plus a case-insensitive `\bpendiente\b` eliminates the "todo" false positive entirely; the word-boundary fixes "independiente".

### WR-02: The documented `ensureEfectivoCaja(app, gym2.branchId)` recipe seeds the caja in tenant 1 (T-168-15) and breaks `limpiarSegundoGimnasio`

**File:** `el-templo-api/test/fixtures/second-tenant.ts:69-71` (recommendation), `el-templo-api/test/helpers.ts:312-335` (`ensureEfectivoCaja`), `el-templo-api/test/fixtures/second-tenant.ts:370-390` (cleanup)
**Issue:** The fixture docblock tells fase-172 finance batteries: *"que llame `ensureEfectivoCaja(app, gym2.branchId)` — es idempotente y esta hecho para eso"*. It is not made for that:

1. `ensureEfectivoCaja` inserts into `cash_registers` **without** `tenantValues` — `cash_registers` is gym-owned (`tenantIdColumn()` at `cash-registers.ts:35`, DEFAULT 1), so the gym-2 branch's caja is stamped `tenant_id = 1`. That is exactly the T-168-15 incoherence this fixture's own docblock rails against ("el fixture MIENTE"), planted in the module finance batteries will audit first.
2. `cash_registers.branch_id` has an FK to `branches` (`cash-registers.ts:40`) with no cascade. `cash_registers` is in neither `TABLES_TO_CLEAN` nor `limpiarSegundoGimnasio`, so the row survives both cleanups — and then `DELETE FROM branches WHERE tenant_id = 90671` (second-tenant.ts:387, FK checks ON) fails with ER_ROW_IS_REFERENCED. The battery's `afterAll` throws, the gym-2 branch and tenant rows leak into the shared per-worker DB (`isolate: false`), and unrelated files in the same fork go intermittently red — Pitfall 10 by another door.

**Fix:** Add an optional `tenantId` to `ensureEfectivoCaja` (default 1, same convention as the other two helpers) routing the insert through `tenantValues`, and add `DELETE FROM cash_registers WHERE tenant_id = ${TENANT_DOS}` to `limpiarSegundoGimnasio` before the `branches` DELETE. Until then, remove or correct the recommendation in the fixture docblock.

### WR-03: A hand-declared HEAD that shares a URL with a GET silently escapes the manifest — the docblock overclaims

**File:** `el-templo-api/test/tenant-manifest.ts:1341-1370` (`particionarObservadas`), docblock claims at `iso-01-manifiesto.test.ts:28-29` and `tenant-manifest.ts:1323-1327`
**Issue:** The HEAD guard only reddens a HEAD with **no** GET sibling. A manually declared `HEAD /x` route — real handler, real data access — alongside a `GET /x` (the GET registered with `exposeHeadRoute: false`, which is exactly how Fastify requires that pair to be declared) produces a HEAD event indistinguishable from a synthetic one: it is filtered out and never classified, in silence. The documentation asserts the opposite guarantee ("un HEAD declarado A MANO se pone rojo en vez de colarse por el filtro") — true only for the no-sibling case. Low likelihood today (no manual HEADs exist), but this file's entire purpose is that unlikely additions cannot slip through silently.
**Fix:** The seam sees `RouteOptions`; a synthetic HEAD is distinguishable because its GET sibling carries the default `exposeHeadRoute !== false`. In the iso-01 `onRoute` callback (or in `particionarObservadas` by passing richer events), record GET routes with `exposeHeadRoute: false`; any observed HEAD whose sibling GET opted out of synthetic HEADs is a manual route and must go to `rutas`, not the filter. At minimum, correct the two docblocks so the guarantee is stated accurately.

### WR-04: `createTestMember` on the gym-2 path silently drops overrides the register path honors

**File:** `el-templo-api/test/helpers.ts:419-427` (bifurcation), `el-templo-api/test/helpers.ts:453-511` (`crearSocioDeOtroGimnasio`)
**Issue:** `overrides` is `Record<string, unknown>` and legacy callers pass keys like `gender`, `promoCode`, or a specific `status` — all honored by the `/auth/register` path. On the `tenantId !== 1` path, `crearSocioDeOtroGimnasio` receives the full spread but its INSERT only consumes `email/password/firstName/lastName/branchId/dni/phone`; everything else is discarded without error. A fase-172 battery calling `createTestMember(app, { tenantId: TENANT_DOS, status: "active" })` gets a `freemium` socio and no signal — an isolation test then exercises the wrong subscription state in silence. The docblock documents the missing register *side effects* (referral code, member_profiles) but not that explicit caller overrides are dropped.
**Fix:** In `crearSocioDeOtroGimnasio`, throw on unsupported keys so the divergence is loud:

```typescript
const soportadas = new Set(["email","password","firstName","lastName","branchId","dni","phone","tenantId","uniqueSuffix"]);
const ignoradas = Object.keys(data).filter((k) => !soportadas.has(k));
if (ignoradas.length > 0) {
  throw new Error(`createTestMember con tenantId≠1 no soporta overrides: ${ignoradas.join(", ")} — insertá la columna a mano o extendé crearSocioDeOtroGimnasio.`);
}
```

(Requires widening the parameter type to carry the extra keys, or checking before the destructure in `createTestMember`.)

## Info

### IN-01: iso-02's `afterAll` dereferences `app` unguarded — a `beforeAll` failure gets masked

**File:** `el-templo-api/test/tenancy/iso-02-fixtures.test.ts:198, 215-222`
**Issue:** `let app: FastifyInstance;` with `afterAll` calling `cleanAllTestData(app)` unconditionally. If `createTestApp()` throws in `beforeAll` (DB provisioning timeout is a known ~100 s risk on this file per its own docblock), `afterAll` throws `TypeError` on `app.dbPool`, burying the root cause. iso-01 guards with `if (app)`; this file should match.
**Fix:** `let app: FastifyInstance | undefined;` and `if (app) { ... await app.close(); }` in `afterAll` (the `beforeEach` will fail loudly on its own).

### IN-02: `compararManifiesto` uses `in` (prototype-chain lookup) for membership

**File:** `el-templo-api/test/tenant-manifest.ts:1417`
**Issue:** `!(clave in manifiesto)` consults the prototype chain. Route keys always contain a space (`"GET /x"`), so no `Object.prototype` property can collide today — but the file is explicitly the pattern the next four phases will copy, and `in` on plain-object registries is a latent hazard.
**Fix:** `!Object.hasOwn(manifiesto, clave)` (Node 18+, already the runtime floor).

### IN-03: `createEligibleFreemium` inserts `users` without `tenantValues` — inconsistent with the phase's explicit-stamp convention

**File:** `el-templo-api/test/helpers.ts:685-698`
**Issue:** Phase 171 made both sibling helpers stamp the tenant explicitly even when it is 1 (documented rationale: T-168-15, "un insert que se olvide de la columna cae en El Templo sin avisar"). `createEligibleFreemium` still relies on the column DEFAULT. Behavior is correct today (tenant 1 intended), but the file now carries two contradictory conventions side by side, and this helper will need touching again when fases 172-175 audit fixtures.
**Fix:** Route the insert through `tenantValues({ tenantId: 1 }, { ... })` for consistency (no behavior change), or add a one-line comment stating the DEFAULT-1 reliance is deliberate.

---

_Reviewed: 2026-07-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
