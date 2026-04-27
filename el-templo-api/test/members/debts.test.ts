/**
 * Phase 101 — Debt Tracking integration tests.
 *
 * Covers:
 *   - Debt create/upsert/cancel via PUT /api/admin/members/:userId
 *   - GET /api/admin/members ?debtorOnly=true filtering
 *   - totalDebtByCurrency grouping + filter-scope
 *   - JSON schema validation (amount, currency, note length)
 *   - RBAC: CAJA_ROLES-only debt writes (gestion allowed; recepcion + coach get 403)
 *   - Soft-cancel preserves history (row count invariant)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import { debts } from "../../src/db/schema/debts";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

describe("Debt tracking", () => {
  let app: FastifyInstance;
  let adminToken: string; // owner role — can write debts
  let testPlanId: number;

  const getBaseMember = () => ({
    email: "debt-member@test.com",
    firstName: "Juan",
    lastName: "Deudor",
    phone: "+5491155551234",
    dni: "31123456",
    branchId: 1,
    planId: testPlanId,
  });

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTestPlan(): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Test Debt Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      },
    });
    return JSON.parse(res.body).id;
  }

  async function createMember(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...getBaseMember(), ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  beforeEach(async () => {
    await cleanAllTestData(app);
    testPlanId = await createTestPlan();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: create active debt
  // ─────────────────────────────────────────────────────────────────────────
  it("creates an active debt via PUT with debt payload", async () => {
    const m = await createMember();

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        debt: {
          amount: 20000,
          currency: "ARS",
          note: "mensualidad abril",
        },
      },
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.body);
    expect(putBody.debt).toEqual({
      amount: 20000,
      currency: "ARS",
      note: "mensualidad abril",
    });

    // Debtor list should contain this user with populated debt
    const listRes = await app.inject({
      method: "GET",
      url: "/api/admin/members?debtorOnly=true",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.members).toHaveLength(1);
    expect(listBody.members[0].id).toBe(m.id);
    expect(listBody.members[0].debt).toEqual({
      amount: 20000,
      currency: "ARS",
      note: "mensualidad abril",
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: upsert — sending debt again updates the same row (invariant: 1
  // active row per user)
  // ─────────────────────────────────────────────────────────────────────────
  it("updates the existing active debt row on second PUT (upsert, no duplicate row)", async () => {
    const m = await createMember();

    // First PUT — creates the debt
    await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        debt: { amount: 20000, currency: "ARS", note: "original" },
      },
    });

    // Second PUT — should UPDATE the same row, not create a new one
    const putRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        debt: { amount: 25000, currency: "USD", note: "updated" },
      },
    });
    expect(putRes.statusCode).toBe(200);

    // Verify only ONE active row exists for this user
    const activeRows = await app.db
      .select({ id: debts.id })
      .from(debts)
      .where(and(eq(debts.userId, m.id), eq(debts.isCancelled, false)));
    expect(activeRows).toHaveLength(1);

    // And the row now reflects the new values
    const [latest] = await app.db
      .select({
        amount: debts.amount,
        currency: debts.currency,
        note: debts.note,
      })
      .from(debts)
      .where(and(eq(debts.userId, m.id), eq(debts.isCancelled, false)));
    expect(latest).toEqual({
      amount: 25000,
      currency: "USD",
      note: "updated",
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: cancel via debt: null — soft cancel, no longer shows in
  // debtorOnly list
  // ─────────────────────────────────────────────────────────────────────────
  it("soft-cancels the active debt when debt:null is sent", async () => {
    const m = await createMember();

    await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: 15000, currency: "ARS" } },
    });

    // Cancel
    const cancelRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: null },
    });
    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body);
    expect(cancelBody.debt).toBeNull();

    // debtorOnly list should be empty
    const listRes = await app.inject({
      method: "GET",
      url: "/api/admin/members?debtorOnly=true",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(listRes.body).members).toHaveLength(0);

    // But the DB row still exists and is soft-cancelled
    const allRows = await app.db
      .select({
        id: debts.id,
        isCancelled: debts.isCancelled,
        cancelledAt: debts.cancelledAt,
      })
      .from(debts)
      .where(eq(debts.userId, m.id));
    expect(allRows).toHaveLength(1);
    expect(allRows[0].isCancelled).toBe(true);
    expect(allRows[0].cancelledAt).not.toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: list without debtorOnly toggle — includes debt per row and always
  // returns totalDebtByCurrency
  // ─────────────────────────────────────────────────────────────────────────
  it("list without debtorOnly toggle returns debt per row and always includes totalDebtByCurrency", async () => {
    const debtor = await createMember();
    const nonDebtor = await createMember({
      email: "nondebtor@test.com",
      dni: "32222222",
    });

    await app.inject({
      method: "PUT",
      url: `/api/admin/members/${debtor.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: 5000, currency: "ARS" } },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("totalDebtByCurrency");
    expect(Array.isArray(body.totalDebtByCurrency)).toBe(true);

    const debtorRow = body.members.find(
      (m: { id: number }) => m.id === debtor.id,
    );
    const nonRow = body.members.find(
      (m: { id: number }) => m.id === nonDebtor.id,
    );
    expect(debtorRow.debt).toEqual({
      amount: 5000,
      currency: "ARS",
      note: null,
    });
    expect(nonRow.debt).toBeNull();

    // totalDebtByCurrency contains ARS 5000
    expect(body.totalDebtByCurrency).toContainEqual({
      currency: "ARS",
      amount: 5000,
    });
  });

  it("returns empty totalDebtByCurrency when no debts exist in filter set", async () => {
    await createMember();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.totalDebtByCurrency).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: totalDebtByCurrency groups by currency and respects branchId
  // ─────────────────────────────────────────────────────────────────────────
  it("totalDebtByCurrency groups by currency and is scoped to active filters (branchId)", async () => {
    // Seed a second branch so we can partition members.
    const [branchInsert] = await app.db
      .insert(branches)
      .values({
        name: "Debt Test Branch B",
        code: "DBTB",
        country: "AR",
      })
      .$returningId();
    const branchBId = branchInsert.id;

    const m1 = await createMember({ email: "m1@test.com", dni: "40111000" });
    const m2 = await createMember({ email: "m2@test.com", dni: "40112000" });
    const m3 = await createMember({
      email: "m3@test.com",
      dni: "40113000",
      branchId: branchBId,
    });

    // Debts: m1 ARS 20000, m2 ARS 30000, m3 USD 50
    await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: 20000, currency: "ARS" } },
    });
    await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m2.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: 30000, currency: "ARS" } },
    });
    await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m3.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: 50, currency: "USD" } },
    });

    // Filter to branchId=1 (m1 + m2) + debtorOnly
    const res1 = await app.inject({
      method: "GET",
      url: "/api/admin/members?debtorOnly=true&branchId=1",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body1 = JSON.parse(res1.body);
    expect(body1.members).toHaveLength(2);
    // Only ARS 50000 — USD debt on branch B should be excluded
    expect(body1.totalDebtByCurrency).toHaveLength(1);
    expect(body1.totalDebtByCurrency).toContainEqual({
      currency: "ARS",
      amount: 50000,
    });

    // Filter to branch B (m3 only) — USD 50
    const res2 = await app.inject({
      method: "GET",
      url: `/api/admin/members?debtorOnly=true&branchId=${branchBId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body2 = JSON.parse(res2.body);
    expect(body2.members).toHaveLength(1);
    expect(body2.totalDebtByCurrency).toHaveLength(1);
    expect(body2.totalDebtByCurrency).toContainEqual({
      currency: "USD",
      amount: 50,
    });

    // No branch filter — both currencies
    const resAll = await app.inject({
      method: "GET",
      url: "/api/admin/members?debtorOnly=true",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const bodyAll = JSON.parse(resAll.body);
    expect(
      bodyAll.totalDebtByCurrency.sort(
        (a: { currency: string }, b: { currency: string }) =>
          a.currency.localeCompare(b.currency),
      ),
    ).toEqual([
      { currency: "ARS", amount: 50000 },
      { currency: "USD", amount: 50 },
    ]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6 + 7 + 8: validation
  // ─────────────────────────────────────────────────────────────────────────
  it("rejects debt with amount <= 0", async () => {
    const m = await createMember();

    const zeroRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: 0, currency: "ARS" } },
    });
    expect(zeroRes.statusCode).toBe(400);

    const negRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: -500, currency: "ARS" } },
    });
    expect(negRes.statusCode).toBe(400);
  });

  it("rejects debt with unknown currency code", async () => {
    const m = await createMember();
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: 100, currency: "ZZZ" } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects debt with note longer than 500 characters", async () => {
    const m = await createMember();
    const longNote = "x".repeat(501);
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        debt: { amount: 100, currency: "ARS", note: longNote },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 9 + 10: RBAC — debt writes are CAJA_ROLES-only
  // ─────────────────────────────────────────────────────────────────────────
  it("returns 403 when recepcion sends a debt payload (but allows non-debt edits)", async () => {
    const m = await createMember();

    await createStaffUser(app, {
      email: "recepcion@test.com",
      password: "reppass123",
      firstName: "Rec",
      lastName: "Test",
      role: "recepcion",
      branchId: 1,
    });
    const recepcionToken = await getAuthToken(
      app,
      "recepcion@test.com",
      "reppass123",
    );

    // Debt write → 403
    const debtRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${recepcionToken}` },
      payload: { debt: { amount: 1000, currency: "ARS" } },
    });
    expect(debtRes.statusCode).toBe(403);

    // Non-debt write → 200
    const profileRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${recepcionToken}` },
      payload: { firstName: "UpdatedName" },
    });
    expect(profileRes.statusCode).toBe(200);

    // Also: a null-cancel is a debt write → 403
    const cancelRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${recepcionToken}` },
      payload: { debt: null },
    });
    expect(cancelRes.statusCode).toBe(403);
  });

  it("returns 403 when coach sends a debt payload", async () => {
    const m = await createMember();

    await createStaffUser(app, {
      email: "coach@test.com",
      password: "coachpass123",
      firstName: "Coach",
      lastName: "Test",
      role: "coach",
      branchId: 1,
    });
    const coachToken = await getAuthToken(
      app,
      "coach@test.com",
      "coachpass123",
    );

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { debt: { amount: 1000, currency: "ARS" } },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows gestion to upsert and cancel debts", async () => {
    const m = await createMember();

    await createStaffUser(app, {
      email: "gestion@test.com",
      password: "gestpass123",
      firstName: "Ges",
      lastName: "Test",
      role: "gestion",
      branchId: 1,
    });
    const gestionToken = await getAuthToken(
      app,
      "gestion@test.com",
      "gestpass123",
    );

    const upsertRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${gestionToken}` },
      payload: { debt: { amount: 1500, currency: "ARS", note: "test" } },
    });
    expect(upsertRes.statusCode).toBe(200);

    const cancelRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${gestionToken}` },
      payload: { debt: null },
    });
    expect(cancelRes.statusCode).toBe(200);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 11: no hard delete — cancelled rows are preserved
  // ─────────────────────────────────────────────────────────────────────────
  it("preserves soft-cancelled rows (no DELETE)", async () => {
    const m = await createMember();

    await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: { amount: 1000, currency: "ARS" } },
    });
    await app.inject({
      method: "PUT",
      url: `/api/admin/members/${m.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { debt: null },
    });

    const rows = await app.db
      .select({ id: debts.id })
      .from(debts)
      .where(eq(debts.userId, m.id));
    expect(rows).toHaveLength(1); // soft-cancelled, still present
  });

  // Silence unused-import warning when the helper isn't exercised directly.
  // (users schema is used indirectly via other seeded test data.)
  it("has users schema importable (sanity)", async () => {
    const [u] = await app.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.email, "admin@test.com"))
      .limit(1);
    expect(u?.email).toBe("admin@test.com");
  });
});
