/**
 * Fase 213 Plan 07 (SC-5, SC-9, D-06, D-09, D-10, D-14, D-15, D-16): momento y
 * elegibilidad del push "¿Estiraste?" (SPEC 5.2, parte 1).
 *
 * Se llama al paso del cron directo (`runStretchPushForTenant`, sin HTTP) con el
 * reloj INYECTADO: cada instante sale de `localClock(zona, fecha, "HH:MM")` con
 * la fecha calculada desde `Date.now()` (último miércoles de la sede, acotado a
 * la semana 51 del plan, ver `lastWeekday`). Nada depende de la hora real en que
 * corre CI ni de fechas de calendario fijas, y los socios salen de
 * `createMemberWithArm` (sin ids fijos).
 *
 * Reloj de la clase por defecto: 20:00-21:00 hora de la sede. Con el grupo
 * `push_60` el cálculo da 22:00, pasa el tope y se adelanta a las 21:30.
 */
process.env.DRY_RUN = "true";

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, cleanAllTestData } from "../helpers";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { restoreTemploFlags } from "../fixtures/module-flags";
import { AuraService } from "../../src/modules/aura/service";
import { StretchService } from "../../src/modules/sessions/stretch-service";
import { runStretchPushForTenant } from "../../src/modules/sessions/stretch-push";
import { CTX_TEMPLO } from "../sessions/_free-blocks-fixtures";
import {
  AR_TZ,
  BRANCH_ID,
  DOW,
  LEVEL,
  addDeviceToken,
  arrangeStretchScenario,
  restoreStretchScenario,
  createMemberWithArm,
  localClock,
  prepareStretchTemplate,
  readStretchOffers,
  seedAttendance,
  seedClass,
  stretchPendingRows,
  type Arranged,
  type ArrangeOpts,
} from "../sessions/_stretch-fixtures";

const MADRID_TZ = "Europe/Madrid";

describe("push ¿Estiraste?: momento y elegibilidad (213-07, SPEC 5.2 parte 1)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.useRealTimers();
    // La sede 1 vuelve a Buenos Aires (otros casos le cambian la zona).
    await app.db
      .update(schema.branches)
      .set({ timezone: AR_TZ })
      .where(
        and(
          tenantWhere(schema.branches, CTX_TEMPLO),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await restoreTemploFlags(app);
    await prepareStretchTemplate(app);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await restoreStretchScenario(app);
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  /** Escenario del día + token del socio (para que el push no caiga en `sin_token`). */
  async function arrange(opts: ArrangeOpts = {}): Promise<Arranged> {
    const scenario = await arrangeStretchScenario(app, opts);
    await addDeviceToken(app, scenario.member.id);
    return scenario;
  }

  function tick(now: Date) {
    return runStretchPushForTenant(app.db, CTX_TEMPLO, app.log, now);
  }

  function at(date: string, hhmm: string, tz: string = AR_TZ): Date {
    return localClock(tz, date, hhmm);
  }

  async function onlyOffer(userId: number) {
    const rows = await readStretchOffers(app, userId);
    expect(rows).toHaveLength(1);
    return rows[0]!;
  }

  // ─── 1 y 2: momento del push ───────────────────────────────────────────

  it("(1) push_60 con clase 20-21: a las 21:29 nada, a las 21:30 un solo push con la plantilla tal cual y nunca a las 22:00", async () => {
    const { date, member } = await arrange({ arm: "push_60" });

    const early = await tick(at(date, "21:29"));
    expect(early.queued).toBe(0);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
    // La fila ya existe (se ofrece desde el fin de la clase), sin decisión todavía.
    expect((await onlyOffer(member.id)).pushDecision).toBeNull();

    const sendAt = at(date, "21:30");
    const onTime = await tick(sendAt);
    expect(onTime.queued).toBe(1);

    const [template] = await app.db
      .select()
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX_TEMPLO),
          eq(schema.notificationTemplates.templateKey, "stretch_followup"),
        ),
      );
    const rows = await stretchPendingRows(app, member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.templateId).toBe(template!.id);
    // D-12: sale lo que dice la plantilla (sin override de título ni cuerpo).
    expect(rows[0]!.title).toBe("¿Estiraste?");
    expect(rows[0]!.title).toBe(template!.title);
    expect(rows[0]!.body).toBe(template!.body);
    expect(rows[0]!.bookingId).toBeNull();
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.scheduledAt.getTime()).toBe(sendAt.getTime());

    const offer = await onlyOffer(member.id);
    expect(offer.pushDecision).toBe("queued");
    expect(offer.pushQueuedAt?.getTime()).toBe(sendAt.getTime());
    expect(offer.pendingNotificationId).toBe(rows[0]!.id);

    // A las 22:00 (fin + 60 sin tope) no sale otro.
    await tick(at(date, "22:00"));
    expect(await stretchPendingRows(app, member.id)).toHaveLength(1);
  });

  it("(2) push_30 con clase 20-21: encola a las 21:30 (fin + 30), no antes", async () => {
    const { date, member } = await arrange({ arm: "push_30" });

    await tick(at(date, "21:29"));
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);

    const result = await tick(at(date, "21:30"));
    expect(result.queued).toBe(1);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(1);
  });

  it("(3) clase 21-22 (sin lugar antes de las 21:30): fila con fuera_de_horario, sin push, y la card sigue ofreciendo", async () => {
    const { date, member } = await arrange({
      arm: "push_30",
      startTime: "21:00",
      endTime: "22:00",
    });

    const now = at(date, "22:05");
    const result = await tick(now);
    expect(result.queued).toBe(0);
    expect(result.decided.fuera_de_horario).toBe(1);

    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
    expect((await onlyOffer(member.id)).pushDecision).toBe("fuera_de_horario");

    const view = await new StretchService(
      app.db,
      app.log,
      new AuraService(app.db),
    ).getToday(CTX_TEMPLO, member.id, now);
    expect(view.status).toBe("available");
  });

  // ─── 4: dos sedes, cada una con su hora de pared ───────────────────────

  it("(4) dos sedes (Madrid y Buenos Aires), clase 19-20 y push_60: cada una dispara con la hora de pared de SU sede", async () => {
    // Sede de Buenos Aires = la sede 1 (arrange fuerza su zona).
    const { date, member: memberAr } = await arrange({
      arm: "push_60",
      startTime: "19:00",
      endTime: "20:00",
    });

    // Sede de Madrid, con su socio y su clase del mismo día.
    const [madridRow] = await app.db.insert(schema.branches).values(
      tenantValues(CTX_TEMPLO, {
        name: "Templo Test Madrid push",
        code: `MADP-${Date.now().toString(36)}`.slice(0, 20),
        timezone: MADRID_TZ,
        country: "ES",
      }),
    );
    const madridBranchId = Number(madridRow.insertId);
    const memberMadrid = await createMemberWithArm(app, "push_60", {
      level: LEVEL,
      branchId: madridBranchId,
    });
    await addDeviceToken(app, memberMadrid.id);
    const { scheduleId } = await seedClass(app, {
      branchId: madridBranchId,
      dayOfWeek: DOW.miercoles,
      startTime: "19:00",
      endTime: "20:00",
    });
    await seedAttendance(app, {
      memberId: memberMadrid.id,
      branchId: madridBranchId,
      scheduleId,
      sessionDate: date,
    });

    // Los tres instantes salen de UNA fecha base común: la hora de pared de
    // cada sede ese mismo día. Madrid 20:59 < Madrid 21:00 < Buenos Aires 21:00.
    const madrid2059 = at(date, "20:59", MADRID_TZ);
    const madrid2100 = at(date, "21:00", MADRID_TZ);
    const ar2100 = at(date, "21:00", AR_TZ);
    expect(madrid2059.getTime()).toBeLessThan(madrid2100.getTime());
    expect(madrid2100.getTime()).toBeLessThan(ar2100.getTime());

    // 20:59 en Madrid: el push de Madrid (fin 20:00 + 60) todavía no; en Buenos
    // Aires la clase aún no terminó.
    await tick(madrid2059);
    expect(await stretchPendingRows(app, memberMadrid.id)).toHaveLength(0);
    expect(await stretchPendingRows(app, memberAr.id)).toHaveLength(0);

    // 21:00 en Madrid: sale SOLO el de Madrid.
    const r2 = await tick(madrid2100);
    expect(r2.queued).toBe(1);
    expect(await stretchPendingRows(app, memberMadrid.id)).toHaveLength(1);
    expect(await stretchPendingRows(app, memberAr.id)).toHaveLength(0);

    // 21:00 en Buenos Aires: sale el de AR y el de Madrid no se duplica.
    const r3 = await tick(ar2100);
    expect(r3.queued).toBe(1);
    expect(await stretchPendingRows(app, memberAr.id)).toHaveLength(1);
    expect(await stretchPendingRows(app, memberMadrid.id)).toHaveLength(1);
  });

  // ─── 5 y 6: quién cuenta como asistencia ───────────────────────────────

  it("(5) reservas no_show y cancelado sin asistencia: sin fila ni push", async () => {
    const { date, member, scheduleId } = await arrange({
      arm: "push_30",
      attend: false,
    });
    for (const status of ["no_show", "cancelado"] as const) {
      await app.db.insert(schema.bookings).values(
        tenantValues(CTX_TEMPLO, {
          memberId: member.id,
          scheduleId,
          bookingDate: date,
          status,
        }),
      );
    }

    const result = await tick(at(date, "21:30"));
    expect(result.offers).toBe(0);
    expect(result.queued).toBe(0);
    expect(await readStretchOffers(app, member.id)).toHaveLength(0);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  it("(6) asistencia Wellhub sin horario (schedule_id nulo): sin fila ni push", async () => {
    const { date, member } = await arrange({ arm: "push_30", attend: false });
    await seedAttendance(app, {
      memberId: member.id,
      branchId: BRANCH_ID,
      scheduleId: null,
      sessionDate: date,
      source: "wellhub",
    });

    const result = await tick(at(date, "21:30"));
    expect(result.offers).toBe(0);
    expect(await readStretchOffers(app, member.id)).toHaveLength(0);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  // ─── 7 y 8: asistencia cargada tarde ───────────────────────────────────

  it("(7) asistencia manual cargada a fin + 40 (push_30): el tick de ese momento encola", async () => {
    const { date, member, scheduleId } = await arrange({
      arm: "push_30",
      attend: false,
    });

    // Antes de cargarla no hay nada.
    await tick(at(date, "21:20"));
    expect(await readStretchOffers(app, member.id)).toHaveLength(0);

    await seedAttendance(app, {
      memberId: member.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: date,
      source: "manual",
    });

    const now = at(date, "21:40"); // fin 21:00 + 40
    const result = await tick(now);
    expect(result.queued).toBe(1);
    const rows = await stretchPendingRows(app, member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.scheduledAt.getTime()).toBe(now.getTime());
  });

  it("(8) asistencia cargada a fin + 3 h: el tick no crea fila, pero la card sí la crea y ofrece", async () => {
    const { date, member } = await arrange({
      arm: "push_30",
      startTime: "17:00",
      endTime: "18:00",
    });

    const now = at(date, "21:05"); // fin 18:00 + 3 h 05
    const result = await tick(now);
    expect(result.offers).toBe(0);
    expect(result.queued).toBe(0);
    expect(result.skipped.fuera_de_ventana).toBeGreaterThan(0);
    expect(await readStretchOffers(app, member.id)).toHaveLength(0);

    const view = await new StretchService(
      app.db,
      app.log,
      new AuraService(app.db),
    ).getToday(CTX_TEMPLO, member.id, now);
    expect(view.status).toBe("available");
    expect(await readStretchOffers(app, member.id)).toHaveLength(1);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  // ─── 9: dos clases el mismo día ────────────────────────────────────────

  it("(9) dos clases el mismo día: una sola fila (la de fin más temprano) y un solo push después de varios ticks", async () => {
    const { date, member } = await arrange({ arm: "push_60" });
    // Segunda clase que termina antes (19:30-20:30) con su propia asistencia.
    const second = await seedClass(app, {
      branchId: BRANCH_ID,
      dayOfWeek: DOW.miercoles,
      startTime: "19:30",
      endTime: "20:30",
    });
    await seedAttendance(app, {
      memberId: member.id,
      branchId: BRANCH_ID,
      scheduleId: second.scheduleId,
      sessionDate: date,
    });

    for (const hhmm of ["21:30", "21:35", "21:40", "21:45"]) {
      await tick(at(date, hhmm));
    }

    const offer = await onlyOffer(member.id);
    // D-09: la clase de fin más temprano (20:30) manda; su push_60 es 21:30.
    expect(offer.classEndAt.getTime()).toBe(at(date, "20:30").getTime());
    expect(offer.pushDecision).toBe("queued");
    expect(await stretchPendingRows(app, member.id)).toHaveLength(1);
  });

  // ─── 10 a 13: qué día y qué clase ofrecen ──────────────────────────────

  it("(10) día ROM: sin fila ni push", async () => {
    const { date, member } = await arrange({ arm: "push_30", mode: "rom" });

    const result = await tick(at(date, "21:30"));
    expect(result.offers).toBe(0);
    expect(result.skipped.sin_rutina).toBeGreaterThan(0);
    expect(await readStretchOffers(app, member.id)).toHaveLength(0);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  it("(11) día de técnica: encola", async () => {
    const { date, member } = await arrange({ arm: "push_30", mode: "tecnica" });

    const result = await tick(at(date, "21:30"));
    expect(result.queued).toBe(1);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(1);
  });

  it("(12) día de combos: encola", async () => {
    const { date, member } = await arrange({ arm: "push_30", mode: "combos" });

    const result = await tick(at(date, "21:30"));
    expect(result.queued).toBe(1);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(1);
  });

  it("(13) actividad especial (Open Gym): sin fila ni push", async () => {
    const { date, member } = await arrange({
      arm: "push_30",
      activityName: "Open Gym",
      isSpecial: true,
    });

    const result = await tick(at(date, "21:30"));
    expect(result.offers).toBe(0);
    expect(result.skipped.actividad).toBeGreaterThan(0);
    expect(await readStretchOffers(app, member.id)).toHaveLength(0);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });

  // ─── 14: convivencia con class_reminder ────────────────────────────────

  it("(14) class_reminder ya encolado para la reserva de esa clase: el push de estiramiento sale igual", async () => {
    const { date, member, scheduleId } = await arrange({ arm: "push_30" });
    const [booking] = await app.db
      .insert(schema.bookings)
      .values(
        tenantValues(CTX_TEMPLO, {
          memberId: member.id,
          scheduleId,
          bookingDate: date,
          status: "confirmado" as const,
        }),
      )
      .$returningId();
    const [reminderTemplate] = await app.db
      .select({ id: schema.notificationTemplates.id })
      .from(schema.notificationTemplates)
      .where(
        and(
          tenantWhere(schema.notificationTemplates, CTX_TEMPLO),
          eq(schema.notificationTemplates.templateKey, "class_reminder"),
        ),
      );
    await app.db.insert(schema.pendingNotifications).values(
      tenantValues(CTX_TEMPLO, {
        userId: member.id,
        templateId: reminderTemplate!.id,
        bookingId: booking.id,
        title: "Clase de hoy",
        body: "Te esperamos",
        status: "sent" as const,
        scheduledAt: at(date, "19:30"),
      }),
    );

    const result = await tick(at(date, "21:30"));
    expect(result.queued).toBe(1);
    const rows = await stretchPendingRows(app, member.id);
    expect(rows).toHaveLength(1);
    // D-15: el push de estiramiento no lleva booking_id.
    expect(rows[0]!.bookingId).toBeNull();
  });

  // ─── 15 y 16: una vez por día, y el grupo control ──────────────────────

  it("(15) dos ticks seguidos (21:30 y 21:35): un solo push", async () => {
    const { date, member } = await arrange({ arm: "push_60" });

    const first = await tick(at(date, "21:30"));
    const second = await tick(at(date, "21:35"));
    expect(first.queued).toBe(1);
    expect(second.queued).toBe(0);
    expect(await stretchPendingRows(app, member.id)).toHaveLength(1);
  });

  it("(16) socio del grupo control: fila con push_decision control y ningún push", async () => {
    const { date, member } = await arrange({ arm: "control" });

    const result = await tick(at(date, "21:30"));
    expect(result.queued).toBe(0);
    expect(result.offers).toBe(1);
    const offer = await onlyOffer(member.id);
    expect(offer.arm).toBe("control");
    expect(offer.pushDecision).toBe("control");
    expect(offer.pushQueuedAt).toBeNull();
    expect(await stretchPendingRows(app, member.id)).toHaveLength(0);
  });
});
