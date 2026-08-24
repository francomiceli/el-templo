/**
 * Cartelera de aniversarios — GET /api/admin/anniversaries.
 *
 * Testea el endpoint contra MySQL real: lista los aniversarios de HOY de una
 * sede (y de mañana con includeTomorrow), filtra por sede, ordena hito más
 * grande primero, y sólo cuenta alumnos activos. La fecha "hoy" se pasa explícita
 * por query para no depender del reloj del server (evita la trampa de CI por
 * calendario).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";

const TODAY = "2026-06-15";

let seq = 0;

describe("GET /api/admin/anniversaries", () => {
  let app: FastifyInstance;
  let branchId: number;
  let otherBranchId: number;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    seq += 1;
    branchId = await insertBranch(`AN-${seq}`);
    otherBranchId = await insertBranch(`AN-OTHER-${seq}`);
    const email = `an-admin-${seq}-${Date.now()}@test.com`;
    await createStaffUser(app, {
      email,
      password: "secret123",
      firstName: "Admin",
      lastName: "Aniversarios",
      role: "admin",
      branchId,
      country: "AR",
    });
    token = await getAuthToken(app, email, "secret123");
  });

  async function insertBranch(code: string): Promise<number> {
    const res = await app.db.insert(schema.branches).values({
      name: code,
      code,
      country: "AR",
      timezone: "America/Argentina/Buenos_Aires",
    });
    return Number(res[0].insertId);
  }

  async function insertMember(opts: {
    createdAt: string;
    branchId: number;
    status?: "activo" | "inactivo";
  }): Promise<number> {
    seq += 1;
    const res = await app.db.insert(schema.users).values({
      email: `an-${seq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Aniv",
      lastName: `M${seq}`,
      role: "member",
      status: opts.status ?? "activo",
      branchId: opts.branchId,
      createdAt: new Date(`${opts.createdAt}T10:00:00Z`),
    });
    return Number(res[0].insertId);
  }

  function get(query: Record<string, string | number | boolean>) {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)]),
    ).toString();
    return app.inject({
      method: "GET",
      url: `/api/admin/anniversaries?${qs}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it("lista los aniversarios de hoy de la sede, hito más grande primero", async () => {
    await insertMember({ createdAt: "2025-06-15", branchId }); // 1 año hoy
    await insertMember({ createdAt: "2026-03-15", branchId }); // 3 meses hoy
    await insertMember({ createdAt: "2026-01-01", branchId }); // no cumple hoy
    await insertMember({ createdAt: "2025-12-16", branchId }); // 6 meses MAÑANA
    await insertMember({ createdAt: "2025-06-15", branchId: otherBranchId }); // otra sede

    const res = await get({ branchId, date: TODAY });
    expect(res.statusCode).toBe(200);
    const { anniversaries } = JSON.parse(res.body);

    expect(anniversaries).toHaveLength(2);
    expect(anniversaries[0]).toMatchObject({
      months: 12,
      label: "1 año",
      when: "today",
    });
    expect(anniversaries[1]).toMatchObject({
      months: 3,
      label: "3 meses",
      when: "today",
    });
  });

  it("incluye los de mañana con includeTomorrow, marcados 'tomorrow'", async () => {
    await insertMember({ createdAt: "2025-06-15", branchId }); // 1 año hoy
    await insertMember({ createdAt: "2025-12-16", branchId }); // 6 meses mañana

    const res = await get({ branchId, date: TODAY, includeTomorrow: true });
    expect(res.statusCode).toBe(200);
    const { anniversaries } = JSON.parse(res.body);

    expect(anniversaries).toHaveLength(2);
    expect(anniversaries[0]).toMatchObject({ months: 12, when: "today" });
    expect(anniversaries[1]).toMatchObject({ months: 6, when: "tomorrow" });
  });

  it("no incluye alumnos inactivos", async () => {
    await insertMember({
      createdAt: "2025-06-15",
      branchId,
      status: "inactivo",
    });

    const res = await get({ branchId, date: TODAY });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).anniversaries).toHaveLength(0);
  });

  it("filtra por sede: sólo devuelve la sede pedida", async () => {
    await insertMember({ createdAt: "2025-06-15", branchId: otherBranchId });

    const res = await get({ branchId, date: TODAY });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).anniversaries).toHaveLength(0);
  });

  it("rechaza sin autenticación", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/anniversaries?branchId=${branchId}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
