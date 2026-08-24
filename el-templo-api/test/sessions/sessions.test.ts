import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, getAuthToken, registerUser } from "../helpers";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

// Archivo single-tenant (solo El Templo): filtro preciso, no exencion.
const CTX_TEMPLO: TenantContext = { tenantId: 1 };

describe("Session Routes", () => {
  let app: FastifyInstance;
  let memberToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Register a member for session tests
    const reg = await registerUser(app, {
      email: "session-member@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken = await getAuthToken(
      app,
      "session-member@test.com",
      "password123",
    );

    // Phase 104 R7: /sessions/* now gates by view ownership. Give this
    // member an active presencial subscription so the existing tests
    // (which assume Templo W* dayId resolution) keep their semantics.
    const memberId = (reg.user as { id: number }).id;
    const [presencialPlan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test Presencial Plan (sessions.test)",
        planTier: "flex",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 15000,
        priceZero: 10000,
        durationDays: 30,
        classesPerWeek: 3,
      })
      .$returningId();
    await app.db.insert(schema.subscriptions).values({
      userId: memberId,
      planId: presencialPlan.id,
      branchId: 1,
      status: "active",
      startDate: new Date().toISOString().split("T")[0],
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // GET /api/sessions/daily
  // ---------------------------------------------------------------
  describe("GET /api/sessions/daily", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=2026-02-10",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid date format", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=invalid",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for Sunday (no sessions)", async () => {
      // 2026-02-15 is a Sunday
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=2026-02-15",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("No hay sesiones los domingos");
    });

    it("returns 404 when no approved session exists for member", async () => {
      // No sessions generated/approved in test DB, so any weekday returns 404
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=2026-02-10",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // GET /api/sessions/weekly
  // ---------------------------------------------------------------
  describe("GET /api/sessions/weekly", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/weekly?weekStart=2026-02-09",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns week sessions map (all null when no approved sessions)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/weekly?weekStart=2026-02-09",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("sessions");

      // All days should be null since no sessions are approved
      const sessions = body.sessions;
      expect(typeof sessions).toBe("object");

      // Sunday should be null
      expect(sessions["2026-02-15"]).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // POST /api/sessions/complete
  // ---------------------------------------------------------------
  describe("POST /api/sessions/complete", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/sessions/complete",
        payload: {
          dayId: "W1-lunes-alfa",
          date: "2026-02-10",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM", "NUCLEUS"],
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("records a completed session successfully", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/sessions/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: "W1-lunes-alfa",
          date: "2026-02-10",
          startedAt: new Date().toISOString(),
          rpe: 7,
          notes: "Good workout",
          blocksCompleted: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "ATHLOS"],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.completedSessionId).toBeGreaterThan(0);
      expect(body.totalDaysTrained).toBe(1);
    });

    it("upserts when completing same dayId again", async () => {
      // Complete the same day again (should update, not duplicate)
      const res = await app.inject({
        method: "POST",
        url: "/api/sessions/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: "W1-lunes-alfa",
          date: "2026-02-10",
          startedAt: new Date().toISOString(),
          rpe: 8,
          notes: "Updated RPE",
          blocksCompleted: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "ATHLOS"],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      // Still 1 unique day trained (same date)
      expect(body.totalDaysTrained).toBe(1);
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/sessions/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          // Missing dayId, date, startedAt, blocksCompleted
          rpe: 5,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("stamps session_level from dayId suffix matching user level", async () => {
      // Register a fresh user so we can assert on a clean row set
      await registerUser(app, {
        email: "stamp-own-level@test.com",
        password: "password123",
        branchId: 1,
      });
      const token = await getAuthToken(
        app,
        "stamp-own-level@test.com",
        "password123",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/sessions/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          dayId: "W3-lunes-alfa",
          date: "2026-03-02",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM", "NUCLEUS"],
        },
      });

      expect(res.statusCode).toBe(200);

      const [userRow] = await app.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, CTX_TEMPLO),
            eq(schema.users.email, "stamp-own-level@test.com"),
          ),
        );
      const [completion] = await app.db
        .select({
          sessionLevel: schema.completedSessions.sessionLevel,
        })
        .from(schema.completedSessions)
        .where(
          and(
            eq(schema.completedSessions.userId, userRow!.id),
            eq(schema.completedSessions.dayId, "W3-lunes-alfa"),
          ),
        );
      expect(completion?.sessionLevel).toBe("alfa");
    });

    it("stamps session_level from dayId even when it differs from users.level (train at any level)", async () => {
      // User registers at default level "alfa" but completes a sigma session
      await registerUser(app, {
        email: "stamp-other-level@test.com",
        password: "password123",
        branchId: 1,
      });
      const token = await getAuthToken(
        app,
        "stamp-other-level@test.com",
        "password123",
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/sessions/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          dayId: "W3-martes-sigma",
          date: "2026-03-03",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM", "NUCLEUS"],
        },
      });

      expect(res.statusCode).toBe(200);

      const [userRow] = await app.db
        .select({ id: schema.users.id, level: schema.users.level })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, CTX_TEMPLO),
            eq(schema.users.email, "stamp-other-level@test.com"),
          ),
        );
      expect(userRow!.level).toBe("kairos");

      const [completion] = await app.db
        .select({
          sessionLevel: schema.completedSessions.sessionLevel,
        })
        .from(schema.completedSessions)
        .where(
          and(
            eq(schema.completedSessions.userId, userRow!.id),
            eq(schema.completedSessions.dayId, "W3-martes-sigma"),
          ),
        );
      expect(completion?.sessionLevel).toBe("sigma");
    });

    it("returns 400 when dayId has an unrecognized level suffix", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/sessions/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: "W3-lunes-mythicon",
          date: "2026-03-02",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM"],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("nivel no reconocido");
    });
  });

  // ---------------------------------------------------------------
  // Phase 99 R3 — ?level=omega override on /sessions/daily
  // Phase 99 R10 — Saturday ROM collapse with ?level=omega
  // ---------------------------------------------------------------
  describe("Phase 99 level override + ROM Saturday (R3 + R10)", () => {
    it("R3 daily override — /api/sessions/daily?date=<martes>&level=omega returns the omega content (not alfa)", async () => {
      // 2026-02-24 is a Tuesday (getDay=2) in Week 1 (WEEK_ONE_MONDAY=2026-02-23).
      // User is alfa by default. With ?level=omega, server should look up
      // dayId=W1-martes-omega (NOT W1-martes-alfa).
      //
      // Proof strategy: seed ONLY the omega session (approved). If the server
      // honors the override, it returns 200; if it ignored the override and
      // fell through to users.level=alfa, it would look up W1-martes-alfa
      // (not seeded) and return 404.
      const [inserted] = await app.db
        .insert(schema.sessions)
        .values({
          dayId: "W1-martes-omega",
          week: 1,
          day: "martes",
          levelGroup: "omega",
          blockCount: 0,
          status: "approved",
          sessionMode: "regular",
        })
        .$returningId();
      expect(inserted.id).toBeGreaterThan(0);

      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=2026-02-24&level=omega",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // Server constructs dayId from effectiveLevel — proves the ?level=omega
      // override flowed through (R3).
      expect(body.dayId).toBe("W1-martes-omega");
      expect(body.levelGroup).toBe("omega");

      // Cleanup so parallel tests above that expect 404 keep working
      await app.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.dayId, "W1-martes-omega"));
    });

    it("R10 Saturday ROM collapse with ?level=omega — server yields delta content (omega collapsed to delta)", async () => {
      // 2026-02-28 is a Saturday (getDay=6) in Week 1. Seed the day_modes
      // row marking Saturday as 'rom' so the collapse branch fires.
      // Idempotent: remove any leftover from a prior failed run before inserting.
      await app.db
        .delete(schema.dayModes)
        .where(eq(schema.dayModes.dayOfWeek, 6));
      await app.db
        .insert(schema.dayModes)
        .values({ dayOfWeek: 6, sessionMode: "rom" });

      // Seed ONLY the delta variant (not omega). If the server correctly
      // collapses non-alfa levels to delta on ROM Saturdays, it looks up
      // W1-sabado-delta and returns 200. If it ignored ROM collapse it
      // would look up W1-sabado-omega (not seeded) and return 404.
      const [inserted] = await app.db
        .insert(schema.sessions)
        .values({
          dayId: "W1-sabado-delta",
          week: 1,
          day: "sabado",
          levelGroup: "alfa_delta",
          blockCount: 0,
          status: "approved",
          sessionMode: "rom",
        })
        .$returningId();
      expect(inserted.id).toBeGreaterThan(0);

      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=2026-02-28&level=omega",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // ROM collapse produced W1-sabado-delta even though client asked for omega.
      // The dayId ends in '-delta' (collapsed) — not '-omega' (override) — which
      // is the falsifiable R10 proof. If ROM collapse failed, the server would
      // have looked up W1-sabado-omega and returned 404.
      expect(body.dayId).toBe("W1-sabado-delta");
      expect(body.dayId).not.toContain("omega");
      // Note: sessionMode is stripped by Fastify's response schema (not in
      // sessionResponseSchema properties) — so we don't assert it here.

      // Cleanup
      await app.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.dayId, "W1-sabado-delta"));
      await app.db
        .delete(schema.dayModes)
        .where(eq(schema.dayModes.dayOfWeek, 6));
    });
  });

  // ---------------------------------------------------------------
  // KAIROS transition fallback (v5.1): a kairos member with no approved
  // kairos session for a day reads the alfa session instead of a 404,
  // until coaches build the kairos library.
  // ---------------------------------------------------------------
  describe("KAIROS transition fallback (v5.1)", () => {
    // Pin the session member to kairos explicitly so the fallback is exercised
    // regardless of the registration default (self-proving test).
    beforeAll(async () => {
      await app.db
        .update(schema.users)
        .set({ level: "kairos" })
        .where(
          and(
            tenantWhere(schema.users, CTX_TEMPLO),
            eq(schema.users.email, "session-member@test.com"),
          ),
        );
    });

    // 2026-02-24 is a Tuesday (normal, non-ROM day) in Week 1 (anchor 2026-02-23).
    it("daily — kairos member with no kairos session reads the approved alfa session", async () => {
      // Seed ONLY the alfa session. With the fallback the kairos member gets
      // W1-martes-alfa; without it the server looks up W1-martes-kairos (not
      // seeded) and returns 404 — the falsifiable proof.
      const [inserted] = await app.db
        .insert(schema.sessions)
        .values({
          dayId: "W1-martes-alfa",
          week: 1,
          day: "martes",
          levelGroup: "alfa_delta",
          blockCount: 0,
          status: "approved",
          sessionMode: "regular",
        })
        .$returningId();
      expect(inserted.id).toBeGreaterThan(0);

      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=2026-02-24",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dayId).toBe("W1-martes-alfa");

      await app.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.dayId, "W1-martes-alfa"));
    });

    it("daily — still 404 when neither kairos nor alfa session is approved", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=2026-02-24",
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("weekly — kairos member sees the alfa session on days with no kairos session", async () => {
      const [inserted] = await app.db
        .insert(schema.sessions)
        .values({
          dayId: "W1-martes-alfa",
          week: 1,
          day: "martes",
          levelGroup: "alfa_delta",
          blockCount: 0,
          status: "approved",
          sessionMode: "regular",
        })
        .$returningId();
      expect(inserted.id).toBeGreaterThan(0);

      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/weekly?weekStart=2026-02-23",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sessions["2026-02-24"]).not.toBeNull();
      expect(body.sessions["2026-02-24"].dayId).toBe("W1-martes-alfa");

      await app.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.dayId, "W1-martes-alfa"));
    });
  });
});
