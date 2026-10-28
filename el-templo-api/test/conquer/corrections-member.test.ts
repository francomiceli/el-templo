/**
 * Fase 202 Plan 03 (D-26, D-27, D-29, DA-39..DA-43, DA-47): correcciones con
 * video, lado del alumno.
 *
 *   - GET  /api/members/conquer/corrections
 *   - POST /api/members/conquer/corrections/upload-url
 *   - POST /api/members/conquer/corrections
 *
 * Integracion contra el MySQL de tests. Usuarios SIEMPRE con fabricas. El
 * storage se mockea con `mockPrivateMedia` (nada depende de R2 real). El
 * historial se inserta DIRECTO con `insertConquerCorrection`.
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
import { COMBO_KEYS } from "../../src/modules/conquer/combos";
import {
  CORRECTION_VIDEO_MAX_BYTES,
  CORRECTION_PENDING_MAX,
} from "../../src/modules/conquer/video-rules";
import {
  isOwnCorrectionVideoKey,
  privateCorrectionVideoKey,
  type PrivateMediaStore,
} from "../../src/modules/conquer/private-media";
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
  conquerExerciseIds,
  CONQUER_CORRECTIONS_URL,
  createActiveConquerMember,
  insertConquerCorrection,
  insertConquerMember,
  mockPrivateMedia,
  postCorrectionRaw,
  TEMPLO_CTX,
  type ConquerErrorBody,
} from "./_helpers";

const UPLOAD_URL = `${CONQUER_CORRECTIONS_URL}/upload-url`;
const MB = 1024 * 1024;

interface TargetBody {
  key: string;
  kind: "escalon" | "combo";
  exerciseId: number | null;
  step: string | null;
  comboKey: string | null;
  group: string;
  label: string;
}

interface CorrectionBody {
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
  replyUnseen: boolean;
}

interface ListBody {
  items: CorrectionBody[];
  targets: TargetBody[];
  limits: {
    pending: number;
    pendingMax: number;
    maxSeconds: number;
    maxBytes: number;
    commentMax: number;
  };
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

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function listRaw(token: string) {
  return app.inject({
    method: "GET",
    url: CONQUER_CORRECTIONS_URL,
    headers: auth(token),
  });
}

async function fetchList(token: string): Promise<ListBody> {
  const res = await listRaw(token);
  expect(res.statusCode).toBe(200);
  return res.json<ListBody>();
}

async function uploadRaw(token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: UPLOAD_URL,
    headers: auth(token),
    payload,
  });
}

/** Tienda de videos de mentira: el HEAD devuelve un MP4 de 5 MB salvo que se pise. */
function mockVideoStore(overrides: Partial<PrivateMediaStore> = {}) {
  return mockPrivateMedia({
    head: async () => ({ contentLength: 5 * MB, contentType: "video/mp4" }),
    ...overrides,
  });
}

function removeSpy() {
  return vi.fn<PrivateMediaStore["remove"]>(async () => undefined);
}

function ownKey(
  userId: number,
  contentType: "video/mp4" | "video/quicktime" = "video/mp4",
) {
  return privateCorrectionVideoKey({
    tenantId: TEMPLO_CTX.tenantId,
    userId,
    contentType,
  });
}

/** Alumno activo (Espartano, 4 dias) o el nivel pedido. */
async function activeMember(
  level: "ternero" | "novillo" | "toro" = "toro",
  daysCount = 4,
) {
  return createActiveConquerMember(app, { level, daysCount });
}

/** Un escalon del plan del alumno, tomado de lo que le manda el API. */
async function escalonDelPlan(
  token: string,
  step: string,
): Promise<TargetBody> {
  const { targets } = await fetchList(token);
  const target = targets.find((t) => t.kind === "escalon" && t.step === step);
  if (!target) throw new Error(`el plan no trae un escalon ${step}`);
  return target;
}

function escalonBody(
  target: TargetBody,
  userId: number,
  extra: Record<string, unknown> = {},
) {
  return {
    exerciseId: target.exerciseId,
    step: target.step,
    key: ownKey(userId),
    durationSec: 24,
    ...extra,
  };
}

/** Ejercicios distintos de los dias de una plantilla (los lee de la base). */
async function planExerciseCodes(daysCount: number): Promise<Set<string>> {
  const rows = await app.db
    .select({ codes: schema.conquerTemplateDays.exerciseCodes })
    .from(schema.conquerTemplateDays)
    .where(
      and(
        tenantWhere(schema.conquerTemplateDays, TEMPLO_CTX),
        eq(schema.conquerTemplateDays.daysCount, daysCount),
      ),
    );
  return new Set(rows.flatMap((r) => r.codes));
}

async function readCorrections(userId: number) {
  return app.db
    .select()
    .from(schema.conquerCorrections)
    .where(
      and(
        tenantWhere(schema.conquerCorrections, TEMPLO_CTX),
        eq(schema.conquerCorrections.userId, userId),
      ),
    );
}

/** Peldaño actual de un escalon del alumno (la base de verdad del rung_id). */
async function currentRungId(
  userId: number,
  exerciseId: number,
  step: string,
): Promise<number> {
  const [row] = await app.db
    .select({ rungId: schema.conquerSteps.rungId })
    .from(schema.conquerSteps)
    .innerJoin(
      schema.conquerMembers,
      eq(schema.conquerMembers.id, schema.conquerSteps.memberId),
    )
    .where(
      and(
        tenantWhere(schema.conquerSteps, TEMPLO_CTX),
        tenantWhere(schema.conquerMembers, TEMPLO_CTX),
        eq(schema.conquerMembers.userId, userId),
        eq(schema.conquerSteps.exerciseId, exerciseId),
        eq(schema.conquerSteps.step, step as "e1" | "e2" | "e3" | "hold"),
      ),
    );
  return row.rungId;
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

// ── (1) GET /corrections ────────────────────────────────────────────

describe("GET /corrections: objetivos, topes y lista", () => {
  it("un Espartano de 4 dias: los 4 escalones de cada ejercicio del plan y los 6 combos, sin storage", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember("toro", 4);
    const codes = await planExerciseCodes(4);
    const ids = await conquerExerciseIds(app);

    const body = await fetchList(m.token);

    const escalones = body.targets.filter((t) => t.kind === "escalon");
    const combos = body.targets.filter((t) => t.kind === "combo");
    expect(escalones).toHaveLength(codes.size * 4);
    for (const code of codes) {
      const id = ids.get(code);
      const pasos = escalones
        .filter((t) => t.exerciseId === id)
        .map((t) => t.step);
      expect(pasos, code).toEqual(["e1", "e2", "e3", "hold"]);
    }
    expect(combos.map((t) => t.comboKey)).toEqual([...COMBO_KEYS]);
    expect(combos.every((t) => t.group === "Combos")).toBe(true);
    expect(combos[0]).toMatchObject({
      key: "combo:plancha",
      exerciseId: null,
      step: null,
      label: "Combo Plancha",
    });
    expect(body.items).toEqual([]);
    expect(body.limits).toEqual({
      pending: 0,
      pendingMax: 3,
      maxSeconds: 30,
      maxBytes: 104857600,
      commentMax: 500,
    });
  });

  it("un Centurion (novillo) no trae combos", async () => {
    const m = await activeMember("novillo", 3);
    const codes = await planExerciseCodes(3);

    const body = await fetchList(m.token);

    expect(body.targets.some((t) => t.kind === "combo")).toBe(false);
    expect(body.targets).toHaveLength(codes.size * 4);
  });

  it("cada escalon trae clave, grupo con el nombre del ejercicio y etiqueta con el peldaño actual", async () => {
    const m = await activeMember("toro", 4);

    const body = await fetchList(m.token);

    const e1 = await escalonDelPlan(m.token, "e1");
    expect(e1.key).toBe(`escalon:${e1.exerciseId}:e1`);
    expect(e1.kind).toBe("escalon");
    expect(e1.comboKey).toBeNull();
    expect(e1.label).toMatch(/^Escalón 1 · .+/);
    const hold = body.targets.find(
      (t) => t.exerciseId === e1.exerciseId && t.step === "hold",
    );
    expect(hold?.label).toMatch(/^Hold final · .+/);
    expect(hold?.group).toBe(e1.group);
  });

  it("las enviadas: las mas nuevas primero, con el estado y la respuesta", async () => {
    const m = await activeMember();
    const vieja = await insertConquerCorrection(app, m.userId, {
      status: "respondida",
      replyText: "Bajá más el codo",
      replyVideoKey: `private/conquer-corrections/1/${m.userId}/coach-1-x.mp4`,
      replyVideoSeconds: 12,
      repliedAt: new Date(),
    });
    const nueva = await insertConquerCorrection(app, m.userId, {
      comment: "No sé si estoy bien",
    });

    const body = await fetchList(m.token);

    expect(body.items.map((i) => i.id)).toEqual([nueva, vieja]);
    const [pendiente, respondida] = body.items;
    expect(pendiente).toMatchObject({
      kind: "escalon",
      comment: "No sé si estoy bien",
      durationSec: 20,
      status: "pendiente",
      videoDeleted: false,
      reply: null,
      replyUnseen: false,
    });
    expect(pendiente.targetLabel).toMatch(/ · Escalón 1 · .+/);
    expect(Number.isNaN(Date.parse(pendiente.createdAt))).toBe(false);
    expect(respondida).toMatchObject({
      status: "respondida",
      replyUnseen: true,
    });
    expect(respondida.reply).toMatchObject({
      text: "Bajá más el codo",
      hasVideo: true,
      videoSeconds: 12,
    });
    expect(Number.isNaN(Date.parse(respondida.reply?.repliedAt ?? ""))).toBe(
      false,
    );
  });

  it("una respuesta ya vista no es 'nueva'; un video borrado se marca; un combo sale sin peldaño", async () => {
    const m = await activeMember();
    await insertConquerCorrection(app, m.userId, {
      status: "respondida",
      replyText: "Ok",
      repliedAt: new Date(),
      replySeenAt: new Date(),
      videoKey: null,
      videoDeletedAt: new Date(),
    });
    await insertConquerCorrection(app, m.userId, { comboKey: "push" });

    const body = await fetchList(m.token);

    const combo = body.items.find((i) => i.kind === "combo");
    expect(combo?.targetLabel).toBe("Combo Push");
    const respondida = body.items.find((i) => i.status === "respondida");
    expect(respondida).toMatchObject({
      replyUnseen: false,
      videoDeleted: true,
    });
    expect(respondida?.reply).toMatchObject({ hasVideo: false });
  });

  it("limits.pending cuenta solo las pendientes", async () => {
    const m = await activeMember();
    await insertConquerCorrection(app, m.userId);
    await insertConquerCorrection(app, m.userId);
    await insertConquerCorrection(app, m.userId, {
      status: "respondida",
      replyText: "Ok",
      repliedAt: new Date(),
    });

    const body = await fetchList(m.token);

    expect(body.limits.pending).toBe(2);
    expect(body.items).toHaveLength(3);
  });

  it("devuelve como maximo las 50 mas nuevas", async () => {
    const m = await activeMember();
    for (let i = 0; i < 52; i++) {
      await insertConquerCorrection(app, m.userId, {
        status: "respondida",
        replyText: "Ok",
        repliedAt: new Date(),
      });
    }

    const body = await fetchList(m.token);

    expect(body.items).toHaveLength(50);
    const ids = body.items.map((i) => i.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });
});

// ── (2) POST /corrections/upload-url ────────────────────────────────

describe("POST /corrections/upload-url", () => {
  it.each([
    ["video/mp4", ".mp4"],
    ["video/quicktime", ".mov"],
  ])(
    "%s: 200 con una clave propia y el tope de tamaño",
    async (contentType, ext) => {
      mockVideoStore();
      const m = await activeMember();

      const res = await uploadRaw(m.token, { contentType });

      expect(res.statusCode).toBe(200);
      const body = res.json<UploadBody>();
      expect(
        isOwnCorrectionVideoKey(body.key, TEMPLO_CTX.tenantId, m.userId),
      ).toBe(true);
      expect(body.key.endsWith(ext)).toBe(true);
      expect(body.contentType).toBe(contentType);
      expect(body.maxBytes).toBe(CORRECTION_VIDEO_MAX_BYTES);
      expect(body.maxBytes).toBe(104857600);
      expect(body.expiresIn).toBe(600);
      expect(body.uploadUrl).toContain(body.key);
    },
  );

  it.each(["video/webm", "image/jpeg", "constructor", ""])(
    "contentType %j: 400 CONQUER_VIDEO_TIPO_INVALIDO",
    async (contentType) => {
      mockVideoStore();
      const m = await activeMember();

      const res = await uploadRaw(m.token, { contentType });

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_VIDEO_TIPO_INVALIDO",
      );
    },
  );

  it("sin bucket privado: 503 CONQUER_VIDEOS_NO_DISPONIBLES (no el de fotos)", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember();

    const res = await uploadRaw(m.token, { contentType: "video/mp4" });

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
  });

  it("si el storage falla al firmar: 503 y la respuesta no nombra claves", async () => {
    mockVideoStore({
      presignPut: async () => {
        throw new Error("boom private/conquer-corrections/1/9/x.mp4");
      },
    });
    const m = await activeMember();

    const res = await uploadRaw(m.token, { contentType: "video/mp4" });

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
    expect(res.body).not.toContain("private/");
    expect(res.body).not.toContain("boom");
  });

  it("sin contentType o con un campo de mas: 400 / se descarta", async () => {
    mockVideoStore();
    const m = await activeMember();

    const sin = await uploadRaw(m.token, {});
    const conExtra = await uploadRaw(m.token, {
      contentType: "video/mp4",
      userId: 1,
    });

    expect(sin.statusCode).toBe(400);
    expect(conExtra.statusCode).toBe(200);
    expect(
      isOwnCorrectionVideoKey(
        conExtra.json<UploadBody>().key,
        TEMPLO_CTX.tenantId,
        m.userId,
      ),
    ).toBe(true);
  });
});

// ── (3) POST /corrections: el caso feliz ────────────────────────────

describe("POST /corrections: alta", () => {
  it("un escalon E2 del plan: 201, comentario recortado, pendiente y con el peldaño actual", async () => {
    mockVideoStore();
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e2");
    const key = ownKey(m.userId);

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { key, comment: "  Mirá mi codo  " }),
    );

    expect(res.statusCode).toBe(201);
    const body = res.json<CorrectionBody>();
    expect(body.kind).toBe("escalon");
    expect(body.targetLabel).toBe(`${target.group} · ${target.label}`);
    expect(body.targetLabel.startsWith(target.group)).toBe(true);
    expect(body.targetLabel).toContain("Escalón 2");
    expect(body.comment).toBe("Mirá mi codo");
    expect(body.durationSec).toBe(24);
    expect(body.status).toBe("pendiente");
    expect(body.reply).toBeNull();
    expect(body.videoDeleted).toBe(false);
    expect(body.replyUnseen).toBe(false);

    const [row] = await readCorrections(m.userId);
    expect(row.id).toBe(body.id);
    expect(row.status).toBe("pendiente");
    expect(row.videoKey).toBe(key);
    expect(row.videoSeconds).toBe(24);
    expect(row.step).toBe("e2");
    expect(row.exerciseId).toBe(target.exerciseId);
    expect(row.comboKey).toBeNull();
    expect(row.rungId).toBe(
      await currentRungId(m.userId, row.exerciseId ?? 0, "e2"),
    );
    expect(row.repliedAt).toBeNull();
    expect(row.replySeenAt).toBeNull();
  });

  it("un combo de un Espartano: 201 con 'Combo ' y sin peldaño ni escalon", async () => {
    mockVideoStore();
    const m = await activeMember();

    const res = await postCorrectionRaw(app, m.token, {
      comboKey: "vertical",
      key: ownKey(m.userId),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<CorrectionBody>();
    expect(body.kind).toBe("combo");
    expect(body.targetLabel).toBe("Combo Vertical");
    const [row] = await readCorrections(m.userId);
    expect(row).toMatchObject({
      comboKey: "vertical",
      exerciseId: null,
      step: null,
      rungId: null,
    });
  });

  it("un comentario vacio o de espacios queda en NULL; sin comentario tambien", async () => {
    mockVideoStore();
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const conEspacios = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { comment: "   " }),
    );
    const sinCampo = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId),
    );

    expect(conEspacios.statusCode).toBe(201);
    expect(conEspacios.json<CorrectionBody>().comment).toBeNull();
    expect(sinCampo.statusCode).toBe(201);
    expect(sinCampo.json<CorrectionBody>().comment).toBeNull();
    const rows = await readCorrections(m.userId);
    expect(rows.every((r) => r.comment === null)).toBe(true);
  });

  it("un .mov (video/quicktime) tambien se acepta", async () => {
    mockVideoStore({
      head: async () => ({
        contentLength: 3 * MB,
        contentType: "video/quicktime",
      }),
    });
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "hold");

    const res = await postCorrectionRaw(app, m.token, {
      ...escalonBody(target, m.userId),
      key: ownKey(m.userId, "video/quicktime"),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json<CorrectionBody>().targetLabel).toContain("Hold final");
  });

  it("el userId del body se descarta: la corrección es de quien manda el token", async () => {
    mockVideoStore();
    const m = await activeMember();
    const otro = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { userId: otro.userId }),
    );

    expect(res.statusCode).toBe(201);
    expect(await readCorrections(m.userId)).toHaveLength(1);
    expect(await readCorrections(otro.userId)).toHaveLength(0);
  });
});

// ── (4) Objetivo inválido ───────────────────────────────────────────

describe("POST /corrections: objetivo", () => {
  it("un ejercicio que NO está en su plan: 400 y no se guarda nada", async () => {
    mockVideoStore();
    const m = await activeMember("ternero", 2);
    const propios = new Set(
      (await fetchList(m.token)).targets.map((t) => t.exerciseId),
    );
    const ajeno = [...(await conquerExerciseIds(app)).values()].find(
      (id) => !propios.has(id),
    );
    expect(ajeno).toBeDefined();

    const res = await postCorrectionRaw(app, m.token, {
      exerciseId: ajeno,
      step: "e1",
      key: ownKey(m.userId),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_CORRECCION_OBJETIVO_INVALIDO",
    );
    expect(await readCorrections(m.userId)).toHaveLength(0);
  });

  describe.each([
    [
      "step e4",
      async (t: TargetBody) => ({ exerciseId: t.exerciseId, step: "e4" }),
    ],
    ["sin step", async (t: TargetBody) => ({ exerciseId: t.exerciseId })],
    ["sin exerciseId", async () => ({ step: "e1" })],
    ["un combo que no existe", async () => ({ comboKey: "inventado" })],
    [
      "exerciseId y comboKey a la vez",
      async (t: TargetBody) => ({
        exerciseId: t.exerciseId,
        step: t.step,
        comboKey: "push",
      }),
    ],
    ["ninguno", async () => ({})],
    [
      "exerciseId inexistente",
      async () => ({ exerciseId: 99999999, step: "e1" }),
    ],
  ])("%s", (_nombre, armar) => {
    it("400 CONQUER_CORRECCION_OBJETIVO_INVALIDO", async () => {
      mockVideoStore();
      const m = await activeMember();
      const target = await escalonDelPlan(m.token, "e1");

      const res = await postCorrectionRaw(app, m.token, {
        ...(await armar(target)),
        key: ownKey(m.userId),
        durationSec: 10,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_CORRECCION_OBJETIVO_INVALIDO",
      );
      expect(await readCorrections(m.userId)).toHaveLength(0);
    });
  });

  it("un combo para un Centurion (novillo): 400", async () => {
    mockVideoStore();
    const m = await activeMember("novillo", 3);

    const res = await postCorrectionRaw(app, m.token, {
      comboKey: "plancha",
      key: ownKey(m.userId),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_CORRECCION_OBJETIVO_INVALIDO",
    );
  });

  it("el objetivo se valida ANTES que el storage: 400 aunque no haya bucket", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember();

    const res = await postCorrectionRaw(app, m.token, {
      key: ownKey(m.userId),
      durationSec: 10,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_CORRECCION_OBJETIVO_INVALIDO",
    );
  });
});

// ── (5) Duración y comentario ───────────────────────────────────────

describe("POST /corrections: duración y comentario", () => {
  it.each([0, 31, 12.5, -3, 3600])(
    "durationSec %s: 400 CONQUER_VIDEO_DURACION",
    async (durationSec) => {
      mockVideoStore();
      const m = await activeMember();
      const target = await escalonDelPlan(m.token, "e1");

      const res = await postCorrectionRaw(
        app,
        m.token,
        escalonBody(target, m.userId, { durationSec }),
      );

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_VIDEO_DURACION");
      expect(await readCorrections(m.userId)).toHaveLength(0);
    },
  );

  it.each([1, 30])("durationSec %s (los bordes): 201", async (durationSec) => {
    mockVideoStore();
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { durationSec }),
    );

    expect(res.statusCode).toBe(201);
    expect(res.json<CorrectionBody>().durationSec).toBe(durationSec);
  });

  it("un comentario de 501 caracteres: 400 CONQUER_CORRECCION_COMENTARIO_LARGO", async () => {
    mockVideoStore();
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { comment: "x".repeat(501) }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_CORRECCION_COMENTARIO_LARGO",
    );
    expect(await readCorrections(m.userId)).toHaveLength(0);
  });

  it("un comentario de exactamente 500 caracteres: 201", async () => {
    mockVideoStore();
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { comment: "x".repeat(500) }),
    );

    expect(res.statusCode).toBe(201);
    expect(res.json<CorrectionBody>().comment).toHaveLength(500);
  });

  it("sin bucket privado y todo lo demas valido: 503 CONQUER_VIDEOS_NO_DISPONIBLES", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId),
    );

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
    expect(await readCorrections(m.userId)).toHaveLength(0);
  });
});

// ── (6) HEAD del objeto subido ──────────────────────────────────────

describe("POST /corrections: el video que llegó al bucket", () => {
  it("todavia no se subió (HEAD null): 409 CONQUER_VIDEO_NO_SUBIDO, sin fila y sin borrar", async () => {
    const remove = removeSpy();
    mockVideoStore({ head: async () => null, remove });
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId),
    );

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_VIDEO_NO_SUBIDO");
    expect(await readCorrections(m.userId)).toHaveLength(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    [
      "100 MB + 1 byte",
      { contentLength: 100 * MB + 1, contentType: "video/mp4" },
    ],
    ["vacio", { contentLength: 0, contentType: "video/mp4" }],
    ["otro tipo (webm)", { contentLength: 2 * MB, contentType: "video/webm" }],
    ["una imagen", { contentLength: 1024, contentType: "image/jpeg" }],
  ])(
    "%s: 400 CONQUER_VIDEO_INVALIDO, borra el objeto y no deja fila",
    async (_nombre, head) => {
      const remove = removeSpy();
      mockVideoStore({ head: async () => head, remove });
      const m = await activeMember();
      const target = await escalonDelPlan(m.token, "e1");
      const key = ownKey(m.userId);

      const res = await postCorrectionRaw(
        app,
        m.token,
        escalonBody(target, m.userId, { key }),
      );

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_VIDEO_INVALIDO");
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith(key);
      expect(await readCorrections(m.userId)).toHaveLength(0);
    },
  );

  it("exactamente 100 MB de MP4 se acepta", async () => {
    mockVideoStore({
      head: async () => ({ contentLength: 100 * MB, contentType: "video/mp4" }),
    });
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId),
    );

    expect(res.statusCode).toBe(201);
  });

  it("si el HEAD falla: 503 sin nombrar la clave y sin fila", async () => {
    mockVideoStore({
      head: async () => {
        throw new Error("AccessDenied private/conquer-corrections/1/x.mp4");
      },
    });
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId),
    );

    expect(res.statusCode).toBe(503);
    expect(res.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEOS_NO_DISPONIBLES",
    );
    expect(res.body).not.toContain("private/");
    expect(await readCorrections(m.userId)).toHaveLength(0);
  });
});

// ── (7) La clave ────────────────────────────────────────────────────

describe("POST /corrections: la clave del video", () => {
  it.each([
    ["de OTRO alumno", (_uid: number, otroUid: number) => ownKey(otroUid)],
    [
      "de otro gimnasio",
      (uid: number) =>
        privateCorrectionVideoKey({
          tenantId: TENANT_DOS,
          userId: uid,
          contentType: "video/mp4",
        }),
    ],
    [
      "de una respuesta del coach",
      (uid: number) =>
        `private/conquer-corrections/1/${uid}/coach-1-6f2b1c1e-0000-4000-8000-000000000000.mp4`,
    ],
    [
      "una foto del control",
      (uid: number) => `private/conquer/1/${uid}/1/frente-x.jpg`,
    ],
    [
      "con .. adentro",
      (uid: number) => `private/conquer-corrections/1/${uid}/../alumno-x.mp4`,
    ],
    ["inventada", () => "cualquier-cosa.mp4"],
  ])(
    "una clave %s: 400 CONQUER_VIDEO_CLAVE_INVALIDA y no toca el storage",
    async (_nombre, armarClave) => {
      const remove = removeSpy();
      mockVideoStore({ remove });
      const m = await activeMember();
      const otro = await activeMember();
      const target = await escalonDelPlan(m.token, "e1");

      const res = await postCorrectionRaw(
        app,
        m.token,
        escalonBody(target, m.userId, {
          key: armarClave(m.userId, otro.userId),
        }),
      );

      expect(res.statusCode).toBe(400);
      expect(res.json<ConquerErrorBody>().code).toBe(
        "CONQUER_VIDEO_CLAVE_INVALIDA",
      );
      expect(remove).not.toHaveBeenCalled();
      expect(await readCorrections(m.userId)).toHaveLength(0);
    },
  );

  it("la misma clave dos veces: la segunda es 409 CONQUER_VIDEO_YA_USADO y no borra el objeto", async () => {
    const remove = removeSpy();
    mockVideoStore({ remove });
    const m = await activeMember();
    const target = await escalonDelPlan(m.token, "e1");
    const key = ownKey(m.userId);

    const primera = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { key }),
    );
    const segunda = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { key }),
    );

    expect(primera.statusCode).toBe(201);
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json<ConquerErrorBody>().code).toBe(
      "CONQUER_VIDEO_YA_USADO",
    );
    expect(remove).not.toHaveBeenCalled();
    expect(await readCorrections(m.userId)).toHaveLength(1);
  });
});

// ── (8) Tope de 3 sin responder ─────────────────────────────────────

describe("tope de 3 videos sin responder (DA-42)", () => {
  async function conPendientes(n: number, respondidas = 0) {
    const m = await activeMember();
    for (let i = 0; i < n; i++) await insertConquerCorrection(app, m.userId);
    for (let i = 0; i < respondidas; i++) {
      await insertConquerCorrection(app, m.userId, {
        status: "respondida",
        replyText: "Ok",
        repliedAt: new Date(),
      });
    }
    return m;
  }

  it("con 3 pendientes, upload-url es 409 CONQUER_CORRECCIONES_TOPE", async () => {
    mockVideoStore();
    const m = await conPendientes(CORRECTION_PENDING_MAX);

    const res = await uploadRaw(m.token, { contentType: "video/mp4" });

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>()).toEqual({
      error: "Ya tenés 3 videos esperando respuesta",
      code: "CONQUER_CORRECCIONES_TOPE",
    });
  });

  it("con 3 pendientes, el tope gana al 503 de storage", async () => {
    vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "");
    const m = await conPendientes(CORRECTION_PENDING_MAX);

    const res = await uploadRaw(m.token, { contentType: "video/mp4" });

    expect(res.statusCode).toBe(409);
  });

  it("con 3 pendientes, POST es 409 TOPE, no guarda y borra el video que sobró", async () => {
    const remove = removeSpy();
    mockVideoStore({ remove });
    const m = await conPendientes(CORRECTION_PENDING_MAX);
    const target = await escalonDelPlan(m.token, "e1");
    const key = ownKey(m.userId);

    const res = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId, { key }),
    );

    expect(res.statusCode).toBe(409);
    expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_CORRECCIONES_TOPE");
    expect(await readCorrections(m.userId)).toHaveLength(3);
    expect(remove).toHaveBeenCalledWith(key);
  });

  it("con 2 pendientes y 1 respondida: upload-url y POST andan", async () => {
    mockVideoStore();
    const m = await conPendientes(2, 1);
    const target = await escalonDelPlan(m.token, "e1");

    const subida = await uploadRaw(m.token, { contentType: "video/mp4" });
    const alta = await postCorrectionRaw(
      app,
      m.token,
      escalonBody(target, m.userId),
    );

    expect(subida.statusCode).toBe(200);
    expect(alta.statusCode).toBe(201);
    const list = await fetchList(m.token);
    expect(list.limits.pending).toBe(3);
  });

  it("dos POST a la vez con 2 pendientes: uno 201, otro 409 TOPE, quedan exactamente 3 pendientes", async () => {
    const remove = removeSpy();
    mockVideoStore({ remove });
    const m = await conPendientes(2);
    const target = await escalonDelPlan(m.token, "e1");
    const keys = [ownKey(m.userId), ownKey(m.userId)];

    const [a, b] = await Promise.all(
      keys.map((key) =>
        postCorrectionRaw(app, m.token, escalonBody(target, m.userId, { key })),
      ),
    );

    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    const perdedora = a.statusCode === 409 ? a : b;
    expect(perdedora.json<ConquerErrorBody>().code).toBe(
      "CONQUER_CORRECCIONES_TOPE",
    );
    const pendientes = (await readCorrections(m.userId)).filter(
      (r) => r.status === "pendiente",
    );
    expect(pendientes).toHaveLength(3);
    // El objeto de la que perdió se borra; el de la que ganó se queda.
    const ganadora = a.statusCode === 201 ? a : b;
    const claveGanadora = pendientes.find(
      (r) => r.id === ganadora.json<CorrectionBody>().id,
    )?.videoKey;
    expect(claveGanadora).toBeDefined();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalledWith(claveGanadora);
  });
});

// ── (9) Alumno sin Conquer activo ───────────────────────────────────

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
  ])("%s: 409 CONQUER_NO_ACTIVO en las 3 rutas", async (_nombre, crear) => {
    mockVideoStore();
    const socio = await crear();

    const lista = await listRaw(socio.token);
    const subida = await uploadRaw(socio.token, { contentType: "video/mp4" });
    const alta = await postCorrectionRaw(app, socio.token, {
      exerciseId: 1,
      step: "e1",
      key: ownKey(socio.id),
      durationSec: 10,
    });

    for (const res of [lista, subida, alta]) {
      expect(res.statusCode).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
    }
    expect(await readCorrections(socio.id)).toHaveLength(0);
  });
});

// ── (10) Aislamiento ────────────────────────────────────────────────

describe("aislamiento (T-201-124, T-201-127)", () => {
  it("el GET no muestra las correcciones de otro alumno del mismo gimnasio", async () => {
    const a = await activeMember();
    const b = await activeMember();
    const deA = await insertConquerCorrection(app, a.userId);
    await insertConquerCorrection(app, b.userId);

    const listaA = await fetchList(a.token);
    const listaB = await fetchList(b.token);

    expect(listaA.items.map((i) => i.id)).toEqual([deA]);
    expect(listaB.items).toHaveLength(1);
    expect(listaB.items[0].id).not.toBe(deA);
    expect(listaB.limits.pending).toBe(1);
  });

  it("el tope es por alumno: las pendientes de otro no cuentan", async () => {
    mockVideoStore();
    const a = await activeMember();
    const b = await activeMember();
    for (let i = 0; i < CORRECTION_PENDING_MAX; i++) {
      await insertConquerCorrection(app, a.userId);
    }

    const res = await uploadRaw(b.token, { contentType: "video/mp4" });

    expect(res.statusCode).toBe(200);
  });

  it("un gimnasio sin el módulo templo-training: 404 en las 3 rutas", async () => {
    const [socio] = gym2.socios;
    const activo = await activeMember();
    await insertConquerCorrection(app, activo.userId);

    const lista = await listRaw(socio.token);
    const subida = await uploadRaw(socio.token, { contentType: "video/mp4" });
    const alta = await postCorrectionRaw(app, socio.token, {
      comboKey: "push",
      key: ownKey(socio.id),
      durationSec: 10,
    });

    expect([lista.statusCode, subida.statusCode, alta.statusCode]).toEqual([
      404, 404, 404,
    ]);
  });

  it("un alumno del gimnasio 2 con el módulo prendido nunca ve las filas del gimnasio 1", async () => {
    mockVideoStore();
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
    const [socio] = gym2.socios;
    const activo = await activeMember();
    await insertConquerCorrection(app, activo.userId);

    const lista = await listRaw(socio.token);
    const subida = await uploadRaw(socio.token, { contentType: "video/mp4" });
    const alta = await postCorrectionRaw(app, socio.token, {
      comboKey: "push",
      key: ownKey(activo.userId),
      durationSec: 10,
    });

    // No tiene Conquer activo en SU gimnasio: 409, nunca 200 con filas ajenas.
    for (const res of [lista, subida, alta]) {
      expect(res.statusCode).toBe(409);
      expect(res.json<ConquerErrorBody>().code).toBe("CONQUER_NO_ACTIVO");
      expect(res.body).not.toContain("items");
    }
    const delGimnasio1 = await app.db
      .select({ id: schema.conquerCorrections.id })
      .from(schema.conquerCorrections)
      .where(tenantWhere(schema.conquerCorrections, { tenantId: TENANT_DOS }));
    expect(delGimnasio1).toHaveLength(0);
  });
});

// ── (11) Sin token y cuerpos que no son objeto ──────────────────────

describe("sin token y cuerpos inválidos", () => {
  it.each([
    ["GET", CONQUER_CORRECTIONS_URL],
    ["POST", UPLOAD_URL],
    ["POST", CONQUER_CORRECTIONS_URL],
  ] as const)("%s %s sin token: 401", async (method, url) => {
    const res = await app.inject({
      method,
      url,
      payload: method === "POST" ? {} : undefined,
    });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ["una lista", "[1,2]"],
    ["un texto", '"hola"'],
    ["un numero", "7"],
  ])("POST /corrections con %s como cuerpo: 400", async (_nombre, payload) => {
    mockVideoStore();
    const m = await activeMember();

    const res = await app.inject({
      method: "POST",
      url: CONQUER_CORRECTIONS_URL,
      headers: { ...auth(m.token), "content-type": "application/json" },
      payload,
    });

    expect(res.statusCode).toBe(400);
  });

  it.each([
    ["sin key", { comboKey: "push", durationSec: 10 }],
    ["sin durationSec", { comboKey: "push", key: "x" }],
    ["key vacia", { comboKey: "push", key: "", durationSec: 10 }],
    ["durationSec texto", { comboKey: "push", key: "x", durationSec: "diez" }],
  ])("POST /corrections %s: 400", async (_nombre, body) => {
    mockVideoStore();
    const m = await activeMember();

    const res = await postCorrectionRaw(app, m.token, body);

    expect(res.statusCode).toBe(400);
  });
});
