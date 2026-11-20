/**
 * Fase 215 (plan 06; SC-1, SC-2, SC-4, SC-5, SC-8, D-02, D-04, D-05, D-06, D-07,
 * D-08, D-09, D-12, D-14, D-16) — las rutas del regalo de Aura del alumno:
 *   GET  /api/members/aura/gifts/pending
 *   GET  /api/members/aura/gifts/candidates?attendanceId=
 *   POST /api/members/aura/gifts
 *
 * Integración desde la ruta, con la clase de AYER ya terminada salvo que el caso
 * diga otra cosa. Fechas relativas al día local de la sede (nada fijo) y personas
 * por fábrica (ningún id de `users` hardcodeado). Corre en CI.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { addDays } from "../../src/modules/shared/date-utils";
import { giftWeekRange } from "../../src/modules/aura/gift-rules";
import {
  TENANT_DOS,
  limpiarSegundoGimnasio,
  seedSecondTenant,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  clearModuleFlags,
  restoreTemploFlags,
  setModuleFlag,
} from "../fixtures/module-flags";
import {
  GIFT_CTX,
  cleanupGiftClasses,
  clearFirstName,
  earnedOf,
  ledgerSum,
  seedAttendance,
  seedBooking,
  seedGift,
  seedGiftClass,
  seedGiftPlan,
  seedMember,
  seedMemberWithPlan,
  setCommunityVisible,
  type GiftClass,
} from "./_gift-fixtures";

const PASSWORD = "pass123456";

interface PendingBody {
  unavailableReason: "oculto" | null;
  pending: Array<{
    attendanceId: number;
    sessionDate: string;
    startTime: string;
    activityName: string;
    expiresOn: string;
  }>;
  givenToday: Array<{
    attendanceId: number;
    receiver: {
      firstName: string;
      lastInitial: string | null;
      photoUrl: string | null;
      anonymous: boolean;
    };
    reason: string;
    amount: number;
  }>;
}

interface Candidate {
  receiverAttendanceId: number;
  firstName: string;
  lastInitial: string | null;
  photoUrl: string | null;
  blockedReason: string | null;
}

interface CandidatesBody {
  class: { sessionDate: string; startTime: string; activityName: string };
  candidates: Candidate[];
}

interface ErrorBody {
  error: string;
  message: string;
  code: string;
}

interface Participante {
  id: number;
  email: string;
  firstName: string;
  attendanceId: number;
}

describe("Fase 215-06: rutas del regalo del alumno", () => {
  let app: FastifyInstance;
  let gym2: SegundoGimnasio;
  let planId: number;
  let cls: GiftClass;
  const extraClasses: GiftClass[] = [];

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    gym2 = await seedSecondTenant(app);
    planId = await seedGiftPlan(app);
    cls = await seedGiftClass(app);
  });

  afterEach(async () => {
    await clearModuleFlags(app, TENANT_DOS);
  });

  afterAll(async () => {
    await restoreTemploFlags(app);
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await cleanupGiftClasses(app, extraClasses);
    await app.close();
  });

  // ── Siembra ────────────────────────────────────────────────────────────────

  /** Alumno con plan en vigor que fue a la clase `clase` (quien da el regalo). */
  async function dador(clase: GiftClass = cls): Promise<Participante> {
    const person = await seedMemberWithPlan(app, {
      branchId: clase.branchId,
      planId,
      today: clase.today,
    });
    const attendanceId = await seedAttendance(app, {
      memberId: person.id,
      branchId: clase.branchId,
      scheduleId: clase.scheduleId,
      sessionDate: clase.sessionDate,
    });
    return { ...person, attendanceId };
  }

  /** Compañero (sin plan) con asistencia en la clase `clase`. */
  async function companiero(
    clase: GiftClass = cls,
    campos: Partial<Omit<Parameters<typeof seedMember>[1], "branchId">> = {},
    asistencia: {
      source?: "qr" | "manual" | "wellhub" | "wellhub_manual";
      checkedInAt?: Date;
    } = {},
  ): Promise<Participante> {
    const person = await seedMember(app, {
      branchId: clase.branchId,
      status: "activo",
      ...campos,
    });
    const attendanceId = await seedAttendance(app, {
      memberId: person.id,
      branchId: clase.branchId,
      scheduleId: clase.scheduleId,
      sessionDate: clase.sessionDate,
      source: asistencia.source,
      checkedInAt: asistencia.checkedInAt,
    });
    return { ...person, attendanceId };
  }

  /** Clase nueva (otro horario de la misma sede) en la fecha `dateOffset`. */
  async function otraClase(
    opts: Parameters<typeof seedGiftClass>[1] = {},
  ): Promise<GiftClass> {
    const nueva = await seedGiftClass(app, opts);
    extraClasses.push(nueva);
    return nueva;
  }

  async function hacerStaff(userId: number): Promise<void> {
    await app.db
      .update(schema.users)
      .set({ role: "coach" })
      .where(
        and(tenantWhere(schema.users, GIFT_CTX), eq(schema.users.id, userId)),
      );
  }

  // ── Pedidos ────────────────────────────────────────────────────────────────

  function tokenDe(persona: { email: string }): Promise<string> {
    return getAuthToken(app, persona.email, PASSWORD);
  }

  async function getPending(
    token: string,
  ): Promise<{ statusCode: number; body: PendingBody }> {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/aura/gifts/pending",
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: res.json() as PendingBody };
  }

  async function getCandidates(
    token: string,
    attendanceId: number,
  ): Promise<{
    statusCode: number;
    body: CandidatesBody & ErrorBody;
    raw: string;
  }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/members/aura/gifts/candidates?attendanceId=${attendanceId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body: res.json() as CandidatesBody & ErrorBody,
      raw: res.body,
    };
  }

  async function postGift(
    token: string,
    payload: Record<string, unknown>,
  ): Promise<{
    statusCode: number;
    body: ErrorBody & { receiverFirstName: string; reason: string };
  }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/members/aura/gifts",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return {
      statusCode: res.statusCode,
      body: res.json() as ErrorBody & {
        receiverFirstName: string;
        reason: string;
      },
    };
  }

  async function auraEarnedFromMe(token: string): Promise<number | null> {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    return (res.json() as { auraEarned: number | null }).auraEarned;
  }

  /** Suma del ledger con la condición de Aura ganada escrita a mano (SQL crudo). */
  async function ledgerGanadoCrudo(userId: number): Promise<number> {
    const [rows] = await app.dbPool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM aura_transactions
        WHERE tenant_id = ? AND user_id = ?
          AND NOT (source_type = 'subscription_discount'
                   OR (source_type = 'manual_adjustment' AND reference_type <=> 'subscription'))`,
      [GIFT_CTX.tenantId, userId],
    );
    return Number((rows as Array<{ total: string | number }>)[0]?.total ?? 0);
  }

  async function filasDelRegalo(giverAttendanceId: number) {
    return app.db
      .select({
        id: schema.auraGifts.id,
        status: schema.auraGifts.status,
        amount: schema.auraGifts.amount,
      })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, GIFT_CTX),
          eq(schema.auraGifts.giverAttendanceId, giverAttendanceId),
        ),
      );
  }

  // ── 1 y 2. pending ─────────────────────────────────────────────────────────

  describe("GET /gifts/pending", () => {
    it("lista la clase de ayer (vence hoy) y la de hoy ya terminada, y no la de anteayer", async () => {
      const g = await dador();
      await companiero();
      const hoy = await otraClase({
        dateOffset: 0,
        startTime: "00:00",
        endTime: "00:01",
      });
      const anteayer = await otraClase({ dateOffset: -2 });
      const asistenciaHoy = await seedAttendance(app, {
        memberId: g.id,
        branchId: hoy.branchId,
        scheduleId: hoy.scheduleId,
        sessionDate: hoy.sessionDate,
      });
      await companiero(hoy);
      const asistenciaAnteayer = await seedAttendance(app, {
        memberId: g.id,
        branchId: anteayer.branchId,
        scheduleId: anteayer.scheduleId,
        sessionDate: anteayer.sessionDate,
      });
      await companiero(anteayer);

      const res = await getPending(await tokenDe(g));

      expect(res.statusCode).toBe(200);
      const ids = res.body.pending.map((p) => p.attendanceId);
      expect(ids).toContain(g.attendanceId);
      expect(ids).toContain(asistenciaHoy);
      expect(ids).not.toContain(asistenciaAnteayer);
      const deAyer = res.body.pending.find(
        (p) => p.attendanceId === g.attendanceId,
      );
      expect(deAyer?.expiresOn).toBe(cls.today);
      expect(deAyer?.sessionDate).toBe(cls.sessionDate);
      expect(deAyer?.activityName).toBe("General");
      expect(typeof deAyer?.startTime).toBe("string");
      expect(res.body.givenToday).toEqual([]);
      // Cada ítem trae exactamente los campos del contrato.
      for (const item of res.body.pending) {
        expect(Object.keys(item).sort()).toEqual([
          "activityName",
          "attendanceId",
          "expiresOn",
          "sessionDate",
          "startTime",
        ]);
      }
    });

    it("no lista una clase de hoy que todavía no terminó", async () => {
      const g = await dador();
      await companiero();
      const enCurso = await otraClase({
        dateOffset: 0,
        startTime: "23:00",
        endTime: "23:59",
      });
      const asistenciaEnCurso = await seedAttendance(app, {
        memberId: g.id,
        branchId: enCurso.branchId,
        scheduleId: enCurso.scheduleId,
        sessionDate: enCurso.sessionDate,
      });
      await companiero(enCurso);

      const res = await getPending(await tokenDe(g));

      const ids = res.body.pending.map((p) => p.attendanceId);
      expect(ids).toContain(g.attendanceId);
      expect(ids).not.toContain(asistenciaEnCurso);
    });
  });

  // ── 3. candidates ──────────────────────────────────────────────────────────

  describe("GET /gifts/candidates", () => {
    it("devuelve a los compañeros en orden, sin quien da, staff, oculto ni prueba, y solo los campos del contrato", async () => {
      const g = await dador();
      const hace3h = new Date(Date.now() - 3 * 3600 * 1000);
      const hace2h = new Date(Date.now() - 2 * 3600 * 1000);
      const hace1h = new Date(Date.now() - 1 * 3600 * 1000);
      const a = await companiero(cls, {}, { checkedInAt: hace3h });
      const b = await companiero(cls, {}, { checkedInAt: hace2h });
      const wellhub = await companiero(
        cls,
        { status: "wellhub" },
        { source: "wellhub", checkedInAt: hace1h },
      );
      const staff = await companiero();
      await hacerStaff(staff.id);
      const oculto = await companiero();
      await setCommunityVisible(app, oculto.id, false);
      const deprueba = await companiero();
      await seedBooking(app, {
        memberId: deprueba.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
        isTrial: true,
      });

      const res = await getCandidates(await tokenDe(g), g.attendanceId);

      expect(res.statusCode).toBe(200);
      expect(res.body.class.sessionDate).toBe(cls.sessionDate);
      expect(res.body.class.activityName).toBe("General");
      const ids = res.body.candidates.map((c) => c.receiverAttendanceId);
      expect(ids).toEqual([
        a.attendanceId,
        b.attendanceId,
        wellhub.attendanceId,
      ]);
      expect(ids).not.toContain(g.attendanceId);
      for (const c of res.body.candidates) {
        expect(Object.keys(c).sort()).toEqual([
          "blockedReason",
          "firstName",
          "lastInitial",
          "photoUrl",
          "receiverAttendanceId",
        ]);
        expect(c.blockedReason).toBeNull();
        expect(c.lastInitial).toBe("A");
      }
      expect(res.body.candidates[0]?.firstName).toBe(a.firstName);
      // Privacidad (D-08): ni apellido, ni teléfono, ni email, ni ids de usuario.
      expect(res.raw).not.toContain("lastName");
      expect(res.raw).not.toContain("Apellido");
      expect(res.raw).not.toContain("phone");
      expect(res.raw).not.toContain("email");
      expect(res.raw).not.toContain("@test.com");
      expect(res.raw).not.toContain("userId");
    });
  });

  // ── 4 y 5. dar el regalo ───────────────────────────────────────────────────

  describe("POST /gifts", () => {
    it("201 con motivo válido: el receptor suma 1 y el dador no cambia (D-09)", async () => {
      const g = await dador();
      const a = await companiero();

      const res = await postGift(await tokenDe(g), {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "tecnica",
      });

      expect(res.statusCode).toBe(201);
      // El 201 expone solo nombre de pila y motivo.
      expect(res.body).toEqual({
        receiverFirstName: a.firstName,
        reason: "tecnica",
      });

      const [gift] = await filasDelRegalo(g.attendanceId);
      expect(gift?.status).toBe("vigente");
      expect(gift?.amount).toBe(1);

      const ledgerReceptor = await app.db
        .select({
          sourceType: schema.auraTransactions.sourceType,
          referenceType: schema.auraTransactions.referenceType,
          referenceId: schema.auraTransactions.referenceId,
          amount: schema.auraTransactions.amount,
        })
        .from(schema.auraTransactions)
        .where(
          and(
            tenantWhere(schema.auraTransactions, GIFT_CTX),
            eq(schema.auraTransactions.userId, a.id),
          ),
        );
      expect(ledgerReceptor).toEqual([
        {
          sourceType: "social",
          referenceType: "aura_gift",
          referenceId: gift?.id,
          amount: 1,
        },
      ]);
      expect(await earnedOf(app, a.id)).toBe(1);
      expect(await ledgerSum(app, a.id)).toBe(1);

      // El dador no pierde ni gana nada: ni ledger ni saldo.
      expect(await ledgerSum(app, g.id)).toBe(0);
      expect(await earnedOf(app, g.id)).toBe(0);
      const saldoDador = await app.db
        .select({ balance: schema.auraBalances.balance })
        .from(schema.auraBalances)
        .where(
          and(
            tenantWhere(schema.auraBalances, GIFT_CTX),
            eq(schema.auraBalances.userId, g.id),
          ),
        );
      expect(saldoDador.every((row) => row.balance === 0)).toBe(true);
    });

    it("un segundo POST por la misma asistencia da 409 REGALO_YA_DADO, y pending lo pasa a 'Le diste Aura'", async () => {
      const g = await dador();
      const a = await companiero();
      const b = await companiero();
      const token = await tokenDe(g);
      const primero = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "constancia",
      });
      expect(primero.statusCode).toBe(201);

      const segundo = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: b.attendanceId,
        reason: "tecnica",
      });
      const pendientes = await getPending(token);
      const caras = await getCandidates(token, g.attendanceId);

      expect(segundo.statusCode).toBe(409);
      expect(segundo.body.code).toBe("REGALO_YA_DADO");
      expect(await ledgerSum(app, b.id)).toBe(0);
      expect(pendientes.body.pending.map((p) => p.attendanceId)).not.toContain(
        g.attendanceId,
      );
      expect(pendientes.body.givenToday).toEqual([
        {
          attendanceId: g.attendanceId,
          receiver: {
            firstName: a.firstName,
            lastInitial: "A",
            photoUrl: null,
            anonymous: false,
          },
          reason: "constancia",
          amount: 1,
        },
      ]);
      // Las caras de una clase ya regalada también se rechazan.
      expect(caras.statusCode).toBe(409);
      expect(caras.body.code).toBe("REGALO_YA_DADO");
    });

    it("ME-01 y #38: si quien recibió hoy está oculto, o no tiene nombre, la card de hoy no lo nombra ni muestra su foto", async () => {
      const g = await dador();
      const oculto = await companiero();
      const token = await tokenDe(g);
      const dado = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: oculto.attendanceId,
        reason: "constancia",
      });
      expect(dado.statusCode).toBe(201);

      // Normal: se nombra.
      const normal = await getPending(token);
      expect(normal.body.givenToday[0].receiver.anonymous).toBe(false);
      expect(normal.body.givenToday[0].receiver.firstName).toBe(
        oculto.firstName,
      );

      // Oculto después del regalo: anónimo, con monto y motivo.
      await setCommunityVisible(app, oculto.id, false);
      const conOculto = await getPending(token);
      expect(conOculto.body.givenToday).toEqual([
        {
          attendanceId: g.attendanceId,
          receiver: {
            firstName: "",
            lastInitial: null,
            photoUrl: null,
            anonymous: true,
          },
          reason: "constancia",
          amount: 1,
        },
      ]);
      expect(JSON.stringify(conOculto.body)).not.toContain(oculto.firstName);

      // Visible otra vez pero sin nombre de pila cargado: sigue anónimo.
      await setCommunityVisible(app, oculto.id, true);
      await clearFirstName(app, oculto.id);
      const sinNombre = await getPending(token);
      expect(sinNombre.body.givenToday[0].receiver).toEqual({
        firstName: "",
        lastInitial: null,
        photoUrl: null,
        anonymous: true,
      });
    });

    // ── 6 y 7. tope semanal ─────────────────────────────────────────────────

    it("tope semanal: con 2 regalos vigentes a la misma persona la cara sale bloqueada y el POST da 409; si uno está anulado, pasa", async () => {
      const g = await dador();
      const a = await companiero();
      const b = await companiero();
      const comunes = {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
      };
      const primero = await seedGift(app, comunes);
      await seedGift(app, comunes);
      const token = await tokenDe(g);

      const caras = await getCandidates(token, g.attendanceId);
      const bloqueado = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "ayudo",
      });

      expect(caras.statusCode).toBe(200);
      const cara = (id: number) =>
        caras.body.candidates.find((c) => c.receiverAttendanceId === id);
      expect(cara(a.attendanceId)?.blockedReason).toBe("tope_semanal");
      expect(cara(b.attendanceId)?.blockedReason).toBeNull();
      expect(bloqueado.statusCode).toBe(409);
      expect(bloqueado.body.code).toBe("REGALO_TOPE_SEMANAL");

      // Con uno anulado quedan solo los vigentes: 1 de 2, y el POST pasa.
      await app.db
        .update(schema.auraGifts)
        .set({ status: "anulado" })
        .where(
          and(
            tenantWhere(schema.auraGifts, GIFT_CTX),
            eq(schema.auraGifts.id, primero),
          ),
        );
      const pasa = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "ayudo",
      });
      expect(pasa.statusCode).toBe(201);
    });

    it("los regalos de la semana anterior no cuentan para el tope", async () => {
      const g = await dador();
      const a = await companiero();
      const semanaAnterior = addDays(giftWeekRange(cls.sessionDate).start, -1);
      const comunes = {
        giverUserId: g.id,
        receiverUserId: a.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: semanaAnterior,
      };
      await seedGift(app, comunes);
      await seedGift(app, comunes);
      const token = await tokenDe(g);

      const caras = await getCandidates(token, g.attendanceId);
      const res = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "energia",
      });

      expect(caras.body.candidates[0]?.blockedReason).toBeNull();
      expect(res.statusCode).toBe(201);
    });

    // ── 8. plazo ────────────────────────────────────────────────────────────

    it("una clase de anteayer da 409 REGALO_VENCIDO en candidates y en el POST", async () => {
      const anteayer = await otraClase({ dateOffset: -2 });
      const g = await dador(anteayer);
      const a = await companiero(anteayer);
      const token = await tokenDe(g);

      const caras = await getCandidates(token, g.attendanceId);
      const res = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "tecnica",
      });

      expect(caras.statusCode).toBe(409);
      expect(caras.body.code).toBe("REGALO_VENCIDO");
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe("REGALO_VENCIDO");
      expect(await ledgerSum(app, a.id)).toBe(0);
    });

    // ── 9. receptores no válidos ────────────────────────────────────────────

    it("receptor que no fue a esa clase, oculto, staff o uno mismo: 409 REGALO_NO_DISPONIBLE", async () => {
      const g = await dador();
      const ajenoALaClase = await otraClase();
      const queFueAOtra = await companiero(ajenoALaClase);
      const oculto = await companiero();
      await setCommunityVisible(app, oculto.id, false);
      const staff = await companiero();
      await hacerStaff(staff.id);
      const token = await tokenDe(g);

      const objetivos = [
        queFueAOtra.attendanceId,
        oculto.attendanceId,
        staff.attendanceId,
        g.attendanceId,
      ];
      for (const receiverAttendanceId of objetivos) {
        const res = await postGift(token, {
          attendanceId: g.attendanceId,
          receiverAttendanceId,
          reason: "tecnica",
        });
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe("REGALO_NO_DISPONIBLE");
      }
      expect(await ledgerSum(app, queFueAOtra.id)).toBe(0);
      expect(await ledgerSum(app, oculto.id)).toBe(0);
      expect(await ledgerSum(app, staff.id)).toBe(0);
      expect(await filasDelRegalo(g.attendanceId)).toEqual([]);
    });

    // ── 10. dador sin acceso ────────────────────────────────────────────────

    it("dador oculto: pending vacío y POST 409 REGALO_NO_DISPONIBLE", async () => {
      const g = await dador();
      const a = await companiero();
      await setCommunityVisible(app, g.id, false);
      const token = await tokenDe(g);

      const pendientes = await getPending(token);
      const res = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "tecnica",
      });

      expect(pendientes.statusCode).toBe(200);
      // #31: oculto con plan y con una clase por regalar: la app le explica por qué.
      expect(pendientes.body).toEqual({
        pending: [],
        givenToday: [],
        unavailableReason: "oculto",
      });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe("REGALO_NO_DISPONIBLE");
    });

    it("#31: oculto con plan pero sin ninguna clase por regalar no ve el texto (unavailableReason null)", async () => {
      // Sin compañeros en la clase no habría oferta que tapar.
      const g = await dador();
      await setCommunityVisible(app, g.id, false);

      const pendientes = await getPending(await tokenDe(g));

      expect(pendientes.statusCode).toBe(200);
      expect(pendientes.body).toEqual({
        pending: [],
        givenToday: [],
        unavailableReason: null,
      });
    });

    it("#31: volver a aparecer en las listas devuelve la oferta y apaga el texto", async () => {
      const g = await dador();
      await companiero();
      await setCommunityVisible(app, g.id, false);
      const token = await tokenDe(g);
      expect((await getPending(token)).body.unavailableReason).toBe("oculto");

      await setCommunityVisible(app, g.id, true);
      const despues = await getPending(token);

      expect(despues.body.unavailableReason).toBeNull();
      expect(despues.body.pending.map((p) => p.attendanceId)).toContain(
        g.attendanceId,
      );
    });

    it("dador sin plan vigente: pending vacío y POST 409 REGALO_NO_DISPONIBLE", async () => {
      const sinPlan = await companiero(cls, { status: "freemium" });
      const a = await companiero();
      const token = await tokenDe(sinPlan);

      const pendientes = await getPending(token);
      const res = await postGift(token, {
        attendanceId: sinPlan.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "tecnica",
      });

      // #31: sin plan (o Wellhub sin plan) no se le muestra nada.
      expect(pendientes.body).toEqual({
        pending: [],
        givenToday: [],
        unavailableReason: null,
      });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe("REGALO_NO_DISPONIBLE");
    });

    it("#31: oculto y sin plan vigente no ve el texto de 'activá Aparecer en las listas' (unavailableReason null)", async () => {
      const sinPlan = await companiero(cls, { status: "freemium" });
      await companiero();
      await setCommunityVisible(app, sinPlan.id, false);

      const pendientes = await getPending(await tokenDe(sinPlan));

      expect(pendientes.body.unavailableReason).toBeNull();
    });

    // ── 11. asistencia ajena ────────────────────────────────────────────────

    it("la asistencia de otra persona en attendanceId da 404 REGALO_NO_ENCONTRADO", async () => {
      const g = await dador();
      const a = await companiero();
      const token = await tokenDe(g);

      const caras = await getCandidates(token, a.attendanceId);
      const res = await postGift(token, {
        attendanceId: a.attendanceId,
        receiverAttendanceId: g.attendanceId,
        reason: "tecnica",
      });

      expect(caras.statusCode).toBe(404);
      expect(caras.body.code).toBe("REGALO_NO_ENCONTRADO");
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe("REGALO_NO_ENCONTRADO");
      expect(await ledgerSum(app, g.id)).toBe(0);
      expect(await ledgerSum(app, a.id)).toBe(0);
    });

    // ── 12. validación del body ─────────────────────────────────────────────

    it("un motivo fuera de la lista da 400 y no se acredita nada", async () => {
      const g = await dador();
      const a = await companiero();
      const token = await tokenDe(g);

      const res = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "porque_si",
      });
      const sinMotivo = await postGift(token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
      });

      expect(res.statusCode).toBe(400);
      expect(sinMotivo.statusCode).toBe(400);
      expect(await ledgerSum(app, a.id)).toBe(0);
      expect(await filasDelRegalo(g.attendanceId)).toEqual([]);
    });
  });

  // ── 13. aislamiento entre gimnasios ────────────────────────────────────────

  describe("aislamiento entre gimnasios", () => {
    it("un socio del gimnasio 2 no puede usar una asistencia del gimnasio 1 ni ve a sus compañeros", async () => {
      await setModuleFlag(app, TENANT_DOS, "templo-gamification", true);
      const g = await dador();
      const a = await companiero();
      const intruso = gym2.socios[0];

      const pendientes = await getPending(intruso.token);
      const caras = await getCandidates(intruso.token, g.attendanceId);
      const res = await postGift(intruso.token, {
        attendanceId: g.attendanceId,
        receiverAttendanceId: a.attendanceId,
        reason: "tecnica",
      });

      expect(pendientes.statusCode).toBe(200);
      expect(pendientes.body).toEqual({
        pending: [],
        givenToday: [],
        unavailableReason: null,
      });
      expect(caras.statusCode).toBe(404);
      expect(caras.body.code).toBe("REGALO_NO_ENCONTRADO");
      expect(caras.raw).not.toContain(a.firstName);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe("REGALO_NO_ENCONTRADO");
      expect(await ledgerSum(app, a.id)).toBe(0);
      expect(await filasDelRegalo(g.attendanceId)).toEqual([]);
    });
  });

  // ── 14 y 15. sin tope de lo recibido y conciliación ────────────────────────

  describe("lo que se recibe y la conciliación", () => {
    it("no hay tope de lo que se recibe (D-06): tres dadores le regalan a la misma persona y suma +3, y todo concilia (SC-8)", async () => {
      const clase2 = await otraClase();
      const clase3 = await otraClase();
      const receptor = await seedMember(app, {
        branchId: cls.branchId,
        status: "activo",
      });
      const dadores: Participante[] = [];
      const asistenciasDelReceptor: number[] = [];
      for (const clase of [cls, clase2, clase3]) {
        dadores.push(await dador(clase));
        asistenciasDelReceptor.push(
          await seedAttendance(app, {
            memberId: receptor.id,
            branchId: clase.branchId,
            scheduleId: clase.scheduleId,
            sessionDate: clase.sessionDate,
          }),
        );
      }

      for (const [i, giver] of dadores.entries()) {
        const res = await postGift(await tokenDe(giver), {
          attendanceId: giver.attendanceId,
          receiverAttendanceId: asistenciasDelReceptor[i] ?? 0,
          reason: "energia",
        });
        expect(res.statusCode).toBe(201);
      }

      expect(await ledgerSum(app, receptor.id)).toBe(3);
      expect(await earnedOf(app, receptor.id)).toBe(3);

      // Conciliación: la Aura ganada de /auth/me, la del helper y la suma cruda
      // del ledger coinciden para cada persona tocada.
      const tocados = [receptor, ...dadores];
      for (const persona of tocados) {
        const token = await tokenDe(persona);
        const deMe = await auraEarnedFromMe(token);
        const esperado = await ledgerGanadoCrudo(persona.id);
        expect(deMe).toBe(esperado);
        expect(await earnedOf(app, persona.id)).toBe(esperado);
      }
      // Quien regala no cambia: ninguna fila en su ledger (D-09).
      for (const giver of dadores) {
        expect(await ledgerSum(app, giver.id)).toBe(0);
      }
    });
  });

  // ── Topes de pedidos (T-215-06-02) ─────────────────────────────────────────

  describe("tope de pedidos", () => {
    it("el tope por usuario de candidates corta con 429 después de 30 pedidos", async () => {
      const g = await dador();
      const token = await tokenDe(g);
      const inexistente = 9_999_999;

      let ultimo = 0;
      for (let i = 0; i < 31; i += 1) {
        const res = await getCandidates(token, inexistente);
        ultimo = res.statusCode;
        if (i < 30) expect(res.statusCode).toBe(404);
      }

      expect(ultimo).toBe(429);
    });
  });
});
