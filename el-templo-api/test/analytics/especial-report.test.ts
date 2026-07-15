/**
 * Phase 162-03 (REP-01 / D-04 / D-05) — GET /api/admin/analytics/especiales.
 *
 * Reporte de asistencias a las actividades especiales ("Actividades con Aura")
 * por mes, separando origen socio/externo (insumo del reparto manual a profes,
 * SIN montos), + KPIs D-05 (subs especiales activas por origen) + export XLSX.
 *
 * Cobertura:
 *  (a) socio + externo asisten a la MISMA actividad el MISMO mes → socioCount=1,
 *      externoCount=1 en esa actividad.
 *  (b) KPIs D-05: sociosActivos / externosActivos ≥ 1 cada uno.
 *  (c) /especiales/export responde content-type XLSX + body no vacío.
 *  (d) fallback: asistencia especial de un member SIN sub especial que cubra la
 *      fecha pero CON presencial active esa fecha → clasifica 'socio'.
 *  (e) anti JOIN-fanout (Pitfall 4): un member con DOS subs especial de períodos
 *      solapados/contiguos (renovación Externo→Socio) que asistió UNA vez → se
 *      cuenta UNA sola vez y se clasifica por la sub que cubre la fecha (Socio).
 *
 * `attendance` se inserta por Drizzle (controla session_date/scheduleId por caso).
 * Los planes especiales se seedean por DB (mismo shape que la migración 0179) —
 * la ruta admin create-plan aún no persiste monthly_class_budget/requires_presencial.
 * El reporte es por `month` explícito → sin fake timers.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";

const ADMIN_SCHED_URL = "/api/admin/scheduling";
const ESPECIALES_URL = "/api/admin/analytics/especiales";
const MONTH = "2026-05";
const SESSION_DATE = "2026-05-10";
const MEMBER_PASSWORD = "pass123456";

interface EspecialActivityRow {
  activityId: number;
  activityName: string;
  socioCount: number;
  externoCount: number;
  total: number;
}
interface EspecialReportBody {
  month: string;
  kpis: { sociosActivos: number; externosActivos: number };
  rows: EspecialActivityRow[];
}

describe("Analytics — GET /especiales (reporte REP-01 socio/externo)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /** Crea una actividad (flag isSpecial) + un horario y devuelve el scheduleId. */
  async function createActivityAndSchedule(
    name: string,
    isSpecial: boolean,
  ): Promise<number> {
    const actRes = await app.inject({
      method: "POST",
      url: `${ADMIN_SCHED_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, isSpecial },
    });
    expect(actRes.statusCode).toBe(201);
    const activityId = JSON.parse(actRes.body).id as number;

    const schRes = await app.inject({
      method: "POST",
      url: `${ADMIN_SCHED_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: testBranchId,
        activityId,
        dayOfWeek: 6, // Saturday — irrelevante para el reporte (usa session_date)
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    expect(schRes.statusCode).toBe(201);
    return JSON.parse(schRes.body).id as number;
  }

  async function createMemberId(email: string): Promise<number> {
    const result = await registerUser(app, {
      email,
      password: MEMBER_PASSWORD,
      branchId: testBranchId,
    });
    return (result.user as { id: number }).id;
  }

  async function seedPlan(
    name: string,
    planCategory: "especial" | "presencial",
    requiresPresencial: boolean,
  ): Promise<number> {
    const res = await app.db.insert(schema.subscriptionPlans).values({
      name,
      planTier: planCategory === "especial" ? "other" : "flex",
      bookingMode: "flexible",
      planCategory,
      priceRegular: 10000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: planCategory === "especial" ? null : 3,
      monthlyClassBudget: planCategory === "especial" ? 2 : null,
      requiresPresencial,
      country: "AR",
      currency: "ARS",
    });
    return Number(res[0].insertId);
  }

  async function insertSub(
    userId: number,
    planId: number,
    status: "active" | "paused" | "expired" | "changed",
    startDate: string,
    endDate: string,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId: testBranchId,
      status,
      startDate,
      endDate,
      pricePaid: 10000,
      priceTypeApplied: "regular",
    });
  }

  async function insertAttendance(
    memberId: number,
    scheduleId: number,
    sessionDate: string,
  ): Promise<void> {
    await app.db.insert(schema.attendance).values({
      memberId,
      branchId: testBranchId,
      scheduleId,
      sessionDate,
    });
  }

  async function fetchReport(month = MONTH): Promise<EspecialReportBody> {
    const res = await app.inject({
      method: "GET",
      url: `${ESPECIALES_URL}?month=${month}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as EspecialReportBody;
  }

  it("(a/b) separa socio/externo en la misma actividad y expone KPIs D-05", async () => {
    const scheduleId = await createActivityAndSchedule("Verticales", true);

    // Socio: pase especial requires_presencial=1 que cubre la fecha.
    const socioId = await createMemberId("rep-socio@test.com");
    const socioPlan = await seedPlan("Pase Socio", "especial", true);
    await insertSub(socioId, socioPlan, "active", "2026-05-01", "2026-05-31");
    await insertAttendance(socioId, scheduleId, SESSION_DATE);

    // Externo: pase especial requires_presencial=0 que cubre la fecha.
    const externoId = await createMemberId("rep-externo@test.com");
    const externoPlan = await seedPlan("Pase Externo", "especial", false);
    await insertSub(
      externoId,
      externoPlan,
      "active",
      "2026-05-01",
      "2026-05-31",
    );
    await insertAttendance(externoId, scheduleId, SESSION_DATE);

    const report = await fetchReport();
    const row = report.rows.find((r) => r.activityName === "Verticales");
    expect(row).toBeDefined();
    expect(row?.socioCount).toBe(1);
    expect(row?.externoCount).toBe(1);
    expect(row?.total).toBe(2);

    // (b) KPIs D-05: al menos 1 socio y 1 externo activos.
    expect(report.kpis.sociosActivos).toBeGreaterThanOrEqual(1);
    expect(report.kpis.externosActivos).toBeGreaterThanOrEqual(1);
  });

  it("(c) /especiales/export responde content-type XLSX con body no vacío", async () => {
    const scheduleId = await createActivityAndSchedule("Acrobacias", true);
    const socioId = await createMemberId("rep-export@test.com");
    const socioPlan = await seedPlan("Pase Socio Exp", "especial", true);
    await insertSub(socioId, socioPlan, "active", "2026-05-01", "2026-05-31");
    await insertAttendance(socioId, scheduleId, SESSION_DATE);

    const res = await app.inject({
      method: "GET",
      url: `${ESPECIALES_URL}/export?month=${MONTH}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it("(d) fallback: sin sub especial pero con presencial active esa fecha → socio", async () => {
    const scheduleId = await createActivityAndSchedule("Fallback Act", true);
    const memberId = await createMemberId("rep-fallback@test.com");
    // Sólo presencial active cubriendo la fecha — NINGUNA sub especial.
    const presPlan = await seedPlan("Presencial", "presencial", false);
    await insertSub(memberId, presPlan, "active", "2026-05-01", "2026-05-31");
    await insertAttendance(memberId, scheduleId, SESSION_DATE);

    const report = await fetchReport();
    const row = report.rows.find((r) => r.activityName === "Fallback Act");
    expect(row).toBeDefined();
    expect(row?.socioCount).toBe(1);
    expect(row?.externoCount).toBe(0);
    expect(row?.total).toBe(1);
  });

  it("(e) renovación Externo→Socio con subs solapadas: cuenta UNA vez, clasifica por la sub que cubre la fecha", async () => {
    const scheduleId = await createActivityAndSchedule("Renovacion Act", true);
    const memberId = await createMemberId("rep-renew@test.com");

    // Sub especial EXTERNA vieja (termina el mismo día que arranca la nueva).
    const externoPlan = await seedPlan("Pase Ext viejo", "especial", false);
    await insertSub(
      memberId,
      externoPlan,
      "changed",
      "2026-04-15",
      "2026-05-10",
    );
    // Sub especial SOCIO nueva (renovación) — start_date más reciente cubre la fecha.
    const socioPlan = await seedPlan("Pase Socio nuevo", "especial", true);
    await insertSub(memberId, socioPlan, "active", "2026-05-10", "2026-06-09");

    // UNA sola asistencia.
    await insertAttendance(memberId, scheduleId, SESSION_DATE);

    const report = await fetchReport();
    const row = report.rows.find((r) => r.activityName === "Renovacion Act");
    expect(row).toBeDefined();
    // Sin JOIN-fanout: la asistencia se cuenta UNA vez (no 2 por las 2 subs).
    expect(row?.total).toBe(1);
    // Clasificada por la sub que cubre la fecha (la renovación Socio).
    expect(row?.socioCount).toBe(1);
    expect(row?.externoCount).toBe(0);
  });
});
