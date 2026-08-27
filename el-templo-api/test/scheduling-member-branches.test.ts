/**
 * Fase 180 Plan 02 (D-17) — GET /api/members/scheduling/branches expone
 * `address` + `mapsUrl` (helper único `shared/maps.ts`) sin romper el
 * scoping existente (tenant + país del socio + isActive/isVirtual).
 *
 * El aislamiento cross-tenant/cross-país de este mismo endpoint ya está
 * cubierto en profundidad por `test/tenancy/iso-03-sched-lecturas.test.ts`
 * ("sedes disponibles — GET /api/members/scheduling/branches"); este archivo
 * NO repite esos casos, se enfoca en el contrato nuevo (address/mapsUrl).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, createTestMember, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";

const BRANCHES_URL = "/api/members/scheduling/branches";
const MAPS_PREFIX = "https://www.google.com/maps/search/?api=1&query=";

type BranchRow = {
  id: number;
  name: string;
  address: string | null;
  mapsUrl: string | null;
};

async function getBranches(app: FastifyInstance, token: string) {
  const res = await app.inject({
    method: "GET",
    url: BRANCHES_URL,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode, `${BRANCHES_URL} falló: ${res.body}`).toBe(200);
  return JSON.parse(res.body) as { branches: BranchRow[] };
}

describe("GET /api/members/scheduling/branches — address + mapsUrl (D-17)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("sede con dirección cargada devuelve address exacta y mapsUrl con el prefijo de Google Maps", async () => {
    const direccion = "Av. Colón 1234, Mar del Plata";
    const [{ id: sedeConDireccionId }] = await app.db
      .insert(schema.branches)
      .values({
        name: "Sede Con Dirección 180-02",
        code: "T18002-CD",
        country: "AR",
        address: direccion,
      })
      .$returningId();

    const member = await createTestMember(app);
    const { branches } = await getBranches(app, member.token);

    const sede = branches.find((b) => b.id === sedeConDireccionId);
    expect(
      sede,
      "la sede recién creada debe aparecer en el listado",
    ).toBeDefined();
    expect(sede?.address).toBe(direccion);
    expect(sede?.mapsUrl?.startsWith(MAPS_PREFIX)).toBe(true);
    expect(sede?.mapsUrl).toBe(
      `${MAPS_PREFIX}${encodeURIComponent(direccion)}`,
    );
  });

  it("sede con address NULL devuelve address null y mapsUrl null (nunca un link roto)", async () => {
    const [{ id: sedeSinDireccionId }] = await app.db
      .insert(schema.branches)
      .values({
        name: "Sede Sin Dirección 180-02",
        code: "T18002-SD",
        country: "AR",
      })
      .$returningId();

    const member = await createTestMember(app);
    const { branches } = await getBranches(app, member.token);

    const sede = branches.find((b) => b.id === sedeSinDireccionId);
    expect(
      sede,
      "la sede sin dirección también debe aparecer en el listado",
    ).toBeDefined();
    expect(sede?.address).toBeNull();
    expect(sede?.mapsUrl).toBeNull();
  });

  it("sede con address de solo espacios se trata como sin dirección: mapsUrl null", async () => {
    const [{ id: sedeEspaciosId }] = await app.db
      .insert(schema.branches)
      .values({
        name: "Sede Espacios 180-02",
        code: "T18002-ES",
        country: "AR",
        address: "   ",
      })
      .$returningId();

    const member = await createTestMember(app);
    const { branches } = await getBranches(app, member.token);

    const sede = branches.find((b) => b.id === sedeEspaciosId);
    expect(sede).toBeDefined();
    expect(sede?.mapsUrl).toBeNull();
  });

  it("el listado sigue excluyendo sedes inactivas y virtuales", async () => {
    const [{ id: inactivaId }] = await app.db
      .insert(schema.branches)
      .values({
        name: "Sede Inactiva 180-02",
        code: "T18002-INA",
        country: "AR",
        address: "Calle Falsa 123",
        isActive: false,
      })
      .$returningId();
    const [{ id: virtualId }] = await app.db
      .insert(schema.branches)
      .values({
        name: "Sede Virtual 180-02",
        code: "T18002-VIR",
        country: "AR",
        address: "Calle Falsa 456",
        isVirtual: true,
      })
      .$returningId();

    const member = await createTestMember(app);
    const { branches } = await getBranches(app, member.token);

    const ids = branches.map((b) => b.id);
    expect(ids).not.toContain(inactivaId);
    expect(ids).not.toContain(virtualId);
  });
});
