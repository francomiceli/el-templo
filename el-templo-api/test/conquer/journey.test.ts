/**
 * Fase 201 Plan 24 (S12-1..S12-8, D-12, D-15, D-16, D-17, T-201-45): recorrido
 * de punta a punta del API de Conquer. Encadena lo que los tests por ruta
 * prueban por separado, con los contratos reales:
 *
 *   socio sin plan -> bloqueado -> pedido -> alta Toro 4 días (48 escalones)
 *   -> día 0 al primer ingreso -> "Lo hago después" -> historial 6, 7, 8 ->
 *   Hoy precargado (8) -> guardar con apertura -> SUBIR -> Subir -> molestia 4
 *   -> tablero rojo con propuesta de etapa 1 -> aceptar recorte -> sábado de 9
 *   -> control de hoy + foto (R2 mockeado) -> la foto solo la ve su dueño y
 *   owner/admin.
 *
 * Integración contra el MySQL de tests. Usuarios SIEMPRE con fábricas; el
 * historial de días pasados se inserta DIRECTO con `insertConquerSession` en
 * fechas relativas a "hoy" de la sede.
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
import { tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp, createTestMember } from "../helpers";
import {
  activateViaApi,
  boardMember,
  conquerExerciseIds,
  conquerRungId,
  createConquerStaff,
  fetchBoard,
  fetchFicha,
  fetchProgress,
  fetchToday,
  insertConquerSession,
  memberToday,
  mockPrivateMedia,
  postCutRaw,
  postSubir,
  putSessionRaw,
  readConquerAlerts,
  readConquerSessions,
  readConquerSteps,
  saturdayBody,
  sessionBodyFromToday,
  TEMPLO_CTX,
  weeksAgo,
  type ConquerErrorBody,
  type SavedSessionBody,
} from "./_helpers";

const STATE_URL = "/api/members/conquer/state";
const UNLOCK_URL = "/api/members/conquer/unlock-request";
const CHECKS_URL = "/api/members/conquer/body-checks";
const REQUESTS_URL = "/api/admin/conquer/requests";

interface BodyCheckFlags {
  hasDay0: boolean;
  day0Skipped: boolean;
  mustPromptDay0: boolean;
  day0Pending: boolean;
}

interface StateBody {
  status: "bloqueado" | "pedido" | "activo";
  requestedAt: string | null;
  member: {
    level: string | null;
    daysCount: number | null;
    cutStage: number;
    bodyCheck: BodyCheckFlags;
    home: { nextDayKey: string | null; weekComplete: boolean };
  } | null;
}

interface CheckViewBody {
  id: number;
  kind: "dia0" | "periodico";
  photos: { frente: boolean; perfil: boolean; espalda: boolean };
}

interface UploadUrlBody {
  uploadUrl: string;
  key: string;
  contentType: string;
}

let app: FastifyInstance;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanAllTestData(app);
  await app.close();
});

async function getState(token: string): Promise<StateBody> {
  const res = await app.inject({
    method: "GET",
    url: STATE_URL,
    headers: auth(token),
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<StateBody>();
}

async function getCount(adminToken: string): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: `${REQUESTS_URL}/count`,
    headers: auth(adminToken),
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ count: number }>().count;
}

/**
 * Guarda la sesión de HOY del día `day` con los contadores precargados y, si el
 * día tiene combo de apertura (Toro), con la apertura precargada (D-18).
 */
async function saveDay(
  token: string,
  day: string,
  pain = 0,
): Promise<SavedSessionBody> {
  const vista = await fetchToday(app, token, day);
  const opening = vista.opening;
  const res = await putSessionRaw(app, token, {
    ...sessionBodyFromToday(vista, {}, pain),
    ...(opening === null
      ? {}
      : { opening: { rungId: opening.rungId, series: opening.value } }),
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<SavedSessionBody>();
}

describe("Conquer v2: recorrido de punta a punta (§12)", () => {
  it(
    "S12-1..S12-8: pedido, alta, día 0, Hoy, Subir, molestia, recorte, tablero y fotos",
    { timeout: 120_000 },
    async () => {
      const admin = await createConquerStaff(app, "admin");
      const toro = await createTestMember(app);
      const novillo = await createTestMember(app);

      // ── D-17 / D-12: socio SIN plan ve Bloqueado y puede pedirlo ─────
      const bloqueado = await getState(toro.token);
      expect(bloqueado).toEqual({
        status: "bloqueado",
        requestedAt: null,
        member: null,
      });
      expect(await getCount(admin.token)).toBe(0);

      const pedido = await app.inject({
        method: "POST",
        url: UNLOCK_URL,
        headers: auth(toro.token),
      });
      expect(pedido.statusCode, pedido.body).toBe(200);
      expect(pedido.json<StateBody>().status).toBe("pedido");
      expect((await getState(toro.token)).status).toBe("pedido");
      expect(await getCount(admin.token)).toBe(1);
      const lista = await app.inject({
        method: "GET",
        url: REQUESTS_URL,
        headers: auth(admin.token),
      });
      expect(lista.statusCode, lista.body).toBe(200);
      expect(
        lista
          .json<{ requests: { userId: number }[] }>()
          .requests.map((r) => r.userId),
      ).toEqual([toro.id]);

      // ── S12-1: el admin activa a Toro con 4 días -> 48 escalones ─────
      const alta = await activateViaApi(app, admin.token, toro.id, "toro", 4);
      expect(alta.statusCode, alta.body).toBe(201);
      expect(alta.json<{ status: string; level: string }>()).toMatchObject({
        status: "activo",
        level: "toro",
      });
      expect(await getCount(admin.token)).toBe(0);
      const escalones = await readConquerSteps(app, toro.id);
      expect(escalones.size).toBe(48);

      // ── S12-3: un Novillo aparte no tiene combos ni sábado ───────────
      const altaNovillo = await activateViaApi(
        app,
        admin.token,
        novillo.id,
        "novillo",
        4,
      );
      expect(altaNovillo.statusCode, altaNovillo.body).toBe(201);
      const hoyNovillo = await fetchToday(app, novillo.token);
      expect(hoyNovillo.opening).toBeNull();
      expect(hoyNovillo.saturday).toBeNull();
      expect(hoyNovillo.plan.map((d) => d.dayKey)).not.toContain("sabado");
      const sabadoNovillo = await app.inject({
        method: "GET",
        url: "/api/members/conquer/today?day=sabado",
        headers: auth(novillo.token),
      });
      expect(sabadoNovillo.statusCode, sabadoNovillo.body).toBe(400);
      expect(sabadoNovillo.json<ConquerErrorBody>().code).toBe(
        "CONQUER_DIA_INVALIDO",
      );
      const aperturaNovillo = await putSessionRaw(app, novillo.token, {
        ...sessionBodyFromToday(hoyNovillo),
        opening: {
          rungId: await conquerRungId(app, "palanca", "straddle"),
          series: 3,
        },
      });
      expect(aperturaNovillo.statusCode, aperturaNovillo.body).toBe(409);
      expect(aperturaNovillo.json<ConquerErrorBody>().code).toBe(
        "CONQUER_SIN_COMBOS",
      );

      // ── S12-8 / D-15: día 0 al primer ingreso, y "Lo hago después" ───
      const estado = await getState(toro.token);
      expect(estado.status).toBe("activo");
      expect(estado.member?.level).toBe("toro");
      expect(estado.member?.daysCount).toBe(4);
      expect(estado.member?.bodyCheck).toMatchObject({
        hasDay0: false,
        mustPromptDay0: true,
        day0Pending: false,
      });
      expect(estado.member?.home.nextDayKey).toBe("plancha");

      const saltear = await app.inject({
        method: "POST",
        url: `${CHECKS_URL}/skip-day0`,
        headers: auth(toro.token),
        payload: {},
      });
      expect(saltear.statusCode, saltear.body).toBe(200);
      expect((await getState(toro.token)).member?.bodyCheck).toMatchObject({
        mustPromptDay0: false,
        day0Skipped: true,
        day0Pending: true,
      });

      // ── S12-7: el tablero lista a los dos y avisa del día 0 pendiente ─
      const tableroInicial = await fetchBoard(app, admin.token);
      expect(tableroInicial.counts).toMatchObject({
        rojo: 0,
        amarillo: 1,
        ok: 1,
        total: 2,
      });
      const alumnoToro = boardMember(tableroInicial, toro.id);
      expect(alumnoToro.light).toBe("amarillo");
      expect(alumnoToro.alerts.map((a) => a.kind)).toContain(
        "control_dia0_pendiente",
      );
      expect(boardMember(tableroInicial, novillo.id).light).toBe("ok");

      // ── S12-2: Hoy precarga el objetivo (historial 6, 7, 8 -> 8) ─────
      const ids = await conquerExerciseIds(app);
      const pressId = ids.get("planche_press") ?? 0;
      const hoy = await memberToday(app, toro.id);
      for (const [i, value] of [6, 7, 8].entries()) {
        await insertConquerSession(app, {
          userId: toro.id,
          date: weeksAgo(hoy, 3 - i),
          dayKey: "plancha",
          steps: [{ exerciseCode: "planche_press", step: "e1", value }],
        });
      }
      const sinElegir = await fetchToday(app, toro.token);
      expect(sinElegir.dayKey).toBe("plancha"); // D-16: el primer día que falta
      expect(sinElegir.opening).not.toBeNull(); // Toro abre con combo
      const plancha = await fetchToday(app, toro.token, "plancha");
      const e1Antes = plancha.exercises
        .find((e) => e.code === "planche_press")
        ?.steps.find((s) => s.step === "e1");
      expect(e1Antes).toMatchObject({
        rungName: "tuck",
        target: 8,
        value: 8,
        estado: "techo1",
      });

      // ── S12-3 / S12-5: guardar lo precargado (con apertura) -> SUBIR ─
      const guardada = await saveDay(toro.token, "plancha");
      expect(guardada.lighting.primary.length).toBeGreaterThan(0);
      const sesiones = await readConquerSessions(app, toro.id);
      expect(
        sesiones.filter((s) => s.sessionDate === hoy).map((s) => s.dayKey),
      ).toEqual(["plancha"]);
      const conSubir = await fetchProgress(app, toro.token);
      expect(conSubir.subir).toEqual([
        {
          exerciseId: pressId,
          exerciseName: "Planche press",
          step: "e1",
          fromRungName: "tuck",
          toRungName: "adv tuck",
        },
      ]);

      // ── S12-5: Subir sin aprobación; el objetivo vuelve a 3 ──────────
      const subida = await postSubir(app, toro.token, pressId, "e1");
      expect(subida.statusCode, subida.body).toBe(200);
      expect(
        (await readConquerSteps(app, toro.id)).get("planche_press:e1"),
      ).toMatchObject({ rungCode: "adv_tuck", sinceDate: hoy });
      const tras = await fetchToday(app, toro.token, "plancha");
      expect(
        tras.exercises
          .find((e) => e.code === "planche_press")
          ?.steps.find((s) => s.step === "e1"),
      ).toMatchObject({ rungName: "adv tuck", target: 3 });
      const progresoTras = await fetchProgress(app, toro.token);
      expect(progresoTras.subir).toEqual([]);
      expect(
        progresoTras.days
          .flatMap((d) => d.exercises)
          .find((e) => e.exerciseId === pressId)
          ?.steps.find((s) => s.step === "e1"),
      ).toMatchObject({ rungName: "adv tuck", target: 3 });

      // Un segundo toque sobre el mismo escalón ya no toca subir (409)
      const dobleToque = await app.inject({
        method: "POST",
        url: `/api/members/conquer/steps/${pressId}/e1/subir`,
        headers: auth(toro.token),
      });
      expect(dobleToque.statusCode, dobleToque.body).toBe(409);
      expect(dobleToque.json<ConquerErrorBody>().code).toBe(
        "CONQUER_NO_TOCA_SUBIR",
      );

      // D-16: con plancha hecha, Hoy propone el día siguiente del plan
      expect((await fetchToday(app, toro.token)).dayKey).toBe("front");

      // ── S12-6: molestia 4 -> tablero rojo con propuesta de etapa 1 ───
      await saveDay(toro.token, "front", 4);
      const tableroRojo = await fetchBoard(app, admin.token);
      expect(tableroRojo.counts).toMatchObject({ rojo: 1, ok: 1, total: 2 });
      expect(tableroRojo.members[0]?.userId).toBe(toro.id); // rojo primero
      const rojo = boardMember(tableroRojo, toro.id);
      expect(rojo.light).toBe("rojo");
      const molestia = rojo.alerts.find((a) => a.kind === "molestia");
      expect(molestia).toMatchObject({
        severity: "rojo",
        status: "abierta",
        detail: { pain: 4, dayKey: "front" },
        proposal: { kind: "etapa", stage: 1 },
      });
      const alertId = molestia?.id ?? 0;
      expect(alertId).toBeGreaterThan(0);

      // ── S12-6: el coach acepta el recorte -> sábado de 9 series ──────
      const recorte = await postCutRaw(app, admin.token, toro.id, {
        action: "aplicar_etapa",
        alertId,
      });
      expect(recorte.statusCode, recorte.body).toBe(200);
      const ficha = await fetchFicha(app, admin.token, toro.id);
      expect(ficha.member.cutStage).toBe(1);
      expect(ficha.alerts.map((a) => a.kind)).not.toContain("molestia");
      const alertas = await readConquerAlerts(app, toro.id);
      expect(alertas.find((a) => a.id === alertId)).toMatchObject({
        status: "resuelta",
        resolvedBy: admin.id,
      });
      const sabado = await fetchToday(app, toro.token, "sabado");
      expect(sabado.saturday?.push).toMatchObject({
        target: 9,
        maxSeries: 3,
        drops: 6,
      });
      expect(sabado.saturday?.pull.target).toBe(9);
      const guardaSabado = await putSessionRaw(
        app,
        toro.token,
        saturdayBody({
          push: { rungId: sabado.saturday?.push.rungId ?? 0, series: 9 },
          pull: { rungId: sabado.saturday?.pull.rungId ?? 0, series: 9 },
        }),
      );
      expect(guardaSabado.statusCode, guardaSabado.body).toBe(200);

      // ── S12-8: control de hoy con foto (R2 privado mockeado) ─────────
      mockPrivateMedia();
      const control = await app.inject({
        method: "POST",
        url: CHECKS_URL,
        headers: auth(toro.token),
        payload: {},
      });
      expect(control.statusCode, control.body).toBe(200);
      const checkId = control.json<CheckViewBody>().id;
      const subida1 = await app.inject({
        method: "POST",
        url: `${CHECKS_URL}/${checkId}/photos/frente/upload-url`,
        headers: auth(toro.token),
        payload: { contentType: "image/jpeg" },
      });
      expect(subida1.statusCode, subida1.body).toBe(200);
      const { key } = subida1.json<UploadUrlBody>();
      const confirmada = await app.inject({
        method: "POST",
        url: `${CHECKS_URL}/${checkId}/photos/frente/confirm`,
        headers: auth(toro.token),
        payload: { key },
      });
      expect(confirmada.statusCode, confirmada.body).toBe(200);
      expect(confirmada.json<CheckViewBody>()).toMatchObject({
        id: checkId,
        kind: "dia0",
        photos: { frente: true, perfil: false, espalda: false },
      });
      // La respuesta nunca lleva la clave del objeto (T-201-45)
      expect(confirmada.body).not.toContain(key);
      expect((await getState(toro.token)).member?.bodyCheck).toMatchObject({
        hasDay0: true,
        mustPromptDay0: false,
        day0Pending: false,
      });
      const tableroFinal = await fetchBoard(app, admin.token);
      const alertasFinal = boardMember(tableroFinal, toro.id).alerts.map(
        (a) => a.kind,
      );
      expect(alertasFinal).not.toContain("control_dia0_pendiente");
      expect(alertasFinal).not.toContain("molestia");

      // ── S12-8: la foto la ven el dueño y owner/admin, nadie más ──────
      const propia = await app.inject({
        method: "GET",
        url: `${CHECKS_URL}/${checkId}/photos/frente/url`,
        headers: auth(toro.token),
      });
      expect(propia.statusCode, propia.body).toBe(200);
      const ajena = await app.inject({
        method: "GET",
        url: `${CHECKS_URL}/${checkId}/photos/frente/url`,
        headers: auth(novillo.token),
      });
      expect(ajena.statusCode, ajena.body).toBe(404);
      const adminFotoUrl = `/api/admin/conquer/members/${toro.id}/body-checks/${checkId}/photos/frente/url`;
      const deAdmin = await app.inject({
        method: "GET",
        url: adminFotoUrl,
        headers: auth(admin.token),
      });
      expect(deAdmin.statusCode, deAdmin.body).toBe(200);
      const coach = await createConquerStaff(app, "coach");
      const deCoach = await app.inject({
        method: "GET",
        url: adminFotoUrl,
        headers: auth(coach.token),
      });
      expect(deCoach.statusCode, deCoach.body).toBe(403);

      // Las 3 sesiones del recorrido quedaron guardadas y nada de otro alumno
      const sesionesFinal = await app.db
        .select({ dayKey: schema.conquerSessions.dayKey })
        .from(schema.conquerSessions)
        .where(
          and(
            tenantWhere(schema.conquerSessions, TEMPLO_CTX),
            eq(schema.conquerSessions.userId, toro.id),
            eq(schema.conquerSessions.sessionDate, hoy),
          ),
        );
      expect(sesionesFinal.map((s) => s.dayKey).sort()).toEqual([
        "front",
        "plancha",
        "sabado",
      ]);
    },
  );
});
