import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";

/**
 * Phase 111 Plan 04 — REQ-5 (phone duplicate block) + REQ-9 (firstName /
 * lastName trim) integration tests for POST /api/auth/register.
 *
 * Behaviors covered:
 *  - Duplicate phone on a presencial branch  → 409 PHONE_ALREADY_REGISTERED
 *  - Duplicate phone on a virtual branch     → 409 PHONE_ALREADY_REGISTERED (D-08 broad scope)
 *  - Formatted-input phone normalizes        → 409 (matches stored canonical form)
 *  - Phone matches only a soft-deleted user  → 200/201 success (D-08 excludes deleted)
 *  - Unique phone                            → 200/201 success
 *  - Trim of firstName/lastName              → DB has the trimmed canonical form
 */

describe("POST /api/auth/register — phone duplicate block + trim", () => {
  let app: FastifyInstance;
  let presencialBranchId: number;
  let virtualBranchId: number;

  beforeAll(async () => {
    app = await createTestApp();

    // Resolve seeded branches: a presencial one (any non-virtual) and the
    // virtual ONLINE branch. The test DB seed creates both so we just look
    // them up rather than mutate seed.
    const allBranches = await app.db
      .select({
        id: branches.id,
        isVirtual: branches.isVirtual,
        code: branches.code,
      })
      .from(branches);
    presencialBranchId =
      allBranches.find((b) => !b.isVirtual)?.id ?? allBranches[0].id;
    virtualBranchId =
      allBranches.find((b) => b.isVirtual)?.id ?? presencialBranchId;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /** Seed a user directly (bypass /register) so we can write any phone shape. */
  async function seedUser(opts: {
    email: string;
    phone?: string | null;
    branchId: number;
    deletedAt?: Date | null;
  }): Promise<number> {
    const [row] = await app.db
      .insert(users)
      .values({
        email: opts.email,
        passwordHash: "x",
        firstName: "Seed",
        lastName: "User",
        phone: opts.phone ?? null,
        branchId: opts.branchId,
        role: "member",
        level: "alfa",
        status: "freemium" as const,
        deletedAt: opts.deletedAt ?? null,
      })
      .$returningId();
    return row.id;
  }

  it("rejects with 409 PHONE_ALREADY_REGISTERED when phone matches a presencial member", async () => {
    await seedUser({
      email: "presencial-existing@test.com",
      phone: "2236614406",
      branchId: presencialBranchId,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "newpresencial@test.com",
        password: "password123",
        firstName: "Soledad",
        lastName: "Mailland",
        phone: "2236614406",
        gender: "female",
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("PHONE_ALREADY_REGISTERED");
    expect(body.message).toContain("Esta persona ya tiene cuenta");
  });

  it("rejects with 409 when phone matches a member on a virtual branch (D-08 broad scope)", async () => {
    await seedUser({
      email: "virtual-existing@test.com",
      phone: "1140404040",
      branchId: virtualBranchId,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "newvirtual@test.com",
        password: "password123",
        firstName: "Twin",
        lastName: "Account",
        phone: "1140404040",
        gender: "male",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe("PHONE_ALREADY_REGISTERED");
  });

  it("normalizes formatted input phone before matching", async () => {
    await seedUser({
      email: "fmt-existing@test.com",
      phone: "2236614406",
      branchId: presencialBranchId,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "fmt-new@test.com",
        password: "password123",
        firstName: "Fmt",
        lastName: "Tester",
        phone: "+54 223 661 4406",
        gender: "male",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe("PHONE_ALREADY_REGISTERED");
  });

  it("succeeds when the only existing match is soft-deleted", async () => {
    await seedUser({
      email: "deleted-existing@test.com",
      phone: "2236614407",
      branchId: presencialBranchId,
      deletedAt: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "post-delete@test.com",
        password: "password123",
        firstName: "Post",
        lastName: "Delete",
        phone: "2236614407",
        gender: "male",
      },
    });

    expect([200, 201]).toContain(res.statusCode);
  });

  it("succeeds with a globally unique phone and the response carries trimmed names", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "unique-phone@test.com",
        password: "password123",
        firstName: "Uniq",
        lastName: "Phone",
        phone: "5555555555",
        gender: "male",
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.user.firstName).toBe("Uniq");
    expect(body.user.lastName).toBe("Phone");
  });

  it("trims leading/trailing whitespace in firstName/lastName at insert (REQ-9)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "trim-test@test.com",
        password: "password123",
        firstName: "  Soledad  ",
        lastName: "  Mailland  ",
        phone: "6666666666",
        gender: "female",
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    // Response payload reflects trimmed values
    expect(body.user.firstName).toBe("Soledad");
    expect(body.user.lastName).toBe("Mailland");

    // Defense-in-depth: assert via direct DB read that the persisted row
    // also has the trimmed values (not just the response shape).
    const [row] = await app.db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.email, "trim-test@test.com"))
      .limit(1);
    expect(row.firstName).toBe("Soledad");
    expect(row.lastName).toBe("Mailland");
  });
});
