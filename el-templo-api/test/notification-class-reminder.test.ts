/**
 * Fix "recordatorio de clase" (2026-09-24, decisión de Franco) — rama
 * fix/notificaciones-recordatorio.
 *
 * Regla de negocio: cada socio recibe UNA de las dos notificaciones por día,
 * nunca ambas:
 *   - Sin reserva anticipada para hoy → `morning_energy` a las 8:00 (sin
 *     cambios).
 *   - Con reserva anticipada para hoy → `class_reminder` en su lugar: turno
 *     mañana 30 min antes de la clase, turno tarde 60 min antes.
 *
 * "Anticipada" = booking vigente para hoy cuyo `bookedAt` es anterior a la
 * medianoche del día de la clase, en la tz de la sede de ESA clase (no la del
 * proceso). Ver `notifications/anticipated-bookings.ts` para el detalle
 * completo (incluye por qué las reservas de plan fijo cuentan como
 * anticipadas).
 *
 * Sigue el patrón de `test/notification-plan-renewal.test.ts` (llama a la
 * función del job directamente, no a una ruta HTTP) y de
 * `test/scheduling-trial-reminder.test.ts` (fake timers + horario de sede vía
 * `app.inject` a las rutas admin).
 */
process.env.DRY_RUN = "true";

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, getAuthToken, createTestMember, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import { tenantValues, tenantWhere } from "../src/modules/shared/tenant";
import { NotificationService } from "../src/modules/notifications/service";
import {
  runClassReminderForTenant,
  runMorningEnergyForTenantTz,
  CLASS_REMINDER_MINUTES_MORNING,
  CLASS_REMINDER_MINUTES_AFTERNOON,
} from "../src/jobs/notification-cron";
import {
  isAnticipatedBooking,
  anticipatedBookingsToday,
} from "../src/modules/notifications/anticipated-bookings";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
} from "./fixtures/second-tenant";

const CTX = { tenantId: TENANT_TEMPLO };
const AR_TZ = "America/Argentina/Buenos_Aires";
const ADMIN_URL = "/api/admin/scheduling";

/** Fecha y hora "HH:MM" de un instante UTC, ya proyectado a la tz dada. */
function formatInTz(date: Date, tz: string): { date: string; time: string } {
  const dateStr = date.toLocaleDateString("en-CA", { timeZone: tz });
  const timeStr = date.toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { date: dateStr, time: timeStr };
}

describe("isAnticipatedBooking (unit, sin DB)", () => {
  it("bookedAt antes de la medianoche del día de la clase -> anticipada", () => {
    expect(
      isAnticipatedBooking(
        new Date("2026-03-01T12:00:00Z"),
        "2026-03-11",
        AR_TZ,
      ),
    ).toBe(true);
  });

  it("bookedAt después de la medianoche del día de la clase (mismo día) -> NO anticipada", () => {
    // Medianoche AR del 2026-03-11 es 2026-03-11T03:00:00Z.
    expect(
      isAnticipatedBooking(
        new Date("2026-03-11T10:00:00Z"),
        "2026-03-11",
        AR_TZ,
      ),
    ).toBe(false);
  });

  it("respeta la tz de la sede, no UTC: justo antes/después de la medianoche Madrid", () => {
    // Medianoche Madrid (CET, UTC+1) del 2026-03-11 es 2026-03-10T23:00:00Z.
    expect(
      isAnticipatedBooking(
        new Date("2026-03-10T22:59:00Z"),
        "2026-03-11",
        "Europe/Madrid",
      ),
    ).toBe(true);
    expect(
      isAnticipatedBooking(
        new Date("2026-03-10T23:01:00Z"),
        "2026-03-11",
        "Europe/Madrid",
      ),
    ).toBe(false);
  });
});

describe("Recordatorio de clase — job (fix 2026-09-24)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let branchId: number;

  // Miércoles 11:00 AR (14:00Z) — lejos de cualquier borde de día en AR o en
  // las tz usadas por los tests (Madrid).
  const PINNED_NOW = new Date("2026-03-11T14:00:00Z");
  // Muy anterior a la medianoche de CUALQUIER fecha usada en este archivo —
  // sirve como "bookedAt anticipado" genérico para todos los tests.
  const FAR_BEFORE = new Date("2026-02-01T12:00:00Z");

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(PINNED_NOW);

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "TEST"))
      .limit(1);
    branchId = branch!.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await new NotificationService(app.db, app.log).seedTemplates(CTX);
  });

  /**
   * Crea un horario en una actividad PROPIA (una por llamada): el chequeo de
   * solapamiento del admin (Fase 155-01) es por actividad, y varios tests de
   * acá crean 2+ horarios en la MISMA sede con `endTime: "23:59"` (a propósito,
   * para no tener que calcular una duración de clase realista) — con una sola
   * actividad compartida, el segundo horario chocaría con "Ya existe un
   * horario que se solapa en esta sede y día". Una actividad por horario es
   * más simple que llevar la cuenta de franjas horarias que no se pisen.
   */
  async function mkSchedule(
    startTime: string,
    branch: number = branchId,
  ): Promise<number> {
    const activityRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Test ${Date.now()}-${Math.random().toString(36).slice(2)}`,
        description: "Clase de test",
      },
    });
    const activityId = JSON.parse(activityRes.body).id as number;

    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: branch,
        activityId,
        dayOfWeek: 1,
        startTime,
        endTime: "23:59",
      },
    });
    return JSON.parse(res.body).id as number;
  }

  async function mkMember(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; token: string }> {
    const m = await createTestMember(app, overrides);
    await app.db.insert(schema.deviceTokens).values({
      tenantId: CTX.tenantId,
      userId: m.id,
      token: `tok-${m.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      platform: "android",
    });
    return m;
  }

  async function mkBooking(opts: {
    userId: number;
    scheduleId: number;
    bookingDate: string;
    bookedAt: Date;
    status?: "reservado" | "qr_escaneado" | "confirmado" | "cancelado";
  }): Promise<number> {
    const result = await app.db.insert(schema.bookings).values({
      memberId: opts.userId,
      scheduleId: opts.scheduleId,
      bookingDate: opts.bookingDate,
      status: opts.status ?? "reservado",
      bookedAt: opts.bookedAt,
    });
    return Number(result[0].insertId);
  }

  async function classReminderRowsFor(
    userId: number,
    tenantId: number = CTX.tenantId,
  ): Promise<Array<{ id: number; bookingId: number | null; title: string }>> {
    return app.db
      .select({
        id: schema.pendingNotifications.id,
        bookingId: schema.pendingNotifications.bookingId,
        title: schema.pendingNotifications.title,
      })
      .from(schema.pendingNotifications)
      .innerJoin(
        schema.notificationTemplates,
        eq(schema.pendingNotifications.templateId, schema.notificationTemplates.id),
      )
      .where(
        and(
          eq(schema.pendingNotifications.tenantId, tenantId),
          eq(schema.pendingNotifications.userId, userId),
          eq(schema.notificationTemplates.templateKey, "class_reminder"),
        ),
      );
  }

  it("turno mañana: recordatorio 30 min antes de la clase", async () => {
    const member = await mkMember();
    const classTime = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000,
    );
    const { date, time } = formatInTz(classTime, AR_TZ);
    expect(time < "12:00").toBe(true); // sigue siendo turno mañana

    const scheduleId = await mkSchedule(time);
    await mkBooking({
      userId: member.id,
      scheduleId,
      bookingDate: date,
      bookedAt: FAR_BEFORE,
    });

    const result = await runClassReminderForTenant(app.db, CTX, PINNED_NOW);
    expect(result.candidates).toBe(1);
    expect(result.queued).toBe(1);

    const rows = await classReminderRowsFor(member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toContain(time);
  });

  it("turno tarde: recordatorio 60 min antes de la clase", async () => {
    const member = await mkMember();
    const classTime = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_AFTERNOON * 60_000,
    );
    const { date, time } = formatInTz(classTime, AR_TZ);
    expect(time >= "12:00").toBe(true); // turno tarde

    const scheduleId = await mkSchedule(time);
    await mkBooking({
      userId: member.id,
      scheduleId,
      bookingDate: date,
      bookedAt: FAR_BEFORE,
    });

    const result = await runClassReminderForTenant(app.db, CTX, PINNED_NOW);
    expect(result.queued).toBe(1);
  });

  it("reserva del mismo día (no anticipada): sin recordatorio, y sí morning_energy", async () => {
    const anticipatedMember = await mkMember();
    const sameDayMember = await mkMember();
    for (const m of [anticipatedMember, sameDayMember]) {
      await app.db
        .insert(schema.memberProfiles)
        .values({ userId: m.id, onboardingCompletedAt: PINNED_NOW });
    }

    const { date: today } = formatInTz(PINNED_NOW, AR_TZ);
    // Mismo horario para los dos -- lo único que difiere es bookedAt.
    const classTime = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000,
    );
    const { time } = formatInTz(classTime, AR_TZ);

    const scheduleAnticipada = await mkSchedule(time);
    await mkBooking({
      userId: anticipatedMember.id,
      scheduleId: scheduleAnticipada,
      bookingDate: today,
      bookedAt: FAR_BEFORE,
    });

    const scheduleSameDay = await mkSchedule(time);
    await mkBooking({
      userId: sameDayMember.id,
      scheduleId: scheduleSameDay,
      bookingDate: today,
      bookedAt: PINNED_NOW, // reservada HOY mismo -> no anticipada
    });

    const classResult = await runClassReminderForTenant(app.db, CTX, PINNED_NOW);
    // Solo la reserva anticipada es candidata -- la del mismo día ni siquiera
    // entra a anticipatedBookingsToday.
    expect(classResult.candidates).toBe(1);
    expect(await classReminderRowsFor(anticipatedMember.id)).toHaveLength(1);
    expect(await classReminderRowsFor(sameDayMember.id)).toHaveLength(0);

    await runMorningEnergyForTenantTz(app.db, CTX, AR_TZ);
    const morningEnergyRows = await app.db
      .select({ userId: schema.pendingNotifications.userId })
      .from(schema.pendingNotifications)
      .innerJoin(
        schema.notificationTemplates,
        eq(schema.pendingNotifications.templateId, schema.notificationTemplates.id),
      )
      .where(
        and(
          eq(schema.pendingNotifications.tenantId, CTX.tenantId),
          eq(schema.notificationTemplates.templateKey, "morning_energy"),
        ),
      );
    const queuedFor = morningEnergyRows.map((r) => r.userId);

    // La anticipada queda EXCLUIDA de morning_energy (recibe class_reminder
    // en su lugar); la del mismo día SÍ la recibe (no tiene recordatorio de
    // clase, así que sigue en el grupo de las 8:00).
    expect(queuedFor).not.toContain(anticipatedMember.id);
    expect(queuedFor).toContain(sameDayMember.id);
  });

  it("reserva cancelada antes del envío -> sin recordatorio", async () => {
    const member = await mkMember();
    const classTime = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000,
    );
    const { date, time } = formatInTz(classTime, AR_TZ);
    const scheduleId = await mkSchedule(time);
    await mkBooking({
      userId: member.id,
      scheduleId,
      bookingDate: date,
      bookedAt: FAR_BEFORE,
      status: "cancelado",
    });

    const result = await runClassReminderForTenant(app.db, CTX, PINNED_NOW);
    expect(result.candidates).toBe(0);
    expect(result.queued).toBe(0);
    expect(await classReminderRowsFor(member.id)).toHaveLength(0);
  });

  it("dos reservas anticipadas el mismo día -> dos recordatorios independientes", async () => {
    const member = await mkMember();

    const classTime1 = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000,
    );
    const { date: date1, time: time1 } = formatInTz(classTime1, AR_TZ);
    const scheduleId1 = await mkSchedule(time1);
    const bookingId1 = await mkBooking({
      userId: member.id,
      scheduleId: scheduleId1,
      bookingDate: date1,
      bookedAt: FAR_BEFORE,
    });

    const classTime2 = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_AFTERNOON * 60_000,
    );
    const { date: date2, time: time2 } = formatInTz(classTime2, AR_TZ);
    const scheduleId2 = await mkSchedule(time2);
    const bookingId2 = await mkBooking({
      userId: member.id,
      scheduleId: scheduleId2,
      bookingDate: date2,
      bookedAt: FAR_BEFORE,
    });

    const result = await runClassReminderForTenant(app.db, CTX, PINNED_NOW);
    expect(result.queued).toBe(2);

    const rows = await classReminderRowsFor(member.id);
    expect(rows.map((r) => r.bookingId).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      [bookingId1, bookingId2].sort((a, b) => a - b),
    );
  });

  it("dedupe: correr el job dos veces no duplica el recordatorio", async () => {
    const member = await mkMember();
    const classTime = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000,
    );
    const { date, time } = formatInTz(classTime, AR_TZ);
    const scheduleId = await mkSchedule(time);
    await mkBooking({
      userId: member.id,
      scheduleId,
      bookingDate: date,
      bookedAt: FAR_BEFORE,
    });

    const first = await runClassReminderForTenant(app.db, CTX, PINNED_NOW);
    expect(first.queued).toBe(1);

    const second = await runClassReminderForTenant(app.db, CTX, PINNED_NOW);
    expect(second.queued).toBe(0);

    expect(await classReminderRowsFor(member.id)).toHaveLength(1);
  });

  it("fuera de ventana de envío (ni muy temprano ni ya pasado) -> no encola", async () => {
    // Todavía faltan 35 min para el horario de envío (ventana es <=0 y >-10min).
    const memberEarly = await mkMember();
    const classTimeEarly = new Date(
      PINNED_NOW.getTime() + (CLASS_REMINDER_MINUTES_MORNING + 5) * 60_000,
    );
    const { date: dateEarly, time: timeEarly } = formatInTz(classTimeEarly, AR_TZ);
    const scheduleEarly = await mkSchedule(timeEarly);
    await mkBooking({
      userId: memberEarly.id,
      scheduleId: scheduleEarly,
      bookingDate: dateEarly,
      bookedAt: FAR_BEFORE,
    });

    // El horario de envío ya pasó hace 15 min (> CLASS_REMINDER_LOOKBACK_MS = 10).
    const memberLate = await mkMember();
    const classTimeLate = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000 - 15 * 60_000,
    );
    const { date: dateLate, time: timeLate } = formatInTz(classTimeLate, AR_TZ);
    const scheduleLate = await mkSchedule(timeLate);
    await mkBooking({
      userId: memberLate.id,
      scheduleId: scheduleLate,
      bookingDate: dateLate,
      bookedAt: FAR_BEFORE,
    });

    const result = await runClassReminderForTenant(app.db, CTX, PINNED_NOW);
    // Las dos son candidatas (reservas anticipadas de hoy), pero ninguna cae
    // en la ventana de envío.
    expect(result.candidates).toBe(2);
    expect(result.queued).toBe(0);
  });

  it("respeta la tz de la sede de la clase, no la del proceso ni una tz global", async () => {
    const [madridRow] = await app.db.insert(schema.branches).values({
      tenantId: CTX.tenantId,
      name: "Templo Test Madrid",
      code: `MAD-${Date.now()}`,
      timezone: "Europe/Madrid",
      country: "ES",
    });
    const madridBranchId = Number(madridRow.insertId);

    const member = await mkMember({ branchId: madridBranchId });

    // "now" propio de este test (NO el `PINNED_NOW` global usado por el resto
    // del archivo, que en hora Madrid ya cae de tarde -- 14:00Z = 15:00
    // Madrid en marzo, CET). Con un `now` distinto la clase +30 min sigue
    // siendo turno mañana en Madrid (09:00 -> 09:30), así que el offset
    // esperado es inequívocamente CLASS_REMINDER_MINUTES_MORNING. La prueba
    // de fondo es justamente esta: si el job usara la tz de AR (o la del
    // proceso) en vez de la de la sede de la clase, la hora resultante NO
    // coincidiría con "now" y el resultado sería queued=0.
    const madridNow = new Date("2026-03-11T08:00:00Z"); // 09:00 Madrid (CET)
    const classTime = new Date(
      madridNow.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000,
    );
    const { date, time } = formatInTz(classTime, "Europe/Madrid");
    expect(time < "12:00").toBe(true); // sigue siendo turno mañana en Madrid
    const scheduleId = await mkSchedule(time, madridBranchId);
    await mkBooking({
      userId: member.id,
      scheduleId,
      bookingDate: date,
      bookedAt: FAR_BEFORE,
    });

    const result = await runClassReminderForTenant(app.db, CTX, madridNow);
    expect(result.queued).toBe(1);
  });

  it("aislamiento de tenant: la reserva anticipada de otro gimnasio no dispara acá", async () => {
    const gym2 = await seedSecondTenant(app);
    try {
      const classTime = new Date(
        PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000,
      );
      const { date, time } = formatInTz(classTime, AR_TZ);

      // Reserva anticipada de El Templo (tenant 1).
      const temploMember = await mkMember();
      const scheduleTemplo = await mkSchedule(time);
      await mkBooking({
        userId: temploMember.id,
        scheduleId: scheduleTemplo,
        bookingDate: date,
        bookedAt: FAR_BEFORE,
      });

      // Reserva anticipada del gimnasio 2, en su propio horario/sede.
      const scheduleGym2Result = await app.db.insert(schema.schedules).values(
        tenantValues(
          { tenantId: TENANT_DOS },
          {
            branchId: gym2.branchId,
            activityId: gym2.activityId,
            dayOfWeek: 1,
            startTime: time,
            endTime: "23:59",
          },
        ),
      );
      const scheduleGym2 = Number(scheduleGym2Result[0].insertId);

      await app.db.insert(schema.bookings).values(
        tenantValues(
          { tenantId: TENANT_DOS },
          {
            memberId: gym2.socios[0].id,
            scheduleId: scheduleGym2,
            bookingDate: date,
            status: "reservado" as const,
            bookedAt: FAR_BEFORE,
          },
        ),
      );
      await new NotificationService(app.db, app.log).seedTemplates({
        tenantId: TENANT_DOS,
      });
      await app.db.insert(schema.deviceTokens).values({
        tenantId: TENANT_DOS,
        userId: gym2.socios[0].id,
        token: `tok-g2-${gym2.socios[0].id}`,
        platform: "android",
      });

      const resultTemplo = await runClassReminderForTenant(
        app.db,
        { tenantId: TENANT_TEMPLO },
        PINNED_NOW,
      );
      expect(resultTemplo.candidates).toBe(1);
      expect(resultTemplo.queued).toBe(1);
      expect(await classReminderRowsFor(temploMember.id)).toHaveLength(1);

      const resultGym2 = await runClassReminderForTenant(
        app.db,
        { tenantId: TENANT_DOS },
        PINNED_NOW,
      );
      expect(resultGym2.candidates).toBe(1);
      expect(resultGym2.queued).toBe(1);

    } finally {
      // `limpiarSegundoGimnasio` no conoce las filas que ESTE test crea en el
      // gimnasio 2 (reserva, cola, token, plantillas): se borran acá, en el
      // `finally`, para que una aserción fallida no quede tapada por un
      // `ER_ROW_IS_REFERENCED_2` de la limpieza.
      const dos = { tenantId: TENANT_DOS };
      await app.db
        .delete(schema.pendingNotifications)
        .where(tenantWhere(schema.pendingNotifications, dos));
      await app.db.delete(schema.bookings).where(tenantWhere(schema.bookings, dos));
      await app.db.delete(schema.deviceTokens).where(tenantWhere(schema.deviceTokens, dos));
      await app.db
        .delete(schema.notificationTemplates)
        .where(tenantWhere(schema.notificationTemplates, dos));
      await limpiarSegundoGimnasio(app);
    }
  });

  it("anticipatedBookingsToday acota por tenant (tenantWhere real, no solo el job)", async () => {
    const member = await mkMember();
    const classTime = new Date(
      PINNED_NOW.getTime() + CLASS_REMINDER_MINUTES_MORNING * 60_000,
    );
    const { date, time } = formatInTz(classTime, AR_TZ);
    const scheduleId = await mkSchedule(time);
    await mkBooking({
      userId: member.id,
      scheduleId,
      bookingDate: date,
      bookedAt: FAR_BEFORE,
    });

    const rows = await anticipatedBookingsToday(app.db, CTX, PINNED_NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(member.id);
  });
});
