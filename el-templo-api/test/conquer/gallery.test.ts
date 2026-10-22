/**
 * Fase 201 Plan 13 (§6, §7.2, A19, T-201-48): galería de antes y después del coach.
 *
 *   - GET /api/admin/conquer/gallery?authorized=true|false
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas. El
 * historial se inserta DIRECTO con `insertBodyCheckRow`; el permiso de
 * publicación lo activa el alumno por la API (`PUT /publish-permission`).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { resolveMemberTimezone } from "../../src/modules/conquer/member-service";
import {
  addDays,
  DEFAULT_TENANT_TIMEZONE,
  todayInTz,
} from "../../src/modules/shared/date-utils";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  createActiveConquerMember,
  createConquerStaff,
  insertBodyCheckRow,
  insertConquerMember,
  TEMPLO_CTX,
} from "./_helpers";

const GALLERY_URL = "/api/admin/conquer/gallery";
const PUBLISH_URL = "/api/members/conquer/publish-permission";

interface GalleryCheck {
  id: number;
  checkDate: string;
  kind: "dia0" | "periodico";
}

interface GalleryItemBody {
  userId: number;
  firstName: string;
  lastName: string;
  level: string | null;
  publishEnabled: boolean;
  publishNoFace: boolean;
  publishChangedAt: string | null;
  day0: GalleryCheck | null;
  last: GalleryCheck | null;
  compare: {
    from: { id: number };
    to: { id: number };
    weeks: number;
  } | null;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function galleryRaw(token: string | undefined, query = "") {
  return app.inject({
    method: "GET",
    url: `${GALLERY_URL}${query}`,
    headers: token ? auth(token) : {},
  });
}

async function fetchGallery(
  token: string,
  query = "",
): Promise<GalleryItemBody[]> {
  const res = await galleryRaw(token, query);
  expect(res.statusCode).toBe(200);
  return res.json<{ items: GalleryItemBody[] }>().items;
}

/** Alumno activo (Toro, 4 días) con su "hoy" de sede. */
async function activeMember() {
  const m = await createActiveConquerMember(app, {
    level: "toro",
    daysCount: 4,
  });
  const hoy = todayInTz(
    await resolveMemberTimezone(app.db, TEMPLO_CTX, m.userId),
  );
  return { ...m, hoy };
}

async function authorize(token: string, noFace: boolean) {
  const res = await app.inject({
    method: "PUT",
    url: PUBLISH_URL,
    headers: auth(token),
    payload: { enabled: true, noFace },
  });
  expect(res.statusCode).toBe(200);
}

async function setLastName(userId: number, lastName: string) {
  await app.db
    .update(schema.users)
    .set({ lastName })
    .where(
      and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, userId)),
    );
}

/** A: autorizado "sin cara" con día 0 + periódico. B: sin autorizar, solo día 0. C: sin controles. */
async function escenarioABC() {
  const a = await activeMember();
  const b = await activeMember();
  const c = await activeMember();
  const a0 = await insertBodyCheckRow(app, {
    userId: a.userId,
    checkDate: addDays(a.hoy, -28),
    kind: "dia0",
  });
  const a1 = await insertBodyCheckRow(app, {
    userId: a.userId,
    checkDate: addDays(a.hoy, -1),
    kind: "periodico",
  });
  const b0 = await insertBodyCheckRow(app, {
    userId: b.userId,
    checkDate: addDays(b.hoy, -5),
    kind: "dia0",
  });
  await authorize(a.token, true);
  await setLastName(a.userId, "Zeta");
  await setLastName(b.userId, "Alfa");
  return { a, b, c, a0, a1, b0 };
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

describe("GET /gallery (§6, §7.2)", () => {
  it("sin filtro lista a los alumnos con controles, por apellido, con el comparador solo si hay 2", async () => {
    const { a, b, c, a0, a1, b0 } = await escenarioABC();

    const items = await fetchGallery(a.adminToken);

    expect(items.map((i) => i.userId)).toEqual([b.userId, a.userId]);
    expect(items.map((i) => i.userId)).not.toContain(c.userId);
    const itemA = items[1];
    expect(itemA).toMatchObject({
      level: "toro",
      publishEnabled: true,
      publishNoFace: true,
    });
    expect(typeof itemA.publishChangedAt).toBe("string");
    expect(itemA.day0?.id).toBe(a0);
    expect(itemA.last?.id).toBe(a1);
    expect(itemA.compare).toMatchObject({
      from: { id: a0 },
      to: { id: a1 },
      weeks: 3,
    });
    const itemB = items[0];
    expect(itemB).toMatchObject({
      publishEnabled: false,
      publishNoFace: false,
      publishChangedAt: null,
    });
    expect(itemB.day0?.id).toBe(b0);
    expect(itemB.last).toBeNull();
    expect(itemB.compare).toBeNull();
  });

  it("authorized=true trae solo a los autorizados y conserva 'sin cara'", async () => {
    const { a } = await escenarioABC();

    const items = await fetchGallery(a.adminToken, "?authorized=true");

    expect(items.map((i) => i.userId)).toEqual([a.userId]);
    expect(items[0].publishNoFace).toBe(true);
    expect(items[0].compare).not.toBeNull();
  });

  it("authorized=false trae solo a los que no autorizaron", async () => {
    const { a, b } = await escenarioABC();

    const items = await fetchGallery(a.adminToken, "?authorized=false");

    expect(items.map((i) => i.userId)).toEqual([b.userId]);
  });

  it("si el alumno retira el permiso deja de estar en authorized=true", async () => {
    const { a } = await escenarioABC();
    const retiro = await app.inject({
      method: "PUT",
      url: PUBLISH_URL,
      headers: auth(a.token),
      payload: { enabled: false, noFace: true },
    });
    expect(retiro.statusCode).toBe(200);

    const autorizados = await fetchGallery(a.adminToken, "?authorized=true");
    const todos = await fetchGallery(a.adminToken);

    expect(autorizados).toEqual([]);
    expect(todos.map((i) => i.userId)).toContain(a.userId);
  });

  it("un alumno que solo tiene un día 0 VACÍO no aparece", async () => {
    const m = await activeMember();
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -10),
      kind: "dia0",
      empty: true,
    });

    expect(await fetchGallery(m.adminToken)).toEqual([]);
  });

  it("el día 0 vacío no cuenta: el alumno aparece con su primer control con contenido y sin comparador", async () => {
    const m = await activeMember();
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -20),
      kind: "dia0",
      empty: true,
    });
    const periodico = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "periodico",
    });

    const items = await fetchGallery(m.adminToken);

    expect(items).toHaveLength(1);
    expect(items[0].day0?.id).toBe(periodico);
    expect(items[0].last).toBeNull();
    expect(items[0].compare).toBeNull();
  });

  it("un pedido pendiente con controles cargados no aparece (solo alumnos activos)", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id);
    const admin = await createConquerStaff(app, "admin");
    await insertBodyCheckRow(app, {
      userId: socio.id,
      checkDate: addDays(todayInTz(DEFAULT_TENANT_TIMEZONE), -3),
      kind: "dia0",
    });

    expect(await fetchGallery(admin.token)).toEqual([]);
  });

  it("owner y admin ven la galería; la respuesta no lleva claves de storage", async () => {
    const { a } = await escenarioABC();
    const owner = await createConquerStaff(app, "owner");

    const res = await galleryRaw(owner.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<{ items: unknown[] }>().items).toHaveLength(2);
    expect(res.body).not.toContain("private/conquer");
    expect((await galleryRaw(a.adminToken)).statusCode).toBe(200);
  });

  it("aislamiento: el admin del gimnasio 2 (con el módulo) no ve a los alumnos del gimnasio 1", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    await escenarioABC();

    const items = await fetchGallery(gym2.adminToken);

    expect(items).toEqual([]);
  });

  it.each(["coach", "gestion", "recepcion", "admin_sede"])(
    "el rol %s no ve la galería: 403 (T-201-48)",
    async (rol) => {
      await escenarioABC();
      const staff = await createConquerStaff(app, rol);

      const res = await galleryRaw(staff.token);

      expect(res.statusCode).toBe(403);
    },
  );

  it("un socio: 403; sin token: 401", async () => {
    const { a } = await escenarioABC();

    expect((await galleryRaw(a.token)).statusCode).toBe(403);
    expect((await galleryRaw(undefined)).statusCode).toBe(401);
  });

  it("authorized con un valor que no es booleano: 400", async () => {
    const { a } = await escenarioABC();

    const res = await galleryRaw(a.adminToken, "?authorized=quizas");

    expect(res.statusCode).toBe(400);
  });
});
