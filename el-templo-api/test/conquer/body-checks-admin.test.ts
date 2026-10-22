/**
 * Fase 201 Plan 13 (§6, §7.2 Evolución, D-08, A19, T-201-45, T-201-46): controles
 * físicos de un alumno vistos por owner/admin.
 *
 *   - GET /api/admin/conquer/members/:userId/body-checks
 *   - GET /api/admin/conquer/members/:userId/body-checks/:checkId/photos/:pose/url
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas. El
 * storage se mockea con `mockPrivateMedia`. El historial se inserta DIRECTO con
 * `insertBodyCheckRow` (días pasados relativos a "hoy" de la sede).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  POSE_COLUMN,
  privateCheckPhotoKey,
  type ConquerPose,
} from "../../src/modules/conquer/private-media";
import { resolveMemberTimezone } from "../../src/modules/conquer/member-service";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
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
  mockPrivateMedia,
  TEMPLO_CTX,
} from "./_helpers";

const MEMBERS_URL = "/api/admin/conquer/members";

interface CheckBody {
  id: number;
  checkDate: string;
  kind: "dia0" | "periodico";
  photos: { frente: boolean; perfil: boolean; espalda: boolean };
  armCm: number | null;
}

interface ListBody {
  checks: CheckBody[];
  compare: {
    from: { id: number; checkDate: string };
    to: { id: number; checkDate: string };
    weeks: number;
    measures: { key: string; from: number | null; to: number | null }[];
  } | null;
  due: { nextDueDate: string | null; due: boolean; overdue: boolean };
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function checksUrl(userId: number | string): string {
  return `${MEMBERS_URL}/${userId}/body-checks`;
}

function photoUrl(
  userId: number | string,
  checkId: number | string,
  pose: string,
): string {
  return `${checksUrl(userId)}/${checkId}/photos/${pose}/url`;
}

async function listRaw(token: string | undefined, userId: number | string) {
  return app.inject({
    method: "GET",
    url: checksUrl(userId),
    headers: token ? auth(token) : {},
  });
}

async function viewRaw(
  token: string | undefined,
  userId: number | string,
  checkId: number | string,
  pose: string,
) {
  return app.inject({
    method: "GET",
    url: photoUrl(userId, checkId, pose),
    headers: token ? auth(token) : {},
  });
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

/** Le pone al control una foto confirmada en la pose (clave con la forma real). */
async function attachPhoto(
  userId: number,
  checkId: number,
  pose: ConquerPose,
): Promise<string> {
  const key = privateCheckPhotoKey({
    tenantId: TEMPLO_CTX.tenantId,
    userId,
    checkId,
    pose,
    contentType: "image/jpeg",
  });
  await app.db
    .update(schema.conquerBodyChecks)
    .set({ [POSE_COLUMN[pose]]: key })
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, TEMPLO_CTX),
        eq(schema.conquerBodyChecks.id, checkId),
      ),
    );
  return key;
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ── (1) GET /members/:userId/body-checks ────────────────────────────

describe("GET /members/:userId/body-checks (§7.2 Evolución)", () => {
  it.each(["admin", "owner"])(
    "el rol %s ve los controles del alumno (más nuevo primero) con el comparador día 0 vs último",
    async (rol) => {
      const m = await activeMember();
      const dia0 = await insertBodyCheckRow(app, {
        userId: m.userId,
        checkDate: addDays(m.hoy, -28),
        kind: "dia0",
      });
      const periodico = await insertBodyCheckRow(app, {
        userId: m.userId,
        checkDate: addDays(m.hoy, -1),
        kind: "periodico",
      });
      const staff = await createConquerStaff(app, rol);

      const res = await listRaw(staff.token, m.userId);

      expect(res.statusCode).toBe(200);
      const body = res.json<ListBody>();
      expect(body.checks.map((c) => c.id)).toEqual([periodico, dia0]);
      expect(body.checks[1]).toMatchObject({ kind: "dia0", armCm: 30 });
      expect(body.compare).toMatchObject({
        from: { id: dia0 },
        to: { id: periodico },
        weeks: 3,
      });
      expect(body.compare?.measures).toHaveLength(5);
      expect(body.due.nextDueDate).toBe(addDays(m.hoy, 27));
    },
  );

  it("con un solo control no hay comparador", async () => {
    const m = await activeMember();
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -3),
      kind: "dia0",
    });

    const res = await listRaw(m.adminToken, m.userId);

    expect(res.statusCode).toBe(200);
    expect(res.json<ListBody>().compare).toBeNull();
    expect(res.json<ListBody>().checks).toHaveLength(1);
  });

  it("no mezcla los controles de otro alumno", async () => {
    const m = await activeMember();
    const otro = await activeMember();
    const propio = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "dia0",
    });
    await insertBodyCheckRow(app, {
      userId: otro.userId,
      checkDate: addDays(otro.hoy, -2),
      kind: "dia0",
    });

    const res = await listRaw(m.adminToken, m.userId);

    expect(res.json<ListBody>().checks.map((c) => c.id)).toEqual([propio]);
  });

  it("la respuesta no lleva claves de storage", async () => {
    const m = await activeMember();
    const id = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "dia0",
    });
    await attachPhoto(m.userId, id, "frente");

    const res = await listRaw(m.adminToken, m.userId);

    expect(res.json<ListBody>().checks[0].photos.frente).toBe(true);
    expect(res.body).not.toContain("private/conquer");
  });

  it.each(["coach", "gestion", "recepcion", "admin_sede"])(
    "el rol %s no ve los controles (dato sensible): 403 (T-201-45)",
    async (rol) => {
      const m = await activeMember();
      await insertBodyCheckRow(app, {
        userId: m.userId,
        checkDate: addDays(m.hoy, -2),
        kind: "dia0",
      });
      const staff = await createConquerStaff(app, rol);

      const res = await listRaw(staff.token, m.userId);

      expect(res.statusCode).toBe(403);
    },
  );

  it("un socio no ve ni sus propios controles por la ruta del admin: 403; sin token: 401", async () => {
    const m = await activeMember();

    expect((await listRaw(m.token, m.userId)).statusCode).toBe(403);
    expect((await listRaw(undefined, m.userId)).statusCode).toBe(401);
  });

  it("alumno sin fila de Conquer en el gimnasio: 404", async () => {
    const m = await activeMember();
    const socio = await createTestMember(app);

    const res = await listRaw(m.adminToken, socio.id);

    expect(res.statusCode).toBe(404);
  });

  it("alumno del gimnasio 2 pedido por un admin del gimnasio 1: 404", async () => {
    const m = await activeMember();

    const res = await listRaw(m.adminToken, gym2.socios[0].id);

    expect(res.statusCode).toBe(404);
  });

  it("un admin del gimnasio 2 (con el módulo) pidiendo un alumno del gimnasio 1: 404", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const m = await activeMember();
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "dia0",
    });

    const res = await listRaw(gym2.adminToken, m.userId);

    expect(res.statusCode).toBe(404);
  });

  it.each(["0", "abc", "-3"])("userId inválido (%s): 400", async (userId) => {
    const m = await activeMember();

    const res = await listRaw(m.adminToken, userId);

    expect(res.statusCode).toBe(400);
  });
});

// ── (2) GET /members/:userId/body-checks/:checkId/photos/:pose/url ──

describe("GET /members/:userId/body-checks/:checkId/photos/:pose/url (D-08)", () => {
  it.each(["admin", "owner"])(
    "el rol %s obtiene la URL firmada de 5 minutos",
    async (rol) => {
      const presignGet = vi.fn(
        async (key: string, expiresIn: number) =>
          `https://r2.test/get/${expiresIn}/${key}`,
      );
      mockPrivateMedia({ presignGet });
      const m = await activeMember();
      const id = await insertBodyCheckRow(app, {
        userId: m.userId,
        checkDate: addDays(m.hoy, -2),
        kind: "dia0",
      });
      const key = await attachPhoto(m.userId, id, "frente");
      const staff = await createConquerStaff(app, rol);

      const res = await viewRaw(staff.token, m.userId, id, "frente");

      expect(res.statusCode).toBe(200);
      expect(res.json<{ url: string; expiresIn: number }>()).toEqual({
        url: `https://r2.test/get/300/${key}`,
        expiresIn: 300,
      });
      expect(presignGet).toHaveBeenCalledWith(key, 300);
    },
  );

  it("control de OTRO alumno pedido bajo este alumno da 404 y no firma nada (cross-ID, T-201-46)", async () => {
    const presignGet = vi.fn(async (key: string) => `https://r2.test/${key}`);
    mockPrivateMedia({ presignGet });
    const m = await activeMember();
    const otro = await activeMember();
    const ajeno = await insertBodyCheckRow(app, {
      userId: otro.userId,
      checkDate: addDays(otro.hoy, -2),
      kind: "dia0",
    });
    await attachPhoto(otro.userId, ajeno, "frente");

    const res = await viewRaw(m.adminToken, m.userId, ajeno, "frente");

    expect(res.statusCode).toBe(404);
    expect(presignGet).not.toHaveBeenCalled();
  });

  it("control inexistente: 404", async () => {
    mockPrivateMedia();
    const m = await activeMember();

    const res = await viewRaw(m.adminToken, m.userId, 987654321, "frente");

    expect(res.statusCode).toBe(404);
  });

  it("alumno del gimnasio 2 con el control del gimnasio 1: 404", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const id = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "dia0",
    });
    await attachPhoto(m.userId, id, "frente");

    const res = await viewRaw(m.adminToken, gym2.socios[0].id, id, "frente");

    expect(res.statusCode).toBe(404);
  });

  it("un admin del gimnasio 2 (con el módulo) sobre un control del gimnasio 1: 404", async () => {
    mockPrivateMedia();
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const m = await activeMember();
    const id = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "dia0",
    });
    await attachPhoto(m.userId, id, "frente");

    const res = await viewRaw(gym2.adminToken, m.userId, id, "frente");

    expect(res.statusCode).toBe(404);
  });

  it("la pose sin foto: 404", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const id = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "dia0",
    });
    await attachPhoto(m.userId, id, "frente");

    const res = await viewRaw(m.adminToken, m.userId, id, "espalda");

    expect(res.statusCode).toBe(404);
  });

  it.each([
    ["pose inválida", "lateral", "1"],
    ["checkId 0", "frente", "0"],
    ["checkId no numérico", "frente", "abc"],
  ])("%s: 400", async (_titulo, pose, checkId) => {
    mockPrivateMedia();
    const m = await activeMember();

    const res = await viewRaw(m.adminToken, m.userId, checkId, pose);

    expect(res.statusCode).toBe(400);
  });

  it.each(["coach", "gestion", "recepcion", "admin_sede"])(
    "el rol %s no ve fotos: 403 aun con el storage disponible (T-201-45)",
    async (rol) => {
      mockPrivateMedia();
      const m = await activeMember();
      const id = await insertBodyCheckRow(app, {
        userId: m.userId,
        checkDate: addDays(m.hoy, -2),
        kind: "dia0",
      });
      await attachPhoto(m.userId, id, "frente");
      const staff = await createConquerStaff(app, rol);

      const res = await viewRaw(staff.token, m.userId, id, "frente");

      expect(res.statusCode).toBe(403);
    },
  );

  it("un socio (ni siquiera el dueño) usa la ruta del admin: 403; sin token: 401", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const id = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "dia0",
    });
    await attachPhoto(m.userId, id, "frente");

    expect((await viewRaw(m.token, m.userId, id, "frente")).statusCode).toBe(
      403,
    );
    expect((await viewRaw(undefined, m.userId, id, "frente")).statusCode).toBe(
      401,
    );
  });

  it("sin bucket privado: 503 con el control propio y 404 con uno ajeno", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember();
    const otro = await activeMember();
    const propio = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(m.hoy, -2),
      kind: "dia0",
    });
    const ajeno = await insertBodyCheckRow(app, {
      userId: otro.userId,
      checkDate: addDays(otro.hoy, -2),
      kind: "dia0",
    });

    const propioRes = await viewRaw(m.adminToken, m.userId, propio, "frente");
    const ajenoRes = await viewRaw(m.adminToken, m.userId, ajeno, "frente");

    expect(propioRes.statusCode).toBe(503);
    expect(ajenoRes.statusCode).toBe(404);
  });
});
