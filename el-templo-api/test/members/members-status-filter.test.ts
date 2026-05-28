/**
 * Members API status enum filter — integration tests.
 *
 * The list status (filter + per-row projection) is computed LIVE from
 * subscriptions, mirroring recomputeUserStatus's CASE, rather than read from
 * the lazily-updated `users.status` column: a member counts as 'activo' only
 * while they hold an active/paused sub that has started and not ended;
 * otherwise an 'activo'/'inactivo' column reads as 'inactivo'; 'freemium' and
 * 'prueba' (not derivable from subs) pass through. This keeps the buscador
 * correct even when the persisted column is stale (the lapsed-member bug:
 * users.status stays 'activo' until the auto-expire cron or an expire-on-read
 * fires). The legacy `'leads'`/`'alumnos'` enum values are still rejected.
 *
 * Fixture seeds 4 users — one per enum value — with the 'activo' user backed
 * by a real active subscription so its computed status matches its column.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { users } from "../../src/db/schema/users";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { subscriptions } from "../../src/db/schema/subscriptions";

describe("GET /api/admin/members — status enum filter (computed from subscriptions)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  const branchId = 1;
  let planId: number;

  let userFreemium: number;
  let userPrueba: number;
  let userActivo: number;
  let userInactivo: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  const passwordHash = () => argon2.hash("ignored");

  async function makeMember(
    firstName: string,
    status: "freemium" | "prueba" | "activo" | "inactivo",
  ): Promise<number> {
    const [row] = await app.db
      .insert(users)
      .values({
        email: `${firstName.toLowerCase()}-${Date.now()}@test.com`,
        passwordHash: await passwordHash(),
        firstName,
        lastName: "Test",
        phone: null,
        dni: `${firstName.slice(0, 1)}${Date.now() % 100000}`,
        branchId,
        role: "member",
        level: "alfa",
        status,
      })
      .$returningId();
    return row.id;
  }

  /** Insert a subscription row directly (bypasses service-layer recompute). */
  async function seedSubscription(
    userId: number,
    status: "active" | "paused" | "expired",
    startDate: string,
    endDate: string,
  ): Promise<void> {
    await app.db.insert(subscriptions).values({
      userId,
      planId,
      branchId,
      status,
      startDate,
      endDate,
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  beforeEach(async () => {
    await cleanAllTestData(app);

    const [plan] = await app.db.insert(subscriptionPlans).values({
      name: `StatusFilterPlan-${Date.now()}`,
      country: "AR",
      planCategory: "online_regular",
      bookingMode: "flexible",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: null,
    });
    planId = (plan as { insertId: number }).insertId;

    userFreemium = await makeMember("FreemiumUser", "freemium");
    userPrueba = await makeMember("PruebaUser", "prueba");
    userActivo = await makeMember("ActivoUser", "activo");
    userInactivo = await makeMember("InactivoUser", "inactivo");

    // The 'activo' user is backed by a real, currently-valid subscription so
    // its computed status matches its persisted column.
    await seedSubscription(
      userActivo,
      "active",
      dateOffsetStr(-10),
      dateOffsetStr(20),
    );
  });

  interface ListResponse {
    members: Array<{
      id: number;
      firstName: string | null;
      status: string | null;
    }>;
    total: number;
  }

  async function listMembers(query: string): Promise<ListResponse> {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members${query ? `?${query}` : ""}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as ListResponse;
  }

  // ─── R8: 4-value enum filter ─────────────────────────────────────────

  const STATUSES = ["freemium", "prueba", "activo", "inactivo"] as const;
  for (const s of STATUSES) {
    it(`?status=${s} returns only users with status=${s}`, async () => {
      const body = await listMembers(`status=${s}`);

      // Every returned row has the requested status and lacks isActive.
      for (const row of body.members) {
        expect(row.status).toBe(s);
        expect(row).not.toHaveProperty("isActive");
      }

      // Count matches the direct DB query for sanity.
      const [{ value }] = await app.db
        .select({ value: sql<number>`COUNT(*)` })
        .from(users)
        .where(
          and(
            eq(users.role, "member"),
            eq(users.status, s),
            isNull(users.deletedAt),
          ),
        );
      expect(body.total).toBe(Number(value));
      expect(body.total).toBeGreaterThan(0);
    });
  }

  it("?status=todos returns all members regardless of status", async () => {
    const body = await listMembers("status=todos");
    const ids = body.members.map((m) => m.id).sort();
    expect(ids).toEqual(
      [userFreemium, userPrueba, userActivo, userInactivo].sort(),
    );
    expect(body.total).toBe(4);
  });

  it("omitting status returns all members (default behavior)", async () => {
    const body = await listMembers("");
    const ids = body.members.map((m) => m.id).sort();
    expect(ids).toEqual(
      [userFreemium, userPrueba, userActivo, userInactivo].sort(),
    );
    expect(body.total).toBe(4);
  });

  it("response payload includes status field, not isActive", async () => {
    const body = await listMembers("");
    expect(body.members.length).toBe(4);
    for (const row of body.members) {
      expect(row).toHaveProperty("status");
      expect(row).not.toHaveProperty("isActive");
      expect(["freemium", "prueba", "activo", "inactivo"]).toContain(
        row.status,
      );
    }
  });

  it("rejects legacy ?status=leads with 400 (enum no longer accepts old values)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members?status=leads",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects legacy ?status=alumnos with 400 (enum no longer accepts old values)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members?status=alumnos",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── R10: profile endpoint exposes status ─────────────────────────────

  it("GET /api/admin/members/{id} returns status (not isActive)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${userActivo}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body.status).toBe("activo");
    expect(body).not.toHaveProperty("isActive");
  });

  // ─── R7 (createMember single-owner edit): planless POST → status='prueba' ─

  it("POST /api/admin/members without planId inserts users.status='prueba'", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: "newprueba@test.com",
        firstName: "NewPrueba",
        lastName: "Member",
        phone: "+5491100000000",
        dni: `NP${Date.now() % 100000}`,
        branchId,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: number; status: string };
    expect(body.status).toBe("prueba");

    const [row] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, body.id));
    expect(row?.status).toBe("prueba");
  });

  // ─── Stale-column regression (the lapsed-member bug) ──────────────────
  // A member whose only subscription has lapsed keeps users.status='activo'
  // in the DB until the auto-expire cron / expire-on-read fires. The list
  // must still show them as 'inactivo' because it computes the status live.

  it("a member with status='activo' but an EXPIRED sub reads as 'inactivo' in the list", async () => {
    const stale = await makeMember("StaleLapsed", "activo");
    await seedSubscription(
      stale,
      "expired",
      dateOffsetStr(-40),
      dateOffsetStr(-1),
    );

    // The persisted column is still the stale 'activo'.
    const [row] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, stale));
    expect(row?.status).toBe("activo");

    // ?status=activo must NOT include the lapsed member...
    const activo = await listMembers("status=activo");
    expect(activo.members.map((m) => m.id)).not.toContain(stale);
    // ...and the backed active user IS still there.
    expect(activo.members.map((m) => m.id)).toContain(userActivo);

    // ?status=inactivo includes them, computed as inactivo.
    const inactivo = await listMembers("status=inactivo");
    const staleRow = inactivo.members.find((m) => m.id === stale);
    expect(staleRow).toBeDefined();
    expect(staleRow?.status).toBe("inactivo");
  });

  it("a member with status='activo' but NO subscription reads as 'inactivo'", async () => {
    const stale = await makeMember("StaleNoSub", "activo");

    const inactivo = await listMembers("status=inactivo");
    expect(inactivo.members.map((m) => m.id)).toContain(stale);

    const activo = await listMembers("status=activo");
    expect(activo.members.map((m) => m.id)).not.toContain(stale);
  });

  it("a 'paused' subscription still counts as 'activo' in the list", async () => {
    const paused = await makeMember("PausedUser", "activo");
    await seedSubscription(
      paused,
      "paused",
      dateOffsetStr(-5),
      dateOffsetStr(25),
    );

    const activo = await listMembers("status=activo");
    const row = activo.members.find((m) => m.id === paused);
    expect(row).toBeDefined();
    expect(row?.status).toBe("activo");
  });

  it("an active sub whose startDate is still in the future does NOT make 'activo'", async () => {
    const future = await makeMember("FutureStart", "inactivo");
    await seedSubscription(
      future,
      "active",
      dateOffsetStr(5),
      dateOffsetStr(35),
    );

    const inactivo = await listMembers("status=inactivo");
    expect(inactivo.members.map((m) => m.id)).toContain(future);
  });
});
