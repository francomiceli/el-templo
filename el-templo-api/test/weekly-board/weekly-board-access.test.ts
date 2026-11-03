/**
 * Tablero semanal (fase 206, plan 06) — roles, alcance por sede y por país, y
 * aislamiento por gimnasio de `GET /api/admin/weekly-board` y
 * `PUT /api/admin/weekly-board/leads` (D-02, D-04, D-24, D-27, SC-8).
 *
 * Los actores se crean acá con `createStaffUser` (nada de ids de `users`
 * hardcodeados) y se loguean por email. Los usuarios se arman UNA vez en el
 * `beforeAll`: ningún test limpia la tabla de usuarios. Los tests que escriben
 * leads borran sus filas al terminar con `clearLeads`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, inArray, sql } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import type {
  BoardMetric,
  WeeklyBoardResponse,
} from "../../src/modules/weekly-board/types";
import {
  TENANT_TEMPLO,
  TENANT_DOS,
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  boardWeeks,
  seedBoardBranches,
  cleanupBoardBranches,
  type BoardBranches,
  type BoardWeeks,
} from "../fixtures/weekly-board";

const BASE = "/api/admin/weekly-board";
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const DOS_CTX = { tenantId: TENANT_DOS };
const PASSWORD = "test1234";

type Role =
  | "owner"
  | "admin"
  | "gestion"
  | "admin_sede"
  | "coach"
  | "recepcion";

describe("Tablero semanal — roles, alcance y aislamiento", () => {
  let app: FastifyInstance;
  let branches: BoardBranches;
  let weeks: BoardWeeks;
  let gym2: SegundoGimnasio;

  const tokens: Record<string, string> = {};
  const uniq = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  async function makeUser(
    key: string,
    role: Role,
    branchId: number,
    country?: "AR" | "ES",
  ): Promise<void> {
    const email = `tablero-${key}-${uniq}@test.local`;
    await createStaffUser(app, {
      email,
      password: PASSWORD,
      firstName: "Tablero",
      lastName: key,
      role,
      branchId,
      country,
    });
    tokens[key] = await getAuthToken(app, email, PASSWORD);
  }

  async function getAs(
    token: string,
    weekStart?: string,
  ): Promise<{ status: number; body: WeeklyBoardResponse }> {
    const res = await app.inject({
      method: "GET",
      url: weekStart ? `${BASE}?weekStart=${weekStart}` : BASE,
      headers: { authorization: `Bearer ${token}` },
    });
    return { status: res.statusCode, body: res.json<WeeklyBoardResponse>() };
  }

  async function putAs(
    token: string,
    branchId: number,
    leads: number | null = 5,
  ): Promise<number> {
    const res = await app.inject({
      method: "PUT",
      url: `${BASE}/leads`,
      headers: { authorization: `Bearer ${token}` },
      payload: { branchId, weekStart: weeks.current, leads },
    });
    return res.statusCode;
  }

  async function countLeads(
    ctx: { tenantId: number },
    branchIds: number[],
  ): Promise<number> {
    const [row] = await app.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.weeklyBoardLeads)
      .where(
        and(
          tenantWhere(schema.weeklyBoardLeads, ctx),
          inArray(schema.weeklyBoardLeads.branchId, branchIds),
        ),
      );
    return Number(row.n);
  }

  async function clearLeads(): Promise<void> {
    await app.db
      .delete(schema.weeklyBoardLeads)
      .where(tenantWhere(schema.weeklyBoardLeads, TEMPLO_CTX));
  }

  /** Todas las claves de sede de todas las filas de la planilla. */
  function branchKeys(metrics: BoardMetric[]): Set<string> {
    return new Set(metrics.flatMap((m) => Object.keys(m.byBranch)));
  }

  beforeAll(async () => {
    app = await createTestApp();
    weeks = boardWeeks();
    await cleanAllTestData(app);
    branches = await seedBoardBranches(app);

    await makeUser("owner", "owner", branches.arA.id);
    await makeUser("adminAr", "admin", branches.arA.id, "AR");
    await makeUser("gestionAr", "gestion", branches.arA.id, "AR");
    await makeUser("adminEs", "admin", branches.es.id, "ES");
    // `createStaffUser` le siembra su `user_branches` (una sola sede: arA).
    await makeUser("adminSede", "admin_sede", branches.arA.id);
    await makeUser("coach", "coach", branches.arA.id);
    await makeUser("recepcion", "recepcion", branches.arA.id);

    gym2 = await seedSecondTenant(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await cleanupBoardBranches(
      app,
      Object.values(branches).map((b) => b.id),
    );
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  // ─── Roles ──────────────────────────────────────────────────────────────

  it("sin token es 401 y coach y recepcion reciben 403 en GET y en PUT /leads", async () => {
    const anon = await app.inject({ method: "GET", url: BASE });
    expect(anon.statusCode).toBe(401);

    for (const key of ["coach", "recepcion"]) {
      const get = await getAs(tokens[key]);
      expect(get.status, `GET como ${key}`).toBe(403);
      expect(await putAs(tokens[key], branches.arA.id), `PUT como ${key}`).toBe(
        403,
      );
    }
    expect(await countLeads(TEMPLO_CTX, [branches.arA.id])).toBe(0);
  });

  // ─── admin_sede ─────────────────────────────────────────────────────────

  it("admin_sede ve una sola columna, sin Total ni Online", async () => {
    const { status, body } = await getAs(tokens.adminSede);
    expect(status).toBe(200);

    expect(body.groups).toHaveLength(1);
    const [group] = body.groups;
    expect(group.country).toBe("AR");
    expect(group.branches.map((b) => b.id)).toEqual([branches.arA.id]);
    expect(group.hasTotal).toBe(false);
    expect(group.online).toBeNull();

    expect(body.metrics.length).toBeGreaterThan(0);
    for (const m of body.metrics) {
      expect(Object.keys(m.totalByCountry), `Total de ${m.key}`).toEqual([]);
      expect(Object.keys(m.onlineByCountry), `Online de ${m.key}`).toEqual([]);
    }
    expect([...branchKeys(body.metrics)]).toEqual([String(branches.arA.id)]);
  });

  it("admin_sede carga leads en su sede (200) pero no en otra (403)", async () => {
    try {
      expect(await putAs(tokens.adminSede, branches.arA.id, 9)).toBe(200);
      expect(await countLeads(TEMPLO_CTX, [branches.arA.id])).toBe(1);

      expect(await putAs(tokens.adminSede, branches.arB.id, 9)).toBe(403);
      expect(await countLeads(TEMPLO_CTX, [branches.arB.id])).toBe(0);
      // Tampoco la sede virtual del país (el atajo "virtual = global" no le aplica).
      expect(await putAs(tokens.adminSede, branches.virtualAr.id, 9)).toBe(403);
      expect(await countLeads(TEMPLO_CTX, [branches.virtualAr.id])).toBe(0);
    } finally {
      await clearLeads();
    }
  });

  // ─── admin / gestion por país ───────────────────────────────────────────

  it("admin y gestion de Argentina ven AR (con Online) y no ven España ni pueden cargar sus leads", async () => {
    for (const key of ["adminAr", "gestionAr"]) {
      const { status, body } = await getAs(tokens[key]);
      expect(status, `GET como ${key}`).toBe(200);

      expect(body.groups.map((g) => g.country)).toEqual(["AR"]);
      const ar = body.groups[0];
      const ids = ar.branches.map((b) => b.id);
      expect(ids).toContain(branches.arA.id);
      expect(ids).toContain(branches.arB.id);
      expect(ids).not.toContain(branches.es.id);
      expect(ar.hasTotal).toBe(true);
      expect(ar.online?.branchIds).toContain(branches.virtualAr.id);

      const keys = branchKeys(body.metrics);
      expect(keys.has(String(branches.es.id)), `${key} ve la sede ES`).toBe(
        false,
      );
      for (const m of body.metrics) {
        expect(
          Object.keys(m.totalByCountry),
          `Total de ${m.key}`,
        ).not.toContain("ES");
      }
      const cobrado = body.metrics.find((m) => m.key === "cobrado");
      expect(Object.keys(cobrado?.totalByCountry ?? {})).toEqual(["AR"]);

      expect(
        await putAs(tokens[key], branches.es.id, 4),
        `PUT ES como ${key}`,
      ).toBe(403);
    }
    expect(await countLeads(TEMPLO_CTX, [branches.es.id])).toBe(0);
  });

  it("un admin de España ve el grupo ES y no ve AR ni su Online", async () => {
    const { status, body } = await getAs(tokens.adminEs);
    expect(status).toBe(200);

    expect(body.groups.map((g) => g.country)).toEqual(["ES"]);
    expect(body.groups[0].currency).toBe("EUR");
    expect(body.groups[0].branches.map((b) => b.id)).toContain(branches.es.id);
    const keys = branchKeys(body.metrics);
    expect(keys.has(String(branches.arA.id))).toBe(false);
    expect(keys.has(String(branches.arB.id))).toBe(false);
    for (const m of body.metrics) {
      expect(m.totalByCountry["AR"], `Total AR de ${m.key}`).toBeUndefined();
      expect(m.onlineByCountry["AR"], `Online AR de ${m.key}`).toBeUndefined();
    }

    expect(await putAs(tokens.adminEs, branches.arA.id, 4)).toBe(403);
    expect(await countLeads(TEMPLO_CTX, [branches.arA.id])).toBe(0);
  });

  // ─── owner ──────────────────────────────────────────────────────────────

  it("el owner ve todos los países sin pasar ?country y puede cargar leads de cualquiera", async () => {
    const { status, body } = await getAs(tokens.owner);
    expect(status).toBe(200);

    const countries = body.groups.map((g) => g.country);
    expect(countries).toContain("AR");
    expect(countries).toContain("ES");
    expect(countries[0]).toBe("AR");
    const keys = branchKeys(body.metrics);
    expect(keys.has(String(branches.arA.id))).toBe(true);
    expect(keys.has(String(branches.es.id))).toBe(true);

    try {
      expect(await putAs(tokens.owner, branches.es.id, 3)).toBe(200);
      expect(await putAs(tokens.owner, branches.arB.id, 3)).toBe(200);
      expect(
        await countLeads(TEMPLO_CTX, [branches.es.id, branches.arB.id]),
      ).toBe(2);
    } finally {
      await clearLeads();
    }
  });

  // ─── Aislamiento por gimnasio ───────────────────────────────────────────

  it("el GET de cada gimnasio solo trae sus propias sedes", async () => {
    const own = await getAs(tokens.owner);
    expect(own.status).toBe(200);
    const ownIds = new Set(
      own.body.groups.flatMap((g) => [
        ...g.branches.map((b) => b.id),
        ...(g.online?.branchIds ?? []),
      ]),
    );
    expect(ownIds.has(gym2.branchId)).toBe(false);
    expect(branchKeys(own.body.metrics).has(String(gym2.branchId))).toBe(false);

    const other = await getAs(gym2.adminToken);
    expect(other.status).toBe(200);
    const otherIds = other.body.groups.flatMap((g) =>
      g.branches.map((b) => b.id),
    );
    // El gimnasio 2 tiene una sola sede: la suya.
    expect(otherIds).toEqual([gym2.branchId]);
    const temploIds = Object.values(branches).map((b) => String(b.id));
    const otherKeys = branchKeys(other.body.metrics);
    for (const id of temploIds) {
      expect(otherKeys.has(id), `el gimnasio 2 ve la sede ${id}`).toBe(false);
    }
  });

  it("el PUT no cruza gimnasios: una sede ajena es 403 y no deja filas en ninguno", async () => {
    // Owner de El Templo sobre la sede del gimnasio 2.
    expect(await putAs(tokens.owner, gym2.branchId)).toBe(403);
    // Admin del gimnasio 2 sobre una sede de El Templo.
    expect(await putAs(gym2.adminToken, branches.arA.id)).toBe(403);

    expect(await countLeads(TEMPLO_CTX, [gym2.branchId])).toBe(0);
    expect(await countLeads(DOS_CTX, [gym2.branchId])).toBe(0);
    expect(await countLeads(TEMPLO_CTX, [branches.arA.id])).toBe(0);
    expect(await countLeads(DOS_CTX, [branches.arA.id])).toBe(0);

    // Control positivo: el admin del gimnasio 2 sí carga en su propia sede, y la
    // fila queda en SU gimnasio, no en El Templo.
    expect(await putAs(gym2.adminToken, gym2.branchId, 6)).toBe(200);
    expect(await countLeads(DOS_CTX, [gym2.branchId])).toBe(1);
    expect(await countLeads(TEMPLO_CTX, [gym2.branchId])).toBe(0);

    const board = await getAs(gym2.adminToken);
    const leads = board.body.metrics.find((m) => m.key === "leads");
    expect(leads?.byBranch[String(gym2.branchId)]?.value).toBe(6);
  });
});
