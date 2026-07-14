/**
 * Test helpers for API integration tests.
 *
 * Provides createTestApp() using the existing buildApp() factory,
 * auth helpers for registering users and obtaining JWT tokens,
 * and a shared cleanup function for inter-file test isolation.
 */

import { buildApp } from "../src/app";
import { sql, getTableName, eq, and } from "drizzle-orm";
import argon2 from "argon2";
import * as schema from "../src/db/schema";
import type { FastifyInstance } from "fastify";

/**
 * Create a Fastify test app instance connected to the per-worker test
 * database. DB_NAME is set by test/setup.ts (it includes a suffix derived
 * from VITEST_POOL_ID so parallel workers don't share state).
 *
 * NODE_ENV and JWT_SECRET are set by vitest.config.ts env block.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

/**
 * Date helpers for test fixtures. Keep dates within the assignPlan
 * validation window (-90 / +60 days from today) so production guardrails
 * apply uniformly to test code as well.
 */
export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function dateOffsetStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Phase 111 Plan 04 (REQ-5): autorregister blocks duplicate phones via
// last-10-digit normalization, so test fixtures must produce a globally
// unique last-10 per registration. We combine a millisecond timestamp with
// an in-process counter so back-to-back calls in the same ms still differ.
let __phoneSeq = 0;
function makeUniquePhoneLast10(): string {
  __phoneSeq = (__phoneSeq + 1) % 10000;
  // 10 digits = (timestamp last 6 digits) + (4-digit zero-padded counter)
  const tsTail = String(Date.now() % 1_000_000).padStart(6, "0");
  const seq = String(__phoneSeq).padStart(4, "0");
  return `${tsTail}${seq}`;
}

/**
 * Log in with email/password and return the JWT token.
 */
export async function getAuthToken(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  const body = JSON.parse(response.body);
  if (!body.token) {
    throw new Error(`Login failed for ${email}: ${response.body}`);
  }
  return body.token;
}

/**
 * Register a new user and return the token + user object.
 * Provides defaults for dni, phone, firstName, and lastName so existing
 * callers across all test files work without modification.
 */
export async function registerUser(
  app: FastifyInstance,
  data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    branchId: number;
    dni?: string;
    phone?: string;
    promoCode?: string;
    gender?: string;
  },
): Promise<{
  token: string;
  user: Record<string, unknown>;
  promoApplied?: boolean;
}> {
  // Phase 111 Plan 04 (REQ-5): /auth/register now blocks duplicate phones
  // (normalized last-10 digits, AR mobile convention). Generate a unique
  // last-10 per call so the dozens of legacy callers that don't override
  // phone don't collide with each other when they run sequentially in the
  // same per-worker DB. Mirrors the existing dni randomization above.
  const uniquePhoneLast10 = makeUniquePhoneLast10();
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      firstName: "Test",
      lastName: "User",
      dni: `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      phone: `+549${uniquePhoneLast10}`,
      gender: "male",
      ...data,
    },
  });
  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(
      `registerUser failed for ${data.email}: ${response.statusCode} ${response.body}`,
    );
  }
  return JSON.parse(response.body);
}

/**
 * Comprehensive cleanup of ALL test data tables.
 *
 * Pulls a single dedicated connection from the pool and runs every
 * statement on it sequentially. This guarantees that:
 *   1. SET FOREIGN_KEY_CHECKS=0 stays in scope for every DELETE (the
 *      session variable is per-connection, so multiple pool.query() calls
 *      could pick different connections and re-enable FK checks mid-way).
 *   2. We never depend on mysql2's multi-statement support, which silently
 *      drops statements after the first in CI (verified empirically — works
 *      locally, fails in CI's MySQL 8.0 service container).
 *
 * Round-trip count: ~55. On a local socket this is ~1ms total, far cheaper
 * than the previous Drizzle-per-table version which paid pool acquire/release
 * overhead on every DELETE.
 *
 * Preserves only the seed data: admin@test.com user and the seeded
 * branches / spom_config rows.
 */
const TABLES_TO_CLEAN = [
  // Phase 119 campaign tables. FK ordering (FK checks are disabled below, so
  // strictly cosmetic, but kept correct): events -> sends -> unsubscribes ->
  // campaigns, all before users.
  schema.campaignEvents,
  schema.campaignSends,
  schema.campaignUnsubscribes,
  schema.campaigns,
  // Notification + onboarding (FK to users)
  schema.pendingNotifications,
  schema.notificationPreferences,
  schema.deviceTokens,
  schema.notificationTemplates,
  schema.programEnrollments,
  schema.programContentBlocks,
  schema.checkInResponses,
  schema.onboardingAnalytics,
  schema.memberProfiles,
  schema.userSepaDetails,
  // Junction + leaf tables
  schema.userBranches,
  schema.blogPostTags,
  schema.bookings,
  schema.scheduleExceptions,
  schema.subscriptionScheduleChanges,
  schema.subscriptionSchedules,
  schema.completedSessions,
  schema.sessionTraces,
  schema.sessionBlocks,
  schema.sessionEditLogs,
  schema.sessionPrescriptions,
  schema.savedBlocks,
  schema.evaluationRequests,
  schema.formatCompatibility,
  schema.memberLogins,
  schema.refreshTokens,
  schema.userStatusHistory,
  // Tables referencing layer-3 parents
  schema.attendance,
  schema.auraTransactions,
  // Fase 157: vínculo de referido + registro auditable. FK a users/subscriptions
  // (FK checks off durante el DELETE), se limpian para no filtrar vínculos entre tests.
  schema.referralCredits,
  schema.referrals,
  // v5.5 follow-up: clics del CTA del A/B test — sin limpiar se acumularían entre tests.
  schema.referralCtaClicks,
  schema.memberNotes,
  schema.holidays,
  // Phase 117: finance tables were missing here, leaking financial_transactions
  // across tests and polluting exact-total assertions (revenue per currency).
  // FK checks are disabled below, so order vs subscriptions/balances is moot.
  schema.transactionLinks,
  schema.balances,
  schema.financialTransactions,
  // Core entity tables
  schema.promoPlans,
  schema.subscriptions,
  schema.schedules,
  schema.subscriptionPlans,
  schema.programs,
  schema.auraBalances,
  schema.activities,
  schema.sessions,
  // Reference / config tables
  schema.blogPosts,
  schema.blogTags,
  schema.academyInquiries,
  schema.appWaitlist,
  schema.labsInquiries,
  schema.franchiseApplications,
  schema.gladiusInquiries,
  schema.gladiusProducts,
  schema.systemSettings,
  // SPOM reference tables
  schema.exercises,
  schema.formats,
  schema.routes,
  schema.spomRules,
  schema.intensityRules,
  schema.contractionRules,
  schema.weeklyRotator,
];

export async function cleanAllTestData(app: FastifyInstance): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    for (const t of TABLES_TO_CLEAN) {
      await conn.query(`DELETE FROM \`${getTableName(t)}\``);
    }
    // NULL-safe inequality: `email != 'admin@test.com'` returns NULL (not TRUE)
    // for rows with email IS NULL — Phase 102 trial users have null emails and
    // would survive cleanup, leaking IDs across test files within the same
    // vitest worker (per-worker DB, fileParallelism + isolate=false). The
    // `<=>` operator returns FALSE instead of NULL, so `NOT (email <=> ...)`
    // correctly catches both null and non-admin emails.
    await conn.query(
      "DELETE FROM `users` WHERE NOT (email <=> 'admin@test.com')",
    );
    await conn.query(
      "UPDATE `users` SET boarding_pass_used = 0 WHERE email = 'admin@test.com'",
    );
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}

// =========================================================================
// Canonical fixture helpers (use these in new tests instead of reinventing)
//
// Existing tests have local copies of similar helpers. New tests should use
// these canonical versions; over time, files being touched can migrate.
// =========================================================================

/**
 * Default subscription plan payload. Override per test as needed.
 */
export const DEFAULT_TEST_PLAN = {
  name: "Test Plan",
  planTier: "flex",
  bookingMode: "flexible",
  priceRegular: 15000,
  priceZero: 10000,
  durationDays: 30,
  classesPerWeek: 3,
};

/**
 * Phase 138: ensure an efectivo caja exists for a branch created inside a test.
 *
 * TransactionService.create() now resolves cash_register_id from paymentMethod
 * and HARD-THROWS ("No existe caja efectivo para la sucursal X") when a `cash`
 * payment hits a branch with no efectivo caja. Branches seeded by test/setup.ts
 * get a caja there, but branches a test inserts at runtime do not — call this
 * right after inserting such a branch when the test routes/creates cash charges
 * against it. Idempotent (skips if a caja already exists for the branch).
 */
export async function ensureEfectivoCaja(
  app: FastifyInstance,
  branchId: number,
  currency = "ARS",
): Promise<void> {
  const existing = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, branchId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;
  await app.db.insert(schema.cashRegisters).values({
    name: `Efectivo branch ${branchId}`,
    type: "efectivo",
    branchId,
    currency,
    cutoffDate: "2020-01-01",
  });
}

/**
 * Create a subscription plan via the admin API. Throws on non-201 so tests
 * fail fast at the setup step instead of cascading downstream.
 */
export async function createTestPlan(
  app: FastifyInstance,
  adminToken: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; [key: string]: unknown }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/subscriptions/plans",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { ...DEFAULT_TEST_PLAN, ...overrides },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createTestPlan failed: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body) as { id: number; [key: string]: unknown };
}

/**
 * Register a member via the auth API. Returns { id, token, email, ... } so
 * callers can both assert on the user and authenticate as them.
 *
 * Email defaults to a unique value so parallel/quick successive calls don't
 * collide; pass `overrides.email` when the test needs a specific one.
 */
export async function createTestMember(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): Promise<{
  id: number;
  token: string;
  email: string;
  [key: string]: unknown;
}> {
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const data = {
    email: `test-member-${uniqueSuffix}@test.com`,
    password: "pass123456",
    firstName: "Test",
    lastName: "Member",
    branchId: 1,
    ...overrides,
  } as {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    branchId: number;
    dni?: string;
    phone?: string;
  };
  const result = await registerUser(app, data);
  const user = result.user as { id: number; [key: string]: unknown };
  return {
    id: user.id,
    token: result.token,
    email: data.email,
    ...user,
  };
}

/**
 * Assign a subscription plan to a member. Returns both statusCode and body
 * (does NOT throw on non-201) so tests can assert on 409 / 400 / etc.
 */
export async function assignTestPlan(
  app: FastifyInstance,
  adminToken: string,
  userId: number,
  planId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `/api/admin/subscriptions/members/${userId}/subscription/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId: 1,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...overrides,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/**
 * Seed an AURA balance for a user. Idempotent (UPSERT).
 */
export async function seedAuraBalance(
  app: FastifyInstance,
  userId: number,
  amount: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO aura_balances (user_id, balance) VALUES (${userId}, ${amount})
        ON DUPLICATE KEY UPDATE balance = ${amount}`,
  );
}

/**
 * Create a staff user directly in the database (bypasses API auth).
 * Returns the created user's ID.
 *
 * Phase 110: `users.country` (varchar(2)) is required for admin/gestion to get
 * a non-null `scope.country` since the country-scope hook now reads
 * `users.country` directly (no longer a JOIN to branches). For backward
 * compatibility with the dozens of existing tests that pre-date Phase 110, when
 * `country` is not explicitly passed AND the role is admin/gestion, this helper
 * derives the country from the user's branch — mirroring the production
 * migration-0107 backfill (`UPDATE users SET country = (SELECT country FROM
 * branches WHERE id = users.branch_id) WHERE role IN ('admin','gestion')`).
 * Owner stays NULL (global access). Coach/recepción/member stay NULL.
 */
export async function createStaffUser(
  app: FastifyInstance,
  data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    branchId: number;
    country?: "AR" | "ES" | null;
  },
): Promise<number> {
  const passwordHash = await argon2.hash(data.password);

  // Phase 110 backfill mirror: when admin/gestion is created without an
  // explicit `country`, look it up from the branch (matches migration 0107
  // semantics so existing tests continue to work).
  let country: "AR" | "ES" | null = data.country ?? null;
  if (country === null && (data.role === "admin" || data.role === "gestion")) {
    const [branchRow] = await app.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(eq(schema.branches.id, data.branchId))
      .limit(1);
    if (branchRow?.country === "AR" || branchRow?.country === "ES") {
      country = branchRow.country;
    }
  }

  const [result] = await app.db
    .insert(schema.users)
    .values({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role as "coach" | "admin" | "owner" | "gestion" | "recepcion",
      branchId: data.branchId,
      country,
    })
    .$returningId();

  // Phase 110 backfill mirror: when coach/recepcion is created, auto-insert
  // their working sede into user_branches (matches migration 0107 semantics
  // so existing tests that rely on cardinality + canAccessBranch continue to
  // work without explicit user_branches setup).
  if (data.role === "coach" || data.role === "recepcion") {
    await app.db
      .insert(schema.userBranches)
      .values({ userId: result.id, branchId: data.branchId });
  }

  return result.id;
}

// =========================================================================
// Phase 119 campaign / trial fixtures
// =========================================================================

/**
 * Create a freemium user that is ELIGIBLE for the trial-session campaign and
 * for self-service trial reservation (Phase 119, D-08/D-10/D-20).
 *
 * Eligibility predicate (matches the audience query minus email/unsubscribe):
 *   - status = 'freemium'
 *   - a non-null email (so the campaign can address them)
 *   - created_at older than 3 days (D-10 freshness guard)
 *   - no active/paused/scheduled subscription
 *   - no non-cancelled is_trial booking
 *
 * Inserts the user directly (bypasses /register, which forces freemium + a
 * fresh created_at) so the test can pin an old created_at. Returns the user id
 * and the email snapshot used by campaign_sends.
 */
export async function createEligibleFreemium(
  app: FastifyInstance,
  overrides: { email?: string; createdAt?: Date; branchId?: number } = {},
): Promise<{ id: number; email: string }> {
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = overrides.email ?? `freemium-${uniqueSuffix}@test.com`;
  // Default created_at = 10 days ago (comfortably older than the 3-day guard).
  const createdAt =
    overrides.createdAt ?? new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const passwordHash = await argon2.hash("pass123456");

  const [result] = await app.db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      firstName: "Free",
      lastName: "Mium",
      role: "member",
      branchId: overrides.branchId ?? 1,
      status: "freemium",
      createdAt,
    })
    .$returningId();

  return { id: result.id, email };
}

/**
 * Create a campaign row directly in the DB. Returns the campaign id.
 */
export async function createTestCampaign(
  app: FastifyInstance,
  createdBy: number,
  overrides: Partial<{
    name: string;
    subject: string;
    status: string;
    country: string | null;
  }> = {},
): Promise<number> {
  const [result] = await app.db
    .insert(schema.campaigns)
    .values({
      name: overrides.name ?? "Test Campaign",
      subject: overrides.subject ?? "Tu sesión de prueba gratis",
      status: overrides.status ?? "draft",
      createdBy,
      country: overrides.country ?? null,
    })
    .$returningId();
  return result.id;
}

/**
 * Create a campaign_send row directly in the DB. Returns the send id.
 */
export async function createTestSend(
  app: FastifyInstance,
  campaignId: number,
  userId: number,
  email: string,
  overrides: Partial<{ status: string; resendMessageId: string }> = {},
): Promise<number> {
  const [result] = await app.db
    .insert(schema.campaignSends)
    .values({
      campaignId,
      userId,
      email,
      status: overrides.status ?? "sent",
      resendMessageId: overrides.resendMessageId ?? null,
    })
    .$returningId();
  return result.id;
}
