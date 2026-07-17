/**
 * GET /api/admin/reports/multibranch-reassignment-preview — banner de Reportes.
 *
 * Endpoint fino (read-only) sobre runReassignMultibranch (ya testeado en
 * test/jobs/reassign-multibranch.test.ts); acá se verifica el wiring de la ruta:
 * la forma de la respuesta y el gate de rol (CAJA_ROLES).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";

const URL = "/api/admin/reports/multibranch-reassignment-preview";

describe("GET /reports/multibranch-reassignment-preview", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let coachToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);

    await createStaffUser(app, {
      email: "owner-rmb@test.com",
      password: "ownerpass123",
      firstName: "Owner",
      lastName: "RMB",
      role: "owner",
      branchId: branch.id,
    });
    await createStaffUser(app, {
      email: "coach-rmb@test.com",
      password: "coachpass123",
      firstName: "Coach",
      lastName: "RMB",
      role: "coach",
      branchId: branch.id,
    });
    ownerToken = await getAuthToken(app, "owner-rmb@test.com", "ownerpass123");
    coachToken = await getAuthToken(app, "coach-rmb@test.com", "coachpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  it("owner recibe 200 con la forma esperada", async () => {
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      nextRunAt: string;
      daysUntil: number;
      candidates: number;
      wouldReassign: number;
    };
    expect(typeof body.nextRunAt).toBe("string");
    expect(Number.isFinite(body.daysUntil)).toBe(true);
    expect(body.daysUntil).toBeGreaterThan(0);
    expect(body.candidates).toBeGreaterThanOrEqual(0);
    expect(body.wouldReassign).toBeGreaterThanOrEqual(0);
    // El próximo run es el 1° de un mes (día 1 en UTC).
    expect(new Date(body.nextRunAt).getUTCDate()).toBe(1);
  });

  it("coach recibe 403 (gate CAJA_ROLES)", async () => {
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
