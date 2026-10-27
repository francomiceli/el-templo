/**
 * Fase 204 D-18 — separacion plan vs Wellhub, lado suscripcion.
 *
 * Las visitas Wellhub van por separado del plan del socio: no gastan el uso
 * semanal que muestra la SubscriptionCard y no bloquean operaciones del plan
 * (mover la fecha de inicio, compensar dias). Una asistencia PROPIA (qr/manual)
 * sigue bloqueando ambas: los controles lo prueban.
 *
 * Sitios cubiertos (subscriptions/service.ts):
 *   - `getClassUsageThisWeek`        (GET members/:id/class-usage)
 *   - `editSubscriptionStartDate`    (PATCH subscriptions/:id/start-date)
 *   - `compensateDays`               (POST subscriptions/:id/compensate-days)
 *
 * Fechas relativas a la fecha de inicio real de la suscripcion (leida de la
 * DB), nunca fechas fijas.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { addDays } from "../../src/modules/shared/date-utils";
import {
  createTestApp,
  createTestPlan,
  cleanAllTestData,
  getAuthToken,
} from "../helpers";
import { SUBSCRIPTIONS_URL } from "../subscriptions/_helpers";
import {
  TEMPLO_CTX,
  createWellhubSocioActivo,
  insertAttendance,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;

describe("Fase 204 D-18: separación plan vs Wellhub (suscripción)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;

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
      name: `Plan 204-03 subs ${Date.now().toString(36)}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
  });

  async function readSub(subscriptionId: number) {
    const [row] = await app.db
      .select({
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
      })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, subscriptionId),
        ),
      );
    if (!row) throw new Error(`suscripcion ${subscriptionId} inexistente`);
    return row;
  }

  function patchStartDate(subscriptionId: number, startDate: string) {
    return app.inject({
      method: "PATCH",
      url: `${SUBSCRIPTIONS_URL}/subscriptions/${subscriptionId}/start-date`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { startDate },
    });
  }

  function compensate(
    subscriptionId: number,
    fromDate: string,
    toDate: string,
  ) {
    return app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/subscriptions/${subscriptionId}/compensate-days`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { fromDate, toDate, reason: "Fase 204 separacion Wellhub" },
    });
  }

  it("el uso semanal de la suscripción no cuenta visitas Wellhub", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const { startDate } = await readSub(socio.subscriptionId);

    // 1 asistencia propia + 2 visitas Wellhub (las dos fuentes), todas
    // 'confirmado' con check-in de ahora (dentro de la semana en curso).
    const now = new Date();
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: startDate,
      source: "qr",
      checkedInAt: now,
    });
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: startDate,
      source: "wellhub",
      checkedInAt: now,
    });
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: startDate,
      source: "wellhub_manual",
      checkedInAt: now,
    });

    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${socio.id}/class-usage`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).classesUsedThisWeek).toBe(1);
  });

  it("una visita Wellhub en el rango no bloquea mover la fecha de inicio", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const { startDate } = await readSub(socio.subscriptionId);
    const nuevoInicio = addDays(startDate, 5);

    // Visita Wellhub dentro de [inicio actual, nuevo inicio).
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: addDays(startDate, 2),
      source: "wellhub",
    });

    const res = await patchStartDate(socio.subscriptionId, nuevoInicio);
    expect(res.statusCode).toBe(200);
    expect((await readSub(socio.subscriptionId)).startDate).toBe(nuevoInicio);
  });

  it("control: una asistencia propia en el rango sí bloquea mover la fecha de inicio", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const { startDate } = await readSub(socio.subscriptionId);

    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: addDays(startDate, 2),
      source: "qr",
    });

    const res = await patchStartDate(
      socio.subscriptionId,
      addDays(startDate, 5),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      "asistencias registradas dentro del rango actual",
    );
    expect((await readSub(socio.subscriptionId)).startDate).toBe(startDate);
  });

  it("una visita Wellhub en el rango no bloquea compensar días", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const { startDate, endDate } = await readSub(socio.subscriptionId);
    expect(endDate).not.toBeNull();

    // Visita Wellhub manual dentro del rango a compensar (3 dias inclusivos).
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: addDays(startDate, 2),
      source: "wellhub_manual",
    });

    const res = await compensate(
      socio.subscriptionId,
      addDays(startDate, 1),
      addDays(startDate, 3),
    );
    expect(res.statusCode).toBe(200);
    expect((await readSub(socio.subscriptionId)).endDate).toBe(
      addDays(endDate as string, 3),
    );
  });

  it("control: una asistencia propia en el rango sí bloquea compensar días", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const { startDate, endDate } = await readSub(socio.subscriptionId);

    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: addDays(startDate, 2),
      source: "manual",
    });

    const res = await compensate(
      socio.subscriptionId,
      addDays(startDate, 1),
      addDays(startDate, 3),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      "El alumno tiene asistencias registradas dentro del rango a compensar",
    );
    expect((await readSub(socio.subscriptionId)).endDate).toBe(endDate);
  });
});
