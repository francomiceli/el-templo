/**
 * Phase 103-03: Member Creation Status Defaults — Integration Tests (R7)
 *
 * Verifies the per-endpoint status defaults at the entry points owned
 * by Plan 03 (single-owner rule):
 *   - POST /api/auth/register (no promo)        → status='freemium'
 *   - POST /api/auth/register (with valid promo)→ status='activo' (Plan 02 chain)
 *   - POST /api/admin/scheduling/trials         → status='prueba'
 *
 * Tests for the other 3 R7 acceptance scenarios live in their owning plans:
 *   - POST /api/admin/members (with/without planId) → Plan 04 (members/service.ts)
 *   - Staff role insert null status                  → Plan 06 (users/service.ts)
 *
 * Runs against real MySQL (eltemplo_test). NOTE: this file deliberately
 * does NOT use vi.useFakeTimers — Plan 02's recomputeUserStatus helper
 * compares subscription.end_date against MySQL's CURDATE(), which is bound
 * to the database server clock and not affected by Node-side fake timers.
 * Using the real clock keeps JS Date.now() and CURDATE() aligned so the
 * promo→activo transition is observable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
// Fase 173 (ADO-02): `users` entra a TENANT_STRICT_MODULES — las lecturas de
// conveniencia por id de este archivo se acotan con `tenantWhere` (categoría
// 2, docblock de `test/helpers.ts`); este archivo no siembra en el gimnasio 2.
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const REGISTER_URL = "/api/auth/register";
const TRIALS_URL = "/api/admin/scheduling/trials";
const ADMIN_SCHEDULING = "/api/admin/scheduling";

describe("Phase 103-03 — Member creation status defaults (R7)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let onlineBranchId: number;
  let presentialBranchId: number;
  let promoSubPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Resolve branches needed across tests.
    const [online] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "ONLINE"));
    if (!online) throw new Error("ONLINE branch missing from seed");
    onlineBranchId = online.id;

    const [presential] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false));
    if (!presential) throw new Error("No physical branch found in seed");
    presentialBranchId = presential.id;

    // Seed a subscription plan referenced by the promo (test 2).
    const [planResult] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "103-03 Promo Plan",
        planTier: "other",
        bookingMode: "flexible",
        priceRegular: 0,
        priceZero: 0,
        durationDays: 30,
        planCategory: "online_regular",
        isTrial: true,
      })
      .$returningId();
    promoSubPlanId = planResult.id;
  });

  function uniqueSuffix(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function buildRegisterPayload(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const u = uniqueSuffix();
    return {
      email: `m103-${u}@test.com`,
      password: "password123",
      firstName: "Default",
      lastName: "Tester",
      dni: `D103-${u}`,
      phone: `+549115555${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`,
      gender: "male",
      ...overrides,
    };
  }

  // ─── Test 1: /register (no promo) → freemium ──────────────────────────

  it("POST /register without promoCode → status='freemium'", async () => {
    const payload = buildRegisterPayload();

    const res = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.id).toBeTruthy();
    expect(body.promoApplied).toBe(false);

    // Default branch resolves to ONLINE per auth/routes.ts (no branchId
    // supplied) — confirming the freemium intent at the online entry point.
    expect(body.user.branchId).toBe(onlineBranchId);

    const [row] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, body.user.id),
        ),
      );
    expect(row.status).toBe("freemium");
  });

  // ─── Test 2: /register (with valid promo) → activo (Plan 02 chain) ────

  it("POST /register with valid promoCode → status='activo' (verifies Plan 02 recomputeUserStatus chain)", async () => {
    const promoCode = `PROMO-${uniqueSuffix()}`.toUpperCase();
    const now = new Date();
    await app.db.insert(schema.promoPlans).values({
      name: "103-03 Test Promo",
      promoCode,
      planDurationDays: 30,
      subscriptionPlanId: promoSubPlanId,
      startDate: new Date(now.getTime() - 86400000), // yesterday
      expiryDate: new Date(now.getTime() + 86400000), // tomorrow
      promoType: "auto",
      isActive: true,
    });

    const payload = buildRegisterPayload({ promoCode });

    const res = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.promoApplied).toBe(true);

    // The user was inserted with status='freemium' but the subsequent
    // assignPlan triggers Plan 02's recomputeUserStatus, flipping to 'activo'
    // inside the same transaction.
    const [row] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, body.user.id),
        ),
      );
    expect(row.status).toBe("activo");

    // Belt-and-braces: a subscription row exists.
    const subs = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, body.user.id));
    expect(subs.length).toBeGreaterThan(0);
  });

  // Phase 103 update: the legacy "POST /trials creates a prueba user"
  // assertion is no longer applicable — /trials only books an existing
  // user now. Coverage for the new flow lives in trials.test.ts (which
  // calls createPruebaUser via /admin/members and asserts status='prueba'
  // there). The /admin/members → prueba contract itself is exercised by
  // members-status-filter.test.ts.
});
