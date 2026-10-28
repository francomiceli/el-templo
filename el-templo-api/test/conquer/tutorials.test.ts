/**
 * Fase 202 Plan 07 (D-25, D-08, DA-39, DA-48, DA-49): tutoriales en video por
 * ejercicio y por combo.
 *
 *   - GET    /api/members/conquer/tutorials
 *   - GET    /api/admin/conquer/tutorials
 *   - POST   /api/admin/conquer/tutorials/upload-url
 *   - PUT    /api/admin/conquer/tutorials
 *   - DELETE /api/admin/conquer/tutorials/exercise/:exerciseId
 *   - DELETE /api/admin/conquer/tutorials/combo/:comboKey
 *
 * Integracion contra el MySQL de tests. Usuarios SIEMPRE con fabricas. El
 * bucket publico se mockea con `mockTutorialMedia` (nada depende de R2 real) y
 * la base publica de URLs con `vi.stubEnv("R2_PUBLIC_URL", ...)`.
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
import { COMBO_KEYS, COMBOS } from "../../src/modules/conquer/combos";
import {
  isTutorialKey,
  tutorialKey,
} from "../../src/modules/conquer/tutorial-media";
import { TUTORIAL_VIDEO_MAX_BYTES } from "../../src/modules/conquer/video-rules";
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
  conquerExerciseIds,
  createActiveConquerMember,
  createConquerStaff,
  mockTutorialMedia,
  TEMPLO_CTX,
  type ConquerErrorBody,
} from "./_helpers";

const PUBLIC_BASE = "https://pub.test";
const ADMIN_URL = "/api/admin/conquer/tutorials";
const MEMBER_URL = "/api/members/conquer/tutorials";

interface AdminViewBody {
  storageReady: boolean;
  exercises: { exerciseId: number; url: string | null }[];
  combos: { comboKey: string; label: string; url: string | null }[];
}

interface MemberViewBody {
  exercises: { exerciseId: number; url: string }[];
  combos: { comboKey: string; url: string }[];
}

interface UploadBody {
  uploadUrl: string;
  key: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let ex1: number;
let ex2: number;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function getAdminRaw(token: string) {
  return app.inject({ method: "GET", url: ADMIN_URL, headers: auth(token) });
}

async function getAdmin(token: string): Promise<AdminViewBody> {
  const res = await getAdminRaw(token);
  expect(res.statusCode).toBe(200);
  return res.json<AdminViewBody>();
}

async function getMemberRaw(token: string) {
  return app.inject({ method: "GET", url: MEMBER_URL, headers: auth(token) });
}

async function getMember(token: string): Promise<MemberViewBody> {
  const res = await getMemberRaw(token);
  expect(res.statusCode).toBe(200);
  return res.json<MemberViewBody>();
}

async function uploadRaw(token: string, body: unknown) {
  return app.inject({
    method: "POST",
    url: `${ADMIN_URL}/upload-url`,
    headers: auth(token),
    payload: body as Record<string, unknown>,
  });
}

async function confirmRaw(token: string, body: unknown) {
  return app.inject({
    method: "PUT",
    url: ADMIN_URL,
    headers: auth(token),
    payload: body as Record<string, unknown>,
  });
}

async function deleteExerciseRaw(token: string, id: number | string) {
  return app.inject({
    method: "DELETE",
    url: `${ADMIN_URL}/exercise/${id}`,
    headers: auth(token),
  });
}

async function deleteComboRaw(token: string, comboKey: string) {
  return app.inject({
    method: "DELETE",
    url: `${ADMIN_URL}/combo/${comboKey}`,
    headers: auth(token),
  });
}

function exerciseKey(exerciseId: number, tenantId = TEMPLO_CTX.tenantId) {
  return tutorialKey({ tenantId, target: "ejercicio", exerciseId });
}

function comboKeyFor(
  comboKey: (typeof COMBO_KEYS)[number],
  tenantId = TEMPLO_CTX.tenantId,
) {
  return tutorialKey({ tenantId, target: "combo", comboKey });
}

/** Sube (PUT) un tutorial de ejercicio y devuelve la clave usada. */
async function saveExercise(token: string, exerciseId: number, key?: string) {
  const useKey = key ?? exerciseKey(exerciseId);
  const res = await confirmRaw(token, {
    target: "ejercicio",
    exerciseId,
    key: useKey,
  });
  expect(res.statusCode).toBe(200);
  return useKey;
}

async function saveCombo(
  token: string,
  comboKey: (typeof COMBO_KEYS)[number],
  key?: string,
) {
  const useKey = key ?? comboKeyFor(comboKey);
  const res = await confirmRaw(token, {
    target: "combo",
    comboKey,
    key: useKey,
  });
  expect(res.statusCode).toBe(200);
  return useKey;
}

async function readRows() {
  return app.db
    .select()
    .from(schema.conquerTutorials)
    .where(tenantWhere(schema.conquerTutorials, TEMPLO_CTX));
}

/** Tutorial de combo DIRECTO en el gimnasio 2 (con el modulo prendido). */
async function insertGym2Combo(comboKey: string): Promise<string> {
  await setModuleFlag(app, TENANT_DOS, "templo-training", true);
  const videoKey = `conquer/tutorials/${TENANT_DOS}/combo-${comboKey}-${randomUUID()}.mp4`;
  await app.db
    .insert(schema.conquerTutorials)
    .values(tenantValues({ tenantId: TENANT_DOS }, { comboKey, videoKey }));
  return videoKey;
}

beforeAll(async () => {
  app = await createTestApp();
  const ids = [...(await conquerExerciseIds(app)).values()];
  [ex1, ex2] = ids;
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
  vi.stubEnv("R2_PUBLIC_URL", PUBLIC_BASE);
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

// ── (1) GET admin: la vista ─────────────────────────────────────────

describe("GET /api/admin/conquer/tutorials", () => {
  it("sin tutoriales: storageReady, ningun ejercicio y los 6 combos sin video, en orden", async () => {
    mockTutorialMedia();
    const owner = await createConquerStaff(app, "owner");

    const view = await getAdmin(owner.token);

    expect(view.storageReady).toBe(true);
    expect(view.exercises).toEqual([]);
    expect(view.combos).toHaveLength(6);
    expect(view.combos.map((c) => c.comboKey)).toEqual([...COMBO_KEYS]);
    expect(view.combos.map((c) => c.label)).toEqual(
      COMBO_KEYS.map((k) => COMBOS[k].label),
    );
    expect(view.combos.every((c) => c.url === null)).toBe(true);
  });

  it("storageReady es false cuando el gimnasio no tiene R2", async () => {
    mockTutorialMedia({ ready: false });
    const admin = await createConquerStaff(app, "admin");

    const view = await getAdmin(admin.token);

    expect(view.storageReady).toBe(false);
    expect(view.combos).toHaveLength(6);
  });
});

// ── (2) POST upload-url ─────────────────────────────────────────────

describe("POST /api/admin/conquer/tutorials/upload-url", () => {
  it("ejercicio: URL firmada, clave con tenant, MP4, 900 s y tope de 200 MB", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    const res = await uploadRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      contentType: "video/mp4",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<UploadBody>();
    expect(isTutorialKey(body.key, TEMPLO_CTX.tenantId, "ejercicio", ex1)).toBe(
      true,
    );
    expect(body.uploadUrl).toBe(`https://r2.test/put/${body.key}`);
    expect(body.contentType).toBe("video/mp4");
    expect(body.expiresIn).toBe(900);
    expect(body.maxBytes).toBe(TUTORIAL_VIDEO_MAX_BYTES);
    expect(store.presignPut).toHaveBeenCalledWith(body.key, "video/mp4", 900);
    // Pedir la URL no escribe nada en la base.
    expect(await readRows()).toEqual([]);
  });

  it("combo push: clave de combo con su comboKey", async () => {
    mockTutorialMedia();
    const owner = await createConquerStaff(app, "owner");

    const res = await uploadRaw(owner.token, {
      target: "combo",
      comboKey: "push",
      contentType: "video/mp4",
    });

    expect(res.statusCode).toBe(200);
    const { key } = res.json<UploadBody>();
    expect(isTutorialKey(key, TEMPLO_CTX.tenantId, "combo", "push")).toBe(true);
    expect(isTutorialKey(key, TEMPLO_CTX.tenantId, "combo", "pull")).toBe(
      false,
    );
  });

  it("video/quicktime: 400 CONQUER_TUTORIAL_TIPO_INVALIDO y no firma nada", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    const res = await uploadRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      contentType: "video/quicktime",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>()).toEqual({
      error: "Subí el tutorial en MP4",
      code: "CONQUER_TUTORIAL_TIPO_INVALIDO",
    });
    expect(store.presignPut).not.toHaveBeenCalled();
  });

  it.each([
    { nombre: "target desconocido", body: { target: "otro" } },
    { nombre: "target vacio", body: { target: "" } },
    {
      nombre: "combo que no existe",
      body: { target: "combo", comboKey: "remo" },
    },
    { nombre: "combo sin comboKey", body: { target: "combo" } },
    {
      nombre: "combo con comboKey nulo",
      body: { target: "combo", comboKey: null },
    },
    { nombre: "ejercicio sin id", body: { target: "ejercicio" } },
    {
      nombre: "ejercicio con id nulo",
      body: { target: "ejercicio", exerciseId: null },
    },
    {
      nombre: "ejercicio con id 0",
      body: { target: "ejercicio", exerciseId: 0 },
    },
    {
      nombre: "ejercicio con id negativo",
      body: { target: "ejercicio", exerciseId: -3 },
    },
  ])("$nombre: 400 CONQUER_TUTORIAL_OBJETIVO_INVALIDO", async ({ body }) => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    const res = await uploadRaw(admin.token, {
      ...body,
      contentType: "video/mp4",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_TUTORIAL_OBJETIVO_INVALIDO",
    );
    expect(store.presignPut).not.toHaveBeenCalled();
  });

  it("sin contentType o sin target: 400 del schema", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    const sinTipo = await uploadRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
    });
    const sinTarget = await uploadRaw(admin.token, {
      contentType: "video/mp4",
    });

    expect(sinTipo.statusCode).toBe(400);
    expect(sinTarget.statusCode).toBe(400);
  });

  it("ejercicio que no existe en el catalogo: 404", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    const res = await uploadRaw(admin.token, {
      target: "ejercicio",
      exerciseId: 2_000_000_000,
      contentType: "video/mp4",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<ConquerErrorBody>().error).toBe("Ejercicio no encontrado");
    expect(store.presignPut).not.toHaveBeenCalled();
  });

  it("sin R2: 503 CONQUER_TUTORIALES_NO_DISPONIBLES", async () => {
    mockTutorialMedia({ unavailable: true });
    const admin = await createConquerStaff(app, "admin");

    const res = await uploadRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      contentType: "video/mp4",
    });

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>()).toEqual({
      error: "Los videos tutoriales no están disponibles por ahora",
      code: "CONQUER_TUTORIALES_NO_DISPONIBLES",
    });
  });

  it("orden: objetivo (400) y ejercicio (404) van ANTES del storage (503), y el storage antes del tipo", async () => {
    mockTutorialMedia({ unavailable: true });
    const admin = await createConquerStaff(app, "admin");

    const objetivo = await uploadRaw(admin.token, {
      target: "otro",
      contentType: "video/mp4",
    });
    const ejercicio = await uploadRaw(admin.token, {
      target: "ejercicio",
      exerciseId: 2_000_000_000,
      contentType: "video/mp4",
    });
    const tipo = await uploadRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      contentType: "video/quicktime",
    });

    expect(objetivo.statusCode).toBe(400);
    expect(ejercicio.statusCode).toBe(404);
    expect(tipo.statusCode).toBe(503);
  });

  it("si el storage falla al firmar: 503 sin filtrar la clave ni el error del SDK", async () => {
    mockTutorialMedia({
      presignPut: async () => {
        throw new Error("bucket-secreto exploto");
      },
    });
    const admin = await createConquerStaff(app, "admin");

    const res = await uploadRaw(admin.token, {
      target: "combo",
      comboKey: "pull",
      contentType: "video/mp4",
    });

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_TUTORIALES_NO_DISPONIBLES",
    );
    expect(res.body).not.toContain("bucket-secreto");
    expect(res.body).not.toContain("conquer/tutorials");
  });
});

// ── (3) PUT: confirmar, y lo que ve el alumno ───────────────────────

describe("PUT /api/admin/conquer/tutorials: confirmar y verlo", () => {
  it("ejercicio: la vista del coach trae la URL publica y la fila guarda quien subio", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const key = exerciseKey(ex1);

    const res = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key,
    });

    expect(res.statusCode).toBe(200);
    const view = res.json<AdminViewBody>();
    expect(view.storageReady).toBe(true);
    expect(view.exercises).toEqual([
      { exerciseId: ex1, url: `${PUBLIC_BASE}/${key}` },
    ]);
    expect(view.combos.every((c) => c.url === null)).toBe(true);
    expect(store.head).toHaveBeenCalledWith(key);
    expect(store.remove).not.toHaveBeenCalled();
    const rows = await readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exerciseId: ex1,
      comboKey: null,
      videoKey: key,
      uploadedBy: admin.id,
    });
  });

  it("el alumno, activo en Conquer o no, ve el ejercicio con esa URL", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const key = await saveExercise(admin.token, ex1);
    const activo = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });
    const comun = await createTestMember(app);

    const delActivo = await getMember(activo.token);
    const delComun = await getMember(comun.token);

    const esperado = [{ exerciseId: ex1, url: `${PUBLIC_BASE}/${key}` }];
    expect(delActivo).toEqual({ exercises: esperado, combos: [] });
    expect(delComun).toEqual({ exercises: esperado, combos: [] });
  });

  it("combo: aparece en su lugar de COMBO_KEYS (el resto sigue en null) y el alumno lo ve", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const key = comboKeyFor("push");

    const res = await confirmRaw(admin.token, {
      target: "combo",
      comboKey: "push",
      key,
    });

    expect(res.statusCode).toBe(200);
    const view = res.json<AdminViewBody>();
    expect(view.exercises).toEqual([]);
    expect(view.combos.map((c) => [c.comboKey, c.url])).toEqual(
      COMBO_KEYS.map((k) => [k, k === "push" ? `${PUBLIC_BASE}/${key}` : null]),
    );
    const rows = await readRows();
    expect(rows[0]).toMatchObject({
      exerciseId: null,
      comboKey: "push",
      videoKey: key,
    });
    const member = await createTestMember(app);
    expect(await getMember(member.token)).toEqual({
      exercises: [],
      combos: [{ comboKey: "push", url: `${PUBLIC_BASE}/${key}` }],
    });
  });

  it("los combos del alumno salen en el orden de COMBO_KEYS, no en el de alta", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    await saveCombo(admin.token, "pull");
    await saveCombo(admin.token, "plancha");
    await saveCombo(admin.token, "vertical");
    const member = await createTestMember(app);

    const view = await getMember(member.token);

    expect(view.combos.map((c) => c.comboKey)).toEqual([
      "plancha",
      "vertical",
      "pull",
    ]);
  });

  it("sin R2_PUBLIC_URL el alumno no ve nada (no hay URL) pero el coach sigue viendo que existe", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    await saveExercise(admin.token, ex1);
    await saveCombo(admin.token, "front");
    const member = await createTestMember(app);

    vi.stubEnv("R2_PUBLIC_URL", "");

    expect(await getMember(member.token)).toEqual({
      exercises: [],
      combos: [],
    });
    const adminView = await getAdmin(admin.token);
    expect(adminView.exercises).toEqual([{ exerciseId: ex1, url: null }]);
    expect(
      adminView.combos.find((c) => c.comboKey === "front")?.url,
    ).toBeNull();
  });

  it("un alumno sin tutoriales recibe listas vacias (200, no 404)", async () => {
    const member = await createTestMember(app);

    expect(await getMember(member.token)).toEqual({
      exercises: [],
      combos: [],
    });
  });

  it("el alumno necesita sesion: sin token 401", async () => {
    const res = await app.inject({ method: "GET", url: MEMBER_URL });

    expect(res.statusCode).toBe(401);
  });
});

// ── (4) Reemplazo ───────────────────────────────────────────────────

describe("PUT: reemplazar un tutorial (DA-48)", () => {
  it("el segundo PUT deja UNA fila con la clave nueva y borra el objeto anterior", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const otroAdmin = await createConquerStaff(app, "owner");
    const vieja = await saveExercise(admin.token, ex1);
    const nueva = exerciseKey(ex1);

    const res = await confirmRaw(otroAdmin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key: nueva,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<AdminViewBody>().exercises).toEqual([
      { exerciseId: ex1, url: `${PUBLIC_BASE}/${nueva}` },
    ]);
    const rows = await readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      videoKey: nueva,
      uploadedBy: otroAdmin.id,
    });
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith(vieja);
    expect(store.remove).not.toHaveBeenCalledWith(nueva);
  });

  it("combo: tambien deja una sola fila y borra la clave anterior", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const vieja = await saveCombo(admin.token, "dominadas");
    const nueva = comboKeyFor("dominadas");

    await saveCombo(admin.token, "dominadas", nueva);

    const rows = await readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].videoKey).toBe(nueva);
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith(vieja);
  });

  it("confirmar dos veces la MISMA clave no la borra", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const key = await saveExercise(admin.token, ex1);

    await saveExercise(admin.token, ex1, key);

    expect(store.remove).not.toHaveBeenCalled();
    expect((await readRows())[0].videoKey).toBe(key);
  });

  it("si el borrado del anterior falla, igual responde 200 con la clave nueva y sin filtrar nada", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    await saveExercise(admin.token, ex1);
    vi.restoreAllMocks();
    mockTutorialMedia({
      remove: async () => {
        throw new Error("bucket-secreto no borra");
      },
    });
    const nueva = exerciseKey(ex1);

    const res = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key: nueva,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("bucket-secreto");
    expect((await readRows())[0].videoKey).toBe(nueva);
  });

  it("un reemplazo invalido (pesado) no toca el tutorial vigente ni su objeto", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const vigente = await saveExercise(admin.token, ex1);
    vi.restoreAllMocks();
    const store = mockTutorialMedia({
      head: async () => ({
        contentLength: TUTORIAL_VIDEO_MAX_BYTES + 1,
        contentType: "video/mp4",
      }),
    });
    const pesada = exerciseKey(ex1);

    const res = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key: pesada,
    });

    expect(res.statusCode).toBe(400);
    expect((await readRows())[0].videoKey).toBe(vigente);
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith(pesada);
  });

  it("dos ejercicios distintos conviven, cada uno con su fila", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    await saveExercise(admin.token, ex1);
    await saveExercise(admin.token, ex2);

    const view = await getAdmin(admin.token);
    expect(view.exercises.map((e) => e.exerciseId).sort()).toEqual(
      [ex1, ex2].sort(),
    );
    expect(await readRows()).toHaveLength(2);
  });
});

// ── (5) PUT: validaciones ───────────────────────────────────────────

describe("PUT: video no subido, invalido o clave ajena", () => {
  it("el objeto no esta en el bucket: 409 CONQUER_VIDEO_NO_SUBIDO y no hay fila", async () => {
    const store = mockTutorialMedia({ head: async () => null });
    const admin = await createConquerStaff(app, "admin");

    const res = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key: exerciseKey(ex1),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_VIDEO_NO_SUBIDO");
    expect(store.remove).not.toHaveBeenCalled();
    expect(await readRows()).toEqual([]);
  });

  it.each([
    {
      nombre: "200 MB + 1 byte",
      head: {
        contentLength: TUTORIAL_VIDEO_MAX_BYTES + 1,
        contentType: "video/mp4",
      },
    },
    {
      nombre: "video/quicktime",
      head: { contentLength: 1024, contentType: "video/quicktime" },
    },
    {
      nombre: "un tipo que no es video",
      head: { contentLength: 1024, contentType: "image/jpeg" },
    },
    {
      nombre: "un objeto vacio",
      head: { contentLength: 0, contentType: "video/mp4" },
    },
  ])(
    "$nombre: 400 CONQUER_VIDEO_INVALIDO, se borra la clave nueva y no hay fila",
    async ({ head }) => {
      const store = mockTutorialMedia({ head: async () => head });
      const admin = await createConquerStaff(app, "admin");
      const key = exerciseKey(ex1);

      const res = await confirmRaw(admin.token, {
        target: "ejercicio",
        exerciseId: ex1,
        key,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>()).toEqual({
        error: "El video pesa más de 200 MB o no es MP4",
        code: "CONQUER_VIDEO_INVALIDO",
      });
      expect(store.remove).toHaveBeenCalledTimes(1);
      expect(store.remove).toHaveBeenCalledWith(key);
      expect(await readRows()).toEqual([]);
    },
  );

  it("exactamente 200 MB es valido", async () => {
    mockTutorialMedia({
      head: async () => ({
        contentLength: TUTORIAL_VIDEO_MAX_BYTES,
        contentType: "video/mp4",
      }),
    });
    const admin = await createConquerStaff(app, "admin");

    const res = await confirmRaw(admin.token, {
      target: "combo",
      comboKey: "front",
      key: comboKeyFor("front"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("si el HEAD falla: 503 sin filtrar el error y sin fila", async () => {
    const store = mockTutorialMedia({
      head: async () => {
        throw new Error("bucket-secreto head");
      },
    });
    const admin = await createConquerStaff(app, "admin");

    const res = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key: exerciseKey(ex1),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_TUTORIALES_NO_DISPONIBLES",
    );
    expect(res.body).not.toContain("bucket-secreto");
    expect(store.remove).not.toHaveBeenCalled();
    expect(await readRows()).toEqual([]);
  });

  const ejercicio = (key: () => string) => () => ({
    target: "ejercicio",
    exerciseId: ex1,
    key: key(),
  });
  const combo = (key: () => string) => () => ({
    target: "combo",
    comboKey: "push",
    key: key(),
  });

  it.each([
    {
      nombre: "clave de OTRO ejercicio",
      body: ejercicio(() => exerciseKey(ex2)),
    },
    {
      nombre: "clave de OTRO gimnasio",
      body: ejercicio(() => exerciseKey(ex1, TENANT_DOS)),
    },
    {
      nombre: "clave de combo para un ejercicio",
      body: ejercicio(() => comboKeyFor("push")),
    },
    {
      nombre: "clave de ejercicio para un combo",
      body: combo(() => exerciseKey(ex1)),
    },
    {
      nombre: "clave de OTRO combo",
      body: combo(() => comboKeyFor("pull")),
    },
    {
      nombre: "clave de la subida de Ejercicios",
      body: ejercicio(() => `exercises/${ex1}.mp4`),
    },
    {
      nombre: "clave con path traversal",
      body: ejercicio(
        () => `conquer/tutorials/1/../2/${exerciseKey(ex1).split("/").pop()}`,
      ),
    },
    {
      nombre: "clave con prefijo delante",
      body: ejercicio(() => `x/${exerciseKey(ex1)}`),
    },
    {
      nombre: "clave .mov",
      body: ejercicio(() => exerciseKey(ex1).replace(/\.mp4$/, ".mov")),
    },
    {
      nombre: "clave privada de una correccion",
      body: combo(
        () => `private/conquer-corrections/1/5/alumno-${randomUUID()}.mp4`,
      ),
    },
  ])(
    "$nombre: 400 CONQUER_VIDEO_CLAVE_INVALIDA, sin HEAD y sin fila",
    async ({ body }) => {
      const store = mockTutorialMedia();
      const admin = await createConquerStaff(app, "admin");

      const res = await confirmRaw(admin.token, body());

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_VIDEO_CLAVE_INVALIDA",
      );
      expect(store.head).not.toHaveBeenCalled();
      expect(store.remove).not.toHaveBeenCalled();
      expect(await readRows()).toEqual([]);
    },
  );

  it("orden: objetivo (400) -> ejercicio (404) -> storage (503) -> clave (400)", async () => {
    const admin = await createConquerStaff(app, "admin");
    mockTutorialMedia({ unavailable: true });

    const objetivo = await confirmRaw(admin.token, {
      target: "combo",
      comboKey: "remo",
      key: "x",
    });
    const ejercicio = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: 2_000_000_000,
      key: "x",
    });
    const storage = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key: "x",
    });
    vi.restoreAllMocks();
    mockTutorialMedia();
    const clave = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key: "x",
    });

    expect(objetivo.statusCode).toBe(400);
    expect(objetivo.json<ConquerErrorBody>().code).toBe(
      "CONQUER_TUTORIAL_OBJETIVO_INVALIDO",
    );
    expect(ejercicio.statusCode).toBe(404);
    expect(storage.statusCode).toBe(503);
    expect(clave.statusCode).toBe(400);
    expect(clave.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEO_CLAVE_INVALIDA",
    );
  });

  it("sin key o con key de mas de 255 caracteres: 400 del schema", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    const sinKey = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
    });
    const larga = await confirmRaw(admin.token, {
      target: "ejercicio",
      exerciseId: ex1,
      key: "k".repeat(256),
    });

    expect(sinKey.statusCode).toBe(400);
    expect(larga.statusCode).toBe(400);
    expect(await readRows()).toEqual([]);
  });
});

// ── (6) DELETE ──────────────────────────────────────────────────────

describe("DELETE de un tutorial", () => {
  it("ejercicio: borra el objeto y la fila, y el alumno deja de verlo", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const key = await saveExercise(admin.token, ex1);
    const otra = await saveExercise(admin.token, ex2);
    const member = await createTestMember(app);

    const res = await deleteExerciseRaw(admin.token, ex1);

    expect(res.statusCode).toBe(200);
    expect(res.json<AdminViewBody>().exercises).toEqual([
      { exerciseId: ex2, url: `${PUBLIC_BASE}/${otra}` },
    ]);
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith(key);
    const rows = await readRows();
    expect(rows.map((r) => r.exerciseId)).toEqual([ex2]);
    expect((await getMember(member.token)).exercises).toEqual([
      { exerciseId: ex2, url: `${PUBLIC_BASE}/${otra}` },
    ]);
  });

  it("repetir el borrado: 200 sin tocar el storage", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    await saveExercise(admin.token, ex1);
    await deleteExerciseRaw(admin.token, ex1);
    store.remove.mockClear();

    const res = await deleteExerciseRaw(admin.token, ex1);

    expect(res.statusCode).toBe(200);
    expect(res.json<AdminViewBody>().exercises).toEqual([]);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("sin tutorial cargado funciona aunque el gimnasio no tenga R2 (idempotente, sin storage)", async () => {
    mockTutorialMedia({ unavailable: true });
    const admin = await createConquerStaff(app, "admin");

    const ejercicio = await deleteExerciseRaw(admin.token, ex1);
    const combo = await deleteComboRaw(admin.token, "push");

    expect(ejercicio.statusCode).toBe(200);
    expect(combo.statusCode).toBe(200);
    expect(ejercicio.json<AdminViewBody>().storageReady).toBe(false);
  });

  it("si el storage falla al borrar: 503 y la fila QUEDA, sin filtrar la clave", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const key = await saveExercise(admin.token, ex1);
    vi.restoreAllMocks();
    mockTutorialMedia({
      remove: async () => {
        throw new Error("bucket-secreto no borra");
      },
    });

    const res = await deleteExerciseRaw(admin.token, ex1);

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_TUTORIALES_NO_DISPONIBLES",
    );
    expect(res.body).not.toContain("bucket-secreto");
    expect(res.body).not.toContain("conquer/tutorials");
    const rows = await readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].videoKey).toBe(key);
  });

  it("con tutorial pero sin R2: 503 y la fila queda", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    await saveCombo(admin.token, "push");
    vi.restoreAllMocks();
    mockTutorialMedia({ unavailable: true });

    const res = await deleteComboRaw(admin.token, "push");

    expect(res.statusCode).toBe(503);
    expect(await readRows()).toHaveLength(1);
  });

  it("combo: borra su objeto y su fila, y deja los otros combos", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");
    const key = await saveCombo(admin.token, "push");
    const pull = await saveCombo(admin.token, "pull");

    const res = await deleteComboRaw(admin.token, "push");

    expect(res.statusCode).toBe(200);
    const view = res.json<AdminViewBody>();
    expect(view.combos.find((c) => c.comboKey === "push")?.url).toBeNull();
    expect(view.combos.find((c) => c.comboKey === "pull")?.url).toBe(
      `${PUBLIC_BASE}/${pull}`,
    );
    expect(store.remove).toHaveBeenCalledWith(key);
    expect((await readRows()).map((r) => r.comboKey)).toEqual(["pull"]);
  });

  it("combo fuera de COMBO_KEYS: 400 CONQUER_TUTORIAL_OBJETIVO_INVALIDO", async () => {
    const store = mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    const res = await deleteComboRaw(admin.token, "remo");

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_TUTORIAL_OBJETIVO_INVALIDO",
    );
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("ejercicio inexistente: 404, y un id que no es entero: 400", async () => {
    mockTutorialMedia();
    const admin = await createConquerStaff(app, "admin");

    const inexistente = await deleteExerciseRaw(admin.token, 2_000_000_000);
    const texto = await deleteExerciseRaw(admin.token, "abc");

    expect(inexistente.statusCode).toBe(404);
    expect(texto.statusCode).toBe(400);
  });
});

// ── (7) Permisos ────────────────────────────────────────────────────

describe("permisos: solo owner y admin (D-08)", () => {
  const RUTAS = [
    { nombre: "GET", method: "GET", path: () => ADMIN_URL, body: undefined },
    {
      nombre: "POST upload-url",
      method: "POST",
      path: () => `${ADMIN_URL}/upload-url`,
      body: () => ({
        target: "ejercicio",
        exerciseId: ex1,
        contentType: "video/mp4",
      }),
    },
    {
      nombre: "PUT",
      method: "PUT",
      path: () => ADMIN_URL,
      body: () => ({
        target: "ejercicio",
        exerciseId: ex1,
        key: exerciseKey(ex1),
      }),
    },
    {
      nombre: "DELETE ejercicio",
      method: "DELETE",
      path: () => `${ADMIN_URL}/exercise/${ex1}`,
      body: undefined,
    },
    {
      nombre: "DELETE combo",
      method: "DELETE",
      path: () => `${ADMIN_URL}/combo/push`,
      body: undefined,
    },
  ] as const;

  async function call(token: string, ruta: (typeof RUTAS)[number]) {
    return app.inject({
      method: ruta.method,
      url: ruta.path(),
      headers: auth(token),
      ...(ruta.body ? { payload: ruta.body() } : {}),
    });
  }

  describe.each([
    "coach",
    "gestion",
    "recepcion",
    "admin_sede",
    "coach_actividad",
  ])("el rol %s", (role) => {
    it.each(RUTAS)("recibe 403 en $nombre y no toca nada", async (ruta) => {
      const store = mockTutorialMedia();
      const owner = await createConquerStaff(app, "owner");
      const key = await saveCombo(owner.token, "push");
      store.remove.mockClear();
      store.head.mockClear();
      const staff = await createConquerStaff(app, role);

      const res = await call(staff.token, ruta);

      expect(res.statusCode).toBe(403);
      expect(store.head).not.toHaveBeenCalled();
      expect(store.presignPut).not.toHaveBeenCalled();
      expect(store.remove).not.toHaveBeenCalled();
      const rows = await readRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].videoKey).toBe(key);
    });
  });

  it.each(RUTAS)("un socio comun recibe 403 en $nombre", async (ruta) => {
    mockTutorialMedia();
    const member = await createTestMember(app);

    const res = await call(member.token, ruta);

    expect(res.statusCode).toBe(403);
    expect(await readRows()).toEqual([]);
  });

  it.each(RUTAS)("sin token: 401 en $nombre", async (ruta) => {
    const res = await app.inject({ method: ruta.method, url: ruta.path() });

    expect(res.statusCode).toBe(401);
  });

  it.each(["owner", "admin"])(
    "el rol %s puede leer, subir, reemplazar y borrar",
    async (role) => {
      mockTutorialMedia();
      const staff = await createConquerStaff(app, role);

      expect((await getAdminRaw(staff.token)).statusCode).toBe(200);
      await saveCombo(staff.token, "plancha");
      expect((await deleteComboRaw(staff.token, "plancha")).statusCode).toBe(
        200,
      );
    },
  );
});

// ── (8) Aislamiento entre gimnasios ─────────────────────────────────

describe("aislamiento entre gimnasios (T-201-141)", () => {
  it("el gimnasio 2 sin el modulo templo-training recibe 404 en las 6 rutas", async () => {
    mockTutorialMedia();
    const rutas = [
      { method: "GET", url: ADMIN_URL, token: gym2.adminToken },
      { method: "GET", url: MEMBER_URL, token: gym2.socios[0].token },
      {
        method: "POST",
        url: `${ADMIN_URL}/upload-url`,
        token: gym2.adminToken,
        payload: {
          target: "combo",
          comboKey: "push",
          contentType: "video/mp4",
        },
      },
      {
        method: "PUT",
        url: ADMIN_URL,
        token: gym2.adminToken,
        payload: {
          target: "combo",
          comboKey: "push",
          key: comboKeyFor("push", TENANT_DOS),
        },
      },
      {
        method: "DELETE",
        url: `${ADMIN_URL}/exercise/${ex1}`,
        token: gym2.adminToken,
      },
      {
        method: "DELETE",
        url: `${ADMIN_URL}/combo/push`,
        token: gym2.adminToken,
      },
    ] as const;

    for (const ruta of rutas) {
      const res = await app.inject({
        method: ruta.method,
        url: ruta.url,
        headers: auth(ruta.token),
        ...("payload" in ruta ? { payload: ruta.payload } : {}),
      });
      expect(res.statusCode, `${ruta.method} ${ruta.url}`).toBe(404);
    }
  });

  it("cada gimnasio ve solo SUS tutoriales (coach y alumno)", async () => {
    mockTutorialMedia();
    const admin1 = await createConquerStaff(app, "admin");
    const member1 = await createTestMember(app);
    const key1 = await saveCombo(admin1.token, "push");
    const key2 = await insertGym2Combo("pull");

    const admin2View = await getAdmin(gym2.adminToken);
    const admin1View = await getAdmin(admin1.token);
    const socio2 = await getMember(gym2.socios[0].token);
    const socio1 = await getMember(member1.token);

    expect(admin2View.combos.filter((c) => c.url !== null)).toEqual([
      expect.objectContaining({
        comboKey: "pull",
        url: `${PUBLIC_BASE}/${key2}`,
      }),
    ]);
    expect(admin1View.combos.filter((c) => c.url !== null)).toEqual([
      expect.objectContaining({
        comboKey: "push",
        url: `${PUBLIC_BASE}/${key1}`,
      }),
    ]);
    expect(socio2.combos).toEqual([
      { comboKey: "pull", url: `${PUBLIC_BASE}/${key2}` },
    ]);
    expect(socio1.combos).toEqual([
      { comboKey: "push", url: `${PUBLIC_BASE}/${key1}` },
    ]);
    expect(socio2.exercises).toEqual([]);
  });

  it("DELETE del ejercicio del gimnasio 1 desde el 2: 404 y la fila sigue", async () => {
    const store = mockTutorialMedia();
    const admin1 = await createConquerStaff(app, "admin");
    const key = await saveExercise(admin1.token, ex1);
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    store.remove.mockClear();

    const res = await deleteExerciseRaw(gym2.adminToken, ex1);

    expect(res.statusCode).toBe(404);
    expect(store.remove).not.toHaveBeenCalled();
    const rows = await readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].videoKey).toBe(key);
  });

  it("DELETE del combo push desde el 2 (sin tutorial propio): 200 y el combo del 1 sigue intacto", async () => {
    const store = mockTutorialMedia();
    const admin1 = await createConquerStaff(app, "admin");
    const key = await saveCombo(admin1.token, "push");
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    store.remove.mockClear();

    const res = await deleteComboRaw(gym2.adminToken, "push");

    expect(res.statusCode).toBe(200);
    expect(store.remove).not.toHaveBeenCalled();
    const rows = await readRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].videoKey).toBe(key);
  });

  it("DELETE del combo desde el 2 borra SOLO el del 2", async () => {
    const store = mockTutorialMedia();
    const admin1 = await createConquerStaff(app, "admin");
    const key1 = await saveCombo(admin1.token, "push");
    const key2 = await insertGym2Combo("push");
    store.remove.mockClear();

    const res = await deleteComboRaw(gym2.adminToken, "push");

    expect(res.statusCode).toBe(200);
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith(key2);
    expect((await readRows()).map((r) => r.videoKey)).toEqual([key1]);
  });

  it("subir o confirmar para un ejercicio del gimnasio 1 desde el 2: 404", async () => {
    const store = mockTutorialMedia();
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);

    const upload = await uploadRaw(gym2.adminToken, {
      target: "ejercicio",
      exerciseId: ex1,
      contentType: "video/mp4",
    });
    const confirm = await confirmRaw(gym2.adminToken, {
      target: "ejercicio",
      exerciseId: ex1,
      key: exerciseKey(ex1, TENANT_DOS),
    });

    expect(upload.statusCode).toBe(404);
    expect(confirm.statusCode).toBe(404);
    expect(store.presignPut).not.toHaveBeenCalled();
    expect(store.head).not.toHaveBeenCalled();
  });

  it("el gimnasio 2 no puede adoptar la clave del 1 para un combo: 400 y la fila del 1 sigue", async () => {
    const store = mockTutorialMedia();
    const admin1 = await createConquerStaff(app, "admin");
    const key1 = await saveCombo(admin1.token, "push");
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);

    const res = await confirmRaw(gym2.adminToken, {
      target: "combo",
      comboKey: "push",
      key: key1,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEO_CLAVE_INVALIDA",
    );
    expect(store.remove).not.toHaveBeenCalledWith(key1);
    expect((await readRows()).map((r) => r.videoKey)).toEqual([key1]);
  });

  it("el gimnasio 2 puede cargar su propio combo y no pisa el del 1", async () => {
    const store = mockTutorialMedia();
    const admin1 = await createConquerStaff(app, "admin");
    const key1 = await saveCombo(admin1.token, "push");
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const key2 = comboKeyFor("push", TENANT_DOS);

    const res = await confirmRaw(gym2.adminToken, {
      target: "combo",
      comboKey: "push",
      key: key2,
    });

    expect(res.statusCode).toBe(200);
    expect(store.remove).not.toHaveBeenCalled();
    expect((await readRows()).map((r) => r.videoKey)).toEqual([key1]);
    const filas2 = await app.db
      .select()
      .from(schema.conquerTutorials)
      .where(
        and(
          tenantWhere(schema.conquerTutorials, { tenantId: TENANT_DOS }),
          eq(schema.conquerTutorials.comboKey, "push"),
        ),
      );
    expect(filas2.map((r) => r.videoKey)).toEqual([key2]);
  });
});
