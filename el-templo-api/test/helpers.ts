/**
 * Test helpers for API integration tests.
 *
 * Provides createTestApp() using the existing buildApp() factory,
 * auth helpers for registering users and obtaining JWT tokens,
 * and a shared cleanup function for inter-file test isolation.
 */

import { buildApp } from "../src/app";
import { eq, sql } from "drizzle-orm";
import argon2 from "argon2";
import * as schema from "../src/db/schema";
import type { FastifyInstance } from "fastify";

/**
 * Create a Fastify test app instance connected to the eltemplo_test database.
 * Environment variables are set by vitest.config.ts env block, but we
 * reinforce the critical ones here for safety.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  process.env.DB_NAME = "eltemplo_test";
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-for-testing";

  const app = await buildApp();
  await app.ready();
  return app;
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
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      firstName: "Test",
      lastName: "User",
      dni: `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      phone: "+5491100000000",
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
 * Deletes from every user-data table in FK-safe order, preserving only
 * the seed data (admin user, branch, spom_config). Call this in beforeEach
 * to guarantee a clean slate regardless of what previous test files wrote.
 */
export async function cleanAllTestData(app: FastifyInstance): Promise<void> {
  // Layer 0: notification tables (depend on users and templates)
  await app.db.delete(schema.pendingNotifications);
  await app.db.delete(schema.notificationPreferences);
  await app.db.delete(schema.deviceTokens);
  await app.db.delete(schema.notificationTemplates);

  // Layer 0b: program enrollments, onboarding, and check-in tables (depend on users)
  await app.db.delete(schema.programEnrollments);
  await app.db.delete(schema.programContentBlocks);
  // NOTE: programs deleted in Layer 3b (after subscriptionPlans due to linkedProgramId FK)
  await app.db.delete(schema.checkInResponses);
  await app.db.delete(schema.onboardingAnalytics);
  await app.db.delete(schema.memberProfiles);

  // Layer 1: junction tables and leaf tables (no dependents)
  await app.db.delete(schema.blogPostTags);
  await app.db.delete(schema.bookings);
  await app.db.delete(schema.subscriptionScheduleChanges);
  await app.db.delete(schema.subscriptionSchedules);
  await app.db.delete(schema.completedSessions);
  await app.db.delete(schema.sessionTraces);
  await app.db.delete(schema.sessionBlocks);
  await app.db.delete(schema.sessionEditLogs);
  await app.db.delete(schema.sessionPrescriptions);
  await app.db.delete(schema.savedBlocks);
  await app.db.delete(schema.evaluationRequests);
  await app.db.delete(schema.formatCompatibility);
  await app.db.delete(schema.memberLogins);
  await app.db.delete(schema.memberProfiles);

  // Layer 2: tables that reference layer-3 parents
  await app.db.delete(schema.memberProfiles);
  await app.db.delete(schema.attendance);
  await app.db.delete(schema.payments);
  await app.db.delete(schema.auraTransactions);
  await app.db.delete(schema.memberNotes);
  await app.db.delete(schema.holidays);
  // Phase 101: debts FK(user_id → users.id) blocks user delete if rows remain.
  await app.db.delete(schema.debts);

  // Layer 3: core entity tables
  await app.db.delete(schema.promoPlans);
  await app.db.delete(schema.subscriptions);
  await app.db.delete(schema.schedules);
  await app.db.delete(schema.subscriptionPlans);
  // Layer 3b: programs depends on subscriptionPlans.linkedProgramId being clear
  await app.db.delete(schema.programs);
  await app.db.delete(schema.auraBalances);
  await app.db.delete(schema.activities);
  await app.db.delete(schema.sessions);

  // Layer 4: reference/config tables
  await app.db.delete(schema.blogPosts);
  await app.db.delete(schema.blogTags);
  await app.db.delete(schema.academyInquiries);
  await app.db.delete(schema.appWaitlist);
  await app.db.delete(schema.labsInquiries);
  await app.db.delete(schema.franchiseApplications);
  await app.db.delete(schema.gladiusInquiries);
  await app.db.delete(schema.gladiusProducts);
  await app.db.delete(schema.systemSettings);

  // SPOM reference tables
  await app.db.delete(schema.exercises);
  await app.db.delete(schema.formats);
  await app.db.delete(schema.routes);
  await app.db.delete(schema.spomRules);
  await app.db.delete(schema.intensityRules);
  await app.db.delete(schema.contractionRules);
  await app.db.delete(schema.weeklyRotator);

  // Layer 5: user management test data
  // (nothing extra needed; non-admin users are cleaned below)

  // Reset user flags and delete non-admin users
  await app.db.update(schema.users).set({ boardingPassUsed: false });
  const testUsers = await app.db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users);
  for (const u of testUsers) {
    if (u.email !== "admin@test.com") {
      await app.db.delete(schema.users).where(eq(schema.users.id, u.id));
    }
  }
}

/**
 * Create a staff user directly in the database (bypasses API auth).
 * Returns the created user's ID.
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
  },
): Promise<number> {
  const passwordHash = await argon2.hash(data.password);
  const [result] = await app.db
    .insert(schema.users)
    .values({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role as "coach" | "admin" | "owner" | "gestion" | "recepcion",
      branchId: data.branchId,
    })
    .$returningId();
  return result.id;
}
