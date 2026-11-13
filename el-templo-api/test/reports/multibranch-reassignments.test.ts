/**
 * GET /api/admin/reports/multibranch-reassignments — histórico de
 * recategorizaciones multisucursal (tabla `branch_reassignments`, mig 0334).
 *
 * Endpoint de solo lectura. Se verifica: la forma de la respuesta (nombres de
 * alumno y de sedes), el orden descendente, la ventana `months`, la sede de
 * origen desconocida (null), el gate de roles, el candado de país de los roles
 * no owner y el aislamiento entre gimnasios.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const URL = "/api/admin/reports/multibranch-reassignments";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

const DAY_MS = 24 * 60 * 60 * 1000;

interface ReassignmentDto {
  id: number;
  memberId: number;
  memberName: string;
  fromBranchId: number | null;
  fromBranchName: string | null;
  toBranchId: number;
  toBranchName: string;
  toBranchAttendances: number;
  totalAttendances: number;
  source: "cron" | "backfill";
  reassignedAt: string;
}

let seq = 0;

describe("GET /reports/multibranch-reassignments", () => {
  let app: FastifyInstance;
  let gym2: SegundoGimnasio;
  let ownerToken: string;
  let adminArToken: string;
  let coachToken: string;
  let adminSedeToken: string;
  let branchA: { id: number; name: string }; // AR
  let branchB: { id: number; name: string }; // AR
  let branchEs: { id: number; name: string }; // ES

  async function insertBranch(
    country: "AR" | "ES",
    label: string,
  ): Promise<{ id: number; name: string }> {
    seq += 1;
    const name = `Sede ${label} ${seq}`;
    const [row] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(CTX_TEMPLO, {
          name,
          code: `RMH-${label}-${seq}-${Date.now().toString(36)}`,
          country,
          timezone:
            country === "AR"
              ? "America/Argentina/Buenos_Aires"
              : "Europe/Madrid",
        }),
      )
      .$returningId();
    return { id: row.id, name };
  }

  async function insertMember(
    ctx: TenantContext,
    branchId: number,
    firstName: string,
    lastName: string,
  ): Promise<number> {
    seq += 1;
    const [row] = await app.db
      .insert(schema.users)
      .values(
        tenantValues(ctx, {
          email: `rmh-${seq}-${Date.now()}@test.com`,
          passwordHash: "x",
          firstName,
          lastName,
          role: "member" as const,
          branchId,
        }),
      )
      .$returningId();
    return row.id;
  }

  async function insertEvent(
    ctx: TenantContext,
    e: {
      memberId: number;
      fromBranchId: number | null;
      toBranchId: number;
      toBranchAttendances?: number;
      totalAttendances?: number;
      source?: "cron" | "backfill";
      reassignedAt: Date;
    },
  ): Promise<number> {
    const [row] = await app.db
      .insert(schema.branchReassignments)
      .values(
        tenantValues(ctx, {
          memberId: e.memberId,
          fromBranchId: e.fromBranchId,
          toBranchId: e.toBranchId,
          toBranchAttendances: e.toBranchAttendances ?? 8,
          totalAttendances: e.totalAttendances ?? 10,
          source: e.source ?? ("cron" as const),
          reassignedAt: e.reassignedAt,
        }),
      )
      .$returningId();
    return row.id;
  }

  async function get(token: string, query = ""): Promise<ReassignmentDto[]> {
    const res = await app.inject({
      method: "GET",
      url: `${URL}${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as ReassignmentDto[];
  }

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    branchA = await insertBranch("AR", "A");
    branchB = await insertBranch("AR", "B");
    branchEs = await insertBranch("ES", "ES");

    await createStaffUser(app, {
      email: "owner-rmh@test.com",
      password: "ownerpass123",
      firstName: "Owner",
      lastName: "RMH",
      role: "owner",
      branchId: branchA.id,
    });
    await createStaffUser(app, {
      email: "admin-ar-rmh@test.com",
      password: "adminpass123",
      firstName: "Admin",
      lastName: "AR",
      role: "admin",
      branchId: branchA.id,
      country: "AR",
    });
    await createStaffUser(app, {
      email: "coach-rmh@test.com",
      password: "coachpass123",
      firstName: "Coach",
      lastName: "RMH",
      role: "coach",
      branchId: branchA.id,
    });
    await createStaffUser(app, {
      email: "admin-sede-rmh@test.com",
      password: "sedepass123",
      firstName: "Sede",
      lastName: "RMH",
      role: "admin_sede",
      branchId: branchA.id,
    });
    ownerToken = await getAuthToken(app, "owner-rmh@test.com", "ownerpass123");
    adminArToken = await getAuthToken(
      app,
      "admin-ar-rmh@test.com",
      "adminpass123",
    );
    coachToken = await getAuthToken(app, "coach-rmh@test.com", "coachpass123");
    adminSedeToken = await getAuthToken(
      app,
      "admin-sede-rmh@test.com",
      "sedepass123",
    );

    gym2 = await seedSecondTenant(app);
  });

  beforeEach(async () => {
    // Solo los eventos: el resto (staff, sedes, gimnasio 2) se siembra una vez.
    await app.db
      .delete(schema.branchReassignments)
      .where(tenantWhere(schema.branchReassignments, CTX_TEMPLO));
    await app.db
      .delete(schema.branchReassignments)
      .where(tenantWhere(schema.branchReassignments, CTX_DOS));
  });

  afterAll(async () => {
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  it("owner recibe los eventos con nombre de alumno y de sedes, más nuevo primero", async () => {
    const ana = await insertMember(CTX_TEMPLO, branchB.id, "Ana", "Pérez");
    const beto = await insertMember(CTX_TEMPLO, branchA.id, "Beto", "Gómez");
    const now = Date.now();
    const idViejo = await insertEvent(CTX_TEMPLO, {
      memberId: ana,
      fromBranchId: branchA.id,
      toBranchId: branchB.id,
      toBranchAttendances: 8,
      totalAttendances: 10,
      source: "cron",
      reassignedAt: new Date(now - 40 * DAY_MS),
    });
    const idNuevo = await insertEvent(CTX_TEMPLO, {
      memberId: beto,
      fromBranchId: branchB.id,
      toBranchId: branchA.id,
      toBranchAttendances: 5,
      totalAttendances: 6,
      source: "backfill",
      reassignedAt: new Date(now - 5 * DAY_MS),
    });

    const rows = await get(ownerToken);

    expect(rows.map((r) => r.id)).toEqual([idNuevo, idViejo]);
    expect(rows[0]).toMatchObject({
      id: idNuevo,
      memberId: beto,
      memberName: "Beto Gómez",
      fromBranchId: branchB.id,
      fromBranchName: branchB.name,
      toBranchId: branchA.id,
      toBranchName: branchA.name,
      toBranchAttendances: 5,
      totalAttendances: 6,
      source: "backfill",
    });
    expect(rows[1]).toMatchObject({
      memberName: "Ana Pérez",
      fromBranchName: branchA.name,
      toBranchName: branchB.name,
      toBranchAttendances: 8,
      totalAttendances: 10,
      source: "cron",
    });
    // reassignedAt viaja como ISO 8601.
    expect(new Date(rows[0].reassignedAt).toISOString()).toBe(
      rows[0].reassignedAt,
    );
  });

  it("sin sede de origen conocida devuelve fromBranchId y fromBranchName en null", async () => {
    const m = await insertMember(CTX_TEMPLO, branchA.id, "Carla", "Díaz");
    await insertEvent(CTX_TEMPLO, {
      memberId: m,
      fromBranchId: null,
      toBranchId: branchA.id,
      source: "backfill",
      reassignedAt: new Date(Date.now() - 10 * DAY_MS),
    });

    const rows = await get(ownerToken);

    expect(rows).toHaveLength(1);
    expect(rows[0].fromBranchId).toBeNull();
    expect(rows[0].fromBranchName).toBeNull();
    expect(rows[0].toBranchName).toBe(branchA.name);
  });

  it("sin eventos devuelve una lista vacía", async () => {
    expect(await get(ownerToken)).toEqual([]);
  });

  it("respeta la ventana months (default 12, máximo 24)", async () => {
    const m = await insertMember(CTX_TEMPLO, branchA.id, "Dani", "Ruiz");
    const now = Date.now();
    const idReciente = await insertEvent(CTX_TEMPLO, {
      memberId: m,
      fromBranchId: branchB.id,
      toBranchId: branchA.id,
      reassignedAt: new Date(now - 3 * 30 * DAY_MS),
    });
    const idViejo = await insertEvent(CTX_TEMPLO, {
      memberId: m,
      fromBranchId: branchA.id,
      toBranchId: branchB.id,
      reassignedAt: new Date(now - 14 * 30 * DAY_MS),
    });

    // Default = 12 meses: solo el de hace ~3 meses.
    expect((await get(ownerToken)).map((r) => r.id)).toEqual([idReciente]);
    // 2 meses: ninguno.
    expect(await get(ownerToken, "?months=2")).toEqual([]);
    // 24 meses: los dos, el más nuevo primero.
    expect((await get(ownerToken, "?months=24")).map((r) => r.id)).toEqual([
      idReciente,
      idViejo,
    ]);
  });

  it("rechaza months fuera de 1..24 con 400", async () => {
    for (const months of ["0", "25", "abc"]) {
      const res = await app.inject({
        method: "GET",
        url: `${URL}?months=${months}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("coach recibe 403 (gate CAJA_ROLES)", async () => {
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin_sede recibe 403 (la vista es de todas las sedes)", async () => {
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${adminSedeToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("sin token recibe 401", async () => {
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(401);
  });

  it("un admin (no owner) ve solo las recategorizaciones hacia sedes de su país; el owner ve todas", async () => {
    const m = await insertMember(CTX_TEMPLO, branchA.id, "Eva", "Sanz");
    const now = Date.now();
    const idAr = await insertEvent(CTX_TEMPLO, {
      memberId: m,
      fromBranchId: branchB.id,
      toBranchId: branchA.id,
      reassignedAt: new Date(now - 2 * DAY_MS),
    });
    const idEs = await insertEvent(CTX_TEMPLO, {
      memberId: m,
      fromBranchId: null,
      toBranchId: branchEs.id,
      reassignedAt: new Date(now - 3 * DAY_MS),
    });

    expect((await get(adminArToken)).map((r) => r.id)).toEqual([idAr]);
    expect((await get(ownerToken)).map((r) => r.id)).toEqual([idAr, idEs]);
  });

  it("aislamiento: un evento del gimnasio 2 no aparece en El Templo (y viceversa)", async () => {
    const mTemplo = await insertMember(
      CTX_TEMPLO,
      branchA.id,
      "Facu",
      "Templo",
    );
    const idTemplo = await insertEvent(CTX_TEMPLO, {
      memberId: mTemplo,
      fromBranchId: branchB.id,
      toBranchId: branchA.id,
      reassignedAt: new Date(Date.now() - 2 * DAY_MS),
    });
    // Evento del gimnasio 2: alumno y sedes del gimnasio 2.
    const idDos = await insertEvent(CTX_DOS, {
      memberId: gym2.socios[0].id,
      fromBranchId: null,
      toBranchId: gym2.branchId,
      reassignedAt: new Date(Date.now() - 1 * DAY_MS),
    });

    const rows = await get(ownerToken);
    expect(rows.map((r) => r.id)).toEqual([idTemplo]);
    expect(rows.map((r) => r.id)).not.toContain(idDos);

    // Control positivo: el evento del gimnasio 2 existe en la base con su tenant.
    const [fila] = await app.db
      .select({ tenantId: schema.branchReassignments.tenantId })
      .from(schema.branchReassignments)
      .where(tenantWhere(schema.branchReassignments, CTX_DOS));
    expect(fila.tenantId).toBe(TENANT_DOS);
  });
});
