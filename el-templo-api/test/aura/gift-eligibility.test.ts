/**
 * Fase 215 (plan 04; D-02, D-04, D-05, D-07, D-08, D-12, D-14) — elegibilidad
 * del regalo de Aura: quién puede regalar y a quién se le puede regalar.
 *
 * Funciones de `src/modules/aura/gift-eligibility.ts` ejercidas contra la base
 * real. Fechas relativas al día local de la sede (nada fijo, salvo el caso puro
 * de `classHasEnded`, que recibe el `now` por parámetro) y personas por fábrica.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { addDays } from "../../src/modules/shared/date-utils";
import {
  classHasEnded,
  giverAccess,
  listEligibleClassmates,
  listRecentClassAttendances,
  loadClassAttendance,
  weeklyGiftCountsByReceiver,
  type ClassAttendance,
} from "../../src/modules/aura/gift-eligibility";
import { giftWeekRange } from "../../src/modules/aura/gift-rules";
import {
  GIFT_CTX,
  cleanupGiftClasses,
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

const OTRO_GIMNASIO: TenantContext = { tenantId: 987654 };

/** Misma fecha con `years` años menos. */
function yearsAgo(today: string, years: number): string {
  const md = today.slice(4) === "-02-29" ? "-02-28" : today.slice(4);
  return `${Number(today.slice(0, 4)) - years}${md}`;
}

describe("Fase 215-04: elegibilidad del regalo", () => {
  let app: FastifyInstance;
  let planId: number;
  let cls: GiftClass;
  const extraClasses: GiftClass[] = [];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await cleanupGiftClasses(app, extraClasses);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    planId = await seedGiftPlan(app);
    cls = await seedGiftClass(app);
  });

  /** Alumno con plan que fue a la clase `cls` (quien da el regalo). */
  async function darAlumno(): Promise<{ id: number; attendanceId: number }> {
    const giver = await seedMemberWithPlan(app, {
      branchId: cls.branchId,
      planId,
      today: cls.today,
    });
    const attendanceId = await seedAttendance(app, {
      memberId: giver.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
    });
    return { id: giver.id, attendanceId };
  }

  /** Compañero sin plan con asistencia en la clase `cls`. */
  async function companiero(
    campos: Partial<Omit<Parameters<typeof seedMember>[1], "branchId">> = {},
    asistencia: {
      source?: "qr" | "manual" | "wellhub" | "wellhub_manual";
    } = {},
  ): Promise<{ id: number; attendanceId: number; firstName: string }> {
    const person = await seedMember(app, {
      branchId: cls.branchId,
      status: "activo",
      ...campos,
    });
    const attendanceId = await seedAttendance(app, {
      memberId: person.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      source: asistencia.source,
    });
    return { id: person.id, attendanceId, firstName: person.firstName };
  }

  async function caras(excludeUserId: number | null) {
    return listEligibleClassmates(app.db, GIFT_CTX, {
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      excludeUserId,
      todayLocal: cls.today,
    });
  }

  // ── listEligibleClassmates (D-04, D-08) ───────────────────────────────────

  describe("listEligibleClassmates", () => {
    it("incluye a los compañeros visibles y excluye a quien da", async () => {
      const giver = await darAlumno();
      const a = await companiero();
      const b = await companiero();

      const lista = await caras(giver.id);

      expect(lista.map((c) => c.userId).sort()).toEqual([a.id, b.id].sort());
      expect(lista.some((c) => c.userId === giver.id)).toBe(false);
    });

    it("con excludeUserId null (regala el profe) devuelve a todos los elegibles", async () => {
      const a = await companiero();
      const b = await companiero();

      const lista = await caras(null);

      expect(lista.map((c) => c.userId).sort()).toEqual([a.id, b.id].sort());
    });

    it("solo expone id de usuario, id de asistencia, nombre de pila y una inicial", async () => {
      const giver = await darAlumno();
      const a = await companiero({ lastName: "Zapatero" });

      const [cara] = await caras(giver.id);

      expect(Object.keys(cara).sort()).toEqual([
        "attendanceId",
        "firstName",
        "lastInitial",
        "userId",
      ]);
      expect(cara.userId).toBe(a.id);
      expect(cara.attendanceId).toBe(a.attendanceId);
      expect(cara.firstName).toBe(a.firstName);
      expect(cara.lastInitial).toBe("Z");
      expect(JSON.stringify(cara)).not.toContain("Zapatero");
    });

    it("excluye al staff que fue a la clase como alumno", async () => {
      const giver = await darAlumno();
      const staff = await companiero();
      await app.db
        .update(schema.users)
        .set({ role: "coach" })
        .where(
          and(
            tenantWhere(schema.users, GIFT_CTX),
            eq(schema.users.id, staff.id),
          ),
        );
      const normal = await companiero();

      const lista = await caras(giver.id);

      expect(lista.map((c) => c.userId)).toEqual([normal.id]);
    });

    it("excluye a quien se ocultó (preferencia false)", async () => {
      const giver = await darAlumno();
      const oculto = await companiero();
      await setCommunityVisible(app, oculto.id, false);
      const visible = await companiero();

      const lista = await caras(giver.id);

      expect(lista.map((c) => c.userId)).toEqual([visible.id]);
    });

    it("excluye al menor sin preferencia, pero entra el menor que eligió mostrarse", async () => {
      const giver = await darAlumno();
      const menor = await companiero({ dateOfBirth: yearsAgo(cls.today, 10) });
      const menorVisible = await companiero({
        dateOfBirth: yearsAgo(cls.today, 10),
      });
      await setCommunityVisible(app, menorVisible.id, true);

      const lista = await caras(giver.id);
      const ids = lista.map((c) => c.userId);

      expect(ids).not.toContain(menor.id);
      expect(ids).toContain(menorVisible.id);
    });

    it("excluye a quien vino de prueba, aunque esa reserva esté cancelada", async () => {
      const giver = await darAlumno();
      const prueba = await companiero();
      await seedBooking(app, {
        memberId: prueba.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
        isTrial: true,
      });
      const pruebaCancelada = await companiero();
      await seedBooking(app, {
        memberId: pruebaCancelada.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
        isTrial: true,
        status: "cancelado",
      });
      const normal = await companiero();

      const lista = await caras(giver.id);

      expect(lista.map((c) => c.userId)).toEqual([normal.id]);
    });

    // Mig 0360 (caso María Eugenia Rossi): la prueba cancelada ya no se borra
    // cuando la persona, ya alumna, reserva el mismo turno. Con una reserva
    // NORMAL vigente en la clase, aparece como cualquier compañero.
    it("incluye a quien tiene la prueba cancelada y además una reserva normal vigente en la clase", async () => {
      const giver = await darAlumno();
      const yaAlumna = await companiero();
      await seedBooking(app, {
        memberId: yaAlumna.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
        isTrial: true,
        status: "cancelado",
      });
      await seedBooking(app, {
        memberId: yaAlumna.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
      });

      const lista = await caras(giver.id);

      expect(lista.map((c) => c.userId)).toContain(yaAlumna.id);
    });

    it("excluye al usuario borrado", async () => {
      const giver = await darAlumno();
      await companiero({ deletedAt: new Date() });
      const normal = await companiero();

      const lista = await caras(giver.id);

      expect(lista.map((c) => c.userId)).toEqual([normal.id]);
    });

    it("incluye a quien vino por Wellhub", async () => {
      const giver = await darAlumno();
      const wellhub = await companiero(
        { status: "wellhub" },
        { source: "wellhub" },
      );

      const lista = await caras(giver.id);

      expect(lista.map((c) => c.userId)).toEqual([wellhub.id]);
    });

    it("no mezcla otro horario ni otra fecha", async () => {
      const giver = await darAlumno();
      const mismaClase = await companiero();
      const otroHorario = await seedGiftClass(app);
      const otraFecha = await seedMember(app, {
        branchId: cls.branchId,
        status: "activo",
      });
      const enOtroHorario = await seedMember(app, {
        branchId: cls.branchId,
        status: "activo",
      });
      await seedAttendance(app, {
        memberId: enOtroHorario.id,
        branchId: cls.branchId,
        scheduleId: otroHorario.scheduleId,
        sessionDate: cls.sessionDate,
      });
      await seedAttendance(app, {
        memberId: otraFecha.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: addDays(cls.sessionDate, -1),
      });

      const lista = await caras(giver.id);

      expect(lista.map((c) => c.userId)).toEqual([mismaClase.id]);
    });

    it("ordena por hora de reserva y, sin reserva, por hora de check-in", async () => {
      const giver = await darAlumno();
      const base = Date.now() - 3_600_000;
      const primeroEnLlegar = await companiero();
      const reservoPrimero = await companiero();
      const reservoSegundo = await companiero();
      // `primeroEnLlegar` no tiene reserva: cuenta la hora de su check-in.
      await seedBooking(app, {
        memberId: reservoSegundo.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
        bookedAt: new Date(base + 60_000),
      });
      await seedBooking(app, {
        memberId: reservoPrimero.id,
        scheduleId: cls.scheduleId,
        bookingDate: cls.sessionDate,
        bookedAt: new Date(base),
      });

      const lista = await caras(giver.id);
      const ids = lista.map((c) => c.userId);

      // Las dos reservas son de hace una hora: van antes que el check-in de
      // `primeroEnLlegar`, que se hizo hace instantes.
      expect(ids).toEqual([
        reservoPrimero.id,
        reservoSegundo.id,
        primeroEnLlegar.id,
      ]);
    });

    it("no ve a nadie de otro gimnasio", async () => {
      const giver = await darAlumno();
      await companiero();

      const lista = await listEligibleClassmates(app.db, OTRO_GIMNASIO, {
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
        excludeUserId: giver.id,
        todayLocal: cls.today,
      });

      expect(lista).toEqual([]);
    });
  });

  // ── giverAccess (D-07) ────────────────────────────────────────────────────

  describe("giverAccess", () => {
    it("un alumno con plan en vigor y visible puede regalar", async () => {
      const giver = await darAlumno();

      const acceso = await giverAccess(app.db, GIFT_CTX, giver.id);

      expect(acceso.canGive).toBe(true);
      expect(acceso.hiddenOnly).toBe(false);
    });

    it("no puede regalar quien se ocultó", async () => {
      const giver = await darAlumno();
      await setCommunityVisible(app, giver.id, false);

      const acceso = await giverAccess(app.db, GIFT_CTX, giver.id);

      expect(acceso.canGive).toBe(false);
      // #31: con plan, el unico motivo es estar oculto.
      expect(acceso.hiddenOnly).toBe(true);
    });

    it("no puede regalar quien no tiene plan en vigor", async () => {
      const sinPlan = await seedMember(app, {
        branchId: cls.branchId,
        status: "freemium",
      });

      const acceso = await giverAccess(app.db, GIFT_CTX, sinPlan.id);

      expect(acceso.canGive).toBe(false);
      expect(acceso.hiddenOnly).toBe(false);
    });

    it("no puede regalar el staff, aunque tenga plan", async () => {
      const giver = await darAlumno();
      await app.db
        .update(schema.users)
        .set({ role: "coach" })
        .where(
          and(
            tenantWhere(schema.users, GIFT_CTX),
            eq(schema.users.id, giver.id),
          ),
        );

      const acceso = await giverAccess(app.db, GIFT_CTX, giver.id);

      expect(acceso.canGive).toBe(false);
    });
  });

  // ── weeklyGiftCountsByReceiver (D-05) ─────────────────────────────────────

  describe("weeklyGiftCountsByReceiver", () => {
    it("cuenta los vigentes de la semana e ignora anulados sin causa, semana anterior, profe y otro dador", async () => {
      const giver = await darAlumno();
      const r1 = await seedMember(app, { branchId: cls.branchId });
      const r2 = await seedMember(app, { branchId: cls.branchId });
      const otroDador = await seedMember(app, { branchId: cls.branchId });
      const common = {
        giverUserId: giver.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
      };
      // 2 vigentes de la semana a r1.
      await seedGift(app, {
        ...common,
        receiverUserId: r1.id,
        sessionDate: cls.sessionDate,
      });
      await seedGift(app, {
        ...common,
        receiverUserId: r1.id,
        sessionDate: cls.sessionDate,
        reason: "energia",
      });
      // Ignorados: anulado, semana anterior, de profe y de otro dador.
      await seedGift(app, {
        ...common,
        receiverUserId: r1.id,
        sessionDate: cls.sessionDate,
        status: "anulado",
      });
      await seedGift(app, {
        ...common,
        receiverUserId: r1.id,
        sessionDate: addDays(cls.sessionDate, -7),
      });
      await seedGift(app, {
        ...common,
        receiverUserId: r1.id,
        sessionDate: cls.sessionDate,
        giverKind: "profe",
      });
      await seedGift(app, {
        ...common,
        giverUserId: otroDador.id,
        receiverUserId: r1.id,
        sessionDate: cls.sessionDate,
      });
      // 1 vigente a r2.
      await seedGift(app, {
        ...common,
        receiverUserId: r2.id,
        sessionDate: cls.sessionDate,
      });

      const cuentas = await weeklyGiftCountsByReceiver(
        app.db,
        GIFT_CTX,
        giver.id,
        cls.sessionDate,
      );

      expect(cuentas.get(r1.id)).toBe(2);
      expect(cuentas.get(r2.id)).toBe(1);
      expect(cuentas.size).toBe(2);
    });

    it("un regalo anulado por el staff sigue contando y uno anulado por la asistencia no (ME-02)", async () => {
      const giver = await darAlumno();
      const receptor = await seedMember(app, { branchId: cls.branchId });
      const common = {
        giverUserId: giver.id,
        receiverUserId: receptor.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
      };
      await seedGift(app, {
        ...common,
        status: "anulado",
        voidCause: "staff",
      });
      await seedGift(app, {
        ...common,
        status: "anulado",
        voidCause: "asistencia",
      });

      const cuentas = await weeklyGiftCountsByReceiver(
        app.db,
        GIFT_CTX,
        giver.id,
        cls.sessionDate,
      );

      expect(cuentas.get(receptor.id)).toBe(1);
    });

    it("la semana va de lunes a domingo, con ambos extremos incluidos", async () => {
      const giver = await darAlumno();
      const receptor = await seedMember(app, { branchId: cls.branchId });
      const { start, end } = giftWeekRange(cls.sessionDate);
      const common = {
        giverUserId: giver.id,
        receiverUserId: receptor.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
      };
      await seedGift(app, { ...common, sessionDate: start });
      await seedGift(app, { ...common, sessionDate: end });
      await seedGift(app, { ...common, sessionDate: addDays(start, -1) });
      await seedGift(app, { ...common, sessionDate: addDays(end, 1) });

      const cuentas = await weeklyGiftCountsByReceiver(
        app.db,
        GIFT_CTX,
        giver.id,
        cls.sessionDate,
      );

      expect(cuentas.get(receptor.id)).toBe(2);
    });

    it("sin regalos devuelve un mapa vacío y no cruza gimnasios", async () => {
      const giver = await darAlumno();
      const receptor = await seedMember(app, { branchId: cls.branchId });
      await seedGift(app, {
        giverUserId: giver.id,
        receiverUserId: receptor.id,
        branchId: cls.branchId,
        scheduleId: cls.scheduleId,
        sessionDate: cls.sessionDate,
      });

      const otro = await weeklyGiftCountsByReceiver(
        app.db,
        OTRO_GIMNASIO,
        giver.id,
        cls.sessionDate,
      );
      const sinRegalos = await weeklyGiftCountsByReceiver(
        app.db,
        GIFT_CTX,
        receptor.id,
        cls.sessionDate,
      );

      expect(otro.size).toBe(0);
      expect(sinRegalos.size).toBe(0);
    });
  });

  // ── loadClassAttendance y listRecentClassAttendances (D-02, D-12) ─────────

  describe("loadClassAttendance", () => {
    it("devuelve la asistencia con su horario, actividad y zona", async () => {
      const giver = await darAlumno();

      const cargada = await loadClassAttendance(
        app.db,
        GIFT_CTX,
        giver.attendanceId,
      );

      expect(cargada).not.toBeNull();
      expect(cargada?.attendanceId).toBe(giver.attendanceId);
      expect(cargada?.memberId).toBe(giver.id);
      expect(cargada?.scheduleId).toBe(cls.scheduleId);
      expect(cargada?.sessionDate).toBe(cls.sessionDate);
      expect(cargada?.activityName).toBe("General");
      expect(cargada?.timezone).toBe(cls.timezone);
      expect(cargada?.endTime.slice(0, 5)).toBe(cls.endTime);
    });

    it("devuelve null sin horario, inexistente u otro gimnasio", async () => {
      const giver = await darAlumno();
      const sinHorario = await seedAttendance(app, {
        memberId: giver.id,
        branchId: cls.branchId,
        scheduleId: null,
        sessionDate: cls.sessionDate,
      });

      expect(
        await loadClassAttendance(app.db, GIFT_CTX, sinHorario),
      ).toBeNull();
      expect(
        await loadClassAttendance(app.db, GIFT_CTX, giver.attendanceId + 99999),
      ).toBeNull();
      expect(
        await loadClassAttendance(app.db, OTRO_GIMNASIO, giver.attendanceId),
      ).toBeNull();
    });
  });

  describe("listRecentClassAttendances", () => {
    it("incluye ayer y hoy, y excluye anteayer, el futuro y las asistencias sin horario", async () => {
      const user = await seedMember(app, { branchId: cls.branchId });
      const ayer = await seedGiftClass(app, { dateOffset: -1 });
      const hoy = await seedGiftClass(app, { dateOffset: 0 });
      const anteayer = await seedGiftClass(app, { dateOffset: -2 });
      const manana = await seedGiftClass(app, { dateOffset: 1 });
      const ids: Record<string, number> = {};
      for (const [nombre, clase] of Object.entries({
        ayer,
        hoy,
        anteayer,
        manana,
      })) {
        ids[nombre] = await seedAttendance(app, {
          memberId: user.id,
          branchId: clase.branchId,
          scheduleId: clase.scheduleId,
          sessionDate: clase.sessionDate,
        });
      }
      await seedAttendance(app, {
        memberId: user.id,
        branchId: cls.branchId,
        scheduleId: null,
        sessionDate: cls.sessionDate,
      });

      const recientes = await listRecentClassAttendances(
        app.db,
        GIFT_CTX,
        user.id,
        new Date(),
      );

      expect(recientes.map((r) => r.attendanceId)).toEqual([ids.ayer, ids.hoy]);
    });

    it("dentro del mismo día ordena por hora de inicio", async () => {
      const user = await seedMember(app, { branchId: cls.branchId });
      const tarde = await seedGiftClass(app, {
        startTime: "20:00",
        endTime: "21:00",
      });
      const temprano = await seedGiftClass(app, {
        startTime: "07:00",
        endTime: "08:00",
      });
      const idTarde = await seedAttendance(app, {
        memberId: user.id,
        branchId: tarde.branchId,
        scheduleId: tarde.scheduleId,
        sessionDate: tarde.sessionDate,
      });
      const idTemprano = await seedAttendance(app, {
        memberId: user.id,
        branchId: temprano.branchId,
        scheduleId: temprano.scheduleId,
        sessionDate: temprano.sessionDate,
      });

      const recientes = await listRecentClassAttendances(
        app.db,
        GIFT_CTX,
        user.id,
        new Date(),
      );

      expect(recientes.map((r) => r.attendanceId)).toEqual([
        idTemprano,
        idTarde,
      ]);
    });

    it("mide la ventana con el día local de la sede de cada asistencia", async () => {
      const user = await seedMember(app, { branchId: cls.branchId });
      // Una sede en Auckland (UTC+12/13) y otra en Honolulu (UTC-10): a la
      // misma hora real sus "hoy" pueden diferir en hasta dos días.
      const auckland = await seedGiftClass(app, {
        tz: "Pacific/Auckland",
        dateOffset: -1,
      });
      const honolulu = await seedGiftClass(app, {
        tz: "Pacific/Honolulu",
        dateOffset: -2,
      });
      extraClasses.push(auckland, honolulu);
      const idAuckland = await seedAttendance(app, {
        memberId: user.id,
        branchId: auckland.branchId,
        scheduleId: auckland.scheduleId,
        sessionDate: auckland.sessionDate,
      });
      const idHonolulu = await seedAttendance(app, {
        memberId: user.id,
        branchId: honolulu.branchId,
        scheduleId: honolulu.scheduleId,
        sessionDate: honolulu.sessionDate,
      });

      const recientes = await listRecentClassAttendances(
        app.db,
        GIFT_CTX,
        user.id,
        new Date(),
      );
      const ids = recientes.map((r) => r.attendanceId);

      // "Ayer" de Auckland entra; "anteayer" de Honolulu no.
      expect(ids).toContain(idAuckland);
      expect(ids).not.toContain(idHonolulu);
    });
  });

  // ── classHasEnded (D-14) ──────────────────────────────────────────────────

  describe("classHasEnded", () => {
    // `now` se inyecta: el caso no depende del reloj ni del calendario.
    const clase: ClassAttendance = {
      attendanceId: 1,
      memberId: 1,
      branchId: 1,
      scheduleId: 1,
      sessionDate: "2026-03-10",
      startTime: "18:00",
      endTime: "19:00",
      activityName: "General",
      timezone: "America/Argentina/Buenos_Aires",
    };

    it("antes de la hora de fin en la zona de la sede no terminó", () => {
      // 18:59 en Buenos Aires (UTC-3) = 21:59 UTC.
      expect(classHasEnded(clase, new Date("2026-03-10T21:59:00Z"))).toBe(
        false,
      );
    });

    it("a la hora de fin y después terminó", () => {
      expect(classHasEnded(clase, new Date("2026-03-10T22:00:00Z"))).toBe(true);
      expect(classHasEnded(clase, new Date("2026-03-11T09:00:00Z"))).toBe(true);
    });

    it("una clase de ayer siempre terminó", async () => {
      const giver = await darAlumno();
      const cargada = await loadClassAttendance(
        app.db,
        GIFT_CTX,
        giver.attendanceId,
      );
      if (!cargada) throw new Error("sin asistencia");

      expect(classHasEnded(cargada, new Date())).toBe(true);
    });
  });
});
