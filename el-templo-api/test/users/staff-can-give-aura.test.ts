/**
 * Permiso por persona "Puede dar Aura" en la ficha del staff (2026-11-27,
 * migración 0366 `users.can_give_aura`). Lo edita el dueño desde Usuarios:
 *   POST /api/admin/users          acepta `canGiveAura` (default false)
 *   GET  /api/admin/users          lo devuelve en cada fila
 *   PUT  /api/admin/users/:userId  lo cambia, y si no viene no lo toca
 *
 * Que el permiso efectivamente deje regalar se prueba en
 * test/aura/gifts-coach.test.ts (6b a 6e y 10b). Corre en CI.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";

const CTX = { tenantId: 1 };

interface StaffRow {
  id: number;
  email: string;
  canGiveAura: boolean;
}

describe("Usuarios: permiso por persona para dar Aura", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let branchId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          eq(schema.branches.isVirtual, false),
        ),
      )
      .limit(1);
    branchId = branch.id;
  });

  async function flagEnBase(userId: number): Promise<boolean | undefined> {
    const [row] = await app.db
      .select({ canGiveAura: schema.users.canGiveAura })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, userId)))
      .limit(1);
    return row?.canGiveAura;
  }

  async function listar(): Promise<StaffRow[]> {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as StaffRow[];
  }

  async function editar(userId: number, payload: Record<string, unknown>) {
    return app.inject({
      method: "PUT",
      url: `/api/admin/users/${userId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload,
    });
  }

  function crear(payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        firstName: "Recep",
        lastName: "Que Da Clase",
        password: "testpass123",
        role: "recepcion",
        branchId,
        branchIds: [branchId],
        ...payload,
      },
    });
  }

  it("el alta acepta canGiveAura, lo devuelve y queda guardado", async () => {
    const res = await crear({
      email: "recep-aura@test.com",
      canGiveAura: true,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: number; canGiveAura: boolean };
    expect(body.canGiveAura).toBe(true);
    expect(await flagEnBase(body.id)).toBe(true);
  });

  it("sin canGiveAura el alta lo deja apagado", async () => {
    const res = await crear({ email: "recep-sin-aura@test.com" });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: number; canGiveAura: boolean };
    expect(body.canGiveAura).toBe(false);
    expect(await flagEnBase(body.id)).toBe(false);
  });

  it("el listado devuelve canGiveAura en cada fila", async () => {
    const userId = await createStaffUser(app, {
      email: "recep-listado@test.com",
      password: "testpass123",
      firstName: "Recep",
      lastName: "Listado",
      role: "recepcion",
      branchId,
    });
    expect((await editar(userId, { canGiveAura: true })).statusCode).toBe(200);

    const filas = await listar();

    for (const fila of filas) expect(typeof fila.canGiveAura).toBe("boolean");
    expect(filas.find((f) => f.id === userId)?.canGiveAura).toBe(true);
  });

  it("la edición lo prende y lo apaga, y una edición que no lo manda no lo toca", async () => {
    const userId = await createStaffUser(app, {
      email: "recep-edicion@test.com",
      password: "testpass123",
      firstName: "Recep",
      lastName: "Edicion",
      role: "recepcion",
      branchId,
    });
    expect(await flagEnBase(userId)).toBe(false);

    const prender = await editar(userId, { canGiveAura: true });
    expect(prender.statusCode).toBe(200);
    expect((prender.json() as StaffRow).canGiveAura).toBe(true);

    const otroCampo = await editar(userId, { firstName: "Otro" });
    expect(otroCampo.statusCode).toBe(200);
    expect((otroCampo.json() as StaffRow).canGiveAura).toBe(true);
    expect(await flagEnBase(userId)).toBe(true);

    const apagar = await editar(userId, { canGiveAura: false });
    expect(apagar.statusCode).toBe(200);
    expect((apagar.json() as StaffRow).canGiveAura).toBe(false);
    expect(await flagEnBase(userId)).toBe(false);
  });

  it("un canGiveAura que no es booleano da 400 y no cambia nada", async () => {
    const userId = await createStaffUser(app, {
      email: "recep-400@test.com",
      password: "testpass123",
      firstName: "Recep",
      lastName: "Invalido",
      role: "recepcion",
      branchId,
    });

    const res = await editar(userId, { canGiveAura: "si" });

    expect(res.statusCode).toBe(400);
    expect(await flagEnBase(userId)).toBe(false);
  });

  it("solo el dueño lo cambia: un admin recibe 403", async () => {
    const userId = await createStaffUser(app, {
      email: "recep-403@test.com",
      password: "testpass123",
      firstName: "Recep",
      lastName: "Ajena",
      role: "recepcion",
      branchId,
    });
    await createStaffUser(app, {
      email: "admin-403@test.com",
      password: "testpass123",
      firstName: "Admin",
      lastName: "Sin Permiso",
      role: "admin",
      branchId,
    });
    const adminToken = await getAuthToken(
      app,
      "admin-403@test.com",
      "testpass123",
    );

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { canGiveAura: true },
    });

    expect(res.statusCode).toBe(403);
    expect(await flagEnBase(userId)).toBe(false);
  });
});
