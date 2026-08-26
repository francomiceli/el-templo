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
import { eq, and } from "drizzle-orm";
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

  /** role -> count of persisted `exercise_type='mobility'` prescriptions. */
  async function mobilityCountByRole(
    blocks: Array<{ id: number; role: string }>,
  ): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const b of blocks) {
      const rows = await app.db
        .select()
        .from(schema.sessionPrescriptions)
        .where(
          and(
            eq(schema.sessionPrescriptions.blockId, b.id),
            eq(schema.sessionPrescriptions.exerciseType, "mobility"),
          ),
        );
      counts[b.role] = rows.length;
    }
    return counts;
  }

  async function cleanupWeek(week: number) {
    // sessionBlocks cascade-delete with sessions (onDelete: cascade), so a
    // single DELETE on sessions is enough.
    await app.db.delete(schema.sessions).where(eq(schema.sessions.week, week));
  }

  it("dayModes:{miercoles:'combos'} persists session_mode='combos' with COMBOS_I/COMBOS_II/COMBOS_II_ALT + full-body EPIKOS close", async (ctx) => {
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

      // Phase 178 (T-178-03): the generator ALWAYS emits a 5th physical block,
      // COMBOS_II_ALT, between COMBOS_II and the full-body close.
      const roles = result!.blocks.map((b) => b.role).sort();
      // Week 40 is even -> the full-body close is EPIKOS (odd weeks: ATHLOS).
      expect(roles).toEqual(
        ["COMBOS_I", "COMBOS_II", "COMBOS_II_ALT", "EPIKOS", "INITIUM"].sort(),
      );
      const fullBody = result!.blocks.find((b) => b.role === "EPIKOS");
      expect(fullBody?.route).toBe("FB");
      expect(fullBody?.formatName).toBe("Circuito cooperativo");

      // The alt reuses COMBOS_II's pool/format but resolves a distinct route
      // (role-inclusive hash) -> distinct exercises from the real generator.
      const comboII = result!.blocks.find((b) => b.role === "COMBOS_II");
      const comboIIAlt = result!.blocks.find((b) => b.role === "COMBOS_II_ALT");
      expect(comboIIAlt?.formatName).toBe(comboII?.formatName);
      expect(comboIIAlt?.route).not.toBe(comboII?.route);

      // Mobility "descanso activo" on every block except INITIUM (the FB close
      // is not STRETCHING, so it carries one too) — same as a regular day.
      const mobility = await mobilityCountByRole(result!.blocks);
      expect(mobility["INITIUM"]).toBe(0);
      expect(mobility["COMBOS_I"]).toBe(1);
      expect(mobility["COMBOS_II"]).toBe(1);
      expect(mobility["COMBOS_II_ALT"]).toBe(1);
      expect(mobility["EPIKOS"]).toBe(1);
    } finally {
      await cleanupWeek(week);
    }
  });

  it("dayModes:{jueves:'tecnica'} persists session_mode='tecnica' with TECNICA_I/TECNICA_II/TECNICA_II_ALT/STRETCHING roles", async (ctx) => {
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

      // Phase 178 (T-178-03): the generator ALWAYS emits a 5th physical block,
      // TECNICA_II_ALT, between TECNICA_II and STRETCHING.
      const roles = result!.blocks.map((b) => b.role).sort();
      expect(roles).toEqual(
        ["TECNICA_I", "TECNICA_II", "TECNICA_II_ALT", "INITIUM", "STRETCHING"].sort(),
      );

      // Unlike TECNICA_I/II (deliberately SAME route, D-08), the alt resolves
      // a DIFFERENT route via a role-inclusive hash.
      const tecnicaII = result!.blocks.find((b) => b.role === "TECNICA_II");
      const tecnicaIIAlt = result!.blocks.find((b) => b.role === "TECNICA_II_ALT");
      expect(tecnicaIIAlt?.formatName).toBe(tecnicaII?.formatName);
      expect(tecnicaIIAlt?.route).not.toBe(tecnicaII?.route);

      // Mobility "descanso activo" on the role/alt blocks; INITIUM (warmup) and
      // STRETCHING (which IS the mobility block) carry none.
      const mobility = await mobilityCountByRole(result!.blocks);
      expect(mobility["INITIUM"]).toBe(0);
      expect(mobility["STRETCHING"]).toBe(0);
      expect(mobility["TECNICA_I"]).toBe(1);
      expect(mobility["TECNICA_II"]).toBe(1);
      expect(mobility["TECNICA_II_ALT"]).toBe(1);
    } finally {
      await cleanupWeek(week);
    }
  });

  it("regenerar ROM sobre un día de técnica borra los niveles que ROM no genera (queda solo alfa/delta rom)", async (ctx) => {
    if (!catalogSeeded) ctx.skip(SKIP_NOTE);
    const week = 43;
    try {
      // 1. Generar el día como técnica: 6 niveles (alfa/delta/kairos/sigma/omega/spartan).
      const tec = await app.inject({
        method: "POST",
        url: "/api/admin/generate",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: { week, days: ["jueves"], dayModes: { jueves: "tecnica" } },
      });
      expect(tec.statusCode).toBe(200);
      const before = await app.db
        .select()
        .from(schema.sessions)
        .where(
          and(eq(schema.sessions.week, week), eq(schema.sessions.day, "jueves")),
        );
      expect(before.length).toBeGreaterThan(2);

      // 2. Regenerar el MISMO día como ROM (ROM sólo produce alfa/delta).
      const rom = await app.inject({
        method: "POST",
        url: "/api/admin/generate",
        headers: { authorization: `Bearer ${coachToken}` },
        payload: {
          week,
          days: ["jueves"],
          dayModes: { jueves: "rom" },
          regenerate: true,
        },
      });
      expect(rom.statusCode).toBe(200);

      // 3. El día queda SOLO con alfa/delta en modo rom — sin restos de técnica.
      const after = await app.db
        .select()
        .from(schema.sessions)
        .where(
          and(eq(schema.sessions.week, week), eq(schema.sessions.day, "jueves")),
        );
      expect(after.map((s) => s.dayId).sort()).toEqual(
        [`W${week}-jueves-alfa`, `W${week}-jueves-delta`].sort(),
      );
      expect(after.every((s) => s.sessionMode === "rom")).toBe(true);
      // Los niveles kairos/sigma/omega/spartan de técnica ya no existen.
      expect(await readSession(`W${week}-jueves-sigma`)).toBeNull();
      expect(await readSession(`W${week}-jueves-kairos`)).toBeNull();
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
      const comboIIAlt = result!.blocks.find((b) => b.role === "COMBOS_II_ALT");
      // Untruncated round-trip: exact string match against the full role
      // name proves the varchar(20) column didn't cut anything off.
      // COMBOS_II_ALT (13 chars, phase 178) is the longest role name so far.
      expect(comboI?.role).toBe("COMBOS_I");
      expect(comboII?.role).toBe("COMBOS_II");
      expect(comboIIAlt?.role).toBe("COMBOS_II_ALT");
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
