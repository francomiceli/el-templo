/**
 * Analíticas → tarjeta "Activos hoy": apartado Wellhub.
 *
 * `activeMembers.wellhubVisitors` = personas DISTINTAS con al menos una visita
 * Wellhub (`wellhub` o `wellhub_manual`) en el período elegido y SIN ninguna
 * membresía vigente. Va aparte: no suma al número grande ni al desglose.
 *
 * Personas (fixtures de `wellhub-personas.ts`):
 *   - visitante nuevo (status 'wellhub', sin plan) con 2 visitas → cuenta 1
 *   - ex-alumno con visita `wellhub_manual` → cuenta
 *   - socio activo con visita Wellhub → NO cuenta (ya está en activos)
 *   - socio sin plan con visita QR propia → NO cuenta (no es Wellhub)
 *
 * Fechas relativas a hoy con margen de días, nunca fijas, y el período se pasa
 * siempre explícito (`dateFrom`/`dateTo`) para no depender del mes en curso.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  createTestApp,
  createTestMember,
  createTestPlan,
  cleanAllTestData,
  dateOffsetStr,
  getAuthToken,
} from "../helpers";
import {
  TEMPLO_CTX,
  createWellhubExAlumno,
  createWellhubSocioActivo,
  createWellhubVisitor,
  insertAttendance,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;
const ANALYTICS_URL = "/api/admin/analytics";
const DAY_MS = 24 * 60 * 60 * 1000;

interface KpiBody {
  activeMembers: {
    value: number;
    breakdown: { paying: number; totalActive: number };
    wellhubVisitors: number;
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

describe("Analíticas: apartado Wellhub en la tarjeta de activos", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
  let otherBranchId: number;

  /** Período por defecto de los tests: la última semana (con margen a futuro). */
  const lastWeek = () =>
    `dateFrom=${dateOffsetStr(-7)}&dateTo=${dateOffsetStr(1)}`;

  async function getKpis(query: string): Promise<KpiBody> {
    const res = await app.inject({
      method: "GET",
      url: `${ANALYTICS_URL}?${query}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as KpiBody;
  }

  async function wellhubVisit(
    memberId: number,
    opts: {
      daysAgo: number;
      source?: "wellhub" | "wellhub_manual" | "qr";
      branchId?: number;
    },
  ): Promise<void> {
    const when = daysAgo(opts.daysAgo);
    await insertAttendance(app, {
      memberId,
      branchId: opts.branchId ?? BRANCH_ID,
      sessionDate: when.toISOString().slice(0, 10),
      source: opts.source ?? "wellhub",
      checkedInAt: when,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const suffix = Date.now().toString(36);
    const [branch] = await app.db.insert(schema.branches).values(
      tenantValues(TEMPLO_CTX, {
        name: `Sede WH activos ${suffix}`,
        code: `WHA-${suffix}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      }),
    );
    otherBranchId = Number(branch.insertId);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.db
      .delete(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, otherBranchId),
        ),
      );
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan WH activos ${Date.now().toString(36)}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
  });

  it("cuenta personas distintas sin membresía y no toca el número grande", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await wellhubVisit(visitor.id, { daysAgo: 2 });
    await wellhubVisit(visitor.id, { daysAgo: 4 });

    const exAlumno = await createWellhubExAlumno(app, adminToken, {
      branchId: BRANCH_ID,
      planId,
    });
    await wellhubVisit(exAlumno.id, { daysAgo: 3, source: "wellhub_manual" });

    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });
    await wellhubVisit(socio.id, { daysAgo: 2 });

    const sinPlan = await createTestMember(app, { branchId: BRANCH_ID });
    await wellhubVisit(sinPlan.id, { daysAgo: 2, source: "qr" });

    const body = await getKpis(lastWeek());

    // visitante (2 visitas = 1 persona) + ex-alumno (manual) = 2.
    expect(body.activeMembers.wellhubVisitors).toBe(2);
    // El número grande y el desglose solo ven al socio con plan.
    expect(body.activeMembers.value).toBe(1);
    expect(body.activeMembers.breakdown.paying).toBe(1);
    expect(body.activeMembers.breakdown.totalActive).toBe(1);
  });

  it("devuelve 0 cuando no hubo visitas Wellhub", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });
    await wellhubVisit(socio.id, { daysAgo: 1, source: "qr" });

    const body = await getKpis(lastWeek());
    expect(body.activeMembers.wellhubVisitors).toBe(0);
  });

  it("respeta el período elegido", async () => {
    const reciente = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await wellhubVisit(reciente.id, { daysAgo: 2 });
    const viejo = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await wellhubVisit(viejo.id, { daysAgo: 40 });

    const semana = await getKpis(lastWeek());
    expect(semana.activeMembers.wellhubVisitors).toBe(1);

    const dosMeses = await getKpis(
      `dateFrom=${dateOffsetStr(-60)}&dateTo=${dateOffsetStr(1)}`,
    );
    expect(dosMeses.activeMembers.wellhubVisitors).toBe(2);

    const soloElViejo = await getKpis(
      `dateFrom=${dateOffsetStr(-45)}&dateTo=${dateOffsetStr(-30)}`,
    );
    expect(soloElViejo.activeMembers.wellhubVisitors).toBe(1);
  });

  it("filtra por la sede de la visita, no por la sede del alumno", async () => {
    // Visitante dado de alta en la sede 1 que viene por Wellhub a la otra sede.
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await wellhubVisit(visitor.id, { daysAgo: 2, branchId: otherBranchId });

    const sede1 = await getKpis(`${lastWeek()}&branchId=${BRANCH_ID}`);
    expect(sede1.activeMembers.wellhubVisitors).toBe(0);

    const otra = await getKpis(`${lastWeek()}&branchId=${otherBranchId}`);
    expect(otra.activeMembers.wellhubVisitors).toBe(1);

    const todas = await getKpis(lastWeek());
    expect(todas.activeMembers.wellhubVisitors).toBe(1);
  });

  it("deja de contar a la persona cuando pasa a tener membresía vigente", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    await wellhubVisit(visitor.id, { daysAgo: 2 });

    expect((await getKpis(lastWeek())).activeMembers.wellhubVisitors).toBe(1);

    // Se convierte en socio: sub vigente insertada directo (misma forma que
    // el ex-alumno de los fixtures, pero activa).
    await app.db.insert(schema.subscriptions).values(
      tenantValues(TEMPLO_CTX, {
        userId: visitor.id,
        planId,
        branchId: BRANCH_ID,
        status: "active" as const,
        startDate: dateOffsetStr(-1),
        endDate: dateOffsetStr(29),
        pricePaid: 15000,
        priceTypeApplied: "regular" as const,
      }),
    );

    expect((await getKpis(lastWeek())).activeMembers.wellhubVisitors).toBe(0);
  });
});
