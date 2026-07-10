import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";
import { referrals } from "../../src/db/schema/referrals";

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

/**
 * Phase 157 Plan 03 — Task 1: self-service referral attribution (?ref=CODE)
 * + eager generation of the new member's OWN referral code (D-25).
 *
 * Behaviors covered:
 *  - Valid ?ref → referrals(pending, self_service) + users.referred_by (REF-02)
 *  - No ?ref    → no link, but the new user still gets a referral_code (D-25)
 *  - Unknown / self-referral code → no link, registration still 2xx (graceful)
 *  - Every successful registration leaves referral_code populated (PREFIJO-XXXX)
 */
describe("POST /api/auth/register — referral attribution + eager code (157-03)", () => {
  let app: FastifyInstance;
  let branchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    const all = await app.db
      .select({ id: branches.id, isVirtual: branches.isVirtual })
      .from(branches);
    branchId = all.find((b) => !b.isVirtual)?.id ?? all[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /** Seed a referrer user with a fixed referral_code (bypass /register). */
  async function seedReferrer(code: string): Promise<number> {
    const [row] = await app.db
      .insert(users)
      .values({
        email: `referrer-${code}@test.com`,
        passwordHash: "x",
        firstName: "Refer",
        lastName: "Rer",
        branchId,
        role: "member",
        level: "alfa",
        status: "freemium" as const,
        referralCode: code,
      })
      .$returningId();
    return row.id;
  }

  const CODE_RE = /^[A-Z]+-[A-Z0-9]+$/;

  it("un ?ref válido crea un vínculo pending self_service + escribe referred_by (REF-02)", async () => {
    const referrerId = await seedReferrer("FRAN-A3B2");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "ref-ok@test.com",
        password: "password123",
        firstName: "New",
        lastName: "Ref",
        phone: "5551110001",
        gender: "male",
        branchId,
        ref: "FRAN-A3B2",
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const newUserId = JSON.parse(res.body).user.id as number;

    const [u] = await app.db
      .select({ referredBy: users.referredBy, code: users.referralCode })
      .from(users)
      .where(eq(users.id, newUserId))
      .limit(1);
    expect(u.referredBy).toBe(referrerId);
    // Eager code is populated even in the ?ref path (D-25).
    expect(u.code).toMatch(CODE_RE);

    const links = await app.db
      .select()
      .from(referrals)
      .where(eq(referrals.referredId, newUserId));
    expect(links).toHaveLength(1);
    expect(links[0].referrerId).toBe(referrerId);
    expect(links[0].status).toBe("pending");
    expect(links[0].attributionChannel).toBe("self_service");
  });

  it("sin ?ref no crea vínculo pero el nuevo socio SÍ obtiene su referral_code eager (D-25)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "ref-none@test.com",
        password: "password123",
        firstName: "Solo",
        lastName: "Member",
        phone: "5551110002",
        gender: "female",
        branchId,
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const newUserId = JSON.parse(res.body).user.id as number;

    const links = await app.db
      .select()
      .from(referrals)
      .where(eq(referrals.referredId, newUserId));
    expect(links).toHaveLength(0);

    const [u] = await app.db
      .select({ code: users.referralCode })
      .from(users)
      .where(eq(users.id, newUserId))
      .limit(1);
    expect(u.code).toMatch(CODE_RE);
  });

  it("un ?ref inexistente no crea vínculo pero el registro tiene éxito y con código (graceful, D-13)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "ref-bad@test.com",
        password: "password123",
        firstName: "Bad",
        lastName: "Code",
        phone: "5551110003",
        gender: "male",
        branchId,
        ref: "NOPE-0000",
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const newUserId = JSON.parse(res.body).user.id as number;

    const links = await app.db
      .select()
      .from(referrals)
      .where(eq(referrals.referredId, newUserId));
    expect(links).toHaveLength(0);

    const [u] = await app.db
      .select({ referredBy: users.referredBy, code: users.referralCode })
      .from(users)
      .where(eq(users.id, newUserId))
      .limit(1);
    expect(u.referredBy).toBeNull();
    expect(u.code).toMatch(CODE_RE);
  });
});
