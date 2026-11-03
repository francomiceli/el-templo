/**
 * Job de temas automáticos de Oficina (src/jobs/office-auto-topics.ts, fase 205-03).
 *
 * Testea runOfficeAutoTopics contra MySQL real: abre temas del sistema para las
 * tres señales (Wellhub con error, jornada sin cerrar, clase de mañana sin
 * profe), no duplica, los cierra solos cuando la condición desaparece, respeta
 * el cierre manual (D-04) y despierta los dormidos vencidos (D-09).
 *
 * Reloj: el job recibe `now` por parámetro, así que no hay fake timers. `NOW` es
 * "ahora" real corrido a lo sumo un día para que MAÑANA (en la zona de la sede)
 * nunca caiga domingo: el domingo no hay horarios ni roster y el caso de clase
 * sin profe no tendría nada que detectar. Todas las fechas salen de `NOW` con
 * `todayInTz`/`addDays`. El despertar de dormidos usa el reloj real (el
 * servicio no recibe `now`), por eso ese caso calcula "ayer" con la hora real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createStaffUser } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import {
  isoDayOfWeek,
  isoWeekStart,
} from "../../src/modules/ratings/roster-attribution";
import { OfficeService } from "../../src/modules/office/service";
import { runOfficeAutoTopics } from "../../src/jobs/office-auto-topics";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const DOS_CTX: TenantContext = { tenantId: TENANT_DOS };
const DAY_MS = 24 * 60 * 60 * 1000;

describe("job temas automáticos de Oficina", () => {
  let app: FastifyInstance;
  let branchId: number;
  let timezone: string;
  let ownerId: number;
  let now: Date;
  let seq = 0;

  /** "Ahora" real, corrido de a un día hasta que mañana no sea domingo. */
  function pickNow(tz: string): Date {
    let d = new Date();
    for (let i = 0; i < 3; i += 1) {
      const tomorrow = addDays(todayInTz(tz, d), 1);
      if (isoDayOfWeek(tomorrow) !== 7) return d;
      d = new Date(d.getTime() + DAY_MS);
    }
    return d;
  }

  async function run(at: Date = now): Promise<void> {
    await runOfficeAutoTopics(app.db, at);
  }

  async function insertWellhubEvent(opts: {
    status: string;
    createdAt?: Date;
    tenantCtx?: TenantContext;
  }): Promise<{ id: number; eventId: string }> {
    seq += 1;
    const eventId = `oat-${seq}-${Date.now()}`;
    const [row] = await app.db
      .insert(schema.wellhubEvents)
      .values(
        tenantValues(opts.tenantCtx ?? TEMPLO_CTX, {
          eventId,
          eventType: "booking-requested",
          payload: "{}",
          status: opts.status,
          error: opts.status === "error" ? "Slot lleno al reservar" : null,
          ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        }),
      )
      .$returningId();
    return { id: row.id, eventId };
  }

  async function setWellhubStatus(id: number, status: string): Promise<void> {
    await app.db
      .update(schema.wellhubEvents)
      .set({ status })
      .where(
        and(
          tenantWhere(schema.wellhubEvents, TEMPLO_CTX),
          eq(schema.wellhubEvents.id, id),
        ),
      );
  }

  async function topicBySource(
    sourceKey: string,
    ctx: TenantContext = TEMPLO_CTX,
  ) {
    const rows = await app.db
      .select()
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, ctx),
          eq(schema.officeTopics.sourceKey, sourceKey),
        ),
      );
    return rows;
  }

  async function allTopics(ctx: TenantContext = TEMPLO_CTX) {
    return app.db
      .select()
      .from(schema.officeTopics)
      .where(tenantWhere(schema.officeTopics, ctx))
      .orderBy(asc(schema.officeTopics.id));
  }

  async function eventsOf(topicId: number, ctx: TenantContext = TEMPLO_CTX) {
    return app.db
      .select()
      .from(schema.officeTopicEvents)
      .where(
        and(
          tenantWhere(schema.officeTopicEvents, ctx),
          eq(schema.officeTopicEvents.topicId, topicId),
        ),
      )
      .orderBy(
        asc(schema.officeTopicEvents.createdAt),
        asc(schema.officeTopicEvents.id),
      );
  }

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({
        id: schema.branches.id,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.code, "TEST"),
        ),
      );
    branchId = branch.id;
    timezone = branch.timezone;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    now = pickNow(timezone);
    const [owner] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    ownerId = owner.id;
  });

  // ─────────────────────────── 1. Wellhub con error ───────────────────────────

  it("abre un tema por webhook con error, no lo duplica y lo cierra cuando Wellhub lo reprocesa", async () => {
    const ev = await insertWellhubEvent({ status: "error" });
    const sourceKey = `wellhub_event:${ev.id}`;

    await run();

    const [topic] = await topicBySource(sourceKey);
    expect(topic).toBeDefined();
    expect(topic.origin).toBe("sistema");
    expect(topic.status).toBe("abierto");
    expect(topic.title).toBe(
      "Webhook de Wellhub con error (booking-requested)",
    );
    expect(topic.body).toBe("Slot lleno al reservar");
    expect(topic.targetKind).toBe("wellhub_evento");
    expect(topic.targetId).toBe(ev.id);
    expect(topic.targetLabel).toBe(ev.eventId);
    const created = await eventsOf(topic.id);
    expect(created.map((e) => e.type)).toEqual(["creado"]);
    expect(created[0].actorId).toBeNull();

    // Segunda corrida con el evento todavía en error: sigue habiendo UN tema.
    await run();
    expect(await topicBySource(sourceKey)).toHaveLength(1);
    expect(await allTopics()).toHaveLength(1);

    // Wellhub lo reprocesó bien: el tema se cierra solo.
    await setWellhubStatus(ev.id, "processed");
    await run();

    const [closed] = await topicBySource(sourceKey);
    expect(closed.status).toBe("cerrado");
    expect(closed.closedBy).toBeNull();
    const events = await eventsOf(closed.id);
    expect(events.map((e) => e.type)).toEqual(["creado", "sistema"]);
    expect(events[1].body).toBe("Wellhub lo reprocesó bien");
    expect(events[1].actorId).toBeNull();
  });

  it("un tema de Wellhub cerrado a mano no se reabre mientras el evento siga en error", async () => {
    const ev = await insertWellhubEvent({ status: "error" });
    const sourceKey = `wellhub_event:${ev.id}`;
    await run();
    const [topic] = await topicBySource(sourceKey);

    const service = new OfficeService(app.db, app.log);
    await service.patchTopic(TEMPLO_CTX, ownerId, topic.id, {
      status: "cerrado",
      note: "Ya lo hablé con Wellhub",
    });

    await run();

    const rows = await topicBySource(sourceKey);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("cerrado");
    expect(await allTopics()).toHaveLength(1);
    // El cierre manual lo firma una persona; el job no agregó eventos.
    const types = (await eventsOf(topic.id)).map((e) => e.type);
    expect(types).toEqual(["creado", "cerrado"]);
  });

  it("ignora los errores de Wellhub de más de 7 días y cierra el tema que quedó fuera de la ventana", async () => {
    const old = await insertWellhubEvent({
      status: "error",
      createdAt: new Date(now.getTime() - 10 * DAY_MS),
    });
    await run();
    expect(await topicBySource(`wellhub_event:${old.id}`)).toHaveLength(0);

    // Un evento reciente abre tema; al envejecer fuera de la ventana sin
    // resolverse, el tema se cierra con el motivo honesto (no "reprocesó bien").
    const ev = await insertWellhubEvent({ status: "error" });
    await run();
    const [topic] = await topicBySource(`wellhub_event:${ev.id}`);
    expect(topic.status).toBe("abierto");

    await run(new Date(now.getTime() + 8 * DAY_MS));

    const [closed] = await topicBySource(`wellhub_event:${ev.id}`);
    expect(closed.status).toBe("cerrado");
    const events = await eventsOf(closed.id);
    expect(events[events.length - 1].body).toContain("más de 7 días");
  });

  // ─────────────────────────── 2. Jornada sin cerrar ───────────────────────────

  it("abre un tema por jornada abierta de un día anterior, ignora la de hoy y lo cierra al registrar la salida", async () => {
    seq += 1;
    const staffId = await createStaffUser(app, {
      email: `oat-staff-${seq}-${Date.now()}@test.local`,
      password: "test1234",
      firstName: "Marta",
      lastName: "Jornada",
      role: "coach",
      branchId,
      country: "AR",
    });
    seq += 1;
    const staffHoyId = await createStaffUser(app, {
      email: `oat-staff-${seq}-${Date.now()}@test.local`,
      password: "test1234",
      firstName: "Hugo",
      lastName: "Hoy",
      role: "recepcion",
      branchId,
      country: "AR",
    });
    const today = todayInTz(timezone, now);
    const yesterday = addDays(today, -1);

    const [stale] = await app.db
      .insert(schema.staffShifts)
      .values(
        tenantValues(TEMPLO_CTX, {
          userId: staffId,
          branchId,
          shiftDate: yesterday,
          checkedInAt: new Date(now.getTime() - DAY_MS),
          checkedOutAt: null,
        }),
      )
      .$returningId();
    const [current] = await app.db
      .insert(schema.staffShifts)
      .values(
        tenantValues(TEMPLO_CTX, {
          userId: staffHoyId,
          branchId,
          shiftDate: today,
          checkedInAt: now,
          checkedOutAt: null,
        }),
      )
      .$returningId();

    await run();

    const [topic] = await topicBySource(`staff_shift:${stale.id}`);
    expect(topic).toBeDefined();
    expect(topic.origin).toBe("sistema");
    expect(topic.status).toBe("abierto");
    expect(topic.title).toContain("Jornada sin cerrar: Marta Jornada en ");
    expect(topic.title).toContain(
      `(${yesterday.slice(8, 10)}/${yesterday.slice(5, 7)})`,
    );
    expect(topic.body).toContain("no registró salida");
    expect(topic.targetKind).toBe("jornada");
    expect(topic.targetId).toBe(stale.id);
    expect(topic.branchId).toBe(branchId);
    // La jornada de hoy sigue en curso: no genera tema.
    expect(await topicBySource(`staff_shift:${current.id}`)).toHaveLength(0);

    // Aparece la salida: el tema se cierra solo.
    await app.db
      .update(schema.staffShifts)
      .set({ checkedOutAt: now })
      .where(
        and(
          tenantWhere(schema.staffShifts, TEMPLO_CTX),
          eq(schema.staffShifts.id, stale.id),
        ),
      );
    await run();

    const [closed] = await topicBySource(`staff_shift:${stale.id}`);
    expect(closed.status).toBe("cerrado");
    const events = await eventsOf(closed.id);
    expect(events.map((e) => e.type)).toEqual(["creado", "sistema"]);
    expect(events[1].body).toBe("Se cerró la jornada");
  });

  // ─────────────────────────── 3. Clase sin profe ───────────────────────────

  describe("clase de mañana sin profe", () => {
    let tomorrow: string;
    let coachId: number;

    async function createSchedule(opts: {
      startTime: string;
      coachUserId?: number;
      name?: string;
    }): Promise<number> {
      const [activity] = await app.db
        .insert(schema.activities)
        .values(
          tenantValues(TEMPLO_CTX, {
            name: opts.name ?? "General",
            isActive: true,
          }),
        )
        .$returningId();
      const [schedule] = await app.db
        .insert(schema.schedules)
        .values(
          tenantValues(TEMPLO_CTX, {
            branchId,
            activityId: activity.id,
            dayOfWeek: isoDayOfWeek(tomorrow),
            startTime: opts.startTime,
            endTime: "23:59",
            isActive: true,
            coachUserId: opts.coachUserId ?? null,
          }),
        )
        .$returningId();
      return schedule.id;
    }

    async function assignRoster(slot: "morning" | "afternoon", week?: string) {
      await app.db.insert(schema.classCoachAssignments).values(
        tenantValues(TEMPLO_CTX, {
          branchId,
          weekStartDate: week ?? isoWeekStart(tomorrow),
          dayOfWeek: isoDayOfWeek(tomorrow),
          slot,
          coachId,
        }),
      );
    }

    beforeEach(async () => {
      // cleanAllTestData no limpia el roster y la unique (sede, semana, día,
      // turno) chocaría entre casos: se limpia acá.
      await app.db
        .delete(schema.classCoachAssignments)
        .where(tenantWhere(schema.classCoachAssignments, TEMPLO_CTX));
      tomorrow = addDays(todayInTz(timezone, now), 1);
      seq += 1;
      coachId = await createStaffUser(app, {
        email: `oat-coach-${seq}-${Date.now()}@test.local`,
        password: "test1234",
        firstName: "Carla",
        lastName: "Profe",
        role: "coach",
        branchId,
        country: "AR",
      });
    });

    it("abre un tema para la clase sin profe y lo cierra cuando el roster le asigna uno", async () => {
      const scheduleId = await createSchedule({
        startTime: "10:00",
        name: "Técnica",
      });
      const sourceKey = `clase_sin_profe:${scheduleId}:${tomorrow}`;

      await run();

      const [topic] = await topicBySource(sourceKey);
      expect(topic).toBeDefined();
      expect(topic.origin).toBe("sistema");
      expect(topic.status).toBe("abierto");
      expect(topic.title).toMatch(/^Clase sin profe mañana: Técnica 10:00 en /);
      expect(topic.targetKind).toBe("horario");
      expect(topic.targetId).toBe(scheduleId);
      expect(topic.targetLabel).toBe("Técnica 10:00");
      expect(topic.branchId).toBe(branchId);

      // Sin duplicar en una segunda corrida.
      await run();
      expect(await topicBySource(sourceKey)).toHaveLength(1);

      // Un change-point del roster (semana <= lunes de mañana) para el turno
      // de la mañana resuelve al profe: el tema se cierra solo.
      await assignRoster("morning", addDays(isoWeekStart(tomorrow), -14));
      await run();

      const [closed] = await topicBySource(sourceKey);
      expect(closed.status).toBe("cerrado");
      const events = await eventsOf(closed.id);
      expect(events.map((e) => e.type)).toEqual(["creado", "sistema"]);
      expect(events[1].body).toBe(
        "Ya tiene profe o la clase dejó de estar programada",
      );
    });

    it("no abre tema si el roster cubre el turno, si el horario tiene profe propio o si la clase está cancelada ese día", async () => {
      // Mañana (10:00) cubierta por el roster del turno mañana.
      await assignRoster("morning");
      const cubierto = await createSchedule({ startTime: "10:00" });
      // Tarde (18:00) sin roster, pero con profe propio del horario.
      const propio = await createSchedule({
        startTime: "18:00",
        coachUserId: coachId,
      });
      // Tarde (19:00) sin profe pero cancelada puntualmente para mañana.
      const cancelado = await createSchedule({ startTime: "19:00" });
      await app.db.insert(schema.scheduleExceptions).values(
        tenantValues(TEMPLO_CTX, {
          scheduleId: cancelado,
          exceptionDate: tomorrow,
          reason: "Feriado",
        }),
      );
      // Tarde (20:00) sin profe y sin excepción: la única que debe aparecer.
      const sinProfe = await createSchedule({ startTime: "20:00" });
      // Horario eliminado desde antes de mañana: no cuenta.
      const eliminado = await createSchedule({ startTime: "21:00" });
      await app.db
        .update(schema.schedules)
        .set({ deletedFrom: todayInTz(timezone, now), isActive: false })
        .where(
          and(
            tenantWhere(schema.schedules, TEMPLO_CTX),
            eq(schema.schedules.id, eliminado),
          ),
        );

      await run();

      const topics = await allTopics();
      expect(topics.map((t) => t.sourceKey)).toEqual([
        `clase_sin_profe:${sinProfe}:${tomorrow}`,
      ]);
      for (const id of [cubierto, propio, cancelado, eliminado]) {
        expect(
          await topicBySource(`clase_sin_profe:${id}:${tomorrow}`),
        ).toHaveLength(0);
      }
    });

    it("el roster de un turno no cubre al otro turno del mismo día", async () => {
      await assignRoster("morning");
      const tarde = await createSchedule({ startTime: "18:00" });

      await run();

      expect(
        await topicBySource(`clase_sin_profe:${tarde}:${tomorrow}`),
      ).toHaveLength(1);
    });

    it("el tema sigue abierto el día de la clase si todavía no hay profe y se cierra con 'Pasó la fecha' después", async () => {
      const scheduleId = await createSchedule({ startTime: "10:00" });
      const sourceKey = `clase_sin_profe:${scheduleId}:${tomorrow}`;
      await run();
      expect((await topicBySource(sourceKey))[0].status).toBe("abierto");

      // Al día siguiente (hoy = el día de la clase) sin profe: sigue abierto.
      await run(new Date(now.getTime() + DAY_MS));
      expect((await topicBySource(sourceKey))[0].status).toBe("abierto");

      // Tres días después la fecha ya pasó: se cierra por fecha, no por profe.
      await run(new Date(now.getTime() + 3 * DAY_MS));
      const [closed] = await topicBySource(sourceKey);
      expect(closed.status).toBe("cerrado");
      const events = await eventsOf(closed.id);
      expect(events[events.length - 1].body).toBe("Pasó la fecha");
    });
  });

  // ─────────────────────────── 4. Despertar dormidos ───────────────────────────

  it("despierta los temas dormidos cuya fecha ya llegó y deja los que siguen dormidos", async () => {
    const service = new OfficeService(app.db, app.log);
    const hoyReal = todayInTz(timezone);

    const vencido = await service.createTopic(TEMPLO_CTX, ownerId, {
      title: "Dormido vencido",
    });
    const vigente = await service.createTopic(TEMPLO_CTX, ownerId, {
      title: "Dormido vigente",
    });
    for (const t of [vencido, vigente]) {
      await service.patchTopic(TEMPLO_CTX, ownerId, t.id, {
        snoozedUntil: addDays(hoyReal, 5),
      });
    }
    // La API exige una fecha futura: el vencimiento se simula por SQL.
    await app.db
      .update(schema.officeTopics)
      .set({ snoozedUntil: addDays(hoyReal, -1) })
      .where(
        and(
          tenantWhere(schema.officeTopics, TEMPLO_CTX),
          eq(schema.officeTopics.id, vencido.id),
        ),
      );

    await run();

    const [despierto] = await app.db
      .select()
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, TEMPLO_CTX),
          eq(schema.officeTopics.id, vencido.id),
        ),
      );
    expect(despierto.status).toBe("abierto");
    expect(despierto.snoozedUntil).toBeNull();
    const events = await eventsOf(vencido.id);
    const reopened = events.filter((e) => e.type === "reabierto");
    expect(reopened).toHaveLength(1);
    expect(reopened[0].actorId).toBeNull();
    expect(reopened[0].payload).toEqual({ auto: true });

    const [sigueDormido] = await app.db
      .select()
      .from(schema.officeTopics)
      .where(
        and(
          tenantWhere(schema.officeTopics, TEMPLO_CTX),
          eq(schema.officeTopics.id, vigente.id),
        ),
      );
    expect(sigueDormido.status).toBe("dormido");

    // Idempotente: otra corrida no agrega un segundo evento reabierto.
    await run();
    expect(
      (await eventsOf(vencido.id)).filter((e) => e.type === "reabierto"),
    ).toHaveLength(1);
  });

  // ─────────────────────────── 5. Aislamiento por gimnasio ───────────────────────────

  it("cada gimnasio recibe solo los temas de sus propios eventos de Wellhub", async () => {
    await seedSecondTenant(app);
    const evTemplo = await insertWellhubEvent({ status: "error" });
    const evDos = await insertWellhubEvent({
      status: "error",
      tenantCtx: DOS_CTX,
    });

    await run();

    expect(await topicBySource(`wellhub_event:${evTemplo.id}`)).toHaveLength(1);
    expect(await topicBySource(`wellhub_event:${evDos.id}`)).toHaveLength(0);
    expect(
      await topicBySource(`wellhub_event:${evDos.id}`, DOS_CTX),
    ).toHaveLength(1);
    expect(
      await topicBySource(`wellhub_event:${evTemplo.id}`, DOS_CTX),
    ).toHaveLength(0);
  });
});
