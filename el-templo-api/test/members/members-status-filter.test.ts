/**
 * Phase 103 Plan 04 (R8 + R10): integration tests for the migrated members
 * API status enum.
 *
 * R8 — `GET /api/admin/members?status=todos|freemium|prueba|activo|inactivo`
 *      reads `users.status` directly (no derived isActiveSubquery). The legacy
 *      `'leads'` and `'alumnos'` values are no longer accepted.
 * R10 — Response payload includes `status` per row (string enum) and no
 *       longer includes `isActive`.
 *
 * Fixture seeds 4 users — one per enum value — and one staff user (which
 * never appears in /admin/members since the route filters by role='member').
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { eq, and, isNull, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";

describe("GET /api/admin/members — status enum filter (Phase 103 R8, R10)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  const branchId = 1;

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

  beforeEach(async () => {
    await cleanAllTestData(app);

    const passwordHash = await argon2.hash("ignored");

    async function makeMember(
      firstName: string,
      status: "freemium" | "prueba" | "activo" | "inactivo",
    ): Promise<number> {
      const [row] = await app.db
        .insert(users)
        .values({
          email: `${firstName.toLowerCase()}@test.com`,
          passwordHash,
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

    userFreemium = await makeMember("FreemiumUser", "freemium");
    userPrueba = await makeMember("PruebaUser", "prueba");
    userActivo = await makeMember("ActivoUser", "activo");
    userInactivo = await makeMember("InactivoUser", "inactivo");
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
});
