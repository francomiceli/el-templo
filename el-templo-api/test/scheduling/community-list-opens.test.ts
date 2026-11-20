/**
 * Fase 214 (plan de lanzamiento de la Comunidad): registro de aperturas de la
 * lista de anotados, `community_list_opens` (mig 0354).
 *
 * GET /api/members/scheduling/slots/:scheduleId/:date/attendees
 *
 * Cada 200 suma 1 a la fila del alumno para ese horario y fecha. No se registra
 * nada en un 400/404 y la escritura nunca rompe la lista. Fechas relativas a
 * hoy en la zona de la sede y usuarios siempre por fabrica (ningun id de
 * `users` hardcodeado).
 */
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
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import {
  createTestApp,
  createTestPlan,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  recordListOpen,
  type ListOpensDb,
} from "../../src/modules/scheduling/list-opens";
import {
  TENANT_TEMPLO,
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";
import { restoreTemploFlags } from "../fixtures/module-flags";
import {
  DEFAULT_TENANT_TIMEZONE,
  addDays,
  dowInTz,
  todayInTz,
} from "../../src/modules/shared/date-utils";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const MEMBER_URL = "/api/members/scheduling";

interface Socio {
  id: number;
  token: string;
}

describe("Fase 214: registro de aperturas de la lista de anotados (mig 0354)", () => {
  let app: FastifyInstance;
  let testBranchId: number;
  let today: string;
  let tz: string;
  let planId: number;
  let scheduleId: number;
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({ id: schema.branches.id, tz: schema.branches.timezone })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          eq(schema.branches.isVirtual, false),
          // El servicio solo sirve horarios de sedes activas: la primera sede
          // no virtual de la base de pruebas (PARK) esta desactivada.
          eq(schema.branches.isActive, true),
        ),
      )
      .orderBy(asc(schema.branches.id))
      .limit(1);
    testBranchId = branch.id;
    tz = branch.tz ?? DEFAULT_TENANT_TIMEZONE;
    today = todayInTz(tz);
  });

  afterAll(async () => {
    await restoreTemploFlags(app);
    await cleanAllTestData(app);
    await limpiarSegundoGimnasio(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await restoreTemploFlags(app);
    seq += 1;
    const adminToken = await getAuthToken(
      app,
      "admin@test.com",
      "adminpass123",
    );
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan aperturas 214 ${seq} ${Date.now()}`,
    });
    planId = plan.id;
    scheduleId = await sembrarHorario();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Fabricas ──────────────────────────────────────────────────────────────

  /** Horario de HOY en la sede de prueba (el dia de la semana sale de la fecha). */
  async function sembrarHorario(): Promise<number> {
    const [activity] = await app.db
      .insert(schema.activities)
      .values({ name: "General", description: "214-aperturas" })
      .$returningId();
    const [schedule] = await app.db
      .insert(schema.schedules)
      .values({
        branchId: testBranchId,
        activityId: activity.id,
        dayOfWeek: dowInTz(tz),
        startTime: "19:00",
        endTime: "20:00",
        isActive: true,
      })
      .$returningId();
    return schedule.id;
  }

  /** Socio de la sede de prueba; con `conPlan` tiene una suscripcion en vigor. */
  async function crearSocio(conPlan: boolean): Promise<Socio> {
    seq += 1;
    const email = `aperturas-${seq}-${Date.now()}@test.com`;
    const registered = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: `Nom${seq}`,
      lastName: `Apellido${seq}`,
      branchId: testBranchId,
    });
    const id = (registered.user as { id: number }).id;
    if (conPlan) {
      await app.db
        .update(schema.users)
        .set({ status: "activo" })
        .where(and(tenantWhere(schema.users, CTX), eq(schema.users.id, id)));
      await app.db.insert(schema.subscriptions).values({
        tenantId: TENANT_TEMPLO,
        userId: id,
        planId,
        branchId: testBranchId,
        status: "active",
        startDate: addDays(today, -40),
        endDate: addDays(today, 20),
        pricePaid: 15000,
        currency: "ARS",
        priceTypeApplied: "regular",
      });
    }
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  async function abrirLista(
    token: string,
    forSchedule: number = scheduleId,
    date: string = today,
  ) {
    return app.inject({
      method: "GET",
      url: `${MEMBER_URL}/slots/${forSchedule}/${date}/attendees`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  /** Filas de aperturas de un alumno (ordenadas para comparar estable). */
  async function aperturasDe(userId: number) {
    return app.db
      .select()
      .from(schema.communityListOpens)
      .where(
        and(
          tenantWhere(schema.communityListOpens, CTX),
          eq(schema.communityListOpens.userId, userId),
        ),
      )
      .orderBy(
        asc(schema.communityListOpens.scheduleId),
        asc(schema.communityListOpens.sessionDate),
      );
  }

  // ── Registro ──────────────────────────────────────────────────────────────

  it("primera apertura: una fila con open_count 1 y first = last", async () => {
    const yo = await crearSocio(true);

    const res = await abrirLista(yo.token);

    expect(res.statusCode, res.body).toBe(200);
    const filas = await aperturasDe(yo.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].tenantId).toBe(TENANT_TEMPLO);
    expect(filas[0].scheduleId).toBe(scheduleId);
    expect(filas[0].sessionDate).toBe(today);
    expect(filas[0].openCount).toBe(1);
    expect(filas[0].firstOpenedAt.getTime()).toBe(
      filas[0].lastOpenedAt.getTime(),
    );
  });

  it("segunda apertura del mismo horario y fecha: la misma fila con open_count 2", async () => {
    const yo = await crearSocio(true);

    await abrirLista(yo.token);
    const [primera] = await aperturasDe(yo.id);
    const res = await abrirLista(yo.token);

    expect(res.statusCode, res.body).toBe(200);
    const filas = await aperturasDe(yo.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].id).toBe(primera.id);
    expect(filas[0].openCount).toBe(2);
    expect(filas[0].firstOpenedAt.getTime()).toBe(
      primera.firstOpenedAt.getTime(),
    );
    expect(filas[0].lastOpenedAt.getTime()).toBeGreaterThanOrEqual(
      filas[0].firstOpenedAt.getTime(),
    );
  });

  it("otra fecha, otro horario u otro alumno: filas separadas", async () => {
    const yo = await crearSocio(true);
    const otro = await crearSocio(true);
    const otroHorario = await sembrarHorario();
    const manana = addDays(today, 1);

    await abrirLista(yo.token, scheduleId, today);
    await abrirLista(yo.token, scheduleId, manana);
    await abrirLista(yo.token, otroHorario, today);
    await abrirLista(otro.token, scheduleId, today);

    const mias = await aperturasDe(yo.id);
    expect(mias).toHaveLength(3);
    expect(mias.every((f) => f.openCount === 1)).toBe(true);
    expect(mias.map((f) => `${f.scheduleId}|${f.sessionDate}`).sort()).toEqual(
      [
        `${scheduleId}|${today}`,
        `${scheduleId}|${manana}`,
        `${otroHorario}|${today}`,
      ].sort(),
    );
    const delOtro = await aperturasDe(otro.id);
    expect(delOtro).toHaveLength(1);
    expect(delOtro[0].openCount).toBe(1);
  });

  it("un alumno sin plan en vigor (ve solo el total) tambien cuenta", async () => {
    const yo = await crearSocio(false);

    const res = await abrirLista(yo.token);

    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body).canSeeList).toBe(false);
    const filas = await aperturasDe(yo.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].openCount).toBe(1);
  });

  // ── Lo que NO se registra ────────────────────────────────────────────────

  it("fecha fuera de rango o con formato invalido (400): no registra nada", async () => {
    const yo = await crearSocio(true);

    const ayer = await abrirLista(yo.token, scheduleId, addDays(today, -1));
    const lejos = await abrirLista(yo.token, scheduleId, addDays(today, 32));
    const formato = await abrirLista(yo.token, scheduleId, "hoy");

    expect(ayer.statusCode).toBe(400);
    expect(lejos.statusCode).toBe(400);
    expect(formato.statusCode).toBe(400);
    expect(await aperturasDe(yo.id)).toHaveLength(0);
  });

  it("horario inexistente (404): no registra nada", async () => {
    const yo = await crearSocio(true);

    const res = await abrirLista(yo.token, 999_999_999);

    expect(res.statusCode).toBe(404);
    expect(await aperturasDe(yo.id)).toHaveLength(0);
  });

  it("horario de otro gimnasio (404): no registra nada", async () => {
    const yo = await crearSocio(true);
    const gym2 = await seedSecondTenant(app);

    const res = await abrirLista(yo.token, gym2.scheduleId);

    expect(res.statusCode).toBe(404);
    expect(await aperturasDe(yo.id)).toHaveLength(0);
  });

  // ── Tenant ───────────────────────────────────────────────────────────────

  it("la fila lleva el tenant del que pide: un socio del gimnasio 2 queda con el tenant 2", async () => {
    const gym2 = await seedSecondTenant(app);
    const socio = gym2.socios[0];
    const manana = addDays(todayInTz(DEFAULT_TENANT_TIMEZONE), 1);

    const res = await abrirLista(socio.token, gym2.scheduleId, manana);

    expect(res.statusCode, res.body).toBe(200);
    const filas = await app.db
      .select()
      .from(schema.communityListOpens)
      .where(
        and(
          eq(schema.communityListOpens.tenantId, gym2.tenantId),
          eq(schema.communityListOpens.userId, socio.id),
        ),
      );
    expect(filas).toHaveLength(1);
    expect(filas[0].scheduleId).toBe(gym2.scheduleId);
    expect(filas[0].openCount).toBe(1);
    // Nada quedo en El Templo.
    expect(await aperturasDe(socio.id)).toHaveLength(0);
  });

  // ── Una falla del registro nunca rompe la lista ──────────────────────────

  it("si la escritura falla, la lista igual responde 200", async () => {
    const yo = await crearSocio(true);
    vi.spyOn(app.db, "insert").mockImplementation(() => {
      throw new Error("boom: base caida");
    });

    const res = await abrirLista(yo.token);
    vi.restoreAllMocks();

    expect(res.statusCode, res.body).toBe(200);
    expect(await aperturasDe(yo.id)).toHaveLength(0);
  });

  it("recordListOpen: una base que lanza resuelve y deja un warn solo con ids", async () => {
    const warn = vi.fn();
    const log = { warn } as unknown as FastifyBaseLogger;
    const dbQueFalla = {
      insert: () => {
        throw new Error("boom");
      },
    } as unknown as ListOpensDb;

    await expect(
      recordListOpen(dbQueFalla, CTX, log, 7, 11, "2026-11-20"),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    const [contexto] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(contexto).toMatchObject({
      tenantId: TENANT_TEMPLO,
      userId: 7,
      scheduleId: 11,
      sessionDate: "2026-11-20",
    });
  });

  it("recordListOpen: una promesa rechazada en el upsert tambien se absorbe", async () => {
    const warn = vi.fn();
    const log = { warn } as unknown as FastifyBaseLogger;
    const dbRechaza = {
      insert: () => ({
        values: () => ({
          onDuplicateKeyUpdate: () => Promise.reject(new Error("deadlock")),
        }),
      }),
    } as unknown as ListOpensDb;

    await expect(
      recordListOpen(dbRechaza, CTX, log, 7, 11, "2026-11-20"),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("recordListOpen contra la base real: dos llamadas suman en la misma fila y no loguean", async () => {
    const yo = await crearSocio(true);
    const log = { warn: vi.fn() } as unknown as FastifyBaseLogger;

    await recordListOpen(app.db, CTX, log, yo.id, scheduleId, today);
    await recordListOpen(app.db, CTX, log, yo.id, scheduleId, today);

    const filas = await aperturasDe(yo.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].openCount).toBe(2);
    expect(log.warn).not.toHaveBeenCalled();
  });
});
