/**
 * Fase 201 Plan 12 (§6, D-15, S12-8, T-201-39..44): control fisico del alumno.
 *
 *   - POST /api/members/conquer/body-checks
 *   - GET  /api/members/conquer/body-checks
 *   - POST /api/members/conquer/body-checks/skip-day0
 *   - POST /api/members/conquer/body-checks/:checkId/photos/:pose/upload-url
 *   - POST /api/members/conquer/body-checks/:checkId/photos/:pose/confirm
 *   - GET  /api/members/conquer/body-checks/:checkId/photos/:pose/url
 *   - GET  /api/members/conquer/state  (member.bodyCheck)
 *
 * Integracion contra el MySQL de tests. Usuarios SIEMPRE con fabricas. El
 * storage se mockea con `mockPrivateMedia` (no depende de R2 real). El historial
 * de dias pasados se inserta DIRECTO con `insertBodyCheckRow`.
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
  isOwnPhotoKey,
  PHOTO_MAX_BYTES,
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
  insertBodyCheckRow,
  insertConquerMember,
  mockPrivateMedia,
  TEMPLO_CTX,
  type ConquerErrorBody,
} from "./_helpers";

const CHECKS_URL = "/api/members/conquer/body-checks";
const SKIP_URL = `${CHECKS_URL}/skip-day0`;
const STATE_URL = "/api/members/conquer/state";

interface CheckBody {
  id: number;
  checkDate: string;
  kind: "dia0" | "periodico";
  photos: { frente: boolean; perfil: boolean; espalda: boolean };
  armCm: number | null;
  chestCm: number | null;
  shouldersCm: number | null;
  waistCm: number | null;
  weightKg: number | null;
}

interface SummaryBody {
  hasDay0: boolean;
  day0Skipped: boolean;
  mustPromptDay0: boolean;
  day0Pending: boolean;
  lastCheckDate: string | null;
  nextDueDate: string | null;
  due: boolean;
  overdue: boolean;
}

interface ListBody {
  checks: CheckBody[];
  compare: {
    from: { id: number; checkDate: string };
    to: { id: number; checkDate: string };
    weeks: number;
    measures: {
      key: string;
      label: string;
      from: number | null;
      to: number | null;
      diff: number | null;
    }[];
  } | null;
  due: { nextDueDate: string | null; due: boolean; overdue: boolean };
}

interface UploadBody {
  uploadUrl: string;
  key: string;
  contentType: string;
  expiresIn: number;
}

interface StateBody {
  member: { bodyCheck: SummaryBody } | null;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function postCheck(token: string, payload: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: CHECKS_URL,
    headers: auth(token),
    payload,
  });
}

async function createCheck(
  token: string,
  payload: Record<string, unknown> = {},
): Promise<CheckBody> {
  const res = await postCheck(token, payload);
  expect(res.statusCode).toBe(200);
  return res.json<CheckBody>();
}

async function listRaw(token: string) {
  return app.inject({ method: "GET", url: CHECKS_URL, headers: auth(token) });
}

async function fetchList(token: string): Promise<ListBody> {
  const res = await listRaw(token);
  expect(res.statusCode).toBe(200);
  return res.json<ListBody>();
}

function photoUrl(checkId: number, pose: string, action: string): string {
  return `${CHECKS_URL}/${checkId}/photos/${pose}/${action}`;
}

async function uploadRaw(
  token: string,
  checkId: number,
  pose: string,
  contentType: string,
) {
  return app.inject({
    method: "POST",
    url: photoUrl(checkId, pose, "upload-url"),
    headers: auth(token),
    payload: { contentType },
  });
}

async function confirmRaw(
  token: string,
  checkId: number,
  pose: string,
  key: string,
) {
  return app.inject({
    method: "POST",
    url: photoUrl(checkId, pose, "confirm"),
    headers: auth(token),
    payload: { key },
  });
}

async function viewRaw(token: string, checkId: number, pose: string) {
  return app.inject({
    method: "GET",
    url: photoUrl(checkId, pose, "url"),
    headers: auth(token),
  });
}

async function skipRaw(token: string) {
  return app.inject({
    method: "POST",
    url: SKIP_URL,
    headers: auth(token),
    payload: {},
  });
}

async function stateOf(token: string): Promise<SummaryBody> {
  const res = await app.inject({
    method: "GET",
    url: STATE_URL,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  const body = res.json<StateBody>();
  if (!body.member) throw new Error("el alumno deberia estar activo");
  return body.member.bodyCheck;
}

/** "Hoy" del alumno en la zona de su sede (la misma que usa el servicio). */
async function todayOf(userId: number): Promise<string> {
  return todayInTz(await resolveMemberTimezone(app.db, TEMPLO_CTX, userId));
}

/** Alumno activo (Toro, 4 dias) para las pruebas del control. */
async function activeMember() {
  return createActiveConquerMember(app, { level: "toro", daysCount: 4 });
}

/** Fila directa del control, con las 3 claves de foto. */
async function readCheckRow(checkId: number) {
  const [row] = await app.db
    .select()
    .from(schema.conquerBodyChecks)
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, TEMPLO_CTX),
        eq(schema.conquerBodyChecks.id, checkId),
      ),
    );
  return row;
}

async function readMemberRow(userId: number) {
  const [row] = await app.db
    .select()
    .from(schema.conquerMembers)
    .where(
      and(
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
      ),
    );
  return row;
}

async function countChecks(userId: number): Promise<number> {
  const rows = await app.db
    .select({ id: schema.conquerBodyChecks.id })
    .from(schema.conquerBodyChecks)
    .where(
      and(
        tenantWhere(schema.conquerBodyChecks, TEMPLO_CTX),
        eq(schema.conquerBodyChecks.userId, userId),
      ),
    );
  return rows.length;
}

/** Pide la URL de subida (con el storage mockeado) y devuelve la clave. */
async function keyFor(
  token: string,
  checkId: number,
  pose: ConquerPose,
): Promise<string> {
  const res = await uploadRaw(token, checkId, pose, "image/jpeg");
  expect(res.statusCode).toBe(200);
  return res.json<UploadBody>().key;
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

// ── (1) Alta del control de hoy ─────────────────────────────────────

describe("POST /body-checks: kind y continuidad", () => {
  it("el primer control con contenido es el dia 0", async () => {
    const m = await activeMember();

    const check = await createCheck(m.token, { armCm: 31 });

    expect(check.kind).toBe("dia0");
    expect(check.checkDate).toBe(await todayOf(m.userId));
    expect(check.armCm).toBe(31);
    expect(check.photos).toEqual({
      frente: false,
      perfil: false,
      espalda: false,
    });
    expect(check.weightKg).toBeNull();
  });

  it("el segundo POST del mismo dia continua el mismo control y actualiza medidas", async () => {
    const m = await activeMember();
    const primero = await createCheck(m.token, { armCm: 31, waistCm: 80 });

    const segundo = await createCheck(m.token, { armCm: 32, weightKg: 70.5 });

    expect(segundo.id).toBe(primero.id);
    expect(segundo.armCm).toBe(32);
    expect(segundo.waistCm).toBe(80); // lo que no vino no se toca
    expect(segundo.weightKg).toBe(70.5);
    expect(await countChecks(m.userId)).toBe(1);
  });

  it("con un control anterior CON contenido el de hoy es periodico", async () => {
    const m = await activeMember();
    const hoy = await todayOf(m.userId);
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(hoy, -30),
      kind: "dia0",
    });

    const check = await createCheck(m.token, { armCm: 32 });

    expect(check.kind).toBe("periodico");
  });

  it("un control anterior VACIO no cuenta: el de hoy sigue siendo el dia 0", async () => {
    const m = await activeMember();
    const hoy = await todayOf(m.userId);
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(hoy, -30),
      kind: "periodico",
      empty: true,
    });

    const check = await createCheck(m.token, { armCm: 32 });

    expect(check.kind).toBe("dia0");
  });

  it("body vacio: crea la fila para poder subir fotos y es idempotente", async () => {
    const m = await activeMember();

    const a = await createCheck(m.token, {});
    const b = await createCheck(m.token, {});

    expect(b.id).toBe(a.id);
    expect(a.armCm).toBeNull();
    expect(await countChecks(m.userId)).toBe(1);
  });

  it("el control de hoy conserva su kind aunque despues aparezca contenido en otra fecha", async () => {
    const m = await activeMember();
    const hoy = await todayOf(m.userId);
    const vacio = await createCheck(m.token, {});
    expect(vacio.kind).toBe("dia0");
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(hoy, -30),
      kind: "dia0",
    });

    const check = await createCheck(m.token, { armCm: 33 });

    expect(check.id).toBe(vacio.id);
    expect(check.kind).toBe("dia0");
  });

  it("dos POST en paralelo dejan un solo control del dia", async () => {
    const m = await activeMember();

    const [a, b] = await Promise.all([
      postCheck(m.token, { armCm: 30 }),
      postCheck(m.token, { chestCm: 100 }),
    ]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(await countChecks(m.userId)).toBe(1);
  });

  it("guarda los extremos validos (10 y 300 cm, 20 y 400 kg)", async () => {
    const m = await activeMember();

    const res = await postCheck(m.token, {
      armCm: 10,
      chestCm: 300,
      weightKg: 400,
    });
    const res2 = await postCheck(m.token, { weightKg: 20 });

    expect(res.statusCode).toBe(200);
    expect(res2.json<CheckBody>().weightKg).toBe(20);
    expect(res2.json<CheckBody>().chestCm).toBe(300);
  });

  it("redondea a 1 decimal", async () => {
    const m = await activeMember();

    const check = await createCheck(m.token, { armCm: 31.26 });

    expect(check.armCm).toBe(31.3);
  });
});

// ── (2) Validacion ──────────────────────────────────────────────────

describe("POST /body-checks: validacion", () => {
  it.each([
    ["brazo 9", { armCm: 9 }],
    ["brazo 301", { armCm: 301 }],
    ["pecho 9", { chestCm: 9 }],
    ["hombros 301", { shouldersCm: 301 }],
    ["cintura 9", { waistCm: 9 }],
    ["peso 19", { weightKg: 19 }],
    ["peso 401", { weightKg: 401 }],
    ["brazo texto", { armCm: "abc" }],
  ])("%s: 400 y no crea nada", async (_nombre, payload) => {
    const m = await activeMember();

    const res = await postCheck(m.token, payload);

    expect(res.statusCode).toBe(400);
    expect(await countChecks(m.userId)).toBe(0);
  });
});

// ── (9) Alumno no activo y sin token ────────────────────────────────

describe("POST /body-checks: alumno no activo", () => {
  it("en pedido: 409 CONQUER_NO_ACTIVO", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id, { status: "pedido" });

    const res = await postCheck(socio.token, { armCm: 30 });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    expect(await countChecks(socio.id)).toBe(0);
  });

  it("bloqueado (sin fila): 409 CONQUER_NO_ACTIVO", async () => {
    const socio = await createTestMember(app);

    const res = await postCheck(socio.token, { armCm: 30 });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
  });

  it("skip-day0 de un alumno en pedido: 409 CONQUER_NO_ACTIVO", async () => {
    const socio = await createTestMember(app);
    await insertConquerMember(app, socio.id, { status: "pedido" });

    const res = await skipRaw(socio.token);

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
  });
});

describe("sin token", () => {
  it.each([
    ["POST", CHECKS_URL],
    ["GET", CHECKS_URL],
    ["POST", SKIP_URL],
    ["POST", `${CHECKS_URL}/1/photos/frente/upload-url`],
    ["POST", `${CHECKS_URL}/1/photos/frente/confirm`],
    ["GET", `${CHECKS_URL}/1/photos/frente/url`],
  ] as const)("%s %s: 401", async (method, url) => {
    const res = await app.inject({ method, url, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

// ── (3) upload-url ──────────────────────────────────────────────────

describe("POST .../photos/:pose/upload-url", () => {
  it("control propio: 200 con una clave que cumple isOwnPhotoKey", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const check = await createCheck(m.token);

    const res = await uploadRaw(m.token, check.id, "frente", "image/png");

    expect(res.statusCode).toBe(200);
    const body = res.json<UploadBody>();
    expect(isOwnPhotoKey(body.key, 1, m.userId, check.id, "frente")).toBe(true);
    expect(body.key.endsWith(".png")).toBe(true);
    expect(body.uploadUrl.startsWith("https://r2.test/")).toBe(true);
    expect(body.contentType).toBe("image/png");
    expect(body.expiresIn).toBe(600);
  });

  it("control de OTRO alumno: 404", async () => {
    mockPrivateMedia();
    const dueno = await activeMember();
    const otro = await activeMember();
    const ajeno = await createCheck(dueno.token);

    const res = await uploadRaw(otro.token, ajeno.id, "frente", "image/jpeg");

    expect(res.statusCode).toBe(404);
  });

  it("alumno del gimnasio 2 sobre un control del gimnasio 1: 404", async () => {
    mockPrivateMedia();
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const dueno = await activeMember();
    const ajeno = await createCheck(dueno.token);

    const res = await uploadRaw(
      gym2.socios[0].token,
      ajeno.id,
      "frente",
      "image/jpeg",
    );

    expect(res.statusCode).toBe(404);
  });

  it("sin bucket privado: 503 CONQUER_FOTOS_NO_DISPONIBLES (nunca el bucket publico)", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember();
    const check = await createCheck(m.token);

    const res = await uploadRaw(m.token, check.id, "frente", "image/jpeg");

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_FOTOS_NO_DISPONIBLES",
    );
  });

  it("sin bucket privado y control AJENO: sigue siendo 404 (la propiedad va antes que el storage)", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const dueno = await activeMember();
    const otro = await activeMember();
    const ajeno = await createCheck(dueno.token);

    const res = await uploadRaw(otro.token, ajeno.id, "frente", "image/jpeg");

    expect(res.statusCode).toBe(404);
  });

  it("control inexistente: 404", async () => {
    mockPrivateMedia();
    const m = await activeMember();

    const res = await uploadRaw(m.token, 99999999, "frente", "image/jpeg");

    expect(res.statusCode).toBe(404);
  });

  it.each(["image/gif", "text/plain", "application/pdf", ""])(
    "contentType %j: 400 CONQUER_FOTO_TIPO_INVALIDO",
    async (contentType) => {
      mockPrivateMedia();
      const m = await activeMember();
      const check = await createCheck(m.token);

      const res = await uploadRaw(m.token, check.id, "frente", contentType);

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_FOTO_TIPO_INVALIDO",
      );
    },
  );

  it("pose lateral: 400", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const check = await createCheck(m.token);

    const res = await uploadRaw(m.token, check.id, "lateral", "image/jpeg");

    expect(res.statusCode).toBe(400);
  });

  it("falla del storage: 503 generico, sin filtrar el mensaje del SDK", async () => {
    mockPrivateMedia({
      presignPut: async () => {
        throw new Error("SECRETO-bucket-xyz");
      },
    });
    const m = await activeMember();
    const check = await createCheck(m.token);

    const res = await uploadRaw(m.token, check.id, "frente", "image/jpeg");

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("SECRETO");
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_FOTOS_NO_DISPONIBLES",
    );
  });
});

// ── (4) confirm ─────────────────────────────────────────────────────

describe("POST .../photos/:pose/confirm", () => {
  it("OK: marca la foto, guarda la clave y NO la devuelve", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const check = await createCheck(m.token);
    const key = await keyFor(m.token, check.id, "frente");

    const res = await confirmRaw(m.token, check.id, "frente", key);

    expect(res.statusCode).toBe(200);
    const body = res.json<CheckBody>();
    expect(body.photos).toEqual({
      frente: true,
      perfil: false,
      espalda: false,
    });
    expect(res.body).not.toContain("private/conquer");
    expect((await readCheckRow(check.id)).photoFrontKey).toBe(key);
    // El listado tampoco filtra la clave.
    const lista = await listRaw(m.token);
    expect(lista.body).not.toContain("private/conquer");
  });

  it.each([
    ["frente", "photoFrontKey"],
    ["perfil", "photoSideKey"],
    ["espalda", "photoBackKey"],
  ] as const)("la pose %s se guarda en %s", async (pose, columna) => {
    mockPrivateMedia();
    const m = await activeMember();
    const check = await createCheck(m.token);
    const key = await keyFor(m.token, check.id, pose);

    const res = await confirmRaw(m.token, check.id, pose, key);

    expect(res.statusCode).toBe(200);
    expect((await readCheckRow(check.id))[columna]).toBe(key);
  });

  it("subir la foto de nuevo reemplaza la clave", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const check = await createCheck(m.token);
    const primera = await keyFor(m.token, check.id, "frente");
    await confirmRaw(m.token, check.id, "frente", primera);
    const segunda = await keyFor(m.token, check.id, "frente");

    const res = await confirmRaw(m.token, check.id, "frente", segunda);

    expect(res.statusCode).toBe(200);
    expect(segunda).not.toBe(primera);
    expect((await readCheckRow(check.id)).photoFrontKey).toBe(segunda);
  });

  it.each([
    [
      "clave de otro usuario",
      (u: number, c: number) =>
        privateCheckPhotoKey({
          tenantId: 1,
          userId: u + 1,
          checkId: c,
          pose: "frente",
          contentType: "image/jpeg",
        }),
    ],
    [
      "clave de otro control",
      (u: number, c: number) =>
        privateCheckPhotoKey({
          tenantId: 1,
          userId: u,
          checkId: c + 1,
          pose: "frente",
          contentType: "image/jpeg",
        }),
    ],
    [
      "clave de otra pose",
      (u: number, c: number) =>
        privateCheckPhotoKey({
          tenantId: 1,
          userId: u,
          checkId: c,
          pose: "perfil",
          contentType: "image/jpeg",
        }),
    ],
    [
      "clave de otro gimnasio",
      (u: number, c: number) =>
        privateCheckPhotoKey({
          tenantId: TENANT_DOS,
          userId: u,
          checkId: c,
          pose: "frente",
          contentType: "image/jpeg",
        }),
    ],
    [
      "clave con path traversal",
      (u: number, c: number) =>
        `private/conquer/1/${u}/${c}/../../2/1/1/frente-123e4567-e89b-42d3-a456-426614174000.jpg`,
    ],
    ["clave de un archivo publico", () => "videos/publico.jpg"],
  ])(
    "%s: 400 CONQUER_FOTO_CLAVE_INVALIDA y no consulta el storage",
    async (_n, build) => {
      const head = vi.fn(async () => ({
        contentLength: 1024,
        contentType: "image/jpeg",
      }));
      mockPrivateMedia({ head });
      const m = await activeMember();
      const check = await createCheck(m.token);

      const res = await confirmRaw(
        m.token,
        check.id,
        "frente",
        build(m.userId, check.id),
      );

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_FOTO_CLAVE_INVALIDA",
      );
      expect(head).not.toHaveBeenCalled();
      expect((await readCheckRow(check.id)).photoFrontKey).toBeNull();
    },
  );

  it("el objeto no esta en el storage (head null): 409 CONQUER_FOTO_NO_SUBIDA", async () => {
    mockPrivateMedia({ head: async () => null });
    const m = await activeMember();
    const check = await createCheck(m.token);
    const key = await keyFor(m.token, check.id, "frente");

    const res = await confirmRaw(m.token, check.id, "frente", key);

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_FOTO_NO_SUBIDA");
    expect((await readCheckRow(check.id)).photoFrontKey).toBeNull();
  });

  it.each([
    ["9 MB", 9 * 1024 * 1024, "image/jpeg", 400],
    ["un byte de mas", PHOTO_MAX_BYTES + 1, "image/png", 400],
    ["archivo vacio", 0, "image/jpeg", 400],
    ["text/plain", 1024, "text/plain", 400],
    ["image/gif", 1024, "image/gif", 400],
    ["justo el tope, webp", PHOTO_MAX_BYTES, "image/webp", 200],
  ])("head %s: %i", async (_n, contentLength, contentType, status) => {
    mockPrivateMedia({ head: async () => ({ contentLength, contentType }) });
    const m = await activeMember();
    const check = await createCheck(m.token);
    const key = await keyFor(m.token, check.id, "frente");

    const res = await confirmRaw(m.token, check.id, "frente", key);

    expect(res.statusCode).toBe(status);
    if (status === 400) {
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_FOTO_INVALIDA");
      expect((await readCheckRow(check.id)).photoFrontKey).toBeNull();
    }
  });

  it("control de OTRO alumno: 404 y no guarda nada", async () => {
    mockPrivateMedia();
    const dueno = await activeMember();
    const otro = await activeMember();
    const ajeno = await createCheck(dueno.token);
    const key = await keyFor(dueno.token, ajeno.id, "frente");

    const res = await confirmRaw(otro.token, ajeno.id, "frente", key);

    expect(res.statusCode).toBe(404);
    expect((await readCheckRow(ajeno.id)).photoFrontKey).toBeNull();
  });

  it("alumno del gimnasio 2 sobre un control del gimnasio 1: 404", async () => {
    mockPrivateMedia();
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const dueno = await activeMember();
    const ajeno = await createCheck(dueno.token);
    const key = await keyFor(dueno.token, ajeno.id, "frente");

    const res = await confirmRaw(gym2.socios[0].token, ajeno.id, "frente", key);

    expect(res.statusCode).toBe(404);
    expect((await readCheckRow(ajeno.id)).photoFrontKey).toBeNull();
  });

  it("sin bucket privado: 503 si el control es propio, 404 si es ajeno", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const dueno = await activeMember();
    const otro = await activeMember();
    const propio = await createCheck(dueno.token);
    const clave = privateCheckPhotoKey({
      tenantId: 1,
      userId: dueno.userId,
      checkId: propio.id,
      pose: "frente",
      contentType: "image/jpeg",
    });

    const propioRes = await confirmRaw(dueno.token, propio.id, "frente", clave);
    const ajenoRes = await confirmRaw(otro.token, propio.id, "frente", clave);

    expect(propioRes.statusCode).toBe(503);
    expect(propioRes.json<ConquerErrorBody>().code).toBe(
      "CONQUER_FOTOS_NO_DISPONIBLES",
    );
    expect(ajenoRes.statusCode).toBe(404);
  });

  it("falla del HEAD: 503 generico sin filtrar el mensaje", async () => {
    mockPrivateMedia({
      head: async () => {
        throw new Error("SECRETO-head-xyz");
      },
    });
    const m = await activeMember();
    const check = await createCheck(m.token);
    const key = await keyFor(m.token, check.id, "frente");

    const res = await confirmRaw(m.token, check.id, "frente", key);

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("SECRETO");
  });

  it("falta la clave en el body: 400", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const check = await createCheck(m.token);

    const res = await app.inject({
      method: "POST",
      url: photoUrl(check.id, "frente", "confirm"),
      headers: auth(m.token),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── (5) url de lectura ──────────────────────────────────────────────

describe("GET .../photos/:pose/url", () => {
  it("sin foto: 404", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const check = await createCheck(m.token);

    const res = await viewRaw(m.token, check.id, "frente");

    expect(res.statusCode).toBe(404);
  });

  it("con foto: la URL firmada de 300 s del storage", async () => {
    const presignGet = vi.fn(
      async (key: string, expiresSec: number) =>
        `https://r2.test/get/${expiresSec}/${key}`,
    );
    mockPrivateMedia({ presignGet });
    const m = await activeMember();
    const check = await createCheck(m.token);
    const key = await keyFor(m.token, check.id, "espalda");
    await confirmRaw(m.token, check.id, "espalda", key);

    const res = await viewRaw(m.token, check.id, "espalda");

    expect(res.statusCode).toBe(200);
    expect(res.json<{ url: string; expiresIn: number }>()).toEqual({
      url: `https://r2.test/get/300/${key}`,
      expiresIn: 300,
    });
    expect(presignGet).toHaveBeenCalledWith(key, 300);
  });

  it("la foto de otra pose no se ve: 404", async () => {
    mockPrivateMedia();
    const m = await activeMember();
    const check = await createCheck(m.token);
    const key = await keyFor(m.token, check.id, "frente");
    await confirmRaw(m.token, check.id, "frente", key);

    const res = await viewRaw(m.token, check.id, "perfil");

    expect(res.statusCode).toBe(404);
  });

  it("control de OTRO alumno: 404 aunque tenga foto", async () => {
    mockPrivateMedia();
    const dueno = await activeMember();
    const otro = await activeMember();
    const ajeno = await createCheck(dueno.token);
    const key = await keyFor(dueno.token, ajeno.id, "frente");
    await confirmRaw(dueno.token, ajeno.id, "frente", key);

    const res = await viewRaw(otro.token, ajeno.id, "frente");

    expect(res.statusCode).toBe(404);
  });

  it("alumno del gimnasio 2 sobre un control del gimnasio 1: 404", async () => {
    mockPrivateMedia();
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const dueno = await activeMember();
    const ajeno = await createCheck(dueno.token);
    const key = await keyFor(dueno.token, ajeno.id, "frente");
    await confirmRaw(dueno.token, ajeno.id, "frente", key);

    const res = await viewRaw(gym2.socios[0].token, ajeno.id, "frente");

    expect(res.statusCode).toBe(404);
  });

  it("sin bucket privado: 503 con control propio, 404 con control ajeno", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const dueno = await activeMember();
    const otro = await activeMember();
    const propio = await createCheck(dueno.token);

    const propioRes = await viewRaw(dueno.token, propio.id, "frente");
    const ajenoRes = await viewRaw(otro.token, propio.id, "frente");

    expect(propioRes.statusCode).toBe(503);
    expect(ajenoRes.statusCode).toBe(404);
  });
});

// ── (6) skip-day0 ───────────────────────────────────────────────────

describe("POST /body-checks/skip-day0 (D-15)", () => {
  it("el alumno recien activado debe ver el dia 0; al saltearlo queda pendiente", async () => {
    const m = await activeMember();
    expect(await stateOf(m.token)).toMatchObject({
      hasDay0: false,
      day0Skipped: false,
      mustPromptDay0: true,
      day0Pending: false,
    });

    const res = await skipRaw(m.token);

    expect(res.statusCode).toBe(200);
    expect(res.json<SummaryBody>()).toMatchObject({
      mustPromptDay0: false,
      day0Pending: true,
      day0Skipped: true,
    });
    expect(await stateOf(m.token)).toMatchObject({
      mustPromptDay0: false,
      day0Pending: true,
    });
    expect((await readMemberRow(m.userId)).day0SkippedAt).not.toBeNull();
  });

  it("saltearlo dos veces conserva la primera fecha", async () => {
    const m = await activeMember();
    await skipRaw(m.token);
    const primera = (await readMemberRow(m.userId)).day0SkippedAt;

    const res = await skipRaw(m.token);

    expect(res.statusCode).toBe(200);
    expect((await readMemberRow(m.userId)).day0SkippedAt).toEqual(primera);
  });

  it("con el dia 0 hecho (una medida): 409 CONQUER_DIA0_HECHO y no marca nada", async () => {
    const m = await activeMember();
    await createCheck(m.token, { armCm: 30 });

    const res = await skipRaw(m.token);

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_DIA0_HECHO");
    expect((await readMemberRow(m.userId)).day0SkippedAt).toBeNull();
  });

  it("un dia 0 VACIO se puede saltear: queda pendiente", async () => {
    const m = await activeMember();
    await createCheck(m.token, {});

    const res = await skipRaw(m.token);

    expect(res.statusCode).toBe(200);
    expect(await stateOf(m.token)).toMatchObject({
      hasDay0: false,
      mustPromptDay0: false,
      day0Pending: true,
    });
  });

  it("hacer el dia 0 despues de saltearlo limpia el pendiente", async () => {
    const m = await activeMember();
    await skipRaw(m.token);

    await createCheck(m.token, { waistCm: 80 });

    expect(await stateOf(m.token)).toMatchObject({
      hasDay0: true,
      day0Skipped: true,
      mustPromptDay0: false,
      day0Pending: false,
    });
  });

  it("un control vacio de hoy no cambia el kind del primero con contenido ni hasDay0", async () => {
    const m = await activeMember();
    const hoy = await todayOf(m.userId);
    const antes = addDays(hoy, -10);
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: antes,
      kind: "dia0",
    });

    const vacio = await createCheck(m.token, {});

    expect(vacio.kind).toBe("periodico");
    const lista = await fetchList(m.token);
    expect(lista.checks.find((c) => c.checkDate === antes)?.kind).toBe("dia0");
    expect(await stateOf(m.token)).toMatchObject({
      hasDay0: true,
      lastCheckDate: antes,
    });
  });
});

// ── (7) banderas del estado y vencimiento ───────────────────────────

describe("GET /state: member.bodyCheck", () => {
  it("alumno activo nuevo: pide el dia 0 y no hay vencimiento", async () => {
    const m = await activeMember();

    expect(await stateOf(m.token)).toEqual({
      hasDay0: false,
      day0Skipped: false,
      mustPromptDay0: true,
      day0Pending: false,
      lastCheckDate: null,
      nextDueDate: null,
      due: false,
      overdue: false,
    });
  });

  it("tras el dia 0: no se pide mas y el proximo es hoy + 28", async () => {
    const m = await activeMember();
    const hoy = await todayOf(m.userId);

    await createCheck(m.token, { armCm: 30 });

    expect(await stateOf(m.token)).toEqual({
      hasDay0: true,
      day0Skipped: false,
      mustPromptDay0: false,
      day0Pending: false,
      lastCheckDate: hoy,
      nextDueDate: addDays(hoy, 28),
      due: false,
      overdue: false,
    });
  });

  it.each([
    [27, false, false],
    [28, true, false],
    [42, true, false],
    [43, true, true],
  ])(
    "ultimo control con contenido hace %i dias: due=%s overdue=%s",
    async (dias, due, overdue) => {
      const m = await activeMember();
      const hoy = await todayOf(m.userId);
      await insertBodyCheckRow(app, {
        userId: m.userId,
        checkDate: addDays(hoy, -dias),
        kind: "dia0",
      });

      const estado = await stateOf(m.token);

      expect(estado.due).toBe(due);
      expect(estado.overdue).toBe(overdue);
      expect(estado.lastCheckDate).toBe(addDays(hoy, -dias));
      expect(estado.nextDueDate).toBe(addDays(hoy, -dias + 28));
    },
  );

  it("un control periodico VACIO de hoy no resetea el vencido", async () => {
    const m = await activeMember();
    const hoy = await todayOf(m.userId);
    const viejo = addDays(hoy, -43);
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: viejo,
      kind: "dia0",
    });

    const vacio = await createCheck(m.token, {});

    expect(vacio.kind).toBe("periodico");
    expect(await stateOf(m.token)).toMatchObject({
      overdue: true,
      due: true,
      lastCheckDate: viejo,
    });
  });
});

// ── (8) listado y comparador ────────────────────────────────────────

describe("GET /body-checks", () => {
  it("sin controles: lista vacia, sin comparador", async () => {
    const m = await activeMember();

    expect(await fetchList(m.token)).toEqual({
      checks: [],
      compare: null,
      due: { nextDueDate: null, due: false, overdue: false },
    });
  });

  it("con un solo control: sin comparador", async () => {
    const m = await activeMember();
    await createCheck(m.token, { armCm: 30 });

    const lista = await fetchList(m.token);

    expect(lista.checks).toHaveLength(1);
    expect(lista.compare).toBeNull();
  });

  it("dia 0 y un periodico: comparador con la diferencia de cada perimetro", async () => {
    const m = await activeMember();
    const hoy = await todayOf(m.userId);
    const dia0 = addDays(hoy, -30);
    const dia0Id = await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: dia0,
      kind: "dia0",
    }); // arm_cm = 30.0
    const actual = await createCheck(m.token, { armCm: 31.5, waistCm: 80 });

    const lista = await fetchList(m.token);

    expect(lista.checks.map((c) => c.id)).toEqual([actual.id, dia0Id]);
    expect(lista.compare).not.toBeNull();
    expect(lista.compare?.from).toEqual({ id: dia0Id, checkDate: dia0 });
    expect(lista.compare?.to).toEqual({ id: actual.id, checkDate: hoy });
    expect(lista.compare?.weeks).toBe(4);
    const porClave = Object.fromEntries(
      (lista.compare?.measures ?? []).map((x) => [x.key, x]),
    );
    expect(porClave.arm).toMatchObject({
      label: "Brazo",
      from: 30,
      to: 31.5,
      diff: 1.5,
    });
    expect(porClave.waist).toMatchObject({ from: null, to: 80, diff: null });
    expect(lista.due).toEqual({
      nextDueDate: addDays(hoy, 28),
      due: false,
      overdue: false,
    });
  });

  it("la lista oculta los controles vacios pasados pero muestra el de hoy aunque este vacio", async () => {
    const m = await activeMember();
    const hoy = await todayOf(m.userId);
    await insertBodyCheckRow(app, {
      userId: m.userId,
      checkDate: addDays(hoy, -40),
      kind: "periodico",
      empty: true,
    });
    const vacioHoy = await createCheck(m.token, {});

    const lista = await fetchList(m.token);

    expect(lista.checks.map((c) => c.id)).toEqual([vacioHoy.id]);
    expect(lista.compare).toBeNull();
  });

  it("solo ve los controles propios", async () => {
    const a = await activeMember();
    const b = await activeMember();
    await createCheck(a.token, { armCm: 30 });

    const lista = await fetchList(b.token);

    expect(lista.checks).toEqual([]);
  });
});
