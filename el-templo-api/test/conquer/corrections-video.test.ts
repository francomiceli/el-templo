/**
 * Fase 202 Plan 04 (D-26, D-27, D-28, D-29, DA-44, DA-46): ver los videos de una
 * corrección, marcar las respuestas como vistas y el contador de Inicio.
 *
 *   - GET  /api/members/conquer/corrections/:id/video-url?who=alumno|coach
 *   - POST /api/members/conquer/corrections/seen
 *   - GET  /api/members/conquer/state  (member.corrections)
 *
 * Integracion contra el MySQL de tests. Usuarios SIEMPRE con fabricas. El
 * storage se mockea con `mockPrivateMedia` (nada depende de R2 real). Las
 * correcciones se insertan DIRECTO con `insertConquerCorrection`.
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
import type { PrivateMediaStore } from "../../src/modules/conquer/private-media";
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
  CONQUER_CORRECTIONS_URL,
  CONQUER_STATE_URL,
  createActiveConquerMember,
  insertConquerCorrection,
  insertConquerMember,
  mockPrivateMedia,
  TEMPLO_CTX,
  type ConquerErrorBody,
} from "./_helpers";

const SEEN_URL = `${CONQUER_CORRECTIONS_URL}/seen`;

interface VideoUrlBody {
  available: boolean;
  url: string | null;
  expiresIn: number | null;
}

interface StateBody {
  status: "bloqueado" | "pedido" | "activo";
  member: {
    corrections: { pending: number; unseenReplies: number };
  } | null;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function videoUrlRaw(token: string, id: number | string, who?: string) {
  const query = who === undefined ? "" : `?who=${encodeURIComponent(who)}`;
  return app.inject({
    method: "GET",
    url: `${CONQUER_CORRECTIONS_URL}/${id}/video-url${query}`,
    headers: auth(token),
  });
}

async function seenRaw(token: string) {
  return app.inject({
    method: "POST",
    url: SEEN_URL,
    headers: auth(token),
  });
}

async function fetchState(token: string): Promise<StateBody> {
  const res = await app.inject({
    method: "GET",
    url: CONQUER_STATE_URL,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  return res.json<StateBody>();
}

function alumnoKey(userId: number): string {
  return `private/conquer-corrections/${TEMPLO_CTX.tenantId}/${userId}/alumno-${randomUUID()}.mp4`;
}

function coachKey(userId: number): string {
  return `private/conquer-corrections/${TEMPLO_CTX.tenantId}/${userId}/coach-1-${randomUUID()}.mp4`;
}

interface VideoStoreSpies {
  head: ReturnType<typeof vi.fn<PrivateMediaStore["head"]>>;
  presignGet: ReturnType<typeof vi.fn<PrivateMediaStore["presignGet"]>>;
}

/**
 * Tienda de videos de mentira con espias: por defecto el objeto existe (MP4) y
 * la URL firmada es `https://r2.test/get/{clave}`.
 */
function mockVideoStore(
  head: PrivateMediaStore["head"] = async () => ({
    contentLength: 5 * 1024 * 1024,
    contentType: "video/mp4",
  }),
): VideoStoreSpies {
  const headSpy = vi.fn<PrivateMediaStore["head"]>(head);
  const presignGet = vi.fn<PrivateMediaStore["presignGet"]>(
    async (key) => `https://r2.test/get/${key}`,
  );
  mockPrivateMedia({ head: headSpy, presignGet });
  return { head: headSpy, presignGet };
}

async function activeMember() {
  return createActiveConquerMember(app, { level: "toro", daysCount: 4 });
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

/** Alumno `activo` del gimnasio 2 con el modulo prendido (fila de Conquer en SU gimnasio). */
async function activateGym2Socio() {
  await setModuleFlag(app, TENANT_DOS, "templo-training", true);
  const [socio] = gym2.socios;
  await app.db
    .insert(schema.conquerMembers)
    .values(
      tenantValues(
        { tenantId: TENANT_DOS },
        { userId: socio.id, status: "activo" as const },
      ),
    );
  return socio;
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

// ── (1-4) GET /corrections/:id/video-url ────────────────────────────

describe("GET /corrections/:id/video-url: el video existe", () => {
  it("who=alumno con clave y objeto presente: URL firmada de 300 s para esa clave", async () => {
    const m = await activeMember();
    const key = alumnoKey(m.userId);
    const id = await insertConquerCorrection(app, m.userId, { videoKey: key });
    const store = mockVideoStore();

    const res = await videoUrlRaw(m.token, id, "alumno");

    expect(res.statusCode).toBe(200);
    const body = res.json<VideoUrlBody>();
    expect(body.available).toBe(true);
    expect(body.url).toContain(key);
    expect(body.expiresIn).toBe(300);
    expect(store.head).toHaveBeenCalledWith(key);
    expect(store.presignGet).toHaveBeenCalledWith(key, 300);
  });

  it("who=coach con clave de coach: URL de ESE video, no del alumno", async () => {
    const m = await activeMember();
    const claveAlumno = alumnoKey(m.userId);
    const replyKey = coachKey(m.userId);
    const id = await insertConquerCorrection(app, m.userId, {
      videoKey: claveAlumno,
      status: "respondida",
      replyText: "Mirá el codo",
      replyVideoKey: replyKey,
      replyVideoSeconds: 12,
      repliedAt: new Date(),
    });
    const store = mockVideoStore();

    const res = await videoUrlRaw(m.token, id, "coach");

    expect(res.statusCode).toBe(200);
    const body = res.json<VideoUrlBody>();
    expect(body.available).toBe(true);
    expect(body.url).toContain(replyKey);
    expect(body.url).not.toContain(claveAlumno);
    expect(store.presignGet).toHaveBeenCalledWith(replyKey, 300);
  });

  it("la misma corrección: who=alumno da el video del alumno y who=coach el del coach", async () => {
    const m = await activeMember();
    const claveAlumno = alumnoKey(m.userId);
    const replyKey = coachKey(m.userId);
    const id = await insertConquerCorrection(app, m.userId, {
      videoKey: claveAlumno,
      status: "respondida",
      replyVideoKey: replyKey,
      replyVideoSeconds: 9,
      repliedAt: new Date(),
    });
    mockVideoStore();

    const deAlumno = (
      await videoUrlRaw(m.token, id, "alumno")
    ).json<VideoUrlBody>();
    const deCoach = (
      await videoUrlRaw(m.token, id, "coach")
    ).json<VideoUrlBody>();

    expect(deAlumno.url).toContain(claveAlumno);
    expect(deCoach.url).toContain(replyKey);
    expect(deAlumno.url).not.toBe(deCoach.url);
  });
});

describe("GET /corrections/:id/video-url: el video ya no esta (D-28)", () => {
  it("el objeto ya no existe (vencido a los 60 dias): 200 available false, sin firmar", async () => {
    const m = await activeMember();
    const id = await insertConquerCorrection(app, m.userId);
    const store = mockVideoStore(async () => null);

    const res = await videoUrlRaw(m.token, id, "alumno");

    expect(res.statusCode).toBe(200);
    expect(res.json<VideoUrlBody>()).toEqual({
      available: false,
      url: null,
      expiresIn: null,
    });
    expect(store.head).toHaveBeenCalledTimes(1);
    expect(store.presignGet).not.toHaveBeenCalled();
  });

  it("video_key NULL (borrado a mano): available false y no toca el storage", async () => {
    const m = await activeMember();
    const id = await insertConquerCorrection(app, m.userId, {
      videoKey: null,
      videoDeletedAt: new Date(),
    });
    const store = mockVideoStore();

    const res = await videoUrlRaw(m.token, id, "alumno");

    expect(res.statusCode).toBe(200);
    expect(res.json<VideoUrlBody>()).toEqual({
      available: false,
      url: null,
      expiresIn: null,
    });
    expect(store.head).not.toHaveBeenCalled();
    expect(store.presignGet).not.toHaveBeenCalled();
  });

  it("video_key NULL y sin bucket privado: 200 available false, no 503 (no llega al storage)", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember();
    const id = await insertConquerCorrection(app, m.userId, {
      videoKey: null,
      videoDeletedAt: new Date(),
    });

    const res = await videoUrlRaw(m.token, id, "alumno");

    expect(res.statusCode).toBe(200);
    expect(res.json<VideoUrlBody>().available).toBe(false);
  });

  it("who=coach sin reply_video_key (respondio solo con texto): available false", async () => {
    const m = await activeMember();
    const id = await insertConquerCorrection(app, m.userId, {
      status: "respondida",
      replyText: "Todo bien",
      repliedAt: new Date(),
    });
    const store = mockVideoStore();

    const res = await videoUrlRaw(m.token, id, "coach");

    expect(res.statusCode).toBe(200);
    expect(res.json<VideoUrlBody>().available).toBe(false);
    expect(store.head).not.toHaveBeenCalled();
    expect(store.presignGet).not.toHaveBeenCalled();
  });

  it("who=coach en una corrección pendiente: available false (nunca lee el video del alumno)", async () => {
    const m = await activeMember();
    const id = await insertConquerCorrection(app, m.userId);
    const store = mockVideoStore();

    const res = await videoUrlRaw(m.token, id, "coach");

    expect(res.json<VideoUrlBody>().available).toBe(false);
    expect(store.presignGet).not.toHaveBeenCalled();
  });
});

describe("GET /corrections/:id/video-url: validacion y errores", () => {
  it.each(["otro", "ALUMNO", "", "alumno,coach"])(
    "who=%j: 400 CONQUER_VIDEO_QUIEN_INVALIDO",
    async (who) => {
      const m = await activeMember();
      const id = await insertConquerCorrection(app, m.userId);
      const store = mockVideoStore();

      const res = await videoUrlRaw(m.token, id, who);

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_VIDEO_QUIEN_INVALIDO",
      );
      expect(store.presignGet).not.toHaveBeenCalled();
    },
  );

  it("who invalido gana al 503: se valida antes de pedir el storage", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember();
    const id = await insertConquerCorrection(app, m.userId);

    const res = await videoUrlRaw(m.token, id, "otro");

    expect(res.statusCode).toBe(400);
  });

  it("el 404 de la corrección gana al 400 de who", async () => {
    const m = await activeMember();

    const res = await videoUrlRaw(m.token, 999999999, "otro");

    expect(res.statusCode).toBe(404);
  });

  it("sin el parametro who o con un id que no es entero: 400 de validacion", async () => {
    const m = await activeMember();
    const id = await insertConquerCorrection(app, m.userId);
    mockVideoStore();

    const sinWho = await videoUrlRaw(m.token, id);
    const idMalo = await videoUrlRaw(m.token, "abc", "alumno");

    expect(sinWho.statusCode).toBe(400);
    expect(idMalo.statusCode).toBe(400);
  });

  it("con clave y sin bucket privado: 503 CONQUER_VIDEOS_NO_DISPONIBLES", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember();
    const id = await insertConquerCorrection(app, m.userId);

    const res = await videoUrlRaw(m.token, id, "alumno");

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
  });

  it("el storage falla: 503 sin filtrar la clave ni el error del SDK", async () => {
    const m = await activeMember();
    const key = alumnoKey(m.userId);
    const id = await insertConquerCorrection(app, m.userId, { videoKey: key });
    mockVideoStore(async () => {
      throw new Error(`bucket secreto ${key}`);
    });

    const res = await videoUrlRaw(m.token, id, "alumno");

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
    expect(res.body).not.toContain(key);
    expect(res.body).not.toContain("secreto");
  });
});

describe("GET /corrections/:id/video-url: aislamiento (T-201-129)", () => {
  it("la corrección de OTRO alumno del mismo gimnasio: 404, sin firmar nada", async () => {
    const a = await activeMember();
    const b = await activeMember();
    const deB = await insertConquerCorrection(app, b.userId);
    const store = mockVideoStore();

    const res = await videoUrlRaw(a.token, deB, "alumno");

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("r2.test");
    expect(store.head).not.toHaveBeenCalled();
    expect(store.presignGet).not.toHaveBeenCalled();
  });

  it("es indistinguible de una corrección que no existe", async () => {
    const a = await activeMember();
    const b = await activeMember();
    const deB = await insertConquerCorrection(app, b.userId);
    mockVideoStore();

    const ajena = await videoUrlRaw(a.token, deB, "alumno");
    const inexistente = await videoUrlRaw(a.token, deB + 100000, "alumno");

    expect(inexistente.statusCode).toBe(404);
    expect(ajena.json<ConquerErrorBody>()).toEqual(
      inexistente.json<ConquerErrorBody>(),
    );
  });

  it("un alumno del gimnasio 2 con Conquer activo en SU gimnasio: 404 para la corrección del gimnasio 1", async () => {
    const activo = await activeMember();
    const deGym1 = await insertConquerCorrection(app, activo.userId);
    const socio = await activateGym2Socio();
    const store = mockVideoStore();

    const res = await videoUrlRaw(socio.token, deGym1, "alumno");

    expect(res.statusCode).toBe(404);
    expect(store.presignGet).not.toHaveBeenCalled();
  });

  it("un gimnasio sin el módulo templo-training: 404", async () => {
    const activo = await activeMember();
    const deGym1 = await insertConquerCorrection(app, activo.userId);
    const [socio] = gym2.socios;
    mockVideoStore();

    const res = await videoUrlRaw(socio.token, deGym1, "alumno");

    expect(res.statusCode).toBe(404);
  });
});

// ── (8) GET /state: member.corrections ──────────────────────────────

describe("GET /state: member.corrections (DA-46)", () => {
  it("2 pendientes y 1 respondida sin ver: { pending: 2, unseenReplies: 1 }", async () => {
    const m = await activeMember();
    const otro = await activeMember();
    await insertConquerCorrection(app, m.userId);
    await insertConquerCorrection(app, m.userId);
    await insertConquerCorrection(app, m.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: new Date(),
    });
    // Ya vista: no cuenta. Y las de otro alumno tampoco.
    await insertConquerCorrection(app, m.userId, {
      status: "respondida",
      replyText: "Ok",
      repliedAt: new Date(),
      replySeenAt: new Date(),
    });
    await insertConquerCorrection(app, otro.userId);
    await insertConquerCorrection(app, otro.userId, {
      status: "respondida",
      replyText: "Ok",
      repliedAt: new Date(),
    });

    const body = await fetchState(m.token);

    expect(body.status).toBe("activo");
    expect(body.member?.corrections).toEqual({ pending: 2, unseenReplies: 1 });
  });

  it("sin correcciones: el campo viene con ceros (no falta)", async () => {
    const m = await activeMember();

    const body = await fetchState(m.token);

    expect(body.member?.corrections).toEqual({ pending: 0, unseenReplies: 0 });
  });

  it("un socio con el pedido sin aprobar: member null, sin corrections", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id, { status: "pedido" });

    const body = await fetchState(socio.token);

    expect(body.status).toBe("pedido");
    expect(body.member).toBeNull();
  });
});

// ── (9) POST /corrections/seen ──────────────────────────────────────

describe("POST /corrections/seen (DA-46, T-201-131)", () => {
  it("marca vistas SOLO las respuestas del alumno: 200 { unseenReplies: 0 }", async () => {
    const a = await activeMember();
    const b = await activeMember();
    const respondidaA = await insertConquerCorrection(app, a.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: new Date(),
    });
    const pendienteA = await insertConquerCorrection(app, a.userId);
    const respondidaB = await insertConquerCorrection(app, b.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: new Date(),
    });
    expect((await fetchState(a.token)).member?.corrections.unseenReplies).toBe(
      1,
    );

    const res = await seenRaw(a.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<{ unseenReplies: number }>()).toEqual({ unseenReplies: 0 });
    const estadoA = await fetchState(a.token);
    expect(estadoA.member?.corrections).toEqual({
      pending: 1,
      unseenReplies: 0,
    });
    expect((await readCorrection(respondidaA)).replySeenAt).not.toBeNull();
    // La pendiente no tiene respuesta que ver: queda sin marca.
    expect((await readCorrection(pendienteA)).replySeenAt).toBeNull();
    // La respondida de OTRO alumno sigue sin ver.
    expect((await readCorrection(respondidaB)).replySeenAt).toBeNull();
    expect((await fetchState(b.token)).member?.corrections.unseenReplies).toBe(
      1,
    );
  });

  it("es idempotente y no pisa la fecha de una respuesta ya vista", async () => {
    const m = await activeMember();
    const hace3Dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const yaVista = await insertConquerCorrection(app, m.userId, {
      status: "respondida",
      replyText: "Ok",
      repliedAt: hace3Dias,
      replySeenAt: hace3Dias,
    });
    const sinVer = await insertConquerCorrection(app, m.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: new Date(),
    });
    const antes = (await readCorrection(yaVista)).replySeenAt;

    const primera = await seenRaw(m.token);
    const segunda = await seenRaw(m.token);

    expect(primera.statusCode).toBe(200);
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json<{ unseenReplies: number }>()).toEqual({
      unseenReplies: 0,
    });
    expect((await readCorrection(yaVista)).replySeenAt).toEqual(antes);
    expect((await readCorrection(sinVer)).replySeenAt).not.toBeNull();
  });

  it("sin respuestas que ver tambien es 200 { unseenReplies: 0 }", async () => {
    const m = await activeMember();
    await insertConquerCorrection(app, m.userId);

    const res = await seenRaw(m.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<{ unseenReplies: number }>()).toEqual({ unseenReplies: 0 });
  });

  it("responde en su ruta y no cae en POST /corrections (que sin body daria 400)", async () => {
    const m = await activeMember();
    const antes = await app.db
      .select({ id: schema.conquerCorrections.id })
      .from(schema.conquerCorrections)
      .where(tenantWhere(schema.conquerCorrections, TEMPLO_CTX));

    const sinBody = await seenRaw(m.token);
    const conObjetoVacio = await app.inject({
      method: "POST",
      url: SEEN_URL,
      headers: auth(m.token),
      payload: {},
    });

    expect(sinBody.statusCode).toBe(200);
    expect(conObjetoVacio.statusCode).toBe(200);
    expect(antes).toHaveLength(0);
  });

  it("un alumno del gimnasio 2 no toca las respuestas del gimnasio 1", async () => {
    const a = await activeMember();
    const respondida = await insertConquerCorrection(app, a.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: new Date(),
    });
    const socio = await activateGym2Socio();

    const res = await seenRaw(socio.token);

    expect(res.statusCode).toBe(200);
    expect((await readCorrection(respondida)).replySeenAt).toBeNull();
  });
});

// ── (10) Alumno sin Conquer activo y sin token ──────────────────────

describe("alumno sin Conquer activo", () => {
  async function sinConquer() {
    return createTestMember(app);
  }
  async function enPedido() {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id, { status: "pedido" });
    return socio;
  }

  it.each([
    ["sin fila de Conquer", sinConquer],
    ["con el pedido sin aprobar", enPedido],
  ])("%s: 409 CONQUER_NO_ACTIVO en las 2 rutas", async (_nombre, crear) => {
    mockVideoStore();
    const socio = await crear();

    const video = await videoUrlRaw(socio.token, 1, "alumno");
    const seen = await seenRaw(socio.token);

    for (const res of [video, seen]) {
      expect(res.statusCode).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    }
  });

  it("el 409 gana al 400 de who: un no activo con who invalido recibe 409", async () => {
    const socio = await createTestMember(app);

    const res = await videoUrlRaw(socio.token, 1, "otro");

    expect(res.statusCode).toBe(409);
  });
});

describe("sin token", () => {
  it.each([
    ["GET", `${CONQUER_CORRECTIONS_URL}/1/video-url?who=alumno`],
    ["POST", SEEN_URL],
  ] as const)("%s %s: 401", async (method, url) => {
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(401);
  });
});
