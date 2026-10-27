/**
 * Fase 202 Plan 05 (D-26, D-28, D-29, D-08, DA-44, DA-45, DA-46): bandeja de
 * correcciones del coach.
 *
 *   - GET    /api/admin/conquer/corrections?status=pendiente|respondida
 *   - GET    /api/admin/conquer/corrections/count
 *   - GET    /api/admin/conquer/corrections/:id/video-url?who=alumno|coach
 *   - DELETE /api/admin/conquer/corrections/:id/video
 *
 * Integracion contra el MySQL de tests. Usuarios SIEMPRE con fabricas. El
 * storage se mockea con `mockPrivateMedia` (nada depende de R2 real). Las
 * correcciones se insertan DIRECTO con `insertConquerCorrection`; el orden se
 * controla con `createdAt` / `repliedAt` explicitos (nunca con el orden de alta).
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
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import type { Level } from "../../src/modules/conquer/rules";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  activateViaApi,
  CONQUER_CORRECTIONS_URL,
  createConquerStaff,
  insertConquerCorrection,
  mockVideoStore,
  TEMPLO_CTX,
  type ConquerErrorBody,
} from "./_helpers";

const ADMIN_URL = "/api/admin/conquer/corrections";
const COUNT_URL = `${ADMIN_URL}/count`;

interface AdminCorrectionBody {
  id: number;
  kind: "escalon" | "combo";
  targetLabel: string;
  comment: string | null;
  durationSec: number;
  createdAt: string;
  status: "pendiente" | "respondida";
  videoDeleted: boolean;
  reply: {
    text: string | null;
    hasVideo: boolean;
    videoSeconds: number | null;
    repliedAt: string;
  } | null;
  userId: number;
  memberName: string;
  level: string | null;
  videoDeletedAt: string | null;
  repliedByName: string | null;
  canReply: boolean;
}

interface ListBody {
  items: AdminCorrectionBody[];
}

interface VideoUrlBody {
  available: boolean;
  url: string | null;
  expiresIn: number | null;
}

interface MemberListBody {
  items: { id: number; targetLabel: string }[];
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function listRaw(token: string, status?: string) {
  const query =
    status === undefined ? "" : `?status=${encodeURIComponent(status)}`;
  return app.inject({
    method: "GET",
    url: `${ADMIN_URL}${query}`,
    headers: auth(token),
  });
}

async function listItems(token: string, status?: string) {
  const res = await listRaw(token, status);
  expect(res.statusCode).toBe(200);
  return res.json<ListBody>().items;
}

async function countRaw(token: string) {
  return app.inject({ method: "GET", url: COUNT_URL, headers: auth(token) });
}

async function videoUrlRaw(token: string, id: number | string, who?: string) {
  const query = who === undefined ? "" : `?who=${encodeURIComponent(who)}`;
  return app.inject({
    method: "GET",
    url: `${ADMIN_URL}/${id}/video-url${query}`,
    headers: auth(token),
  });
}

async function deleteVideoRaw(token: string, id: number | string) {
  return app.inject({
    method: "DELETE",
    url: `${ADMIN_URL}/${id}/video`,
    headers: auth(token),
  });
}

async function readCorrection(id: number) {
  const [row] = await app.db
    .select()
    .from(schema.conquerCorrections)
    .where(
      and(
        tenantWhere(schema.conquerCorrections, TEMPLO_CTX),
        eq(schema.conquerCorrections.id, id),
      ),
    );
  return row;
}

/** Alumno de El Templo ya activo en Conquer, con nombre propio para la bandeja. */
async function activeNamed(
  adminToken: string,
  firstName: string,
  lastName: string,
  level: Level = "toro",
) {
  const member = await createTestMember(app, { firstName, lastName });
  const res = await activateViaApi(app, adminToken, member.id, level, 4);
  expect(res.statusCode).toBe(201);
  return { userId: member.id, token: member.token };
}

/**
 * Socio comun (sin activar Conquer) con una corrección de combo: alcanza para
 * probar permisos y aislamiento sin pasar por el alta del alumno.
 */
async function plainCorrection(
  overrides: Parameters<typeof insertConquerCorrection>[2] = {},
) {
  const member = await createTestMember(app);
  const key = alumnoKey(member.id);
  const id = await insertConquerCorrection(app, member.id, {
    comboKey: "push",
    videoKey: key,
    ...overrides,
  });
  return { member, id, key };
}

function alumnoKey(userId: number): string {
  return `private/conquer-corrections/${TEMPLO_CTX.tenantId}/${userId}/alumno-${randomUUID()}.mp4`;
}

function coachKey(userId: number): string {
  return `private/conquer-corrections/${TEMPLO_CTX.tenantId}/${userId}/coach-1-${randomUUID()}.mp4`;
}

/** Hace `minutes` minutos (relativo a ahora: sin literales de calendario). */
function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

/** Corrección PENDIENTE directa en el gimnasio 2 (alumno propio + fila `conquer_members`). */
async function insertGym2Correction(): Promise<number> {
  await setModuleFlag(app, TENANT_DOS, "templo-training", true);
  const [socio] = gym2.socios;
  const ctxDos = { tenantId: TENANT_DOS };
  await app.db
    .insert(schema.conquerMembers)
    .values(
      tenantValues(ctxDos, { userId: socio.id, status: "activo" as const }),
    );
  const [row] = await app.db
    .insert(schema.conquerCorrections)
    .values(
      tenantValues(ctxDos, {
        userId: socio.id,
        comboKey: "push",
        videoSeconds: 12,
        videoKey: `private/conquer-corrections/${TENANT_DOS}/${socio.id}/alumno-${randomUUID()}.mp4`,
        status: "pendiente" as const,
      }),
    )
    .$returningId();
  return row.id;
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

// ── (1) GET /corrections: la bandeja ────────────────────────────────

describe("GET /api/admin/conquer/corrections: pendientes", () => {
  it("la mas vieja primero, con alumno, nivel, objetivo y canReply", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno", "toro");
    const beto = await activeNamed(admin.token, "Beto", "Dos", "novillo");
    // Orden de alta (ids) != orden por antiguedad: [reciente de Beto, vieja de Ana, media de Ana].
    const recienteBeto = await insertConquerCorrection(app, beto.userId, {
      createdAt: minutesAgo(60),
      comment: "El codo se abre",
    });
    const viejaAna = await insertConquerCorrection(app, ana.userId, {
      createdAt: minutesAgo(180),
    });
    const mediaAna = await insertConquerCorrection(app, ana.userId, {
      createdAt: minutesAgo(120),
    });
    // Una respondida de Ana NO entra en la lista de pendientes.
    await insertConquerCorrection(app, ana.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: minutesAgo(10),
    });

    const items = await listItems(admin.token, "pendiente");

    expect(items.map((i) => i.id)).toEqual([viejaAna, mediaAna, recienteBeto]);
    const [primera, , ultima] = items;
    expect(primera).toMatchObject({
      userId: ana.userId,
      memberName: "Ana Uno",
      level: "toro",
      status: "pendiente",
      canReply: true,
      durationSec: 20,
      comment: null,
      videoDeleted: false,
      videoDeletedAt: null,
      repliedByName: null,
      reply: null,
      kind: "escalon",
    });
    expect(primera.targetLabel).toContain("Escalón 1");
    expect(primera.createdAt).toEqual(expect.any(String));
    expect(ultima).toMatchObject({
      userId: beto.userId,
      memberName: "Beto Dos",
      level: "novillo",
      comment: "El codo se abre",
    });
  });

  it("el objetivo es el mismo texto que ve el alumno y no se filtran claves ni replyUnseen", async () => {
    const admin = await createConquerStaff(app, "owner");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId, {
      status: "respondida",
      replyText: "Bien",
      replyVideoKey: coachKey(ana.userId),
      replyVideoSeconds: 8,
      repliedAt: minutesAgo(5),
    });

    const res = await listRaw(admin.token, "respondida");

    expect(res.statusCode).toBe(200);
    const [item] = res.json<ListBody>().items;
    const delAlumno = (
      await app.inject({
        method: "GET",
        url: CONQUER_CORRECTIONS_URL,
        headers: auth(ana.token),
      })
    )
      .json<MemberListBody>()
      .items.find((i) => i.id === id);
    expect(item.targetLabel).toBe(delAlumno?.targetLabel);
    expect(item.targetLabel.length).toBeGreaterThan(0);
    expect(item).not.toHaveProperty("replyUnseen");
    expect(res.body).not.toContain("private/conquer-corrections");
    expect(res.body).not.toContain("videoKey");
    expect(res.body).not.toContain("replyVideoKey");
  });

  it("sin status trae las pendientes, igual que status=pendiente", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const pendiente = await insertConquerCorrection(app, ana.userId);
    await insertConquerCorrection(app, ana.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: minutesAgo(10),
    });

    const sinStatus = await listItems(admin.token);
    const conStatus = await listItems(admin.token, "pendiente");

    expect(sinStatus.map((i) => i.id)).toEqual([pendiente]);
    expect(conStatus.map((i) => i.id)).toEqual([pendiente]);
  });

  it("sin correcciones la lista viene vacia", async () => {
    const admin = await createConquerStaff(app, "admin");

    expect(await listItems(admin.token)).toEqual([]);
    expect(await listItems(admin.token, "respondida")).toEqual([]);
  });

  it("un combo se lista como combo", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno", "toro");
    const id = await insertConquerCorrection(app, ana.userId, {
      comboKey: "push",
    });

    const [item] = await listItems(admin.token);

    expect(item.id).toBe(id);
    expect(item.kind).toBe("combo");
    expect(item.targetLabel).toMatch(/^Combo /);
  });
});

describe("GET /api/admin/conquer/corrections: respondidas", () => {
  it("por replied_at DESC (no por alta), con repliedByName y sin canReply", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    // A: alta la mas vieja, respuesta la mas nueva. B: al reves. C: en el medio.
    const a = await insertConquerCorrection(app, ana.userId, {
      createdAt: minutesAgo(300),
      status: "respondida",
      replyText: "Respuesta A",
      repliedBy: admin.id,
      repliedAt: minutesAgo(1),
    });
    const b = await insertConquerCorrection(app, ana.userId, {
      createdAt: minutesAgo(100),
      status: "respondida",
      replyText: "Respuesta B",
      repliedBy: admin.id,
      repliedAt: minutesAgo(90),
    });
    const c = await insertConquerCorrection(app, ana.userId, {
      createdAt: minutesAgo(200),
      status: "respondida",
      replyText: "Respuesta C",
      replyVideoKey: coachKey(ana.userId),
      replyVideoSeconds: 11,
      repliedAt: minutesAgo(30),
    });
    // Una pendiente no entra.
    await insertConquerCorrection(app, ana.userId);

    const items = await listItems(admin.token, "respondida");

    expect(items.map((i) => i.id)).toEqual([a, c, b]);
    expect(items[0]).toMatchObject({
      status: "respondida",
      canReply: false,
      repliedByName: "Staff",
    });
    expect(items[0].reply).toMatchObject({
      text: "Respuesta A",
      hasVideo: false,
      videoSeconds: null,
    });
    expect(items[1].reply).toMatchObject({
      text: "Respuesta C",
      hasVideo: true,
      videoSeconds: 11,
    });
    // Respondida sin coach registrado (`replied_by` NULL): sin nombre, no rompe.
    expect(items[1].repliedByName).toBeNull();
  });

  it("trae solo las 50 mas nuevas por replied_at", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const ids: number[] = [];
    // i = 0 respondida mas reciente ... i = 50 la mas vieja; el alta va al reves
    // (la mas vieja por respuesta es la mas nueva por alta).
    for (let i = 0; i <= 50; i++) {
      ids.push(
        await insertConquerCorrection(app, ana.userId, {
          createdAt: minutesAgo(1000 - i),
          status: "respondida",
          replyText: `Respuesta ${i}`,
          repliedAt: minutesAgo(i + 1),
        }),
      );
    }

    const items = await listItems(admin.token, "respondida");

    expect(items).toHaveLength(50);
    expect(items.map((i) => i.id)).toEqual(ids.slice(0, 50));
    expect(items.map((i) => i.id)).not.toContain(ids[50]);
  });
});

describe("GET /api/admin/conquer/corrections: validacion", () => {
  it.each(["otro", "PENDIENTE", "todas", "pendiente,respondida"])(
    "status=%s es 400 CONQUER_CORRECCION_ESTADO_INVALIDO",
    async (status) => {
      const admin = await createConquerStaff(app, "admin");

      const res = await listRaw(admin.token, status);

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_CORRECCION_ESTADO_INVALIDO",
      );
    },
  );

  it("status vacio tambien es 400 (no cae a pendiente)", async () => {
    const admin = await createConquerStaff(app, "admin");

    const res = await listRaw(admin.token, "");

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_CORRECCION_ESTADO_INVALIDO",
    );
  });
});

// ── (2) GET /corrections/count ──────────────────────────────────────

describe("GET /api/admin/conquer/corrections/count", () => {
  it.each(["owner", "admin"])(
    "%s: cuenta las pendientes y no las respondidas",
    async (role) => {
      const staff = await createConquerStaff(app, role);
      const ana = await activeNamed(staff.token, "Ana", "Uno");
      const beto = await activeNamed(staff.token, "Beto", "Dos", "novillo");
      await insertConquerCorrection(app, ana.userId);
      await insertConquerCorrection(app, beto.userId);
      await insertConquerCorrection(app, beto.userId, {
        status: "respondida",
        replyText: "Bien",
        repliedAt: minutesAgo(10),
      });

      const res = await countRaw(staff.token);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ count: 2 });
    },
  );

  it("sin correcciones: 0", async () => {
    const admin = await createConquerStaff(app, "admin");

    const res = await countRaw(admin.token);

    expect(res.json()).toEqual({ count: 0 });
  });

  it("el contador baja cuando la corrección se responde", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId);
    expect((await countRaw(admin.token)).json()).toEqual({ count: 1 });

    await app.db
      .update(schema.conquerCorrections)
      .set({ status: "respondida", replyText: "Bien", repliedAt: new Date() })
      .where(
        and(
          tenantWhere(schema.conquerCorrections, TEMPLO_CTX),
          eq(schema.conquerCorrections.id, id),
        ),
      );

    expect((await countRaw(admin.token)).json()).toEqual({ count: 0 });
  });
});

// ── (3) GET /corrections/:id/video-url ──────────────────────────────

describe("GET /api/admin/conquer/corrections/:id/video-url", () => {
  it("who=alumno con el objeto presente: URL firmada de 300 s para esa clave", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const key = alumnoKey(ana.userId);
    const id = await insertConquerCorrection(app, ana.userId, {
      videoKey: key,
    });
    const store = mockVideoStore();

    const res = await videoUrlRaw(admin.token, id, "alumno");

    expect(res.statusCode).toBe(200);
    const body = res.json<VideoUrlBody>();
    expect(body.available).toBe(true);
    expect(body.url).toContain(key);
    expect(body.expiresIn).toBe(300);
    expect(store.head).toHaveBeenCalledWith(key);
    expect(store.presignGet).toHaveBeenCalledWith(key, 300);
  });

  it("who=coach da el video del coach, no el del alumno", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const claveAlumno = alumnoKey(ana.userId);
    const claveCoach = coachKey(ana.userId);
    const id = await insertConquerCorrection(app, ana.userId, {
      videoKey: claveAlumno,
      status: "respondida",
      replyVideoKey: claveCoach,
      replyVideoSeconds: 9,
      repliedAt: new Date(),
    });
    mockVideoStore();

    const body = (
      await videoUrlRaw(admin.token, id, "coach")
    ).json<VideoUrlBody>();

    expect(body.available).toBe(true);
    expect(body.url).toContain(claveCoach);
    expect(body.url).not.toContain(claveAlumno);
  });

  it("el objeto ya no existe (vencido): 200 available false, sin firmar", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId);
    const store = mockVideoStore({ head: async () => null });

    const res = await videoUrlRaw(admin.token, id, "alumno");

    expect(res.statusCode).toBe(200);
    expect(res.json<VideoUrlBody>()).toEqual({
      available: false,
      url: null,
      expiresIn: null,
    });
    expect(store.presignGet).not.toHaveBeenCalled();
  });

  it("who=coach en una pendiente (sin video del coach): available false sin tocar el storage", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId);
    const store = mockVideoStore();

    const res = await videoUrlRaw(admin.token, id, "coach");

    expect(res.statusCode).toBe(200);
    expect(res.json<VideoUrlBody>().available).toBe(false);
    expect(store.head).not.toHaveBeenCalled();
  });

  it.each(["x", "ALUMNO", "", "alumno,coach"])(
    "who=%j es 400 CONQUER_VIDEO_QUIEN_INVALIDO",
    async (who) => {
      const admin = await createConquerStaff(app, "admin");
      const ana = await activeNamed(admin.token, "Ana", "Uno");
      const id = await insertConquerCorrection(app, ana.userId);
      const store = mockVideoStore();

      const res = await videoUrlRaw(admin.token, id, who);

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_VIDEO_QUIEN_INVALIDO",
      );
      expect(store.presignGet).not.toHaveBeenCalled();
    },
  );

  it("sin who o con id no entero: 400 de validacion", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId);

    expect((await videoUrlRaw(admin.token, id)).statusCode).toBe(400);
    expect((await videoUrlRaw(admin.token, "abc", "alumno")).statusCode).toBe(
      400,
    );
  });

  it("una corrección inexistente es 404, y el 404 va antes que el who invalido", async () => {
    const admin = await createConquerStaff(app, "admin");

    const valido = await videoUrlRaw(admin.token, 999999999, "alumno");
    const invalido = await videoUrlRaw(admin.token, 999999999, "x");

    expect(valido.statusCode).toBe(404);
    expect(invalido.statusCode).toBe(404);
  });

  it("sin bucket privado y con clave: 503 CONQUER_VIDEOS_NO_DISPONIBLES", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId);

    const res = await videoUrlRaw(admin.token, id, "alumno");

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
  });
});

// ── (4) DELETE /corrections/:id/video ───────────────────────────────

describe("DELETE /api/admin/conquer/corrections/:id/video", () => {
  it("borra el objeto y la clave, registra video_deleted_by y video_deleted_at, y deja intacto el resto", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const claveAlumno = alumnoKey(ana.userId);
    const claveCoach = coachKey(ana.userId);
    const id = await insertConquerCorrection(app, ana.userId, {
      videoKey: claveAlumno,
      comment: "Mirá mi espalda",
      status: "respondida",
      replyText: "Bien",
      replyVideoKey: claveCoach,
      replyVideoSeconds: 7,
      repliedBy: admin.id,
      repliedAt: minutesAgo(5),
    });
    const store = mockVideoStore();

    const res = await deleteVideoRaw(admin.token, id);

    expect(res.statusCode).toBe(200);
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith(claveAlumno);
    const fila = await readCorrection(id);
    expect(fila.videoKey).toBeNull();
    expect(fila.videoDeletedAt).not.toBeNull();
    expect(fila.videoDeletedBy).toBe(admin.id);
    expect(fila.comment).toBe("Mirá mi espalda");
    expect(fila.status).toBe("respondida");
    expect(fila.replyText).toBe("Bien");
    expect(fila.replyVideoKey).toBe(claveCoach);
    const vista = res.json<AdminCorrectionBody>();
    expect(vista).toMatchObject({
      id,
      videoDeleted: true,
      comment: "Mirá mi espalda",
      status: "respondida",
      canReply: false,
      memberName: "Ana Uno",
    });
    expect(vista.videoDeletedAt).toEqual(expect.any(String));
    expect(vista.reply?.hasVideo).toBe(true);
    expect(res.body).not.toContain("private/conquer-corrections");
  });

  it("despues del borrado el video del alumno ya no esta, el del coach si", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const claveCoach = coachKey(ana.userId);
    const id = await insertConquerCorrection(app, ana.userId, {
      status: "respondida",
      replyVideoKey: claveCoach,
      replyVideoSeconds: 7,
      repliedAt: new Date(),
    });
    const store = mockVideoStore();
    await deleteVideoRaw(admin.token, id);
    store.head.mockClear();

    const alumno = await videoUrlRaw(admin.token, id, "alumno");
    const coach = await videoUrlRaw(admin.token, id, "coach");

    expect(alumno.json<VideoUrlBody>().available).toBe(false);
    expect(store.head).toHaveBeenCalledTimes(1);
    expect(store.head).toHaveBeenCalledWith(claveCoach);
    expect(coach.json<VideoUrlBody>().available).toBe(true);
    expect(coach.json<VideoUrlBody>().url).toContain(claveCoach);
  });

  it("repetir el DELETE es 200 sin volver a tocar el storage ni pisar quien borro", async () => {
    const admin = await createConquerStaff(app, "admin");
    const owner = await createConquerStaff(app, "owner");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId);
    const store = mockVideoStore();
    await deleteVideoRaw(admin.token, id);
    const primera = await readCorrection(id);

    const res = await deleteVideoRaw(owner.token, id);

    expect(res.statusCode).toBe(200);
    expect(res.json<AdminCorrectionBody>().videoDeleted).toBe(true);
    expect(store.remove).toHaveBeenCalledTimes(1);
    const fila = await readCorrection(id);
    expect(fila.videoDeletedBy).toBe(admin.id);
    expect(fila.videoDeletedAt).toEqual(primera.videoDeletedAt);
  });

  it("una pendiente sigue pendiente y se puede responder (canReply)", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId);
    mockVideoStore();

    const res = await deleteVideoRaw(admin.token, id);

    expect(res.statusCode).toBe(200);
    expect(res.json<AdminCorrectionBody>()).toMatchObject({
      status: "pendiente",
      canReply: true,
      videoDeleted: true,
    });
    expect((await readCorrection(id)).status).toBe("pendiente");
    expect((await countRaw(admin.token)).json()).toEqual({ count: 1 });
  });

  it("si R2 falla: 503 CONQUER_VIDEOS_NO_DISPONIBLES y la fila conserva su clave", async () => {
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const key = alumnoKey(ana.userId);
    const id = await insertConquerCorrection(app, ana.userId, {
      videoKey: key,
    });
    const store = mockVideoStore({
      remove: async () => {
        throw new Error("R2 caido private/bucket-secreto");
      },
    });

    const res = await deleteVideoRaw(admin.token, id);

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
    expect(res.body).not.toContain("bucket-secreto");
    expect(store.remove).toHaveBeenCalledWith(key);
    const fila = await readCorrection(id);
    expect(fila.videoKey).toBe(key);
    expect(fila.videoDeletedAt).toBeNull();
    expect(fila.videoDeletedBy).toBeNull();
  });

  it("sin bucket privado y con clave: 503 y la fila no cambia", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const key = alumnoKey(ana.userId);
    const id = await insertConquerCorrection(app, ana.userId, {
      videoKey: key,
    });

    const res = await deleteVideoRaw(admin.token, id);

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
    const fila = await readCorrection(id);
    expect(fila.videoKey).toBe(key);
    expect(fila.videoDeletedAt).toBeNull();
  });

  it("sin clave (ya borrada) y sin bucket: 200, no hace falta el storage", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const admin = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin.token, "Ana", "Uno");
    const id = await insertConquerCorrection(app, ana.userId, {
      videoKey: null,
      videoDeletedAt: minutesAgo(30),
    });

    const res = await deleteVideoRaw(admin.token, id);

    expect(res.statusCode).toBe(200);
    expect(res.json<AdminCorrectionBody>().videoDeleted).toBe(true);
  });

  it("una corrección inexistente es 404 y un id no entero es 400", async () => {
    const admin = await createConquerStaff(app, "admin");
    const store = mockVideoStore();

    expect((await deleteVideoRaw(admin.token, 999999999)).statusCode).toBe(404);
    expect((await deleteVideoRaw(admin.token, "abc")).statusCode).toBe(400);
    expect(store.remove).not.toHaveBeenCalled();
  });
});

// ── (6) roles y autenticacion ───────────────────────────────────────

describe("permisos de la bandeja (D-08, T-201-132)", () => {
  const RUTAS = [
    { nombre: "lista", method: "GET", path: () => ADMIN_URL },
    { nombre: "count", method: "GET", path: () => COUNT_URL },
    {
      nombre: "video-url",
      method: "GET",
      path: (id: number) => `${ADMIN_URL}/${id}/video-url?who=alumno`,
    },
    {
      nombre: "delete-video",
      method: "DELETE",
      path: (id: number) => `${ADMIN_URL}/${id}/video`,
    },
  ] as const;

  describe.each([
    "coach",
    "gestion",
    "recepcion",
    "admin_sede",
    "coach_actividad",
  ])("el rol %s", (role) => {
    it.each(RUTAS)("recibe 403 en $nombre y no toca nada", async (ruta) => {
      const { id, key } = await plainCorrection();
      const store = mockVideoStore();
      const staff = await createConquerStaff(app, role);

      const res = await app.inject({
        method: ruta.method,
        url: ruta.path(id),
        headers: auth(staff.token),
      });

      expect(res.statusCode).toBe(403);
      expect(store.remove).not.toHaveBeenCalled();
      expect(store.presignGet).not.toHaveBeenCalled();
      expect((await readCorrection(id)).videoKey).toBe(key);
    });
  });

  it.each(RUTAS)("un socio comun recibe 403 en $nombre", async (ruta) => {
    const { member, id, key } = await plainCorrection();

    const res = await app.inject({
      method: ruta.method,
      url: ruta.path(id),
      headers: auth(member.token),
    });

    expect(res.statusCode).toBe(403);
    expect((await readCorrection(id)).videoKey).toBe(key);
  });

  it.each(RUTAS)("sin token: 401 en $nombre", async (ruta) => {
    const res = await app.inject({ method: ruta.method, url: ruta.path(1) });

    expect(res.statusCode).toBe(401);
  });
});

// ── (7) aislamiento entre gimnasios ─────────────────────────────────

describe("aislamiento entre gimnasios (T-201-133)", () => {
  it("el gimnasio 2 sin el modulo templo-training recibe 404 en las 4 rutas", async () => {
    const { id } = await plainCorrection();
    const rutas = [
      { method: "GET", url: ADMIN_URL },
      { method: "GET", url: COUNT_URL },
      { method: "GET", url: `${ADMIN_URL}/${id}/video-url?who=alumno` },
      { method: "DELETE", url: `${ADMIN_URL}/${id}/video` },
    ] as const;

    for (const ruta of rutas) {
      const res = await app.inject({
        method: ruta.method,
        url: ruta.url,
        headers: auth(gym2.adminToken),
      });
      expect(res.statusCode, `${ruta.method} ${ruta.url}`).toBe(404);
    }
  });

  it("cada gimnasio ve y cuenta solo SUS correcciones", async () => {
    const admin1 = await createConquerStaff(app, "admin");
    const ana = await activeNamed(admin1.token, "Ana", "Uno");
    const beto = await activeNamed(admin1.token, "Beto", "Dos", "novillo");
    const deAna = await insertConquerCorrection(app, ana.userId);
    const deBeto = await insertConquerCorrection(app, beto.userId);
    await insertConquerCorrection(app, beto.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: minutesAgo(10),
    });
    const delDos = await insertGym2Correction();

    const lista1 = await listItems(admin1.token);
    const lista2 = await listItems(gym2.adminToken);
    const respondidas2 = await listItems(gym2.adminToken, "respondida");

    expect(lista1.map((i) => i.id).sort()).toEqual([deAna, deBeto].sort());
    expect(lista2.map((i) => i.id)).toEqual([delDos]);
    expect(respondidas2).toEqual([]);
    expect((await countRaw(admin1.token)).json()).toEqual({ count: 2 });
    expect((await countRaw(gym2.adminToken)).json()).toEqual({ count: 1 });
  });

  it("video-url y DELETE de una corrección del gimnasio 1 desde el 2: 404 y la fila no cambia", async () => {
    const { id, key } = await plainCorrection();
    await insertGym2Correction();
    const store = mockVideoStore();

    const urlAlumno = await videoUrlRaw(gym2.adminToken, id, "alumno");
    const urlCoach = await videoUrlRaw(gym2.adminToken, id, "coach");
    const borrar = await deleteVideoRaw(gym2.adminToken, id);

    expect(urlAlumno.statusCode).toBe(404);
    expect(urlCoach.statusCode).toBe(404);
    expect(borrar.statusCode).toBe(404);
    expect(store.presignGet).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
    const fila = await readCorrection(id);
    expect(fila.videoKey).toBe(key);
    expect(fila.videoDeletedAt).toBeNull();
    expect(fila.videoDeletedBy).toBeNull();
  });

  it("y al reves: el admin del gimnasio 1 no ve ni borra la corrección del 2", async () => {
    const admin1 = await createConquerStaff(app, "admin");
    const delDos = await insertGym2Correction();
    const store = mockVideoStore();

    const url = await videoUrlRaw(admin1.token, delDos, "alumno");
    const borrar = await deleteVideoRaw(admin1.token, delDos);

    expect(url.statusCode).toBe(404);
    expect(borrar.statusCode).toBe(404);
    expect(store.remove).not.toHaveBeenCalled();
    const [fila] = await app.db
      .select()
      .from(schema.conquerCorrections)
      .where(
        and(
          tenantWhere(schema.conquerCorrections, { tenantId: TENANT_DOS }),
          eq(schema.conquerCorrections.id, delDos),
        ),
      );
    expect(fila.videoKey).not.toBeNull();
    expect(fila.videoDeletedAt).toBeNull();
  });
});
