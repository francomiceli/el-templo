import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  assignTestPlan,
  cleanAllTestData,
} from "../helpers";
import { userStatusHistory } from "../../src/db/schema/user-status-history";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
// Fase 173 (ADO-02): `users`/`user_status_history` entran a
// TENANT_STRICT_MODULES — las lecturas de conveniencia por id de este
// archivo se acotan con `tenantWhere` (categoría 2, docblock de
// `test/helpers.ts`); este archivo no siembra en el gimnasio 2.
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const MEMBERS_URL = "/api/admin/members";

/**
 * Phase 118 Plan 01 (D-02) — user_status_history hooks.
 *
 * Real-MySQL integration. Verifies that the previously-blind status
 * transitions now write `user_status_history` rows:
 *   - createMember / createTrialMember (status='prueba') → from=null,
 *     to='prueba', source='admin'.
 *   - convertFreemiumToTrial (freemium → prueba) → source='admin'.
 *   - PUT /:userId SP→legajo promotion (prueba → inactivo) → source='admin'.
 *   - A no-op update (status unchanged) writes 0 rows.
 *   - The existing recomputeUserStatus hook (source='recompute') is NOT
 *     duplicated by the new admin hooks.
 */
describe("user_status_history hooks (Phase 118 Plan 01)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let branchAR: number; // physical AR branch ('TEST')
  let onlineBranch: number; // virtual branch for freemium self-registration

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [ar] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TEST"));
    branchAR = ar.id;

    // A virtual (online) branch so self-registered freemium users land on a
    // non-physical sede, matching the convertFreemiumToTrial precondition.
    await app.db
      .insert(branches)
      .values({
        name: "Online Test",
        code: "TESTONLINE",
        country: "AR",
        isVirtual: true,
      })
      .onDuplicateKeyUpdate({ set: { name: "Online Test" } });
    const [online] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TESTONLINE"));
    onlineBranch = online.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /** Fetch all history rows for a user, oldest first. */
  async function historyOf(userId: number) {
    return app.db
      .select({
        fromStatus: userStatusHistory.fromStatus,
        toStatus: userStatusHistory.toStatus,
        source: userStatusHistory.source,
      })
      .from(userStatusHistory)
      .where(
        and(
          tenantWhere(userStatusHistory, TEMPLO_CTX),
          eq(userStatusHistory.userId, userId),
        ),
      )
      .orderBy(userStatusHistory.changedAt, userStatusHistory.id);
  }

  it("(a) createMember (status='prueba') writes from=null/to='prueba'/source='admin'", async () => {
    const res = await app.inject({
      method: "POST",
      url: MEMBERS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: `hook-create-${Date.now()}@test.com`,
        firstName: "Hook",
        lastName: "Create",
        phone: `+5493510000001`,
        dni: `H${Date.now().toString(36)}`,
        branchId: branchAR,
        // NO planId → status stays 'prueba' (no assignPlan recompute).
      },
    });
    expect(res.statusCode).toBe(201);
    const userId = (JSON.parse(res.body) as { id: number }).id;

    const rows = await historyOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromStatus: null,
      toStatus: "prueba",
      source: "admin",
    });
  });

  it("(a') createTrialMember (status='prueba') writes from=null/to='prueba'/source='admin'", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${MEMBERS_URL}/trial`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Hook",
        lastName: "Trial",
        phone: `+5493510000002`,
        branchId: branchAR,
      },
    });
    expect(res.statusCode).toBe(201);
    const userId = (JSON.parse(res.body) as { id: number }).id;

    const rows = await historyOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromStatus: null,
      toStatus: "prueba",
      source: "admin",
    });
  });

  it("(a'') convertFreemiumToTrial (freemium → prueba) writes from='freemium'/to='prueba'/source='admin'", async () => {
    // Self-register a freemium user on the virtual branch.
    const reg = await registerUser(app, {
      email: `hook-freemium-${Date.now()}@test.com`,
      password: "pass123456",
      firstName: "Hook",
      lastName: "Freemium",
      branchId: onlineBranch,
    });
    const userId = (reg.user as { id: number }).id;

    // Sanity: a freshly self-registered user is 'freemium' with no admin rows.
    const before = await historyOf(userId);
    expect(before.filter((r) => r.source === "admin")).toHaveLength(0);

    const res = await app.inject({
      method: "POST",
      url: `${MEMBERS_URL}/${userId}/convert-to-trial`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { branchId: branchAR },
    });
    expect(res.statusCode).toBe(200);

    const adminRows = (await historyOf(userId)).filter(
      (r) => r.source === "admin",
    );
    expect(adminRows).toHaveLength(1);
    expect(adminRows[0]).toMatchObject({
      fromStatus: "freemium",
      toStatus: "prueba",
      source: "admin",
    });
  });

  it("(b) SP → legajo promotion (prueba → inactivo) writes exactly 1 row source='admin'", async () => {
    // Create a trial lead (status='prueba', source='admin' row written).
    const trialRes = await app.inject({
      method: "POST",
      url: `${MEMBERS_URL}/trial`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Hook",
        lastName: "Promote",
        phone: `+5493510000003`,
        branchId: branchAR,
      },
    });
    expect(trialRes.statusCode).toBe(201);
    const userId = (JSON.parse(trialRes.body) as { id: number }).id;

    // Fill the presencial-required fields → triggers SP → legajo promotion.
    const putRes = await app.inject({
      method: "PUT",
      url: `${MEMBERS_URL}/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        dni: `H${Date.now().toString(36)}p`,
        documentType: "DNI",
        dateOfBirth: "1990-01-01",
      },
    });
    expect(putRes.statusCode).toBe(200);

    // Final status is 'inactivo'.
    const [u] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, userId)));
    expect(u.status).toBe("inactivo");

    const rows = await historyOf(userId);
    // 1 from the trial create + 1 from the promotion = 2 total, both admin.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      fromStatus: null,
      toStatus: "prueba",
      source: "admin",
    });
    expect(rows[1]).toMatchObject({
      fromStatus: "prueba",
      toStatus: "inactivo",
      source: "admin",
    });
    // Exactly one prueba → inactivo admin row.
    const inactivoRows = await app.db
      .select({ id: userStatusHistory.id })
      .from(userStatusHistory)
      .where(
        and(
          tenantWhere(userStatusHistory, TEMPLO_CTX),
          eq(userStatusHistory.userId, userId),
          eq(userStatusHistory.toStatus, "inactivo"),
          eq(userStatusHistory.source, "admin"),
        ),
      );
    expect(inactivoRows).toHaveLength(1);
  });

  it("(c) a PUT that does not change status writes NO new history row", async () => {
    // Create a trial lead (1 admin row from the create).
    const trialRes = await app.inject({
      method: "POST",
      url: `${MEMBERS_URL}/trial`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Hook",
        lastName: "NoChange",
        phone: `+5493510000004`,
        branchId: branchAR,
      },
    });
    expect(trialRes.statusCode).toBe(201);
    const userId = (JSON.parse(trialRes.body) as { id: number }).id;

    const countBefore = (await historyOf(userId)).length;
    expect(countBefore).toBe(1);

    // A field-only edit that leaves status='prueba' (no presencial-required
    // fields → no SP→legajo promotion) must NOT write any history row.
    const putRes = await app.inject({
      method: "PUT",
      url: `${MEMBERS_URL}/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { firstName: "HookEdited" },
    });
    expect(putRes.statusCode).toBe(200);

    const countAfter = (await historyOf(userId)).length;
    expect(countAfter).toBe(countBefore);
  });

  it("(d) the recompute hook is not duplicated by the admin hooks", async () => {
    // Admin creates a member → createMember writes 1 admin row (prueba). Then a
    // plan is assigned via the subscription API, whose recomputeUserStatus
    // flips prueba → activo with source='recompute'. The new admin hooks must
    // NOT also write an 'admin' row for that flip — the recompute path owns it.
    const createRes = await app.inject({
      method: "POST",
      url: MEMBERS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: `hook-recompute-${Date.now()}@test.com`,
        firstName: "Hook",
        lastName: "Recompute",
        phone: `+5493510000005`,
        dni: `H${Date.now().toString(36)}r`,
        branchId: branchAR,
        // No planId here — assign the plan explicitly below so recompute fires
        // through the subscription service (deterministic, not the best-effort
        // auto-subscription in the create route).
      },
    });
    expect(createRes.statusCode).toBe(201);
    const userId = (JSON.parse(createRes.body) as { id: number }).id;

    // An online plan needs no schedules — keeps the assign flow deterministic
    // (a presencial plan would require scheduleIds and fail with a 400).
    const [onlinePlan] = await app.db.insert(subscriptionPlans).values({
      name: `HookOnlinePlan-${Date.now()}`,
      country: "AR",
      planCategory: "online_regular",
      bookingMode: "flexible",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: null,
    });
    const onlinePlanId = (onlinePlan as { insertId: number }).insertId;

    const assign = await assignTestPlan(app, adminToken, userId, onlinePlanId, {
      branchId: branchAR,
    });
    expect(assign.statusCode).toBeLessThan(300);

    // The plan flip moved the member to 'activo'.
    const [u] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, userId)));
    expect(u.status).toBe("activo");

    const rows = await historyOf(userId);
    const adminRows = rows.filter((r) => r.source === "admin");
    const recomputeRows = rows.filter((r) => r.source === "recompute");

    // Exactly one 'admin' row: the create → prueba transition.
    expect(adminRows).toHaveLength(1);
    expect(adminRows[0]).toMatchObject({
      fromStatus: null,
      toStatus: "prueba",
      source: "admin",
    });
    // The prueba → activo flip is recorded exactly once, by recompute.
    expect(recomputeRows).toHaveLength(1);
    expect(recomputeRows[0]).toMatchObject({
      fromStatus: "prueba",
      toStatus: "activo",
      source: "recompute",
    });
    // No admin row ever records a transition TO 'activo' (that's recompute's job).
    expect(adminRows.some((r) => r.toStatus === "activo")).toBe(false);
  });
});
