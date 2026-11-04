/**
 * Integration tests — Avisos automáticos de Oficina (Fase 205, migración 0321).
 *
 * Endpoints (prefijo /api/admin/office):
 *   GET  /auto-topics/settings
 *   PUT  /auto-topics/settings/:detector
 *
 * Que el PUT cierre ya los temas abiertos del aviso apagado se prueba en
 * `test/jobs/office-auto-topics.test.ts` (ahí vive el resto de los detectores).
 *
 * Convenciones: sin ids de `users` hardcodeados (el staff sale de
 * `createStaffUser`), y las queries directas del test llevan `tenantWhere`.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  OFFICE_AUTO_DETECTOR_KEYS,
  OFFICE_AUTO_DETECTORS,
} from "../../src/modules/office/auto-topics-catalog";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const BASE = "/api/admin/office/auto-topics/settings";
const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const DOS_CTX: TenantContext = { tenantId: TENANT_DOS };

interface DetectorSettings {
  key: string;
  label: string;
  description: string;
  perBranch: boolean;
  disabledAll: boolean;
  disabledBranchIds: number[];
  branches: Array<{ id: number; name: string }>;
}

describe("Oficina — avisos automáticos activables por sede", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let ownerId: number;
  let branchId: number;
  let branchName: string;
  let virtualBranchId: number;
  let wellhubBranchId: number;
  let seq = 0;

  async function get(token: string) {
    return app.inject({
      method: "GET",
      url: BASE,
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function put(
    token: string,
    detector: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: "PUT",
      url: `${BASE}/${detector}`,
      headers: { Authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function settings(
    token: string = ownerToken,
  ): Promise<Map<string, DetectorSettings>> {
    const res = await get(token);
    expect(res.statusCode).toBe(200);
    const { detectors } = res.json<{ detectors: DetectorSettings[] }>();
    return new Map(detectors.map((d) => [d.key, d]));
  }

  async function staffToken(role: string): Promise<string> {
    seq += 1;
    const email = `oas-${role}-${seq}-${Date.now()}@test.local`;
    await createStaffUser(app, {
      email,
      password: "test1234",
      firstName: `Nombre${role}`,
      lastName: "Avisos",
      role,
      branchId,
      country: "AR",
    });
    return getAuthToken(app, email, "test1234");
  }

  async function dbRows(ctx: TenantContext = TEMPLO_CTX) {
    return app.db
      .select({
        detector: schema.officeAutoTopicMutes.detector,
        branchId: schema.officeAutoTopicMutes.branchId,
        createdBy: schema.officeAutoTopicMutes.createdBy,
      })
      .from(schema.officeAutoTopicMutes)
      .where(tenantWhere(schema.officeAutoTopicMutes, ctx))
      .orderBy(
        asc(schema.officeAutoTopicMutes.detector),
        asc(schema.officeAutoTopicMutes.branchId),
      );
  }

  async function dropExtraBranches(): Promise<void> {
    for (const code of ["OASV", "OASW"]) {
      await app.db
        .delete(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, TEMPLO_CTX),
            eq(schema.branches.code, code),
          ),
        );
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.code, "TEST"),
        ),
      );
    branchId = branch.id;
    branchName = branch.name;
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await dropExtraBranches();
    const [owner] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    ownerId = owner.id;

    // La sede TEST arranca sin gimnasio Wellhub (otros archivos del worker
    // pudieron dejárselo puesto).
    await app.db
      .update(schema.branches)
      .set({ wellhubGymId: null })
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, branchId),
        ),
      );

    // Una sede virtual (no cuenta para ningún aviso) y una con Wellhub.
    const [virtual] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: "OAS Online",
          code: "OASV",
          country: "AR",
          isVirtual: true,
          isActive: true,
        }),
      )
      .$returningId();
    virtualBranchId = virtual.id;
    const [wellhub] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: "OAS Wellhub",
          code: "OASW",
          country: "AR",
          isVirtual: false,
          isActive: true,
          wellhubGymId: 910_000_000 + Math.floor(Math.random() * 1_000_000),
        }),
      )
      .$returningId();
    wellhubBranchId = wellhub.id;
  });

  afterEach(async () => {
    await cleanAllTestData(app);
    await dropExtraBranches();
  });

  // ─────────────────────────────── GET ───────────────────────────────

  it("por defecto todos los avisos están activos y vienen los seis del catálogo, en orden", async () => {
    const res = await get(ownerToken);
    expect(res.statusCode).toBe(200);
    const { detectors } = res.json<{ detectors: DetectorSettings[] }>();

    expect(detectors.map((d) => d.key)).toEqual([...OFFICE_AUTO_DETECTOR_KEYS]);
    for (const d of detectors) {
      const info = OFFICE_AUTO_DETECTORS.find((i) => i.key === d.key);
      expect(d.label).toBe(info?.label);
      expect(d.description).toBe(info?.description);
      expect(d.perBranch).toBe(info?.perBranch);
      expect(d.disabledAll).toBe(false);
      expect(d.disabledBranchIds).toEqual([]);
    }
  });

  it("lista las sedes a las que aplica cada aviso: wellhub_error ninguna, las demás activas y físicas, Wellhub solo las que tienen gimnasio Wellhub", async () => {
    const byKey = await settings();

    expect(byKey.get("wellhub_error")?.perBranch).toBe(false);
    expect(byKey.get("wellhub_error")?.branches).toEqual([]);

    for (const key of [
      "jornada_abierta",
      "clase_sin_profe",
      "arqueo_diferencia",
      "tablero_leads",
    ]) {
      const ids = byKey.get(key)?.branches.map((b) => b.id) ?? [];
      expect(ids, key).toContain(branchId);
      expect(ids, key).toContain(wellhubBranchId);
      expect(ids, key).not.toContain(virtualBranchId);
    }
    const tablero = byKey.get("tablero_leads")?.branches ?? [];
    expect(tablero.find((b) => b.id === branchId)?.name).toBe(branchName);

    const wellhub = byKey.get("wellhub_sin_publicar")?.branches ?? [];
    expect(wellhub.map((b) => b.id)).toEqual([wellhubBranchId]);
  });

  it("una sede inactiva no se ofrece", async () => {
    await app.db
      .update(schema.branches)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, wellhubBranchId),
        ),
      );

    const byKey = await settings();
    for (const d of byKey.values()) {
      expect(
        d.branches.map((b) => b.id),
        d.key,
      ).not.toContain(wellhubBranchId);
    }
  });

  // ─────────────────────────────── PUT ───────────────────────────────

  it("apagar un aviso en una sede lo guarda, lo devuelve y el GET lo refleja", async () => {
    const res = await put(ownerToken, "clase_sin_profe", {
      disabledAll: false,
      disabledBranchIds: [branchId],
    });
    expect(res.statusCode).toBe(200);
    const { detector } = res.json<{ detector: DetectorSettings }>();
    expect(detector.key).toBe("clase_sin_profe");
    expect(detector.disabledAll).toBe(false);
    expect(detector.disabledBranchIds).toEqual([branchId]);
    expect(detector.branches.map((b) => b.id)).toContain(branchId);

    const byKey = await settings();
    expect(byKey.get("clase_sin_profe")?.disabledBranchIds).toEqual([branchId]);
    // Los demás avisos no se tocan.
    expect(byKey.get("jornada_abierta")?.disabledBranchIds).toEqual([]);
    expect(await dbRows()).toEqual([
      { detector: "clase_sin_profe", branchId, createdBy: ownerId },
    ]);
  });

  it("apagar un aviso para todo el gimnasio lo guarda y volver a activarlo borra las filas", async () => {
    const off = await put(ownerToken, "wellhub_error", {
      disabledAll: true,
      disabledBranchIds: [],
    });
    expect(off.statusCode).toBe(200);
    expect(
      off.json<{ detector: DetectorSettings }>().detector.disabledAll,
    ).toBe(true);
    expect((await settings()).get("wellhub_error")?.disabledAll).toBe(true);
    expect(await dbRows()).toEqual([
      { detector: "wellhub_error", branchId: 0, createdBy: ownerId },
    ]);

    const on = await put(ownerToken, "wellhub_error", {
      disabledAll: false,
      disabledBranchIds: [],
    });
    expect(on.statusCode).toBe(200);
    expect((await settings()).get("wellhub_error")?.disabledAll).toBe(false);
    expect(await dbRows()).toEqual([]);
  });

  it("el PUT reemplaza lo anterior del aviso (no acumula) y no toca a los otros avisos", async () => {
    await put(ownerToken, "jornada_abierta", {
      disabledAll: false,
      disabledBranchIds: [branchId, wellhubBranchId],
    });
    await put(ownerToken, "clase_sin_profe", {
      disabledAll: true,
      disabledBranchIds: [],
    });

    const res = await put(ownerToken, "jornada_abierta", {
      disabledAll: false,
      disabledBranchIds: [wellhubBranchId],
    });
    expect(res.statusCode).toBe(200);

    const byKey = await settings();
    expect(byKey.get("jornada_abierta")?.disabledBranchIds).toEqual([
      wellhubBranchId,
    ]);
    expect(byKey.get("clase_sin_profe")?.disabledAll).toBe(true);
  });

  it("guarda el apagado general y por sede a la vez, y las sedes repetidas se cuentan una vez", async () => {
    const res = await put(ownerToken, "arqueo_diferencia", {
      disabledAll: true,
      disabledBranchIds: [branchId, branchId],
    });
    expect(res.statusCode).toBe(200);

    const detector = res.json<{ detector: DetectorSettings }>().detector;
    expect(detector.disabledAll).toBe(true);
    expect(detector.disabledBranchIds).toEqual([branchId]);
    expect(await dbRows()).toHaveLength(2);
  });

  it("apagar Wellhub sin publicar en una sede con Wellhub funciona", async () => {
    const res = await put(ownerToken, "wellhub_sin_publicar", {
      disabledAll: false,
      disabledBranchIds: [wellhubBranchId],
    });
    expect(res.statusCode).toBe(200);
    expect(
      res.json<{ detector: DetectorSettings }>().detector.disabledBranchIds,
    ).toEqual([wellhubBranchId]);
  });

  // ─────────────────────────── Validaciones ───────────────────────────

  it("un aviso que no existe da 404 y no guarda nada", async () => {
    const res = await put(ownerToken, "aviso_inventado", {
      disabledAll: true,
      disabledBranchIds: [],
    });
    expect(res.statusCode).toBe(404);
    expect(await dbRows()).toEqual([]);
  });

  it("una sede que no existe, una virtual o una que no tiene Wellhub da 400 y no guarda nada", async () => {
    const inexistente = await put(ownerToken, "clase_sin_profe", {
      disabledAll: false,
      disabledBranchIds: [branchId + 987654],
    });
    expect(inexistente.statusCode).toBe(400);

    const virtual = await put(ownerToken, "clase_sin_profe", {
      disabledAll: false,
      disabledBranchIds: [virtualBranchId],
    });
    expect(virtual.statusCode).toBe(400);

    // La sede TEST no tiene gimnasio Wellhub: no aplica a ese aviso.
    const sinWellhub = await put(ownerToken, "wellhub_sin_publicar", {
      disabledAll: false,
      disabledBranchIds: [branchId],
    });
    expect(sinWellhub.statusCode).toBe(400);

    // Una buena junto con una mala tampoco guarda la buena.
    const mezcla = await put(ownerToken, "jornada_abierta", {
      disabledAll: false,
      disabledBranchIds: [branchId, branchId + 987654],
    });
    expect(mezcla.statusCode).toBe(400);
    expect(await dbRows()).toEqual([]);
  });

  it("una sede de otro gimnasio da 400", async () => {
    const gym2: SegundoGimnasio = await seedSecondTenant(app);

    const res = await put(ownerToken, "clase_sin_profe", {
      disabledAll: false,
      disabledBranchIds: [gym2.branchId],
    });
    expect(res.statusCode).toBe(400);
    expect(await dbRows()).toEqual([]);
    expect(await dbRows(DOS_CTX)).toEqual([]);
  });

  it("un aviso que no se apaga por sede (wellhub_error) rechaza sedes con 400 pero acepta el apagado general", async () => {
    const conSedes = await put(ownerToken, "wellhub_error", {
      disabledAll: false,
      disabledBranchIds: [branchId],
    });
    expect(conSedes.statusCode).toBe(400);
    expect(await dbRows()).toEqual([]);

    const general = await put(ownerToken, "wellhub_error", {
      disabledAll: true,
      disabledBranchIds: [],
    });
    expect(general.statusCode).toBe(200);
  });

  it("rechaza con 400 un body incompleto o con ids inválidos", async () => {
    for (const payload of [
      {},
      { disabledAll: true },
      { disabledBranchIds: [] },
      { disabledAll: "si", disabledBranchIds: [] },
      { disabledAll: false, disabledBranchIds: [0] },
      { disabledAll: false, disabledBranchIds: ["x"] },
    ]) {
      const res = await put(ownerToken, "clase_sin_profe", payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await dbRows()).toEqual([]);
  });

  // ─────────────────────────────── Roles ───────────────────────────────

  it("rechaza con 403 a coach, recepcion, admin_sede y gestion, y deja pasar a owner y admin", async () => {
    for (const role of ["coach", "recepcion", "admin_sede", "gestion"]) {
      const token = await staffToken(role);
      expect((await get(token)).statusCode, `GET ${role}`).toBe(403);
      const res = await put(token, "clase_sin_profe", {
        disabledAll: true,
        disabledBranchIds: [],
      });
      expect(res.statusCode, `PUT ${role}`).toBe(403);
    }
    expect(await dbRows()).toEqual([]);

    const adminToken = await staffToken("admin");
    expect((await get(adminToken)).statusCode).toBe(200);
    const res = await put(adminToken, "clase_sin_profe", {
      disabledAll: true,
      disabledBranchIds: [],
    });
    expect(res.statusCode).toBe(200);
  });

  it("sin token da 401", async () => {
    const res = await app.inject({ method: "GET", url: BASE });
    expect(res.statusCode).toBe(401);
  });

  // ──────────────────────── Aislamiento entre gimnasios ────────────────────────

  it("los avisos apagados de un gimnasio no se ven ni se tocan desde el otro", async () => {
    const gym2 = await seedSecondTenant(app);

    await put(ownerToken, "clase_sin_profe", {
      disabledAll: true,
      disabledBranchIds: [],
    });
    await put(ownerToken, "jornada_abierta", {
      disabledAll: false,
      disabledBranchIds: [branchId],
    });

    // El gimnasio 2 ve todo activo y solo sus propias sedes.
    const delDos = await settings(gym2.adminToken);
    for (const d of delDos.values()) {
      expect(d.disabledAll, d.key).toBe(false);
      expect(d.disabledBranchIds, d.key).toEqual([]);
      expect(
        d.branches.map((b) => b.id),
        d.key,
      ).not.toContain(branchId);
    }
    expect(delDos.get("clase_sin_profe")?.branches.map((b) => b.id)).toEqual([
      gym2.branchId,
    ]);

    // El gimnasio 2 apaga lo suyo: no cambia nada en El Templo.
    const res = await put(gym2.adminToken, "clase_sin_profe", {
      disabledAll: false,
      disabledBranchIds: [gym2.branchId],
    });
    expect(res.statusCode).toBe(200);
    const delTemplo = await settings();
    expect(delTemplo.get("clase_sin_profe")?.disabledAll).toBe(true);
    expect(delTemplo.get("clase_sin_profe")?.disabledBranchIds).toEqual([]);
    expect(await dbRows(DOS_CTX)).toEqual([
      {
        detector: "clase_sin_profe",
        branchId: gym2.branchId,
        createdBy: gym2.adminId,
      },
    ]);

    // Y al revés: apagar para todo el gimnasio 2 deja intacto el apagado de El Templo.
    await put(gym2.adminToken, "clase_sin_profe", {
      disabledAll: false,
      disabledBranchIds: [],
    });
    expect((await settings()).get("clase_sin_profe")?.disabledAll).toBe(true);
    expect(await dbRows(DOS_CTX)).toEqual([]);
  });
});
