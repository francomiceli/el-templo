/**
 * Integration test for Phase 159 Plan 05 (SEM-01/SEM-12/SEM-13, D-02/D-03/D-10).
 *
 * POST /admin/generate now accepts a per-day `dayModes` override that routes
 * generation to `generateCombosSession`/`generateTecnicaSession` instead of
 * the regular pipeline, WITHOUT ever writing to `day_modes` (that table stays
 * exclusively the ROM-Saturday default, per D-02 — a UNIQUE (tenant_id,
 * day_of_week) row would reinterpret past/future weeks if the request's mode
 * leaked into it).
 *
 * Runs against real MySQL (`eltemplo_test_<pool>`), through the real
 * Fastify app and the real generation pipeline (no mocks) — this is the
 * integration counterpart to the mocked unit tests in
 * test/unit/combos-generator.test.ts / tecnica-generator.test.ts (plan 03).
 *
 * Each test case uses its own `week` number so dayIds (`W{week}-{day}-...`)
 * never collide across cases sharing the same worker DB (schema.sessions
 * .dayId has a UNIQUE constraint).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";

describe("POST /admin/generate — dayModes routing (combos/tecnica, Phase 159-05)", () => {
  let app: FastifyInstance;
  let coachToken: string;
  // The real generation pipeline (regular + combos/tecnica) reads the full
  // SPOM catalog: weekly_rotator, spom_rules, intensity_rules,
  // contraction_rules, routes, exercises. None of it is seeded by migrations
  // or by test/setup.ts seedTestData — it lives only in src/db/seed-spom.ts
  // (`pnpm seed:spom`), which reads CSVs under docs/session-logic/ that are
  // NOT committed to git and never runs in CI. On a fresh CI DB the pipeline
  // therefore throws ("No rotator entry found ...") and every session lands in
  // `failed`. We detect the empty catalog and skip the generation-dependent
  // cases loudly (visible as skipped, not silently passed) rather than fake
  // fixtures for a whole pipeline. Locally (after `pnpm seed:spom`) they run in
  // full. The combos/tecnica/stretching LOGIC is covered independently by the
  // mocked unit tests in test/unit/{combos,tecnica}-generator.test.ts.
  // Follow-up: a reusable seedSpomCatalog() helper (or committing the CSVs +
  // seeding in test setup) would let CI exercise this end-to-end.
  let catalogSeeded = false;
  const SKIP_NOTE =
    "SPOM catalog not seeded (CI has no seed:spom / CSVs); run locally after `pnpm seed:spom`";

  beforeAll(async () => {
    app = await createTestApp();

    // canAccessTraining accepts role="owner" unconditionally (see
    // src/modules/shared/permissions.ts) — simplest way to authorize
    // /admin/generate without depending on the single hardcoded
    // TRAINING_EXCLUSIVE_COACH_EMAIL fixture.
    await createStaffUser(app, {
      email: "training-owner@test.com",
      password: "password123",
      firstName: "Training",
      lastName: "Owner",
      role: "owner",
      branchId: 1,
    });
    coachToken = await getAuthToken(
      app,
      "training-owner@test.com",
      "password123",
    );

    // Probe the SPOM catalog: both the rotator (needed by the regular pipeline)
    // and the periodization rules (needed by every path) must be present for
    // generation to succeed. Either being empty means an unseeded DB.
    const [rotatorRow] = await app.db
      .select()
      .from(schema.weeklyRotator)
      .limit(1);
    const [ruleRow] = await app.db.select().from(schema.spomRules).limit(1);
    catalogSeeded = Boolean(rotatorRow) && Boolean(ruleRow);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Read persisted session + its blocks (ordered) for a given dayId. */
  async function readSession(dayId: string) {
    const [session] = await app.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.dayId, dayId));
    if (!session) return null;
    const blocks = await app.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.sessionId, session.id));
    return { session, blocks };
  }

  async function cleanupWeek(week: number) {
    // sessionBlocks cascade-delete with sessions (onDelete: cascade), so a
    // single DELETE on sessions is enough.
    await app.db.delete(schema.sessions).where(eq(schema.sessions.week, week));
  }

  it("dayModes:{miercoles:'combos'} persists session_mode='combos' with COMBOS_I/COMBOS_II/STRETCHING roles", async (ctx) => {
    if (!catalogSeeded) ctx.skip(SKIP_NOTE);
    const week = 40;
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/generate",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          week,
          days: ["miercoles"],
          dayModes: { miercoles: "combos" },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.failed).toBe(0);

      const dayId = `W${week}-miercoles-alfa`;
      const result = await readSession(dayId);
      expect(result).not.toBeNull();
      expect(result!.session.sessionMode).toBe("combos");

      const roles = result!.blocks.map((b) => b.role).sort();
      expect(roles).toEqual(
        ["COMBOS_I", "COMBOS_II", "INITIUM", "STRETCHING"].sort(),
      );
    } finally {
      await cleanupWeek(week);
    }
  });

  it("dayModes:{jueves:'tecnica'} persists session_mode='tecnica' with TECNICA_I/TECNICA_II/STRETCHING roles", async (ctx) => {
    if (!catalogSeeded) ctx.skip(SKIP_NOTE);
    const week = 41;
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/generate",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          week,
          days: ["jueves"],
          dayModes: { jueves: "tecnica" },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.failed).toBe(0);

      const dayId = `W${week}-jueves-alfa`;
      const result = await readSession(dayId);
      expect(result).not.toBeNull();
      expect(result!.session.sessionMode).toBe("tecnica");

      const roles = result!.blocks.map((b) => b.role).sort();
      expect(roles).toEqual(
        ["TECNICA_I", "TECNICA_II", "INITIUM", "STRETCHING"].sort(),
      );
    } finally {
      await cleanupWeek(week);
    }
  });

  it("new block roles persist in session_blocks.role without truncation (varchar(20))", async (ctx) => {
    if (!catalogSeeded) ctx.skip(SKIP_NOTE);
    const week = 42;
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/generate",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          week,
          days: ["miercoles"],
          dayModes: { miercoles: "combos" },
        },
      });
      expect(res.statusCode).toBe(200);

      const dayId = `W${week}-miercoles-alfa`;
      const result = await readSession(dayId);
      expect(result).not.toBeNull();
      const comboI = result!.blocks.find((b) => b.role === "COMBOS_I");
      const comboII = result!.blocks.find((b) => b.role === "COMBOS_II");
      const stretching = result!.blocks.find((b) => b.role === "STRETCHING");
      // Untruncated round-trip: exact string match against the full role
      // name proves the varchar(20) column didn't cut anything off.
      expect(comboI?.role).toBe("COMBOS_I");
      expect(comboII?.role).toBe("COMBOS_II");
      expect(stretching?.role).toBe("STRETCHING");
    } finally {
      await cleanupWeek(week);
    }
  });

  it("dayModes with a value outside the enum returns 400", async () => {
    const week = 43;
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/generate",
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        week,
        days: ["miercoles"],
        dayModes: { miercoles: "noexiste" },
      },
    });

    expect(res.statusCode).toBe(400);
    // Nothing should have been generated — the schema rejects the body
    // before generateWeek ever runs.
    const dayId = `W${week}-miercoles-alfa`;
    const result = await readSession(dayId);
    expect(result).toBeNull();
  });

  it("D-10: a combos generation produces all 6 levels across the 3 level groups", async (ctx) => {
    if (!catalogSeeded) ctx.skip(SKIP_NOTE);
    const week = 44;
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/generate",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          week,
          days: ["miercoles"],
          dayModes: { miercoles: "combos" },
          // levelGroups omitted -> defaults to all 3 (alfa_delta, sigma, omega)
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.failed).toBe(0);
      expect(body.generated).toBe(6);

      const levels = ["alfa", "delta", "kairos", "sigma", "omega", "spartan"];
      for (const level of levels) {
        const dayId = `W${week}-miercoles-${level}`;
        const result = await readSession(dayId);
        expect(result, `expected session for ${dayId}`).not.toBeNull();
        expect(result!.session.sessionMode).toBe("combos");
      }
    } finally {
      await cleanupWeek(week);
    }
  });

  it("regression: dayModes absent still generates 'regular' as before", async (ctx) => {
    if (!catalogSeeded) ctx.skip(SKIP_NOTE);
    const week = 45;
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/generate",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          week,
          days: ["lunes"],
          levelGroups: ["alfa_delta"],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.failed).toBe(0);

      const dayId = `W${week}-lunes-alfa`;
      const result = await readSession(dayId);
      expect(result).not.toBeNull();
      expect(result!.session.sessionMode).toBe("regular");
    } finally {
      await cleanupWeek(week);
    }
  });
});
