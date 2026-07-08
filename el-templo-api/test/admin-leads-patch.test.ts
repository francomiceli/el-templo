/**
 * Phase 114 — PATCH /api/admin/leads/:userId integration tests.
 *
 * Covers D-27 (happy path), D-28 (validation), D-29 (branch scope), D-34
 * (manual lead_status edits do NOT modify lead_notes), and the hotfix
 * 2026-07 invariant: lead_status='ganado' ⇔ purchased_plan_id cargado.
 *
 * Test patterns mirror branch-access.test.ts: seed users directly via Drizzle
 * to bypass cardinality validation and the trial-creation flow, since this
 * file's focus is the PATCH endpoint itself.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { createTestApp, getAuthToken, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";

describe("PATCH /api/admin/leads/:userId (Phase 114 D-27..D-34)", () => {
  let app: FastifyInstance;
  let ownerToken: string;

  // Branches: AR (default seed) + ES (created here for scope test).
  let arBranchId: number;
  let esBranchId: number;

  // ES admin (country='ES') for the branch-scope denial test.
  let esAdminToken: string;

  const uniq = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Resolve the seeded AR Test Branch id (created in test/setup.ts).
    const [ar] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"))
      .limit(1);
    if (!ar) throw new Error("seed TEST branch missing");
    arBranchId = ar.id;

    // Seed the ES branch ONCE in beforeAll — cleanAllTestData does NOT wipe
    // branches (it preserves seed data), so reinserting it in beforeEach
    // would collide on branches.code UNIQUE. The branch persists across all
    // tests in this file; the lead/admin rows that reference it are wiped
    // each test by cleanAllTestData (users table is cleared per
    // helpers.ts:217-219).
    const existing = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, `BES-${uniq}`.slice(0, 20)))
      .limit(1);
    if (existing.length > 0) {
      esBranchId = existing[0].id;
    } else {
      const [es] = await app.db
        .insert(schema.branches)
        .values({
          name: "ES Test Branch",
          code: `BES-${uniq}`.slice(0, 20),
          country: "ES",
          isActive: true,
          timezone: "Europe/Madrid",
          isVirtual: false,
        })
        .$returningId();
      esBranchId = es.id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Re-seed the ES admin per-test (cleanAllTestData wipes the users table).
    const passwordHash = await argon2.hash("adminpass456");
    await app.db.insert(schema.users).values({
      email: `es-admin-${uniq}@test.local`,
      passwordHash,
      role: "admin",
      branchId: esBranchId,
      country: "ES",
    });
    esAdminToken = await getAuthToken(
      app,
      `es-admin-${uniq}@test.local`,
      "adminpass456",
    );
  });

  /**
   * Seed a lead (status='prueba') directly via Drizzle and return its id.
   * Bypasses POST /admin/members/trial so test setup stays minimal.
   */
  async function seedLead(opts: {
    branchId: number;
    leadStatus?: "en_seguimiento" | "ganado" | "perdido" | null;
    leadNotes?: string | null;
    purchasedPlanId?: number | null;
    createdBy?: number | null;
  }): Promise<number> {
    const passwordHash = await argon2.hash("eltemplo2026");
    const [row] = await app.db
      .insert(schema.users)
      .values({
        passwordHash,
        firstName: "Lead",
        lastName: "Test",
        phone: `19${Date.now().toString().slice(-8)}`,
        role: "member",
        level: "alfa",
        status: "prueba",
        branchId: opts.branchId,
        leadStatus: opts.leadStatus ?? "en_seguimiento",
        leadNotes: opts.leadNotes ?? null,
        purchasedPlanId: opts.purchasedPlanId ?? null,
        createdBy: opts.createdBy ?? null,
      })
      .$returningId();
    return row.id;
  }

  /** Seed a subscription plan for the purchased-plan invariant tests. */
  async function seedPlan(name: string): Promise<number> {
    const [row] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name,
        planTier: "flex",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      })
      .$returningId();
    return row.id;
  }

  // ────────────────────────────────────────────────────────────────────
  // Test 1: Happy path — updates lead_status + lead_notes
  // ────────────────────────────────────────────────────────────────────
  it("returns 200 and updates lead_status + lead_notes (D-27)", async () => {
    // Resolve admin@test.com's id for createdBy.
    const [admin] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, "admin@test.com"));
    expect(admin?.id).toBeGreaterThan(0);

    const userId = await seedLead({
      branchId: arBranchId,
      leadStatus: "en_seguimiento",
      leadNotes: null,
      createdBy: admin!.id,
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "perdido", leadNotes: "No respondió" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.userId).toBe(userId);
    expect(body.leadStatus).toBe("perdido");
    expect(body.leadNotes).toBe("No respondió");
    expect(body.status).toBe("prueba");
    expect(body.createdBy).toEqual({ userId: admin!.id, name: "Test Admin" });

    // DB-level verification.
    const [dbRow] = await app.db
      .select({
        leadStatus: schema.users.leadStatus,
        leadNotes: schema.users.leadNotes,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(dbRow?.leadStatus).toBe("perdido");
    expect(dbRow?.leadNotes).toBe("No respondió");
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 2: empty-string leadNotes → NULL in DB (D-28)
  // ────────────────────────────────────────────────────────────────────
  it("normalizes leadNotes='' to NULL (D-28)", async () => {
    const userId = await seedLead({
      branchId: arBranchId,
      leadNotes: "previous note",
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadNotes: "" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.leadNotes).toBeNull();

    const [dbRow] = await app.db
      .select({ leadNotes: schema.users.leadNotes })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(dbRow?.leadNotes).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 3: non-lead user → 409 (D-28)
  // ────────────────────────────────────────────────────────────────────
  it("returns 409 when user status is not 'prueba' (D-28)", async () => {
    const passwordHash = await argon2.hash("eltemplo2026");
    const [activeRow] = await app.db
      .insert(schema.users)
      .values({
        passwordHash,
        firstName: "Active",
        lastName: "Member",
        phone: `29${Date.now().toString().slice(-8)}`,
        role: "member",
        level: "alfa",
        status: "activo",
        branchId: arBranchId,
      })
      .$returningId();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${activeRow.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "perdido" },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.message).toContain("lead");

    // DB unchanged.
    const [dbRow] = await app.db
      .select({
        leadStatus: schema.users.leadStatus,
        status: schema.users.status,
      })
      .from(schema.users)
      .where(eq(schema.users.id, activeRow.id));
    expect(dbRow?.leadStatus).toBeNull();
    expect(dbRow?.status).toBe("activo");
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 4: missing user → 404
  // ────────────────────────────────────────────────────────────────────
  it("returns 404 for a non-existent userId", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/leads/999999",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "perdido" },
    });

    expect(res.statusCode).toBe(404);
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 4b: soft-deleted user → 404
  // ────────────────────────────────────────────────────────────────────
  it("returns 404 for a soft-deleted lead", async () => {
    const userId = await seedLead({ branchId: arBranchId });
    await app.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(eq(schema.users.id, userId));

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "perdido" },
    });

    expect(res.statusCode).toBe(404);
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 5: invalid leadStatus enum → 400 (D-28)
  // ────────────────────────────────────────────────────────────────────
  it("returns 400 for an invalid leadStatus enum value (D-28)", async () => {
    const userId = await seedLead({ branchId: arBranchId });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "foobar" },
    });

    expect(res.statusCode).toBe(400);
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 6: leadNotes > 2000 chars → 400 (D-28)
  // ────────────────────────────────────────────────────────────────────
  it("returns 400 when leadNotes exceeds 2000 chars (D-28)", async () => {
    const userId = await seedLead({ branchId: arBranchId });
    const longNotes = "x".repeat(2001);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadNotes: longNotes },
    });

    expect(res.statusCode).toBe(400);

    // DB unchanged.
    const [dbRow] = await app.db
      .select({ leadNotes: schema.users.leadNotes })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(dbRow?.leadNotes).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 7: out-of-scope branch → 403 (D-29)
  // ES admin (country='ES') tries to edit a lead in the AR branch.
  // ────────────────────────────────────────────────────────────────────
  it("returns 403 when lead is in a branch outside admin scope (D-29)", async () => {
    const userId = await seedLead({
      branchId: arBranchId,
      leadStatus: "en_seguimiento",
      leadNotes: "untouched",
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${esAdminToken}` },
      payload: { leadStatus: "perdido", leadNotes: "tampered" },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("BRANCH_OUT_OF_SCOPE");

    // DB unchanged.
    const [dbRow] = await app.db
      .select({
        leadStatus: schema.users.leadStatus,
        leadNotes: schema.users.leadNotes,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(dbRow?.leadStatus).toBe("en_seguimiento");
    expect(dbRow?.leadNotes).toBe("untouched");
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 8: D-34 regression — marking 'ganado' (with plan) does NOT modify
  // lead_notes. Hotfix 2026-07: notes are free-text only, the plan lives
  // in purchased_plan_id.
  // ────────────────────────────────────────────────────────────────────
  it("does NOT modify lead_notes on leadStatus='ganado' + plan edit (D-34)", async () => {
    const planId = await seedPlan("Flex Test");
    const userId = await seedLead({
      branchId: arBranchId,
      leadStatus: "en_seguimiento",
      leadNotes: "manual note",
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "ganado", purchasedPlanId: planId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.leadStatus).toBe("ganado");
    expect(body.purchasedPlanId).toBe(planId);
    expect(body.purchasedPlanName).toBe("Flex Test");
    expect(body.leadNotes).toBe("manual note");

    const [dbRow] = await app.db
      .select({
        leadStatus: schema.users.leadStatus,
        leadNotes: schema.users.leadNotes,
        purchasedPlanId: schema.users.purchasedPlanId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(dbRow?.leadStatus).toBe("ganado");
    expect(dbRow?.purchasedPlanId).toBe(planId);
    expect(dbRow?.leadNotes).toBe("manual note");
  });

  // ────────────────────────────────────────────────────────────────────
  // Hotfix 2026-07 — invariante 'ganado' ⇔ plan comprado cargado
  // ────────────────────────────────────────────────────────────────────
  it("returns 409 when leadStatus='ganado' is sent without a plan", async () => {
    const userId = await seedLead({ branchId: arBranchId });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "ganado" },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toContain("plan");

    // DB unchanged.
    const [dbRow] = await app.db
      .select({ leadStatus: schema.users.leadStatus })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(dbRow?.leadStatus).toBe("en_seguimiento");
  });

  it("auto-promotes to 'ganado' when a plan is set without explicit leadStatus", async () => {
    const planId = await seedPlan("Foundation Test");
    const userId = await seedLead({ branchId: arBranchId });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { purchasedPlanId: planId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.leadStatus).toBe("ganado");
    expect(body.purchasedPlanId).toBe(planId);
  });

  it("returns 409 when a plan is set together with a non-'ganado' status", async () => {
    const planId = await seedPlan("Flex+ Test");
    const userId = await seedLead({ branchId: arBranchId });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "perdido", purchasedPlanId: planId },
    });

    expect(res.statusCode).toBe(409);
  });

  it("returns 409 when clearing the plan while the row stays 'ganado'", async () => {
    const planId = await seedPlan("Performance Test");
    const userId = await seedLead({
      branchId: arBranchId,
      leadStatus: "ganado",
      purchasedPlanId: planId,
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { purchasedPlanId: null },
    });

    expect(res.statusCode).toBe(409);

    // Clearing plan + downgrading status in the same PATCH is the valid path.
    const res2 = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "en_seguimiento", purchasedPlanId: null },
    });
    expect(res2.statusCode).toBe(200);
    const body = JSON.parse(res2.body);
    expect(body.leadStatus).toBe("en_seguimiento");
    expect(body.purchasedPlanId).toBeNull();
    expect(body.purchasedPlanName).toBeNull();
  });

  it("returns 400 when purchasedPlanId does not exist", async () => {
    const userId = await seedLead({ branchId: arBranchId });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { purchasedPlanId: 999999 },
    });

    expect(res.statusCode).toBe(400);
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 9: createdBy is null when the lead was inserted without one
  // (older / migrated rows). Verifies the LEFT JOIN handles null gracefully.
  // ────────────────────────────────────────────────────────────────────
  it("returns createdBy=null when the lead has no creator", async () => {
    const userId = await seedLead({
      branchId: arBranchId,
      createdBy: null,
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/leads/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { leadStatus: "perdido" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.createdBy).toBeNull();
  });
});
