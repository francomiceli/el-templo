import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";

/**
 * Phase 111 Plan 04 — REQ-4 integration tests for
 * GET /api/admin/members/check-duplicates.
 *
 * Behaviors covered:
 *  - DNI exact match (matchedField='dni')
 *  - phone normalized match (last-10 digits, formatted input)
 *  - phone match against a stored phone written with formatting
 *  - soft-deleted users excluded
 *  - dni + phone independent → union of distinct user matches
 *  - dni + phone matching the SAME user → deduplicated, dni preferred
 *  - missing both params → 400 MISSING_QUERY
 *  - unauthenticated request → 401
 */

describe("GET /api/admin/members/check-duplicates", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /** Insert a member directly via Drizzle — bypasses the API so we can
   * control phone formatting + deleted_at exactly. branchId=1 is the
   * seeded "Templo Online" / first branch in the test DB. */
  async function insertMember(opts: {
    email: string;
    firstName: string;
    lastName: string;
    dni?: string | null;
    phone?: string | null;
    branchId?: number;
    deletedAt?: Date | null;
  }): Promise<number> {
    const [row] = await app.db
      .insert(users)
      .values({
        email: opts.email,
        passwordHash: "x",
        firstName: opts.firstName,
        lastName: opts.lastName,
        dni: opts.dni ?? null,
        phone: opts.phone ?? null,
        branchId: opts.branchId ?? 1,
        role: "member",
        level: "alfa",
        status: "freemium" as const,
        deletedAt: opts.deletedAt ?? null,
      })
      .$returningId();
    return row.id;
  }

  it("returns matchedField='dni' for an exact DNI match", async () => {
    await insertMember({
      email: "dnimatch@test.com",
      firstName: "Ana",
      lastName: "Lopez",
      dni: "30111222",
      phone: "1111111111",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/check-duplicates?dni=30111222",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toMatchObject({
      firstName: "Ana",
      lastName: "Lopez",
      matchedField: "dni",
      branchId: 1,
    });
    expect(typeof body.matches[0].branchName).toBe("string");
    expect(body.matches[0].branchName.length).toBeGreaterThan(0);
  });

  it("returns matchedField='phone' for a phone match where the stored phone is formatted", async () => {
    await insertMember({
      email: "phonematch@test.com",
      firstName: "Sole",
      lastName: "Mailland",
      dni: "30222333",
      phone: "+54 223 661 4406",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/check-duplicates?phone=2236614406",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].matchedField).toBe("phone");
    expect(body.matches[0].firstName).toBe("Sole");
  });

  it("normalizes the input phone before matching (formatted input → match)", async () => {
    await insertMember({
      email: "phonenorm@test.com",
      firstName: "Norm",
      lastName: "Test",
      dni: "30333444",
      phone: "2236614406",
    });

    // URL-encoded "+54 223 661 4406"
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/check-duplicates?phone=%2B54%20223%20661%204406",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].matchedField).toBe("phone");
  });

  it("excludes soft-deleted users from results", async () => {
    await insertMember({
      email: "deleted@test.com",
      firstName: "Gone",
      lastName: "User",
      dni: "30444555",
      phone: "9999999999",
      deletedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/check-duplicates?dni=30444555",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.matches).toHaveLength(0);
  });

  it("returns the union of dni and phone matches when they are different users", async () => {
    await insertMember({
      email: "dni-only@test.com",
      firstName: "DniUser",
      lastName: "A",
      dni: "30555666",
      phone: "1010101010",
    });
    await insertMember({
      email: "phone-only@test.com",
      firstName: "PhoneUser",
      lastName: "B",
      dni: "30555667",
      phone: "2020202020",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/check-duplicates?dni=30555666&phone=2020202020",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.matches).toHaveLength(2);
    const fields = body.matches
      .map((m: { matchedField: string }) => m.matchedField)
      .sort();
    expect(fields).toEqual(["dni", "phone"]);
  });

  it("deduplicates a single user matched on both dni and phone, preferring dni", async () => {
    await insertMember({
      email: "both@test.com",
      firstName: "Both",
      lastName: "Match",
      dni: "30666777",
      phone: "3030303030",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/check-duplicates?dni=30666777&phone=3030303030",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].matchedField).toBe("dni");
  });

  it("returns 400 MISSING_QUERY when neither dni nor phone is provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/check-duplicates",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("MISSING_QUERY");
  });

  it("requires authentication (401 without token)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/check-duplicates?dni=12345678",
    });

    expect(res.statusCode).toBe(401);
  });
});
