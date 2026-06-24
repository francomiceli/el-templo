/**
 * Integration tests for the coach QR self-scan (Phase 143, D-Q2).
 *
 * Endpoint: POST /api/members/attendance/check-in
 *
 * A user with role 'coach' uses the EXISTING member check-in flow to register
 * their OWN attendance. The QR's branchId is validated against the coach's
 * user_branches rows: a coach assigned to branch A can self-scan A but NOT a
 * branch they are not assigned to. This is operational attendance for the coach
 * — independent of rating attribution (which comes from the roster, D-Q1) —
 * and skips ALL member enforcement (subscription/plan/budget/booking).
 *
 * Coverage:
 *  - Coach assigned to branch A scans A's QR → 201, attendance row with their id.
 *  - Same coach scans branch B's QR (not assigned) → error, no row.
 *  - Coach scans A twice the same day → second attempt rejected (one-per-day).
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { generateQrToken } from "../../src/modules/shared/qr-token";

const URL = "/api/members/attendance/check-in";

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

interface SeededContext {
  branchAId: number;
  branchBId: number;
  coachId: number;
  coachToken: string;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  // Branch A — coach is assigned here.
  const [branchA] = await app.db
    .insert(schema.branches)
    .values({
      name: "A-SelfScan-Test",
      code: nextSuffix("ASS"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  // Branch B — coach is NOT assigned here.
  const [branchB] = await app.db
    .insert(schema.branches)
    .values({
      name: "B-SelfScan-Test",
      code: nextSuffix("BSS"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  // createStaffUser auto-inserts a user_branches row for the coach's branchId
  // (branch A only) — so the coach is assigned to A and NOT to B.
  const coachId = await createStaffUser(app, {
    email: "coach-selfscan@test.com",
    password: "coach-pass-123",
    firstName: "Coach",
    lastName: "SelfScan",
    role: "coach",
    branchId: branchA.id,
  });
  const coachToken = await getAuthToken(
    app,
    "coach-selfscan@test.com",
    "coach-pass-123",
  );

  return {
    branchAId: branchA.id,
    branchBId: branchB.id,
    coachId,
    coachToken,
  };
}

async function coachAttendanceRows(
  app: FastifyInstance,
  coachId: number,
): Promise<Array<{ id: number; branchId: number; source: string }>> {
  return app.db
    .select({
      id: schema.attendance.id,
      branchId: schema.attendance.branchId,
      source: schema.attendance.source,
    })
    .from(schema.attendance)
    .where(eq(schema.attendance.memberId, coachId));
}

describe("POST /api/members/attendance/check-in — coach self-scan", () => {
  let app: FastifyInstance;
  let ctx: SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    ctx = await seedFixtures(app);
  });

  it("coach assigned to branch A self-scans A → 201, attendance row with their id", async () => {
    const token = generateQrToken(ctx.branchAId);
    const res = await app.inject({
      method: "POST",
      url: URL,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
      payload: { qrToken: token },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      memberId: number;
      branchId: number;
      source: string;
    };
    expect(body.memberId).toBe(ctx.coachId);
    expect(body.branchId).toBe(ctx.branchAId);
    expect(body.source).toBe("qr");

    const rows = await coachAttendanceRows(app, ctx.coachId);
    expect(rows).toHaveLength(1);
    expect(rows[0].branchId).toBe(ctx.branchAId);
  });

  it("coach scans branch B (not assigned) → error, no attendance row", async () => {
    const token = generateQrToken(ctx.branchBId);
    const res = await app.inject({
      method: "POST",
      url: URL,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
      payload: { qrToken: token },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);

    const rows = await coachAttendanceRows(app, ctx.coachId);
    expect(rows).toHaveLength(0);
  });

  it("coach scans branch A twice the same day → second attempt rejected (one-per-day)", async () => {
    const token = generateQrToken(ctx.branchAId);

    const first = await app.inject({
      method: "POST",
      url: URL,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
      payload: { qrToken: token },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: URL,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
      payload: { qrToken: token },
    });
    expect(second.statusCode).toBeGreaterThanOrEqual(400);
    expect(second.statusCode).toBeLessThan(500);

    // Only the first scan persisted.
    const rows = await app.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, ctx.coachId),
          eq(schema.attendance.branchId, ctx.branchAId),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});
