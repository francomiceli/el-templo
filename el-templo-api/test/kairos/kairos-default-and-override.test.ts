/**
 * Phase 130 Plan 01 (KAIROS-04, KAIROS-06, D-01, D-03, D-05).
 *
 * Regression suite for the kairos default + sticky coach override:
 *   1. POST /auth/register -> new member persisted level='kairos' (and echoed).
 *   2. POST /admin/members -> default kairos when no level supplied; explicit
 *      level still honored.
 *   3. POST /admin/members/trial -> trial/lead persisted level='kairos'.
 *   4. PUT /admin/members/:userId with a level change -> level_override=true.
 *   5. Real-client invariant: the production admin form ALWAYS sends `level`
 *      (seeded from the member's current level). Editing an unrelated field
 *      (phone) with the unchanged level must leave level + override untouched
 *      (CR-01 / D-05).
 *
 * Runs in CI (project policy: integration suite is not run locally).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { users } from "../../src/db/schema/users";

describe("Phase 130 - kairos default and coach override", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    testPlanId = await createTestPlan();
  });

  // Mirrors test/members/members.test.ts createTestPlan: admin POST /members
  // requires a planId, so each test needs a fresh plan after the clean.
  async function createTestPlan(): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Kairos Test Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).id;
  }

  // Read the persisted level + level_override straight from the DB.
  async function readLevelRow(
    userId: number,
  ): Promise<{ level: string; levelOverride: boolean } | undefined> {
    const [row] = await app.db
      .select({ level: users.level, levelOverride: users.levelOverride })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row;
  }

  // Test 1: self-registration is born kairos (persisted + echoed).
  it("POST /auth/register creates a member at level=kairos", async () => {
    const result = await registerUser(app, {
      email: "kairos-register@test.com",
      password: "pass123456",
      firstName: "Self",
      lastName: "Register",
      branchId: 1,
    });

    const user = result.user as { id: number; level: string };
    expect(user.level).toBe("kairos");

    const row = await readLevelRow(user.id);
    expect(row?.level).toBe("kairos");
    expect(row?.levelOverride).toBe(false);
  });

  // Test 2a: admin create with no explicit level defaults to kairos.
  it("POST /admin/members defaults to level=kairos when none supplied", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: "kairos-admin@test.com",
        firstName: "Admin",
        lastName: "Created",
        phone: "+5491155551234",
        dni: "30123456",
        branchId: 1,
        planId: testPlanId,
      },
    });
    expect(res.statusCode).toBe(201);
    const member = JSON.parse(res.body);

    const row = await readLevelRow(member.id);
    expect(row?.level).toBe("kairos");
    expect(row?.levelOverride).toBe(false);
  });

  // Test 2b: an explicit level is still honored (default only fills the gap).
  it("POST /admin/members honors an explicit level (delta)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: "kairos-explicit@test.com",
        firstName: "Explicit",
        lastName: "Delta",
        phone: "+5491155559876",
        dni: "30654321",
        branchId: 1,
        planId: testPlanId,
        level: "delta",
      },
    });
    expect(res.statusCode).toBe(201);
    const member = JSON.parse(res.body);

    const row = await readLevelRow(member.id);
    expect(row?.level).toBe("delta");
    expect(row?.levelOverride).toBe(false);
  });

  // Test 3: admin trial/lead create is born kairos.
  it("POST /admin/members/trial creates a lead at level=kairos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Lead",
        lastName: "Kairos",
        phone: "+5491166660001",
        branchId: 1,
      },
    });
    expect(res.statusCode).toBe(201);
    const lead = JSON.parse(res.body);

    const row = await readLevelRow(lead.id);
    expect(row?.level).toBe("kairos");
    expect(row?.levelOverride).toBe(false);
  });

  // Test 4: coach level change via PUT sets the sticky override flag.
  it("PUT /admin/members/:userId with a level change sets level_override=true", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: "kairos-override@test.com",
        firstName: "Override",
        lastName: "Target",
        phone: "+5491177770001",
        dni: "30777111",
        branchId: 1,
        planId: testPlanId,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const member = JSON.parse(createRes.body);

    // Born kairos, override not yet set.
    let row = await readLevelRow(member.id);
    expect(row?.level).toBe("kairos");
    expect(row?.levelOverride).toBe(false);

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${member.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { level: "alfa" },
    });
    expect(putRes.statusCode).toBe(200);

    row = await readLevelRow(member.id);
    expect(row?.level).toBe("alfa");
    expect(row?.levelOverride).toBe(true);
  });

  // Test 5 (CR-01 invariant, real-client shape): the production admin edit form
  // ALWAYS sends `level` (seeded from the member's current level). Editing an
  // unrelated field (phone) while resending the UNCHANGED level must NOT flip
  // level_override. This is the payload the real client emits — the old test
  // omitted `level` and so never exercised the broken path.
  it("PUT with the full payload (unchanged level + phone change) keeps override false", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: "kairos-invariant@test.com",
        firstName: "Invariant",
        lastName: "Member",
        phone: "+5491188880001",
        dni: "30888111",
        branchId: 1,
        planId: testPlanId,
        // Born kairos so we can assert auto-graduation still fires after the edit.
      },
    });
    expect(createRes.statusCode).toBe(201);
    const member = JSON.parse(createRes.body);

    // Baseline: kairos, override=false.
    let row = await readLevelRow(member.id);
    expect(row?.level).toBe("kairos");
    expect(row?.levelOverride).toBe(false);

    // Real client edit: full payload includes the UNCHANGED level alongside the
    // changed phone. Must leave the override flag untouched (CR-01).
    const putRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${member.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { phone: "+5491188889999", level: row?.level },
    });
    expect(putRes.statusCode).toBe(200);

    row = await readLevelRow(member.id);
    expect(row?.level).toBe("kairos");
    expect(row?.levelOverride).toBe(false);
  });

  // Test 6 (CR-01): a genuine level CHANGE via the same full-payload PUT still
  // sets the sticky override.
  it("PUT with a DIFFERENT level still sets level_override=true", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: "kairos-realchange@test.com",
        firstName: "Real",
        lastName: "Change",
        phone: "+5491199990001",
        dni: "30999111",
        branchId: 1,
        planId: testPlanId,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const member = JSON.parse(createRes.body);

    let row = await readLevelRow(member.id);
    expect(row?.level).toBe("kairos");
    expect(row?.levelOverride).toBe(false);

    // Full payload with an actually-different level → sticky override.
    const putRes = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${member.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { phone: "+5491199990002", level: "delta" },
    });
    expect(putRes.statusCode).toBe(200);

    row = await readLevelRow(member.id);
    expect(row?.level).toBe("delta");
    expect(row?.levelOverride).toBe(true);
  });
});
