/**
 * Shared helpers for the subscriptions test suite. The original
 * subscriptions.test.ts had local copies of these inline; centralizing them
 * here keeps the per-feature split files small and consistent.
 */

import { expect } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { registerUser, todayStr, dateOffsetStr } from "../helpers";

export { todayStr, dateOffsetStr };

export const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

/** Default plan payload for subscription tests. Tests override per-test. */
export const basePlan = {
  name: "Plan Flex Mensual",
  planTier: "flex",
  bookingMode: "flexible",
  priceRegular: 15000,
  priceZero: 10000,
  durationDays: 30,
  classesPerWeek: 3,
};

const baseMemberDefaults = {
  email: "sub-test-member@test.com",
  password: "pass123456",
  firstName: "Sub",
  lastName: "Tester",
  branchId: 1,
};

/** Create a subscription plan via the admin API. Throws on non-201. */
export async function createPlan(
  app: FastifyInstance,
  adminToken: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; [key: string]: unknown }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/plans`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { ...basePlan, ...overrides },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.body) as { id: number; [key: string]: unknown };
}

/** Register a member via the auth API (no auto-subscription). */
export async function createMember(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; [key: string]: unknown }> {
  const data = { ...baseMemberDefaults, ...overrides } as {
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
  return { id: user.id, ...user };
}

/**
 * Assign a plan to a member. Returns {statusCode, body} so tests can assert
 * on error paths (409, 400) without try/catch.
 */
export async function assignPlan(
  app: FastifyInstance,
  adminToken: string,
  userId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId: 1, // overridden via overrides
      branchId: 1,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...overrides,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/** Seed an AURA balance directly via DB (bypasses business rules). */
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
