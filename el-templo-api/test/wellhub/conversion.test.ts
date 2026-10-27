/**
 * Fase 204 (D-04/D-17/D-23/D-15/D-22) — conversion Wellhub -> socio.
 *
 * El evento se registra en `recomputeUserStatus` (misma tx que el cambio de
 * estado), asi que se ejercita por la vía real: `assignTestPlan` (alta de
 * membresia) y `/subscription/renew`. Para la guarda de transicion, la
 * idempotencia y los planes de prueba se llama ademas a
 * `recordWellhubConversion` directo.
 *
 * Las personas son las del brief (fixtures de `wellhub-personas.ts`): visitante
 * nuevo (status `wellhub`), ex-alumno inactivo vinculado y socio activo con
 * gympass_id. Fechas relativas a "hoy"; ningun id de `users` hardcodeado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { recordWellhubConversion } from "../../src/modules/wellhub/conversion";
import {
  assignTestPlan,
  cleanAllTestData,
  createTestApp,
  createTestPlan,
  dateOffsetStr,
  getAuthToken,
  todayStr,
} from "../helpers";
import {
  TEMPLO_CTX,
  branchToday,
  createWellhubExAlumno,
  createWellhubSocioActivo,
  createWellhubVisitor,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;
const DAY_MS = 86_400_000;

describe("Fase 204 D-04/D-23: conversión Wellhub → socio", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
  let scheduleId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan 204-08 ${Date.now().toString(36)}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
    ({ scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    }));
  });

  async function conversionsOf(userId: number) {
    return app.db
      .select()
      .from(schema.wellhubConversions)
      .where(
        and(
          tenantWhere(schema.wellhubConversions, TEMPLO_CTX),
          eq(schema.wellhubConversions.userId, userId),
        ),
      );
  }

  async function statusOf(userId: number): Promise<string | null> {
    const [row] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, userId)),
      );
    return row?.status ?? null;
  }

  /** Mueve la ultima salida de `activo` del usuario a hace `daysAgo` dias. */
  async function moveLeftActivoTo(userId: number, daysAgo: number) {
    await app.db
      .update(schema.userStatusHistory)
      .set({ changedAt: new Date(Date.now() - daysAgo * DAY_MS) })
      .where(
        and(
          tenantWhere(schema.userStatusHistory, TEMPLO_CTX),
          eq(schema.userStatusHistory.userId, userId),
          eq(schema.userStatusHistory.fromStatus, "activo"),
        ),
      );
  }

  it("visitante Wellhub que se asocia: queda activo y se registra una conversión nuevo", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });

    const assigned = await assignTestPlan(app, adminToken, visitor.id, planId, {
      branchId: BRANCH_ID,
    });
    expect(assigned.statusCode).toBe(201);
    const subscriptionId = (assigned.body as { id: number }).id;

    expect(await statusOf(visitor.id)).toBe("activo");

    const rows = await conversionsOf(visitor.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("nuevo");
    expect(rows[0].fromStatus).toBe("wellhub");
    expect(rows[0].subscriptionId).toBe(subscriptionId);
    expect(rows[0].planId).toBe(planId);
    expect(rows[0].branchId).toBe(BRANCH_ID);
    expect(rows[0].localDate).toBe(await branchToday(app, BRANCH_ID));
  });

  it("ex-alumno con actividad Wellhub que vuelve: conversión ex_alumno", async () => {
    const exAlumno = await createWellhubExAlumno(app, adminToken, {
      branchId: BRANCH_ID,
      planId,
    });
    // Dejó de ser socio hace 10 días y desde entonces reservó por Wellhub.
    await moveLeftActivoTo(exAlumno.id, 10);
    await insertBooking(app, {
      memberId: exAlumno.id,
      scheduleId,
      bookingDate: dateOffsetStr(-3),
      status: "confirmado",
      source: "wellhub",
    });

    const assigned = await assignTestPlan(
      app,
      adminToken,
      exAlumno.id,
      planId,
      { branchId: BRANCH_ID },
    );
    expect(assigned.statusCode).toBe(201);

    expect(await statusOf(exAlumno.id)).toBe("activo");
    const rows = await conversionsOf(exAlumno.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("ex_alumno");
    expect(rows[0].fromStatus).toBe("inactivo");
    expect(rows[0].subscriptionId).toBe((assigned.body as { id: number }).id);
  });

  it("inactivo con gympass sin actividad Wellhub desde que dejó de ser socio: no registra", async () => {
    const exAlumno = await createWellhubExAlumno(app, adminToken, {
      branchId: BRANCH_ID,
      planId,
    });
    // Dejó de ser socio hace 10 días. Su única actividad Wellhub es de hace 40.
    await moveLeftActivoTo(exAlumno.id, 10);
    const bookingId = await insertBooking(app, {
      memberId: exAlumno.id,
      scheduleId,
      bookingDate: dateOffsetStr(-40),
      status: "confirmado",
      source: "wellhub",
    });
    await app.db
      .update(schema.bookings)
      .set({ bookedAt: new Date(Date.now() - 40 * DAY_MS) })
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.id, bookingId),
        ),
      );
    await insertAttendance(app, {
      memberId: exAlumno.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: dateOffsetStr(-40),
      source: "wellhub",
      checkedInAt: new Date(Date.now() - 40 * DAY_MS),
    });

    const assigned = await assignTestPlan(
      app,
      adminToken,
      exAlumno.id,
      planId,
      { branchId: BRANCH_ID },
    );
    expect(assigned.statusCode).toBe(201);

    expect(await statusOf(exAlumno.id)).toBe("activo");
    expect(await conversionsOf(exAlumno.id)).toHaveLength(0);
  });

  it("socio activo que renueva: no registra conversión", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });
    await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: dateOffsetStr(-2),
      status: "confirmado",
      source: "wellhub",
    });

    // Renovación temprana: la nueva sub queda programada y el socio sigue activo.
    const renewRes = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/members/${socio.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", amountReceived: 0 },
    });
    expect(renewRes.statusCode).toBe(201);

    expect(await statusOf(socio.id)).toBe("activo");
    expect(await conversionsOf(socio.id)).toHaveLength(0);

    // La guarda de transición también corta llamando directo: activo -> activo.
    await recordWellhubConversion(
      app.db,
      TEMPLO_CTX,
      socio.id,
      "activo",
      "activo",
      app.log,
    );
    expect(await conversionsOf(socio.id)).toHaveLength(0);
  });

  it("la conversión no se duplica si el recálculo corre de nuevo", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const assigned = await assignTestPlan(app, adminToken, visitor.id, planId, {
      branchId: BRANCH_ID,
    });
    expect(assigned.statusCode).toBe(201);
    expect(await conversionsOf(visitor.id)).toHaveLength(1);

    // Simula un segundo recálculo que viera la misma transición.
    await recordWellhubConversion(
      app.db,
      TEMPLO_CTX,
      visitor.id,
      "wellhub",
      "activo",
      app.log,
    );
    await recordWellhubConversion(
      app.db,
      TEMPLO_CTX,
      visitor.id,
      "wellhub",
      "activo",
      app.log,
    );

    expect(await conversionsOf(visitor.id)).toHaveLength(1);
  });

  it("una suscripción de prueba (is_trial) nunca registra conversión", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });

    // Plan de prueba (is_trial) con una sub vigente: da acceso, no membresía.
    const [trialPlan] = await app.db.insert(schema.subscriptionPlans).values(
      tenantValues(TEMPLO_CTX, {
        name: `Prueba 204-08 ${Date.now().toString(36)}`,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory: "especial" as const,
        priceRegular: 0,
        priceZero: 0,
        durationDays: 6,
        classesPerWeek: 3,
        isTrial: true,
        multiBranch: true,
        country: "AR" as const,
        currency: "ARS",
      }),
    );
    await app.db.insert(schema.subscriptions).values(
      tenantValues(TEMPLO_CTX, {
        userId: visitor.id,
        planId: Number(trialPlan.insertId),
        branchId: BRANCH_ID,
        status: "active" as const,
        startDate: todayStr(),
        endDate: dateOffsetStr(6),
        pricePaid: 0,
        priceTypeApplied: "zero" as const,
      }),
    );

    // Aun forzando la transición, no hay membresía real: no se registra nada
    // (una fila acá bloquearía el borrado físico de la compensación de la prueba).
    await recordWellhubConversion(
      app.db,
      TEMPLO_CTX,
      visitor.id,
      "wellhub",
      "activo",
      app.log,
    );

    expect(await conversionsOf(visitor.id)).toHaveLength(0);
  });

  it("embudo con entryOrigin=wellhub responde 200 con la tasa a socio", async () => {
    // Dos visitantes con visita Wellhub hoy: uno se asocia, el otro no.
    const convertido = await createWellhubVisitor(app, {
      branchId: BRANCH_ID,
    });
    const quedaAfuera = await createWellhubVisitor(app, {
      branchId: BRANCH_ID,
    });
    for (const v of [convertido, quedaAfuera]) {
      await insertAttendance(app, {
        memberId: v.id,
        branchId: BRANCH_ID,
        scheduleId,
        sessionDate: todayStr(),
        source: "wellhub",
      });
    }
    const assigned = await assignTestPlan(
      app,
      adminToken,
      convertido.id,
      planId,
      { branchId: BRANCH_ID },
    );
    expect(assigned.statusCode).toBe(201);

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/analytics/funnel?entryOrigin=wellhub",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      entryOrigin: string;
      cohorts: Array<{
        cohortMonth: string;
        size: number;
        toPruebaPct: number;
        toActivoPct: number;
        medianDaysFreemiumToPrueba: number | null;
        medianDaysPruebaToActivo: number | null;
      }>;
    };
    expect(body.entryOrigin).toBe("wellhub");

    const total = body.cohorts.reduce((sum, c) => sum + c.size, 0);
    expect(total).toBe(2);
    const cohort = body.cohorts[0];
    expect(cohort.toPruebaPct).toBe(100);
    expect(cohort.toActivoPct).toBe(50);
    expect(cohort.medianDaysFreemiumToPrueba).toBeNull();
    expect(cohort.medianDaysPruebaToActivo).toBe(0);
  });
});
