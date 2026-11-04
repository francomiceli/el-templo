/**
 * Job de temas automáticos de Oficina (src/jobs/office-auto-topics.ts, fase 205-03).
 *
 * Testea runOfficeAutoTopics contra MySQL real: abre temas del sistema para las
 * seis señales (Wellhub con error, jornada sin cerrar, clase de mañana sin
 * profe, arqueo con diferencia, clases de Wellhub sin publicar, leads del
 * Tablero sin cargar), no duplica, los cierra solos cuando la condición desaparece, respeta
 * el cierre manual (D-04) y despierta los dormidos vencidos (D-09).
 *
 * Reloj: el job recibe `now` por parámetro, así que no hay fake timers. `NOW` es
 * "ahora" real corrido a lo sumo un día para que MAÑANA (en la zona de la sede)
 * nunca caiga domingo: el domingo no hay horarios ni roster y el caso de clase
 * sin profe no tendría nada que detectar. Todas las fechas salen de `NOW` con
 * `todayInTz`/`addDays`. El despertar de dormidos usa el reloj real (el
 * servicio no recibe `now`), por eso ese caso calcula "ayer" con la hora real.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import {
  currentWeekStart,
  instantAtAr,
} from "../../src/modules/weekly-board/week";
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
  let country: string;
  let branchName: string;

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
        country: schema.branches.country,
        name: schema.branches.name,
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
    country = branch.country;
    branchName = branch.name;
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
  // ─────────────────────────── 6. Arqueo con diferencia ───────────────────────────

  describe("arqueo con diferencia", () => {
    const EXPECTED = 10000;
    const HOUR_MS = 60 * 60 * 1000;
    let cajaIds: number[] = [];

    async function makeCaja(
      name: string,
      ctx: TenantContext = TEMPLO_CTX,
      cajaBranchId: number | null = branchId,
    ): Promise<number> {
      seq += 1;
      const [row] = await app.db
        .insert(schema.cashRegisters)
        .values(
          tenantValues(ctx, {
            name: `${name} ${seq}`,
            type: "efectivo" as const,
            branchId: cajaBranchId,
            currency: "ARS",
            cutoffDate: "2020-01-01",
          }),
        )
        .$returningId();
      if (ctx.tenantId === TENANT_TEMPLO) cajaIds.push(row.id);
      return row.id;
    }

    async function cajaName(id: number, ctx: TenantContext = TEMPLO_CTX) {
      const [row] = await app.db
        .select({ name: schema.cashRegisters.name })
        .from(schema.cashRegisters)
        .where(
          and(
            tenantWhere(schema.cashRegisters, ctx),
            eq(schema.cashRegisters.id, id),
          ),
        );
      return row.name;
    }

    /** Arqueo de `hoursAgo` horas antes de `now`: contado = esperado + diferencia. */
    async function insertCount(opts: {
      cajaId: number;
      difference: number;
      hoursAgo: number;
      notes?: string | null;
      ctx?: TenantContext;
      countedBy?: number;
    }): Promise<number> {
      const [row] = await app.db
        .insert(schema.cashCounts)
        .values(
          tenantValues(opts.ctx ?? TEMPLO_CTX, {
            cashRegisterId: opts.cajaId,
            countedBy: opts.countedBy ?? ownerId,
            countedAt: new Date(now.getTime() - opts.hoursAgo * HOUR_MS),
            changeFund: 0,
            firmeAmount: EXPECTED,
            pendienteAmount: 0,
            expectedAmount: EXPECTED,
            countedAmount: EXPECTED + opts.difference,
            difference: opts.difference,
            notes: opts.notes ?? null,
          }),
        )
        .$returningId();
      return row.id;
    }

    const cashKey = (cajaId: number, countId: number) =>
      `arqueo_dif:${cajaId}:${countId}`;

    afterEach(async () => {
      await app.db
        .delete(schema.cashCounts)
        .where(tenantWhere(schema.cashCounts, TEMPLO_CTX));
      for (const id of cajaIds) {
        await app.db
          .delete(schema.cashRegisters)
          .where(
            and(
              tenantWhere(schema.cashRegisters, TEMPLO_CTX),
              eq(schema.cashRegisters.id, id),
            ),
          );
      }
      cajaIds = [];
    });

    it("abre un tema con la caja, el monto, quién contó y la nota, y no lo duplica en otra corrida", async () => {
      const cajaId = await makeCaja("Caja Arqueo");
      const note = "x".repeat(600);
      const countId = await insertCount({
        cajaId,
        difference: -2500,
        hoursAgo: 3,
        notes: note,
      });
      const [owner] = await app.db
        .select({
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
        })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, TEMPLO_CTX),
            eq(schema.users.id, ownerId),
          ),
        );
      const ownerName = [owner.firstName, owner.lastName]
        .filter((p) => p)
        .join(" ");

      await run();

      const name = await cajaName(cajaId);
      const [topic] = await topicBySource(cashKey(cajaId, countId));
      expect(topic).toBeDefined();
      expect(topic.origin).toBe("sistema");
      expect(topic.status).toBe("abierto");
      expect(topic.title).toBe(`Arqueo con diferencia: ${name} (-$ 2.500)`);
      expect(topic.targetKind).toBe("caja");
      expect(topic.targetId).toBe(cajaId);
      expect(topic.targetLabel).toBe(name);
      expect(topic.branchId).toBe(branchId);
      expect(topic.body).toContain(`hecho por ${ownerName}`);
      expect(topic.body).toContain("Esperado: $ 10.000");
      expect(topic.body).toContain("Contado: $ 7.500");
      expect(topic.body).toContain("Diferencia: -$ 2.500");
      expect(topic.body).toContain(`Nota: ${"x".repeat(500)}`);
      expect(topic.body).not.toContain("x".repeat(501));

      await run();
      expect(await allTopics()).toHaveLength(1);
    });

    it("una diferencia a favor también abre tema, con signo +", async () => {
      const cajaId = await makeCaja("Caja Sobrante");
      const countId = await insertCount({
        cajaId,
        difference: 800,
        hoursAgo: 2,
        notes: "Sobró",
      });

      await run();

      const [topic] = await topicBySource(cashKey(cajaId, countId));
      expect(topic.title).toContain("(+$ 800)");
    });

    it("no abre tema si el arqueo dio 0", async () => {
      const cajaId = await makeCaja("Caja Justa");
      await insertCount({ cajaId, difference: 0, hoursAgo: 2 });

      await run();

      expect(await allTopics()).toHaveLength(0);
    });

    it("un arqueo posterior con diferencia agrega UN evento al mismo tema y correr dos veces no lo duplica", async () => {
      const cajaId = await makeCaja("Caja Repetida");
      const first = await insertCount({
        cajaId,
        difference: -500,
        hoursAgo: 6,
        notes: "Faltó",
      });
      await run();
      const [topic] = await topicBySource(cashKey(cajaId, first));
      expect((await eventsOf(topic.id)).map((e) => e.type)).toEqual(["creado"]);

      const second = await insertCount({
        cajaId,
        difference: -700,
        hoursAgo: 3,
        notes: "Sigue faltando",
      });
      await run();
      await run();

      // Sigue habiendo UN solo tema (la caja no abre otro dentro del episodio).
      expect(await allTopics()).toHaveLength(1);
      const events = await eventsOf(topic.id);
      expect(events.map((e) => e.type)).toEqual(["creado", "sistema"]);
      expect(events[1].actorId).toBeNull();
      expect(events[1].body).toContain("Nuevo arqueo");
      expect(events[1].body).toContain("diferencia -$ 700");
      expect(events[1].payload).toMatchObject({ cashCountId: second });

      // Un tercero suma su propio evento, uno solo.
      const third = await insertCount({
        cajaId,
        difference: -900,
        hoursAgo: 1,
        notes: "Idem",
      });
      await run();
      await run();
      const after = (await eventsOf(topic.id)).filter(
        (e) => e.type === "sistema",
      );
      expect(after).toHaveLength(2);
      expect(after[1].payload).toMatchObject({ cashCountId: third });
      const [refreshed] = await topicBySource(cashKey(cajaId, first));
      expect(refreshed.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
        topic.lastActivityAt.getTime(),
      );
    });

    it("se cierra solo cuando el último arqueo de la caja da 0", async () => {
      const cajaId = await makeCaja("Caja Que Cierra");
      const countId = await insertCount({
        cajaId,
        difference: -300,
        hoursAgo: 6,
        notes: "Faltó",
      });
      await run();
      await insertCount({ cajaId, difference: 0, hoursAgo: 2 });
      await run();

      const [closed] = await topicBySource(cashKey(cajaId, countId));
      expect(closed.status).toBe("cerrado");
      expect(closed.closedBy).toBeNull();
      const events = await eventsOf(closed.id);
      expect(events.map((e) => e.type)).toEqual(["creado", "sistema"]);
      expect(events[1].body).toBe("El último arqueo dio sin diferencia");
    });

    it("un tema cerrado a mano no se reabre ni recibe eventos mientras sigue el mismo episodio", async () => {
      const cajaId = await makeCaja("Caja Cerrada A Mano");
      const first = await insertCount({
        cajaId,
        difference: -400,
        hoursAgo: 6,
        notes: "Faltó",
      });
      await run();
      const [topic] = await topicBySource(cashKey(cajaId, first));
      const service = new OfficeService(app.db, app.log);
      await service.patchTopic(TEMPLO_CTX, ownerId, topic.id, {
        status: "cerrado",
        note: "Ya lo hablé con la profe",
      });

      // La diferencia sigue en el arqueo siguiente (nadie ajustó el ledger).
      await insertCount({
        cajaId,
        difference: -400,
        hoursAgo: 2,
        notes: "Sigue",
      });
      await run();

      expect(await allTopics()).toHaveLength(1);
      const [same] = await topicBySource(cashKey(cajaId, first));
      expect(same.status).toBe("cerrado");
      expect((await eventsOf(topic.id)).map((e) => e.type)).toEqual([
        "creado",
        "cerrado",
      ]);
    });

    it("un arqueo en 0 seguido de otro con diferencia arranca un episodio nuevo con otro tema", async () => {
      const cajaId = await makeCaja("Caja Dos Episodios");
      const first = await insertCount({
        cajaId,
        difference: -100,
        hoursAgo: 10,
        notes: "Faltó",
      });
      await run();
      const [topic1] = await topicBySource(cashKey(cajaId, first));
      const service = new OfficeService(app.db, app.log);
      await service.patchTopic(TEMPLO_CTX, ownerId, topic1.id, {
        status: "cerrado",
      });

      await insertCount({ cajaId, difference: 0, hoursAgo: 6 });
      await run();
      expect(await allTopics()).toHaveLength(1);

      const second = await insertCount({
        cajaId,
        difference: -200,
        hoursAgo: 2,
        notes: "Otra vez",
      });
      await run();

      const topics = await allTopics();
      expect(topics).toHaveLength(2);
      const [topic2] = await topicBySource(cashKey(cajaId, second));
      expect(topic2.status).toBe("abierto");
      expect(topics.filter((t) => t.status !== "cerrado")).toHaveLength(1);
    });

    it("abre un tema por caja, no uno por arqueo", async () => {
      const a = await makeCaja("Caja A");
      const b = await makeCaja("Caja B");
      await insertCount({
        cajaId: a,
        difference: -10,
        hoursAgo: 5,
        notes: "a",
      });
      await insertCount({
        cajaId: b,
        difference: -20,
        hoursAgo: 4,
        notes: "b",
      });
      await insertCount({
        cajaId: a,
        difference: -30,
        hoursAgo: 3,
        notes: "a",
      });

      await run();

      const topics = await allTopics();
      expect(topics).toHaveLength(2);
      expect(topics.map((t) => t.targetId).sort()).toEqual([a, b].sort());
    });

    it("ignora los arqueos de más de 30 días y cierra el tema que quedó fuera de la ventana", async () => {
      const vieja = await makeCaja("Caja Vieja");
      await insertCount({
        cajaId: vieja,
        difference: -999,
        hoursAgo: 40 * 24,
        notes: "Muy viejo",
      });
      await run();
      expect(await allTopics()).toHaveLength(0);

      // Un arqueo reciente abre tema; 31 días después, sin arqueos nuevos, se cierra solo.
      const cajaId = await makeCaja("Caja Que Envejece");
      const countId = await insertCount({
        cajaId,
        difference: -50,
        hoursAgo: 24,
        notes: "Faltó",
      });
      await run();
      expect((await topicBySource(cashKey(cajaId, countId)))[0].status).toBe(
        "abierto",
      );

      await run(new Date(now.getTime() + 31 * DAY_MS));

      const [closed] = await topicBySource(cashKey(cajaId, countId));
      expect(closed.status).toBe("cerrado");
      const events = await eventsOf(closed.id);
      expect(events[events.length - 1].body).toContain("más de 30 días");
    });

    it("si la racha de diferencias empezó antes de la ventana, el episodio sigue identificado por el arqueo que la abrió", async () => {
      const cajaId = await makeCaja("Caja Racha Larga");
      const opener = await insertCount({
        cajaId,
        difference: -60,
        hoursAgo: 40 * 24,
        notes: "Desde hace rato",
      });
      await insertCount({
        cajaId,
        difference: -60,
        hoursAgo: 2 * 24,
        notes: "Sigue igual",
      });

      await run();

      const topics = await allTopics();
      expect(topics).toHaveLength(1);
      expect(topics[0].sourceKey).toBe(cashKey(cajaId, opener));
    });

    it("cada gimnasio recibe solo los arqueos de sus propias cajas", async () => {
      const gym2 = await seedSecondTenant(app);
      await ensureEfectivoCaja(app, gym2.branchId, "ARS", TENANT_DOS);
      const [cajaDos] = await app.db
        .select({ id: schema.cashRegisters.id })
        .from(schema.cashRegisters)
        .where(
          and(
            tenantWhere(schema.cashRegisters, DOS_CTX),
            eq(schema.cashRegisters.branchId, gym2.branchId),
          ),
        );
      const cajaTemplo = await makeCaja("Caja Templo");
      const countTemplo = await insertCount({
        cajaId: cajaTemplo,
        difference: -111,
        hoursAgo: 3,
        notes: "t",
      });
      const countDos = await insertCount({
        cajaId: cajaDos.id,
        difference: -222,
        hoursAgo: 3,
        notes: "d",
        ctx: DOS_CTX,
        countedBy: gym2.adminId,
      });

      await run();

      expect(
        await topicBySource(cashKey(cajaTemplo, countTemplo)),
      ).toHaveLength(1);
      expect(await topicBySource(cashKey(cajaDos.id, countDos))).toHaveLength(
        0,
      );
      expect(
        await topicBySource(cashKey(cajaDos.id, countDos), DOS_CTX),
      ).toHaveLength(1);
      expect(
        await topicBySource(cashKey(cajaTemplo, countTemplo), DOS_CTX),
      ).toHaveLength(0);
    });
  });

  // ─────────────────────────── 7. Wellhub: clases sin publicar ───────────────────────────

  describe("Wellhub: clases de mañana sin publicar", () => {
    const HOUR_MS = 60 * 60 * 1000;
    const PREFIX = "wellhub_sin_publicar:";
    let tomorrow: string;
    let gymId: number;
    let classSeq = 0;

    async function setGymId(
      id: number | null,
      ctx: TenantContext = TEMPLO_CTX,
      onBranch: number = branchId,
    ): Promise<void> {
      await app.db
        .update(schema.branches)
        .set({ wellhubGymId: id })
        .where(
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.branches.id, onBranch),
          ),
        );
    }

    async function createWellhubSchedule(opts: {
      startTime: string;
      name?: string;
      activityId?: number;
      wellhubEnabled?: boolean;
      isSpecial?: boolean;
      isActive?: boolean;
      createdAt?: Date;
      date?: string;
      ctx?: TenantContext;
      onBranch?: number;
    }): Promise<{ scheduleId: number; activityId: number }> {
      const ctx = opts.ctx ?? TEMPLO_CTX;
      let activityId = opts.activityId;
      if (activityId === undefined) {
        const [activity] = await app.db
          .insert(schema.activities)
          .values(
            tenantValues(ctx, {
              name: opts.name ?? "General",
              isActive: true,
              wellhubEnabled: opts.wellhubEnabled ?? true,
              isSpecial: opts.isSpecial ?? false,
            }),
          )
          .$returningId();
        activityId = activity.id;
      }
      const [schedule] = await app.db
        .insert(schema.schedules)
        .values(
          tenantValues(ctx, {
            branchId: opts.onBranch ?? branchId,
            activityId,
            dayOfWeek: isoDayOfWeek(opts.date ?? tomorrow),
            startTime: opts.startTime,
            endTime: "23:59",
            isActive: opts.isActive ?? true,
            // Explícito (reloj JS): el default del DB corre con el reloj de la
            // sesión MySQL y `now` del job es inyectable, no el real.
            createdAt: opts.createdAt ?? new Date(now.getTime() - 5 * HOUR_MS),
          }),
        )
        .$returningId();
      return { scheduleId: schedule.id, activityId };
    }

    /** Marca el (horario, mañana) como publicado en Wellhub. */
    async function publish(
      scheduleId: number,
      activityId: number,
      date: string = tomorrow,
    ): Promise<void> {
      classSeq += 1;
      let [wellhubClass] = await app.db
        .select({ id: schema.wellhubClasses.id })
        .from(schema.wellhubClasses)
        .where(
          and(
            tenantWhere(schema.wellhubClasses, TEMPLO_CTX),
            eq(schema.wellhubClasses.branchId, branchId),
            eq(schema.wellhubClasses.activityId, activityId),
          ),
        );
      if (!wellhubClass) {
        [wellhubClass] = await app.db
          .insert(schema.wellhubClasses)
          .values(
            tenantValues(TEMPLO_CTX, {
              branchId,
              activityId,
              wellhubClassId: gymId * 1000 + classSeq,
              wellhubProductId: 1,
            }),
          )
          .$returningId();
      }
      await app.db.insert(schema.wellhubSlots).values(
        tenantValues(TEMPLO_CTX, {
          wellhubClassRowId: wellhubClass.id,
          scheduleId,
          sessionDate: date,
          wellhubSlotId: gymId * 1000 + 500 + classSeq,
          totalCapacity: 20,
          totalBooked: 0,
        }),
      );
    }

    async function wellhubTopics(ctx: TenantContext = TEMPLO_CTX) {
      return (await allTopics(ctx)).filter((t) =>
        t.sourceKey?.startsWith(PREFIX),
      );
    }

    const titleOf = (n: number, name: string = branchName) =>
      `Wellhub: ${n} ${n === 1 ? "clase" : "clases"} de mañana sin publicar en ${name}`;

    beforeAll(() => {
      process.env.WELLHUB_API_KEY = "test-api-key";
      process.env.WELLHUB_WEBHOOK_SECRET = "test-webhook-secret";
    });

    afterAll(() => {
      delete process.env.WELLHUB_API_KEY;
      delete process.env.WELLHUB_WEBHOOK_SECRET;
    });

    beforeEach(async () => {
      tomorrow = addDays(todayInTz(timezone, now), 1);
      gymId = 900_000_000 + Math.floor(Math.random() * 1_000_000);
      await setGymId(gymId);
    });

    afterEach(async () => {
      await setGymId(null);
    });

    it("abre un tema agregado por sede y fecha con la lista de clases, y no lo duplica", async () => {
      const a = await createWellhubSchedule({
        startTime: "07:00",
        name: "Técnica",
      });
      await createWellhubSchedule({ startTime: "09:30", name: "General" });
      const sourceKey = `${PREFIX}${branchId}:${tomorrow}`;

      await run();

      const topics = await wellhubTopics();
      expect(topics).toHaveLength(1);
      const [topic] = topics;
      expect(topic.sourceKey).toBe(sourceKey);
      expect(topic.origin).toBe("sistema");
      expect(topic.status).toBe("abierto");
      expect(topic.title).toBe(titleOf(2));
      expect(topic.body).toBe("Técnica 07:00\nGeneral 09:30");
      expect(topic.targetKind).toBe("sede");
      expect(topic.targetId).toBe(branchId);
      expect(topic.targetLabel).toBe(branchName);
      expect(topic.branchId).toBe(branchId);
      expect((await eventsOf(topic.id)).map((e) => e.type)).toEqual(["creado"]);
      expect(a.scheduleId).toBeGreaterThan(0);

      await run();
      expect(await wellhubTopics()).toHaveLength(1);
    });

    it("no abre tema si el slot ya está publicado", async () => {
      const { scheduleId, activityId } = await createWellhubSchedule({
        startTime: "08:00",
      });
      await publish(scheduleId, activityId);

      await run();

      expect(await wellhubTopics()).toHaveLength(0);
    });

    it("no abre tema si la sede no tiene wellhub_gym_id", async () => {
      await createWellhubSchedule({ startTime: "08:00" });
      await setGymId(null);

      await run();

      expect(await wellhubTopics()).toHaveLength(0);
    });

    it("no hace nada si Wellhub no está configurado (el sync no corre)", async () => {
      await createWellhubSchedule({ startTime: "08:00" });
      delete process.env.WELLHUB_API_KEY;
      try {
        await run();
        expect(await wellhubTopics()).toHaveLength(0);
      } finally {
        process.env.WELLHUB_API_KEY = "test-api-key";
      }
    });

    it("respeta el criterio del sync: actividad no habilitada, especial, horario inactivo y excepción de fecha no cuentan", async () => {
      const elegible = await createWellhubSchedule({
        startTime: "10:00",
        name: "Elegible",
      });
      await createWellhubSchedule({
        startTime: "11:00",
        name: "Sin Wellhub",
        wellhubEnabled: false,
      });
      await createWellhubSchedule({
        startTime: "12:00",
        name: "Especial",
        isSpecial: true,
      });
      await createWellhubSchedule({
        startTime: "13:00",
        name: "Inactivo",
        isActive: false,
      });
      const cancelada = await createWellhubSchedule({
        startTime: "14:00",
        name: "Cancelada",
      });
      await app.db.insert(schema.scheduleExceptions).values(
        tenantValues(TEMPLO_CTX, {
          scheduleId: cancelada.scheduleId,
          exceptionDate: tomorrow,
          reason: "Cerrado",
        }),
      );

      await run();

      const [topic] = await wellhubTopics();
      expect(topic.title).toBe(titleOf(1));
      expect(topic.body).toBe("Elegible 10:00");
      expect(elegible.scheduleId).toBeGreaterThan(0);
    });

    it("no abre tema si mañana es feriado en el país de la sede", async () => {
      await createWellhubSchedule({ startTime: "08:00" });
      await app.db.insert(schema.holidays).values(
        tenantValues(TEMPLO_CTX, {
          country,
          date: tomorrow,
          name: "Feriado de prueba",
        }),
      );

      await run();

      expect(await wellhubTopics()).toHaveLength(0);
    });

    it("un horario creado hace menos de 2 horas no cuenta todavía", async () => {
      await createWellhubSchedule({
        startTime: "08:00",
        name: "Nueva",
        createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      });
      await run();
      expect(await wellhubTopics()).toHaveLength(0);

      // Con uno viejo al lado, solo cuenta el viejo.
      await createWellhubSchedule({ startTime: "09:00", name: "Vieja" });
      await run();
      const [topic] = await wellhubTopics();
      expect(topic.title).toBe(titleOf(1));
      expect(topic.body).toBe("Vieja 09:00");
    });

    it("se cierra solo cuando aparece el slot", async () => {
      const { scheduleId, activityId } = await createWellhubSchedule({
        startTime: "08:00",
      });
      await run();
      const [topic] = await wellhubTopics();
      expect(topic.status).toBe("abierto");

      await publish(scheduleId, activityId);
      await run();

      const [closed] = await wellhubTopics();
      expect(closed.status).toBe("cerrado");
      expect(closed.closedBy).toBeNull();
      const events = await eventsOf(closed.id);
      expect(events.map((e) => e.type)).toEqual(["creado", "sistema"]);
      expect(events[1].body).toBe(
        "Wellhub ya tiene todas las clases publicadas",
      );
    });

    it("se cierra con 'Pasó la fecha' cuando la fecha ya pasó sin publicarse", async () => {
      await createWellhubSchedule({ startTime: "08:00" });
      await run();
      expect((await wellhubTopics())[0].status).toBe("abierto");

      await run(new Date(now.getTime() + 3 * DAY_MS));

      const [closed] = await wellhubTopics();
      expect(closed.status).toBe("cerrado");
      const events = await eventsOf(closed.id);
      expect(events[events.length - 1].body).toBe("Pasó la fecha");
    });

    it("si cambia la cantidad actualiza el título del mismo tema sin abrir otro", async () => {
      const first = await createWellhubSchedule({
        startTime: "08:00",
        name: "Uno",
      });
      await run();
      expect((await wellhubTopics())[0].title).toBe(titleOf(1));

      const second = await createWellhubSchedule({
        startTime: "09:00",
        name: "Dos",
      });
      await run();
      let topics = await wellhubTopics();
      expect(topics).toHaveLength(1);
      expect(topics[0].title).toBe(titleOf(2));
      expect(topics[0].body).toBe("Uno 08:00\nDos 09:00");

      await publish(first.scheduleId, first.activityId);
      await run();
      topics = await wellhubTopics();
      expect(topics).toHaveLength(1);
      expect(topics[0].status).toBe("abierto");
      expect(topics[0].title).toBe(titleOf(1));
      expect(topics[0].body).toBe("Dos 09:00");
      // El texto cambió sin sumar eventos al tema.
      expect((await eventsOf(topics[0].id)).map((e) => e.type)).toEqual([
        "creado",
      ]);
      expect(second.scheduleId).toBeGreaterThan(0);
    });

    it("un tema cerrado a mano no se reabre aunque sigan faltando clases", async () => {
      await createWellhubSchedule({ startTime: "08:00" });
      await run();
      const [topic] = await wellhubTopics();
      const service = new OfficeService(app.db, app.log);
      await service.patchTopic(TEMPLO_CTX, ownerId, topic.id, {
        status: "cerrado",
      });

      await createWellhubSchedule({ startTime: "09:00" });
      await run();

      const topics = await wellhubTopics();
      expect(topics).toHaveLength(1);
      expect(topics[0].status).toBe("cerrado");
    });

    it("lista a lo sumo 20 clases y resume el resto con 'y N más'", async () => {
      const { activityId } = await createWellhubSchedule({
        startTime: "06:00",
        name: "Masiva",
      });
      for (let i = 1; i < 22; i += 1) {
        const hh = String(6 + Math.floor(i / 2)).padStart(2, "0");
        const mm = i % 2 === 0 ? "00" : "30";
        await createWellhubSchedule({
          startTime: `${hh}:${mm}`,
          activityId,
        });
      }

      await run();

      const [topic] = await wellhubTopics();
      expect(topic.title).toBe(titleOf(22));
      const lines = (topic.body ?? "").split("\n");
      expect(lines).toHaveLength(21);
      expect(lines[20]).toBe("y 2 más");
    });

    it("cada gimnasio recibe solo el tema de su propia sede", async () => {
      const gym2 = await seedSecondTenant(app);
      await setGymId(gymId + 1, DOS_CTX, gym2.branchId);
      await app.db
        .update(schema.activities)
        .set({ wellhubEnabled: true })
        .where(
          and(
            tenantWhere(schema.activities, DOS_CTX),
            eq(schema.activities.id, gym2.activityId),
          ),
        );
      const [sedeDos] = await app.db
        .select({
          name: schema.branches.name,
          timezone: schema.branches.timezone,
        })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, DOS_CTX),
            eq(schema.branches.id, gym2.branchId),
          ),
        );
      // El horario base del fixture (lunes 10:00, creado "ahora") no debe sumar.
      await app.db
        .update(schema.schedules)
        .set({ isActive: false })
        .where(
          and(
            tenantWhere(schema.schedules, DOS_CTX),
            eq(schema.schedules.id, gym2.scheduleId),
          ),
        );
      const tomorrowDos = addDays(todayInTz(sedeDos.timezone, now), 1);
      await createWellhubSchedule({
        startTime: "08:00",
        activityId: gym2.activityId,
        date: tomorrowDos,
        ctx: DOS_CTX,
        onBranch: gym2.branchId,
      });
      await createWellhubSchedule({ startTime: "09:00" });

      await run();

      const templo = await wellhubTopics();
      expect(templo).toHaveLength(1);
      expect(templo[0].targetId).toBe(branchId);
      const dos = await wellhubTopics(DOS_CTX);
      expect(dos).toHaveLength(1);
      expect(dos[0].targetId).toBe(gym2.branchId);
      expect(dos[0].sourceKey).toBe(`${PREFIX}${gym2.branchId}:${tomorrowDos}`);
      expect(dos[0].title).toBe(titleOf(1, sedeDos.name));
    });
  });
  // ─────────────────────────── 6. Tablero: leads sin cargar ───────────────────────────

  describe("Tablero: leads sin cargar", () => {
    const PREFIX = "tablero_leads:";
    /** Lunes de W+1 (la semana en curso del Tablero, en Argentina) y la semana W que terminó. */
    let monday: string;
    let week: string;
    let extraBranchId: number;
    const EXTRA_NAME = "OAT sede de leads";

    const at = (date: string, hhmm: string): Date => instantAtAr(date, hhmm);
    const shortOf = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    const titleOf = (n: number, weekStart: string = week): string =>
      `Tablero: faltan los leads de la semana del ${shortOf(weekStart)} (${n} ${n === 1 ? "sede" : "sedes"})`;

    /** Sedes activas y físicas del gimnasio (las que cargan leads), por nombre. */
    async function leadsBranches(
      ctx: TenantContext = TEMPLO_CTX,
    ): Promise<Array<{ id: number; name: string }>> {
      return app.db
        .select({ id: schema.branches.id, name: schema.branches.name })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.branches.isActive, true),
            eq(schema.branches.isVirtual, false),
          ),
        )
        .orderBy(asc(schema.branches.name), asc(schema.branches.id));
    }

    async function loadLeads(
      branchIdToLoad: number,
      weekStart: string = week,
      ctx: TenantContext = TEMPLO_CTX,
    ): Promise<void> {
      await app.db.insert(schema.weeklyBoardLeads).values(
        tenantValues(ctx, {
          branchId: branchIdToLoad,
          weekStart,
          leads: 7,
        }),
      );
    }

    /** Carga los leads de la semana W de todas las sedes menos las indicadas. */
    async function loadAllExcept(skip: number[]): Promise<void> {
      for (const b of await leadsBranches()) {
        if (!skip.includes(b.id)) await loadLeads(b.id);
      }
    }

    async function tableroTopics(ctx: TenantContext = TEMPLO_CTX) {
      return (await allTopics(ctx)).filter((t) =>
        t.sourceKey?.startsWith(PREFIX),
      );
    }

    async function removeExtraBranch(): Promise<void> {
      await app.db
        .delete(schema.weeklyBoardLeads)
        .where(
          and(
            tenantWhere(schema.weeklyBoardLeads, TEMPLO_CTX),
            eq(schema.weeklyBoardLeads.branchId, extraBranchId),
          ),
        );
      await app.db
        .delete(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, TEMPLO_CTX),
            eq(schema.branches.code, "OATL"),
          ),
        );
    }

    beforeEach(async () => {
      monday = currentWeekStart(new Date());
      week = addDays(monday, -7);
      await app.db
        .delete(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, TEMPLO_CTX),
            eq(schema.branches.code, "OATL"),
          ),
        );
      const [extra] = await app.db
        .insert(schema.branches)
        .values(
          tenantValues(TEMPLO_CTX, {
            name: EXTRA_NAME,
            code: "OATL",
            country: "AR",
            isVirtual: false,
            isActive: true,
          }),
        )
        .$returningId();
      extraBranchId = extra.id;
    });

    afterEach(async () => {
      await removeExtraBranch();
    });

    it("abre el martes de W+1 un tema agregado con las sedes que faltan", async () => {
      await loadAllExcept([extraBranchId]);

      await run(at(addDays(monday, 1), "10:00"));

      const topics = await tableroTopics();
      expect(topics).toHaveLength(1);
      const [topic] = topics;
      expect(topic.sourceKey).toBe(`${PREFIX}${week}`);
      expect(topic.origin).toBe("sistema");
      expect(topic.status).toBe("abierto");
      expect(topic.title).toBe(titleOf(1));
      expect(topic.body).toBe(EXTRA_NAME);
      expect(topic.targetKind).toBe("tablero");
      expect(topic.targetId).toBe(Number(week.replaceAll("-", "")));
      expect(topic.targetLabel).toBe(`Semana del ${shortOf(week)}`);
      expect(topic.branchId).toBeNull();
      expect((await eventsOf(topic.id)).map((e) => e.type)).toEqual(["creado"]);
    });

    it("no abre el lunes de W+1, ni a la noche del lunes en Argentina (martes en UTC)", async () => {
      await loadAllExcept([extraBranchId]);

      await run(at(monday, "10:00"));
      expect(await tableroTopics()).toHaveLength(0);

      // 23:30 AR del lunes = 02:30 UTC del martes: sigue siendo lunes para el Tablero.
      await run(at(monday, "23:30"));
      expect(await tableroTopics()).toHaveLength(0);

      // 00:30 AR del martes: ahora sí.
      await run(at(addDays(monday, 1), "00:30"));
      expect(await tableroTopics()).toHaveLength(1);
    });

    it("no abre nada si todas las sedes cargaron los leads de W", async () => {
      await loadAllExcept([]);

      await run(at(addDays(monday, 1), "10:00"));

      expect(await tableroTopics()).toHaveLength(0);
    });

    it("solo cuenta la semana W: los leads de la semana en curso no sirven", async () => {
      for (const b of await leadsBranches()) await loadLeads(b.id, monday);

      await run(at(addDays(monday, 1), "10:00"));

      const [topic] = await tableroTopics();
      expect(topic).toBeDefined();
      expect(topic.title).toBe(titleOf((await leadsBranches()).length));
    });

    it("las sedes inactivas no cuentan", async () => {
      await loadAllExcept([extraBranchId]);
      await app.db
        .update(schema.branches)
        .set({ isActive: false })
        .where(
          and(
            tenantWhere(schema.branches, TEMPLO_CTX),
            eq(schema.branches.id, extraBranchId),
          ),
        );

      await run(at(addDays(monday, 1), "10:00"));

      expect(await tableroTopics()).toHaveLength(0);
    });

    it("el título refleja N y se reescribe al cargar una sede, sin evento nuevo ni mover la actividad", async () => {
      const all = await leadsBranches();
      expect(all.length).toBeGreaterThanOrEqual(2);
      const tuesday = at(addDays(monday, 1), "10:00");

      await run(tuesday);
      const [before] = await tableroTopics();
      expect(before.title).toBe(titleOf(all.length));
      const bodyBefore = (before.body ?? "").split("\n");
      expect(bodyBefore).toEqual(all.map((b) => b.name));

      const loaded = all[0];
      await loadLeads(loaded.id);
      await run(at(addDays(monday, 1), "11:00"));

      const topics = await tableroTopics();
      expect(topics).toHaveLength(1);
      const [after] = topics;
      expect(after.id).toBe(before.id);
      expect(after.status).toBe("abierto");
      expect(after.title).toBe(titleOf(all.length - 1));
      expect(after.body).not.toContain(loaded.name);
      expect((after.body ?? "").split("\n")).toHaveLength(all.length - 1);
      expect((await eventsOf(after.id)).map((e) => e.type)).toEqual(["creado"]);
      expect(after.lastActivityAt.getTime()).toBe(
        before.lastActivityAt.getTime(),
      );
    });

    it("se cierra solo cuando todas las sedes cargaron", async () => {
      await loadAllExcept([extraBranchId]);
      await run(at(addDays(monday, 1), "10:00"));
      expect(await tableroTopics()).toHaveLength(1);

      await loadLeads(extraBranchId);
      await run(at(addDays(monday, 1), "11:00"));

      const [closed] = await tableroTopics();
      expect(closed.status).toBe("cerrado");
      expect(closed.closedBy).toBeNull();
      const events = await eventsOf(closed.id);
      expect(events.map((e) => e.type)).toEqual(["creado", "sistema"]);
      expect(events[1].body).toBe(
        "Ya están cargados los leads de todas las sedes",
      );
    });

    it("se cierra solo cuando vence la ventana de carga de esa semana", async () => {
      await loadAllExcept([extraBranchId]);
      const lastSunday = at(addDays(monday, 6), "22:00");
      await run(at(addDays(monday, 1), "10:00"));
      await run(lastSunday);
      // Todavía editable (domingo de W+1): sigue abierto.
      expect((await tableroTopics())[0].status).toBe("abierto");

      // Lunes de W+2: W ya no se puede editar.
      await run(at(addDays(monday, 7), "10:00"));

      const topics = await tableroTopics();
      expect(topics).toHaveLength(1);
      expect(topics[0].status).toBe("cerrado");
      const events = await eventsOf(topics[0].id);
      expect(events.map((e) => e.type)).toEqual(["creado", "sistema"]);
      expect(events[1].body).toBe("Se cerró la ventana de carga de esa semana");

      // El martes de W+2 se abre el tema de la semana siguiente, con otra key.
      await run(at(addDays(monday, 8), "10:00"));
      const next = await tableroTopics();
      expect(next).toHaveLength(2);
      expect(next.map((t) => t.sourceKey)).toContain(`${PREFIX}${monday}`);
    });

    it("correr dos veces no duplica el tema", async () => {
      await loadAllExcept([extraBranchId]);
      const tuesday = at(addDays(monday, 1), "10:00");

      await run(tuesday);
      await run(tuesday);
      await run(at(addDays(monday, 2), "10:00"));

      const topics = await tableroTopics();
      expect(topics).toHaveLength(1);
      expect((await eventsOf(topics[0].id)).map((e) => e.type)).toEqual([
        "creado",
      ]);
    });

    it("un tema cerrado a mano no se reabre mientras falten sedes", async () => {
      await loadAllExcept([extraBranchId]);
      await run(at(addDays(monday, 1), "10:00"));
      const [topic] = await tableroTopics();

      const service = new OfficeService(app.db, app.log);
      await service.patchTopic(TEMPLO_CTX, ownerId, topic.id, {
        status: "cerrado",
        note: "Se los pido a Nacho el jueves",
      });

      await run(at(addDays(monday, 2), "10:00"));

      const topics = await tableroTopics();
      expect(topics).toHaveLength(1);
      expect(topics[0].status).toBe("cerrado");
      expect(topics[0].closedBy).toBe(ownerId);
      const types = (await eventsOf(topic.id)).map((e) => e.type);
      expect(types).toEqual(["creado", "cerrado"]);
    });

    it("cada gimnasio recibe solo el tema de sus propias sedes", async () => {
      const gym2 = await seedSecondTenant(app);
      const [sedeDos] = await app.db
        .select({ name: schema.branches.name })
        .from(schema.branches)
        .where(
          and(
            tenantWhere(schema.branches, DOS_CTX),
            eq(schema.branches.id, gym2.branchId),
          ),
        );
      const tuesday = at(addDays(monday, 1), "10:00");

      // Falta todo en los dos gimnasios: cada uno ve solo sus sedes.
      await run(tuesday);
      const templo = await tableroTopics();
      const dos = await tableroTopics(DOS_CTX);
      expect(templo).toHaveLength(1);
      expect(dos).toHaveLength(1);
      expect(dos[0].title).toBe(titleOf(1));
      expect(dos[0].body).toBe(sedeDos.name);
      expect(templo[0].body).not.toContain(sedeDos.name);
      expect(templo[0].title).toBe(titleOf((await leadsBranches()).length));

      // El gimnasio 2 carga lo suyo: el suyo se cierra, el de El Templo sigue igual.
      await loadLeads(gym2.branchId, week, DOS_CTX);
      await run(at(addDays(monday, 1), "11:00"));
      expect((await tableroTopics(DOS_CTX))[0].status).toBe("cerrado");
      const temploAfter = await tableroTopics();
      expect(temploAfter[0].status).toBe("abierto");
      expect(temploAfter[0].title).toBe(templo[0].title);
    });
  });
});
