/**
 * POST /api/admin/members/:userId/convert-to-trial integration tests.
 *
 * Covers the freemium→prueba conversion — the inverse counterpart of the
 * prueba→activo conversion that assignPlan performs. Verifies the status flip,
 * lead-lifecycle initialization, createdBy spoof-guard, branch reassignment,
 * the physical-branch requirement, and the freemium-only guard.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createTestMember,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";
// Fase 173 (ADO-02): `users` entra a TENANT_STRICT_MODULES — las lecturas de
// conveniencia por id/email de este archivo se acotan con `tenantWhere`
// (categoría 2, docblock de `test/helpers.ts`); este archivo no siembra en
// el gimnasio 2.
import { tenantWhere } from "../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "./fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("POST /api/admin/members/:userId/convert-to-trial", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminId: number;
  let physicalBranchId: number;
  let virtualBranchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [admin] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.email, "admin@test.com"),
        ),
      )
      .limit(1);
    if (!admin) throw new Error("seed admin missing");
    adminId = admin.id;

    const [physical] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"))
      .limit(1);
    if (!physical) throw new Error("seed TEST branch missing");
    physicalBranchId = physical.id;

    const [virtual] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "ONLINE"))
      .limit(1);
    if (!virtual) throw new Error("seed ONLINE branch missing");
    virtualBranchId = virtual.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  async function convert(
    userId: number,
    payload: Record<string, unknown>,
    token = adminToken,
  ) {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/members/${userId}/convert-to-trial`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("converts a freemium member into a prueba lead (happy path)", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });

    // Sanity: self-registered members start as freemium with no lead fields.
    const [before] = await app.db
      .select({
        status: schema.users.status,
        leadStatus: schema.users.leadStatus,
        createdBy: schema.users.createdBy,
        convertedAt: schema.users.convertedAt,
      })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);
    expect(before.status).toBe("freemium");

    const { statusCode, body } = await convert(member.id, {
      branchId: physicalBranchId,
    });

    expect(statusCode).toBe(200);
    expect(body.status).toBe("prueba");

    const [after] = await app.db
      .select({
        status: schema.users.status,
        leadStatus: schema.users.leadStatus,
        createdBy: schema.users.createdBy,
        branchId: schema.users.branchId,
        convertedAt: schema.users.convertedAt,
      })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);

    expect(after.status).toBe("prueba");
    expect(after.leadStatus).toBe("en_seguimiento");
    expect(after.createdBy).toBe(adminId);
    expect(after.branchId).toBe(physicalBranchId);
    // converted_at MUST stay NULL so the lead-conversion hook still fires on
    // the first plan assignment.
    expect(after.convertedAt).toBeNull();
  });

  it("ignores a spoofed createdBy in the body (sourced from JWT)", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });

    const { statusCode } = await convert(member.id, {
      branchId: physicalBranchId,
      createdBy: 999999,
    });

    expect(statusCode).toBe(200);

    const [after] = await app.db
      .select({ createdBy: schema.users.createdBy })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);
    expect(after.createdBy).toBe(adminId);
  });

  it("rejects conversion to a virtual branch with 409", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });

    const { statusCode } = await convert(member.id, {
      branchId: virtualBranchId,
    });

    expect(statusCode).toBe(409);

    const [after] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);
    expect(after.status).toBe("freemium");
  });

  it("rejects a non-freemium user with 409 (no-op on a prueba lead)", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });
    // First conversion succeeds (freemium → prueba).
    await convert(member.id, { branchId: physicalBranchId });

    // Second conversion must be rejected — the user is no longer freemium.
    const { statusCode } = await convert(member.id, {
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(409);
  });

  it("returns 404 for a non-existent user", async () => {
    const { statusCode } = await convert(999999, {
      branchId: physicalBranchId,
    });
    expect(statusCode).toBe(404);
  });

  it("returns 400 when branchId is missing", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });
    const { statusCode } = await convert(member.id, {});
    expect(statusCode).toBe(400);
  });

  // Fase 165 (D-02): ninguna alta de SP desde el admin puede quedar sin
  // teléfono del lead. El freemium sin phone se rechaza hasta que se lo cargue.
  it("rejects a phone-less freemium with 409 when no phone is provided", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });
    // Simula el lead viejo sin teléfono (los freemium legacy existen sin phone).
    await app.db
      .update(schema.users)
      .set({ phone: null })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      );

    const { statusCode, body } = await convert(member.id, {
      branchId: physicalBranchId,
    });

    expect(statusCode).toBe(409);
    expect(body.message).toContain("teléfono");

    // No muta estado: sigue freemium.
    const [after] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);
    expect(after.status).toBe("freemium");
  });

  it("converts a phone-less freemium when phone comes in the body, persisting it country-preserving", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });
    await app.db
      .update(schema.users)
      .set({ phone: null })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      );

    const { statusCode, body } = await convert(member.id, {
      branchId: physicalBranchId,
      phone: "+54 9 11 2222-3333",
    });

    expect(statusCode).toBe(200);
    expect(body.status).toBe("prueba");

    const [after] = await app.db
      .select({ status: schema.users.status, phone: schema.users.phone })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);
    expect(after.status).toBe("prueba");
    // WR-02: número completo con país (ya no truncado a "1122223333").
    expect(after.phone).toBe("+5491122223333");
  });

  it("persists a Spanish number (+34 …) without corrupting the country digit (WR-02)", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });
    await app.db
      .update(schema.users)
      .set({ phone: null })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      );

    const { statusCode } = await convert(member.id, {
      branchId: physicalBranchId,
      phone: "+34 612 345 678",
    });
    expect(statusCode).toBe(200);

    const [after] = await app.db
      .select({ phone: schema.users.phone })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);
    // normalizePhone truncaba a "4612345678" (perdía el 3 del 34). Ahora intacto.
    expect(after.phone).toBe("+34612345678");
  });

  it("rejects a non-digit phone ('abc') without promoting the lead (CR-01/WR-03)", async () => {
    const member = await createTestMember(app, { branchId: virtualBranchId });
    await app.db
      .update(schema.users)
      .set({ phone: null })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      );

    // "abc" no tiene dígitos: WR-03 (pattern ≥6 dígitos) lo rechaza en el borde;
    // el guard del service (CR-01) es el respaldo. El teléfono NUNCA se dropea:
    // el lead sigue freemium en vez de quedar en 'prueba' sin teléfono.
    const { statusCode } = await convert(member.id, {
      branchId: physicalBranchId,
      phone: "abc",
    });
    expect(statusCode).toBe(400);

    const [after] = await app.db
      .select({ status: schema.users.status, phone: schema.users.phone })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, member.id),
        ),
      )
      .limit(1);
    expect(after.status).toBe("freemium");
    expect(after.phone).toBeNull();
  });
});
