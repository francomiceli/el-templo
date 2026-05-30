/**
 * GET /api/admin/members/search — lightweight typeahead for the scheduling
 * dialogs (SlotDetailDialog / SlotAttendancePanel).
 *
 * Unlike GET /api/admin/members it skips the COUNT, the per-currency debt
 * aggregate, and most enrichment subqueries — projecting only id/name/dni plus
 * plan/status (for the "Activa/Inactiva/Sin plan" badge). These tests pin that
 * contract. Status is computed LIVE from subscriptions (mirrors listMembers'
 * effectiveStatusExpr), so a lapsed member reads 'inactivo' even when the
 * persisted users.status column is stale.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { subscriptions } from "../../src/db/schema/subscriptions";

describe("GET /api/admin/members/search", () => {
  let app: FastifyInstance;
  let adminToken: string;
  const branchId = 1;
  let planId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeMember(opts: {
    firstName: string;
    lastName: string;
    dni?: string;
    status?: "freemium" | "prueba" | "activo" | "inactivo";
    deleted?: boolean;
    role?: "member" | "coach" | "admin";
  }): Promise<number> {
    const [row] = await app.db
      .insert(users)
      .values({
        email: `${opts.firstName.toLowerCase()}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}@test.com`,
        passwordHash: await argon2.hash("ignored"),
        firstName: opts.firstName,
        lastName: opts.lastName,
        phone: null,
        dni: opts.dni ?? null,
        branchId,
        role: opts.role ?? "member",
        level: "alfa",
        status: opts.status ?? "activo",
        deletedAt: opts.deleted ? new Date() : null,
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
      name: `SearchPlan-${Date.now()}`,
      country: "AR",
      planCategory: "online_regular",
      bookingMode: "flexible",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: null,
    });
    planId = (plan as { insertId: number }).insertId;
  });

  interface SearchResponse {
    members: Array<{
      id: number;
      firstName: string | null;
      lastName: string | null;
      dni: string | null;
      planName: string | null;
      status: string | null;
    }>;
  }

  async function search(query: string): Promise<SearchResponse> {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/search?${query}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as SearchResponse;
  }

  it("finds a member by first name", async () => {
    await makeMember({ firstName: "Mariano", lastName: "Perez" });
    await makeMember({ firstName: "Lucas", lastName: "Gomez" });

    const { members } = await search("search=mari");
    expect(members).toHaveLength(1);
    expect(members[0].firstName).toBe("Mariano");
  });

  it("finds a member by last name", async () => {
    await makeMember({ firstName: "Ana", lastName: "Figueras" });
    await makeMember({ firstName: "Beto", lastName: "Suarez" });

    const { members } = await search("search=figue");
    expect(members).toHaveLength(1);
    expect(members[0].lastName).toBe("Figueras");
  });

  it("finds a member by DNI", async () => {
    await makeMember({ firstName: "Juan", lastName: "Diaz", dni: "30111222" });
    await makeMember({ firstName: "Pedro", lastName: "Ruiz", dni: "28999888" });

    const { members } = await search("search=30111");
    expect(members).toHaveLength(1);
    expect(members[0].dni).toBe("30111222");
  });

  it("returns planName + live 'activo' status for a member with an active sub", async () => {
    const userId = await makeMember({
      firstName: "Sofia",
      lastName: "Activa",
      status: "activo",
    });
    // Active subscription spanning today.
    await seedSubscription(userId, "active", "2026-01-01", "2026-12-31");

    const { members } = await search("search=sofia");
    expect(members).toHaveLength(1);
    expect(members[0].planName).toMatch(/^SearchPlan-/);
    expect(members[0].status).toBe("activo");
  });

  it("derives 'inactivo' and null planName when the only sub has lapsed", async () => {
    // users.status column still says 'activo', but the only sub ended in the
    // past → effectiveStatus must derive 'inactivo'. planName stays null
    // because the sub is 'expired' (not active/paused).
    const userId = await makeMember({
      firstName: "Tomas",
      lastName: "Vencido",
      status: "activo",
    });
    await seedSubscription(userId, "expired", "2025-01-01", "2025-02-01");

    const { members } = await search("search=tomas");
    expect(members).toHaveLength(1);
    expect(members[0].planName).toBeNull();
    expect(members[0].status).toBe("inactivo");
  });

  it("returns null planName for a member with no subscription", async () => {
    await makeMember({
      firstName: "Nadia",
      lastName: "Sinplan",
      status: "prueba",
    });

    const { members } = await search("search=nadia");
    expect(members).toHaveLength(1);
    expect(members[0].planName).toBeNull();
  });

  it("excludes soft-deleted members", async () => {
    await makeMember({ firstName: "Borrado", lastName: "Test", deleted: true });

    const { members } = await search("search=borrado");
    expect(members).toHaveLength(0);
  });

  it("excludes non-member roles (coaches/admins)", async () => {
    await makeMember({
      firstName: "Homonimo",
      lastName: "Coach",
      role: "coach",
    });
    await makeMember({
      firstName: "Homonimo",
      lastName: "Member",
      role: "member",
    });

    const { members } = await search("search=homonimo");
    expect(members).toHaveLength(1);
    expect(members[0].lastName).toBe("Member");
  });

  it("respects the limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await makeMember({ firstName: `Repe${i}`, lastName: "Apellidorepetido" });
    }

    const { members } = await search("search=apellidorepetido&limit=3");
    expect(members).toHaveLength(3);
  });

  it("returns 400 when the search param is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/search",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 without authentication", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/members/search?search=mari",
    });
    expect(res.statusCode).toBe(401);
  });

  it("does not capture /search as a :userId profile lookup", async () => {
    // Regression guard: /search must be registered before /:userId, otherwise
    // Fastify routes it into the profile handler and 'search' fails int parse.
    const { members } = await search("search=anything");
    expect(Array.isArray(members)).toBe(true);
  });
});
