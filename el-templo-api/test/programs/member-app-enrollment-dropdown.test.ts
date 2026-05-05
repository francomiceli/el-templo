/**
 * Phase 112 Plan 06 — Member-app program selector regression test.
 *
 * Asserts that GET /api/members/me/enrollments surfaces enrollments
 * regardless of source (plan_linked, plan_bundle, admin_addon). The
 * dropdown built in phase 104 already iterates over this list — Plan 06
 * simply confirms that admin_addon rows created via Plan 04 surface
 * naturally without any source-based filter sneaking in.
 *
 * Real MySQL eltemplo_test, no mocks.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  registerUser,
  getAuthToken,
  cleanAllTestData,
  dateOffsetStr,
} from "../helpers";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";
import { createPlan, assignPlan } from "../subscriptions/_helpers";

interface MeEnrollment {
  id: number;
  programId: number;
  programName: string;
  goalPlanType: string | null;
  currentWeek: number;
  durationWeeks: number | null;
}

describe("GET /api/members/me/enrollments — admin_addon visibility (Phase 112 Plan 06)", () => {
  let app: FastifyInstance;
  let ownerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  // ─── Helpers ─────────────────────────────────────────────────────────

  async function seedProgram(
    overrides: Partial<typeof programs.$inferInsert> = {},
  ): Promise<number> {
    const result = await app.db.insert(programs).values({
      name: overrides.name ?? `Member Dropdown Prog ${Date.now()}`,
      description: overrides.description ?? "Test program",
      durationWeeks: overrides.durationWeeks ?? 4,
      sessionsPerWeekToAdvance: overrides.sessionsPerWeekToAdvance ?? 3,
      isActive: overrides.isActive ?? true,
      goalPlanType: overrides.goalPlanType ?? null,
      ...overrides,
    });
    return Number(result[0].insertId);
  }

  /**
   * Register a member, create a plan with linked_program_id pointing at the
   * given program, and assign it. After assign, EnrollmentService.enrollLinked
   * (Phase 112 Plan 02) should produce one enrollment with source='plan_linked'.
   */
  async function seedMemberWithLinkedPlan(
    linkedProgramId: number,
  ): Promise<{ userId: number; memberToken: string }> {
    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const member = await registerUser(app, {
      email: `mem-dd-${tag}@test.local`,
      password: "pass123456",
      firstName: "Drop",
      lastName: "Down",
      branchId: 1,
    });
    const userId = (member.user as { id: number }).id;
    const memberToken = member.token;

    const plan = await createPlan(app, ownerToken, {
      name: `Plan linked ${tag}`,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "online_regular",
      linkedProgramId,
    });
    const assignRes = await assignPlan(app, ownerToken, userId, {
      planId: plan.id,
      startDate: dateOffsetStr(-1),
    });
    expect(assignRes.statusCode).toBe(201);

    return { userId, memberToken };
  }

  async function getMyEnrollments(token: string) {
    return app.inject({
      method: "GET",
      url: "/api/members/me/enrollments",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function postAddon(userId: number, programId: number, pricePaid = 0) {
    return app.inject({
      method: "POST",
      url: `/api/admin/users/${userId}/program-addons`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { programId, pricePaid, paymentMethod: "cash" },
    });
  }

  // ─── Test 1 — plan_linked surfaces ───────────────────────────────────

  it("Test 1: plan_linked enrollment surfaces in /me/enrollments with the linked program row", async () => {
    const programId = await seedProgram({ name: "LinkedOnly" });
    const { memberToken } = await seedMemberWithLinkedPlan(programId);

    const res = await getMyEnrollments(memberToken);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { enrollments: MeEnrollment[] };
    expect(body.enrollments.length).toBe(1);
    expect(body.enrollments[0].programId).toBe(programId);
    expect(body.enrollments[0].programName).toBe("LinkedOnly");
  });

  // ─── Test 2 — admin_addon surfaces alongside plan_linked ─────────────

  it("Test 2: after admin assigns add-on, /me/enrollments returns BOTH plan_linked and admin_addon rows", async () => {
    const linkedProgramId = await seedProgram({ name: "LinkedProg" });
    const addonProgramId = await seedProgram({ name: "AddonProg" });
    const { userId, memberToken } =
      await seedMemberWithLinkedPlan(linkedProgramId);

    const addonRes = await postAddon(userId, addonProgramId, 0);
    expect(addonRes.statusCode).toBe(200);

    const res = await getMyEnrollments(memberToken);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { enrollments: MeEnrollment[] };

    const programIds = body.enrollments.map((e) => e.programId).sort();
    expect(programIds).toEqual([linkedProgramId, addonProgramId].sort());

    // DB-level cross-check — confirm the admin_addon row carries the
    // correct provenance (the read endpoint does NOT project source so
    // we verify directly).
    const dbRows = await app.db
      .select({
        programId: programEnrollments.programId,
        source: programEnrollments.source,
        status: programEnrollments.status,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, userId));
    const sourceByProgram = new Map(dbRows.map((r) => [r.programId, r.source]));
    expect(sourceByProgram.get(linkedProgramId)).toBe("plan_linked");
    expect(sourceByProgram.get(addonProgramId)).toBe("admin_addon");
    for (const r of dbRows) {
      expect(r.status).toBe("active");
    }
  });

  // ─── Test 3 — bundle plan: plan_bundle + admin_addon coexist ─────────

  it("Test 3: bundle plan auto-enrolls all programs as plan_bundle; an admin_addon stays alongside in /me/enrollments", async () => {
    // Two seeded active programs that will be picked up by the bundle's
    // grants_all_programs auto-enroll loop.
    const progA = await seedProgram({
      name: "BundleA",
      goalPlanType: "tren_superior",
    });
    const progB = await seedProgram({
      name: "BundleB",
      goalPlanType: "piernas_gluteos",
    });

    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const member = await registerUser(app, {
      email: `mem-bundle-${tag}@test.local`,
      password: "pass123456",
      firstName: "Bun",
      lastName: "Dle",
      branchId: 1,
    });
    const userId = (member.user as { id: number }).id;
    const memberToken = member.token;

    const bundle = await createPlan(app, ownerToken, {
      name: `Bundle plan ${tag}`,
      planCategory: "online_regular",
      grantsAllPrograms: true,
      priceRegular: 20000,
      priceZero: 20000,
      durationDays: 30,
    });
    const assignRes = await assignPlan(app, ownerToken, userId, {
      planId: bundle.id,
      startDate: dateOffsetStr(-1),
    });
    expect(assignRes.statusCode).toBe(201);

    // Add-on program is created AFTER bundle assignment so the bundle's
    // grants_all_programs sweep didn't already enroll it. The admin then
    // assigns it manually, exercising the addon path on top of the bundle.
    const progAddon = await seedProgram({
      name: "BundleAddon",
      goalPlanType: "core",
    });
    const addonRes = await postAddon(userId, progAddon, 0);
    expect(addonRes.statusCode).toBe(200);

    const res = await getMyEnrollments(memberToken);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { enrollments: MeEnrollment[] };
    const seenProgramIds = new Set(body.enrollments.map((e) => e.programId));

    // The bundle should have enrolled progA + progB; the add-on adds progAddon.
    expect(seenProgramIds.has(progA)).toBe(true);
    expect(seenProgramIds.has(progB)).toBe(true);
    expect(seenProgramIds.has(progAddon)).toBe(true);

    // DB-level provenance check — bundle rows are 'plan_bundle', addon is
    // 'admin_addon'. The read endpoint must NOT discriminate by source.
    const dbRows = await app.db
      .select({
        programId: programEnrollments.programId,
        source: programEnrollments.source,
      })
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, userId));
    const sourceByProgram = new Map(dbRows.map((r) => [r.programId, r.source]));
    expect(sourceByProgram.get(progA)).toBe("plan_bundle");
    expect(sourceByProgram.get(progB)).toBe("plan_bundle");
    expect(sourceByProgram.get(progAddon)).toBe("admin_addon");
  });

  // ─── Test 4 — cross-member isolation ─────────────────────────────────

  it("Test 4: /me/enrollments is scoped to the authenticated member — token from member B never returns member A's rows", async () => {
    const linkedA = await seedProgram({ name: "OnlyA" });
    const { memberToken: tokenA } = await seedMemberWithLinkedPlan(linkedA);

    // Independent member B with a different linked plan.
    const linkedB = await seedProgram({ name: "OnlyB" });
    const { memberToken: tokenB } = await seedMemberWithLinkedPlan(linkedB);

    const resA = await getMyEnrollments(tokenA);
    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.body) as { enrollments: MeEnrollment[] };
    expect(bodyA.enrollments.length).toBe(1);
    expect(bodyA.enrollments[0].programId).toBe(linkedA);

    const resB = await getMyEnrollments(tokenB);
    expect(resB.statusCode).toBe(200);
    const bodyB = JSON.parse(resB.body) as { enrollments: MeEnrollment[] };
    expect(bodyB.enrollments.length).toBe(1);
    expect(bodyB.enrollments[0].programId).toBe(linkedB);

    // Defense-in-depth — no leakage in either direction.
    const aProgramIdsSeenByB = bodyB.enrollments.map((e) => e.programId);
    expect(aProgramIdsSeenByB).not.toContain(linkedA);
  });
});
