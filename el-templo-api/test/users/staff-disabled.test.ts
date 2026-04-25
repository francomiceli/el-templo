/**
 * Phase 103-06: PATCH /api/admin/users/:userId/status — Integration Tests (R11)
 *
 * Verifies the migrated staff toggle endpoint:
 *   - Payload field renamed `isActive` → `disabled` (semantic inversion)
 *   - Backend writes `users.staff_disabled` (NOT the dropped `users.is_active`)
 *   - Response payload exposes `staffDisabled` per row (not `isActive`)
 *   - Old `{ isActive: ... }` payload is rejected with 400 (T-103-09)
 *   - Auth gate still applied (non-owner gets 403; missing auth gets 401)
 *
 * Runs against real MySQL (eltemplo_test). Uses the shared `createStaffUser`
 * helper for fixture creation; cleans test data per test for isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const STATUS_URL = (id: number) => `/api/admin/users/${id}/status`;

describe("Phase 103-06 — PATCH /api/admin/users/:id/status (R11)", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let coachId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Re-acquire token because cleanAllTestData may have invalidated it
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    coachId = await createStaffUser(app, {
      email: "coach-103-06@test.com",
      password: "testpass123",
      firstName: "Coach",
      lastName: "Disable",
      role: "coach",
      branchId: 1,
    });
  });

  // ─── Test 1: { disabled: true } writes staff_disabled = 1 ───────────────

  it("PATCH { disabled: true } sets users.staff_disabled = 1", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: STATUS_URL(coachId),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { disabled: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("staffDisabled", true);
    // The legacy field MUST NOT appear in the new contract
    expect(body).not.toHaveProperty("isActive");

    // DB-level assertion: the staff_disabled column was written
    const [row] = await app.db
      .select({ staffDisabled: schema.users.staffDisabled })
      .from(schema.users)
      .where(eq(schema.users.id, coachId));
    // MySQL returns BOOLEAN as 1/0 via tinyint; Drizzle coerces to boolean
    expect(row.staffDisabled).toBe(true);
  });

  // ─── Test 2: { disabled: false } restores active staff ──────────────────

  it("PATCH { disabled: false } reactivates a previously-disabled coach", async () => {
    // Pre-condition: coach starts disabled
    await app.db
      .update(schema.users)
      .set({ staffDisabled: true })
      .where(eq(schema.users.id, coachId));

    const res = await app.inject({
      method: "PATCH",
      url: STATUS_URL(coachId),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { disabled: false },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.staffDisabled).toBe(false);

    const [row] = await app.db
      .select({ staffDisabled: schema.users.staffDisabled })
      .from(schema.users)
      .where(eq(schema.users.id, coachId));
    expect(row.staffDisabled).toBe(false);
  });

  // ─── Test 3: legacy payload rejected (T-103-09) ──────────────────────────

  it("rejects PATCH with legacy { isActive: true } payload (400)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: STATUS_URL(coachId),
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { isActive: true },
    });

    // additionalProperties: false in toggleStatusSchema rejects unknown
    // fields; required: ['disabled'] also blocks the missing-field path.
    expect(res.statusCode).toBe(400);

    // Belt-and-braces: the column was NOT touched by the rejected request
    const [row] = await app.db
      .select({ staffDisabled: schema.users.staffDisabled })
      .from(schema.users)
      .where(eq(schema.users.id, coachId));
    expect(row.staffDisabled).toBe(false);
  });

  // ─── Test 4: missing auth → 401 (Fastify default) ────────────────────────

  it("rejects PATCH without auth token (401)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: STATUS_URL(coachId),
      payload: { disabled: true },
    });

    expect([401, 403]).toContain(res.statusCode);
  });

  // ─── Test 5: non-owner role → 403 (existing route guard) ────────────────

  it("rejects PATCH from a non-owner staff role (403)", async () => {
    const adminUserId = await createStaffUser(app, {
      email: "admin-103-06@test.com",
      password: "testpass123",
      firstName: "Plain",
      lastName: "Admin",
      role: "admin",
      branchId: 1,
    });
    void adminUserId;
    const adminToken = await getAuthToken(
      app,
      "admin-103-06@test.com",
      "testpass123",
    );

    const res = await app.inject({
      method: "PATCH",
      url: STATUS_URL(coachId),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { disabled: true },
    });

    expect(res.statusCode).toBe(403);
  });

  // ─── Test 6: list endpoint exposes staffDisabled (not isActive) ─────────

  it("GET /api/admin/users response includes staffDisabled per row (R11 list contract)", async () => {
    // Disable our fixture coach so the field has both states represented
    await app.db
      .update(schema.users)
      .set({ staffDisabled: true })
      .where(eq(schema.users.id, coachId));

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);

    const found = body.find(
      (r: { id: number; staffDisabled?: boolean; isActive?: boolean }) =>
        r.id === coachId,
    );
    expect(found).toBeDefined();
    expect(found.staffDisabled).toBe(true);
    // The legacy field is gone from the list response
    expect(found).not.toHaveProperty("isActive");
  });

  // ─── Test 7: createStaff inserts non-member roles with status: null (R7) ─

  it("createStaff insert path leaves users.status = NULL for non-member roles (BLOCKER 1)", async () => {
    // Use the API endpoint to exercise the real createStaff service path
    // (the helper inserts directly via the DB, bypassing the new code).
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        firstName: "New",
        lastName: "Coach",
        email: "newcoach-103-06@test.com",
        password: "secure123",
        role: "coach",
        branchId: 1,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();

    const [row] = await app.db
      .select({ status: schema.users.status, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, body.id));
    expect(row.role).toBe("coach");
    // R7 acceptance for non-member roles: status MUST be NULL.
    expect(row.status).toBeNull();
  });
});
