/**
 * Fase 202 Plan 06 (D-26, D-27, D-29, D-08, DA-38, DA-39, DA-40, DA-43, DA-46):
 * el coach responde una corrección.
 *
 *   - POST /api/admin/conquer/corrections/:id/reply-upload-url  { contentType }
 *   - POST /api/admin/conquer/corrections/:id/reply             { text?, key?, durationSec? }
 *
 * Integracion contra el MySQL de tests. Usuarios SIEMPRE con fabricas. El
 * storage se mockea con `mockVideoStore` (nada depende de R2 real). Las
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
import {
  isCorrectionReplyKey,
  PRIVATE_PUT_EXPIRES_SEC,
} from "../../src/modules/conquer/private-media";
import { CORRECTION_VIDEO_MAX_BYTES } from "../../src/modules/conquer/video-rules";
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
  CONQUER_CORRECTIONS_URL,
  CONQUER_STATE_URL,
  createActiveConquerMember,
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

interface UploadBody {
  uploadUrl: string;
  key: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
}

interface VideoUrlBody {
  available: boolean;
  url: string | null;
  expiresIn: number | null;
}

interface StateBody {
  member: {
    corrections: { pending: number; unseenReplies: number };
  } | null;
}

interface MemberListBody {
  items: {
    id: number;
    status: "pendiente" | "respondida";
    replyUnseen: boolean;
    reply: { text: string | null; hasVideo: boolean } | null;
  }[];
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function replyUploadRaw(
  token: string,
  id: number | string,
  body: unknown,
) {
  return app.inject({
    method: "POST",
    url: `${ADMIN_URL}/${id}/reply-upload-url`,
    headers: auth(token),
    payload: body as Record<string, unknown>,
  });
}

async function replyRaw(token: string, id: number | string, body: unknown) {
  return app.inject({
    method: "POST",
    url: `${ADMIN_URL}/${id}/reply`,
    headers: auth(token),
    payload: body as Record<string, unknown>,
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

/** La corrección sigue como estaba: pendiente y sin ningún dato de respuesta. */
async function expectSinResponder(id: number): Promise<void> {
  const fila = await readCorrection(id);
  expect(fila.status).toBe("pendiente");
  expect(fila.replyText).toBeNull();
  expect(fila.replyVideoKey).toBeNull();
  expect(fila.replyVideoSeconds).toBeNull();
  expect(fila.repliedBy).toBeNull();
  expect(fila.repliedAt).toBeNull();
}

async function countPendientes(token: string): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: COUNT_URL,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ count: number }>().count;
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

/** Clave del video del coach para ESA corrección (la forma que firma el API). */
function replyKey(
  userId: number,
  correctionId: number,
  ext: "mp4" | "mov" = "mp4",
): string {
  return `private/conquer-corrections/${TEMPLO_CTX.tenantId}/${userId}/coach-${correctionId}-${randomUUID()}.${ext}`;
}

function alumnoKey(userId: number): string {
  return `private/conquer-corrections/${TEMPLO_CTX.tenantId}/${userId}/alumno-${randomUUID()}.mp4`;
}

/** Alumno activo de Conquer con UNA corrección pendiente (clave propia del alumno). */
async function pendiente(overrides: { replySeenAt?: Date } = {}) {
  const alumno = await createActiveConquerMember(app, {
    level: "toro",
    daysCount: 4,
  });
  const videoKey = alumnoKey(alumno.userId);
  const id = await insertConquerCorrection(app, alumno.userId, {
    videoKey,
    ...overrides,
  });
  return { alumno, id, videoKey };
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

// ── (1) POST /corrections/:id/reply-upload-url ──────────────────────

describe("POST /api/admin/conquer/corrections/:id/reply-upload-url", () => {
  it.each([
    ["video/mp4", ".mp4"],
    ["video/quicktime", ".mov"],
  ])(
    "%s: 200 con una clave atada al gimnasio, al alumno y a la corrección",
    async (contentType, ext) => {
      const coach = await createConquerStaff(app, "admin");
      const { alumno, id } = await pendiente();
      const store = mockVideoStore();

      const res = await replyUploadRaw(coach.token, id, { contentType });

      expect(res.statusCode).toBe(200);
      const body = res.json<UploadBody>();
      expect(isCorrectionReplyKey(body.key, 1, alumno.userId, id)).toBe(true);
      expect(body.key.endsWith(ext)).toBe(true);
      expect(body.uploadUrl).toBe(`https://r2.test/put/${body.key}`);
      expect(body.contentType).toBe(contentType);
      expect(body.expiresIn).toBe(PRIVATE_PUT_EXPIRES_SEC);
      expect(body.maxBytes).toBe(CORRECTION_VIDEO_MAX_BYTES);
      expect(store.presignPut).toHaveBeenCalledWith(
        body.key,
        contentType,
        PRIVATE_PUT_EXPIRES_SEC,
      );
      // La clave es de la corrección A: no sirve para la B.
      expect(isCorrectionReplyKey(body.key, 1, alumno.userId, id + 1)).toBe(
        false,
      );
      await expectSinResponder(id);
    },
  );

  it("dos pedidos dan dos claves distintas", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();
    mockVideoStore();

    const a = await replyUploadRaw(coach.token, id, {
      contentType: "video/mp4",
    });
    const b = await replyUploadRaw(coach.token, id, {
      contentType: "video/mp4",
    });

    expect(a.json<UploadBody>().key).not.toBe(b.json<UploadBody>().key);
  });

  it.each(["video/webm", "image/jpeg", "", "constructor"])(
    "el tipo %j es 400 CONQUER_VIDEO_TIPO_INVALIDO y no firma nada",
    async (contentType) => {
      const coach = await createConquerStaff(app, "admin");
      const { id } = await pendiente();
      const store = mockVideoStore();

      const res = await replyUploadRaw(coach.token, id, { contentType });

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_VIDEO_TIPO_INVALIDO",
      );
      expect(store.presignPut).not.toHaveBeenCalled();
    },
  );

  it("sin contentType: 400", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();
    mockVideoStore();

    const res = await replyUploadRaw(coach.token, id, {});

    expect(res.statusCode).toBe(400);
  });

  it("una corrección ya respondida es 409 CONQUER_CORRECCION_RESPONDIDA, antes del tipo", async () => {
    const coach = await createConquerStaff(app, "admin");
    const alumno = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const id = await insertConquerCorrection(app, alumno.userId, {
      status: "respondida",
      replyText: "Bien",
      repliedAt: new Date(),
    });
    const store = mockVideoStore();

    const res = await replyUploadRaw(coach.token, id, {
      contentType: "video/webm",
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>()).toEqual({
      error: "Esta corrección ya tiene respuesta",
      code: "CONQUER_CORRECCION_RESPONDIDA",
    });
    expect(store.presignPut).not.toHaveBeenCalled();
  });

  it("una corrección inexistente es 404", async () => {
    const coach = await createConquerStaff(app, "admin");
    mockVideoStore();

    const res = await replyUploadRaw(coach.token, 999999999, {
      contentType: "video/mp4",
    });

    expect(res.statusCode).toBe(404);
  });

  it("sin bucket privado: 503 CONQUER_VIDEOS_NO_DISPONIBLES, antes del tipo", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();

    const res = await replyUploadRaw(coach.token, id, {
      contentType: "video/webm",
    });

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
  });

  it("si el storage falla al firmar: 503 genérico, sin filtrar el error del SDK", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();
    mockVideoStore({
      presignPut: async () => {
        throw new Error("bucket secreto");
      },
    });

    const res = await replyUploadRaw(coach.token, id, {
      contentType: "video/mp4",
    });

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("bucket secreto");
  });
});

// ── (2) POST /corrections/:id/reply: las 3 formas ───────────────────

describe("POST /api/admin/conquer/corrections/:id/reply: solo texto", () => {
  it("200: recorta el texto, pasa a respondida y deja el rastro del coach", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id, videoKey } = await pendiente();
    const otra = await insertConquerCorrection(app, alumno.userId, {
      comboKey: "push",
    });
    expect(await countPendientes(coach.token)).toBe(2);

    const res = await replyRaw(coach.token, id, {
      text: "   Abrí más el codo y bajá despacio.  ",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<AdminCorrectionBody>();
    expect(body).toMatchObject({
      id,
      status: "respondida",
      canReply: false,
      userId: alumno.userId,
      repliedByName: "Staff",
      reply: {
        text: "Abrí más el codo y bajá despacio.",
        hasVideo: false,
        videoSeconds: null,
      },
    });
    expect(body.reply?.repliedAt).toEqual(expect.any(String));
    // Ni claves de storage ni URLs en la vista del coach.
    expect(res.body).not.toContain("private/conquer-corrections");

    const fila = await readCorrection(id);
    expect(fila.status).toBe("respondida");
    expect(fila.replyText).toBe("Abrí más el codo y bajá despacio.");
    expect(fila.replyVideoKey).toBeNull();
    expect(fila.replyVideoSeconds).toBeNull();
    expect(fila.repliedBy).toBe(coach.id);
    expect(fila.repliedAt).not.toBeNull();
    expect(fila.replySeenAt).toBeNull();
    // Responder NO toca el video del alumno (D-28: se borra aparte).
    expect(fila.videoKey).toBe(videoKey);
    expect(fila.videoDeletedAt).toBeNull();
    // La otra sigue pendiente.
    expect((await readCorrection(otra)).status).toBe("pendiente");
    // Sale de pendientes: baja el contador del menú (DA-46).
    expect(await countPendientes(coach.token)).toBe(1);
  });

  it("el alumno la ve como respuesta nueva: unseenReplies y replyUnseen", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente();
    await insertConquerCorrection(app, alumno.userId, { comboKey: "pull" });

    const antes = await fetchState(alumno.token);
    expect(antes.member?.corrections).toEqual({
      pending: 2,
      unseenReplies: 0,
    });

    expect(
      (await replyRaw(coach.token, id, { text: "Muy bien" })).statusCode,
    ).toBe(200);

    const despues = await fetchState(alumno.token);
    expect(despues.member?.corrections).toEqual({
      pending: 1,
      unseenReplies: 1,
    });
    const lista = await app.inject({
      method: "GET",
      url: CONQUER_CORRECTIONS_URL,
      headers: auth(alumno.token),
    });
    const item = lista.json<MemberListBody>().items.find((i) => i.id === id);
    expect(item).toMatchObject({
      status: "respondida",
      replyUnseen: true,
      reply: { text: "Muy bien", hasVideo: false },
    });
  });

  it("responder deja la respuesta como NO vista aunque la fila trajera un reply_seen_at", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente({ replySeenAt: new Date() });

    const res = await replyRaw(coach.token, id, { text: "Muy bien" });

    expect(res.statusCode).toBe(200);
    expect((await readCorrection(id)).replySeenAt).toBeNull();
    expect(
      (await fetchState(alumno.token)).member?.corrections.unseenReplies,
    ).toBe(1);
  });

  it("un texto de exactamente 1000 caracteres es válido", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();

    const res = await replyRaw(coach.token, id, { text: "a".repeat(1000) });

    expect(res.statusCode).toBe(200);
    expect((await readCorrection(id)).replyText).toHaveLength(1000);
  });

  it("sin bucket privado el texto solo se responde igual (no usa el storage)", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();

    const res = await replyRaw(coach.token, id, { text: "Bien" });

    expect(res.statusCode).toBe(200);
  });

  it("sin key, durationSec se ignora", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();

    const res = await replyRaw(coach.token, id, {
      text: "Bien",
      durationSec: 99,
    });

    expect(res.statusCode).toBe(200);
    const fila = await readCorrection(id);
    expect(fila.replyVideoKey).toBeNull();
    expect(fila.replyVideoSeconds).toBeNull();
  });
});

describe("POST /api/admin/conquer/corrections/:id/reply: con video", () => {
  it("solo video: guarda clave y duración, y el alumno lo puede mirar", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente();
    const key = replyKey(alumno.userId, id);
    const store = mockVideoStore();

    const res = await replyRaw(coach.token, id, { key, durationSec: 18 });

    expect(res.statusCode).toBe(200);
    expect(res.json<AdminCorrectionBody>()).toMatchObject({
      status: "respondida",
      canReply: false,
      reply: { text: null, hasVideo: true, videoSeconds: 18 },
    });
    expect(res.body).not.toContain(key);
    expect(store.head).toHaveBeenCalledWith(key);
    const fila = await readCorrection(id);
    expect(fila.replyVideoKey).toBe(key);
    expect(fila.replyVideoSeconds).toBe(18);
    expect(fila.replyText).toBeNull();
    expect(fila.repliedBy).toBe(coach.id);

    const url = await app.inject({
      method: "GET",
      url: `${CONQUER_CORRECTIONS_URL}/${id}/video-url?who=coach`,
      headers: auth(alumno.token),
    });
    expect(url.statusCode).toBe(200);
    expect(url.json<VideoUrlBody>()).toMatchObject({
      available: true,
      url: `https://r2.test/get/${key}`,
    });
  });

  it("texto + video: los dos quedan guardados", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente();
    const key = replyKey(alumno.userId, id, "mov");
    mockVideoStore({
      head: async () => ({
        contentLength: 8 * 1024 * 1024,
        contentType: "video/quicktime",
      }),
    });

    const res = await replyRaw(coach.token, id, {
      text: " Mirá el video ",
      key,
      durationSec: 30,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<AdminCorrectionBody>().reply).toMatchObject({
      text: "Mirá el video",
      hasVideo: true,
      videoSeconds: 30,
    });
    const fila = await readCorrection(id);
    expect(fila.replyText).toBe("Mirá el video");
    expect(fila.replyVideoKey).toBe(key);
    expect(fila.replyVideoSeconds).toBe(30);
  });

  it("responder no cambia el video del alumno ni lo borra del storage", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id, videoKey } = await pendiente();
    const store = mockVideoStore();

    const res = await replyRaw(coach.token, id, {
      key: replyKey(alumno.userId, id),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(200);
    const fila = await readCorrection(id);
    expect(fila.videoKey).toBe(videoKey);
    expect(fila.videoDeletedAt).toBeNull();
    expect(fila.videoDeletedBy).toBeNull();
    expect(res.json<AdminCorrectionBody>().videoDeleted).toBe(false);
    expect(store.remove).not.toHaveBeenCalled();
  });
});

// ── (3) validación del cuerpo ───────────────────────────────────────

describe("POST /api/admin/conquer/corrections/:id/reply: validación", () => {
  interface Caso {
    nombre: string;
    body: (alumnoId: number, id: number, otraId: number) => unknown;
    code: string;
  }

  const CASOS: Caso[] = [
    {
      nombre: "cuerpo vacío",
      body: () => ({}),
      code: "CONQUER_RESPUESTA_VACIA",
    },
    {
      nombre: "texto en blanco",
      body: () => ({ text: "   " }),
      code: "CONQUER_RESPUESTA_VACIA",
    },
    {
      nombre: "texto null y key null",
      body: () => ({ text: null, key: null }),
      code: "CONQUER_RESPUESTA_VACIA",
    },
    {
      nombre: "texto de 1001 caracteres",
      body: () => ({ text: "a".repeat(1001) }),
      code: "CONQUER_RESPUESTA_LARGA",
    },
    {
      nombre: "texto largo con video válido",
      body: (u, id) => ({
        text: "a".repeat(1001),
        key: replyKey(u, id),
        durationSec: 10,
      }),
      code: "CONQUER_RESPUESTA_LARGA",
    },
    {
      nombre: "video con durationSec 31",
      body: (u, id) => ({ key: replyKey(u, id), durationSec: 31 }),
      code: "CONQUER_VIDEO_DURACION",
    },
    {
      nombre: "video sin durationSec",
      body: (u, id) => ({ key: replyKey(u, id) }),
      code: "CONQUER_VIDEO_DURACION",
    },
    {
      nombre: "video con durationSec 0",
      body: (u, id) => ({ key: replyKey(u, id), durationSec: 0 }),
      code: "CONQUER_VIDEO_DURACION",
    },
    {
      nombre: "video con durationSec decimal",
      body: (u, id) => ({ key: replyKey(u, id), durationSec: 12.5 }),
      code: "CONQUER_VIDEO_DURACION",
    },
    {
      nombre: "texto válido + video sin duración",
      body: (u, id) => ({ text: "Bien", key: replyKey(u, id) }),
      code: "CONQUER_VIDEO_DURACION",
    },
    {
      nombre: "clave de OTRA corrección del mismo alumno",
      body: (u, _id, otraId) => ({ key: replyKey(u, otraId), durationSec: 10 }),
      code: "CONQUER_VIDEO_CLAVE_INVALIDA",
    },
    {
      nombre: "clave del ALUMNO (video propio del alumno)",
      body: (u) => ({ key: alumnoKey(u), durationSec: 10 }),
      code: "CONQUER_VIDEO_CLAVE_INVALIDA",
    },
    {
      nombre: "clave de coach de OTRO alumno",
      body: (u, id) => ({ key: replyKey(u + 1000000, id), durationSec: 10 }),
      code: "CONQUER_VIDEO_CLAVE_INVALIDA",
    },
    {
      nombre: "clave de otro gimnasio",
      body: (u, id) => ({
        key: replyKey(u, id).replace(
          "conquer-corrections/1/",
          "conquer-corrections/2/",
        ),
        durationSec: 10,
      }),
      code: "CONQUER_VIDEO_CLAVE_INVALIDA",
    },
    {
      nombre: "clave con ..",
      body: (u, id) => ({
        key: `${replyKey(u, id)}/../../x.mp4`,
        durationSec: 10,
      }),
      code: "CONQUER_VIDEO_CLAVE_INVALIDA",
    },
    {
      nombre: "texto válido + clave inválida",
      body: (u) => ({ text: "Bien", key: alumnoKey(u), durationSec: 10 }),
      code: "CONQUER_VIDEO_CLAVE_INVALIDA",
    },
  ];

  it.each(CASOS)("$nombre: 400 $code y no toca nada", async (caso) => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente();
    const otraId = await insertConquerCorrection(app, alumno.userId, {
      comboKey: "push",
    });
    const store = mockVideoStore();

    const res = await replyRaw(
      coach.token,
      id,
      caso.body(alumno.userId, id, otraId),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(caso.code);
    await expectSinResponder(id);
    // La validación corta antes de tocar el storage.
    expect(store.head).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("un texto que no es string es 400 de esquema", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();

    // Un objeto: Fastify coerce números y booleanos a string (`123` llega
    // como "123" y pasa), pero un objeto no se puede convertir.
    const res = await replyRaw(coach.token, id, { text: { a: 1 } });

    expect(res.statusCode).toBe(400);
    await expectSinResponder(id);
  });

  it("un id que no es número es 400", async () => {
    const coach = await createConquerStaff(app, "admin");

    const res = await replyRaw(coach.token, "abc", { text: "Bien" });

    expect(res.statusCode).toBe(400);
  });

  it("una corrección inexistente es 404, antes de validar el cuerpo", async () => {
    const coach = await createConquerStaff(app, "admin");

    const res = await replyRaw(coach.token, 999999999, {});

    expect(res.statusCode).toBe(404);
  });

  it("una corrección ya respondida es 409, antes de validar el cuerpo, y no cambia", async () => {
    const coach = await createConquerStaff(app, "admin");
    const alumno = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const id = await insertConquerCorrection(app, alumno.userId, {
      status: "respondida",
      replyText: "La primera",
      repliedBy: coach.id,
      repliedAt: new Date(),
    });

    const vacio = await replyRaw(coach.token, id, {});
    const conTexto = await replyRaw(coach.token, id, { text: "Otra" });

    for (const res of [vacio, conTexto]) {
      expect(res.statusCode).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_CORRECCION_RESPONDIDA",
      );
    }
    expect((await readCorrection(id)).replyText).toBe("La primera");
  });
});

// ── (4) storage: 503, HEAD ──────────────────────────────────────────

describe("POST /api/admin/conquer/corrections/:id/reply: storage", () => {
  it("sin bucket privado y con video: 503 y sigue pendiente", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente();

    const res = await replyRaw(coach.token, id, {
      key: replyKey(alumno.userId, id),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
    await expectSinResponder(id);
  });

  it("el video no llegó al bucket (HEAD null): 409 CONQUER_VIDEO_NO_SUBIDO y sigue pendiente", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente();
    const store = mockVideoStore({ head: async () => null });

    const res = await replyRaw(coach.token, id, {
      text: "Bien",
      key: replyKey(alumno.userId, id),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_VIDEO_NO_SUBIDO");
    expect(store.remove).not.toHaveBeenCalled();
    await expectSinResponder(id);
  });

  it.each([
    [
      "más de 100 MB",
      { contentLength: 100 * 1024 * 1024 + 1, contentType: "video/mp4" },
    ],
    [
      "tipo video/webm",
      { contentLength: 5 * 1024 * 1024, contentType: "video/webm" },
    ],
    ["vacío", { contentLength: 0, contentType: "video/mp4" }],
  ])(
    "HEAD %s: 400 CONQUER_VIDEO_INVALIDO, se borra el objeto y sigue pendiente",
    async (_nombre, head) => {
      const coach = await createConquerStaff(app, "admin");
      const { alumno, id } = await pendiente();
      const key = replyKey(alumno.userId, id);
      const store = mockVideoStore({ head: async () => head });

      const res = await replyRaw(coach.token, id, {
        text: "Bien",
        key,
        durationSec: 10,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_VIDEO_INVALIDO");
      expect(store.remove).toHaveBeenCalledWith(key);
      await expectSinResponder(id);
    },
  );

  it("exactamente 100 MB es válido", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente();
    const store = mockVideoStore({
      head: async () => ({
        contentLength: CORRECTION_VIDEO_MAX_BYTES,
        contentType: "video/mp4",
      }),
    });

    const res = await replyRaw(coach.token, id, {
      key: replyKey(alumno.userId, id),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(200);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("si el HEAD falla: 503 genérico, sin filtrar el error del SDK, y sigue pendiente", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { alumno, id } = await pendiente();
    mockVideoStore({
      head: async () => {
        throw new Error("bucket secreto");
      },
    });

    const res = await replyRaw(coach.token, id, {
      key: replyKey(alumno.userId, id),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("bucket secreto");
    await expectSinResponder(id);
  });
});

// ── (5) concurrencia ────────────────────────────────────────────────

describe("POST /api/admin/conquer/corrections/:id/reply: concurrencia (T-201-137)", () => {
  it("dos coaches a la vez: uno gana (200), el otro recibe 409 y queda la respuesta del que ganó", async () => {
    const coachA = await createConquerStaff(app, "admin");
    const coachB = await createConquerStaff(app, "owner");
    const { alumno, id } = await pendiente();
    const keyA = replyKey(alumno.userId, id);
    const keyB = replyKey(alumno.userId, id);
    // Barrera en el HEAD: las dos peticiones ya pasaron el chequeo de "pendiente"
    // del principio antes de que cualquiera escriba. Lo único que las separa es
    // el FOR UPDATE de la tx (la carrera es determinista, no depende del timing).
    let llegaron = 0;
    let soltar = () => {};
    const barrera = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    const store = mockVideoStore({
      head: async () => {
        llegaron += 1;
        if (llegaron === 2) soltar();
        await barrera;
        return { contentLength: 5 * 1024 * 1024, contentType: "video/mp4" };
      },
    });

    const [a, b] = await Promise.all([
      replyRaw(coachA.token, id, {
        text: "Respuesta de A",
        key: keyA,
        durationSec: 10,
      }),
      replyRaw(coachB.token, id, {
        text: "Respuesta de B",
        key: keyB,
        durationSec: 20,
      }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const [ganador, perdedor] = a.statusCode === 200 ? [a, b] : [b, a];
    expect(perdedor.json<ConquerErrorBody>().code).toBe(
      "CONQUER_CORRECCION_RESPONDIDA",
    );
    const esA = a.statusCode === 200;
    const fila = await readCorrection(id);
    expect(fila.status).toBe("respondida");
    expect(fila.replyText).toBe(esA ? "Respuesta de A" : "Respuesta de B");
    expect(fila.replyText).toBe(
      ganador.json<AdminCorrectionBody>().reply?.text,
    );
    expect(fila.replyVideoKey).toBe(esA ? keyA : keyB);
    expect(fila.replyVideoSeconds).toBe(esA ? 10 : 20);
    expect(fila.repliedBy).toBe(esA ? coachA.id : coachB.id);
    // El que perdió no borra: su clave pudo ser la misma que la del ganador.
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("responder dos veces seguidas: la segunda es 409 y la primera no cambia", async () => {
    const coach = await createConquerStaff(app, "admin");
    const { id } = await pendiente();

    const primera = await replyRaw(coach.token, id, { text: "Primera" });
    const segunda = await replyRaw(coach.token, id, { text: "Segunda" });

    expect(primera.statusCode).toBe(200);
    expect(segunda.statusCode).toBe(409);
    expect((await readCorrection(id)).replyText).toBe("Primera");
  });
});

// ── (6) permisos y aislamiento ──────────────────────────────────────

describe("permisos de la respuesta (D-08, T-201-139)", () => {
  const RUTAS = [
    { nombre: "reply-upload-url", path: "reply-upload-url" },
    { nombre: "reply", path: "reply" },
  ] as const;

  describe.each([
    "coach",
    "gestion",
    "recepcion",
    "admin_sede",
    "coach_actividad",
  ])("el rol %s", (role) => {
    it.each(RUTAS)(
      "recibe 403 en $nombre (aun con cuerpo inválido) y no toca nada",
      async (ruta) => {
        const staff = await createConquerStaff(app, role);
        const { alumno, id } = await pendiente();
        const store = mockVideoStore();

        const res = await app.inject({
          method: "POST",
          url: `${ADMIN_URL}/${id}/${ruta.path}`,
          headers: auth(staff.token),
          payload: ruta.path === "reply" ? {} : { contentType: 1 },
        });
        const valida = await app.inject({
          method: "POST",
          url: `${ADMIN_URL}/${id}/${ruta.path}`,
          headers: auth(staff.token),
          payload:
            ruta.path === "reply"
              ? {
                  text: "Bien",
                  key: replyKey(alumno.userId, id),
                  durationSec: 5,
                }
              : { contentType: "video/mp4" },
        });

        expect(res.statusCode).toBe(403);
        expect(valida.statusCode).toBe(403);
        expect(store.presignPut).not.toHaveBeenCalled();
        expect(store.head).not.toHaveBeenCalled();
        await expectSinResponder(id);
      },
    );
  });

  it.each(RUTAS)("un socio comun recibe 403 en $nombre", async (ruta) => {
    const member = await createTestMember(app);
    const { id } = await pendiente();

    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/${id}/${ruta.path}`,
      headers: auth(member.token),
      payload:
        ruta.path === "reply" ? { text: "Bien" } : { contentType: "video/mp4" },
    });

    expect(res.statusCode).toBe(403);
    await expectSinResponder(id);
  });

  it.each(RUTAS)("sin token: 401 en $nombre", async (ruta) => {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/1/${ruta.path}`,
      payload: {},
    });

    expect(res.statusCode).toBe(401);
  });

  it.each(["owner", "admin"])("el rol %s puede responder", async (role) => {
    const staff = await createConquerStaff(app, role);
    const { id } = await pendiente();

    const res = await replyRaw(staff.token, id, { text: "Bien" });

    expect(res.statusCode).toBe(200);
    expect((await readCorrection(id)).repliedBy).toBe(staff.id);
  });
});

describe("aislamiento entre gimnasios en la respuesta (T-201-136)", () => {
  it("el admin del gimnasio 2 recibe 404 en las 2 rutas y la corrección del 1 sigue pendiente", async () => {
    const { alumno, id } = await pendiente();
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const store = mockVideoStore();

    const subida = await replyUploadRaw(gym2.adminToken, id, {
      contentType: "video/mp4",
    });
    const texto = await replyRaw(gym2.adminToken, id, { text: "Intruso" });
    const video = await replyRaw(gym2.adminToken, id, {
      key: replyKey(alumno.userId, id),
      durationSec: 10,
    });

    expect(subida.statusCode).toBe(404);
    expect(texto.statusCode).toBe(404);
    expect(video.statusCode).toBe(404);
    expect(store.presignPut).not.toHaveBeenCalled();
    expect(store.head).not.toHaveBeenCalled();
    await expectSinResponder(id);
  });

  it("el gimnasio 2 sin el módulo templo-training también recibe 404", async () => {
    const { id } = await pendiente();
    mockVideoStore();

    const subida = await replyUploadRaw(gym2.adminToken, id, {
      contentType: "video/mp4",
    });
    const texto = await replyRaw(gym2.adminToken, id, { text: "Intruso" });

    expect(subida.statusCode).toBe(404);
    expect(texto.statusCode).toBe(404);
    await expectSinResponder(id);
  });
});
