/**
 * Dirección del socio (calle y altura) — pop-up único de Mi Templo + Perfil.
 *
 * - GET /api/auth/me devuelve SIEMPRE `address` (null si no la cargó) y
 *   `branchLocality` (la ciudad de la sede: la app pide la dirección solo a
 *   socios de sedes de Mar del Plata).
 * - PUT /api/auth/me/address la carga, la cambia o la borra (`null`). El
 *   userId sale del JWT: el body no puede apuntar a otro socio.
 *
 * El aislamiento entre gimnasios vive en test/tenancy/iso-03-auth.test.ts.
 * Sin ids de `users` hardcodeados; emails únicos por corrida.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const MDP_CODE = "ADDRMDP01";
const SIN_CIUDAD_CODE = "ADDRNOLOC01";

interface MeBody {
  address: string | null;
  branchLocality: string | null;
}

describe("dirección del socio — GET /me + PUT /me/address", () => {
  let app: FastifyInstance;
  let mdpBranchId: number;
  let sinCiudadBranchId: number;

  async function upsertBranch(
    code: string,
    name: string,
    locality: string | null,
  ): Promise<number> {
    await app.db
      .insert(branches)
      .values({ name, code, locality })
      .onDuplicateKeyUpdate({ set: { locality } });
    const [row] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, code));
    return row.id;
  }

  async function addressEnDb(userId: number): Promise<string | null> {
    const [row] = await app.db
      .select({ address: users.address })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, userId)));
    return row.address;
  }

  function getMe(token: string) {
    return app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function putAddress(token: string | null, payload: unknown) {
    return app.inject({
      method: "PUT",
      url: "/api/auth/me/address",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as Record<string, unknown>,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    mdpBranchId = await upsertBranch(
      MDP_CODE,
      "Sede MdP dirección",
      "Mar del Plata",
    );
    sinCiudadBranchId = await upsertBranch(
      SIN_CIUDAD_CODE,
      "Sede sin ciudad dirección",
      null,
    );
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("GET /me: socio nuevo de una sede de MdP → address null y branchLocality 'Mar del Plata'", async () => {
    const socio = await createTestMember(app, { branchId: mdpBranchId });
    const res = await getMe(socio.token);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as MeBody;
    // `toHaveProperty` + null: la clave tiene que venir aunque esté vacía (la
    // app distingue "no cargada" de "API vieja sin el campo").
    expect(body).toHaveProperty("address", null);
    expect(body.branchLocality).toBe("Mar del Plata");
  });

  it("GET /me: sede sin ciudad cargada → branchLocality null (la app no pide la dirección)", async () => {
    const socio = await createTestMember(app, { branchId: sinCiudadBranchId });
    const res = await getMe(socio.token);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as MeBody;
    expect(body).toHaveProperty("branchLocality", null);
  });

  it("PUT: guarda la dirección normalizada (trim + espacios colapsados) y GET /me la devuelve", async () => {
    const socio = await createTestMember(app, { branchId: mdpBranchId });

    const res = await putAddress(socio.token, {
      address: "  Av.  Colón   2450 ",
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ address: "Av. Colón 2450" });

    expect(await addressEnDb(socio.id)).toBe("Av. Colón 2450");
    const me = JSON.parse((await getMe(socio.token)).body) as MeBody;
    expect(me.address).toBe("Av. Colón 2450");
  });

  it("PUT: cambiar una dirección existente la reemplaza", async () => {
    const socio = await createTestMember(app, { branchId: mdpBranchId });
    await putAddress(socio.token, { address: "Jujuy 1000" });

    const res = await putAddress(socio.token, { address: "Rawson 2100" });
    expect(res.statusCode, res.body).toBe(200);
    expect(await addressEnDb(socio.id)).toBe("Rawson 2100");
  });

  it("PUT: address null la borra (derecho de supresión)", async () => {
    const socio = await createTestMember(app, { branchId: mdpBranchId });
    await putAddress(socio.token, { address: "Jujuy 1000" });
    expect(await addressEnDb(socio.id)).toBe("Jujuy 1000");

    const res = await putAddress(socio.token, { address: null });
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ address: null });
    expect(await addressEnDb(socio.id)).toBeNull();
  });

  it("PUT: solo toca la fila del socio autenticado, no la de otro socio", async () => {
    const yo = await createTestMember(app, { branchId: mdpBranchId });
    const otro = await createTestMember(app, { branchId: mdpBranchId });
    await putAddress(otro.token, { address: "Gascón 3000" });

    const res = await putAddress(yo.token, { address: "Alem 3958" });
    expect(res.statusCode, res.body).toBe(200);

    expect(await addressEnDb(yo.id)).toBe("Alem 3958");
    expect(await addressEnDb(otro.id)).toBe("Gascón 3000");
  });

  it("PUT: un userId en el body se descarta (removeAdditional de Fastify) y solo toca al dueño del token", async () => {
    // Fastify usa Ajv con `removeAdditional: true`: la clave extra se borra antes del handler en vez
    // de dar 400. Lo que importa es que nunca se pueda escribir la dirección de otro socio.
    const yo = await createTestMember(app, { branchId: mdpBranchId });
    const otro = await createTestMember(app, { branchId: mdpBranchId });

    const res = await putAddress(yo.token, {
      address: "Alem 3958",
      userId: otro.id,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await addressEnDb(yo.id)).toBe("Alem 3958");
    expect(await addressEnDb(otro.id)).toBeNull();
  });

  it("PUT: un número se convierte a texto (coerceTypes de Fastify)", async () => {
    const socio = await createTestMember(app, { branchId: mdpBranchId });
    const res = await putAddress(socio.token, { address: 2450 });
    expect(res.statusCode, res.body).toBe(200);
    expect(await addressEnDb(socio.id)).toBe("2450");
  });

  it.each([
    ["string vacío", { address: "" }],
    ["solo espacios", { address: "    " }],
    ["sin la clave address", {}],
    ["un objeto en vez de string", { address: { calle: "Jujuy" } }],
    ["más de 500 caracteres", { address: "a".repeat(501) }],
  ])("PUT: %s → 400 y la dirección no cambia", async (_caso, payload) => {
    const socio = await createTestMember(app, { branchId: mdpBranchId });
    await putAddress(socio.token, { address: "Jujuy 1000" });

    const res = await putAddress(socio.token, payload);
    expect(res.statusCode, res.body).toBe(400);
    expect(await addressEnDb(socio.id)).toBe("Jujuy 1000");
  });

  it("PUT: exactamente 500 caracteres se acepta (borde del varchar)", async () => {
    const socio = await createTestMember(app, { branchId: mdpBranchId });
    const larga = "a".repeat(500);
    const res = await putAddress(socio.token, { address: larga });
    expect(res.statusCode, res.body).toBe(200);
    expect(await addressEnDb(socio.id)).toBe(larga);
  });

  it("PUT: sin token → 401", async () => {
    const res = await putAddress(null, { address: "Jujuy 1000" });
    expect(res.statusCode).toBe(401);
  });

  it("PUT: cuenta eliminada → 401 (el gate de cuenta corta antes; no se reescribe PII anonimizada)", async () => {
    const socio = await createTestMember(app, { branchId: mdpBranchId });
    await app.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, socio.id)));

    const res = await putAddress(socio.token, { address: "Jujuy 1000" });
    expect(res.statusCode, res.body).toBe(401);
    expect(res.json<{ message: string }>().message).toBe(
      "Esta cuenta fue eliminada",
    );
    expect(await addressEnDb(socio.id)).toBeNull();
  });
});
